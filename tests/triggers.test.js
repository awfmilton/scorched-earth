// Contact Trigger and Proximity Fuse. AUDIT.md §3 had this row MISSING.
//
// The rule these tests pin down: a trigger governs WHEN the shell first
// detonates, not what the explosion then does. So Contact cancels the families
// that delay detonation (roll, bounce, dig, tunnel) but does not cancel a
// LeapFrog's hop, which happens after the first blast either way.

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { newGame, terrainVolume } = require('./helpers/headless-game.js');

// Fires straight at a fixed shot and returns where the shell finally went off.
function fireAt(game, weapon, angle, power, setup) {
  const tank = game.roster[game.activePlayerIdx];
  tank.angle = angle;
  tank.power = power;
  tank.selectedWeapon = weapon;
  tank.inventory[weapon] = 1;
  if (setup) setup(tank);
  game.fireActiveWeapon();

  let ticks = 0;
  while (game.projectiles.length > 0 && ticks < 4000) {
    game.stepPhysics(0.016);
    ticks++;
  }
  for (let i = 0; i < 60; i++) game.stepPhysics(0.016);
  return ticks;
}

describe('arming', () => {
  it('is in the shop and spends one on fire', () => {
    const { SCORCHED, game } = newGame();
    assert.ok(SCORCHED.ITEMS.find(i => i.id === 'Contact Trigger'));
    assert.ok(SCORCHED.ITEMS.find(i => i.id === 'Proximity Fuse'));

    const tank = game.roster[game.activePlayerIdx];
    tank.inventory['Contact Trigger'] = 2;
    fireAt(game, 'Missile', 45, 400);
    assert.strictEqual(tank.inventory['Contact Trigger'], 1, 'one trigger per shot');
  });

  it('prefers the Proximity Fuse when a tank holds both, and spends only that', () => {
    const { game } = newGame();
    const tank = game.roster[game.activePlayerIdx];
    tank.inventory['Contact Trigger'] = 1;
    tank.inventory['Proximity Fuse'] = 1;

    assert.strictEqual(game.armTrigger(tank), 'proximity');
    assert.strictEqual(tank.inventory['Proximity Fuse'], 0);
    assert.strictEqual(tank.inventory['Contact Trigger'], 1);
  });

  it('arms nothing, and spends nothing, when the tank holds none', () => {
    const { game } = newGame();
    const tank = game.roster[game.activePlayerIdx];
    tank.inventory['Contact Trigger'] = 0;
    tank.inventory['Proximity Fuse'] = 0;
    assert.strictEqual(game.armTrigger(tank), null);
  });

  it('the shell carries the armed trigger', () => {
    const { game } = newGame();
    const tank = game.roster[game.activePlayerIdx];
    tank.angle = 45;
    tank.power = 400;
    tank.selectedWeapon = 'Missile';
    tank.inventory['Missile'] = 1;
    tank.inventory['Proximity Fuse'] = 1;
    game.fireActiveWeapon();

    assert.strictEqual(game.projectiles[0].trigger, 'proximity');
  });
});

describe('Contact Trigger overrides the delayed-detonation families', () => {
  it('a Roller detonates where it lands instead of rolling downhill', () => {
    const shot = { angle: 55, power: 480 };

    const rolled = newGame({ seed: 4242 });
    fireAt(rolled.game, 'Heavy Roller', shot.angle, shot.power);

    const contact = newGame({ seed: 4242 });
    fireAt(contact.game, 'Heavy Roller', shot.angle, shot.power, t => {
      t.inventory['Contact Trigger'] = 1;
    });

    const rolledAt = rolled.impacts[rolled.impacts.length - 1];
    const contactAt = contact.impacts[contact.impacts.length - 1];

    assert.ok(rolledAt && contactAt, 'both shots must detonate');
    assert.ok(
      Math.abs(rolledAt.x - contactAt.x) > 5,
      `contact must cut the roll short (rolled to ${rolledAt.x}, contact at ${contactAt.x})`
    );
  });

  it('a Sandhog detonates at the surface instead of tunnelling under it', () => {
    const shot = { angle: 50, power: 520 };

    // Seed matters: on some terrains this shot lands back on the shooter's own
    // hull, which detonates via the hull path and never reaches the tunnelling
    // branch at all — a green test that proves nothing.
    const tunnelled = newGame({ seed: 12345 });
    fireAt(tunnelled.game, 'Heavy Sandhog', shot.angle, shot.power);

    const contact = newGame({ seed: 12345 });
    fireAt(contact.game, 'Heavy Sandhog', shot.angle, shot.power, t => {
      t.inventory['Contact Trigger'] = 1;
    });

    const deep = tunnelled.impacts[tunnelled.impacts.length - 1];
    const shallow = contact.impacts[contact.impacts.length - 1];

    assert.ok(deep && shallow);
    assert.ok(
      shallow.y < deep.y,
      `contact must detonate above the tunnelled depth (${shallow.y} vs ${deep.y})`
    );
  });

  it('a Digger detonates at the surface instead of digging', () => {
    const shot = { angle: 50, power: 500 };

    const dug = newGame({ seed: 77 });
    fireAt(dug.game, 'Heavy Digger', shot.angle, shot.power);

    const contact = newGame({ seed: 77 });
    fireAt(contact.game, 'Heavy Digger', shot.angle, shot.power, t => {
      t.inventory['Contact Trigger'] = 1;
    });

    const deep = dug.impacts[dug.impacts.length - 1];
    const shallow = contact.impacts[contact.impacts.length - 1];
    assert.ok(deep && shallow);
    assert.ok(shallow.y < deep.y, 'contact must detonate above the dug depth');
  });
});

