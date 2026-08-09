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

  it('(3) still-connected token rejected', () => {
    const rm = new RoomManager();
    const { code, tokens } = setupAndStartRoom(rm, 2);

    // Try to rejoin conn_2 when they are still connected
    assert.throws(() => {
      rm.rejoin('conn_2_new', { code, playerToken: tokens['conn_2'] });
    }, (err) => {
      return err.code === 'UNKNOWN_ROOM';
    });
  });

  it('(4) rejoin into a parked room restores phase === "playing"', () => {
    const rm = new RoomManager();
    const { room, code, tokens } = setupAndStartRoom(rm, 2);

    // Disconnect both to park the room
    rm.disconnect('conn_1');
    rm.disconnect('conn_2');

    assert.strictEqual(room.phase, 'paused');
    assert.ok(room.pausedAt);

    // Rejoin player 1
    const rejoinRes = rm.rejoin('conn_1_new', { code, playerToken: tokens['conn_1'] });
    assert.ok(rejoinRes);
    assert.strictEqual(room.phase, 'playing');
    assert.strictEqual(room.pausedAt, undefined);
    // Since only player 1 is connected, player 1 should be the activeSlot
    assert.strictEqual(room.activeSlot, 0);

    for (const frame of [...rejoinRes.replies, ...rejoinRes.broadcasts]) {
      const val = validate(frame.msg);
      assert.ok(val.ok, `Frame validation failed: ${val.error}`);
    }

    // The un-park moved the cursor to slot 0 — every client must be told
    const syncBroadcast = rejoinRes.broadcasts.find(b => b.msg.type === 'TURN_SYNC');
    assert.ok(syncBroadcast, 'un-park must announce the reassigned cursor to all clients');
    assert.strictEqual(syncBroadcast.msg.activeSlot, 0);
    assert.deepStrictEqual(
      syncBroadcast.to,
      Array.from(room.players.values()).map(p => p.connectionId)
    );
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

    // The un-park names the returning slot as the cursor, to the player and to everyone
    const syncReply = rejoinRes.replies.find(r => r.msg.type === 'TURN_SYNC');
    assert.ok(syncReply, 'the returning player must be told the live cursor');
    assert.strictEqual(syncReply.msg.activeSlot, 1);

    const syncBroadcast = rejoinRes.broadcasts.find(b => b.msg.type === 'TURN_SYNC');
    assert.ok(syncBroadcast, 'un-park must announce the reassigned cursor to all clients');
    assert.strictEqual(syncBroadcast.msg.activeSlot, 1);

    // Player 2 can now fire!
    const fireRes = rm.fire('conn_2_new', { angle: 45, power: 500 });
    assert.ok(fireRes);
    assert.ok(fireRes.broadcasts);
    const fireSync = fireRes.broadcasts.find(b => b.msg.type === 'FIRE_SYNC');
    assert.ok(fireSync);
    assert.strictEqual(fireSync.msg.shooterSlot, 1);
  });

});
