// Servidor só-leitura: GET/HEAD, bind 127.0.0.1, Host/Origin estritos, sem CORS, sem cache.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const MAX_STREAMS = 8;

const SECURITY = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=()',
  'Cache-Control': 'no-store',
};

export function createServer({ getSnapshot, port, host = '127.0.0.1', publicDir = PUBLIC }) {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  const allowedOrigins = new Set([...allowedHosts].map((h) => `http://${h}`));
  const streams = new Set();

  const send = (res, code, body, type = 'text/plain; charset=utf-8', head = false) => {
    res.writeHead(code, { ...SECURITY, 'Content-Type': type });
    res.end(head ? undefined : body);
  };

  const server = http.createServer((req, res) => {
    if (!allowedHosts.has(String(req.headers.host || '').toLowerCase())) return send(res, 421, 'host não permitido');
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(String(origin).toLowerCase())) return send(res, 403, 'origem não permitida');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return send(res, 405, 'somente leitura');
    }
    const head = req.method === 'HEAD';
    let url;
    try { url = new URL(req.url, `http://${req.headers.host}`); } catch { return send(res, 400, 'url inválida'); }

    if (url.pathname === '/api/snapshot') return send(res, 200, JSON.stringify(getSnapshot()), 'application/json; charset=utf-8', head);

    if (url.pathname === '/api/stream') {
      if (head) return send(res, 200, '', 'text/event-stream', true);
      if (streams.size >= MAX_STREAMS) return send(res, 503, 'muitas conexões');
      res.writeHead(200, { ...SECURITY, 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive' });
      res.write(`retry: 3000\ndata: ${JSON.stringify(getSnapshot())}\n\n`);
      streams.add(res);
      req.on('close', () => streams.delete(res));
      return;
    }

    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.resolve(publicDir, '.' + rel);
    if (!file.startsWith(publicDir + path.sep)) return send(res, 404, 'não encontrado');
    const type = TYPES[path.extname(file)];
    if (!type) return send(res, 404, 'não encontrado');
    fs.readFile(file, (err, data) => (err ? send(res, 404, 'não encontrado') : send(res, 200, data, type, head)));
  });

  server.broadcast = (snap) => {
    const msg = `data: ${JSON.stringify(snap)}\n\n`;
    for (const s of streams) s.write(msg);
  };
  server.listenLocal = () => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server.address()));
  });
  return server;
}
