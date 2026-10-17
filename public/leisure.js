// Salas de lazer: catálogo fixo, móveis, lugares e as regras de quem sai para "matar o tempo".
// Módulo puro (sem DOM) para poder ser testado no node. Nenhum texto daqui vem do servidor.

export const SLOT_MS = 240_000; // a escolha de quem sai muda a cada 4 min
export const SHARE = 0.35; // no máximo 35% dos parados fora da mesa

export const LEISURE = [
  { id: 'lz:gym', name: 'Academia', kind: 'gym', span: [2, 1] },
  { id: 'lz:wc', name: 'Banheiros', kind: 'wc', span: [1, 1] },
  { id: 'lz:food', name: 'Refeitório', kind: 'food', span: [2, 1] },
  { id: 'lz:rest', name: 'Sala de descanso', kind: 'rest', span: [2, 1] },
  { id: 'lz:church', name: 'Igreja Adventista da I.A. dos Últimos Dias', kind: 'church', span: [3, 1], fullName: true },
];

export const LEISURE_THEMES = {
  gym: { a: '#3d4250', b: '#363a47', wall: '#c0563f', top: '#e07a5f', trim: '#8a3a28' },
  wc: { a: '#dfe8ec', b: '#c9d6dc', wall: '#5f9fb0', top: '#86c3d2', trim: '#3f7480' },
  food: { a: '#e3c99a', b: '#d6bb8a', wall: '#d08a3a', top: '#f0aa5a', trim: '#9a6226' },
  rest: { a: '#7d6aa8', b: '#735f9e', wall: '#4f7f6a', top: '#6fa38c', trim: '#355a4a' },
  church: { a: '#b8a68a', b: '#ab997c', wall: '#d9d2bf', top: '#f4efe2', trim: '#a39a80' },
};

// cores: [topo, frente, lado]
const WOOD = ['#a77a52', '#7d5838', '#694a30'];
const DARK = ['#4a4f63', '#33374a', '#2a2d3d'];
const METAL = ['#b9bfcc', '#8f95a8', '#767c90'];
const WHITE = ['#f4f1e4', '#d8d4c4', '#c4bfae'];

