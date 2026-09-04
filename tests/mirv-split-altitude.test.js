// A MIRV must not do its one interesting thing off-screen.
//
// The apex split had no altitude bound: it fired wherever
// `prevVy < 0 && proj.vy >= 0` first held, which on a high-power shot is far
// above the 700px ceiling -- measured at y=-1444 for angle 75, power 1000.
// From the player's chair the round simply vanished off the top, spent several
// seconds in empty sky, and warheads arrived from nowhere.
//
// The apex is still where it splits. It is only held until the shell is back
// inside the playfield, so a low shot is completely unaffected.

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { newGame } = require('./helpers/headless-game.js');

const SPLITTERS = ['MIRV', "Death's Head"];

// Fire `weapon` and report where the split actually happened, by watching for
// the tick on which the projectile count grows.
function splitAltitude(game, CONST, weapon, angle, power) {
  const tank = game.roster[game.activePlayerIdx];
  tank.angle = angle;
  tank.power = power;
  tank.selectedWeapon = weapon;
  tank.inventory[weapon] = 1;

  let apexY = null;
  let splitY = null;
  let subCount = 0;

  game.fireActiveWeapon();
  for (let i = 0; i < 4000 && game.projectiles.length; i++) {
    for (const p of game.projectiles) {
      if (apexY === null || p.y < apexY) apexY = p.y;
    }
    const before = game.projectiles.length;
    const yBefore = game.projectiles[0].y;
    game.stepPhysics(1 / 60);
    if (splitY === null && game.projectiles.length > before) {
      splitY = yBefore;
      subCount = game.projectiles.length;
    }
  }
  return { apexY, splitY, subCount };
}

describe('the MIRV family splits inside the world', () => {
  for (const weapon of SPLITTERS) {
    it(`${weapon}: a high-power shot does not split above the ceiling`, () => {
      const { SCORCHED, game } = newGame({ gameMode: 'aethercastle' });
      const CONST = SCORCHED.CONST;
      const r = splitAltitude(game, CONST, weapon, 75, 1000);

      assert.ok(r.splitY !== null, `${weapon} never split at all`);
      assert.ok(r.apexY < 0,
        `this test is only meaningful if the shot leaves the world; apex was ${r.apexY}`);
      assert.ok(r.splitY >= 0,
        `${weapon} split at y=${r.splitY}, ${Math.round(-r.splitY)}px ABOVE the ceiling where the player cannot see it`);
      assert.ok(r.splitY <= CONST.WORLD_H,
        `${weapon} split at y=${r.splitY}, below the world floor`);
    });

    it(`${weapon}: a low shot still splits exactly at its apex`, () => {
      // The bound must not disturb a shot that never leaves the playfield.
      const { SCORCHED, game } = newGame({ gameMode: 'aethercastle' });
      const r = splitAltitude(game, SCORCHED.CONST, weapon, 45, 400);

      assert.ok(r.splitY !== null, `${weapon} never split at all`);
      assert.ok(r.apexY >= 0,
        `this test needs an on-screen apex; got ${r.apexY}`);
      assert.ok(Math.abs(r.splitY - r.apexY) < 2,
        `${weapon} split at y=${r.splitY} but its apex was ${r.apexY} — a low shot must be untouched`);
    });

    it(`${weapon}: still produces its sub-munitions`, () => {
      const { SCORCHED, game } = newGame({ gameMode: 'aethercastle' });
      const r = splitAltitude(game, SCORCHED.CONST, weapon, 75, 1000);
      const expected = weapon === 'MIRV' ? 5 : 9;
      assert.strictEqual(r.subCount, expected,
        `${weapon} should split into ${expected} warheads, got ${r.subCount}`);
    });
  }
});
