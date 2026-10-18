// Modo 3D (v7): o mesmo prédio do Office desenhado com Three.js. Só lê office.plan e office.entities;
// quem senta onde, lazer e demonstração continuam todos no office.js. Carregado sob demanda pelo app.js.
// Coordenadas de tela do contrato (project, hitTest, pan, zoomAt) são pixels do dispositivo (CSS × DPR),
// as mesmas do canvas 2D por cima, onde ficam os rótulos.
import * as THREE from './vendor/three-0.186.1/three.module.js';
import { Collector, P3, ZS, PXW, AZ0, EL0, AZ_MIN, AZ_MAX, EL_MIN, EL_MAX, SPIN, clamp, orbit, spinAz, groundAxes, height } from './geo3d.js';
import { sprite, hash, ICONS, ACTIVITY_COLOR } from './sprites.js';
import { along } from './building.js';

THREE.ColorManagement.enabled = false; // cores do 2D passam direto, sem conversão de espaço de cor

const WORKING = new Set(['working', 'asking', 'waiting', 'stuck']);
const FOV = 30;
const MAX_ROOMS = 128;
const UNIT_2D = 1 / PXW; // px do isométrico por unidade do mundo (perpendicular à vista) com zoom 1

const VERT = `
attribute vec4 aColor;
attribute vec2 aMeta;
uniform vec4 uRoom[${MAX_ROOMS}];
uniform float uNight;
varying vec4 vColor;
void main() {
  vec3 p = position;
  vec4 c = aColor;
  int r = int(aMeta.x + 0.5) - 1;
  if (r >= 0 && r < ${MAX_ROOMS}) {
    vec4 R = uRoom[r]; // x = escuridão, y = paredes rebaixadas, z = luz
    if (R.y > 0.5 && aMeta.y > 0.5) p.y = min(p.y, ${(2.5 * ZS).toFixed(6)});
    c.rgb = mix(c.rgb, vec3(6.0, 8.0, 22.0) / 255.0, R.x);
    c.rgb += vec3(1.0, 0.84, 0.59) * 0.05 * R.z;
  }
  c.rgb = mix(c.rgb, vec3(10.0, 12.0, 40.0) / 255.0, 0.32 * uNight);
  vColor = c;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FRAG = `
