# Pixel Room v5 — modo demonstração secreto + centro de comando com "Deus"

Autor: Guilherme Friol · 2026-10-17

## Objetivo
1. **Botão oculto no logo** (quadradinho verde à esquerda de "Pixel Room"): um clique liga/desliga o
   **modo demonstração**. Com ele ligado, o prédio inteiro ganha vida: todas as salas acesas, todos os
   agentes com atividade, Claude e estagiários em todas as salas, Fiscal Codex auditando, salas de
   lazer cheias.
2. **Centro de comando menor** (1×1 célula em vez de 2×2) com **uma mesa grande e "onipotente"** e uma
   única pessoa sentada nela, como se fosse Deus no meio do prédio (auréola dourada). De vez em quando
   todo mundo passa por lá.

## Fronteira de segurança
- **Só frontend.** Servidor, coletor e snapshot não mudam. O modo demonstração transforma no navegador
  o snapshot que já chegou; não entra dado novo de lugar nenhum. Os textos inventados (atividades,
  papéis, nome do "Deus") são constantes no código.
- Os painéis laterais, KPIs e o letreiro continuam com **dados reais** mesmo no modo demonstração. Só o
  prédio fica "de mentira". Isso evita que um alerta falso ou um número falso apareça como verdadeiro.
- Indicação discreta de que é demonstração: o logo muda de verde para âmbar e a dica do canto do mapa
  ganha "· modo demonstração". Recarregar a página desliga o modo (não fica salvo).

## Parte 1 — modo demonstração (`public/demo.js`, módulo puro + `app.js`)
- `demoSnapshot(real, now)` devolve uma cópia nova (não altera `real`):
  - Janela de tempo de 20 s (`bucket = floor(now / 20 s)`); tudo é determinístico por `hash(id + bucket)`,
    então a cena muda sozinha a cada 20 s sem piscar a cada quadro.
  - Toda sala de projeto: `lit: true`.
  - Agentes cadastrados (`staff`): ~65% `working` com atividade sorteada da lista que já existe
    (`ACTIVITY_COLOR`); o resto fica `idle`, para ter gente indo às salas de lazer.
  - Sessões Claude reais da sala: estado passa a `working` com atividade sorteada. Sala sem sessão ganha
    1 Claude de demonstração (chave `demo:<id>:c`); de vez em quando uma delas fica `asking`.
  - Sala sem agente cadastrado ganha 0–2 estagiários de demonstração (papéis fixos: Explore, Plan,
    general-purpose).
  - 1 a 2 salas por janela com `auditor.state = 'auditando'` (Fiscal Codex anda até elas); as outras
    ficam com veredito sorteado.
  - `alerts` do prédio: vazio (os alertas reais seguem no painel lateral).
- `app.js`: estado `demoOn`. `onSnapshot` guarda o real (painéis usam o real) e chama
  `office.sync(demoOn ? demoSnapshot(real, Date.now()) : real)`. Um timer de 5 s ressincroniza o prédio
  enquanto o modo estiver ligado. Desligar → `office.sync(real)` (as entidades de demonstração saem pela porta).
- No modo demonstração o lazer fica mais movimentado: `office.demo = true` → teto de 60% dos parados
  e troca a cada 60 s (em vez de 35% e 4 min).
- Botão: o `<span class="logo">` vira `<button class="logo" id="logo">` com o mesmo visual (sem borda,
  sem foco visível diferente), `aria-label="Pixel Room"`, sem texto. Clique alterna o modo.
  `?demo=1` liga direto (para testes e para a TV, se o dono quiser).

## Parte 2 — centro de comando com Deus (`building.js`, `office.js`, `app.js`)
- `planBuilding`: o centro de comando passa a ocupar **1×1 célula** (12×10) no meio. A busca de grade e
  os corredores continuam iguais (as rotas terminam no `doorOut` dele).
- Sem as fileiras de mesas. No lugar:
  - **Mesa grande** no centro (dourada, com vários monitores) e **o Deus** sentado atrás dela:
    personagem fixo só do frontend (`kind: 'god'`, chave `god`), paleta clara, **auréola** dourada
    piscando de leve. Nome na TV: "Deus". Cartão: "onipotente · centro de comando", Faz: "Vê todas as
    salas ao mesmo tempo e recebe a visita de todo mundo".
  - **Parede de telas** atrás da mesa (uma tela por sala, como hoje, só que menor). Saem o radar e a
    mesa holográfica.
  - **Lugares de pé** em volta da mesa: Fiscal Codex de plantão fica ao lado da mesa; sessões que
    caiam no centro de comando (hoje 0) ficam de pé nos lugares livres (até 6; além disso, perto da porta).
- **Visitas ao Deus**: o centro de comando entra como mais um destino do sistema de lazer, com 4
  lugares na frente da mesa ("prestando contas", "pedindo uma bênção", "levando café para Deus",
  "mostrando o relatório"). Diferença: a visita é **curta** (~25 s no lugar) e depois o agente volta
  sozinho pelo rastro. Mesmo teto, reservas, remoção e replanta do v4.

## Testes
- `building.test`: centro de comando 1×1; rotas de todas as salas terminam no `doorOut` dele.
- `leisure.test`: o teste de caminho (só atravessa parede pela porta, não passa por móveis) passa a
  cobrir também as visitas ao centro de comando, incluindo a mesa grande como móvel.
- Motor sem navegador: o Deus existe e fica parado na mesa; visitas ao centro voltam sozinhas em < 60 s;
  Codex de plantão fica em lugar de pé, não em mesa.
