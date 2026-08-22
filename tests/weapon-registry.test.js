// The server validates FIRE against lib/constants.js WEAPON_IDS and quietly
// substitutes Baby Missile for anything it does not recognise. That is a silent
// downgrade — the shooter sees the weapon leave the barrel and every client,
// including theirs, flies a Baby Missile instead. Digger and Heavy Digger were
// shipped that way. This test is the guard: the client's WEAPONS table and the
// server's accept-list must name exactly the same weapons.

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { WEAPON_IDS, BASIC_WEAPON_IDS } = require('../lib/constants.js');
const RoomManager = require('../lib/room-manager.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function loadClient() {
  const context = {
    globalThis: {},
    Math,
    Float32Array,
    console,
    setTimeout,
    clearTimeout,
    Terrain: require('../lib/terrain.js'),
    document: { getElementById: () => null, addEventListener: () => {} },
    window: { addEventListener: () => {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.globalThis.SCORCHED;
}

describe('weapon registry parity', () => {
  it('the client WEAPONS table and the server accept-list name the same weapons', () => {
    const SCORCHED = loadClient();
    // Array.from re-homes the list into this realm: an array built inside the
    // vm context has a different Array.prototype, and deepStrictEqual compares
    // prototypes, so a bare .map() here fails even when the contents match.
    const clientIds = Array.from(SCORCHED.WEAPONS, w => w.id).sort();
    const serverIds = Array.from(WEAPON_IDS).sort();

    const missingOnServer = clientIds.filter(id => !serverIds.includes(id));
    const missingOnClient = serverIds.filter(id => !clientIds.includes(id));

    assert.deepStrictEqual(
      missingOnServer, [],
      'weapons the client can fire but the server would downgrade to Baby Missile'
    );
    assert.deepStrictEqual(
      missingOnClient, [],
      'weapons the server accepts but the client has no config for'
    );
  });

  it('WEAPON_IDS has no duplicates', () => {
    assert.strictEqual(new Set(WEAPON_IDS).size, WEAPON_IDS.length);
  });

  it('the server accepts every registered weapon and downgrades unknown ones', () => {
    const rm = new RoomManager();
    rm.createRoom('conn_1');
    const room = rm.getRoomByConnection('conn_1');
    rm.join('conn_2', room.code);
    rm.start('conn_1');

    const connForActiveSlot = () => {
      for (const p of room.players.values()) {
        if (p.slot === room.activeSlot) return p.connectionId;
      }
      throw new Error('no connection holds the active slot');
    };

    // Fire every registered weapon in turn, resolving each shot so the next
    // one is authorised. A weapon missing from the accept-list comes back as
    // Baby Missile rather than as an error, so assert on the synced name.
    for (const id of WEAPON_IDS) {
      const conn = connForActiveSlot();
      const res = rm.fire(conn, { angle: 45, power: 500, weapon: id });
      const sync = res.broadcasts[0].msg;
      assert.strictEqual(sync.weapon, id, `${id} was downgraded on the way to FIRE_SYNC`);
      rm.resolveShot(conn, { shotId: sync.shotId });
    }

    const conn = connForActiveSlot();
    const bogus = rm.fire(conn, { angle: 45, power: 500, weapon: 'Orbital Death Ray' });
    assert.strictEqual(
      bogus.broadcasts[0].msg.weapon, 'Baby Missile',
      'an unregistered weapon must fall back to Baby Missile'
    );
  });
});

describe('the Basic tier is enforced per room, not just hidden in the shop', () => {
  // A modified client can send any weapon id it likes, and every honest client
  // simulates whatever comes back in FIRE_SYNC — so a client-side shop filter
  // is a suggestion. The server has to hold the same line.

  function startRoom(config) {
    const rm = new RoomManager();
    rm.createRoom('conn_1');
    const room = rm.getRoomByConnection('conn_1');
    rm.join('conn_2', room.code);
    rm.start('conn_1', config);
    return { rm, room };
  }

  function connForActiveSlot(room) {
    for (const p of room.players.values()) {
      if (p.slot === room.activeSlot) return p.connectionId;
    }
    throw new Error('no connection holds the active slot');
  }

  function fireOnce(rm, room, weapon) {
    const conn = connForActiveSlot(room);
    const sync = rm.fire(conn, { angle: 45, power: 500, weapon }).broadcasts[0].msg;
    rm.resolveShot(conn, { shotId: sync.shotId });
    return sync.weapon;
  }

  it('client and server agree on which weapons are Basic', () => {
    const SCORCHED = loadClient();
    assert.deepStrictEqual(
      Array.from(SCORCHED.BASIC_WEAPON_IDS).sort(),
      Array.from(BASIC_WEAPON_IDS).sort(),
      'the client shop filter and the server accept-list must name the same weapons'
    );
  });

  it('a Basic room downgrades a Meganuke to Baby Missile', () => {
    const { rm, room } = startRoom({ weaponsAvailability: 'basic' });
    assert.strictEqual(fireOnce(rm, room, 'Meganuke'), 'Baby Missile');
    assert.strictEqual(fireOnce(rm, room, 'Heavy Sandhog'), 'Baby Missile');
    assert.strictEqual(fireOnce(rm, room, "Death's Head"), 'Baby Missile');
  });

  it('a Basic room still passes the Basic weapons through untouched', () => {
    const { rm, room } = startRoom({ weaponsAvailability: 'basic' });
    for (const id of BASIC_WEAPON_IDS) {
      assert.strictEqual(fireOnce(rm, room, id), id, `${id} must be legal in a Basic room`);
    }
  });

  it('an All room is unaffected', () => {
    const { rm, room } = startRoom({ weaponsAvailability: 'all' });
    assert.strictEqual(fireOnce(rm, room, 'Meganuke'), 'Meganuke');
  });

  it('a room started with no weapon setting defaults to All, not Basic', () => {
    const { rm, room } = startRoom();
    assert.strictEqual(fireOnce(rm, room, 'Meganuke'), 'Meganuke');
  });

  it('the fallback weapon is itself Basic, so the downgrade is always legal', () => {
    assert.ok(BASIC_WEAPON_IDS.includes('Baby Missile'));
  });
});
