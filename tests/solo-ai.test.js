const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
const code = scriptMatch[1];

function evaluateIndexHtml() {
  const context = {
    globalThis: {},
    Math,
    Float32Array,
    console,
    setTimeout,
    clearTimeout,
    Terrain: require('../lib/terrain.js'),
    document: {
      getElementById: () => null,
      addEventListener: () => {}
    },
    window: {
      addEventListener: () => {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.globalThis.SCORCHED;
}

/**
 * An all-AI headless match. Headless mode fires the active AI on every physics
 * step (index.html stepPhysics), so the match drives itself to completion with
 * no input, which is exactly what makes it a usable regression harness.
 */
function runSoloMatch({ seed = 4242, rounds = 1, types = ['Shooter', 'Cyborg'], maxTicks = 200000 } = {}) {
  const SCORCHED = evaluateIndexHtml();
  const game = new SCORCHED.Game({ headless: true, seed });

  const colours = ['#ff00ff', '#00ffff', '#ff2222', '#22ff22', '#ffff00'];
  game.start({
    rounds,
    startingCash: 10000,
    wallType: 'off',
    weaponsAvailability: 'all',
    seed,
    players: types.map((type, i) => ({
      name: 'CPU ' + (i + 1),
      color: colours[i % colours.length],
      type,
      slot: i
    }))
  });

  const CONST = SCORCHED.CONST;
  let ticks = 0;
  // Stop on the final round ending; earlier rounds roll over inside handleRoundEnd.
  while (ticks < maxTicks) {
    game.update(CONST.TICK);
    ticks += 1;
    if (game.roundOver && game.currentRound >= rounds) break;
  }

  return { game, ticks, SCORCHED };
}

describe('Solo play against AI opponents', () => {
  it('runs an all-AI round to a decisive finish', () => {
    const { game, ticks } = runSoloMatch({ types: ['Shooter', 'Cyborg'] });

    assert.ok(game.roundOver, 'round should have ended');
    assert.ok(ticks < 200000, 'round should end well inside the tick cap');

    const alive = game.roster.filter(t => t.hp > 0);
    assert.strictEqual(alive.length, 1, 'exactly one tank should survive the round');
  });

  it('drives every AI profile without stalling', () => {
    for (const profile of ['Moron', 'Shooter', 'Poolshark', 'Cyborg']) {
      // Pair each profile against a Shooter so the round can actually resolve.
      const { game } = runSoloMatch({ types: [profile, 'Shooter'], seed: 999 });
      assert.ok(
        game.roundOver,
        `${profile} should reach a round end rather than stalling on its turn`
      );
    }
  });

  it('AI aim is fully deterministic from the shared seed', () => {
    // Two independent evaluations of the page, same seed, must agree exactly.
    // AI jitter is drawn from gameplayRNG; any Math.random creeping into a
    // profile shows up here as a divergence.
    const a = runSoloMatch({ types: ['Moron', 'Cyborg', 'Poolshark'], seed: 31337 });
    const b = runSoloMatch({ types: ['Moron', 'Cyborg', 'Poolshark'], seed: 31337 });

    assert.strictEqual(a.ticks, b.ticks, 'identical seeds must take identical tick counts');

    const fingerprint = (g) => g.roster.map(t => [
      t.name, t.hp, t.angle, t.power, t.cash, t.cumulativeDamage || 0
    ].join(':')).join('|');

    assert.strictEqual(fingerprint(a.game), fingerprint(b.game),
      'identical seeds must produce an identical final roster state');
  });

  it('carries the economy across a multi-round match', () => {
    const rounds = 3;
    const { game } = runSoloMatch({ types: ['Cyborg', 'Shooter'], rounds, seed: 777 });

    assert.strictEqual(game.currentRound, rounds, 'should reach the final round');

    // Payouts land on every round end, so cash must have moved off the start value.
    const movedCash = game.roster.some(t => t.cash !== 10000);
    assert.ok(movedCash, 'round payouts should have changed at least one balance');

    // Cyborg buys the best affordable weapon each intermission, so someone must
    // be holding more than the free Baby Missile by the final round.
    const boughtSomething = game.roster.some(t => Object.keys(t.inventory).length > 1);
    assert.ok(boughtSomething, 'AI purchasing should have added inventory between rounds');
  });

  it('accumulates damage and kill statistics for the match summary', () => {
    const { game } = runSoloMatch({ types: ['Cyborg', 'Shooter'], rounds: 2, seed: 555 });

    const totalKills = game.roster.reduce((sum, t) => sum + (t.cumulativeKills || 0), 0);
    const totalDamage = game.roster.reduce((sum, t) => sum + (t.cumulativeDamage || 0), 0);

    assert.ok(totalKills >= 1, 'a finished round implies at least one elimination');
    assert.ok(totalDamage > 0, 'damage dealt should be accumulated for standings');
  });
});
