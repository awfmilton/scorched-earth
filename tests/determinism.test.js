const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
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
});
