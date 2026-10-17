// Orquestra a leitura. Só lê; o único efeito colateral é registrar projetos novos em config/.
import path from 'node:path';
import { listDir, readSmall, safePath, statOrNull } from './paths.mjs';
import { JsonlTail } from './tail.mjs';
import { SessionState } from './session-state.mjs';
import { readCatalog } from './catalog.mjs';
import { registerProjects } from './config.mjs';

const DAY = 24 * 3600 * 1000;
const SAFE_ID = /^[0-9a-zA-Z-]{8,80}$/;

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

export class Collector {
  constructor(roots, cfg, { now = () => Date.now(), checkPid = pidAlive } = {}) {
    this.roots = roots;
    this.cfg = cfg;
    this.now = now;
    this.checkPid = checkPid;
    this.sessions = new Map(); // file -> { tail, state }
    this.subagents = new Map(); // file -> { tail, state, meta, parentId }
    this.live = new Map(); // sessionId -> { status, startedAt }
    this.catalog = null;
    this.lastCatalog = 0;
    this.lastScan = 0;
  }

  refreshCatalog(force = false) {
    if (!force && this.catalog && this.now() - this.lastCatalog < 60_000) return;
    this.catalog = readCatalog(this.roots, this.cfg);
    registerProjects(this.cfg, this.catalog.projects);
    this.lastCatalog = this.now();
  }

  readLive() {
    const live = new Map();
    for (const e of listDir(this.roots.sessions)) {
      if (!e.name.endsWith('.json')) continue;
      const p = safePath(this.roots.sessions, path.join(this.roots.sessions, e.name));
      if (!p) continue;
      let d;
      try { d = JSON.parse(readSmall(p, 64 * 1024) || ''); } catch { continue; }
      if (!d || typeof d.sessionId !== 'string' || !SAFE_ID.test(d.sessionId)) continue;
      if (!this.checkPid(d.pid)) continue;
      live.set(d.sessionId, {
        status: typeof d.status === 'string' ? d.status.toLowerCase().slice(0, 24) : 'unknown',
        statusSince: Number.isFinite(d.statusUpdatedAt) ? d.statusUpdatedAt : null,
      });
    }
    this.live = live;
  }

  scan() {
    const cutoff = this.now() - DAY;
    const seen = new Set();
    const seenSub = new Set();
    for (const dir of listDir(this.roots.projects)) {
      if (!dir.isDirectory()) continue;
      const dpath = path.join(this.roots.projects, dir.name);
      for (const f of listDir(dpath)) {
        if (f.isFile() && f.name.endsWith('.jsonl')) {
          const id = f.name.slice(0, -6);
          if (!SAFE_ID.test(id)) continue;
          const p = safePath(this.roots.projects, path.join(dpath, f.name));
          const st = p && statOrNull(p);
          if (!st || (st.mtimeMs < cutoff && !this.live.has(id))) continue;
          seen.add(p);
          if (!this.sessions.has(p)) {
            const state = new SessionState(id, p, this.roots.projectsAliases);
            const tail = new JsonlTail(p);
            tail.onReset = () => state.reset();
            this.sessions.set(p, { tail, state });
          }
        } else if (f.isDirectory() && SAFE_ID.test(f.name)) {
          const sdir = path.join(dpath, f.name, 'subagents');
          for (const s of listDir(sdir)) {
            if (!s.isFile() || !/^agent-[0-9a-zA-Z]+\.jsonl$/.test(s.name)) continue;
            const p = safePath(this.roots.projects, path.join(sdir, s.name));
            const st = p && statOrNull(p);
            if (!st || st.mtimeMs < cutoff) continue;
            seenSub.add(p);
            if (!this.subagents.has(p)) {
              let meta = {};
              const mp = safePath(this.roots.projects, p.replace(/\.jsonl$/, '.meta.json'));
              try { meta = JSON.parse((mp && readSmall(mp, 64 * 1024)) || '{}'); } catch {}
              const state = new SessionState(s.name, p, this.roots.projectsAliases);
              state.isSubagent = true;
              const tail = new JsonlTail(p, { initialMaxBytes: 4 * 1024 * 1024 });
              tail.onReset = () => state.reset();
              this.subagents.set(p, {
                tail, state, parentId: f.name,
                meta: {
                  agentType: typeof meta.agentType === 'string' ? meta.agentType : 'general-purpose',
                  description: typeof meta.description === 'string' ? meta.description : null,
                  toolUseId: typeof meta.toolUseId === 'string' ? meta.toolUseId : null,
                },
              });
            }
          }
        }
      }
    }
    for (const k of this.sessions.keys()) if (!seen.has(k)) this.sessions.delete(k);
    for (const k of this.subagents.keys()) if (!seenSub.has(k)) this.subagents.delete(k);
    this.lastScan = this.now();
  }

  tick() {
    this.refreshCatalog();
    this.readLive();
    if (this.now() - this.lastScan > 15_000 || this.sessions.size === 0) this.scan();
    for (const { tail, state } of this.sessions.values()) tail.poll((r) => state.ingest(r));
    for (const s of this.subagents.values()) {
      s.tail.poll((r) => s.state.ingest(r));
      s.mtime = statOrNull(s.tail.file)?.mtimeMs || 0;
    }
  }
}