// Móveis (x, y locais; w, d, h; z0) e lugares. Cada lugar: posição, faixa de acesso `lane` (x livre de
// móveis entre o lugar e o corredor interno), pose e o que o agente está fazendo ali.
// `spots` num móvel = lugares que podem atravessar aquele móvel (o próprio assento).
function layoutOf(kind, W) {
  const P = [], S = [];
  const prop = (x, y, w, d, h, col, z0 = 0, spots = []) => P.push({ x, y, w, d, h, col, z0, spots });
  const spot = (x, y, pose, act, lane = x) => S.push({ x, y, lane, pose, act }) - 1;
  if (kind === 'gym') {
    for (const x of [3, 6.4, 9.8]) {
      const k = spot(x + 1.1, 3.2, 'run', 'correndo na esteira');
      prop(x, 1.2, 2.2, 3.2, 1.5, DARK, 0, [k]);
      prop(x + 0.2, 1.2, 1.8, 0.3, 8, METAL, 0, [k]);
    }
    prop(14, 0.6, 6, 1, 4, DARK);
    spot(15.4, 2.8, 'lift', 'puxando ferro');
    spot(18.4, 2.8, 'lift', 'fazendo bíceps');
    const b = spot(23.1, 3.2, 'sit', 'no supino');
    prop(22.5, 2.2, 1.2, 2.6, 3, ['#c0563f', '#8a3a28', '#6e2e20'], 0, [b]);
    prop(22.2, 1.4, 0.3, 0.3, 9, METAL, 0, [b]);
    prop(23.8, 1.4, 0.3, 0.3, 9, METAL, 0, [b]);
  } else if (kind === 'wc') {
    for (const x of [0.6, 3.9]) {
      const k = spot(x + 1.5, 1.4, 'hide', 'no banheiro');
      prop(x, 0.2, 0.25, 2.8, 10, WHITE, 0, [k]);
      prop(x + 2.95, 0.2, 0.25, 2.8, 10, WHITE, 0, [k]);
      prop(x + 0.25, 2.75, 2.7, 0.25, 10, ['#86c3d2', '#5f9fb0', '#3f7480'], 0, [k]); // porta da cabine
      prop(x + 1, 0.3, 1, 0.8, 3, WHITE, 0, [k]); // vaso
    }
    prop(7.8, 0.3, 3.8, 1.2, 6, WHITE);
    spot(8.8, 2.4, 'stand', 'lavando as mãos');
    spot(10.6, 2.4, 'stand', 'se olhando no espelho');
  } else if (kind === 'food') {
    prop(1, 0.4, 8, 1.4, 7, METAL);
    spot(3.4, 2.7, 'stand', 'pegando comida');
    spot(6.6, 2.7, 'stand', 'escolhendo a sobremesa');
    for (const x of [11, 15.6, 20.2]) {
      prop(x, 2.8, 3.6, 1.6, 6, WOOD);
      for (const dx of [0.9, 2.7]) {
        const k = spot(x + dx, 5.0, 'eat', dx < 2 ? 'almoçando' : 'tomando um café');
        prop(x + dx - 0.45, 5.35, 0.9, 0.35, 5, ['#c0563f', '#8a3a28', '#6e2e20'], 0, [k]);
      }
    }
    prop(W - 2, 0.5, 1.6, 1.4, 14, ['#e9e6d8', '#c9c6b8', '#a9a698']); // geladeira
  } else if (kind === 'rest') {
    const sofa = [];
    for (const x of [3.6, 5.6, 7.6]) sofa.push(spot(x, 2.4, 'sit', 'vendo TV'));
    prop(2.4, 1.0, 6.6, 1.8, 3, ['#6a9fd0', '#4f7fb0', '#3d6590'], 0, sofa);
    prop(2.4, 0.8, 6.6, 0.4, 7, ['#6a9fd0', '#4f7fb0', '#3d6590'], 0, sofa);
    prop(10.6, 0.8, 2.6, 0.9, 5, WOOD);
    for (const x of [15, 17.6]) {
      prop(x, 0.6, 1.8, 1.4, 13, ['#a98bff', '#6a4fc0', '#523a9a']);
      spot(x + 0.9, 2.7, 'play', 'jogando fliperama');
    }
    for (const x of [21.4, 24.2]) {
      const k = spot(x + 0.6, 3.6, 'sleep', 'cochilando no pufe');
      prop(x, 3.0, 1.4, 1.2, 2.5, ['#ffb547', '#d08a3a', '#b0702a'], 0, [k]);
    }
  } else if (kind === 'church') {
    // igreja de 3 células: altar no centro, bancos dos dois lados do corredor central
    const c = W / 2, AISLE = c;
    prop(c - 2.3, 0.6, 4.6, 1.4, 6, WHITE); // altar
    for (const y of [3.4, 5.6]) {
      for (const [x0, x1, seats] of [[c - 13.5, c - 3.1, [c - 4.1, c - 6.1, c - 8.1]], [c + 3.1, c + 13.5, [c + 4.1, c + 6.1, c + 8.1]]]) {
        const ks = seats.map((x, i) => spot(x, y + 0.3, 'pray', i ? 'em silêncio' : 'rezando', AISLE));
        prop(x0, y, x1 - x0, 0.9, 3.5, WOOD, 0, ks);
        prop(x0, y + 0.9, x1 - x0, 0.25, 6, WOOD, 0, ks);
      }
    }
  }
  return { props: P, spots: S };
}

// Converte o layout local em coordenadas do prédio e acrescenta o corredor interno.
export function leisureLayout(lr, kind) {
  const { props, spots } = layoutOf(kind, lr.W);
  return {
    aisle: lr.oy + lr.H - 1.1,
    props: props.map((p) => ({ ...p, x: lr.ox + p.x, y: lr.oy + p.y })),
    spots: spots.map((s) => ({ ...s, x: lr.ox + s.x, y: lr.oy + s.y, lane: lr.ox + s.lane })),
  };
}

// Centro de comando: mesa grande do Friol, 4 lugares de visita na frente e lugares de pé para quem
// mora ali (o 1º é do Fiscal Codex de plantão). Mesmo formato das salas de lazer.
const GOLD = ['#ffd166', '#d9a83a', '#b8892a'];
export const VISIT_ACTS = ['prestando contas', 'pedindo uma bênção', 'levando café para o Friol', 'mostrando o relatório'];
export const VISIT_MS = 25_000;
export function commandLayout(lr) {
  const { ox, oy } = lr;
  const props = [
    { x: 5.1, y: 0.5, w: 1.8, d: 0.7, h: 13, col: ['#c0563f', '#8a3a28', '#6e2e20'], z0: 0, spots: [] }, // trono
    { x: 3, y: 2.6, w: 6, d: 1.6, h: 7, col: GOLD, z0: 0, spots: [] }, // a mesa
    { x: 3.5, y: 2.7, w: 1.4, d: 0.2, h: 4, col: ['#1a1d2e', '#6cc6ff', '#4aa0d8'], z0: 7, spots: [] },
    { x: 5.3, y: 2.7, w: 1.4, d: 0.2, h: 4.5, col: ['#1a1d2e', '#5fe0a8', '#3fae80'], z0: 7, spots: [] },
    { x: 7.1, y: 2.7, w: 1.4, d: 0.2, h: 4, col: ['#1a1d2e', '#ff9fd0', '#d07aa8'], z0: 7, spots: [] },
  ].map((p) => ({ ...p, x: ox + p.x, y: oy + p.y }));
  const spots = [3.8, 5.3, 6.8, 8.3].map((x, i) => ({ x: ox + x, y: oy + 5.4, lane: ox + x, pose: 'stand', act: VISIT_ACTS[i] }));
  const stand = [[10.6, 2.6], [1.2, 2.2], [1.2, 3.8], [1.2, 5.4], [10.6, 4.4], [10.6, 6.0], [10.6, 7.4], [1.2, 7.0]];
  return {
    godSeat: { x: ox + 6, y: oy + 1.9 },
    props, spots,
    standSpots: stand.map(([x, y]) => ({ x: ox + x, y: oy + y })),
  };
}

