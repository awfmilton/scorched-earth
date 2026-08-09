const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  RoomManager,
  DISCONNECT_THRESHOLD,
  MAX_LIFETIME
} = require('../lib/room-manager');

describe('Room Sweep Tests', () => {
  it('sweep() on an empty manager returns cleanly', () => {
    const manager = new RoomManager();
    const result = manager.sweep(100000);
    assert.deepStrictEqual(result.sweptCodes, []);
    assert.strictEqual(result.sweptCount, 0);
    assert.deepStrictEqual(result.replies, []);
    assert.deepStrictEqual(result.broadcasts, []);
  });

  it('a room whose players all disconnected before the threshold is removed at a nowMs past it', () => {
    const manager = new RoomManager();
    manager.createRoom('ROOM1', 1000);
    manager.addPlayer('ROOM1', 'p1');
    manager.addPlayer('ROOM1', 'p2');

    // Disconnect both players
    manager.disconnectPlayer('ROOM1', 'p1', 5000);
    manager.disconnectPlayer('ROOM1', 'p2', 10000);

    // Threshold is 300000ms (5 mins).
    // The latest player disconnected at 10000.
    // So 10000 + 300000 = 310000.
    // Any sweep past 310000 should remove the room.
    const result = manager.sweep(310005);

    assert.strictEqual(manager.getRoom('ROOM1'), undefined);
    assert.deepStrictEqual(result.sweptCodes, ['ROOM1']);
    assert.strictEqual(result.sweptCount, 1);
  });

  it('the same room is retained at a nowMs before the threshold', () => {
    const manager = new RoomManager();
    manager.createRoom('ROOM2', 1000);
    manager.addPlayer('ROOM2', 'p1');
    manager.addPlayer('ROOM2', 'p2');

    manager.disconnectPlayer('ROOM2', 'p1', 5000);
    manager.disconnectPlayer('ROOM2', 'p2', 10000);

    // 10000 + 300000 = 310000.
    // Sweep before 310000 should retain the room.
    const result = manager.sweep(309999);

    assert.ok(manager.getRoom('ROOM2'));
    assert.deepStrictEqual(result.sweptCodes, []);
    assert.strictEqual(result.sweptCount, 0);
  });

  it('an active room with a connected player is never swept', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('ROOM3', 1000);
    manager.addPlayer('ROOM3', 'p1');
    manager.addPlayer('ROOM3', 'p2');

    // Only p1 disconnects, p2 remains connected
    manager.disconnectPlayer('ROOM3', 'p1', 5000);

    // Set phase to 'game' so it is active and not in lobby phase
    room.phase = 'game';

    // Sweep way past the threshold
    const result = manager.sweep(5000000);

    assert.ok(manager.getRoom('ROOM3'));
    assert.deepStrictEqual(result.sweptCodes, []);
    assert.strictEqual(result.sweptCount, 0);
  });

  it('a room whose createdAt is older than maximum-lifetime in lobby phase with < 2 players is swept', () => {
    const manager = new RoomManager();
    // Lobby phase, 1 connected player, older than MAX_LIFETIME (900000)
    manager.createRoom('ROOM4', 1000);
    manager.addPlayer('ROOM4', 'p1');

    // MAX_LIFETIME is 900000. Created at 1000. Threshold is 901000.
    const result = manager.sweep(902000);

    assert.strictEqual(manager.getRoom('ROOM4'), undefined);
    assert.deepStrictEqual(result.sweptCodes, ['ROOM4']);
    assert.strictEqual(result.sweptCount, 1);
    // Should notify the 1 remaining player who was still connected
    assert.deepStrictEqual(result.replies, [
      {
        playerId: 'p1',
        message: { type: 'ROOM_CLOSED', reason: 'swept', code: 'ROOM4' }
      }
    ]);
  });

  it('Date.now is absent from lib/room-manager.js', () => {
    const filepath = path.join(__dirname, '../lib/room-manager.js');
    const source = fs.readFileSync(filepath, 'utf8');
    assert.ok(!source.includes('Date.now'), 'lib/room-manager.js contains Date.now() call, which is prohibited');
  });

  it('sweep with a fixed timestamp twice yields identical results (purity check)', () => {
    const manager = new RoomManager();
    manager.createRoom('ROOM_PURE', 1000);
    manager.addPlayer('ROOM_PURE', 'p1');
    manager.disconnectPlayer('ROOM_PURE', 'p1', 5000);

    const r1 = manager.sweep(310000);
    assert.strictEqual(r1.sweptCount, 1);

    // Since it's swept, calling it again returns empty
    const r2 = manager.sweep(310000);
    assert.strictEqual(r2.sweptCount, 0);
  });
});
