// Motor do prédio: salas acesas/apagadas, corredores com pulsos até o centro de comando,
// personagens com nome, caminhadas entre salas e partículas. Só desenha; nunca fala com o servidor.
import { sprite, paletteFor, hash, ICONS, ACTIVITY_COLOR } from './sprites.js';
import { planBuilding, seatsNeeded, along, laneX, inRoomPath, toDoorPath, fromDoorPath } from './building.js';
import { LEISURE_THEMES, SLOT_MS, SHARE, VISIT_MS, teto, pickVisitors, reserve, release, walkIdx, exitPlan, replanAction, whereOn, insidePath, corridorBetween } from './leisure.js';

export const PROJECTIONS = {
  iso: { id: 'iso', label: 'Isométrico', p: (x, y, z = 0) => [(x - y) * 8, (x + y) * 4 - z], depth: (x, y) => x + y, inv: (sx, sy) => [(sx / 8 + sy / 4) / 2, (sy / 4 - sx / 8) / 2] },
  topdown: { id: 'topdown', label: 'Top-down', p: (x, y, z = 0) => [x * 8, y * 6 - z], depth: (x, y) => y, inv: (sx, sy) => [sx / 8, sy / 6] },
};

const NAMES = ['Ana', 'Bia', 'Caio', 'Duda', 'Enzo', 'Flora', 'Gael', 'Helô', 'Iara', 'Joca', 'Kai', 'Lia', 'Malu', 'Nino', 'Otto', 'Pipa', 'Rui', 'Sol', 'Teo', 'Uri', 'Vivi', 'Zeca',
  'Alice', 'Beto', 'Cora', 'Davi', 'Elis', 'Fred', 'Gabi', 'Hugo', 'Ivo', 'Jade', 'Lara', 'Luca', 'Maya', 'Noah', 'Olga', 'Paco', 'Rita', 'Sara', 'Tito', 'Vera', 'Yuri', 'Zoe',
  'Aurora', 'Bento', 'Cecília', 'Dante', 'Estela', 'Felipe', 'Glória', 'Heitor', 'Isis', 'Joaquim', 'Kátia', 'Léo', 'Mel', 'Nina', 'Oscar', 'Pietra', 'Raul', 'Sofia', 'Tom', 'Valentina'];

const ROOM_THEMES = [
  { a: '#c79a6b', b: '#b98b5d', wall: '#5b6aa8', top: '#7b8ad0', trim: '#3f4a80' },
  { a: '#8fa4b8', b: '#8197ab', wall: '#4f8a7a', top: '#6fb09d', trim: '#356456' },
  { a: '#d2b48c', b: '#c4a57c', wall: '#a0566b', top: '#c47389', trim: '#733b4c' },
  { a: '#9aa38a', b: '#8c957c', wall: '#6a5a9c', top: '#8b7bc0', trim: '#4a3d75' },
  { a: '#c8b8a6', b: '#bba996', wall: '#4d7398', top: '#6c94bc', trim: '#355270' },
  { a: '#b07f5a', b: '#a2724f', wall: '#7f8a4b', top: '#a0ab66', trim: '#5a6233' },
  { a: '#bfa3c9', b: '#b196bb', wall: '#5e5f8f', top: '#7d7eb3', trim: '#41426a' },
];
const CC_THEME = { a: '#1e3a44', b: '#1a333c', wall: '#25485a', top: '#36677f', trim: '#173240' };
const WORKING = new Set(['working', 'asking', 'waiting', 'stuck']);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
// brilhos radiais pré-desenhados: criar um gradiente por quadro e por agente pesa no modo demonstração
const GLOWS = new Map();
function glow(col, alpha, r) {
  const k = col + '|' + alpha.toFixed(2) + '|' + Math.round(r);
  let c = GLOWS.get(k);
  if (!c) {
    const R = Math.round(r);
    c = document.createElement('canvas'); c.width = c.height = R * 2;
    const x = c.getContext('2d'), gr = x.createRadialGradient(R, R, 0, R, R, R);
    gr.addColorStop(0, hexA(col, alpha)); gr.addColorStop(1, hexA(col, 0));
    x.fillStyle = gr; x.fillRect(0, 0, R * 2, R * 2);
    GLOWS.set(k, c);
  }
  return c;
}
const shortRole = (s) => String(s || '').replace(/^[a-z0-9]+-(?=[a-z])/i, '');

// ---------- primitivas ----------
function poly(g, P, pts, fill) {
  g.fillStyle = fill;
  g.beginPath();
  for (let i = 0; i < pts.length; i++) { const [sx, sy] = P.p(pts[i][0], pts[i][1], pts[i][2]); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy); }
  g.closePath();
  g.fill();
}
function quadZ(g, P, x0, y0, x1, y1, z, fill) { poly(g, P, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], fill); }
function box(g, P, x, y, w, d, h, top, front, side, z0 = 0) {
  const z1 = z0 + h;
  poly(g, P, [[x, y + d, z0], [x + w, y + d, z0], [x + w, y + d, z1], [x, y + d, z1]], front);
  if (P.id === 'iso') poly(g, P, [[x + w, y, z0], [x + w, y + d, z0], [x + w, y + d, z1], [x + w, y, z1]], side);
  poly(g, P, [[x, y, z1], [x + w, y, z1], [x + w, y + d, z1], [x, y + d, z1]], top);
}
function wallX(g, P, x0, x1, y, z0, z1, fill) { poly(g, P, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], fill); }
function wallY(g, P, y0, y1, x, z0, z1, fill) { poly(g, P, [[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]], fill); }
function ellipse(g, P, cx, cy, r, z, fill, n = 20) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]); }
  poly(g, P, pts, fill);
}
function skyColors(hour) {
  if (hour >= 6 && hour < 8) return ['#f6b38a', '#8fb7e8'];
  if (hour >= 8 && hour < 17) return ['#8fd0ff', '#5fa8f0'];
  if (hour >= 17 && hour < 19) return ['#ff9f6b', '#6a5ab0'];
  return ['#1b1f4a', '#0b0d24'];
}

export class Office {
  constructor() {
    this.P = PROJECTIONS.iso;
    this.entities = new Map();
    this.names = new Map();
    this.usedNames = new Set();
    this.caps = new Map();
    this.seatMaps = new Map();
    this.particles = [];
    this.plan = null;
    this.planKey = '';
    this.first = true;
    this.static = document.createElement('canvas');
    this.staticKey = '';
    this.alertsByRoom = new Map();
    this.robot = null;
    this.hoverKey = null;
    this.prevState = new Map();
    // salas de lazer: reservas de lugar, escolhidos do slot e teto (ver leisure.js)
    this.lzSeats = new Map();
    this.lzSlot = -1;
    this.lzChosen = new Map();
    this.lzCap = 0;
    this.now = () => Date.now(); // trocável no ?debug=1 para testes
    this.demo = false;
  }

  // destinos de passeio: salas de lazer + visita ao centro de comando (Friol)
  get destinations() { return this.plan ? [...this.plan.leisure, this.plan.cc] : []; }

  // modo demonstração: mais gente passeando; ao desligar, capacidades voltam a ser medidas só pelo real
  setDemo(on) {
    if (this.demo === !!on) return;
    this.demo = !!on;
    if (!on) { this.caps = new Map(); this.planKey = ''; }
    this.lzSlot = -1;
  }

  setProjection(P) { if (P !== this.P) { this.P = P; this.planKey = ''; } }

  nameFor(key, seed) {
    if (this.names.has(key)) return this.names.get(key);
    if (key === 'god') { this.names.set(key, 'Friol'); return 'Friol'; }
    if (key.startsWith('c:')) {
      const taken = new Set(this.names.values());
      let n = 1, name = 'Fiscal Codex';
      while (taken.has(name)) name = `Fiscal Codex ${++n}`;
      this.names.set(key, name);
      return name;
    }
    let i = hash(seed) % NAMES.length, n = 0;
    while (this.usedNames.has(NAMES[i]) && n < NAMES.length) { i = (i + 1) % NAMES.length; n++; }
    const name = n < NAMES.length ? NAMES[i] : NAMES[i] + ' ' + (1 + (hash(key) % 9));
    this.usedNames.add(name);
    this.names.set(key, name);
    return name;
  }

  seat(lr, key, preferred) {
    let m = this.seatMaps.get(lr.room.id);
    if (!m) { m = new Map(); this.seatMaps.set(lr.room.id, m); }
    if (m.has(key)) return m.get(key);
    const used = new Set(m.values());
    // no centro de comando não há mesas: lugares de pé, o 1º é do Fiscal Codex
    const n = lr.cc ? lr.standSpots.length : lr.desks.length;
    const base = lr.cc && !key.startsWith('c:') ? 1 : 0;
    let idx = preferred !== undefined && preferred >= base && !used.has(preferred) ? preferred : base;
    while (used.has(idx)) idx++;
    idx = Math.min(idx, n - 1);
    m.set(key, idx);
    return idx;
  }

