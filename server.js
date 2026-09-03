const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { C2S, ERRORS, validate } = require('./lib/protocol.js');

// A client frame larger than this is refused before it is parsed.
const MAX_PAYLOAD_BYTES = 4096;
// Flood control, per connection: a rolling window with a message budget,
// plus a much tighter budget for JOIN_ROOM so 4-letter room codes cannot be
// brute-forced through one socket. The general budget is sized for the
// chattiest HONEST client — a held drive key at keyboard repeat rate is
// ~30 MOVE/s (~300 per window) before the client-side throttle — with
// headroom for the turn's FIRE/RESOLVE_SHOT/ELIMINATED singletons, which
// must never be starved: a dropped RESOLVE_SHOT is never retried and
// stalls the whole room until the sweep timeout.
const RATE_WINDOW_MS = 10000;
const MAX_MESSAGES_PER_WINDOW = 400;
const MAX_JOINS_PER_WINDOW = 8;
// Chatty broadcast-triggering types get their own per-socket sub-budget:
// one 45-byte SET_PROFILE fans out a full ROOM_STATE to every seat (~61x
// amplification measured), so it must not ride the general MOVE budget.
const MAX_PROFILE_PER_WINDOW = 20;
const MAX_LIST_PER_WINDOW = 30;
// Per-IP accounting. Sockets are free to mint, so every budget that must
// survive a reconnect — join guesses, room creation, aggregate volume,
// concurrent connections — is keyed by source address. Behind the live
// host's reverse proxy the address arrives in X-Forwarded-For; bare
// deployments fall back to the socket peer.
const IP_WINDOW_MS = 10 * 60 * 1000;
// 32, not 8: schools, offices and CGNAT put whole populations behind one
// address, and a household's simultaneous reconnect transiently doubles its
// seat count. Still bounds an attacker's CONCURRENT sockets hard.
const MAX_CONNECTIONS_PER_IP = 32;
const MAX_JOINS_PER_IP_WINDOW = 30;
const MAX_CREATES_PER_IP_WINDOW = 10;
const MAX_REJOINS_PER_IP_WINDOW = 60;
const MAX_MESSAGES_PER_IP_WINDOW = 20000;
// X-Forwarded-For is only meaningful behind a proxy that OVERWRITES or
// appends to it; on a bare deployment the client authors it freely and one
// header would bypass every per-IP budget. Trust it only when the operator
// says so (the live host sits behind one and sets this in its Dockerfile),
// and then take the RIGHTMOST entry — the hop our proxy appended — never
// the client-authored head of the list.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
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

