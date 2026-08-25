// Rendering is a pure function of simulation state.
//
// The last two reviews both found divergence that started in a draw path, so
// the visualisation layer gets an explicit guard rather than a convention. Two
// properties are asserted here, and between them they cover the whole class:
//
//   1. A draw changes nothing. The world is fingerprinted before and after.
//   2. A draw is reproducible. Two frames of an unchanged world are identical,
//      which fails for ANY source of nondeterminism in a draw path — a random
//      number from any stream, a wall-clock read, an object-key iteration —
//      without the test having to know which one to look for.
//
// Plus the thing the layer was built for: that the holding and the six chassis
// are actually drawn, and that their simulated states reach the screen.

const test = require('node:test');
const assert = require('node:assert');
const {
  recordingContext, loadScorched, renderableGame, frameLog, worldFingerprint, richScene
} = require('./helpers/render-harness.js');

test('a frame does not touch simulation state', () => {
  const SCORCHED = loadScorched();
  const game = richScene(renderableGame(SCORCHED), 'mountains');

  // The fingerprint walks the WHOLE world, and the scene it walks is pinned to
  // fractional coordinates. Both halves are needed: a hand-listed snapshot
  // misses a write to a field nobody thought to list, and a scene of round
  // numbers misses a rounding write to a field that IS listed. Together they
  // catch `p.x = Math.round(p.x)`, which is the mutation that beat the first
  // version of this test.
  const before = worldFingerprint(game);
  frameLog(game);
  const after = worldFingerprint(game);

  assert.strictEqual(after, before, 'drawing moved the world');
});

test('two frames of an unchanged world are identical', () => {
  const SCORCHED = loadScorched();
  const game = richScene(renderableGame(SCORCHED), 'mountains');

  assert.deepStrictEqual(frameLog(game), frameLog(game),
    'a draw path is not deterministic');
});

test('no draw path reaches for Math.random', () => {
  const SCORCHED = loadScorched({ banRandom: true });
  const game = richScene(renderableGame(SCORCHED), 'mountains');

  // Damage and destroy some of the holding so the damaged and rubble branches
  // are on the frame too, not just the intact one.
  game.structures[0].hp = Math.floor(game.structures[0].maxHp / 2);
  game.structures[1].hp = 0;
  game.structures[1].breached = true;

  assert.doesNotThrow(() => frameLog(game));
});

test('every standing structure is drawn', () => {
  const SCORCHED = loadScorched();
  const game = renderableGame(SCORCHED);

  assert.ok(game.structures.length > 0, 'aethercastle built no holding to draw');

  const withHolding = frameLog(game);
  const holding = game.structures;
  game.structures = [];
  const without = frameLog(game);

  assert.ok(withHolding.length > without.length,
    'the holding contributed no draw calls at all');

  // Each structure individually reaches the canvas: removing any ONE of them
  // shortens the frame. This is the check that a single unhandled key falling
  // through to a silent `continue` would fail.
  for (let i = 0; i < holding.length; i++) {
    game.structures = holding.filter((_, j) => j !== i);
    const missingOne = frameLog(game);
    assert.ok(missingOne.length < withHolding.length,
      `${holding[i].key} drew nothing`);
  }
});

test('structure hp, breach and destruction each change the picture', () => {
  const SCORCHED = loadScorched();
  const game = renderableGame(SCORCHED);

  // A vat is the one structure with all four states worth distinguishing.
  const idx = game.structures.findIndex(s => s.key === 'oil-vats');
  assert.ok(idx >= 0, 'no oil vats in the holding');
  const vat = game.structures[idx];
  const full = vat.maxHp;

  const intact = frameLog(game);

  vat.hp = Math.floor(full / 2);
  const damaged = frameLog(game);
  assert.notDeepStrictEqual(damaged, intact, 'a damaged structure looks intact');

  vat.hp = 0;
  vat.breached = false;
  const destroyed = frameLog(game);
  assert.notDeepStrictEqual(destroyed, damaged, 'a destroyed structure looks damaged');

  vat.breached = true;
  const spent = frameLog(game);
  assert.notDeepStrictEqual(spent, destroyed,
    'a spent breach is indistinguishable from an armed one');

  vat.hp = full;
  vat.breached = false;
  assert.deepStrictEqual(frameLog(game), intact, 'restoring the vat did not restore the picture');
});

