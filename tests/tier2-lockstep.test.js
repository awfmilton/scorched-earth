// Tier 2 regressions: lockstep integrity.
//
// The review fleet's two CRITICAL desyncs both had the same shape: a gameplay
// sync applied the moment it arrived, on a client whose world was not yet at
// rest. FIRE_SYNC replaced the whole projectile array (deleting a still-flying
// shell), and MOVE/TELEPORT_SYNC repositioned tanks under one. All gameplay
// syncs now share TURN_SYNC's at-rest FIFO. The third fix replicates cash and
// stops the client dropping `chassis` from ROUND_START.tanks.

const test = require('node:test');
const assert = require('node:assert');
const RoomManager = require('../lib/room-manager.js');
const { validate } = require('../lib/protocol.js');
const { newGame } = require('./helpers/headless-game.js');

test('FIRE_SYNC arriving mid-flight queues instead of deleting the live shell', () => {
  const { game } = newGame();
  const liveShell = { x: 500, y: 200, vx: 10, vy: -5, weapon: 'Nuke', shooterIdx: 0 };
  game.projectile = liveShell;

  game.applyFireSync({
    shotId: 7, shooterSlot: game.roster[1].slot,
    angle: 45, power: 500, vx: 353.55, vy: -353.55,
    wind: 0, weapon: 'Baby Missile'
  });

  assert.strictEqual(game.projectiles[0], liveShell, 'the in-flight shell was replaced');
  assert.strictEqual(game.pendingTurnSyncs.length, 1);
  assert.strictEqual(game.pendingTurnSyncs[0].kind, 'fire');

  // Once the world is at rest the queued shot spawns with the server vector.
  game.projectile = null;
  game.flushPendingTurnSync();
  assert.ok(game.projectile, 'queued FIRE_SYNC never spawned');
  assert.strictEqual(game.projectile.vx, 353.55);
  assert.strictEqual(game.projectile.shotId, 7);
  assert.strictEqual(game.pendingTurnSyncs.length, 0);
});

test('a restated FIRE_SYNC for a live or queued shot is dropped, not doubled', () => {
  const { game } = newGame();
  game.projectile = { x: 1, y: 1, vx: 1, vy: 1, weapon: 'Baby Missile', shooterIdx: 0 };
  const msg = {
    shotId: 9, shooterSlot: game.roster[1].slot,
    angle: 45, power: 500, vx: 100, vy: -100, wind: 0, weapon: 'Baby Missile'
  };
  game.applyFireSync(msg);
  game.applyFireSync(msg);
  assert.strictEqual(game.pendingTurnSyncs.length, 1, 'duplicate frame queued twice');
});

test('MOVE_SYNC and TELEPORT_SYNC hold until the world is at rest', () => {
  const { game } = newGame();
  const mover = game.roster[1];
  const before = mover.x;
  game.projectile = { x: 500, y: 200, vx: 10, vy: -5, weapon: 'Baby Missile', shooterIdx: 0 };

  game.applyMoveSync({ slot: mover.slot, dir: 1, steps: 3 });
  game.applyTeleportSync({ slot: mover.slot, x: 900 });
  assert.strictEqual(mover.x, before, 'tank moved under a live shell');
  assert.strictEqual(game.pendingTurnSyncs.map(p => p.kind).join(','), 'move,teleport');

  game.projectile = null;
  game.flushPendingTurnSync();
  assert.strictEqual(mover.x, 900, 'queued teleport never landed');
  assert.strictEqual(game.pendingTurnSyncs.length, 0);
});

test('the FIFO stops draining when a queued fire puts a shell back in the air', () => {
  const { game } = newGame();
  const mover = game.roster[1];
  game.projectile = { x: 1, y: 1, vx: 1, vy: 1, weapon: 'Baby Missile', shooterIdx: 0 };

  game.applyFireSync({
    shotId: 3, shooterSlot: game.roster[0].slot,
    angle: 45, power: 500, vx: 50, vy: -50, wind: 0, weapon: 'Baby Missile'
  });
  game.applyMoveSync({ slot: mover.slot, dir: 1, steps: 2 });
  const before = mover.x;

  game.projectile = null;
  game.flushPendingTurnSync();

  // The fire drained and spawned; the move must still be waiting behind it.
  assert.ok(game.projectile && game.projectile.shotId === 3);
  assert.strictEqual(mover.x, before, 'move applied while the queued shell was flying');
  assert.strictEqual(game.pendingTurnSyncs.map(p => p.kind).join(','), 'move');
});

