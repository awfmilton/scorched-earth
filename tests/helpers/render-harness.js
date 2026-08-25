// Render harness: run the real page's draw path against a RECORDING canvas.
//
// The browser harness hands the page a Proxy that swallows every canvas call,
// which is right for testing wiring and useless for testing pixels. This one
// keeps an ordered log of every call and every property assignment instead, so
// a test can assert what was actually drawn — and, more importantly, diff two
// frames against each other.
//
// A draw-call log is the strongest check available without a real browser: it
// cannot prove the screen LOOKS right, but it proves exactly which primitives
// were issued, in which order, with which colours. That is what catches a
// palette regression in classic mode, and it is what a `getContext` stub that
// returns undefined for everything can never catch.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..', '..');

/**
 * A canvas context that records instead of drawing.
 *
 * Gradients are recorded as their own `grad.addColorStop` entries and appear in
 * the parent log as the literal `GRAD`, so a gradient's STOPS are compared
 * while its object identity is not.
 */
function recordingContext() {
  const log = [];
  const GRADIENT = Symbol('gradient');
  const makeGradient = () => ({
    [GRADIENT]: true,
    addColorStop: (offset, colour) => log.push(`grad.addColorStop(${offset},${colour})`)
  });

  // Only a GRADIENT is identity-erased, and only because two runs produce two
  // different objects with the same stops. Everything else is shown by value.
  //
  // This used to erase every object, which quietly covered arrays too — so
  // `setLineDash([2, 4])` recorded as `setLineDash(GRAD)` and a changed dash
  // pattern was invisible to the golden diff. That is the same presence-not-
  // effect hole the diff was built to close, hiding one level down in the
  // instrument itself. A recorder that blurs its own input cannot be a
  // reference for anything.
  const show = (v) => {
    if (!v || typeof v !== 'object') return String(v);
    if (v[GRADIENT]) return 'GRAD';
    if (Array.isArray(v)) return `[${v.map(show).join(' ')}]`;
    return JSON.stringify(v);
  };

  return new Proxy({}, {
    get(_t, prop) {
      if (prop === 'canvas') return { width: 1200, height: 700 };
      if (prop === '__log') return log;
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return (...a) => { log.push(`${String(prop)}(${a.join(',')})`); return makeGradient(); };
      }
      if (prop === 'measureText') return () => ({ width: 10 });
      return (...a) => { log.push(`${String(prop)}(${a.map(show).join(',')})`); };
    },
    set(_t, prop, value) {
      log.push(`${String(prop)}=${show(value)}`);
      return true;
    }
  });
}

/**
 * Boot the page script.
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.banRandom] Replace Math.random with a thrower, so any
 *   draw path that reaches for it fails the test loudly instead of quietly
 *   desyncing two players' screens.
 */
