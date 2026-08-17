const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRng, generateTerrain } = require('../lib/terrain.js');

describe('Terrain Generation Determinism Tests', () => {
  const w = 1200;
  const h = 700;

  it('generateTerrain(12345, w, h) twice produces deep-equal heightmaps', () => {
    const h1 = generateTerrain(12345, w, h);
    const h2 = generateTerrain(12345, w, h);
    assert.deepStrictEqual(h1, h2, "Heightmaps from the same seed must be deep-equal");
  });

  it('Two different seeds produce different heightmaps', () => {
    const h1 = generateTerrain(12345, w, h);
    const h2 = generateTerrain(54321, w, h);
    assert.notDeepStrictEqual(h1, h2, "Heightmaps from different seeds must not be equal");
  });

  it('The generator is pure (interleaved calls do not perturb repeats)', () => {
    const run1 = generateTerrain(12345, w, h);
    // Interleaved call with another seed
    generateTerrain(99999, w, h);
    const run2 = generateTerrain(12345, w, h);
    assert.deepStrictEqual(run1, run2, "An interleaved call must not affect subsequent generations of the same seed");
  });

  it('The module source contains no Math.random', () => {
    const sourceCode = fs.readFileSync(path.join(__dirname, '..', 'lib', 'terrain.js'), 'utf8');
    assert.strictEqual(sourceCode.includes('Math.random'), false, "Source file must not contain 'Math.random'");
  });

  it('Terrain generated for a fixed seed is byte-identical no matter how many gameplay draws precede it', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

    function evaluateIndexHtml() {
      const context = {
        globalThis: {},
        Math,
        Float32Array,
        console,
        setTimeout,
        clearTimeout,
        Terrain: require('../lib/terrain.js')
      };
      context.globalThis = context;
      vm.createContext(context);
      vm.runInContext(code, context);
      return context.globalThis.SCORCHED;
    }

    const SCORCHED1 = evaluateIndexHtml();
    const terrainObj1 = new SCORCHED1.Terrain();
    terrainObj1.generate(12345);
    const heights1 = new Float32Array(terrainObj1.heights);

    const SCORCHED2 = evaluateIndexHtml();
    // Simulate many gameplay draws
    for (let i = 0; i < 1000; i++) {
      SCORCHED2.rng.next();
    }
    const terrainObj2 = new SCORCHED2.Terrain();
    terrainObj2.generate(12345);
    const heights2 = new Float32Array(terrainObj2.heights);

    assert.deepStrictEqual(heights1, heights2, "Terrain generated for a fixed seed must be deep-equal regardless of gameplay RNG draws");
    assert.ok(
      Buffer.from(heights1.buffer).equals(Buffer.from(heights2.buffer)),
      "Terrain buffer generated for a fixed seed must be byte-identical"
    );
  });
});

