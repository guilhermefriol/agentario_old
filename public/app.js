// Front-end só-leitura: recebe o snapshot por SSE e desenha. Mouse e câmera são locais;
// nenhuma ação do usuário é enviada ao servidor.
import { Office, PROJECTIONS } from './office.js';
import { demoSnapshot } from './demo.js';

const params = new URLSearchParams(location.search);
const viewMode = params.get('view') || 'iso';
const rotateOn = params.get('rotate') !== '0';
const tourOn = params.get('tour') !== '0';
let demoOn = params.get('demo') === '1';

const $ = (id) => document.getElementById(id);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'style') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv);
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

const VIEW_TAG = 'clique: entrar na sala · Esc ou duplo clique: visão geral · roda: zoom · arrastar: mover';
let snap = null;
let lastMsg = 0;
const office = new Office();
office.setProjection(PROJECTIONS[viewMode] || PROJECTIONS.iso);
const canvas = $('screen');
const g = canvas.getContext('2d');
const lo = document.createElement('canvas');
const lg = lo.getContext('2d');

// ---------- dados ----------
const es = new EventSource('/api/stream');
es.onmessage = (ev) => { try { onSnapshot(JSON.parse(ev.data)); } catch {} };

const prevStates = new Map();
const feed = [];
// cada linha lembra se nasceu no modo demonstração, para sair do letreiro quando o modo desliga
const pushFeed = (text, room) => { feed.unshift({ at: Date.now(), text, room, demo: demoOn }); if (feed.length > 24) feed.pop(); };
const who = (key, fallback) => office.names.get(key) || fallback;

function onSnapshot(s) {
  lastMsg = Date.now();
  const firstTime = !snap;
  snap = s;
  if (!firstTime) { refresh(); return; }
  shown = demoOn ? demoSnapshot(snap, Date.now()) : null;
  office.sync(view());
  seedFeed(view());
  camera.fit(true);
  renderPanels();
}

// O que está na tela: a cena de demonstração (se ligada) ou o snapshot real.
// A aba Hoje e as configurações de tela (noite, rotação) usam sempre o real.
let shown = null;
const view = () => shown || snap;
function refresh() {
  if (!snap) return;
  shown = demoOn ? demoSnapshot(snap, Date.now()) : null;
  office.sync(view());
  diffFeed(view());
  camera.keepFocus();
  renderPanels();
}
function setDemo(on) {
  demoOn = on;
  office.setDemo(on);
  if (snap) {
    shown = on ? demoSnapshot(snap, Date.now()) : null;
    office.sync(view());
    // letreiro: sai o que era da demonstração; estados recarregados sem gerar enxurrada
    if (!on) for (let i = feed.length - 1; i >= 0; i--) if (feed[i].demo) feed.splice(i, 1);
    prevStates.clear();
    seedStates(view());
    pushFeed(on ? 'modo demonstração ligado' : 'modo demonstração desligado', null);
    renderPanels();
  }
  const logo = $('logo');
  logo.setAttribute('aria-pressed', String(on));
  document.body.classList.toggle('demo', on);
  $('sub').textContent = on ? 'escritório dos agentes · modo demonstração' : 'escritório dos agentes · só visualização';
  $('view-tag').textContent = VIEW_TAG + (on ? ' · modo demonstração' : '');
}
$('logo').addEventListener('click', () => setDemo(!demoOn));
setInterval(() => { if (demoOn) refresh(); }, 5000);

function seedStates(s) {
  for (const r of s.rooms) {
    for (const x of r.sessions) prevStates.set('s:' + x.key, x.state + x.activity);
    for (const a of r.staff) prevStates.set('a:' + r.id + ':' + a.name, a.state);
    if (r.auditor) prevStates.set('c:' + r.id, r.auditor.state + (r.auditor.verdictAt || ''));
  }
}
function seedFeed(s) {
  seedStates(s);
  pushFeed('painel ligado. Bom trabalho, equipe!', null);
}

