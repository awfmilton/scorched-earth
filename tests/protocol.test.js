const test = require('node:test');
const assert = require('node:assert');
const { C2S, S2C, ERRORS, validate } = require('../lib/protocol.js');

test('protocol map structures are frozen', () => {
  assert.ok(Object.isFrozen(C2S), 'C2S should be frozen');
  assert.ok(Object.isFrozen(S2C), 'S2C should be frozen');
  assert.ok(Object.isFrozen(ERRORS), 'ERRORS should be frozen');
});

test('validate rejects non-objects, null, and arrays', () => {
  assert.deepStrictEqual(validate(null), { ok: false, error: 'Message must be an object' });
  assert.deepStrictEqual(validate([]), { ok: false, error: 'Message must be an object' });
  assert.deepStrictEqual(validate('hello'), { ok: false, error: 'Message must be an object' });
  assert.deepStrictEqual(validate(123), { ok: false, error: 'Message must be an object' });
  assert.deepStrictEqual(validate(undefined), { ok: false, error: 'Message must be an object' });
});

test('validate rejects unknown or missing type', () => {
  assert.deepStrictEqual(validate({}), { ok: false, error: 'Message type must be a string' });
  assert.deepStrictEqual(validate({ type: 123 }), { ok: false, error: 'Message type must be a string' });
  assert.deepStrictEqual(validate({ type: 'UNKNOWN_MSG' }), { ok: false, error: 'Unknown message type: UNKNOWN_MSG' });
});

test('C2S happy path validation', () => {
  // CREATE_ROOM
  const createRoomMsg = { type: C2S.CREATE_ROOM };
  assert.deepStrictEqual(validate(createRoomMsg), { ok: true, msg: createRoomMsg });

  // JOIN_ROOM
  const joinRoomMsg = { type: C2S.JOIN_ROOM, code: 'ABCD' };
  assert.deepStrictEqual(validate(joinRoomMsg), { ok: true, msg: joinRoomMsg });

  // SET_PROFILE
  const setProfileMsg = { type: C2S.SET_PROFILE, name: 'TankMaster', colour: '#ff0000' };
  assert.deepStrictEqual(validate(setProfileMsg), { ok: true, msg: setProfileMsg });

  // START_GAME
  const startGameMsg = { type: C2S.START_GAME };
  assert.deepStrictEqual(validate(startGameMsg), { ok: true, msg: startGameMsg });

  // FIRE
  const fireMsg = { type: C2S.FIRE, angle: 45, power: 500, weapon: 'Missile' };
  assert.deepStrictEqual(validate(fireMsg), { ok: true, msg: fireMsg });

  // RESOLVE_SHOT
  const resolveShotMsg1 = { type: C2S.RESOLVE_SHOT, shotId: 'shot-123' };
  assert.deepStrictEqual(validate(resolveShotMsg1), { ok: true, msg: resolveShotMsg1 });
  const resolveShotMsg2 = { type: C2S.RESOLVE_SHOT, shotId: 12345 };
  assert.deepStrictEqual(validate(resolveShotMsg2), { ok: true, msg: resolveShotMsg2 });

  // REJOIN
  const rejoinMsg = { type: C2S.REJOIN, code: 'WXYZ', playerToken: 'token-abc' };
  assert.deepStrictEqual(validate(rejoinMsg), { ok: true, msg: rejoinMsg });
});

test('S2C happy path validation', () => {
  // ROOM_STATE
  const roomStateMsg = {
    type: S2C.ROOM_STATE,
    code: 'ROOM',
    phase: 'LOBBY',
    hostSlot: 0,
    players: [
      { slot: 0, name: 'Player1', colour: '#00ff00', connected: true, alive: true }
    ]
  };
  assert.deepStrictEqual(validate(roomStateMsg), { ok: true, msg: roomStateMsg });

  // ROUND_START
  const roundStartMsg = {
    type: S2C.ROUND_START,
    seed: 123456,
    wind: -5,
    turnOrder: [0, 1],
    tanks: [{ slot: 0, hp: 100 }],
    yourSlot: 1
  };
  assert.deepStrictEqual(validate(roundStartMsg), { ok: true, msg: roundStartMsg });

  // FIRE_SYNC
  const fireSyncMsg = {
    type: S2C.FIRE_SYNC,
    shotId: 'shot-123',
    shooterSlot: 0,
    vx: 10,
    vy: -15,
    wind: 2,
    weapon: 'Baby Missile'
  };
  assert.deepStrictEqual(validate(fireSyncMsg), { ok: true, msg: fireSyncMsg });

  // TURN_SYNC
  const turnSyncMsg = {
    type: S2C.TURN_SYNC,
    activeSlot: 1,
    turnNumber: 5
  };
  assert.deepStrictEqual(validate(turnSyncMsg), { ok: true, msg: turnSyncMsg });

  // PLAYER_LEFT
  const playerLeftMsg = {
    type: S2C.PLAYER_LEFT,
    slot: 2
  };
  assert.deepStrictEqual(validate(playerLeftMsg), { ok: true, msg: playerLeftMsg });

  // ROUND_END
  const roundEndMsg = {
    type: S2C.ROUND_END,
    winnerSlot: 0,
    scores: [100, 50]
  };
  assert.deepStrictEqual(validate(roundEndMsg), { ok: true, msg: roundEndMsg });

  const roundEndNoWinnerMsg = {
    type: S2C.ROUND_END,
    winnerSlot: null,
    scores: [100, 50]
  };
  assert.deepStrictEqual(validate(roundEndNoWinnerMsg), { ok: true, msg: roundEndNoWinnerMsg });

  // ERROR
  const errorMsg = {
    type: S2C.ERROR,
    code: ERRORS.BAD_MESSAGE,
    message: 'Something went wrong'
  };
  assert.deepStrictEqual(validate(errorMsg), { ok: true, msg: errorMsg });
});

