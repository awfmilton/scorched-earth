// Boots the real page script from index.html in a vm and hands back a headless
// Game. Shared by the determinism test and the weapon-behaviour tests so both
// exercise the same code the browser runs, rather than a re-implementation.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadKitInto } = require('./gfx-kit.js');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function loadScorched() {
  const context = {
    globalThis: {},
    Math,
    Float32Array,
    console,
    setTimeout,
    clearTimeout,
    Terrain: require('../../lib/terrain.js'),
    Structures: require('../../lib/structures.js'),
    document: {
      getElementById: () => null,
      addEventListener: () => {}
    },
    window: {
      addEventListener: () => {}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  // Stands in for the page's <script src="gfx/..."> tags. A headless Game
  // never draws, but the page script resolves the kit at load either way.
  loadKitInto(context);
  vm.runInContext(code, context);
  return context.globalThis.SCORCHED;
}

// A two-tank headless round with the tanks parked at fixed columns, so a test
// can aim at a known target instead of wherever the placement RNG put them.
function newGame(opts) {
  opts = opts || {};
  const SCORCHED = loadScorched();
  // gameMode is the MATCH mode (aethercastle/classic), not local/online. It
  // decides whether this world has a holding on it at all, so a test that
  // wants the classic replica has to be able to ask for it.
  const game = new SCORCHED.Game({
    headless: true,
    seed: opts.seed || 12345,
    gameMode: opts.gameMode
  });

  const impacts = [];
  game.start({
    rounds: 1,
    wallType: opts.wallType || 'rubber',
    startingCash: 20000,
    players: [
      { name: 'P1', color: '#ff0000', type: 'Human' },
      { name: 'P2', color: '#00ff00', type: 'Human' }
    ],
    onImpact: (x, y) => impacts.push({ x, y })
  });

  if (opts.wind !== undefined) game.wind = opts.wind;

  return { SCORCHED, game, impacts };
}

// Fires `weapon` from the active tank and runs physics until everything has
// settled (or the tick budget runs out, which a stuck projectile would hit).
function fireAndSettle(game, weapon, angle, power, maxTicks) {
  const tank = game.roster[game.activePlayerIdx];
  tank.angle = angle;
  tank.power = power;
  tank.selectedWeapon = weapon;
  tank.inventory[weapon] = 1;
  game.fireActiveWeapon();

  const budget = maxTicks || 4000;
  let ticks = 0;
  while (game.projectiles.length > 0 && ticks < budget) {
    game.stepPhysics(0.016);
    ticks++;
  }
  // Let tanks finish falling and the terrain finish settling.
  for (let i = 0; i < 120; i++) game.stepPhysics(0.016);
  return ticks;
}

// Total dirt in the world. Rises when a weapon deposits, falls when it carves.
function terrainVolume(game) {
  let sum = 0;
  for (let i = 0; i < game.terrain.heights.length; i++) sum += game.terrain.heights[i];
  return sum;
}

// Screen y of the ground at a column. Detonating a dirt weapon below this is a
// no-op (the deposit disc is already buried), so tests must aim at the surface.
function surfaceY(SCORCHED, game, col) {
  return SCORCHED.CONST.WORLD_H - game.terrain.heights[col];
}

module.exports = { loadScorched, newGame, fireAndSettle, terrainVolume, surfaceY };
