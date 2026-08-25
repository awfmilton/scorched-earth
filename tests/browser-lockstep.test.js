// End-to-end check of the BROWSER wiring, not just the Game class.
//
// tests/multiplayer.test.js drives Game methods directly, so it proves the
// simulation agrees but skips everything the page actually does: the
// DOMContentLoaded block, net.register('ROUND_START'), the gameInstance
// hand-off, and the NetClient dispatch table that routes FIRE_SYNC/TURN_SYNC
// into the Game. That wiring is exactly what was missing, so it gets its own
// test: two scripted "browsers" against one real server over real websockets.

const test = require('node:test');
const { describe, it, before, after } = test;
const assert = require('node:assert');

const { createServer, attachWebSocketServer, createRoomManagerHandlers } = require('../server.js');
const RoomManager = require('../lib/room-manager.js');
const { bootBrowser, wait, until, untilStepping, hashTerrain, tanksOf } = require('./helpers/browser-harness.js');

describe('Browser wiring: two clients play a real match', () => {
  let server, wss, port;

  before(async () => {
    const handlers = createRoomManagerHandlers(new RoomManager());
    server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    }));
    wss = attachWebSocketServer(server, {
      onMessage: handlers.onMessage,
      onDisconnect: handlers.onDisconnect
    });
  });

  after(() => {
    wss.close();
    server.close();
  });

  it('host creates, guest joins by share code, a shot resolves identically on both', async () => {
    const host = bootBrowser(port);
    const guest = bootBrowser(port);

    await until(() => host.ctx.globalThis.SCORCHED.gameInstance, 10000, 'host game instance');
    await until(() => guest.ctx.globalThis.SCORCHED.gameInstance, 10000, 'guest game instance');

    // --- Host clicks CREATE PRIVATE GAME -------------------------------
    host.el('btn-create-match').click();

    // The share code must be displayed, and it must be the real room code.
    await until(
      () => (host.el('display-share-code').textContent || '').trim().length === 4,
      10000,
      'share code to appear in the UI'
    );
    const shareCode = host.el('display-share-code').textContent.trim();
    assert.match(shareCode, /^[A-Z0-9]{4}$/, 'share code must be short and typeable');

    // --- Guest types the code and joins --------------------------------
    guest.el('join-code').value = shareCode.toLowerCase(); // case-insensitive
    guest.el('btn-join-match').click();

    await until(
      () => {
        const rs = guest.ctx.globalThis.SCORCHED.gameInstance;
        return rs && guest.el('multiplayer-slots').children.length >= 2;
      },
      10000,
      'guest to see two occupied slots'
    );

    // Both clients see each other in the lobby.
    await until(() => host.el('multiplayer-slots').children.length >= 2, 10000, 'host lobby to show 2 players');
    assert.ok(host.el('multiplayer-slots').children.length >= 2, 'host must see the guest arrive');

    // --- Host starts the match -----------------------------------------
    host.el('rounds').value = '1';
    host.el('starting-cash').value = '10000';
    host.el('wall-type').value = 'off';
    host.el('start-btn').click();

    const hostGame = () => host.ctx.globalThis.SCORCHED.gameInstance;
    const guestGame = () => guest.ctx.globalThis.SCORCHED.gameInstance;

    await until(() => hostGame().roster && hostGame().roster.length === 2, 10000, 'host round start');
    await until(() => guestGame().roster && guestGame().roster.length === 2, 10000, 'guest round start');

    // Both clients must be in online mode, with distinct slots.
    assert.strictEqual(hostGame().mode, 'online', 'host must run in online mode');
    assert.strictEqual(guestGame().mode, 'online', 'guest must run in online mode');
    assert.notStrictEqual(hostGame().mySlot, guestGame().mySlot, 'clients must hold different slots');

    // Same world before any shot.
    assert.strictEqual(hashTerrain(hostGame()), hashTerrain(guestGame()), 'terrain must match at round start');
    assert.strictEqual(tanksOf(hostGame()), tanksOf(guestGame()), 'tanks must match at round start');
    assert.notStrictEqual(hostGame().seed, 42, 'must use the server seed, not the page default');

    // Both agree whose turn it is.
    const activeSlot = hostGame().roster[hostGame().activePlayerIdx].slot;
    assert.strictEqual(
      guestGame().roster[guestGame().activePlayerIdx].slot,
      activeSlot,
      'both clients must agree on the opening turn'
    );

    // --- The active player fires via the real keyboard path -------------
    const shooter = (hostGame().mySlot === activeSlot) ? host : guest;
    const watcher = (shooter === host) ? guest : host;
    const before = hashTerrain(watcher.ctx.globalThis.SCORCHED.gameInstance);

    // Aim steeply enough that the shell lands in-world and carves, otherwise
    // the "terrain actually changed" check below is testing nothing.
    // We also zero the wind so a random heavy gust doesn't blow the shell
    // completely off the map when wallType is 'off'.
    const shooterGame = shooter.ctx.globalThis.SCORCHED.gameInstance;
    const aim = shooterGame.roster[shooterGame.activePlayerIdx];
    aim.angle = 90;
    aim.power = 10;

    shooter.dom.window.dispatch('keydown', { key: ' ', code: 'Space' });

    // The WATCHER must receive the shot. This is the check that fails when
    // FIRE_SYNC is a console.log stub.
    await until(
      () => watcher.ctx.globalThis.SCORCHED.gameInstance.projectile,
      10000,
      'the watching client to see the shot'
    );
    assert.ok(
      shooter.ctx.globalThis.SCORCHED.gameInstance.projectile,
      'the shooter must also spawn from FIRE_SYNC'
    );

    // --- Step both simulations in lockstep ------------------------------
    const TICK = host.ctx.globalThis.SCORCHED.CONST.TICK;
    for (let i = 0; i < 900; i++) {
      hostGame().stepPhysics(TICK);
      guestGame().stepPhysics(TICK);
      if (!hostGame().projectile && !guestGame().projectile) break;
    }

    assert.strictEqual(
      hashTerrain(hostGame()),
      hashTerrain(guestGame()),
      'terrain damage must be byte-identical on both clients'
    );
    assert.strictEqual(
      tanksOf(hostGame()),
      tanksOf(guestGame()),
      'tank positions and health must be identical on both clients'
    );
    assert.notStrictEqual(hashTerrain(watcher.ctx.globalThis.SCORCHED.gameInstance), before,
      'the watcher must actually see the terrain change');

    // --- The turn advances, server-driven, on both clients ---------------
    await untilStepping(
      [host, guest],
      () => hostGame().roster[hostGame().activePlayerIdx].slot !== activeSlot,
      10000,
      'the turn to advance past the shooter'
    );
    assert.strictEqual(
      hostGame().roster[hostGame().activePlayerIdx].slot,
      guestGame().roster[guestGame().activePlayerIdx].slot,
      'both clients must land on the same next turn'
    );
  });

  it('a bad share code surfaces a readable error and does not join', async () => {
    const b = bootBrowser(port);
    await until(() => b.ctx.globalThis.SCORCHED.gameInstance, 10000, 'game instance');

    b.el('join-code').value = 'ZZZZ';
    b.el('btn-join-match').click();

    await until(
      () => (b.el('error-msg').textContent || '').length > 0,
      10000,
      'an error message for an unknown code'
    );
    const text = b.el('error-msg').textContent;
    assert.match(text, /no room|exist|not found/i, `expected a readable error, got: ${text}`);
    assert.ok(b.el('multiplayer-slots').children.length === 0, 'must not seat the player anywhere');
  });

  it('a malformed share code is rejected client-side', async () => {
    const b = bootBrowser(port);
    await until(() => b.ctx.globalThis.SCORCHED.gameInstance, 10000, 'game instance');

    b.el('join-code').value = 'AB';
    b.el('btn-join-match').click();
    await wait(50);
    assert.match(b.el('error-msg').textContent || '', /invalid/i);
  });
});
