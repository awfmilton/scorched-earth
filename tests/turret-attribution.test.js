// "When I hit one enemy, BOTH enemies receive damage even though they're not
// close to each other."
//
// Reported twice, and the first diagnosis was wrong. It is not a splash or
// falloff bug: a direct hit damages only what it hits, no two roster entries
// share state, and explosion() gates every tank on dist < radius.
//
// The real mechanism is the turn boundary that fires immediately after the
// shot resolves. Every standing structure turret independently picks its own
// nearestEnemyTank(), so in a three-tank solo match the player's turret takes
// AI-1 while AI-1's turret takes AI-2 -- two enemies hundreds of pixels apart,
// damaged in the same instant, one beat after the player's shell landed.
//
// The behaviour is intended; being unable to TELL is not. These tests pin the
// attribution cues, because without them the player reads a turret volley as
// their own shell hitting two targets.

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { loadKitInto } = require('./helpers/gfx-kit.js');

const REPO = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)[1];

function loadScorched() {
  const context = {
    globalThis: {}, Math, Float32Array, console, JSON, setTimeout, clearTimeout,
    Terrain: require(path.join(REPO, 'lib/terrain.js')),
    Structures: require(path.join(REPO, 'lib/structures.js')),
    document: { getElementById: () => null, addEventListener: () => {} },
    window: { addEventListener: () => {}, devicePixelRatio: 1 }
  };
  context.globalThis = context;
  vm.createContext(context);
  loadKitInto(context);
  vm.runInContext(CODE, context);
  return context.globalThis.SCORCHED;
}

// A solo Aethercastle match: one human plus two AI, spread right across the
// map so nothing can be explained away as "they were standing close".
function soloMatch(seed) {
  const S = loadScorched();
  const game = new S.Game({ headless: true, seed: seed || 12345, gameMode: 'aethercastle' });
  game.start({
    rounds: 1, wallType: 'rubber', startingCash: 20000,
    players: [
      { name: 'ME', color: '#f00', type: 'Human', chassis: 'clockwork-tank' },
      { name: 'AI-1', color: '#0f0', type: 'Shooter', chassis: 'clockwork-tank' },
      { name: 'AI-2', color: '#00f', type: 'Shooter', chassis: 'clockwork-tank' }
    ]
  });
  game.roster[0].x = 150;
  game.roster[1].x = 600;
  game.roster[2].x = 1050;
  game.terrain.settle();
  game.snapTanksToTerrain();
  game.roster.forEach(t => { t.hp = 100; t.damageCarry = 0; });
  // Turn the visual layer on, as the browser has it.
  game.headless = false;
  game.damageNumbers = [];
  game.turretBolts = [];
  return { S, game };
}

// Which tanks had a floating number appear over them?
function tanksWithNumbers(game) {
  return [...new Set(game.damageNumbers.map(d => {
    let best = null, bd = Infinity;
    game.roster.forEach(t => {
      const dd = Math.abs(t.x - d.x);
      if (dd < bd) { bd = dd; best = t.name; }
    });
    return best;
  }))];
}

describe('a shell only ever damages what it hits', () => {
  it('a direct hit on one enemy leaves the other untouched', () => {
    const { game } = soloMatch();
    const before = game.roster.map(t => t.hp);
    game.onImpact(game.roster[1].x, game.roster[1].y - 3, 'Baby Missile', 0);
    const after = game.roster.map(t => t.hp);

    assert.ok(before[1] - after[1] > 0, 'the target must actually be hit');
    assert.strictEqual(after[0], before[0], 'the shooter must be untouched at 450px');
    assert.strictEqual(after[2], before[2], 'the far enemy must be untouched at 450px');
  });

  it('no two tanks share mutable state', () => {
    const { game } = soloMatch();
    const r = game.roster;
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        assert.notStrictEqual(r[i], r[j], `roster[${i}] and roster[${j}] are the same object`);
        for (const k of ['inventory', 'shield', 'stats']) {
          if (r[i][k] && typeof r[i][k] === 'object') {
            assert.notStrictEqual(r[i][k], r[j][k], `roster[${i}].${k} is shared with roster[${j}]`);
          }
        }
      }
    }
  });
});