const VERDICT_TXT = { aprovado: 'aprovou', revisar: 'pediu revisão', bloqueado: 'bloqueou', 'sem veredito': 'terminou a auditoria' };
function diffFeed(s) {
  const seen = new Set();
  for (const r of s.rooms) {
    for (const x of r.sessions) {
      const k = 's:' + x.key;
      seen.add(k);
      const before = prevStates.get(k);
      const now = x.state + x.activity;
      const name = who(k, 'Claude');
      if (before === undefined) pushFeed(`${name} (Claude) chegou`, r.name);
      else if (before !== now) {
        if (x.state === 'asking') pushFeed(`${name} tem uma pergunta pra você`, r.name);
        else if (x.state === 'waiting') pushFeed(`${name} aguarda sua ação`, r.name);
        else if (x.state === 'free' && !before.startsWith('free')) pushFeed(`${name} terminou a vez`, r.name);
        else if (x.state === 'working' && !before.startsWith('working')) pushFeed(`${name} voltou ao trabalho: ${x.activity}`, r.name);
        else if (x.state === 'stuck') pushFeed(`${name} está sem progresso há um tempo`, r.name);
      }
      prevStates.set(k, now);
    }
    for (const st of r.staff) {
      const k = 'a:' + r.id + ':' + st.name;
      seen.add(k);
      const before = prevStates.get(k);
      const name = who(k, st.name);
      if (before !== undefined && before !== st.state) pushFeed(st.state === 'working' ? `${name} (${st.name}) começou: ${st.activity}` : `${name} (${st.name}) entregou`, r.name);
      prevStates.set(k, st.state);
    }
    if (r.auditor) {
      const k = 'c:' + r.id;
      const now = r.auditor.state + (r.auditor.verdictAt || '');
      const before = prevStates.get(k);
      if (before !== undefined && before !== now) {
        if (r.auditor.state === 'auditando') pushFeed('o fiscal Codex chegou para auditar', r.name);
        else if (r.auditor.verdict) pushFeed(`o fiscal Codex ${VERDICT_TXT[r.auditor.verdict] || 'terminou'} o plano`, r.name);
      }
      prevStates.set(k, now);
    }
  }
  for (const k of [...prevStates.keys()]) if (k.startsWith('s:') && !seen.has(k)) { prevStates.delete(k); pushFeed(`${who(k, 'uma sessão')} encerrou o expediente`, null); }
}