varying vec4 vColor;
void main() { gl_FragColor = vColor; }`;
const PVERT = `
attribute vec4 aColor;
attribute float aSize;
uniform float uScale;
varying vec4 vColor;
varying float vSoft;
void main() {
  vColor = aColor;
  vSoft = aSize < 0.0 ? 1.0 : 0.0;
  gl_PointSize = max(1.0, abs(aSize) * uScale);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const PFRAG = `
varying vec4 vColor;
varying float vSoft;
void main() {
  vec4 c = vColor;
  if (vSoft > 0.5) c.a *= 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5));
  if (c.a < 0.01) discard;
  gl_FragColor = c;
}`;

// ---------- texturas de pixel art ----------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// personagem: 10×15, 3 linhas livres em cima para a auréola; sprite em (0, 3), mesmos detalhes do drawChar
function figureCanvas(e, pose) {
  const c = canvas(10, 15), g = c.getContext('2d');
  g.drawImage(sprite(pose.frame, e.pal, 1), 0, 3);
  if (pose.god) {
    g.fillStyle = '#ffd166'; g.globalAlpha = 0.9;
    g.fillRect(1, 0, 6, 1); g.fillRect(0, 1, 1, 1); g.fillRect(7, 1, 1, 1);
    return c;
  }
  if (!pose.extras) return c;
  if (e.kind === 'intern') { g.fillStyle = '#ffd166'; g.fillRect(3, 9, 2, 1); }
  if (e.kind === 'claude') { g.fillStyle = '#ffd7c2'; g.fillRect(6, 3, 1, 1); }
  if (e.kind === 'codex') {
    g.fillStyle = '#0b1328'; g.fillRect(0, 4, 9, 1);
    g.fillStyle = '#ffd166'; g.fillRect(3, 3, 2, 1);
    if (!e.desk || !pose.atSeat) { g.fillStyle = '#e9dcb8'; g.fillRect(7, 9, 3, 4); g.fillStyle = '#8a6a3b'; g.fillRect(7, 9, 3, 1); }
  }
  return c;
}
const figureKey = (e, pose) => `f|${e.key}|${pose.frame}|${pose.god ? 1 : 0}|${pose.extras ? 1 : 0}|${e.kind === 'codex' && (!e.desk || !pose.atSeat) ? 1 : 0}`;
// balão: 10×10, igual ao drawBubble (origem 1 px à esquerda do balão por causa da ponta)
function bubbleCanvas(icon, bg, fg) {
  const c = canvas(10, 10), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(1, 0, 9, 8); g.fillRect(1, 8, 2, 1); g.fillRect(0, 9, 1, 1);
  g.fillStyle = fg;
  icon.forEach((row, iy) => { for (let ix = 0; ix < 5; ix++) if (row[ix] === '#') g.fillRect(3 + ix, 2 + iy, 1, 1); });
  return c;
}
const MARKS = { check: [[-3, 0], [-2, 1], [-1, 2], [0, 1], [1, 0], [2, -1], [3, -2]], cross: [[-3, -3], [-2, -2], [-1, -1], [0, 0], [1, 1], [2, 2], [3, 3], [3, -3], [2, -2], [1, -1], [-1, 1], [-2, 2], [-3, 3]],
  bang: [[0, -3], [0, -2], [0, -1], [0, 0], [0, 2]], quest: [[-1, -3], [0, -3], [1, -3], [2, -2], [1, -1], [0, 0], [0, 2]] };
// partículas com desenho (zzz, carimbo do fiscal, check da tarefa concluída), como no drawParticles
function glyphCanvas(p) {
  if (p.glyph === 'z') { const c = canvas(3, 3), g = c.getContext('2d'); g.fillStyle = p.color; g.fillRect(0, 0, 3, 1); g.fillRect(1, 1, 1, 1); g.fillRect(0, 2, 3, 1); return c; }
  if (p.glyph === 'stamp') {
    const c = canvas(14, 12), g = c.getContext('2d');
    g.fillStyle = '#0b0e1a'; g.fillRect(0, 0, 14, 12);
    g.fillStyle = p.color; g.fillRect(0, 0, 14, 1); g.fillRect(0, 11, 14, 1); g.fillRect(0, 0, 1, 12); g.fillRect(13, 0, 1, 12);
    for (const [dx, dy] of MARKS[p.mark] || []) g.fillRect(7 + dx, 6 + dy, 1, 1);
    return c;
  }
  const c = canvas(10, 8), g = c.getContext('2d');
  g.fillStyle = '#0b0e1a'; g.fillRect(0, 0, 10, 8);
  g.fillStyle = p.color; for (const [dx, dy] of MARKS.check) g.fillRect(5 + dx, 4 + dy, 1, 1);
  return c;
}

function pixelTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}

export function createView3d(opts) { return new View3d(opts); }

