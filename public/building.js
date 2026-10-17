// Planta do prédio: grade de células, salas com 1..N células, centro de comando no meio
// e uma malha de corredores (as linhas entre células) ligando tudo ao centro.
import { LEISURE, leisureLayout, commandLayout } from './leisure.js';

export const CELL_W = 12, CELL_H = 10, GAP = 3;
const PW = CELL_W + GAP, PH = CELL_H + GAP;
const SPANS = [[1, 1], [2, 1], [1, 2], [3, 1], [2, 2], [3, 2], [4, 2], [3, 3], [4, 3], [4, 4]]
  .sort((a, b) => a[0] * a[1] - b[0] * b[1] || Math.abs(a[0] - a[1]) - Math.abs(b[0] - b[1]));

export function capacity(sx, sy, yStart = 1.8) {
  const W = sx * CELL_W + (sx - 1) * GAP, H = sy * CELL_H + (sy - 1) * GAP;
  return { W, H, cols: Math.max(1, Math.floor((W - 4) / 4)), rows: Math.max(1, Math.floor((H - yStart - 2.2) / 3 + 1e-6)) };
}

export function seatsNeeded(r) {
  return Math.max(4, r.staff.length + r.sessions.length + r.interns.length + 1);
}

function spanFor(need) {
  for (const [a, b] of SPANS) { const c = capacity(a, b); if (c.cols * c.rows >= need) return [a, b]; }
  return SPANS[SPANS.length - 1];
}

function free(occ, cx, cy, sx, sy) {
  for (let y = cy; y < cy + sy; y++) for (let x = cx; x < cx + sx; x++) if (occ[y][x]) return false;
  return true;
}
function mark(occ, cx, cy, sx, sy) {
  for (let y = cy; y < cy + sy; y++) for (let x = cx; x < cx + sx; x++) occ[y][x] = true;
}

function tryPlace(items, C, R) {
  const occ = Array.from({ length: R }, () => new Array(C).fill(false));
  // centro de comando: 1 célula no meio, só a mesa do Friol
  const ccx = Math.floor((C - 1) / 2), ccy = Math.floor((R - 1) / 2);
  mark(occ, ccx, ccy, 1, 1);
  const placed = [{ cc: true, cx: ccx, cy: ccy, sx: 1, sy: 1 }];
  for (const it of items) {
    let best = null;
    for (let cy = 0; cy + it.sy <= R; cy++) for (let cx = 0; cx + it.sx <= C; cx++) {
      if (!free(occ, cx, cy, it.sx, it.sy)) continue;
      // a ala das salas paradas mira a borda sul; o resto, o centro do prédio
      const d = it.ala ? Math.abs(cx + it.sx / 2 - C / 2) + Math.abs(cy + it.sy - R)
        : Math.abs(cx + it.sx / 2 - C / 2) + Math.abs(cy + it.sy / 2 - R / 2);
      if (!best || d < best.d - 1e-9) best = { cx, cy, d };
    }
    if (!best) return null;
    mark(occ, best.cx, best.cy, it.sx, it.sy);
    placed.push({ ...it, cx: best.cx, cy: best.cy });
  }
  return placed;
}