// ---------- painéis ----------
const fmtInt = (n) => new Intl.NumberFormat('pt-BR').format(n);
const ago = (ts) => {
  if (!ts) return '';
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return m < 1 ? 'agora' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const since = (ts) => { const a = ago(ts); return a === 'agora' ? 'agora' : `há ${a}`; };
const STATE_TXT = { working: 'trabalhando', free: 'livre', asking: 'tem uma pergunta pra você', waiting: 'aguardando você', stuck: 'sem progresso', idle: 'na mesa' };

function renderPanels() {
  if (!snap) return;
  const v = view();
  const t = v.totals;
  $('kpis').replaceChildren(
    h('li', { class: 'kpi work' }, h('b', {}, t.working), h('span', {}, 'sessões trabalhando')),
    h('li', { class: 'kpi' + (t.waitingYou ? ' hot' : ' calm') }, h('b', {}, t.waitingYou), h('span', {}, 'esperando você')),
    h('li', { class: 'kpi' }, h('b', {}, t.interns), h('span', {}, 'agentes em ação')),
    h('li', { class: 'kpi' }, h('b', {}, `${t.roomsLit}/${t.rooms}`), h('span', {}, 'salas acesas')),
  );
  const card = $('alerts-card');
  card.classList.toggle('has', v.alerts.length > 0);
  $('alerts-title').textContent = v.alerts.length ? `Precisa de você · ${v.alerts.length}` : 'Precisa de você';
  const ICO = { asking: '?', waiting: '!', stuck: 'z', errors: 'x', context: '%', codex: '§' };
  $('alerts').replaceChildren(...(v.alerts.length
    ? v.alerts.slice(0, 4).map((a) => h('li', { class: `alert t-${a.type}` },
        h('span', { class: 'ico' }, ICO[a.type] || '!'),
        h('div', {}, h('div', { class: 'what' }, a.text), h('div', { class: 'where' }, a.room)),
        h('span', { class: 'age' }, ago(a.since))))
    : [h('p', { class: 'calm' }, h('b', {}, 'Tudo fluindo. '), 'Nenhum agente está esperando por você.')]));
  if (v.alerts.length > 4) $('alerts').append(h('p', { class: 'calm' }, `+${v.alerts.length - 4} alertas`));
  document.documentElement.style.setProperty('--rot', `${snap.ui.rotateSeconds}s`);
  drawPane();
  drawTicker();
}

const PANES = [
  { id: 'agora', label: 'Agora', draw: paneNow },
  { id: 'hoje', label: 'Hoje', draw: paneToday },
  { id: 'equipe', label: 'Equipe', draw: paneTeam },
];
let paneIdx = Math.max(0, PANES.findIndex((p) => p.id === params.get('painel')));
let paneSince = Date.now();

function drawPane() {
  $('tabs').replaceChildren(...PANES.map((p, i) => h('span', { class: 'tab' + (i === paneIdx ? ' on' : '') }, p.label)));
  $('pane').replaceChildren(h('div', { class: 'pane-inner' }, PANES[paneIdx].draw()));
}

const VERDICT_CHIP = { aprovado: ['aprovado', 'ok'], revisar: ['revisar', 'warn'], bloqueado: ['bloqueado', 'bad'], 'sem veredito': ['sem veredito', ''] };
function paneNow() {
  const rooms = view().rooms.filter((r) => r.lit || r.auditor?.state === 'auditando');
  if (!rooms.length) return h('p', { class: 'calm' }, 'Ninguém trabalhando agora. O prédio está com as luzes apagadas.');
  return rooms.slice(0, 6).map((r) => {
    const people = [
      ...r.sessions.map((s) => h('span', { class: `chip ${s.state}` }, `${who('s:' + s.key, 'Claude')} · ${s.state === 'working' ? s.activity : STATE_TXT[s.state]}`)),
      ...r.staff.filter((a) => a.state === 'working').map((a) => h('span', { class: 'chip working' }, `${who('a:' + r.id + ':' + a.name, a.name)} · ${a.activity}`)),
      ...r.interns.map((i) => h('span', { class: 'chip working' }, `${who('i:' + i.key, i.role)} · ${i.activity}`)),
    ];
    if (r.auditor?.state === 'auditando') people.push(h('span', { class: 'chip codex' }, 'Fiscal Codex · auditando'));
    else if (r.auditor?.verdict) { const [txt, cls] = VERDICT_CHIP[r.auditor.verdict] || ['', '']; people.push(h('span', { class: `chip codex ${cls}` }, `Codex: ${txt} ${since(r.auditor.verdictAt)}`)); }
    let tasks;
    if (r.tasks?.mode === 'lista') {
      tasks = r.tasks.items.length ? h('ul', { class: 'tasks' }, r.tasks.items.slice(0, 4).map((x) => h('li', { class: x.state }, h('span', { class: 'ttl' }, x.title), h('span', { class: 'who' }, `${x.agent} · ${x.state}`)))) : null;
    } else if (r.tasks?.mode === 'contagem') {
      const c = r.tasks.counts;
      tasks = h('div', { class: 'counts' }, h('span', {}, h('b', {}, c.andamento || 0), ' em andamento'), h('span', {}, h('b', {}, c.aguardando || 0), ' aguardando'), h('span', {}, h('b', {}, c.concluida || 0), ' concluídas'));
    } else tasks = h('div', { class: 'hidden-note' }, 'tarefas desta sala são privadas');
    const ctx = r.sessions.map((s) => (s.contextPct !== null && s.contextPct !== undefined ? `${s.contextPct}% de contexto` : null)).filter(Boolean)[0];
    return h('div', { class: 'room-block' }, h('div', { class: 'room-head' }, h('h3', {}, r.name), h('span', { class: 'meta' }, ctx || '')), h('div', { class: 'people' }, people), tasks);
  });
}

function paneToday() {
  const rooms = snap.rooms.filter((r) => r.stats.activeMinutes > 0).slice(0, 8);
  if (!rooms.length) return h('p', { class: 'calm' }, 'Ainda sem atividade registrada hoje.');
  const now = new Date().getHours();
  const max = Math.max(1, ...rooms.flatMap((r) => r.hours));
  const heat = h('div', { class: 'heat' }, h('span', {}), ...Array.from({ length: 24 }, (_, i) => h('span', { class: 'h' }, i % 6 === 0 ? String(i) : '')),
    ...rooms.flatMap((r) => [h('span', { class: 'lbl' }, r.name), ...r.hours.map((v, i) => h('span', { class: 'c' + (i === now ? ' now' : ''), style: { background: v ? `rgba(255,181,71,${0.18 + (v / max) * 0.82})` : '#1f2646' } }))]));
  const maxMin = Math.max(1, ...rooms.map((r) => r.stats.activeMinutes));
  const stats = h('div', { class: 'stats' }, rooms.map((r) => h('div', { class: 'stat-row' }, h('span', { class: 'lbl' }, r.name),
    h('span', { class: 'bar' }, h('i', { style: { width: `${(r.stats.activeMinutes / maxMin) * 100}%` } })), h('span', { class: 'val' }, `${r.stats.activeMinutes} min`))));
  const audits = snap.rooms.reduce((n, r) => n + (r.auditor?.today || 0), 0);
  return [h('h2', {}, 'Atividade por hora'), heat, h('h2', { style: { 'margin-top': '1.1rem' } }, 'Minutos ativos'), stats,
    h('p', { class: 'foot-note' }, `${fmtInt(snap.totals.toolCalls)} ferramentas usadas hoje · ${audits} auditorias do Codex. Minutos são estimativas.`)];
}

function paneTeam() {
  const c = snap.catalog;
  const byRoom = new Map();
  for (const a of c.agents) { if (!byRoom.has(a.room)) byRoom.set(a.room, []); byRoom.get(a.room).push(a); }
  const secs = [...byRoom.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 3).map(([room, list]) =>
    h('div', { class: 'cat-sec' }, h('h4', {}, `Agentes · ${room} (${list.length})`), h('div', { class: 'chips' }, list.slice(0, 28).map((a) => h('span', { class: 'chip' }, a.name, a.model ? h('small', {}, a.model) : null)))));
  return h('div', { class: 'catalog-grid' },
    h('div', { class: 'cat-sec' }, h('h4', {}, `${c.projects.length} projetos · ${c.agents.length} agentes · ${c.skills.length} skills`)),
    ...secs,
    h('div', { class: 'cat-sec' }, h('h4', {}, `Skills (${c.skills.length})`), h('div', { class: 'chips' }, c.skills.slice(0, 48).map((s) => h('span', { class: 'chip' }, s.name)))));
}

function drawTicker() {
  const el = $('ticker');
  const key = feed.slice(0, 12).map((f) => f.at + f.text).join();
  if (el.dataset.k === key) return;
  el.dataset.k = key;
  const items = feed.slice(0, 12).map((f) => h('span', {}, h('time', {}, new Date(f.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })), f.room ? h('b', {}, f.room + ': ') : null, f.text));
  el.replaceChildren(...items);
  document.documentElement.style.setProperty('--ticker', `${Math.max(30, items.length * 9)}s`);
}

