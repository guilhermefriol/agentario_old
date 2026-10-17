// Servidor do teste visual: o servidor de verdade (src/server.mjs, mesmo SSE), entregando sempre o
// snapshot fixo fictício de test/visual/snapshot.json. Nada de dados reais.
import fs from 'node:fs';
import { createServer } from '../../src/server.mjs';
const snap = JSON.parse(fs.readFileSync(new URL('./snapshot.json', import.meta.url), 'utf8'));
const server = createServer({ getSnapshot: () => snap, port: 4749 });
await server.listenLocal();
console.log('[visual] snapshot fixo em http://127.0.0.1:4749/');
