// Pre-deployment hardening: the architectural items the review fleets could
// only report, now closed. Per-IP budgets that survive reconnects, an O(1)
// connection index, aggregate room caps, instant empty-lobby reaping, and a
// real re-seed (not a fiction resume) for fully-parked rooms.

const test = require('node:test');
const assert = require('node:assert');
const { WebSocket } = require('ws');
const RoomManager = require('../lib/room-manager.js');
const {
  createServer, attachWebSocketServer,
  MAX_CONNECTIONS_PER_IP, MAX_JOINS_PER_IP_WINDOW, MAX_PROFILE_PER_WINDOW
} = require('../server.js');

function openSocket(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

test('the connection index survives create, join, supersede and sweep', () => {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  assert.ok(room, 'creator lookup failed');
  rm.join('c2', room.code);
  assert.strictEqual(rm.getRoomByConnection('c2'), room, 'joiner lookup failed');

  // Supersede: the old id stops resolving, the new one takes over.
  rm.start('c1');
  const seat = Array.from(room.players.values()).find(p => p.connectionId === 'c2');
  rm.rejoin('c2-fresh', { code: room.code, playerToken: seat.playerToken });
  assert.strictEqual(rm.getRoomByConnection('c2'), null, 'stale id still resolves');
  assert.strictEqual(rm.getRoomByConnection('c2-fresh'), room, 'fresh id does not resolve');

  // A swept room drops out of the index lazily.
  rm.rooms.delete(room.code);
  assert.strictEqual(rm.getRoomByConnection('c2-fresh'), null, 'lookup resolved a dead room');
});

test('room creation is capped in aggregate, not just per connection', () => {
  const rm = new RoomManager();
  for (let i = 0; i < RoomManager.MAX_TOTAL_ROOMS; i++) {
    rm.createRoom('conn-' + i);
  }
  assert.strictEqual(rm.rooms.size, RoomManager.MAX_TOTAL_ROOMS);
  assert.throws(() => rm.createRoom('conn-overflow'),
    (err) => err.code === 'RATE_LIMITED' || err.message === 'RATE_LIMITED',
    'a fresh connection minted a room past the global cap');
});

test('an empty lobby is reaped immediately, not after the 15-minute TTL', () => {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.disconnect('c1'); // lobby disconnects delete the seat
  assert.strictEqual(room.players.size, 0, 'precondition: the lobby must be empty');

  const res = rm.sweep(Date.now()); // NO time skip — this is the point
  assert.ok(res.swept.includes(room.code),
    'an empty lobby survived the sweep and holds its code hostage');
});

test('rejoining a fully-parked room re-seeds the round instead of resuming a fiction', () => {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);
  rm.start('c1', { rounds: 3 });
  const oldSeed = room.seed;

  const t1 = Array.from(room.players.values()).find(p => p.connectionId === 'c1');
  const t2 = Array.from(room.players.values()).find(p => p.connectionId === 'c2');
  // A fought round (virgin rounds resume on their own seed instead).
  rm.fire('c1', { angle: 45, power: 500, weapon: 'Baby Missile' });
  rm.resolveShot('c1', { shotId: room.nextShotId });
  t2.spectating = true; // mid-round artifact that must NOT survive the re-seed
  rm.disconnect('c1');
  rm.disconnect('c2');
  assert.strictEqual(room.phase, 'paused', 'precondition: the room must park');
  // The re-seed gate: everyone must have been gone for a real while.
  room.pausedAt -= RoomManager.RESEED_MIN_PARK_MS + 1000;

  const res = rm.rejoin('c1-back', { code: room.code, playerToken: t1.playerToken });

  assert.strictEqual(room.phase, 'playing');
  assert.notStrictEqual(room.seed, oldSeed, 'the abandoned round was resumed, not re-seeded');
  assert.strictEqual(room.turnNumber, 1);
  assert.strictEqual(t1.spectating, false, 'the rejoiner was spectated into an empty room');
  assert.strictEqual(t2.spectating, false, 'the re-seed must clear every spectate flag');
  assert.strictEqual(t2.alive, true, 'the re-seed must revive every seat');

  const msgs = res.broadcasts.map(b => b.msg);
  const roundStart = msgs.find(m => m.type === 'ROUND_START');
  assert.ok(roundStart, 're-seed must broadcast a fresh ROUND_START');
  assert.strictEqual(roundStart.round, 1, 'the round counter must not advance');
  assert.strictEqual(roundStart.seed, room.seed);
  assert.ok(msgs.some(m => m.type === 'TURN_SYNC' && m.turnNumber === 1),
    're-seed must announce its cursor');
});

