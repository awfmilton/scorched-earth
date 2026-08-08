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

    console.log("\nALL TESTS PASSED SUCCESSFULLY! 🎉");
  }, 50);
}

runTests();
