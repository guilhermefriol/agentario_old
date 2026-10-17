// Monta um ~/.claude falso com segredos plantados em todos os lugares que NÃO podem vazar.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SECRETS = {
  prompt: 'SEGREDO_PROMPT_7731',
  bash: 'rm -rf /srv/CLIENTE_BASH_991',
  filePath: '/Users/fake/clientes/ARQUIVO_SECRETO_55.txt',
  toolResult: 'RESULTADO_SECRETO_442',
  thinking: 'PENSAMENTO_SECRETO_118',
  sessionName: 'NOME_SESSAO_SECRETO_63',
  subPrompt: 'PROMPT_SUBAGENTE_SECRETO_20',
  keyFile: 'CHAVE_PRIVADA_SECRETA_09',
  settings: 'SETTINGS_SECRETO_77',
  folder: 'acme-cliente-sigiloso',
  textReply: 'RESPOSTA_TEXTO_SECRETA_31',
};
// texto livre que só pode aparecer em "publico" (e já redigido)
export const TITLE_WORD = 'CLIENTEXYZTITULO';
export const TITLE = `Migrar ${TITLE_WORD} para 10.0.0.5 avisar joao@empresa.com.br`;
export const DESC_WORD = 'DESCCLIENTE';
// função do agente (frontmatter description): liberada na TV, mas redigida e só a 1ª frase
export const ROLE_WORD = 'FUNCAOREVISOR';
export const ROLE_TAIL = 'SEGUNDAFRASEAGENTE';
export const ROLE_DESC = `Use para revisar ${ROLE_WORD} avisando joao@empresa.com.br no 10.0.0.5 em /srv/cliente. ${ROLE_TAIL} senha: hunter2`;

export function buildFixture({ alivePid = process.pid } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-room-fx-'));
  const projects = path.join(base, 'projects');
  const proj = path.join(projects, SECRETS.folder);
  fs.mkdirSync(path.join(proj, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(proj, '.claude', 'agents', 'revisor.md'), `---\nname: revisor\nmodel: sonnet\ndescription: ${ROLE_DESC}\n---\ncorpo ${SECRETS.toolResult}\n`);
  fs.mkdirSync(path.join(base, 'skills', 'minha-skill'), { recursive: true });
  fs.writeFileSync(path.join(base, 'skills', 'minha-skill', 'SKILL.md'), `---\nname: minha-skill\ndescription: ${SECRETS.thinking}\n---\n`);
  fs.writeFileSync(path.join(base, 'settings.json'), JSON.stringify({ token: SECRETS.settings }));

  const sid = '11111111-2222-3333-4444-555555555555';
  const mangled = path.join(projects, '-fake-' + SECRETS.folder);
  fs.mkdirSync(path.join(mangled, sid, 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(mangled, 'x.key'), SECRETS.keyFile);
  const now = Date.now();
  const ts = (d) => new Date(now - d).toISOString();
  const cwd = path.join(proj, 'sub');
  const recs = [
    { type: 'user', cwd, timestamp: ts(60000), message: { role: 'user', content: `faça ${SECRETS.prompt}` } },
    { type: 'ai-title', aiTitle: TITLE, timestamp: ts(59000) },
    { type: 'assistant', cwd, timestamp: ts(58000), message: { model: 'claude-test-1', stop_reason: 'tool_use', usage: { input_tokens: 10, cache_read_input_tokens: 900, output_tokens: 50 }, content: [
      { type: 'thinking', thinking: SECRETS.thinking },
      { type: 'text', text: SECRETS.textReply },
      { type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: SECRETS.bash } },
      { type: 'tool_use', id: 'tu2', name: 'Read', input: { file_path: SECRETS.filePath } },
    ] } },
    { type: 'user', cwd, timestamp: ts(57000), message: { role: 'user', content: [
      { type: 'tool_result', tool_use_id: 'tu1', is_error: true, content: SECRETS.toolResult },
      { type: 'tool_result', tool_use_id: 'tu2', is_error: false, content: [{ type: 'text', text: SECRETS.toolResult }] },
    ] }, toolUseResult: { stdout: SECRETS.toolResult } },
    { type: 'assistant', cwd, timestamp: ts(56000), message: { model: 'claude-test-1', stop_reason: 'tool_use', content: [
      { type: 'tool_use', id: 'tu3', name: 'Agent', input: { subagent_type: 'revisor', description: `revisar ${DESC_WORD}`, prompt: SECRETS.subPrompt } },
      { type: 'tool_use', id: 'tu4', name: 'AskUserQuestion', input: { questions: [{ question: SECRETS.prompt }] } },
    ] } },
    { type: 'last-prompt', lastPrompt: SECRETS.prompt, timestamp: ts(55000) },
  ];
  // linha incompleta no fim (escrita em andamento) não pode quebrar nada
  fs.writeFileSync(path.join(mangled, sid + '.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n{"type":"user","mess');
  fs.writeFileSync(path.join(mangled, sid, 'subagents', 'agent-abc123.meta.json'), JSON.stringify({ agentType: 'revisor', description: `revisar ${DESC_WORD}`, toolUseId: 'tu3' }));
  fs.writeFileSync(path.join(mangled, sid, 'subagents', 'agent-abc123.jsonl'), [
    { type: 'user', isSidechain: true, cwd, timestamp: ts(50000), message: { role: 'user', content: SECRETS.subPrompt } },
    { type: 'assistant', isSidechain: true, cwd, timestamp: ts(1000), message: { model: 'claude-test-1', content: [{ type: 'tool_use', id: 's1', name: 'Edit', input: { file_path: SECRETS.filePath } }] } },
  ].map((r) => JSON.stringify(r)).join('\n') + '\n');

  fs.mkdirSync(path.join(base, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(base, 'sessions', '1.json'), JSON.stringify({ pid: alivePid, sessionId: sid, cwd, name: SECRETS.sessionName, status: 'busy', statusUpdatedAt: now - 30000 }));
  return { base, sid };
}

export function hashTree(dir) {
  const crypto = globalThis.__crypto;
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const st = fs.statSync(p);
        out[path.relative(dir, p)] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') + ':' + st.mtimeMs + ':' + st.mode;
      }
    }
  };
  walk(dir);
  return out;
}
