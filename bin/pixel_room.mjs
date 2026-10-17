#!/usr/bin/env node
// Ponto de entrada. Uso: node bin/pixel_room.mjs [--once]
import { makeRoots } from '../src/paths.mjs';
import { loadConfig } from '../src/config.mjs';
import { Collector } from '../src/collector.mjs';
import { buildSnapshot } from '../src/snapshot.mjs';
import { createServer } from '../src/server.mjs';

const cfg = loadConfig();
const roots = makeRoots();
const col = new Collector(roots, cfg);
const t0 = Date.now();
col.tick();
let snap = buildSnapshot(col, cfg);
console.log(`[pixel_room] leitura inicial em ${Date.now() - t0} ms: ${col.sessions.size} transcripts, ${col.subagents.size} subagentes, ${snap.rooms.length} salas`);

if (process.argv.includes('--once')) {
  console.log(JSON.stringify(snap, null, 2));
  process.exit(0);
}

const port = Number(process.env.PIXEL_ROOM_PORT) || cfg.port;
const server = createServer({ getSnapshot: () => snap, port });
await server.listenLocal();
console.log(`[pixel_room] painel em http://127.0.0.1:${port}/  (só localhost, só leitura)`);

let last = '';
setInterval(() => {
  try {
    col.tick();
    snap = buildSnapshot(col, cfg);
    const sig = JSON.stringify({ ...snap, generatedAt: 0 });
    if (sig !== last) { last = sig; server.broadcast(snap); }
  } catch (e) { console.error('[pixel_room] erro no ciclo:', e.message); }
}, 2000);
// heartbeat para o relógio da TV mesmo sem mudança
setInterval(() => server.broadcast(snap), 15000);
