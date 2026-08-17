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