// Caminho dentro da sala de lazer: porta → corredor interno → faixa do lugar → lugar.
export function insidePath(lz, spot) {
  return [{ ...lz.door }, { x: lz.door.x, y: lz.aisle }, { x: spot.lane, y: lz.aisle }, { x: spot.lane, y: spot.y }, { x: spot.x, y: spot.y }];
}

// Pelo corredor: rota da sala de origem até o centro de comando e rota da sala de lazer ao contrário,
// cortando o trecho final comum às duas (ninguém vai até o centro sem precisar).
export function corridorBetween(a, b) {
  const near = (p, q) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;
  let k = 0;
  while (k < a.length && k < b.length && near(a[a.length - 1 - k], b[b.length - 1 - k])) k++;
  return [...a.slice(0, a.length - k + 1), ...b.slice(0, b.length - k).reverse()].map((p) => ({ x: p.x, y: p.y }));
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  // mistura final: chaves quase iguais ("a:X:dev1", "a:X:dev2") não caem todas na mesma sala
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

// teto de quem pode estar fora da mesa ao mesmo tempo
export function teto(n, share = SHARE) { return n <= 0 ? 0 : n < 3 ? 1 : Math.floor(n * share); }

// Escolha do slot: determinística, respeita teto e capacidade. Devolve Map(chave → id da sala).
export function pickVisitors(keys, slot, rooms, share = SHARE) {
  const cap = teto(keys.length, share);
  const order = [...keys].sort((a, b) => hashStr(a + '|' + slot) - hashStr(b + '|' + slot) || (a < b ? -1 : 1));
  const used = new Map(rooms.map((r) => [r.id, 0]));
  const out = new Map();
  for (const k of order) {
    if (out.size >= cap) break;
    const h = hashStr(k + '#' + slot);
    for (let i = 0; i < rooms.length; i++) {
      const r = rooms[(h + i) % rooms.length];
      if (used.get(r.id) < r.spots) { out.set(k, r.id); used.set(r.id, used.get(r.id) + 1); break; }
    }
  }
  return out;
}

// Reservas: Map(id da sala → Map(índice do lugar → chave)). Reserva na partida, libera na volta/saída.
export function reserve(seats, lzId, n, key) {
  let m = seats.get(lzId);
  if (!m) { m = new Map(); seats.set(lzId, m); }
  for (const [i, k] of m) if (k === key) return i;
  const start = hashStr(key) % Math.max(1, n);
  for (let j = 0; j < n; j++) { const i = (start + j) % n; if (!m.has(i)) { m.set(i, key); return i; } }
  return -1;
}
export function release(seats, key) {
  for (const m of seats.values()) for (const [i, k] of m) if (k === key) m.delete(i);
}

// Índices do rastro a percorrer a partir de `at` (último ponto alcançado) andando no sentido `dir`
// (+1 indo, -1 voltando, 0 parado) até `target`. Só passa por segmentos do próprio rastro.
export function walkIdx(at, dir, target) {
  const out = [];
  if (target > at || (target === at && dir < 0)) for (let i = dir < 0 ? at : at + 1; i <= target; i++) out.push(i);
  else if (target < at || (target === at && dir > 0)) for (let i = dir > 0 ? at : at - 1; i >= target; i--) out.push(i);
  return out;
}

// Onde o agente está no rastro: 'home' (sala do projeto), 'corridor' ou 'lz' (sala de lazer).
export function whereOn(a) {
  if (a.at < a.homeOut || (a.at === a.homeOut && a.dir < 0)) return 'home';
  if (a.at > a.lzOut || (a.at === a.lzOut && a.dir > 0)) return 'lz';
  return 'corridor';
}

// Agente removido enquanto estava fora: sai pela porta da sala onde está, ou some no corredor.
export function exitPlan(a) {
  const w = whereOn(a);
  if (w === 'home') return { mode: 'walk', target: a.homeOut };
  if (w === 'lz') return { mode: 'walk', target: a.lzOut };
  return { mode: 'fade' };
}

// Replanta do prédio: remoção tem precedência; quem ainda tem sala volta direto para a mesa.
export function replanAction(homeExists, a) {
  if (homeExists) return 'snapHome';
  return whereOn(a) === 'lz' ? 'exitLz' : 'drop';
}
