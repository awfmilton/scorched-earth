// Tier 4 regressions: previously-dead content is wired and live.
//
// Wind Variability actually varies (or doesn't), purchased structures join
// the holding from replicated inventory keys, and a lobby-chosen chassis
// travels SET_PROFILE → serializeRoom → ROUND_START.

const test = require('node:test');
const assert = require('node:assert');
const RoomManager = require('../lib/room-manager.js');
const { validate } = require('../lib/protocol.js');
const { loadScorched } = require('./helpers/headless-game.js');

function gameWithConfig(extra) {
  const SCORCHED = loadScorched();
  const game = new SCORCHED.Game({ headless: true, seed: 777, gameMode: 'aethercastle' });
  game.start(Object.assign({
    rounds: 5, wallType: 'rubber', startingCash: 20000,
    players: [
      { name: 'P1', color: '#ff0000', type: 'Human' },
      { name: 'P2', color: '#00ff00', type: 'Human' }
    ]
  }, extra));
  return { SCORCHED, game };
}

test("wind 'none' pins the breeze to zero in every round", () => {
  const { game } = gameWithConfig({ windVariability: 'none' });
  assert.strictEqual(game.wind, 0);
  game.newRound(999);
  assert.strictEqual(game.wind, 0, 'a later round re-grew a breeze');
});

test("wind 'constant' banks the first draw and reuses it all match", () => {
  const { game } = gameWithConfig({ windVariability: 'constant' });
  const w1 = game.wind;
  assert.notStrictEqual(w1, 0, 'seed 777 should draw a non-zero wind');
  game.newRound(999);
  assert.strictEqual(game.wind, w1, 'constant wind changed between rounds');

  // The default policy DOES redraw on the same seed pair.
  const { game: g2 } = gameWithConfig({});
  const before = g2.wind;
  g2.newRound(999);
  assert.notStrictEqual(g2.wind, before, 'per-round wind failed to redraw');
});

test("wind 'changing-mid-round' redraws at every local turn boundary, deterministically", () => {
  const { game } = gameWithConfig({ windVariability: 'changing-mid-round' });
  const w0 = game.wind;
  game.nextTurn();
  const w1 = game.wind;
  assert.notStrictEqual(w1, w0, 'boundary did not redraw the wind');

  // Two identical games agree on every draw — the redraw is lockstep-safe.
  const { game: twin } = gameWithConfig({ windVariability: 'changing-mid-round' });
  twin.nextTurn();
  assert.strictEqual(twin.wind, w1, 'two identical clients drew different winds');
});

test('the server honours the wind policy across rounds and boundaries', () => {
  // 'none' pins round 1.
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);
  rm.start('c1', { rounds: 3, windVariability: 'none' });
  assert.strictEqual(room.wind, 0);

  // mid-round: the boundary mints a wind and ships it on TURN_SYNC.
  const rm2 = new RoomManager();
  rm2.createRoom('m1');
  const room2 = rm2.getRoomByConnection('m1');
  rm2.join('m2', room2.code);
  rm2.start('m1', { rounds: 3, windVariability: 'changing-mid-round' });
  rm2.fire('m1', { angle: 45, power: 500, weapon: 'Baby Missile' });
  const res = rm2.resolveShot('m1', { shotId: room2.nextShotId });
  const sync = res.broadcasts.map(b => b.msg).find(m => m.type === 'TURN_SYNC');
  assert.ok(sync, 'no TURN_SYNC from the resolution');
  assert.ok(Number.isFinite(sync.wind), 'mid-round TURN_SYNC must carry wind');
  assert.strictEqual(sync.wind, room2.wind);
  assert.ok(validate(sync).ok, 'the wind-bearing TURN_SYNC must validate');

  // default: TURN_SYNC carries no wind field.
  const rm3 = new RoomManager();
  rm3.createRoom('d1');
  const room3 = rm3.getRoomByConnection('d1');
  rm3.join('d2', room3.code);
  rm3.start('d1', { rounds: 3 });
  rm3.fire('d1', { angle: 45, power: 500, weapon: 'Baby Missile' });
  const res3 = rm3.resolveShot('d1', { shotId: room3.nextShotId });
  const sync3 = res3.broadcasts.map(b => b.msg).find(m => m.type === 'TURN_SYNC');
  assert.strictEqual(sync3.wind, undefined, 'default policy must not ship a wind');
  assert.ok(validate(sync3).ok, 'plain TURN_SYNC must still validate');
});

