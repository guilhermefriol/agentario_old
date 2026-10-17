# Agentário — contexto do projeto (antigo Pixel Room)

Painel de TV **só-leitura** que mostra os projetos, agentes e skills de `~/.claude` como um prédio
isométrico em pixel art. Autor: Guilherme Friol. Visual escolhido pelo dono: **isométrico**.
Repositório: **github.com/guilhermefriol/agentario (privado)**, branch `main`.

## ▶ Próximo passo pendente (parte 2 do docs/PLANO-v6.md) — fazer ao abrir a sessão na pasta nova
O dono renomeia a pasta à mão (o hook `projects-guard` proíbe o Claude de mover pastas de projeto):
`~/.claude/projects/pixel_room` → `~/.claude/projects/agentario`. Depois, nesta pasta nova:
1. Parar o servidor antigo se ainda vivo (`lsof -nP -iTCP:4747 -sTCP:LISTEN`; era `node bin/agentario.mjs`
   iniciado à mão na pasta antiga).
2. `config/local.json`: copiar para `config/local.json.pre-v6`, trocar a chave da sala `pixel_room` → `agentario`.
3. launchd do usuário (sem sudo): `mkdir -p ~/Library/Logs/agentario`; conferir `/opt/homebrew/bin/node -v`;
   gerar `~/Library/LaunchAgents/com.friol.agentario.plist` (Label `com.friol.agentario`, ProgramArguments
   `[/opt/homebrew/bin/node, <pasta>/bin/agentario.mjs]`, WorkingDirectory = pasta, RunAtLoad, KeepAlive,
   ThrottleInterval 10, logs `~/Library/Logs/agentario/{out,err}.log`, PATH mínimo); `plutil -lint`;
   `launchctl bootstrap gui/$UID <plist>`.
4. Validar: `launchctl print gui/$UID/com.friol.agentario`, `lsof` mostra só `127.0.0.1:4747`, `curl` 200,
   `kill` no processo → volta sozinho. Não tocar nos outros `com.friol.*`.
5. Atualizar este arquivo (remover esta seção, registrar o estado) + commit + push.
Rollback: `launchctl bootout gui/$UID/com.friol.agentario`; `rm -f` do plist; restaurar `local.json.pre-v6`.
**Autorizado pelo dono em 2026-10-17** (fora de `~/.claude`): `~/Library/LaunchAgents/com.friol.agentario.plist`
e `~/Library/Logs/agentario/`.

## Depois: v7 (3D) e v8 (interação) — cada um com plano + Codex + aprovação
- **v7 — 3D**: decisão do dono = **modo extra com botão** (isométrico continua padrão; `?view=3d`), Three.js
  sobre a mesma planta/snapshot; cartão, zoom por clique, demonstração e lazer nos dois modos.
  Three.js vendorizado em `public/vendor/` com versão exata (sem CDN). Cenas novas no teste visual.
- **v8 — interação**: o dono quer **responder perguntas, mandar tarefa nova e parar sessão** pela TV.
  Serviço separado com autenticação; o servidor do painel continua só leitura. Ver
  `docs/PESQUISA-interacao.md` (o que é e o que não é possível com sessões abertas no terminal).

## Estado em 2026-10-17
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
- Testes: `npm test` (63, node --test) e `npm run visual` (7 cenas Playwright; `npm run visual:update`
  regrava **todas** — revisar as imagens antes de commitar). Demo fictícia: `npm run demo` (porta 4748).
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
  estritos, CSP, no-store. Sem CDN; fontes em `public/fonts/`. Runtime sem dependências
  (`@playwright/test` é só devDependency de teste).
- `config/local.json` (lista real de projetos) nunca vai para o git.
- Mudança substantiva segue o gate global: plano → Codex read-only via stdin → aprovação do dono.

## Estrutura
- `src/` coletor, filtro, snapshot, servidor (Node puro)
- `public/demo.js` modo demonstração · `public/leisure.js` lazer e centro (puro, testado no node)
- `public/building.js` planta, ala e corredores · `public/office.js` motor · `public/app.js` câmera, mouse, painéis
- `bin/agentario.mjs` entrada · `bin/demo.mjs` demo · `test/` node --test · `test/visual/` Playwright
- `?debug=1` expõe `window.__pr` (só leitura) para testes.
