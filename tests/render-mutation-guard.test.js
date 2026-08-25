// Do the render guards actually fail?
//
// The Fable 5 review of the visualisation layer did not find a bug in the
// renderer. It found a bug in the TESTS: it broke the renderer four separate
// ways and every render suite stayed green.
//
//   1. `p.x = Math.round(p.x)` in the projectile draw loop moved the
//      simulation's projectile x from 500.437 to 500 on the drawing client
//      only — the exact desync class the purity guard exists to stop — and
//      both purity assertions passed.
//   2. Classic's projectile colour changed to #e0e0e0 and parity passed,
//      because `log.includes('fillStyle=#ffffff')` is satisfied by the
//      active-player marker elsewhere in the same frame.
//   3. Classic's mountains sky and crust swapped roles and parity passed,
//      because the addColorStop assertions were order-blind.
//   4. Classic's terrain lineWidth went 3 -> 5 and parity passed, because
//      lineWidth was never asserted at all.
//
// A test that cannot fail is worth less than no test, because it also stops
// anyone looking. So each case below applies the review's own mutation to the
// page source, runs the guard that is supposed to catch it, and asserts the
// guard FIRES. The two baseline tests come first: without them, a stale golden
// fixture or an unstable fingerprint would make every mutation "caught" for
// entirely the wrong reason.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  loadScorched, loadScorchedFrom, renderableGame, frameLog,
  worldFingerprint, richScene, classicDrift
} = require('./helpers/render-harness.js');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/**
 * Apply one textual mutation to the page source.
 *
 * Anchors are asserted to exist and to be unique. If a future edit moves one,
 * this fails with the anchor named rather than silently mutating nothing and
 * reporting that the guard no longer fires — which would look exactly like the
 * guard having regressed.
 */
function mutate(anchor, replacement) {
  const at = SOURCE.indexOf(anchor);
  assert.notStrictEqual(at, -1,
    `mutation anchor has moved, so this test is no longer testing anything:\n  ${anchor}`);
  assert.strictEqual(SOURCE.indexOf(anchor, at + 1), -1,
    `mutation anchor is no longer unique, so the mutation may land in the wrong place:\n  ${anchor}`);
  return loadScorchedFrom(SOURCE.slice(0, at) + replacement + SOURCE.slice(at + anchor.length));
}

// --- baselines: the guards must be quiet on the real build -----------------

test('baseline: the unmutated build matches the golden classic frame', () => {
  assert.strictEqual(classicDrift(loadScorched()), null,
    'classic already drifts, so every mutation below would be "caught" for the wrong reason');
});

test('baseline: the unmutated build leaves the world untouched by a draw', () => {
  const game = richScene(renderableGame(loadScorched()), 'mountains');
  const before = worldFingerprint(game);
  frameLog(game);
  assert.strictEqual(worldFingerprint(game), before,
    'the world already moves during a draw, so the purity mutation proves nothing');
});

// --- the four mutations ----------------------------------------------------

test('MUTATION 1: an idempotent-looking write in the projectile loop is caught', () => {
  const SCORCHED = mutate(
    'this.projectiles.forEach(p => {',
    'this.projectiles.forEach(p => {\n              p.x = Math.round(p.x);'
  );
  const game = richScene(renderableGame(SCORCHED), 'mountains');

  const before = worldFingerprint(game);
  frameLog(game);
  const after = worldFingerprint(game);

  // The world really did move: this is a desync, not a cosmetic difference.
  assert.strictEqual(game.projectiles[0].x, 500,
    'the mutation did not actually round the projectile — the scene lost its fractional x');
  assert.notStrictEqual(after, before, 'the purity guard did not catch a write to projectile.x');

  // And the reason the FIRST version of this guard missed it: the frame log is
  // still perfectly deterministic, because rounding an already-rounded value is
  // a no-op the second time. Reproducibility can never catch this class; only
  // the before/after fingerprint can.
  const mutated = renderableGame(SCORCHED);
  richScene(mutated, 'mountains');
  assert.deepStrictEqual(frameLog(mutated), frameLog(mutated),
    'expected the reproducibility check to stay blind to this — if it now fires, ' +
    'this comment is wrong and the case should be re-explained');
});

