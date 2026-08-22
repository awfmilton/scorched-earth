// Behavioural tests for the weapon families added from AUDIT.md. Each one
// asserts the behaviour that makes the family distinct — a reskin of an
// existing shell would fail these.

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  newGame, fireAndSettle, terrainVolume, surfaceY
} = require('./helpers/headless-game.js');

// Puts a tank at a known column on the ground and settles the world first, so
// a test measures only what the weapon under test did.
function parkTank(game, tank, x) {
  tank.x = x;
  game.terrain.settle();
  game.snapTanksToTerrain();
}

describe('Riot family — clears dirt without damaging tanks', () => {
  it('removes terrain and leaves a tank sitting on the impact point unhurt', () => {
    const { game } = newGame();
    const victim = game.roster[1];
    parkTank(game, victim, 700);

    const hpBefore = victim.hp;
    const volumeBefore = terrainVolume(game);

    game.onImpact(victim.x, victim.y - 3, 'Riot Bomb', 0);

    assert.strictEqual(victim.hp, hpBefore, 'a Riot Bomb must never damage a tank');
    assert.ok(
      terrainVolume(game) < volumeBefore,
      'a Riot Bomb must clear dirt'
    );
  });

  it('a same-sized explosive at the same point does hurt, so the test is meaningful', () => {
    const { game } = newGame();
    const victim = game.roster[1];
    parkTank(game, victim, 700);

    game.onImpact(victim.x, victim.y - 3, 'Baby Nuke', 0);
    assert.ok(victim.hp < 100, 'control: a Baby Nuke on the same spot must damage');
  });

  it('scales up through the tier', () => {
    const dug = ['Riot Charge', 'Riot Blast', 'Riot Bomb', 'Heavy Riot Bomb'].map(id => {
      const { SCORCHED, game } = newGame();
      game.terrain.settle();
      const before = terrainVolume(game);
      game.onImpact(600, surfaceY(SCORCHED, game, 600), id, 0);
      return before - terrainVolume(game);
    });

    for (let i = 1; i < dug.length; i++) {
      assert.ok(dug[i] > dug[i - 1], `${i}: each Riot tier must clear more dirt than the last`);
    }
  });
});

describe('Sandhog family — tunnels downward before detonating', () => {
  it('detonates deeper than a Digger fired on the identical shot', () => {
    const shot = { angle: 50, power: 520 };

    const digger = newGame();
    fireAndSettle(digger.game, 'Digger', shot.angle, shot.power);

    const sandhog = newGame();
    fireAndSettle(sandhog.game, 'Heavy Sandhog', shot.angle, shot.power);

    assert.ok(digger.impacts.length > 0, 'the Digger control shot must land');
    assert.ok(sandhog.impacts.length > 0, 'the Sandhog shot must land');

    // Screen y grows downward, so a deeper detonation has the larger y.
    assert.ok(
      sandhog.impacts[0].y > digger.impacts[0].y + 100,
      `Heavy Sandhog detonated at y=${sandhog.impacts[0].y}, Digger at y=${digger.impacts[0].y}` +
      ' — the Sandhog must tunnel substantially deeper'
    );
  });

  it('bores deeper the heavier the hog', () => {
    const depths = ['Baby Sandhog', 'Sandhog', 'Heavy Sandhog'].map(id => {
      const g = newGame();
      fireAndSettle(g.game, id, 50, 520);
      return g.impacts[0].y;
    });

    assert.ok(depths[1] > depths[0], 'Sandhog must out-dig Baby Sandhog');
    assert.ok(depths[2] > depths[1], 'Heavy Sandhog must out-dig Sandhog');
  });

  it('carves the shaft on the way down, not just a crater at the bottom', () => {
    const plain = newGame();
    fireAndSettle(plain.game, 'Digger', 50, 520);

    const hog = newGame();
    fireAndSettle(hog.game, 'Heavy Sandhog', 50, 520);

    assert.ok(
      terrainVolume(hog.game) < terrainVolume(plain.game),
      'the tunnelling shot must remove more dirt overall than a plain burrow'
    );
  });
});

describe('LeapFrog — hops and re-explodes', () => {
  it('detonates three times, each hop further along the direction of travel', () => {
    const { game, impacts } = newGame();
    fireAndSettle(game, 'LeapFrog', 50, 520);

    assert.strictEqual(impacts.length, 3, 'LeapFrog must explode once, then twice more');

    const dir = Math.sign(impacts[1].x - impacts[0].x);
    assert.notStrictEqual(dir, 0, 'the hop must actually travel');
    assert.strictEqual(
      Math.sign(impacts[2].x - impacts[1].x), dir,
      'every hop must continue in the same direction'
    );
  });

  it('a plain explosive fired identically detonates exactly once', () => {
    const { game, impacts } = newGame();
    fireAndSettle(game, 'Missile', 50, 520);
    assert.strictEqual(impacts.length, 1);
  });
});

