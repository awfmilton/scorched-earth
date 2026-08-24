const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');

const S = require('../lib/structures.js');
const { newGame, fireAndSettle } = require('./helpers/headless-game.js');

// Every key the content manifest names. A category is not implemented until
// every item in it exists, so this list is asserted whole rather than sampled.
const STRUCTURE_KEYS = [
  'norman-castle', 'keep-gatehouse', 'aether-forge',
  'oil-vats', 'portcullis', 'scorpion-crossbow',
  'shield-dome', 'aether-radar', 'repair-bay', 'missile-silo'
];

// Two players get the full ten-item template, which is what most of these
// tests want: every structure type actually on the field.
function duel(opts) {
  return newGame(Object.assign({ seed: 4242 }, opts || {}));
}

function findStructure(game, key, ownerIdx) {
  return game.structures.find(s => s.key === key && (ownerIdx === undefined || s.ownerIdx === ownerIdx));
}

describe('Structure registry', () => {
  it('defines every structure and defense in the manifest', () => {
    for (const key of STRUCTURE_KEYS) {
      assert.ok(S.STRUCTURES[key], `${key} must exist in the registry`);
    }
    assert.strictEqual(S.STRUCTURE_IDS.length, STRUCTURE_KEYS.length);
  });

  it('gives every structure hp and a footprint, so all of them can be shot', () => {
    for (const key of STRUCTURE_KEYS) {
      const spec = S.STRUCTURES[key];
      assert.ok(spec.hp > 0, `${key} needs hp`);
      assert.ok(spec.w > 0 && spec.h > 0, `${key} needs a footprint`);
    }
  });

  it('gives every structure a real behaviour, not just a sprite', () => {
    // The line the plan draws: a chassis that is only a different sprite is
    // not implemented, and the same rule applies here. Each entry must carry
    // at least one behaviour flag the simulation reads.
    const behaviours = ['blocking', 'income', 'breach', 'turret', 'aura', 'aimAssist', 'wardFactor', 'anchor'];
    for (const key of STRUCTURE_KEYS) {
      const spec = S.STRUCTURES[key];
      const has = behaviours.filter(b => spec[b] !== undefined && spec[b] !== false);
      assert.ok(has.length > 0, `${key} has no behaviour flag — it would be scenery`);
    }
  });
});

describe('Structure mode gate', () => {
  it('fields a holding in aethercastle mode', () => {
    const { game } = duel();
    assert.ok(game.structures.length > 0, 'aethercastle must field structures');
  });

  it('fields NO structures in classic mode', () => {
    const { game } = duel({ gameMode: 'classic' });
    assert.strictEqual(game.structures.length, 0, 'classic keeps bare terrain — no castles');
  });

  it('the registry refuses to list any structure for classic', () => {
    assert.deepStrictEqual(S.structuresAllowedIn('classic'), []);
    assert.strictEqual(S.structuresAllowedIn('aethercastle').length, STRUCTURE_KEYS.length);
  });

  it('every structure type is on the field in a two-player match', () => {
    const { game } = duel();
    const present = new Set(game.structures.map(s => s.key));
    for (const key of STRUCTURE_KEYS) {
      assert.ok(present.has(key), `${key} missing from the field`);
    }
  });

  it('every structure belongs to a player, so there is something to defend', () => {
    const { game } = duel();
    for (const s of game.structures) {
      assert.ok(Number.isInteger(s.ownerIdx), 'structure must have an owner');
      assert.ok(s.ownerIdx >= 0 && s.ownerIdx < game.roster.length);
    }
    // Both houses get a holding, not just the first.
    const owners = new Set(game.structures.map(s => s.ownerIdx));
    assert.strictEqual(owners.size, 2);
  });
});

