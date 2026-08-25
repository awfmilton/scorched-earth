const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { C2S, ERRORS, validate } = require('./lib/protocol.js');

// A client frame larger than this is refused before it is parsed.
const MAX_PAYLOAD_BYTES = 4096;
// Ping every client on this cadence; a client that misses a whole cycle is half-open.
const HEARTBEAT_INTERVAL_MS = 30000;
// Sweep abandoned and stale rooms on this cadence.
const SWEEP_INTERVAL_MS = 30000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function createServer() {
  return http.createServer((req, res) => {
    const method = req.method;

    // Reject non-GET/HEAD with 405 Method Not Allowed
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    // Decode percent encoded characters first to catch any encoded dots/slashes
    let decodedUrl = req.url;
    try {
      decodedUrl = decodeURIComponent(req.url);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    // Check for directory traversal attempts
    if (decodedUrl.includes('..') || req.url.includes('..') || req.url.toLowerCase().includes('%2e%2e')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    // Parse URL and clean/normalize pathname
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let reqPath = parsedUrl.pathname;

    // Default to index.html for root or index.html requests
    if (reqPath === '/' || reqPath === '/index.html') {
      reqPath = '/index.html';
    }

    // Resolve absolute path and verify it doesn't escape __dirname
    const baseDir = path.resolve(__dirname);
    const targetPath = path.resolve(path.join(baseDir, reqPath));

    if (targetPath !== baseDir && !targetPath.startsWith(baseDir + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    // Check if the file exists and is a file
    fs.stat(targetPath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      // Determine Content-Type and Cache-Control
      const ext = path.extname(targetPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      const headers = {
        'Content-Type': contentType
      };

      if (ext === '.html') {
        headers['Cache-Control'] = 'no-cache';
      } else {
        headers['Cache-Control'] = 'public, max-age=3600';
      }

      res.writeHead(200, headers);

      if (method === 'HEAD') {
        res.end();
      } else {
        const stream = fs.createReadStream(targetPath);
        stream.on('error', () => {
          // In case of error during streaming
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
          }
        });
        stream.pipe(res);
      }
    });
  });
}

/**
 * Attach a WebSocket endpoint to an EXISTING http.Server so both protocols share
 * one port (the client in lib/net-client.js dials `ws://<location.host>` with no
 * path, so upgrades are accepted on any path rather than a fixed one).
 *
 * Room/game rules deliberately live outside this layer: pass an `onMessage`
 * handler to plug the RoomManager in without this file knowing the game.
 */
function attachWebSocketServer(httpServer, options = {}) {
  const {
    onMessage = null,
    onConnect = null,
    onDisconnect = null,
    maxPayloadBytes = MAX_PAYLOAD_BYTES,
    heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS
  } = options;

  const wss = new WebSocketServer({ server: httpServer });
  const clients = new Map(); // connectionId -> ws

  function send(connectionId, msg) {
    const ws = clients.get(connectionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  function broadcast(connectionIds, msg) {
    for (const id of connectionIds) send(id, msg);
  }

  function sendError(connectionId, code, message) {
    send(connectionId, { type: 'ERROR', code, message });
  }

  wss.on('connection', (ws) => {
    const connectionId = crypto.randomUUID();
    clients.set(connectionId, ws);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    let closed = false;
    function handleClose() {
      if (closed) return;
      closed = true;
      clients.delete(connectionId);
      if (onDisconnect) onDisconnect({ connectionId, send, broadcast });
    }
    ws.on('close', handleClose);
    // An errored socket never reliably emits 'close' first — clean up here too.
    ws.on('error', handleClose);

    ws.on('message', (raw, isBinary) => {
      if (isBinary) {
        sendError(connectionId, ERRORS.BAD_MESSAGE, 'Binary frames are not accepted');
        return;
      }

      // Size is checked on the raw bytes, before any parse work is done.
      if (raw.length > maxPayloadBytes) {
        sendError(connectionId, ERRORS.BAD_MESSAGE, 'Payload too large');
        return;
      }

      let msg;
      try {
        msg = JSON.parse(raw.toString('utf8'));
      } catch {
        sendError(connectionId, ERRORS.BAD_MESSAGE, 'Malformed JSON');
        return;
      }

      const result = validate(msg);
      if (!result.ok) {
        sendError(connectionId, ERRORS.BAD_MESSAGE, result.error);
        return;
      }

      // validate() also accepts server->client types; a client may only send C2S.
      if (!Object.values(C2S).includes(msg.type)) {
        sendError(connectionId, ERRORS.BAD_MESSAGE, `Not a client message type: ${msg.type}`);
        return;
      }

      if (onMessage) onMessage({ connectionId, msg, send, broadcast });
    });

    if (onConnect) onConnect({ connectionId, send, broadcast });
  });

  const heartbeat = setInterval(() => {
    for (const ws of clients.values()) {
      if (ws.isAlive === false) {
        ws.terminate(); // 'close' fires, which unregisters the connection
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, heartbeatIntervalMs);
  // Never hold the process (or a test run) open on the timer alone.
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  wss.on('close', () => clearInterval(heartbeat));

  return { wss, clients, send, broadcast, close: () => new Promise(resolve => wss.close(resolve)) };
}

function createRoomManagerHandlers(roomManager) {
  return {
    onMessage: ({ connectionId, msg, send, broadcast }) => {
      try {
        let result;
        switch (msg.type) {
          case C2S.CREATE_ROOM:
            result = roomManager.createRoom(connectionId, msg.isPublic, msg.mode);
            break;
          case C2S.LIST_ROOMS:
            result = roomManager.listRooms(connectionId);
            break;
          case C2S.JOIN_ROOM:
            result = roomManager.join(connectionId, msg.code);
            break;
          case C2S.SET_PROFILE:
            result = roomManager.setProfile(connectionId, { name: msg.name, colour: msg.colour, chassis: msg.chassis });
            break;
          case C2S.START_GAME:
            result = roomManager.start(connectionId, msg.config);
            break;
          case C2S.FIRE:
            result = roomManager.fire(connectionId, msg);
            break;
          case C2S.RESOLVE_SHOT:
            result = roomManager.resolveShot(connectionId, msg);
            break;
          case C2S.REJOIN:
            result = roomManager.rejoin(connectionId, msg);
            break;
          case C2S.SHOP_DONE:
            result = roomManager.shopDone(connectionId, msg);
            break;
          case C2S.ELIMINATED:
            result = roomManager.reportEliminated(connectionId, msg);
            break;
          case C2S.MOVE:
            result = roomManager.move(connectionId, msg);
            break;
          case C2S.TELEPORT:
            result = roomManager.teleport(connectionId);
            break;
          default:
            send(connectionId, {
              type: 'ERROR',
              code: ERRORS.BAD_MESSAGE,
              message: `Unsupported message type: ${msg.type}`
            });
            return;
        }

        if (result) {
          if (result.replies) {
            for (const reply of result.replies) {
              send(reply.to, reply.msg);
            }
          }
          if (result.broadcasts) {
            for (const b of result.broadcasts) {
              broadcast(b.to, b.msg);
            }
          }
        }
      } catch (err) {
        const code = err.code || ERRORS.BAD_MESSAGE;
        send(connectionId, {
          type: 'ERROR',
          code,
          message: err.message || 'Internal server error'
        });
      }
    },
    onDisconnect: ({ connectionId, send, broadcast }) => {
      const res = roomManager.disconnect(connectionId);
      if (res && res.broadcasts) {
        for (const b of res.broadcasts) {
          broadcast(b.to, b.msg);
        }
      }
    }
  };
}

if (require.main === module) {
  const RoomManager = require('./lib/room-manager.js');
  const roomManager = new RoomManager();
  const handlers = createRoomManagerHandlers(roomManager);

  const server = createServer();
  const { send, broadcast } = attachWebSocketServer(server, {
    onMessage: handlers.onMessage,
    onDisconnect: handlers.onDisconnect
  });

  const sweepTimer = setInterval(() => {
    try {
      const result = roomManager.sweep(Date.now());
      if (result) {
        if (result.replies) {
          for (const r of result.replies) {
            send(r.to, r.msg);
          }
        }
        if (result.broadcasts) {
          for (const b of result.broadcasts) {
            broadcast(b.to, b.msg);
          }
        }
      }
    } catch {
      // Catch socket errors during delivery so the interval keeps running
    }
  }, SWEEP_INTERVAL_MS);

  if (typeof sweepTimer.unref === 'function') {
    sweepTimer.unref();
  }

  const port = Number(process.env.PORT) || 8080;
  const host = '0.0.0.0';
  server.listen(port, host, () => {
    console.log(`Server listening on http://${host}:${port}`);
  });
}

module.exports = { createServer, attachWebSocketServer, MAX_PAYLOAD_BYTES, createRoomManagerHandlers };
