// A mid-round rejoiner cannot be restored, so it must not be allowed to act.
//
// The server is a relay: it holds the seed, the turn cursor and the roster, and
// nothing else. There is no terrain here, no tank hp, no holding — so when a
// player reconnects three turns into a round, there is nothing to send them that
// would describe the world they left. All the server can do is repeat the round
// seed, and the seed reproduces the world as it was at ROUND START: pristine
// terrain, full-hp tanks, every structure unbreached and every oil vat armed.
// Meanwhile the peers are carrying a round's worth of craters and damage.
//
// Letting that client take a turn would author a FIRE the whole room has to
// simulate, aimed from a world only it can see — and because lockstep clients
// never compare notes, the disagreement is permanent and completely silent.
//
// So a mid-round rejoiner comes back as a SPECTATOR: seated, connected, counted
// for the shop, but skipped by the turn cursor until the next round re-seeds
// everyone and the divergence is thrown away rather than reconciled.

const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const RoomManager = require('../lib/room-manager');
const { validate } = require('../lib/protocol');

function setupAndStartRoom(rm, count) {
  const conn1 = 'conn_1';
  const createRes = rm.createRoom(conn1);
  const room = rm.getRoomByConnection(conn1);
  const code = room.code;
  const tokens = { conn_1: createRes.replies[0].msg.playerToken };

  for (let i = 2; i <= count; i++) {
    const conn = `conn_${i}`;
    tokens[conn] = rm.join(conn, code).replies[0].msg.playerToken;
  }

  rm.start(conn1);
  return { room, code, tokens };
}

// Advance the cursor by having the active player fire and resolve.
function takeTurn(rm, connId) {
  const fireRes = rm.fire(connId, { angle: 45, power: 500 });
  const shotId = fireRes.broadcasts.find(b => b.msg.type === 'FIRE_SYNC').msg.shotId;
  return rm.resolveShot(connId, { shotId });
}

