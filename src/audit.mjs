// Classificação das auditorias do Codex. Recebe texto bruto (comando ou resultado) e devolve só
// valores fechados. Nada do texto é guardado ou retornado.
const CODEX_CMD = /(^|[\s;&|(])(\S*\/)?codex\s+exec\b/;
const VERDICT = /veredito\W{0,30}(aprovar|aprovado|revisar|bloquear|bloqueado)/gi;
const MAX = 512 * 1024;

export function isCodexCommand(cmd) {
  return typeof cmd === 'string' && cmd.length <= MAX && CODEX_CMD.test(cmd);
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('\n');
  return '';
}

// retorna 'aprovado' | 'revisar' | 'bloqueado' | 'sem veredito' (vale o ÚLTIMO veredito do texto)
export function verdictOf(content) {
  let s = textOf(content);
  if (s.length > MAX) s = s.slice(-MAX);
  let last = null;
  for (const m of s.matchAll(VERDICT)) last = m[1].toLowerCase();
  if (!last) return 'sem veredito';
  if (last.startsWith('aprov')) return 'aprovado';
  if (last.startsWith('bloq')) return 'bloqueado';
  return 'revisar';
}
