// Raízes autorizadas e guarda de caminho. Nada aqui escreve em disco.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function makeRoots(claudeDir = process.env.AGENTARIO_CLAUDE_DIR || path.join(os.homedir(), '.claude')) {
  const base = fs.realpathSync(claudeDir);
  const raw = path.resolve(claudeDir);
  return {
    base,
    projectsAliases: [...new Set([path.join(base, 'projects'), path.join(raw, 'projects')])],
    projects: path.join(base, 'projects'),
    sessions: path.join(base, 'sessions'),
    skills: path.join(base, 'skills'),
    agents: path.join(base, 'agents'),
  };
}

// Arquivos que o painel NUNCA abre, mesmo que estejam dentro de uma raiz autorizada.
const DENY = [
  /\.key$/i, /(^|\/)\.env/i, /settings(\.local)?\.json$/i, /history\.jsonl$/i,
  /(^|\/)(paste-cache|file-history|session-env|shell-snapshots|telemetry|downloads)(\/|$)/i,
  /\.(pem|p12|pfx|kdbx)$/i,
];

// Resolve symlinks e confirma que o alvo continua dentro de `root`. Retorna null se não puder ler.
export function safePath(root, p) {
  let real;
  try { real = fs.realpathSync(p); } catch { return null; }
  const r = root.endsWith(path.sep) ? root : root + path.sep;
  if (real !== root && !real.startsWith(r)) return null;
  if (DENY.some((re) => re.test(real))) return null;
  return real;
}

export function listDir(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

export function statOrNull(p) {
  try { return fs.statSync(p); } catch { return null; }
}

// Leitura de arquivo pequeno, só com flag 'r'.
export function readSmall(p, max = 256 * 1024) {
  let fd;
  try {
    fd = fs.openSync(p, 'r');
    const st = fs.fstatSync(fd);
    const len = Math.min(st.size, max);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, 0);
    return buf.toString('utf8');
  } catch { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
}