test('concurrent sockets from one address are capped', async () => {
  const server = createServer();
  const attached = attachWebSocketServer(server, { onMessage: () => {} });
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;

  const sockets = [];
  for (let i = 0; i < MAX_CONNECTIONS_PER_IP; i++) {
    sockets.push(await openSocket(port));
  }

  // The refusal happens at the UPGRADE (HTTP 503), so the client never
  // even fires `open` — a post-101 refusal used to reset the browser's
  // reconnect backoff and crash the server on aborted closes.
  const refused = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(false));
    ws.on('error', () => resolve(true));
  });
  assert.strictEqual(refused, true,
    `socket ${MAX_CONNECTIONS_PER_IP + 1} completed its handshake`);

  for (const ws of sockets) ws.close();
  await attached.close();
  await new Promise(res => server.close(res));
});

test('the JOIN budget survives reconnects — guessing is bounded per address', async () => {
  const server = createServer();
  const attached = attachWebSocketServer(server, { onMessage: () => {} });
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;

  let limited = 0;
  let attempts = 0;
  // Reconnect repeatedly, staying under every per-SOCKET budget: only a
  // per-address budget can stop this loop.
  for (let round = 0; round < 8 && limited === 0; round++) {
    const ws = await openSocket(port);
    const codes = [];
    ws.on('message', d => codes.push(JSON.parse(d.toString('utf8')).code));
    for (let i = 0; i < 6; i++) {
      ws.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'ZZZZ' }));
      attempts++;
    }
    await new Promise(res => setTimeout(res, 150));
    limited += codes.filter(c => c === 'RATE_LIMITED').length;
    ws.close();
    await new Promise(res => setTimeout(res, 30));
  }

  assert.ok(limited > 0,
    `${attempts} guesses across fresh sockets and never rate-limited — the per-IP budget is decorative`);
  assert.ok(attempts <= MAX_JOINS_PER_IP_WINDOW + 12,
    'the limit tripped far later than the per-IP budget promises');

  await attached.close();
  await new Promise(res => server.close(res));
});

test('SET_PROFILE has its own sub-budget against ROOM_STATE fanout', async () => {
  const server = createServer();
  let delivered = 0;
  const attached = attachWebSocketServer(server, {
    onMessage: ({ msg }) => { if (msg.type === 'SET_PROFILE') delivered++; }
  });
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;

  const ws = await openSocket(port);
  for (let i = 0; i < MAX_PROFILE_PER_WINDOW + 15; i++) {
    ws.send(JSON.stringify({ type: 'SET_PROFILE', name: 'X' + i, colour: '' }));
  }
  await new Promise(res => setTimeout(res, 300));
  assert.ok(delivered <= MAX_PROFILE_PER_WINDOW,
    `${delivered} profile updates delivered — the fanout sub-budget is not enforced`);

  ws.close();
  await attached.close();
  await new Promise(res => server.close(res));
});