test('the six chassis draw six different silhouettes', () => {
  const SCORCHED = loadScorched();
  const theme = SCORCHED.themeFor('aethercastle');
  const ids = Object.keys(SCORCHED.CHASSIS);

  assert.strictEqual(ids.length, 6, 'the chassis registry is no longer six');

  const logs = new Map();
  for (const id of ids) {
    const rec = recordingContext();
    const tank = { x: 300, y: 400, angle: 45, color: '#ff0000', hp: 100, chassis: id };
    SCORCHED.drawTank(rec, tank, SCORCHED.CHASSIS[id], false, theme);
    const log = rec.__log.join('\n');
    assert.ok(log.length > 0, `${id} drew nothing`);
    logs.set(id, log);
  }

  // Every pair differs. Before this layer existed all six produced a byte
  // identical log, which is the bug this test exists to prevent returning.
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      assert.notStrictEqual(logs.get(ids[i]), logs.get(ids[j]),
        `${ids[i]} and ${ids[j]} draw identically`);
    }
  }
});

test('every chassis consumes its accent and hull dimensions', () => {
  const SCORCHED = loadScorched();
  const theme = SCORCHED.themeFor('aethercastle');

  for (const [id, chassis] of Object.entries(SCORCHED.CHASSIS)) {
    const rec = recordingContext();
    const tank = { x: 300, y: 400, angle: 45, color: '#ff0000', hp: 100, chassis: id };
    SCORCHED.drawTank(rec, tank, chassis, false, theme);
    const log = rec.__log.join('\n');

    assert.ok(log.includes(chassis.accent), `${id} never used its accent ${chassis.accent}`);
    assert.ok(
      log.includes(String(chassis.hullW)) || log.includes(String(chassis.hullW / 2)),
      `${id} never used its hullW ${chassis.hullW}`
    );
  }
});

test('the barrel stays on the simulated muzzle for every chassis', () => {
  const SCORCHED = loadScorched();
  const x = 300;
  const y = 400;
  const angle = 45;

  // The simulation spawns a shell at (x + 12cos, y - 6 - 12sin). A chassis
  // that drew its barrel anywhere else would be a sprite that lies about
  // where its shots come from.
  const rad = (angle * Math.PI) / 180;
  const muzzleX = x + 12 * SCORCHED.detCos(rad);
  const muzzleY = y - 6 - 12 * SCORCHED.detSin(rad);

  for (const mode of ['classic', 'aethercastle']) {
    const theme = SCORCHED.themeFor(mode);
    for (const [id, chassis] of Object.entries(SCORCHED.CHASSIS)) {
      const rec = recordingContext();
      SCORCHED.drawTank(rec, { x, y, angle, color: '#ff0000', hp: 100, chassis: id }, chassis, false, theme);
      const log = rec.__log;
      assert.ok(log.includes(`moveTo(${x},${y - 6})`),
        `${mode}/${id}: barrel does not start at the simulated muzzle`);
      assert.ok(log.includes(`lineTo(${muzzleX},${muzzleY})`),
        `${mode}/${id}: barrel does not end at the simulated muzzle`);
    }
  }
});

test('the active-player marker is drawn for the active tank only', () => {
  const SCORCHED = loadScorched();
  const theme = SCORCHED.themeFor('aethercastle');
  const chassis = SCORCHED.CHASSIS['clockwork-tank'];
  const tank = { x: 300, y: 400, angle: 45, color: '#ff0000', hp: 100, chassis: 'clockwork-tank' };

  const idle = recordingContext();
  SCORCHED.drawTank(idle, tank, chassis, false, theme);
  const active = recordingContext();
  SCORCHED.drawTank(active, tank, chassis, true, theme);

  assert.ok(active.__log.length > idle.__log.length, 'the active marker drew nothing');
  assert.ok(active.__log.includes('moveTo(296,380)'), 'the active marker triangle moved');
});

test('a spectating client draws the same frame as a seated one', () => {
  const SCORCHED = loadScorched();
  const seated = renderableGame(SCORCHED);
  const watching = renderableGame(SCORCHED);
  watching.spectating = true;

  // Spectating is an INPUT gate, not a rendering one. If it ever starts
  // changing the picture, a reconnected player is watching a different game
  // from the one everybody else is playing.
  assert.deepStrictEqual(frameLog(watching), frameLog(seated));
});
