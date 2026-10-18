// Partes puras do modo 3D (sem Three.js, testadas no node): escala, coletor de geometria e câmera orbital.
// O coletor finge ser o contexto 2D para as rotinas de desenho do office.js: cada polígono que elas
// mandam (via poly() → g.poly3) vira triângulos em coordenadas do mundo, com a mesma cor do 2D.

// 1 px de altura do 2D em unidades do mundo: a mesma proporção do isométrico (vista a 30°)
export const ZS = 1 / 9.8;
// 1 px de largura do sprite em unidades do mundo
export const PXW = 1 / 11.31;
// afastamento entre decalques no mesmo plano (quadro na parede, tela no monitor), rumo à câmera
export const EPS = 0.004;
const BUCKET = 2;

// projeção "identidade" para o coletor: as rotinas chamam P.p/P.depth, mas quem desenha é o poly3
export const P3 = { id: '3d', p: (x, y, z = 0) => [x, y, z], depth: (x, y) => x + y, inv: (x, y) => [x, y] };

// altura no mundo: pisos e decalques rentes ao chão (z < 0.2 px) ganham uma folga maior, na mesma ordem do 2D
export const height = (z) => (z < 0.2 ? z * 0.25 : z * ZS);

const FILLS = new Map();
export function parseFill(s) {
  let c = FILLS.get(s);
  if (c) return c;
  const str = String(s);
  if (str[0] === '#' && str.length === 7) {
    const n = parseInt(str.slice(1), 16);
    c = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  } else {
    const m = str.match(/^rgba?\(([^)]+)\)$/);
    const v = m ? m[1].split(',').map(Number) : null;
    c = v && v.length >= 3 && v.every((x) => Number.isFinite(x)) ? [v[0] / 255, v[1] / 255, v[2] / 255, v.length > 3 ? v[3] : 1] : [1, 0, 1, 1];
  }
  if (FILLS.size > 4000) FILLS.clear();
  FILLS.set(s, c);
  return c;
}

function buf() { return { n: 0, cap: 0, pos: new Float32Array(0), col: new Float32Array(0), meta: new Float32Array(0) }; }
function grow(b, need) {
  if (need <= b.cap) return;
  let cap = Math.max(1024, b.cap);
  while (cap < need) cap *= 2;
  const pos = new Float32Array(cap * 3), col = new Float32Array(cap * 4), meta = new Float32Array(cap * 2);
  pos.set(b.pos.subarray(0, b.n * 3)); col.set(b.col.subarray(0, b.n * 4)); meta.set(b.meta.subarray(0, b.n * 2));
  Object.assign(b, { cap, pos, col, meta });
}

export class Collector {
  constructor() { this.op = buf(); this.tr = buf(); this.reset(); }
  // base: camadas já ocupadas por outro coletor (o estático), para os decalques do dinâmico ficarem por cima
  reset(base = null) {
    this.op.n = 0; this.tr.n = 0;
    this.layers = new Map(); this.base = base;
    this.room = -1; this.lr = null; this.seq = 0;
  }
  // o resto da API do canvas usada pelas rotinas de desenho não faz nada aqui (grades e estrelas são só do 2D)
  beginPath() {} moveTo() {} lineTo() {} closePath() {} fill() {} stroke() {} fillRect() {} drawImage() {}
  save() {} restore() {} translate() {} ellipse() {}

  // camada do decalque num plano vertical: 1 + a maior camada já usada nos trechos que ele cobre
  layer(axis, v, a0, a1) {
    const pre = axis + Math.round(v * 100) + ':';
    const b0 = Math.floor(a0 / BUCKET), b1 = Math.floor((a1 - 1e-6) / BUCKET);
    let L = 0;
    for (let b = b0; b <= b1; b++) { const k = pre + b; L = Math.max(L, this.layers.get(k) ?? this.base?.get(k) ?? 0); }
    for (let b = b0; b <= b1; b++) this.layers.set(pre + b, L + 1);
    return L;
  }