describe('Dirt family — adds terrain instead of removing it', () => {
  it('every dirt weapon raises the total volume of dirt in the world', () => {
    for (const id of ['Dirt Clod', 'Dirt Ball', 'Dirt Bomb', 'Ton of Dirt']) {
      const { SCORCHED, game } = newGame();
      game.terrain.settle();
      const before = terrainVolume(game);
      game.onImpact(600, surfaceY(SCORCHED, game, 600), id, 0);
      assert.ok(
        terrainVolume(game) > before,
        `${id} must deposit dirt, not remove it`
      );
    }
  });

  it('delivers more dirt the bigger the payload', () => {
    const delivered = ['Dirt Clod', 'Dirt Ball', 'Dirt Bomb', 'Ton of Dirt'].map(id => {
      const { SCORCHED, game } = newGame();
      game.terrain.settle();
      const before = terrainVolume(game);
      game.onImpact(600, surfaceY(SCORCHED, game, 600), id, 0);
      return terrainVolume(game) - before;
    });

    for (let i = 1; i < delivered.length; i++) {
      assert.ok(delivered[i] > delivered[i - 1], `dirt tier ${i} must out-deliver tier ${i - 1}`);
    }
  });

  it('buries without damaging', () => {
    const { game } = newGame();
    const victim = game.roster[1];
    parkTank(game, victim, 700);
    game.onImpact(victim.x, victim.y - 3, 'Ton of Dirt', 0);
    assert.strictEqual(victim.hp, 100, 'dirt delivery must do no damage');
  });
});

describe('Late-tier exotics', () => {
  it('Plasma Blast leaves the terrain untouched', () => {
    // Detonated clear of both tanks: a tank killed by the blast explodes in
    // turn, and that wreck DOES crater, which would mask what is being tested.
    const { SCORCHED, game } = newGame();
    game.roster.forEach(t => { t.x = 100; });
    game.terrain.settle();
    game.snapTanksToTerrain();

    const before = Buffer.from(Buffer.from(game.terrain.heights.buffer));
    game.onImpact(700, surfaceY(SCORCHED, game, 700), 'Plasma Blast', 0);

    assert.ok(
      before.equals(Buffer.from(game.terrain.heights.buffer)),
      'Plasma Blast is pure energy — it must not move any dirt'
    );
  });

  it('Plasma Blast still hits hard', () => {
    const { game } = newGame();
    const victim = game.roster[1];
    parkTank(game, victim, 700);
    game.onImpact(victim.x, victim.y - 3, 'Plasma Blast', 0);
    assert.strictEqual(victim.hp, 0, 'a direct Plasma Blast must be lethal');
  });

  it('Earth Disrupter cuts a shaft far deeper than its blast radius explains', () => {
    const col = 600;
    const { SCORCHED, game } = newGame();
    game.terrain.settle();

    const surface = game.terrain.heights[col];
    game.onImpact(col, surfaceY(SCORCHED, game, col), 'Earth Disrupter', 0);

    const cutAtCentre = surface - game.terrain.heights[col];
    const blast = SCORCHED.WEAPONS.find(w => w.id === 'Earth Disrupter').blast;

    assert.ok(
      cutAtCentre > blast * 2,
      `cut ${cutAtCentre.toFixed(1)}px on a ${blast}px blast — must punch toward bedrock`
    );

    // And it is a shaft, not a crater: 150px out the ground is barely touched.
    const far = 150;
    const control = newGame();
    control.game.terrain.settle();
    const untouched = control.game.terrain.heights[col + far];
    assert.ok(
      Math.abs(game.terrain.heights[col + far] - untouched) < cutAtCentre / 4,
      'the disruption must stay a narrow shaft, not spread into a wide crater'
    );
  });

  it('Laser flies straight — wind does not bend it', () => {
    const withHeadwind = newGame({ wind: -150 });
    fireAndSettle(withHeadwind.game, 'Laser', 50, 520);

    const withTailwind = newGame({ wind: 150 });
    fireAndSettle(withTailwind.game, 'Laser', 50, 520);

    assert.ok(withHeadwind.impacts.length > 0 && withTailwind.impacts.length > 0);
    assert.strictEqual(
      withHeadwind.impacts[0].x, withTailwind.impacts[0].x,
      'a laser beam must land in the same place regardless of wind'
    );
  });

  it('a shell fired identically DOES get pushed by the wind', () => {
    const a = newGame({ wind: -150 });
    fireAndSettle(a.game, 'Missile', 50, 520);
    const b = newGame({ wind: 150 });
    fireAndSettle(b.game, 'Missile', 50, 520);

    assert.notStrictEqual(
      a.impacts[0].x, b.impacts[0].x,
      'control: a normal shell must be wind-affected'
    );
  });
});

describe('Smoke Tracer', () => {
  it('does no damage and leaves a path behind', () => {
    const { game } = newGame();
    const victim = game.roster[1];
    parkTank(game, victim, 700);

    game.onImpact(victim.x, victim.y - 3, 'Smoke Tracer', 0);
    assert.strictEqual(victim.hp, 100, 'a tracer must never damage');

    const fresh = newGame();
    fireAndSettle(fresh.game, 'Smoke Tracer', 50, 520);
    assert.ok(
      fresh.game.persistentTracers.length > 0,
      'a Smoke Tracer must record its trajectory'
    );
  });

  it('leaves the terrain completely alone', () => {
    const { SCORCHED, game } = newGame();
    game.terrain.settle();
    const before = Buffer.from(Buffer.from(game.terrain.heights.buffer));
    game.onImpact(600, surfaceY(SCORCHED, game, 600), 'Smoke Tracer', 0);
    assert.ok(before.equals(Buffer.from(game.terrain.heights.buffer)));
  });
});
