const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

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

if (require.main === module) {
  const server = createServer();
  const port = Number(process.env.PORT) || 8080;
  const host = '0.0.0.0';
  server.listen(port, host, () => {
    console.log(`Server listening on http://${host}:${port}`);
  });
}

module.exports = { createServer };
