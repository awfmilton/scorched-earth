const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const { RoomManager, Room } = require('../lib/room-manager');

describe('Multiplayer Rejoin Tests', () => {

  it('a rejoin with the correct token reclaims the same slot number and receives the original seed, wind, and the live activeSlot', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Room-123', {
      seed: 456,
      wind: 25,
      activeSlot: 1,
      terrainDeformationLog: ['carve-1', 'carve-2']
    });

    // Add players to the room
    const player1Token = 'token-p1';
    const player2Token = 'token-p2';

    room.addPlayer('conn-1', 'Alice', player1Token);
    room.addPlayer('conn-2', 'Bob', player2Token);

    // Let's disconnect Alice (slot 0)
    manager.disconnect('conn-1');

    // Alice rejoins on a new connection ID
    const rejoinResult = manager.rejoin('conn-1-new', {
      code: 'room-123',
      playerToken: player1Token
    });

    assert.strictEqual(rejoinResult.success, true);

    // Check received payload values match original room settings
    assert.strictEqual(rejoinResult.resumePayload.seed, 456);
    assert.strictEqual(rejoinResult.resumePayload.wind, 25);
    assert.strictEqual(rejoinResult.resumePayload.activeSlot, 1);
    assert.strictEqual(rejoinResult.resumePayload.yourSlot, 0); // slot 0
    assert.deepStrictEqual(rejoinResult.resumePayload.terrainDeformationLog, ['carve-1', 'carve-2']);

    // Check slot connection is updated and slot number is correct
    assert.strictEqual(room.slots[0].connectionId, 'conn-1-new');
    assert.strictEqual(room.slots[0].connected, true);
  });

  it('a rejoin with an unknown token is rejected and seats nobody', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Room-123', {
      seed: 456,
      wind: 25,
      activeSlot: 0
    });

    room.addPlayer('conn-1', 'Alice', 'token-alice');

    // Try rejoining with an invalid/unknown token
    assert.throws(() => {
      manager.rejoin('conn-stranger', {
        code: 'room-123',
        playerToken: 'invalid-token'
      });
    }, /Unknown token/);

    // Verify nobody was seated, connection was not overwritten
    assert.strictEqual(room.slots[0].connectionId, 'conn-1');
    assert.strictEqual(room.slots[0].connected, true);
  });

  it('a rejoin with a token whose slot is still connected is rejected', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Room-123', {
      seed: 456,
      wind: 25,
      activeSlot: 0
    });

    room.addPlayer('conn-1', 'Alice', 'token-alice');

    // Alice is still connected, try rejoining with her token
    assert.throws(() => {
      manager.rejoin('conn-1-new', {
        code: 'room-123',
        playerToken: 'token-alice'
      });
    }, /Slot already connected/);

    // Verify no changes to connectionId
    assert.strictEqual(room.slots[0].connectionId, 'conn-1');
  });

  it('a rejoin with a token for a different room is rejected', () => {
    const manager = new RoomManager();
    const roomA = manager.createRoom('Room-A', { seed: 111 });
    const roomB = manager.createRoom('Room-B', { seed: 222 });

    roomA.addPlayer('conn-alice', 'Alice', 'token-alice');
    roomB.addPlayer('conn-bob', 'Bob', 'token-bob');

    // Alice disconnects from room A
    manager.disconnect('conn-alice');

    // Alice tries to rejoin room B using her room A token
    assert.throws(() => {
      manager.rejoin('conn-alice-new', {
        code: 'room-B',
        playerToken: 'token-alice'
      });
    }, /Token belongs to a different room/);

    // Verify room B slots remain unchanged
    assert.strictEqual(roomB.slots[0].connectionId, 'conn-bob');
    assert.strictEqual(roomA.slots[0].connected, false);
  });

  it('a rejoin into a parked room sets phase back to playing', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Room-123', {
      seed: 456,
      wind: 25,
      activeSlot: 0,
      phase: 'playing'
    });

    room.addPlayer('conn-1', 'Alice', 'token-alice');

    // Alice disconnects -> room becomes parked
    manager.disconnect('conn-1');
    assert.strictEqual(room.phase, 'parked');

    // Alice rejoins -> room phase becomes playing
    manager.rejoin('conn-1-new', {
      code: 'room-123',
      playerToken: 'token-alice'
    });

    assert.strictEqual(room.phase, 'playing');
    assert.strictEqual(room.activeSlot, 0); // turn resumes on Alice's slot because no other player is connected
  });

  it('the reclaimed player can then fire on their turn', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('Room-123', {
      seed: 456,
      wind: 25,
      activeSlot: 0,
      phase: 'playing'
    });

    room.addPlayer('conn-1', 'Alice', 'token-alice');
    room.addPlayer('conn-2', 'Bob', 'token-bob');

    // Alice disconnects
    manager.disconnect('conn-1');

    // Rejoin Alice
    manager.rejoin('conn-1-new', {
      code: 'room-123',
      playerToken: 'token-alice'
    });

    // Helper function to check if a player is authorized to fire
    const canFire = (roomCode, connectionId) => {
      const r = manager.getRoom(roomCode);
      if (!r || r.phase !== 'playing') return false;
      const slotIdx = r.activeSlot;
      const activeSlot = r.slots[slotIdx];
      return activeSlot && activeSlot.connectionId === connectionId && activeSlot.connected;
    };

    // Alice is slot 0, and activeSlot is 0, so she can fire
    assert.strictEqual(canFire('room-123', 'conn-1-new'), true);

    // Bob (slot 1) cannot fire yet
    assert.strictEqual(canFire('room-123', 'conn-2'), false);

    // Advance turn to Bob (slot 1)
    room.activeSlot = 1;

    // Bob can now fire
    assert.strictEqual(canFire('room-123', 'conn-2'), true);
    // Alice cannot fire anymore
    assert.strictEqual(canFire('room-123', 'conn-1-new'), false);
  });

});
