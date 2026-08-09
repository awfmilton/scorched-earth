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
    const discRes = rm.disconnect('conn_2');
    assert.strictEqual(room.players.get(1).connected, false);

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

    // Player 2 can now fire!
    const fireRes = rm.fire('conn_2_new', { angle: 45, power: 500 });
    assert.ok(fireRes);
    assert.ok(fireRes.broadcasts);
    const fireSync = fireRes.broadcasts.find(b => b.msg.type === 'FIRE_SYNC');
    assert.ok(fireSync);
    assert.strictEqual(fireSync.msg.shooterSlot, 1);
  });

});
