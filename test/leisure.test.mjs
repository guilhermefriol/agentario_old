import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planBuilding, toDoorPath } from '../public/building.js';
import { LEISURE, teto, pickVisitors, reserve, release, walkIdx, exitPlan, replanAction, insidePath, corridorBetween } from '../public/leisure.js';

// o motor só usa o DOM para canvas; para testar o comportamento basta um document mínimo
globalThis.document = { createElement: () => ({ getContext: () => null }) };
const { Office } = await import('../public/office.js');

const project = (id, n, st = 'idle') => ({ id, name: id, kind: 'project', lit: false, auditor: null,
  staff: Array.from({ length: n }, (_, i) => ({ name: `${id}-dev${i}`, state: st })), sessions: [], interns: [] });
const lobby = { id: 'cc', name: 'Centro', kind: 'lobby', staff: [], sessions: [], interns: [] };
const ROOMS = [project('Alfa', 6), project('Beta', 3), project('Gama', 9), project('Delta', 1), project('Eps', 4)];
const plan = () => planBuilding([lobby, ...ROOMS], new Map());
const inside = (r, p) => p.x > r.ox && p.x < r.ox + r.W && p.y > r.oy && p.y < r.oy + r.H;

test('as 5 salas de lazer existem, não se sobrepõem e têm rota até o centro', () => {
  const P = plan();
  assert.deepEqual(P.leisure.map((l) => l.room.id).sort(), LEISURE.map((l) => l.id).sort());
  const all = [...P.rooms, ...P.leisure];
  for (const a of all) for (const b of all) {
    if (a === b) continue;
    const overlap = a.cx < b.cx + b.sx && b.cx < a.cx + a.sx && a.cy < b.cy + b.sy && b.cy < a.cy + a.sy;
    assert.ok(!overlap, `${a.room.name} x ${b.room.name}`);
  }
  for (const lz of P.leisure) {
    assert.ok(lz.spots.length > 0);
    const end = lz.route[lz.route.length - 1];
    assert.ok(Math.hypot(end.x - P.cc.doorOut.x, end.y - P.cc.doorOut.y) < 0.01, lz.room.name);
  }
  assert.ok(!P.rooms.some((r) => r.leisure), 'lazer não entra em plan.rooms');
  assert.deepEqual(JSON.stringify(plan().leisure.map((l) => [l.cx, l.cy])), JSON.stringify(P.leisure.map((l) => [l.cx, l.cy])), 'determinística');
});

test('rotas de ida só cruzam paredes pelas portas e não atravessam móveis', () => {
  const P = plan();
  const all = [...P.rooms, ...P.leisure];
  for (const lr of P.rooms.filter((r) => !r.cc)) {
    const d = lr.desks[0];
    const seat = { x: lr.ox + d.x + 1.5, y: lr.oy + d.y + 1.45 };
    for (const lz of [...P.leisure, P.cc]) lz.spots.forEach((spot, si) => {
      const trail = [seat, ...toDoorPath(lr, seat), ...corridorBetween(lr.route, lz.route).slice(1), ...insidePath(lz, spot)];
      let prev; // região do ponto anterior, ao longo do rastro inteiro
      for (let n = 1; n < trail.length; n++) {
        const a = trail[n - 1], b = trail[n];
        const L = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(L / 0.1));
        for (let k = 0; k <= steps; k++) {
          const p = { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps };
          const where = all.find((r) => inside(r, p)) || null;
          const msg = `${lr.room.name} → ${lz.room.name}#${si} em (${p.x.toFixed(1)},${p.y.toFixed(1)})`;
          // o rastro termina na porta do centro antes de seguir; passar por ele só vale se for o destino
          assert.ok(!where || where === lr || where === lz, `entrou em outra sala: ${msg}`);
          if (prev !== undefined && prev !== where) {
            const r = where || prev; // mudou de região: tem que ser pela porta
            assert.ok(Math.abs(p.x - r.door.x) <= 0.9 && Math.abs(p.y - (r.oy + r.H)) < 0.3, `atravessou parede: ${msg}`);
          }
          if (where === lz) for (const pr of lz.props) {
            const hit = p.x > pr.x + 0.01 && p.x < pr.x + pr.w - 0.01 && p.y > pr.y + 0.01 && p.y < pr.y + pr.d - 0.01;
            assert.ok(!hit || pr.spots.includes(si), `atravessou móvel: ${msg}`);
          }
          prev = where;
        }
      }
    });
  }
});