test('MUTATION 2: a changed classic projectile colour is caught', () => {
  const SCORCHED = mutate("projectile: '#ffffff',", "projectile: '#e0e0e0',");

  const drift = classicDrift(SCORCHED);
  assert.ok(drift, 'the golden diff did not catch a changed classic projectile colour');
  assert.match(drift.got, /#e0e0e0/,
    `expected the drift to name the mutated colour, got: ${drift.got}`);

  // Why presence was blind: white is still all over the frame.
  const log = frameLog(richScene(renderableGame(SCORCHED, { gameMode: 'classic' }), 'mountains'));
  assert.ok(log.includes('fillStyle=#ffffff'),
    'expected the old presence check to still pass under this mutation — that blindness ' +
    'is the whole reason this file exists');
});

test('MUTATION 3: swapped classic sky and crust roles are caught', () => {
  const SCORCHED = mutate(
    "mountains: { sky: '#001a33', skyLow: '#334d66', crust: '#888888', core: '#222222', edge: '#2d8a2d' },",
    "mountains: { sky: '#888888', skyLow: '#334d66', crust: '#001a33', core: '#222222', edge: '#2d8a2d' },"
  );

  const drift = classicDrift(SCORCHED);
  assert.ok(drift, 'the golden diff did not catch swapped sky and crust');
  assert.strictEqual(drift.biome, 'mountains');

  // Why presence was blind: both colours are still in the frame, on the wrong
  // gradients. An unordered check cannot tell a palette from a picture.
  const log = frameLog(richScene(renderableGame(SCORCHED, { gameMode: 'classic' }), 'mountains'));
  assert.ok(log.includes('grad.addColorStop(0,#001a33)'), 'sky colour vanished entirely');
  assert.ok(log.includes('grad.addColorStop(0,#888888)'), 'crust colour vanished entirely');
});

test('MUTATION 4: a changed terrain lineWidth is caught', () => {
  // The old suite asserted no lineWidth anywhere, so there is no "blind check"
  // to demonstrate here — the check simply did not exist. The golden log covers
  // it for free, which is the argument for diffing a whole frame rather than
  // enumerating the properties someone remembered to care about.
  const SCORCHED = mutate(
    'ctx.strokeStyle = r.edge;\n          ctx.lineWidth = 3;',
    'ctx.strokeStyle = r.edge;\n          ctx.lineWidth = 5;'
  );

  const drift = classicDrift(SCORCHED);
  assert.ok(drift, 'the golden diff did not catch a changed terrain lineWidth');
  assert.strictEqual(drift.got, 'lineWidth=5');
  assert.strictEqual(drift.want, 'lineWidth=3');
});

test('MUTATION 5: an added draw call is caught', () => {
  // Not one of the review's four. Every mutation above CHANGES an operation;
  // an unordered check is equally blind to one being ADDED, and classic
  // growing a pass nobody asked for is the likeliest way the easter egg rots
  // as the Aethercastle renderer keeps developing.
  const SCORCHED = mutate(
    'ctx.strokeStyle = r.edge;\n          ctx.lineWidth = 3;',
    'ctx.strokeStyle = r.edge;\n          ctx.lineWidth = 3;\n          ctx.setLineDash([4, 2]);'
  );

  const drift = classicDrift(SCORCHED);
  assert.ok(drift, 'the golden diff did not catch an added draw call');
  assert.strictEqual(drift.got, 'setLineDash([4 2])');
});

test('MUTATION 6: a changed line-dash pattern is caught', () => {
  // Found by writing MUTATION 5. The recording context used to erase EVERY
  // object argument to the literal `GRAD` — which was right for gradients and
  // wrong for arrays, so classic's dotted tracer recorded as `setLineDash(GRAD)`
  // and its pattern could change freely under a green golden diff. The blind
  // spot was in the instrument, one level below the tests it was measuring.
  const SCORCHED = mutate('ctx.setLineDash([2, 4]); // Dotted!', 'ctx.setLineDash([5, 5]);');

  const drift = classicDrift(SCORCHED);
  assert.ok(drift, 'the golden diff did not catch a changed line-dash pattern');
  assert.strictEqual(drift.want, 'setLineDash([2 4])');
  assert.strictEqual(drift.got, 'setLineDash([5 5])');
});
