const test = require('node:test');
const { describe, it, before, after } = test;
const assert = require('node:assert');
const http = require('http');
const WebSocket = require('ws');
const { createServer } = require('../server');

describe('Server Integration & WebSocket Tests', () => {
  let server;
  let port;
  const sockets = [];

  before(() => {
    return new Promise((resolve) => {
      server = createServer();
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  after(() => {
    return new Promise((resolve) => {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          try {
            ws.close();
          } catch (e) {}
        }
      }
      if (server) {
        server.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  });

  it('GET / returns 200 with a body containing <canvas', () => {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/`, (res) => {
        assert.strictEqual(res.statusCode, 200);
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          assert.ok(body.includes('<canvas'), 'Response body does not contain <canvas');
          resolve();
        });
      }).on('error', reject);
    });
  });

  it('Two real ws clients connect, CREATE_ROOM and JOIN_ROOM, and receive ROOM_STATE', () => {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://127.0.0.1:${port}`;
      const wsA = new WebSocket(wsUrl);
      const wsB = new WebSocket(wsUrl);
      sockets.push(wsA, wsB);

      let roomCode = null;
      let wsAState = null;
      let wsBState = null;

      const timeout = setTimeout(() => {
        reject(new Error('Test timed out'));
      }, 5000);

      function checkComplete() {
        if (wsAState && wsBState) {
          clearTimeout(timeout);
          try {
            assert.strictEqual(wsAState.players.length, 2);
            assert.strictEqual(wsBState.players.length, 2);
            assert.strictEqual(wsAState.players[0].playerName, 'Alice');
            assert.strictEqual(wsAState.players[1].playerName, 'Bob');
            assert.strictEqual(wsBState.players[0].playerName, 'Alice');
            assert.strictEqual(wsBState.players[1].playerName, 'Bob');
            resolve();
          } catch (err) {
            reject(err);
          }
        }
      }

      wsA.on('open', () => {
        wsA.send(JSON.stringify({
          type: 'CREATE_ROOM',
          playerName: 'Alice'
        }));
      });

      wsA.on('message', (rawData) => {
        try {
          const msg = JSON.parse(rawData);
          if (msg.type === 'ROOM_CREATED') {
            roomCode = msg.roomCode;
            assert.ok(roomCode, 'roomCode should be defined');

            // Trigger B to join
            if (wsB.readyState === WebSocket.OPEN) {
              wsB.send(JSON.stringify({
                type: 'JOIN_ROOM',
                roomCode: roomCode,
                playerName: 'Bob'
              }));
            } else {
              wsB.on('open', () => {
                wsB.send(JSON.stringify({
                  type: 'JOIN_ROOM',
                  roomCode: roomCode,
                  playerName: 'Bob'
                }));
              });
            }
          } else if (msg.type === 'ROOM_STATE') {
            wsAState = msg;
            checkComplete();
          }
        } catch (err) {
          reject(err);
        }
      });

      wsB.on('message', (rawData) => {
        try {
          const msg = JSON.parse(rawData);
          if (msg.type === 'ROOM_STATE') {
            wsBState = msg;
            checkComplete();
          }
        } catch (err) {
          reject(err);
        }
      });

      wsA.on('error', reject);
      wsB.on('error', reject);
    });
  });

  it('rejects malformed json and invalid messages with ERROR', () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      sockets.push(ws);

      const timeout = setTimeout(() => {
        reject(new Error('Test timed out'));
      }, 5000);

      ws.on('open', () => {
        ws.send('invalid { json');
      });

      ws.on('message', (rawData) => {
        clearTimeout(timeout);
        try {
          const msg = JSON.parse(rawData);
          assert.strictEqual(msg.type, 'ERROR');
          ws.close();
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      ws.on('error', reject);
    });
  });

  it('rejects payloads over 4 KB', () => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      sockets.push(ws);

      const timeout = setTimeout(() => {
        reject(new Error('Test timed out'));
      }, 5000);

      ws.on('open', () => {
        const hugePayload = 'A'.repeat(4097);
        ws.send(hugePayload);
      });

      ws.on('message', (rawData) => {
        clearTimeout(timeout);
        try {
          const msg = JSON.parse(rawData);
          assert.strictEqual(msg.type, 'ERROR');
          assert.ok(msg.message.includes('too large') || msg.message.includes('Payload too large'));
          ws.close();
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      ws.on('error', reject);
    });
  });
});
