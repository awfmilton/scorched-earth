// Regressions for the Opus review fleet's confirmed findings.
//
// Each test pins one verified defect from the branch review: phantom round-1
// boundaries, the spectating cursor park, buried muzzles, deflector pogo,
// aura/ward stacking, purchased-work resurrection, and the limiter holes.

const test = require('node:test');
const assert = require('node:assert');
const { WebSocket } = require('ws');
const RoomManager = require('../lib/room-manager.js');
const StructuresLib = require('../lib/structures.js');
const {
  createServer, attachWebSocketServer, MAX_MESSAGES_PER_WINDOW
} = require('../server.js');
const { newGame, fireAndSettle } = require('./helpers/headless-game.js');

function startedRoom() {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);
  rm.join('c3', room.code);
  const res = rm.start('c1', { rounds: 3 });
  return { rm, room, res };
}

test('round 1 announces its cursor with TURN_SYNC(1), like every later round', () => {
  const { res } = startedRoom();
  const sync = res.broadcasts.map(b => b.msg).find(m => m.type === 'TURN_SYNC');
  assert.ok(sync, 'match start must broadcast TURN_SYNC');
  assert.strictEqual(sync.turnNumber, 1);
  assert.strictEqual(sync.activeSlot, 0);
});

test('superseding the ACTIVE player mid-round advances the cursor off the spectator', () => {
  const { rm, room } = startedRoom();
  // A VIRGIN round never sidelines a rejoiner (the seed world is exact), so
  // mark the round fought before superseding.
  room.roundVirgin = false;
  const seat = Array.from(room.players.values()).find(p => p.connectionId === 'c1');
  assert.strictEqual(room.activeSlot, seat.slot, 'precondition: c1 holds the cursor');

  const res = rm.rejoin('c1-fresh', { code: room.code, playerToken: seat.playerToken });
  assert.strictEqual(seat.spectating, true, 'mid-round supersede must spectate');
  assert.notStrictEqual(room.activeSlot, seat.slot,
    'the cursor parked on a spectator — the room would wait out the full sweep timeout');
  const sync = res.broadcasts.map(b => b.msg).find(m => m.type === 'TURN_SYNC');
  assert.ok(sync, 'the forced advance must announce the new cursor');
});

test('a spectating seat cannot FIRE even if the cursor somehow points at it', () => {
  const { rm, room } = startedRoom();
  const seat = Array.from(room.players.values()).find(p => p.slot === room.activeSlot);
  seat.spectating = true;
  assert.throws(
    () => rm.fire(seat.connectionId, { angle: 45, power: 500, weapon: 'Baby Missile' }),
    (err) => err.code === 'NOT_YOUR_TURN' || err.message === 'NOT_YOUR_TURN');
});

test('a rejected START_GAME leaves the round-1 wind untouched', () => {
  // The pre-fix hole was ORDERING: the HOST's own rejected attempt (too few
  // players) wrote config and zeroed the wind before the throw. The
  // post-merge review caught this test's first draft using NOT_HOST, which
  // threw before the mutation even on the broken code.
  const rm = new RoomManager();
  rm.createRoom('h');
  const room = rm.getRoomByConnection('h');
  const windBefore = room.wind;

  assert.throws(() => rm.start('h', { windVariability: 'none' }),
    (err) => err.code === 'NOT_ENOUGH_PLAYERS' || err.message === 'NOT_ENOUGH_PLAYERS');
  assert.strictEqual(room.wind, windBefore, 'the rejected attempt mutated the wind');
  assert.ok(!room.config || room.config.windVariability === undefined,
    'the rejected attempt stored its config');

  // With a second player seated, the host's real policy applies cleanly.
  rm.join('g', room.code);
  rm.start('h', { rounds: 1 });
  assert.notStrictEqual(room.wind, 0, 'seedless default should keep a live breeze (minted non-zero)');
});

test('binary-frame floods are counted and silenced past the cap', async () => {
  const server = createServer();
  const attached = attachWebSocketServer(server, { onMessage: () => {} });
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  let replies = 0;
  ws.on('message', () => { replies++; });
  const buf = Buffer.from([1, 2, 3]);
  for (let i = 0; i < MAX_MESSAGES_PER_WINDOW + 200; i++) ws.send(buf);
  await new Promise(res => setTimeout(res, 500));

  // Every frame spends budget; past the cap the socket gets ONE notice and
  // then silence — no 1:1 ERROR amplification.
  assert.ok(replies <= MAX_MESSAGES_PER_WINDOW + 1,
    `${replies} replies to ${MAX_MESSAGES_PER_WINDOW + 200} binary frames — amplification`);

  ws.close();
  await attached.close();
  await new Promise(res => server.close(res));
});

