// Ferramenta -> categoria visível. Nenhum input de ferramenta é usado.
const MAP = {
  Edit: 'editando', Write: 'editando', NotebookEdit: 'editando', MultiEdit: 'editando',
  Read: 'lendo', Grep: 'lendo', Glob: 'lendo', ToolSearch: 'lendo', LS: 'lendo',
  Bash: 'rodando comando', Monitor: 'rodando comando', BashOutput: 'rodando comando',
  WebFetch: 'pesquisando na web', WebSearch: 'pesquisando na web',
  Agent: 'delegando', Task: 'delegando', SendMessage: 'delegando', TaskStop: 'delegando',
  AskUserQuestion: 'perguntando pra você',
  Skill: 'usando skill', Artifact: 'publicando', TodoWrite: 'planejando', TaskCreate: 'planejando', TaskUpdate: 'planejando',
  ScheduleWakeup: 'agendando', CronCreate: 'agendando', CronList: 'agendando',
};

export function category(toolName) {
  if (typeof toolName !== 'string') return 'trabalhando';
  if (MAP[toolName]) return MAP[toolName];
  if (toolName.startsWith('mcp__')) return 'usando integração';
  return 'trabalhando';
}