test('start() honours a replicated chassis and bankroll', () => {
  const { SCORCHED } = newGame();
  const game = new SCORCHED.Game({ headless: true, seed: 7, gameMode: 'aethercastle' });
  game.start({
    rounds: 1, wallType: 'rubber', startingCash: 10000,
    players: [
      { name: 'P1', color: '#f00', type: 'Human', chassis: 'walker-mech', cash: 5250 },
      { name: 'P2', color: '#0f0', type: 'Human', chassis: 'not-a-chassis' }
    ]
  });
  assert.strictEqual(game.roster[0].chassis, 'walker-mech');
  assert.strictEqual(game.roster[0].cash, 5250, 'declared cash lost on the fresh-start path');
  assert.strictEqual(game.roster[1].cash, 10000, 'absent cash must fall back to startingCash');
  assert.notStrictEqual(game.roster[1].chassis, 'not-a-chassis', 'unknown chassis must not survive');
});

test('applyServerTankMeta restates cash and chassis onto the live roster', () => {
  const { game } = newGame();
  game.applyServerTankMeta([
    { slot: game.roster[0].slot, cash: 123, chassis: 'walker-mech' },
    { slot: game.roster[1].slot, cash: -5, chassis: 'bogus' }
  ]);
  assert.strictEqual(game.roster[0].cash, 123);
  assert.strictEqual(game.roster[0].chassis, 'walker-mech');
  assert.notStrictEqual(game.roster[1].cash, -5, 'negative cash applied');
  assert.notStrictEqual(game.roster[1].chassis, 'bogus');
});

test('the server stores declared cash and restates it in ROUND_START.tanks', () => {
  const rm = new RoomManager();
  rm.createRoom('c1');
  const room = rm.getRoomByConnection('c1');
  rm.join('c2', room.code);
  rm.start('c1', { rounds: 3 });

  // Reach the intermission the way the game does: the round ends.
  room.phase = 'shopping';
  room.readyForNextRound = new Set();

  rm.shopDone('c1', { inventory: { 'Nuke': 2 }, cash: 7777 });
  const res = rm.shopDone('c2', { inventory: {}, cash: 50 });

  const seats = Array.from(room.players.values());
  assert.strictEqual(seats.find(p => p.connectionId === 'c1').cash, 7777);
  assert.strictEqual(seats.find(p => p.connectionId === 'c2').cash, 50);

  const roundStart = res.broadcasts
    .map(b => b.msg).find(m => m && m.type === 'ROUND_START');
  assert.ok(roundStart, 'second DONE should begin the next round');
  const cashBySlot = new Map(roundStart.tanks.map(t => [t.slot, t.cash]));
  assert.strictEqual(cashBySlot.get(seats.find(p => p.connectionId === 'c1').slot), 7777);
  assert.strictEqual(cashBySlot.get(seats.find(p => p.connectionId === 'c2').slot), 50);
});

test('SHOP_DONE cash is validated: integers in range only', () => {
  assert.ok(validate({ type: 'SHOP_DONE', inventory: {}, cash: 7777 }).ok);
  assert.ok(validate({ type: 'SHOP_DONE', inventory: {} }).ok, 'cash stays optional');
  assert.ok(!validate({ type: 'SHOP_DONE', inventory: {}, cash: -1 }).ok);
  assert.ok(!validate({ type: 'SHOP_DONE', inventory: {}, cash: 2.5 }).ok);
  assert.ok(!validate({ type: 'SHOP_DONE', inventory: {}, cash: 1e12 }).ok);
  assert.ok(!validate({ type: 'SHOP_DONE', inventory: {}, cash: 'rich' }).ok);
});
