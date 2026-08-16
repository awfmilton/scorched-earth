const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const WebSocket = require('ws');
const { createServer, attachWebSocketServer, createRoomManagerHandlers } = require('../server.js');
const RoomManager = require('../lib/room-manager.js');

// Helpers copied from tests/server-integration.test.js (same shape); the issue
// for this chunk explicitly forbids refactoring them into a shared module.
function startServer(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function connect(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function nextMessage(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for a message')), 2000);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString('utf8')));
    });
  });
}

// Bounded await-until-type: keeps consuming one frame at a time until one
// matches `wantedType`, sharing the same 2s ceiling and rejecting on timeout.
// Never a fixed sleep.
async function awaitType(ws, wantedType) {
  const deadline = Date.now() + 2000;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`timed out waiting for ${wantedType}`);
    }
    const msg = await Promise.race([
      nextMessage(ws),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timed out waiting for ${wantedType}`)), remaining))
    ]);
    if (msg.type === wantedType) {
      return msg;
    }
  }
}

describe('Headless two-client end-to-end round', () => {
  it('drives two real ws clients through a full round to ROUND_END', async () => {
    const server = createServer();
    const roomManager = new RoomManager();
    const handlers = createRoomManagerHandlers(roomManager);

    const attached = attachWebSocketServer(server, {
      onMessage: handlers.onMessage,
      onDisconnect: handlers.onDisconnect
    });

    const port = await startServer(server);

    const clientA = await connect(port);
    const clientB = await connect(port);

    try {
      // 1. Client A sends CREATE_ROOM; capture the 4-char code.
      clientA.send(JSON.stringify({ type: 'CREATE_ROOM' }));
      const created = await awaitType(clientA, 'ROOM_STATE');
      assert.strictEqual(created.type, 'ROOM_STATE');
      assert.ok(created.code && created.code.length === 4, 'should carry a 4-char room code');
      const roomCode = created.code;

      // 2. Client B joins with that code; both observe a consistent two-player roster.
      clientB.send(JSON.stringify({ type: 'JOIN_ROOM', code: roomCode }));
      const stateB = await awaitType(clientB, 'ROOM_STATE');
      const stateA = await awaitType(clientA, 'ROOM_STATE');
      assert.strictEqual(stateB.code, roomCode);
      assert.strictEqual(stateA.code, roomCode);
      assert.strictEqual(stateA.players.length, 2);
      assert.strictEqual(stateB.players.length, 2);
      assert.deepStrictEqual(
        stateA.players.map(p => p.slot),
        stateB.players.map(p => p.slot),
        'both clients must observe the same roster'
      );
      assert.deepStrictEqual(stateA.players.map(p => p.slot), [0, 1]);

      // 3. Both clients send SET_PROFILE.
      clientA.send(JSON.stringify({ type: 'SET_PROFILE', name: 'Alice', colour: 'red' }));
      const profileA = await awaitType(clientA, 'ROOM_STATE');
      assert.ok(profileA.players.some(p => p.slot === 0 && p.name === 'Alice'));
      clientB.send(JSON.stringify({ type: 'SET_PROFILE', name: 'Bob', colour: 'blue' }));
      const profileA2 = await awaitType(clientA, 'ROOM_STATE');
      const profileB = await awaitType(clientB, 'ROOM_STATE');
      assert.ok(profileA2.players.some(p => p.slot === 1 && p.name === 'Bob'));
      assert.ok(profileB.players.some(p => p.slot === 1 && p.name === 'Bob'));

      // 4. A (host, slot 0) sends START_GAME; both receive ROUND_START carrying
      // the same seed and wind, differing only in yourSlot.
      clientA.send(JSON.stringify({ type: 'START_GAME' }));
      const roundA = await awaitType(clientA, 'ROUND_START');
      const roundB = await awaitType(clientB, 'ROUND_START');
      assert.strictEqual(roundA.seed, roundB.seed, 'same seed for both clients');
      assert.strictEqual(roundA.wind, roundB.wind, 'same wind for both clients');
      assert.strictEqual(roundA.yourSlot, 0);
      assert.strictEqual(roundB.yourSlot, 1);

      // 5. A sends FIRE; assert both clients receive an identical FIRE_SYNC
      // with the same shotId, vx, vy.
      clientA.send(JSON.stringify({
        type: 'FIRE',
        angle: 45,
        power: 200,
        weapon: 'Baby Missile'
      }));
      const fireA = await awaitType(clientA, 'FIRE_SYNC');
      const fireB = await awaitType(clientB, 'FIRE_SYNC');
      assert.strictEqual(fireA.shooterSlot, 0);
      assert.strictEqual(fireB.shooterSlot, 0);
      assert.strictEqual(fireA.shotId, fireB.shotId);
      assert.strictEqual(fireA.vx, fireB.vx);
      assert.strictEqual(fireA.vy, fireB.vy);
      // shotId arrives as a number from fire(); echo it back exactly.
      const shotId = fireA.shotId;

      // 6. A sends RESOLVE_SHOT with that shotId and no eliminated; both
      // receive TURN_SYNC naming slot 1 active.
      clientA.send(JSON.stringify({ type: 'RESOLVE_SHOT', shotId }));
      const turnA = await awaitType(clientA, 'TURN_SYNC');
      const turnB = await awaitType(clientB, 'TURN_SYNC');
      assert.strictEqual(turnA.activeSlot, 1);
      assert.strictEqual(turnB.activeSlot, 1);

      // 7. B sends FIRE, then RESOLVE_SHOT with eliminated as an integer slot
      // array; both receive ROUND_END naming winnerSlot 1.
      clientB.send(JSON.stringify({
        type: 'FIRE',
        angle: 135,
        power: 200,
        weapon: 'Baby Missile'
      }));
      const fireB2 = await awaitType(clientB, 'FIRE_SYNC');
      const fireA2 = await awaitType(clientA, 'FIRE_SYNC');
      assert.strictEqual(fireB2.shooterSlot, 1);
      assert.strictEqual(fireA2.shooterSlot, 1);
      assert.strictEqual(fireA2.shotId, fireB2.shotId);

      clientB.send(JSON.stringify({
        type: 'RESOLVE_SHOT',
        shotId: fireB2.shotId,
        eliminated: [0]
      }));
      const endA = await awaitType(clientA, 'ROUND_END');
      const endB = await awaitType(clientB, 'ROUND_END');
      assert.strictEqual(endA.winnerSlot, 1);
      assert.strictEqual(endB.winnerSlot, 1);
    } finally {
      // Teardown exactly as tests/server-integration.test.js: close both
      // sockets, the ws server and the http server; no hanging handle.
      await new Promise((resolve) => {
        if (clientA.readyState === WebSocket.CLOSED) return resolve();
        clientA.once('close', resolve);
        clientA.close();
      });

      await new Promise((resolve) => {
        if (clientB.readyState === WebSocket.CLOSED) return resolve();
        clientB.once('close', resolve);
        clientB.close();
      });

      await attached.close();
      await new Promise(resolve => server.close(resolve));
    }
  });
});
