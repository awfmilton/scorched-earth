// Palette parity between the two modes.
//
// The comment above THEMES has claimed this file exists since the palettes
// were written ("tests/theme-tokens.test.js fails if either side grows a key
// the other does not have"). It did not. A half-themed classic screen was
// therefore exactly as catchable as the comment said it was: not at all.
//
// The rule it enforces: every key on one palette exists on the other. A draw
// path reads THEME.x for whichever mode is live, so a key that exists only on
// the Aethercastle side is `undefined` on a classic canvas — and an undefined
// fillStyle is not an error, it is silently the PREVIOUS fill. That failure
// mode paints one shape in another shape's colour and never throws.

const test = require('node:test');
const assert = require('node:assert');
const { loadScorched } = require('./helpers/render-harness.js');

const MODES = ['aethercastle', 'classic'];

test('both palettes carry exactly the same keys', () => {
  const { THEMES } = loadScorched();
  const a = Object.keys(THEMES.aethercastle).sort();
  const c = Object.keys(THEMES.classic).sort();

  assert.deepStrictEqual(c, a,
    `palette keys differ: only in aethercastle ${JSON.stringify(a.filter(k => !c.includes(k)))}, ` +
    `only in classic ${JSON.stringify(c.filter(k => !a.includes(k)))}`);
});

test('both fx sets carry exactly the same keys', () => {
  const { THEMES } = loadScorched();
  const a = Object.keys(THEMES.aethercastle.fx).sort();
  const c = Object.keys(THEMES.classic.fx).sort();
  assert.deepStrictEqual(c, a);
});

test('no palette value is empty or undefined', () => {
  const { THEMES } = loadScorched();
  for (const mode of MODES) {
    for (const [key, value] of Object.entries(THEMES[mode])) {
      if (key === 'fx') continue;
      assert.strictEqual(typeof value, 'string', `${mode}.${key} is not a string`);
      assert.ok(value.length > 0, `${mode}.${key} is empty`);
    }
    for (const [key, value] of Object.entries(THEMES[mode].fx)) {
      if (Array.isArray(value)) {
        assert.ok(value.length > 0, `${mode}.fx.${key} is an empty list`);
        value.forEach((v, i) => assert.strictEqual(typeof v, 'string', `${mode}.fx.${key}[${i}]`));
        continue;
      }
      assert.strictEqual(typeof value, 'string', `${mode}.fx.${key} is not a string`);
      assert.ok(value.length > 0, `${mode}.fx.${key} is empty`);
    }
  }
});

test('particle colour lists are the same length in both modes', () => {
  const { THEMES } = loadScorched();
  // visualRNG.choice() draws one number and scales it by arr.length. Two
  // lists of different lengths would not merely re-tint the spray between
  // modes, they would move the visual stream.
  for (const key of ['smoke', 'debris']) {
    assert.strictEqual(
      THEMES.classic.fx[key].length,
      THEMES.aethercastle.fx[key].length,
      `fx.${key} lengths differ, which shifts the particle stream`
    );
  }
});

test('both modes ramp the same four biomes with the same fields', () => {
  const { BIOME_RAMPS } = loadScorched();
  const a = Object.keys(BIOME_RAMPS.aethercastle).sort();
  const c = Object.keys(BIOME_RAMPS.classic).sort();
  assert.deepStrictEqual(c, a, 'the two modes ramp different biomes');

  for (const biome of a) {
    for (const field of ['sky', 'skyLow', 'crust', 'core', 'edge']) {
      for (const mode of MODES) {
        const v = BIOME_RAMPS[mode][biome][field];
        assert.strictEqual(typeof v, 'string', `${mode}.${biome}.${field} missing`);
      }
    }
  }
});

test('an unknown biome still resolves to a ramp', () => {
  const SCORCHED = loadScorched();
  // Terrain treats anything it does not recognise as the default shape, and a
  // renderer that returned undefined here would throw mid-frame.
  for (const mode of MODES) {
    const ramp = SCORCHED.biomeRampFor(mode, 'not-a-biome');
    assert.strictEqual(typeof ramp.sky, 'string');
  }
});

test('an unknown mode resolves to the default palette, never undefined', () => {
  const SCORCHED = loadScorched();
  assert.strictEqual(SCORCHED.themeFor('nonsense'), SCORCHED.THEMES.aethercastle);
  assert.strictEqual(SCORCHED.themeFor(undefined), SCORCHED.THEMES.aethercastle);
  assert.strictEqual(SCORCHED.themeFor('classic'), SCORCHED.THEMES.classic);
});

test('the two palettes are actually different palettes', () => {
  const { THEMES } = loadScorched();
  // Guards the opposite failure from the parity checks above: a classic table
  // that had been copied from the Aethercastle one would pass every key test
  // and still lose the easter egg entirely.
  const keys = Object.keys(THEMES.aethercastle).filter(k => k !== 'fx');
  const shared = keys.filter(k => THEMES.aethercastle[k] === THEMES.classic[k]);
  assert.ok(shared.length < keys.length / 2,
    `the classic palette has drifted into the aethercastle one: ${shared.length}/${keys.length} identical`);
});
