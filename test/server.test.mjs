import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../src/server.mjs';

let server, port;
before(async () => {
  server = createServer({ getSnapshot: () => ({ ok: true }), port: 0 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  // recria com a porta real para o allowlist de Host
  server.close();
  server = createServer({ getSnapshot: () => ({ ok: true }), port });
  await server.listenLocal();
});
after(() => server.close());

function req(method, p, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let body = ''; res.on('data', (c) => (body += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    r.on('error', reject); r.end();
  });
}

test('GET snapshot funciona com cabeçalhos de segurança', async () => {
  const r = await req('GET', '/api/snapshot');
  assert.equal(r.status, 200);
  assert.match(r.headers['content-security-policy'], /default-src 'none'/);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.headers['access-control-allow-origin'], undefined);
});
for (const m of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
  test(`${m} é recusado`, async () => assert.equal((await req(m, '/api/snapshot')).status, 405));
}
test('Host estranho é recusado (DNS rebinding)', async () => assert.equal((await req('GET', '/api/snapshot', { host: 'evil.example:80' })).status, 421));
test('Origin estranha é recusada', async () => assert.equal((await req('GET', '/api/snapshot', { origin: 'http://evil.example' })).status, 403));
test('path traversal não sai de public/', async () => {
  for (const p of ['/../src/config.mjs', '/%2e%2e/src/config.mjs', '/..%2fpackage.json', '/../config/local.json']) assert.equal((await req('GET', p)).status, 404, p);
});
test('servidor escuta só em 127.0.0.1', () => assert.equal(server.address().address, '127.0.0.1'));
