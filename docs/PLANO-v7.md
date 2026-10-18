# v7 — modo 3D (botão extra; isométrico continua padrão)

Autor: Guilherme Friol · 2026-10-17

Decisão do dono: **modo extra com botão**, isométrico segue padrão; `?view=3d` abre direto. Three.js
sobre a mesma planta/snapshot. Cartão, zoom por clique, demonstração e lazer nos dois modos.
Three.js vendorizado em `public/vendor/` com versão exata (sem CDN). Cenas novas no teste visual.

## Estado atual (relevante)
- `office.js`: `Office` separa simulação (`sync`, `step`, `scheduleLeisure`; só coordenadas de mundo
  x/y em unidades da planta) de desenho 2D (`ensureStatic`, `render`, `drawChar`, `labels`,
  `hitTest`, `roomCenter`, todos via `this.P` = projeção). `PROJECTIONS` já tem `iso` e `topdown`;
  `app.js` já lê `?view=`.
- `app.js`: câmera 2D (`camera.fit/focus/focusRoom/overview/keepFocus/update/toScreen/toWorld`),
  mouse (roda, arrastar, clique com espera de 250 ms, duplo clique, Esc, botão voltar), cartão
  (`agentTip/roomTip/leisureTip`), tour automático, laço a ~30 fps.
- Servidor: estáticos de `public/` com tipos fixos (`.js` já servido), CSP `script-src 'self'`.

## Arquitetura
1. **Three.js vendorizado**: `three@0.186.1` (MIT, publicado em 2026-09-24). Obtido com
   `npm pack three@0.186.1` no scratchpad (npm confere o sha512 do registro), extraídos só
   `build/three.module.min.js` + `build/three.core.min.js` (o módulo importa o core por caminho
   relativo) e `LICENSE` para `public/vendor/three-0.186.1/`. `public/vendor/README.md` com versão,
   origem e sha256 de cada arquivo. Sem addons (OrbitControls etc.): os controles são os nossos.
   Não vira dependência do `package.json` (runtime continua sem dependências).
2. **Carregamento sob demanda**: `app.js` faz `import('./view3d.js')` (que importa o Three) só quando
   o modo 3D é ligado. No isométrico nada do Three é baixado. CSP inalterada (`'self'` cobre).
3. **Contrato de "vista"** (para o `app.js` não ter `if 3d` espalhado): objeto com
   `fit(snap)`, `focus(lr)`, `focusRoom/overview/keepFocus` (já existentes, ficam no `camera`),
   `update(dt,t)`, `render(t, opts)`, `hitTest(sx, sy)` → `{type:'agent'|'room'}`,
   `project(x, y, z)` → pixel de tela, `pan/zoomAt` para mouse. A vista 2D atual é embrulhada nesse
   contrato sem mudar o comportamento; a 3D implementa o mesmo.
   - O estado lógico da câmera (sala focada, tour, `userUntil`, botão voltar) continua único em
     `app.js`; só o "como enquadrar" muda por vista. Trocar de modo mantém a sala focada.
4. **Refator pequeno no `office.js`** (sem mudar o 2D):
   - `charPose(e, t)` extraída do `drawChar`: devolve `{frame, lift, bob, hidden, god, extras}`; o
     2D passa a usá-la (mesmo resultado; o teste visual do 2D garante).
   - `labels(g, project, zoom, k, t)`: em vez de `P.p` + `toScreen`, recebe uma função
     `project(x, y, z)` → tela (o 2D passa `P.p`+câmera; o 3D passa a projeção da câmera 3D) e um
     fator de escala; rótulos de sala e de pessoa iguais nos dois modos (mesmo canvas 2D por cima).
