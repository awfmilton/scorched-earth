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
    if (typeof tank.inventory !== 'object') throw new Error("Tank inventory must be empty object");
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

    console.log("\nALL TESTS PASSED SUCCESSFULLY! 🎉");
  }, 50);
}

runTests();
