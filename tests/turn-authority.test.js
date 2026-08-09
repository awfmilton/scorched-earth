const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const RoomManager = require('../lib/room-manager');

describe('RoomManager Turn Authority Tests', () => {

  it('verifies authorization, clamping, and turn-progression rules', () => {
    const rm = new RoomManager();

    // 1. Setup a started 3-player room
    const createRes = rm.createRoom('conn_1');
    assert.ok(createRes);
    const room = rm.getRoomByConnection('conn_1');
    const code = room.code;

    rm.join('conn_2', code);
    rm.join('conn_3', code);

    rm.start('conn_1');

    assert.strictEqual(room.phase, 'playing');
    assert.strictEqual(room.activeSlot, 0); // Player 1 (conn_1) starts
    assert.strictEqual(room.awaitingResolution, false);
    assert.strictEqual(room.turnNumber, 1);

    // 2. A FIRE from a non-active connection (conn_2) returns NOT_YOUR_TURN
    assert.throws(() => {
      rm.fire('conn_2', { angle: 45, power: 500, weapon: 'Baby Missile' });
    }, (err) => {
      return err.code === 'NOT_YOUR_TURN' || err.message === 'NOT_YOUR_TURN';
    });

    // Emits no FIRE_SYNC, leaves activeSlot unchanged
    assert.strictEqual(room.activeSlot, 0);
    assert.strictEqual(room.awaitingResolution, false);

    // 3. A successful FIRE from active connection
    const fireRes = rm.fire('conn_1', { angle: 45, power: 500, weapon: 'Baby Missile' });
    assert.ok(fireRes);
    assert.ok(Array.isArray(fireRes.broadcasts));
    assert.strictEqual(fireRes.broadcasts.length, 1);

    const syncMsg = fireRes.broadcasts[0].msg;
    assert.strictEqual(syncMsg.type, 'FIRE_SYNC');
    assert.strictEqual(syncMsg.shooterSlot, 0);
    assert.strictEqual(syncMsg.weapon, 'Baby Missile');
    assert.strictEqual(room.awaitingResolution, true);

    // 4. A second FIRE before resolution returns ALREADY_FIRED
    assert.throws(() => {
      rm.fire('conn_1', { angle: 45, power: 500, weapon: 'Baby Missile' });
    }, (err) => {
      return err.code === 'ALREADY_FIRED' || err.message === 'ALREADY_FIRED';
    });

    // 5. activeSlot changes only after resolveShot, never on fire alone
    assert.strictEqual(room.activeSlot, 0);

    const firstShotId = syncMsg.shotId;

    // A resolveShot with a stale or incorrect shotId is ignored (ignored means return empty payload, no state change)
    const staleResolve = rm.resolveShot('conn_1', { shotId: 999 });
    assert.deepStrictEqual(staleResolve, { replies: [], broadcasts: [] });
    assert.strictEqual(room.activeSlot, 0);
    assert.strictEqual(room.awaitingResolution, true);

    // Resolve with the correct shotId from the shooter
    const resolveRes = rm.resolveShot('conn_1', { shotId: firstShotId });
    assert.ok(resolveRes);
    assert.strictEqual(room.awaitingResolution, false);
    assert.strictEqual(room.activeSlot, 1); // Advanced to Player 2 (conn_2)
    assert.strictEqual(room.turnNumber, 2);

    // A late/duplicate resolveShot is ignored and does not double-advance
    const duplicateResolve = rm.resolveShot('conn_1', { shotId: firstShotId });
    assert.deepStrictEqual(duplicateResolve, { replies: [], broadcasts: [] });
    assert.strictEqual(room.activeSlot, 1); // Remains 1

    // 6. Out-of-range angle and power are clamped server-side
    // Now activeSlot is 1 (Player 2, conn_2)
    // Angle: 250 -> 180, Power: 1200 -> 1000
    // Math.cos(180 deg) = -1, Math.sin(180 deg) = 0
    // vx = 1000 * -1 = -1000, vy = -1000 * 0 = 0
    const fireRes2 = rm.fire('conn_2', { angle: 250, power: 1200, weapon: 'Baby Missile' });
    assert.ok(fireRes2);

    const syncMsg2 = fireRes2.broadcasts[0].msg;
    assert.strictEqual(syncMsg2.type, 'FIRE_SYNC');
    assert.ok(Math.abs(syncMsg2.vx - (-1000)) < 0.1);
    assert.ok(Math.abs(syncMsg2.vy - 0) < 0.1);

    // Resolve second shot
    const secondShotId = syncMsg2.shotId;
    rm.resolveShot('conn_2', { shotId: secondShotId });
    assert.strictEqual(room.activeSlot, 2); // Advanced to Player 3 (conn_3)

    // 7. Verify ROUND_END when only 1 or 0 players remain alive
    // Mark Player 2 (slot 1) and Player 3 (slot 2) as dead
    room.players.get(1).alive = false;
    room.players.get(2).alive = false;

    // Progress the turn to see ROUND_END broadcast
    const endRes = rm.nextTurn(room);
    assert.strictEqual(room.phase, 'ended');
    assert.strictEqual(endRes.broadcasts.length, 1);

    const endMsg = endRes.broadcasts[0].msg;
    assert.strictEqual(endMsg.type, 'ROUND_END');
    assert.strictEqual(endMsg.winnerSlot, 0); // Player 1 (slot 0) survived
    assert.deepStrictEqual(endMsg.scores, []);
  });

});