  sync(snap) {
    this.snap = snap;
    const rooms = snap.rooms;
    for (const r of rooms) this.caps.set(r.id, Math.max(this.caps.get(r.id) || 0, seatsNeeded(r)));
    const key = this.P.id + '|' + rooms.map((r) => r.id + ':' + r.name + ':' + this.caps.get(r.id)).sort().join(',');
    if (key !== this.planKey) {
      const old = new Map((this.plan?.rooms || []).map((lr) => [lr.room.id, lr]));
      this.plan = planBuilding(rooms, this.caps);
      this.planKey = key;
      this.staticKey = '';
      this.seatMaps = new Map();
      for (const lr of this.plan.rooms) {
        const o = old.get(lr.room.id);
        if (o) { lr.light = o.light; lr.litAt = o.litAt; }
        lr.theme = lr.cc ? CC_THEME : ROOM_THEMES[hash(lr.room.id) % ROOM_THEMES.length];
      }
      for (const lz of this.plan.leisure) lz.theme = LEISURE_THEMES[lz.leisure];
      const byId = new Map(this.plan.rooms.map((lr) => [lr.room.id, lr]));
      const lzById = new Map(this.destinations.map((lz) => [lz.room.id, lz]));
      // reservas e escolhas recomeçam; remoção tem precedência sobre o retorno à mesa
      this.lzSeats = new Map(); this.lzSlot = -1; this.lzChosen = new Map();
      for (const e of this.entities.values()) {
        const a = old.get(e.lr?.room.id), b = byId.get(e.lr?.room.id);
        if (e.away) {
          const act = replanAction(!!b, e.away);
          if (act === 'snapHome') { e.away = null; e.snapHome = true; }
          else if (act === 'exitLz' && lzById.has(e.away.lz.room.id)) {
            const lz = lzById.get(e.away.lz.room.id), A = e.away;
            e.x += lz.ox - A.lz.ox; e.y += lz.oy - A.lz.oy;
            // novo rastro só da sala de lazer: [doorOut, porta, ..., lugar]
            const trail = [{ ...lz.doorOut }, ...insidePath(lz, lz.spots[A.spot])];
            e.away = { ...A, lz, trail, at: A.at - A.lzOut, homeOut: -1, lzOut: 0 };
            e.leaving = true; e.desk = null; e.path = []; e.plan = '';
            continue;
          } else { this.dropEntity(e); continue; }
        }
        if (a && b) { e.x += b.ox - a.ox; e.y += b.oy - a.oy; }
        e.path = []; e.plan = '';
        if (b) e.lr = b; else this.entities.delete(e.key);
      }
      this.computeBBox();
      this.robot = null;
    }
    const byId = new Map(this.plan.rooms.map((lr) => [lr.room.id, lr]));
    for (const r of rooms) { const lr = byId.get(r.id); if (lr) lr.room = r; }
    this.alertsByRoom = new Map();
    for (const a of snap.alerts) this.alertsByRoom.set(a.roomId, (this.alertsByRoom.get(a.roomId) || 0) + 1);

    const want = new Map();
    let audits = 0, auditsToday = 0, lastVerdict = null;
    for (const lr of this.plan.rooms) {
      const r = lr.room;
      const wasLit = lr.lit;
      lr.lit = !!r.lit;
      if (lr.lit && !wasLit && !this.first) lr.litAt = performance.now();
      r.staff.forEach((a, i) => {
        const k = 'a:' + r.id + ':' + a.name;
        want.set(k, { kind: 'staff', lr, seatIdx: this.seat(lr, k, i), state: a.state === 'working' ? 'working' : 'idle', activity: a.activity || (lr.lit ? 'livre' : 'descansando'), role: a.name, data: a, room: r.name });
      });
      for (const s of r.sessions) {
        const k = 's:' + s.key;
        want.set(k, { kind: 'claude', lr, seatIdx: this.seat(lr, k), state: s.state, activity: s.activity, role: 'Claude', data: s, room: r.name });
      }
      for (const it of r.interns) {
        const k = 'i:' + it.key;
        want.set(k, { kind: 'intern', lr, seatIdx: this.seat(lr, k), state: 'working', activity: it.activity, role: it.role, data: it, room: r.name });
      }
      if (!lr.cc && r.auditor?.state === 'auditando') {
        // o fiscal fica de pé ao lado da mesa do Claude da sala (ou perto da porta)
        const sk = r.sessions[0] && 's:' + r.sessions[0].key;
        const d = sk ? lr.desks[this.seat(lr, sk)] : null;
        const spot = d ? { x: lr.ox + d.x + 2.85, y: lr.oy + d.y + 1.6 } : { x: lr.door.x + 1.2, y: lr.aisle };
        want.set('c:' + r.id, { kind: 'codex', lr, spot, state: 'working', activity: 'auditando', role: 'Codex', data: r.auditor, room: r.name });
        audits++;
      }
      if (r.auditor) { auditsToday += r.auditor.today || 0; const real = (v) => v && v !== 'sem veredito'; if ((real(r.auditor.verdict) && !real(lastVerdict?.verdict)) || ((real(r.auditor.verdict) || !real(lastVerdict?.verdict)) && r.auditor.verdictAt > (lastVerdict?.verdictAt || 0))) lastVerdict = r.auditor; }
    }
    if (!audits) {
      const cc = this.plan.cc;
      want.set('c:home', { kind: 'codex', lr: cc, seatIdx: this.seat(cc, 'c:home', 0), state: 'idle', activity: 'de plantão', role: 'Codex',
        data: { today: auditsToday, verdict: lastVerdict?.verdict || null, verdictAt: lastVerdict?.verdictAt || null }, room: cc.room.name });
    }
    const cc = this.plan.cc;
    want.set('god', { kind: 'god', lr: cc, spot: cc.godSeat, state: 'god', activity: 'vendo tudo', role: 'Friol', data: {}, room: cc.room.name });
    for (const [k, w] of want) {
      if (w.lr.cc && !w.spot) w.spot = w.lr.standSpots[w.seatIdx];
      const desk = w.spot ? null : w.lr.desks[w.seatIdx];
      const seatPos = w.spot || { x: w.lr.ox + desk.x + 1.5, y: w.lr.oy + desk.y + 1.45 };
      let e = this.entities.get(k);
      if (!e) {
        const name = this.nameFor(k, k);
        let start = seatPos, arriving = null;
        if (!this.first && (w.kind === 'intern' || (w.kind === 'codex' && !w.lr.cc))) { start = { ...this.plan.cc.doorOut }; arriving = 'cc'; }
        else if (!this.first && w.kind === 'claude') { start = { ...w.lr.doorOut }; arriving = 'door'; }
        e = { key: k, name, x: start.x, y: start.y, path: [], plan: '', pal: paletteFor(w.kind, k), phase: hash(k) % 1000, arriving, born: performance.now() };
        this.entities.set(k, e);
      }
      const prev = this.prevState.get(k);
      if (!this.first && w.kind === 'claude' && prev && WORKING.has(prev) && w.state === 'free') this.confetti(seatPos);
      this.prevState.set(k, w.state);
      Object.assign(e, w, { desk, seat: seatPos, leaving: false });
      if (e.away && e.away.homeOut < 0) { e.away = null; e.snapHome = true; } // voltou ao snapshot no meio da saída pós-replanta
      if (e.snapHome) { e.x = seatPos.x; e.y = seatPos.y; e.path = []; e.plan = 'seat'; e.snapHome = false; }
    }
    for (const [k, e] of this.entities) {
      if (!want.has(k) && !e.leaving) {
        if (e.snapHome) { this.dropEntity(e); continue; }
        if (e.away) release(this.lzSeats, k);
        e.leaving = true; e.plan = '';
        if (e.kind === 'claude' && WORKING.has(e.state)) this.confetti(e.seat);
        if (e.kind === 'codex' && !e.lr.cc) this.stamp(e, e.lr.room.auditor?.verdict);
        this.seatMaps.get(e.lr.room.id)?.delete(k);
      }
    }
    this.first = false;
  }

  dropEntity(e) {
    release(this.lzSeats, e.key);
    this.entities.delete(e.key); this.names.delete(e.key); this.usedNames.delete(e.name); this.prevState.delete(e.key);
  }