test('validate rejects missing required fields', () => {
  // JOIN_ROOM missing code
  assert.deepStrictEqual(validate({ type: C2S.JOIN_ROOM }), { ok: false, error: 'Missing required field: code' });

  // SET_PROFILE missing name
  assert.deepStrictEqual(validate({ type: C2S.SET_PROFILE, colour: '#fff' }), { ok: false, error: 'Missing required field: name' });

  // SET_PROFILE missing colour
  assert.deepStrictEqual(validate({ type: C2S.SET_PROFILE, name: 'Alice' }), { ok: false, error: 'Missing required field: colour' });

  // FIRE missing angle
  assert.deepStrictEqual(validate({ type: C2S.FIRE, power: 10, weapon: 'Missile' }), { ok: false, error: 'Missing required field: angle' });

  // RESOLVE_SHOT missing shotId
  assert.deepStrictEqual(validate({ type: C2S.RESOLVE_SHOT }), { ok: false, error: 'Missing required field: shotId' });

  // REJOIN missing code or playerToken
  assert.deepStrictEqual(validate({ type: C2S.REJOIN, code: 'ABCD' }), { ok: false, error: 'Missing required field: playerToken' });
  assert.deepStrictEqual(validate({ type: C2S.REJOIN, playerToken: 'abc' }), { ok: false, error: 'Missing required field: code' });
});

test('validate rejects wrong primitive types', () => {
  // JOIN_ROOM code is not string
  assert.deepStrictEqual(validate({ type: C2S.JOIN_ROOM, code: 1234 }), { ok: false, error: 'Invalid value or type for field: code' });

  // SET_PROFILE name is not string
  assert.deepStrictEqual(validate({ type: C2S.SET_PROFILE, name: true, colour: '#f00' }), { ok: false, error: 'Invalid value or type for field: name' });

  // FIRE angle is not number
  assert.deepStrictEqual(validate({ type: C2S.FIRE, angle: '45', power: 10, weapon: 'Missile' }), { ok: false, error: 'Invalid value or type for field: angle' });

  // FIRE weapon is not string
  assert.deepStrictEqual(validate({ type: C2S.FIRE, angle: 45, power: 10, weapon: 123 }), { ok: false, error: 'Invalid value or type for field: weapon' });
});

test('validate rejects over-long name in SET_PROFILE', () => {
  const overLongName = 'A'.repeat(17);
  assert.deepStrictEqual(validate({ type: C2S.SET_PROFILE, name: overLongName, colour: '#f00' }), { ok: false, error: 'Invalid value or type for field: name' });
});

test('validate rejects non-4 character code in JOIN_ROOM and REJOIN', () => {
  assert.deepStrictEqual(validate({ type: C2S.JOIN_ROOM, code: 'ABC' }), { ok: false, error: 'Invalid value or type for field: code' });
  assert.deepStrictEqual(validate({ type: C2S.JOIN_ROOM, code: 'ABCDE' }), { ok: false, error: 'Invalid value or type for field: code' });
  assert.deepStrictEqual(validate({ type: C2S.REJOIN, code: 'ABC', playerToken: 'tok' }), { ok: false, error: 'Invalid value or type for field: code' });
});

test('validate rejects non-finite numbers in FIRE', () => {
  assert.deepStrictEqual(validate({ type: C2S.FIRE, angle: NaN, power: 10, weapon: 'Missile' }), { ok: false, error: 'Invalid value or type for field: angle' });
  assert.deepStrictEqual(validate({ type: C2S.FIRE, angle: Infinity, power: 10, weapon: 'Missile' }), { ok: false, error: 'Invalid value or type for field: angle' });
  assert.deepStrictEqual(validate({ type: C2S.FIRE, angle: 45, power: -Infinity, weapon: 'Missile' }), { ok: false, error: 'Invalid value or type for field: power' });
});

test('ROOM_STATE validation with bad player object', () => {
  const badRoomState = {
    type: S2C.ROOM_STATE,
    code: 'ROOM',
    phase: 'LOBBY',
    hostSlot: 0,
    players: [
      { slot: 0, name: 'Alice', colour: '#00f', connected: 'yes', alive: true } // connected is string, not boolean
    ]
  };
  assert.deepStrictEqual(validate(badRoomState), { ok: false, error: 'Invalid value or type for field: players' });
});
