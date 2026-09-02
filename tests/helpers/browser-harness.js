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
const structuresLib = require('../../lib/structures.js');
const { loadKitInto } = require('./gfx-kit.js');

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

  // Every socket the page opens is tracked, because nothing else can close
  // them. An established ws client keeps the event loop alive on its own:
  // server.close() only stops accepting, and wss.close() does not hang up
  // existing peers. Without close() below, a test file passes and then never
  // exits -- which reads as "still running" and eats a CI slot until the
  // watchdog kills it.
  const sockets = [];
  class TrackedWebSocket extends WebSocket {
    constructor(...args) {
      super(...args);
      sockets.push(this);
      // unref the underlying TCP socket so a page that is still connected
      // cannot by itself hold the process open. This is the safety net: an
      // explicit close() below is still the correct teardown, but a test file
      // that forgets one must not hang, only leak until exit.
      const unref = () => { try { this._socket.unref(); } catch { /* not up yet */ } };
      this.on('open', unref);
      this.on('upgrade', unref);
      unref();
    }
  }

  // Same reasoning for timers. The page reconnects on a backoff timer, so a
  // ref'd timer keeps the loop alive forever once the server goes away. The
  // timer still fires normally while anything else keeps the loop running,
  // which during a test is the test runner itself.
  const unrefTimeout = (fn, ms, ...rest) => {
    const t = setTimeout(fn, ms, ...rest);
    if (t && typeof t.unref === 'function') t.unref();
    return t;
  };

  const ctx = {
    globalThis: {},
    Math, Float32Array, console, JSON, Date,
    setTimeout: unrefTimeout, clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestAnimationFrame: () => 1,
    performance: { now: () => Date.now() },
    Terrain: terrainLib,
    Structures: structuresLib,
    WebSocket: TrackedWebSocket,
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
  // Stands in for the page's <script src="gfx/..."> tags, which this harness
  // does not execute because it runs only the inline page script.
  loadKitInto(ctx);
  vm.runInContext(code, ctx);
  dom.fire();
  return {
    ctx,
    dom,
    el: (id) => dom.document.getElementById(id),
    // Shut the page's network client down through its own API first. Killing
    // the socket on its own does not work: onclose fires scheduleReconnect(),
    // which opens a fresh socket on a timer, so the page heals itself right
    // back into keeping the loop alive. disconnect() clears shouldReconnect
    // and the pending timer, which is what actually stops the cycle.
    close() {
      const S = ctx.globalThis.SCORCHED;
      try { S && S.netInstance && S.netInstance.disconnect(); } catch { /* never booted */ }
      // Belt and braces for anything disconnect() did not own. Safe now that
      // shouldReconnect is false, so these closes cannot schedule a retry.
      for (const s of sockets) {
        try { s.terminate(); } catch { /* already gone */ }
      }
      sockets.length = 0;
    }
  };
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// A floor on the poll budget, which every call site may raise and none may
// lower. `node --test` runs test files in PARALLEL, so this poll competes with
// a dozen sibling processes for cores; under that load the event loop starves
// and ten seconds of WALL CLOCK can pass while the predicate runs a handful of
// times. The condition is not false, it is unobserved, and the test fails for
// reasons that have nothing to do with the code under test.
//
// A budget here exists to bound a genuine hang, and the real backstop for that
// is the runner's own --test-timeout=30000. Sitting three times tighter than
// that backstop bought nothing except a test that fails on a busy machine.
const MIN_POLL_BUDGET_MS = 25000;

async function until(predicate, timeoutMs = MIN_POLL_BUDGET_MS, label = 'condition') {
  const budget = Math.max(timeoutMs, MIN_POLL_BUDGET_MS);
  const start = Date.now();
  let polls = 0;
  while (Date.now() - start < budget) {
    polls++;
    if (predicate()) return true;
    await wait(10);
  }
  // Report the poll count: a timeout after 2,000 polls is a real stuck
  // condition, one after 40 is a starved worker, and the two want different
  // fixes. Without this the two are indistinguishable from the failure alone.
  throw new Error(
    `Timed out waiting for ${label} after ${Date.now() - start}ms and ${polls} polls`
  );
}

/**
 * Poll a predicate while keeping the simulations running.
 *
 * A real browser never stops stepping: the frame loop runs whether or not a
 * shell is in the air, and some client work is deliberately deferred to it. A
 * turn boundary that arrives mid-flight is held back until the world is at rest
 * so that every client applies it in the same order relative to the impact —
 * which means the thing that releases it is the next physics step, not the
 * passage of time. A poll-only wait hangs forever on exactly that.
 *
 * Every browser is stepped the same number of times per iteration, so the
 * clients stay in lockstep with each other while the wait runs.
 *
 * @param {Array<Object>} browsers Booted browsers to keep stepping.
 * @param {Function} predicate Checked between steps.
 */
async function untilStepping(browsers, predicate, timeoutMs = 10000, label = 'condition') {
  const TICK = browsers[0].ctx.globalThis.SCORCHED.CONST.TICK;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    for (const b of browsers) {
      const game = gameOf(b);
      if (game) game.stepPhysics(TICK);
    }
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

/**
 * A holding, flattened to a comparable string.
 *
 * Position is included alongside hp because the two failure modes are
 * different: a differing hp means the clients disagree about damage, while a
 * differing x or a differing LENGTH means they built different worlds. Array
 * order is part of the comparison on purpose — structures are addressed by
 * index during a round, so two clients holding the same set in a different
 * order is still a desync.
 *
 * cooldown and breached are in the hash because they are LATENT divergence:
 * neither is visible in hp or position on the turn it drifts, and both decide
 * what happens on a later one. A turret cooldown that is one lower on one
 * client fires a volley a turn early there and nowhere else; a vat flagged
 * breached on one client has already spent its explosion and will never spend
 * it again, while its twin is still armed. Comparing only the visible fields
 * would let the exact drift a duplicate turn boundary produces pass unseen.
 */
const structuresOf = (game) => (game.structures || [])
  .map(s => `${s.key}@${s.owner}:${s.x.toFixed(4)}:${s.y.toFixed(4)}:${s.hp}` +
    `:cd${s.cooldown === undefined ? 'n' : s.cooldown}` +
    `:br${s.breached ? 1 : 0}` +
    // Placement-time footing is derived from replicated inputs, so two
    // clients disagreeing on it IS a lockstep fault — hash it like the rest.
    `:ft${s.footing === undefined ? 'n' : s.footing.toFixed(4)}`)
  .join('|');

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
    // Hang up every peer before shutting down. wss.close()/server.close() stop
    // new connections but leave established ones open, and one open server-side
    // socket is enough to keep node from exiting.
    //
    // attachWebSocketServer returns a wrapper whose `clients` is a
    // Map<connectionId, ws>, NOT a ws Set -- iterating it directly yields
    // [id, ws] pairs whose .terminate is undefined, which is how an earlier
    // version of this teardown silently did nothing at all.
    close() {
      for (const ws of wss.clients.values()) {
        ws.terminate();
      }
      wss.close();
      server.close();
    }
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
  untilStepping,
  hashTerrain,
  tanksOf,
  structuresOf,
  gameOf,
  startTestServer,
  setupMatch
};