export function planBuilding(rooms, caps) {
  const lobby = rooms.find((r) => r.kind === 'lobby') || { id: 'cc', name: 'Centro de comando', kind: 'lobby', staff: [], sessions: [], interns: [] };
  const items = rooms.filter((r) => r !== lobby).map((r) => {
    const [sx, sy] = spanFor(Math.max(caps.get(r.id) || 0, seatsNeeded(r)));
    return { room: r, sx, sy };
  }).sort((a, b) => (b.sx * b.sy - a.sx * a.sy) || a.room.name.localeCompare(b.room.name, 'pt'));
  // salas de projeto sem agente cadastrado e de 1 célula vão juntas para uma ala (um retângulo só)
  const quiet = items.filter((i) => i.room.kind === 'project' && !i.room.staff?.length && i.sx === 1 && i.sy === 1);
  if (quiet.length >= 2) {
    for (const q of quiet) items.splice(items.indexOf(q), 1);
    const bw = Math.ceil(Math.sqrt(quiet.length)), bh = Math.ceil(quiet.length / bw);
    items.push({ ala: quiet.map((q) => q.room), sx: bw, sy: bh });
  }
  // salas de lazer por último: o tryPlace as põe mais longe do centro (tende à periferia)
  for (const L of LEISURE) items.push({ room: { id: L.id, name: L.name, kind: 'leisure', full: !!L.fullName }, sx: L.span[0], sy: L.span[1], leisure: L.kind });
  const N = items.reduce((s, i) => s + i.sx * i.sy, 0) + 1;
  // procura a grade mais compacta (e mais quadrada) em que tudo cabe
  let placed = null, C = 0, R = 0, bestScore = Infinity;
  const maxSpan = Math.max(2, ...items.map((i) => Math.max(i.sx, i.sy)));
  for (let c = Math.max(4, maxSpan); c <= 24; c++) {
    for (let r = Math.max(4, Math.ceil(N / c)); r <= Math.ceil(N / c) + 3; r++) {
      const score = c * PW + r * PH + Math.abs(c - r) * 4; // no isométrico o tamanho na tela depende de largura + altura
      if (score >= bestScore) continue;
      const res = tryPlace(items, c, r);
      if (res) { placed = res; C = c; R = r; bestScore = score; }
    }
  }
  const rects = [];
  for (const p of placed) {
    if (!p.ala) { rects.push({ ...p, room: p.cc ? lobby : p.room }); continue; }
    // divide a ala em células em serpentina (linhas cheias + resto encostado): sempre conectada
    p.ala.forEach((room, i) => {
      const row = Math.floor(i / p.sx), col = row % 2 ? p.sx - 1 - (i % p.sx) : i % p.sx;
      rects.push({ room, cx: p.cx + col, cy: p.cy + row, sx: 1, sy: 1, quiet: true });
    });
  }

  // malha de corredores: nós nos cruzamentos entre células
  const blockedNode = (i, j) => rects.some((r) => i > r.cx && i < r.cx + r.sx && j > r.cy && j < r.cy + r.sy);
  const blockedH = (i, j) => rects.some((r) => i >= r.cx && i < r.cx + r.sx && j > r.cy && j < r.cy + r.sy); // i->i+1 na linha j
  const blockedV = (i, j) => rects.some((r) => j >= r.cy && j < r.cy + r.sy && i > r.cx && i < r.cx + r.sx); // j->j+1 na coluna i
  const nodePos = (i, j) => ({ x: i * PW + GAP / 2, y: j * PH + GAP / 2 });
  const neighbors = (i, j) => {
    const out = [];
    if (i < C && !blockedH(i, j)) out.push([i + 1, j]);
    if (i > 0 && !blockedH(i - 1, j)) out.push([i - 1, j]);
    if (j < R && !blockedV(i, j)) out.push([i, j + 1]);
    if (j > 0 && !blockedV(i, j - 1)) out.push([i, j - 1]);
    return out.filter(([a, b]) => !blockedNode(a, b));
  };

  const layout = rects.map((p) => {
    const cap = capacity(p.sx, p.sy, p.cc ? 6 : 1.8);
    const ox = GAP + p.cx * PW, oy = GAP + p.cy * PH;
    const yStart = p.cc ? 6 : 1.8;
    const desks = [];
    for (let rr = 0; rr < cap.rows; rr++) for (let c = 0; c < cap.cols; c++) desks.push({ x: 1 + c * 4, y: yStart + rr * 3 });
    const lr = {
      room: p.room, cc: !!p.cc, leisure: p.leisure || null, cx: p.cx, cy: p.cy, sx: p.sx, sy: p.sy, ox, oy, W: cap.W, H: cap.H, cols: cap.cols,
      desks, aisle: oy + cap.H - 1.1,
      door: { x: ox + 1.75, y: oy + cap.H - 0.2 }, doorOut: { x: ox + 1.75, y: oy + cap.H + GAP / 2 },
      node: [p.cx, p.cy + p.sy],
      coffee: { x: ox + cap.W - 1.7, y: oy + 2.4 }, cooler: { x: ox + cap.W - 1.7, y: oy + 4.6 },
      light: 0, litAt: 0,
    };
    if (lr.leisure) { lr.desks = []; Object.assign(lr, leisureLayout(lr, lr.leisure)); }
    if (lr.cc) { lr.desks = []; Object.assign(lr, commandLayout(lr)); }
    return lr;
  });

  // BFS a partir do nó do centro de comando
  const ccl = layout.find((l) => l.cc);
  const key = (i, j) => i + ',' + j;
  const prev = new Map([[key(...ccl.node), null]]);
  const q = [ccl.node];
  while (q.length) {
    const [i, j] = q.shift();
    for (const n of neighbors(i, j)) if (!prev.has(key(...n))) { prev.set(key(...n), [i, j]); q.push(n); }
  }
  const edges = new Set();
  for (const lr of layout) {
    if (lr.cc) { lr.route = [lr.doorOut]; continue; }
    const nodes = [];
    let cur = lr.node;
    while (cur) { nodes.push(cur); cur = prev.get(key(...cur)); }
    if (!lr.leisure) for (let n = 0; n + 1 < nodes.length; n++) edges.add([key(...nodes[n]), key(...nodes[n + 1])].sort().join('|'));
    const pts = nodes.map(([i, j]) => nodePos(i, j));
    // da porta da sala até o corredor, pelos nós, até a porta do centro de comando
    lr.route = [lr.doorOut, { x: pts[0].x, y: lr.doorOut.y }, ...pts.slice(1), { x: ccl.doorOut.x - 0.0001, y: pts[pts.length - 1].y }, ccl.doorOut]
      .filter((p, idx, arr) => idx === 0 || Math.hypot(p.x - arr[idx - 1].x, p.y - arr[idx - 1].y) > 0.01);
    lr.routeLen = 0;
    for (let n = 1; n < lr.route.length; n++) lr.routeLen += Math.hypot(lr.route[n].x - lr.route[n - 1].x, lr.route[n].y - lr.route[n - 1].y);
  }
  const graph = [];
  for (let i = 0; i <= C; i++) for (let j = 0; j <= R; j++) if (!blockedNode(i, j)) graph.push({ i, j, ...nodePos(i, j), n: neighbors(i, j) });
  // células livres viram áreas de convivência
  const occ = Array.from({ length: R }, () => new Array(C).fill(false));
  for (const r of rects) mark(occ, r.cx, r.cy, r.sx, r.sy);
  const lounges = [];
  for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) if (!occ[y][x]) lounges.push({ ox: GAP + x * PW, oy: GAP + y * PH, W: CELL_W, H: CELL_H, seed: x * 31 + y });
  return { C, R, BW: C * PW + GAP, BH: R * PH + GAP, rooms: layout.filter((l) => !l.leisure), leisure: layout.filter((l) => l.leisure), cc: ccl, lounges, edges: [...edges].map((e) => e.split('|').map((s) => nodePos(...s.split(',').map(Number)))), graph, nodePos };
}

