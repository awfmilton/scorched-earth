const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const RoomManager = require('../lib/room-manager');
const { validate } = require('../lib/protocol');
const crypto = require('node:crypto');

describe('RoomManager Room Sweep Tests', () => {

  it('sweep() on an empty manager returns cleanly', () => {
    const rm = new RoomManager();
    const result = rm.sweep(Date.now());
    assert.deepStrictEqual(result.swept, []);
    assert.deepStrictEqual(result.replies, []);
    assert.deepStrictEqual(result.broadcasts, []);
  });

  it('all-disconnected room is swept past the threshold and retained before it', () => {
    const rm = new RoomManager();

    // Setup room 1
    rm.createRoom('conn_1');
    const room = rm.getRoomByConnection('conn_1');
    const code = room.code;

    rm.join('conn_2', code);
    rm.start('conn_1');

    // Disconnect everyone to park the room
    rm.disconnect('conn_1');
    rm.disconnect('conn_2');

    assert.strictEqual(room.phase, 'paused');
    assert.ok(room.pausedAt);

    const baseTime = room.pausedAt;

    // Retained before threshold
    const resultBefore = rm.sweep(baseTime + RoomManager.STALE_PAUSED_MS - 1000);
    assert.deepStrictEqual(resultBefore.swept, []);
    assert.ok(rm.rooms.has(code));

    // Swept past threshold
    const resultAfter = rm.sweep(baseTime + RoomManager.STALE_PAUSED_MS + 1000);
    assert.deepStrictEqual(resultAfter.swept, [code]);
    assert.strictEqual(rm.rooms.has(code), false);

    // Validate emitted frames
    for (const reply of resultAfter.replies) {
      const valResult = validate(reply.msg);
      assert.ok(valResult.ok, `Reply frame failed validation: ${valResult.error}`);
      assert.strictEqual(reply.msg.type, 'ERROR');
      assert.strictEqual(reply.msg.code, 'ROOM_CLOSED');
    }
    for (const b of resultAfter.broadcasts) {
      const valResult = validate(b.msg);
      assert.ok(valResult.ok, `Broadcast frame failed validation: ${valResult.error}`);
    }
  });

  it('room with any connected player is never swept even past the threshold', () => {
    const rm = new RoomManager();

    // Setup room 1
    rm.createRoom('conn_1');
    const room = rm.getRoomByConnection('conn_1');
    const code = room.code;

    rm.join('conn_2', code);
    rm.start('conn_1');

    // Only one player disconnects, room is still playing, NOT parked/paused.
    rm.disconnect('conn_2');

    assert.strictEqual(room.phase, 'playing');
    // Ensure room.pausedAt is not set, but even if it was, there is still a connected player ('conn_1')

    // Attempt sweep past threshold (simulate 1 hour has passed)
    const baseTime = room.createdAt;
    const result = rm.sweep(baseTime + 3600 * 1000);

    assert.deepStrictEqual(result.swept, []);
    assert.ok(rm.rooms.has(code));
  });

  it('an emptied lobby is swept immediately; an occupied one is retained', () => {
    // CONTRACT CHANGE. Lobby disconnects DELETE seats, so a lobby with no
    // connected players is always empty — and an empty lobby has nobody who
    // could come back to it. Letting empties ride out the 15-minute TTL was
    // what let one attacker hold thousands of codes at once, so they are
    // reaped on the very next sweep.
    const rm = new RoomManager();

    rm.createRoom('conn_1');
    const room1 = rm.getRoomByConnection('conn_1');
    const code1 = room1.code;

    // While its creator is seated, the lobby is retained — up to the
    // connected-lobby TTL (a held socket must not squat a code forever;
    // that expiry is pinned in tests/pre-deploy-hardening.test.js).
    const nearTtl = room1.createdAt + RoomManager.MAX_CONNECTED_LOBBY_MS - 60000;
    assert.deepStrictEqual(rm.sweep(nearTtl).swept, []);
    assert.ok(rm.rooms.has(code1));

    // Disconnect the only player: the seat is deleted, the lobby is empty,
    // and the very next sweep reaps it — no TTL wait.
    rm.disconnect('conn_1');
    const resultAfter = rm.sweep(room1.createdAt + 1000);
    assert.deepStrictEqual(resultAfter.swept, [code1]);
    assert.strictEqual(rm.rooms.has(code1), false);

    // Validate emitted frames
    for (const reply of resultAfter.replies) {
      const valResult = validate(reply.msg);
      assert.ok(valResult.ok, `Reply frame failed validation: ${valResult.error}`);
      assert.strictEqual(reply.msg.type, 'ERROR');
      assert.strictEqual(reply.msg.code, 'ROOM_CLOSED');
    }
  });

  it('lobby with >=2 players is NOT swept even past MAX_LOBBY_MS', () => {
    const rm = new RoomManager();

    // Create room (lobby, 2 players)
    rm.createRoom('conn_1');
    const room = rm.getRoomByConnection('conn_1');
    const code = room.code;
    rm.join('conn_2', code);

    // Disconnect both players so that none is connected, but players count is still 2 (or is it? Wait!)
    // Oh, wait! In disconnect():
    // "In lobby phase, removing the slot outright is acceptable."
    // Let's check: "disconnect() sets connected = false; in lobby it deletes the slot, in playing it keeps it."
    // Ah! In lobby phase, disconnecting a player DELETES the slot!
    // So if we disconnect everyone from a lobby, the lobby room's players list becomes empty (players.size === 0 < 2).
    // So if they are disconnected, they get deleted from players list, so player count < 2, so it gets swept. This is correct!
    // But if they are NOT disconnected, they are connected, so `hasConnected` is true, which prevents sweep.
    // What if a lobby has 2 players, but they are NOT disconnected? Then `hasConnected` is true, so it is never swept.
    // What if we have a lobby with <2 players, e.g. 1 player, but that player is connected? `hasConnected` is true, so it is never swept.
    // This perfectly aligns with all specified rules.

    const baseTime = room.createdAt;
    const result = rm.sweep(baseTime + RoomManager.MAX_LOBBY_MS + 1000);
    assert.deepStrictEqual(result.swept, []);
    assert.ok(rm.rooms.has(code));
  });

  it('determinism: sweep(FIXED_TS) twice on identical managers gives identical results', () => {
    const originalRandomInt = crypto.randomInt;
    const originalRandomBytes = crypto.randomBytes;
    const originalDateNow = Date.now;

    let countInt = 0;
    crypto.randomInt = (min, max) => {
      countInt++;
      return min + (countInt % (max - min));
    };
    crypto.randomBytes = (size) => {
      return Buffer.alloc(size, 0x42);
    };
    Date.now = () => 1786292068000;

    const createAndSetManager = () => {
      const rm = new RoomManager();
      rm.createRoom('conn_1');
      const room = rm.getRoomByConnection('conn_1');
      rm.join('conn_2', room.code);
      rm.start('conn_1');
      rm.disconnect('conn_1');
      rm.disconnect('conn_2');
      return { rm, pausedAt: room.pausedAt };
    };

    try {
      countInt = 0;
      const { rm: rm1, pausedAt: p1 } = createAndSetManager();

      countInt = 0;
      const { rm: rm2, pausedAt: p2 } = createAndSetManager();

      assert.strictEqual(p1, p2);

      const ts = p1 + RoomManager.STALE_PAUSED_MS + 5000;

      const result1 = rm1.sweep(ts);
      const result2 = rm2.sweep(ts);

      assert.deepStrictEqual(result1, result2);
    } finally {
      crypto.randomInt = originalRandomInt;
      crypto.randomBytes = originalRandomBytes;
      Date.now = originalDateNow;
    }
  });

});
