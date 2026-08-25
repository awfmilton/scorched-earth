const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const terrainLib = require('../lib/terrain.js');

// 1. Read and extract the script block from index.html
// Resolve relative to this file so the suite runs from any working directory.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) {
  throw new Error("Could not find script block in index.html");
}
const code = scriptMatch[1];

// 2. Build mock DOM for browser-environment tests
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(...names) { names.forEach(n => this.classes.add(n)); }
  remove(...names) { names.forEach(n => this.classes.delete(n)); }
  toggle(name, force) {
    if (force !== undefined) {
      if (force) this.classes.add(name); else this.classes.delete(name);
    } else {
      if (this.classes.has(name)) this.classes.delete(name); else this.classes.add(name);
    }
  }
  contains(name) { return this.classes.has(name); }
}

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
    this.classList = new MockClassList();
  }

  getContext(type) {
    // a canvas stub whose getContext('2d') returns a Proxy of no-op functions
    return new Proxy({
      createLinearGradient() {
        return {
          addColorStop() {}
        };
      }
    }, {
      get(target, prop) {
        if (prop in target) {
          return target[prop];
        }
        return () => {};
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      }
    });
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
    return child;
  }

  setAttribute(name, value) {
    this.attributes = this.attributes || {};
    this.attributes[name] = value;
    if (name === 'id') this.id = value;
  }

  getAttribute(name) {
    return (this.attributes && this.attributes[name]) || null;
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
      colorSelect.value = '#ff2d9b'; // default

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

function createDomMock() {
  const elements = {};

  elements['game'] = new MockElement('canvas', 'game');
  elements['landing-view'] = new MockElement('div', 'landing-view');
  elements['lobby-view'] = new MockElement('div', 'lobby-view');
  elements['btn-create-match'] = new MockElement('button', 'btn-create-match');
  elements['btn-create-public'] = new MockElement('button', 'btn-create-public');
  elements['btn-join-match'] = new MockElement('button', 'btn-join-match');
  elements['btn-refresh-rooms'] = new MockElement('button', 'btn-refresh-rooms');
  elements['room-list'] = new MockElement('div', 'room-list');
  elements['join-code'] = new MockElement('input', 'join-code');
  elements['error-msg'] = new MockElement('div', 'error-msg');
  elements['start-btn'] = new MockElement('button', 'start-btn');
  elements['host-settings'] = new MockElement('div', 'host-settings');
  elements['client-waiting'] = new MockElement('div', 'client-waiting');
  elements['display-share-code'] = new MockElement('span', 'display-share-code');
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

  // Solo-vs-AI setup surface
  elements['solo-view'] = new MockElement('div', 'solo-view');
  elements['btn-play-solo'] = new MockElement('button', 'btn-play-solo');
  elements['btn-start-solo'] = new MockElement('button', 'btn-start-solo');
  elements['btn-solo-back'] = new MockElement('button', 'btn-solo-back');
  elements['solo-ai-list'] = new MockElement('div', 'solo-ai-list');
  elements['solo-ai-count'] = new MockElement('select', 'solo-ai-count');
  elements['solo-ai-count'].value = '2';
  elements['solo-name'] = new MockElement('input', 'solo-name');
  elements['solo-name'].value = 'TESTER';
  elements['solo-rounds'] = new MockElement('input', 'solo-rounds');
  elements['solo-rounds'].value = '3';
  elements['solo-cash'] = new MockElement('input', 'solo-cash');
  elements['solo-cash'].value = '10000';
  elements['solo-wall-type'] = new MockElement('select', 'solo-wall-type');
  elements['solo-wall-type'].value = 'off';
  elements['solo-weapons'] = new MockElement('select', 'solo-weapons');
  elements['solo-weapons'].value = 'all';

  // The per-opponent difficulty selects are built at runtime by
  // renderSoloAiList() and then looked up by id, so the mock has to resolve
  // ids on dynamically created nodes too, not just the pre-registered ones.
  const findById = (node, id) => {
    if (!node || !node.children) return null;
    for (const child of node.children) {
      if (child.id === id) return child;
      const nested = findById(child, id);
      if (nested) return nested;
    }
    return null;
  };

  const documentMock = {
    addEventListener: (event, fn) => {
      if (event === 'DOMContentLoaded') {
        setTimeout(fn, 0);
      }
    },
    getElementById: (id) => {
      if (elements[id]) return elements[id];
      for (const key of Object.keys(elements)) {
        const found = findById(elements[key], id);
        if (found) return found;
      }
      return null;
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
    listeners: {},
    addEventListener(event, fn) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    },
    dispatchEvent(event, data = {}) {
      if (this.listeners[event]) {
        this.listeners[event].forEach(fn => fn({ target: this, preventDefault: () => {}, ...data }));
      }
    },
    devicePixelRatio: 1,
    innerWidth: 1024,
    innerHeight: 768
  };

  return { documentMock, windowMock, elements };
}

// 3. VM contexts helper
function evaluateScript(customGlobals = {}) {
  const context = {
    globalThis: {},
    Math,
    Float32Array,
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 1, // dummy id
    clearInterval: () => {},
    sessionStorage: { getItem: () => null, setItem: () => {} },
    requestAnimationFrame: () => {}, // no-op requestAnimationFrame
    performance: { now: () => Date.now() },
    Terrain: terrainLib,
    ...customGlobals
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

// Extract standard SCORCHED global by evaluating script in headless VM
const headlessContext = evaluateScript();
const SCORCHED = headlessContext.globalThis.SCORCHED;

describe('Scorched Earth Smoke & Integration Tests', () => {

  describe('Headless smoke test harness assertions', () => {

    it('Evaluation throws nothing, exporting SCORCHED', () => {
      assert.ok(SCORCHED, "SCORCHED global object must be exported");
    });

    it('One updateHUD() call followed by one draw() call completes without throwing', () => {
      const { documentMock, windowMock } = createDomMock();
      const ctx = evaluateScript({
        document: documentMock,
        window: windowMock
      });
      const browserGame = new ctx.globalThis.SCORCHED.Game({ headless: false, seed: 100 });
      browserGame.start({
        players: [
          { name: 'P1', type: 'Human', color: '#ff2d9b' },
          { name: 'P2', type: 'Human', color: '#00bfff' }
        ],
        rounds: 1,
        startingCash: 10000,
        wallType: 'off'
      });

      // Call updateHUD followed by draw
      assert.doesNotThrow(() => {
        browserGame.updateHUD();
        browserGame.draw();
      }, "updateHUD and draw must complete without throwing errors");
    });

    it('terrain.heights.length === CONST.WORLD_W over a non-constant profile', () => {
      const game = SCORCHED.createHeadlessGame({ seed: 12345 });
      game.start({
        players: [
          { name: 'P1', type: 'Human', color: '#ff2d9b' },
          { name: 'P2', type: 'Human', color: '#00bfff' }
        ],
        rounds: 1,
        startingCash: 10000,
        wallType: 'off'
      });

      assert.strictEqual(game.terrain.heights.length, SCORCHED.CONST.WORLD_W, "Terrain length must match WORLD_W");

      const heights = game.terrain.heights;
      const isConstant = Array.from(heights).every(h => h === heights[0]);
      assert.strictEqual(isConstant, false, "Terrain heights profile must not be constant/flat");
    });

    it('Page-level Terrain class generate(seed) yields identical heights for same seed and differs for different seeds', () => {
      const t1 = new SCORCHED.Terrain();
      t1.generate(12345);
      const heights1 = new Float32Array(t1.heights);

      const t2 = new SCORCHED.Terrain();
      t2.generate(12345);
      const heights2 = new Float32Array(t2.heights);

      assert.deepStrictEqual(heights1, heights2, "Calling generate(seed) twice with same seed yields identical heights");

      const t3 = new SCORCHED.Terrain();
      t3.generate(54321);
      const heights3 = new Float32Array(t3.heights);

      assert.notDeepStrictEqual(heights1, heights3, "Calling generate(seed) with different seeds yields different heights");
    });

    it('Two tanks spawn on the terrain surface at hp === 100', () => {
      const game = SCORCHED.createHeadlessGame({ seed: 12345 });
      game.start({
        players: [
          { name: 'P1', type: 'Human', color: '#ff2d9b' },
          { name: 'P2', type: 'Human', color: '#00bfff' }
        ],
        rounds: 1,
        startingCash: 10000,
        wallType: 'off'
      });

      assert.strictEqual(game.roster.length, 2, "Expected exactly 2 tanks to spawn");
      game.roster.forEach((tank) => {
        assert.strictEqual(tank.hp, 100, "Tank must spawn with HP 100");
        const expectedY = SCORCHED.CONST.WORLD_H - game.terrain.heightAt(tank.x);
        assert.ok(Math.abs(tank.y - expectedY) < 1e-4, "Tank must spawn exactly on the terrain surface");
      });
    });

    it('Under a fixed seed, fire a Baby Missile at a fixed angle with fixed power toward the second tank, driving stepPhysics() inside a bounded loop', () => {
      const game = SCORCHED.createHeadlessGame({ seed: 12345 });
      game.start({
        players: [
          { name: 'P1', type: 'Human', color: '#ff2d9b' },
          { name: 'P2', type: 'Human', color: '#00bfff' }
        ],
        rounds: 1,
        startingCash: 10000,
        wallType: 'off'
      });

      const preShotHeights = new Float32Array(game.terrain.heights);

      // Fire Baby Missile at angle 51, power 330 (experimentally verified to hit P2 on seed 12345)
      game.roster[0].angle = 51;
      game.roster[0].power = 330;
      game.roster[0].selectedWeapon = 'Baby Missile';

      let impactRegistered = false;
      game.config.onImpact = (x, y) => {
        impactRegistered = true;
      };

      game.fireActiveWeapon();

      // Bounded physics loop
      const maxTicks = 1000;
      let ticks = 0;
      while (game.projectile && ticks < maxTicks) {
        game.stepPhysics(SCORCHED.CONST.TICK);
        ticks++;
      }

      assert.ok(ticks < maxTicks, `Projectile did not impact within ${maxTicks} ticks`);
      assert.ok(impactRegistered, "Impact should have been registered");

      // Assert heights differs from the pre-shot snapshot
      const heightsDiffer = Array.from(game.terrain.heights).some((h, idx) => h !== preShotHeights[idx]);
      assert.ok(heightsDiffer, "Terrain heights must differ after projectile impact");

      // Assert the target HP decreased
      assert.ok(game.roster[1].hp < 100, `Expected target HP to decrease from 100, but got ${game.roster[1].hp}`);
    });

  });

  describe('Legacy test suite assertions', () => {

    it('Test 1: Headless initialization and start config', () => {
      const headlessGame = SCORCHED.createHeadlessGame({ seed: 12345 });
      assert.strictEqual(headlessGame.headless, true, "Game should be marked as headless");

      const testConfig = {
        players: [
          { name: 'Alice', type: 'Human', color: '#ff2d9b' },
          { name: 'Bob', type: 'Shooter', color: '#00bfff' },
          { name: 'Charlie', type: 'Cyborg', color: '#e23a2e' },
          { name: 'Diana', type: 'Poolshark', color: '#8fd400' }
        ],
        rounds: 10,
        startingCash: 15000,
        wallType: 'rubber',
        weaponsAvailability: 'all'
      };

      headlessGame.start(testConfig);

      assert.strictEqual(headlessGame.rounds, 10);
      assert.strictEqual(headlessGame.startingCash, 15000);
      assert.strictEqual(headlessGame.wallType, 'rubber');
      assert.strictEqual(headlessGame.roster.length, 4);

      const zoneW = SCORCHED.CONST.WORLD_W / 4;
      const margin = 40;
      headlessGame.roster.forEach((tank, idx) => {
        const minX = zoneW * idx + margin;
        const maxX = zoneW * (idx + 1) - margin;
        assert.ok(tank.x >= minX && tank.x <= maxX, `Tank ${idx} position out of bounds`);
        assert.strictEqual(tank.name, testConfig.players[idx].name);
        assert.strictEqual(tank.color, testConfig.players[idx].color);
        assert.strictEqual(tank.type, testConfig.players[idx].type);
        assert.strictEqual(tank.hp, 100);
        assert.strictEqual(tank.angle, 45);
        assert.strictEqual(tank.power, 500);
        assert.strictEqual(tank.cash, 15000);
        assert.strictEqual(typeof tank.inventory, 'object');
        assert.strictEqual(tank.shield, null);
      });
    });

    it.skip('Test 2: Browser environment and modal interaction', (t, done) => {
      const { documentMock, windowMock, elements } = createDomMock();
      const browserCtx = evaluateScript({
        document: documentMock,
        window: windowMock
      });

      // Give a tiny timeout for DOMContentLoaded inside evaluated script to trigger
      setTimeout(() => {
        try {
          const playerSlotsContainer = elements['player-slots'];
          const pCountSelect = elements['player-count'];

          assert.strictEqual(playerSlotsContainer.children.length, 4, "Should render 4 player slots initially");

          pCountSelect.value = '2';
          pCountSelect.dispatchEvent('change');

          assert.strictEqual(playerSlotsContainer.children.length, 2, "Should render 2 player slots after count change");

          const rows = playerSlotsContainer.children;
          rows[0].querySelector('.player-color').value = '#ff2d9b';
          rows[1].querySelector('.player-color').value = '#ff2d9b';

          const startBtn = elements['start-btn'];
          startBtn.dispatchEvent('click');

          const errorMsgDiv = elements['error-msg'];
          assert.ok(errorMsgDiv.textContent.includes('Error'), "Should show duplicate color error");

          rows[1].querySelector('.player-color').value = '#00bfff';
          errorMsgDiv.textContent = '';

          startBtn.dispatchEvent('click');
          assert.strictEqual(errorMsgDiv.textContent, '', "Should have no validation error after fixing colors");

          const setupEl = elements['setup'];
          assert.strictEqual(setupEl.hidden, true, "Setup modal should be hidden on successful start");
          done();
        } catch (err) {
          done(err);
        }
      }, 50);
    });

    it('Solo vs AI: landing button opens the panel and starts a local AI match', (t, done) => {
      const { documentMock, windowMock, elements } = createDomMock();
      const browserCtx = evaluateScript({
        document: documentMock,
        window: windowMock
      });

      setTimeout(() => {
        try {
          elements['btn-play-solo'].dispatchEvent('click');

          assert.strictEqual(elements['solo-view'].hidden, false, 'Solo panel should open');
          assert.strictEqual(elements['landing-view'].hidden, true, 'Landing view should close');
          assert.strictEqual(
            elements['solo-ai-list'].children.length, 2,
            'Should render one difficulty row per AI opponent'
          );

          // Choose a distinct profile per opponent so the roster proves the
          // selects are actually read rather than defaulted.
          documentMock.getElementById('solo-ai-0').value = 'Cyborg';
          documentMock.getElementById('solo-ai-1').value = 'Moron';

          elements['btn-start-solo'].dispatchEvent('click');

          const game = browserCtx.globalThis.SCORCHED.gameInstance;
          assert.ok(game, 'gameInstance must exist');
          assert.strictEqual(elements['setup'].hidden, true, 'Setup modal hides on start');
          assert.strictEqual(game.mode, 'local', 'Solo play must not open a network session');
          assert.strictEqual(game.rounds, 3, 'Rounds must come from the solo settings');

          assert.strictEqual(game.roster.length, 3, 'Human plus two AI opponents');
          assert.strictEqual(game.roster[0].type, 'Human');
          assert.strictEqual(game.roster[0].name, 'TESTER');
          assert.strictEqual(game.roster[1].type, 'Cyborg');
          assert.strictEqual(game.roster[2].type, 'Moron');

          done();
        } catch (err) {
          done(err);
        }
      }, 50);
    });

    it('Solo vs AI: opponent count change re-renders the difficulty rows', (t, done) => {
      const { documentMock, windowMock, elements } = createDomMock();
      evaluateScript({ document: documentMock, window: windowMock });

      setTimeout(() => {
        try {
          elements['btn-play-solo'].dispatchEvent('click');
          assert.strictEqual(elements['solo-ai-list'].children.length, 2);

          elements['solo-ai-count'].value = '5';
          elements['solo-ai-count'].dispatchEvent('change');
          assert.strictEqual(
            elements['solo-ai-list'].children.length, 5,
            'Raising the opponent count should add difficulty rows'
          );

          elements['solo-ai-count'].value = '1';
          elements['solo-ai-count'].dispatchEvent('change');
          assert.strictEqual(
            elements['solo-ai-list'].children.length, 1,
            'Lowering the opponent count should remove them again'
          );

          elements['btn-solo-back'].dispatchEvent('click');
          assert.strictEqual(elements['solo-view'].hidden, true, 'BACK closes the solo panel');
          assert.strictEqual(elements['landing-view'].hidden, false, 'BACK restores the landing view');

          done();
        } catch (err) {
          done(err);
        }
      }, 50);
    });

    it.skip('Regression Test: Input behavior during roundOver (shop / match summary open)', (t, done) => {
      const { documentMock, windowMock, elements } = createDomMock();
      const browserCtx = evaluateScript({
        document: documentMock,
        window: windowMock
      });

      setTimeout(() => {
        try {
          const pCountSelect = elements['player-count'];
          pCountSelect.value = '2';
          pCountSelect.dispatchEvent('change');

          const playerSlotsContainer = elements['player-slots'];
          const rows = playerSlotsContainer.children;
          rows[0].querySelector('.player-color').value = '#ff2d9b';
          rows[1].querySelector('.player-color').value = '#00bfff';

          elements['start-btn'].dispatchEvent('click');

          const browserGame = browserCtx.globalThis.SCORCHED.gameInstance;
          assert.ok(browserGame, "SCORCHED.gameInstance must exist");

          const shooter = browserGame.roster[0];
          browserGame.buy(shooter, 'Missile');
          shooter.selectedWeapon = 'Missile';

          const initialMissiles = shooter.inventory['Missile'];
          const initialAngle = shooter.angle;
          const initialPower = shooter.power;

          browserGame.roundOver = true;

          // Dispatch keydowns
          windowMock.dispatchEvent('keydown', { key: ' ' });
          windowMock.dispatchEvent('keydown', { code: 'Space' });
          windowMock.dispatchEvent('keydown', { key: 'ArrowLeft' });
          windowMock.dispatchEvent('keydown', { key: 'ArrowRight' });
          windowMock.dispatchEvent('keydown', { key: 'ArrowUp' });
          windowMock.dispatchEvent('keydown', { key: 'ArrowDown' });
          windowMock.dispatchEvent('keydown', { key: '[' });
          windowMock.dispatchEvent('keydown', { key: ']' });

          assert.strictEqual(shooter.inventory['Missile'], initialMissiles);
          assert.strictEqual(shooter.angle, initialAngle);
          assert.strictEqual(shooter.power, initialPower);
          assert.strictEqual(browserGame.projectiles.length, 0);

          browserGame.roundOver = false;

          windowMock.dispatchEvent('keydown', { key: 'ArrowLeft' });
          assert.notStrictEqual(shooter.angle, initialAngle);

          windowMock.dispatchEvent('keydown', { key: ' ' });
          assert.strictEqual(shooter.inventory['Missile'], initialMissiles - 1);
          assert.strictEqual(browserGame.projectiles.length, 1);

          done();
        } catch (err) {
          done(err);
        }
      }, 50);
    });

    describe('Turn Cycle & Physics Tests', () => {

      it('Test 3.1: Symmetric Parabola', () => {
        const game = SCORCHED.createHeadlessGame({ seed: 100 });
        game.start({
          players: [
            { name: 'P1', type: 'Human', color: '#ff2d9b' },
            { name: 'P2', type: 'Human', color: '#00bfff' }
          ],
          rounds: 5,
          startingCash: 10000,
          wallType: 'off'
        });

        game.wind = 0;
        for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
          game.terrain.heights[i] = 100;
        }

        game.roster[0].x = 100;
        game.roster[1].x = 1100;
        game.snapTanksToTerrain();

        game.activePlayerIdx = 0;
        game.roster[0].angle = 45;
        game.roster[0].power = 500;

        const barrelLen = 12;
        const angleRad = (45 * Math.PI) / 180;
        const startX = game.roster[0].x + barrelLen * Math.cos(angleRad);

        let impactX = null;
        game.config.onImpact = (x, y) => {
          impactX = x;
        };

        game.fireActiveWeapon();
        assert.ok(game.projectile);

        const dt = SCORCHED.CONST.TICK;
        let ticks = 0;
        while (game.projectile && ticks < 1000) {
          game.stepPhysics(dt);
          ticks++;
        }

        assert.ok(impactX !== null);
        const distance = impactX - startX;
        assert.ok(distance > 0);
      });

      it('Test 3.2: Wind effect', () => {
        const game = SCORCHED.createHeadlessGame({ seed: 100 });
        game.start({
          players: [
            { name: 'P1', type: 'Human', color: '#ff2d9b' },
            { name: 'P2', type: 'Human', color: '#00bfff' }
          ],
          rounds: 5,
          startingCash: 10000,
          wallType: 'off'
        });

        game.wind = 0;
        for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
          game.terrain.heights[i] = 100;
        }

        game.roster[0].x = 100;
        game.roster[1].x = 1100;
        game.snapTanksToTerrain();

        game.activePlayerIdx = 0;
        game.roster[0].angle = 45;
        game.roster[0].power = 500;

        let impactX = null;
        game.config.onImpact = (x, y) => { impactX = x; };
        game.fireActiveWeapon();

        const dt = SCORCHED.CONST.TICK;
        while (game.projectile) { game.stepPhysics(dt); }

        // Negative wind
        game.activePlayerIdx = 0;
        game.newRound(100);
        for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
          game.terrain.heights[i] = 100;
        }
        game.roster[0].x = 100;
        game.roster[1].x = 1100;
        game.snapTanksToTerrain();
        game.wind = -50;

        let windImpactX = null;
        game.config.onImpact = (x, y) => { windImpactX = x; };
        game.fireActiveWeapon();

        while (game.projectile) { game.stepPhysics(dt); }

        assert.ok(windImpactX !== null);
        assert.ok(windImpactX < impactX, `Wind impact ${windImpactX} should be left of normal impact ${impactX}`);
      });

      it('Test 3.3: Wall Modes (off, rubber, wrap, concrete)', () => {
        const runWallTest = (wallType) => {
          const wallGame = SCORCHED.createHeadlessGame({ seed: 200 });
          wallGame.start({
            players: [
              { name: 'P1', type: 'Human', color: '#ff2d9b' },
              { name: 'P2', type: 'Human', color: '#00bfff' }
            ],
            rounds: 5,
            startingCash: 10000,
            wallType: wallType
          });
          for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
            wallGame.terrain.heights[i] = 20;
          }
          wallGame.roster[0].x = 100;
          wallGame.roster[1].x = 1100;
          wallGame.snapTanksToTerrain();
          wallGame.wind = 0;

          wallGame.roster[0].angle = 135;
          wallGame.roster[0].power = 800;
          wallGame.fireActiveWeapon();

          let wallImpactX = null;
          wallGame.config.onImpact = (x, y) => { wallImpactX = x; };

          let bounced = false;
          let wrapped = false;
          let wticks = 0;
          const dt = SCORCHED.CONST.TICK;
          while (wallGame.projectile && wticks < 1000) {
            const prevVx = wallGame.projectile.vx;
            const prevX = wallGame.projectile.x;
            wallGame.stepPhysics(dt);
            if (wallGame.projectile) {
              if (wallType === 'rubber' || wallType === 'concrete') {
                if (wallGame.projectile.vx > 0 && prevVx < 0) bounced = true;
              }
              if (wallType === 'wrap') {
                if (prevX < 100 && wallGame.projectile.x > 1000) wrapped = true;
              }
            }
            wticks++;
          }
          return { bounced, wrapped, wallImpactX };
        };

        const offResult = runWallTest('off');
        assert.strictEqual(offResult.wallImpactX, null);

        const rubberResult = runWallTest('rubber');
        assert.strictEqual(rubberResult.bounced, true);
        assert.ok(rubberResult.wallImpactX !== null);

        const wrapResult = runWallTest('wrap');
        assert.strictEqual(wrapResult.wrapped, true);

        const concreteResult = runWallTest('concrete');
        assert.strictEqual(concreteResult.bounced, true);
      });

      it('Test 3.4: Turn rotation skipping dead tanks', () => {
        const turnGame = SCORCHED.createHeadlessGame({ seed: 300 });
        turnGame.start({
          players: [
            { name: 'P1', type: 'Human', color: '#ff2d9b' },
            { name: 'P2', type: 'Human', color: '#00bfff' },
            { name: 'P3', type: 'Human', color: '#e23a2e' }
          ],
          rounds: 5,
          startingCash: 10000,
          wallType: 'off'
        });

        assert.strictEqual(turnGame.activePlayerIdx, 0);
        turnGame.roster[1].hp = 0; // P2 is dead

        turnGame.nextTurn();
        assert.strictEqual(turnGame.activePlayerIdx, 2); // should skip P2 and go to P3

        turnGame.nextTurn();
        assert.strictEqual(turnGame.activePlayerIdx, 0); // back to P1
      });

      it('Test 3.5: AI Autoshot and complete fire-to-impact cycle completely driven by stepPhysics', () => {
        const aiGame = SCORCHED.createHeadlessGame({ seed: 400 });
        aiGame.start({
          players: [
            { name: 'AI_1', type: 'Moron', color: '#ff2d9b' },
            { name: 'AI_2', type: 'Shooter', color: '#00bfff' }
          ],
          rounds: 5,
          startingCash: 10000,
          wallType: 'rubber'
        });

        assert.strictEqual(aiGame.projectile, null);
        aiGame.stepPhysics(SCORCHED.CONST.TICK);
        assert.ok(aiGame.projectile !== null, "AI Player 1 should have fired");

        let ticks = 0;
        const dt = SCORCHED.CONST.TICK;
        while (ticks < 1000) {
          aiGame.stepPhysics(dt);
          if (aiGame.activePlayerIdx === 1 && aiGame.projectile !== null) {
            break;
          }
          ticks++;
        }

        assert.strictEqual(aiGame.activePlayerIdx, 1);
        assert.ok(aiGame.projectile !== null, "AI Player 2 should have fired");
      });

    });

    describe('Impact Resolution & Falling Tests', () => {

      it('Test 4.1: Direct hit reduces target hp and heights array differs', () => {
        const impactGame = SCORCHED.createHeadlessGame({ seed: 500 });
        impactGame.start({
          players: [
            { name: 'P1', type: 'Human', color: '#ff2d9b' },
            { name: 'P2', type: 'Human', color: '#00bfff' }
          ],
          rounds: 5,
          startingCash: 10000,
          wallType: 'off'
        });

        for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
          impactGame.terrain.heights[i] = 100;
        }
        impactGame.roster[0].x = 100;
        impactGame.roster[1].x = 200;
        impactGame.snapTanksToTerrain();

        const initialTargetHp = impactGame.roster[1].hp;
        const pxY = SCORCHED.CONST.WORLD_H - 100;
        const heightsSnapshot = new Float32Array(impactGame.terrain.heights);

        impactGame.onImpact(200, pxY, 'Baby Missile', 0);

        assert.ok(impactGame.roster[1].hp < initialTargetHp);
        const heightsDiffer = Array.from(impactGame.terrain.heights).some((h, idx) => h !== heightsSnapshot[idx]);
        assert.ok(heightsDiffer);
      });

      it('Test 4.2: Tank standing over freshly carved crater falls, taking damage that scales with fall height', () => {
        const fallGame = SCORCHED.createHeadlessGame({ seed: 600 });
        fallGame.start({
          players: [
            { name: 'P1', type: 'Human', color: '#ff2d9b' },
            { name: 'P2', type: 'Human', color: '#00bfff' }
          ],
          rounds: 5,
          startingCash: 10000,
          wallType: 'off'
        });

        for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
          fallGame.terrain.heights[i] = 200;
        }
        fallGame.roster[0].x = 100;
        fallGame.roster[1].x = 200;
        fallGame.snapTanksToTerrain();

        fallGame.terrain.carve(200, fallGame.roster[1].y, 40);
        fallGame.terrain.settle();
        fallGame.reSeatTanks();

        assert.strictEqual(fallGame.roster[1].falling, true);

        let iterations = 0;
        while (fallGame.roster[1].falling && iterations < 1000) {
          fallGame.stepPhysics(SCORCHED.CONST.TICK);
          iterations++;
        }

        assert.ok(fallGame.roster[1].hp < 100);
      });

      it('Test 4.3: Parachute is consumed to take zero drop damage', () => {
        const parachuteGame = SCORCHED.createHeadlessGame({ seed: 700 });
        parachuteGame.start({
          players: [
            { name: 'P1', type: 'Human', color: '#ff2d9b' },
            { name: 'P2', type: 'Human', color: '#00bfff' }
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

        parachuteGame.roster[1].inventory['Parachute'] = 1;

        parachuteGame.terrain.carve(200, parachuteGame.roster[1].y, 40);
        parachuteGame.terrain.settle();
        parachuteGame.reSeatTanks();

        let iterations = 0;
        while (parachuteGame.roster[1].falling && iterations < 1000) {
          parachuteGame.stepPhysics(SCORCHED.CONST.TICK);
          iterations++;
        }

        assert.strictEqual(parachuteGame.roster[1].inventory['Parachute'], 0);
        assert.strictEqual(parachuteGame.roster[1].hp, 100);
      });

      it('Test 4.4: Particle pool is safe, and particles can be spawned (simulated non-headless scenario)', () => {
        const { documentMock, windowMock } = createDomMock();
        const visualCtx = evaluateScript({
          document: documentMock,
          window: windowMock
        });

        const visualGame = new visualCtx.globalThis.SCORCHED.Game({ headless: false, seed: 800 });
        visualGame.start({
          players: [
            { name: 'P1', type: 'Human', color: '#ff2d9b' },
            { name: 'P2', type: 'Human', color: '#00bfff' }
          ],
          rounds: 5,
          startingCash: 10000,
          wallType: 'off'
        });

        assert.strictEqual(visualGame.particlePool.length, 600);

        for (let i = 0; i < 700; i++) {
          visualGame.spawnParticle('spark', 100, 100, 10, 10, '#ff0000', 1.0, 2);
        }

        const activeParticlesCount = visualGame.particlePool.filter(p => p.active).length;
        assert.ok(activeParticlesCount <= 600);
      });

      it('Test 4.5: A kill during flight leaves the turn order intact, with the turn still advancing', () => {
        const killGame = SCORCHED.createHeadlessGame({ seed: 900 });
        killGame.start({
          players: [
            { name: 'P1', type: 'Human', color: '#ff2d9b' },
            { name: 'P2', type: 'Human', color: '#00bfff' },
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

        killGame.roster[1].hp = 10;
        killGame.activePlayerIdx = 0;

        killGame.onImpact(200, 600, 'Baby Missile', 0);

        assert.strictEqual(killGame.roster[1].hp, 0);
        assert.strictEqual(killGame.roster[0].kills, 1);

        killGame.nextTurn();
        assert.strictEqual(killGame.activePlayerIdx, 2); // should skip P2 because dead
      });

    });

    describe('Chunk 6: Arsenal, shields, multi-projectile', () => {

      function makeArsenalGame(seed) {
        const g = SCORCHED.createHeadlessGame({ seed });
        g.start({
          players: [
            { name: 'P1', type: 'Human', color: '#ff2d9b' },
            { name: 'P2', type: 'Human', color: '#00bfff' }
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

      it('Test 6.1: blast damage is absorbed by the shield before it reaches hp', () => {
        const shieldGame = makeArsenalGame(1000);
        shieldGame.roster[1].shield = { type: 'Shield', hp: 100 };
        shieldGame.roster[1].hp = 100;
        shieldGame.explosion(shieldGame.roster[1].x, shieldGame.roster[1].y - 3, 40, 60, 0);

        assert.strictEqual(shieldGame.roster[1].hp, 100);
        assert.ok(shieldGame.roster[1].shield.hp < 100);
      });

      it('Test 6.2: REGRESSION — napalm burn must also be absorbed by the shield', () => {
        const napalmGame = makeArsenalGame(1001);
        const napalmTarget = napalmGame.roster[1];
        napalmTarget.shield = { type: 'Heavy Shield', hp: 200 };
        napalmTarget.hp = 100;
        const shieldHpBefore = napalmTarget.shield.hp;

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

        assert.strictEqual(napalmTarget.hp, 100);
        assert.ok(napalmTarget.shield.hp < shieldHpBefore);
        assert.ok(napalmGame.roster[0].damageDealt > 0);
      });

      it('Test 6.3: with no shield, the napalm burn does reach hp', () => {
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

        assert.ok(burnTarget.hp < 100);
      });

      it('Test 6.4: Auto Defense raises a replacement when the burn collapses a shield', () => {
        const autoGame = makeArsenalGame(1003);
        const autoTarget = autoGame.roster[1];
        autoTarget.hp = 100;
        autoTarget.shield = { type: 'Shield', hp: 0.15 };
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

        assert.ok(autoTarget.shield);
        assert.strictEqual(autoTarget.shield.type, 'Heavy Shield');
        assert.strictEqual(autoTarget.inventory['Heavy Shield'], 0);
      });

      it('Test 6.5: ammo decrements on fire; Baby Missile is unlimited', () => {
        const ammoGame = makeArsenalGame(1004);
        const shooterTank = ammoGame.roster[0];
        shooterTank.angle = 45;
        shooterTank.power = 500;
        shooterTank.inventory['Missile'] = 2;
        shooterTank.selectedWeapon = 'Missile';
        ammoGame.fireActiveWeapon();

        assert.strictEqual(shooterTank.inventory['Missile'], 1);
        assert.strictEqual(ammoGame.projectiles.length, 1);

        shooterTank.inventory['Missile'] = 0;
        ammoGame.projectiles = [];
        ammoGame.fireActiveWeapon();
        assert.strictEqual(ammoGame.projectiles.length, 0);

        shooterTank.selectedWeapon = 'Baby Missile';
        const babyBefore = shooterTank.inventory['Baby Missile'];
        ammoGame.projectiles = [];
        ammoGame.fireActiveWeapon();
        assert.strictEqual(ammoGame.projectiles.length, 1);
        assert.strictEqual(shooterTank.inventory['Baby Missile'], babyBefore);
      });

      it('Test 6.6: MIRV splits into 5 sub-projectiles at apex', () => {
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
        assert.strictEqual(sawSplit, 5);
      });

      it('Test 6.7: a projectile with no weapon name must not crash the physics loop', () => {
        const oddGame = makeArsenalGame(1006);
        oddGame.projectiles = [{
          x: 300, y: oddGame.roster[1].y, vx: 0, vy: 0, shooterIdx: 0, rolling: true
        }];
        assert.doesNotThrow(() => {
          oddGame.stepPhysics(1 / 60);
        });
      });

    });

    describe('Chunk 7: Intermission Shop Economy & Payouts', () => {

      it('Test 7.1: Verify round-end payouts (damage, kills, and survival bonus)', () => {
        const payoutGame = SCORCHED.createHeadlessGame({ seed: 2000 });
        payoutGame.start({
          players: [
            { name: 'P1', type: 'Human', color: '#ff2d9b' },
            { name: 'P2', type: 'Human', color: '#00bfff' }
          ],
          rounds: 3,
          startingCash: 1000,
          wallType: 'off'
        });

        const p1 = payoutGame.roster[0];
        const p2 = payoutGame.roster[1];
        p1.damageDealt = 120.5;
        p1.kills = 1;
        p1.hp = 100;

        p2.damageDealt = 0;
        p2.kills = 0;
        p2.hp = 0;

        payoutGame.handleRoundEnd();

        const expectedP1Cash = 1000 + 120 + 500 + 100;
        assert.strictEqual(p1.cash, expectedP1Cash);
        assert.strictEqual(p2.cash, 1000);

        assert.strictEqual(p1.damageDealt, 0);
        assert.strictEqual(p1.kills, 0);
        assert.strictEqual(p1.cumulativeDamage, 120.5);
        assert.strictEqual(p1.cumulativeKills, 1);
      });

      it('Test 7.2: Verify buy(tank, id) logic', () => {
        const buyGame = SCORCHED.createHeadlessGame({ seed: 2100 });
        buyGame.start({
          players: [
            { name: 'P1', type: 'Human', color: '#ff2d9b' }
          ],
          rounds: 2,
          startingCash: 2000,
          wallType: 'off'
        });

        const shopper = buyGame.roster[0];

        const firstBuy = buyGame.buy(shopper, 'Missile');
        assert.strictEqual(firstBuy, true);
        assert.strictEqual(shopper.cash, 1500);
        assert.strictEqual(shopper.inventory['Missile'], 5);

        const secondBuy = buyGame.buy(shopper, 'Missile');
        assert.strictEqual(secondBuy, true);
        assert.strictEqual(shopper.cash, 1000);
        assert.strictEqual(shopper.inventory['Missile'], 10);

        const expensiveBuy = buyGame.buy(shopper, 'Nuke');
        assert.strictEqual(expensiveBuy, false);
        assert.strictEqual(shopper.cash, 1000);
        assert.ok(shopper.inventory['Nuke'] === undefined || shopper.inventory['Nuke'] === 0);
      });

      it('Test 7.3: Verify basic-only toggle filters non-basic weapons', () => {
        const basicGame = SCORCHED.createHeadlessGame({ seed: 2200 });
        basicGame.start({
          players: [{ name: 'P1', type: 'Human', color: '#ff2d9b' }],
          rounds: 2,
          startingCash: 2000,
          wallType: 'off',
          weaponsAvailability: 'basic'
        });

        const isBasicOnly = basicGame.config && basicGame.config.weaponsAvailability === 'basic';
        assert.strictEqual(isBasicOnly, true);

        const BASIC_WEAPONS = ['Baby Missile', 'Missile', 'Tracer'];
        const filtered = SCORCHED.WEAPONS.filter(w => {
          if (isBasicOnly) {
            return BASIC_WEAPONS.includes(w.id);
          }
          return true;
        });

        assert.strictEqual(filtered.length, 3);
        const filteredIDs = filtered.map(w => w.id);
        assert.ok(filteredIDs.includes('Baby Missile'));
        assert.ok(filteredIDs.includes('Missile'));
        assert.ok(filteredIDs.includes('Tracer'));
      });

    });

    it('Test 8: Four-Opponent Match (unattended)', () => {
      const matchGame = SCORCHED.createHeadlessGame({ seed: 123 });
      matchGame.start({
        players: [
          { name: 'AI_Moron', type: 'Moron', color: '#ff2d9b' },
          { name: 'AI_Shooter', type: 'Shooter', color: '#00bfff' },
          { name: 'AI_Poolshark', type: 'Poolshark', color: '#e23a2e' },
          { name: 'AI_Cyborg', type: 'Cyborg', color: '#8fd400' }
        ],
        rounds: 3,
        startingCash: 15000,
        wallType: 'rubber',
        weaponsAvailability: 'all'
      });

      let matchTicks = 0;
      while (!matchGame.roundOver && matchGame.currentRound <= 3 && matchTicks < 30000) {
        matchGame.stepPhysics(SCORCHED.CONST.TICK);
        matchTicks++;
      }
      assert.ok(matchTicks > 0);
    });

    it('Test 9: Cyborg Telemetry Correction', () => {
      const cyborgGame = SCORCHED.createHeadlessGame({ seed: 777 });
      cyborgGame.start({
        players: [
          { name: 'Cyborg_P1', type: 'Cyborg', color: '#ff2d9b' },
          { name: 'Dummy_P2', type: 'Human', color: '#00bfff' }
        ],
        rounds: 2,
        startingCash: 10000,
        wallType: 'off'
      });
      cyborgGame.wind = 0;

      for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
        cyborgGame.terrain.heights[i] = 100;
      }
      cyborgGame.roster[0].x = 200;
      cyborgGame.roster[1].x = 800;
      cyborgGame.snapTanksToTerrain();
      cyborgGame.roster[1].shield = null;

      let shotCount = 0;
      let firstImpactX = null;
      let secondImpactX = null;

      cyborgGame.config.onImpact = (x, y) => {
        shotCount++;
        if (shotCount === 1) firstImpactX = x;
        else if (shotCount === 2) secondImpactX = x;
      };

      cyborgGame.activePlayerIdx = 0;
      cyborgGame.stepPhysics(SCORCHED.CONST.TICK);
      let ticks = 0;
      while (cyborgGame.projectile && ticks < 1000) {
        cyborgGame.stepPhysics(SCORCHED.CONST.TICK);
        ticks++;
      }

      assert.ok(firstImpactX !== null);

      cyborgGame.activePlayerIdx = 0;
      cyborgGame.projectiles = [];
      cyborgGame.stepPhysics(SCORCHED.CONST.TICK);

      ticks = 0;
      while (cyborgGame.projectile && ticks < 1000) {
        cyborgGame.stepPhysics(SCORCHED.CONST.TICK);
        ticks++;
      }

      assert.ok(secondImpactX !== null);

      const firstError = Math.abs(firstImpactX - 800);
      const secondError = Math.abs(secondImpactX - 800);

      assert.ok(secondError < firstError, `Cyborg second shot error (${secondError}) should be less than first error (${firstError})`);
    });

    it('Test 10: Poolshark Bounce Path', () => {
      const bounceGame = SCORCHED.createHeadlessGame({ seed: 999 });
      bounceGame.start({
        players: [
          { name: 'Poolshark', type: 'Poolshark', color: '#ff2d9b' },
          { name: 'Dummy', type: 'Human', color: '#00bfff' }
        ],
        rounds: 1,
        startingCash: 10000,
        wallType: 'rubber'
      });
      bounceGame.wind = 0;

      for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
        bounceGame.terrain.heights[i] = 100;
      }
      bounceGame.roster[0].x = 200;
      bounceGame.roster[1].x = 300;
      bounceGame.snapTanksToTerrain();

      let hitBounces = 0;
      bounceGame.config.onImpact = (x, y) => {};

      bounceGame.stepPhysics(SCORCHED.CONST.TICK);
      assert.ok(bounceGame.projectile, "Poolshark should have fired");

      assert.ok(bounceGame.roster[0].angle > 90, "Poolshark should shoot leftwards to hit left wall");

      let ticks = 0;
      while (bounceGame.projectile && ticks < 1000) {
        if (bounceGame.projectile.bounces > 0) {
          hitBounces = bounceGame.projectile.bounces;
        }
        bounceGame.stepPhysics(SCORCHED.CONST.TICK);
        ticks++;
      }

      assert.ok(hitBounces > 0);
    });

    it('Test 11: Seed Reproducibility', () => {
      const runGameWithSeed = (seed) => {
        const g = SCORCHED.createHeadlessGame({ seed });
        g.start({
          players: [
            { name: 'AI_1', type: 'Moron', color: '#ff2d9b' },
            { name: 'AI_2', type: 'Shooter', color: '#00bfff' }
          ],
          rounds: 1,
          startingCash: 10000,
          wallType: 'off'
        });
        g.stepPhysics(SCORCHED.CONST.TICK);
        return { angle1: g.roster[0].angle, power1: g.roster[0].power };
      };

      const run1 = runGameWithSeed(888);
      const run2 = runGameWithSeed(888);
      const run3 = runGameWithSeed(999);

      assert.strictEqual(run1.angle1, run2.angle1);
      assert.strictEqual(run1.power1, run2.power1);

      assert.ok(run1.angle1 !== run3.angle1 || run1.power1 !== run3.power1);
    });

    it('Test 12: Shot Leaving the World', () => {
      const leaveGame = SCORCHED.createHeadlessGame({ seed: 555 });
      leaveGame.start({
        players: [
          { name: 'AI_1', type: 'Moron', color: '#ff2d9b' },
          { name: 'AI_2', type: 'Moron', color: '#00bfff' }
        ],
        rounds: 1,
        startingCash: 10000,
        wallType: 'off'
      });
      leaveGame.wind = 0;

      leaveGame.activePlayerIdx = 0;
      leaveGame.roster[0].x = 100;
      leaveGame.roster[0].angle = 150;
      leaveGame.roster[0].power = 900;
      leaveGame.fireActiveWeapon();

      assert.ok(leaveGame.projectile);

      let lTicks = 0;
      while (leaveGame.projectile && lTicks < 1000) {
        leaveGame.stepPhysics(SCORCHED.CONST.TICK);
        lTicks++;
      }

      assert.strictEqual(leaveGame.activePlayerIdx, 1);
    });

    it('Test 13: Widened Projectile Flight-Lifetime Cap', () => {
      const test13Game = SCORCHED.createHeadlessGame({ seed: 777 });
      test13Game.start({
        players: [
          { name: 'P1', type: 'Human', color: '#ff2d9b' },
          { name: 'P2', type: 'Human', color: '#00bfff' }
        ],
        rounds: 1,
        startingCash: 10000,
        wallType: 'rubber'
      });
      test13Game.wind = 0;

      // plateau heights = 690 under the tank, pit heights = 2 elsewhere
      for (let i = 0; i < SCORCHED.CONST.WORLD_W; i++) {
        if (i >= 80 && i <= 120) {
          test13Game.terrain.heights[i] = 690;
        } else {
          test13Game.terrain.heights[i] = 2;
        }
      }

      test13Game.roster[0].x = 100;
      test13Game.roster[1].x = 1100;
      test13Game.snapTanksToTerrain();

      test13Game.activePlayerIdx = 0;
      test13Game.roster[0].angle = 88;
      test13Game.roster[0].power = 1000;

      let test13ImpactX = null;
      let test13ImpactY = null;
      test13Game.config.onImpact = (x, y) => {
        test13ImpactX = x;
        test13ImpactY = y;
      };

      test13Game.fireActiveWeapon();
      assert.ok(test13Game.projectile, 'Expected projectile to be live for Test 13');

      let t13Ticks = 0;
      while (test13Game.projectile && t13Ticks < 2000) {
        test13Game.stepPhysics(SCORCHED.CONST.TICK);
        t13Ticks++;
      }

      assert.strictEqual(SCORCHED.CONST.MAX_FLIGHT_TICKS, 1800,
        `Expected CONST.MAX_FLIGHT_TICKS to be 1800, but got ${SCORCHED.CONST.MAX_FLIGHT_TICKS}`);
      assert.notStrictEqual(test13ImpactX, null,
        'Expected projectile to register onImpact, but it was silently despawned or did not land');
      assert.notStrictEqual(test13ImpactY, null,
        'Expected onImpact to report a Y coordinate');
      assert.ok(t13Ticks >= 500,
        `Expected flight ticks to be at least 500, but got ${t13Ticks}`);
      assert.ok(t13Ticks < SCORCHED.CONST.MAX_FLIGHT_TICKS,
        `Expected flight ticks (${t13Ticks}) to be strictly less than MAX_FLIGHT_TICKS (${SCORCHED.CONST.MAX_FLIGHT_TICKS})`);
    });

    it('Test 14: Projectile Flight-Lifetime timeout resolves as a real impact', () => {
      const game = SCORCHED.createHeadlessGame({ seed: 777 });
      game.start({
        players: [
          { name: 'P1', type: 'Human', color: '#ff2d9b' },
          { name: 'P2', type: 'Human', color: '#00bfff' }
        ],
        rounds: 1,
        startingCash: 10000,
        wallType: 'rubber'
      });
      game.wind = 0;

      game.roster[0].inventory['Tracer'] = 1;
      game.roster[0].selectedWeapon = 'Tracer';
      game.activePlayerIdx = 0;

      let onImpactCalled = false;
      let impactX = null;
      let impactY = null;

      game.config.onImpact = (x, y) => {
        onImpactCalled = true;
        impactX = x;
        impactY = y;
      };

      game.fireActiveWeapon();
      assert.strictEqual(game.projectiles.length, 1, 'Expected one projectile to be fired');

      const proj = game.projectiles[0];
      assert.strictEqual(proj.weapon, 'Tracer');

      // Drive projectile to the cap by setting flightTicks = CONST.MAX_FLIGHT_TICKS - 5
      proj.flightTicks = SCORCHED.CONST.MAX_FLIGHT_TICKS - 5;

      // Step physics 6 times (so it exceeds MAX_FLIGHT_TICKS)
      for (let i = 0; i < 6; i++) {
        game.stepPhysics(SCORCHED.CONST.TICK);
      }

      // Assert: onImpact fired
      assert.strictEqual(onImpactCalled, true, 'Expected onImpact to be called on flight lifetime timeout');
      assert.strictEqual(game.lastShooterIdx, 0, 'Expected shooterIdx to be 0');

      // Assert: a fired Tracer path was pushed to persistentTracers
      assert.ok(game.persistentTracers && game.persistentTracers.length > 0, 'Expected tracer path to be pushed to persistentTracers');
      const savedPath = game.persistentTracers[0];
      assert.ok(Array.isArray(savedPath) && savedPath.length > 0, 'Expected a non-empty path array');

      // Assert: the projectile list is now empty and the turn advanced to player index 1
      assert.strictEqual(game.projectiles.length, 0, 'Expected projectile to be removed from the list');
      assert.strictEqual(game.activePlayerIdx, 1, 'Expected active turn to advance to player 1');
    });

    describe('NetClient tests', () => {

      it('should instantiate NetClient and derive dynamic WebSocket URL from location.host', () => {
        let constructedUrl = '';
        const mockWS = class MockWS {
          static CONNECTING = 0;
          static OPEN = 1;
          static CLOSING = 2;
          static CLOSED = 3;
          constructor(url) {
            constructedUrl = url;
            this.readyState = 0; // CONNECTING
          }
        };

        const ctx = evaluateScript({
          location: {
            protocol: 'https:',
            host: 'custom-domain.com:443'
          },
          WebSocket: mockWS
        });

        const net = new ctx.globalThis.SCORCHED.NetClient();
        assert.strictEqual(net.state, 'lost');

        net.connect();
        assert.strictEqual(constructedUrl, 'wss://custom-domain.com:443');
        assert.strictEqual(net.state, 'connecting');

        // Test with http:
        ctx.location.protocol = 'http:';
        net.connect();
        assert.strictEqual(constructedUrl, 'ws://custom-domain.com:443');
      });

      it('should handle state transitions and callbacks', () => {
        let latestWS = null;
        const mockWS = class MockWS {
          static CONNECTING = 0;
          static OPEN = 1;
          static CLOSING = 2;
          static CLOSED = 3;
          constructor(url) {
            this.readyState = 0;
            latestWS = this;
          }
          close() {
            this.readyState = 3;
            if (this.onclose) this.onclose();
          }
        };

        const ctx = evaluateScript({
          location: { protocol: 'http:', host: 'localhost' },
          WebSocket: mockWS
        });

        const net = new ctx.globalThis.SCORCHED.NetClient();
        const states = [];
        net.onStateChange((s) => {
          states.push(s);
        });

        net.connect();
        assert.strictEqual(net.state, 'connecting');
        assert.deepStrictEqual(states, ['connecting']);

        // simulate successful open
        latestWS.readyState = 1; // OPEN
        if (latestWS.onopen) latestWS.onopen();
        assert.strictEqual(net.state, 'live');
        assert.deepStrictEqual(states, ['connecting', 'live']);

        // simulate close/reconnect
        latestWS.close();
        assert.strictEqual(net.state, 'reconnecting');
        assert.deepStrictEqual(states, ['connecting', 'live', 'reconnecting']);

        net.disconnect();
      });

      it('should silently no-op when send is called on a non-open socket', () => {
        const ctx = evaluateScript();
        const net = new ctx.globalThis.SCORCHED.NetClient();
        assert.doesNotThrow(() => {
          net.send('MY_MESSAGE', { foo: 'bar' });
        });
      });

      it('should handle parse errors and surface them through onError callback', () => {
        let latestWS = null;
        const mockWS = class MockWS {
          static CONNECTING = 0;
          static OPEN = 1;
          static CLOSING = 2;
          static CLOSED = 3;
          constructor(url) {
            this.readyState = 0;
            latestWS = this;
          }
        };

        const ctx = evaluateScript({
          location: { protocol: 'http:', host: 'localhost' },
          WebSocket: mockWS
        });

        const net = new ctx.globalThis.SCORCHED.NetClient();
        let surfacedError = null;
        net.onError((err) => {
          surfacedError = err;
        });

        net.connect();
        latestWS.readyState = 1;
        if (latestWS.onopen) latestWS.onopen();

        // Send corrupt message
        latestWS.onmessage({ data: 'invalid-json{' });
        assert.ok(surfacedError);
        assert.strictEqual(surfacedError.type, 'PARSE_ERROR');

        // Send S2C ERROR frame (flat shape, schema fields at top level)
        latestWS.onmessage({ data: JSON.stringify({ type: 'ERROR', code: 'ROOM_FULL', message: 'server full' }) });
        assert.strictEqual(surfacedError.type, 'ERROR');
        assert.strictEqual(surfacedError.message, 'server full');

        net.disconnect();
      });

      // The test above proves NetClient offers an onError hook. These two prove
      // the app actually wires it up — without them an ERROR frame can reach
      // handleError() and die in console.error with the player none the wiser.
      function onlineGameCtx() {
        let latestWS = null;
        const mockWS = class MockWS {
          static CONNECTING = 0;
          static OPEN = 1;
          static CLOSING = 2;
          static CLOSED = 3;
          constructor(url) {
            this.readyState = 0;
            latestWS = this;
          }
          send(data) {}
          close() {
            this.readyState = 3;
          }
        };

        const { documentMock, windowMock, elements } = createDomMock();
        const ctx = evaluateScript({
          document: documentMock,
          window: windowMock,
          location: { protocol: 'http:', host: 'localhost' },
          WebSocket: mockWS
        });

        const game = new ctx.globalThis.SCORCHED.Game({ headless: false, seed: 100, mode: 'online' });
        latestWS.readyState = 1;
        if (latestWS.onopen) latestWS.onopen();

        return { game, elements, ws: () => latestWS };
      }

      it('should render a server ERROR frame into the player-visible #error-msg', () => {
        const { game, elements, ws } = onlineGameCtx();

        // A join is rejected before start() runs, so the setup modal holding
        // #error-msg is still on screen.
        assert.strictEqual(elements['setup'].hidden, false, "Setup modal should still be open during join");
        assert.strictEqual(elements['error-msg'].textContent, '');

        ws().onmessage({ data: JSON.stringify({ type: 'ERROR', code: 'ROOM_FULL', message: 'ROOM_FULL' }) });

        assert.strictEqual(
          elements['error-msg'].textContent,
          'That room is already full.',
          "A rejected join must show readable text, not the raw protocol code"
        );

        game.net.disconnect();
      });

      it('should render a transport error without leaking the wrong object shape', () => {
        const { game, elements, ws } = onlineGameCtx();

        // Local failures are { type, error }, not { code, message } — reading
        // .message off one of these would put "undefined" in front of the player.
        ws().onerror(new Error('socket blew up'));

        assert.strictEqual(
          elements['error-msg'].textContent,
          'Connection error — retrying...',
          "Transport failures should still be reported to the player"
        );

        game.net.disconnect();
      });

      it('should send REJOIN message on reconnect if sessionStorage contains token', () => {
        const mockStore = {};
        const mockSessionStorage = {
          setItem(key, value) {
            mockStore[key] = String(value);
          },
          getItem(key) {
            return mockStore[key] || null;
          },
          removeItem(key) {
            delete mockStore[key];
          }
        };

        let latestWS = null;
        const mockWS = class MockWS {
          static CONNECTING = 0;
          static OPEN = 1;
          static CLOSING = 2;
          static CLOSED = 3;
          constructor(url) {
            this.readyState = 0;
            latestWS = this;
            this.sentMessages = [];
          }
          send(data) {
            this.sentMessages.push(JSON.parse(data));
          }
        };

        const ctx = evaluateScript({
          location: { protocol: 'http:', host: 'localhost' },
          WebSocket: mockWS,
          sessionStorage: mockSessionStorage
        });

        const net = new ctx.globalThis.SCORCHED.NetClient();
        net.setSessionToken('abc-code', 'xyz-player-token', 2);

        net.connect();
        latestWS.readyState = 1; // OPEN
        if (latestWS.onopen) latestWS.onopen();

        assert.strictEqual(latestWS.sentMessages.length, 1);
        assert.strictEqual(latestWS.sentMessages[0].type, 'REJOIN');
        assert.deepStrictEqual(latestWS.sentMessages[0], {
          type: 'REJOIN',
          code: 'abc-code',
          playerToken: 'xyz-player-token'
        });

        net.disconnect();
      });

    describe('Online Mode handleRoundEnd tests', () => {

      it('Test online mode handleRoundEnd does not call showMatchSummary, startShopIntermission, or startNextRound', () => {
        const game = SCORCHED.createHeadlessGame({ seed: 5000 });
        // isMultiplayer in the CONFIG is how the real client starts an online
        // match. Setting game.mode by hand before start() no longer survives:
        // start() now derives mode from the config it was handed, so a solo
        // match started on a page that had just finished an online one cannot
        // inherit 'online' and keep firing at a server that has no such room.
        game.start({
          players: [
            { name: 'P1', type: 'Human', color: '#ff2d9b' },
            { name: 'P2', type: 'Human', color: '#00bfff' }
          ],
          rounds: 1,
          startingCash: 1000,
          isMultiplayer: true
        });
        assert.strictEqual(game.mode, 'online', 'config must be what puts the match online');

        let calledSummary = false;
        let calledIntermission = false;
        let calledNextRound = false;

        game.showMatchSummary = () => { calledSummary = true; };
        game.startShopIntermission = () => { calledIntermission = true; };
        game.startNextRound = () => { calledNextRound = true; };

        game.roster[0].damageDealt = 100;
        game.roster[0].kills = 1;
        game.roster[0].hp = 100;
        game.roster[1].hp = 0;

        game.currentRound = 1;
        game.rounds = 1;

        game.handleRoundEnd();

        assert.strictEqual(game.roundOver, true, 'Match should be left in a terminal state (roundOver = true)');
        assert.strictEqual(calledSummary, false, 'showMatchSummary should not be called');
        assert.strictEqual(calledIntermission, false, 'startShopIntermission should not be called');
        assert.strictEqual(calledNextRound, false, 'startNextRound should not be called');

        // Verify local payouts still ran
        assert.strictEqual(game.roster[0].cash, 1000 + 100 + 500 + 100);
      });

      it('Test online mode handleRoundEnd when currentRound < rounds', () => {
        const game = SCORCHED.createHeadlessGame({ seed: 5001 });
        game.start({
          players: [
            { name: 'P1', type: 'Human', color: '#ff2d9b' },
            { name: 'P2', type: 'Human', color: '#00bfff' }
          ],
          rounds: 5,
          startingCash: 1000,
          isMultiplayer: true
        });
        assert.strictEqual(game.mode, 'online', 'config must be what puts the match online');

        let calledSummary = false;
        let calledIntermission = false;
        let calledNextRound = false;

        game.showMatchSummary = () => { calledSummary = true; };
        game.startShopIntermission = () => { calledIntermission = true; };
        game.startNextRound = () => { calledNextRound = true; };

        game.currentRound = 1;
        game.rounds = 5;

        game.handleRoundEnd();

        assert.strictEqual(game.roundOver, true);
        assert.strictEqual(calledSummary, false);
        assert.strictEqual(calledIntermission, false);
        assert.strictEqual(calledNextRound, false);
      });

      it('Test local mode handleRoundEnd continues to function as before', () => {
        const game = SCORCHED.createHeadlessGame({ seed: 5002 });
        game.mode = 'local';
        game.start({
          players: [
            { name: 'P1', type: 'Human', color: '#ff2d9b' },
            { name: 'P2', type: 'Human', color: '#00bfff' }
          ],
          rounds: 2,
          startingCash: 1000
        });

        let calledNextRound = false;
        game.startNextRound = () => { calledNextRound = true; };

        game.currentRound = 1;
        game.rounds = 2;

        game.handleRoundEnd();

        assert.strictEqual(calledNextRound, true, 'Local headless mode should call startNextRound when currentRound < rounds');
      });

    });

      it('should reconnect with exponential backoff', (t, done) => {
        let wsInstanceCount = 0;
        const mockWS = class MockWS {
          static CONNECTING = 0;
          static OPEN = 1;
          static CLOSING = 2;
          static CLOSED = 3;
          constructor(url) {
            wsInstanceCount++;
            this.readyState = 0;
          }
        };

        const ctx = evaluateScript({
          location: { protocol: 'http:', host: 'localhost' },
          WebSocket: mockWS
        });

        const net = new ctx.globalThis.SCORCHED.NetClient();
        net.backoffDelay = 10;
        net.maxBackoffDelay = 100;

        net.connect();
        assert.strictEqual(wsInstanceCount, 1);

        // Simulate close event
        net.socket.onclose();

        setTimeout(() => {
          // Should have reconnected
          assert.strictEqual(wsInstanceCount, 2);
          assert.strictEqual(net.backoffDelay, 20); // Doubled backoff delay

          // Simulate close event again
          net.socket.onclose();

          setTimeout(() => {
            assert.strictEqual(wsInstanceCount, 3);
            assert.strictEqual(net.backoffDelay, 40); // Doubled backoff delay again

            net.disconnect();
            done();
          }, 30);
        }, 20);
      });

    });

  });

});