function loadScorched(opts = {}) {
  return loadScorchedFrom(fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'), opts);
}

/**
 * Boot an ARBITRARY build of the page, not necessarily the one on disk.
 *
 * This exists so the classic golden fixture can be recorded from the
 * pre-visualisation commit's source, which is what makes the fixture an
 * independent statement of the easter egg rather than a restatement of what
 * the current build happens to do.
 */
function loadScorchedFrom(html, opts = {}) {
  const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

  // Object.create keeps every Math method reachable through the prototype
  // chain while letting `random` be shadowed by an own property.
  let mathObj = Math;
  if (opts.banRandom) {
    mathObj = Object.create(Math);
    mathObj.random = () => {
      throw new Error('Math.random() was called on a draw path');
    };
  }

  const context = {
    globalThis: {}, Math: mathObj, Float32Array, console, JSON,
    setTimeout, clearTimeout,
    Terrain: require(path.join(REPO, 'lib/terrain.js')),
    Structures: require(path.join(REPO, 'lib/structures.js')),
    document: { getElementById: () => null, addEventListener: () => {} },
    window: { addEventListener: () => {}, devicePixelRatio: 1 }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.globalThis.SCORCHED;
}

/**
 * A started match with a fixed roster, ready to draw.
 *
 * Positions are pinned rather than left to the placement RNG so two frames
 * from two different loads are comparable. The Game is built headless (so the
 * constructor skips the DOM entirely) and then handed a recording context —
 * `headless` gates the draw methods, so it has to come back off to draw.
 */
function renderableGame(SCORCHED, opts = {}) {
  const game = new SCORCHED.Game({
    headless: true,
    seed: opts.seed === undefined ? 99 : opts.seed,
    gameMode: opts.gameMode || 'aethercastle'
  });

  game.start({
    rounds: 1,
    wallType: 'rubber',
    startingCash: 20000,
    players: opts.players || [
      { name: 'P1', color: '#ff0000', type: 'Human', chassis: 'clockwork-tank' },
      { name: 'P2', color: '#00ff00', type: 'Human', chassis: 'walker-mech' }
    ]
  });

  // Off-grid on purpose — see the note on richScene. A tank parked on a whole
  // number would hide a rounding write in the largest draw path there is.
  game.roster.forEach((t, i) => {
    t.x = 200.375 + i * 300;
    t.y = 400.625;
    t.angle = 45 + i * 10;
    t.power = 500;
  });
  game.activePlayerIdx = 0;

  game.headless = false;
  game.canvas = { width: 1200, height: 700 };
  return game;
}

// One frame, as an ordered list of canvas operations.
function frameLog(game) {
  const rec = recordingContext();
  game.ctx = rec;
  game.draw();
  return rec.__log;
}

// Fields that are not simulation state: the drawing surface itself, the
// network client, and the recording log. Everything else on the Game is fair
// game and gets hashed.
const NOT_SIM = new Set(['ctx', 'canvas', 'net', '__log', 'audio', 'audioCtx']);

/**
 * The whole simulated world, deeply.
 *
 * An earlier version of this listed the fields it cared about by hand, which
 * made it blind in exactly the direction that matters: a draw path writing an
 * IDEMPOTENT value to an unlisted field (`proj.x = Math.round(proj.x)` is the
 * worked example) passed both purity tests while genuinely moving the world on
 * the drawing client only. Enumerating the world instead of naming parts of it
 * means a new sim field is covered the day it is added, without anyone
 * remembering to come back here.
 */
function worldFingerprint(game) {
  const seen = new WeakSet();
  const walk = (v) => {
    if (v === null || typeof v !== 'object') {
      // Distinguish -0 from 0 and keep NaN stable, which JSON would not.
      return typeof v === 'number' ? Object.is(v, -0) ? '-0' : String(v) : JSON.stringify(v);
    }
    if (seen.has(v)) return '<cycle>';
    seen.add(v);
    if (ArrayBuffer.isView(v)) return `[${Array.from(v).join(',')}]`;
    if (Array.isArray(v)) return `[${v.map(walk).join(',')}]`;
    return `{${Object.keys(v).sort()
      .filter(k => !NOT_SIM.has(k) && typeof v[k] !== 'function')
      .map(k => `${k}:${walk(v[k])}`).join(',')}}`;
  };
  return walk(game);
}

// The commit the classic golden fixture is recorded from: the last build
// before the visualisation layer existed. It had no theme switch at all and
// drew the DOS-era screen unconditionally, so its output IS classic's contract.
const GOLDEN_BASE = '63de891';

const GOLDEN_FIXTURE = path.join(__dirname, '..', 'fixtures', 'classic-frame.golden.txt');

/**
 * The recorded classic frame, per biome, in draw order.
 *
 * Line-oriented rather than JSON: when this fixture changes, a human has to
 * read the diff and decide whether the easter egg just broke, and a 300KB
 * single-line JSON array is unreviewable. One operation per line means git
 * shows exactly the ops that moved.
 */
function goldenFrames() {
  const text = fs.readFileSync(GOLDEN_FIXTURE, 'utf8');
  const out = {};
  let biome = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) { biome = line.slice(3).trim(); out[biome] = []; }
    else if (line !== '') out[biome].push(line);
  }
  return out;
}

