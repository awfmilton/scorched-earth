const test = require('node:test');
const assert = require('node:assert');
const roomCode = require('../lib/room-code');

test('roomCode.normalize() trims, strips internal whitespace, dashes and upper-cases', () => {
  assert.strictEqual(roomCode.normalize(' kx7q '), 'KX7Q');
  assert.strictEqual(roomCode.normalize('k-x-7-q'), 'KX7Q');
  assert.strictEqual(roomCode.normalize(' k  x-7 q '), 'KX7Q');
  assert.strictEqual(roomCode.normalize(''), '');
  assert.strictEqual(roomCode.normalize(null), '');
});

test('roomCode.isValid() checks constraints correctly', () => {
  // Valid codes
  assert.strictEqual(roomCode.isValid('KX7Q'), true);
  assert.strictEqual(roomCode.isValid('ABCD'), true);

  // Ambiguous characters: 0, O, 1, I, L
  assert.strictEqual(roomCode.isValid('K07Q'), false);
  assert.strictEqual(roomCode.isValid('KO7Q'), false);
  assert.strictEqual(roomCode.isValid('K17Q'), false);
  assert.strictEqual(roomCode.isValid('KI7Q'), false);
  assert.strictEqual(roomCode.isValid('KL7Q'), false);

  // Lowercase code is invalid until normalized
  assert.strictEqual(roomCode.isValid('kx7q'), false);

  // Length constraint (must be 4)
  assert.strictEqual(roomCode.isValid('KX7'), false);
  assert.strictEqual(roomCode.isValid('KX7QA'), false);
  assert.strictEqual(roomCode.isValid(''), false);
  assert.strictEqual(roomCode.isValid(null), false);
});

test('roomCode.generate() works with and without injected rng', () => {
  const code1 = roomCode.generate();
  assert.strictEqual(roomCode.isValid(code1), true);

  // Injected deterministic mock rng that yields indexes of 'AAAA'
  const mockRng = (min, max) => 8; // 'A' is at index 8 in ALPHABET: '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
  const code2 = roomCode.generate(mockRng);
  assert.strictEqual(code2, 'AAAA');
});

test('roomCode.generateUnique() retries on collision and returns non-duplicate', () => {
  // A generator that returns 'AAAA', then 'BBBB'
  let callCount = 0;
  const mockRng = () => {
    // 'A' is index 8, 'B' is index 9
    const val = callCount < 4 ? 8 : 9;
    callCount++;
    return val;
  };

  const isTaken = (code) => code === 'AAAA';
  const uniqueCode = roomCode.generateUnique(isTaken, 10, mockRng);
  assert.strictEqual(uniqueCode, 'BBBB');
});

test('roomCode.generateUnique() throws when every attempt collides', () => {
  const mockRng = () => 8; // returns index for 'A'
  const isTaken = (code) => code === 'AAAA';

  assert.throws(() => {
    roomCode.generateUnique(isTaken, 5, mockRng);
  }, /Failed to generate a unique room code after 5 attempts/);
});