// ---------- tooltip ----------
const tip = $('tip');
// função de quem não é agente cadastrado: texto fixo, nada vem do coletor
const KIND_DOES = {
  god: 'Vê todas as salas ao mesmo tempo e recebe a visita de todo mundo',
  claude: 'Atende você na sessão: conversa, planeja, edita código e chama ajudantes',
  codex: 'Fiscal de planos: revisa o plano antes de aplicar e dá o veredito',
};
const HELPER_DOES = {
  Explore: 'Vasculha o código e os arquivos para achar onde as coisas estão',
  Plan: 'Desenha o plano de implementação e aponta os arquivos críticos',
  'general-purpose': 'Ajudante para pesquisas e tarefas de várias etapas',
  claude: 'Ajudante para qualquer tarefa que não tem especialista',
  'claude-code-guide': 'Responde dúvidas sobre o Claude Code, a API e o SDK',
  'statusline-setup': 'Configura a linha de status do Claude Code',
};
function doesOf(e) {
  if (Object.hasOwn(KIND_DOES, e.kind)) return KIND_DOES[e.kind];
  if (e.kind === 'staff') return e.data?.does || 'Agente cadastrado no projeto (sem descrição)';
  return (Object.hasOwn(HELPER_DOES, e.role) && HELPER_DOES[e.role]) || 'Ajudante temporário chamado por uma sessão';
}
function agentTip(e) {
  const d = e.data || {};
  if (e.kind === 'god') return [h('div', { class: 'tip-name' }, 'Friol'), h('div', { class: 'tip-role' }, 'onipotente'), h('p', { class: 'tip-does' }, doesOf(e)),
    h('dl', {}, h('dt', {}, 'Estado'), h('dd', {}, 'vendo tudo'), h('dt', {}, 'Visitas agora'), h('dd', {}, String(e.lr.present || 0)))];
  const role = e.kind === 'claude' ? 'Claude · sessão' : e.kind === 'intern' ? `estagiário · ${e.role}` : e.kind === 'codex' ? 'Codex · fiscal de planos' : `agente · ${e.role}`;
  const state = e.kind === 'codex' ? (e.state === 'working' ? 'auditando' : 'na sala de fiscalização')
    : e.away && e.state === 'idle' ? 'matando o tempo' : WORKING_TXT(e);
  const A = e.away;
  const where = !A ? null : A.phase === 'lá' ? `${A.lz.room.name} · ${A.lz.spots[A.spot].act}`
    : A.phase === 'indo' ? `indo para ${A.lz.room.name}` : 'voltando para a mesa';
  const rows = [
    ['Sala', e.room],
    ['Estado', state],
    where ? ['Onde', where] : null,
    e.activity && e.state !== 'idle' ? ['Fazendo', e.activity] : null,
    d.since ? ['Desde', since(d.since)] : null,
    d.model ? ['Modelo', d.model] : null,
    d.contextPct !== null && d.contextPct !== undefined ? ['Contexto', `${d.contextPct}%`] : null,
    e.kind === 'codex' && d.verdict ? ['Último veredito', `${d.verdict} · ${since(d.verdictAt)}`] : null,
    e.kind === 'codex' && d.today !== undefined ? ['Auditorias hoje', d.today] : null,
    d.task ? ['Tarefa', d.task] : null,
  ].filter(Boolean);
  return [h('div', { class: 'tip-name' }, e.name), h('div', { class: 'tip-role' }, role),
    h('p', { class: 'tip-does' }, doesOf(e)),
    h('dl', {}, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))]))];
}
const WORKING_TXT = (e) => STATE_TXT[e.state] || e.state;
function leisureTip(lz) {
  const here = [...office.entities.values()].filter((e) => e.away?.phase === 'lá' && e.away.lz === lz && !e.leaving);
  const rows = [
    ['Agora', here.length ? `${here.length} ${here.length === 1 ? 'agente matando' : 'agentes matando'} o tempo` : 'vazia'],
    here.length ? ['Quem', here.slice(0, 6).map((e) => e.name).join(', ') + (here.length > 6 ? '…' : '')] : null,
    ['Lugares', lz.spots.length],
  ].filter(Boolean);
  return [h('div', { class: 'tip-name' }, lz.room.name), h('div', { class: 'tip-role' }, 'sala de lazer'), h('dl', {}, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))]))];
}
function roomTip(lr) {
  if (lr.leisure) return leisureTip(lr);
  const r = lr.room;
  const rows = [
    ['Luzes', r.lit ? 'acesas, tem gente trabalhando' : 'apagadas'],
    ['Equipe', `${r.staff.length} agentes cadastrados`],
    ['Sessões', r.sessions.length],
    r.interns.length ? ['Estagiários', r.interns.length] : null,
    r.lastActivity ? ['Última atividade', since(r.lastActivity)] : null,
    lr.cc ? ['Visitando o Friol', lr.present || 0] : null,
    r.auditor?.verdict ? ['Codex', `${r.auditor.verdict} · ${since(r.auditor.verdictAt)}`] : null,
  ].filter(Boolean);
  return [h('div', { class: 'tip-name' }, r.name), h('div', { class: 'tip-role' }, lr.cc ? 'centro de comando' : 'sala do projeto'), h('dl', {}, rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))]))];
}

