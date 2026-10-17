# Plano v2: Pixel Room como prédio isométrico

## Pedido do dono (2026-10-17)
Isométrico como visual. Todo projeto vira uma sala, ativa ou não. Sala com trabalho fica acesa e sala parada
fica apagada. As salas se conectam como um prédio de verdade, com corredores até um centro de comando.
Mouse funcionando. Nome real do projeto em cada sala. Sem quantidade de tokens. Ao passar o mouse sobre
um agente, mostrar o que ele está fazendo. Cada agente tem um nome. Mais animação.

## Mudanças
1. Dados (src/snapshot.mjs, src/config.mjs)
   - Nova opção `showRealNames` (padrão true por decisão do dono): sala = display || nome da pasta
     (sanitizado com label(), máx 32) em vez de "Sala N". `hidden` e `exclude` continuam valendo.
   - Todas as salas de projeto entram no snapshot, com `lit` (há sessão, estagiário ou agente trabalhando).
   - Para o tooltip: `since` de sessões e subagentes; `task` só quando a sala é "publico", redigido.
     Política de tarefas continua padrão "oculto". Nada de prompt, comando, caminho ou saída.
   - Saguão vira "Centro de comando".
   - Remover tokens da UI (KPI e "tokens no contexto"). O coletor pode manter o número interno, mas
     ele sai do snapshot.
2. Layout de prédio (public/engine.js)
   - Grade de células fixas; sala com muitos agentes ocupa 2x1, 2x2 ou 3x2 células.
     Centro de comando 2x2 no meio. Ordem determinística por nome, para as salas não pularem.
   - Corredores entre as células, piso único do andar, paredes externas do prédio, paredes internas baixas
     (cutaway estilo The Sims) para não esconder as salas de trás. Porta de cada sala para o corredor.
   - Linhas de conexão no piso do corredor, de cada porta ao centro de comando; pulsos de dados animados
     correndo pela linha quando a sala está acesa.
3. Luz
   - Sala acesa: piso claro, luminária, monitores ligados. Sala apagada: escurecida, monitores off,
     agentes cadastrados como silhuetas com "zz". Transição com tremulação de lâmpada ao acender.
4. Câmera e mouse (public/app.js) — só visualização, nada é enviado ao servidor
   - Mundo renderizado em canvas offscreen; camada estática (piso, corredores, paredes) cacheada.
   - Tour automático: visão geral, depois zoom nas salas acesas, uma por vez, e volta.
   - Mouse: roda = zoom, arrastar = mover, duplo clique = visão geral. Interação pausa o tour por 90 s.
   - Hover em agente: cartão com nome, papel, sala, estado, atividade, há quanto tempo, modelo e tarefa
     (só em sala "publico"). Hover em sala: nome, acesa/apagada, equipe, última atividade.
   - Remover `cursor: none`.
5. Nomes
   - Cada personagem recebe um nome próprio determinístico e único na tela (lista de nomes curtos).
     Sessão: "Ana · Claude". Cadastrado: nome próprio + nome do agente como cargo. Estagiário: nome + tipo.
6. Animação
   - Estagiário nasce no centro de comando e caminha pelo corredor até a sala; ao terminar, volta.
   - Confete e ✓ quando uma sessão termina a vez. Partículas de digitação. Vapor no café.
   - Centro de comando com parede de telas que espelha as salas (acesa/apagada) e sirene coral quando há alerta.
   - Robô aspirador passeando pelos corredores. Idle visita café/bebedouro.

## Riscos
- Privacidade: nome real das pastas na TV vira padrão (decisão explícita do dono). Mitigação: `display`,
  `hidden`, `showRealNames:false`; tarefas continuam ocultas por padrão.
- Escala: ~30 salas numa tela ficam pequenas. Mitigação: tour com zoom e rótulos em resolução de tela.
- Desempenho com ~200 personagens/móveis: camada estática cacheada; limitar a 30 fps.
- Mouse não pode virar canal de comando: nenhum fetch/POST novo; servidor continua só GET.

