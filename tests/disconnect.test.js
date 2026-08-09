const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const RoomManager = require('../lib/room-manager');
const { validate } = require('../lib/protocol');

describe('Disconnect Handling & Turn Skippings', () => {

  // Helper to setup a room with N players and start the game
  function setupRoom(rm, playerCount) {
    const conn1 = 'conn_1';
    rm.createRoom(conn1);
    const room = rm.getRoomByConnection(conn1);
    const code = room.code;

    for (let i = 2; i <= playerCount; i++) {
      rm.join(`conn_${i}`, code);
    }

    rm.start(conn1);
    return room;
  }

  it('(1) disconnecting the active player advances the turn and broadcasts TURN_SYNC + PLAYER_LEFT', () => {
    const rm = new RoomManager();
    const room = setupRoom(rm, 3);

    // Originally, active slot is 0 (conn_1). Let's disconnect conn_1 (the active player).
    const res = rm.disconnect('conn_1');
    assert.ok(res);
    assert.ok(res.broadcasts);

    // Verify protocol compliance
    for (const b of res.broadcasts) {
      const valResult = validate(b.msg);
      assert.ok(valResult.ok, `Broadcast failed validation: ${valResult.error}`);
    }

    // Verify TURN_SYNC and PLAYER_LEFT are in broadcasts
    const playerLeft = res.broadcasts.find(b => b.msg.type === 'PLAYER_LEFT');
    assert.ok(playerLeft);
    assert.strictEqual(playerLeft.msg.slot, 0);

    const turnSync = res.broadcasts.find(b => b.msg.type === 'TURN_SYNC');
    assert.ok(turnSync);
    // Since slot 0 disconnected, turn should advance to the next alive and connected player, which is slot 1 (conn_2)
    assert.strictEqual(turnSync.msg.activeSlot, 1);
    assert.strictEqual(room.activeSlot, 1);
  });

  it('(2) an off-turn disconnect changes no active slot until the cursor reaches that slot, which is then skipped', () => {
    const rm = new RoomManager();
    const room = setupRoom(rm, 3);

    // Active slot is 0 (conn_1). Let's disconnect conn_2 (slot 1), who is off-turn.
    const res = rm.disconnect('conn_2');
    assert.ok(res);

    // Verify protocol compliance
    for (const b of res.broadcasts) {
      const valResult = validate(b.msg);
      assert.ok(valResult.ok, `Broadcast failed validation: ${valResult.error}`);
    }

    // Active slot should still be 0 (conn_1)
    assert.strictEqual(room.activeSlot, 0);

    // Now, let's complete the turn of conn_1. When the cursor advances, slot 1 should be skipped, landing on slot 2.
    // Fire shot as conn_1
    const fireRes = rm.fire('conn_1', { angle: 90, power: 100 });
    const shotId = fireRes.broadcasts[0].msg.shotId;

    // Resolve shot as conn_1
    const resolveRes = rm.resolveShot('conn_1', { shotId });
    assert.ok(resolveRes);

    const turnSync = resolveRes.broadcasts.find(b => b.msg.type === 'TURN_SYNC');
    assert.ok(turnSync);
    // Should skip slot 1 (disconnected) and go straight to slot 2 (conn_3)
    assert.strictEqual(turnSync.msg.activeSlot, 2);
    assert.strictEqual(room.activeSlot, 2);
  });

  it('(3) a 4-player round continues to completion with 3', () => {
    const rm = new RoomManager();
    const room = setupRoom(rm, 4);

    // Disconnect conn_4 (slot 3)
    rm.disconnect('conn_4');

    // Remaining active: slot 0, 1, 2.
    // Let's advance turns several times and verify they cycle 0 -> 1 -> 2 -> 0 -> 1 -> 2 ... skipping 3.
    // 1st advance: 0 -> 1
    let fire = rm.fire('conn_1', { angle: 90, power: 100 });
    let res = rm.resolveShot('conn_1', { shotId: fire.broadcasts[0].msg.shotId });
    assert.strictEqual(room.activeSlot, 1);

    // 2nd advance: 1 -> 2
    fire = rm.fire('conn_2', { angle: 90, power: 100 });
    res = rm.resolveShot('conn_2', { shotId: fire.broadcasts[0].msg.shotId });
    assert.strictEqual(room.activeSlot, 2);

    // 3rd advance: 2 -> 0 (skipping 3)
    fire = rm.fire('conn_3', { angle: 90, power: 100 });
    res = rm.resolveShot('conn_3', { shotId: fire.broadcasts[0].msg.shotId });
    assert.strictEqual(room.activeSlot, 0);
  });

  it('(4) the slot is marked connected === false, not removed', () => {
    const rm = new RoomManager();
    const room = setupRoom(rm, 2);

    rm.disconnect('conn_2');

    // The player's connected field must be false
    const p2 = room.players.get(1);
    assert.ok(p2);
    assert.strictEqual(p2.connected, false);
    // Slot should still exist in room.players Map
    assert.ok(room.players.has(1));
  });

  it('(5) host disconnect moves hostSlot to the lowest connected slot', () => {
    const rm = new RoomManager();
    const room = setupRoom(rm, 3);

    // Host is slot 0 (conn_1). Let's disconnect conn_1.
    rm.disconnect('conn_1');

    // The host slot should move to slot 1 (conn_2), which is the lowest connected slot.
    assert.strictEqual(room.hostSlot, 1);
  });

  it('(6) disconnecting everyone parks the room at phase === "paused" and returns rather than hanging', () => {
    const rm = new RoomManager();
    const room = setupRoom(rm, 2);

    // Disconnect conn_1 (active player). It should advance to conn_2.
    rm.disconnect('conn_1');
    assert.strictEqual(room.activeSlot, 1);

    // Disconnect conn_2 (the only remaining player). Since no connected alive players remain, it should park.
    const res = rm.disconnect('conn_2');
    assert.ok(res);
    assert.strictEqual(room.phase, 'paused');
    assert.ok(room.pausedAt);
    assert.strictEqual(typeof room.pausedAt, 'number');
  });

});
