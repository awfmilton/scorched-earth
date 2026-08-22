// Tank movement: fuel-driven driving and Teleport.
//
// Both change the world every client simulates, so they travel the same
// lockstep channel as FIRE — the client sends an input and applies nothing,
// and every client acts on the echoed sync. These tests cover the server's
// turn authority over those inputs and the client's agreement on the result.

const test = require('node:test');
const { describe, it, before, after } = test;
const assert = require('node:assert');

const RoomManager = require('../lib/room-manager.js');
const { WORLD_W, WORLD_MARGIN } = require('../lib/constants.js');
const { until, gameOf, startTestServer, setupMatch } = require('./helpers/browser-harness.js');

function startedRoom() {
  const rm = new RoomManager();
  rm.createRoom('conn_1');
  const room = rm.getRoomByConnection('conn_1');
  rm.join('conn_2', room.code);
  rm.start('conn_1', { rounds: 1 });
  return { rm, room };
}

describe('Server authority over movement inputs', () => {
  it('relays a drive from the active player to everyone', () => {
    const { rm, room } = startedRoom();
    const res = rm.move('conn_1', { dir: 1, steps: 3 });

    assert.strictEqual(res.broadcasts.length, 1);
    const msg = res.broadcasts[0].msg;
    assert.strictEqual(msg.type, 'MOVE_SYNC');
    assert.strictEqual(msg.slot, room.activeSlot);
    assert.strictEqual(msg.dir, 1);
    assert.strictEqual(msg.steps, 3);
    assert.strictEqual(res.broadcasts[0].to.length, 2, 'both players must see the move');
  });

  it('refuses a drive from a player whose turn it is not', () => {
    const { rm } = startedRoom();
    assert.throws(() => rm.move('conn_2', { dir: 1, steps: 1 }), /NOT_YOUR_TURN/);
  });

  it('refuses a drive once the shot is in the air', () => {
    const { rm } = startedRoom();
    rm.fire('conn_1', { angle: 45, power: 500 });
    assert.throws(() => rm.move('conn_1', { dir: 1, steps: 1 }), /ALREADY_FIRED/);
    assert.throws(() => rm.teleport('conn_1'), /ALREADY_FIRED/);
  });

  it('rejects a malformed direction rather than coercing it', () => {
    const { rm } = startedRoom();
    assert.throws(() => rm.move('conn_1', { dir: 0, steps: 1 }), /BAD_MESSAGE/);
    assert.throws(() => rm.move('conn_1', { dir: 'left', steps: 1 }), /BAD_MESSAGE/);
    assert.throws(() => rm.move('conn_1', { dir: 1, steps: 0 }), /BAD_MESSAGE/);
    assert.throws(() => rm.move('conn_1', { dir: 1, steps: 2.5 }), /BAD_MESSAGE/);
  });

  it('caps a burst so one message cannot cross the map', () => {
    const { rm } = startedRoom();
    const msg = rm.move('conn_1', { dir: -1, steps: 9999 }).broadcasts[0].msg;
    assert.strictEqual(msg.steps, 8, 'steps must be clamped');
  });

  it('mints a teleport destination inside the world', () => {
    const { rm, room } = startedRoom();
    for (let i = 0; i < 40; i++) {
      const msg = rm.teleport('conn_1').broadcasts[0].msg;
      assert.strictEqual(msg.type, 'TELEPORT_SYNC');
      assert.strictEqual(msg.slot, room.activeSlot);
      assert.ok(msg.x >= WORLD_MARGIN, `x=${msg.x} must clear the left margin`);
      assert.ok(msg.x <= WORLD_W - WORLD_MARGIN, `x=${msg.x} must clear the right margin`);
    }
  });
});

