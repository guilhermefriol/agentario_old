# v6 — ajustes (item 3), teste visual (item 4), nome Agentário, git/GitHub e início automático

Autor: Guilherme Friol · 2026-10-17

Decisões do dono nesta janela: salas vazias "menores e agrupadas"; nome novo **Agentário** trocando
**tudo, inclusive a pasta**; repositório **GitHub privado**; fazer o início automático (item 2).
3D (v7) e interação com agentes (v8) ficam em planos próprios, depois deste.

## Ordem de execução (cada etapa testada antes da próxima)

### A. Ajustes do item 3 (só frontend + planta)
1. **"Centro de comando" fora do painel**: a sala de comando continua no painel (sessões reais dela),
   mas sem título, e o nome dela não aparece em "Precisa de você" nem no letreiro (função única
   `roomLabel(r)` no app.js: vazio para `kind === 'lobby'`).
2. **Letreiro real preservado durante a demonstração**: dois letreiros independentes, cada um com o seu
   mapa de estados anteriores: `real` (sempre comparado com o snapshot real, inclusive com o modo
   ligado) e `demo` (comparado com a cena). A tela mostra um ou outro. Ao desligar, o real está
   completo, com o que aconteceu de verdade durante a demonstração. O `demo` é zerado a cada vez que liga.
3. **Salas vazias agrupadas**: sala de projeto sem agente cadastrado (`staff.length === 0`, estável,
   vem do catálogo) já ocupa 1 célula; passa a ser colocada numa **ala própria**: `tryPlace` usa como
   alvo a borda sul do prédio para esse grupo (em vez do centro), então elas ficam juntas. Ordem: salas
   com equipe → salas vazias (ala sul) → salas de lazer (periferia que sobrar). Teste: as vazias formam
   um bloco contíguo (cada uma encosta em outra vazia) quando há mais de uma.

### B. Teste visual (item 4)
- `@playwright/test` em versão exata como **devDependency** (só para testes; o painel continua sem
  dependências). `node_modules/` fora do git.
- Cena totalmente determinística: snapshot fixo fictício em `test/visual/snapshot.json` (gerado uma vez
  a partir do `bin/demo.mjs`, sem dados reais), entregue pelo `page.route` em `/api/stream` e
  `/api/snapshot`; relógio fixo com `page.clock` (Date, timers, requestAnimationFrame) avançado em
  passos; `Math.random` com semente via `addInitScript`.
- Cenas: visão geral; zoom numa sala de projeto; cartão de agente; zoom na Academia; centro com o
  Friol; modo demonstração (visão geral e painéis); igreja com nome completo.
- `npm run visual` compara com as imagens de referência em `test/visual/__screenshots__/` (vão para o
  git) com tolerância pequena; `npm run visual:update` regrava. Fica fora do `npm test` (mais lento).

### C. Nome Agentário (texto e arquivos, ainda na pasta antiga)
- Título da TV, `<title>`, README, CLAUDE.md, `package.json` (`"name": "agentario"`),
  `bin/pixel_room.mjs` → `bin/agentario.mjs` (scripts `npm start` atualizados), mensagens de log.
- `config/local.json`: a chave da sala deste projeto `pixel_room` → `agentario` (mantém as opções).

### D. Git + GitHub privado
- `git init -b main`, `user.name "Guilherme Friol"` e `user.email guilhermefriol@gmail.com` **só neste
  repositório**. Sem `Co-Authored-By`/menção a IA nos commits (regra global).
- `.gitignore`: `node_modules/`, `config/local.json` (lista real de projetos, é por máquina),
  `docs/v*-backup/`, `logs/`, `*.log`, `.DS_Store`, `test-results/`. Vai: `config/demo.json` (fictício).
- **Pre-commit com gitleaks** (`gitleaks git --staged`, ou `protect --staged` conforme a versão
  instalada) em `.git/hooks/pre-commit`. As fixtures de teste plantam segredos falsos de propósito;
  se o gitleaks marcar, entra `.gitleaks.toml` com allowlist **só** de `test/fixture.mjs` e
  `test/*.test.mjs`, nunca `--no-verify`.
