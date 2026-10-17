// ÚNICO módulo que escreve em disco, e só dentro de pixel_room/config/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_DIR = path.resolve(HERE, '..', 'config');
const LEVELS = new Set(['publico', 'interno', 'oculto']);

export const DEFAULTS = {
  port: 4747,
  lobbyName: 'Centro de comando',
  showRealNames: true,
  lobbyTasks: 'publico',
  exclude: ['_BKP$', 'arquivo', '^teste$', '^tmp$'],
  contextWindows: {},
  rotateSeconds: 45,
  night: { from: '20:00', to: '07:00', dim: 0.55 },
  alerts: { stuckMinutes: 10, errorThreshold: 3, errorWindow: 10 },
  rooms: {},
};

function writeOwn(file, data) {
  const target = path.resolve(file);
  if (!target.startsWith(CONFIG_DIR + path.sep)) throw new Error('escrita fora de config/ recusada');
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, target);
}

export function configFile(name = process.env.PIXEL_ROOM_CONFIG || 'local') {
  return path.join(CONFIG_DIR, path.basename(String(name)).replace(/[^\w-]/g, '') + '.json');
}

export function loadConfig(file = configFile()) {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const cfg = { ...DEFAULTS, ...raw,
    night: { ...DEFAULTS.night, ...(raw.night || {}) },
    alerts: { ...DEFAULTS.alerts, ...(raw.alerts || {}) },
    rooms: { ...(raw.rooms || {}) } };
  for (const [k, r] of Object.entries(cfg.rooms)) {
    cfg.rooms[k] = {
      alias: typeof r.alias === 'string' ? r.alias : null,
      display: typeof r.display === 'string' && r.display.trim() ? r.display.trim().slice(0, 32) : null,
      // ausente → publico (decisão do dono: a TV é privada); valor inválido → oculto
      tasks: LEVELS.has(r.tasks) ? r.tasks : (r.tasks == null ? 'publico' : 'oculto'),
      hidden: r.hidden === true,
    };
  }
  if (!LEVELS.has(cfg.lobbyTasks)) cfg.lobbyTasks = raw.lobbyTasks == null ? 'publico' : 'oculto';
  if (!raw.lobbyName || raw.lobbyName === 'Saguão') cfg.lobbyName = DEFAULTS.lobbyName; // migra o nome antigo
  cfg.lobbyName = String(cfg.lobbyName).slice(0, 32);
  cfg.showRealNames = cfg.showRealNames !== false;
  cfg._file = file;
  return cfg;
}

// Registra projetos novos (alias genérico, tarefas visíveis — o dono controla quem vê a TV).
export function registerProjects(cfg, names) {
  let changed = false;
  let n = Object.values(cfg.rooms).reduce((m, r) => {
    const x = /^Sala (\d+)$/.exec(r.alias || ''); return x ? Math.max(m, +x[1]) : m;
  }, 0);
  for (const name of [...names].sort()) {
    if (cfg.rooms[name]) continue;
    cfg.rooms[name] = { alias: `Sala ${++n}`, display: null, tasks: 'publico', hidden: false };
    changed = true;
  }
  if (changed && cfg._file) {
    const { _file, ...data } = cfg;
    writeOwn(_file, data);
  }
  return changed;
}
