const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const http = require('node:http');
const WebSocket = require('ws');
const { createServer, attachWebSocketServer, createRoomManagerHandlers } = require('../server.js');
const RoomManager = require('../lib/room-manager.js');

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

describe('Server Integration with RoomManager', () => {
  it('passes all requirements of the RoomManager dispatch', async () => {
    const server = createServer();
    const roomManager = new RoomManager();
    const handlers = createRoomManagerHandlers(roomManager);

    const attached = attachWebSocketServer(server, {
      onMessage: handlers.onMessage,
      onDisconnect: handlers.onDisconnect
    });

    const port = await startServer(server);

    // 1. GET / returns 200 and the body contains <canvas
    const res = await httpGet(port, '/');
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.includes('<canvas'), 'index.html body should contain <canvas');

    // 2. Two real ws clients connect
    const clientA = await connect(port);
    const clientB = await connect(port);

    assert.strictEqual(clientA.readyState, WebSocket.OPEN);
    assert.strictEqual(clientB.readyState, WebSocket.OPEN);

    // 3. Client A sends CREATE_ROOM and receives a ROOM_STATE carrying a room code
    clientA.send(JSON.stringify({ type: 'CREATE_ROOM' }));
    const msgA1 = await nextMessage(clientA);
    assert.strictEqual(msgA1.type, 'ROOM_STATE');
    assert.strictEqual(msgA1.players.length, 1);
    assert.strictEqual(msgA1.players[0].slot, 0);
    assert.ok(msgA1.code && msgA1.code.length === 4, 'should have a 4-char room code');
    const roomCode = msgA1.code;

    // 4. Client B sends JOIN_ROOM with that code; both clients receive a ROOM_STATE listing two players
    clientB.send(JSON.stringify({ type: 'JOIN_ROOM', code: roomCode }));

    // Client B should get a reply
    const msgB1 = await nextMessage(clientB);
    assert.strictEqual(msgB1.type, 'ROOM_STATE');
    assert.strictEqual(msgB1.code, roomCode);
    assert.strictEqual(msgB1.players.length, 2);

    // Client A should get a broadcast (with no playerToken, since they are already in the room)
    const msgA2 = await nextMessage(clientA);
    assert.strictEqual(msgA2.type, 'ROOM_STATE');
    assert.strictEqual(msgA2.code, roomCode);
    assert.strictEqual(msgA2.players.length, 2);

    // Let's verify player names/slots
    assert.strictEqual(msgB1.players[0].slot, 0);
    assert.strictEqual(msgB1.players[1].slot, 1);

    // 5. A client sends FIRE and gets an ERROR frame back rather than a crash
    clientA.send(JSON.stringify({
      type: 'FIRE',
      angle: 45,
      power: 200,
      weapon: 'Baby Missile'
    }));

    const errorMsg = await nextMessage(clientA);
    assert.strictEqual(errorMsg.type, 'ERROR');
    assert.strictEqual(errorMsg.code, 'BAD_MESSAGE');

    // 6. Close every socket and the server in the teardown hook; the test process must exit with no hanging handle
    await new Promise((resolve) => {
      clientA.once('close', resolve);
      clientA.close();
    });

    await new Promise((resolve) => {
      clientB.once('close', resolve);
      clientB.close();
    });

    await attached.close();
    await new Promise(resolve => server.close(resolve));
  });
});
