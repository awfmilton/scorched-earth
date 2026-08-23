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
    document: {
      getElementById: () => null,
      addEventListener: () => {},
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

const SCORCHED = evaluateIndexHtml();
const game = new SCORCHED.Game({ headless: true, seed: 12345 });
game.start({
  players: [
    { name: 'P1', type: 'Human', color: '#ff00ff' },
    { name: 'P2', type: 'Human', color: '#00ffff' }
  ],
  rounds: 1,
  startingCash: 10000,
  wallType: 'off'
});

const P1 = game.roster[0];
const P2 = game.roster[1];
console.log(`P1: x=${P1.x}, y=${P1.y}`);
console.log(`P2: x=${P2.x}, y=${P2.y}`);

for (let power = 200; power <= 600; power += 10) {
  for (let angle = 10; angle <= 80; angle += 1) {
    const simGame = new SCORCHED.Game({ headless: true, seed: 12345 });
    simGame.start({
      players: [
        { name: 'P1', type: 'Human', color: '#ff00ff' },
        { name: 'P2', type: 'Human', color: '#00ffff' }
      ],
      rounds: 1,
      startingCash: 10000,
      wallType: 'off'
    });
    
    simGame.roster[0].angle = angle;
    simGame.roster[0].power = power;
    simGame.roster[0].selectedWeapon = 'Baby Missile';
    simGame.fireActiveWeapon();
    
    let ticks = 0;
    while (simGame.projectile && ticks < 1000) {
      simGame.stepPhysics(SCORCHED.CONST.TICK);
      ticks++;
    }
    
    if (simGame.roster[1].hp < 100) {
      console.log(`HIT! Angle: ${angle}, Power: ${power}, P2 HP: ${simGame.roster[1].hp}`);
      process.exit(0);
    }
  }
}
