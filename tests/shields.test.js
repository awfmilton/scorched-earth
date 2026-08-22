// The shield family: strength tiers, deflect-vs-absorb, and the single table
// that all three of raise / recharge / draw now read from. AUDIT.md had this
// row as PARTIAL because only Shield / Heavy Shield / Magnetic Shield existed
// and the strength numbers were copy-pasted ternaries at three call sites.

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { newGame } = require('./helpers/headless-game.js');

// Drops a projectile straight onto a tank's hull and runs enough substeps for
// the collision to be seen.
function dropOnHull(game, tank, weapon, ticks) {
  game.projectiles = [{
    x: tank.x,
    y: tank.y - 5,
    vx: 0,
    vy: 60,
    weapon: weapon,
    shooterIdx: 0
  }];
  for (let i = 0; i < (ticks || 3); i++) game.stepPhysics(1 / 60);
  return game.projectiles[0] || null;
}

describe('shield catalogue', () => {
  it('covers the classic tiers, and the shop is generated from the same table', () => {
    const { SCORCHED } = newGame();

    for (const id of ['Shield', 'Heavy Shield', 'Mag Deflector',
                      'Heavy Mag Deflector', 'Super Magno Shield', 'Force Shield']) {
      assert.ok(SCORCHED.SHIELD_TYPES[id], `${id} must exist`);
      const item = SCORCHED.ITEMS.find(i => i.id === id);
      assert.ok(item, `${id} must be buyable`);
      assert.strictEqual(item.kind, 'shield');
      // The shop entry is derived, so these can never disagree.
      assert.strictEqual(item.strength, SCORCHED.SHIELD_TYPES[id].strength);
      assert.strictEqual(item.cost, SCORCHED.SHIELD_TYPES[id].cost);
    }
  });

  it('the deflector split is real: some types deflect, some absorb', () => {
    const { SCORCHED } = newGame();
    const T = SCORCHED.SHIELD_TYPES;

    assert.strictEqual(T['Mag Deflector'].deflects, true);
    assert.strictEqual(T['Heavy Mag Deflector'].deflects, true);
    assert.strictEqual(T['Super Magno Shield'].deflects, true);
    assert.strictEqual(T['Shield'].deflects, false);
    assert.strictEqual(T['Heavy Shield'].deflects, false);
    assert.strictEqual(T['Force Shield'].deflects, false);
  });

  it('priority is strongest first', () => {
    const { SCORCHED } = newGame();
    const strengths = SCORCHED.SHIELD_PRIORITY.map(id => SCORCHED.SHIELD_TYPES[id].strength);
    for (let i = 1; i < strengths.length; i++) {
      assert.ok(strengths[i] < strengths[i - 1], 'SHIELD_PRIORITY must descend by strength');
    }
    assert.strictEqual(SCORCHED.SHIELD_PRIORITY[0], 'Force Shield');
  });
});

describe('raising a shield', () => {
  it('raises the strongest owned and spends exactly that one', () => {
    const { game } = newGame();
    const tank = game.roster[0];
    tank.shield = null;
    tank.inventory['Shield'] = 1;
    tank.inventory['Heavy Shield'] = 1;
    tank.inventory['Force Shield'] = 1;

    const raised = game.raiseBestShield(tank);

    assert.strictEqual(raised.type, 'Force Shield');
    assert.strictEqual(tank.shield.hp, 500);
    assert.strictEqual(tank.inventory['Force Shield'], 0);
    assert.strictEqual(tank.inventory['Heavy Shield'], 1, 'must not spend the others');
    assert.strictEqual(tank.inventory['Shield'], 1);
  });

  it('returns null and leaves the tank bare when it owns nothing', () => {
    const { game } = newGame();
    const tank = game.roster[0];
    tank.shield = null;
    for (const id of Object.keys(tank.inventory)) {
      if (tank.inventory[id] !== Infinity) tank.inventory[id] = 0;
    }
    assert.strictEqual(game.raiseBestShield(tank), null);
    assert.strictEqual(tank.shield, null);
  });

  it('Auto Defense follows the same priority as the start-of-turn raise', () => {
    const { game } = newGame();
    const tank = game.roster[0];
    tank.inventory['Auto Defense'] = 1;
    tank.inventory['Shield'] = 1;
    tank.inventory['Super Magno Shield'] = 1;
    tank.shield = null;

    game.raiseAutoDefenseShield(tank);

    assert.strictEqual(tank.shield.type, 'Super Magno Shield');
    assert.strictEqual(tank.shield.hp, 400);
  });

  it('Auto Defense does nothing without the utility in stock', () => {
    const { game } = newGame();
    const tank = game.roster[0];
    tank.inventory['Auto Defense'] = 0;
    tank.inventory['Force Shield'] = 1;
    tank.shield = null;

    game.raiseAutoDefenseShield(tank);

    assert.strictEqual(tank.shield, null);
    assert.strictEqual(tank.inventory['Force Shield'], 1);
  });
});