test('pickVisitors: teto, capacidade e determinismo', () => {
  assert.equal(teto(0), 0); assert.equal(teto(1), 1); assert.equal(teto(2), 1); assert.equal(teto(3), 1); assert.equal(teto(10), 3);
  const keys = Array.from({ length: 40 }, (_, i) => 'a:R:dev' + i);
  const rooms = [{ id: 'x', spots: 2 }, { id: 'y', spots: 3 }];
  const m = pickVisitors(keys, 7, rooms);
  assert.equal(m.size, 5, 'limitado pela capacidade total');
  assert.ok([...m.values()].filter((v) => v === 'x').length <= 2);
  assert.deepEqual([...pickVisitors(keys, 7, rooms)], [...m]);
  const big = pickVisitors(keys, 7, [{ id: 'x', spots: 99 }]);
  assert.equal(big.size, teto(40));
  assert.equal(pickVisitors([], 1, rooms).size, 0);
});

test('reservas: nunca dois no mesmo lugar, liberação devolve o lugar', () => {
  const seats = new Map();
  const got = ['a', 'b', 'c'].map((k) => reserve(seats, 'x', 3, k));
  assert.equal(new Set(got).size, 3);
  assert.equal(reserve(seats, 'x', 3, 'd'), -1);
  assert.equal(reserve(seats, 'x', 3, 'a'), got[0], 'reserva repetida devolve o mesmo lugar');
  release(seats, 'b');
  assert.equal(reserve(seats, 'x', 3, 'd'), got[1]);
});

test('walkIdx: volta só por pontos já andados', () => {
  assert.deepEqual(walkIdx(0, 0, 4), [1, 2, 3, 4]);
  assert.deepEqual(walkIdx(3, 1, 0), [3, 2, 1, 0], 'indo entre 3 e 4: primeiro volta ao 3');
  assert.deepEqual(walkIdx(3, -1, 0), [2, 1, 0]);
  assert.deepEqual(walkIdx(3, 0, 0), [2, 1, 0]);
  assert.deepEqual(walkIdx(2, -1, 5), [2, 3, 4, 5]);
  assert.deepEqual(walkIdx(2, 0, 2), []);
});

test('remoção nas três fases e precedência da replanta', () => {
  const a = (at, dir) => ({ at, dir, homeOut: 5, lzOut: 12 });
  assert.deepEqual(exitPlan(a(2, 1)), { mode: 'walk', target: 5 }, 'na sala do projeto: sai pela porta dela');
  assert.deepEqual(exitPlan(a(5, -1)), { mode: 'walk', target: 5 });
  assert.deepEqual(exitPlan(a(8, 1)), { mode: 'fade' }, 'no corredor: some ali');
  assert.deepEqual(exitPlan(a(5, 1)), { mode: 'fade' });
  assert.deepEqual(exitPlan(a(14, 0)), { mode: 'walk', target: 12 }, 'no lazer: sai pela porta do lazer');
  assert.deepEqual(exitPlan(a(12, 1)), { mode: 'walk', target: 12 });
  assert.equal(replanAction(true, a(14, 0)), 'snapHome');
  assert.equal(replanAction(false, a(14, 0)), 'exitLz');
  assert.equal(replanAction(false, a(8, 1)), 'drop');
});

// ---------- motor completo, sem desenho ----------
function engine(rooms, now = 1e9) {
  const o = new Office();
  let clock = now, t = 0;
  o.now = () => clock;
  const snap = (rs) => ({ rooms: [lobby, ...rs], alerts: [] });
  o.sync(snap(rooms));
  return {
    o,
    sync: (rs) => o.sync(snap(rs)),
    run: (sec, check) => { for (let i = 0; i < sec * 30; i++) { t += 33; o.step(1 / 30, t); check?.(); } },
    jump: (ms) => { clock += ms; },
    away: () => [...o.entities.values()].filter((e) => e.away),
  };
}