test('a buried hull fires OUT of the pile instead of detonating in its own lap', () => {
  const { SCORCHED, game } = newGame({ wind: 0 });
  const shooter = game.roster[game.activePlayerIdx];

  // Bury the shooter under a deposit.
  game.terrain.deposit(shooter.x, shooter.y - 5, 55);
  game.terrain.settle();
  const groundY = SCORCHED.CONST.WORLD_H - game.terrain.heightAt(shooter.x);
  assert.ok(groundY < shooter.y - 1, 'precondition: the shooter must be buried');

  const hpBefore = shooter.hp;
  fireAndSettle(game, 'Missile', 90, 500); // straight up, out through the pile

  assert.strictEqual(shooter.hp, hpBefore,
    'the shell detonated at the muzzle inside the pile and hit its own shooter');
  assert.strictEqual(game.projectiles.length, 0, 'the shell never resolved');
});

test('a deflected shell settles within a bounded number of bounces', () => {
  const { game } = newGame({ wind: 0 });
  const target = game.roster[1];
  target.shield = { type: 'Super Magno Shield', hp: 400 };
  // Straight vertical drop dead onto the dome: the historic pogo case.
  game.projectiles = [{
    x: target.x, y: target.y - 200, vx: 0, vy: 50,
    weapon: 'Missile', shooterIdx: 0
  }];
  let ticks = 0;
  while (game.projectiles.length > 0 && ticks < 1200) {
    game.stepPhysics(1 / 60);
    ticks++;
  }
  assert.strictEqual(game.projectiles.length, 0,
    `shell still pogoing after ${ticks} ticks`);
  // At most 3 bounces are charged (150hp) before the 4th contact detonates;
  // the detonation's own blast is then absorbed like any blast (< 100hp for
  // a Missile). The field must SURVIVE — the old `!target.shield ||` guard
  // turned the worst outcome (field ground to nothing) into a pass.
  assert.ok(target.shield, 'the field was ground to nothing');
  assert.ok(target.shield.hp >= 400 - 250,
    `shield spent ${400 - target.shield.hp}hp — unbounded pogo grind`);
});

test('a tracer never chips a deflector field', () => {
  const { game } = newGame({ wind: 0 });
  const target = game.roster[1];
  target.shield = { type: 'Mag Deflector', hp: 150 };
  game.projectiles = [{
    x: target.x, y: target.y - 100, vx: 0, vy: 60,
    weapon: 'Tracer', shooterIdx: 0
  }];
  let ticks = 0;
  while (game.projectiles.length > 0 && ticks < 800) {
    game.stepPhysics(1 / 60);
    ticks++;
  }
  assert.ok(target.shield && target.shield.hp === 150,
    'a 10-cost aiming aid drained the 4000-cost field');
});

test('wards take the best single factor, never a stacked product', () => {
  const target = { key: 'aether-forge', hp: 200, owner: 0, x: 600, y: 400 };
  const gate = (x) => ({ key: 'keep-gatehouse', hp: 260, owner: 0, x, y: 400 });
  const one = StructuresLib.wardMultiplier([gate(560), target], target);
  const four = StructuresLib.wardMultiplier(
    [gate(540), gate(560), gate(640), gate(660), target], target);
  assert.strictEqual(one, 0.55);
  assert.strictEqual(four, 0.55, `four gatehouses stacked to ${four}`);
});

test('repair auras take the best single source, never a sum', () => {
  const { game } = newGame();
  const me = game.roster[0];
  me.hp = 40;
  game.structures = [
    { key: 'repair-bay', hp: 130, owner: me.slot, ownerIdx: 0, x: me.x - 40, y: 400, cooldown: 0 },
    { key: 'repair-bay', hp: 130, owner: me.slot, ownerIdx: 0, x: me.x + 40, y: 400, cooldown: 0 }
  ];
  game.applyStructureTurnEffects();
  assert.strictEqual(me.hp, 54, `two bays healed ${me.hp - 40}hp in one boundary — stacking`);
});