describe('Deterministic Trig Helpers & Source Guard Tests', () => {
  function evaluateIndexHtml() {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const context = {
      globalThis: {},
      Math,
      Float32Array,
      console,
      setTimeout,
      clearTimeout,
      Terrain: require('../lib/terrain.js')
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(code, context);
    return context.globalThis.SCORCHED;
  }

  it('detSin, detCos, and detTan track Math counterparts within stated tolerance across swept range', () => {
    const SCORCHED = evaluateIndexHtml();
    const { detSin, detCos, detTan } = SCORCHED;

    assert.strictEqual(typeof detSin, 'function', 'detSin must be exported on SCORCHED');
    assert.strictEqual(typeof detCos, 'function', 'detCos must be exported on SCORCHED');
    assert.strictEqual(typeof detTan, 'function', 'detTan must be exported on SCORCHED');

    const TOLERANCE = 1e-6;

    // Test specific key angles: negatives, zero, multiples of pi/2, pi, etc.
    const keyAngles = [
      0,
      Math.PI / 6,
      Math.PI / 4,
      Math.PI / 3,
      Math.PI / 2,
      Math.PI,
      (3 * Math.PI) / 2,
      2 * Math.PI,
      -Math.PI / 6,
      -Math.PI / 4,
      -Math.PI / 3,
      -Math.PI / 2,
      -Math.PI,
      -(3 * Math.PI) / 2,
      -2 * Math.PI,
      10 * Math.PI,
      -10 * Math.PI
    ];

    for (const x of keyAngles) {
      const sDiff = Math.abs(detSin(x) - Math.sin(x));
      assert.ok(
        sDiff < TOLERANCE,
        `detSin(${x}) = ${detSin(x)} differs from Math.sin(${x}) = ${Math.sin(x)} by ${sDiff} (tolerance ${TOLERANCE})`
      );

      const cDiff = Math.abs(detCos(x) - Math.cos(x));
      assert.ok(
        cDiff < TOLERANCE,
        `detCos(${x}) = ${detCos(x)} differs from Math.cos(${x}) = ${Math.cos(x)} by ${cDiff} (tolerance ${TOLERANCE})`
      );

      // Check tangent away from odd multiples of pi/2 where cosine is 0
      if (Math.abs(Math.cos(x)) > 1e-3) {
        const tDiff = Math.abs(detTan(x) - Math.tan(x));
        assert.ok(
          tDiff < TOLERANCE,
          `detTan(${x}) = ${detTan(x)} differs from Math.tan(${x}) = ${Math.tan(x)} by ${tDiff} (tolerance ${TOLERANCE})`
        );
      }
    }

    // Swept range from -720 deg to 720 deg in 0.5 deg increments
    for (let deg = -720; deg <= 720; deg += 0.5) {
      const rad = (deg * Math.PI) / 180;

      const sDiff = Math.abs(detSin(rad) - Math.sin(rad));
      assert.ok(
        sDiff < TOLERANCE,
        `detSin(${rad}) = ${detSin(rad)} differs from Math.sin(${rad}) by ${sDiff}`
      );

      const cDiff = Math.abs(detCos(rad) - Math.cos(rad));
      assert.ok(
        cDiff < TOLERANCE,
        `detCos(${rad}) = ${detCos(rad)} differs from Math.cos(${rad}) by ${cDiff}`
      );

      if (Math.abs(Math.cos(rad)) > 1e-2) {
        const tDiff = Math.abs(detTan(rad) - Math.tan(rad));
        assert.ok(
          tDiff < TOLERANCE,
          `detTan(${rad}) = ${detTan(rad)} differs from Math.tan(${rad}) by ${tDiff}`
        );
      }
    }
  });

  it('Source guard: Simulation path contains no bare Math.sin, Math.cos, Math.tan, Math.hypot, Math.atan2, Math.pow, or Math.random', () => {
    /*
     * Boundary Convention Comment:
     * The simulation path is defined as the code between the explicit marker comments:
     * "// === BEGIN SIMULATION PATH ===" and "// === END SIMULATION PATH ===" in index.html.
     * Presentational code outside this block (such as particle effects in spawnCraterEffects drawing from visualRNG)
     * is permitted to use Math.* transcendentals.
     * Math.sqrt is deliberately exempt everywhere because IEEE-754 requires correct rounding for sqrt.
     */
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

    assert.ok(html.includes('// === BEGIN SIMULATION PATH ==='), "Simulation path start marker '// === BEGIN SIMULATION PATH ===' must exist in index.html");
    assert.ok(html.includes('// === END SIMULATION PATH ==='), "Simulation path end marker '// === END SIMULATION PATH ===' must exist in index.html");

    // Extract simulation path block
    const parts = html.split('// === BEGIN SIMULATION PATH ===');
    const simBlockWithSuffix = parts[1];
    const simBlock = simBlockWithSuffix.split('// === END SIMULATION PATH ===')[0];

    // Compute line offset for reporting accurate line numbers in index.html
    const lineOffset = parts[0].split('\n').length;

    // Strip block comments /* ... */ preserving line breaks
    const simBlockNoBlockComments = simBlock.replace(/\/\*[\s\S]*?\*\//g, (match) => {
      const newlines = match.match(/\n/g);
      return newlines ? newlines.join('') : '';
    });

    const lines = simBlockNoBlockComments.split('\n');
    const bannedPattern = /\bMath\.(sin|cos|tan|hypot|atan2|pow|random)\b/;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = lineOffset + i;
      const line = lines[i];

      // Strip single line comments // ...
      const codeOnly = line.replace(/\/\/.*/, '');
      const match = codeOnly.match(bannedPattern);
      if (match) {
        assert.fail(`Forbidden ${match[0]} re-introduced on line ${lineNum}: "${line.trim()}"`);
      }
    }
  });
});
