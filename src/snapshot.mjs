// FRONTEIRA DE SEGURANÇA. Tudo que sai para a TV é montado aqui, campo a campo, a partir de
// valores derivados. Nunca espalhar (...) objetos de entrada nem repassar texto livre sem
// taskText() ou roleText() — as duas únicas portas de texto livre.
import crypto from 'node:crypto';
import { category } from './activity.mjs';
import { redact, label } from './redact.mjs';

const WAIT_RE = /wait|permission|approv|input|blocked/;
const SEV = { asking: 0, waiting: 0, codex: 1, stuck: 1, errors: 1, context: 2 };
const VERDICTS = new Set(['aprovado', 'revisar', 'bloqueado', 'sem veredito']);
const WORKING = new Set(['working', 'asking', 'waiting', 'stuck']);

const shortKey = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 8);
const roomId = (k) => 'r' + shortKey('room:' + k);
const baseType = (t) => String(t || '').split(':').pop();

// ÚNICA porta de texto livre para a TV. Fontes permitidas: aiTitle da sessão e description da
// delegação (Agent/meta.json). Só em sala "publico", só string, sempre redigido. Senão: undefined.
export function taskText(policy, source) {
  if (policy !== 'publico' || typeof source !== 'string') return undefined;
  return redact(source) || undefined;
}

// 2ª porta de texto livre: função do agente (description do frontmatter, escrita pelo dono).
// Redige o texto inteiro ANTES de cortar, para não partir e-mail/IP e escapar do redact().
const ROLE_PREFIX = /^(?:use (?:este agente |this agent )?(?:para|quando|when|for|to)|use|usar (?:para|quando)|acionar (?:para|quando))\s+/i;
export function roleText(source) {
  if (typeof source !== 'string') return undefined;
  const full = redact(source, 10_000);
  if (!full) return undefined;
  let s = full.replace(ROLE_PREFIX, '');
  const end = s.search(/[.!?;](?:\s|$)| — /);
  if (end > 0) s = s.slice(0, end);
  s = s.trim();
  if (!s) return undefined;
  s = s[0].toUpperCase() + s.slice(1);
  return s.length > 120 ? s.slice(0, 119) + '…' : s;
}

function sessionState(st, live, now, cfg) {
  const idleFor = now - st.lastTs;
  if (live) {
    if (st.pendingAsk()) return 'asking';
    if (WAIT_RE.test(live.status)) return 'waiting';
    if (live.status === 'busy') return idleFor > cfg.alerts.stuckMinutes * 60_000 ? 'stuck' : 'working';
    return 'free';
  }
  return idleFor < 90_000 ? 'working' : 'left';
}

function activityOf(st, state) {
  if (state === 'asking') return 'perguntando pra você';
  if (state === 'waiting') return 'aguardando você';
  if (state === 'free' || state === 'left') return 'livre';
  if (state === 'stuck') return 'sem resposta';
  if (st.lastKind === 'tool' && st.lastTool) return category(st.lastTool);
  return 'pensando';
}

const TASK_STATE = { asking: 'aguardando', waiting: 'aguardando', working: 'andamento', stuck: 'andamento', free: 'pausada', left: 'concluída' };

