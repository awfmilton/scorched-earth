// FIRE_SYNC is authoritative. Clients simulate what they are told.
//
// Regression cover for a desync that made every non-default weapon unsafe in
// multiplayer. applyFireSync used to re-check the server's weapon against the
// SHOOTER's inventory as seen locally — but a client replicates its own
// inventory and nobody else's: every remote tank is built with just
// { 'Baby Missile': Infinity, Fuel }, and shop purchases live only on the
// buyer's machine. So the shooter fired a Nuke and every watcher quietly
// downgraded to a Baby Missile, with a different blast radius, a different
// damage number and a different crater. armTrigger() had the same flaw, one
// layer down: the shooter armed a proximity fuse and the watchers armed
// nothing, so the shell detonated 34px apart on different screens.
//
// Both are now carried by the server on FIRE_SYNC.

const test = require('node:test');
const { describe, it, before, after } = test;
const assert = require('node:assert');

const {
  until, hashTerrain, tanksOf, gameOf, startTestServer, setupMatch
} = require('./helpers/browser-harness.js');
const { validate } = require('../lib/protocol.js');

// Fire the active player's current weapon and step both clients in lockstep.
async function fireAndStep(host, guest) {
  const H = () => gameOf(host), G = () => gameOf(guest);
  const activeSlot = H().roster[H().activePlayerIdx].slot;
  const shooter = (H().mySlot === activeSlot) ? host : guest;

  shooter.dom.window.dispatch('keydown', { key: ' ', code: 'Space' });
  await until(() => H().projectile && G().projectile, 10000, 'both clients to see the shot');

  const TICK = host.ctx.globalThis.SCORCHED.CONST.TICK;
  for (let i = 0; i < 1200; i++) {
    H().stepPhysics(TICK);
    G().stepPhysics(TICK);
    if (!H().projectile && !G().projectile) break;
  }
  return shooter;
}

function armShooter(host, guest, mutate) {
  const H = () => gameOf(host), G = () => gameOf(guest);
  const activeSlot = H().roster[H().activePlayerIdx].slot;
  const shooter = (H().mySlot === activeSlot) ? host : guest;
  const sg = gameOf(shooter);
  mutate(sg.roster[sg.activePlayerIdx]);
  return shooter;
}

