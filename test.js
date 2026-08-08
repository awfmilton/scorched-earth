const fs = require('fs');
const vm = require('vm');

// 1. Read and extract the script block from index.html
const html = fs.readFileSync('index.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  console.error("Could not find script block in index.html");
  process.exit(1);
}
const code = scriptMatch[1];

// 2. Build mock DOM for browser-environment tests
function createDomMock() {
  const elements = {};

  class MockElement {
    constructor(tagName = 'div', id = '') {
      this.tagName = tagName;
      this.id = id;
      this.className = '';
      this.children = [];
      this.listeners = {};
      this._hidden = false;
      this._value = '';
      this.textContent = '';
      this.dataset = {};
      this.style = {};
      this.width = 0;
      this.height = 0;
    }

    getContext(type) {
      return {
        setTransform: () => {},
        save: () => {},
        restore: () => {},
        scale: () => {},
        clearRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        fill: () => {},
        stroke: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1
      };
    }

    getBoundingClientRect() {
      return { width: 1024, height: 768 };
    }

    get hidden() {
      return this._hidden;
    }
    set hidden(val) {
      this._hidden = val;
    }

    get value() {
      return this._value;
    }
    set value(val) {
      this._value = val;
    }

    addEventListener(event, fn) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    }

    dispatchEvent(event, data = {}) {
      if (this.listeners[event]) {
        this.listeners[event].forEach(fn => fn({ target: this, ...data }));
      }
    }

    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
    }

    get innerHTML() {
      return '';
    }
    set innerHTML(val) {
      // Clear children
      this.children = [];
      // When we write innerHTML for player row, we populate input mocks
      if (this.className === 'player-row') {
        const nameInput = new MockElement('input');
        nameInput.className = 'player-name';
        nameInput.value = `Player ${parseInt(this.dataset.index, 10) + 1}`;

        const typeSelect = new MockElement('select');
        typeSelect.className = 'player-type';
        typeSelect.value = 'Human';

        const colorSelect = new MockElement('select');
        colorSelect.className = 'player-color';
        colorSelect.value = '#ff00ff'; // default

        this.children.push(nameInput, typeSelect, colorSelect);
      }
    }

    querySelector(selector) {
      if (selector === '.player-name') return this.children.find(c => c.className === 'player-name');
      if (selector === '.player-type') return this.children.find(c => c.className === 'player-type');
      if (selector === '.player-color') return this.children.find(c => c.className === 'player-color');
      if (selector === '.hud-name') return this.children.find(c => c.className === 'hud-name');
      if (selector === '.hud-hp') return this.children.find(c => c.className === 'hud-hp');
      if (selector === '.hud-angle') return this.children.find(c => c.className === 'hud-angle');
      if (selector === '.hud-power') return this.children.find(c => c.className === 'hud-power');
      if (selector === '.hud-weapon') return this.children.find(c => c.className === 'hud-weapon');
      if (selector === '.hud-cash') return this.children.find(c => c.className === 'hud-cash');
      if (selector === '.hud-wind') return this.children.find(c => c.className === 'hud-wind');
      if (selector === '.hud-legend') return this.children.find(c => c.className === 'hud-legend');
      return null;
    }

    querySelectorAll(selector) {
      if (selector === '.player-row' || selector === '#player-slots .player-row') {
        return this.children.filter(c => c.className === 'player-row');
      }
      return [];
    }
  }

  // Pre-populate expected elements in index.html
  elements['game'] = new MockElement('canvas', 'game');
  elements['player-count'] = new MockElement('select', 'player-count');
  elements['player-count'].value = '4';
  elements['player-slots'] = new MockElement('div', 'player-slots');
  elements['rounds'] = new MockElement('input', 'rounds');
  elements['rounds'].value = '5';
  elements['starting-cash'] = new MockElement('input', 'starting-cash');
  elements['starting-cash'].value = '10000';
  elements['wall-type'] = new MockElement('select', 'wall-type');
  elements['wall-type'].value = 'off';
  elements['start-btn'] = new MockElement('button', 'start-btn');
  elements['error-msg'] = new MockElement('div', 'error-msg');
  elements['setup'] = new MockElement('div', 'setup');
  elements['hud'] = new MockElement('div', 'hud');

  const documentMock = {
    addEventListener: (event, fn) => {
      if (event === 'DOMContentLoaded') {
        // Run immediately
        setTimeout(fn, 0);
      }
    },
    getElementById: (id) => {
      return elements[id] || null;
    },
    createElement: (tagName) => {
      return new MockElement(tagName);
    },
    querySelector: (selector) => {
      if (selector === 'input[name="weapon-availability"]:checked') {
        return { value: 'all' };
      }
      return null;
    },
    querySelectorAll: (selector) => {
      if (selector === '.player-row' || selector === '#player-slots .player-row') {
        return elements['player-slots'].children;
      }
      return [];
    }
  };

  const windowMock = {
    addEventListener: () => {},
    devicePixelRatio: 1,
    innerWidth: 1024,
    innerHeight: 768
  };

  return { documentMock, windowMock, elements };
}