/**
 * The first operation on which a build's classic frame departs from the
 * golden log, or null if every biome matches call for call.
 *
 * Shared by the parity test (which asserts null) and the mutation guard
 * (which asserts NOT null), so there is exactly one definition of what the
 * easter egg's contract is and both tests are held to the same one.
 */
function classicDrift(SCORCHED) {
  const golden = goldenFrames();
  for (const [biome, want] of Object.entries(golden)) {
    const game = renderableGame(SCORCHED, { gameMode: 'classic' });
    const got = frameLog(richScene(game, biome));
    const n = Math.max(want.length, got.length);
    for (let i = 0; i < n; i++) {
      if (got[i] !== want[i]) return { biome, index: i, want: want[i], got: got[i], wantLen: want.length, gotLen: got.length };
    }
  }
  return null;
}

/**
 * The scene every render test draws. Mode-agnostic on purpose.
 *
 * Deliberately broad. An earlier version of the parity test looked only at
 * terrain and sky, which left every other pass — tanks, shells, tracers,
 * bursts, particles, the crosshair — unprotected. Everything here is pinned to
 * a literal so the same call must come out of both builds; nothing is left to
 * a clock, a pool ordering or an RNG.
 *
 * The FRACTIONAL coordinates below are load-bearing, not decoration. The
 * purity guard's job is to catch a draw path quietly writing to simulation
 * state, and the worked example — `p.x = Math.round(p.x)` — is invisible
 * against a projectile sitting on a whole number. A scene made of round
 * numbers cannot detect rounding. Any value added here should be awkward.
 */
function richScene(game, biome) {
  game.terrain.biome = biome;

  const [a, b] = game.roster;
  // One live tank with a catalogued shield, one dead tank with an unknown
  // shield type — the live tank exercises the SHIELD_TYPES colour lookup and
  // the dead one proves corpses draw no shield at all.
  a.hp = 100;
  a.shield = { type: 'Shield', hp: 50 };
  a.inventory['Guidance Computer'] = 1;
  b.hp = 0;
  b.shield = { type: 'Not A Real Shield', hp: 20 };

  // Both shell radii: the Particle branch draws 1.5, everything else 3.
  game.projectiles = [
    { x: 500.437, y: 300.5, weapon: 'Missile' },
    { x: 640.19, y: 220.73, weapon: 'Particle Beam' }
  ];
  game.persistentTracers = [[{ x: 1.5, y: 2.25 }, { x: 3.75, y: 4.5 }, { x: 5.125, y: 6.875 }]];
  game.explosions = [
    { x: 100.5, y: 100.25, currentRadius: 20.4, maxRadius: 40, life: 0.5, maxLife: 1 },
    { x: 700.75, y: 260.125, currentRadius: 5.6, maxRadius: 40, life: 1, maxLife: 1 }
  ];

  // All three particle branches, spawned with explicit values so the pool
  // contents are identical on every run.
  if (game.particlePool) {
    game.particlePool.forEach(p => { p.active = false; });
    game.spawnParticle('spark', 310, 380, 2, -4, '#ff3300', 0.4, 2);
    game.spawnParticle('smoke', 330, 360, -1, -2, '#777777', 0.9, 5);
    game.spawnParticle('debris', 350, 390, 3, -6, '#8b5a2b', 0.7, 3);
  }
  return game;
}

module.exports = {
  recordingContext,
  loadScorched,
  loadScorchedFrom,
  renderableGame,
  frameLog,
  worldFingerprint,
  richScene,
  goldenFrames,
  classicDrift,
  GOLDEN_BASE,
  GOLDEN_FIXTURE
};
