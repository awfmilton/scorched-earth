const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const protocol = require('./lib/protocol');
const { RoomManager } = require('./lib/room-manager');

function createServer() {
  const roomManager = new RoomManager();
  const clients = new Map(); // connectionId -> ws

  // Create HTTP server
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      const filePath = path.join(__dirname, 'index.html');
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Error loading index.html');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  // Attach WebSocketServer on the SAME server
  const wss = new WebSocketServer({ server });

  // Ship replies and broadcasts
  function ship(originId, result) {
    if (!result) return;
    const { replies, broadcasts } = result;

    if (replies && Array.isArray(replies)) {
      const originWs = clients.get(originId);
      if (originWs && originWs.readyState === WebSocket.OPEN) {
        for (const reply of replies) {
          originWs.send(JSON.stringify(reply));
        }
      }
    }

    if (broadcasts && Array.isArray(broadcasts)) {
      for (const b of broadcasts) {
        if (b.connectionId) {
          const targetWs = clients.get(b.connectionId);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify(b.message));
          }
        }
        if (b.connectionIds && Array.isArray(b.connectionIds)) {
          for (const cid of b.connectionIds) {
            const targetWs = clients.get(cid);
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(JSON.stringify(b.message));
            }
          }
        }
      }
    }
  }

  wss.on('connection', (ws) => {
    const connectionId = crypto.randomUUID ? crypto.randomUUID() : `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    clients.set(connectionId, ws);

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    let disconnected = false;
    function handleDisconnect() {
      if (disconnected) return;
      disconnected = true;
      clients.delete(connectionId);
      const result = roomManager.disconnect(connectionId);
      if (result) {
        ship(connectionId, result);
      }
    }

    ws.on('close', handleDisconnect);
    ws.on('error', handleDisconnect);

    ws.on('message', (rawData) => {
      // 1. Reject payloads over 4 KB
      const byteLen = Buffer.isBuffer(rawData) ? rawData.length : Buffer.byteLength(rawData);
      if (byteLen > 4096) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Payload too large' }));
        return;
      }

      // Convert rawData to string for JSON parsing
      let payloadStr = '';
      if (Buffer.isBuffer(rawData)) {
        payloadStr = rawData.toString('utf8');
      } else {
        payloadStr = rawData;
      }

      // 2. Parse JSON safely
      let msg;
      try {
        msg = JSON.parse(payloadStr);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Malformed JSON' }));
        return;
      }

      // 3. Validate message using protocol.validate
      try {
        protocol.validate(msg);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'ERROR', message: err.message || 'Validation failed' }));
        return;
      }

      // 4. Route validated message to the matching RoomManager method
      const methodMap = {
        'CREATE_ROOM': 'createRoom',
        'JOIN_ROOM': 'joinRoom'
      };
      const methodName = methodMap[msg.type] || msg.type.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());

      if (typeof roomManager[methodName] !== 'function') {
        ws.send(JSON.stringify({ type: 'ERROR', message: `Unhandled method: ${methodName}` }));
        return;
      }

      const result = roomManager[methodName](connectionId, msg);
      ship(connectionId, result);
    });
  });

  // Heartbeat: 30s interval to ping and detect half-open connections
  const heartbeatInterval = setInterval(() => {
    for (const [connectionId, ws] of clients.entries()) {
      if (ws.isAlive === false) {
        ws.terminate();
        clients.delete(connectionId);
        // Clean up from room manager
        const result = roomManager.disconnect(connectionId);
        if (result) {
          ship(connectionId, result);
        }
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);

  // Room reaper: call roomManager.sweep(Date.now()) on an interval
  const sweepInterval = setInterval(() => {
    const result = roomManager.sweep(Date.now());
    if (result) {
      ship(null, result);
    }
  }, 10000);

  // Clear both intervals on server close so the test process exits
  server.on('close', () => {
    clearInterval(heartbeatInterval);
    clearInterval(sweepInterval);
    wss.close();
  });

  return server;
}

module.exports = { createServer };
