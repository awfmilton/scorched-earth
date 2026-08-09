const { randomInt } = require('node:crypto');

/**
 * Generates a unique 4-character uppercase room code.
 * @param {Set<string>|Array<string>} existingCodes
 * @returns {string} Unique room code
 */
function generateUnique(existingCodes = new Set()) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code;
  const hasFn = (typeof existingCodes.has === 'function')
    ? (c) => existingCodes.has(c)
    : (c) => existingCodes.includes(c);

  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[randomInt(chars.length)];
    }
  } while (hasFn(code));

  return code;
}

module.exports = {
  generateUnique
};
