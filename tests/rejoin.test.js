const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const RoomManager = require('../lib/room-manager');
const { validate } = require('../lib/protocol');

describe('RoomManager rejoin() mechanics', () => {

  function setupAndStartRoom(rm, count) {
    const conn1 = 'conn_1';
    const createRes = rm.createRoom(conn1);
    const room = rm.getRoomByConnection(conn1);
    const code = room.code;
    const playerToken1 = createRes.replies[0].msg.playerToken;

    const tokens = { conn_1: playerToken1 };

    for (let i = 2; i <= count; i++) {
      const conn = `conn_${i}`;
      const joinRes = rm.join(conn, code);
      tokens[conn] = joinRes.replies[0].msg.playerToken;
    }

    rm.start(conn1);
    return { room, code, tokens };
  }

  it('(1) valid token reclaims the same slot and returns the original seed, wind, live activeSlot', () => {
    const rm = new RoomManager();
    const { room, code, tokens } = setupAndStartRoom(rm, 3);

    // activeSlot is originally 0. Disconnect off-turn player conn_2 (slot 1)
    rm.disconnect('conn_2');
    assert.strictEqual(room.players.get(1).connected, false);

    /*
     * Move the cursor off turnOrder[0] before rejoining: slot 0 fires and resolves,
     * which skips the disconnected slot 1 and lands on slot 2. A resume that omits
     * the cursor would leave the returning client rendering slot 0 as active.
     */
    const fireRes = rm.fire('conn_1', { angle: 45, power: 500 });
    const shotId = fireRes.broadcasts.find(b => b.msg.type === 'FIRE_SYNC').msg.shotId;
    rm.resolveShot('conn_1', { shotId });
    assert.strictEqual(room.activeSlot, 2);
    assert.strictEqual(room.turnNumber, 2);

    // Rejoin player 2 using a new connectionId
    const newConn = 'conn_2_new';
    const rejoinRes = rm.rejoin(newConn, { code, playerToken: tokens['conn_2'] });

    assert.ok(rejoinRes);
    assert.ok(rejoinRes.replies);
    assert.ok(rejoinRes.broadcasts);

    // Verify protocol compliance of each frame
    for (const reply of rejoinRes.replies) {
      const val = validate(reply.msg);
      assert.ok(val.ok, `Reply validation failed: ${val.error}`);
    }
    for (const bcast of rejoinRes.broadcasts) {
      const val = validate(bcast.msg);
      assert.ok(val.ok, `Broadcast validation failed: ${val.error}`);
    }

    // Check we got a ROOM_STATE reply and a ROUND_START shape reply
    const stateReply = rejoinRes.replies.find(r => r.msg.type === 'ROOM_STATE');
    assert.ok(stateReply);
    assert.strictEqual(stateReply.msg.playerToken, tokens['conn_2']);

    const startReply = rejoinRes.replies.find(r => r.msg.type === 'ROUND_START');
    assert.ok(startReply);
    assert.strictEqual(startReply.msg.seed, room.seed);
    assert.strictEqual(startReply.msg.wind, room.wind);
    assert.strictEqual(startReply.msg.yourSlot, 1);
    assert.deepStrictEqual(startReply.msg.turnOrder, room.turnOrder);

    // The frames delivered to the rejoining player must report the LIVE cursor (2), not turnOrder[0]
    const syncReply = rejoinRes.replies.find(r => r.msg.type === 'TURN_SYNC');
    assert.ok(syncReply, 'rejoin must send the live turn cursor to the returning player');
    assert.strictEqual(syncReply.to, newConn);
    assert.strictEqual(syncReply.msg.activeSlot, room.activeSlot);
    assert.strictEqual(syncReply.msg.activeSlot, 2);
    assert.strictEqual(syncReply.msg.turnNumber, room.turnNumber);

    // Check player 2 is reconnected
    assert.strictEqual(room.players.get(1).connected, true);
    assert.strictEqual(room.players.get(1).connectionId, newConn);

    // ROOM_STATE broadcasted to all
    const stateBroadcast = rejoinRes.broadcasts.find(b => b.msg.type === 'ROOM_STATE');
    assert.ok(stateBroadcast);
    // playerToken should NOT be in broadcast
    assert.strictEqual(stateBroadcast.msg.playerToken, undefined);
  });

  it('(2) unknown token rejected, seats nobody', () => {
    const rm = new RoomManager();
    const { room, code } = setupAndStartRoom(rm, 2);

    rm.disconnect('conn_2');

    const beforePlayers = JSON.stringify(Array.from(room.players.entries()));

    // Try to rejoin with bad token
    assert.throws(() => {
      rm.rejoin('conn_2_new', { code, playerToken: 'badtoken123456789012345678901234' });
    }, (err) => {
      return err.code === 'UNKNOWN_ROOM';
    });

    // Verify room has no mutation
    const afterPlayers = JSON.stringify(Array.from(room.players.entries()));
    assert.strictEqual(beforePlayers, afterPlayers);
  });

  it('(3) still-connected token supersedes the stale socket', () => {
    // CONTRACT CHANGE. This used to assert the rejoin was REFUSED — which
    // stranded a player whose socket died uncleanly: the dead socket stays
    // "connected" until the heartbeat reaps it (up to two cycles), while
    // their fresh socket rejoins immediately and was turned away with no
    // retry. The token proves identity, so the fresh socket now takes over
    // the seat and the stale socket's eventual close is a no-op.
    const rm = new RoomManager();
    const { room, code, tokens } = setupAndStartRoom(rm, 2);

    const res = rm.rejoin('conn_2_new', { code, playerToken: tokens['conn_2'] });
    const seat = Array.from(room.players.values())
      .find(p => p.playerToken === tokens['conn_2']);
    assert.strictEqual(seat.connectionId, 'conn_2_new');
    assert.strictEqual(seat.connected, true);
    assert.ok(res.replies.some(r => r.to === 'conn_2_new' && r.msg.type === 'ROOM_STATE'));

    // The old socket's close must not unseat the superseding one.
    rm.disconnect('conn_2');
    assert.strictEqual(seat.connected, true);
  });

  it('(4) rejoin into a parked room restores phase === "playing"', () => {
    const rm = new RoomManager();
    const { room, code, tokens } = setupAndStartRoom(rm, 2);

    // Disconnect both to park the room
    rm.disconnect('conn_1');
    rm.disconnect('conn_2');

    assert.strictEqual(room.phase, 'paused');
    assert.ok(room.pausedAt);

    // CONTRACT CHANGE: a fully-parked room is RE-SEEDED, not resumed. The
    // old resume rebuilt the rejoiner's world from the round seed — a
    // pristine fiction standing in for a half-fought round. Now the server
    // mints a fresh seed for the same round number and everyone who
    // returns builds the same real world.
    const oldSeed = room.seed;
    const rejoinRes = rm.rejoin('conn_1_new', { code, playerToken: tokens['conn_1'] });
    assert.ok(rejoinRes);
    assert.strictEqual(room.phase, 'playing');
    assert.strictEqual(room.pausedAt, undefined);
    assert.notStrictEqual(room.seed, oldSeed, 'the parked round must be re-seeded');
    // Since only player 1 is connected, player 1 should be the activeSlot
    assert.strictEqual(room.activeSlot, 0);

    for (const frame of [...rejoinRes.replies, ...rejoinRes.broadcasts]) {
      const val = validate(frame.msg);
      assert.ok(val.ok, `Frame validation failed: ${val.error}`);
    }

    const roundStart = rejoinRes.broadcasts.find(b => b.msg.type === 'ROUND_START');
    assert.ok(roundStart, 're-seed must ship a fresh ROUND_START');
    assert.strictEqual(roundStart.msg.seed, room.seed);

    // The re-seed announces its cursor to the CONNECTED players — a frame
    // aimed at a dead socket serves nobody.
    const syncBroadcast = rejoinRes.broadcasts.find(b => b.msg.type === 'TURN_SYNC');
    assert.ok(syncBroadcast, 're-seed must announce the cursor');
    assert.strictEqual(syncBroadcast.msg.activeSlot, 0);
    assert.strictEqual(syncBroadcast.msg.turnNumber, 1);
    assert.deepStrictEqual(syncBroadcast.to, ['conn_1_new']);
  });

  it('(5) the reclaimed player can then fire() on their turn', () => {
    const rm = new RoomManager();
    const { room, code, tokens } = setupAndStartRoom(rm, 2);

    // Disconnect active player (conn_1 / slot 0)
    rm.disconnect('conn_1');
    assert.strictEqual(room.activeSlot, 1); // active slot advances to conn_2

    // Now disconnect conn_2 so room parks
    rm.disconnect('conn_2');
    assert.strictEqual(room.phase, 'paused');

    // Rejoin conn_2 (slot 1) using a new connection
    const rejoinRes = rm.rejoin('conn_2_new', { code, playerToken: tokens['conn_2'] });
    assert.ok(rejoinRes);
    assert.strictEqual(room.phase, 'playing');
    // As conn_2 is the only connected player, activeSlot is set to their slot (1)
    assert.strictEqual(room.activeSlot, 1);

    for (const frame of [...rejoinRes.replies, ...rejoinRes.broadcasts]) {
      const val = validate(frame.msg);
      assert.ok(val.ok, `Frame validation failed: ${val.error}`);
    }

    // The un-park names the returning slot as the cursor, to everyone
    const syncBroadcast = rejoinRes.broadcasts.find(b => b.msg.type === 'TURN_SYNC');
    assert.ok(syncBroadcast, 'un-park must announce the reassigned cursor to all clients');
    assert.strictEqual(syncBroadcast.msg.activeSlot, 1);

    /*
     * ...and EXACTLY ONCE to the returning player. This assertion used to
     * require a TURN_SYNC reply in addition to the broadcast, which pinned the
     * duplicate in place: the un-park broadcast already addresses every
     * connection including this one. A turn boundary is not idempotent on the
     * client — it drifts airships, heals from repair bays, ticks turret
     * cooldowns and can fire a live volley that carves terrain — so a client
     * that applies it twice while everyone else applies it once has silently
     * left the shared simulation.
     */
    const syncsToRejoiner = [...rejoinRes.replies, ...rejoinRes.broadcasts]
      .filter(f => f.msg.type === 'TURN_SYNC')
      .filter(f => (Array.isArray(f.to) ? f.to : [f.to]).includes('conn_2_new'));
    assert.strictEqual(
      syncsToRejoiner.length, 1,
      'the returning player must be told the cursor exactly once, not once per delivery path'
    );
    assert.strictEqual(syncsToRejoiner[0].msg.activeSlot, 1);

    // Player 2 can now fire!
    const fireRes = rm.fire('conn_2_new', { angle: 45, power: 500 });
    assert.ok(fireRes);
    assert.ok(fireRes.broadcasts);
    const fireSync = fireRes.broadcasts.find(b => b.msg.type === 'FIRE_SYNC');
    assert.ok(fireSync);
    assert.strictEqual(fireSync.msg.shooterSlot, 1);
  });

});