test('a destroyed purchased work is consumed, not resurrected free next round', () => {
  const { game } = newGame();
  const buyer = game.roster[0];
  buyer.inventory['Structure: aether-radar'] = 1;
  game.rebuildStructures();
  const mine = game.structures.find(s => s.purchased && s.key === 'aether-radar');
  assert.ok(mine, 'precondition: the bought radar must stand');

  // Blast it flat.
  game.damageStructures(mine.x, mine.y - 10, 60, 500, undefined);
  assert.ok(mine.hp <= 0, 'precondition: the radar must fall');
  assert.strictEqual(buyer.inventory['Structure: aether-radar'], 0,
    'destruction did not consume the purchase');

  game.rebuildStructures();
  assert.ok(!game.structures.some(s => s.purchased && s.key === 'aether-radar'),
    'the destroyed work resurrected for free');
});

test('purchased works obey the holding budget and blocking works cap at one', () => {
  const { SCORCHED } = newGame();
  const S = SCORCHED.StructuresLib;
  const roster = [0, 1, 2, 3].map(slot => ({
    slot,
    inventory: Object.fromEntries(S.STRUCTURE_IDS.map(id => ['Structure: ' + id, 3]))
  }));
  const rng = { range: () => 0.5 };
  const heights = new Float32Array(1200).fill(300);
  const out = S.layoutStructures(rng, 'aethercastle', roster, heights, 1200, 700);

  for (let i = 0; i < 4; i++) {
    const purchased = out.filter(s => s.ownerIdx === i && s.purchased);
    assert.ok(purchased.length <= S.holdingSize(4),
      `holding ${i} fields ${purchased.length} purchased works — over budget`);
    for (const id of S.STRUCTURE_IDS) {
      if (!S.STRUCTURES[id].blocking) continue;
      const copies = purchased.filter(s => s.key === id).length;
      assert.ok(copies <= 1, `${copies} purchased ${id} — blocking works must cap at 1`);
    }
  }
});

test('the shop refuses structure purchases past the fielding cap', () => {
  const { game } = newGame();
  const buyer = game.roster[0];
  buyer.cash = 100000;
  assert.ok(game.buy(buyer, 'Structure: aether-radar', 1));
  assert.ok(game.buy(buyer, 'Structure: aether-radar', 1));
  assert.ok(game.buy(buyer, 'Structure: aether-radar', 1));
  const cashAtCap = buyer.cash;
  assert.strictEqual(game.buy(buyer, 'Structure: aether-radar', 1), false,
    'a fourth copy was sold that can never be fielded');
  assert.strictEqual(buyer.cash, cashAtCap, 'money was taken for nothing');
});

// ── Post-merge review regressions ──────────────────────────────────────────

test('the buried-muzzle escape is a slope-blind pile exit, not a terrain bypass', () => {
  const { SCORCHED, game, impacts } = newGame({ wind: 0 });
  // Flat shelf, then a 200px mountain, then flat again — the reviewer's
  // shoot-through-cover repro. The shooter stands on FLAT ground right at
  // the foot of the rise, not buried in anything.
  for (let c = 0; c < 1200; c++) {
    let h = 100;
    if (c >= 300 && c < 460) h = 100 + (c - 300) * (200 / 160);
    game.terrain.heights[c] = h;
  }
  const shooter = game.roster[game.activePlayerIdx];
  shooter.x = 296;
  shooter.y = SCORCHED.CONST.WORLD_H - game.terrain.heightAt(shooter.x);

  fireAndSettle(game, 'Missile', 2, 900);

  assert.strictEqual(impacts.length, 1, 'the shot vanished without detonating');
  assert.ok(impacts[0].x < 480,
    `impact at x=${impacts[0].x.toFixed(1)} — the shell flew straight through the mountain`);
});

test('a FIRE_SYNC arriving after local round-end queues instead of spawning a frozen shell', () => {
  const { game } = newGame();
  game.roundOver = true;

  game.applyFireSync({
    shotId: 42, shooterSlot: game.roster[0].slot,
    angle: 45, power: 500, vx: 100, vy: -100, wind: 0, weapon: 'Baby Missile'
  });

  assert.strictEqual(game.projectile, null,
    'a shell was spawned into a frozen simulation');
  // Dropped, not held: a fire belonging to a round this client has already
  // finished can never legally integrate here; ROUND_START re-seeds the
  // world it would have flown in.
  assert.strictEqual(game.pendingTurnSyncs.length, 0,
    'a dead round\'s fire frame was kept in the queue');
});

