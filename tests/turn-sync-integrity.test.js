// The turn boundary is a mutation, not a notification.
//
// applyTurnSync() does not merely move a cursor: it drifts the airships, heals
// from repair bays, tops up dome shields, ticks every turret cooldown and lets a
// ready turret fire a live volley that carves terrain and damages hulls. That
// makes WHEN and HOW OFTEN it runs part of the simulation, and lockstep only
// holds if every client runs it exactly once per server turn, at the same point
// relative to the shell that ended the previous one.
//
// Two ways that broke, both silent and both permanent:
//   - the server restates the cursor on rejoin, so one client applied the same
//     boundary twice while everyone else applied it once;
//   - the server advances the turn the moment the SHOOTER settles, so a client
//     running behind applied the boundary while the shell was still in the air —
//     detonating the turret volley BEFORE the impact locally and AFTER it
//     remotely, then flying the shell over differently-shaped ground.
//
// tests/structures-lockstep.test.js drives two real clients, but it steps them
// synchronously and waits for the turn to settle before comparing, so neither
// ordering lives inside what it can observe. These are the unit-level guards.

const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');

const S = require('../lib/structures.js');
const { newGame } = require('./helpers/headless-game.js');
const { structuresOf } = require('./helpers/browser-harness.js');

// A structure that ticks a cooldown every turn pass is the cleanest witness
// available: the value moves on every boundary, is invisible in hp and position,
// and is exactly what a duplicated or skipped pass corrupts.
//
// Armed high enough that the turret only counts down and never actually fires,
// so these tests observe the boundary itself rather than a volley's blast.
function armTurret(game, cooldown) {
  const turret = game.structures.find(s => {
    const spec = S.STRUCTURES[s.key];
    return spec && spec.turret;
  });
  assert.ok(turret, 'the aethercastle template must field a turret to test with');
  turret.cooldown = cooldown;
  return turret;
}

function syncMsg(game, turnNumber) {
  return { activeSlot: game.roster[0].slot, turnNumber };
}

describe('Turn boundary is applied exactly once per server turn', () => {
  it('ignores a repeated TURN_SYNC carrying a turnNumber it already applied', () => {
    const { game } = newGame({ seed: 4242 });
    const turret = armTurret(game, 3);

    game.applyTurnSync(syncMsg(game, 5));
    assert.strictEqual(turret.cooldown, 2, 'the first boundary must tick the cooldown');

    // The duplicate the rejoin path used to produce: same boundary, delivered
    // twice, to one client only.
    game.applyTurnSync(syncMsg(game, 5));
    assert.strictEqual(turret.cooldown, 2, 'a repeated turnNumber must not tick it again');

    game.applyTurnSync(syncMsg(game, 6));
    assert.strictEqual(turret.cooldown, 1, 'a genuinely new boundary must still apply');
  });

  it('does not swallow the first boundary of a new round, which restarts at 1', () => {
    // The server resets room.turnNumber to 1 at every round start. A client that
    // remembered last round's counter would either mistake this round's opening
    // TURN_SYNC for a duplicate or, worse, accept a stale one.
    const { game } = newGame({ seed: 4242 });
    const turret = armTurret(game, 3);

    game.applyTurnSync(syncMsg(game, 1));
    assert.strictEqual(turret.cooldown, 2);

    game.applyServerRoundStart({ seed: 777, wind: 0, round: 2, totalRounds: 5 });
    assert.strictEqual(game.turnNumber, null, 'a new round must forget the old counter');

    const fresh = armTurret(game, 3);
    game.applyTurnSync(syncMsg(game, 1));
    assert.strictEqual(fresh.cooldown, 2, 'round 2 turn 1 is not round 1 turn 1');
  });
});

