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
    sessionStorage: { getItem: () => null, setItem: () => {} },
    requestAnimationFrame: () => {},
    performance: { now: () => Date.now() },
    Terrain: terrainLib
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

function createClient(port) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const messages = [];
  ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
  
  return {
    ws,
    messages,
    waitFor: async (type, timeout = 1000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const msg = messages.find(m => m.type === type);
        if (msg) return msg;
        await new Promise(r => setTimeout(r, 10));
      }
      throw new Error(`Timeout waiting for ${type}`);
    },
    send: (msg) => ws.send(JSON.stringify(msg)),
    close: () => ws.close()
  };
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

    const wsStuff = attachWebSocketServer(server, {
      onMessage: handlers.onMessage,
      onDisconnect: handlers.onDisconnect
    });
    wss = wsStuff;
  });

  after(() => {
    wss.close();
    server.close();
  });

  it('can create a match and second player joins with share code', async () => {
    const c1 = createClient(port);
    const c2 = createClient(port);

    await new Promise(r => c1.ws.on('open', r));
    await new Promise(r => c2.ws.on('open', r));

    c1.send({ type: C2S.CREATE_ROOM });
    const createMsg = await c1.waitFor(S2C.ROOM_STATE);
    assert.strictEqual(createMsg.code.length, 4);
    assert.strictEqual(createMsg.phase, 'LOBBY');

    c1.send({ type: C2S.SET_PROFILE, name: 'P1', colour: '#ff0000' });
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
    await new Promise(r => c1.ws.on('open', r));
    
    c1.send({ type: C2S.JOIN_ROOM, code: 'XXXX' });
    const errMsg = await c1.waitFor(S2C.ERROR);
    assert.strictEqual(errMsg.code, ERRORS.UNKNOWN_ROOM);

    // Create a room, fill it
    c1.messages.length = 0;
    c1.send({ type: C2S.CREATE_ROOM });
    const roomState = await c1.waitFor(S2C.ROOM_STATE);
    const code = roomState.code;

    const clients = [];
    for (let i = 0; i < 3; i++) {
      const c = createClient(port);
      clients.push(c);
      await new Promise(r => c.ws.on('open', r));
      c.send({ type: C2S.JOIN_ROOM, code });
      await c.waitFor(S2C.ROOM_STATE);
    }

    const fullC = createClient(port);
    await new Promise(r => fullC.ws.on('open', r));
    fullC.send({ type: C2S.JOIN_ROOM, code });
    const fullErr = await fullC.waitFor(S2C.ERROR);
    assert.strictEqual(fullErr.code, ERRORS.ROOM_FULL);

    c1.close();
    clients.forEach(c => c.close());
    fullC.close();
  });

  it('syncs correctly under deterministic lockstep', async () => {
    const c1 = createClient(port);
    const c2 = createClient(port);
    await new Promise(r => c1.ws.on('open', r));
    await new Promise(r => c2.ws.on('open', r));

    c1.send({ type: C2S.CREATE_ROOM });
    const s1 = await c1.waitFor(S2C.ROOM_STATE);
    const code = s1.code;
    const token1 = s1.playerToken;
    c1.send({ type: C2S.SET_PROFILE, name: 'P1', colour: '#ff0000' });

    c2.send({ type: C2S.JOIN_ROOM, code });
    const s2 = await c2.waitFor(S2C.ROOM_STATE);
    const token2 = s2.playerToken;
    c2.send({ type: C2S.SET_PROFILE, name: 'P2', colour: '#00ff00' });

    // Ensure state settles
    await new Promise(r => setTimeout(r, 50));
    c1.messages.length = 0;
    c2.messages.length = 0;

    c1.send({
      type: C2S.START_GAME,
      config: {
        rounds: 1,
        startingCash: 10000,
        wallType: 'off',
        weaponsAvailability: 'all'
      }
    });

    const start1 = await c1.waitFor(S2C.ROUND_START);
    const start2 = await c2.waitFor(S2C.ROUND_START);
    assert.strictEqual(start1.seed, start2.seed);

    const ctx1 = evaluateScript();
    const ctx2 = evaluateScript();

    const game1 = ctx1.globalThis.SCORCHED.createHeadlessGame({ seed: start1.seed });
    const game2 = ctx2.globalThis.SCORCHED.createHeadlessGame({ seed: start2.seed });

    // Set wind
    game1.wind = start1.wind;
    game2.wind = start2.wind;

    // Load roster
    game1.start(start1.config, start1.tanks);
    game2.start(start2.config, start2.tanks);
    game1.activePlayerIdx = 0;
    game2.activePlayerIdx = 0;

    // Fire!
    c1.send({ type: C2S.FIRE, angle: 45, power: 500, weapon: 'Baby Missile' });
    const sync1 = await c1.waitFor(S2C.FIRE_SYNC);
    const sync2 = await c2.waitFor(S2C.FIRE_SYNC);

    assert.strictEqual(sync1.vx, sync2.vx);

    game1.applyFireSync(sync1);
    game2.applyFireSync(sync2);

    // Tick both games
    for (let i = 0; i < 500; i++) {
      if (game1.projectile) game1.stepPhysics(ctx1.globalThis.SCORCHED.CONST.TICK);
      if (game2.projectile) game2.stepPhysics(ctx2.globalThis.SCORCHED.CONST.TICK);
    }

    assert.strictEqual(game1.projectile, null);
    assert.strictEqual(game2.projectile, null);
    
    assert.deepStrictEqual(new Float32Array(game1.terrain.heights), new Float32Array(game2.terrain.heights));
    assert.strictEqual(game1.roster[0].hp, game2.roster[0].hp);
    assert.strictEqual(game1.roster[1].hp, game2.roster[1].hp);

    c1.close();
    c2.close();
  });

  it('handles disconnect and reconnect mid-game', async () => {
    const c1 = createClient(port);
    const c2 = createClient(port);
    await new Promise(r => c1.ws.on('open', r));
    await new Promise(r => c2.ws.on('open', r));

    c1.send({ type: C2S.CREATE_ROOM });
    const s1 = await c1.waitFor(S2C.ROOM_STATE);
    const code = s1.code;
    const p1Token = s1.playerToken;

    c2.send({ type: C2S.JOIN_ROOM, code });
    const s2 = await c2.waitFor(S2C.ROOM_STATE);
    const p2Token = s2.playerToken;

    c1.send({ type: C2S.START_GAME, config: { rounds: 1, startingCash: 10000, wallType: 'off', weaponsAvailability: 'all' } });
    await c1.waitFor(S2C.ROUND_START);
    await c2.waitFor(S2C.ROUND_START);

    // disconnect c2
    c2.close();
    const leftMsg = await c1.waitFor(S2C.PLAYER_LEFT);
    assert.strictEqual(leftMsg.slot, s2.yourSlot);

    // reconnect c2
    const c3 = createClient(port);
    await new Promise(r => c3.ws.on('open', r));
    c3.send({ type: C2S.REJOIN, code, playerToken: p2Token });
    const rejoinState = await c3.waitFor(S2C.ROOM_STATE);
    assert.strictEqual(rejoinState.phase, 'PLAYING');
    
    const reconnectedPlayer = rejoinState.players.find(p => p.slot === s2.yourSlot);
    assert.strictEqual(reconnectedPlayer.connected, true);

    c1.close();
    c3.close();
  });
});