// ---------- câmera ----------
// o centro de comando não leva nome na tela (pedido do dono)
const backText = (lr) => lr.cc ? '← Visão geral' : `← Visão geral · ${lr.room.name}`;
const camera = {
  x: 0, y: 0, zoom: 1, tx: 0, ty: 0, tz: 1,
  userUntil: 0, tourIdx: -1, tourAt: 0, focused: null,
  fitZoom() { return Math.min(cw / office.width, ch / office.height) * 0.97; },
  fit(snapNow = false) {
    this.tx = office.width / 2; this.ty = office.height / 2; this.tz = this.fitZoom();
    if (snapNow) { this.x = this.tx; this.y = this.ty; this.zoom = this.tz; }
  },
  focus(lr, fill = 0.9, max = 4) {
    const c = office.roomCenter(lr);
    this.tx = c.x; this.ty = c.y;
    this.tz = Math.min(max, Math.max(this.fitZoom() * 1.6, Math.min(cw / c.w, ch / c.h) * fill));
  },
  // clique numa sala: entra nela e fica até o usuário voltar (tour suspenso)
  focusRoom(lr) {
    this.focused = lr.room.id;
    this.focus(lr, 0.85, lr.cc ? 3.2 : 5);
    backBtn.textContent = backText(lr);
    backBtn.hidden = false;
  },
  focusedRoom() { return this.focused && office.plan ? [...office.plan.rooms, ...office.plan.leisure].find((lr) => lr.room.id === this.focused) : null; },
  // único caminho de saída do foco (botão, Esc, duplo clique, sala removida)
  overview() {
    this.focused = null;
    backBtn.hidden = true;
    this.userUntil = 0; this.tourIdx = -1; this.tourAt = performance.now();
    this.fit();
  },
  // planta/tela mudou: reenquadra a sala focada pelo id, ou volta se ela sumiu
  keepFocus(snapNow = false) {
    if (!this.focused) return;
    const lr = this.focusedRoom();
    if (!lr) { this.overview(); return; }
    backBtn.textContent = backText(lr);
    this.focus(lr, 0.85, lr.cc ? 3.2 : 5);
    if (snapNow) { this.x = this.tx; this.y = this.ty; this.zoom = this.tz; }
  },
  refit(snapNow) { if (this.focused) this.keepFocus(snapNow); else this.fit(snapNow); },
  update(dt, now) {
    if (tourOn && !this.focused && now > this.userUntil && office.plan) {
      const stops = office.plan.rooms.filter((lr) => !lr.cc && (lr.lit || office.alertsByRoom.get(lr.room.id) || lr.room.auditor?.state === 'auditando'))
        .sort((a, b) => (office.alertsByRoom.get(b.room.id) || 0) - (office.alertsByRoom.get(a.room.id) || 0)).slice(0, 5);
      const dur = this.tourIdx < 0 ? 22000 : 10000;
      if (now - this.tourAt > dur) {
        this.tourAt = now;
        this.tourIdx = this.tourIdx + 1 >= stops.length ? -1 : this.tourIdx + 1;
        if (this.tourIdx < 0 || !stops.length) { this.tourIdx = -1; this.fit(); } else this.focus(stops[this.tourIdx]);
      }
    }
    const k = Math.min(1, dt * 1.4);
    this.x += (this.tx - this.x) * k; this.y += (this.ty - this.y) * k;
    this.zoom = Math.exp(Math.log(this.zoom) + (Math.log(this.tz) - Math.log(this.zoom)) * k);
  },
  toScreen(wx, wy) { return [(wx - this.x) * this.zoom + cw / 2, (wy - this.y) * this.zoom + ch / 2]; },
  toWorld(sx, sy) { return [(sx - cw / 2) / this.zoom + this.x, (sy - ch / 2) / this.zoom + this.y]; },
};