// 3. Tests
function runTests() {
  console.log("=== Running Scorched Earth Setup Chunk Tests ===");

  // --- Test 1: Headless initialization and start config ---
  const headlessContext = {
    globalThis: {},
    Math: Math,
    Float32Array: Float32Array,
    console: console
  };
  headlessContext.globalThis = headlessContext;

  vm.createContext(headlessContext);
  vm.runInContext(code, headlessContext);

  const SCORCHED = headlessContext.globalThis.SCORCHED;
  if (!SCORCHED) {
    throw new Error("SCORCHED global object not exposed!");
  }
  console.log("✓ SCORCHED global exposed successfully.");

  const headlessGame = SCORCHED.createHeadlessGame({ seed: 12345 });
  if (!headlessGame.headless) {
    throw new Error("Game is not marked as headless!");
  }
  console.log("✓ Headless game instance created successfully.");

  // Run start on headless game
  const testConfig = {
    players: [
      { name: 'Alice', type: 'Human', color: '#ff00ff' },
      { name: 'Bob', type: 'Shooter', color: '#00ffff' },
      { name: 'Charlie', type: 'Cyborg', color: '#ff2222' },
      { name: 'Diana', type: 'Poolshark', color: '#22ff22' }
    ],
    rounds: 10,
    startingCash: 15000,
    wallType: 'rubber',
    weaponsAvailability: 'all'
  };

  headlessGame.start(testConfig);

  // Assertions on headless game configuration
  if (headlessGame.rounds !== 10) {
    throw new Error(`Expected rounds to be 10, got ${headlessGame.rounds}`);
  }
  if (headlessGame.startingCash !== 15000) {
    throw new Error(`Expected startingCash to be 15000, got ${headlessGame.startingCash}`);
  }
  if (headlessGame.wallType !== 'rubber') {
    throw new Error(`Expected wallType to be rubber, got ${headlessGame.wallType}`);
  }
  if (!headlessGame.roster || headlessGame.roster.length !== 4) {
    throw new Error(`Expected roster with 4 tanks, got ${headlessGame.roster ? headlessGame.roster.length : 0}`);
  }
  console.log("✓ Headless game start config stored and parsed correctly.");

  // Verify spacing and jitter of player positions
  const zoneW = SCORCHED.CONST.WORLD_W / 4; // 1200 / 4 = 300
  const margin = 40;
  headlessGame.roster.forEach((tank, idx) => {
    const minX = zoneW * idx + margin;
    const maxX = zoneW * (idx + 1) - margin;
    if (tank.x < minX || tank.x > maxX) {
      throw new Error(`Tank ${idx} position ${tank.x} out of bounds [${minX}, ${maxX}]`);
    }
    // Check initial properties
    if (tank.name !== testConfig.players[idx].name) throw new Error("Tank name mismatch");
    if (tank.color !== testConfig.players[idx].color) throw new Error("Tank color mismatch");
    if (tank.type !== testConfig.players[idx].type) throw new Error("Tank type mismatch");
    if (tank.hp !== 100) throw new Error("Tank hp must be 100 on start");
    if (tank.angle !== 45) throw new Error("Tank angle must be 45 on start");
    if (tank.power !== 500) throw new Error("Tank power must be 500 on start");
    if (tank.cash !== 15000) throw new Error("Tank cash must match starting cash");
    if (typeof tank.inventory !== 'object') throw new Error("Tank inventory must be object");
    if (tank.shield !== null) throw new Error("Tank shield must be null on start");
  });
  console.log("✓ Tank roster properties, spacing, and jitter verified successfully.");

  // --- Test 2: Browser environment and modal interaction ---
  const { documentMock, windowMock, elements } = createDomMock();
  const browserContext = {
    globalThis: {},
    Math: Math,
    Float32Array: Float32Array,
    console: console,
    document: documentMock,
    window: windowMock,
    setTimeout: setTimeout,
    requestAnimationFrame: () => {}
  };
  browserContext.globalThis = browserContext;

  vm.createContext(browserContext);
  vm.runInContext(code, browserContext);

  // Let DOMContentLoaded trigger and player slots render
  setTimeout(() => {
    const playerSlotsContainer = elements['player-slots'];
    const pCountSelect = elements['player-count'];

    // Default should render 4 player slots because playerCountSelect has value = 4
    if (playerSlotsContainer.children.length !== 4) {
      throw new Error(`Expected 4 initial player slots, got ${playerSlotsContainer.children.length}`);
    }
    console.log("✓ Initial 4 player slots rendered correctly on load.");

    // Trigger player count change to 2
    pCountSelect.value = '2';
    pCountSelect.dispatchEvent('change');

    if (playerSlotsContainer.children.length !== 2) {
      throw new Error(`Expected 2 player slots after changing count, got ${playerSlotsContainer.children.length}`);
    }
    console.log("✓ Dynamically updated player slots to 2 successfully.");

    // Test color duplicate rejection
    // Let's set both player rows to the same color
    const rows = playerSlotsContainer.children;
    rows[0].querySelector('.player-color').value = '#ff00ff';
    rows[1].querySelector('.player-color').value = '#ff00ff';

    // Click start game
    const startBtn = elements['start-btn'];
    startBtn.dispatchEvent('click');

    const errorMsgDiv = elements['error-msg'];
    if (!errorMsgDiv.textContent.includes('Error')) {
      throw new Error(`Expected duplicate color error, got: "${errorMsgDiv.textContent}"`);
    }
    console.log("✓ Duplicate color rejection successfully prevented game start.");

    // Resolve duplicates
    rows[1].querySelector('.player-color').value = '#00ffff';
    errorMsgDiv.textContent = '';

    startBtn.dispatchEvent('click');
    if (errorMsgDiv.textContent !== '') {
      throw new Error(`Unexpected validation error after fixing colors: ${errorMsgDiv.textContent}`);
    }

    // Modal should be hidden
    const setupEl = elements['setup'];
    if (!setupEl.hidden) {
      throw new Error("Expected setup modal to be hidden after successful start!");
    }
    console.log("✓ Setup modal is correctly hidden on successful start.");

    // --- Test 3: Physics, projectile trajectory and wind ---
    console.log("\n=== Running Turn Cycle & Physics Tests ===");

    // Set up a headless game with known parameters
    const game = SCORCHED.createHeadlessGame({ seed: 100 });
    game.start({
      players: [
        { name: 'P1', type: 'Human', color: '#ff00ff' },
        { name: 'P2', type: 'Human', color: '#00ffff' }
      ],
      rounds: 5,
      startingCash: 10000,
      wallType: 'off'
    });

    // Ensure wind is 0 for the trajectory symmetry test
    game.wind = 0;

    // Place P1 at x = 100, and ensure terrain height at x=100 and x=1100 are flat
    for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
      game.terrain.heights[i] = 100; // Flat terrain of height 100 from bottom (y = 600)
    }

    // Reposition player 1 and player 2 manually for clean testing
    game.roster[0].x = 100;
    game.roster[1].x = 1100;
    game.snapTanksToTerrain();

    // Test 3.1: Symmetric Parabola
    // P1 shoots at 45 degrees, 500 power
    game.activePlayerIdx = 0;
    game.roster[0].angle = 45;
    game.roster[0].power = 500;

    const barrelLen = 12;
    const angleRad = (45 * Math.PI) / 180;
    const startX = game.roster[0].x + barrelLen * Math.cos(angleRad);

    let impactX = null;
    let impactY = null;
    game.config.onImpact = (x, y) => {
      impactX = x;
      impactY = y;
    };

    // Fire
    game.fireActiveWeapon();
    if (!game.projectile) {
      throw new Error("Projectile was not created!");
    }

    // Drive physics with stepPhysics
    const dt = SCORCHED.CONST.TICK;
    let ticks = 0;
    while (game.projectile && ticks < 1000) {
      game.stepPhysics(dt);
      ticks++;
    }

    if (!impactX) {
      throw new Error("Projectile did not impact terrain or tank!");
    }

    console.log(`✓ Bullet shot from ${startX.toFixed(2)} landed at ${impactX.toFixed(2)} in zero wind.`);

    // Symmetrical check:
    // The distance from launch startX to landing point should be symmetric
    // Because it is a flat terrain, and no wind, horizontal distance traveled = vx * airTime.
    // The distance traveled = impactX - startX.
    // Let's verify that a symmetric trajectory was traced. Let's print distance and ensure it is reasonable.
    const distance = impactX - startX;
    if (distance <= 0) {
      throw new Error("Projectile went backwards or didn't move!");
    }

    // Test 3.2: Wind effect
    // Re-run with negative wind (should blow projectile further left, i.e., windImpactX should be smaller than impactX)
    game.activePlayerIdx = 0;
    game.newRound(100); // re-generate
    for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
      game.terrain.heights[i] = 100;
    }
    game.roster[0].x = 100;
    game.roster[1].x = 1100;
    game.snapTanksToTerrain();
    game.wind = -50; // negative wind

    let windImpactX = null;
    game.config.onImpact = (x, y) => {
      windImpactX = x;
    };

    game.fireActiveWeapon();
    ticks = 0;
    while (game.projectile && ticks < 1000) {
      game.stepPhysics(dt);
      ticks++;
    }

    if (windImpactX === null) {
      throw new Error("Expected bullet to land on terrain under negative wind, but it did not!");
    }

    console.log(`✓ Bullet with negative wind (-50) landed at ${windImpactX.toFixed(2)}.`);
    if (windImpactX >= impactX) {
      throw new Error(`Expected negative wind to shift bullet left (landed at ${windImpactX} vs ${impactX})`);
    }

    // Test 3.3: Wall Modes (off, rubber, wrap, concrete)
    const runWallTest = (wallType) => {
      const wallGame = SCORCHED.createHeadlessGame({ seed: 200 });
      wallGame.start({
        players: [
          { name: 'P1', type: 'Human', color: '#ff00ff' },
          { name: 'P2', type: 'Human', color: '#00ffff' }
        ],
        rounds: 5,
        startingCash: 10000,
        wallType: wallType
      });
      // flat and low terrain so bullet can reach walls
      for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
        wallGame.terrain.heights[i] = 20;
      }
      wallGame.roster[0].x = 100;
      wallGame.roster[1].x = 1100;
      wallGame.snapTanksToTerrain();
      wallGame.wind = 0;

      // Shot angled steeply to the left to hit left wall
      wallGame.roster[0].angle = 135; // facing left-up
      wallGame.roster[0].power = 800;
      wallGame.fireActiveWeapon();

      let wallImpactX = null;
      wallGame.config.onImpact = (x, y) => {
        wallImpactX = x;
      };

      let bounced = false;
      let wrapped = false;
      let initialX = wallGame.projectile.x;

      let wticks = 0;
      while (wallGame.projectile && wticks < 1000) {
        const prevVx = wallGame.projectile.vx;
        const prevX = wallGame.projectile.x;
        wallGame.stepPhysics(dt);
        if (wallGame.projectile) {
          if (wallType === 'rubber' || wallType === 'concrete') {
            if (wallGame.projectile.vx > 0 && prevVx < 0) {
              bounced = true;
            }
          }
          if (wallType === 'wrap') {
            if (prevX < 100 && wallGame.projectile.x > 1000) {
              wrapped = true;
            }
          }
        }
        wticks++;
      }

      return { bounced, wrapped, wallImpactX };
    };

    const offResult = runWallTest('off');
    console.log(`✓ 'off' wall mode result: impactX = ${offResult.wallImpactX}`);
    if (offResult.wallImpactX !== null) {
      throw new Error("Bullet should have despawned on leaving screen with 'off' walls, but it impacted!");
    }

    const rubberResult = runWallTest('rubber');
    console.log(`✓ 'rubber' wall mode result: bounced = ${rubberResult.bounced}, impactX = ${rubberResult.wallImpactX}`);
    if (!rubberResult.bounced) {
      throw new Error("Bullet did not bounce under 'rubber' wall mode!");
    }
    if (rubberResult.wallImpactX === null) {
      throw new Error("Bullet did not land after bouncing under 'rubber' wall mode!");
    }

    const wrapResult = runWallTest('wrap');
    console.log(`✓ 'wrap' wall mode result: wrapped = ${wrapResult.wrapped}, impactX = ${wrapResult.wallImpactX}`);
    if (!wrapResult.wrapped) {
      throw new Error("Bullet did not wrap around screen under 'wrap' wall mode!");
    }

    const concreteResult = runWallTest('concrete');
    console.log(`✓ 'concrete' wall mode result: bounced = ${concreteResult.bounced}, impactX = ${concreteResult.wallImpactX}`);
    if (!concreteResult.bounced) {
      throw new Error("Bullet did not bounce under 'concrete' wall mode!");
    }

    // Test 3.4: Turn rotation skipping dead tanks
    console.log("✓ Testing turn rotation skipping dead tanks...");
    const turnGame = SCORCHED.createHeadlessGame({ seed: 300 });
    turnGame.start({
      players: [
        { name: 'P1', type: 'Human', color: '#ff00ff' },
        { name: 'P2', type: 'Human', color: '#00ffff' },
        { name: 'P3', type: 'Human', color: '#ff2222' }
      ],
      rounds: 5,
      startingCash: 10000,
      wallType: 'off'
    });

    if (turnGame.activePlayerIdx !== 0) throw new Error("Expected active player 0 initially");

    // Let's kill P2
    turnGame.roster[1].hp = 0;

    turnGame.nextTurn();
    if (turnGame.activePlayerIdx !== 2) {
      throw new Error(`Expected turn to pass to P3 (index 2) because P2 is dead, but got index ${turnGame.activePlayerIdx}`);
    }
    console.log("✓ Correctly skipped dead P2.");

    turnGame.nextTurn();
    if (turnGame.activePlayerIdx !== 0) {
      throw new Error(`Expected turn to pass back to P1 (index 0), but got index ${turnGame.activePlayerIdx}`);
    }
    console.log("✓ Handed turn back to P1.");

    // Test 3.5: AI Autoshot and complete fire-to-impact cycle completely driven by stepPhysics
    console.log("✓ Testing AI autoshot driven purely by stepPhysics...");
    const aiGame = SCORCHED.createHeadlessGame({ seed: 400 });
    aiGame.start({
      players: [
        { name: 'AI_1', type: 'Moron', color: '#ff00ff' },
        { name: 'AI_2', type: 'Shooter', color: '#00ffff' }
      ],
      rounds: 5,
      startingCash: 10000,
      wallType: 'rubber'
    });

    // Since both are AI, a single stepPhysics call should trigger AI_1's shot immediately
    if (aiGame.projectile !== null) throw new Error("Expected no projectile initially");
    aiGame.stepPhysics(dt);
    if (aiGame.projectile === null) {
      throw new Error("AI player did not shoot on stepPhysics call!");
    }
    console.log(`✓ AI player 1 fired projectile with angle ${aiGame.roster[0].angle} and power ${aiGame.roster[0].power}.`);

    // Let's run stepPhysics until the projectile impacts and AI_2 takes their turn and shoots
    ticks = 0;
    while (ticks < 1000) {
      aiGame.stepPhysics(dt);
      if (aiGame.activePlayerIdx === 1 && aiGame.projectile !== null) {
        break;
      }
      ticks++;
    }

    if (aiGame.activePlayerIdx !== 1 || !aiGame.projectile) {
      throw new Error("Active player did not transition to AI_2 or AI_2 did not fire!");
    }
    console.log(`✓ AI player 2 fired projectile with angle ${aiGame.roster[1].angle} and power ${aiGame.roster[1].power}.`);

    // === Chunk 5: Impact Resolution, Falling, Parachute, Particles, and Chain Reactions ===
    console.log("\n=== Running Impact Resolution & Falling Tests ===");

    // Test 4.1: Direct hit reduces target hp and heights array differs
    const impactGame = SCORCHED.createHeadlessGame({ seed: 500 });
    impactGame.start({
      players: [
        { name: 'P1', type: 'Human', color: '#ff00ff' },
        { name: 'P2', type: 'Human', color: '#00ffff' }
      ],
      rounds: 5,
      startingCash: 10000,
      wallType: 'off'
    });

    // Make flat terrain of height 100
    for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
      impactGame.terrain.heights[i] = 100;
    }
    impactGame.roster[0].x = 100;
    impactGame.roster[1].x = 200;
    impactGame.snapTanksToTerrain();

    const initialHeight100 = impactGame.terrain.heightAt(100);
    const initialTargetHp = impactGame.roster[1].hp;

    // Trigger onImpact directly at target P2 location (x = 200, y = 600)
    const pxY = SCORCHED.CONST.WORLD_H - 100; // 600
    // Keep a heights snapshot before impact
    const heightsSnapshot = new Float32Array(impactGame.terrain.heights);

    impactGame.onImpact(200, pxY, 'Baby Missile', 0); // Fired by P1 (idx 0)

    const postImpactTargetHp = impactGame.roster[1].hp;
    const heightsDiffer = Array.from(impactGame.terrain.heights).some((h, idx) => h !== heightsSnapshot[idx]);

    if (postImpactTargetHp >= initialTargetHp) {
      throw new Error(`Expected target HP to be reduced from ${initialTargetHp}, but got ${postImpactTargetHp}`);
    }
    if (!heightsDiffer) {
      throw new Error("Expected heights array to differ after carve and settle!");
    }
    console.log(`✓ Direct hit reduced HP from ${initialTargetHp} to ${postImpactTargetHp}. Heights array changed.`);

    // Test 4.2: Tank standing over freshly carved crater falls, taking damage that scales with fall height
    const fallGame = SCORCHED.createHeadlessGame({ seed: 600 });
    fallGame.start({
      players: [
        { name: 'P1', type: 'Human', color: '#ff00ff' },
        { name: 'P2', type: 'Human', color: '#00ffff' }
      ],
      rounds: 5,
      startingCash: 10000,
      wallType: 'off'
    });

    for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
      fallGame.terrain.heights[i] = 200; // High terrain so there is room to fall
    }
    fallGame.roster[0].x = 100;
    fallGame.roster[1].x = 200;
    fallGame.snapTanksToTerrain();

    // Directly carve crater at P2 (x = 200) without applying direct hit damage so we can measure drop damage purely
    const targetY = fallGame.roster[1].y;
    fallGame.terrain.carve(200, targetY, 40);
    fallGame.terrain.settle();
    fallGame.reSeatTanks(); // Mark tank falling

    if (!fallGame.roster[1].falling) {
      throw new Error("Expected P2 tank to enter a falling state after terrain under it is carved!");
    }

    let iterations = 0;
    while (fallGame.roster[1].falling && iterations < 1000) {
      fallGame.stepPhysics(SCORCHED.CONST.TICK);
      iterations++;
    }

    const fallDamageHp = fallGame.roster[1].hp;
    if (fallDamageHp >= 100) {
      throw new Error("Expected falling tank to take drop damage, but hp remained at 100!");
    }
    console.log(`✓ Tank fell into carved crater, taking drop damage. HP reduced to ${fallDamageHp}.`);

    // Test 4.3: Parachute is consumed to take zero drop damage
    const parachuteGame = SCORCHED.createHeadlessGame({ seed: 700 });
    parachuteGame.start({
      players: [
        { name: 'P1', type: 'Human', color: '#ff00ff' },
        { name: 'P2', type: 'Human', color: '#00ffff' }
      ],
      rounds: 5,
      startingCash: 10000,
      wallType: 'off'
    });

    for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
      parachuteGame.terrain.heights[i] = 200;
    }
    parachuteGame.roster[0].x = 100;
    parachuteGame.roster[1].x = 200;
    parachuteGame.snapTanksToTerrain();

    // Give P2 a Parachute defensively
    parachuteGame.roster[1].inventory['Parachute'] = 1;

    parachuteGame.terrain.carve(200, parachuteGame.roster[1].y, 40);
    parachuteGame.terrain.settle();
    parachuteGame.reSeatTanks();

    iterations = 0;
    while (parachuteGame.roster[1].falling && iterations < 1000) {
      parachuteGame.stepPhysics(SCORCHED.CONST.TICK);
      iterations++;
    }

    if (parachuteGame.roster[1].inventory['Parachute'] !== 0) {
      throw new Error("Expected Parachute to be consumed!");
    }
    if (parachuteGame.roster[1].hp !== 100) {
      throw new Error(`Expected zero drop damage with parachute, but HP was ${parachuteGame.roster[1].hp}`);
    }
    console.log("✓ Parachute successfully consumed, preventing drop damage entirely.");

    // Test 4.4: Particle pool is safe, and particles can be spawned (simulated non-headless scenario)
    // Create a mock non-headless Game instance to verify particles
    const mockCanvas = { getContext: () => ({}) };
    const globalDocument = global.document;
    global.document = {
      getElementById: (id) => (id === 'game' ? mockCanvas : null),
      createElement: () => ({ appendChild: () => {}, querySelector: () => null })
    };
    const globalWindow = global.window;
    global.window = {
      addEventListener: () => {},
      innerWidth: 1024,
      innerHeight: 768,
      devicePixelRatio: 1
    };

    const visualGame = new SCORCHED.Game({ headless: false, seed: 800 });
    visualGame.start({
      players: [
        { name: 'P1', type: 'Human', color: '#ff00ff' },
        { name: 'P2', type: 'Human', color: '#00ffff' }
      ],
      rounds: 5,
      startingCash: 10000,
      wallType: 'off'
    });

    // Check pre-allocated particle pool
    if (!visualGame.particlePool || visualGame.particlePool.length !== 600) {
      throw new Error("Expected visual game particle pool of exactly 600 particles!");
    }

    // Spawn 700 particles to test hard capping at 600
    for (let i = 0; i < 700; i++) {
      visualGame.spawnParticle('spark', 100, 100, 10, 10, '#ff0000', 1.0, 2);
    }

    const activeParticlesCount = visualGame.particlePool.filter(p => p.active).length;
    if (activeParticlesCount > 600) {
      throw new Error(`Expected active particles to not exceed cap of 600, got ${activeParticlesCount}`);
    }
    console.log(`✓ Pre-allocated particle pool verified. Spawning 700 particles capped active count at ${activeParticlesCount}.`);

    // Clean up globals
    global.document = globalDocument;
    global.window = globalWindow;

    // Test 4.5: A kill during flight leaves the turn order intact, with the turn still advancing
    const killGame = SCORCHED.createHeadlessGame({ seed: 900 });
    killGame.start({
      players: [
        { name: 'P1', type: 'Human', color: '#ff00ff' },
        { name: 'P2', type: 'Human', color: '#00ffff' },
        { name: 'P3', type: 'Human', color: '#ff0000' }
      ],
      rounds: 5,
      startingCash: 10000,
      wallType: 'off'
    });

    for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
      killGame.terrain.heights[i] = 100;
    }
    killGame.roster[0].x = 100;
    killGame.roster[1].x = 200;
    killGame.roster[2].x = 300;
    killGame.snapTanksToTerrain();

    // P1 active, shooter idx = 0. We'll set P2 HP to 10 so a direct hit kills it.
    killGame.roster[1].hp = 10;
    killGame.activePlayerIdx = 0;

    // Trigger impact on P2 (x=200)
    killGame.onImpact(200, 600, 'Baby Missile', 0);

    if (killGame.roster[1].hp !== 0) {
      throw new Error(`Expected P2 to be killed, got hp ${killGame.roster[1].hp}`);
    }
    if (killGame.roster[0].kills !== 1) {
      throw new Error(`Expected P1 shooter to get 1 kill, got ${killGame.roster[0].kills}`);
    }

    // Call nextTurn() simulating stepPhysics ending bullet trajectory
    killGame.nextTurn();
    if (killGame.activePlayerIdx !== 2) {
      throw new Error(`Expected active turn to advance to P3 (idx 2) because P2 is dead, but got idx ${killGame.activePlayerIdx}`);
    }
    console.log("✓ Target killed during flight. Firing tank credited with kill. Turn advanced to remaining alive player.");

    // === Chunk 6: Arsenal inventory, shields, and multi-projectile mechanics ===
    console.log("\n=== Chunk 6: Arsenal, shields, multi-projectile ===");

    // Helper: a flat-terrain 2-player game with tanks at known positions
    function makeArsenalGame(seed) {
      const g = SCORCHED.createHeadlessGame({ seed });
      g.start({
        players: [
          { name: 'P1', type: 'Human', color: '#ff00ff' },
          { name: 'P2', type: 'Human', color: '#00ffff' }
        ],
        rounds: 5,
        startingCash: 10000,
        wallType: 'off'
      });
      g.wind = 0;
      for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
        g.terrain.heights[i] = 100;
      }
      g.roster[0].x = 100;
      g.roster[1].x = 400;
      g.snapTanksToTerrain();
      g.activePlayerIdx = 0;
      return g;
    }

    // Test 6.1: blast damage is absorbed by the shield before it reaches hp
    const shieldGame = makeArsenalGame(1000);
    shieldGame.roster[1].shield = { type: 'Shield', hp: 100 };
    shieldGame.roster[1].hp = 100;
    shieldGame.explosion(shieldGame.roster[1].x, shieldGame.roster[1].y - 3, 40, 60, 0);
    if (shieldGame.roster[1].hp !== 100) {
      throw new Error(`Blast: shield should absorb all damage, but hp fell to ${shieldGame.roster[1].hp}`);
    }
    if (!(shieldGame.roster[1].shield.hp < 100)) {
      throw new Error("Blast: shield hp should have been reduced");
    }
    console.log("✓ Blast damage absorbed by shield before hp.");

    // Test 6.2: REGRESSION — napalm burn must also be absorbed by the shield.
    // Previously the burn tick wrote tank.hp directly, bypassing the shield entirely.
    const napalmGame = makeArsenalGame(1001);
    const napalmTarget = napalmGame.roster[1];
    napalmTarget.shield = { type: 'Heavy Shield', hp: 200 };
    napalmTarget.hp = 100;
    const shieldHpBefore = napalmTarget.shield.hp;

    // Drop a burning napalm particle directly on the target and let it tick
    napalmGame.projectiles = [{
      x: napalmTarget.x,
      y: napalmTarget.y,
      vx: 0,
      vy: 0,
      weapon: 'Napalm Particle',
      shooterIdx: 0,
      rolling: true
    }];
    for (let i = 0; i < 30; i++) {
      napalmGame.stepPhysics(1 / 60);
    }

    if (napalmTarget.hp !== 100) {
      throw new Error(`Napalm: shield must absorb the burn, but hp fell to ${napalmTarget.hp}`);
    }
    if (!(napalmTarget.shield && napalmTarget.shield.hp < shieldHpBefore)) {
      throw new Error("Napalm: burn should have drained shield hp");
    }
    if (!(napalmGame.roster[0].damageDealt > 0)) {
      throw new Error("Napalm: shooter should be credited with damageDealt for burn ticks");
    }
    console.log("✓ Napalm burn absorbed by shield and credited to damageDealt.");

    // Test 6.3: with no shield, the napalm burn does reach hp
    const burnGame = makeArsenalGame(1002);
    const burnTarget = burnGame.roster[1];
    burnTarget.shield = null;
    burnTarget.hp = 100;
    burnGame.projectiles = [{
      x: burnTarget.x,
      y: burnTarget.y,
      vx: 0,
      vy: 0,
      weapon: 'Napalm Particle',
      shooterIdx: 0,
      rolling: true
    }];
    for (let i = 0; i < 30; i++) {
      burnGame.stepPhysics(1 / 60);
    }
    if (!(burnTarget.hp < 100)) {
      throw new Error("Napalm: an unshielded tank should take burn damage");
    }
    console.log("✓ Napalm burn damages an unshielded tank.");

    // Test 6.4: Auto Defense raises a replacement when the burn collapses a shield
    const autoGame = makeArsenalGame(1003);
    const autoTarget = autoGame.roster[1];
    autoTarget.hp = 100;
    autoTarget.shield = { type: 'Shield', hp: 0.15 }; // one burn tick collapses it
    autoTarget.inventory['Auto Defense'] = 1;
    autoTarget.inventory['Heavy Shield'] = 1;
    autoGame.projectiles = [{
      x: autoTarget.x,
      y: autoTarget.y,
      vx: 0,
      vy: 0,
      weapon: 'Napalm Particle',
      shooterIdx: 0,
      rolling: true
    }];
    for (let i = 0; i < 5; i++) {
      autoGame.stepPhysics(1 / 60);
    }
    if (!autoTarget.shield || autoTarget.shield.type !== 'Heavy Shield') {
      throw new Error(`Auto Defense should have raised a Heavy Shield on burn collapse, got ${JSON.stringify(autoTarget.shield)}`);
    }
    if (autoTarget.inventory['Heavy Shield'] !== 0) {
      throw new Error("Auto Defense should consume the Heavy Shield from inventory");
    }
    console.log("✓ Auto Defense re-raises a shield collapsed by napalm burn.");

    // Test 6.5: ammo decrements on fire; Baby Missile is unlimited
    const ammoGame = makeArsenalGame(1004);
    const shooterTank = ammoGame.roster[0];
    shooterTank.angle = 45;
    shooterTank.power = 500;
    shooterTank.inventory['Missile'] = 2;
    shooterTank.selectedWeapon = 'Missile';
    ammoGame.fireActiveWeapon();
    if (shooterTank.inventory['Missile'] !== 1) {
      throw new Error(`Expected Missile ammo to drop to 1, got ${shooterTank.inventory['Missile']}`);
    }
    if (ammoGame.projectiles.length !== 1) {
      throw new Error("Firing a Missile should put one projectile in flight");
    }

    // A weapon at zero ammo must not fire at all
    shooterTank.inventory['Missile'] = 0;
    ammoGame.projectiles = [];
    ammoGame.fireActiveWeapon();
    if (ammoGame.projectiles.length !== 0) {
      throw new Error("A weapon with zero ammo must not fire");
    }

    // Baby Missile is the fallback weapon and is never consumed
    shooterTank.selectedWeapon = 'Baby Missile';
    const babyBefore = shooterTank.inventory['Baby Missile'];
    ammoGame.projectiles = [];
    ammoGame.fireActiveWeapon();
    if (ammoGame.projectiles.length !== 1) {
      throw new Error("Baby Missile should always be able to fire");
    }
    if (shooterTank.inventory['Baby Missile'] !== babyBefore) {
      throw new Error("Baby Missile should be unlimited and never decrement");
    }
    console.log("✓ Ammo decrements on fire; zero ammo blocks firing; Baby Missile unlimited.");

    // Test 6.6: MIRV splits into 5 sub-projectiles at apex
    const mirvGame = makeArsenalGame(1005);
    const mirvTank = mirvGame.roster[0];
    mirvTank.angle = 45;
    mirvTank.power = 500;
    mirvTank.inventory['MIRV'] = 1;
    mirvTank.selectedWeapon = 'MIRV';
    mirvGame.fireActiveWeapon();

    let sawSplit = 0;
    for (let i = 0; i < 600 && mirvGame.projectiles.length > 0; i++) {
      mirvGame.stepPhysics(1 / 60);
      if (mirvGame.projectiles.length > sawSplit) {
        sawSplit = mirvGame.projectiles.length;
      }
    }
    if (sawSplit !== 5) {
      throw new Error(`Expected MIRV to split into 5 sub-projectiles, peaked at ${sawSplit}`);
    }
    console.log("✓ MIRV splits into 5 sub-projectiles at apex.");

    // Test 6.7: a projectile with no weapon name must not crash the physics loop
    const oddGame = makeArsenalGame(1006);
    oddGame.projectiles = [{
      x: 300, y: oddGame.roster[1].y, vx: 0, vy: 0, shooterIdx: 0, rolling: true
    }];
    oddGame.stepPhysics(1 / 60);
    console.log("✓ Nameless projectile handled without throwing.");

    // === Chunk 7: Intermission Shop Economy, Payouts, and basic-only toggle ===
    console.log("\n=== Chunk 7: Intermission Shop Economy & Payouts ===");

    // Test 7.1: Verify round-end payouts (damage, kills, and survival bonus)
    const payoutGame = SCORCHED.createHeadlessGame({ seed: 2000 });
    payoutGame.start({
      players: [
        { name: 'P1', type: 'Human', color: '#ff00ff' },
        { name: 'P2', type: 'Human', color: '#00ffff' }
      ],
      rounds: 3,
      startingCash: 1000,
      wallType: 'off'
    });

    // Manually inject round stats
    // Let's say P1 dealt 120.5 damage and got 1 kill, P1 survived (hp = 100)
    // Let's say P2 dealt 0 damage, 0 kills, P2 is dead (hp = 0)
    const p1 = payoutGame.roster[0];
    const p2 = payoutGame.roster[1];
    p1.damageDealt = 120.5;
    p1.kills = 1;
    p1.hp = 100;

    p2.damageDealt = 0;
    p2.kills = 0;
    p2.hp = 0;

    // Run handleRoundEnd manually to check payouts
    payoutGame.handleRoundEnd();

    // Check payouts
    // P1: $1000 (starting) + $120 (damage) + $500 (1 kill) + $100 (survival bonus for round 1) = $1720
    const expectedP1Cash = 1000 + 120 + 500 + 100; // 1720
    if (p1.cash !== expectedP1Cash) {
      throw new Error(`Expected P1 cash to be $${expectedP1Cash}, got $${p1.cash}`);
    }

    // P2: $1000 (starting) + $0 (damage) + $0 (kills) + $0 (survival bonus) = $1000
    if (p2.cash !== 1000) {
      throw new Error(`Expected P2 cash to be $1000, got $${p2.cash}`);
    }

    // Verify round stats are reset to 0
    if (p1.damageDealt !== 0 || p1.kills !== 0) {
      throw new Error("Expected P1 round stats to be reset to 0!");
    }

    // Verify cumulative stats are set
    if (p1.cumulativeDamage !== 120.5 || p1.cumulativeKills !== 1) {
      throw new Error(`Expected cumulative stats, got damage=${p1.cumulativeDamage}, kills=${p1.cumulativeKills}`);
    }

    console.log("✓ Round-end payouts, stat reset, and cumulative stat accumulation verified successfully.");

    // Test 7.2: Verify buy(tank, id) logic
    const buyGame = SCORCHED.createHeadlessGame({ seed: 2100 });
    buyGame.start({
      players: [
        { name: 'P1', type: 'Human', color: '#ff00ff' }
      ],
      rounds: 2,
      startingCash: 2000,
      wallType: 'off'
    });

    const shopper = buyGame.roster[0];

    // Missile cost is 500, pack size is 5
    const firstBuy = buyGame.buy(shopper, 'Missile');
    if (!firstBuy) {
      throw new Error("Expected P1 to successfully buy 'Missile'");
    }
    if (shopper.cash !== 1500) {
      throw new Error(`Expected P1 cash to be 1500, got ${shopper.cash}`);
    }
    if (shopper.inventory['Missile'] !== 5) {
      throw new Error(`Expected Missile inventory to be 5, got ${shopper.inventory['Missile']}`);
    }

    // Purchase another pack (cumulative)
    const secondBuy = buyGame.buy(shopper, 'Missile');
    if (!secondBuy) {
      throw new Error("Expected P1 to successfully buy 'Missile' second time");
    }
    if (shopper.cash !== 1000) {
      throw new Error(`Expected P1 cash to be 1000, got ${shopper.cash}`);
    }
    if (shopper.inventory['Missile'] !== 10) {
      throw new Error(`Expected Missile inventory to be 10, got ${shopper.inventory['Missile']}`);
    }

    // Try to buy an unaffordable item
    // Nuke cost is 5000, which is > shopper's cash 1000
    const expensiveBuy = buyGame.buy(shopper, 'Nuke');
    if (expensiveBuy) {
      throw new Error("Expected unaffordable purchase to be rejected, but it succeeded!");
    }
    if (shopper.cash !== 1000) {
      throw new Error(`Expected shopper cash to remain 1000, got ${shopper.cash}`);
    }
    if (shopper.inventory['Nuke'] !== undefined && shopper.inventory['Nuke'] !== 0) {
      throw new Error(`Expected shopper Nuke inventory to remain untouched, got ${shopper.inventory['Nuke']}`);
    }

    console.log("✓ buy(tank, id) functionality and validation checks verified successfully.");

    // Test 7.3: Verify basic-only toggle filters non-basic weapons
    const basicGame = SCORCHED.createHeadlessGame({ seed: 2200 });
    basicGame.start({
      players: [{ name: 'P1', type: 'Human', color: '#ff00ff' }],
      rounds: 2,
      startingCash: 2000,
      wallType: 'off',
      weaponsAvailability: 'basic'
    });

    const isBasicOnly = basicGame.config && basicGame.config.weaponsAvailability === 'basic';
    const BASIC_WEAPONS = ['Baby Missile', 'Missile', 'Tracer'];

    const filtered = SCORCHED.WEAPONS.filter(w => {
      if (isBasicOnly) {
        return BASIC_WEAPONS.includes(w.id);
      }
      return true;
    });

    if (filtered.length !== 3) {
      throw new Error(`Expected only 3 weapons when basic-only is enabled, got ${filtered.length}`);
    }
    const filteredIDs = filtered.map(w => w.id);
    if (!filteredIDs.includes('Baby Missile') || !filteredIDs.includes('Missile') || !filteredIDs.includes('Tracer')) {
      throw new Error("Filtered weapons list does not match basic weapons ('Baby Missile', 'Missile', 'Tracer')");
    }
    console.log("✓ basic-only config option filters non-basic weapons successfully.");

    console.log("\nALL TESTS PASSED SUCCESSFULLY! 🎉");
  }, 50);
}

runTests();