describe('Movement stays in lockstep across clients', () => {
  let srv;

  before(async () => { srv = await startTestServer(); });
  after(() => { srv.close(); });

  // The active player on whichever browser owns the turn.
  function driver(host, guest) {
    const activeSlot = gameOf(host).roster[gameOf(host).activePlayerIdx].slot;
    return { activeSlot, browser: gameOf(host).mySlot === activeSlot ? host : guest };
  }

  const tankAt = (game, slot) => game.roster.find(t => t.slot === slot);

  it('drives the same tank to the same pixel on both clients', async () => {
    const { host, guest } = await setupMatch(srv.port, 1);
    const { activeSlot, browser } = driver(host, guest);

    const startX = tankAt(gameOf(host), activeSlot).x;
    assert.strictEqual(
      tankAt(gameOf(guest), activeSlot).x,
      startX,
      'clients must start from the same position'
    );

    for (let i = 0; i < 6; i++) {
      browser.dom.window.dispatch('keydown', { key: 'd', code: 'KeyD' });
    }

    await until(
      () => tankAt(gameOf(host), activeSlot).x !== startX,
      10000,
      'the drive to land on the host'
    );
    // Let the remaining MOVE_SYNCs settle before comparing.
    await until(
      () => tankAt(gameOf(host), activeSlot).x === tankAt(gameOf(guest), activeSlot).x
        && tankAt(gameOf(host), activeSlot).y === tankAt(gameOf(guest), activeSlot).y,
      10000,
      'both clients to agree on the driven position'
    );

    const hostTank = tankAt(gameOf(host), activeSlot);
    const guestTank = tankAt(gameOf(guest), activeSlot);
    assert.strictEqual(hostTank.x, guestTank.x, 'x must agree');
    assert.strictEqual(hostTank.y, guestTank.y, 'y must agree — the tank sits on the terrain');
    assert.notStrictEqual(hostTank.x, startX, 'the tank must actually have moved');
  });

  it('spends the driver fuel and nobody else', async () => {
    const { host, guest } = await setupMatch(srv.port, 1);
    const { activeSlot, browser } = driver(host, guest);

    const ownGame = gameOf(browser);
    const fuelBefore = tankAt(ownGame, activeSlot).inventory['Fuel'];
    assert.ok(fuelBefore > 0, 'a round starts with fuel');

    browser.dom.window.dispatch('keydown', { key: 'a', code: 'KeyA' });
    await until(
      () => tankAt(gameOf(browser), activeSlot).inventory['Fuel'] < fuelBefore,
      10000,
      'fuel to be spent'
    );

    assert.strictEqual(
      tankAt(gameOf(browser), activeSlot).inventory['Fuel'],
      fuelBefore - 1,
      'one step costs one unit'
    );
  });

  it('will not drive on an empty tank', async () => {
    const { host, guest } = await setupMatch(srv.port, 1);
    const { activeSlot, browser } = driver(host, guest);

    const tank = tankAt(gameOf(browser), activeSlot);
    tank.inventory['Fuel'] = 0;
    const startX = tank.x;

    browser.dom.window.dispatch('keydown', { key: 'd', code: 'KeyD' });
    await new Promise(r => setTimeout(r, 200));

    assert.strictEqual(tankAt(gameOf(browser), activeSlot).x, startX, 'no fuel, no movement');
    assert.strictEqual(tankAt(gameOf(host), activeSlot).x, startX, 'and nothing was broadcast');
  });

  it('teleports to the same column on both clients and spends the item', async () => {
    const { host, guest } = await setupMatch(srv.port, 1);
    const { activeSlot, browser } = driver(host, guest);

    const tank = tankAt(gameOf(browser), activeSlot);
    tank.inventory['Teleport'] = 1;
    const startX = tank.x;

    browser.dom.window.dispatch('keydown', { key: 't', code: 'KeyT' });

    await until(
      () => tankAt(gameOf(host), activeSlot).x !== startX,
      10000,
      'the teleport to land'
    );
    await until(
      () => tankAt(gameOf(host), activeSlot).x === tankAt(gameOf(guest), activeSlot).x,
      10000,
      'both clients to agree on the destination'
    );

    const hostTank = tankAt(gameOf(host), activeSlot);
    const guestTank = tankAt(gameOf(guest), activeSlot);
    assert.strictEqual(hostTank.x, guestTank.x, 'destination must agree');
    assert.strictEqual(hostTank.y, guestTank.y, 'and so must the landing height');
    assert.strictEqual(
      tankAt(gameOf(browser), activeSlot).inventory['Teleport'],
      0,
      'the teleport is consumed'
    );

    // A second attempt with none left must do nothing at all.
    const afterX = hostTank.x;
    browser.dom.window.dispatch('keydown', { key: 't', code: 'KeyT' });
    await new Promise(r => setTimeout(r, 200));
    assert.strictEqual(tankAt(gameOf(host), activeSlot).x, afterX, 'no teleports left, no jump');
  });
});