export function buildSnapshot(col, cfg, now = Date.now()) {
  const cat = col.catalog || { projects: [], perProject: {}, globalSkills: [], globalAgents: [] };
  const known = new Set(cat.projects);
  const nameOf = (key) => {
    const r = cfg.rooms[key] || {};
    return r.display || (cfg.showRealNames ? label(key, 32) : r.alias) || r.alias || 'Sala';
  };

  const roomInfo = (key) => {
    if (key === '__lobby__') return { name: cfg.lobbyName, policy: cfg.lobbyTasks, kind: 'lobby', hidden: false };
    if (key && known.has(key)) {
      const r = cfg.rooms[key] || {};
      return { name: nameOf(key), policy: r.tasks || 'publico', kind: 'project', hidden: r.hidden === true };
    }
    if (key && (cfg.rooms[key] || (cfg.exclude || []).some((e) => new RegExp(e, 'i').test(key)))) return { hidden: true };
    return { name: 'Visitantes', policy: 'publico', kind: 'external', hidden: false };
  };

  const rooms = new Map();
  const getRoom = (key) => {
    const info = roomInfo(key);
    if (info.hidden) return null;
    const id = roomId(key || '__external__');
    if (!rooms.has(id)) {
      const agents = (key && cat.perProject[key]?.agents) || [];
      rooms.set(id, {
        id, name: info.name, kind: info.kind, policy: info.policy,
        staff: agents.map((a) => ({ name: a.name, model: a.model, does: roleText(a.description) ?? null, state: 'idle', activity: null })),
        sessions: [], interns: [], _tasks: [], _audit: { active: false, verdict: null, verdictAt: 0, today: 0 }, _minutes: new Set(), _hours: new Array(24).fill(0),
        stats: { toolCalls: 0, sessionsToday: 0, activeMinutes: 0 },
        lastActivity: 0,
      });
    }
    return rooms.get(id);
  };

  // todo projeto visível vira sala, trabalhando ou não
  getRoom('__lobby__');
  for (const k of cat.projects) getRoom(k);

  const alerts = [];
  const sessionRoom = new Map();
  const stateById = new Map();

  for (const { state: st } of col.sessions.values()) {
    const room = getRoom(st.projectKey);
    if (!room) continue;
    sessionRoom.set(st.sessionId, room);
    stateById.set(st.sessionId, st);
    const live = col.live.get(st.sessionId) || null;
    const state = sessionState(st, live, now, cfg);
    const window = cfg.contextWindows?.[st.model];
    const contextPct = Number.isFinite(window) && window > 0 && st.contextTokens ? Math.min(100, Math.round((st.contextTokens / window) * 100)) : null;
    const key = shortKey(st.sessionId);

    if (st.today.day) {
      room.stats.toolCalls += st.today.toolCalls;
      room.stats.sessionsToday += 1;
      for (const m of st.today.minutes) room._minutes.add(m);
      st.today.hours.forEach((v, i) => { room._hours[i] += v; });
    }
    room.lastActivity = Math.max(room.lastActivity, st.lastTs);

    if (state !== 'left') {
      const s = {
        key, state, activity: activityOf(st, state), model: label(st.model, 24), contextPct,
        since: st.firstTs || null, lastAt: st.lastTs || null,
      };
      const task = taskText(room.policy, st.title);
      if (task !== undefined) s.task = task;
      room.sessions.push(s);
    }
    if (st.today.day || state !== 'left') {
      room._tasks.push({ kind: 'sessao', title: st.title, agent: 'Claude', state: TASK_STATE[state], at: st.lastTs });
    }

    // auditorias do Codex: só booleano, enum e números
    for (const au of st.audits.values()) {
      const A = room._audit;
      if (new Date(au.ts).toDateString() === new Date(now).toDateString()) A.today++;
      if (!au.done && (live || now - st.lastTs < 90_000) && now - au.ts < 30 * 60_000) A.active = true;
      // um veredito real nunca é mascarado por uma chamada posterior sem veredito (ex.: em segundo plano)
      const real = (v) => v && v !== 'sem veredito';
      if (au.done && VERDICTS.has(au.verdict) && (real(au.verdict) || !real(A.verdict)) && (au.doneTs > A.verdictAt || (real(au.verdict) && !real(A.verdict)))) { A.verdict = au.verdict; A.verdictAt = au.doneTs; }
    }

    if (live) {
      const ask = st.pendingAsk();
      if (state === 'asking') alerts.push({ type: 'asking', room: room.name, roomId: room.id, session: key, text: 'Pergunta esperando você', since: ask });
      else if (state === 'waiting') alerts.push({ type: 'waiting', room: room.name, roomId: room.id, session: key, text: 'Aguardando sua ação', since: live.statusSince });
      else if (state === 'stuck') alerts.push({ type: 'stuck', room: room.name, roomId: room.id, session: key, text: 'Ocupada sem progresso', since: st.lastTs });
      const errs = st.recentErrors(cfg.alerts.errorWindow);
      if (errs >= cfg.alerts.errorThreshold && now - st.lastTs < 30 * 60_000)
        alerts.push({ type: 'errors', room: room.name, roomId: room.id, session: key, text: `${errs} erros nas últimas ${cfg.alerts.errorWindow} ferramentas`, since: st.lastTs });
      if (contextPct !== null && contextPct >= 85)
        alerts.push({ type: 'context', room: room.name, roomId: room.id, session: key, text: `Contexto em ${contextPct}%`, since: st.lastTs });
    }
  }

  // subagentes: funcionário cadastrado se o tipo bater, senão estagiário
  const activeByTool = new Set();
  for (const [file, s] of col.subagents) {
    const room = sessionRoom.get(s.parentId);
    if (!room) continue;
    const parent = stateById.get(s.parentId);
    const pendingInParent = parent && s.meta.toolUseId && parent.pending.has(s.meta.toolUseId);
    const active = now - (s.mtime || 0) < 60_000 || (pendingInParent && now - s.state.lastTs < 10 * 60_000);
    const st = s.state;
    if (st.today.day) {
      room.stats.toolCalls += st.today.toolCalls;
      for (const m of st.today.minutes) room._minutes.add(m);
      st.today.hours.forEach((v, i) => { room._hours[i] += v; });
    }
    room.lastActivity = Math.max(room.lastActivity, st.lastTs);
    if (!active) continue;
    if (s.meta.toolUseId) activeByTool.add(s.meta.toolUseId);
    const act = st.lastKind === 'tool' && st.lastTool ? category(st.lastTool) : 'pensando';
    const type = baseType(s.meta.agentType);
    const task = taskText(room.policy, s.meta.description);
    const staff = room.staff.find((a) => a.name === type);
    if (staff) {
      staff.state = 'working'; staff.activity = act; staff.since = st.firstTs || null;
      if (task !== undefined) staff.task = task;
    } else {
      const it = { key: shortKey('sub:' + file), role: label(type, 24) || 'ajudante', activity: act, since: st.firstTs || null };
      if (task !== undefined) it.task = task;
      room.interns.push(it);
    }
  }

  // delegações viram tarefas
  for (const [sid, room] of sessionRoom) {
    const st = stateById.get(sid);
    for (const [id, d] of st.delegations) {
      const isToday = new Date(d.ts).toDateString() === new Date(now).toDateString();
      const running = activeByTool.has(id);
      if (!isToday && !running) continue;
      room._tasks.push({ kind: 'delegacao', title: d.description, agent: label(baseType(d.agentType), 24) || 'ajudante', state: running ? 'andamento' : (d.done ? 'concluída' : 'andamento'), at: d.ts });
    }
  }

  const out = [];
  for (const r of rooms.values()) {
    if (r.kind === 'external' && !r.sessions.length && !r.interns.length) continue;
    r.stats.activeMinutes = r._minutes.size;
    const tasks = r._tasks.sort((a, b) => b.at - a.at);
    let taskView = null;
    if (r.policy === 'publico') {
      taskView = { mode: 'lista', items: tasks.slice(0, 10).map((t) => ({
        title: taskText('publico', t.title) || (t.kind === 'sessao' ? 'Sessão sem título' : 'Tarefa delegada'),
        agent: t.agent, state: t.state, kind: t.kind,
      })) };
    } else if (r.policy === 'interno') {
      const c = { andamento: 0, aguardando: 0, pausada: 0, concluida: 0 };
      for (const t of tasks) { const k = t.state === 'concluída' ? 'concluida' : t.state; c[k] = (c[k] || 0) + 1; }
      taskView = { mode: 'contagem', counts: c };
    }
    const A = r._audit;
    const auditor = A.active || A.today > 0 || A.verdict
      ? { state: A.active ? 'auditando' : 'livre', verdict: A.verdict, verdictAt: A.verdict ? A.verdictAt : null, today: A.today }
      : null;
    if (A.verdict === 'bloqueado' && now - A.verdictAt < 30 * 60_000 && !A.active)
      alerts.push({ type: 'codex', room: r.name, roomId: r.id, session: null, text: 'Codex bloqueou um plano', since: A.verdictAt });
    const lit = r.sessions.some((s) => WORKING.has(s.state)) || r.interns.length > 0 || r.staff.some((a) => a.state === 'working') || A.active;
    out.push({
      id: r.id, name: r.name, kind: r.kind, policy: r.policy,
      staff: r.staff, sessions: r.sessions, interns: r.interns, tasks: taskView, auditor,
      stats: r.stats, hours: r._hours, lastActivity: r.lastActivity || null,
      lit, active: lit || r.sessions.length > 0,
    });
  }
  out.sort((a, b) => (b.lit - a.lit) || (b.active - a.active) || ((b.lastActivity || 0) - (a.lastActivity || 0)) || a.name.localeCompare(b.name, 'pt'));

  alerts.sort((a, b) => SEV[a.type] - SEV[b.type] || (a.since || 0) - (b.since || 0));

  const visibleProjects = cat.projects.filter((k) => !(cfg.rooms[k]?.hidden));
  const catalog = {
    projects: visibleProjects.map((k) => ({ name: nameOf(k), policy: cfg.rooms[k]?.tasks || 'publico',
      agents: cat.perProject[k]?.agents?.length || 0, skills: cat.perProject[k]?.skills?.length || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt')),
    skills: [...cat.globalSkills.map((n) => ({ name: n, scope: 'global' })),
      ...visibleProjects.flatMap((k) => (cat.perProject[k]?.skills || []).map((n) => ({ name: n, scope: nameOf(k) })))],
    agents: [...cat.globalAgents.map((a) => ({ name: a.name, model: a.model, does: roleText(a.description) ?? null, room: 'global' })),
      ...visibleProjects.flatMap((k) => (cat.perProject[k]?.agents || []).map((a) => ({ name: a.name, model: a.model, does: roleText(a.description) ?? null, room: nameOf(k) })))],
  };

  const allSessions = out.flatMap((r) => r.sessions);
  return {
    v: 2,
    generatedAt: now,
    rooms: out,
    alerts,
    totals: {
      sessions: allSessions.length,
      working: allSessions.filter((s) => s.state === 'working').length,
      waitingYou: allSessions.filter((s) => s.state === 'asking' || s.state === 'waiting').length,
      interns: out.reduce((n, r) => n + r.interns.length + r.staff.filter((a) => a.state === 'working').length, 0),
      roomsLit: out.filter((r) => r.lit && r.kind === 'project').length,
      rooms: out.filter((r) => r.kind === 'project').length,
      toolCalls: out.reduce((n, r) => n + r.stats.toolCalls, 0),
    },
    catalog,
    ui: { rotateSeconds: cfg.rotateSeconds, night: cfg.night },
  };
}