// ---------- mouse (só câmera e informação) ----------
let drag = null, cursorTimer = 0;
const dpr = () => window.devicePixelRatio || 1;
const local = (ev) => { const r = canvas.getBoundingClientRect(); return [(ev.clientX - r.left) * dpr(), (ev.clientY - r.top) * dpr()]; };
const pauseTour = () => { camera.userUntil = performance.now() + 90000; };
function wakeCursor() { document.body.classList.remove('idle'); clearTimeout(cursorTimer); cursorTimer = setTimeout(() => document.body.classList.add('idle'), 4000); }
document.addEventListener('mousemove', wakeCursor);
canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault(); pauseTour();
  const [mx, my] = local(ev);
  const [wx, wy] = camera.toWorld(mx, my);
  const nz = Math.min(6, Math.max(camera.fitZoom() * 0.8, camera.zoom * Math.exp(-ev.deltaY * 0.0015)));
  camera.zoom = camera.tz = nz;
  camera.x = camera.tx = wx - (mx - cw / 2) / nz;
  camera.y = camera.ty = wy - (my - ch / 2) / nz;
}, { passive: false });
const backBtn = $('back');
let clickTimer = 0;
canvas.addEventListener('mousedown', (ev) => {
  if (ev.button !== 0) return;
  const [mx, my] = local(ev);
  drag = { mx, my, x: camera.x, y: camera.y, cx: ev.clientX, cy: ev.clientY, moved: 0, at: performance.now() };
  canvas.classList.add('grab'); pauseTour();
});
window.addEventListener('mouseup', (ev) => {
  const d = drag;
  drag = null; canvas.classList.remove('grab');
  // clique = botão esquerdo, quase parado durante todo o gesto, rápido e solto sobre o canvas
  if (!d || ev.button !== 0 || ev.target !== canvas || d.moved >= 6 || performance.now() - d.at > 400) return;
  const [wx, wy] = camera.toWorld(...local(ev));
  const hit = office.hitTest(wx, wy);
  const lr = hit?.type === 'room' ? hit.lr : hit?.e?.lr;
  if (!lr || lr.room.id === camera.focused) return;
  clearTimeout(clickTimer);
  clickTimer = setTimeout(() => camera.focusRoom(lr), 250); // espera para não brigar com o duplo clique
});
canvas.addEventListener('dblclick', () => { clearTimeout(clickTimer); camera.overview(); });
backBtn.addEventListener('click', () => camera.overview());
window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && camera.focused) camera.overview(); });
canvas.addEventListener('mouseleave', () => { tip.hidden = true; office.hoverKey = null; });
canvas.addEventListener('mousemove', (ev) => {
  const [mx, my] = local(ev);
  if (drag) {
    drag.moved = Math.max(drag.moved, Math.hypot(ev.clientX - drag.cx, ev.clientY - drag.cy));
    camera.x = camera.tx = drag.x - (mx - drag.mx) / camera.zoom;
    camera.y = camera.ty = drag.y - (my - drag.my) / camera.zoom;
  }
  const [wx, wy] = camera.toWorld(mx, my);
  const hit = office.hitTest(wx, wy);
  office.hoverKey = hit?.type === 'agent' ? hit.key : null;
  if (!hit) { tip.hidden = true; return; }
  tip.replaceChildren(...(hit.type === 'agent' ? agentTip(hit.e) : roomTip(hit.lr)));
  tip.hidden = false;
  const r = $('office').getBoundingClientRect();
  const x = ev.clientX - r.left + 18, y = ev.clientY - r.top + 18;
  tip.style.left = Math.min(x, r.width - tip.offsetWidth - 8) + 'px';
  tip.style.top = Math.min(y, r.height - tip.offsetHeight - 8) + 'px';
});

