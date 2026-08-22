// Shared "browser in a box" harness.
//
// Runs the real page script from index.html against a DOM stand-in and a real
// WebSocket, so tests can exercise the wiring the page actually does — the
// DOMContentLoaded block, net.register handlers, the gameInstance hand-off —
// rather than poking Game methods directly. Extracted from
// browser-lockstep.test.js so the multi-round economy tests can boot the same
// browsers without duplicating it.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { WebSocket } = require('ws');
const terrainLib = require('../../lib/terrain.js');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
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

const gameOf = (b) => b.ctx.globalThis.SCORCHED.gameInstance;

// A real server on an ephemeral port, torn down by close().
async function startTestServer() {
  const { createServer, attachWebSocketServer, createRoomManagerHandlers } = require('../../server.js');
  const RoomManager = require('../../lib/room-manager.js');

  const handlers = createRoomManagerHandlers(new RoomManager());
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const wss = attachWebSocketServer(server, {
    onMessage: handlers.onMessage,
    onDisconnect: handlers.onDisconnect
  });
  return {
    server,
    wss,
    port: server.address().port,
    close() { wss.close(); server.close(); }
  };
}

// Two browsers through the real lobby into a live match.
async function setupMatch(port, rounds) {
  const host = bootBrowser(port);
  const guest = bootBrowser(port);

  await until(() => gameOf(host), 10000, 'host game instance');
  await until(() => gameOf(guest), 10000, 'guest game instance');

  host.el('btn-create-match').click();
  await until(
    () => (host.el('display-share-code').textContent || '').trim().length === 4,
    10000,
    'share code'
  );

  guest.el('join-code').value = host.el('display-share-code').textContent.trim();
  guest.el('btn-join-match').click();
  await until(() => host.el('multiplayer-slots').children.length >= 2, 10000, 'two players in the lobby');

  host.el('rounds').value = String(rounds);
  host.el('starting-cash').value = '10000';
  host.el('wall-type').value = 'off';
  host.el('start-btn').click();

  await until(() => gameOf(host).roster && gameOf(host).roster.length === 2, 10000, 'host round start');
  await until(() => gameOf(guest).roster && gameOf(guest).roster.length === 2, 10000, 'guest round start');

  return { host, guest };
}

module.exports = {
  code,
  createBrowserDom,
  bootBrowser,
  wait,
  until,
  hashTerrain,
  tanksOf,
  gameOf,
  startTestServer,
  setupMatch
};
