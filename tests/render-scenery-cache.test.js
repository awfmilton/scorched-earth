// The scenery cache and the per-frame leaks it exposed.
//
// The Aethercastle background was repainted from scratch on EVERY frame:
// ~15,700 canvas operations and ~326,000 dither-cell hashes for a picture that
// is byte-identical until a column moves. Measured in Chrome on an Intel HD
// 520, one draw() cost ~18ms — the whole 60fps budget — of which the sky and
// ground were ~24ms in isolation and the 21-structure holding ~11ms. Caching
// both layers took draw() to ~0.7ms.
//
// A cache is only ever as good as its invalidation, so most of this file is
// about the ways the world can change underneath it.

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { newGame } = require('./helpers/headless-game.js');
const { loadScorched, renderableGame, frameLog } = require('./helpers/render-harness.js');

describe('terrain revision — the cache key for the ground', () => {
  it('starts defined and advances when the world is generated', () => {
    const SCORCHED = loadScorched();
    const t = new SCORCHED.Terrain();
    assert.strictEqual(typeof t.revision, 'number', 'a Terrain must carry a revision');

    const before = t.revision;
    t.generate(1234);
    assert.ok(t.revision > before, 'generate() must invalidate the cached ground');
  });

  it('advances on carve, deposit and settle', () => {
    const SCORCHED = loadScorched();
    const t = new SCORCHED.Terrain();
    t.generate(4321);

    const afterGen = t.revision;
    t.carve(600, 400, 30);
    assert.ok(t.revision > afterGen, 'carve() must invalidate');

    const afterCarve = t.revision;
    t.deposit(600, 400, 30);
    assert.ok(t.revision > afterCarve, 'deposit() must invalidate');

    const afterDeposit = t.revision;
    t.settle();
    assert.ok(t.revision > afterDeposit, 'settle() must invalidate');
  });

  // These weapons write terrain.heights[] DIRECTLY rather than going through
  // carve/deposit, which is exactly how a cached background goes stale while
  // the simulation says the ground moved. One test per writer.
  const directWriters = [
    ['Earth Disrupter', 'cuts its shaft by assigning heights'],
    ['Dirt Detonator', 'collapses deposited dirt in place'],
    ['Sandstorm', 'redistributes columns from a copy']
  ];

  for (const [weapon, how] of directWriters) {
    it(`${weapon} invalidates the cache — it ${how}`, () => {
      const { game } = newGame();
      game.terrain.settle();

      const before = game.terrain.revision;
      const heightsBefore = Array.from(game.terrain.heights).join(',');

      game.onImpact(600, 700 - game.terrain.heightAt(600), weapon, 0);

      const moved = Array.from(game.terrain.heights).join(',') !== heightsBefore;
      assert.ok(moved, `${weapon} must actually move the ground for this test to mean anything`);
      assert.ok(
        game.terrain.revision > before,
        `${weapon} moved the ground without bumping the revision — the cached background would keep showing the old world`
      );
    });
  }
});

describe('holding fingerprint — the cache key for the structures layer', () => {
  it('changes when a structure takes damage', () => {
    const SCORCHED = loadScorched();
    const game = renderableGame(SCORCHED);
    assert.ok(game.structures && game.structures.length, 'need a holding to test');

    const before = game.structuresFingerprint();
    game.structures[0].hp -= 1;
    assert.notStrictEqual(game.structuresFingerprint(), before,
      'damage must repaint the holding, or the hp bar freezes');
  });

  it('changes when the ground under the holding moves', () => {
    // The plinth is drawn down to the LIVE surface, so a carve changes the
    // structures layer even though no structure did.
    const SCORCHED = loadScorched();
    const game = renderableGame(SCORCHED);

    const before = game.structuresFingerprint();
    game.terrain.carve(game.structures[0].x, 400, 30);
    assert.notStrictEqual(game.structuresFingerprint(), before,
      'a carve under a structure must repaint its foundation');
  });

  it('is stable when nothing changed', () => {
    const SCORCHED = loadScorched();
    const game = renderableGame(SCORCHED);
    assert.strictEqual(game.structuresFingerprint(), game.structuresFingerprint(),
      'an unchanged holding must not repaint — that is the whole point');
  });
});