test('motor: teto vale para todos fora da mesa, inclusive na troca de slot', () => {
  const E = engine(ROOMS);
  const cap = () => E.o.lzCap;
  const check = () => assert.ok(E.away().length <= cap(), `fora ${E.away().length} > teto ${cap()}`);
  E.run(40, check);
  assert.ok(E.away().length > 0, 'alguém saiu');
  assert.ok(E.away().some((e) => e.away.phase === 'lá'), 'alguém chegou');
  for (let s = 0; s < 6; s++) { E.jump(240_000); E.run(12, check); }
  // dois agentes nunca no mesmo lugar
  const used = E.away().filter((e) => e.away.phase !== 'voltando').map((e) => e.away.lz.room.id + '#' + e.away.spot);
  assert.equal(new Set(used).size, used.length);
});

test('motor: quem recebe trabalho volta para a mesa pelo próprio rastro', () => {
  const E = engine(ROOMS);
  E.run(40);
  const e = E.away().find((x) => x.away.phase === 'lá');
  assert.ok(e, 'precisa de alguém no lazer');
  const [room, name] = [e.lr.room.id, e.role];
  const rs = ROOMS.map((r) => r.id !== room ? r : { ...r, staff: r.staff.map((a) => a.name === name ? { ...a, state: 'working' } : a) });
  E.sync(rs);
  E.run(60);
  assert.equal(e.away, null, 'chegou de volta');
  assert.ok(Math.hypot(e.x - e.seat.x, e.y - e.seat.y) < 0.05, 'está na mesa');
});

test('motor: agente removido em cada fase sai e libera o lugar', () => {
  for (const phase of ['indo', 'lá']) {
    const E = engine(ROOMS);
    E.run(phase === 'lá' ? 40 : 1.5);
    const e = E.away().find((x) => x.away.phase === phase);
    assert.ok(e, `alguém ${phase}`);
    const key = e.key;
    const rs = ROOMS.map((r) => r.id !== e.lr.room.id ? r : { ...r, staff: r.staff.filter((a) => a.name !== e.role) });
    E.sync(rs);
    for (const m of E.o.lzSeats.values()) assert.ok(![...m.values()].includes(key), 'lugar liberado');
    E.run(60);
    assert.ok(!E.o.entities.has(key), `${phase}: entidade saiu`);
  }
});

test('motor: replanta com remoção do projeto e retorno de quem ficou', () => {
  const E = engine(ROOMS);
  E.run(40);
  const gone = E.away().find((x) => x.away.phase === 'lá');
  assert.ok(gone);
  const goneRoom = gone.lr.room.id;
  const stay = E.away().find((x) => x.lr.room.id !== goneRoom);
  E.sync(ROOMS.filter((r) => r.id !== goneRoom)); // projeto some → replanta
  assert.equal(E.o.lzSeats.size, 0, 'reservas recriadas');
  if (stay) assert.equal(stay.away, null, 'quem ficou volta direto para a mesa');
  assert.ok(gone.leaving, 'quem perdeu a sala está saindo');
  E.run(30);
  assert.ok(!E.o.entities.has(gone.key), 'saiu do prédio');
  for (const e of E.o.entities.values()) assert.ok(!e.away || e.away.lz === E.o.destinations.find((l) => l.room.id === e.away.lz.room.id), 'sem referência a sala antiga');
});

// ---------- v5: centro de comando com o Friol ----------
test('centro de comando 1×1 com mesa, lugares de visita e de pé sem sobreposição', () => {
  const P = plan();
  assert.equal(P.cc.sx, 1); assert.equal(P.cc.sy, 1);
  assert.equal(P.cc.desks.length, 0);
  assert.equal(P.cc.spots.length, 4);
  const pts = [...P.cc.spots, ...P.cc.standSpots, P.cc.godSeat];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
    assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) > 0.8, `lugares ${i} e ${j} colados`);
  for (const p of P.cc.standSpots) {
    assert.ok(inside(P.cc, p));
    assert.ok(!(Math.abs(p.x - P.cc.door.x) < 0.9 && p.y > P.cc.aisle - 0.3), 'lugar de pé na porta');
    for (const v of P.cc.spots) assert.ok(Math.abs(p.x - v.lane) > 0.8 || p.y > v.y + 3.5, 'lugar de pé na faixa de visita');
    for (const pr of P.cc.props) assert.ok(!(p.x > pr.x && p.x < pr.x + pr.w && p.y > pr.y && p.y < pr.y + pr.d), 'lugar de pé dentro de móvel');
  }
});