5. **`public/view3d.js`** (cena Three.js, só desenha, lê `office.plan` e `office.entities`):
   - Mundo: 1 unidade da planta = 1 unidade 3D; x→X, y→Z, altura z→Y (escala ~1/8 da altura do 2D).
   - Estático (refeito quando `office.planKey` muda): laje, cabos dos corredores, paredes externas
     baixas só nos lados do fundo (como no iso, para não tapar a vista), salas com piso na cor do
     tema, paredes baixas em corte (cutaway), mesas/cadeiras/café/bebedouro/planta com
     `InstancedMesh` por tipo; props das salas de lazer a partir de `lz.props` (mesmas caixas
     `x,y,w,d,h,col`) e mesa do Friol.
   - Pessoas: **sprites (billboard) com a textura do mesmo pixel art** (`sprite()` → `CanvasTexture`
     com `NearestFilter`, cache por chave), quadro escolhido por `charPose`; sombra como disco;
     auréola do Friol, quepe/prancheta do Fiscal Codex já estão no sprite ou viram detalhe extra.
   - Luz: luz ambiente + direcional fraca; sala acesa = emissivo quente no piso + `PointLight`
     limitada (máx. ~8, as salas acesas mais importantes; o resto só emissivo); piscar ao acender
     igual ao 2D; noite escurece ambiente; sala apagada escurece o piso.
   - Pulsos dos corredores, balões e partículas: versões simples (sprites/pontos).
   - Câmera: `PerspectiveCamera` ~35° olhando de cima em diagonal (mesmo ângulo do iso como ponto de
     partida) com **giro lento automático** na visão geral (±20°, desligável com `?gira=0`) — é o que
     o 3D dá de novo à TV. Enquadrar sala = mirar o centro e aproximar até caber; transição suave
     como no 2D. Arrastar = deslocar no plano do chão; roda = aproximar no ponto do mouse;
     arrastar com botão direito/Shift = girar em torno do alvo (limites de altura).
   - Hit-test: projeta pessoas para a tela (mesma caixa ~10×18 px escalada pela distância) e,
     sem pessoa, raio no plano do chão → sala. Mesmo retorno do 2D, então o cartão e o clique
     funcionam igual.
   - Qualidade/perf: `antialias` desligado, `pixelRatio` limitado a 1.5, laço já fica em ~30 fps;
     sem sombras dinâmicas. Medir `__frameMs` na TV real (alvo < 12 ms).
   - Sem WebGL (falha ao criar o contexto) → aviso curto e volta para o isométrico.
6. **Botão**: na barra do mapa, botão "3D" / "2D" (`#view-btn`, `aria-pressed`), discreto; liga o
   modo sem recarregar (troca o canvas visível; a simulação é a mesma). `?view=3d` abre ligado.
   Não persiste (igual à demonstração). `VIEW_TAG` mostra a dica do 3D (girar).
7. `?debug=1`: `window.__pr` ganha `view` (modo atual) e `screenOf` passa a usar `project` da vista.

## Ajustes após o parecer do Codex (docs/codex-parecer-v7.txt)
- **Contrato completo da vista**: `resize(cssW, cssH, dpr)`; toda coordenada de tela do contrato é em
  **pixel de dispositivo** (CSS × DPR), igual ao 2D de hoje (`local()` já multiplica); `hitTest`
  devolve exatamente o formato atual (`{type:'agent', key, e}` ou `{type:'room', lr}`); `setSpin(on)`
  e `dispose()`; `ready` (promessa) — só resolve depois do 1º quadro 3D desenhado.
- **`__pr.view()` continua sendo o snapshot** (usado no teste da demonstração). O modo vai em
  `__pr.viewMode()`; `__pr.view3d` expõe só leitura (`ready`, `frames`).
- **Ciclo de vida**: renderer, texturas de sprite e materiais criados uma vez e reaproveitados;
  na reconstrução da planta, `geometry.dispose()`/`material.dispose()` do que sai (contador de
  objetos vivos testado). `webglcontextlost` → para de desenhar, volta ao iso com aviso;
  `webglcontextrestored` não religa sozinho (o botão religa). Trocas rápidas: um `token` de troca;
  o `import()` só ativa o 3D se o token ainda for o dele; falha no `import()` ou ao criar o
  contexto → aviso curto e fica no iso.
