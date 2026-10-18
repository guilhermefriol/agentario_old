import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Collector, P3, ZS, EPS, parseFill, orbit, spinAz, groundAxes, AZ0, EL0, AZ_MIN, AZ_MAX, SPIN } from '../public/geo3d.js';

// o motor só usa o DOM para canvas; para as rotinas de desenho no coletor basta um document mínimo
globalThis.document = { createElement: () => ({ getContext: () => null }) };
const { Office } = await import('../public/office.js');

const verts = (B) => Array.from({ length: B.n }, (_, i) => ({
  x: B.pos[i * 3], h: B.pos[i * 3 + 1], y: B.pos[i * 3 + 2],
  c: [...B.col.subarray(i * 4, i * 4 + 4)], room: B.meta[i * 2] - 1, wall: B.meta[i * 2 + 1],
}));
const wallX = (c, x0, x1, y, z0, z1, fill) => c.poly3([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], fill);
const quadZ = (c, x0, y0, x1, y1, z, fill) => c.poly3([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], fill);

test('cores do 2D: hex, rgba e inválida', () => {
  assert.deepEqual(parseFill('#ff0000'), [1, 0, 0, 1]);
  assert.deepEqual(parseFill('rgba(0,0,0,0.22)'), [0, 0, 0, 0.22]);
  assert.deepEqual(parseFill('rgba(255, 181, 71, 0.5)').map((v) => +v.toFixed(3)), [1, 0.71, 0.278, 0.5]);
  assert.deepEqual(parseFill('nada'), [1, 0, 1, 1]); // magenta: fácil de ver se faltar uma cor
});

test('quadrilátero vira 2 triângulos; translúcido vai para a camada transparente', () => {
  const c = new Collector();
  quadZ(c, 0, 0, 2, 1, 5, '#102030');
  quadZ(c, 0, 0, 2, 1, 6, 'rgba(0,0,0,0.5)');
  assert.equal(c.op.n, 6);
  assert.equal(c.tr.n, 6);
  for (const v of verts(c.op)) assert.ok(Math.abs(v.h - 5 * ZS) < 1e-6);
});

test('decalque no mesmo plano da parede fica à frente (rumo à câmera); fora do trecho, não', () => {
  const c = new Collector();
  wallX(c, 0, 10, 4, 0, 9, '#333333');     // parede
  wallX(c, 1, 3, 4, 2, 7, '#eeeeee');      // quadro em cima dela
  wallX(c, 20, 22, 4, 2, 7, '#eeeeee');    // longe: não encosta em nada
  const V = verts(c.op);
  assert.ok(V.slice(0, 6).every((v) => Math.abs(v.y - 4) < 1e-6));
  assert.ok(V.slice(6, 12).every((v) => Math.abs(v.y - (4 + EPS)) < 1e-6));
  assert.ok(V.slice(12, 18).every((v) => Math.abs(v.y - 4) < 1e-6));
});

test('o coletor dinâmico continua as camadas do estático', () => {
  const s = new Collector(), d = new Collector();
  wallX(s, 0, 10, 4, 0, 9, '#333333');
  d.reset(s.layers);
  wallX(d, 1, 3, 4, 2, 7, '#eeeeee');
  assert.ok(verts(d.op).every((v) => Math.abs(v.y - (4 + EPS)) < 1e-6));
});

test('laje (1º polígono) fica por baixo; decalques rentes ao chão sobem na ordem do 2D', () => {
  const c = new Collector();
  quadZ(c, 0, 0, 50, 50, 0, '#262b45');  // laje
  quadZ(c, 3, 3, 15, 13, 0, '#c79a6b');  // piso da sala
  quadZ(c, 4, 12, 6, 13.3, 0.03, '#141726'); // tapete da porta
  const V = verts(c.op);
  assert.ok(V[0].h < 0);
  assert.equal(V[6].h, 0);
  assert.ok(V[12].h > V[6].h);
});