describe('Structure behaviour', () => {
  it('a portcullis blocks a tank from driving through it', () => {
    const { game } = duel();
    const tank = game.roster[0];
    const gate = findStructure(game, 'portcullis', 0);
    assert.ok(gate, 'need a portcullis');

    // Park the tank just to the left of the gate and drive right into it.
    tank.x = gate.x - 30;
    tank.y = game.restingY(tank, tank.x);
    tank.inventory['Fuel'] = 999;
    const before = tank.x;
    game.driveTank(tank, 1, 40);

    assert.ok(tank.x < gate.x, 'tank must not pass through a standing portcullis');
    assert.ok(tank.x >= before - 1, 'tank should not have been pushed backwards');
  });

  it('once the portcullis is destroyed the tank drives through', () => {
    const { game } = duel();
    const tank = game.roster[0];
    const gate = findStructure(game, 'portcullis', 0);

    // Flatten the ground so the test isolates blocking from climb limits, and
    // clear the rest of the holding so a neighbouring castle wall is not the
    // thing doing the stopping.
    for (let c = 0; c < game.terrain.heights.length; c++) game.terrain.heights[c] = 300;
    game.structures = [gate];
    gate.hp = 0;
    gate.breached = true;

    tank.x = gate.x - 30;
    tank.y = game.restingY(tank, tank.x);
    tank.inventory['Fuel'] = 999;
    game.driveTank(tank, 1, 40);

    assert.ok(tank.x > gate.x, 'a downed portcullis must not block');
  });

  it('an aether forge pays its owner at the top of a round', () => {
    const { game } = duel();
    const forge = findStructure(game, 'aether-forge', 0);
    const owner = game.roster[0];
    const before = owner.cash;
    game.applyStructureRoundStart();
    assert.strictEqual(owner.cash, before + S.STRUCTURES['aether-forge'].income);

    // ...and stops paying once it is rubble.
    forge.hp = 0;
    const mid = owner.cash;
    game.applyStructureRoundStart();
    assert.strictEqual(owner.cash, mid, 'a destroyed forge must not pay');
  });

  it('a repair bay heals a friendly hull over time, capped at max hp', () => {
    const { game } = duel();
    const bay = findStructure(game, 'repair-bay', 0);
    const owner = game.roster[0];
    // Reduce the field to the bay alone: with a full holding standing, the
    // ENEMY's turrets fire in the same pass and the test would be measuring
    // repair minus incoming fire rather than repair.
    game.structures = [bay];

    owner.x = bay.x;
    owner.y = bay.y;
    owner.hp = 40;
    game.applyStructureTurnEffects();
    assert.strictEqual(owner.hp, 40 + S.STRUCTURES['repair-bay'].aura.repair);

    owner.hp = owner.maxHp;
    game.applyStructureTurnEffects();
    assert.strictEqual(owner.hp, owner.maxHp, 'repair must not overheal');
  });

  it('a repair bay does not heal the enemy', () => {
    const { game } = duel();
    const bay = findStructure(game, 'repair-bay', 0);
    game.structures = [bay];
    const enemy = game.roster[1];
    enemy.x = bay.x;
    enemy.y = bay.y;
    enemy.hp = 40;
    game.applyStructureTurnEffects();
    assert.strictEqual(enemy.hp, 40, 'a holding only tends its own house');
  });

  it('a shield dome keeps a friendly hull in a shield', () => {
    const { game } = duel();
    const dome = findStructure(game, 'shield-dome', 0);
    game.structures = [dome];
    const owner = game.roster[0];
    owner.x = dome.x;
    owner.y = dome.y;
    owner.shield = null;
    game.applyStructureTurnEffects();
    assert.ok(owner.shield && owner.shield.hp >= S.STRUCTURES['shield-dome'].aura.shield);
  });

  it('oil vats damage whatever cracks them open', () => {
    const { game } = duel();
    const vats = findStructure(game, 'oil-vats', 0);
    const victim = game.roster[1];

    // Stand the victim right on the vats, out of range of anything else.
    victim.x = vats.x;
    victim.y = vats.y - 10;
    victim.shield = null;
    const before = victim.hp;

    // A pinprick that only just finishes the vats off: any damage the victim
    // takes past this has to have come from the breach, not the shot.
    vats.hp = 1;
    game.damageStructures(vats.x, vats.y - S.STRUCTURES['oil-vats'].h / 2, 12, 4, 0);

    assert.strictEqual(vats.hp, 0, 'vats should be breached');
    assert.ok(victim.hp < before, 'a breach must hurt whoever is standing on it');
  });

  // A round opens with turrets loading rather than ready, so a freshly revived
  // tank cannot be shot before anyone has taken a turn. Every turret test has
  // to burn that loading window before it can assert anything about firing.
  function loadTurret(game, id) {
    const turns = S.STRUCTURES[id].turret.cooldown;
    for (let i = 0; i < turns; i++) game.applyStructureTurnEffects();
  }

  it('a turret holds its fire on the opening turn of a round', () => {
    const { game } = duel();
    const bow = findStructure(game, 'scorpion-crossbow', 0);
    game.structures = [bow];

    const enemy = game.roster[1];
    enemy.x = bow.x + 60;
    enemy.y = bow.y;
    enemy.shield = null;
    const before = enemy.hp;

    // This is the pass the server's post-ROUND_START TURN_SYNC triggers.
    game.applyStructureTurnEffects();
    assert.strictEqual(enemy.hp, before, 'a round must not open with a free volley');
  });

  it('a scorpion crossbow fires on its own at the nearest enemy', () => {
    const { game } = duel();
    // Strip the field down to one turret so the damage has a single source.
    const bow = findStructure(game, 'scorpion-crossbow', 0);
    game.structures = [bow];

    const enemy = game.roster[1];
    enemy.x = bow.x + 60;
    enemy.y = bow.y;
    enemy.shield = null;
    const before = enemy.hp;

    loadTurret(game, 'scorpion-crossbow');
    game.applyStructureTurnEffects();
    assert.ok(enemy.hp < before, 'a scorpion must actually shoot once loaded');
  });

  it('a turret respects its cooldown rather than firing every turn', () => {
    const { game } = duel();
    const silo = findStructure(game, 'missile-silo', 0);
    game.structures = [silo];

    const enemy = game.roster[1];
    enemy.x = silo.x + 80;
    enemy.y = silo.y;
    enemy.shield = null;

    loadTurret(game, 'missile-silo');
    assert.strictEqual(enemy.hp, enemy.maxHp, 'a loading silo must not fire');

    game.applyStructureTurnEffects();
    const afterFirst = enemy.hp;
    assert.ok(afterFirst < enemy.maxHp, 'silo should have fired once loaded');

    // Next turn it is reloading, so the hull takes nothing.
    game.applyStructureTurnEffects();
    assert.strictEqual(enemy.hp, afterFirst, 'a silo on cooldown must not fire');
  });

  it('a turret does not shoot its own owner', () => {
    const { game } = duel();
    const bow = findStructure(game, 'scorpion-crossbow', 0);
    game.structures = [bow];
    const owner = game.roster[0];
    const enemy = game.roster[1];
    owner.x = bow.x;
    owner.y = bow.y;
    // Put the enemy far out of range so the only candidate is the owner.
    enemy.x = 5;
    enemy.y = 5;
    const before = owner.hp;
    // Load it first, or this passes for the wrong reason: a turret still
    // sitting on its opening cooldown would not fire on anyone.
    loadTurret(game, 'scorpion-crossbow');
    game.applyStructureTurnEffects();
    assert.strictEqual(owner.hp, before, 'a turret must never fire on its own house');
  });

  it('structures take blast damage and can be destroyed', () => {
    const { game } = duel();
    const castle = findStructure(game, 'norman-castle', 0);
    const before = castle.hp;
    game.damageStructures(castle.x, castle.y - 10, 120, 200, 1);
    assert.ok(castle.hp < before, 'a castle must take blast damage');
  });

  it('an intact gatehouse wards the works behind it', () => {
    const { game } = duel();
    const gate = findStructure(game, 'keep-gatehouse', 0);
    const forge = findStructure(game, 'aether-forge', 0);

    // Sit the forge inside the gatehouse's ward so the multiplier applies.
    forge.x = gate.x + 20;
    forge.y = gate.y;

    const warded = S.wardMultiplier(game.structures, forge);
    assert.ok(warded < 1, 'a standing gatehouse must reduce damage nearby');

    gate.hp = 0;
    const unwarded = S.wardMultiplier(game.structures, forge);
    assert.strictEqual(unwarded, 1, 'a downed gatehouse wards nothing');
  });

  it('cracking an anchor pays the attacker a bounty', () => {
    const { game } = duel();
    const castle = findStructure(game, 'norman-castle', 0);
    const attacker = game.roster[1];
    const before = attacker.cash;
    castle.hp = 1;
    game.damageStructures(castle.x, castle.y - 10, 60, 40, 1);
    assert.strictEqual(castle.hp, 0);
    assert.strictEqual(attacker.cash, before + S.STRUCTURES['norman-castle'].bounty);
  });

  it('a destroyed structure stays in the array so indices never shift', () => {
    const { game } = duel();
    const n = game.structures.length;
    const castle = findStructure(game, 'norman-castle', 0);
    castle.hp = 1;
    game.damageStructures(castle.x, castle.y - 10, 60, 400, 1);
    assert.strictEqual(game.structures.length, n,
      'removing a destroyed structure would shift every later index and desync');
  });

  it('a breach fires exactly once, however many times it is shelled', () => {
    const { game } = duel();
    const vats = findStructure(game, 'oil-vats', 0);
    const victim = game.roster[1];
    victim.x = vats.x;
    victim.y = vats.y - 10;
    victim.shield = null;
    victim.hp = 500;
    victim.maxHp = 500;

    vats.hp = 1;
    game.damageStructures(vats.x, vats.y - 12, 12, 4, 0);
    const afterBreach = victim.hp;

    // Shell the rubble again — a latched breach must not detonate twice.
    game.damageStructures(vats.x, vats.y - 12, 12, 400, 0);
    assert.strictEqual(victim.hp, afterBreach, 'a breach must not re-fire');
  });
});

