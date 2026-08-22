// Shop economics: bulk buying, selling back, and the inventory surviving the
// round boundary. These are the money rules, so they get asserted rather than
// eyeballed through the DOM.

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { newGame } = require('./helpers/headless-game.js');

function freshBuyer(cash) {
  const { SCORCHED, game } = newGame();
  const tank = game.roster[0];
  tank.cash = cash === undefined ? 10000 : cash;
  tank.inventory = {};
  return { SCORCHED, game, tank };
}

describe('buying', () => {
  it('one click buys one pack', () => {
    const { game, tank } = freshBuyer(10000);
    assert.strictEqual(game.buy(tank, 'Missile'), true);
    assert.strictEqual(tank.inventory['Missile'], 5, 'one pack of Missile is 5 rounds');
    assert.strictEqual(tank.cash, 9500);
  });

  it('a bulk order multiplies both the charge and the delivery', () => {
    const { game, tank } = freshBuyer(10000);
    assert.strictEqual(game.buy(tank, 'Missile', 10), true);
    assert.strictEqual(tank.inventory['Missile'], 50);
    assert.strictEqual(tank.cash, 5000);
  });

  it('refuses a bulk order it cannot afford without charging for a partial one', () => {
    const { game, tank } = freshBuyer(1200);
    assert.strictEqual(game.buy(tank, 'Missile', 10), false, '10 packs cost 5000');
    assert.strictEqual(tank.cash, 1200, 'a refused order must not move any money');
    assert.strictEqual(tank.inventory['Missile'], undefined, 'and must deliver nothing');

    // The affordable order still goes through.
    assert.strictEqual(game.buy(tank, 'Missile', 2), true);
    assert.strictEqual(tank.cash, 200);
  });

  it('buys items as well as weapons', () => {
    const { game, tank } = freshBuyer(10000);
    assert.strictEqual(game.buy(tank, 'Parachute', 2), true);
    assert.strictEqual(tank.inventory['Parachute'], 6, '3 per pack, 2 packs');
  });

  it('rejects an unknown id outright', () => {
    const { game, tank } = freshBuyer(10000);
    assert.strictEqual(game.buy(tank, 'Orbital Death Ray'), false);
    assert.strictEqual(tank.cash, 10000);
  });
});

describe('selling', () => {
  it('returns cash and takes the items away', () => {
    const { game, tank } = freshBuyer(10000);
    game.buy(tank, 'Missile');            // 5 rounds for 500
    assert.strictEqual(game.sell(tank, 'Missile', 2), true);
    assert.strictEqual(tank.inventory['Missile'], 3);
    assert.strictEqual(tank.cash, 9700, '2 rounds back at 100 each');
  });

  it('a full buy-then-sell round trip is exact when the pack price divides evenly', () => {
    const { game, tank } = freshBuyer(10000);
    game.buy(tank, 'Missile', 3);          // 500 for 5 => 100 each, exact
    const owned = tank.inventory['Missile'];
    assert.strictEqual(game.sell(tank, 'Missile', owned), true);
    assert.strictEqual(tank.inventory['Missile'], 0);
    assert.strictEqual(tank.cash, 10000, 'selling everything back must undo the purchase');
  });

  it('never refunds more than was paid, whatever the pack price rounds to', () => {
    // The per-item refund is floor(cost / packSize), so a pack whose price does
    // not divide evenly (Roller is 2000 for 3) loses the remainder. Rounding
    // DOWN is the safe direction: the shop can shave a few dollars, never mint.
    const { SCORCHED, game } = newGame();
    for (const conf of SCORCHED.WEAPONS.concat(Array.from(SCORCHED.ITEMS))) {
      const tank = game.roster[0];
      tank.cash = 100000;
      tank.inventory = {};
      if (!game.buy(tank, conf.id, 2)) continue;
      game.sell(tank, conf.id, tank.inventory[conf.id]);
      assert.ok(
        tank.cash <= 100000,
        `${conf.id}: buying and selling back returned more than it cost`
      );
    }
  });

  it('refuses to sell more than is owned, and changes nothing when it does', () => {
    const { game, tank } = freshBuyer(10000);
    game.buy(tank, 'Missile');
    assert.strictEqual(game.sell(tank, 'Missile', 6), false);
    assert.strictEqual(tank.inventory['Missile'], 5);
    assert.strictEqual(tank.cash, 9500);
  });

  it('refuses to sell something never owned', () => {
    const { game, tank } = freshBuyer(10000);
    assert.strictEqual(game.sell(tank, 'Nuke', 1), false);
    assert.strictEqual(tank.cash, 10000);
  });

  it('rejects an unknown id', () => {
    const { game, tank } = freshBuyer(10000);
    assert.strictEqual(game.sell(tank, 'Orbital Death Ray', 1), false);
  });

  it('cannot be used to mint money by cycling a pack', () => {
    const { game, tank } = freshBuyer(10000);
    for (let i = 0; i < 25; i++) {
      game.buy(tank, 'Baby Nuke', 2);
      game.sell(tank, 'Baby Nuke', tank.inventory['Baby Nuke']);
    }
    assert.strictEqual(tank.cash, 10000, 'churning the shop must never increase cash');
  });
});

describe('inventory across the round boundary', () => {
  it('survives startNextRound, and the tank is otherwise reset', () => {
    const { game } = newGame();
    const tank = game.roster[0];
    tank.cash = 10000;
    tank.inventory = {};
    game.buy(tank, 'Nuke', 2);
    game.buy(tank, 'Heavy Shield');
    tank.hp = 17;

    const nukesBefore = tank.inventory['Nuke'];
    const cashBefore = tank.cash;

    game.startNextRound();

    assert.strictEqual(tank.inventory['Nuke'], nukesBefore, 'unspent ammo carries over');
    assert.strictEqual(tank.cash, cashBefore, 'and so does unspent cash');
    assert.strictEqual(tank.hp, 100, 'but the tank is repaired for the new round');
  });
});
