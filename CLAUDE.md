# Pixel Room — contexto do projeto

Painel de TV **só-leitura** que mostra os projetos, agentes e skills de `~/.claude` como um prédio
isométrico em pixel art. Autor: Guilherme Friol. Visual escolhido pelo dono: **isométrico**.

## Estado em 2026-10-17
- v5.1 aplicada (docs/PLANO-v5.1.md + pareceres): com o modo demonstração ligado, números do topo,
  "Precisa de você", aba Agora e letreiro seguem a cena (totais pela fórmula do snapshot.mjs); aba Hoje
  fica real. Ao desligar, linhas de demonstração saem do letreiro. Backup da v5 em `docs/v5-backup/`.
- Igreja com 3 células e nome sempre completo (quebra em 2 linhas, rótulo com prioridade) — pedido do dono.
- v5 aplicada (docs/PLANO-v5.md + pareceres codex-parecer-v5*): clique no logo (botão oculto) liga/desliga
  o **modo demonstração** (`public/demo.js`, só o prédio; painéis/KPIs/letreiro seguem reais; logo âmbar +
  "modo demonstração"; `?demo=1`; não persiste; desde a v5.1 os painéis também seguem a cena). Centro de comando 1×1, sem rótulo, com a mesa do
  **Friol** (personagem fixo `god`, auréola) que recebe visitas curtas (25 s). Backup da v4 em `docs/v4-backup/`.
- v4 aplicada (docs/PLANO-v4.md + pareceres codex-parecer-v4*): salas de lazer fixas (Academia, Banheiros,
  Refeitório, Sala de descanso, Igreja). Agentes cadastrados parados vão "matar o tempo" lá
  (≤35% fora, escolha a cada 4 min) e voltam pelo próprio rastro quando recebem trabalho.
  Só frontend (`public/leisure.js` puro + building/office/app); snapshot não muda. Backup da v3 em `docs/v3-backup/`.
- v3 aplicada (docs/PLANO-v3.md + pareceres codex-parecer-v3*): cartão do agente mostra "Faz:" e
  clique na sala dá zoom (botão Visão geral / Esc / duplo clique voltam). Backup da v2 em `docs/v2-backup/`.
- v2 implementada e rodando em `http://127.0.0.1:4747/` (processo `node bin/pixel_room.mjs`, iniciado em background).
- 62 testes passando (`npm test`). Demo fictícia: `npm run demo` (porta 4748).
- Planos e pareceres do Codex em `docs/` (PLANO.md = v1, PLANO-v2.md = prédio + adendo do fiscal Codex).
  Cópia da v1 em `docs/v1-backup/`.

## Decisões do dono (não reabrir sem ele pedir)
- TV ligada por HDMI no Mac: servidor só em 127.0.0.1, sem modo LAN.
- Todo projeto vira sala; acesa com trabalho efetivo, apagada parada; corredores até o "Centro de comando".
- Nomes reais das pastas na TV (`showRealNames: true`). Tarefas **visíveis por padrão** (`publico`)
  desde 2026-10-17: "a TV é privada, só o dono decide quem vê". Dono ainda pode fechar sala a sala
  em `config/local.json` (interno | oculto). Valor inválido no config → oculto.
- Função do agente (description do frontmatter) aparece no cartão, sempre redigida.
- Sem quantidade de tokens na tela nem no snapshot.
- Cada personagem tem nome próprio; mouse mostra cartão do agente; câmera faz tour automático.
- Igreja = "Igreja Adventista da I.A. dos Últimos Dias". Personagem do centro = "Friol" (não "Deus").
  O centro de comando não leva nome no mapa nem no botão de voltar.
- Salas de lazer não contam como projeto (fora de KPIs, painéis, telas do centro e tour).
- Codex representado como "Fiscal Codex" (quepe, prancheta): detectado por `codex exec` em Bash;
  só booleano + enum de veredito saem do coletor (src/audit.mjs).
- Futuro: 3D e interação com agentes (interação = serviço separado com auth, nunca neste servidor).

## Fronteira de segurança (manter)
- Tudo que vai à TV é montado campo a campo em `src/snapshot.mjs`. Únicos textos livres: `taskText()`
  (aiTitle ou description de delegação, só em sala "publico", sempre `redact()`) e `roleText()`
  (1ª frase da description do agente, redigida antes do corte, ≤120; description em bloco é ignorada).
- Só `src/config.mjs` escreve em disco, só em `config/` (teste garante). Servidor: GET/HEAD, Host/Origin
  estritos, CSP, no-store. Sem CDN; fontes em `public/fonts/`.
- Mudança substantiva segue o gate global: plano → Codex read-only via stdin → aprovação do dono.

## Pendências
- Início automático no boot (launchd user agent): exige aprovação explícita do dono.
- Dono ainda pode classificar salas (`display`, `tasks`, `hidden`) em `config/local.json`.
- Ideias levantadas e não feitas: visual 3D (Three.js sobre o mesmo snapshot/planta).

## Estrutura
- `src/` coletor, filtro, snapshot, servidor (Node puro, sem dependências)
- `public/demo.js` modo demonstração (transforma o snapshot no navegador; puro, testado)
- `public/leisure.js` salas de lazer: móveis, lugares, escolha de visitantes, reservas, rastro (puro, testado no node)
- `public/building.js` planta do prédio e corredores · `public/office.js` motor · `public/app.js` câmera, mouse, painéis
- `bin/pixel_room.mjs` entrada · `bin/demo.mjs` demo · `test/` node --test
- Testes visuais: `?debug=1` expõe `window.__pr` (só leitura) para screenshots via DevTools.