describe('Structure determinism', () => {
  it('the same seed builds a byte-identical holding', () => {
    const a = duel({ seed: 777 }).game;
    const b = duel({ seed: 777 }).game;
    assert.deepStrictEqual(
      a.structures.map(s => `${s.key}:${s.owner}:${s.x}:${s.y}:${s.hp}`),
      b.structures.map(s => `${s.key}:${s.owner}:${s.x}:${s.y}:${s.hp}`)
    );
  });

  it('different seeds move the holding', () => {
    const a = duel({ seed: 777 }).game;
    const b = duel({ seed: 778 }).game;
    assert.notDeepStrictEqual(
      a.structures.map(s => s.x),
      b.structures.map(s => s.x)
    );
  });

  it('the holding is laid out in a fixed order, not object-key order', () => {
    const { game } = duel();
    // Player 0's whole holding precedes player 1's, and within a holding the
    // order is HOLDING_TEMPLATE. Both are load-bearing: structures are
    // addressed by index for the whole round.
    const owners = game.structures.map(s => s.ownerIdx);
    assert.deepStrictEqual(owners, owners.slice().sort((x, y) => x - y));

    const firstHolding = game.structures.filter(s => s.ownerIdx === 0).map(s => s.key);
    assert.deepStrictEqual(firstHolding, S.HOLDING_TEMPLATE.slice(0, firstHolding.length));
  });

  it('laying out structures does not disturb the gameplay RNG stream', () => {
    // The holding draws from its own stream. If it ever drew from gameplayRNG
    // it would shift wind and every tank position for every existing seed.
    const { game, SCORCHED } = duel({ seed: 31337 });
    const windBefore = game.wind;
    const tanksBefore = game.roster.map(t => t.x);

    const again = duel({ seed: 31337 }).game;
    assert.strictEqual(again.wind, windBefore);
    assert.deepStrictEqual(again.roster.map(t => t.x), tanksBefore);
    assert.ok(SCORCHED, 'harness sanity');
  });

  it('structure state survives a full identical-input replay', () => {
    // The replay proof for structures: fire the same shot into the same world
    // twice and the holding must end in the same state, hp for hp.
    function run() {
      const { game } = duel({ seed: 909 });
      const shooter = game.roster[game.activePlayerIdx];
      const castle = game.structures.find(s => s.ownerIdx !== game.activePlayerIdx && s.key === 'norman-castle');
      // Shell the enemy castle directly rather than relying on a lucky arc.
      game.explosion(castle.x, castle.y - 10, 140, 260, game.activePlayerIdx);
      game.applyStructureTurnEffects();
      assert.ok(shooter, 'shooter exists');
      return game.structures.map(s => `${s.key}:${s.x.toFixed(6)}:${s.y.toFixed(6)}:${s.hp}:${s.breached}`).join('|');
    }
    assert.strictEqual(run(), run());
  });

  it('a live shot resolves the holding identically on a replay', () => {
    function run() {
      const { game } = duel({ seed: 5150 });
      fireAndSettle(game, 'Nuke', 45, 800);
      return game.structures.map(s => `${s.key}:${s.hp}:${s.breached}`).join('|');
    }
    assert.strictEqual(run(), run());
  });

  it('the structures module draws from no unseeded source', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'structures.js'), 'utf8');

    // Comments are stripped first: the module's own determinism doctrine
    // block names Math.random and Date.now in prose, and a guard that trips
    // on its own documentation teaches people to delete the documentation.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    for (const banned of ['Math.random', 'Date.now', 'new Date']) {
      assert.ok(!code.includes(banned), `structures must not use ${banned}`);
    }
  });
});