describe('Turn boundary waits for the world to come to rest', () => {
  it('holds a TURN_SYNC that lands while a shell is still in the air', () => {
    const { game } = newGame({ seed: 4242 });
    const turret = armTurret(game, 3);

    // A client running behind — a backgrounded tab loses simulation time to the
    // frame loop's dt clamp — is still integrating the shell when the server,
    // which advanced the turn the instant the shooter settled, says the turn is
    // over.
    game.projectile = {
      x: 200, y: 100, vx: 10, vy: -10,
      weapon: 'Baby Missile', shooterIdx: 0
    };

    game.applyTurnSync(syncMsg(game, 9));
    assert.strictEqual(turret.cooldown, 3, 'the boundary must not run under a live shell');
    assert.strictEqual(game.turnNumber, null, 'and must not be recorded as applied');
    assert.strictEqual(game.pendingTurnSyncs.length, 1, 'it is held, not dropped');
  });

  it('applies the held boundary from the physics step once the shell has resolved', () => {
    const { SCORCHED, game } = newGame({ seed: 4242 });
    const turret = armTurret(game, 3);

    game.projectile = {
      x: 200, y: 100, vx: 10, vy: -10,
      weapon: 'Baby Missile', shooterIdx: 0
    };
    game.applyTurnSync(syncMsg(game, 9));
    assert.strictEqual(turret.cooldown, 3);

    // The shell lands.
    game.projectile = null;
    game.stepPhysics(SCORCHED.CONST.TICK);

    assert.strictEqual(turret.cooldown, 2, 'the held boundary must run after the impact');
    assert.strictEqual(game.turnNumber, 9);
    assert.strictEqual(game.pendingTurnSyncs.length, 0, 'and must not run a second time');

    game.stepPhysics(SCORCHED.CONST.TICK);
    assert.strictEqual(turret.cooldown, 2, 'a flushed boundary is spent');
  });

  it('queues back-to-back boundaries instead of overwriting the held one', () => {
    const { SCORCHED, game } = newGame({ seed: 4242 });
    const turret = armTurret(game, 5);

    game.projectile = {
      x: 200, y: 100, vx: 10, vy: -10,
      weapon: 'Baby Missile', shooterIdx: 0
    };

    // Two TURN_SYNCs land with no shot between them. That is not a rarity any
    // more: a boundary volley kills the active player, that client reports the
    // ELIMINATED, and the server advances the cursor again immediately. A client
    // at rest simply commits both — but a client holding one because a shell is
    // still in the air used to keep exactly ONE, so the second evicted the
    // first. The dropped boundary's drift, repair-bay heals, turret cooldowns
    // and live volley then never run here and did run everywhere else.
    game.applyTurnSync(syncMsg(game, 9));
    game.applyTurnSync(syncMsg(game, 10));

    assert.strictEqual(turret.cooldown, 5, 'neither runs under a live shell');
    assert.strictEqual(game.pendingTurnSyncs.length, 2,
      'the second must not evict the first');

    // The shell lands.
    game.projectile = null;
    game.stepPhysics(SCORCHED.CONST.TICK);

    assert.strictEqual(turret.cooldown, 3, 'BOTH boundaries run, in arrival order');
    assert.strictEqual(game.turnNumber, 10);
    assert.strictEqual(game.pendingTurnSyncs.length, 0, 'and the queue drains');
  });

  it('holds it exactly once even if the server restates it mid-flight', () => {
    const { SCORCHED, game } = newGame({ seed: 4242 });
    const turret = armTurret(game, 3);

    game.projectile = {
      x: 200, y: 100, vx: 10, vy: -10,
      weapon: 'Baby Missile', shooterIdx: 0
    };
    game.applyTurnSync(syncMsg(game, 9));
    game.applyTurnSync(syncMsg(game, 9));

    game.projectile = null;
    game.stepPhysics(SCORCHED.CONST.TICK);
    assert.strictEqual(turret.cooldown, 2, 'two deliveries of one boundary are still one boundary');
  });
});

describe('The cross-client structure hash sees latent drift', () => {
  // Finding 5: comparing only the visible fields let the exact divergence a
  // duplicated turn boundary produces pass unnoticed. Neither of these fields
  // shows up in hp or position on the turn it drifts — both decide what happens
  // on a later one.
  it('catches a turret cooldown that drifted on one client', () => {
    const a = newGame({ seed: 4242 }).game;
    const b = newGame({ seed: 4242 }).game;
    assert.strictEqual(structuresOf(a), structuresOf(b), 'same seed, same holding');

    const turret = armTurret(a, 2);
    armTurret(b, 3);
    assert.notStrictEqual(
      structuresOf(a), structuresOf(b),
      'a cooldown one turn out of step fires a volley on one client only'
    );
    assert.ok(turret);
  });

  it('catches a vat that is breached on one client and still armed on the other', () => {
    const a = newGame({ seed: 4242 }).game;
    const b = newGame({ seed: 4242 }).game;

    const vatA = a.structures.find(s => s.key === 'oil-vats');
    assert.ok(vatA, 'the template must field oil vats');
    vatA.breached = true;

    assert.notStrictEqual(
      structuresOf(a), structuresOf(b),
      'a spent breach on one client and a live one on the other is a desync'
    );
  });
});