describe('a holding only answers on its owner\'s turn', () => {
  // THE BUG. The turret loop had no owner gate, so every turret on the map
  // fired at every boundary -- the player's scorpion at AI-1 and AI-1's
  // scorpion at AI-2, in the same physics tick the player's shell landed.
  // lib/structures.js:85 has always specified otherwise: "Fires on its own at
  // the end of the owner's turn, nearest enemy first."
  it('a boundary fires ONLY the turrets of the player whose turn just ended', () => {
    const { S, game } = soloMatch();
    const owners = [];
    const realExplosion = game.explosion.bind(game);
    // Every turret volley is an explosion carrying fromStructure.
    game.explosion = (x, y, r, d, shooterIdx, opts) => {
      if (opts && opts.fromStructure) owners.push(shooterIdx);
      return realExplosion(x, y, r, d, shooterIdx, opts);
    };

    for (let turn = 0; turn < 8; turn++) {
      owners.length = 0;
      const endingPlayer = game.activePlayerIdx;
      game.nextTurn();
      for (const o of owners) {
        assert.strictEqual(o, endingPlayer,
          `a turret owned by player ${o} fired on player ${endingPlayer}'s boundary`);
      }
    }
  });

  it('one shot no longer leaves two far-apart enemies bleeding', () => {
    // The user's exact report, as a regression test. Shields off, so any
    // turret damage lands on hp where it is unmissable.
    const { game } = soloMatch();
    game.roster.forEach(t => { t.shield = null; });
    game.activePlayerIdx = 0;

    const before = game.roster.map(t => t.hp);
    game.onImpact(game.roster[1].x, game.roster[1].y - 3, 'Baby Missile', 0);
    game.nextTurn();   // the boundary that closes the human's shot
    const after = game.roster.map(t => t.hp);

    assert.ok(before[1] - after[1] > 0, 'the tank actually shot must be damaged');
    assert.strictEqual(after[2], before[2],
      'the OTHER enemy, 450px away, must not lose hp from the human\'s boundary');
  });
});

describe('a turret volley is visually distinct from a shell hit', () => {
  it('turret damage does not use the shell damage colour', () => {
    const { S, game } = soloMatch();
    const theme = S.THEMES.aethercastle;

    // The player's shell.
    game.damageNumbers.length = 0;
    game.onImpact(game.roster[1].x, game.roster[1].y - 3, 'Baby Missile', 0);
    const shellColours = [...new Set(game.damageNumbers.map(d => d.color))];
    assert.ok(shellColours.length > 0, 'the shell must produce a number');

    // A turret volley at a boundary.
    let turretColours = [];
    for (let turn = 0; turn < 6 && turretColours.length === 0; turn++) {
      game.damageNumbers.length = 0;
      game.nextTurn();
      if (game.damageNumbers.length) {
        turretColours = [...new Set(game.damageNumbers.map(d => d.color))];
      }
    }
    assert.ok(turretColours.length > 0, 'expected a turret volley within six boundaries');

    assert.ok(
      turretColours.every(c => c === theme.turretDamage),
      `turret numbers must use turretDamage (${theme.turretDamage}), got ${turretColours.join(',')}`
    );
    assert.ok(
      !turretColours.some(c => shellColours.includes(c)),
      'a turret volley must not share a colour with the shell that just landed'
    );
  });

  it('both themes define turretDamage, so the colour can never resolve undefined', () => {
    const S = loadScorched();
    for (const name of ['aethercastle', 'classic']) {
      const t = S.THEMES[name];
      assert.ok(t.turretDamage, `${name} theme is missing turretDamage`);
      assert.notStrictEqual(t.turretDamage, t.damage,
        `${name}: turretDamage must differ from the shell damage colour`);
    }
  });

  it('the attribution bolt outlives the explosion that hides it', () => {
    const { game } = soloMatch();
    let bolts = [];
    for (let turn = 0; turn < 6 && bolts.length === 0; turn++) {
      game.turretBolts.length = 0;
      game.nextTurn();
      bolts = game.turretBolts.slice();
    }
    assert.ok(bolts.length > 0, 'expected a turret volley to draw a bolt');
    // 24 ticks was 0.4s at 60fps -- shorter than the burst animation it has to
    // be told apart from, which is why the cue never registered.
    assert.ok(bolts[0].maxLife >= 60,
      `turret bolt lives only ${bolts[0].maxLife} ticks; too brief to attribute the damage`);
  });
});
