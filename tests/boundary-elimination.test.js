// The server has to hear about deaths it did not cause.
//
// RESOLVE_SHOT.eliminated was the ONLY channel by which the server learned a
// tank had died, and it fires when a shell resolves. The structures pass kills
// outside that window entirely: applyStructureTurnEffects() runs at a turn
// boundary, and a missile silo coming off cooldown can put a scorpion bolt into
// a tank on 25hp with no shot in the air at all.
//
// Unreported, the server keeps a corpse on the board. Two ways that wedges the
// room, both permanent and both with every player still connected (so sweep()
// never reaps it either):
//
//   - the corpse holds the turn. The server hands it the cursor; its own client
//     refuses input on hp <= 0, and everyone else's refuses because it is not
//     their turn. Nobody can do anything, ever.
//   - the alive-count never falls to one, so nextTurn() never declares the
//     round over. Every client has locally reached "round over" and is waiting
//     on a ROUND_END the server will not send.
//
// The active client now restates the full set of slots its simulation shows
// dead at every boundary. See lib/room-manager.js reportEliminated().

const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');

const RoomManager = require('../lib/room-manager.js');
const { validate } = require('../lib/protocol.js');
const { newGame, loadScorched } = require('./helpers/headless-game.js');

function room(playerCount) {
  const rm = new RoomManager();
  rm.createRoom('conn_1');
  const r = rm.getRoomByConnection('conn_1');
  for (let i = 2; i <= playerCount; i++) rm.join(`conn_${i}`, r.code);
  rm.start('conn_1', { rounds: 3 });
  return { rm, room: r };
}

const connOf = (r, slot) => r.players.get(slot).connectionId;
const activeConn = (r) => connOf(r, r.activeSlot);
const msgsOf = (res) => res.broadcasts.map(b => b.msg.type);

describe('A turret kill at a turn boundary reaches the server', () => {
  it('ends the round when the boundary leaves one tank standing', () => {
    const { rm, room: r } = room(2);
    const turn = r.turnNumber;

    // The active player's own client saw the holding kill the other tank.
    const res = rm.reportEliminated(activeConn(r), {
      turnNumber: turn,
      slots: [1]
    });

    const end = res.broadcasts.find(b => b.msg.type === 'ROUND_END');
    assert.ok(end, 'the round must end rather than waiting for a shot that will never come');
    assert.strictEqual(end.msg.winnerSlot, 0);
    assert.strictEqual(r.phase, 'shopping');
  });

  it('advances the cursor when the boundary killed the tank holding the turn', () => {
    const { rm, room: r } = room(3);
    const victim = r.activeSlot;
    const turn = r.turnNumber;

    // The victim IS the active player: the structures pass runs before the
    // cursor is read, so a boundary can kill exactly the tank it just handed
    // the turn to. Its client is entitled to report, and must be — nobody else
    // can move until it does.
    const res = rm.reportEliminated(connOf(r, victim), {
      turnNumber: turn,
      slots: [victim]
    });

    const sync = res.broadcasts.find(b => b.msg.type === 'TURN_SYNC');
    assert.ok(sync, 'the turn must move off the corpse');
    assert.notStrictEqual(sync.msg.activeSlot, victim);
    assert.strictEqual(r.players.get(victim).alive, false);
    assert.ok(sync.msg.turnNumber > turn);
  });

  it('records a bystander death without burning a turn', () => {
    const { rm, room: r } = room(3);
    const turn = r.turnNumber;
    const activeSlot = r.activeSlot;
    const bystander = Array.from(r.players.keys()).find(s => s !== activeSlot);

    const res = rm.reportEliminated(activeConn(r), {
      turnNumber: turn,
      slots: [bystander]
    });

    assert.strictEqual(r.players.get(bystander).alive, false, 'the death is recorded');
    assert.deepStrictEqual(msgsOf(res), [],
      'but the cursor is still valid, and re-broadcasting it would burn a ' +
      'turnNumber every client then dedupes away');
    assert.strictEqual(r.turnNumber, turn);
    assert.strictEqual(r.activeSlot, activeSlot);
  });

  it('is idempotent, so restating the same dead set costs nothing', () => {
    const { rm, room: r } = room(3);
    const turn = r.turnNumber;
    const bystander = Array.from(r.players.keys()).find(s => s !== r.activeSlot);

    rm.reportEliminated(activeConn(r), { turnNumber: turn, slots: [bystander] });
    const again = rm.reportEliminated(activeConn(r), { turnNumber: turn, slots: [bystander] });

    assert.deepStrictEqual(msgsOf(again), []);
    assert.strictEqual(r.turnNumber, turn);
  });

  it('heals a report lost to a disconnect, because the set is restated in full', () => {
    const { rm, room: r } = room(3);
    const slots = Array.from(r.players.keys());
    const firstVictim = slots.find(s => s !== r.activeSlot);

    // Boundary A killed a bystander on every client, but the report never
    // reached the server — so it still has that slot down as alive.
    assert.strictEqual(r.players.get(firstVictim).alive, true);

    // Boundary B kills a second tank. The client restates BOTH, not just the
    // new one, so the dropped report repairs itself here. A delta-only report
    // would leave the first corpse standing forever and the round unendable.
    const secondVictim = slots.find(s => s !== r.activeSlot && s !== firstVictim);
    const res = rm.reportEliminated(activeConn(r), {
      turnNumber: r.turnNumber,
      slots: [firstVictim, secondVictim]
    });

    assert.strictEqual(r.players.get(firstVictim).alive, false);
    assert.strictEqual(r.players.get(secondVictim).alive, false);
    const end = res.broadcasts.find(b => b.msg.type === 'ROUND_END');
    assert.ok(end, 'with both dead the round is over');
  });

  it('skips slots that are unknown or already dead, in silence', () => {
    const { rm, room: r } = room(3);
    const res = rm.reportEliminated(activeConn(r), {
      turnNumber: r.turnNumber,
      slots: [3]      // seated by nobody
    });
    assert.deepStrictEqual(msgsOf(res), []);
    assert.strictEqual(r.phase, 'playing');
  });
});

