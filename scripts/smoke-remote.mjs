import WebSocket from 'ws';

const DEFAULT_URL = 'https://scorched-earth.kodex.tbay.tk';
const TIMEOUT_MS = 15000;

async function run() {
  const rawUrl = process.argv[2] || DEFAULT_URL;
  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
  } catch (err) {
    console.error(`Invalid URL provided: "${rawUrl}" - ${err.message}`);
    process.exit(1);
  }

  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    console.error(`Invalid protocol "${targetUrl.protocol}". Must be http: or https:`);
    process.exit(1);
  }

  // 1. HTTP Probe
  const httpStart = performance.now();
  let res;
  try {
    res = await fetch(targetUrl.href, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const httpElapsed = Math.round(performance.now() - httpStart);
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      console.error(`HTTP check failed [Timeout]: Request timed out after ${httpElapsed}ms`);
    } else {
      const causeMsg = err.cause ? ` (${err.cause.message || err.cause.code || err.cause})` : '';
      console.error(`HTTP check failed [DNS/Network Failure]: ${err.message}${causeMsg}`);
    }
    process.exit(1);
  }

  const httpElapsed = Math.round(performance.now() - httpStart);

  if (res.status !== 200) {
    if (res.status === 404) {
      console.error(`HTTP check failed [404 Not Found]: Status ${res.status} [elapsed: ${httpElapsed}ms]`);
    } else {
      console.error(`HTTP check failed [Non-200 Status]: Status ${res.status} ${res.statusText} [elapsed: ${httpElapsed}ms]`);
    }
    process.exit(1);
  }

  const bodyBuffer = await res.arrayBuffer();
  const byteCount = bodyBuffer.byteLength;

  if (byteCount === 0) {
    console.error(`HTTP check failed [Empty Body]: Response body is 0 bytes [elapsed: ${httpElapsed}ms]`);
    process.exit(1);
  }

  console.log(`HTTP ${res.status} OK | ${byteCount} bytes | ${httpElapsed}ms`);

  // 2. WebSocket Probe
  const wsProtocol = targetUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${targetUrl.host}${targetUrl.pathname}${targetUrl.search}`;

  await new Promise((resolve) => {
    let settled = false;
    let ws;
    let timeoutTimer;

    function cleanup() {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (ws) {
        ws.removeAllListeners();
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }
    }

    function fail(msg) {
      if (settled) return;
      settled = true;
      cleanup();
      console.error(`WebSocket check failed: ${msg}`);
      process.exit(1);
    }

    timeoutTimer = setTimeout(() => {
      fail(`Timeout after ${TIMEOUT_MS}ms (no response or connection stalled)`);
    }, TIMEOUT_MS);

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      fail(`Failed to initialize WebSocket: ${err.message}`);
      return;
    }

    ws.on('open', () => {
      try {
        ws.send(JSON.stringify({ type: 'CREATE_ROOM' }));
      } catch (err) {
        fail(`Failed to send CREATE_ROOM frame: ${err.message}`);
      }
    });

    ws.on('error', (err) => {
      fail(`Socket error - ${err.message || err}`);
    });

    ws.on('message', (data) => {
      if (settled) return;
      const msgStr = data.toString('utf8');
      let frame;
      try {
        frame = JSON.parse(msgStr);
      } catch (err) {
        fail(`Malformed JSON frame received: ${msgStr}`);
        return;
      }

      if (frame.type === 'ERROR') {
        fail(`Received ERROR frame from server: ${JSON.stringify(frame)}`);
        return;
      }

      if (frame.type !== 'ROOM_STATE') {
        fail(`Received unexpected frame type "${frame.type}", expected "ROOM_STATE": ${msgStr}`);
        return;
      }

      settled = true;
      console.log(`Received frame: ${msgStr}`);
      cleanup();
      resolve();
    });

    ws.on('close', (code, reason) => {
      if (!settled) {
        fail(`WebSocket closed unexpectedly before receiving ROOM_STATE (code ${code}, reason: ${reason || 'none'})`);
      }
    });
  });

  process.exit(0);
}

run().catch((err) => {
  console.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
