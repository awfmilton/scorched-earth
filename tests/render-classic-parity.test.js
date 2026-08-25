// The easter egg's regression net.
//
// Classic mode is a REPLICA, not a re-tint. Before the visualisation layer
// existed the whole game drew with literal hex buried in draw calls; those
// literals are now THEMES.classic.fx and BIOME_RAMPS.classic, and the point of
// this file is that moving them changed nothing a player can see.
//
// This file used to assert that with a list of `log.includes(...)` checks, and
// a Fable 5 review broke classic three separate ways without turning any of
// them red: the projectile colour changed to #e0e0e0 (still "present", because
// the active-player marker is white too and appears in the same frame), the
// mountains sky and crust swapped roles (the addColorStop checks are
// order-blind), and the terrain lineWidth went 3 -> 5 (lineWidth was never
// asserted at all). Presence is not effect. A frame is a SEQUENCE, so the only
// honest check is an ordered comparison of the whole sequence against one
// recorded from the pre-visualisation build.
//
// So there is one real test here, and it is a diff. What remains below it are
// the two properties a call log cannot express — a data assertion about the
// ramp table, and reproducibility — not a second, weaker restatement of the
// same contract.

const test = require('node:test');
const assert = require('node:assert');
const {
  loadScorched, renderableGame, frameLog, richScene,
  goldenFrames, GOLDEN_BASE
} = require('./helpers/render-harness.js');

const BIOMES = ['mountains', 'plains', 'plateau', 'hills'];

test('a classic frame matches the pre-visualisation build call for call', () => {
  const SCORCHED = loadScorched();
  const golden = goldenFrames();

  assert.deepStrictEqual(Object.keys(golden), BIOMES,
    'the golden fixture is malformed — re-record it with tools/record-classic-golden.js');

  for (const [biome, want] of Object.entries(golden)) {
    const game = renderableGame(SCORCHED, { gameMode: 'classic' });
    const got = frameLog(richScene(game, biome));

    // Point at the first drift rather than dumping two 2,500-line arrays:
    // deepStrictEqual's own diff is unreadable at this size, and the whole
    // value of this test is that a failure names the operation that moved.
    const n = Math.max(want.length, got.length);
    for (let i = 0; i < n; i++) {
      assert.strictEqual(got[i], want[i],
        `classic ${biome} drifted from ${GOLDEN_BASE} at operation ${i}\n` +
        `  expected: ${want[i]}\n  actual:   ${got[i]}\n` +
        `  (${want.length} ops recorded, ${got.length} drawn)\n` +
        '  If this change is intended, the easter egg has changed and the\n' +
        '  fixture needs re-recording from the build the player should see.');
    }
    assert.strictEqual(got.length, want.length,
      `classic ${biome} draws ${got.length} operations, ${GOLDEN_BASE} drew ${want.length}`);
  }
});

test('the classic ramp table carries no aether bloom', () => {
  const SCORCHED = loadScorched();

  // A data assertion, not a log assertion: the bloom pass is gated on
  // `ramp.glow` being defined, so this is the reason classic's call log ends
  // where it does. The golden diff already proves the pass does not run; this
  // says why, and fails at the table if someone adds a glow to classic
  // intending it to be harmless.
  for (const biome of BIOMES) {
    const ramp = SCORCHED.biomeRampFor('classic', biome);
    assert.strictEqual(ramp.glow, undefined, `classic ${biome} grew a glow`);
  }
});

test('classic fields no holding', () => {
  const SCORCHED = loadScorched();
  const game = renderableGame(SCORCHED, { gameMode: 'classic' });

  assert.deepStrictEqual(game.structures, [], 'classic built structures');

  // Emptying an already-empty holding cannot change the picture. If it does,
  // something outside this.structures is drawing a building in classic.
  const withHolding = frameLog(game);
  game.structures = [];
  assert.deepStrictEqual(frameLog(game), withHolding);
});

test('a classic frame is reproducible call for call', () => {
  const SCORCHED = loadScorched();
  const game = renderableGame(SCORCHED, { gameMode: 'classic' });
  assert.deepStrictEqual(frameLog(game), frameLog(game));
});