describe('Contact-triggered LeapFrog still hops', () => {
  it('produces the same number of detonations with and without the trigger', () => {
    const plain = newGame({ seed: 31337 });
    fireAt(plain.game, 'LeapFrog', 50, 500);

    const contact = newGame({ seed: 31337 });
    fireAt(contact.game, 'LeapFrog', 50, 500, t => {
      t.inventory['Contact Trigger'] = 1;
    });

    assert.ok(plain.impacts.length >= 3, 'control: a LeapFrog detonates 3 times');
    assert.strictEqual(
      contact.impacts.length,
      plain.impacts.length,
      'Contact governs the FIRST detonation, not the hops after it'
    );
  });
});

describe('Proximity Fuse', () => {
  it('air-bursts on a near miss that would otherwise sail past', () => {
    // A shell placed level with the enemy hull but 20px to its side: outside
    // the +/-8px hull box, so without a fuse it flies on by.
    function run(withFuse) {
      const { game } = newGame();
      const victim = game.roster[1];
      victim.hp = 100;
      victim.shield = null;

      game.projectiles = [{
        x: victim.x - 26,
        y: victim.y - 20,
        vx: 200,
        vy: 0,
        weapon: 'Missile',
        shooterIdx: 0,
        trigger: withFuse ? 'proximity' : null
      }];
      for (let i = 0; i < 12; i++) game.stepPhysics(1 / 60);
      return victim.hp;
    }

    assert.strictEqual(run(false), 100, 'control: a near miss must not damage');
    assert.ok(run(true) < 100, 'the fuse must air-burst on the pass');
  });

  it('never trips on the shooter\'s own tank at the muzzle', () => {
    const { game } = newGame();
    const shooter = game.roster[0];
    shooter.hp = 100;
    shooter.shield = null;

    fireAt(game, 'Missile', 45, 600, t => {
      t.inventory['Proximity Fuse'] = 1;
    });

    assert.strictEqual(shooter.hp, 100, 'a prox fuse must not detonate on its own muzzle');
  });

  it('ignores a dead tank', () => {
    const { game } = newGame();
    const victim = game.roster[1];
    victim.hp = 0;

    game.projectiles = [{
      x: victim.x - 26,
      y: victim.y - 20,
      vx: 200,
      vy: 0,
      weapon: 'Missile',
      shooterIdx: 0,
      trigger: 'proximity'
    }];
    for (let i = 0; i < 6; i++) game.stepPhysics(1 / 60);

    assert.ok(game.projectiles.length > 0, 'a hulk must not trip the fuse');
  });

  it('does not detonate a Tracer early — the trace is the point', () => {
    const { game } = newGame();
    const victim = game.roster[1];
    victim.hp = 100;

    game.projectiles = [{
      x: victim.x - 26,
      y: victim.y - 20,
      vx: 200,
      vy: 0,
      weapon: 'Tracer',
      shooterIdx: 0,
      trigger: 'proximity',
      path: []
    }];
    for (let i = 0; i < 6; i++) game.stepPhysics(1 / 60);

    assert.ok(game.projectiles.length > 0, 'a tracer must fly on past');
  });
});

describe('determinism', () => {
  // The whole point of re-running this per family: a trigger adds a new branch
  // to the substep loop, and a branch that reads anything unseeded is a silent
  // desync rather than a test failure.
  function replay(weapon, trigger) {
    const { game } = newGame({ seed: 20260822 });
    fireAt(game, weapon, 52, 505, t => {
      if (trigger === 'contact') t.inventory['Contact Trigger'] = 1;
      if (trigger === 'proximity') t.inventory['Proximity Fuse'] = 1;
    });
    return {
      terrain: Array.from(game.terrain.heights),
      hp: game.roster.map(t => t.hp),
      volume: terrainVolume(game)
    };
  }

  for (const weapon of ['Heavy Roller', 'Heavy Sandhog', 'LeapFrog', 'Missile']) {
    for (const trigger of [null, 'contact', 'proximity']) {
      it(`${weapon} + ${trigger || 'no trigger'} replays identically`, () => {
        const a = replay(weapon, trigger);
        const b = replay(weapon, trigger);
        assert.deepStrictEqual(a.terrain, b.terrain, 'terrain must match bit for bit');
        assert.deepStrictEqual(a.hp, b.hp);
        assert.strictEqual(a.volume, b.volume);
      });
    }
  }

  it('a triggered shot actually differs from an untriggered one', () => {
    // Otherwise the replay tests above would pass on a trigger that does
    // nothing at all.
    const plain = replay('Heavy Roller', null);
    const contact = replay('Heavy Roller', 'contact');
    assert.notDeepStrictEqual(plain.terrain, contact.terrain);
  });
});