- Antes do 1º commit: `gitleaks dir .` no que vai ser versionado + revisão manual de `docs/` (planos e
  pareceres não podem ter host, IP, token ou nome de cliente).
- `gh repo create guilhermefriol/agentario --private --source . --push`. Conferir `visibility: PRIVATE`.

### E. Pasta nova + início automático (por último, com o servidor parado)
1. Parar o processo atual do servidor (porta 4747).
2. `mv ~/.claude/projects/pixel_room ~/.claude/projects/agentario` (git e remote vão junto).
   A memória deste projeto está vazia; não há o que migrar. A conversa atual fica registrada na pasta
   antiga do histórico do Claude Code (não é apagada).
3. launchd **do usuário** (sem sudo): `~/Library/LaunchAgents/com.friol.agentario.plist` (fora de
   `~/.claude`, autorizado pelo dono nesta janela), gerado localmente e validado com `plutil -lint`:
   `ProgramArguments = [/opt/homebrew/bin/node, …/agentario/bin/agentario.mjs]`,
   `WorkingDirectory = …/agentario`, `RunAtLoad = true`, `KeepAlive = true`, `ThrottleInterval = 10`,
   logs em `~/Library/Logs/agentario/{out,err}.log`, `PATH` mínimo, sem variável de ambiente sensível.
4. `launchctl bootstrap gui/$UID …plist`; conferir com `launchctl print` e `curl` em
   `127.0.0.1:4747` (200, só em 127.0.0.1). Matar o processo uma vez e conferir que volta sozinho.
5. Atualizar CLAUDE.md/README com o caminho novo e o comando de rollback; commit + push.
6. Avisar o dono para **abrir o Claude Code na pasta nova** (`~/.claude/projects/agentario`); esta
   sessão fica com a pasta antiga sumida.
- Os outros agentes `com.friol.*` do launchd não são tocados.

## Validação
- `npm test` (62 + novos de planta/ala e letreiro), `npm run visual` com as referências recém-gravadas,
  conferência manual das imagens. Navegador: rótulo/painéis sem "Centro de comando"; letreiro real
  intacto após ligar/desligar a demo.
- Git: `git status` limpo, `gh repo view --json visibility` = PRIVATE, hook bloqueia um segredo de teste
  plantado num arquivo temporário (e o arquivo é removido).
- launchd: sobe no login, reinicia após `kill`, logs sem dados sensíveis.

## Riscos
- Renomear a pasta com o Claude Code aberto nela: feito por último, com caminhos absolutos; o dono
  reabre na pasta nova.
- Ala sul muda a planta inteira uma vez (todas as salas mudam de lugar).
- Teste visual frágil por fonte/antialias: tolerância pequena e mesmo Chromium do Playwright fixado.
- Fixtures com segredos falsos x gitleaks: allowlist restrita aos arquivos de teste.

## Rollback
- A, B, C: `git revert` (a partir do 1º commit) ou cópia em `docs/v5-backup/`.
- E: `launchctl bootout gui/$UID/com.friol.agentario && rm ~/Library/LaunchAgents/com.friol.agentario.plist`;
  `mv ~/.claude/projects/agentario ~/.claude/projects/pixel_room`.
- GitHub: o repositório é privado; apagar exige pedido explícito do dono.

---
## Revisão após parecer do Codex (docs/codex-parecer-v6.txt) — substitui o que conflitar acima

**Trava da máquina:** o hook `projects-guard` proíbe o Claude de mover/renomear pastas de projeto em
`~/.claude/projects`. Portanto **a troca de pasta é feita à mão pelo dono**, fora do Claude, com o
comando que eu entrego pronto. Não desativo nem contorno o hook.

**Nova ordem:** D-local → A → B → C → validação → push no GitHub → (dono renomeia a pasta) → E.
- **D-local primeiro (baseline):** `git init`, `.gitignore`, hook gitleaks, varredura e **commit inicial
  do estado atual (v5.1)** antes de qualquer alteração. Um commit por etapa (A, B, C, E) e
  `gh repo create … --private --push` só depois da validação local de A–C.
