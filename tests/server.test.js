const test = require('node:test');
const { describe, it } = test;
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../server.js');

function request(port, pathStr, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: pathStr,
      ...options
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        res.body = data;
        resolve(res);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function startServer(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address().port);
    });
  });
}

function stopServer(server) {
  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}

describe('HTTP Server Tests', () => {

  it('createServer should export and create a server without listening automatically', () => {
    const server = createServer();
    assert.ok(server instanceof http.Server, 'Should return an http.Server instance');
    assert.strictEqual(server.listening, false, 'Server should not be listening initially');
  });

  it('Server should serve GET / and GET /index.html as text/html with no-cache', async () => {
    const server = createServer();
    const port = await startServer(server);
    try {
      const res1 = await request(port, '/');
      assert.strictEqual(res1.statusCode, 200);
      assert.strictEqual(res1.headers['content-type'], 'text/html; charset=utf-8');
      assert.strictEqual(res1.headers['cache-control'], 'no-cache');
      assert.ok(res1.body.toLowerCase().includes('<!doctype html>'));

      const res2 = await request(port, '/index.html');
      assert.strictEqual(res2.statusCode, 200);
      assert.strictEqual(res2.headers['content-type'], 'text/html; charset=utf-8');
      assert.strictEqual(res2.headers['cache-control'], 'no-cache');
    } finally {
      await stopServer(server);
    }
  });

  it('Server should reject non-GET/HEAD with 405 Method Not Allowed', async () => {
    const server = createServer();
    const port = await startServer(server);
    try {
      const res = await request(port, '/', { method: 'POST' });
      assert.strictEqual(res.statusCode, 405);
    } finally {
      await stopServer(server);
    }
  });

  it('Server should prevent directory traversal and return 403 Forbidden', async () => {
    const server = createServer();
    const port = await startServer(server);
    try {
      const res1 = await request(port, '/../package.json');
      assert.strictEqual(res1.statusCode, 403);

      const res2 = await request(port, '/%2e%2e/package.json');
      assert.strictEqual(res2.statusCode, 403);
    } finally {
      await stopServer(server);
    }
  });

  it('Server should serve files under lib/ directory with correct MIME type', async () => {
    const libDir = path.join(__dirname, '..', 'lib');
    // Probe filename must not collide with real sources: lib/room-code.js and
    // lib/terrain.js land in later chunks, and this test deletes what it writes.
    const jsFile = path.join(libDir, '__mime-probe.js');
    const createdLibDir = !fs.existsSync(libDir);
    if (createdLibDir) {
      fs.mkdirSync(libDir);
    }
    fs.writeFileSync(jsFile, '// mime probe\n');

    const server = createServer();
    const port = await startServer(server);
    try {
      const res = await request(port, '/lib/__mime-probe.js');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'text/javascript; charset=utf-8');
      assert.ok(res.headers['cache-control'].includes('max-age'));
    } finally {
      // Close the server first: a throwing cleanup step must never leak the
      // listening handle, or the test runner hangs until the CI timeout.
      await stopServer(server);
      fs.rmSync(jsFile, { force: true });
      if (createdLibDir) {
        // Only remove lib/ if this test created it, and tolerate other files.
        try { fs.rmdirSync(libDir); } catch { /* later chunks' sources live here */ }
      }
    }
  });

  it('Server should return 404 for non-existent path', async () => {
    const server = createServer();
    const port = await startServer(server);
    try {
      const res = await request(port, '/non-existent-file.xyz');
      assert.strictEqual(res.statusCode, 404);
    } finally {
      await stopServer(server);
    }
  });

});
