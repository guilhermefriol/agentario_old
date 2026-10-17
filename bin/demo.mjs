#!/usr/bin/env node
// Modo demonstração: cria um ~/.claude FICTÍCIO numa pasta temporária, simula atividade
// e sobe o painel apontado para ela. Não lê nem escreve nada dos seus dados reais.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-room-demo-'));
const P = path.join(base, 'projects');
const projects = {
  atlas: { display: 'Atlas', tasks: 'publico', agents: ['planner', 'backend-dev', 'frontend-dev', 'qa', 'reviewer', 'devops'] },
  orion: { display: 'Orion', tasks: 'interno', agents: ['pesquisa', 'redator', 'revisor'] },
  lumen: { display: 'Lumen', tasks: 'publico', agents: [] },
  vega: { display: 'Vega', tasks: 'oculto', agents: ['analista', 'auditor'] },
};
// mais salas paradas, para o prédio ficar do tamanho de um uso real
for (const n of ['aurora', 'boreal', 'cometa', 'delta', 'eclipse', 'fenix', 'galaxia', 'hidra', 'iris', 'jupiter', 'kepler', 'lince', 'mercurio', 'nebula', 'olimpo', 'pulsar', 'quasar', 'rigel', 'saturno', 'titan', 'urano', 'zenite'])
  projects[n] = { display: n[0].toUpperCase() + n.slice(1), tasks: 'oculto', agents: n.length % 3 ? [] : ['dev', 'qa'] };
projects.olimpo.agents = Array.from({ length: 18 }, (_, i) => 'agente-' + (i + 1));
for (const [k, p] of Object.entries(projects)) {
  fs.mkdirSync(path.join(P, k, '.claude', 'agents'), { recursive: true });
  const DOES = ['Use para revisar código e apontar bugs antes do merge.', 'Escreve e mantém a documentação do projeto.', 'Use quando precisar de testes automatizados novos.', 'Cuida do deploy e da saúde dos serviços.'];
  for (const [i, a] of p.agents.entries()) fs.writeFileSync(path.join(P, k, '.claude', 'agents', a + '.md'), `---\nname: ${a}\nmodel: ${a.length % 2 ? 'sonnet' : 'opus'}\ndescription: ${DOES[i % DOES.length]}\n---\n`);
}
for (const s of ['deploy', 'testes-e2e', 'auditoria-lgpd', 'diagramas', 'revisao-codigo', 'monitor-mac', 'graficos', 'pentest-autorizado']) {
  fs.mkdirSync(path.join(base, 'skills', s), { recursive: true });
  fs.writeFileSync(path.join(base, 'skills', s, 'SKILL.md'), `---\nname: ${s}\n---\n`);
}
fs.mkdirSync(path.join(base, 'sessions'), { recursive: true });

const TOOLS = ['Edit', 'Read', 'Bash', 'Grep', 'WebSearch', 'Write', 'Bash', 'Edit', 'Skill', 'mcp__x__y'];
const sessions = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000001', proj: 'atlas', title: 'Refatorar o módulo de cobrança', mode: 'busy' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000002', proj: 'atlas', title: 'Corrigir testes do checkout', mode: 'ask' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000003', proj: 'orion', title: 'Rascunho do relatório trimestral', mode: 'busy' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000004', proj: 'lumen', title: 'Landing page nova', mode: 'free' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000005', proj: 'vega', title: 'Análise privada', mode: 'stuck' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000006', proj: '', title: 'Organizar a semana', mode: 'busy' },
];
const iso = (d = 0) => new Date(Date.now() - d).toISOString();
let n = 0;
const line = (f, r) => fs.appendFileSync(f, JSON.stringify(r) + '\n');
for (const s of sessions) {
  const dir = path.join(P, '-demo-' + (s.proj || 'lobby'));
  fs.mkdirSync(path.join(dir, s.id, 'subagents'), { recursive: true });
  s.file = path.join(dir, s.id + '.jsonl');
  s.cwd = s.proj ? path.join(P, s.proj) : P;
  const old = s.mode === 'stuck' ? 15 * 60_000 : 0;
  line(s.file, { type: 'user', cwd: s.cwd, timestamp: iso(old + 3 * 3600_000), message: { role: 'user', content: 'demo' } });
  line(s.file, { type: 'ai-title', aiTitle: s.title, timestamp: iso(old + 3 * 3600_000) });
  for (let i = 0; i < 40; i++) line(s.file, { type: 'assistant', cwd: s.cwd, timestamp: iso(old + (3 * 3600_000 * (40 - i)) / 40), message: { model: 'claude-demo', usage: { input_tokens: 2000, cache_read_input_tokens: 40000 + i * 3000, output_tokens: 900 }, content: [{ type: 'tool_use', id: 'h' + (n++), name: TOOLS[i % TOOLS.length], input: {} }] } });
  line(s.file, { type: 'user', cwd: s.cwd, timestamp: iso(old), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'h' + (n - 1), content: 'ok' }] } });
  if (s.mode === 'ask') line(s.file, { type: 'assistant', cwd: s.cwd, timestamp: iso(90_000), message: { model: 'claude-demo', content: [{ type: 'tool_use', id: 'ask1', name: 'AskUserQuestion', input: {} }] } });
  if (s.mode === 'free') line(s.file, { type: 'assistant', cwd: s.cwd, timestamp: iso(60_000), message: { model: 'claude-demo', stop_reason: 'end_turn', content: [{ type: 'text', text: 'pronto' }] } });
  fs.writeFileSync(path.join(base, 'sessions', s.id.slice(-2) + '.json'), JSON.stringify({ pid: process.pid, sessionId: s.id, cwd: s.cwd, status: s.mode === 'free' ? 'idle' : 'busy', statusUpdatedAt: Date.now() - 120_000 }));
}
// delegações com subagentes
const subs = [
  { s: 0, type: 'backend-dev', desc: 'Migrar tabela de faturas' },
  { s: 0, type: 'qa', desc: 'Rodar a bateria de regressão' },
  { s: 0, type: 'general-purpose', desc: 'Levantar dependências antigas' },
  { s: 2, type: 'pesquisa', desc: 'Comparar fornecedores' },
  { s: 5, type: 'Explore', desc: 'Mapear notas da semana' },
];
subs.forEach((x, i) => {
  const s = sessions[x.s];
  const tu = 'del' + i;
  line(s.file, { type: 'assistant', cwd: s.cwd, timestamp: iso(5 * 60_000), message: { model: 'claude-demo', content: [{ type: 'tool_use', id: tu, name: 'Agent', input: { subagent_type: x.type, description: x.desc, prompt: 'demo' } }] } });
  const sd = path.join(path.dirname(s.file), s.id, 'subagents');
  x.file = path.join(sd, `agent-demo${i}.jsonl`);
  fs.writeFileSync(path.join(sd, `agent-demo${i}.meta.json`), JSON.stringify({ agentType: x.type, description: x.desc, toolUseId: tu }));
  line(x.file, { type: 'user', isSidechain: true, cwd: s.cwd, timestamp: iso(5 * 60_000), message: { role: 'user', content: 'demo' } });
});