// Regression cover for the bug that made tests/movement.test.js flaky: a
// blocking footprint laid on top of a tank left that tank unable to drive in
// EITHER direction for the whole round. Measured at 25 immobile tanks across
// 60 seeded matches before the fix.
describe('Masonry never traps a hull', () => {
  it('lets a tank already inside a footprint drive out of it', () => {
    const spec = S.STRUCTURES['portcullis'];
    const wall = [{ key: 'portcullis', x: 600, y: 400, hp: spec.hp, maxHp: spec.hp, breached: false }];
    const half = spec.w / 2;

    // Standing dead centre: both directions must be allowed, or the hull is
    // sealed in. This is the exact case the old [lo,hi] overlap test failed.
    assert.strictEqual(S.blocksMovement(wall, 600, 604), false, 'must be able to drive right, out of the wall');
    assert.strictEqual(S.blocksMovement(wall, 600, 596), false, 'must be able to drive left, out of the wall');

    // From outside, the wall still stops a hull driving into it.
    const outside = 600 - half - 2;
    assert.strictEqual(S.blocksMovement(wall, outside, outside + 6), true, 'a wall must still block entry');
    assert.strictEqual(S.blocksMovement(wall, outside, outside - 6), false, 'moving away is never blocked');
  });

  it('still refuses a stride that would clear the whole footprint in one step', () => {
    const spec = S.STRUCTURES['portcullis'];
    const wall = [{ key: 'portcullis', x: 600, y: 400, hp: spec.hp, maxHp: spec.hp, breached: false }];
    const half = spec.w / 2;
    // A stride longer than the building is wide must not teleport through it.
    assert.strictEqual(S.blocksMovement(wall, 600 - half - 1, 600 + half + 1), true);
  });

  it('never leaves a tank immobile, across many generated matches', () => {
    // THE invariant, and the one the movement flake was a symptom of. Walks
    // real generated matches rather than a hand-placed case, because the bug
    // only appeared for some seeds. Before the fix: 25 immobile tanks in 60
    // matches. This assertion is strict — one immobile tank is a broken round.
    let immobile = 0;
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { game } = duel({ seed });
      if (!game.structures || !game.structures.length) continue;
      checked++;
      for (const tank of game.roster) {
        const startX = tank.x;
        game.driveTank(tank, 1, 3);
        const wentRight = tank.x !== startX;
        tank.x = startX;
        game.driveTank(tank, -1, 3);
        const wentLeft = tank.x !== startX;
        tank.x = startX;
        if (!wentRight && !wentLeft) immobile++;
      }
    }
    assert.ok(checked > 0, 'the sweep must actually have built some holdings');
    assert.strictEqual(immobile, 0, `${immobile} tanks could not move in either direction`);
  });

  it('keeps footprint-on-tank overlap rare, even though it is only cosmetic', () => {
    // Placement is best-effort, so a crowded zone can still leave a hull
    // inside a footprint. That costs looks, not playability (the test above
    // proves the tank still drives out). Bounded rather than zero, so the
    // number is honest — but a regression that made it common would trip it.
    let overlaps = 0;
    let works = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { game } = duel({ seed });
      if (!game.structures || !game.structures.length) continue;
      for (const s of game.structures) {
        const spec = S.specOf(s);
        if (!spec || !spec.blocking) continue;
        works++;
        if (game.roster.some(t => Math.abs(s.x - t.x) <= spec.w / 2)) overlaps++;
      }
    }
    assert.ok(works > 100, 'the sweep must cover a meaningful number of works');
    assert.ok(overlaps / works < 0.05, `${overlaps}/${works} blocking works sit on a tank — expected under 5%`);
  });

  it('keeps every holding its castle rather than dropping crowded works', () => {
    // The first attempt at the layout fix omitted works it could not place
    // clear, which cost 13 of 400 holdings their norman-castle. Placement is
    // best-effort now, so the centrepiece is always there.
    for (let seed = 1; seed <= 25; seed++) {
      const { game } = duel({ seed });
      if (!game.structures || !game.structures.length) continue;
      for (let i = 0; i < game.roster.length; i++) {
        assert.ok(
          game.structures.some(s => s.ownerIdx === i && s.key === 'norman-castle'),
          `seed ${seed}: holding ${i} lost its castle`
        );
      }
    }
  });

  it('places structures identically for the same seed, so the fix is replicated', () => {
    // The nudge reads roster positions and draws no randomness. Two builds
    // from the same seed must agree exactly, or the fix itself is a desync.
    const layout = (seed) => duel({ seed }).game.structures
      .map(s => `${s.key}:${s.x.toFixed(6)}:${s.y.toFixed(6)}`).join('|');
    for (const seed of [7, 909, 4242]) {
      assert.strictEqual(layout(seed), layout(seed), `seed ${seed} must lay out identically`);
    }
  });
});
