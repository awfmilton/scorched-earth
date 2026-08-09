const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const RoomManager = require('../lib/room-manager');

describe('RoomManager Lifecycle & State Machine Tests', () => {

  it('create returns a valid 4-character code', () => {
    const rm = new RoomManager();
    const res = rm.createRoom('conn_1');
    assert.ok(res);
    assert.ok(res.replies);
    assert.strictEqual(res.replies.length, 1);

    const room = rm.getRoomByConnection('conn_1');
    assert.ok(room);
    assert.strictEqual(typeof room.code, 'string');
    assert.strictEqual(room.code.length, 4);
    assert.ok(/^[0-9A-Z]{4}$/.test(room.code));
    assert.strictEqual(room.phase, 'lobby');
    assert.strictEqual(room.hostSlot, 0);
  });

  it('join by lower-case code with surrounding whitespace succeeds', () => {
    const rm = new RoomManager();
    rm.createRoom('conn_1');
    const code = rm.getRoomByConnection('conn_1').code;

    const lowerPaddedCode = `  ${code.toLowerCase()}  `;
    const joinRes = rm.join('conn_2', lowerPaddedCode);
    assert.ok(joinRes);

    const room = rm.getRoomByConnection('conn_2');
    assert.ok(room);
    assert.strictEqual(room.code, code);
    assert.strictEqual(room.players.size, 2);

    const p2 = room.players.get(1);
    assert.ok(p2);
    assert.strictEqual(p2.connectionId, 'conn_2');
    assert.strictEqual(p2.slot, 1);
  });

  it('an unknown code is rejected with UNKNOWN_ROOM', () => {
    const rm = new RoomManager();
    assert.throws(() => {
      rm.join('conn_1', 'XZYQ');
    }, (err) => {
      return err.message === 'UNKNOWN_ROOM' || err.code === 'UNKNOWN_ROOM';
    });
  });

  it('a 5th joiner is rejected with ROOM_FULL and the room stays at 4', () => {
    const rm = new RoomManager();
    rm.createRoom('conn_1');
    const code = rm.getRoomByConnection('conn_1').code;

    rm.join('conn_2', code);
    rm.join('conn_3', code);
    rm.join('conn_4', code);

    const room = rm.getRoomByConnection('conn_1');
    assert.strictEqual(room.players.size, 4);

    assert.throws(() => {
      rm.join('conn_5', code);
    }, (err) => {
      return err.message === 'ROOM_FULL' || err.code === 'ROOM_FULL';
    });

    assert.strictEqual(room.players.size, 4);
  });

  it('a duplicate colour is rejected with COLOUR_TAKEN', () => {
    const rm = new RoomManager();
    rm.createRoom('conn_1');
    const code = rm.getRoomByConnection('conn_1').code;
    rm.join('conn_2', code);

    // conn_1 is Magenta (#ff00ff) by default, conn_2 is Cyan (#00ffff).
    // Let's verify conn_2 cannot change to Magenta.
    assert.throws(() => {
      rm.setProfile('conn_2', { name: 'Player 2 New', colour: '#ff00ff' });
    }, (err) => {
      return err.message === 'COLOUR_TAKEN' || err.code === 'COLOUR_TAKEN';
    });
  });

  it('a non-host start is rejected with NOT_HOST', () => {
    const rm = new RoomManager();
    rm.createRoom('conn_1');
    const code = rm.getRoomByConnection('conn_1').code;
    rm.join('conn_2', code);

    // conn_2 is slot 1, not the host (host is slot 0, conn_1)
    assert.throws(() => {
      rm.start('conn_2');
    }, (err) => {
      return err.message === 'NOT_HOST' || err.code === 'NOT_HOST';
    });
  });

  it('a 1-player start is rejected with NOT_ENOUGH_PLAYERS', () => {
    const rm = new RoomManager();
    rm.createRoom('conn_1');

    assert.throws(() => {
      rm.start('conn_1');
    }, (err) => {
      return err.message === 'NOT_ENOUGH_PLAYERS' || err.code === 'NOT_ENOUGH_PLAYERS';
    });
  });

  it('a 2-player start emits ROUND_START to both with an identical seed but a different yourSlot', () => {
    const rm = new RoomManager();
    rm.createRoom('conn_1');
    const code = rm.getRoomByConnection('conn_1').code;
    rm.join('conn_2', code);

    const startRes = rm.start('conn_1');
    assert.ok(startRes);
    assert.ok(Array.isArray(startRes.broadcasts));
    assert.strictEqual(startRes.broadcasts.length, 2);

    const b1 = startRes.broadcasts.find(b => b.to.includes('conn_1'));
    const b2 = startRes.broadcasts.find(b => b.to.includes('conn_2'));

    assert.ok(b1);
    assert.ok(b2);

    assert.strictEqual(b1.msg.type, 'ROUND_START');
    assert.strictEqual(b2.msg.type, 'ROUND_START');

    assert.strictEqual(b1.msg.seed, b2.msg.seed);
    assert.strictEqual(b1.msg.wind, b2.msg.wind);

    assert.strictEqual(b1.msg.yourSlot, 0);
    assert.strictEqual(b2.msg.yourSlot, 1);

    const room = rm.getRoomByConnection('conn_1');
    assert.strictEqual(room.phase, 'playing');
    assert.deepStrictEqual(room.turnOrder, [0, 1]);
    assert.strictEqual(room.activeSlot, 0);
  });

});
