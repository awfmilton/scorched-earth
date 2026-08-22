const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const RoomManager = require('../lib/room-manager.js');

/**
 * Drives a room to the end of its current round by killing everyone but slot 0.
 * Returns the ROUND_END message.
 */
function endRound(rm, room, survivorSlot = 0) {
  const shooter = room.players.get(room.activeSlot);
  const fireRes = rm.fire(shooter.connectionId, { angle: 45, power: 500 });
  const shotId = fireRes.broadcasts[0].msg.shotId;
  const eliminated = Array.from(room.players.keys()).filter(s => s !== survivorSlot);
  const res = rm.resolveShot(shooter.connectionId, { shotId, eliminated });
  return res.broadcasts.find(b => b.msg.type === 'ROUND_END');
}

function threePlayerRoom(config) {
  const rm = new RoomManager();
  rm.createRoom('conn_1');
  const room = rm.getRoomByConnection('conn_1');
  rm.join('conn_2', room.code);
  rm.join('conn_3', room.code);
  rm.start('conn_1', config);
  return { rm, room };
}

describe('Multi-round online matches', () => {
  it('enters a shop intermission instead of ending a non-final round', () => {
    const { rm, room } = threePlayerRoom({ rounds: 3 });

    const end = endRound(rm, room);
    assert.ok(end, 'a ROUND_END should be broadcast');
    assert.strictEqual(end.msg.matchOver, false);
    assert.strictEqual(end.msg.round, 1);
    assert.strictEqual(end.msg.totalRounds, 3);
    assert.strictEqual(room.phase, 'shopping');
    assert.strictEqual(room.currentRound, 1, 'round only advances once the shop clears');
  });

  it('starts the next round only after every connected player leaves the shop', () => {
    const { rm, room } = threePlayerRoom({ rounds: 3 });
    endRound(rm, room);

    const seedBefore = room.seed;

    const first = rm.shopDone('conn_1');
    assert.strictEqual(first.broadcasts.length, 0, 'one player ready is not enough');
    assert.strictEqual(room.phase, 'shopping');

    const second = rm.shopDone('conn_2');
    assert.strictEqual(second.broadcasts.length, 0, 'two of three is still not enough');
    assert.strictEqual(room.phase, 'shopping');

    const third = rm.shopDone('conn_3');
    assert.strictEqual(room.phase, 'playing', 'the last player in starts the round');
    assert.strictEqual(room.currentRound, 2);

    const starts = third.broadcasts.filter(b => b.msg.type === 'ROUND_START');
    assert.strictEqual(starts.length, 3, 'one tailored ROUND_START per connected player');
    assert.strictEqual(starts[0].msg.round, 2);
    assert.strictEqual(starts[0].msg.totalRounds, 3);

    // Every client must be handed the same world.
    const seeds = new Set(starts.map(b => b.msg.seed));
    const winds = new Set(starts.map(b => b.msg.wind));
    assert.strictEqual(seeds.size, 1, 'all clients get one seed');
    assert.strictEqual(winds.size, 1, 'all clients get one wind');
    assert.notStrictEqual(room.seed, seedBefore, 'a new round means a new world');

    // The rotated cursor has to ship or clients drive the wrong tank.
    const turnSync = third.broadcasts.find(b => b.msg.type === 'TURN_SYNC');
    assert.ok(turnSync, 'ROUND_START must be accompanied by the live cursor');
    assert.strictEqual(turnSync.msg.activeSlot, room.activeSlot);
  });

  it('revives eliminated players for the new round', () => {
    const { rm, room } = threePlayerRoom({ rounds: 2 });
    endRound(rm, room);

    assert.strictEqual(room.players.get(1).alive, false);
    assert.strictEqual(room.players.get(2).alive, false);

    rm.shopDone('conn_1');
    rm.shopDone('conn_2');
    rm.shopDone('conn_3');

    for (const p of room.players.values()) {
      assert.strictEqual(p.alive, true, `slot ${p.slot} should be back in play`);
    }
  });

  it('rotates which slot opens each round', () => {
    const { rm, room } = threePlayerRoom({ rounds: 3 });
    assert.strictEqual(room.activeSlot, 0, 'round 1 opens on the first slot');

    endRound(rm, room);
    rm.shopDone('conn_1'); rm.shopDone('conn_2'); rm.shopDone('conn_3');
    assert.strictEqual(room.activeSlot, 1, 'round 2 opens on the next slot');

    endRound(rm, room, 1);
    rm.shopDone('conn_1'); rm.shopDone('conn_2'); rm.shopDone('conn_3');
    assert.strictEqual(room.activeSlot, 2, 'round 3 opens on the slot after that');
  });

  it('tracks rounds won and ends the match on the final round', () => {
    const { rm, room } = threePlayerRoom({ rounds: 2 });

    const end1 = endRound(rm, room, 0);
    assert.strictEqual(end1.msg.scores.find(s => s.slot === 0).roundsWon, 1);
    assert.strictEqual(end1.msg.matchOver, false);

    rm.shopDone('conn_1'); rm.shopDone('conn_2'); rm.shopDone('conn_3');

    const end2 = endRound(rm, room, 1);
    assert.strictEqual(end2.msg.matchOver, true, 'round 2 of 2 ends the match');
    assert.strictEqual(room.phase, 'ended');

    const scores = end2.msg.scores;
    assert.strictEqual(scores.length, 3);
    // Slot 0 and slot 1 have one round each; ties break on slot order.
    assert.strictEqual(scores.find(s => s.slot === 0).roundsWon, 1);
    assert.strictEqual(scores.find(s => s.slot === 1).roundsWon, 1);
    assert.strictEqual(scores.find(s => s.slot === 2).roundsWon, 0);
    assert.ok(scores[0].roundsWon >= scores[scores.length - 1].roundsWon, 'sorted by rounds won');
  });

  it('clamps a hostile round count instead of trusting it', () => {
    const a = threePlayerRoom({ rounds: 9999 });
    assert.strictEqual(a.room.totalRounds, 20);

    const b = threePlayerRoom({ rounds: -5 });
    assert.strictEqual(b.room.totalRounds, 1);

    const c = threePlayerRoom({ rounds: 'lots' });
    assert.strictEqual(c.room.totalRounds, 5, 'a non-numeric round count falls back to the default');
  });

  it('does not let a player who drops in the shop stall the match', () => {
    const { rm, room } = threePlayerRoom({ rounds: 3 });
    endRound(rm, room);

    rm.shopDone('conn_1');
    rm.shopDone('conn_2');
    assert.strictEqual(room.phase, 'shopping', 'still waiting on conn_3');

    // conn_3 never comes back out of the shop — it drops instead.
    rm.disconnect('conn_3');

    assert.strictEqual(room.phase, 'playing', 'the remaining players proceed');
    assert.strictEqual(room.currentRound, 2);
  });

  it('refuses SHOP_DONE outside the shop intermission', () => {
    const { rm } = threePlayerRoom({ rounds: 3 });
    assert.throws(() => rm.shopDone('conn_1'), /BAD_MESSAGE/);
  });

  it('lets a player rejoin during the shop intermission', () => {
    const { rm, room } = threePlayerRoom({ rounds: 3 });
    const token = room.players.get(2).playerToken;
    endRound(rm, room);

    rm.disconnect('conn_3');
    assert.strictEqual(room.phase, 'shopping', 'two players are still shopping');

    assert.doesNotThrow(() => {
      rm.rejoin('conn_3b', { code: room.code, playerToken: token });
    });
    assert.strictEqual(room.players.get(2).connected, true);
  });

  it('stamps an abandoned shopping room so the sweep can reap it', () => {
    const { rm, room } = threePlayerRoom({ rounds: 3 });
    endRound(rm, room);

    rm.disconnect('conn_1');
    rm.disconnect('conn_2');
    rm.disconnect('conn_3');

    assert.ok(room.pausedAt !== undefined, 'an abandoned room needs a timestamp to be swept');

    const { swept } = rm.sweep(room.pausedAt + RoomManager.STALE_PAUSED_MS + 1);
    assert.ok(swept.includes(room.code), 'a stale abandoned shopping room should be swept');
  });
});
