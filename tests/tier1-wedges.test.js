// Tier 1 regressions: crashes and room-wedges.
//
// Each test here pins one of the review fleet's confirmed process-killers or
// forever-wedges: the Host-header crash, the unenforced ws payload cap, the
// vanished-shooter / AFK-turn stalls, the refused half-open rejoin, and the
// SHOP_DONE guard that could gag a client for the rest of the room's life.

const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const { WebSocket } = require('ws');
const { createServer, attachWebSocketServer } = require('../server.js');
const RoomManager = require('../lib/room-manager.js');
const { newGame } = require('./helpers/headless-game.js');

test('a malformed Host header is answered, not fatal', async () => {
  const server = createServer();
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;

  const raw = (payload) => new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1', () => sock.write(payload));
    let buf = '';
    const timer = setTimeout(() => { sock.destroy(); resolve(buf); }, 3000);
    sock.on('data', d => { buf += d.toString('utf8'); });
    sock.on('close', () => { clearTimeout(timer); resolve(buf); });
    sock.on('error', reject);
  });

  // Node's parser passes `Host: foo bar` through to the request listener;
  // this used to escape as an uncaught `Invalid URL` and kill the process.
  const hostile = await raw('GET / HTTP/1.1\r\nHost: foo bar\r\nConnection: close\r\n\r\n');
  assert.match(hostile, /^HTTP\/1\.1 \d{3}/, 'no HTTP response to the hostile request');

  // The process survived: a normal request still gets index.html.
  const normal = await raw('GET /index.html HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
  assert.match(normal, /^HTTP\/1\.1 200/, 'server no longer serves after the hostile request');

  await new Promise(res => server.close(res));
});

test('a frame beyond the protocol-layer cap closes the socket instead of buffering', async () => {
  const server = createServer();
  const attached = attachWebSocketServer(server, {});
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  const closeCode = await new Promise((resolve) => {
    ws.on('close', (code) => resolve(code));
    // 100KiB — far over the 64KiB ws maxPayload. ws must refuse to buffer
    // it (1009 Message Too Big), not deliver it to the app layer.
    ws.send('x'.repeat(100 * 1024));
  });
  assert.strictEqual(closeCode, 1009, 'oversized frame did not close with Message Too Big');

  await attached.close();
  await new Promise(res => server.close(res));
});

test('a moderately oversized frame still gets the polite in-band error', async () => {
  const server = createServer();
  const attached = attachWebSocketServer(server, {});
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  const reply = await new Promise((resolve) => {
    ws.on('message', (d) => resolve(JSON.parse(d.toString('utf8'))));
    // 10KiB: over the 4096-byte app limit, under the 64KiB protocol cap.
    ws.send('y'.repeat(10 * 1024));
  });
  assert.strictEqual(reply.type, 'ERROR');
  assert.match(reply.message, /too large/i);
  assert.strictEqual(ws.readyState, WebSocket.OPEN, 'polite path should keep the socket open');

  ws.close();
  await attached.close();
  await new Promise(res => server.close(res));
});

test('a vanished shooter cannot wedge the room: sweep force-advances the shot', () => {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);
  rm.start('c1');
  rm.fire('c1', { angle: 45, power: 500, weapon: 'Baby Missile' });
  assert.strictEqual(room.awaitingResolution, true);

  // Inside the deadline nothing moves.
  rm.sweep(Date.now() + RoomManager.SHOT_RESOLUTION_TIMEOUT_MS - 5000);
  assert.strictEqual(room.awaitingResolution, true);
  assert.strictEqual(room.activeSlot, 0);

  // Past it the shot is written off and the cursor advances like a normal
  // no-elimination resolution.
  const res = rm.sweep(Date.now() + RoomManager.SHOT_RESOLUTION_TIMEOUT_MS + 31000);
  assert.strictEqual(room.awaitingResolution, false);
  assert.strictEqual(room.activeSlot, 1);
  const sync = res.broadcasts.find(b => b.msg && b.msg.type === 'TURN_SYNC');
  assert.ok(sync, 'forced advance must announce the cursor');
  assert.strictEqual(sync.msg.activeSlot, 1);
});

test('an AFK active player cannot wedge the room: sweep force-advances the turn', () => {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);
  rm.start('c1');
  assert.strictEqual(room.activeSlot, 0);

  rm.sweep(Date.now() + RoomManager.TURN_TIMEOUT_MS - 5000);
  assert.strictEqual(room.activeSlot, 0, 'advanced before the deadline');

  const res = rm.sweep(Date.now() + RoomManager.TURN_TIMEOUT_MS + 31000);
  assert.strictEqual(room.activeSlot, 1);
  const sync = res.broadcasts.find(b => b.msg && b.msg.type === 'TURN_SYNC');
  assert.ok(sync, 'forced advance must announce the cursor');
});

test('a token-proven rejoin supersedes a half-open socket instead of being refused', () => {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);
  rm.start('c1');

  const seat = Array.from(room.players.values()).find(p => p.connectionId === 'c2');
  assert.ok(seat && seat.connected, 'precondition: seat is live');

  // The old socket has not been reaped yet (connected is still true) when
  // the fresh socket rejoins with the same token. This used to throw
  // UNKNOWN_ROOM and strand the player outside their own match.
  const res = rm.rejoin('c2-fresh', { code: room.code, playerToken: seat.playerToken });
  assert.strictEqual(seat.connectionId, 'c2-fresh');
  assert.strictEqual(seat.connected, true);
  const reply = res.replies.find(r => r.to === 'c2-fresh');
  assert.ok(reply && reply.msg.type === 'ROOM_STATE', 'rejoiner did not get ROOM_STATE');

  // The stale socket's eventual close matches no seat and is a no-op.
  rm.disconnect('c2');
  assert.strictEqual(seat.connected, true, 'stale close must not unseat the superseded rejoin');
});

test('the SHOP_DONE guard is per-intermission, not per-lifetime', () => {
  const { game } = newGame();
  // A real wire to observe: the post-merge review showed the old flag-only
  // assertions stayed green with the guard deleted.
  let wireSends = 0;
  game.net = { send: (type) => { if (type === 'SHOP_DONE') wireSends++; } };

  // A DONE sent during round 2's intermission…
  game.currentRound = 2;
  game.sendShopDone();
  assert.strictEqual(wireSends, 1);
  // …gags an immediate duplicate…
  game.sendShopDone();
  assert.strictEqual(wireSends, 1, 'the duplicate DONE reached the wire');

  // …but a re-fired ROUND_END (mid-shop reconnect) re-arms the guard so the
  // player's second DONE reaches the wire.
  game.applyRoundEnd({ round: 2, matchOver: false, totalRounds: 5, standings: [] });
  assert.strictEqual(game.shopDoneSentForRound, null, 'ROUND_END must reset the guard');
  game.sendShopDone();
  assert.strictEqual(wireSends, 2, 'the re-armed DONE never reached the wire');

  // A fresh match clears it too.
  game.shopDoneSentForRound = 4;
  game.start({
    rounds: 1, wallType: 'rubber', startingCash: 20000,
    players: [
      { name: 'P1', color: '#ff0000', type: 'Human' },
      { name: 'P2', color: '#00ff00', type: 'Human' }
    ]
  });
  assert.strictEqual(game.shopDoneSentForRound, null, 'start() must reset the guard');
});
