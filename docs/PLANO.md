# Plano: "Escritório" — painel de TV só-leitura dos agentes Claude Code

## Objetivo
Painel web para ficar rodando numa TV de escritório: escritório 2D estilo pixel art (salas = projetos,
funcionários = agentes/sessões), mais faixas de informação acionável (alertas, tarefas, atividade).
Estritamente só visual: nenhum controle, nenhuma escrita em ~/.claude, nenhum hook.
Futuro (fora deste escopo): renderer 3D e interação com agentes.

## Fontes de dados (todas leitura, via fs.watch + polling)
- ~/.claude/sessions/*.json -> sessões vivas: pid, sessionId, cwd, name, status (busy/idle), updatedAt.
- ~/.claude/projects/*/*.jsonl e */subagents/*.jsonl -> último tool_use (só o NOME da ferramenta),
  timestamps, isSidechain, subagentes, tarefas (TodoWrite/TaskCreate/TaskUpdate), uso de tokens.
- ~/.claude/skills/*/SKILL.md e <projeto>/.claude/skills -> só o campo name do frontmatter.
- <projeto>/.claude/agents/*.md -> só name e model do frontmatter.
- Lista de projetos: pastas reais em ~/.claude/projects, filtrando dirs temporários (-private-*, tmp, BKP/arquivo via config).
- Nunca ler: *.key, settings*.json, .env*, history.jsonl, paste-cache, file-history, session-env.

## Arquitetura
1. Coletor (Node 22+, sem dependências pesadas): parser incremental de JSONL (lê só bytes novos por offset).
2. Sanitizador por ALLOWLIST: produz um snapshot com campos fixos e tipados. Nunca repassa prompt,
   tool input (comandos, paths, URLs), tool output, thinking, conteúdo de arquivo. Ferramenta vira
   categoria: editando / lendo / rodando comando / pesquisando web / delegando subagente / aguardando você.
   Títulos de tarefas (decisão do dono: política configurável por projeto) passam por: limite de tamanho, regex de redação (e-mail, CPF/CNPJ, IP, tokens,
   URLs, paths) e política por projeto (publico | interno | oculto) num config local.
3. Servidor HTTP: só GET (snapshot JSON + Server-Sent Events). Sem endpoint de escrita. Bind fixo em
   127.0.0.1 (decisão do dono: TV via HDMI direto no Mac; sem modo LAN nesta versão). Checagem de Host
   header contra DNS rebinding. CSP estrito, sem CDN, sem telemetria, assets self-hosted.
4. Front (Vite + PixiJS 2D): camada de render separada do modelo de dados (contrato = snapshot).
   Decisão do dono: construir DOIS renderers sobre o mesmo snapshot, para ele escolher:
   (a) 2D pixel top-down; (b) 2D isométrico. Troca por query string (?view=topdown|iso).
   O mesmo contrato permite um renderer Three.js no futuro sem mexer no coletor.

## O que a TV mostra
- Escritório: uma sala por projeto ativo nas últimas 24h; agentes cadastrados sentados nas mesas;
  quem está em sessão ativa se levanta/digita/lê; subagente = estagiário que entra e sai; balão
  "esperando você" quando a sessão aguarda permissão/input.
- Faixa de alertas (acionável): sessão aguardando você há > N min; sessão com erros repetidos de
  ferramenta; sessão "busy" parada há muito tempo (possível travamento); contexto perto do limite.
- Quadro de tarefas: tarefas abertas/em andamento/concluídas por projeto (respeitando a política).
- Linha do tempo do dia + placar (sessões, horas ativas, tokens por projeto).
- Mural de catálogo rotativo: todos os projetos, skills e agentes cadastrados.
- Modo TV: fonte grande, rotação automática de vistas, dimming noturno, reconexão automática.

## Local do código
~/.claude/projects/escritorio/ (dentro do escopo permitido). Projeto próprio e isolado.

## Fases
F0 coletor + sanitizador + testes de vazamento (fixtures com segredos falsos: nenhum pode aparecer no snapshot).
F1 servidor só-GET + os dois renderers básicos (top-down e isométrico) para o dono escolher.
F2 alertas, tarefas, timeline, catálogo.
F3 modo TV e (com aprovação à parte) launchd user agent para subir sozinho.

## Riscos
- Vazamento de dado de cliente na TV (LGPD): mitigado por allowlist, redação, política por projeto e testes.
- Formato do JSONL é interno e muda entre versões do Claude Code: parser tolerante, campos desconhecidos ignorados.
- Licença dos assets: pixel-agents é MIT, mas sprites incluídos podem vir de packs de terceiros; verificar
  antes de reusar, senão usar packs CC0 ou desenhar os próprios.
- Exposição na rede: só localhost; DNS rebinding mitigado por checagem de Host.
- Dois renderers dobram o custo do front: compartilhar modelo, animação e layout de salas; só a projeção e os sprites mudam.
- Custo de CPU com 100+ transcripts: leitura incremental por offset, ignora arquivos sem mudança.

## Validação
Testes unitários do sanitizador; teste de vazamento com fixtures; teste de que o servidor rejeita
POST/PUT/DELETE; verificação de que nada em ~/.claude é modificado (mtime/hash antes e depois);
screenshot em 1920x1080 e 3840x2160.

## Rollback
Projeto autocontido: parar o processo e apagar a pasta. Nenhuma mudança em settings, hooks ou outros projetos.

## Revisão 2 (após parecer do Codex)
### Bloqueador 1: regras de detecção (sem evidência = "desconhecido", sem alerta)
- "Aguardando você": último registro assistant tem tool_use sem tool_result correspondente há > 30s
  E a sessão está viva em sessions/*.json. Caso especial AskUserQuestion = "tem pergunta pra você".
  Turno encerrado (stop_reason end_turn) + idle = "livre", não é alerta.
- Erros repetidos: >= 3 tool_result com is_error=true nos últimos 10 resultados da sessão.
- Contexto: soma de input_tokens + cache_read + cache_creation do último usage dividido pela janela do
  modelo informado; se o modelo não estiver numa tabela conhecida, "desconhecido". Rótulo "estimativa".
- Possível travamento: status busy e nenhum registro novo no transcript há > 10 min.
- Campos ausentes ou formato desconhecido nunca disparam alerta e nunca ampliam o snapshot.
### Bloqueador 2: padrão seguro
- Config local gerada na 1ª execução com TODOS os projetos em "oculto" para tarefas.
- Nomes também passam pela política: projeto não classificado aparece como alias genérico ("Sala 7"),
  sem tarefas. O dono classifica cada projeto (nome de exibição + publico|interno|oculto).
- Nomes de sessão (campo name, que pode ser derivado do prompt) NUNCA vão para a TV; só o alias do projeto
  e o nome do agente cadastrado. Nomes de agentes/skills com limite de tamanho; aliases opcionais.
### Bloqueador 3: validação de não-escrita
- Código fica em ~/.claude/projects/escritorio/ e só escreve no próprio diretório (config e cache).
- Módulo de leitura usa apenas fs.open com 'r'; regra de lint proíbe APIs de escrita fora do módulo de config.
- Teste: diretório-fixture que imita ~/.claude; hash de todos os arquivos antes e depois de rodar o coletor.
- Raízes autorizadas resolvidas com realpath; symlinks que apontem para fora são ignorados.
### Riscos incorporados
- Parser: tolera linha incompleta (bufferiza até \n), truncamento/rotação (offset > tamanho => relê),
  arquivos grandes (lê em blocos), reinício (reconstrói estado só da janela de 24h, sem persistência).
- Tokens/horas: rotulados como estimativa; subagentes contados separados do pai.
- HTTP: Host estrito (127.0.0.1:porta/localhost:porta), Origin restrito quando presente, sem CORS,
  Cache-Control: no-store, só GET/HEAD.
### Simplificações aceitas
- Dois renderers compartilham layout, animação e sprites; muda só a projeção.
- Sprites próprios simples na F1, sem reaproveitar assets de terceiros.

## Revisão 3 (pós-reavaliação; sem nova rodada do Codex)
- tool_use pendente sem tool_result = "ferramenta rodando", SEM alerta.
- "Tem pergunta pra você" só com AskUserQuestion pendente (evidência explícita).
- "Aguardando permissão" só se sessions/*.json expuser um status explícito de espera (verificar na F0);
  sem isso, o estado não existe no painel.
- Contexto: só com tabela de janela efetiva por modelo; fora dela, "desconhecido".
- Tarefas: estado final de cada tarefa é reconstruído lendo o transcript inteiro das sessões que têm
  tarefa aberta, não só a janela de 24h.
- publico = título redigido visível; interno = só contagem e barra de progresso; oculto = sala sem tarefas.
- Teste de não-escrita: hash integral das fontes; só o diretório próprio fica fora da verificação.
