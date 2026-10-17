# Pixel Room v5.1 — painéis seguem o modo demonstração

Autor: Guilherme Friol · 2026-10-17

## Pedido do dono
"Na demonstração não reflete as sessões trabalhando, nem esperando você, nem agentes, nem salas, etc."
Isso **inverte** a decisão da v5 (painéis sempre reais). A partir de agora, com o modo ligado, **tudo na
tela** usa a cena de demonstração; desligado, volta tudo ao real.

## Mudanças (só frontend)
- `public/demo.js` — `demoSnapshot` passa a devolver também:
  - `totals` recalculados a partir das salas da cena, com a mesma fórmula de `src/snapshot.mjs`
    (sessions, working, waitingYou, interns = estagiários + agentes trabalhando, roomsLit, rooms,
    toolCalls = soma real de `stats.toolCalls`).
  - `alerts` coerentes com a cena: um alerta `asking` ("Pergunta esperando você") para cada sessão
    real que a cena pôs em `asking`. Nenhum outro tipo de alerta inventado.
  - `tasks` reais continuam; abas Hoje (histórico do dia) e Equipe (catálogo) são as mesmas do real.
- `public/app.js`:
  - Função única `view()` = cena de demonstração (calculada uma vez por sincronização e guardada)
    ou o snapshot real. Números do topo, "Precisa de você", abas Agora/Hoje/Equipe usam `view()`.
    Noite, rotação e `ui` continuam do real (são iguais nos dois).
  - Letreiro ("agora"): passa a comparar estados de `view()`. Ao ligar/desligar, os estados anteriores
    são recarregados **sem gerar enxurrada** de mensagens, e entra uma linha "modo demonstração
    ligado/desligado".
  - O timer de 5 s do modo demonstração ressincroniza o prédio **e** redesenha os painéis.
  - Indicadores do modo (logo âmbar, "modo demonstração" no título e no mapa) ficam como estão; são o
    que diferencia a cena do real.

## Testes
- `demoSnapshot`: `totals` batem com uma contagem independente das salas da cena; `waitingYou` = nº de
  alertas `asking`; todo alerta aponta para sessão real em `asking`; entrada congelada não muda.
- Navegador: ligar o modo muda os 4 números do topo (ex.: salas acesas = N/N); desligar volta exatamente
  aos números reais; letreiro não ganha mais que 2 linhas no instante do clique; sem erros no console.

## Riscos
- Alerta/números falsos na TV quando ligado → é o pedido; mitigado pelos indicadores visíveis e por não
  persistir ao recarregar.

## Rollback
Backup em `docs/v5-backup/` (public/app.js, public/demo.js, test/). Copiar e recarregar.

---
## Revisão após parecer do Codex (docs/codex-parecer-v5.1.txt)
- **Aba Hoje usa sempre o snapshot real** (histórico do dia e auditorias reais). Agora e Equipe, números
  do topo e "Precisa de você" usam `view()`.
- **Alertas na cena:** alertas reais de salas que a cena não transforma (centro de comando e
  "Visitantes") são mantidos como vieram; para salas de projeto, os alertas reais saem e entra um
  `asking` para cada sessão real que a cena pôs em `asking`. `waitingYou` segue a fórmula do
  `snapshot.mjs` (sessões em `asking`/`waiting` em todas as salas da cena), sem prometer igualdade com o
  número de alertas. Teste: todo alerta `asking` de sala de projeto aponta para uma sessão em `asking`.
- **Letreiro:** cada linha guarda se nasceu na demonstração. Ao desligar, as linhas de demonstração são
  removidas e os estados anteriores recarregados do real; ao ligar, recarregados da cena. O diff também
  roda no timer de 5 s.
- **Sincronização única** `refresh()`: calcula a cena (se ligada) → `office.sync` → letreiro → painéis.
  Usada pela chegada do SSE, pelo clique no logo e pelo timer.
- **Testes de navegador por valor esperado:** `?debug=1` expõe `__pr.view()`; os 4 números do topo são
  comparados com `view().totals` ligado e com os totais reais desligado. Também: `?demo=1` já abre
  ligado; salas vazias ganham gente; sessões do centro de comando mantêm o estado real.
- Backup `docs/v5-backup/` criado antes de editar.