  poly3(pts, fill) {
    const n = pts.length;
    if (n < 3) return;
    const [r, g, b, a] = parseFill(fill);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of pts) {
      const z = p[2] || 0;
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    const flat = z1 - z0 < 1e-6;
    let dx = 0, dy = 0, hz = null;
    if (flat) hz = this.seq === 0 && z0 === 0 ? -0.01 : height(z0); // 1º polígono do estático = laje, fica por baixo de tudo
    else if (y1 - y0 < 1e-6) dy = this.layer('y', y0, x0, x1) * EPS;
    else if (x1 - x0 < 1e-6) dx = this.layer('x', x0, y0, y1) * EPS;
    this.seq++;
    // parede alta da sala (fundo ou lado esquerdo): pode ser rebaixada no shader quando outra sala está em foco
    const lr = this.lr;
    const wall = lr && z1 > 2.6 && pts.every((p) => p[1] <= lr.oy + 0.01 || p[0] <= lr.ox + 0.01) ? 1 : 0;
    const B = a < 0.999 ? this.tr : this.op;
    const tri = n - 2;
    grow(B, B.n + tri * 3);
    const room = this.room + 1;
    for (let t = 0; t < tri; t++) {
      for (const p of [pts[0], pts[t + 1], pts[t + 2]]) {
        const i = B.n++;
        B.pos[i * 3] = p[0] + dx; B.pos[i * 3 + 1] = hz ?? (p[2] || 0) * ZS; B.pos[i * 3 + 2] = p[1] + dy;
        B.col[i * 4] = r; B.col[i * 4 + 1] = g; B.col[i * 4 + 2] = b; B.col[i * 4 + 3] = a;
        B.meta[i * 2] = room; B.meta[i * 2 + 1] = wall;
      }
    }
  }

  // primitivas próprias do 3D (sombras, robô, luz da cabine)
  disc(cx, cy, r, z, fill, n = 10) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]); }
    this.poly3(pts, fill);
  }
  cube(x, y, w, d, h, top, front, side, z0 = 0) {
    const z1 = z0 + h;
    this.poly3([[x, y + d, z0], [x + w, y + d, z0], [x + w, y + d, z1], [x, y + d, z1]], front);
    this.poly3([[x + w, y, z0], [x + w, y + d, z0], [x + w, y + d, z1], [x + w, y, z1]], side);
    this.poly3([[x, y, z1], [x + w, y, z1], [x + w, y + d, z1], [x, y + d, z1]], top);
  }
}

// ---------- câmera orbital ----------
// o mundo (x, y, altura) vira (X = x, Y = altura, Z = y); a câmera fica no quadrante +x +y, como no isométrico
export const AZ0 = Math.PI / 4, EL0 = (36 * Math.PI) / 180;
export const AZ_MIN = (10 * Math.PI) / 180, AZ_MAX = (80 * Math.PI) / 180;
export const EL_MIN = (20 * Math.PI) / 180, EL_MAX = (65 * Math.PI) / 180;
export const SPIN = (20 * Math.PI) / 180, SPIN_MS = 120_000;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function orbit(tx, ty, dist, az, el) {
  return [tx + dist * Math.cos(el) * Math.cos(az), dist * Math.sin(el), ty + dist * Math.cos(el) * Math.sin(az)];
}
// giro lento da visão geral: ±20° em volta do ângulo escolhido, sem sair dos limites
export function spinAz(base, now, on) {
  return clamp(base + (on ? SPIN * Math.sin((2 * Math.PI * now) / SPIN_MS) : 0), AZ_MIN, AZ_MAX);
}
// vetores no chão para arrastar: direita da tela e "para longe" da câmera
export function groundAxes(az) {
  return { right: [Math.sin(az), -Math.cos(az)], away: [-Math.cos(az), -Math.sin(az)] };
}