test('só paredes altas do fundo/lado esquerdo da sala são marcadas (rebaixáveis)', () => {
  const c = new Collector();
  c.room = 3; c.lr = { ox: 10, oy: 20, W: 12, H: 10 };
  wallX(c, 10, 22, 20, 0, 9, '#5b6aa8');          // parede do fundo
  wallX(c, 12, 15, 25, 0, 9, '#a77a52');          // móvel no meio da sala
  wallX(c, 10, 22, 30, 0, 2.5, '#5b6aa8');        // rodapé da frente
  const V = verts(c.op);
  assert.deepEqual([V[0].wall, V[6].wall, V[12].wall], [1, 0, 0]);
  assert.ok(V.every((v) => v.room === 3));
});

test('câmera orbital: quadrante +x +y, distância preservada, giro dentro dos limites', () => {
  const [X, Y, Z] = orbit(10, 20, 100, AZ0, EL0);
  assert.ok(X > 10 && Z > 20 && Y > 0);
  assert.ok(Math.abs(Math.hypot(X - 10, Y, Z - 20) - 100) < 1e-9);
  assert.equal(spinAz(AZ0, 12345, false), AZ0);
  for (let t = 0; t < 130_000; t += 997) {
    const a = spinAz(AZ_MIN + 0.01, t, true);
    assert.ok(a >= AZ_MIN && a <= AZ_MAX);
    assert.ok(Math.abs(spinAz(AZ0, t, true) - AZ0) <= SPIN + 1e-9);
  }
  const { right, away } = groundAxes(AZ0);
  assert.ok(Math.abs(right[0] * away[0] + right[1] * away[1]) < 1e-9);
});

test('rotinas de desenho do office.js passam pelo coletor sem cor desconhecida nem coordenada inválida', () => {
  const project = (id, n, lit = false) => ({ id, name: id, kind: 'project', lit, auditor: null,
    staff: Array.from({ length: n }, (_, i) => ({ name: `${id}-dev${i}`, state: lit ? 'working' : 'idle', activity: 'editando' })), sessions: [], interns: [] });
  const lobby = { id: 'cc', name: 'Centro', kind: 'lobby', staff: [], sessions: [], interns: [] };
  const o = new Office();
  o.sync({ rooms: [lobby, project('Alfa', 6, true), project('Beta', 0), project('Gama', 0), project('Delta', 3)], alerts: [{ roomId: 'Alfa' }] });
  o.step(0.5, 1000);
  const c = new Collector();
  for (const hour of [3, 12]) {
    c.reset();
    o.drawBase(c, P3, hour);
    for (const L of o.plan.lounges) o.drawLounge(c, P3, L);
    [...o.plan.rooms, ...o.plan.leisure].forEach((lr, i) => { c.room = i; c.lr = lr; o.drawRoomShell(c, P3, lr); if (lr.leisure) o.drawLeisureWalls(c, P3, lr); });
    const d = new Collector();
    d.reset(c.layers);
    const items = o.sceneItems(d, P3, 1000);
    assert.ok(items.some((it) => it.char) && items.some((it) => it.lr));
    for (const it of items) if (!it.char) { d.lr = it.lr || null; it.f(); }
    for (const B of [c.op, c.tr, d.op, d.tr]) for (const v of verts(B)) {
      assert.ok([v.x, v.h, v.y].every(Number.isFinite));
      assert.notDeepEqual(v.c, [1, 0, 1, 1], 'cor que o coletor não entendeu');
    }
    assert.ok(c.op.n > 1000 && d.op.n > 100);
  }
});

test('charPose devolve quadro conhecido para todo mundo no prédio', () => {
  const o = new Office();
  const lobby = { id: 'cc', name: 'Centro', kind: 'lobby', staff: [], sessions: [], interns: [] };
  o.sync({ rooms: [lobby, { id: 'A', name: 'A', kind: 'project', lit: true, auditor: null, staff: [{ name: 'dev', state: 'working', activity: 'lendo' }], sessions: [], interns: [] }], alerts: [] });
  for (const e of o.entities.values()) {
    const p = o.charPose(e, 5000);
    assert.ok(p.hide || typeof p.frame === 'string', e.key);
  }
});
