// Modo demonstração: transforma, só no navegador, o snapshot real numa cena com o prédio todo em
// atividade. Não altera a entrada e não traz dado novo: os textos inventados são estas constantes.
// Com o modo ligado, números do topo, alertas e aba Agora seguem a cena; a aba Hoje fica real (app.js).
import { hashStr } from './leisure.js';

export const DEMO_WINDOW_MS = 20_000; // atividades mudam a cada 20 s
const ACTS = ['editando', 'lendo', 'rodando comando', 'pesquisando na web', 'delegando', 'pensando', 'usando skill', 'usando integração', 'planejando'];
const HELPERS = ['Explore', 'Plan', 'general-purpose'];
const VERDICTS = ['aprovado', 'revisar', 'aprovado', 'bloqueado'];

const pick = (list, seed) => list[hashStr(seed) % list.length];

export function demoSnapshot(real, now) {
  const w = Math.floor(now / DEMO_WINDOW_MS);
  const projects = real.rooms.filter((r) => r.kind === 'project');
  // 1 ou 2 salas com o Fiscal Codex auditando por janela
  const auditedIn = (k) => new Set(projects.length
    ? [projects[hashStr('aud|' + k) % projects.length].id, projects[hashStr('aud2|' + k) % projects.length].id] : []);
  const audited = auditedIn(w);
  // veredito = resultado da última auditoria da cena naquela sala (muda só quando uma auditoria termina)
  const lastAudit = new Map();
  for (let k = w - 1; k > w - 90 && lastAudit.size < projects.length; k--) for (const id of auditedIn(k)) if (!lastAudit.has(id)) lastAudit.set(id, k);
  const rooms = real.rooms.map((r) => {
    const copy = { ...r, staff: r.staff.map((a) => ({ ...a })), sessions: r.sessions.map((s) => ({ ...s })), interns: r.interns.map((i) => ({ ...i })) };
    if (r.kind === 'lobby') return { ...copy, lit: true };
    if (r.kind !== 'project') return copy;
    // agentes cadastrados: ~65% trabalhando, em ciclos próprios de 60–120 s (dá tempo de passear)
    const staff = r.staff.map((a) => {
      const period = 60_000 + (hashStr('p|' + a.name) % 60_000);
      const working = hashStr(r.id + '|' + a.name + '|' + Math.floor(now / period)) % 100 < 65;
      return { ...a, state: working ? 'working' : 'idle', activity: working ? pick(ACTS, a.name + '|' + w) : null };
    });
    // sessões reais trabalhando; `asking` só pode cair numa sessão real
    const sessions = r.sessions.map((s, i) => ({ ...s,
      state: i === 0 && hashStr('ask|' + r.id + '|' + w) % 6 === 0 ? 'asking' : 'working',
      activity: pick(ACTS, s.key + '|' + w) }));
    // ocupação fictícia estável (depende só do id da sala): nada de replanta ao trocar de janela
    sessions.push({ key: `demo:${r.id}:c`, state: 'working', activity: pick(ACTS, r.id + '|c|' + w), model: null, contextPct: null, since: null, lastAt: null });
    const interns = copy.interns.slice();
    const extra = r.staff.length ? 0 : hashStr('i|' + r.id) % 3;
    for (let k = 0; k < extra; k++) interns.push({ key: `demo:${r.id}:i${k}`, role: pick(HELPERS, r.id + '|' + k), activity: pick(ACTS, r.id + '|i' + k + '|' + w), since: null });
    const k = lastAudit.get(r.id);
    const auditor = audited.has(r.id)
      ? { state: 'auditando', verdict: null, verdictAt: null, today: 1 }
      : k === undefined ? null
        : { state: 'livre', verdict: pick(VERDICTS, r.id + '|v' + k), verdictAt: (k + 1) * DEMO_WINDOW_MS, today: 1 };
    return { ...copy, lit: true, active: true, staff, sessions, interns, auditor };
  });
  // alertas: os reais de salas que a cena não transforma (centro, visitantes) + perguntas da cena
  const projectIds = new Set(projects.map((r) => r.id));
  const alerts = real.alerts.filter((a) => !projectIds.has(a.roomId)).map((a) => ({ ...a }));
  for (const r of rooms) if (projectIds.has(r.id)) for (const x of r.sessions) if (x.state === 'asking')
    alerts.push({ type: 'asking', room: r.name, roomId: r.id, session: x.key, text: 'Pergunta esperando você', since: w * DEMO_WINDOW_MS });
  // totais com a mesma fórmula de src/snapshot.mjs, sobre as salas da cena
  const all = rooms.flatMap((r) => r.sessions);
  const totals = {
    ...real.totals,
    sessions: all.length,
    working: all.filter((x) => x.state === 'working').length,
    waitingYou: all.filter((x) => x.state === 'asking' || x.state === 'waiting').length,
    interns: rooms.reduce((n, r) => n + r.interns.length + r.staff.filter((a) => a.state === 'working').length, 0),
    roomsLit: rooms.filter((r) => r.lit && r.kind === 'project').length,
    rooms: rooms.filter((r) => r.kind === 'project').length,
    toolCalls: rooms.reduce((n, r) => n + (r.stats?.toolCalls || 0), 0),
  };
  return { ...real, rooms, alerts, totals };
}
