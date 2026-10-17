// Máquina de estado por transcript. Guarda só fatos mínimos; o título bruto fica em memória
// e só sai do processo redigido, e apenas para projetos "publico".
import path from 'node:path';
import { isCodexCommand, verdictOf } from './audit.mjs';

export function localDayKey(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export class SessionState {
  constructor(sessionId, file, projectsRoots) {
    this.sessionId = sessionId;
    this.file = file;
    this.projectsRoots = Array.isArray(projectsRoots) ? projectsRoots : [projectsRoots];
    this.projectKey = null;
    this.model = null;
    this.title = null;
    this.firstTs = null;
    this.lastTs = 0;
    this.pending = new Map();
    this.lastTool = null;
    this.lastKind = null;
    this.contextTokens = null;
    this.results = [];
    this.delegations = new Map();
    this.audits = new Map(); // tool_use_id -> { ts, done, verdict, doneTs } (sem texto)
    this.today = { day: null, outputTokens: 0, minutes: new Set(), toolCalls: 0, hours: new Array(24).fill(0) };
  }

  reset() {
    const keep = this.isSubagent;
    Object.assign(this, new SessionState(this.sessionId, this.file, this.projectsRoots));
    this.isSubagent = keep;
  }

  mapCwd(cwd) {
    if (typeof cwd !== 'string') return;
    for (const root of this.projectsRoots) {
      if (cwd === root) { this.projectKey = '__lobby__'; return; }
      if (cwd.startsWith(root + path.sep)) { this.projectKey = cwd.slice(root.length + 1).split(path.sep)[0]; return; }
    }
    this.projectKey = '__external__';
  }

  touchToday(ts, kind) {
    const d = new Date(ts);
    const key = localDayKey(d);
    const now = localDayKey(new Date());
    if (key !== now) return false;
    if (this.today.day !== now) this.today = { day: now, outputTokens: 0, minutes: new Set(), toolCalls: 0, hours: new Array(24).fill(0) };
    this.today.minutes.add(Math.floor(ts / 60000));
    this.today.hours[d.getHours()]++;
    if (kind === 'tool') this.today.toolCalls++;
    return true;
  }

  ingest(r) {
    if (r.isSidechain === true && !this.isSubagent) return;
    if (!this.projectKey && r.cwd) this.mapCwd(r.cwd);
    const ts = Date.parse(r.timestamp);
    const hasTs = Number.isFinite(ts);
    if (hasTs) { if (!this.firstTs) this.firstTs = ts; if (ts > this.lastTs) this.lastTs = ts; }

    if (r.type === 'ai-title' && typeof r.aiTitle === 'string') { this.title = r.aiTitle; return; }
    const m = r.message;
    if (!m || typeof m !== 'object') return;

    if (r.type === 'assistant') {
      if (typeof m.model === 'string' && !m.model.startsWith('<')) this.model = m.model;
      const u = m.usage;
      if (u && typeof u === 'object') {
        const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        if (ctx > 0) this.contextTokens = ctx;
        if (hasTs && this.touchToday(ts, 'msg')) this.today.outputTokens += u.output_tokens || 0;
      }
      let sawTool = false;
      for (const b of Array.isArray(m.content) ? m.content : []) {
        if (!b || b.type !== 'tool_use' || typeof b.id !== 'string') continue;
        sawTool = true;
        this.pending.set(b.id, { name: String(b.name || ''), ts: hasTs ? ts : Date.now() });
        this.lastTool = String(b.name || '');
        if (hasTs) this.touchToday(ts, 'tool');
        if (b.name === 'Bash' && b.input && isCodexCommand(b.input.command)) {
          this.audits.set(b.id, { ts: hasTs ? ts : Date.now(), done: false, verdict: null, doneTs: null });
          if (this.audits.size > 50) this.audits.delete(this.audits.keys().next().value);
        }
        if ((b.name === 'Agent' || b.name === 'Task') && b.input && typeof b.input === 'object') {
          this.delegations.set(b.id, {
            agentType: typeof b.input.subagent_type === 'string' ? b.input.subagent_type : 'general-purpose',
            description: typeof b.input.description === 'string' ? b.input.description : null,
            ts: hasTs ? ts : Date.now(),
            done: false,
          });
        }
      }
      if (sawTool) this.lastKind = 'tool';
      else if (m.stop_reason === 'end_turn' || m.stop_reason === 'stop_sequence') this.lastKind = 'done';
      else this.lastKind = 'thinking';
      return;
    }

    if (r.type === 'user') {
      const c = m.content;
      if (Array.isArray(c) && c.some((b) => b && b.type === 'tool_result')) {
        for (const b of c) {
          if (!b || b.type !== 'tool_result') continue;
          this.pending.delete(b.tool_use_id);
          this.results.push(b.is_error === true);
          if (this.results.length > 50) this.results.shift();
          const au = this.audits.get(b.tool_use_id);
          if (au && !au.done) { au.done = true; au.verdict = verdictOf(b.content); au.doneTs = hasTs ? ts : Date.now(); }
          const del = this.delegations.get(b.tool_use_id);
          if (del) del.done = true;
        }
        this.lastKind = 'tool_result';
      } else if (!r.isMeta) {
        this.lastKind = 'prompt';
        if (hasTs) this.touchToday(ts, 'msg');
      }
    }
  }

  pendingAsk() {
    let oldest = null;
    for (const p of this.pending.values()) if (p.name === 'AskUserQuestion' && (!oldest || p.ts < oldest)) oldest = p.ts;
    return oldest;
  }

  recentErrors(window) {
    return this.results.slice(-window).filter(Boolean).length;
  }
}