- **Luzes**: começa só com ambiente + direcional + **emissivo** no piso das salas acesas.
  `PointLight` só se a medição mostrar que falta, e então em número fixo (reaproveitadas).
- **Paredes ao girar**: paredes externas e internas recortadas por ângulo — cada parede some
  (opacidade 0) quando fica entre a câmera e o centro do alvo (teste pelo produto escalar da
  normal com a direção da câmera); giro limitado a ±35°.
- **Hit-test 3D**: pessoas candidatas pela caixa projetada (tamanho pela distância); empate
  resolvido pela **menor distância à câmera** (a mais à frente vence), como o `depth` do 2D.
- **Rótulos**: `labels(g, project, scaleAt, k, t)` — `scaleAt(x, y, z)` dá pixels de tela por
  unidade de mundo naquele ponto (2D = `8 × zoom`, constante; 3D = pela perspectiva). Largura máxima
  de rótulo de sala e o limiar "mostrar nomes das pessoas" (hoje `zoom < 2.1`) passam a usar
  `scaleAt`, com os mesmos valores no 2D (imagens antigas iguais).
- **Perf**: além de `__frameMs`, medir intervalo entre quadros (p95) e memória do processo da aba
  por 30 min em 4K (`?view=3d`, demo ligada) na TV real; aceitar se p95 ≤ 40 ms e memória estável.
- **Teste visual 3D**: o projeto Playwright das cenas 3D passa `--use-angle=swiftshader
  --enable-unsafe-swiftshader` (flag explícita, não depende do fallback); cada cena espera
  `__pr.view3d.ready` e confere `__pr.viewMode() === '3d'` e `frames > 0` antes da captura.
- **Testes funcionais novos** (Playwright, sem screenshot): troca 2D↔3D↔2D mantendo sala focada e
  cartão; troca rápida (3 cliques seguidos) termina no modo certo; `import()` falho (rota do vendor
  respondendo 404) → fica no iso com aviso; perda de contexto simulada (`WEBGL_lose_context`) →
  volta ao iso; DPR 2 (`deviceScaleFactor: 2`) → hover acerta a pessoa; snapshot novo que muda a
  planta → cena reconstruída sem vazamento (contador de objetos estável).

- **Da reavaliação** (docs/codex-parecer-v7-reavaliacao.txt): paredes escondidas com
  `visible = false` (não opacidade), decidido pela normal **e** por um raio câmera→alvo que cruza a
  parede; `ready` é **por ativação** (cada ligada cria a sua promessa, resolvida no 1º quadro dela);
  conversão explícita entre DPR do dispositivo e `pixelRatio` do renderer (≤ 1,5) num só lugar
  (`view3d.toDevice()`), usada por projeção, rótulos e hit-test; vazamento conferido também por
  `renderer.info.memory` (geometrias/texturas) após aquecimento; teste de "salas com luz" sai
  (luz pontual adiada).

## Arquivos
- novos: `public/view3d.js`, `public/vendor/three-0.186.1/{three.module.min.js,three.core.min.js,LICENSE}`,
  `public/vendor/README.md`, `test/view3d.test.mjs` (partes puras: mapeamento de coordenadas,
  enquadramento, paredes escondidas por ângulo).
- alterados: `public/app.js` (contrato de vista, botão, carregamento sob demanda), `public/office.js`
  (`charPose`, `labels` com `project`), `public/index.html` (botão), `public/style.css`,
  `test/visual/visual.spec.mjs`, README, CLAUDE.md.
- sem mudança: `src/` inteiro (coletor, snapshot, servidor). Nenhum dado novo vai à TV.

## Passos (cada um testado antes do próximo)
1. Vendorizar Three (pack → conferir integridade → copiar 3 arquivos → sha256 no README do vendor).
2. Refator `charPose` + `labels(project)` + contrato de vista no 2D. `npm test` + `npm run visual`
   **sem regravar**: as 7 imagens do 2D têm que continuar iguais.
