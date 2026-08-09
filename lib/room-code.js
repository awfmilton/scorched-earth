const crypto = require('node:crypto');

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function getRandomIndex(rng, limit) {
  if (rng) {
    const val = rng(0, limit);
    if (typeof val === 'number') {
      if (Number.isInteger(val)) {
        return ((val % limit) + limit) % limit;
      }
      return Math.floor(val * limit);
    }
    const val2 = rng(limit);
    if (typeof val2 === 'number') {
      if (Number.isInteger(val2)) {
        return ((val2 % limit) + limit) % limit;
      }
      return Math.floor(val2 * limit);
    }
    const val3 = rng();
    if (typeof val3 === 'number') {
      return Math.floor(val3 * limit);
    }
    throw new Error('Injected RNG must return a number');
  }
  return crypto.randomInt(0, limit);
}

function generate(rng) {
  let code = '';
  for (let i = 0; i < 4; i++) {
    const idx = getRandomIndex(rng, ALPHABET.length);
    code += ALPHABET[idx];
  }
  return code;
}

function generateUnique(isTaken, maxAttempts = 100, rng) {
  if (typeof maxAttempts === 'function') {
    rng = maxAttempts;
    maxAttempts = 100;
  }
  const takenCheck = typeof isTaken === 'function'
    ? isTaken
    : (code) => {
        if (isTaken instanceof Set) return isTaken.has(code);
        if (isTaken && typeof isTaken.includes === 'function') return isTaken.includes(code);
        if (isTaken && typeof isTaken.has === 'function') return isTaken.has(code);
        return !!isTaken[code];
      };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generate(rng);
    if (!takenCheck(code)) {
      return code;
    }
  }
  throw new Error(`Failed to generate a unique room code after ${maxAttempts} attempts.`);
}

function normalize(input) {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/[\s-]/g, '').toUpperCase();
}

function isValid(code) {
  if (typeof code !== 'string') return false;
  if (code.length !== 4) return false;
  for (let i = 0; i < code.length; i++) {
    if (!ALPHABET.includes(code[i])) {
      return false;
    }
  }
  return true;
}

module.exports = {
  ALPHABET,
  generate,
  generateUnique,
  normalize,
  isValid
};