fs.mkdirSync(path.join(ROOT, 'config'), { recursive: true });
const cfg = { port: 4748, lobbyName: 'Saguão', lobbyTasks: 'publico', contextWindows: { 'claude-demo': 200000 }, rotateSeconds: 20, rooms: {} };
let i = 0;
for (const [k, p] of Object.entries(projects)) cfg.rooms[k] = { alias: `Sala ${++i}`, display: p.display, tasks: p.tasks, hidden: false };
fs.writeFileSync(path.join(ROOT, 'config', 'demo.json'), JSON.stringify(cfg, null, 2));

// auditorias do Codex em ciclo: começa, demora ~25 s e sai um veredito
const VEREDITOS = ['aprovar', 'revisar', 'bloquear', 'aprovar'];
let auditN = 0;
function audit(s) {
  const id = 'cx' + (auditN++);
  line(s.file, { type: 'assistant', cwd: s.cwd, timestamp: iso(), message: { model: 'claude-demo', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'cat /tmp/plano.md | codex exec --skip-git-repo-check -s read-only -' } }] } });
  setTimeout(() => line(s.file, { type: 'user', cwd: s.cwd, timestamp: iso(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: `parecer...\n**Veredito: ${VEREDITOS[auditN % VEREDITOS.length]}**` }] } }), 25_000);
}
setTimeout(() => audit(sessions[0]), 4000);
setInterval(() => audit(sessions[auditN % 2 ? 2 : 0]), 45_000);

// simula trabalho contínuo
setInterval(() => {
  for (const s of sessions) {
    if (s.mode !== 'busy') continue;
    const id = 'l' + (n++);
    line(s.file, { type: 'assistant', cwd: s.cwd, timestamp: iso(), message: { model: 'claude-demo', usage: { input_tokens: 2000, cache_read_input_tokens: 90000 + (n % 50) * 1500, output_tokens: 400 }, content: [{ type: 'tool_use', id, name: TOOLS[n % TOOLS.length], input: {} }] } });
    line(s.file, { type: 'user', cwd: s.cwd, timestamp: iso(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: n % 13 === 0, content: 'ok' }] } });
  }
  subs.forEach((x, k) => {
    if ((Math.floor(Date.now() / 20000) + k) % 4 === 0) return; // alguns entram e saem
    line(x.file, { type: 'assistant', isSidechain: true, timestamp: iso(), message: { model: 'claude-demo', content: [{ type: 'tool_use', id: 'x' + (n++), name: TOOLS[(n + k) % TOOLS.length], input: {} }] } });
  });
}, 2500);

const child = spawn(process.execPath, [path.join(ROOT, 'bin', 'pixel_room.mjs')], {
  stdio: 'inherit', env: { ...process.env, PIXEL_ROOM_CLAUDE_DIR: base, PIXEL_ROOM_CONFIG: 'demo' },
});
const stop = () => { child.kill(); fs.rmSync(base, { recursive: true, force: true }); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
console.log('[demo] escritório fictício em', base);