describe('Who may report a boundary death', () => {
  it('ignores a report from a player who does not hold the turn', () => {
    const { rm, room: r } = room(3);
    const bystander = Array.from(r.players.keys()).find(s => s !== r.activeSlot);
    const target = Array.from(r.players.keys()).find(s => s !== bystander);

    const res = rm.reportEliminated(connOf(r, bystander), {
      turnNumber: r.turnNumber,
      slots: [target]
    });

    // Same authority as resolveShot. Every client simulates the same boundary
    // and could report it, but letting all of them declare any slot dead at any
    // moment is a strictly wider trust boundary than this codebase accepts —
    // and buys nothing, since the cursor always names a connected client.
    assert.deepStrictEqual(msgsOf(res), []);
    assert.strictEqual(r.players.get(target).alive, true);
  });

  it('ignores a report stamped with a turn the room has already left', () => {
    const { rm, room: r } = room(3);
    const victim = Array.from(r.players.keys()).find(s => s !== r.activeSlot);

    const res = rm.reportEliminated(activeConn(r), {
      turnNumber: (r.turnNumber || 1) + 7,
      slots: [victim]
    });

    assert.strictEqual(r.players.get(victim).alive, true,
      'a frame about a world that has moved on is not applied');
    assert.deepStrictEqual(msgsOf(res), []);
  });

  it('ignores a report while a shell is still in the air', () => {
    const { rm, room: r } = room(3);
    const shooter = activeConn(r);
    rm.fire(shooter, { angle: 45, power: 500 });
    assert.strictEqual(r.awaitingResolution, true);

    const victim = Array.from(r.players.keys()).find(s => s !== r.activeSlot);
    const res = rm.reportEliminated(shooter, {
      turnNumber: r.turnNumber,
      slots: [victim]
    });

    // Mid-flight kills belong to RESOLVE_SHOT, which reports its own. Accepting
    // here would advance the turn out from under a projectile every client is
    // still integrating.
    assert.strictEqual(r.players.get(victim).alive, true);
    assert.deepStrictEqual(msgsOf(res), []);
  });

  it('ignores a report outside the playing phase', () => {
    const { rm, room: r } = room(3);
    r.phase = 'shopping';
    const victim = Array.from(r.players.keys()).find(s => s !== r.activeSlot);

    const res = rm.reportEliminated(activeConn(r), {
      turnNumber: r.turnNumber,
      slots: [victim]
    });

    assert.strictEqual(r.players.get(victim).alive, true);
    assert.deepStrictEqual(msgsOf(res), []);
  });

  it('rejects a malformed frame at the protocol boundary', () => {
    assert.strictEqual(validate({ type: 'ELIMINATED', turnNumber: 3, slots: [0, 1] }).ok, true);
    assert.strictEqual(validate({ type: 'ELIMINATED', turnNumber: 3, slots: [] }).ok, true);

    assert.strictEqual(validate({ type: 'ELIMINATED', slots: [0] }).ok, false,
      'the turn being described is required, not optional');
    assert.strictEqual(validate({ type: 'ELIMINATED', turnNumber: 3 }).ok, false);
    assert.strictEqual(validate({ type: 'ELIMINATED', turnNumber: 3, slots: [0, 0] }).ok, false,
      'duplicates');
    assert.strictEqual(validate({ type: 'ELIMINATED', turnNumber: 3, slots: [99] }).ok, false,
      'out of range');
    assert.strictEqual(validate({ type: 'ELIMINATED', turnNumber: 3, slots: [1.5] }).ok, false);
  });
});