describe('Mid-round rejoin comes back as a spectator', () => {
  it('marks the returning player as spectating while the round is still live', () => {
    const rm = new RoomManager();
    const { room, code, tokens } = setupAndStartRoom(rm, 3);

    // Slot 1 drops while slots 0 and 2 keep playing — the room is still 'playing',
    // so there is a live peer world this client would be out of step with.
    rm.disconnect('conn_2');
    assert.strictEqual(room.phase, 'playing');

    const res = rm.rejoin('conn_2_new', { code, playerToken: tokens['conn_2'] });

    assert.strictEqual(room.players.get(1).connected, true, 'they are back in the room');
    assert.strictEqual(room.players.get(1).spectating, true, 'but not back in the round');

    const roundStart = res.replies.find(r => r.msg.type === 'ROUND_START');
    assert.ok(roundStart, 'the returning client still needs the round frame');
    assert.strictEqual(
      roundStart.msg.spectating, true,
      'the client has to be told, or it will render a private world as the live match'
    );

    for (const frame of [...res.replies, ...res.broadcasts]) {
      const val = validate(frame.msg);
      assert.ok(val.ok, `Frame validation failed: ${val.error}`);
    }
  });

  it('never hands the turn to a spectator', () => {
    const rm = new RoomManager();
    const { room, code, tokens } = setupAndStartRoom(rm, 3);

    rm.disconnect('conn_2');
    rm.rejoin('conn_2_new', { code, playerToken: tokens['conn_2'] });
    assert.strictEqual(room.players.get(1).spectating, true);

    // Slot 0 takes its turn. The cursor must step over the spectating slot 1
    // and land on slot 2 — exactly as it did while they were disconnected.
    assert.strictEqual(room.activeSlot, 0);
    takeTurn(rm, 'conn_1');
    assert.strictEqual(room.activeSlot, 2, 'a spectator is skipped, not queued');

    // And all the way around again.
    takeTurn(rm, 'conn_3');
    assert.strictEqual(room.activeSlot, 0, 'still skipped on the next lap');
  });

  it('refuses a spectator that tries to fire anyway', () => {
    const rm = new RoomManager();
    const { room, code, tokens } = setupAndStartRoom(rm, 3);

    rm.disconnect('conn_2');
    rm.rejoin('conn_2_new', { code, playerToken: tokens['conn_2'] });

    // The trust boundary this project accepts is "a modified client can lie
    // about its own results", not "a modified client can shoot out of turn".
    assert.throws(
      () => rm.fire('conn_2_new', { angle: 45, power: 500 }),
      (err) => err.code === 'NOT_YOUR_TURN'
    );
    assert.strictEqual(room.activeSlot, 0, 'and the cursor did not move');
  });

  it('puts them back in play at the next round, where a fresh seed makes it safe', () => {
    const rm = new RoomManager();
    const { room, code, tokens } = setupAndStartRoom(rm, 2);
    room.totalRounds = 3;

    rm.disconnect('conn_2');
    rm.rejoin('conn_2_new', { code, playerToken: tokens['conn_2'] });
    assert.strictEqual(room.players.get(1).spectating, true);

    // End the round and clear the shop. The next round re-seeds the world for
    // everyone, so the spectator's stale board is discarded rather than merged.
    room.players.get(1).alive = false;
    const endRes = takeTurn(rm, 'conn_1');
    assert.ok(
      endRes.broadcasts.some(b => b.msg.type === 'ROUND_END'),
      'the round must actually end for this test to mean anything'
    );
    assert.strictEqual(room.phase, 'shopping');

    rm.shopDone('conn_1');
    rm.shopDone('conn_2_new');

    assert.strictEqual(room.phase, 'playing', 'the next round starts');
    assert.strictEqual(
      room.players.get(1).spectating, false,
      'a re-seeded round is exactly what makes it safe to play again'
    );
  });

  it('does NOT sideline a player rejoining a parked room — there is no peer to disagree with', () => {
    const rm = new RoomManager();
    const { room, code, tokens } = setupAndStartRoom(rm, 2);

    // Everyone dropped, so nobody advanced the world past the point this player
    // remembers. The first one back becomes the reference client.
    rm.disconnect('conn_1');
    rm.disconnect('conn_2');
    assert.strictEqual(room.phase, 'paused');

    const res = rm.rejoin('conn_1_new', { code, playerToken: tokens['conn_1'] });
    assert.strictEqual(room.players.get(0).spectating, false);

    const roundStart = res.replies.find(r => r.msg.type === 'ROUND_START');
    assert.strictEqual(roundStart.msg.spectating, false);

    // They can take their turn immediately — the un-park is not a sideline.
    assert.strictEqual(room.activeSlot, 0);
    assert.ok(rm.fire('conn_1_new', { angle: 45, power: 500 }));
  });

  it('does NOT sideline a player rejoining during the shop — the next round re-seeds anyway', () => {
    const rm = new RoomManager();
    const { room, code, tokens } = setupAndStartRoom(rm, 2);
    room.totalRounds = 3;

    room.players.get(1).alive = false;
    takeTurn(rm, 'conn_1');
    assert.strictEqual(room.phase, 'shopping');

    rm.disconnect('conn_2');
    const res = rm.rejoin('conn_2_new', { code, playerToken: tokens['conn_2'] });

    assert.strictEqual(room.players.get(1).spectating, false);

    // And they get the frame that opens the shop, or the whole room waits on a
    // SHOP_DONE they have no UI to send.
    const roundEnd = res.replies.find(r => r.msg.type === 'ROUND_END');
    assert.ok(roundEnd, 'a shop-phase rejoiner needs ROUND_END to open the shop');
    assert.strictEqual(roundEnd.msg.matchOver, false);

    for (const frame of [...res.replies, ...res.broadcasts]) {
      const val = validate(frame.msg);
      assert.ok(val.ok, `Frame validation failed: ${val.error}`);
    }
  });

  it('un-parks onto a player who can actually move, not one who cannot', () => {
    const rm = new RoomManager();
    const { room, code, tokens } = setupAndStartRoom(rm, 3);

    // Slot 1 reconnects mid-round as a spectator, then everyone able to act
    // drops. Nothing can advance the room, so it parks.
    rm.disconnect('conn_2');
    rm.rejoin('conn_2_new', { code, playerToken: tokens['conn_2'] });
    rm.disconnect('conn_1');
    rm.disconnect('conn_3');
    assert.strictEqual(room.phase, 'paused', 'a room of spectators cannot advance itself');

    // Slot 0 comes back. Un-parking without re-deriving the cursor would hand
    // the room to the spectator it is still pointing at, and nothing would ever
    // move again.
    rm.rejoin('conn_1_new', { code, playerToken: tokens['conn_1'] });
    assert.strictEqual(room.phase, 'playing');

    const cursorPlayer = room.players.get(room.activeSlot);
    assert.ok(cursorPlayer.connected && !cursorPlayer.spectating,
      'the cursor must land on someone who can take a turn');
    assert.ok(rm.fire(cursorPlayer.connectionId, { angle: 45, power: 500 }));
  });
});
