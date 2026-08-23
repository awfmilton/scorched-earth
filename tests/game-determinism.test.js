const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
const code = scriptMatch[1];

function evaluateIndexHtml() {
  const context = {
    globalThis: {},
    Math,
    Float32Array,
    console,
    setTimeout,
    clearTimeout,
    Terrain: require('../lib/terrain.js'),
    Structures: require('../lib/structures.js'),
    document: {
      getElementById: () => null,
      addEventListener: () => {}
    },
    window: {
      addEventListener: () => {},
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.globalThis.SCORCHED;
}

function runSimulation(actions) {
  const SCORCHED = evaluateIndexHtml();
  const game = new SCORCHED.Game({ headless: true, seed: 12345 });
  game.start({
    rounds: 1,
    wallType: 'rubber',
    startingCash: 10000,
    players: [
      { name: 'P1', color: '#ff0000', type: 'Human' },
      { name: 'P2', color: '#00ff00', type: 'Human' }
    ]
  });

  // Apply actions
  let actionIdx = 0;

  for (let step = 0; step < 5000; step++) {
    // apply actions if tick matches
    while (actionIdx < actions.length && actions[actionIdx].tick === game.roundState.ticks) {
      const action = actions[actionIdx];
      if (action.type === 'FIRE') {
        const activeTank = game.roster[game.activePlayerIdx];
        if (activeTank) {
          activeTank.angle = action.angle;
          activeTank.power = action.power;
          activeTank.selectedWeapon = action.weapon;
          
          // fill inventory just in case
          activeTank.inventory[action.weapon] = 1;
          game.fireActiveWeapon();
        }
      }
      actionIdx++;
    }

    game.stepPhysics(0.016);
  }

  return {
    heights: Buffer.from(game.terrain.heights.buffer),
    tanks: game.roster.map(t => ({ x: t.x, y: t.y, hp: t.hp }))
  };
}

describe('Game Simulation Determinism', () => {
  it('identically simulates identical inputs with no float drift', () => {
    // Actions using scatter weapons (Cluster Bomb, Napalm) to test RNG
    const actions = [
      { tick: 10, type: 'FIRE', angle: 45, power: 600, weapon: 'Cluster Bomb' },
      { tick: 800, type: 'FIRE', angle: 135, power: 700, weapon: 'Napalm' },
      { tick: 1600, type: 'FIRE', angle: 80, power: 800, weapon: 'MIRV' },
      { tick: 2400, type: 'FIRE', angle: 110, power: 300, weapon: 'Liquid Dirt' },
      { tick: 3200, type: 'FIRE', angle: 30, power: 1000, weapon: 'Funky Bomb' }
    ];

    const run1 = runSimulation(actions);
    const run2 = runSimulation(actions);

    assert.ok(run1.heights.equals(run2.heights), 'Terrain heights buffer must be byte-identical');
    assert.deepStrictEqual(run1.tanks, run2.tanks, 'Tank positions and HP must be identical');
  });

  // The families added from AUDIT.md are all places where an implementation
  // would naturally reach for Math.random: where a tunnel stops, how far a hop
  // carries, how a shaft is shaped. Replay them and require bit-identity.
  it('replays the tunnelling, hopping and terrain-shaping weapons identically', () => {
    const actions = [
      { tick: 10, type: 'FIRE', angle: 50, power: 520, weapon: 'Heavy Sandhog' },
      { tick: 700, type: 'FIRE', angle: 130, power: 600, weapon: 'LeapFrog' },
      { tick: 1400, type: 'FIRE', angle: 60, power: 700, weapon: 'Earth Disrupter' },
      { tick: 2100, type: 'FIRE', angle: 120, power: 450, weapon: 'Ton of Dirt' },
      { tick: 2800, type: 'FIRE', angle: 45, power: 800, weapon: 'Riot Bomb' },
      { tick: 3500, type: 'FIRE', angle: 135, power: 900, weapon: 'Laser' },
      { tick: 4200, type: 'FIRE', angle: 70, power: 600, weapon: 'Plasma Blast' }
    ];

    const run1 = runSimulation(actions);
    const run2 = runSimulation(actions);

    assert.ok(run1.heights.equals(run2.heights), 'Terrain heights buffer must be byte-identical');
    assert.deepStrictEqual(run1.tanks, run2.tanks, 'Tank positions and HP must be identical');
  });

  // Guards the specific failure the lockstep design is exposed to: a weapon
  // that consumes a different NUMBER of values from the shared stream on two
  // clients leaves every later shot in the round misaligned. Interleaving the
  // scatter weapons with the new families and replaying proves the draws stay
  // in step across the whole round, not just within one shot.
  it('keeps the shared RNG stream aligned across mixed weapon rounds', () => {
    const actions = [
      { tick: 10, type: 'FIRE', angle: 45, power: 600, weapon: 'Cluster Bomb' },
      { tick: 600, type: 'FIRE', angle: 50, power: 520, weapon: 'Baby Sandhog' },
      { tick: 1200, type: 'FIRE', angle: 135, power: 700, weapon: 'Funky Bomb' },
      { tick: 1800, type: 'FIRE', angle: 60, power: 600, weapon: 'LeapFrog' },
      { tick: 2400, type: 'FIRE', angle: 110, power: 500, weapon: 'Napalm' },
      { tick: 3000, type: 'FIRE', angle: 55, power: 650, weapon: 'Dirt Ball' },
      { tick: 3600, type: 'FIRE', angle: 80, power: 800, weapon: 'MIRV' },
      { tick: 4200, type: 'FIRE', angle: 125, power: 400, weapon: 'Smoke Tracer' }
    ];

    const run1 = runSimulation(actions);
    const run2 = runSimulation(actions);

    assert.ok(run1.heights.equals(run2.heights), 'Terrain heights buffer must be byte-identical');
    assert.deepStrictEqual(run1.tanks, run2.tanks, 'Tank positions and HP must be identical');
  });
});