test('a purchased work joins the holding; classic and the unpaid stay clean', () => {
  const { game } = gameWithConfig({});
  const buyer = game.roster[0];
  const silos = () => game.structures.filter(s =>
    s.key === 'missile-silo' && s.purchased && s.ownerIdx === 0);

  assert.strictEqual(silos().length, 0, 'nobody bought anything yet');

  buyer.inventory['Structure: missile-silo'] = 1;
  game.rebuildStructures();
  assert.strictEqual(silos().length, 1, 'the bought silo never materialised');
  const other = game.structures.filter(s => s.purchased && s.ownerIdx === 1);
  assert.strictEqual(other.length, 0, 'a purchase leaked to another player');

  // A hostile count is capped, not honoured.
  buyer.inventory['Structure: missile-silo'] = 99;
  game.rebuildStructures();
  assert.strictEqual(silos().length, 3, 'purchased copies must cap at 3');

  // Classic fields no structures at all, purchases or not.
  const { game: classic } = (() => {
    const SCORCHED = loadScorched();
    const g = new SCORCHED.Game({ headless: true, seed: 777, gameMode: 'classic' });
    g.start({
      rounds: 1, wallType: 'rubber', startingCash: 20000,
      players: [
        { name: 'P1', color: '#ff0000', type: 'Human' },
        { name: 'P2', color: '#00ff00', type: 'Human' }
      ]
    });
    return { game: g };
  })();
  classic.roster[0].inventory['Structure: missile-silo'] = 1;
  classic.rebuildStructures();
  assert.strictEqual(classic.structures.length, 0, 'classic grew a holding');
});

test('two clients with the same inventories lay out identical purchased holdings', () => {
  const build = () => {
    const { game } = gameWithConfig({});
    game.roster[0].inventory['Structure: repair-bay'] = 2;
    game.roster[1].inventory['Structure: scorpion-crossbow'] = 1;
    game.rebuildStructures();
    return game.structures.map(s => `${s.key}@${s.x.toFixed(3)},${s.y.toFixed(3)}:${s.ownerIdx}${s.purchased ? '+' : ''}`).join('|');
  };
  assert.strictEqual(build(), build(), 'purchased layout is not deterministic');
});

test('structures are buyable and sellable through the normal shop verbs', () => {
  const { game } = gameWithConfig({});
  const buyer = game.roster[0];
  const cash = buyer.cash;

  assert.ok(game.buy(buyer, 'Structure: aether-radar', 1), 'buy refused a structure');
  assert.strictEqual(buyer.inventory['Structure: aether-radar'], 1);
  assert.ok(buyer.cash < cash, 'no money changed hands');

  assert.ok(game.sell(buyer, 'Structure: aether-radar', 1), 'sell refused a structure');
  assert.strictEqual(buyer.inventory['Structure: aether-radar'], 0);
});

test('a lobby-chosen chassis travels SET_PROFILE → ROOM_STATE → ROUND_START', () => {
  const rm = new RoomManager();
  rm.createRoom('c1', false, 'aethercastle');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);

  const res = rm.setProfile('c2', { name: 'RIVET', chassis: 'walker-mech' });
  const state = res.broadcasts.map(b => b.msg).find(m => m.type === 'ROOM_STATE');
  const seat = state.players.find(p => p.name === 'RIVET');
  assert.strictEqual(seat.chassis, 'walker-mech', 'ROOM_STATE dropped the chassis');

  const startRes = rm.start('c1', { rounds: 1 });
  const roundStart = startRes.broadcasts.map(b => b.msg).find(m => m.type === 'ROUND_START');
  const tank = roundStart.tanks.find(t => t.name === 'RIVET');
  assert.strictEqual(tank.chassis, 'walker-mech', 'ROUND_START dropped the chassis');
});
