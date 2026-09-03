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
  t2.spectating = true; // mid-round artifact that must NOT survive the re-seed
  rm.disconnect('c1');
  rm.disconnect('c2');
  assert.strictEqual(room.phase, 'paused', 'precondition: the room must park');

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

  const extra = await openSocket(port);
  const code = await new Promise(resolve => extra.on('close', c => resolve(c)));
  assert.strictEqual(code, 1013, `socket ${MAX_CONNECTIONS_PER_IP + 1} was not refused`);

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