test('the connection index reclaims on disconnect, sweep and rejoin churn', () => {
  const rm = new RoomManager();

  // Lobby churn: create -> disconnect -> sweep, 50 times.
  for (let i = 0; i < 50; i++) {
    rm.createRoom('churn-' + i);
    rm.disconnect('churn-' + i);
    rm.sweep(Date.now());
  }
  assert.strictEqual(rm.rooms.size, 0);
  assert.strictEqual(rm.roomsByConnection.size, 0,
    `lobby churn leaked ${rm.roomsByConnection.size} index entries`);

  // Rejoin churn on one seat: the superseded ids must not accumulate.
  rm.createRoom('h');
  const room = rm.getRoomByConnection('h');
  rm.join('g', room.code);
  rm.start('h');
  const seat = Array.from(room.players.values()).find(p => p.connectionId === 'g');
  for (let i = 0; i < 50; i++) {
    rm.rejoin('g-' + i, { code: room.code, playerToken: seat.playerToken });
  }
  assert.ok(rm.roomsByConnection.size <= 2,
    `rejoin churn left ${rm.roomsByConnection.size} index entries for 2 seats`);
});

test('a virgin parked round resumes on its own seed — no pointless re-seed', () => {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);
  rm.start('c1', { rounds: 3 });
  const seed = room.seed;
  const t1 = Array.from(room.players.values()).find(p => p.connectionId === 'c1');

  rm.disconnect('c1');
  rm.disconnect('c2');
  room.pausedAt -= RoomManager.RESEED_MIN_PARK_MS + 1000; // even parked long
  rm.rejoin('c1-back', { code: room.code, playerToken: t1.playerToken });

  assert.strictEqual(room.seed, seed, 'a virgin round was re-seeded for nothing');
  assert.strictEqual(room.phase, 'playing');
});

test('after a re-seed the second returner takes a full seat, not a bench', () => {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);
  rm.start('c1', { rounds: 3 });
  rm.fire('c1', { angle: 45, power: 500, weapon: 'Baby Missile' });
  rm.resolveShot('c1', { shotId: room.nextShotId });
  const t1 = Array.from(room.players.values()).find(p => p.slot === 0);
  const t2 = Array.from(room.players.values()).find(p => p.slot === 1);
  rm.disconnect(t1.connectionId);
  rm.disconnect(t2.connectionId);
  room.pausedAt -= RoomManager.RESEED_MIN_PARK_MS + 1000;

  rm.rejoin('back-1', { code: room.code, playerToken: t1.playerToken });
  assert.strictEqual(room.roundVirgin, true, 're-seed must reset the virgin flag');
  rm.rejoin('back-2', { code: room.code, playerToken: t2.playerToken });

  assert.strictEqual(t2.spectating, false,
    'the second returner was benched against a world both can rebuild exactly');
});

test('an all-spectator parked room is re-seeded by the sweep, not wedged', () => {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);
  rm.start('c1', { rounds: 3 });
  room.roundVirgin = false;

  // Force the wedge shape the review demonstrated: parked, with the only
  // connected player a spectator.
  const t1 = Array.from(room.players.values()).find(p => p.slot === 0);
  const t2 = Array.from(room.players.values()).find(p => p.slot === 1);
  rm.disconnect(t1.connectionId);
  t2.spectating = true;
  room.phase = 'paused';
  room.pausedAt = Date.now() - RoomManager.TURN_TIMEOUT_MS - 60000;

  const res = rm.sweep(Date.now());
  assert.strictEqual(room.phase, 'playing', 'the sweep left the spectators wedged');
  assert.strictEqual(t2.spectating, false);
  assert.ok(res.broadcasts.some(b => b.msg && b.msg.type === 'ROUND_START'),
    'the rescue must ship a fresh world');
});

test('a never-started lobby expires even while its creator stays connected', () => {
  const rm = new RoomManager();
  rm.createRoom('squatter');
  const room = rm.getRoomByConnection('squatter');

  // Young and seated: untouchable.
  assert.deepStrictEqual(rm.sweep(room.createdAt + 60000).swept, []);

  // Old and still just one seat: reaped, seat notified.
  const res = rm.sweep(room.createdAt + RoomManager.MAX_CONNECTED_LOBBY_MS + 1000);
  assert.ok(res.swept.includes(room.code), 'a held socket squatted the code forever');
  assert.ok(res.replies.some(r => r.to === 'squatter' && r.msg.code === 'ROOM_CLOSED'),
    'the seated creator must be told the room closed');
  assert.strictEqual(rm.roomsByConnection.size, 0, 'the reap leaked its index entry');
});
