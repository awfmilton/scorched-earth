// A tank's kit is simulation input, so every client needs the same copy of it.
//
// Buying is local and there is no per-purchase wire message, so a shield, a
// Battery, an Auto Defense or a Parachute used to exist on exactly one machine.
// Four separate reads of that data run on EVERY machine, though:
//
//   - raiseShieldForActivePlayer() at every turn boundary,
//   - the Battery heal / recharge in the same pass,
//   - raiseAutoDefenseShield() mid-blast when a shield collapses,
//   - the Parachute check that cancels a tank's fall damage.
//
// Each one silently forks the world: the owner absorbs a hit their opponents
// watch land, hp diverges, and divergent hp changes which chain reactions fire,
// which carves different terrain, which feeds back into the structures pass.
// That is issue #249 — a shield discrepancy stopped being a disagreement about
// a hp bar once the holding started reading it.
//
// The fix replicates the data rather than relaying each of the four events: the
// owner declares its kit when it closes the shop, the server restates it to
// everyone in the next ROUND_START, and all four reads then agree by
// construction. See lib/room-manager.js tankEntry().

const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');

const RoomManager = require('../lib/room-manager.js');
const { validate, sanitiseInventory } = require('../lib/protocol.js');
const { newGame } = require('./helpers/headless-game.js');

function twoPlayerRoom() {
  const rm = new RoomManager();
  rm.createRoom('conn_1');
  const room = rm.getRoomByConnection('conn_1');
  rm.join('conn_2', room.code);
  rm.start('conn_1', { rounds: 3 });
  return { rm, room };
}

// Ends the current round with slot 0 surviving, leaving the room in 'shopping'.
function endRound(rm, room, survivorSlot = 0) {
  const shooter = room.players.get(room.activeSlot);
  const fireRes = rm.fire(shooter.connectionId, { angle: 45, power: 500 });
  const shotId = fireRes.broadcasts[0].msg.shotId;
  const eliminated = Array.from(room.players.keys()).filter(s => s !== survivorSlot);
  return rm.resolveShot(shooter.connectionId, { shotId, eliminated });
}

function roundStartFor(result, connectionId) {
  const b = result.broadcasts.find(x =>
    x.msg.type === 'ROUND_START' && x.to.includes(connectionId));
  assert.ok(b, `expected a ROUND_START addressed to ${connectionId}`);
  return b.msg;
}