- `demo.test` (puro): não altera o snapshot de entrada; mantém ids e nomes reais; toda sala de projeto
  acesa; existe ao menos um `working` por sala; determinístico na mesma janela e diferente entre janelas;
  todos os textos novos vêm de listas fixas; `alerts` vazio.
- Navegador (Playwright, demo e painel real só leitura): clique no logo liga/desliga; painel lateral
  continua igual ao real; prédio todo aceso; Deus visível; alguém visita o centro; sem erros no console;
  p95 de `__frameMs` ≤ 8 ms com o modo ligado.

## Riscos
- Alguém olhar a TV com o modo ligado e achar que é real → painéis seguem reais + logo âmbar + aviso na
  dica do mapa; o modo não sobrevive a recarregar.
- Muitas entidades no modo demonstração (31 salas × Claude + estagiários + agentes) → medir desempenho;
  se passar de 8 ms, limitar estagiários de demonstração.
- Mudar o centro de comando para 1×1 muda a planta inteira (todas as salas mudam de lugar uma vez).
- Clique no logo por acidente → o mesmo clique desliga; sem efeito fora do navegador.

## Rollback
Backup em `docs/v4-backup/` (public/, test/). Mudança só estática: copiar de volta e recarregar a página.

---
## Revisão após parecer do Codex (docs/codex-parecer-v5.txt)

**Contrato do centro de comando (posições explícitas).** `building.js` dá ao centro `desks = []`,
`godSeat` (atrás da mesa), `props` (a mesa grande, como móvel) e duas listas de lugares:
- `standSpots`: lugares de pé para quem **mora** no centro (Codex de plantão no 1º; sessões, agentes e
  estagiários da sala de comando nos seguintes). Se acabarem, gera fila ao longo do corredor interno
  perto da porta (sem limite). Em `office.sync`, ocupantes do centro usam `w.spot` (como o Codex
  auditando já usa) em vez de `seatIdx`/mesa.
- `spots` (4, na frente da mesa): lugares de **visita**, no mesmo formato das salas de lazer.

**Destinos unificados.** O motor passa a ter `this.destinations = [...plan.leisure, plan.cc]`. Escolha
do slot, reservas, rastro, `exitPlan`, replanta (mapa por `room.id`) e cartões usam essa lista; o centro
continua sala própria (não vira sala de lazer, não muda rótulo/telas). Visita ao centro: ao chegar,
fica 25 s e volta (`e.away.leaveAt`); salas de lazer comuns seguem até o fim do slot.

**Quem visita.** Elegíveis para lazer e para o centro: agentes cadastrados parados **e Claude `free`**
(sessão aberta esperando você). Estagiários já passam pelo centro naturalmente (entram e saem pela porta
dele); Codex e Deus não visitam. Sessão que muda para trabalho volta pelo rastro.

**Ciclo do modo demonstração.**
- `office.setDemo(on)`: ao ligar guarda `caps` reais e marca `office.demo`; ao desligar **restaura**
  `caps` e força replanta, então o prédio volta ao tamanho real. Teste: ligar/desligar 3× seguidas deixa
  a planta igual à original.
- Ocupação fictícia **estável**: quantos Claude/estagiários de demonstração cada sala ganha depende só do
  `id` da sala (não da janela de tempo), então trocar de janela não muda capacidades nem replanta. Só
  estados e atividades variam.
- Garantia de trabalho: cada sala de projeto recebe 1 Claude de demonstração (`demo:<id>:c`) **sempre
  `working`**. `asking` só pode cair numa sessão real da sala. "Salas de lazer movimentadas", sem
  promessa de cheias.
- Estados dos agentes cadastrados mudam por agente em ciclos de 60–120 s (atividades a cada 20 s), para
  as visitas terem tempo de acontecer. Precedência: virou `working` → volta (regra do v4), inclusive no
  meio de uma visita.
- Desligar no meio de visitas: entidades de demonstração saem (regra de remoção do v4); as reais que
  estavam fora seguem as regras normais. Teste cobre.

**Botão.** `<button id="logo" class="logo" aria-label="Modo demonstração" aria-pressed="false">` com
`:focus-visible` (contorno âmbar), mesmo visual quando sem foco. Indicação visível na TV com o modo ligado:
logo âmbar **e** a linha abaixo do título vira "escritório dos agentes · modo demonstração".

**Testes ajustados.**
- Visita ao centro: tempo parado no lugar ≤ 26 s; depois volta à mesa (simulação de até 180 s, sem
  prazo fixo de 60 s).
- `demoSnapshot` com entrada **congelada em profundidade** (`deepFreeze`) não lança erro e não altera nada.
- Ciclo liga/desliga (3×) com visitas em andamento: planta e `caps` voltam aos reais; nenhuma entidade
  `demo:` sobra depois de sair.
- Desempenho: 300 quadros, 1600×900, após 30 s com o modo ligado: p95 ≤ 8 ms.

---
## Cuidados finais (docs/codex-parecer-v5-reavaliacao.txt — veredito: aprovar)
- Ao desligar a demonstração, as capacidades são **recalculadas a partir do snapshot real mais recente**
  (não restauradas de uma cópia antiga). Uma única rotina de capacidade/replanta serve aos dois modos.
- Fila de pé do centro: posições ao longo do corredor interno, fora da faixa da porta e dos 4 lugares de
  visita; a partir daí, encosta na parede lateral em colunas. Teste de não sobreposição.
- Referência de desempenho: Chromium headless do Playwright neste Mac, 1600×900.
- (2026-10-17) Igreja renomeada pelo dono: "Igreja Adventista da I.A. dos Últimos Dias".
