# Pixel Room v4 — salas de lazer ("matando o tempo")

Autor: Guilherme Friol · 2026-10-17

## Objetivo
Acrescentar ao prédio salas fixas de convivência: **Academia, Banheiros, Refeitório, Sala de
descanso e Igreja**. Agentes cadastrados que estão **parados** (sem trabalho) saem da sala do projeto
de vez em quando, andam pelos corredores e passam um tempo nessas salas. Quando um agente recebe
trabalho, ele volta na hora para a própria mesa.

## Escopo e fronteira
- **Só frontend** (`public/building.js`, `public/office.js`, `public/app.js`). Servidor, coletor
  e snapshot não mudam. Nomes e atividades das salas são textos fixos no código, então não entra
  dado novo na TV e a fronteira de segurança fica igual.
- As salas de lazer **não** são projetos: ficam fora de `snapshot.rooms`, KPIs ("salas acesas"),
  painéis laterais, telas do centro de comando, pulsos de corredor e paradas do tour.

## Planta (`building.js`)
- Constante `LEISURE = [{ id:'lz:gym', name:'Academia', span:[2,1] }, { id:'lz:wc', name:'Banheiros', span:[1,1] },
  { id:'lz:food', name:'Refeitório', span:[2,1] }, { id:'lz:rest', name:'Sala de descanso', span:[2,1] },
  { id:'lz:church', name:'Igreja', span:[2,1] }]`.
- `planBuilding` coloca essas salas **depois** das salas de projeto (o `tryPlace` já põe o que vem
  por último mais longe do centro, então elas ficam na periferia). O `N` da busca de grade inclui
  essas 9 células.
- Cada uma vira um objeto `lr` com `leisure: true`, `kind`, `room: { id, name }`, porta, `doorOut`,
  `route` até o centro de comando (mesmo BFS das outras salas) e uma lista de **lugares** (`spots`)
  com pose: esteira/halteres/banco (academia), cabines e pias (banheiros), cadeiras nas mesas
  (refeitório), sofá/puffs/fliperama (descanso), bancos em fileira (igreja). Capacidade = número de spots.
- Vai em `plan.leisure` (lista separada de `plan.rooms`), para não entrar nos laços que hoje
  percorrem as salas de projeto.

## Comportamento (`office.js`)
- Elegível: `kind === 'staff'` com `state === 'idle'` (não Claude, não estagiário, não Codex).
- Rotação determinística por agente: ciclo de 6 a 10 min (pelo hash da chave). Em ~40% do ciclo ele
  "sai". A sala é escolhida por `hash(chave + ciclo)`; se não houver lugar livre, tenta a próxima;
  se todas estiverem cheias, fica na mesa.
- Rota de ida: porta da sala do projeto → corredor (rota até o centro de comando) → rota da sala de
  lazer ao contrário → lugar. O trecho comum das duas rotas é cortado para ninguém ir até o centro sem
  precisar. Volta: o caminho inverso.
- (substituído pelo modelo `e.away` + rastro da seção Revisão)
- Virou `working` (snapshot novo) → `destination` passa a ser `seat` e ele volta na hora pela rota
  inversa. Agente removido do snapshot estando na sala de lazer → sai pela porta dela e some no corredor.
- Mudança de planta (sala nova/removida) já zera `e.path`. Quem está numa sala de lazer é reposicionado
  pelo deslocamento da própria sala de lazer (igual ao que é feito hoje com as salas de projeto).
- Animações simples por lugar: esteira (bob mais rápido), halter (braço sobe e desce), refeitório
  (vapor no prato), descanso ("z" ou fliperama piscando), igreja (sentado, partícula de luz no vitral).

## Desenho
- Camada estática: piso e paredes com tema próprio por sala, móveis temáticos. Iluminação: acesa
  (fraca) só quando tem gente, apagada quando vazia, reaproveitando o escurecimento atual.
- Rótulo com o nome da sala no mesmo estilo dos outros (menor, cor neutra).
- As células livres que hoje viram "lounges" continuam como estão.

## Mouse e câmera (`app.js`)
- `hitTest` também reconhece salas de lazer e devolve `{ type:'room', lr }`. O cartão da sala de lazer
  mostra o nome, "N agentes matando o tempo" e quem está lá.
- O cartão do agente ganha a linha "Onde: Academia · malhando". Estado: "matando o tempo".
- O clique para dar zoom já funciona com o `lr.room.id`. `focusedRoom()` procura também em `plan.leisure`.

## Testes
- Novo `test/building.test.mjs` (importa `public/building.js`, que não usa DOM): as 5 salas de lazer
  existem, não se sobrepõem a nenhuma outra sala nem ao centro de comando, todas têm `route` que
  termina na porta do centro de comando, a capacidade é maior que 0, e a planta é determinística para
  a mesma entrada.
- `npm test` completo (45 + novos).
- Verificação no navegador com Playwright (`?debug=1`) na demo: as salas aparecem; forçando o relógio
  (`t`), agentes parados chegam à sala de lazer; trocar um agente para `working` faz ele voltar à mesa;
  hover mostra "Onde"; clique dá zoom na Academia; sem erros no console; `__frameMs` sem piora relevante.

## Riscos
- O prédio cresce (+9 células) → a visão geral fica um pouco menor na TV. Mitigação: as salas de lazer
  usam spans pequenos e vão para a periferia.
- Corredores congestionados/caminhadas longas em prédios grandes → limitar a ~35% dos parados fora ao
  mesmo tempo.
- Lugar disputado por dois agentes → reserva de spot em mapa próprio (`leisureSeats`), liberado ao sair.