- **gitleaks restrito:** `.gitleaks.toml` com allowlist que exige **caminho de teste E valor fictício
  conhecido** (regex dos marcadores plantados: `SEGREDO_`, `SECRETO_`, `hunter2`, `CLIENTEXYZ` etc.),
  nada de liberar o arquivo inteiro. Teste: um token com cara de real dentro de `test/` continua bloqueado.

**Ala das salas vazias (contiguidade garantida):** entram na ala as salas de projeto sem agente
cadastrado **e** com tamanho 1×1. O `planBuilding` cria um item único "ala" de `bw×bh` células
(retângulo mais quadrado que caiba todas), colocado com alvo na borda sul, e depois divide esse
retângulo em células, uma por sala. Como é um retângulo só, o grupo é sempre **um componente
conectado**. Sala que crescer (muitas sessões) sai da ala, e a planta é refeita. Teste: BFS nas
células da ala dá 1 componente; nenhuma outra sala dentro do retângulo.

**Rename completo (contratos):** `bin/pixel_room.mjs` → `bin/agentario.mjs`, referências em
`bin/demo.mjs`, `package.json`, README, CLAUDE.md; variáveis `PIXEL_ROOM_*` → `AGENTARIO_*` (em
`src/config.mjs`, `src/paths.mjs`, demo e testes; sem usuário externo, sem alias). Teste:
nenhuma ocorrência de "pixel room/pixel_room" fora de `docs/`.

**Teste visual:** mock fiel ao SSE do servidor (`content-type: text/event-stream`,
`retry: 3600000`, `data: <snapshot>\n\n`), mesmo formato que `src/server.mjs` envia;
`/api/snapshot` como JSON. Viewport 1600×900, `deviceScaleFactor: 1`, fontes locais,
`package-lock.json` versionado. As imagens de referência são revisadas uma a uma antes de virar base.

**E revisado (pasta + launchd):**
1. Eu paro o servidor atual e preparo `config/local.json` (chave `pixel_room` → `agentario`, cópia
   antes em `config/local.json.pre-v6`).
2. **O dono** fecha o Claude Code e renomeia a pasta à mão no Terminal (comando entregue pronto).
3. O dono abre o Claude Code na pasta nova; nessa sessão eu: `mkdir -p ~/Library/Logs/agentario`,
   confiro `/opt/homebrew/bin/node -v`, gero o plist, `plutil -lint`, `launchctl bootstrap`.
   Depois: `lsof -nP -iTCP:4747 -sTCP:LISTEN` deve mostrar só `127.0.0.1:4747`, mais o `curl`, e um
   `kill` do processo para conferir que o launchd o traz de volta.

**Rollback E completo (passos independentes, sem `&&`):** `launchctl bootout gui/$UID/com.friol.agentario`;
`rm -f ~/Library/LaunchAgents/com.friol.agentario.plist`; o dono renomeia a pasta de volta à mão;
restaurar `config/local.json.pre-v6`; subir o servidor antigo a partir do commit baseline.

## Ajustes finais (docs/codex-parecer-v6-reavaliacao.txt)
- `.gitignore` também cobre `config/*.json` exceto `config/demo.json`, e `config/*.pre-*` — escrito
  **antes** de criar qualquer cópia de config.
- Allowlist do gitleaks implementada como regra que exige caminho de teste **e** valor com marcador
  fictício delimitado; teste com um token inesperado no **mesmo** arquivo de teste (deve bloquear).
- Ala: as salas preenchem o retângulo em ordem contígua (linha a linha, serpentina); a BFS do teste roda
  nas células **ocupadas**. Células que sobrarem no retângulo ficam vazias (jardim) no fim da ordem.
- Rollback ao baseline inclui `npm ci` antes de subir a versão antiga (devDependency nova).
- Entrega em duas partes: **parte 1 = D-local, A, B, C, push** (nesta sessão); **parte 2 = E** (após
  o dono renomear a pasta e abrir o Claude Code nela).