describe('the cache stands aside where it cannot work', () => {
  // Without a real canvas the blit would paint nothing at all, so both cache
  // paths must return null and let the live painters run. This is what keeps
  // the golden-frame and draw-log suites testing the real sprite kit.
  it('falls back to live painting when there is no real 2D context', () => {
    const SCORCHED = loadScorched();
    const game = renderableGame(SCORCHED);
    const fakeCtx = {
      canvas: { width: 1200, height: 700 },
      getTransform: () => undefined
    };

    assert.strictEqual(game.terrain.sceneryBitmap(fakeCtx, { glow: 'x' }), null,
      'scenery cache must decline a context it cannot mirror');
    assert.strictEqual(game.structuresBitmap(fakeCtx, {}), null,
      'holding cache must decline a context it cannot mirror');
  });

  it('still issues the real sprite-kit calls in the recording harness', () => {
    const SCORCHED = loadScorched();
    const game = renderableGame(SCORCHED);
    const log = frameLog(game).join('\n');
    // If the cache had swallowed the background, the frame would be a single
    // drawImage instead of thousands of ground operations.
    assert.ok(log.length > 1000, 'the recorded frame must still contain the live scenery paint');
    assert.doesNotMatch(log, /drawImage/, 'the harness must not be blitting a cache');
  });
});

describe('per-frame growth that the cache exposed', () => {
  it('keeps only the most recent tracer paths', () => {
    const { game } = newGame();
    game.persistentTracers = [];
    for (let i = 0; i < 40; i++) {
      game.recordTracer([{ x: i, y: 0 }, { x: i, y: 10 }]);
    }
    assert.ok(game.persistentTracers.length <= 12,
      `unbounded tracer list: ${game.persistentTracers.length} paths, each re-stroked every frame`);
    // The ones kept must be the NEWEST, or the display lags the action.
    const last = game.persistentTracers[game.persistentTracers.length - 1];
    assert.strictEqual(last[0].x, 39, 'the most recent tracer must be retained');
  });

  it('ignores a degenerate path that could never be stroked', () => {
    const { game } = newGame();
    game.persistentTracers = [];
    game.recordTracer([]);
    game.recordTracer([{ x: 1, y: 1 }]);
    game.recordTracer(null);
    assert.strictEqual(game.persistentTracers.length, 0,
      'a path with fewer than two points draws nothing and should not be kept');
  });
});

describe('the visual layer keeps ageing after the round ends', () => {
  it('ages damage numbers and turret bolts during the intermission', () => {
    const SCORCHED = loadScorched();
    const game = renderableGame(SCORCHED);

    game.damageNumbers = [{ x: 100, y: 100, text: '30', color: '#fff', life: 2 }];
    game.turretBolts = [{ x1: 0, y1: 0, x2: 10, y2: 10, life: 2, maxLife: 24 }];
    game.roundOver = true;

    // update() used to return early on roundOver, which froze every effect on
    // screen for the whole shop intermission and carried it into round 2.
    for (let i = 0; i < 5; i++) game.update(SCORCHED.CONST.TICK);

    assert.strictEqual(game.damageNumbers.length, 0,
      'damage numbers must expire during the intermission, not hang on screen');
    assert.strictEqual(game.turretBolts.length, 0,
      'turret bolts must expire during the intermission');
  });

  it('still does not step the simulation once the round is over', () => {
    const SCORCHED = loadScorched();
    const game = renderableGame(SCORCHED);
    game.roundOver = true;
    game.projectiles = [{ x: 100, y: 100, vx: 50, vy: 0, weapon: 'Baby Missile', active: true, bounces: 0 }];
    game.projectile = game.projectiles[0];

    const xBefore = game.projectiles[0].x;
    for (let i = 0; i < 10; i++) game.update(SCORCHED.CONST.TICK);

    assert.strictEqual(game.projectiles[0].x, xBefore,
      'ageing the visual layer must not restart the physics the round boundary stopped');
  });
});

describe('particle pool allocation', () => {
  it('reuses freed slots instead of rescanning from zero', () => {
    const SCORCHED = loadScorched();
    const game = renderableGame(SCORCHED);
    // renderableGame() builds the Game headless (to skip the DOM) and only
    // then turns drawing back on, so the browser's pool was never allocated.
    game.particlePool = Array.from({ length: 600 }, () => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0,
      color: '#ffffff', life: 0, maxLife: 0, size: 2, type: 'spark', bounces: 0
    }));
    game.particlePool.forEach(p => { p.active = false; });

    // Fill the pool.
    const size = game.particlePool.length;
    for (let i = 0; i < size; i++) {
      game.spawnParticle('spark', i, 0, 0, 0, '#fff', 1, 1);
    }
    assert.strictEqual(game.particlePool.filter(p => p.active).length, size,
      'every slot should have been handed out exactly once');

    // A full pool must still be detected — the cursor walks every slot.
    game.spawnParticle('spark', 0, 0, 0, 0, '#fff', 1, 1);
    assert.strictEqual(game.particlePool.filter(p => p.active).length, size,
      'a full pool must refuse the spawn rather than overwrite a live particle');

    // Free one in the middle and confirm it gets reused.
    const freed = game.particlePool[Math.floor(size / 2)];
    freed.active = false;
    game.spawnParticle('smoke', 777, 0, 0, 0, '#abc', 5, 3);
    assert.strictEqual(freed.active, true, 'the freed slot must be reused');
    assert.strictEqual(freed.x, 777);
  });
});