// ponto a uma distância d ao longo de uma polilinha
export function along(route, d) {
  for (let n = 1; n < route.length; n++) {
    const a = route[n - 1], b = route[n];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= L) return { x: a.x + ((b.x - a.x) * d) / L, y: a.y + ((b.y - a.y) * d) / L };
    d -= L;
  }
  return route[route.length - 1];
}

// ---------- caminhos dentro de uma sala de projeto (corredores entre as mesas) ----------
export function laneX(lr, x) {
  const rx = x - lr.ox;
  const right = 1 + lr.cols * 4;
  if (rx >= right - 0.2) return lr.ox + right + 0.3;
  const c = Math.max(0, Math.min(lr.cols - 1, Math.round((rx - 2.5) / 4)));
  return lr.ox + 4 * c + 0.5;
}
export function inRoomPath(lr, a, b) {
  const la = laneX(lr, a.x), lb = laneX(lr, b.x);
  return [{ x: la, y: a.y }, { x: la, y: lr.aisle }, { x: lb, y: lr.aisle }, { x: lb, y: b.y }, { x: b.x, y: b.y }];
}
export function toDoorPath(lr, from) { return [...inRoomPath(lr, from, { x: lr.door.x, y: lr.aisle }), { ...lr.door }, { ...lr.doorOut }]; }
export function fromDoorPath(lr, to) { return [{ ...lr.door }, ...inRoomPath(lr, { x: lr.door.x, y: lr.aisle }, to)]; }
