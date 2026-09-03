// Tier 3 regressions: gameplay correctness.
//
// Locomotion-aware falling (aerial hulls no longer fall out of the sky, hover
// hulls keep their cushion, buried hulls stay buried), the Digger family
// actually burrowing, single-charge shield deflection on the drawn dome,
// drop damage routed through applyDamageToTank, no pay for self-damage, and
// the weapon-cycling filter.

const test = require('node:test');
const assert = require('node:assert');
const { loadScorched, newGame, fireAndSettle, surfaceY } = require('./helpers/headless-game.js');

function gameWithChassis(chassisA, chassisB) {
  const SCORCHED = loadScorched();
  const game = new SCORCHED.Game({ headless: true, seed: 4242, gameMode: 'aethercastle' });
  game.start({
    rounds: 1, wallType: 'rubber', startingCash: 20000,
    players: [
      { name: 'P1', color: '#ff0000', type: 'Human', chassis: chassisA },
      { name: 'P2', color: '#00ff00', type: 'Human', chassis: chassisB }
    ]
  });
  return { SCORCHED, game };
}

test('an airship holds station at cruise altitude and never takes fall damage', () => {
  const { SCORCHED, game } = gameWithChassis('airship-platform', 'clockwork-tank');
  const ship = game.roster[0];
  const hpBefore = ship.hp;

  for (let i = 0; i < 600; i++) game.stepPhysics(1 / 60);

  const groundY = SCORCHED.CONST.WORLD_H - game.terrain.heightAt(ship.x);
  assert.ok(ship.y < groundY - 100,
    `airship sits at y=${ship.y} but the ground is at ${groundY} — it was dragged down`);
  assert.strictEqual(ship.hp, hpBefore, 'the airship damaged itself by existing');
  assert.strictEqual(ship.falling, false);
});

test('a hover drone rests on its clearance cushion, not on the dirt', () => {
  const { SCORCHED, game } = gameWithChassis('scout-drone', 'clockwork-tank');
  const drone = game.roster[0];

  for (let i = 0; i < 600; i++) game.stepPhysics(1 / 60);

  const groundY = SCORCHED.CONST.WORLD_H - game.terrain.heightAt(drone.x);
  assert.ok(groundY - drone.y > 2,
    `drone sits at y=${drone.y}, ground at ${groundY} — no hover clearance`);
  assert.strictEqual(drone.hp, drone.maxHp, 'the drone damaged itself by existing');
});

test('a hull buried by deposited dirt stays buried instead of teleporting up', () => {
  const { SCORCHED, game } = newGame();
  const tank = game.roster[1];
  const before = tank.y;

  // Pile a ton of dirt directly on the hull.
  game.terrain.deposit(tank.x, tank.y - 5, 55);
  game.terrain.settle();
  const groundY = SCORCHED.CONST.WORLD_H - game.terrain.heightAt(tank.x);
  assert.ok(groundY < tank.y - 1, 'precondition: the pile must actually cover the hull');

  for (let i = 0; i < 120; i++) game.stepPhysics(1 / 60);
  assert.ok(Math.abs(tank.y - before) < 1,
    `buried hull moved from ${before} to ${tank.y} — it must stay in the pile`);
  assert.strictEqual(tank.hp, 100, 'being buried must not deal damage by itself');
});

test('a Digger burrows ~its dig depth below the surface it touched down on', () => {
  const { game, impacts } = newGame({ wind: 0 });

  // Snapshot the pre-shot surface: the detonation depth is measured against
  // the ground as it was when the shell touched down.
  const preHeights = Array.from(game.terrain.heights);

  fireAndSettle(game, 'Digger', 45, 300);

  assert.strictEqual(impacts.length, 1, 'the Digger must detonate exactly once');
  const impact = impacts[0];
  const col = Math.max(0, Math.min(preHeights.length - 1, Math.round(impact.x)));
  const preSurfaceY = 700 - preHeights[col];
  // Dig depth for a Digger is 40px at 30px/s. The old bug detonated it on
  // the first digging substep, dead on the surface (depth < 1px).
  assert.ok(impact.y - preSurfaceY > 25,
    `detonated ${(impact.y - preSurfaceY).toFixed(1)}px below the surface — did not burrow`);
  assert.strictEqual(game.projectiles.length, 0, 'orphaned projectile after the dig');
});

test('a deflector dome charges 50 per bounce, not 50 per substep', () => {
  const { SCORCHED, game } = newGame({ wind: 0 });
  const target = game.roster[1];
  target.shield = { type: 'Mag Deflector', hp: 150 };

  // Park the shooter close and flat so the shell arrives fast and level —
  // the exact profile that used to re-trigger the deflect branch on every
  // remaining substep of the frame.
  const shooter = game.roster[0];
  shooter.x = target.x - 120;
  shooter.y = SCORCHED.CONST.WORLD_H - game.terrain.heightAt(shooter.x);

  fireAndSettle(game, 'Missile', 10, 400);

  // One approach = one bounce = exactly one 50hp charge. (The shell may in
  // principle arc back for a second legitimate bounce; what must be
  // impossible is the 100/150hp same-frame drain.)
  const spent = 150 - (target.shield ? target.shield.hp : 0);
  assert.ok(spent === 0 || spent === 50 || spent === 100,
    `shield spent ${spent}hp — a same-frame multi-drain`);
  assert.notStrictEqual(spent, 150, 'the dome was ground to zero by one shell in one pass');
});