// Only the files the game client actually loads are served. The resolver
// used to serve ANY file under the repo root — .git/, .claude/, docs,
// salvage files — to anyone who asked for it by name; on the live host that
// meant the whole repository was publicly downloadable. The traversal
// checks below still run, but the allowlist is the real gate.
const STATIC_ALLOWLIST = /^\/(index\.html|favicon\.ico|lib\/[\w-]+\.js|gfx\/[\w-]+\.js)$/;

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

    // Parse only the request path against a fixed base. The Host header is
    // attacker-controlled and `new URL` throws on malformed values
    // (`Host: foo bar` is accepted by Node's parser), which used to escape
    // this handler as an uncaught exception and kill the whole process.
    let parsedUrl;
    try {
      parsedUrl = new URL(req.url, 'http://localhost');
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }
    let reqPath = parsedUrl.pathname;

    // Default to index.html for root or index.html requests
    if (reqPath === '/' || reqPath === '/index.html') {
      reqPath = '/index.html';
    }

    if (!STATIC_ALLOWLIST.test(reqPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
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

  // Hard cap at the protocol layer: ws refuses to buffer a frame larger
  // than this (1009 close) instead of allocating it, so a hostile 100MiB
  // frame never reaches memory. Kept well above maxPayloadBytes so the
  // polite in-band error below still answers merely-oversized frames.
  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: 64 * 1024,
    // Refuse over-cap addresses at the UPGRADE, not after the handshake:
    // a post-101 refusal fired the browser's `open` first (resetting its
    // reconnect backoff into a 1 Hz hammer) and constructed a WebSocket
    // with no error listener yet — one aborted close crashed the process.
    verifyClient: (info, done) => {
      const now = Date.now();
      const st = ipStatsFor(ipOf(info.req), now);
      if (st.conns >= MAX_CONNECTIONS_PER_IP) {
        done(false, 503, 'Too many connections');
        return;
      }
      done(true);
    }
  });
  const clients = new Map(); // connectionId -> ws

  // ip -> { windowStart, msgs, joins, creates, conns }. Pruned on the
  // heartbeat cadence once the last socket is gone and the window lapsed.
  const ipStats = new Map();
  function ipOf(req) {
    if (TRUST_PROXY) {
      const fwd = req && req.headers && req.headers['x-forwarded-for'];
      if (typeof fwd === 'string' && fwd.length) {
        const parts = fwd.split(',');
        return parts[parts.length - 1].trim().slice(0, 64);
      }
    }
    return (req && req.socket && req.socket.remoteAddress) || 'unknown';
  }
  function ipStatsFor(ip, now) {
    let st = ipStats.get(ip);
    if (!st) {
      st = { windowStart: now, msgs: 0, joins: 0, creates: 0, conns: 0 };
      ipStats.set(ip, st);
    }
    if (now - st.windowStart > IP_WINDOW_MS) {
      st.windowStart = now;
      st.msgs = 0;
      st.joins = 0;
      st.creates = 0;
      st.rejoins = 0;
    }
    return st;
  }

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

  wss.on('connection', (ws, req) => {
    const ip = ipOf(req);
    const ipst = ipStatsFor(ip, Date.now());
    // Concurrent-socket ceiling per address: reconnecting resets every
    // per-SOCKET budget for free, so this is the bound that makes socket
    // minting cost something. verifyClient already refused over-cap
    // upgrades; this belt covers the race where several handshakes passed
    // the check together. The error listener MUST land before the close —
    // an aborted refusal used to raise an unhandled 'error' and kill the
    // whole process.
    if (ipst.conns >= MAX_CONNECTIONS_PER_IP) {
      ws.on('error', () => {});
      ws.close(1013, 'Too many connections');
      return;
    }
    ipst.conns++;
    ws.sourceIp = ip;

    const connectionId = crypto.randomUUID();
    clients.set(connectionId, ws);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    let closed = false;
    function handleClose() {
      if (closed) return;
      closed = true;
      const st = ipStats.get(ws.sourceIp);
      if (st && st.conns > 0) st.conns--;
      clients.delete(connectionId);
      if (onDisconnect) onDisconnect({ connectionId, send, broadcast });
    }
    ws.on('close', handleClose);
    // An errored socket never reliably emits 'close' first — clean up here too.
    ws.on('error', handleClose);

    // Flood control state, per socket. Reconnecting resets it, which is
    // fine: the cost of a reconnect (TCP + upgrade) already dwarfs the
    // budget it buys back.
    ws.rateWindowStart = 0;
    ws.rateCount = 0;
    ws.joinCount = 0;

    ws.on('message', (raw, isBinary) => {
      // Rolling-window flood control runs FIRST, so every inbound frame —
      // binary, oversize, or well-formed — spends budget. When binary and
      // oversize frames bypassed the counter, each one earned a 1:1 ERROR
      // reply forever: a free reflection/memory amplifier through a socket
      // that never reads. Past the cap everything is dropped in silence
      // after a single RATE_LIMITED notice.
      const now = Date.now();
      if (now - ws.rateWindowStart > RATE_WINDOW_MS) {
        ws.rateWindowStart = now;
        ws.rateCount = 0;
        ws.joinCount = 0;
        ws.profileCount = 0;
        ws.listCount = 0;
      }
      ws.rateCount++;
      if (ws.rateCount > MAX_MESSAGES_PER_WINDOW) {
        if (ws.rateCount === MAX_MESSAGES_PER_WINDOW + 1) {
          sendError(connectionId, ERRORS.RATE_LIMITED, 'Slow down');
        }
        return;
      }

      // Never reply into a socket that is not draining: an unread socket
      // turns every polite error into buffered server memory.
      const canReply = ws.bufferedAmount < 64 * 1024;

      // Aggregate per-IP volume, across every socket the address holds and
      // every reconnect it performs.
      const ipst2 = ipStatsFor(ws.sourceIp, now);
      ipst2.msgs++;
      if (ipst2.msgs > MAX_MESSAGES_PER_IP_WINDOW) {
        if (ipst2.msgs === MAX_MESSAGES_PER_IP_WINDOW + 1 && canReply) {
          sendError(connectionId, ERRORS.RATE_LIMITED, 'Address budget exhausted');
        }
        return;
      }

      if (isBinary) {
        if (canReply) sendError(connectionId, ERRORS.BAD_MESSAGE, 'Binary frames are not accepted');
        return;
      }

      // Size is checked on the raw bytes, before any parse work is done.
      if (raw.length > maxPayloadBytes) {
        if (canReply) sendError(connectionId, ERRORS.BAD_MESSAGE, 'Payload too large');
        return;
      }

      let msg;
      try {
        msg = JSON.parse(raw.toString('utf8'));
      } catch {
        // Every rejection reply below honours canReply: an attacker who
        // never reads their socket must not turn ANY error path — parse,
        // validate, wrong type, join budget — into buffered server memory.
        if (canReply) sendError(connectionId, ERRORS.BAD_MESSAGE, 'Malformed JSON');
        return;
      }

      const result = validate(msg);
      if (!result.ok) {
        if (canReply) sendError(connectionId, ERRORS.BAD_MESSAGE, result.error);
        return;
      }

      // validate() also accepts server->client types; a client may only send C2S.
      if (!Object.values(C2S).includes(msg.type)) {
        if (canReply) sendError(connectionId, ERRORS.BAD_MESSAGE, `Not a client message type: ${msg.type}`);
        return;
      }

      if (msg.type === C2S.JOIN_ROOM) {
        ws.joinCount++;
        ipst2.joins++;
        // The per-IP budget is the one that matters: the per-socket budget
        // resets free on reconnect, which made it decorative on its own.
        if (ws.joinCount > MAX_JOINS_PER_WINDOW || ipst2.joins > MAX_JOINS_PER_IP_WINDOW) {
          if (canReply) sendError(connectionId, ERRORS.RATE_LIMITED, 'Too many join attempts');
          return;
        }
      }

      if (msg.type === C2S.REJOIN) {
        ipst2.rejoins = (ipst2.rejoins || 0) + 1;
        if (ipst2.rejoins > MAX_REJOINS_PER_IP_WINDOW) {
          if (canReply) sendError(connectionId, ERRORS.RATE_LIMITED, 'Too many rejoin attempts');
          return;
        }
      }

      if (msg.type === C2S.CREATE_ROOM) {
        ipst2.creates++;
        if (ipst2.creates > MAX_CREATES_PER_IP_WINDOW) {
          if (canReply) sendError(connectionId, ERRORS.RATE_LIMITED, 'Too many rooms created');
          return;
        }
      }

      // Broadcast-triggering chatter gets its own sub-budget — see the
      // constants for the amplification numbers.
      if (msg.type === C2S.SET_PROFILE) {
        ws.profileCount = (ws.profileCount || 0) + 1;
        if (ws.profileCount > MAX_PROFILE_PER_WINDOW) {
          if (canReply) sendError(connectionId, ERRORS.RATE_LIMITED, 'Too many profile updates');
          return;
        }
      }
      if (msg.type === C2S.LIST_ROOMS) {
        ws.listCount = (ws.listCount || 0) + 1;
        if (ws.listCount > MAX_LIST_PER_WINDOW) {
          if (canReply) sendError(connectionId, ERRORS.RATE_LIMITED, 'Too many list requests');
          return;
        }
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
    // Drop idle address entries so the registry cannot grow without bound.
    const cutoff = Date.now() - IP_WINDOW_MS;
    for (const [ip, st] of ipStats) {
      if (st.conns <= 0 && st.windowStart < cutoff) ipStats.delete(ip);
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

module.exports = {
  createServer,
  attachWebSocketServer,
  MAX_PAYLOAD_BYTES,
  RATE_WINDOW_MS,
  MAX_MESSAGES_PER_WINDOW,
  MAX_JOINS_PER_WINDOW,
  MAX_PROFILE_PER_WINDOW,
  MAX_LIST_PER_WINDOW,
  IP_WINDOW_MS,
  MAX_CONNECTIONS_PER_IP,
  MAX_JOINS_PER_IP_WINDOW,
  MAX_CREATES_PER_IP_WINDOW,
  MAX_REJOINS_PER_IP_WINDOW,
  MAX_MESSAGES_PER_IP_WINDOW,
  createRoomManagerHandlers
};
