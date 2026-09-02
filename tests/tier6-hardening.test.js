// Tier 6 regressions: the transport is hardened.
//
// The static server serves ONLY the files the client loads (it used to hand
// out the whole repo, .git/ included), JOIN_ROOM and general message floods
// are rate-limited per socket, and a host's START_GAME config is allowlisted
// and bounded before it is stored or relayed.

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { WebSocket } = require('ws');
const {
  createServer, attachWebSocketServer, MAX_JOINS_PER_WINDOW, MAX_MESSAGES_PER_WINDOW
} = require('../server.js');
const { sanitiseConfig } = require('../lib/protocol.js');
const RoomManager = require('../lib/room-manager.js');

function get(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    }).on('error', reject);
  });
}

test('the static server serves the client files and nothing else', async () => {
  const server = createServer();
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;

  assert.strictEqual(await get(port, '/'), 200);
  assert.strictEqual(await get(port, '/index.html'), 200);
  assert.strictEqual(await get(port, '/lib/terrain.js'), 200);
  assert.strictEqual(await get(port, '/gfx/ac-common.js'), 200);

  // The repository is not a CDN.
  assert.strictEqual(await get(port, '/.git/config'), 404, '.git served');
  assert.strictEqual(await get(port, '/.claude/settings.json'), 404, '.claude served');
  assert.strictEqual(await get(port, '/server.js'), 404, 'server source served');
  assert.strictEqual(await get(port, '/package.json'), 404, 'package.json served');
  assert.strictEqual(await get(port, '/AUDIT.md'), 404, 'docs served');
  assert.strictEqual(await get(port, '/tests/smoke.test.js'), 404, 'tests served');

  await new Promise(res => server.close(res));
});

test('JOIN_ROOM guesses are rate-limited per socket', async () => {
  const server = createServer();
  const attached = attachWebSocketServer(server, {
    onMessage: () => {} // swallow — we only care about the limiter
  });
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  const errors = [];
  ws.on('message', d => {
    const msg = JSON.parse(d.toString('utf8'));
    if (msg.type === 'ERROR') errors.push(msg.code);
  });

  for (let i = 0; i < MAX_JOINS_PER_WINDOW + 3; i++) {
    ws.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'ABCD' }));
  }
  await new Promise(res => setTimeout(res, 300));
  assert.ok(errors.includes('RATE_LIMITED'),
    `expected a RATE_LIMITED after ${MAX_JOINS_PER_WINDOW} joins, got: ${errors.join(',')}`);

  ws.close();
  await attached.close();
  await new Promise(res => server.close(res));
});

test('a message flood trips the general limiter', async () => {
  const server = createServer();
  let delivered = 0;
  const attached = attachWebSocketServer(server, {
    onMessage: () => { delivered++; }
  });
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  for (let i = 0; i < MAX_MESSAGES_PER_WINDOW + 50; i++) {
    ws.send(JSON.stringify({ type: 'LIST_ROOMS' }));
  }
  await new Promise(res => setTimeout(res, 400));
  assert.ok(delivered <= MAX_MESSAGES_PER_WINDOW,
    `limiter passed ${delivered} messages through a window budgeted at ${MAX_MESSAGES_PER_WINDOW}`);

  ws.close();
  await attached.close();
  await new Promise(res => server.close(res));
});

test('sanitiseConfig keeps the allowlisted fields and drops everything else', () => {
  const out = sanitiseConfig({
    rounds: 7, startingCash: 5000, wallType: 'rubber', weaponsAvailability: 'basic',
    gravity: 260, windVariability: 'none', terrainStyle: 'hills',
    hillCount: 'high', flatness: 'low',
    gameMode: 'classic',                    // smuggled mode — dropped
    __proto__injection: 'x', evil: { a: 1 }, // junk — dropped
    onImpact: 'alert(1)'                     // junk — dropped
  });
  assert.deepStrictEqual(out, {
    rounds: 7, startingCash: 5000, gravity: 260, wallType: 'rubber',
    weaponsAvailability: 'basic', windVariability: 'none',
    terrainStyle: 'hills', hillCount: 'high', flatness: 'low'
  });

  // Numeric bounds CLAMP (a typo means "a lot", not "the default"), enum
  // garbage drops, non-objects are safe.
  assert.deepStrictEqual(
    sanitiseConfig({ rounds: 999, gravity: -5, wallType: 'lava' }),
    { rounds: 20, gravity: 10 });
  assert.deepStrictEqual(sanitiseConfig({ rounds: 'lots' }), {});
  assert.deepStrictEqual(sanitiseConfig(null), {});
  assert.deepStrictEqual(sanitiseConfig([1, 2]), {});
});

test('the room stores only the sanitised config and relays it in ROUND_START', () => {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);
  const res = rm.start('c1', { rounds: 3, evil: 'payload', wallType: 'rubber' });

  assert.strictEqual(room.config.evil, undefined, 'junk survived into room.config');
  assert.strictEqual(room.config.rounds, 3);

  const roundStart = res.broadcasts.map(b => b.msg).find(m => m.type === 'ROUND_START');
  assert.ok(roundStart.config, 'ROUND_START lost its config');
  assert.strictEqual(roundStart.config.evil, undefined, 'junk relayed to every client');
});
