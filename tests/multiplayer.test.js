const test = require('node:test');
const { describe, it, before, after } = test;
const assert = require('node:assert');
const { WebSocket } = require('ws');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { createServer, attachWebSocketServer, createRoomManagerHandlers } = require('../server.js');
const RoomManager = require('../lib/room-manager.js');
const { C2S, S2C, ERRORS } = require('../lib/protocol.js');
const terrainLib = require('../lib/terrain.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
const code = scriptMatch[1];

// Each call builds a SEPARATE V8 context running the client script, so two
// "clients" in this file are as isolated as two browsers: no shared module
// cache, no shared RNG state, no shared Game object.
function evaluateScript() {
  const context = {
    globalThis: {},
    Math,
    Float32Array,
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    requestAnimationFrame: () => {},
    performance: { now: () => Date.now() },
    Terrain: terrainLib
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

// FNV-1a over the raw terrain bytes. Two clients agreeing here means they
// agree on every carved pixel, not just "roughly the same crater".
function hashTerrain(game) {
  const heights = game.terrain.heights;
  const bytes = new Uint8Array(heights.buffer, heights.byteOffset, heights.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Positions and health, quantised to nothing — exact doubles as strings.
function snapshotTanks(game) {
  return game.roster.map(t => `${t.slot}:${t.x}:${t.y}:${t.hp}`).join('|');
}

const openClients = new Set();

function createClient(port) {
  // Dial 127.0.0.1, NOT "localhost". Every server in this suite binds IPv4-only
  // (`server.listen(0, '127.0.0.1')`), but "localhost" resolves to ::1 first on
  // Windows, so the socket only lands via the Happy-Eyeballs IPv6->IPv4 fallback.
  // That fallback is timing-dependent, and under full-suite parallel load it is
  // what left this file waiting on an 'open' that never came.
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages = [];
  let socketError = null;
  ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
  // Without this listener a connection failure is an unhandled 'error' event.
  // With it, the failure is captured and reported by waitOpen below.
  ws.on('error', (err) => { socketError = err; });

  const client = {
    ws,
    messages,
    // Bounded, error-aware replacement for `new Promise(r => ws.on('open', r))`.
    // That form never settles if the socket errors or is simply never accepted,
    // which reads as "still running" and silently eats the whole suite.
    waitOpen: (timeout = 10000) => new Promise((resolve, reject) => {
      if (ws.readyState === WebSocket.OPEN) return resolve(client);
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(
          `WebSocket to 127.0.0.1:${port} did not open within ${timeout}ms` +
          (socketError ? ` (last socket error: ${socketError.code || socketError.message})` : '')
        ));
      }, timeout);
      const onOpen = () => { cleanup(); resolve(client); };
      const onErr = (err) => { cleanup(); reject(new Error(`WebSocket to 127.0.0.1:${port} failed: ${err.code || err.message}`)); };
      function cleanup() {
        clearTimeout(timer);
        ws.off('open', onOpen);
        ws.off('error', onErr);
      }
      ws.on('open', onOpen);
      ws.on('error', onErr);
    }),
    waitFor: async (type, timeout = 10000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const msg = messages.find(m => m.type === type);
        if (msg) return msg;
        await new Promise(r => setTimeout(r, 5));
      }
      throw new Error(`Timeout waiting for ${type}. Got: ${messages.map(m => m.type).join(',')}`);
    },
    send: (msg) => ws.send(JSON.stringify(msg)),
    close: () => {
      openClients.delete(client);
      try { ws.close(); } catch { /* already closing */ }
    }
  };
  openClients.add(client);
  return client;
}

// Mirror of what the browser's ROUND_START handler builds, so the test
// exercises the real config shape rather than a hand-rolled one.
function configFromRoundStart(msg, netStub) {
  const config = msg.config || { rounds: 1, startingCash: 10000, wallType: 'off' };
  config.players = msg.tanks.map(t => ({
    name: t.name,
    type: 'Human',
    color: t.colour,
    slot: t.slot
  }));
  config.isMultiplayer = true;
  config.mySlot = msg.yourSlot;
  config.seed = msg.seed;
  config.wind = msg.wind;
  config.turnOrder = msg.turnOrder;
  config.net = netStub;
  return config;
}

// Boots a headless Game inside its own context, wired to a real websocket.
function bootClientGame(roundStart, wsClient) {
  const ctx = evaluateScript();
  const netStub = {
    state: 'live',
    send: (type, fields) => wsClient.send({ type, ...(fields || {}) })
  };
  const game = ctx.globalThis.SCORCHED.createHeadlessGame({ seed: roundStart.seed });
  ctx.globalThis.SCORCHED.gameInstance = game;
  game.start(configFromRoundStart(roundStart, netStub));
  return { ctx, game, TICK: ctx.globalThis.SCORCHED.CONST.TICK };
}

describe('Multiplayer Flow', () => {
  let server, wss, roomManager, port;

  before(async () => {
    roomManager = new RoomManager();
    const handlers = createRoomManagerHandlers(roomManager);
    server = createServer();

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });

    wss = attachWebSocketServer(server, {
      onMessage: handlers.onMessage,
      onDisconnect: handlers.onDisconnect
    });
  });

  after(() => {
    // Leaked client sockets keep the event loop alive and make this file look
    // like it is "still running" forever. Close every one we opened.
    for (const c of Array.from(openClients)) c.close();
    wss.close();
    server.close();
  });

  it('can create a match and second player joins with share code', async () => {
    const c1 = createClient(port);
    const c2 = createClient(port);

    await c1.waitOpen();
    await c2.waitOpen();

    c1.send({ type: C2S.CREATE_ROOM });
    const createMsg = await c1.waitFor(S2C.ROOM_STATE);
    assert.strictEqual(createMsg.code.length, 4);
    assert.strictEqual(createMsg.phase, 'lobby');

    c1.send({ type: C2S.SET_PROFILE, name: 'P1', colour: '#e23a2e' });
    await c1.waitFor(S2C.ROOM_STATE);

    c2.send({ type: C2S.JOIN_ROOM, code: createMsg.code });
    const c2State = await c2.waitFor(S2C.ROOM_STATE);
    assert.strictEqual(c2State.code, createMsg.code);
    assert.strictEqual(c2State.players.length, 2);

    c1.close();
    c2.close();
  });

  it('handles bad code and full match', async () => {
    const c1 = createClient(port);
    await c1.waitOpen();

    c1.send({ type: C2S.JOIN_ROOM, code: 'XXXX' });
    const errMsg = await c1.waitFor(S2C.ERROR);
    assert.strictEqual(errMsg.code, ERRORS.UNKNOWN_ROOM);

    c1.messages.length = 0;
    c1.send({ type: C2S.CREATE_ROOM });
    const roomState = await c1.waitFor(S2C.ROOM_STATE);
    const code = roomState.code;

    const clients = [];
    for (let i = 0; i < 3; i++) {
      const c = createClient(port);
      clients.push(c);
      await c.waitOpen();
      c.send({ type: C2S.JOIN_ROOM, code });
      await c.waitFor(S2C.ROOM_STATE);
    }

    const fullC = createClient(port);
    await fullC.waitOpen();
    fullC.send({ type: C2S.JOIN_ROOM, code });
    const fullErr = await fullC.waitFor(S2C.ERROR);
    assert.strictEqual(fullErr.code, ERRORS.ROOM_FULL);

    c1.close();
    clients.forEach(c => c.close());
    fullC.close();
  });

  // THE acceptance test: two independent client simulations, one real server,
  // a real shot. If lockstep is broken this is what catches it.
  it('two clients stay byte-identical across a real shot', async () => {
    const c1 = createClient(port);
    const c2 = createClient(port);
    await c1.waitOpen();
    await c2.waitOpen();

    c1.send({ type: C2S.CREATE_ROOM });
    const s1 = await c1.waitFor(S2C.ROOM_STATE);
    const code = s1.code;
    c1.send({ type: C2S.SET_PROFILE, name: 'P1', colour: '#e23a2e' });

    c2.send({ type: C2S.JOIN_ROOM, code });
    await c2.waitFor(S2C.ROOM_STATE);
    c2.send({ type: C2S.SET_PROFILE, name: 'P2', colour: '#8fd400' });

    await new Promise(r => setTimeout(r, 50));
    c1.messages.length = 0;
    c2.messages.length = 0;

    c1.send({
      type: C2S.START_GAME,
      config: { rounds: 1, startingCash: 10000, wallType: 'off', weaponsAvailability: 'all' }
    });

    const start1 = await c1.waitFor(S2C.ROUND_START);
    const start2 = await c2.waitFor(S2C.ROUND_START);
    assert.strictEqual(start1.seed, start2.seed, 'both clients must be given the same seed');
    assert.strictEqual(start1.wind, start2.wind, 'both clients must be given the same wind');

    const A = bootClientGame(start1, c1);
    const B = bootClientGame(start2, c2);

    // 1. Same world BEFORE anyone shoots. This is the check that caught
    //    Game.start() ignoring the server seed and building from seed 42.
    const initialHash = hashTerrain(A.game);
    assert.strictEqual(hashTerrain(A.game), hashTerrain(B.game), 'initial terrain must match');
    assert.strictEqual(snapshotTanks(A.game), snapshotTanks(B.game), 'initial tanks must match');
    assert.notStrictEqual(A.game.seed, 42, 'client must adopt the server seed, not the page default');
    assert.strictEqual(A.game.wind, B.game.wind);

    // 2. Both clients agree on whose turn it is, and it is a real slot.
    assert.strictEqual(
      A.game.roster[A.game.activePlayerIdx].slot,
      B.game.roster[B.game.activePlayerIdx].slot,
      'both clients must agree on the active slot'
    );

    // 3. The active player fires through the real UI path.
    const shooterSlot = A.game.roster[A.game.activePlayerIdx].slot;
    const shooter = (A.game.mySlot === shooterSlot) ? A : B;
    // Steep and short, so the shell lands in-world and carves for ANY seed.
    // A flatter, harder shot leaves the map on some generated terrains and
    // the "terrain actually changed" check below then fails at random.
    shooter.game.roster[shooter.game.activePlayerIdx].angle = 85;
    shooter.game.roster[shooter.game.activePlayerIdx].power = 150;
    // The watching client aims somewhere else entirely; it must NOT matter,
    // because the trajectory comes from the server's vector.
    const watcher = (shooter === A) ? B : A;
    watcher.game.roster[watcher.game.activePlayerIdx].angle = 12;
    watcher.game.roster[watcher.game.activePlayerIdx].power = 999;

    shooter.game.fireActiveWeapon();

    const sync1 = await c1.waitFor(S2C.FIRE_SYNC);
    const sync2 = await c2.waitFor(S2C.FIRE_SYNC);
    assert.strictEqual(sync1.vx, sync2.vx, 'server must mint one launch vector');
    assert.strictEqual(sync1.vy, sync2.vy);
    assert.strictEqual(typeof sync1.angle, 'number', 'FIRE_SYNC must echo the angle for barrel placement');

    A.game.applyFireSync(sync1);
    B.game.applyFireSync(sync2);
    assert.ok(A.game.projectile, 'shot must exist on client A');
    assert.ok(B.game.projectile, 'shot must exist on client B (the watcher)');

    // 4. Step both simulations the same number of fixed ticks and compare
    //    every tick, so a divergence is caught the moment it appears.
    for (let i = 0; i < 900; i++) {
      A.game.stepPhysics(A.TICK);
      B.game.stepPhysics(B.TICK);
      if (i % 25 === 0) {
        assert.strictEqual(hashTerrain(A.game), hashTerrain(B.game), `terrain diverged at tick ${i}`);
        assert.strictEqual(snapshotTanks(A.game), snapshotTanks(B.game), `tanks diverged at tick ${i}`);
      }
      if (!A.game.projectile && !B.game.projectile) break;
    }

    // 5. Final state agreement: terrain damage AND health.
    assert.strictEqual(A.game.projectile, null, 'shot should have resolved on A');
    assert.strictEqual(B.game.projectile, null, 'shot should have resolved on B');
    assert.strictEqual(hashTerrain(A.game), hashTerrain(B.game), 'final terrain must be byte-identical');
    assert.strictEqual(snapshotTanks(A.game), snapshotTanks(B.game), 'final tank state must be identical');

    // 6. The shot actually changed the world. Without this, steps 1-5 would
    //    pass just as well on a shot that never left the barrel.
    assert.notStrictEqual(hashTerrain(A.game), initialHash, 'the shot must have carved the terrain');

    // 7. The turn advanced, server-driven, and both clients landed on it.
    const turn1 = await c1.waitFor(S2C.TURN_SYNC);
    const turn2 = await c2.waitFor(S2C.TURN_SYNC);
    assert.strictEqual(turn1.activeSlot, turn2.activeSlot, 'both clients get the same next turn');
    A.game.applyTurnSync(turn1);
    B.game.applyTurnSync(turn2);
    assert.strictEqual(
      A.game.roster[A.game.activePlayerIdx].slot,
      B.game.roster[B.game.activePlayerIdx].slot,
      'both clients must advance to the same active slot'
    );
    assert.notStrictEqual(turn1.activeSlot, shooterSlot, 'turn must move off the shooter');

    c1.close();
    c2.close();
  });

  it('rejects an out-of-turn shot rather than desyncing', async () => {
    const c1 = createClient(port);
    const c2 = createClient(port);
    await c1.waitOpen();
    await c2.waitOpen();

    c1.send({ type: C2S.CREATE_ROOM });
    const s1 = await c1.waitFor(S2C.ROOM_STATE);
    c2.send({ type: C2S.JOIN_ROOM, code: s1.code });
    await c2.waitFor(S2C.ROOM_STATE);
    await new Promise(r => setTimeout(r, 50));

    c1.send({ type: C2S.START_GAME, config: { rounds: 1 } });
    const rs1 = await c1.waitFor(S2C.ROUND_START);
    const rs2 = await c2.waitFor(S2C.ROUND_START);

    // Whichever client is NOT the active slot fires: must be refused.
    const idle = (rs1.turnOrder[0] === rs1.yourSlot) ? c2 : c1;
    idle.messages.length = 0;
    idle.send({ type: C2S.FIRE, angle: 45, power: 500, weapon: 'Baby Missile' });
    const err = await idle.waitFor(S2C.ERROR);
    assert.strictEqual(err.code, ERRORS.NOT_YOUR_TURN);
    assert.ok(rs2.turnOrder.length >= 2);

    c1.close();
    c2.close();
  });

  it('handles disconnect and reconnect mid-game', async () => {
    const c1 = createClient(port);
    const c2 = createClient(port);
    await c1.waitOpen();
    await c2.waitOpen();

    c1.send({ type: C2S.CREATE_ROOM });
    const s1 = await c1.waitFor(S2C.ROOM_STATE);
    const code = s1.code;

    c2.send({ type: C2S.JOIN_ROOM, code });
    const s2 = await c2.waitFor(S2C.ROOM_STATE);
    const token2 = s2.playerToken;
    assert.ok(token2, 'join reply must carry a rejoin token');

    await new Promise(r => setTimeout(r, 50));
    c1.send({ type: C2S.START_GAME, config: { rounds: 1 } });
    await c1.waitFor(S2C.ROUND_START);
    await c2.waitFor(S2C.ROUND_START);

    // Player 2 drops mid-game.
    c1.messages.length = 0;
    c2.close();
    const left = await c1.waitFor(S2C.PLAYER_LEFT);
    assert.strictEqual(left.slot, s2.yourSlot);

    // The room must NOT be wedged: the survivor still sees it playing.
    const state = c1.messages.filter(m => m.type === S2C.ROOM_STATE).pop();
    assert.strictEqual(state.phase, 'playing');

    // Player 2 comes back with the token and is restored to the same slot.
    const c3 = createClient(port);
    await c3.waitOpen();
    c3.send({ type: C2S.REJOIN, code, playerToken: token2 });
    const rejoined = await c3.waitFor(S2C.ROOM_STATE);
    assert.strictEqual(rejoined.phase, 'playing');
    const me = rejoined.players.find(p => p.slot === s2.yourSlot);
    assert.ok(me, 'rejoining player must be back in their original slot');
    assert.strictEqual(me.connected, true);

    // And is handed the round back so they can resume.
    const resume = await c3.waitFor(S2C.ROUND_START);
    assert.strictEqual(typeof resume.seed, 'number');

    c1.close();
    c3.close();
  });

  it('refuses a rejoin with a bad token', async () => {
    const c1 = createClient(port);
    await c1.waitOpen();
    c1.send({ type: C2S.CREATE_ROOM });
    const s1 = await c1.waitFor(S2C.ROOM_STATE);

    const c2 = createClient(port);
    await c2.waitOpen();
    c2.send({ type: C2S.REJOIN, code: s1.code, playerToken: 'not-a-real-token' });
    const err = await c2.waitFor(S2C.ERROR);
    assert.ok(err.code, 'a bad token must produce an error, not a silent seat');

    c1.close();
    c2.close();
  });
});
