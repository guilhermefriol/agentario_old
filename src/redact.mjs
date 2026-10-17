// Redação de texto livre (títulos) para o nível "publico". Não é anonimização perfeita:
// por isso o padrão de todo projeto é "oculto".
const RULES = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[e-mail]'],
  [/\bhttps?:\/\/\S+/gi, '[link]'],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]'],
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[cnpj]'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?(?::\d+)?\b/g, '[ip]'],
  [/\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi, '[ip]'],
  [/(?:~|\.{1,2})?\/[\w.\-~/]*[\w\-~/]/g, '[caminho]'], // sem engolir o ponto final
  [/\b[\w.-]+\.(?:local|lan|internal|corp|intra)\b/gi, '[host]'],
  [/\b(?:sk|pk|ghp|gho|xox[abpr]|AKIA|eyJ)[\w\-]{8,}/g, '[token]'],
  [/\b[A-Za-z0-9+/_\-]{24,}={0,2}/g, '[token]'],
  [/\b[0-9a-f]{16,}\b/gi, '[hash]'],
  [/(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, '[telefone]'],
  [/\b(?:senha|password|passwd|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, '[segredo]'],
];

export function redact(text, max = 60) {
  if (typeof text !== 'string') return null;
  let s = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, rep] of RULES) s = s.replace(re, rep);
  if (!s) return null;
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Rótulos curtos vindos do catálogo (nomes de skill/agente): só caracteres seguros, tamanho limitado.
export function label(text, max = 32) {
  if (typeof text !== 'string') return null;
  const s = text.replace(/[^\p{L}\p{N} ._\-]/gu, '').trim();
  return s ? s.slice(0, max) : null;
}