describe('SHOP_DONE carries the kit the server has no other way to learn', () => {
  it('stores what a player declares and restates it to EVERY client next round', () => {
    const { rm, room } = twoPlayerRoom();
    endRound(rm, room);

    rm.shopDone('conn_1', { inventory: { 'Heavy Shield': 2, 'Battery': 3 } });
    const res = rm.shopDone('conn_2', { inventory: { 'Parachute': 1 } });

    // The point of the whole change: slot 0's shields are visible to slot 1,
    // and slot 1's parachute is visible to slot 0. Both clients read the same
    // numbers when the turn boundary and the fall physics consult them.
    for (const conn of ['conn_1', 'conn_2']) {
      const tanks = roundStartFor(res, conn).tanks;
      const s0 = tanks.find(t => t.slot === 0);
      const s1 = tanks.find(t => t.slot === 1);
      assert.deepStrictEqual(s0.inventory, { 'Heavy Shield': 2, 'Battery': 3 });
      assert.deepStrictEqual(s1.inventory, { 'Parachute': 1 });
    }
  });

  it('keeps the last known kit when a client sends none', () => {
    const { rm, room } = twoPlayerRoom();

    endRound(rm, room);
    rm.shopDone('conn_1', { inventory: { 'Force Shield': 1 } });
    rm.shopDone('conn_2', {});

    // Round 2 ends; slot 0 closes the next shop without declaring anything —
    // an older build, or a frame that lost its field. Wiping the slot would
    // desync everyone back to square one, so the server holds what it had.
    endRound(rm, room);
    rm.shopDone('conn_1');
    const res = rm.shopDone('conn_2');

    const s0 = roundStartFor(res, 'conn_2').tanks.find(t => t.slot === 0);
    assert.deepStrictEqual(s0.inventory, { 'Force Shield': 1 });
  });

  it('omits the field entirely on round 1, where no shop has happened yet', () => {
    const rm = new RoomManager();
    rm.createRoom('conn_1');
    const room = rm.getRoomByConnection('conn_1');
    rm.join('conn_2', room.code);
    const res = rm.start('conn_1', { rounds: 3 });

    for (const t of roundStartFor(res, 'conn_1').tanks) {
      assert.strictEqual(t.inventory, undefined,
        'round 1 must leave clients on the base loadout they each build');
    }
  });

  it('clears a stored kit at match start, so a fresh match does not inherit one', () => {
    const { rm, room } = twoPlayerRoom();
    endRound(rm, room);
    rm.shopDone('conn_1', { inventory: { 'Force Shield': 9 } });
    rm.shopDone('conn_2', {});
    assert.deepStrictEqual(room.players.get(0).inventory, { 'Force Shield': 9 });

    // START_GAME is refused outside the lobby, so today the only way back here
    // is a new room — this asserts the guarantee rather than a reachable
    // rematch. It matters the moment a room is ever allowed to re-lobby: a kit
    // carried into round 1 is free cash that only one player gets.
    room.phase = 'lobby';
    const res = rm.start('conn_1', { rounds: 3 });

    assert.strictEqual(room.players.get(0).inventory, null);
    for (const t of roundStartFor(res, 'conn_1').tanks) {
      assert.strictEqual(t.inventory, undefined);
    }
  });

  it('sanitises rather than trusts: junk counts are dropped, the room is not', () => {
    const { rm, room } = twoPlayerRoom();
    endRound(rm, room);

    rm.shopDone('conn_1', {
      inventory: {
        'Heavy Shield': 2,
        'Battery': -5,           // negative
        'Parachute': 1.5,        // fractional
        'Fuel': 'lots',          // wrong type
        'Teleport': Number.NaN   // not an integer
      }
    });

    assert.deepStrictEqual(room.players.get(0).inventory, { 'Heavy Shield': 2 },
      'only the well-formed entries survive');
  });

  it('bounds the object so one client cannot push arbitrary weight at the room', () => {
    const huge = {};
    for (let i = 0; i < 200; i++) huge[`item${i}`] = 1;
    assert.strictEqual(Object.keys(sanitiseInventory(huge)).length, 64);

    const longKey = {};
    longKey['x'.repeat(500)] = 1;
    longKey['Battery'] = 1;
    assert.deepStrictEqual(sanitiseInventory(longKey), { 'Battery': 1 });

    assert.strictEqual(sanitiseInventory(null), null);
    assert.strictEqual(sanitiseInventory([1, 2, 3]), null);
    assert.strictEqual(sanitiseInventory({}), null);
  });

  it('rejects a malformed inventory at the protocol boundary', () => {
    assert.strictEqual(validate({ type: 'SHOP_DONE' }).ok, true,
      'the field is optional — an older client still validates');
    assert.strictEqual(validate({ type: 'SHOP_DONE', inventory: {} }).ok, true);
    assert.strictEqual(validate({ type: 'SHOP_DONE', inventory: { 'Battery': 2 } }).ok, true);

    assert.strictEqual(validate({ type: 'SHOP_DONE', inventory: [] }).ok, false);
    assert.strictEqual(validate({ type: 'SHOP_DONE', inventory: { 'Battery': -1 } }).ok, false);
    assert.strictEqual(validate({ type: 'SHOP_DONE', inventory: { 'Battery': 1.5 } }).ok, false);
    assert.strictEqual(validate({ type: 'SHOP_DONE', inventory: { 'Battery': 'two' } }).ok, false);
  });
});

