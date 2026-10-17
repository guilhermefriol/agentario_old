// Catálogo: projetos, skills e agentes. Lê só o frontmatter (name, model, description de uma linha).
import path from 'node:path';
import { listDir, readSmall, safePath } from './paths.mjs';
import { label } from './redact.mjs';

function frontmatter(text) {
  if (!text || !text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end < 0) return {};
  const out = {};
  for (const line of text.slice(3, end).split('\n')) {
    const m = /^(name|model|description)\s*:\s*["']?([^"'\n]+?)["']?\s*$/.exec(line);
    // descrição em bloco (|, |-, >, >+ …) é ignorada: só aceita texto de uma linha
    if (m && !(m[1] === 'description' && /^[|>][+-]?$/.test(m[2]))) out[m[1]] = m[2];
  }
  return out;
}

function readAgents(root, dir) {
  const out = [];
  for (const e of listDir(dir)) {
    if (!e.name.endsWith('.md')) continue;
    const p = safePath(root, path.join(dir, e.name));
    if (!p) continue;
    const fm = frontmatter(readSmall(p, 8192));
    const name = label(fm.name || e.name.replace(/\.md$/, ''));
    // description bruta fica aqui; só snapshot.mjs (roleText) decide o que vai para a TV
    if (name) out.push({ name, model: label(fm.model || '', 16) || null, description: fm.description || null });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function readSkills(root, dir) {
  const out = [];
  for (const e of listDir(dir)) {
    if (!e.isDirectory() && !e.isSymbolicLink()) continue;
    const p = safePath(root, path.join(dir, e.name, 'SKILL.md'));
    if (!p) continue;
    const name = label(frontmatter(readSmall(p, 8192)).name || e.name);
    if (name) out.push(name);
  }
  return [...new Set(out)].sort();
}

export function projectFolders(roots, cfg) {
  const ex = (cfg.exclude || []).map((s) => new RegExp(s, 'i'));
  return listDir(roots.projects)
    .filter((e) => e.isDirectory() && !e.name.startsWith('-') && !e.name.startsWith('.'))
    .map((e) => e.name)
    .filter((n) => !ex.some((re) => re.test(n)));
}

export function readCatalog(roots, cfg) {
  const projects = projectFolders(roots, cfg);
  const perProject = {};
  for (const name of projects) {
    const base = path.join(roots.projects, name, '.claude');
    perProject[name] = {
      agents: readAgents(roots.projects, path.join(base, 'agents')),
      skills: readSkills(roots.projects, path.join(base, 'skills')),
    };
  }
  return {
    projects,
    perProject,
    globalSkills: readSkills(roots.base, roots.skills),
    globalAgents: readAgents(roots.base, roots.agents),
  };
}