// ---------- relógio, rotação, noite ----------
const forceNight = params.get('noite');
const minutesOf = (s) => { const [a, b] = String(s).split(':').map(Number); return a * 60 + (b || 0); };
function nightFactor() {
  if (forceNight === '1') return 1;
  if (forceNight === '0' || !snap) return 0;
  const n = snap.ui.night, d = new Date(), m = d.getHours() * 60 + d.getMinutes();
  const from = minutesOf(n.from), to = minutesOf(n.to);
  return (from > to ? (m >= from || m < to) : (m >= from && m < to)) ? 1 : 0;
}
setInterval(() => {
  const d = new Date();
  $('clock-time').textContent = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  $('clock-date').textContent = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('signal').hidden = !lastMsg || Date.now() - lastMsg < 40000;
  $('veil').style.opacity = String(nightFactor() ? 1 - (snap?.ui.night.dim ?? 0.55) : 0);
  if (snap && rotateOn && Date.now() - paneSince > snap.ui.rotateSeconds * 1000) { paneIdx = (paneIdx + 1) % PANES.length; paneSince = Date.now(); drawPane(); }
}, 1000);
setInterval(() => { if (snap) drawPane(); }, 15000);

// ---------- loop ----------
let last = performance.now(), cw = 0, ch = 0, acc = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  acc += dt;
  if (acc < 1 / 32) return; // ~30 fps bastam para a TV
  const step = acc; acc = 0;
  if (!snap || !office.plan) return;
  const rect = canvas.getBoundingClientRect();
  const W = Math.round(rect.width * dpr()), H = Math.round(rect.height * dpr());
  if (W !== cw || H !== ch) { const firstSize = !cw; cw = W; ch = H; canvas.width = W; canvas.height = H; camera.refit(firstSize); }
  if (lo.width !== office.width || lo.height !== office.height) { lo.width = office.width; lo.height = office.height; camera.refit(true); }
  office.step(step, t);
  camera.update(step, t);
  const t0 = performance.now();
  office.render(lg, t, { nightK: nightFactor() });
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = camera.zoom < 1.6;
  g.drawImage(lo, cw / 2 - camera.x * camera.zoom, ch / 2 - camera.y * camera.zoom, lo.width * camera.zoom, lo.height * camera.zoom);
  office.labels(g, (x, y) => camera.toScreen(x, y), camera.zoom, Math.max(1, H / 860), t);
  window.__frameMs = performance.now() - t0;
}
requestAnimationFrame(frame);
$('view-tag').textContent = VIEW_TAG;
if (demoOn) setDemo(true);
// gancho de depuração só leitura, para testes automatizados (?debug=1)
if (params.get('debug') === '1') window.__pr = { office, camera, view, real: () => snap, feed, screenOf: (key) => { const e = office.entities.get(key); if (!e) return null; const [sx, sy] = office.P.p(e.x, e.y, 0); const [x, y] = camera.toScreen(sx - office.bbox[0], sy - office.bbox[1]); return [x / (window.devicePixelRatio || 1), y / (window.devicePixelRatio || 1)]; } };