describe('The client builds a kit from the base loadout plus the server copy', () => {
  it('omits infinite stock when declaring, because JSON cannot carry it', () => {
    const { game } = newGame();
    game.mySlot = game.roster[0].slot;
    game.roster[0].inventory = {
      'Baby Missile': Infinity,   // would stringify to null
      'Heavy Shield': 2,
      'Battery': 0,               // nothing held, nothing to say
      'Missile': 4
    };

    // Spread into this realm first: each newGame() boots its own vm context, so
    // an object built in there is structurally identical but not
    // reference-equal to one built here, and deepStrictEqual compares
    // prototypes.
    assert.deepStrictEqual({ ...game.declaredInventory() },
      { 'Heavy Shield': 2, 'Missile': 4 });
  });

  it('rebuilds infinite stock from the base loadout instead of from the wire', () => {
    const { game } = newGame();
    const built = game.buildInventory({ 'Heavy Shield': 1 }, 100);

    assert.strictEqual(built['Baby Missile'], Infinity,
      'the free weapon comes from the base loadout, not the server');
    assert.strictEqual(built['Heavy Shield'], 1);
  });

  it('keeps the chassis fuel allowance as a floor under a bought stock', () => {
    const { game } = newGame();

    // Bought fuel beats the allowance.
    assert.strictEqual(game.buildInventory({ 'Fuel': 250 }, 100)['Fuel'], 250);
    // A spent stock is topped back up to the allowance, as grantRoundFuel does.
    assert.strictEqual(game.buildInventory({ 'Fuel': 10 }, 100)['Fuel'], 100);
    // No declaration at all leaves the allowance untouched.
    assert.strictEqual(game.buildInventory(undefined, 100)['Fuel'], 100);
  });

  it('overlays a server kit onto the right slot and leaves the rest alone', () => {
    const { game } = newGame();
    game.roster[0].slot = 0;
    game.roster[1].slot = 1;
    game.roster[1].inventory['Missile'] = 7;

    game.applyServerInventories([
      { slot: 1, inventory: { 'Heavy Shield': 3 } },
      { slot: 0 }                                    // nothing declared
    ]);

    assert.strictEqual(game.roster[1].inventory['Heavy Shield'], 3);
    assert.strictEqual(game.roster[1].inventory['Missile'], 7,
      'an overlay adds and replaces, it does not wipe');
    assert.strictEqual(game.roster[0].inventory['Heavy Shield'], undefined);
  });
});

describe('Two clients agree about a shield they did not buy', () => {
  // The regression itself. `owner` is the machine that shopped; `watcher` is
  // any other player in the room. Before replication the watcher had no entry
  // for the shield and simply did not raise one.
  function twoClients(serverTanks) {
    const owner = newGame({ seed: 8080 }).game;
    const watcher = newGame({ seed: 8080 }).game;
    for (const g of [owner, watcher]) {
      g.roster[0].slot = 0;
      g.roster[1].slot = 1;
      g.applyServerInventories(serverTanks);
    }
    return { owner, watcher };
  }

  it('raises the same shield on both clients at the turn boundary', () => {
    const { owner, watcher } = twoClients([
      { slot: 0, inventory: { 'Heavy Shield': 1 } }
    ]);

    for (const g of [owner, watcher]) {
      g.roster[0].shield = null;
      g.activePlayerIdx = 0;
      g.raiseShieldForActivePlayer();
    }

    assert.deepStrictEqual({ ...owner.roster[0].shield },
      { type: 'Heavy Shield', hp: 200 });
    assert.deepStrictEqual({ ...watcher.roster[0].shield }, { ...owner.roster[0].shield },
      'the watcher must raise the shield it can now see in the replicated kit');
    assert.strictEqual(watcher.roster[0].inventory['Heavy Shield'], 0,
      'and spend it, so the next boundary agrees too');
  });

  it('spends a Battery identically on both clients', () => {
    const { owner, watcher } = twoClients([
      { slot: 0, inventory: { 'Battery': 2 } }
    ]);

    for (const g of [owner, watcher]) {
      g.roster[0].hp = 50;
      g.roster[0].shield = null;
      g.activePlayerIdx = 0;
      g.raiseShieldForActivePlayer();
    }

    assert.strictEqual(owner.roster[0].hp, 80);
    assert.strictEqual(watcher.roster[0].hp, owner.roster[0].hp,
      'a Battery heal that only one client applies is a hp fork');
    assert.strictEqual(watcher.roster[0].inventory['Battery'], 1);
  });

  it('runs Auto Defense on both clients when a shield collapses mid-blast', () => {
    // Auto Defense is why relaying the turn-boundary raise alone would not have
    // closed this: it fires INSIDE damage resolution, where there is no round
    // trip to be had. Replicating the kit is what makes it agree.
    const { owner, watcher } = twoClients([
      { slot: 0, inventory: { 'Auto Defense': 1, 'Shield': 1 } }
    ]);

    for (const g of [owner, watcher]) {
      g.roster[0].shield = { type: 'Shield', hp: 0 };
      g.raiseAutoDefenseShield(g.roster[0]);
    }

    assert.deepStrictEqual({ ...owner.roster[0].shield }, { type: 'Shield', hp: 100 });
    assert.deepStrictEqual({ ...watcher.roster[0].shield }, { ...owner.roster[0].shield });
  });

  it('cancels a fall on both clients when the falling tank holds a Parachute', () => {
    const { owner, watcher } = twoClients([
      { slot: 1, inventory: { 'Parachute': 1 } }
    ]);

    for (const g of [owner, watcher]) {
      assert.strictEqual(g.roster[1].inventory['Parachute'], 1,
        'both clients must see the parachute before the drop is simulated');
    }
  });
});
