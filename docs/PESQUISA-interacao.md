# Pesquisa: interagir com sessões do Claude Code a partir de um serviço local (2026-10-17)

Base para o plano v8. Fonte: documentação oficial (code.claude.com/docs/en/…: headless, cli-reference,
agent-sdk/typescript, agent-sdk/permissions, hooks, sessions, agent-view, remote-control, channels).
Itens marcados "conferir" não foram confirmados no texto lido.

## Decisões do dono
Quer pela TV: **responder perguntas**, **mandar tarefa nova** numa sala (projeto) e **parar uma sessão**.
Interação = serviço separado com autenticação; o servidor do painel continua só leitura.

## O que é possível
| Capacidade | Sessão aberta pelo dono no terminal | Sessão aberta pelo serviço |
|---|---|---|
| Ver "esperando você" | sim (já fazemos lendo transcripts; hooks `Notification` ajudam) | sim |
| Aprovar/negar permissão de ferramenta | só se configurado **antes**: hook `PermissionRequest` (pode chamar o serviço local e esperar a resposta; `type: "http"` — conferir) ou sessão iniciada com `--channels` (research preview) | sim: Agent SDK `canUseTool` |
| Responder pergunta de múltipla escolha (AskUserQuestion) | **não** por serviço; só Remote Control (app oficial do Claude) | sim via Agent SDK (`canUseTool`/user-input — conferir detalhes) |
| Mandar tarefa nova | n/a | sim: `claude -p` (cwd = pasta do projeto) ou Agent SDK `query()` |
| Parar | não documentado para TUI (só Esc/Ctrl+C no terminal) | sim: SDK `interrupt()`/`abort()`/`close()`; `claude -p`: SIGINT termina o turno, SIGTERM encerra |

**Não fazer:** retomar (`--resume`) a mesma sessão que está viva em outro terminal: as mensagens se
misturam e as permissões não são compartilhadas. Não construir sobre o transporte interno do Remote Control.

## Padrões seguros para tarefas vindas da TV
`--bare` (não executa hooks/MCP do projeto), `--permission-mode dontAsk` + `--allowedTools` estreito
(ex.: `Read,Grep,Glob`), `--permission-prompts none`, `--max-turns`, `--max-budget-usd`; `plan` para
tarefas só de análise. Evitar `bypassPermissions` e `auto`. Nunca pôr credencial no prompt.
Alternativa com controle fino: Agent SDK (TypeScript) com `canUseTool` e `abortController`.