describe('Battery recharges to the raised shield\'s own cap', () => {
  it('tops a Super Magno Shield up past the old hard-coded 200 ceiling', () => {
    const { game } = newGame();
    const tank = game.roster[game.activePlayerIdx];
    tank.shield = { type: 'Super Magno Shield', hp: 300 };
    tank.inventory['Battery'] = 1;

    game.raiseShieldForActivePlayer();

    assert.strictEqual(tank.shield.hp, 350, 'Battery is +50 toward the type cap of 400');
    assert.strictEqual(tank.inventory['Battery'], 0);
  });

  it('never overfills, and falls through to hp when the shield is already full', () => {
    const { game } = newGame();
    const tank = game.roster[game.activePlayerIdx];
    tank.shield = { type: 'Mag Deflector', hp: 150 };
    tank.hp = 50;
    tank.inventory['Battery'] = 1;

    game.raiseShieldForActivePlayer();

    assert.strictEqual(tank.shield.hp, 150, 'a full shield must not go over cap');
    assert.strictEqual(tank.hp, 80, 'the charge goes into hp instead');
  });
});

describe('deflect vs absorb at the hull', () => {
  it('a Mag Deflector bounces the shell instead of letting it detonate', () => {
    const { game } = newGame();
    const target = game.roster[1];
    target.hp = 100;
    target.shield = { type: 'Mag Deflector', hp: 150 };

    const proj = dropOnHull(game, target, 'Missile');

    assert.ok(proj, 'the shell must survive the bounce');
    assert.ok(proj.vy < 0, 'and be travelling back upward');
    assert.strictEqual(target.hp, 100, 'a deflected shell does no damage');
    assert.strictEqual(target.shield.hp, 100, 'the bounce costs the shield 50');
  });

  it('every deflecting type bounces; no absorbing type does', () => {
    for (const [type, conf] of Object.entries(newGame().SCORCHED.SHIELD_TYPES)) {
      const { game } = newGame();
      const target = game.roster[1];
      target.hp = 100;
      target.shield = { type: type, hp: conf.strength };
      // No Auto Defense, so a collapsed shield stays collapsed.
      target.inventory['Auto Defense'] = 0;

      const proj = dropOnHull(game, target, 'Missile');

      if (conf.deflects) {
        assert.ok(proj, `${type} must deflect the shell`);
        assert.strictEqual(target.hp, 100, `${type} must leave hp untouched`);
      } else {
        assert.strictEqual(proj, null, `${type} must let the shell detonate`);
        assert.ok(target.shield === null || target.shield.hp < conf.strength,
          `${type} must absorb the blast into shield strength`);
      }
    }
  });

  it('a Force Shield absorbs a Missile outright — hp never moves', () => {
    const { game } = newGame();
    const target = game.roster[1];
    target.hp = 100;
    target.shield = { type: 'Force Shield', hp: 500 };

    dropOnHull(game, target, 'Missile');

    assert.strictEqual(target.hp, 100, '500 strength must eat a Missile whole');
    assert.ok(target.shield.hp < 500);
  });

  it('a deflector that runs out of strength stops deflecting', () => {
    const { game } = newGame();
    const target = game.roster[1];
    target.hp = 100;
    target.shield = { type: 'Mag Deflector', hp: 40 };
    target.inventory['Auto Defense'] = 0;

    // 40 strength is less than the 50 a bounce costs, so this is the last one.
    dropOnHull(game, target, 'Missile');
    assert.strictEqual(target.shield, null, 'the field collapses on the bounce');
  });

  it('Auto Defense re-raises after a deflector collapses on a bounce', () => {
    const { game } = newGame();
    const target = game.roster[1];
    target.hp = 100;
    target.shield = { type: 'Mag Deflector', hp: 40 };
    target.inventory['Auto Defense'] = 1;
    target.inventory['Heavy Shield'] = 1;

    dropOnHull(game, target, 'Missile');

    assert.ok(target.shield, 'Auto Defense must cover the collapse');
    assert.strictEqual(target.shield.type, 'Heavy Shield');
  });
});