test('superseding the shooter mid-flight leaves the pending shot for the sweep, never discards it', () => {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);
  rm.join('c3', room.code);
  rm.start('c1', { rounds: 3 });
  rm.fire('c1', { angle: 45, power: 500, weapon: 'Baby Missile' });
  assert.strictEqual(room.awaitingResolution, true);

  const seat = Array.from(room.players.values()).find(p => p.connectionId === 'c1');
  rm.rejoin('c1-fresh', { code: room.code, playerToken: seat.playerToken });

  // The old fix force-cleared awaitingResolution and advanced the cursor,
  // which made the eventual RESOLVE_SHOT a silently-dropped frame. The
  // shot stays pending; the sweep's 90s deadline is the resolver now.
  assert.strictEqual(room.awaitingResolution, true,
    'the in-flight shot was silently discarded');
  const res = rm.sweep(Date.now() + RoomManager.SHOT_RESOLUTION_TIMEOUT_MS + 31000);
  assert.strictEqual(room.awaitingResolution, false);
  assert.ok(res.broadcasts.some(b => b.msg && b.msg.type === 'TURN_SYNC'),
    'the sweep never resolved the orphaned shot');
});

test('superseding the LAST eligible actor makes them the reference client, not a spectator', () => {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);
  rm.start('c1', { rounds: 3 });
  room.roundVirgin = false; // fought round — the interesting case

  // The other seat is already spectating; superseding this one too would
  // have parked the room in `paused` with players connected — unreachable
  // by both the sweep's un-wedge and its reaper.
  const other = Array.from(room.players.values()).find(p => p.connectionId === 'c2');
  other.spectating = true;
  const seat = Array.from(room.players.values()).find(p => p.connectionId === 'c1');
  rm.rejoin('c1-fresh', { code: room.code, playerToken: seat.playerToken });

  assert.strictEqual(seat.spectating, false, 'the last actor was spectated into a dead room');
  assert.strictEqual(room.phase, 'playing');
});

test("a spectator's SHOP_DONE counts for readiness but its fiction is not stored", () => {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);
  rm.start('c1', { rounds: 3 });
  room.phase = 'shopping';
  room.readyForNextRound = new Set();

  const seat = Array.from(room.players.values()).find(p => p.connectionId === 'c2');
  seat.spectating = true;
  seat.cash = 4200;
  seat.inventory = { 'Missile': 3 };

  rm.shopDone('c2', { inventory: { 'Nuke': 99 }, cash: 99999999 });

  assert.ok(room.readyForNextRound.has(seat.slot), 'the spectator was not counted as ready');
  assert.strictEqual(seat.cash, 4200, "the spectator's fictional bankroll was stored");
  assert.deepStrictEqual(seat.inventory, { 'Missile': 3 },
    "the spectator's fictional kit was stored");
});

test('a paused room with a connected eligible actor is un-parked by the sweep', () => {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);
  rm.start('c1', { rounds: 3 });

  room.phase = 'paused';
  room.pausedAt = Date.now() - RoomManager.TURN_TIMEOUT_MS - 60000;

  const res = rm.sweep(Date.now());
  assert.strictEqual(room.phase, 'playing', 'the sweep left a live room parked');
  assert.ok(res.broadcasts.some(b => b.msg && b.msg.type === 'TURN_SYNC'),
    'the un-park never announced a cursor');
});

test('the layout grants purchased copies round-robin, so late-registry works still field', () => {
  const { SCORCHED } = newGame();
  const S = SCORCHED.StructuresLib;
  // Four players (budget 5 each), one of them stacked with early ids AND a
  // paid missile-silo — the old sequential walk spent the whole budget
  // before reaching the silo, every round.
  const inv = { 'Structure: missile-silo': 3 };
  for (const id of S.STRUCTURE_IDS.slice(0, 4)) inv['Structure: ' + id] = 3;
  const roster = [0, 1, 2, 3].map(slot => ({ slot, inventory: slot === 0 ? inv : {} }));
  const rng = { range: () => 0.5 };
  const heights = new Float32Array(1200).fill(300);
  const out = S.layoutStructures(rng, 'aethercastle', roster, heights, 1200, 700);

  const silos = out.filter(s => s.ownerIdx === 0 && s.purchased && s.key === 'missile-silo');
  assert.ok(silos.length >= 1,
    'a paid-for missile-silo fielded zero copies — the budget starved the late registry');
});