## Validação
Testes atuais adaptados (showRealNames true/false), teste novo de que `task` só aparece em "publico";
screenshots 1080p e 4K com dados reais e demo; console sem erros; teste de hover via DevTools.

## Rollback
Arquivos dentro de pixel_room; versão anterior preservada em docs/v1-backup/ antes de editar.

## Revisão após parecer do Codex
- Bloqueador `task`: o campo NÃO cria fonte nova de texto. Fontes permitidas, e só elas: (a) aiTitle da
  sessão e (b) `description` da delegação Agent/meta.json, exatamente as que já alimentam a lista de tarefas
  "publico". Passam pelo mesmo `redact()` (máx 60) e só existem quando a sala é "publico"; em qualquer outra
  política o campo nem é criado. Nunca usar prompt, input de ferramenta, tool_result, texto do assistente,
  thinking ou lastPrompt. Na dúvida (fonte ausente ou não string) o campo é omitido.
  Testes: em "publico" o snapshot inteiro continua sem os segredos plantados (prompt, comando, caminho,
  saída, thinking, prompt de subagente) e `task` só contém texto redigido; em "interno"/"oculto" nenhuma chave
  `task` existe.
- `lit` = trabalho efetivo: sessão em working/asking/waiting/stuck, estagiário ativo ou cadastrado
  trabalhando. Sessão aberta e livre não acende a sala.
- Nomes: mapa persistente por chave de entidade no cliente; uma vez atribuído, o nome não muda enquanto
  a entidade existir; nomes novos pegam o primeiro livre a partir do hash.
- Cache estático só com piso, corredores e paredes; luz, monitores e pessoas são desenhados a cada quadro.
  Hover converte coordenadas de tela pela mesma matriz da câmera (zoom, pan, escala do canvas, DPR).
- Desempenho: medir tempo de quadro com ~30 salas e ~200 entidades no demo; meta < 16 ms em 1080p.
- Testes novos: `hidden` e `exclude` removem a sala do snapshot; snapshot sem campos de tokens;
  tarefas omitidas por padrão.
- Animações de baixo custo (aspirador, café, confete, estagiário pelo corredor) ficam no escopo porque o
  dono pediu "mais animado"; se o desempenho não fechar a meta, são as primeiras a sair.

## Adendo: fiscal Codex (pedido do dono durante a implementação)
Objetivo: representar as revisões do Codex (o gate de planos) como um personagem fiscal/auditor.

Detecção, no coletor, só em memória:
- tool_use `Bash` cujo `input.command` (string) case com /(^|[\s;&|(])(\S*\/)?codex\s+exec\b/ marca aquela
  chamada como auditoria. O comando NÃO é guardado; só o booleano e o timestamp.
- O tool_result dessa chamada é lido apenas para extrair um enum de veredito pela regex
  /veredito\W{0,30}(aprovar|aprovado|revisar|bloquear|bloqueado)/i → aprovado | revisar | bloqueado;
  sem match = "sem veredito". O texto do resultado não é guardado.
- Chamadas em background (resultado imediato sem veredito) contam como "sem veredito".

Snapshot, por sala: `auditor = { state: 'auditando' | 'livre', verdict: enum | null, verdictAt: ts | null,
today: número }`. Nenhuma string livre. Alerta novo `codex` quando o último veredito da sala é
"bloqueado" há menos de 30 min ("Codex bloqueou um plano").

Visual: fiscal de uniforme azul-marinho, quepe e prancheta, com posto no centro de comando. Ao auditar,
caminha pelo corredor até a sala e fica ao lado da mesa do Claude com lupa; ao sair o veredito, carimbo
(✓ verde / ! âmbar / ✕ coral) e volta ao centro. Tooltip com estado, último veredito e auditorias do dia.

Testes: fixture com comando `codex exec` contendo segredo plantado e resultado com segredo + "Veredito:
bloquear"; snapshot deve ter verdict = bloqueado, alerta codex, e nenhum dos segredos; sala sem codex não
tem `auditor` ativo.