test('motor: Friol fica na mesa e visitas ao centro duram pouco e voltam', () => {
  const E = engine(ROOMS);
  const god = E.o.entities.get('god');
  assert.ok(god && god.name === 'Friol');
  const stay = new Map();
  let sawVisit = false;
  for (let s = 0; s < 8; s++) {
    E.jump(240_000);
    E.run(25, () => {
      for (const e of E.away()) if (e.away.lz.cc && e.away.phase === 'lá') { sawVisit = true; stay.set(e.key, (stay.get(e.key) || 0) + 1 / 30); }
    });
  }
  assert.ok(sawVisit, 'alguém visitou o Friol');
  for (const [k, sec] of stay) assert.ok(sec <= 26 * 2, `${k} ficou ${sec.toFixed(1)}s`); // até 2 visitas em slots diferentes
  assert.ok(Math.hypot(god.x - god.seat.x, god.y - god.seat.y) < 0.05, 'Friol não sai da mesa');
  assert.ok(!god.away);
  const codex = E.o.entities.get('c:home');
  assert.ok(codex && !codex.desk, 'Codex de plantão fica de pé');
});

import { demoSnapshot } from '../public/demo.js';
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const REAL = () => ({ rooms: [lobby, ...ROOMS, project('Vazia', 0)].map((r) => ({ ...r, sessions: r.id === 'Alfa' ? [{ key: 'real1', state: 'free', activity: 'livre' }] : [] })), alerts: [{ type: 'asking', roomId: 'Alfa' }], totals: { sessions: 1 } });

test('demoSnapshot: não altera a entrada, mantém ids/nomes e acende tudo', () => {
  const real = deepFreeze(REAL());
  const before = JSON.stringify(real);
  const d = demoSnapshot(real, 1e12);
  assert.equal(JSON.stringify(real), before);
  assert.deepEqual(d.rooms.map((r) => r.id), real.rooms.map((r) => r.id));
  assert.deepEqual(d.rooms.map((r) => r.name), real.rooms.map((r) => r.name));
  // alertas: os reais de salas de projeto saem; só perguntas da cena (de sessões reais) entram
  for (const a of d.alerts) {
    const r = d.rooms.find((x) => x.id === a.roomId);
    if (r.kind === 'project') assert.ok(a.type === 'asking' && r.sessions.some((x) => x.key === a.session && x.state === 'asking' && !x.key.startsWith('demo:')));
  }
  // totais pela fórmula do snapshot.mjs, contados de novo aqui
  const all = d.rooms.flatMap((r) => r.sessions);
  assert.equal(d.totals.sessions, all.length);
  assert.equal(d.totals.working, all.filter((x) => x.state === 'working').length);
  assert.equal(d.totals.waitingYou, all.filter((x) => x.state === 'asking' || x.state === 'waiting').length);
  assert.equal(d.totals.interns, d.rooms.reduce((n, r) => n + r.interns.length + r.staff.filter((a) => a.state === 'working').length, 0));
  assert.equal(d.totals.roomsLit, d.rooms.filter((r) => r.kind === 'project').length);
  assert.equal(d.totals.rooms, d.totals.roomsLit);
  for (const r of d.rooms.filter((x) => x.kind === 'project')) {
    assert.equal(r.lit, true);
    assert.ok(r.sessions.some((s) => s.key.startsWith('demo:') && s.state === 'working'), `${r.id} tem trabalho garantido`);
    for (const a of r.staff) assert.deepEqual(Object.keys(a).sort(), ['activity', 'name', 'state']);
  }
  assert.ok(d.rooms.find((r) => r.id === 'Vazia').interns.every((i) => i.key.startsWith('demo:')));
  assert.equal(d.rooms.filter((r) => r.auditor?.state === 'auditando').length >= 1, true);
});

