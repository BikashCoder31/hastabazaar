'use strict';

// Temporary hosting check. This is not the marketplace application.
// oxlint-disable-next-line typescript/no-require-imports -- This entry point is intentionally CommonJS for the target host.
const http = require('node:http');

let databasePool;

function getDatabasePool() {
  const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }

  if (!databasePool) {
    // oxlint-disable-next-line typescript/no-require-imports -- Lazy loading keeps the health-only preflight lightweight.
    const mysql = require('mysql2/promise');
    databasePool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      charset: 'utf8mb4',
      connectionLimit: 3,
      enableKeepAlive: true,
    });
  }
  return databasePool;
}

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Hatsabazaar — hosting setup</title>
<style>body{font:18px/1.6 system-ui,sans-serif;max-width:640px;margin:12vh auto;padding:24px;color:#17202a}h1{line-height:1.2}p{color:#414b57}</style>
</head><body><h1>Hatsabazaar hosting is connected.</h1>
<p>The Node.js application is responding. The marketplace is still being prepared and is not open for shopping.</p>
</body></html>`;

const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  const path = (request.url || '/').split('?')[0];
  if (path === '/health') {
    try {
      await getDatabasePool().query('SELECT 1');
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok', node: 'connected', database: 'connected', marketplaceReady: false }));
    } catch (error) {
      console.error('Database health check failed:', error);
      response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ status: 'error', node: 'connected', database: 'unavailable', marketplaceReady: false }));
    }
    return;
  }
  if (path !== '/') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : 'Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(request.method === 'HEAD' ? undefined : page);
});

server.listen(process.env.PORT || 3000);
module.exports = server;
