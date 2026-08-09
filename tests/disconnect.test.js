const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const RoomManager = require('../lib/room-manager');

describe('RoomManager Disconnect and Turn Navigation', () => {

  it('disconnecting the active player advances the turn and broadcasts both TURN_SYNC and PLAYER_LEFT', () => {
    const slots = [
      { connectionId: 'p1', connected: true, alive: true },
      { connectionId: 'p2', connected: true, alive: true },
      { connectionId: 'p3', connected: true, alive: true }
    ];

    const rm = new RoomManager({
      slots,
      phase: 'playing',
      activeSlot: 0,
      hostSlot: 0,
      awaitingResolution: true
    });

    rm.disconnect('p1');

    // Slot for p1 should be marked connected = false
    assert.strictEqual(rm.slots[0].connected, false);

    // Turn should have advanced immediately to p2 (index 1)
    assert.strictEqual(rm.activeSlot, 1);

    // awaitingResolution should be cleared
    assert.strictEqual(rm.awaitingResolution, false);

    // Both PLAYER_LEFT and TURN_SYNC should be broadcast
    const playerLeftMsg = rm.broadcasts.find(b => b.type === 'PLAYER_LEFT');
    const turnSyncMsg = rm.broadcasts.find(b => b.type === 'TURN_SYNC');

    assert.ok(playerLeftMsg, 'PLAYER_LEFT was broadcast');
    assert.ok(turnSyncMsg, 'TURN_SYNC was broadcast');
    assert.deepStrictEqual(playerLeftMsg.payload.slot, slots[0]);
    assert.strictEqual(turnSyncMsg.payload.activeSlot, 1);
  });

  it('disconnecting an off-turn player changes no active slot until the cursor reaches them, at which point they are skipped', () => {
    const slots = [
      { connectionId: 'p1', connected: true, alive: true },
      { connectionId: 'p2', connected: true, alive: true },
      { connectionId: 'p3', connected: true, alive: true }
    ];

    const rm = new RoomManager({
      slots,
      phase: 'playing',
      activeSlot: 0, // p1 is active
      hostSlot: 0
    });

    // p2 (off-turn player) disconnects
    rm.disconnect('p2');

    // Active slot should NOT change immediately
    assert.strictEqual(rm.activeSlot, 0);
    assert.strictEqual(rm.slots[1].connected, false);

    // When nextTurn() is called, p2 is skipped, and it advances directly to p3 (index 2)
    rm.nextTurn();
    assert.strictEqual(rm.activeSlot, 2);
  });

  it('a 4-player round continues to completion with 3 players', () => {
    const slots = [
      { connectionId: 'p1', connected: true, alive: true },
      { connectionId: 'p2', connected: true, alive: true },
      { connectionId: 'p3', connected: true, alive: true },
      { connectionId: 'p4', connected: true, alive: true }
    ];

    const rm = new RoomManager({
      slots,
      phase: 'playing',
      activeSlot: 0,
      hostSlot: 0
    });

    // p2 disconnects
    rm.disconnect('p2');

    // Cycle through turns to show game proceeds correctly skipping p2
    // Currently on p1 (0)
    assert.strictEqual(rm.activeSlot, 0);

    // Next turn -> skips p2, goes to p3 (2)
    rm.nextTurn();
    assert.strictEqual(rm.activeSlot, 2);

    // Next turn -> goes to p4 (3)
    rm.nextTurn();
    assert.strictEqual(rm.activeSlot, 3);

    // Next turn -> loops back to p1 (0)
    rm.nextTurn();
    assert.strictEqual(rm.activeSlot, 0);
  });

  it('the disconnected slot is marked rather than removed', () => {
    const slots = [
      { connectionId: 'p1', connected: true, alive: true },
      { connectionId: 'p2', connected: true, alive: true }
    ];

    const rm = new RoomManager({
      slots,
      phase: 'playing',
      activeSlot: 0,
      hostSlot: 0
    });

    rm.disconnect('p2');

    // The slot array should still have length 2 (not removed)
    assert.strictEqual(rm.slots.length, 2);
    // But connection status is marked false
    assert.strictEqual(rm.slots[1].connected, false);
  });

  it('host disconnect moves hostSlot to the lowest connected slot', () => {
    const slots = [
      { connectionId: 'p1', connected: true, alive: true },
      { connectionId: 'p2', connected: true, alive: true },
      { connectionId: 'p3', connected: true, alive: true }
    ];

    // Host is p1 (index 0)
    const rm = new RoomManager({
      slots,
      phase: 'playing',
      activeSlot: 1,
      hostSlot: 0
    });

    rm.disconnect('p1');

    // Since p1 (index 0) was host and disconnected, host role moves to the lowest connected slot (p2, index 1)
    assert.strictEqual(rm.hostSlot, 1);

    // Disconnect p2 (index 1) as well, host role moves to p3 (index 2)
    rm.disconnect('p2');
    assert.strictEqual(rm.hostSlot, 2);
  });

  it('disconnecting every player parks the room with phase === "paused" and the call returns rather than hanging', () => {
    const slots = [
      { connectionId: 'p1', connected: true, alive: true },
      { connectionId: 'p2', connected: true, alive: true }
    ];

    const rm = new RoomManager({
      slots,
      phase: 'playing',
      activeSlot: 0,
      hostSlot: 0
    });

    // Disconnect both players
    rm.disconnect('p1'); // p1 is active, so disconnect will automatically call nextTurn()
    rm.disconnect('p2'); // now p2 is active, so disconnect will call nextTurn() as well

    // Since everyone is disconnected, phase should become 'paused'
    assert.strictEqual(rm.phase, 'paused');
    assert.ok(rm.pausedAt !== null, 'pausedAt timestamp is set');
    assert.ok(typeof rm.pausedAt === 'number');

    // Calling nextTurn() again doesn't hang
    const startTime = Date.now();
    rm.nextTurn();
    const duration = Date.now() - startTime;

    assert.ok(duration < 50, 'nextTurn() returned immediately without hanging');
    assert.strictEqual(rm.phase, 'paused');
  });

  it('lobby phase behavior removes slot outright and updates hostSlot correctly', () => {
    const slots = [
      { connectionId: 'p1', connected: true, alive: true },
      { connectionId: 'p2', connected: true, alive: true }
    ];

    const rm = new RoomManager({
      slots,
      phase: 'lobby',
      activeSlot: null,
      hostSlot: 0
    });

    // In lobby phase, disconnecting a player removes them outright
    rm.disconnect('p2');

    assert.strictEqual(rm.slots.length, 1);
    assert.strictEqual(rm.slots[0].connectionId, 'p1');

    // Disconnecting the host p1 in lobby phase removes them and updates hostSlot
    rm.disconnect('p1');
    assert.strictEqual(rm.slots.length, 0);
    assert.strictEqual(rm.hostSlot, null);
  });

  it('lobby phase with numeric indices shifts hostSlot down when a lower index is removed', () => {
    const slots = [
      { connectionId: 'p1', connected: true, alive: true },
      { connectionId: 'p2', connected: true, alive: true },
      { connectionId: 'p3', connected: true, alive: true }
    ];

    const rm = new RoomManager({
      slots,
      phase: 'lobby',
      activeSlot: null,
      hostSlot: 2 // p3 is the host
    });

    // p1 (index 0) disconnects and is spliced out in lobby phase
    rm.disconnect('p1');

    // The slots should now be p2, p3 (length 2)
    assert.strictEqual(rm.slots.length, 2);
    assert.strictEqual(rm.slots[0].connectionId, 'p2');
    assert.strictEqual(rm.slots[1].connectionId, 'p3');

    // Since index 0 was removed, p3 shifted from index 2 to index 1.
    // hostSlot should be decremented to 1 to stay pointing to p3!
    assert.strictEqual(rm.hostSlot, 1);
  });

});