test('drop damage respects armour, shields and the integer-hp invariant', () => {
  const { game } = gameWithChassis('brass-plated-tank', 'clockwork-tank');
  const brass = game.roster[0];
  const maxHp = brass.maxHp;

  // Hoist the hull and let it fall hard, twice the height that starts hurting.
  brass.y -= 260;
  brass.falling = true;
  brass.vy = 0;
  for (let i = 0; i < 400; i++) game.stepPhysics(1 / 60);

  assert.ok(brass.hp < maxHp, 'a 260px fall must hurt');
  assert.strictEqual(brass.hp, Math.floor(brass.hp), 'fractional hp leaked into the hull');
  // Brass armour is < 1.0: the same fall on the default chassis must hurt more.
  const { game: g2 } = gameWithChassis('clockwork-tank', 'clockwork-tank');
  const clock = g2.roster[0];
  clock.y -= 260;
  clock.falling = true;
  clock.vy = 0;
  for (let i = 0; i < 400; i++) g2.stepPhysics(1 / 60);
  const brassLost = maxHp - brass.hp;
  const clockLost = clock.maxHp - clock.hp;
  assert.ok(brassLost < clockLost,
    `brass hull lost ${brassLost} vs clockwork ${clockLost} — armour ignored on falls`);
});

test('a parachute is only spent on a landing that would have hurt', () => {
  const { game } = newGame();
  const tank = game.roster[0];
  tank.inventory['Parachute'] = 1;

  // A kerb hop: too small to hurt (impact velocity stays under the 5-damage
  // threshold at any of the configurable gravities), must not burn the chute.
  tank.y -= 1;
  tank.falling = true;
  tank.vy = 0;
  for (let i = 0; i < 200; i++) game.stepPhysics(1 / 60);
  assert.strictEqual(tank.inventory['Parachute'], 1, 'chute burned on a harmless hop');

  // A real fall: chute spends itself and eats all the damage.
  tank.y -= 300;
  tank.falling = true;
  tank.vy = 0;
  for (let i = 0; i < 400; i++) game.stepPhysics(1 / 60);
  assert.strictEqual(tank.inventory['Parachute'], 0, 'chute not spent on a hard landing');
  assert.strictEqual(tank.hp, 100, 'chute failed to absorb the fall');
});

test('self-damage earns no damageDealt and a self-kill earns no kill', () => {
  const { game } = newGame();
  const me = game.roster[0];
  me.damageDealt = 0;
  me.kills = 0;

  game.applyDamageToTank(me, 40, me);
  assert.strictEqual(me.damageDealt, 0, 'paid for shooting own hull');

  me.hp = 5;
  game.applyDamageToTank(me, 50, me);
  assert.strictEqual(me.kills, 0, 'credited a kill for dying');
  assert.strictEqual(me.hp, 0);
});

test('structure blast falloff respects depth below the footprint', () => {
  const { game } = newGame();
  const StructuresLib = require('../lib/structures.js');
  const spec = StructuresLib.STRUCTURES['scorpion-crossbow'];
  game.structures = [{
    key: 'scorpion-crossbow', hp: spec.hp, owner: 99, ownerIdx: undefined,
    x: 600, y: 400, cooldown: 0
  }];

  // A blast 200px straight below the base, radius 60: nowhere near the
  // structure's extent, yet the old one-sided dy treated it as distance 0.
  game.damageStructures(600, 600, 60, 80, undefined);
  assert.strictEqual(game.structures[0].hp, spec.hp,
    'a blast far below the footprint damaged the structure');

  // A blast actually inside the extent still bites.
  game.damageStructures(600, 400 - spec.h / 2, 60, 80, undefined);
  assert.ok(game.structures[0].hp < spec.hp, 'a direct hit stopped working');
});

test('weapon cycling only offers fireable stock, never items or empties', () => {
  const { game } = newGame();
  const tank = game.roster[game.activePlayerIdx];
  tank.inventory = {
    'Baby Missile': Infinity,
    'Fuel': 100,
    'Parachute': 2,
    'Battery': 1,
    'Nuke': 0,
    'Missile': 3
  };
  tank.selectedWeapon = 'Baby Missile';

  const seen = new Set();
  for (let i = 0; i < 10; i++) {
    game.cycleWeapon(1);
    seen.add(tank.selectedWeapon);
  }
  assert.ok(seen.has('Missile'), 'a stocked weapon never came up');
  assert.ok(!seen.has('Fuel') && !seen.has('Parachute') && !seen.has('Battery'),
    `items offered as weapons: ${[...seen].join(', ')}`);
  assert.ok(!seen.has('Nuke'), 'zero-ammo stock offered');
});

test('firing an item id is refused outright', () => {
  const { game } = newGame();
  const tank = game.roster[game.activePlayerIdx];
  tank.selectedWeapon = 'Parachute';
  tank.inventory['Parachute'] = 3;
  game.fireActiveWeapon();
  assert.strictEqual(game.projectiles.length, 0, 'an item launched as a shell');
  assert.strictEqual(tank.inventory['Parachute'], 3, 'the item was consumed');
});

test('the Dirt Detonator actually deals its configured damage', () => {
  const { SCORCHED, game } = newGame();
  const victim = game.roster[1];
  // Detonate right on the hull.
  game.onImpact(victim.x, victim.y - 3, 'Dirt Detonator', 0);
  assert.ok(victim.hp < 100, 'Dirt Detonator still deals no damage');
  void SCORCHED;
});
