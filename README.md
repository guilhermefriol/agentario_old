# Pixel Room

Painel de TV que mostra seus agentes do Claude Code como funcionários de um prédio em pixel art isométrico.
Cada projeto é uma sala, trabalhando ou não: com trabalho a sala acende, parada ela fica apagada. Corredores
ligam todas as salas ao centro de comando, e pulsos de dados correm pelo chão das salas ativas. Cada agente
cadastrado é um funcionário com nome próprio. Cada sessão do Claude é um personagem, subagentes entram como
estagiários vindos do centro de comando, e as revisões do Codex aparecem como um fiscal de quepe e prancheta.

**É só visualização.** O painel lê arquivos e nunca escreve neles, não instala hooks, não mexe no
`settings.json` e não tem nenhuma rota que aceite comandos.

## Rodar

```bash
cd ~/.claude/projects/pixel_room
npm start            # painel real em http://127.0.0.1:4747/
npm run demo         # escritório fictício em http://127.0.0.1:4748/ (não lê seus dados)
npm test             # testes de vazamento, não-escrita, servidor e unidades
```

Não há dependências para instalar. Precisa de Node 22 ou mais novo.

### Mouse e câmera

Sozinha, a câmera alterna entre a visão do prédio inteiro e um zoom em cada sala acesa, dando prioridade às
que precisam de você. Com o mouse:

- **Passar por cima** de um agente mostra nome, cargo, sala, o que está fazendo, desde quando, modelo e a
  tarefa (esta só em salas "publico"). Sobre uma sala, mostra luzes, equipe e última atividade.
- **Roda** dá zoom, **arrastar** move e **duplo clique** volta para a visão geral. Mexer no mouse pausa o
  passeio automático por 90 segundos. O cursor some sozinho depois de 4 segundos parado.

Nada disso envia comandos: o mouse só mexe na câmera local.

Parâmetros de URL: `tour=0` desliga o passeio da câmera, `rotate=0` para a rotação dos painéis,
`painel=agora|hoje|equipe` escolhe a aba inicial, `noite=1|0` força o modo noite, `view=topdown` usa a
projeção de cima em vez da isométrica.

### Na TV (HDMI no Mac)

Abra o navegador em tela cheia na TV, por exemplo:

```bash
open -na "Google Chrome" --args --kiosk --app="http://127.0.0.1:4747/?view=iso"
```

## Classificar as salas

Na primeira execução, o painel cria `config/local.json` com todos os projetos e **tarefas ocultas**.
As salas mostram o nome real da pasta (`showRealNames: true`). Para voltar aos nomes genéricos "Sala N",
use `"showRealNames": false`. Para cada projeto, você pode editar:

```json
"Friol.ai": { "alias": "Sala 2", "display": "Friol", "tasks": "interno", "hidden": false }
```

| Campo | Efeito |
|---|---|
| `display` | Nome que aparece na TV. Se for `null`, aparece o nome da pasta, ou o `alias` com `showRealNames: false` |
| `tasks: "publico"` | Mostra os títulos das tarefas, já filtrados (e-mail, IP, CPF, CNPJ, caminhos, tokens, links) |
| `tasks: "interno"` | Mostra só a contagem: em andamento, aguardando e concluídas |
| `tasks: "oculto"` | A sala aparece, as tarefas não |
| `hidden: true` | A sala some do painel e do catálogo |

O filtro do nível "publico" não reconhece nomes de clientes. Use "publico" só em projetos sem dado sensível.
O centro de comando é a sua pasta de projetos raiz, controlado por `lobbyName` e `lobbyTasks`. A lista `exclude` esconde
pastas como backups e arquivos. O painel relê o config ao reiniciar.

Outras opções: `contextWindows` (janela de contexto por modelo, para mostrar porcentagem; sem isso o painel
mostra só os tokens), `rotateSeconds`, `night` (horário e intensidade do modo noite) e `alerts`.

## O que o painel mostra

- **Prédio.** Monitores acendem com a cor da atividade: verde editando, azul lendo, âmbar rodando
  comando, ciano pesquisando, violeta delegando. Ao acender, a lâmpada da sala pisca. Quem está livre vai ao
  café, agentes parados numa sala apagada cochilam, sai confete quando o Claude termina a vez, e um robô
  aspirador passeia pelos corredores. O centro de comando tem um radar e uma parede de telas, uma por sala.
- **Fiscal Codex.** Quando uma sessão roda `codex exec`, o fiscal sai do centro de comando, vai até a sala e
  fica ao lado do Claude anotando na prancheta. Quando sai o veredito, ele carimba (✓ aprovado, ! revisar,
  ✕ bloqueado) e volta. Um bloqueio vira alerta por 30 minutos. O painel lê o comando e a resposta só para
  extrair um sim ou não e o veredito; nenhum texto deles sai do coletor.
- **Precisa de você.** Pergunta pendente do Claude, ação aguardando você, sessão ocupada sem progresso,
  erros repetidos de ferramenta, plano bloqueado pelo Codex e contexto acima de 85% quando a janela é conhecida.
- **Agora.** Quem está trabalhando em cada sala e as tarefas, conforme a política da sala.
- **Hoje.** Mapa de calor por hora e minutos ativos por sala.
- **Equipe.** Catálogo de projetos, agentes e skills.
- **Faixa inferior.** Acontecimentos recentes, como alguém começando ou terminando uma tarefa.

Os estados só aparecem com evidência. Uma ferramenta demorando não vira alerta. "Pergunta pra você" exige
uma pergunta pendente de verdade no transcript.

## Segurança

- O servidor escuta só em `127.0.0.1`, aceita só GET e HEAD, confere o cabeçalho Host contra DNS rebinding,
  recusa Origin estranha, não tem CORS e manda `Cache-Control: no-store` e uma CSP estrita.
- Nada de CDN nem telemetria. Fontes e sprites ficam na pasta `public/`.
- O snapshot é montado campo a campo em `src/snapshot.mjs`. Prompts, comandos, caminhos, respostas,
  raciocínio e nomes de sessão nunca saem do processo. O único texto livre é a tarefa, que só existe em salas
  "publico", vem só do título da sessão ou da descrição da delegação e passa sempre pelo filtro.
- Quantidade de tokens não sai do coletor.
- O painel não abre `.key`, `.env`, `settings*.json`, `history.jsonl`, `paste-cache` e afins, e ignora
  links simbólicos que apontem para fora das pastas lidas.
- Só `src/config.mjs` escreve em disco, e só dentro de `config/`. Um teste garante isso.

## Estrutura

```
bin/pixel_room.mjs   ponto de entrada
bin/demo.mjs         escritório fictício para demonstração
src/                 coletor, filtro, snapshot e servidor (Node puro)
public/              página, planta do prédio, motor gráfico e sprites (Canvas 2D)
test/                testes (node --test)
config/              config local gerada (fora do controle de versão)
docs/                planos aprovados, pareceres do Codex e cópia da v1
```

## Futuro

O motor separa os dados da projeção e a planta do prédio do desenho. Um visual 3D (Three.js) pode usar o mesmo
snapshot e a mesma planta sem mexer no coletor.
Interação com agentes deve ser um serviço separado, com autenticação própria, e nunca neste servidor.

## Desfazer

Pare o processo e apague esta pasta. Nada fora dela foi alterado.

Autor: Guilherme Friol.
