// The Aethercastle path actually reaches the sprite kit.
//
// Classic's protection is a golden diff, because classic is a replica and any
// drift is a bug. Aethercastle is the opposite — the art is meant to keep
// moving — so there is no fixture to compare against and the failure mode is
// different: every kit call site is a BRANCH, and a branch that silently takes
// the other leg looks like a passing test suite and a placeholder screen.
//
// Terrain is the sharp case. `Terrain.draw` falls back to the old flat
// gradient when the kit is missing, which is right for robustness and invisible
// to every other test in the tree: the world still draws, the frame still
// differs per biome, nothing throws. The tests below assert the kit is the
// thing that drew, not merely that something did.

const test = require('node:test');
const assert = require('node:assert');
const {
  recordingContext, loadScorched, renderableGame, frameLog, richScene
} = require('./helpers/render-harness.js');

const BIOMES = ['mountains', 'plains', 'plateau', 'hills'];

test('the kit resolves — no call site is running on a null', () => {
  const SCORCHED = loadScorched();

  // Aethercastle draws tanks, structures, shells and bursts through the kit
  // with no fallback behind them. A frame that completes is the whole claim.
  const game = richScene(renderableGame(SCORCHED), 'mountains');
  assert.doesNotThrow(() => frameLog(game), 'an Aethercastle frame hit a missing kit module');
});

test('Aethercastle terrain is the kit, not the fallback gradient', () => {
  const SCORCHED = loadScorched();

  for (const biome of BIOMES) {
    const log = frameLog(richScene(renderableGame(SCORCHED), biome));

    // The fallback path has two unmistakable calls: a sky gradient spanning
    // the whole world and a ground body gradient from the 0.15 bedrock line.
    // The kit bands the sky in steps and hatches the strata, so it issues
    // neither — its only gradient is a narrow horizon haze.
    assert.ok(!log.includes('createLinearGradient(0,0,0,700)'),
      `${biome}: terrain fell back to the pre-kit full-height gradient sky`);
    assert.ok(!log.includes('createLinearGradient(0,105,0,700)'),
      `${biome}: terrain fell back to the pre-kit ground body gradient`);

    // And it is genuinely textured rather than a flat fill: the placeholder
    // ground was one path plus one stroke.
    assert.ok(log.length > 5000,
      `${biome}: only ${log.length} ops — the textured terrain pass did not run`);
  }
});

test('a slope-seated building stands on a drawn footing', () => {
  const SCORCHED = loadScorched();
  const game = renderableGame(SCORCHED);

  const sloped = game.structures.find(s => s.footing > 2);
  assert.ok(sloped, 'no structure in this holding was seated on a slope');

  // Zeroing the recorded footing is exactly what an older save looks like on
  // flat ground, and it must remove masonry from the frame. If the plinth were
  // re-derived from live heights instead, this would draw the same either way
  // — which is the bug that would let a mined building quietly re-level itself.
  const withFooting = frameLog(game);
  const real = sloped.footing;
  sloped.footing = 0;
  const without = frameLog(game);
  sloped.footing = real;

  assert.ok(withFooting.length > without.length,
    'the footing pass drew nothing for a building seated on a slope');
  assert.deepStrictEqual(frameLog(game), withFooting,
    'restoring the footing did not restore the picture');
});

test('the burst sprite is chosen by the weapon that fired it', () => {
  const SCORCHED = loadScorched();
  const theme = SCORCHED.themeFor('aethercastle');
  const ACWeapons = require('../gfx/ac-weapons.js');

  // One representative per burst tier, every one of them a REAL registry id
  // ('Dirt Charge' used to sit here — a phantom id that happened to match
  // the dirt tier's substring, proving nothing about the live game). These
  // are drawn from the same centre, radius and life, so anything that
  // differs is the tier selection working.
  const tiers = ['Missile', 'Nuke', 'Plasma Blast', 'Napalm', 'Riot Charge', 'Dirt Bomb'];
  const seen = new Map();

  for (const weapon of tiers) {
    const rec = recordingContext();
    ACWeapons.drawExplosionAC(rec, 200.5, 150.25, 60, 0.4, theme, weapon);
    const sig = rec.__log.join('\n');
    assert.ok(sig.length > 0, `${weapon} drew no burst at all`);
    for (const [other, otherSig] of seen) {
      assert.notStrictEqual(sig, otherSig, `${weapon} and ${other} burst identically`);
    }
    seen.set(weapon, sig);
  }
});

test('an unknown weapon still bursts rather than throwing', () => {
  const SCORCHED = loadScorched();
  const theme = SCORCHED.themeFor('aethercastle');
  const ACWeapons = require('../gfx/ac-weapons.js');

  // Structure turrets and chain-reaction deaths push an explosion with no
  // weapon at all, so the default tier is a live code path, not a guard.
  for (const weapon of [undefined, null, 'Not A Real Weapon']) {
    const rec = recordingContext();
    assert.doesNotThrow(
      () => ACWeapons.drawExplosionAC(rec, 100, 100, 30, 0.5, theme, weapon),
      `weapon ${String(weapon)} threw instead of falling back to the standard burst`
    );
    assert.ok(rec.__log.length > 0, `weapon ${String(weapon)} drew nothing`);
  }
});

test('the kit publishes exactly the six contracted globals and nothing more', () => {
  // Acceptance item from gfx/PROMPT.md: "No new globals besides ACG, ACSky,
  // ACTerrain, ACChassis, ACStructures, ACWeapons." This is the test that
  // item never had: a fresh window, the kit loaded the way the page loads
  // it, and an exact key-set comparison.
  const vm = require('node:vm');
  const { loadKitInto } = require('./helpers/gfx-kit.js');

  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  loadKitInto(context);

  const published = Object.keys(context.window).sort();
  assert.deepStrictEqual(published,
    ['ACChassis', 'ACG', 'ACSky', 'ACStructures', 'ACTerrain', 'ACWeapons'],
    `kit published: ${published.join(', ')}`);
});
