# Pixel Room v3 — "o que o agente faz" no hover + zoom por clique na sala

Autor: Guilherme Friol · 2026-10-17

## Objetivo
1. Ao passar o mouse sobre um personagem, o cartão mostra **o que aquele agente faz** (função).
2. Clique (sem arrastar) numa sala → câmera dá zoom nela e fica parada ali. Botão "← Visão geral"
   (e tecla Esc / duplo clique) volta para o prédio inteiro e retoma o tour.

## Parte 1 — função do agente

### Fonte do texto
- Agentes cadastrados (`.claude/agents/*.md`): campo `description` do frontmatter. Hoje
  `src/catalog.mjs` só lê `name` e `model`; passa a ler também `description` (mesmo limite de 8 KB
  de leitura já existente, frontmatter de uma linha; descrição em bloco `|`/`>` é ignorada → sem texto).
- Claude, Fiscal Codex e estagiários de tipos embutidos (Explore, Plan, general-purpose,
  claude-code-guide, statusline-setup): **texto fixo no frontend** (mapa constante em `app.js`),
  nada vindo do coletor. Tipo desconhecido → "ajudante temporário chamado por uma sessão".

### Fronteira de segurança (mudança de contrato — precisa aprovação do dono)
- Nova função `roleText(source)` em `src/snapshot.mjs`, ao lado de `taskText()`, documentada como
  a 2ª e última porta de texto livre: só string, pega a 1ª frase, remove prefixos tipo
  "Use para / Use this agent when", aplica `redact(…, 120)`. Nada mais.
- Não depende da política de tarefas da sala (é texto de catálogo escrito pelo dono, não conteúdo
  de sessão), mas **sala `hidden` continua sem nada** (já não aparece). Opção a decidir com o dono:
  respeitar `tasks: oculto` também para a descrição.
- O campo `description` bruto nunca sai do catálogo: snapshot monta `staff[].does` e
  `catalog.agents[].does` explicitamente com `roleText()`.
- Comentário-cabeçalho de `snapshot.mjs` e CLAUDE.md atualizados ("únicos textos livres:
  taskText e roleText").

### Frontend
- `agentTip()`: nova linha destacada logo abaixo do papel: "Faz: …" (staff → `d.does`;
  demais → mapa fixo). CSS `.tip-does` (cor clara, quebra de linha, max-width já existe).

### Testes
- `security.test.mjs`: descrição com e-mail/IP/caminho/token sai redigida; descrição longa truncada
  a 120; descrição em bloco multilinha → sem `does`; snapshot não contém chave `description`.
- `units.test.mjs`: `roleText` (prefixo removido, 1ª frase, não-string → undefined).
- Fixture ganha `description` em um agente.

## Parte 2 — zoom por clique

Só `public/app.js`, `index.html`, `style.css`. Nada no servidor.
- Distinguir clique de arrasto: no `mouseup`, se o deslocamento < 6 px (em pixels de tela) e < 400 ms,
  é clique. Clique em sala ou em agente (usa `hit.lr` ou `hit.e.lr`) → `camera.focusRoom(lr)`.
- `camera.focused = lr.room.id`: enquanto focado, o tour automático fica suspenso (não só os 90 s
  atuais). Se a sala sumir num snapshot novo → volta à visão geral sozinho.
- Zoom do foco: o `focus()` existente, um pouco mais próximo (preenche ~85% da tela), com transição
  suave já existente.
- Botão `#back` sobreposto no canto superior esquerdo do canvas: "← Visão geral · NomeDaSala",
  visível só quando focado. Clique nele, Esc ou duplo clique → `camera.overview()` (fit + limpa foco +
  retoma tour do início).
- Clique em sala já focada não faz nada; clique em outra sala troca o foco.
- Roda do mouse/arrasto enquanto focado continuam funcionando sem perder o foco.
- `view-tag` atualizado: "clique: entrar na sala · Esc/duplo clique: visão geral · roda: zoom".
- `?debug=1` expõe `camera.focused` (já exposto via `camera`).

## Validação
- `npm test` (40 + novos).
- `npm run demo` + screenshot via DevTools/Playwright: hover em agente mostra "Faz:", clique em sala
  dá zoom e mostra botão, Esc volta.
- Conferir no snapshot real (`curl 127.0.0.1:4747/...`) que nenhuma descrição contém caminho/host.

## Riscos
- Descrições dos agentes do dono citam hosts/nomes de cliente → mitigado por `redact()` + corte de
  1ª frase + 120 chars; ainda assim é texto livre novo na TV (decisão do dono).
- Clique acidental durante arrasto → limiar de 6 px.
- Tour retomando no meio do foco → flag `focused` tem precedência.

## Rollback
- Arquivos tocados: src/catalog.mjs, src/snapshot.mjs, public/app.js, public/index.html,
  public/style.css, test/*. Backup antes em `docs/v2-backup/`. Reverter = copiar de volta e reiniciar
  o processo `node bin/pixel_room.mjs`.

---
## Revisão após parecer do Codex (docs/codex-parecer-v3.txt) + decisão do dono (2026-10-17)

**Decisão do dono:** "os trabalhos/tarefas não precisam ser privados, só eu decido quem entra para ver a TV".
Consequências:
- Padrão de tarefas passa de `oculto` para `publico`: `src/config.mjs` (default de sala nova, de sala
  com valor inválido e `lobbyTasks`), `snapshot.mjs` (fallbacks `|| 'oculto'` e sala Visitantes) e
  `config/local.json` (as 30 salas hoje em `oculto` → `publico`). Os níveis `interno`/`oculto`
  continuam existindo para o dono fechar uma sala quando quiser.
- `redact()` continua obrigatório em todo texto livre (protege contra e-mail/IP/caminho/token na tela
  mesmo sem plateia externa — screenshot/foto da TV).
- Descrição do agente (`does`) sai sempre (salvo sala `hidden`/`exclude`, que não aparece), sem
  depender da política de tarefas.

**Correções do Codex incorporadas:**
- `roleText()`: `redact()` do texto inteiro **antes** de cortar a 1ª frase e truncar a 120. Teste com
  e-mail/IP/host que cruzam o ponto de corte.
- Parser do frontmatter rejeita explicitamente `|`, `|-`, `|+`, `>`, `>-`, `>+` (sem `does`).
- Foco sobrevive a resize e a mudança de planta: no loop, quando hoje se chama `camera.fit()`, se há
  `focused` recalcula o enquadramento pela sala com aquele id (`focus` de novo); se a sala sumiu →
  `overview()`.
- Clique = botão esquerdo, deslocamento **máximo** durante o gesto < 6 px CSS, soltura dentro do
  canvas, < 400 ms. Arrastar e voltar ao ponto não conta.
- Saída do foco centralizada em `overview()` (botão, Esc, duplo clique, sala removida); com `?tour=0`
  não retoma tour.
- Validação via `?debug=1` com Playwright: hover → "Faz:"; clique → foco; foco persiste > 90 s
  (simulado avançando `userUntil`/`tourAt`), após snapshot novo e após resize; arrasto não foca;
  duplo clique/Esc/botão voltam; sala removida volta.
- Backup em `docs/v2-backup/` inclui `CLAUDE.md` e `config/local.json`; CLAUDE.md atualizado
  (decisão nova + fronteira: textos livres = taskText e roleText).