## Rollback
Backup antes em `docs/v3-backup/` (public/*.js, test/). Reverter = copiar de volta (a página recarrega
sozinha no próximo acesso; o servidor não precisa reiniciar, mas reinicio para garantir).

---
## Revisão após parecer do Codex (docs/codex-parecer-v4.txt)

**Modelo de movimento ("refazer o rastro").** `e.state` continua sendo o do snapshot; o lazer fica num
campo visual separado `e.away = { lz, spot, trail, phase: 'indo' | 'lá' | 'voltando' }`.
- Na partida a rota inteira é montada uma vez (mesa → corredor da sala → porta → corredor → porta da sala
  de lazer → corredor interno → lugar) e guardada em `trail`, com o índice do último ponto alcançado.
- **Voltar = refazer o rastro ao contrário a partir da posição atual**: ponto atual → pontos já
  alcançados em ordem inversa → mesa. Vale para "chegou trabalho no meio da ida", "chegou trabalho
  quando já estava lá" e "fim do passeio". Como só percorre segmentos já andados, nunca atravessa parede
  nem recomeça pela porta.
- Caminho interno das salas de lazer: cada sala tem um **corredor interno** fixo (linha livre perto da
  parede da porta, como o `aisle` das salas de projeto) e cada lugar tem uma **faixa de acesso** em x livre
  de móveis. Caminho = porta → corredor interno → faixa do lugar → lugar. Não usa `laneX`/`cols`.

**Quem sai e quantos (regra determinística).**
- Elegíveis: staff com `state === 'idle'`, sem `leaving`, sem estar a caminho de outra coisa.
- Janelas globais de 4 min (`slot = floor(agora / 240 s)`). Teto: `cap = floor(0,35 × elegíveis)`
  (equipe com menos de 3 parados → no máximo 1; 0 elegíveis → 0).
- Escolhidos do slot: elegíveis ordenados por `hash(chave + slot)`, pegando os primeiros `cap` que
  conseguirem reserva. Quem é escolhido em slots seguidos simplesmente fica.
- Sala: `hash(chave + slot) % 5`, com o próximo da lista se estiver cheia.

**Reservas.** Mapa `leisureSeats: lz → Map(spot → chave)`. Reserva **na partida**; libera ao iniciar a
volta, na remoção do agente e na replanta. "Presentes" (para o cartão e a luz) = quem está em `phase: 'lá'`,
contados à parte das reservas.

**Replanta e remoção.**
- Replanta (sala nova/removida, capacidade mudou): todo mundo com `e.away` volta **direto para a mesa**
  (teleporte, evento raro), `leisureSeats` é recriado vazio e o ciclo recomeça no próximo slot. Sem
  deslocar ninguém no corredor.
- Agente removido do snapshot (ou projeto removido) enquanto `e.away`: a entidade **não é apagada na
  hora**; ganha `leaving` e anda pelo rastro até sair da sala de lazer (ponto `doorOut` dela) e some no
  corredor. O `sync()` passa a preservar essas entidades em vez de apagar ao não achar a sala de projeto.
  Reserva liberada na hora.

**Periferia.** Colocar por último tende a deixar na borda, mas não garante; aceito assim.

**Testabilidade.** A lógica sem DOM vai para um módulo puro novo `public/leisure.js`:
`leisureLayout(lr)` (spots, corredor interno), `pickVisitors(elegíveis, slot, capacidades)`,
`trailBack(trail, idx, pos)` e `reserve/release`. `office.js` só chama.
Testes em `test/leisure.test.mjs` / `test/building.test.mjs`:
- 5 salas de lazer existem, sem sobreposição, com rota até a porta do centro de comando; planta determinística.
- **Segmentos transitáveis**: amostrando cada segmento das rotas de ida (de várias salas de projeto
  para cada sala de lazer), todo ponto está no corredor ou dentro da sala de origem/destino, e só cruza a
  parede pela porta.
- `pickVisitors`: respeita o teto (incl. equipes pequenas), determinístico, não passa da capacidade,
  dois agentes nunca no mesmo spot.
- `trailBack`: interrompido no meio da ida volta só por pontos já andados e termina na mesa.
- reservas liberadas em volta/remoção/replanta.

**Desempenho mensurável.** Na demo a 1600×900: p95 de `window.__frameMs` em 300 quadros
≤ 1,25 × o valor medido antes da mudança e ≤ 8 ms.

**Rollback.** Backup em `docs/v3-backup/`; mudança só estática, então reverter = copiar de volta e
recarregar a página (não precisa reiniciar o servidor).

---
## Ajustes finais após a reavaliação (docs/codex-parecer-v4-reavaliacao.txt)

**Remoção por fase** (agente ou projeto some do snapshot enquanto `e.away`):
- ainda **dentro da sala do projeto** (indo ou voltando) → sai pela porta da sala do projeto (`leave-door`, como hoje);
- **no corredor** → some ali mesmo com um esmaecer curto;
- **dentro da sala de lazer** → anda até a porta da sala de lazer e some no corredor.
Reserva liberada na hora, nos três casos.

**Precedência na replanta:** remoção primeiro (quem perdeu a sala segue a regra acima, com a posição
deslocada só se estiver dentro da sala de lazer, que é fixa). Depois, quem ainda tem sala volta direto para a mesa.

**Teto real:** o teto conta **todos fora da mesa** (indo, lá e voltando). A lista de escolhidos é
calculada **uma vez no início do slot** e fica congelada até o próximo; só sai alguém novo se
`fora < teto`. Troca de slot com retornos pendentes: quem estava fora e não foi escolhido volta;
quem foi escolhido de novo fica.

**Testes extras:** remoção nas três fases (sala do projeto, corredor, sala de lazer); troca de slot
com retornos pendentes não passa do teto; replanta com remoção simultânea.