class View3d {
  constructor({ office, host, before, spin = true, onLost }) {
    this.office = office;
    this.spin = spin;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'screen3d';
    this.lost = (ev) => { ev.preventDefault(); this.dead = true; onLost?.(); };
    this.canvas.addEventListener('webglcontextlost', this.lost);
    host.insertBefore(this.canvas, before);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    } catch (err) {
      this.canvas.removeEventListener('webglcontextlost', this.lost);
      this.canvas.remove();
      throw err;
    }
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(FOV, 1, 1, 4000);
    this.uniforms = { uRoom: { value: Array.from({ length: MAX_ROOMS }, () => new THREE.Vector4()) }, uNight: { value: 0 } };
    const mat = (transparent) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.DoubleSide, transparent, depthWrite: !transparent });
    this.matOp = mat(false); this.matTr = mat(true);
    this.layers = { statOp: this.mesh(this.matOp, 0), statTr: this.mesh(this.matTr, 2), dynOp: this.mesh(this.matOp, 0), dynTr: this.mesh(this.matTr, 2) };
    this.cs = new Collector(); this.cd = new Collector();
    // partículas simples e pulsos dos corredores
    this.pUniforms = { uScale: { value: 1 } };
    this.pMat = new THREE.ShaderMaterial({ vertexShader: PVERT, fragmentShader: PFRAG, uniforms: this.pUniforms, transparent: true, depthWrite: false });
    this.pCap = 0; this.points = null;
    // personagens, balões e partículas desenhadas: planos de pé virados para a câmera
    this.figGeo = new THREE.PlaneGeometry(10 * PXW, 15 * ZS).translate(1 * PXW, 7.5 * ZS, 0);
    this.bubGeo = new THREE.PlaneGeometry(10 * PXW, 10 * ZS).translate(7 * PXW, 5 * ZS, 0);
    this.glyphGeo = new THREE.PlaneGeometry(1, 1);
    this.figs = new Map(); this.bubs = new Map(); this.glyphs = [];
    this.tex = new Map();
    this.blank = pixelTexture(canvas(1, 1)); // material já nasce com textura: trocar depois não recompila o shader
    this.staticKey = '';
    this.rooms = []; this.roomIdx = new Map();
    this.focusId = null;
    this.frames = 0;
    this.ready = new Promise((resolve) => { this.resolveReady = resolve; });
    this.W = 1; this.H = 1; this.dpr = 1; this.fbPerDevice = 1;
    this.baseAz = AZ0; this.el = EL0;
    this.c = { x: 0, y: 0, dist: 200, az: AZ0, el: EL0 };
    this.goal = { x: 0, y: 0, dist: 200 };
    this.v = new THREE.Vector3();
    this.ray = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  mesh(material, order) {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), material);
    m.frustumCulled = false; m.renderOrder = order;
    this.scene.add(m);
    return m;
  }

  // liga os arrays do coletor à geometria (recria só quando o coletor cresceu)
  upload(m, B) {
    let geo = m.geometry;
    if (geo.userData.cap !== B.cap) {
      geo.dispose();
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(B.pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aColor', new THREE.BufferAttribute(B.col, 4).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aMeta', new THREE.BufferAttribute(B.meta, 2).setUsage(THREE.DynamicDrawUsage));
      geo.userData.cap = B.cap;
      m.geometry = geo;
    }
    for (const [name, size] of [['position', 3], ['aColor', 4], ['aMeta', 2]]) {
      const a = geo.getAttribute(name);
      if (!a) continue;
      a.clearUpdateRanges(); a.addUpdateRange(0, B.n * size); a.needsUpdate = true;
    }
    geo.setDrawRange(0, B.n);
  }

  texture(key, draw) {
    let t = this.tex.get(key);
    if (t) return t;
    if (this.tex.size > 3000) this.clearTextures();
    t = pixelTexture(draw());
    this.tex.set(key, t);
    return t;
  }
  clearTextures() {
    for (const t of this.tex.values()) t.dispose();
    this.tex.clear();
    for (const f of [...this.figs.values(), ...this.bubs.values(), ...this.glyphs]) f.mat.map = this.blank;
  }

  // ---------- tamanho e câmera ----------
  resize(W, H) {
    this.W = Math.max(1, W); this.H = Math.max(1, H);
    this.dpr = window.devicePixelRatio || 1;
    const pr = Math.min(this.dpr, 1.5);
    this.fbPerDevice = pr / this.dpr; // única conversão entre pixel do dispositivo e do renderer
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.W / this.dpr, this.H / this.dpr, false);
    this.cam.aspect = this.W / this.H;
    this.cam.updateProjectionMatrix();
  }

  place(cam, x, y, dist, az, el) {
    const [X, Y, Z] = orbit(x, y, dist, az, el);
    cam.position.set(X, Y, Z);
    cam.near = Math.max(0.2, dist * 0.05); cam.far = dist * 6 + 400;
    cam.lookAt(x, 0, y);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  // distância em que os pontos cabem na fração `fill` da tela
  fitDist(x, y, pts, fill, azs) {
    const cam = this.cam.clone();
    let worst = 0;
    for (const az of azs) {
      let d = 200;
      for (let it = 0; it < 5; it++) {
        this.place(cam, x, y, d, az, this.el);
        let m = 1e-6;
        for (const [px, py, pz] of pts) {
          this.v.set(px, pz * ZS, py).project(cam);
          if (this.v.z > 1) { m = 10; break; }
          m = Math.max(m, Math.abs(this.v.x), Math.abs(this.v.y));
        }
        d *= m / fill;
      }
      worst = Math.max(worst, d);
    }
    return worst;
  }
  // zoom equivalente ao do 2D (px do dispositivo por px isométrico) a uma distância d do alvo
  zoomAt(d) {
    const f = (this.H / 2) / Math.tan((FOV * Math.PI) / 360);
    return (f / d) / UNIT_2D;
  }
  zoomEff() { return this.zoomAt(this.c.dist); }

  spinAngles(base) { return this.spin ? [clamp(base - SPIN, AZ_MIN, AZ_MAX), base, clamp(base + SPIN, AZ_MIN, AZ_MAX)] : [base]; }
  overviewDist() {
    const { BW, BH } = this.office.plan;
    const pts = [[0, 0, 0], [BW, 0, 0], [0, BH, 0], [BW, BH, 0], [0, 0, 24], [BW, 0, 24], [0, BH, 24], [BW, BH, 24]];
    return this.fitDist(BW / 2, BH / 2, pts, 0.94, this.spinAngles(this.baseAz));
  }

  fit() {
    if (!this.office.plan) return;
    const { BW, BH } = this.office.plan;
    this.focusId = null;
    Object.assign(this.goal, { x: BW / 2, y: BH / 2, dist: this.overviewDist() });
  }
  // mesmo critério do 2D: preenche `fill` da tela, sem passar do zoom `max` nem ficar perto demais da visão geral
  focus(lr, fill = 0.9, max = 4) {
    if (!this.office.plan) return;
    const { ox, oy, W, H } = lr;
    const pts = [[ox - 1, oy - 1, 0], [ox + W + 1, oy - 1, 0], [ox - 1, oy + H + 1, 0], [ox + W + 1, oy + H + 1, 0], [ox - 1, oy - 1, 16], [ox + W + 1, oy + H + 1, 16]];
    const x = ox + W / 2, y = oy + H / 2;
    let d = this.fitDist(x, y, pts, fill, [this.baseAz]);
    d = Math.max(d, this.zoomAt(1) / max);
    d = Math.min(d, this.overviewDist() / 1.6);
    this.focusId = lr.room.id;
    Object.assign(this.goal, { x, y, dist: d });
  }
  snap() { this.c.x = this.goal.x; this.c.y = this.goal.y; this.c.dist = this.goal.dist; this.c.az = this.baseAz; this.c.el = this.el; }

  update(dt, now, spinning) {
    const k = Math.min(1, dt * 1.4);
    const c = this.c, g = this.goal;
    c.x += (g.x - c.x) * k; c.y += (g.y - c.y) * k;
    c.dist = Math.exp(Math.log(c.dist) + (Math.log(g.dist) - Math.log(c.dist)) * k);
    const az = spinAz(this.baseAz, now, this.spin && spinning && !this.focusId);
    c.az += (az - c.az) * Math.min(1, dt * 0.8);
    c.el += (this.el - c.el) * k;
  }

  // ---------- mouse ----------
  pan(dx, dy) {
    const u = (this.c.dist * 2 * Math.tan((FOV * Math.PI) / 360)) / this.H; // unidades do mundo por px do dispositivo no alvo
    const { right, away } = groundAxes(this.c.az);
    const s = Math.sin(this.c.el);
    const mx = -right[0] * dx * u + (away[0] * dy * u) / s, my = -right[1] * dx * u + (away[1] * dy * u) / s;
    this.c.x += mx; this.c.y += my; this.goal.x = this.c.x; this.goal.y = this.c.y;
  }
  rotate(dx, dy) {
    this.baseAz = clamp(this.baseAz - dx * 0.005, AZ_MIN, AZ_MAX);
    this.el = clamp(this.el + dy * 0.004, EL_MIN, EL_MAX);
    this.c.az = this.baseAz; this.c.el = this.el;
  }
  groundAt(mx, my) {
    this.ray.setFromCamera(new THREE.Vector2((mx / this.W) * 2 - 1, 1 - (my / this.H) * 2), this.cam);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.ground, p) ? [p.x, p.z] : null;
  }
  wheel(mx, my, deltaY) {
    const nd = clamp(this.c.dist * Math.exp(deltaY * 0.0015), this.zoomAt(1) / 6, this.overviewDist() * 1.25);
    const gp = this.groundAt(mx, my);
    if (gp) { const f = nd / this.c.dist; this.c.x = gp[0] + (this.c.x - gp[0]) * f; this.c.y = gp[1] + (this.c.y - gp[1]) * f; }
    this.c.dist = nd;
    Object.assign(this.goal, { x: this.c.x, y: this.c.y, dist: nd });
  }

  // ponto do mundo (x, y, altura em px do 2D) → pixel do dispositivo no canvas dos rótulos
  project = (x, y, z = 0) => {
    this.v.set(x, height(z), y).project(this.cam);
    if (this.v.z > 1) return [-1e5, -1e5];
    return [((this.v.x + 1) / 2) * this.W, ((1 - this.v.y) / 2) * this.H];
  };

  hitTest(mx, my) {
    const o = this.office;
    if (!o.plan) return null;
    let best = null;
    for (const e of o.entities.values()) {
      const f = this.project(e.x, e.y, 0), h = this.project(e.x, e.y, 16);
      const k = (f[1] - h[1]) / 16; // px do dispositivo por px do 2D nesta profundidade
      if (k <= 0) continue;
      if (mx >= f[0] - 5 * k && mx <= f[0] + 5 * k && my >= h[1] && my <= f[1] + 2 * k) {
        const d = this.cam.position.distanceToSquared(this.v.set(e.x, 0, e.y));
        if (!best || d < best.d) best = { d, e }; // a pessoa mais perto da câmera vence
      }
    }
    if (best) return { type: 'agent', key: best.e.key, e: best.e };
    const gp = this.groundAt(mx, my);
    if (!gp) return null;
    const [tx, ty] = gp;
    const lr = [...o.plan.rooms, ...o.plan.leisure].find((r) => tx >= r.ox && tx <= r.ox + r.W && ty >= r.oy && ty <= r.oy + r.H);
    return lr ? { type: 'room', lr } : null;
  }

  // ---------- quadro ----------
  ensureStatic() {
    const o = this.office, hour = new Date().getHours();
    const key = o.planKey + '|' + hour;
    if (key === this.staticKey) return;
    this.staticKey = key;
    const cs = this.cs;
    cs.reset();
    this.rooms = [...o.plan.rooms, ...o.plan.leisure];
    this.roomIdx = new Map(this.rooms.map((lr, i) => [lr, i]));
    o.drawBase(cs, P3, hour);
    for (const L of o.plan.lounges) o.drawLounge(cs, P3, L);
    this.rooms.forEach((lr, i) => {
      cs.room = i; cs.lr = lr;
      o.drawRoomShell(cs, P3, lr);
      if (lr.leisure) o.drawLeisureWalls(cs, P3, lr);
    });
    cs.room = -1; cs.lr = null;
    this.upload(this.layers.statOp, cs.op);
    this.upload(this.layers.statTr, cs.tr);
  }

  roomLight(lr) {
    let light = lr.light;
    if (lr.lit && performance.now() - lr.litAt < 900) light = Math.random() < 0.5 ? 1 : 0.15; // lâmpada piscando ao acender
    return light;
  }

  updateRooms() {
    const U = this.uniforms.uRoom.value;
    this.dark = new Map();
    this.rooms.forEach((lr, i) => {
      if (i >= MAX_ROOMS) return;
      const light = this.roomLight(lr);
      const dark = (lr.cc ? 0.25 : 0.62) * (1 - light);
      this.dark.set(lr, dark);
      // em foco numa sala: as paredes altas das outras baixam para não tapar a vista
      const cut = this.focusId && lr.room.id !== this.focusId ? 1 : 0;
      U[i].set(dark, cut, lr.cc ? 0 : lr.light, 0);
    });
  }

  buildDynamic(t) {
    const o = this.office, cd = this.cd;
    cd.reset(this.cs.layers);
    for (const it of o.sceneItems(cd, P3, t)) {
      if (it.char) continue;
      cd.room = it.lr ? this.roomIdx.get(it.lr) ?? -1 : -1; cd.lr = it.lr || null;
      it.f();
    }
    cd.lr = null;
    for (const e of o.entities.values()) {
      const home = e.away?.phase === 'lá' ? e.away.lz : e.lr;
      cd.room = this.roomIdx.get(home) ?? -1;
      const sp = !e.moving && o.leisureSpot(e);
      if (sp?.pose === 'hide') { cd.cube(sp.x - 0.15, sp.y + 1.35, 0.3, 0.1, 1, '#ff6b5e', '#ff6b5e', '#ff6b5e', 8); continue; }
      if (e.kind !== 'god') cd.disc(e.x, e.y, 0.3, 0.07, 'rgba(0,0,0,0.22)', 8);
      if (e.key === o.hoverKey) cd.disc(e.x, e.y, 0.5, 0.09, 'rgba(255,181,71,0.55)', 14);
    }
    cd.room = -1;
    const r = o.robot;
    if (r) {
      cd.disc(r.x, r.y, 0.4, 0.06, 'rgba(0,0,0,0.25)', 10);
      cd.cube(r.x - 0.35, r.y - 0.25, 0.7, 0.5, 2, '#c9cbd6', '#8f95b8', '#8f95b8');
      cd.cube(r.x - 0.05, r.y - 0.05, 0.1, 0.1, 0.4, Math.floor(t / 500) % 2 ? '#5fe0a8' : '#1d4250', '#1d4250', '#1d4250', 2);
    }
    this.upload(this.layers.dynOp, cd.op);
    this.upload(this.layers.dynTr, cd.tr);
  }

  // plano de pé virado para a câmera (gira só em volta do eixo vertical, como um recorte de papelão)
  facing() { return Math.PI / 2 - this.c.az; }

  plane(pool, key, geo) {
    let f = pool.get(key);
    if (!f) {
      const mat = new THREE.MeshBasicMaterial({ map: this.blank, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide });
      f = { mesh: new THREE.Mesh(geo, mat), mat };
      f.mesh.frustumCulled = false;
      this.scene.add(f.mesh);
      pool.set(key, f);
    }
    f.seen = true;
    return f;
  }
  sweep(pool) {
    for (const [k, f] of pool) {
      if (f.seen) { f.seen = false; continue; }
      this.scene.remove(f.mesh); f.mat.dispose(); pool.delete(k);
      // texturas que eram só desta pessoa saem junto
      for (const tk of f.keys || []) { this.tex.get(tk)?.dispose(); this.tex.delete(tk); }
    }
  }

  updateFigures(t, nightK) {
    const o = this.office, rot = this.facing();
    const nightMul = 1 - 0.32 * nightK;
    for (const e of o.entities.values()) {
      const pose = o.charPose(e, t);
      if (pose.hide) continue;
      const f = this.plane(this.figs, e.key, this.figGeo);
      const tk = figureKey(e, pose);
      f.mat.map = this.texture(tk, () => figureCanvas(e, pose));
      (f.keys ||= new Set()).add(tk);
      const up = pose.god ? 2 : (pose.lift || 0) - (pose.bob || 0);
      f.mesh.position.set(e.x, up * ZS, e.y);
      f.mesh.rotation.y = rot;
      f.mesh.renderOrder = 1;
      const home = e.away?.phase === 'lá' ? e.away.lz : e.lr;
      f.mat.color.setScalar((1 - (this.dark.get(home) || 0)) * nightMul);
      f.mat.opacity = e.fade > 0 ? clamp(e.fade / 0.6, 0, 1) : 1;
      // balão de atividade (mesma regra do drawBubble)
      if (e.leaving || e.moving || !WORKING.has(e.state)) continue;
      const urgent = e.state === 'asking' || e.state === 'waiting';
      const col = urgent ? '#ff6b5e' : e.state === 'stuck' ? '#8f95b8' : (ACTIVITY_COLOR[e.activity] || '#e9e6d8');
      const iconName = ICONS[e.activity] ? e.activity : 'trabalhando';
      const b = this.plane(this.bubs, e.key, this.bubGeo);
      b.mat.map = this.texture(`b|${iconName}|${col}|${urgent ? 1 : 0}`, () => bubbleCanvas(ICONS[iconName], urgent ? '#ff6b5e' : '#151a2e', urgent ? '#fff6ee' : col));
      const bob = urgent ? Math.round(Math.sin(t / 160) * 1.5) : 0;
      b.mesh.position.set(e.x, (14 - bob) * ZS, e.y);
      b.mesh.rotation.y = rot;
      b.mesh.renderOrder = 3;
    }
    this.sweep(this.figs);
    this.sweep(this.bubs);
  }

  updateParticles(t) {
    const o = this.office, rot = this.facing();
    // partículas desenhadas: um plano por partícula, reaproveitados pela posição na lista
    let gi = 0;
    const simple = [];
    for (const p of o.particles) {
      if (!p.glyph) { simple.push(p); continue; }
      let f = this.glyphs[gi];
      if (!f) {
        const mat = new THREE.MeshBasicMaterial({ map: this.blank, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, depthTest: false });
        f = { mesh: new THREE.Mesh(this.glyphGeo, mat), mat };
        f.mesh.frustumCulled = false; f.mesh.renderOrder = 4;
        this.scene.add(f.mesh); this.glyphs.push(f);
      }
      gi++;
      const key = `g|${p.glyph}|${p.mark || ''}|${p.color}`;
      f.mat.map = this.texture(key, () => glyphCanvas(p));
      const [w, h] = p.glyph === 'z' ? [3, 3] : p.glyph === 'stamp' ? [14, 12] : [10, 8];
      f.mesh.scale.set(w * PXW, h * ZS, 1);
      f.mesh.position.set(p.x, p.z * ZS, p.y);
      f.mesh.rotation.y = rot;
      f.mat.opacity = Math.min(1, (p.life / p.max) * 1.5) * (p.alpha ?? 1);
      f.mesh.visible = true;
    }
    for (let i = gi; i < this.glyphs.length; i++) this.glyphs[i].mesh.visible = false;

    // pontos: partículas simples + pulsos dos corredores (núcleo e brilho)
    const pts = [];
    for (const p of simple) pts.push(p.x, p.y, p.z, p.color, Math.min(1, (p.life / p.max) * 1.5) * (p.alpha ?? 1), p.size || 1);
    for (const lr of o.plan.rooms) {
      if (lr.cc || !lr.lit || !lr.routeLen) continue;
      const alert = o.alertsByRoom.get(lr.room.id);
      const col = alert ? '#ff6b5e' : '#ffb547', speed = alert ? 9 : 6;
      const n = Math.max(2, Math.round(lr.routeLen / 10));
      for (let i = 0; i < n; i++) {
        const d = ((t / 1000) * speed + (i * lr.routeLen) / n + (hash(lr.room.id) % 50)) % lr.routeLen;
        const q = along(lr.route, d);
        pts.push(q.x, q.y, 0.5, col, 0.35, -14, q.x, q.y, 0.5, col, 0.9, 3);
      }
    }
    const n = pts.length / 6;
    if (n > this.pCap) {
      if (this.points) { this.scene.remove(this.points); this.points.geometry.dispose(); }
      this.pCap = Math.max(256, 2 ** Math.ceil(Math.log2(n)));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pCap * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(this.pCap * 4), 4).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(this.pCap), 1).setUsage(THREE.DynamicDrawUsage));
      this.points = new THREE.Points(geo, this.pMat);
      this.points.frustumCulled = false; this.points.renderOrder = 3;
      this.scene.add(this.points);
    }
    const geo = this.points.geometry;
    const P = geo.getAttribute('position'), C = geo.getAttribute('aColor'), S = geo.getAttribute('aSize');
    for (let i = 0; i < n; i++) {
      const j = i * 6, hex = pts[j + 3], v = parseInt(hex.slice(1), 16);
      P.array[i * 3] = pts[j]; P.array[i * 3 + 1] = height(pts[j + 2]); P.array[i * 3 + 2] = pts[j + 1];
      C.array[i * 4] = (v >> 16) / 255; C.array[i * 4 + 1] = ((v >> 8) & 255) / 255; C.array[i * 4 + 2] = (v & 255) / 255; C.array[i * 4 + 3] = pts[j + 4];
      S.array[i] = pts[j + 5];
    }
    for (const a of [P, C, S]) a.needsUpdate = true;
    geo.setDrawRange(0, n);
    this.pUniforms.uScale.value = this.zoomEff() * this.fbPerDevice;
  }

  render(t, nightK = 0) {
    if (this.dead || !this.office.plan) return;
    this.ensureStatic();
    this.place(this.cam, this.c.x, this.c.y, this.c.dist, this.c.az, this.c.el);
    this.updateRooms();
    this.buildDynamic(t);
    this.updateFigures(t, nightK);
    this.updateParticles(t);
    this.uniforms.uNight.value = nightK;
    this.renderer.render(this.scene, this.cam);
    this.frames++;
    if (this.frames === 1) this.resolveReady(true);
  }

  info() { return { ...this.renderer.info.memory, figs: this.figs.size, bubs: this.bubs.size, textures: this.tex.size, frames: this.frames, focus: this.focusId, cut: this.uniforms.uRoom.value.filter((v) => v.y > 0.5).length }; }

  dispose() {
    this.dead = true;
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    for (const f of [...this.figs.values(), ...this.bubs.values(), ...this.glyphs]) f.mat.dispose();
    for (const t of this.tex.values()) t.dispose();
    this.blank.dispose();
    for (const m of Object.values(this.layers)) m.geometry.dispose();
    if (this.points) this.points.geometry.dispose();
    for (const x of [this.figGeo, this.bubGeo, this.glyphGeo, this.matOp, this.matTr, this.pMat]) x.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
