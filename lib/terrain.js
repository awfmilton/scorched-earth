/**
 * Deterministic PRNG and Terrain Generator for Scorched Earth
 */

function createRng(seed) {
  let state = seed >>> 0;
  return {
    next() {
      let t = (state += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(a, b) {
      return a + (b - a) * this.next();
    },
    int(a, b) {
      return Math.floor(this.range(a, b));
    }
  };
}

function generateTerrain(seed, width, height) {
  const rngInstance = (typeof seed === 'object' && seed !== null && typeof seed.next === 'function') ? seed : createRng(seed);
  const minH = height * 0.15;
  const maxH = height * 0.80;

  const heights = new Float32Array(width);
  const N = heights.length;

  heights[0] = rngInstance.range(minH + (maxH - minH) * 0.2, maxH - (maxH - minH) * 0.2);
  heights[N - 1] = rngInstance.range(minH + (maxH - minH) * 0.2, maxH - (maxH - minH) * 0.2);

  // Roughness controls the initial displacement size
  let roughness = 0.35;

  function displace(left, right, r) {
    if (right - left <= 1) return;
    const mid = Math.floor((left + right) / 2);
    // Height is the average of endpoints + random offset proportional to interval length
    const avg = (heights[left] + heights[right]) / 2;
    const rangeVal = (right - left) * r;
    const offset = rngInstance.range(-rangeVal, rangeVal);
    heights[mid] = avg + offset;

    displace(left, mid, r * 0.55);
    displace(mid, right, r * 0.55);
  }

  displace(0, N - 1, roughness);

  // Smoothing pass: 5-point moving average, run 4 times
  const temp = new Float32Array(N);
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < N; i++) {
      let sum = 0;
      let count = 0;
      for (let di = -2; di <= 2; di++) {
        const idx = i + di;
        if (idx >= 0 && idx < N) {
          sum += heights[idx];
          count++;
        }
      }
      temp[i] = sum / count;
    }
    heights.set(temp);
  }

  // Clamp to safety range
  for (let i = 0; i < N; i++) {
    if (heights[i] < minH) heights[i] = minH;
    if (heights[i] > maxH) heights[i] = maxH;
  }

  return heights;
}

// Dual-load footer
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createRng, generateTerrain };
} else {
  window.Terrain = { createRng, generateTerrain };
}