3. `view3d.js` estático (prédio, salas, móveis) + câmera + botão.
4. Pessoas, luzes, noite, pulsos, balões; hit-test, cartão, clique/zoom/voltar, tour, demonstração.
5. Cenas novas no teste visual (WebGL do Chromium headless = SwiftShader, determinístico com relógio
   e `Math.random` fixos; giro automático desligado nas cenas): `3d-visao-geral`, `3d-zoom-sala`,
   `3d-cartao-agente`, `3d-igreja`, `3d-demonstracao`. Teste de que o modo iso **não** baixa nada de
   `/vendor/` (Playwright `page.on('request')`). Regravar só as cenas novas e revisar as imagens.
6. Conferência manual no navegador (e no da TV): troca 2D↔3D mantendo sala focada; giro; perf.
7. Docs + commit + push; `launchctl kickstart -k gui/$UID/com.friol.agentario`.

## Validação
- `npm test` (63 + novos), `npm run visual` (7 antigas inalteradas + 5 novas), sem erro no console.
- Teste existente de "sem CDN"/servidor continua passando; conferir que o bundle do Three não tem
  `fetch`/URL externa em uso (só comentários/strings de licença) — `grep -E "https?://"` revisado.
- Security: nada muda em `src/`; nenhum texto novo vai à tela (rótulos são os mesmos do 2D).

## Riscos
- **Tamanho**: ~700 KB do Three no repo e na rede local — só carrega no modo 3D.
- **Perf na TV** (Mac via HDMI, 4K possível): `pixelRatio` limitado, instancing, sem sombras; se
  passar do alvo, reduzir luzes pontuais.
- **Teste visual com WebGL** pode variar entre máquinas/GPUs: tolerância um pouco maior só nas
  cenas 3D; o Chromium do Playwright é fixo e usa renderização por software no headless.
- **Refator do 2D** (charPose/labels) pode mudar pixels: barrado pelo passo 2 (imagens iguais).
- **Dois motores de desenho** para manter: o 3D só lê o estado do `Office`; regras (quem senta onde,
  lazer, demo) continuam em um lugar só.

## Rollback
- `git revert` do(s) commit(s) da v7; o isométrico não depende de nada novo (vendor e view3d são
  aditivos; o refator é coberto pelas imagens antigas). Reiniciar o launchd.

## Como ficou (2026-10-17) — diferenças em relação ao plano
- Three.js 0.186.1 não publica `*.min.js`: vendorizados `three.module.js` + `three.core.js` sem alteração
  (~2,1 MB, só baixados no 3D), integridade do npm conferida e sha256 em `public/vendor/README.md`.
- Luz: em vez de ambiente + direcional, as faces usam as **mesmas cores por face do 2D** (topo/frente/lado),
  num shader sem iluminação; salas apagadas escurecem e acesas ganham tom quente pelo shader (por sala).
  Sem `PointLight` (não fez falta).
- Paredes em foco: regra mais simples que normal + raio — com uma sala em foco, as paredes altas (fundo e
  lado esquerdo) de **todas as outras** baixam para 2,5 px no shader; a câmera fica sempre no quadrante
  +x +y (giro 10°–80°), então as paredes de fundo da própria sala não tapam o conteúdo.
- O 3D reaproveita as rotinas de desenho do 2D por um coletor (`public/geo3d.js`) em vez de modelar tudo de
  novo: o 2D ganhou só `poly()` → `g.poly3`, `drawBase`, `sceneItems`, `charPose` e `labels(project)`;
  as 7 imagens do 2D seguiram idênticas.
- Medição local (Chromium headless com GPU do Mac, 3840×2160, demonstração, 94 pessoas): JS por quadro
  p50 5,3 ms / p95 6,1 ms; intervalo entre quadros p95 8,4 ms. Falta a conferência de 30 min na TV real.
