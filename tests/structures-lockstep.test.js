// Two-client agreement for the holding.
//
// tests/structures.test.js proves replay-identity inside ONE process, which is
// a weaker claim than it looks: a single process shares one module instance,
// one RNG stream and one iteration order, so it cannot catch the failure that
// actually matters here. This test boots two independent "browsers" against a
// real server and compares their structure arrays — a structure that exists on
// one client and not another is the silent desync in its purest form.

const test = require('node:test');
const { describe, it, before, after } = test;
const assert = require('node:assert');

const {
  bootBrowser, until, untilStepping, hashTerrain, tanksOf, structuresOf, gameOf,
  startTestServer, setupMatch
} = require('./helpers/browser-harness.js');

describe('Structures agree across two real clients', () => {
  let srv;

  before(async () => { srv = await startTestServer(); });
  after(() => { srv.close(); });

  it('both clients build the identical holding from one ROUND_START', async () => {
    const { host, guest } = await setupMatch(srv.port, 1);

    const h = gameOf(host);
    const g = gameOf(guest);

    assert.ok(h.structures.length > 0, 'an aethercastle match must field a holding');
    assert.strictEqual(
      h.structures.length,
      g.structures.length,
      'both clients must build the same NUMBER of structures'
    );
    assert.strictEqual(
      structuresOf(h),
      structuresOf(g),
      'both clients must build the identical holding, in the identical order'
    );

    host.close();
    guest.close();
  });

  it('a shot damages the holding identically on both clients', async () => {
    const { host, guest } = await setupMatch(srv.port, 1);

    const hostGame = () => gameOf(host);
    const guestGame = () => gameOf(guest);

    assert.strictEqual(structuresOf(hostGame()), structuresOf(guestGame()), 'same holding at round start');

    // Shell the field through the real fire path so the damage arrives as a
    // replicated FIRE_SYNC rather than a local method call.
    const activeSlot = hostGame().roster[hostGame().activePlayerIdx].slot;
    const shooter = (hostGame().mySlot === activeSlot) ? host : guest;

    const shooterGame = gameOf(shooter);
    const aim = shooterGame.roster[shooterGame.activePlayerIdx];
    aim.angle = 80;
    aim.power = 400;
    aim.selectedWeapon = 'Nuke';
    aim.inventory['Nuke'] = 5;

    shooter.dom.window.dispatch('keydown', { key: ' ', code: 'Space' });

    await until(() => gameOf(host).projectile && gameOf(guest).projectile, 10000, 'both clients to see the shot');

    const TICK = host.ctx.globalThis.SCORCHED.CONST.TICK;
    for (let i = 0; i < 1200; i++) {
      hostGame().stepPhysics(TICK);
      guestGame().stepPhysics(TICK);
      if (!hostGame().projectile && !guestGame().projectile) break;
    }

    // Wait for both clients to land on the SAME turn before comparing.
    //
    // Turret fire runs on the turn boundary and a missile silo carves, so a
    // client that has processed TURN_SYNC has a crater a client that has not
    // is still missing. Both get there from the same message; they just do not
    // get there in the same millisecond. Comparing mid-flight would be
    // measuring network delivery order, not simulation agreement.
    await until(
      () => guestGame().roster[guestGame().activePlayerIdx].slot
         === hostGame().roster[hostGame().activePlayerIdx].slot
         && hostGame().turnNumber === guestGame().turnNumber,
      10000,
      'both clients settled on the same turn'
    );

    assert.strictEqual(
      hashTerrain(hostGame()), hashTerrain(guestGame()),
      'terrain must still match after the shot'
    );
    assert.strictEqual(
      tanksOf(hostGame()), tanksOf(guestGame()),
      'tanks must still match after the shot'
    );
    assert.strictEqual(
      structuresOf(hostGame()), structuresOf(guestGame()),
      'structure hp and position must be identical on both clients after a shot'
    );

    host.close();
    guest.close();
  });

  it('turn-boundary structure effects stay in step across clients', async () => {
    const { host, guest } = await setupMatch(srv.port, 1);

    const hostGame = () => gameOf(host);
    const guestGame = () => gameOf(guest);

    // Auras and turrets run on the turn boundary. Drive a turn through the
    // server and both clients must come out the far side agreeing about
    // every hull AND every building.
    const activeSlot = hostGame().roster[hostGame().activePlayerIdx].slot;
    const shooter = (hostGame().mySlot === activeSlot) ? host : guest;
    const shooterGame = gameOf(shooter);
    const aim = shooterGame.roster[shooterGame.activePlayerIdx];
    aim.angle = 90;
    aim.power = 10;

    shooter.dom.window.dispatch('keydown', { key: ' ', code: 'Space' });
    await until(() => gameOf(host).projectile && gameOf(guest).projectile, 10000, 'the shot');

    const TICK = host.ctx.globalThis.SCORCHED.CONST.TICK;
    for (let i = 0; i < 1200; i++) {
      hostGame().stepPhysics(TICK);
      guestGame().stepPhysics(TICK);
      if (!hostGame().projectile && !guestGame().projectile) break;
    }

    // Stepping, not just polling: the turn boundary is applied by the physics
    // step once the world is at rest, so a wait that only sleeps would sit here
    // holding the very frame it is waiting for.
    await untilStepping(
      [host, guest],
      () => hostGame().roster[hostGame().activePlayerIdx].slot !== activeSlot,
      10000,
      'the turn to advance'
    );
    // Let the guest's TURN_SYNC land too.
    await untilStepping(
      [host, guest],
      () => guestGame().roster[guestGame().activePlayerIdx].slot
         === hostGame().roster[hostGame().activePlayerIdx].slot,
      10000,
      'both clients on the same turn'
    );

    assert.strictEqual(
      structuresOf(hostGame()), structuresOf(guestGame()),
      'the holding must match after a turn boundary ran auras and turrets'
    );
    assert.strictEqual(
      tanksOf(hostGame()), tanksOf(guestGame()),
      'hulls must match after auras healed and turrets fired'
    );

    host.close();
    guest.close();
  });
});