describe('The client reports the boundary it just simulated', () => {
  // A headless Game wired to a recording socket, standing in for one browser.
  function onlineClient() {
    const { game } = newGame({ seed: 909 });
    const sent = [];
    game.mode = 'online';
    game.net = { send: (type, fields) => sent.push({ type, fields }) };
    game.roster[0].slot = 0;
    game.roster[1].slot = 1;
    game.mySlot = 0;
    game.activePlayerIdx = 0;
    game.turnNumber = 4;
    return { game, sent };
  }

  it('sends every slot it shows dead, from the client holding the turn', () => {
    const { game, sent } = onlineClient();
    game.roster[1].hp = 0;

    game.reportBoundaryEliminations();

    const frame = sent.find(s => s.type === 'ELIMINATED');
    assert.ok(frame, 'the active client must speak, or the room wedges');
    assert.deepStrictEqual([...frame.fields.slots], [1]);
    assert.strictEqual(frame.fields.turnNumber, 4);
  });

  it('reports its own death too — the corpse holding the turn is the wedge', () => {
    const { game, sent } = onlineClient();
    game.roster[0].hp = 0;

    game.reportBoundaryEliminations();

    const frame = sent.find(s => s.type === 'ELIMINATED');
    assert.ok(frame, 'a client that cannot act is exactly the one that must report');
    assert.deepStrictEqual([...frame.fields.slots], [0]);
  });

  it('says nothing when the boundary killed nobody', () => {
    const { game, sent } = onlineClient();
    game.reportBoundaryEliminations();
    assert.strictEqual(sent.length, 0);
  });

  it('stays quiet on a client that does not hold the turn', () => {
    const { game, sent } = onlineClient();
    game.mySlot = 1;              // the cursor is on slot 0
    game.roster[1].hp = 0;

    game.reportBoundaryEliminations();
    assert.strictEqual(sent.length, 0);
  });

  it('stays quiet while spectating, where the casualty list is fiction', () => {
    const { game, sent } = onlineClient();
    game.spectating = true;
    game.roster[1].hp = 0;

    // A rejoiner rebuilt this round from the seed alone: its tanks are at
    // round-start hp on uncratered terrain, so who it thinks is dead has
    // nothing to do with the room.
    game.reportBoundaryEliminations();
    assert.strictEqual(sent.length, 0);
  });

  it('stays quiet in local play, which has no server to tell', () => {
    const { game, sent } = onlineClient();
    game.mode = 'local';
    game.roster[1].hp = 0;

    game.reportBoundaryEliminations();
    assert.strictEqual(sent.length, 0);
  });

  it('fires from the turn boundary itself, not only when called directly', () => {
    const { game, sent } = onlineClient();
    game.roster[1].hp = 0;

    // commitTurnSync is the boundary. Reporting has to be part of it, or the
    // kill it just inflicted goes unmentioned.
    game.commitTurnSync({ activeSlot: 0, turnNumber: 5 });

    const frame = sent.find(s => s.type === 'ELIMINATED');
    assert.ok(frame, 'the boundary must report what it killed');
    assert.strictEqual(frame.fields.turnNumber, 5,
      'stamped with the boundary being reported, not the one before it');
  });

  it('is not queued when the socket is down, because it would only arrive stale', () => {
    const SCORCHED = loadScorched();
    const net = new SCORCHED.NetClient();
    net.socket = null;

    net.send('ELIMINATED', { turnNumber: 2, slots: [1] });
    net.send('SET_PROFILE', { name: 'x', colour: '#fff' });

    const queued = (net.pendingSends || []).map(p => p.type);
    assert.ok(!queued.includes('ELIMINATED'),
      'a queued report describes a turn the room has left; the next boundary restates it anyway');
    assert.ok(queued.includes('SET_PROFILE'), 'lobby intent is still queued');
  });
});
