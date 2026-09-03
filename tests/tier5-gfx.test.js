// Tier 5 regressions: the gfx kit's step 6 is actually finished.
//
// The riot/dirt/Sandstorm burst tiers are reachable, the nuke's long burst
// stays out of the classic replica, the sprite family map covers the digger
// and hopper rounds (and stops dressing Liquid Dirt as fire), and the deaths
// and shield chips that used to be invisible leave a trace.

const test = require('node:test');
const assert = require('node:assert');
const { newGame } = require('./helpers/headless-game.js');
const { recordingContext, loadScorched } = require('./helpers/render-harness.js');
const ACWeapons = require('../gfx/ac-weapons.js');

function drawingGame(gameMode) {
  const { game } = newGame({ gameMode });
  game.headless = false;
  game.explosions = [];
  game.damageNumbers = [];
  return game;
}

test('riot, dirt and Sandstorm detonations reach their kit burst tiers in Aethercastle', () => {
  const game = drawingGame('aethercastle');
  game.onImpact(300, 300, 'Riot Charge', 0);
  game.onImpact(400, 300, 'Dirt Bomb', 0);
  game.onImpact(500, 300, 'Sandstorm', 0);

  const weapons = game.explosions.map(e => e.weapon);
  assert.ok(weapons.includes('Riot Charge'), 'riot burst entry missing');
  assert.ok(weapons.includes('Dirt Bomb'), 'dirt burst entry missing');
  assert.ok(weapons.includes('Sandstorm'), 'sandstorm burst entry missing');
});

test('the classic replica keeps its original dirt-family visuals — no new bursts', () => {
  const game = drawingGame('classic');
  game.onImpact(300, 300, 'Riot Charge', 0);
  game.onImpact(400, 300, 'Dirt Bomb', 0);
  assert.strictEqual(game.explosions.length, 0, 'classic grew burst entries it never had');
});

test("the nuke's doubled burst life is Aethercastle-only", () => {
  const ac = drawingGame('aethercastle');
  ac.explosion(300, 300, 40, 0, undefined, { weapon: 'Nuke' });
  const acNuke = ac.explosions.find(e => e.weapon === 'Nuke');
  assert.strictEqual(acNuke.maxLife, 1, 'AC nuke burst must run twice as long');

  const classic = drawingGame('classic');
  classic.explosion(300, 300, 40, 0, undefined, { weapon: 'Nuke' });
  const clNuke = classic.explosions.find(e => e.weapon === 'Nuke');
  assert.strictEqual(clNuke.maxLife, 0.5, "the replica's burst timing changed");
});

test('the sprite family map covers diggers, hoppers, and soil in flight', () => {
  const SCORCHED = loadScorched();
  const theme = SCORCHED.themeFor('aethercastle');

  const sigOf = (weapon) => {
    const rec = recordingContext();
    ACWeapons.drawProjectileAC(rec, { x: 100.5, y: 100.5, vx: 50, vy: 10, weapon }, theme);
    return rec.__log.join('\n');
  };

  const missile = sigOf('Missile');
  assert.notStrictEqual(sigOf('Digger'), missile, 'Digger still wears the generic missile sprite');
  assert.notStrictEqual(sigOf('Heavy Digger'), missile, 'Heavy Digger still generic');
  assert.notStrictEqual(sigOf('LeapFrog'), missile, 'LeapFrog still generic');

  // Liquid Dirt in flight is soil, not a glowing ember: it must draw like
  // the dirt clod, not like the fire particle.
  assert.strictEqual(sigOf('Liquid Dirt Particle'), sigOf('Dirt Bomb'),
    'Liquid Dirt Particle does not use the dirt sprite');
  assert.notStrictEqual(sigOf('Liquid Dirt Particle'), sigOf('Napalm Particle'),
    'Liquid Dirt Particle still renders as fire');
});

test('every death leaves a burst at the hull — including quiet ones', () => {
  const game = drawingGame('aethercastle');
  const victim = game.roster[1];
  victim.hp = 3;
  victim.shield = null;

  const died = game.applyDamageToTank(victim, 10, game.roster[0]);
  assert.strictEqual(died, true);
  const burst = game.explosions.find(e =>
    Math.abs(e.x - victim.x) < 1 && Math.abs(e.y - (victim.y - 3)) < 1);
  assert.ok(burst, 'a death left no visual trace');
});

test('a deflector chip posts its 50 as a damage number', () => {
  const game = drawingGame('aethercastle');
  const target = game.roster[1];
  target.shield = { type: 'Mag Deflector', hp: 150 };

  // Drop a shell into the dome and step once.
  game.projectiles = [{ x: target.x, y: target.y - 20, vx: 0, vy: 120, weapon: 'Missile', shooterIdx: 0 }];
  for (let i = 0; i < 10 && target.shield && target.shield.hp === 150; i++) {
    game.stepPhysics(1 / 60);
  }

  assert.ok(target.shield.hp < 150, 'precondition: the dome must have been chipped');
  assert.ok(game.damageNumbers.some(dn => dn.text === '50'),
    'the 50hp chip never surfaced as a damage number');
});
