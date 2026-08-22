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
const { WebSocket } = require('ws');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { createServer, attachWebSocketServer, createRoomManagerHandlers } = require('../server.js');
const RoomManager = require('../lib/room-manager.js');
const terrainLib = require('../lib/terrain.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// A DOM stand-in permissive enough to run the real page script: any element
// the page asks for exists, listeners are recorded so we can click them.
function createBrowserDom() {
  const registry = new Map();

  const noopCtx = new Proxy({}, {
    get: (t, prop) => {
      if (prop === 'canvas') return { width: 1200, height: 700 };
      return () => noopCtx;
    }
  });

  function makeEl(tag, id) {
    const el = {
      tagName: tag,
      id: id || '',
      children: [],
      listeners: {},
      style: {},
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      hidden: false,
      value: '',
      textContent: '',
      _html: '',
      get innerHTML() { return this._html; },
      set innerHTML(v) { this._html = v; this.children = []; },
      appendChild(child) { this.children.push(child); return child; },
      removeChild(child) { this.children = this.children.filter(c => c !== child); },
      addEventListener(evt, fn) {
        (this.listeners[evt] = this.listeners[evt] || []).push(fn);
      },
      removeEventListener() {},
      click() { (this.listeners.click || []).forEach(fn => fn({ preventDefault() {} })); },
      // The lobby builds a row with innerHTML then queries it for the name
      // input and colour select. A real browser finds them; hand back stubs
      // so the wiring under test runs to completion.
      querySelector(sel) {
        this._q = this._q || {};
        if (!this._q[sel]) this._q[sel] = makeEl('input');
        return this._q[sel];
      },
      querySelectorAll: () => [],
      getContext: () => noopCtx,
      getBoundingClientRect: () => ({ width: 1200, height: 700, top: 0, left: 0 }),
      focus() {}, select() {}, setSelectionRange() {}
    };
    return el;
  }

  const document = {
    _domReady: [],
    addEventListener(evt, fn) { if (evt === 'DOMContentLoaded') this._domReady.push(fn); },
    getElementById(id) {
      if (!registry.has(id)) registry.set(id, makeEl('div', id));
      return registry.get(id);
    },
    createElement: (tag) => makeEl(tag),
    querySelector: (sel) => {
      if (sel === 'input[name="weapon-availability"]:checked') return { value: 'all' };
      return null;
    },
    querySelectorAll: () => [],
    body: makeEl('body'),
    execCommand: () => true
  };

  const window = {
    listeners: {},
    addEventListener(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); },
    removeEventListener() {},
    dispatch(evt, data) {
      (this.listeners[evt] || []).forEach(fn => fn({ preventDefault() {}, ...data }));
    },
    devicePixelRatio: 1,
    innerWidth: 1200,
    innerHeight: 700
  };

  return { document, window, registry, fire: () => document._domReady.forEach(fn => fn()) };
}

// Boot one "browser": run the page script with a DOM, a WebSocket and a
// location pointing at the test server, then fire DOMContentLoaded.
function bootBrowser(port) {
  const dom = createBrowserDom();
  const ctx = {
    globalThis: {},
    Math, Float32Array, console, JSON, Date,
    setTimeout, clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestAnimationFrame: () => 1,
    performance: { now: () => Date.now() },
    Terrain: terrainLib,
    WebSocket,
    location: { protocol: 'http:', host: `127.0.0.1:${port}` },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    document: dom.document,
    window: dom.window,
    alert: () => {},
    AudioContext: undefined
  };
  ctx.globalThis = ctx;
  ctx.window.document = dom.document;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  dom.fire();
  return { ctx, dom, el: (id) => dom.document.getElementById(id) };
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function until(predicate, timeoutMs = 10000, label = 'condition') {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await wait(10);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function hashTerrain(game) {
  const h = game.terrain.heights;
  const b = new Uint8Array(h.buffer, h.byteOffset, h.byteLength);
  let x = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) { x ^= b[i]; x = Math.imul(x, 0x01000193) >>> 0; }
  return x.toString(16).padStart(8, '0');
}

const tanksOf = (game) => game.roster.map(t => `${t.slot}:${t.x}:${t.y}:${t.hp}`).join('|');

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
    const shooterGame = shooter.ctx.globalThis.SCORCHED.gameInstance;
    const aim = shooterGame.roster[shooterGame.activePlayerIdx];
    aim.angle = 65;
    aim.power = 320;

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
    await until(
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
