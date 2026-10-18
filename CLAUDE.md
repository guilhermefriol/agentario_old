# Agentário — contexto do projeto (antigo Pixel Room)

Painel de TV **só-leitura** que mostra os projetos, agentes e skills de `~/.claude` como um prédio
isométrico em pixel art. Autor: Guilherme Friol. Visual escolhido pelo dono: **isométrico**.
Repositório: **github.com/guilhermefriol/agentario (privado)**, branch `main`.

## Início automático (launchd, v6 parte 2 — aplicada em 2026-10-17)
O servidor real roda como agente launchd do usuário `com.friol.agentario`
(`~/Library/LaunchAgents/com.friol.agentario.plist`: node `/opt/homebrew/bin/node`, RunAtLoad, KeepAlive,
ThrottleInterval 10, logs em `~/Library/Logs/agentario/{out,err}.log`). Validado: só `127.0.0.1:4747`,
HTTP 200, volta sozinho após `kill`. **Não iniciar com `npm start` à mão** (conflito na porta 4747).
- Reiniciar após mudar código: `launchctl kickstart -k gui/$UID/com.friol.agentario`
- Rollback: `launchctl bootout gui/$UID/com.friol.agentario`; `rm -f` do plist; restaurar
  `config/local.json.pre-v6` (a sala `pixel_room` virou `agentario` no `config/local.json`).
- Autorizados pelo dono (fora de `~/.claude`): esse plist e `~/Library/Logs/agentario/`.

## Próximo: v8 (interação) — plano + Codex + aprovação
- O dono quer **responder perguntas, mandar tarefa nova e parar sessão** pela TV.
  Serviço separado com autenticação; o servidor do painel continua só leitura. Ver
  `docs/PESQUISA-interacao.md` (o que é e o que não é possível com sessões abertas no terminal).

## Estado em 2026-10-17
- v7 aplicada (docs/PLANO-v7.md + pareceres): **modo 3D** com botão (`#view-btn`; `?view=3d`; `?gira=0`),
  isométrico segue padrão. `public/view3d.js` (Three.js 0.186.1 em `public/vendor/`, só carregado no 3D)
  reaproveita as rotinas de desenho do `office.js` via coletor (`public/geo3d.js`: polígonos do 2D viram
  triângulos com as mesmas cores; decalques coplanares afastados por camada). Personagens = planos de pé com o
  mesmo pixel art (`charPose` compartilhada). Rótulos = mesmo `labels()` com `project` da vista. Em foco, as
  paredes altas das outras salas baixam (shader). Perda de contexto/WebGL ausente → volta ao 2D com aviso.
  Medido em 4K + demonstração (94 pessoas, GPU do Mac): ~5 ms de JS por quadro, intervalo p95 ~8 ms.
- v6 parte 1 aplicada (docs/PLANO-v6.md + pareceres): git + GitHub privado (hook pre-commit com gitleaks em
  `.git/hooks/pre-commit`, nunca `--no-verify`); painel sem "centro de comando"; dois letreiros (real
  sempre comparado com o real, demo com a cena); salas sem agente agrupadas numa ala sul contígua;
  teste visual determinístico; nome Agentário (`bin/agentario.mjs`, variáveis `AGENTARIO_*`).
- v5.1: com a demonstração ligada, números do topo, "Precisa de você", aba Agora e letreiro seguem a cena
  (totais pela fórmula do snapshot.mjs); aba Hoje fica real.
- v5: clique no logo (botão oculto) liga/desliga o **modo demonstração** (`public/demo.js`; logo âmbar +
  "modo demonstração"; `?demo=1`; não persiste). Centro de comando 1×1 com a mesa do **Friol** (personagem
  `god`, auréola) que recebe visitas curtas (25 s).
- v4: salas de lazer (Academia, Banheiros, Refeitório, Sala de descanso, Igreja); parados "matam o tempo"
  (≤35% fora, troca a cada 4 min) e voltam pelo próprio rastro quando recebem trabalho.
- v3: cartão do agente com "Faz:"; clique na sala dá zoom (botão/Esc/duplo clique voltam).
- Testes: `npm test` (72, node --test) e `npm run visual` (projetos `2d` = 7 cenas e `3d` = 5 cenas +
  6 funcionais com SwiftShader; `npm run visual:update` regrava **todas** — revisar as imagens antes de
  commitar; para gravar só cenas novas use `--update-snapshots=missing`). Demo fictícia: `npm run demo` (porta 4748).
- Planos e pareceres do Codex em `docs/`. Backups antigos `docs/v*-backup/` ficam fora do git
  (o git é o ponto de restauração daqui em diante).

## Decisões do dono (não reabrir sem ele pedir)
- TV ligada por HDMI no Mac: servidor só em 127.0.0.1, sem modo LAN.
- Todo projeto vira sala; acesa com trabalho efetivo, apagada parada; corredores até o centro de comando.
  Salas sem agente cadastrado ficam juntas numa ala.
- Nomes reais das pastas na TV (`showRealNames: true`). Tarefas **visíveis por padrão** (`publico`):
  "a TV é privada, só o dono decide quem vê". Dono pode fechar sala a sala em `config/local.json`
  (interno | oculto). Valor inválido no config → oculto.
- Função do agente (description do frontmatter) aparece no cartão, sempre redigida.
- Sem quantidade de tokens na tela nem no snapshot.
- Cada personagem tem nome próprio; mouse mostra cartão do agente; câmera faz tour automático.
- Igreja = "Igreja Adventista da I.A. dos Últimos Dias" (nome sempre completo). Personagem do centro =
  "Friol". O centro de comando não leva nome no mapa, no botão de voltar nem nos painéis.
- Salas de lazer não contam como projeto (fora de KPIs, painéis, telas do centro e tour).
- Codex = "Fiscal Codex" (quepe, prancheta): detectado por `codex exec` em Bash; só booleano + enum de
  veredito saem do coletor (src/audit.mjs).

## Fronteira de segurança (manter)
- Tudo que vai à TV é montado campo a campo em `src/snapshot.mjs`. Únicos textos livres: `taskText()`
  (aiTitle ou description de delegação, só em sala "publico", sempre `redact()`) e `roleText()`
  (1ª frase da description do agente, redigida antes do corte, ≤120; description em bloco é ignorada).
- Só `src/config.mjs` escreve em disco, só em `config/` (teste garante). Servidor: GET/HEAD, Host/Origin
  estritos, CSP, no-store. Sem CDN; fontes em `public/fonts/`; Three.js vendorizado com sha256 em `public/vendor/README.md`. Runtime sem dependências
  (`@playwright/test` é só devDependency de teste).
- `config/local.json` (lista real de projetos) nunca vai para o git.
- Mudança substantiva segue o gate global: plano → Codex read-only via stdin → aprovação do dono.

## Estrutura
- `src/` coletor, filtro, snapshot, servidor (Node puro)
- `public/demo.js` modo demonstração · `public/leisure.js` lazer e centro (puro, testado no node)
- `public/building.js` planta, ala e corredores · `public/office.js` motor · `public/app.js` câmera, mouse, painéis
- `public/view3d.js` cena 3D · `public/geo3d.js` coletor/câmera (puro, testado no node) · `public/vendor/` Three.js
- `bin/agentario.mjs` entrada · `bin/demo.mjs` demo · `test/` node --test · `test/visual/` Playwright
- `?debug=1` expõe `window.__pr` (só leitura) para testes.
