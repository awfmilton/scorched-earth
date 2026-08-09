const test = require('node:test');
const { describe, it, beforeEach, afterEach } = test;
const assert = require('node:assert');
const http = require('node:http');
const WebSocket = require('ws');
const { createServer, attachWebSocketServer, MAX_PAYLOAD_BYTES } = require('../server.js');

function startServer(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function httpGet(port, pathStr) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathStr }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => { res.body = data; resolve(res); });
    });
    req.on('error', reject);
    req.end();
  });
}

function connect(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function nextMessage(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for a message')), 2000);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString('utf8')));
    });
  });
}

describe('WebSocket endpoint on the shared HTTP server', () => {
  let server;
  let attached;
  let port;
  let received;

  beforeEach(async () => {
    received = [];
    server = createServer();
    attached = attachWebSocketServer(server, {
      onMessage: (ctx) => {
        received.push(ctx.msg);
        ctx.send(ctx.connectionId, { type: 'ROOM_STATE', code: 'AB23', phase: 'lobby', hostSlot: 0, players: [] });
      }
    });
    port = await startServer(server);
  });

  afterEach(async () => {
    await attached.close();
    await new Promise(resolve => server.close(resolve));
  });

  it('serves HTTP and accepts WebSocket upgrades on the same port', async () => {
    const res = await httpGet(port, '/index.html');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'text/html; charset=utf-8');

    const ws = await connect(port);
    assert.strictEqual(ws.readyState, WebSocket.OPEN);
    ws.close();
  });

  it('does not break the static file server it is attached to', async () => {
    const notFound = await httpGet(port, '/nope.html');
    assert.strictEqual(notFound.statusCode, 404);
    const forbidden = await httpGet(port, '/../package.json');
    assert.ok([403, 404].includes(forbidden.statusCode));
  });

  it('routes a valid C2S message to onMessage and delivers the reply', async () => {
    const ws = await connect(port);
    ws.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'AB23' }));
    const reply = await nextMessage(ws);

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].type, 'JOIN_ROOM');
    assert.strictEqual(reply.type, 'ROOM_STATE');
    ws.close();
  });

  it('rejects malformed JSON without dropping the connection', async () => {
    const ws = await connect(port);
    ws.send('{not json');
    const reply = await nextMessage(ws);

    assert.strictEqual(reply.type, 'ERROR');
    assert.strictEqual(reply.code, 'BAD_MESSAGE');
    assert.strictEqual(ws.readyState, WebSocket.OPEN);
    assert.strictEqual(received.length, 0);
    ws.close();
  });

  it('rejects a message that fails protocol validation', async () => {
    const ws = await connect(port);
    // JOIN_ROOM requires a 4-character code.
    ws.send(JSON.stringify({ type: 'JOIN_ROOM', code: 'TOOLONG' }));
    const reply = await nextMessage(ws);

    assert.strictEqual(reply.type, 'ERROR');
    assert.strictEqual(reply.code, 'BAD_MESSAGE');
    assert.strictEqual(received.length, 0);
    ws.close();
  });

  it('refuses a server-to-client type sent by a client', async () => {
    const ws = await connect(port);
    ws.send(JSON.stringify({ type: 'PLAYER_LEFT', slot: 1 }));
    const reply = await nextMessage(ws);

    assert.strictEqual(reply.type, 'ERROR');
    assert.strictEqual(reply.code, 'BAD_MESSAGE');
    assert.strictEqual(received.length, 0);
    ws.close();
  });

  it('refuses an oversized payload before parsing it', async () => {
    const ws = await connect(port);
    ws.send(JSON.stringify({ type: 'SET_PROFILE', name: 'x', colour: 'z'.repeat(MAX_PAYLOAD_BYTES) }));
    const reply = await nextMessage(ws);

    assert.strictEqual(reply.type, 'ERROR');
    assert.strictEqual(reply.message, 'Payload too large');
    assert.strictEqual(received.length, 0);
    ws.close();
  });

  it('unregisters a connection when it closes', async () => {
    const ws = await connect(port);
    assert.strictEqual(attached.clients.size, 1);

    await new Promise((resolve) => { ws.once('close', resolve); ws.close(); });
    // Allow the server side to observe the close.
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.strictEqual(attached.clients.size, 0);
  });

  it('broadcasts to several connections at once', async () => {
    const a = await connect(port);
    const b = await connect(port);
    await new Promise(resolve => setTimeout(resolve, 50));

    const inbox = [nextMessage(a), nextMessage(b)];
    attached.broadcast([...attached.clients.keys()], { type: 'TURN_SYNC', activeSlot: 1, turnNumber: 2 });
    const messages = await Promise.all(inbox);

    assert.deepStrictEqual(messages.map(m => m.type), ['TURN_SYNC', 'TURN_SYNC']);
    a.close();
    b.close();
  });
});