  computeBBox() {
    const { BW, BH } = this.plan, P = this.P;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y, z] of [[0, 0, 24], [BW, 0, 24], [0, BH, 24], [BW, BH, 0], [0, BH, 0], [BW, 0, 0], [0, 0, 0]]) {
      const [sx, sy] = P.p(x, y, z);
      x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
    }
    this.bbox = [Math.floor(x0 - 8), Math.floor(y0 - 16), Math.ceil(x1 + 8), Math.ceil(y1 + 8)];
    this.width = this.bbox[2] - this.bbox[0];
    this.height = this.bbox[3] - this.bbox[1];
  }

  confetti(at) {
    const cols = ['#ff6b5e', '#ffb547', '#5fe0a8', '#6cc6ff', '#a98bff', '#ff9fd0'];
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2.2;
      this.particles.push({ x: at.x, y: at.y - 0.4, z: 14, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 18 + Math.random() * 16, g: 40, life: 1.6, max: 1.6, color: cols[i % cols.length], size: 1 });
    }
    this.particles.push({ x: at.x, y: at.y, z: 26, vx: 0, vy: 0, vz: 6, g: 0, life: 1.8, max: 1.8, glyph: 'check', color: '#5fe0a8' });
  }

  stamp(e, verdict) {
    const V = { aprovado: ['#5fe0a8', 'check'], revisar: ['#ffb547', 'bang'], bloqueado: ['#ff6b5e', 'cross'] };
    const [color, mark] = V[verdict] || ['#8f95b8', 'quest'];
    this.particles.push({ x: e.x, y: e.y, z: 24, vx: 0, vy: 0, vz: 3, g: 0, life: 3.2, max: 3.2, glyph: 'stamp', mark, color });
  }

  // ---------- rotas ----------
  laneX(lr, x) { return laneX(lr, x); }
  inRoom(lr, a, b) { return inRoomPath(lr, a, b); }
  toDoor(lr, from) { return toDoorPath(lr, from); }
  fromDoor(lr, to) { return fromDoorPath(lr, to); }
  inside(lr, e) { return e.x > lr.ox - 0.05 && e.x < lr.ox + lr.W + 0.05 && e.y > lr.oy - 0.05 && e.y < lr.oy + lr.H - 0.1; }

  destination(e, t) {
    const lr = e.lr;
    if (e.away) {
      if (e.leaving) return 'lz-leave';
      if (e.away.phase === 'voltando' || WORKING.has(e.state) || this.lzChosen.get(e.key) === undefined) return 'lz-back';
      if (e.away.leaveAt && t > e.away.leaveAt) return 'lz-back'; // visita ao Friol é curta
      return 'lz-go';
    }
    if (e.leaving) return e.kind === 'intern' || (e.kind === 'codex' && !lr.cc) ? 'leave-cc' : 'leave-door';
    if (WORKING.has(e.state)) return 'seat';
    if (!lr.cc && (e.state === 'free' || (e.kind === 'staff' && lr.lit))) {
      const period = e.state === 'free' ? 60 : 150;
      const ph = ((t / 1000 + e.phase) % period) / period;
      if (ph > (e.state === 'free' ? 0.72 : 0.9)) return (hash(e.key) & 1) ? 'coffee' : 'cooler';
    }
    return 'seat';
  }

  // caminho pelo rastro da saída para o lazer; cada ponto leva o índice dele no rastro
  walkTrail(e, target) {
    const A = e.away, dir = A.dir; // dir volta a 0 quando o caminho termina (ver step)
    const idx = walkIdx(A.at, dir, target);
    A.dir = target > A.at || (target === A.at && dir < 0) ? 1 : -1;
    return idx.map((i) => ({ ...A.trail[i], i }));
  }

  routeFor(e, dest) {
    const lr = e.lr, cc = this.plan.cc;
    const pos = { x: e.x, y: e.y };
    if (dest === 'lz-go') return this.walkTrail(e, e.away.trail.length - 1);
    if (dest === 'lz-back') {
      if (e.away.phase !== 'voltando') { e.away.phase = 'voltando'; release(this.lzSeats, e.key); if (e.away.lz.cc) e.doneSlot = this.lzSlot; }
      return this.walkTrail(e, 0);
    }
    if (dest === 'lz-leave') {
      const x = exitPlan(e.away);
      if (x.mode === 'fade') { e.fade = 0.6; return []; }
      return this.walkTrail(e, x.target);
    }
    if (dest === 'seat' && Math.hypot(pos.x - e.seat.x, pos.y - e.seat.y) < 0.05) return [];
    const spot = dest === 'coffee' ? lr.coffee : dest === 'cooler' ? lr.cooler : e.seat;
    if (dest === 'leave-door') return this.inside(lr, e) ? this.toDoor(lr, pos) : [{ ...lr.doorOut }];
    if (dest === 'leave-cc') {
      const out = this.inside(lr, e) ? this.toDoor(lr, pos) : [];
      return [...out, ...lr.route.slice(1).map((p) => ({ ...p })), { ...cc.door }];
    }
    if (e.arriving === 'cc') { e.arriving = null; return [...[...lr.route].reverse().map((p) => ({ ...p })), ...this.fromDoor(lr, spot)]; }
    if (e.arriving === 'door' || !this.inside(lr, e)) { e.arriving = null; return this.fromDoor(lr, spot); }
    return this.inRoom(lr, pos, spot);
  }

  // quem pode passear: agente cadastrado parado ou Claude esperando você (moradores do centro não)
  idleStaff(e) { return !e.leaving && !e.lr.cc && ((e.kind === 'staff' && e.state === 'idle') || (e.kind === 'claude' && e.state === 'free')); }

  // escolhe quem sai neste slot (congelado até o próximo) e dispara as partidas dentro do teto
  scheduleLeisure() {
    const L = this.destinations;
    if (!L.length) return;
    const share = this.demo ? 0.6 : SHARE;
    const slot = Math.floor(this.now() / (this.demo ? 60_000 : SLOT_MS));
    if (slot !== this.lzSlot) {
      this.lzSlot = slot;
      const keys = [...this.entities.values()].filter((e) => this.idleStaff(e)).map((e) => e.key);
      this.lzCap = teto(keys.length, share);
      this.lzChosen = pickVisitors(keys, slot, L.map((lz) => ({ id: lz.room.id, spots: lz.spots.length })), share);
    }
    let away = 0;
    for (const e of this.entities.values()) if (e.away) away++;
    for (const [k, lzId] of this.lzChosen) {
      if (away >= this.lzCap) break;
      const e = this.entities.get(k);
      if (!e || e.away || e.doneSlot === this.lzSlot || !this.idleStaff(e) || e.moving || e.path.length || Math.hypot(e.x - e.seat.x, e.y - e.seat.y) > 0.05) continue;
      const first = L.findIndex((lz) => lz.room.id === lzId);
      let lz = null, spot = -1;
      for (let j = 0; j < L.length && spot < 0; j++) { lz = L[(first + j) % L.length]; spot = reserve(this.lzSeats, lz.room.id, lz.spots.length, k); }
      if (spot < 0) continue;
      const out = this.toDoor(e.lr, e.seat);
      const corr = corridorBetween(e.lr.route, lz.route);
      const trail = [{ ...e.seat }, ...out, ...corr.slice(1), ...insidePath(lz, lz.spots[spot])];
      e.away = { lz, spot, trail, at: 0, dir: 0, phase: 'indo', homeOut: out.length, lzOut: out.length + corr.length - 1 };
      e.plan = '';
      away++;
    }
  }

  step(dt, t) {
    if (!this.plan) return;
    this.scheduleLeisure();
    for (const [k, e] of this.entities) {
      const dest = this.destination(e, t);
      if (dest !== e.plan) { e.plan = dest; e.path = this.routeFor(e, dest); }
      e.moving = false;
      let budget = dt * (e.kind === 'intern' ? 4.2 : e.kind === 'codex' ? 3.8 : 3.2);
      while (budget > 0 && e.path.length) {
        const p = e.path[0];
        const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
        if (d <= budget) { e.x = p.x; e.y = p.y; budget -= d; e.path.shift(); e.moving = e.path.length > 0; if (e.away && p.i !== undefined) e.away.at = p.i; }
        else { e.x += (dx / d) * budget; e.y += (dy / d) * budget; budget = 0; e.moving = true; e.facing = (dx + dy) < 0 ? 'up' : 'down'; }
      }
      if (e.away && !e.path.length) e.away.dir = 0;
      if (e.away && !e.path.length && !e.leaving) {
        if (e.plan === 'lz-go' && e.away.at === e.away.trail.length - 1 && e.away.phase !== 'lá') {
          e.away.phase = 'lá';
          if (e.away.lz.cc) e.away.leaveAt = t + VISIT_MS;
        }
        else if (e.plan === 'lz-back' && e.away.at === 0) { e.away = null; e.plan = 'seat'; }
      }
      if (e.fade > 0) { e.fade -= dt; if (e.fade <= 0) { this.dropEntity(e); continue; } }
      if (e.leaving && !e.path.length && !(e.fade > 0)) this.dropEntity(e);
    }
    // ocupação e luz das salas de lazer
    for (const lz of this.destinations) lz.present = 0;
    for (const e of this.entities.values()) if (e.away?.phase === 'lá' && !e.leaving) e.away.lz.present++;
    for (const lz of this.plan.leisure) {
      const lit = lz.present > 0;
      if (lit && !lz.lit) lz.litAt = performance.now();
      lz.lit = lit;
      lz.light += ((lit ? 1 : 0) - lz.light) * Math.min(1, dt * 2.5);
    }
    // luzes
    for (const lr of this.plan.rooms) {
      const target = lr.lit ? 1 : 0;
      lr.light += (target - lr.light) * Math.min(1, dt * 2.5);
    }
    // partículas
    for (const p of this.particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= (p.g || 0) * dt;
      if (p.z < 0) { p.z = 0; p.vx *= 0.5; p.vy *= 0.5; p.vz = 0; }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
    this.ambient(dt, t);
  }

  ambient(dt, t) {
    for (const e of this.entities.values()) {
      if (e.leaving || e.moving) continue;
      const atSeat = Math.hypot(e.x - e.seat.x, e.y - e.seat.y) < 0.05;
      if (atSeat && WORKING.has(e.state) && e.state !== 'stuck' && Math.random() < dt * 2.5) {
        const col = ACTIVITY_COLOR[e.activity] || '#e9e6d8';
        this.particles.push({ x: e.seat.x + (Math.random() - 0.5) * 0.8, y: e.seat.y - 0.9, z: 9, vx: 0, vy: 0, vz: 7, g: 0, life: 0.6, max: 0.6, color: col, size: 1 });
      }
      if (e.kind === 'staff' && !e.lr.lit && atSeat && Math.random() < dt * 0.05) {
        this.particles.push({ x: e.x + 0.3, y: e.y - 0.3, z: 16, vx: 0.25, vy: -0.25, vz: 3, g: 0, life: 2.4, max: 2.4, glyph: 'z', color: '#aab0d8' });
      }
      if (e.state === 'stuck' && Math.random() < dt * 0.6) {
        this.particles.push({ x: e.x + 0.3, y: e.y - 0.3, z: 18, vx: 0.2, vy: -0.2, vz: 3, g: 0, life: 2, max: 2, glyph: 'z', color: '#8f95b8' });
      }
    }
    for (const e of this.entities.values()) {
      const sp = !e.moving && this.leisureSpot(e);
      if (sp?.pose === 'sleep' && Math.random() < dt * 0.4) this.particles.push({ x: e.x + 0.3, y: e.y - 0.3, z: 14, vx: 0.25, vy: -0.25, vz: 3, g: 0, life: 2.4, max: 2.4, glyph: 'z', color: '#d8c8ff' });
      if (sp?.pose === 'eat' && Math.random() < dt * 1.2) this.particles.push({ x: e.x, y: e.y - 1.2, z: 9, vx: 0, vy: 0, vz: 4, g: 0, life: 1.2, max: 1.2, color: '#ffffff', size: 1, alpha: 0.5 });
    }
    for (const lz of this.plan.leisure) {
      if (lz.leisure !== 'church' || lz.light < 0.5 || Math.random() > dt * 3) continue;
      const x = lz.ox + lz.W / 2 - 1.9 + Math.random() * 3.8;
      this.particles.push({ x, y: lz.oy + 1, z: 7, vx: 0, vy: 0, vz: 2, g: 0, life: 0.5, max: 0.5, color: '#ffd166', size: 1 });
    }
    for (const lr of this.plan.rooms) {
      if (lr.cc || lr.light < 0.5) continue;
      if (Math.random() < dt * 2) this.particles.push({ x: lr.coffee.x + 0.5, y: lr.coffee.y - 1.05, z: 15, vx: (Math.random() - 0.5) * 0.3, vy: 0, vz: 5, g: 0, life: 1.4, max: 1.4, color: '#ffffff', size: 1, alpha: 0.5 });
    }
    // robô aspirador nos corredores
    const G = this.plan.graph;
    if (!this.robot && G.length) { const n = G[hash('robo') % G.length]; this.robot = { x: n.x, y: n.y, to: n }; }
    if (this.robot) {
      const r = this.robot;
      const dx = r.to.x - r.x, dy = r.to.y - r.y, d = Math.hypot(dx, dy);
      const sp = dt * 1.6;
      if (d <= sp) {
        r.x = r.to.x; r.y = r.to.y;
        const node = G.find((n) => n.x === r.to.x && n.y === r.to.y);
        const nb = node?.n || [];
        if (nb.length) { const [i, j] = nb[Math.floor(Math.random() * nb.length)]; r.to = this.plan.nodePos(i, j); }
      } else { r.x += (dx / d) * sp; r.y += (dy / d) * sp; }
    }
  }

  // ---------- camada estática ----------
  ensureStatic() {
    const hour = new Date().getHours();
    const key = this.planKey + '|' + hour + '|' + this.width + 'x' + this.height;
    if (key === this.staticKey) return;
    this.staticKey = key;
    const c = this.static;
    c.width = this.width; c.height = this.height;
    const g = c.getContext('2d');
    const P = this.P, { BW, BH } = this.plan;
    g.save();
    g.translate(-this.bbox[0], -this.bbox[1]);
    // laje do andar e corredores
    quadZ(g, P, 0, 0, BW, BH, 0, '#262b45');
    g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= BW; x += 1.5) { const [a, b] = P.p(x, 0), [c2, d] = P.p(x, BH); g.moveTo(a, b); g.lineTo(c2, d); }
    for (let y = 0; y <= BH; y += 1.5) { const [a, b] = P.p(0, y), [c2, d] = P.p(BW, y); g.moveTo(a, b); g.lineTo(c2, d); }
    g.stroke();
    // cabos de dados nos corredores
    for (const [a, b] of this.plan.edges) {
      const w = 0.16;
      if (Math.abs(a.y - b.y) < 0.01) quadZ(g, P, Math.min(a.x, b.x) - w, a.y - w, Math.max(a.x, b.x) + w, a.y + w, 0.02, '#1d4250');
      else quadZ(g, P, a.x - w, Math.min(a.y, b.y) - w, a.x + w, Math.max(a.y, b.y) + w, 0.02, '#1d4250');
    }
    for (const lr of this.plan.rooms) if (!lr.cc) { const w = 0.16; quadZ(g, P, lr.doorOut.x - w, lr.door.y, lr.doorOut.x + w, lr.doorOut.y + w, 0.02, '#1d4250'); }
    // paredes externas com janelas
    const [skyTop, skyBot] = skyColors(hour);
    const night = hour < 6 || hour >= 19;
    wallX(g, P, 0, BW, 0, 0, 22, '#343a63');
    wallY(g, P, 0, BH, 0, 0, 22, '#2b3157');
    for (let x = 3; x < BW - 3; x += 7) {
      wallX(g, P, x, x + 4, 0, 7, 19, '#1b1f3a');
      wallX(g, P, x + 0.2, x + 3.8, 0, 7.6, 18.4, skyBot);
      wallX(g, P, x + 0.2, x + 3.8, 0, 13.5, 18.4, skyTop);
      if (night) for (let s = 0; s < 3; s++) { const [sx, sy] = P.p(x + 0.5 + ((hash('s' + x + s) % 30) / 10), 0, 9 + (hash(x + 's' + s) % 9)); g.fillStyle = '#fff6c8'; g.fillRect(Math.round(sx), Math.round(sy), 1, 1); }
    }
    for (let y = 3; y < BH - 3; y += 7) {
      wallY(g, P, y, y + 4, 0, 7, 19, '#171a33');
      wallY(g, P, y + 0.2, y + 3.8, 0, 7.6, 18.4, skyBot);
      wallY(g, P, y + 0.2, y + 3.8, 0, 13.5, 18.4, skyTop);
    }
    wallX(g, P, 0, BW, 0, 21, 23, '#4a5185');
    wallY(g, P, 0, BH, 0, 21, 23, '#3d4475');
    // áreas de convivência
    for (const L of this.plan.lounges) this.drawLounge(g, P, L);
    // salas
    for (const lr of this.plan.rooms) this.drawRoomShell(g, P, lr);
    for (const lz of this.plan.leisure) { this.drawRoomShell(g, P, lz); this.drawLeisureWalls(g, P, lz); }
    g.restore();
  }

  // decoração de parede das salas de lazer (fica na camada estática)
  drawLeisureWalls(g, P, lz) {
    const { ox, oy } = lz;
    if (lz.leisure === 'gym') {
      wallX(g, P, ox + 2.6, ox + 12.6, oy, 2.5, 8, '#9fd8ff'); // espelho
      wallX(g, P, ox + 2.9, ox + 4.4, oy, 6.6, 7.6, '#e8f6ff');
      quadZ(g, P, ox + 2.6, oy + 1, ox + 12.6, oy + 4.8, 0.03, '#2a2e3a'); // piso de borracha
    } else if (lz.leisure === 'wc') {
      wallX(g, P, ox + 7.9, ox + 11.5, oy, 4, 8, '#bfe6f0');
      wallX(g, P, ox + 8.2, ox + 9.4, oy, 7, 7.6, '#ffffff');
    } else if (lz.leisure === 'food') {
      wallX(g, P, ox + 12, ox + 22, oy, 4.5, 7.5, '#2b2b33'); // cardápio
      for (let i = 0; i < 4; i++) wallX(g, P, ox + 12.6, ox + 16 + (i % 3) * 1.6, oy, 6.6 - i * 0.65, 7 - i * 0.65, '#ffd166');
    } else if (lz.leisure === 'rest') {
      wallX(g, P, ox + 10.4, ox + 13.4, oy, 5.2, 8.4, '#141824'); // TV
      quadZ(g, P, ox + 2, oy + 3.2, ox + 10, oy + 7.6, 0.03, '#a0566b'); // tapete
    } else if (lz.leisure === 'church') {
      const glass = ['#ff6b5e', '#ffd166', '#5fe0a8', '#6cc6ff', '#a98bff'];
      const c = lz.W / 2, d = c - 13.5; // decoração centrada no altar
      for (const [i, x] of [c - 12, c - 8.6, c - 5.2, c + 3.6, c + 7, c + 10.4].entries()) {
        wallX(g, P, ox + x, ox + x + 1.6, oy, 2.5, 8, '#3a3550');
        for (let k = 0; k < 4; k++) wallX(g, P, ox + x + 0.2, ox + x + 1.4, oy, 2.8 + k * 1.3, 3.9 + k * 1.3, glass[(i + k) % glass.length]);
      }
      wallX(g, P, ox + d + 13.3, ox + d + 13.7, oy, 3, 8.6, '#ffd166'); // cruz
      wallX(g, P, ox + d + 12.5, ox + d + 14.5, oy, 6.6, 7.1, '#ffd166');
      quadZ(g, P, ox + d + 12.6, oy + 2.2, ox + d + 14.4, oy + lz.H - 0.4, 0.03, '#a0364a'); // tapete do corredor
    }
  }

  drawLounge(g, P, L) {
    const { ox, oy, W, H, seed } = L;
    quadZ(g, P, ox + 1, oy + 1, ox + W - 1, oy + H - 1, 0.05, '#2f3555');
    quadZ(g, P, ox + 2.5, oy + 2.5, ox + W - 2.5, oy + H - 2.5, 0.08, seed % 2 ? '#5a3b6e' : '#3b5a6e');
    box(g, P, ox + 3, oy + 3, 6, 1, 3, '#d06a8a', '#a8506c', '#8c4058');
    box(g, P, ox + 3, oy + 3, 6, 0.35, 4, '#e07a9a', '#b8607c', '#9c4f68', 3);
    box(g, P, ox + 5, oy + 5.4, 2, 1.2, 3.5, '#a77a52', '#7d5838', '#694a30');
    for (const [px, py] of [[ox + 1.4, oy + 1.4], [ox + W - 2.4, oy + H - 2.4]]) {
      box(g, P, px, py, 0.9, 0.9, 5, '#8a5a3b', '#6b4430', '#57372a');
      box(g, P, px - 0.15, py - 0.15, 1.2, 1.2, 8, '#4fae6a', '#3c8a53', '#2f6e42', 5);
      box(g, P, px + 0.15, py + 0.15, 0.6, 0.6, 4, '#6fd08a', '#4fae6a', '#3c8a53', 13);
    }
  }

  drawRoomShell(g, P, lr) {
    const { ox, oy, W, H, theme: T } = lr;
    for (let ty = 0; ty < Math.ceil(H); ty++) for (let tx = 0; tx < W; tx++) {
      const h = Math.min(1, H - ty);
      quadZ(g, P, ox + tx, oy + ty, ox + tx + 1, oy + ty + h, 0, (tx + ty) % 2 ? T.a : T.b);
    }
    if (lr.cc) {
      // piso do centro de comando: grade luminosa
      g.strokeStyle = 'rgba(95,224,168,0.12)'; g.lineWidth = 1; g.beginPath();
      for (let x = ox; x <= ox + W; x += 2) { const [a, b] = P.p(x, oy), [c, d] = P.p(x, oy + H); g.moveTo(a, b); g.lineTo(c, d); }
      for (let y = oy; y <= oy + H; y += 2) { const [a, b] = P.p(ox, y), [c, d] = P.p(ox + W, y); g.moveTo(a, b); g.lineTo(c, d); }
      g.stroke();
    }
    const wh = lr.cc ? 12 : 9;
    box(g, P, ox, oy - 0.35, W, 0.35, wh, T.top, T.wall, T.trim);
    box(g, P, ox - 0.35, oy - 0.35, 0.35, H + 0.35, wh, T.top, T.trim, T.wall);
    // rodapé frontal e lateral com a porta aberta
    const dx0 = lr.door.x - 0.9, dx1 = lr.door.x + 0.9;
    box(g, P, ox - 0.35, oy + H, dx0 - ox + 0.35, 0.3, 2.5, T.top, T.wall, T.trim);
    box(g, P, dx1, oy + H, ox + W - dx1, 0.3, 2.5, T.top, T.wall, T.trim);
    box(g, P, ox + W, oy - 0.35, 0.3, H + 0.65, 2.5, T.top, T.trim, T.wall);
    quadZ(g, P, dx0, oy + H, dx1, oy + H + 0.3, 0.03, '#141726');
    if (!lr.cc && !lr.leisure) {
      // quadro branco
      wallX(g, P, ox + 1.2, ox + 5.2, oy, 2.5, 7.5, '#e9e6d8');
      wallX(g, P, ox + 1.6, ox + 3.6, oy, 5.4, 6, '#4f8cff');
      wallX(g, P, ox + 1.6, ox + 4.6, oy, 3.8, 4.4, '#ff6b5e');
      // luminárias no teto (só o suporte; a luz é dinâmica)
    }
  }

  // ---------- desenho do quadro ----------
  render(g, t, opts = {}) {
    if (!this.plan) return;
    this.ensureStatic();
    const P = this.P;
    g.save();
    g.clearRect(0, 0, g.canvas.width, g.canvas.height);
    g.drawImage(this.static, 0, 0);
    g.translate(-this.bbox[0], -this.bbox[1]);

    const items = [];
    const seated = new Map();
    for (const e of this.entities.values()) if (e.desk && !e.leaving && !e.moving && Math.hypot(e.x - e.seat.x, e.y - e.seat.y) < 0.05) seated.set(e.lr.room.id + ':' + e.desk.x + ':' + e.desk.y, e);
    for (const lr of this.plan.rooms) {
      const { ox, oy } = lr;
      for (const d of lr.desks) {
        const e = seated.get(lr.room.id + ':' + d.x + ':' + d.y);
        const x = ox + d.x, y = oy + d.y;
        items.push({ z: P.depth(x + 1.5, y + 1), f: () => this.drawDesk(g, P, x, y, e, lr, t) });
        items.push({ z: P.depth(x + 1.5, y + 1.75), f: () => box(g, P, x + 1.05, y + 1.55, 0.9, 0.35, e ? 5 : 6, '#3a3550', '#2a2640', '#221f35') });
      }
      if (lr.cc) { items.push({ z: P.depth(ox + 1, oy + 1), f: () => this.drawCommand(g, P, lr, t) }); continue; }
      const c = lr.coffee, w = lr.cooler;
      items.push({ z: P.depth(c.x + 0.5, c.y - 0.4), f: () => { box(g, P, c.x - 0.2, c.y - 1.4, 1.4, 0.8, 9, '#6b6f82', '#4a4d5e', '#3c3f4f'); box(g, P, c.x + 0.1, c.y - 1.3, 0.8, 0.5, 6, '#2a2a30', '#d94a4a', '#a53636', 9); } });
      items.push({ z: P.depth(w.x + 0.5, w.y - 0.4), f: () => { box(g, P, w.x, w.y - 1.2, 0.9, 0.7, 10, '#e9e6d8', '#c9c6b8', '#a9a698'); box(g, P, w.x + 0.15, w.y - 1.1, 0.6, 0.5, 6, '#9fd8ff', '#6cc6ff', '#4aa0d8', 10); } });
      const px = ox + lr.W - 1.5, py = oy + lr.H - 1.9;
      items.push({ z: P.depth(px + 0.5, py + 0.5), f: () => { box(g, P, px, py, 0.9, 0.9, 5, '#8a5a3b', '#6b4430', '#57372a'); box(g, P, px - 0.15, py - 0.15, 1.2, 1.2, 8, '#4fae6a', '#3c8a53', '#2f6e42', 5 + Math.sin(t / 900 + ox) * 0.4); box(g, P, px + 0.15, py + 0.15, 0.6, 0.6, 4, '#6fd08a', '#4fae6a', '#3c8a53', 13); } });
    }
    for (const lz of this.destinations) for (const pr of lz.props)
      items.push({ z: P.depth(pr.x + pr.w / 2, pr.y + pr.d), f: () => box(g, P, pr.x, pr.y, pr.w, pr.d, pr.h, pr.col[0], pr.col[1], pr.col[2], pr.z0) });
    for (const e of this.entities.values()) items.push({ z: P.depth(e.x, e.y) + 0.01, f: () => this.drawChar(g, P, e, t) });
    if (this.robot) { const r = this.robot; items.push({ z: P.depth(r.x, r.y), f: () => this.drawRobot(g, P, r, t) }); }
    items.sort((a, b) => a.z - b.z);
    for (const it of items) it.f();

    // escuridão das salas apagadas + noite
    const nightK = opts.nightK || 0;
    g.globalCompositeOperation = 'source-atop';
    if (nightK > 0) { g.fillStyle = `rgba(10,12,40,${0.32 * nightK})`; g.fillRect(this.bbox[0], this.bbox[1], this.width, this.height); }
    for (const lr of [...this.plan.rooms, ...this.plan.leisure]) {
      let light = lr.light;
      const since = performance.now() - lr.litAt;
      if (lr.lit && since < 900) light = Math.random() < 0.5 ? 1 : 0.15; // lâmpada piscando ao acender
      const dark = (lr.cc ? 0.25 : 0.62) * (1 - light);
      if (dark < 0.01) continue;
      const col = `rgba(6,8,22,${dark})`;
      const { ox, oy, W, H } = lr, wh = lr.cc ? 12 : 9;
      quadZ(g, P, ox - 0.35, oy - 0.35, ox + W + 0.3, oy + H + 0.3, 0, col);
      wallX(g, P, ox - 0.35, ox + W, oy - 0.35, 0, wh, col);
      wallY(g, P, oy - 0.35, oy + H, ox - 0.35, 0, wh, col);
    }
    g.globalCompositeOperation = 'lighter';
    for (const lr of [...this.plan.rooms, ...this.plan.leisure]) {
      if (lr.light < 0.05 || lr.cc) continue;
      const [sx, sy] = P.p(lr.ox + lr.W / 2, lr.oy + lr.H / 2, 0);
      const r = Math.round((lr.W + lr.H) * 4.2);
      g.globalAlpha = lr.light;
      g.drawImage(glow('#ffd696', 0.13, r), sx - r, sy - r);
      g.globalAlpha = 1;
    }
    for (const e of this.entities.values()) {
      if (e.leaving || !WORKING.has(e.state)) continue;
      const [sx, sy] = P.p(e.seat.x, e.seat.y - 1.3, 8);
      const col = ACTIVITY_COLOR[e.activity] || '#e9e6d8';
      g.drawImage(glow(col, 0.22 + 0.25 * nightK, 14), sx - 14, sy - 14);
    }
    this.drawPulses(g, P, t);
    g.globalCompositeOperation = 'source-over';

    this.drawParticles(g, P);
    for (const e of this.entities.values()) this.drawBubble(g, P, e, t);
    if (this.hoverKey && this.entities.has(this.hoverKey)) {
      const e = this.entities.get(this.hoverKey);
      const [sx, sy] = P.p(e.x, e.y, 0);
      g.strokeStyle = '#ffb547'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(sx, sy, 6, 3, 0, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
  }

  drawPulses(g, P, t) {
    for (const lr of this.plan.rooms) {
      if (lr.cc || !lr.lit || !lr.routeLen) continue;
      const alert = this.alertsByRoom.get(lr.room.id);
      const col = alert ? '#ff6b5e' : '#ffb547';
      const speed = alert ? 9 : 6;
      const n = Math.max(2, Math.round(lr.routeLen / 10));
      for (let i = 0; i < n; i++) {
        const d = ((t / 1000) * speed + (i * lr.routeLen) / n + (hash(lr.room.id) % 50)) % lr.routeLen;
        const p = along(lr.route, d);
        const [sx, sy] = P.p(p.x, p.y, 0.1);
        g.fillStyle = hexA(col, 0.9); g.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 3, 2);
        g.drawImage(glow(col, 0.35, 7), sx - 7, sy - 7);
      }
    }
  }

  drawCommand(g, P, lr, t) {
    const { ox, oy, W } = lr;
    const rooms = this.plan.rooms.filter((r) => !r.cc);
    // parede de telas atrás do trono: uma por sala
    const cols = Math.ceil(Math.sqrt(rooms.length * 2.2));
    const rows = Math.ceil(rooms.length / cols);
    const x0 = ox + 0.8, x1 = ox + W - 0.8, z0 = 2, z1 = 11.5;
    wallX(g, P, x0 - 0.3, x1 + 0.3, oy, z0 - 0.5, z1 + 0.5, '#0e1420');
    const cw = (x1 - x0) / cols, ch = (z1 - z0) / Math.max(rows, 1);
    rooms.forEach((r, i) => {
      const cx = x0 + (i % cols) * cw, cz = z1 - Math.floor(i / cols) * ch;
      const alert = this.alertsByRoom.get(r.room.id);
      let col = r.lit ? '#ffb547' : '#1f2a4a';
      if (alert) col = Math.floor(t / 400) % 2 ? '#ff6b5e' : '#5a1f1f';
      else if (r.lit && Math.sin(t / 300 + i) > 0.85) col = '#ffe2a8';
      wallX(g, P, cx + 0.1, cx + cw - 0.1, oy, cz - ch + 0.15, cz - 0.15, col);
    });
    // brilho dourado no piso em volta da mesa
    const pulse = 0.18 + Math.sin(t / 700) * 0.06;
    ellipse(g, P, ox + 6, oy + 3.4, 4.6, 0.04, `rgba(255,209,102,${pulse})`);
    // sirene quando há alerta
    if (this.snap?.alerts?.length) {
      const on = Math.floor(t / 350) % 2 === 0;
      box(g, P, ox - 0.2, oy - 0.2, 0.8, 0.8, 2, on ? '#ff6b5e' : '#7a2a2a', on ? '#ff8a7e' : '#5a1f1f', '#5a1f1f', 12);
    }
  }

  drawDesk(g, P, x, y, e, lr, t) {
    const cc = lr.cc;
    box(g, P, x, y, 3, 1.1, 7, cc ? '#33415f' : '#a77a52', cc ? '#24304a' : '#7d5838', cc ? '#1c263c' : '#694a30');
    const on = e && WORKING.has(e.state) && lr.light > 0.3;
    const col = on ? (ACTIVITY_COLOR[e.activity] || '#e9e6d8') : null;
    box(g, P, x + 1.35, y + 0.3, 0.3, 0.2, 1.5, '#20202a', '#2a2a36', '#1a1a22', 7);
    box(g, P, x + 0.9, y + 0.25, 1.2, 0.2, 6.5, '#20202a', '#2a2a36', '#1a1a22', 8.2);
    const flick = on ? (Math.sin(t / 180 + x) > -0.8 ? 1 : 0.7) : 1;
    poly(g, P, [[x + 1.0, y + 0.45, 8.8], [x + 2.0, y + 0.45, 8.8], [x + 2.0, y + 0.45, 14.2], [x + 1.0, y + 0.45, 14.2]], on ? hexA(col, flick) : '#15161f');
    if (on) {
      for (let i = 0; i < 3; i++) {
        const len = 0.3 + ((Math.floor(t / 400) + i * 7 + x) % 5) / 10;
        poly(g, P, [[x + 1.1, y + 0.45, 12.5 - i * 1.5], [x + 1.1 + len, y + 0.45, 12.5 - i * 1.5], [x + 1.1 + len, y + 0.45, 13 - i * 1.5], [x + 1.1, y + 0.45, 13 - i * 1.5]], 'rgba(20,20,30,0.55)');
      }
    } else if (e && lr.light > 0.3 && Math.floor(t / 900) % 2) {
      poly(g, P, [[x + 1.85, y + 0.45, 9], [x + 1.95, y + 0.45, 9], [x + 1.95, y + 0.45, 9.6], [x + 1.85, y + 0.45, 9.6]], '#5fe0a8');
    }
    if (!cc) {
      box(g, P, x + 2.4, y + 0.4, 0.3, 0.3, 2, '#e9e6d8', '#ff6b5e', '#d24c42', 7);
      box(g, P, x + 0.25, y + 0.5, 0.5, 0.4, 0.6, '#f4f1e4', '#f4f1e4', '#d8d4c4', 7);
    }
  }

  leisureSpot(e) { return e.away?.phase === 'lá' ? e.away.lz.spots[e.away.spot] : null; }

  drawChar(g, P, e, t) {
    const atSeat = !e.leaving && !e.moving && Math.hypot(e.x - e.seat.x, e.y - e.seat.y) < 0.05;
    const step = Math.floor(t / 150) % 2;
    const sp = !e.moving && this.leisureSpot(e);
    let frame, lift = 0, bob = 0;
    if (e.fade > 0) g.globalAlpha = clamp(e.fade / 0.6, 0, 1);
    if (e.kind === 'god') {
      const [sx, sy] = P.p(e.x, e.y, 0);
      const fr = Math.floor(t / 2400 + e.phase) % 4 === 0 ? 'HAND_B' : Math.floor(t / 160) % 2 ? 'TYPE_A' : 'TYPE_B';
      const top = Math.round(sy - 14);
      g.drawImage(sprite(fr, e.pal, 1), Math.round(sx - 4), top);
      // auréola
      g.globalAlpha = 0.75 + Math.sin(t / 400) * 0.25;
      g.fillStyle = '#ffd166';
      g.fillRect(Math.round(sx - 3), top - 3, 6, 1); g.fillRect(Math.round(sx - 4), top - 2, 1, 1); g.fillRect(Math.round(sx + 3), top - 2, 1, 1);
      g.globalAlpha = 1;
      return;
    }
    if (sp?.pose === 'hide') {
      // dentro da cabine: não aparece, só a luz de "ocupado" na porta
      const [sx, sy] = P.p(sp.x, sp.y + 1.4, 8);
      g.fillStyle = '#ff6b5e'; g.fillRect(Math.round(sx) - 1, Math.round(sy), 2, 1);
      g.globalAlpha = 1;
      return;
    }
    if (sp) {
      const ph = t / 1000 + e.phase;
      if (sp.pose === 'run') { frame = Math.floor(t / 110) % 2 ? 'FRONT_WALK' : 'FRONT'; bob = Math.floor(t / 110) % 2 ? -1 : 0; lift = 1; }
      else if (sp.pose === 'lift') frame = Math.floor(ph * 1.2) % 2 ? 'HAND' : 'HAND_B';
      else if (sp.pose === 'eat') { frame = Math.floor(ph / 1.3) % 3 === 0 ? 'HAND_B' : 'SIT'; lift = 2; }
      else if (sp.pose === 'sit' || sp.pose === 'sleep') { frame = 'SIT'; lift = 2; }
      else frame = 'BACK'; // pray, play, stand, hide: de costas para o altar/máquina/espelho
    }
    if (frame) {
      const [sx, sy] = P.p(e.x, e.y, 0);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(Math.round(sx - 3), Math.round(sy - 1), 6, 2);
      g.drawImage(sprite(frame, e.pal, 1), Math.round(sx - 4), Math.round(sy - 12 - lift + bob));
      g.globalAlpha = 1;
      return;
    }
    if (e.moving) frame = e.facing === 'up' ? (step ? 'BACK_WALK' : 'BACK') : (step ? 'FRONT_WALK' : 'FRONT');
    else if (atSeat && !e.desk) frame = Math.floor(t / 700 + e.phase) % 3 === 0 ? 'HAND_B' : 'FRONT'; // fiscal anotando na prancheta
    else if (atSeat && (e.state === 'asking' || e.state === 'waiting')) frame = Math.floor(t / 400) % 2 ? 'HAND' : 'HAND_B';
    else if (atSeat && e.state === 'working') frame = Math.floor(t / 140 + e.phase) % 2 ? 'TYPE_A' : 'TYPE_B';
    else if (atSeat) frame = 'SIT';
    else frame = Math.floor(t / 900 + e.phase) % 6 === 0 ? 'HAND_B' : 'FRONT'; // conversa no café
    const [sx, sy] = P.p(e.x, e.y, 0);
    lift = atSeat && e.desk && frame !== 'HAND' && frame !== 'HAND_B' ? 2 : 0;
    bob = e.moving ? (step ? -1 : 0) : 0;
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(Math.round(sx - 3), Math.round(sy - 1), 6, 2);
    g.drawImage(sprite(frame, e.pal, 1), Math.round(sx - 4), Math.round(sy - 12 - lift + bob));
    if (e.kind === 'intern') { g.fillStyle = '#ffd166'; g.fillRect(Math.round(sx - 1), Math.round(sy - 6 - lift + bob), 2, 1); }
    if (e.kind === 'claude') { g.fillStyle = '#ffd7c2'; g.fillRect(Math.round(sx + 2), Math.round(sy - 12 - lift + bob), 1, 1); }
    if (e.kind === 'codex') {
      const top = Math.round(sy - 12 - lift + bob), lx = Math.round(sx - 4);
      g.fillStyle = '#0b1328'; g.fillRect(lx, top + 1, 9, 1); // aba do quepe
      g.fillStyle = '#ffd166'; g.fillRect(lx + 3, top, 2, 1); // distintivo do quepe
      if (!e.desk || !atSeat) { g.fillStyle = '#e9dcb8'; g.fillRect(lx + 7, top + 6, 3, 4); g.fillStyle = '#8a6a3b'; g.fillRect(lx + 7, top + 6, 3, 1); } // prancheta
    }
    g.globalAlpha = 1;
  }

  drawRobot(g, P, r, t) {
    const [sx, sy] = P.p(r.x, r.y, 0);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(sx, sy + 0.5, 4, 2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c9cbd6'; g.beginPath(); g.ellipse(sx, sy - 1, 4, 2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#8f95b8'; g.fillRect(Math.round(sx - 4), Math.round(sy - 1), 8, 1);
    g.fillStyle = Math.floor(t / 500) % 2 ? '#5fe0a8' : '#1d4250'; g.fillRect(Math.round(sx), Math.round(sy - 2), 1, 1);
  }

  drawParticles(g, P) {
    for (const p of this.particles) {
      const [sx, sy] = P.p(p.x, p.y, p.z);
      const a = Math.min(1, p.life / p.max * 1.5) * (p.alpha ?? 1);
      g.globalAlpha = a;
      g.fillStyle = p.color;
      if (p.glyph === 'z') { g.fillRect(Math.round(sx), Math.round(sy), 3, 1); g.fillRect(Math.round(sx) + 1, Math.round(sy) + 1, 1, 1); g.fillRect(Math.round(sx), Math.round(sy) + 2, 3, 1); }
      else if (p.glyph === 'stamp') {
        const x = Math.round(sx), y = Math.round(sy);
        g.fillStyle = '#0b0e1a'; g.fillRect(x - 7, y - 6, 14, 12);
        g.fillStyle = p.color; g.fillRect(x - 7, y - 6, 14, 1); g.fillRect(x - 7, y + 5, 14, 1); g.fillRect(x - 7, y - 6, 1, 12); g.fillRect(x + 6, y - 6, 1, 12);
        const M = { check: [[-3, 0], [-2, 1], [-1, 2], [0, 1], [1, 0], [2, -1], [3, -2]], cross: [[-3, -3], [-2, -2], [-1, -1], [0, 0], [1, 1], [2, 2], [3, 3], [3, -3], [2, -2], [1, -1], [-1, 1], [-2, 2], [-3, 3]],
          bang: [[0, -3], [0, -2], [0, -1], [0, 0], [0, 2]], quest: [[-1, -3], [0, -3], [1, -3], [2, -2], [1, -1], [0, 0], [0, 2]] }[p.mark] || [];
        for (const [dx, dy] of M) g.fillRect(x + dx, y + dy, 1, 1);
      }
      else if (p.glyph === 'check') { g.fillStyle = '#0b0e1a'; g.fillRect(Math.round(sx) - 5, Math.round(sy) - 4, 10, 8); g.fillStyle = p.color; [[-3, 0], [-2, 1], [-1, 2], [0, 1], [1, 0], [2, -1], [3, -2]].forEach(([dx, dy]) => g.fillRect(Math.round(sx) + dx, Math.round(sy) + dy, 1, 1)); }
      else g.fillRect(Math.round(sx), Math.round(sy), p.size || 1, p.size || 1);
    }
    g.globalAlpha = 1;
  }

  drawBubble(g, P, e, t) {
    if (e.leaving || e.moving) return;
    if (!(WORKING.has(e.state))) return;
    const urgent = e.state === 'asking' || e.state === 'waiting';
    const [sx, sy] = P.p(e.x, e.y, 0);
    const bob = urgent ? Math.round(Math.sin(t / 160) * 1.5) : 0;
    const x = Math.round(sx + 3), y = Math.round(sy - 24 + bob);
    const icon = ICONS[e.activity] || ICONS['trabalhando'];
    const col = urgent ? '#ff6b5e' : e.state === 'stuck' ? '#8f95b8' : (ACTIVITY_COLOR[e.activity] || '#e9e6d8');
    g.fillStyle = urgent ? '#ff6b5e' : '#151a2e';
    g.fillRect(x, y, 9, 8); g.fillRect(x, y + 8, 2, 1); g.fillRect(x - 1, y + 9, 1, 1);
    g.fillStyle = urgent ? '#fff6ee' : col;
    icon.forEach((row, iy) => { for (let ix = 0; ix < 5; ix++) if (row[ix] === '#') g.fillRect(x + 2 + ix, y + 1.5 + iy, 1, 1); });
  }

  // ---------- interação ----------
  // (lx, ly) em pixels do canvas do mundo
  hitTest(lx, ly) {
    if (!this.plan) return null;
    const wx = lx + this.bbox[0], wy = ly + this.bbox[1];
    let best = null;
    for (const e of this.entities.values()) {
      const [sx, sy] = this.P.p(e.x, e.y, 0);
      if (wx >= sx - 5 && wx <= sx + 5 && wy >= sy - 16 && wy <= sy + 2) {
        const d = this.P.depth(e.x, e.y);
        if (!best || d > best.d) best = { d, e };
      }
    }
    if (best) return { type: 'agent', key: best.e.key, e: best.e };
    const [tx, ty] = this.P.inv(wx, wy);
    const lr = [...this.plan.rooms, ...this.plan.leisure].find((r) => tx >= r.ox && tx <= r.ox + r.W && ty >= r.oy && ty <= r.oy + r.H);
    return lr ? { type: 'room', lr } : null;
  }

  roomCenter(lr) {
    const [sx, sy] = this.P.p(lr.ox + lr.W / 2, lr.oy + lr.H / 2, 4);
    return { x: sx - this.bbox[0], y: sy - this.bbox[1], w: (lr.W + lr.H) * 8 + 40, h: (lr.W + lr.H) * 4 + 50 };
  }

  // rótulos em resolução de tela; toScreen converte pixel do mundo em pixel da tela
  labels(g, toScreen, zoom, k, t) {
    if (!this.plan) return;
    const P = this.P;
    const placed = [];
    const hits = (r) => placed.some((p) => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y);
    const at = (x, y, z) => { const [sx, sy] = P.p(x, y, z); return toScreen(sx - this.bbox[0], sy - this.bbox[1]); };
    const rooms = [...this.plan.rooms].sort((a, b) => (b.cc - a.cc) || (b.lit - a.lit));
    // salas de nome completo (a igreja) primeiro: o rótulo delas nunca é escondido nem cortado
    const full = this.plan.leisure.filter((l) => l.room.full);
    for (const lr of [...full, ...rooms, ...this.plan.leisure.filter((l) => !l.room.full)]) {
      if (lr.cc) continue; // o centro de comando não leva rótulo, só o Friol na mesa
      const r = lr.room;
      const alert = this.alertsByRoom.get(r.id);
      const fs = Math.round(clamp(10 * k * Math.sqrt(zoom), 10 * k, 22 * k) * (lr.cc ? 1.25 : lr.leisure ? 0.85 : 1));
      g.font = `700 ${fs}px Silkscreen, monospace`;
      const [cx, cy] = at(lr.ox + lr.W / 2, lr.oy, lr.cc ? 18 : 13);
      const maxW = lr.cc ? Math.max(260 * k, (lr.W + lr.H) * 8 * zoom) : Math.max(60, (lr.W + lr.H) * 8 * zoom * 0.62);
      let name = r.name.toUpperCase(), lines = [name];
      if (r.full) {
        // nome completo sempre (pedido do dono): quebra em duas linhas no espaço mais perto do meio
        if (g.measureText(name).width > maxW - fs * 1.6) {
          const sp = [...name.matchAll(/ /g)].map((m) => m.index);
          const cut = sp.reduce((b, i) => (Math.abs(i - name.length / 2) < Math.abs(b - name.length / 2) ? i : b), sp[0]);
          lines = [name.slice(0, cut), name.slice(cut + 1)];
        }
      } else while (g.measureText(name).width > maxW - fs * 1.6 && name.length > 3) { name = name.slice(0, -2) + '…'; lines = [name]; }
      const tw = Math.max(...lines.map((l) => g.measureText(l).width));
      const pad = fs * 0.45, dot = fs * 0.55;
      const w = tw + pad * 3 + dot, h = fs * lines.length + pad * (1.4 + (lines.length - 1) * 0.6);
      const rect = { x: cx - w / 2, y: cy - h, w, h };
      if (hits(rect) && !r.full) continue;
      placed.push(rect);
      const blink = alert && Math.floor(t / 600) % 2 === 0;
      g.fillStyle = blink ? '#ff6b5e' : lr.cc ? 'rgba(13,40,48,0.92)' : 'rgba(11,14,26,0.88)';
      g.fillRect(rect.x, rect.y, w, h);
      const lit = lr.leisure ? lr.lit : r.lit;
      g.fillStyle = lr.cc ? '#5fe0a8' : lr.leisure ? (lit ? '#9fe0c8' : '#3b4266') : (alert ? '#ff6b5e' : lit ? '#ffb547' : '#3b4266');
      if (!blink) g.fillRect(rect.x + pad, rect.y + (h - dot) / 2, dot, dot);
      g.fillStyle = blink ? '#0b0e1a' : (lit || lr.cc ? '#ece8d9' : '#8f95b8');
      lines.forEach((l, i) => g.fillText(l, rect.x + pad * 2 + dot, rect.y + h - pad * 0.85 - (lines.length - 1 - i) * (fs + pad * 0.6)));
    }
    if (zoom < 2.1) return;
    const lf = Math.round(clamp(4.2 * zoom, 11 * k, 20 * k));
    g.font = `700 ${lf}px "Atkinson Hyperlegible", sans-serif`;
    const prio = (e) => (e.state === 'asking' || e.state === 'waiting' ? 0 : WORKING.has(e.state) ? 1 : 2);
    const list = [...this.entities.values()].filter((e) => !e.leaving && (WORKING.has(e.state) || e.kind === 'claude' || e.kind === 'codex' || e.kind === 'god' || e.lr.lit || e.away)).sort((a, b) => prio(a) - prio(b));
    for (const e of list) {
      const [x, y] = at(e.x, e.y, 0);
      const role = e.kind === 'claude' ? 'Claude' : shortRole(e.role);
      const sp = this.leisureSpot(e);
      const opts = e.kind === 'god' ? ['Friol · onipotente', 'Friol'] : WORKING.has(e.state) ? [`${e.name} · ${e.activity}`, e.name] : sp ? [`${e.name} · ${sp.act}`, e.name] : [`${e.name} · ${role}`, e.name];
      for (const txt of opts) {
        const tw = g.measureText(txt).width;
        const r = { x: x - tw / 2 - 5, y: y + 3, w: tw + 10, h: lf + 6 };
        if (hits(r)) continue;
        placed.push(r);
        const urgent = prio(e) === 0;
        g.fillStyle = urgent ? '#ff6b5e' : 'rgba(11,14,26,0.82)';
        g.fillRect(r.x, r.y, r.w, r.h);
        g.fillStyle = urgent ? '#0b0e1a' : e.kind === 'god' ? '#ffd166' : e.kind === 'claude' ? '#ffb08f' : e.kind === 'intern' ? '#ffd166' : e.kind === 'codex' ? '#9fc1ff' : '#e9e6d8';
        g.fillText(txt, x - tw / 2, y + lf + 4);
        break;
      }
    }
  }
}