test('demoSnapshot: determinístico na janela, muda entre janelas, ocupação estável', () => {
  const real = REAL();
  assert.deepEqual(demoSnapshot(real, 1e12), demoSnapshot(real, 1e12));
  // atividades são da janela de 20 s (estados de agentes têm ciclo próprio de 60–120 s)
  const acts = (d) => JSON.stringify(d.rooms.map((r) => r.sessions.map((s) => s.activity)));
  assert.equal(acts(demoSnapshot(real, 1e12)), acts(demoSnapshot(real, 1e12 + 5000)));
  const sig = (d) => JSON.stringify(d.rooms.map((r) => [r.staff.map((a) => a.activity), r.sessions.map((s) => s.activity)]));
  const counts = (d) => JSON.stringify(d.rooms.map((r) => [r.staff.length, r.sessions.length, r.interns.length]));
  let changed = false;
  for (let k = 1; k < 6; k++) {
    const d = demoSnapshot(real, 1e12 + k * 20_000);
    if (sig(d) !== sig(demoSnapshot(real, 1e12))) changed = true;
    assert.equal(counts(d), counts(demoSnapshot(real, 1e12)), 'quantidade de gente não muda com o tempo');
  }
  assert.ok(changed);
});

test('motor: liga/desliga a demonstração 3× e volta à planta real, sem sobras', () => {
  const real = REAL();
  const o = new Office();
  let clock = 1e12, t = 0;
  o.now = () => clock;
  const run = (sec) => { for (let i = 0; i < sec * 30; i++) { t += 33; clock += 33; o.step(1 / 30, t); } };
  o.sync(real); run(2);
  const planOf = () => JSON.stringify([o.plan.C, o.plan.R, o.plan.rooms.map((r) => [r.room.id, r.cx, r.cy, r.sx, r.sy])]);
  const original = planOf();
  for (let k = 0; k < 3; k++) {
    o.setDemo(true); o.sync(demoSnapshot(real, clock)); run(30);
    assert.ok([...o.entities.keys()].some((x) => x.includes('demo:')), 'demo trouxe gente');
    o.setDemo(false); o.sync(real); run(90);
    assert.equal(planOf(), original, `planta real de volta (ciclo ${k + 1})`);
    assert.ok(![...o.entities.keys()].some((x) => x.includes('demo:')), 'nenhuma entidade demo sobrou');
  }
});

test('demoSnapshot: alertas de sala não transformada continuam; asking aparece quando sorteado', () => {
  const real = REAL();
  real.rooms[0] = { ...lobby, sessions: [{ key: 'lob1', state: 'waiting', activity: 'aguardando você' }] };
  real.alerts = [{ type: 'waiting', roomId: 'cc', room: 'Centro', session: 'lob1', text: 'x' }, { type: 'stuck', roomId: 'Alfa', room: 'Alfa', text: 'y' }];
  let sawAsk = false;
  for (let k = 0; k < 40; k++) {
    const d = demoSnapshot(real, 1e12 + k * 20_000);
    assert.ok(d.alerts.some((a) => a.roomId === 'cc' && a.type === 'waiting'), 'alerta do centro mantido');
    assert.ok(!d.alerts.some((a) => a.type === 'stuck'), 'alerta real de sala de projeto saiu');
    assert.equal(d.rooms[0].sessions[0].state, 'waiting', 'sessão do centro mantém estado real');
    if (d.alerts.some((a) => a.type === 'asking')) sawAsk = true;
    assert.ok(d.totals.waitingYou >= 1);
  }
  assert.ok(sawAsk, 'a cena às vezes tem pergunta');
});

test('demoSnapshot: veredito só muda quando uma auditoria da cena termina', () => {
  const real = REAL();
  let changes = 0;
  for (let k = 0; k < 30; k++) {
    const a = demoSnapshot(real, 1e12 + k * 20_000), b = demoSnapshot(real, 1e12 + (k + 1) * 20_000);
    for (const r of a.rooms.filter((x) => x.kind === 'project')) {
      const rb = b.rooms.find((x) => x.id === r.id);
      if (r.auditor?.state === 'livre' && rb.auditor?.state === 'livre' && r.auditor.verdictAt !== rb.auditor.verdictAt) changes++;
    }
  }
  assert.equal(changes, 0, 'veredito trocou sem auditoria no meio');
});