describe('FIRE_SYNC is the authority for weapon and fuse', () => {
  let srv;
  before(async () => { srv = await startTestServer(); });
  after(() => { srv.close(); });

  it('a weapon the watcher has never heard of still simulates identically', async () => {
    const { host, guest } = await setupMatch(srv.port, 1);
    const H = () => gameOf(host), G = () => gameOf(guest);

    // Buy a Nuke on the shooter only — exactly what the shop does, and
    // exactly what no other client can see.
    armShooter(host, guest, (tank) => {
      tank.angle = 80;
      tank.power = 400;
      tank.selectedWeapon = 'Nuke';
      tank.inventory['Nuke'] = 5;
    });

    await fireAndStep(host, guest);

    // The projectile itself must have been the same warhead on both.
    assert.strictEqual(
      hashTerrain(H()), hashTerrain(G()),
      'a purchased weapon must carve the same crater on every client'
    );
    assert.strictEqual(
      tanksOf(H()), tanksOf(G()),
      'a purchased weapon must do the same damage on every client'
    );

    host.close(); guest.close();
  });

  it('the watcher spawns the SERVER weapon, not its own guess', async () => {
    const { host, guest } = await setupMatch(srv.port, 1);
    const H = () => gameOf(host), G = () => gameOf(guest);

    const shooter = armShooter(host, guest, (tank) => {
      tank.angle = 80;
      tank.power = 400;
      tank.selectedWeapon = 'Nuke';
      tank.inventory['Nuke'] = 5;
    });
    const watcher = (shooter === host) ? guest : host;

    shooter.dom.window.dispatch('keydown', { key: ' ', code: 'Space' });
    await until(() => H().projectile && G().projectile, 10000, 'the shot');

    // This is the assertion that pinned the bug: the two projectiles used to
    // read 'Nuke' and 'Baby Missile'.
    assert.strictEqual(
      gameOf(watcher).projectile.weapon,
      gameOf(shooter).projectile.weapon,
      'shooter and watcher must fly the same weapon'
    );
    assert.strictEqual(gameOf(watcher).projectile.weapon, 'Nuke');

    host.close(); guest.close();
  });

  it('an armed fuse is the same on both clients', async () => {
    const { host, guest } = await setupMatch(srv.port, 1);
    const H = () => gameOf(host), G = () => gameOf(guest);

    const shooter = armShooter(host, guest, (tank) => {
      tank.angle = 80;
      tank.power = 380;
      tank.selectedWeapon = 'Baby Missile';
      // Only the shooter can see this stock.
      tank.inventory['Proximity Fuse'] = 3;
    });
    const watcher = (shooter === host) ? guest : host;

    shooter.dom.window.dispatch('keydown', { key: ' ', code: 'Space' });
    await until(() => H().projectile && G().projectile, 10000, 'the shot');

    assert.strictEqual(
      gameOf(watcher).projectile.trigger,
      gameOf(shooter).projectile.trigger,
      'shooter and watcher must fuse the shell the same way'
    );
    assert.strictEqual(gameOf(shooter).projectile.trigger, 'proximity');

    host.close(); guest.close();
  });

  it('the fuse is spent once, on the client that owns it', async () => {
    const { host, guest } = await setupMatch(srv.port, 1);
    const H = () => gameOf(host), G = () => gameOf(guest);

    const shooter = armShooter(host, guest, (tank) => {
      tank.angle = 80;
      tank.power = 380;
      tank.inventory['Proximity Fuse'] = 3;
    });

    shooter.dom.window.dispatch('keydown', { key: ' ', code: 'Space' });
    await until(() => H().projectile && G().projectile, 10000, 'the shot');

    const sg = gameOf(shooter);
    const own = sg.roster.find(t => t.slot === sg.mySlot);
    assert.strictEqual(own.inventory['Proximity Fuse'], 2, 'exactly one fuse spent');

    host.close(); guest.close();
  });

  it('the protocol accepts a FIRE with no trigger, and rejects a made-up one', () => {
    assert.ok(validate({ type: 'FIRE', angle: 45, power: 500, weapon: 'Nuke' }).ok,
      'an older client sends no trigger at all');
    assert.ok(validate({ type: 'FIRE', angle: 45, power: 500, weapon: 'Nuke', trigger: 'proximity' }).ok);
    assert.ok(validate({ type: 'FIRE', angle: 45, power: 500, weapon: 'Nuke', trigger: 'contact' }).ok);
    assert.ok(!validate({ type: 'FIRE', angle: 45, power: 500, weapon: 'Nuke', trigger: 'nuclear' }).ok,
      'an unknown fuse must be refused, not passed through for clients to guess at');
  });

  it('the server normalises a junk trigger rather than broadcasting it', () => {
    const RoomManager = require('../lib/room-manager.js');
    const rm = new RoomManager();

    const host = rm.createRoom('c1', { name: 'H' });
    const code = host.replies[0].msg.code;
    rm.join('c2', code);
    rm.start('c1', { rounds: 1, startingCash: 1000, wallType: 'off' });

    // Reach past the protocol layer, the way a modified client would.
    const room = rm.rooms.get(code);
    const activeSlot = room.activeSlot;
    const conn = activeSlot === 0 ? 'c1' : 'c2';
    const out = rm.fire(conn, { angle: 45, power: 500, weapon: 'Nuke', trigger: 'wat' });

    const sync = out.broadcasts[0].msg;
    assert.strictEqual(sync.trigger, null, 'an unknown fuse must become a plain impact fuse');
  });
});
