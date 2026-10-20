# Estado do projeto — Mandarin Quest

> **Para quem chega agora (humano ou LLM):** este arquivo substitui a conversa que construiu o
> projeto. Ele registra **o que existe**, **por que foi feito assim** e **o que falta**.
> Leia este arquivo antes de mexer em qualquer coisa. `CLAUDE.md` é a especificação original
> (o "contrato"); `README.md` é o manual de uso; este arquivo é o histórico de decisões.
>
> Última atualização: 2026-10-20. Testes: **294 passando** (`npm test`).

---

## 1. O que é, em uma página

App pessoal de estudo de mandarim para um brasileiro que mora na China, joga futebol com colegas
chineses e está fazendo um intensivo. Resolve três perguntas por dia: o que já aprendi, onde tenho
dificuldade, o que estudar agora.

**Sem dependências de runtime.** HTML + CSS + JavaScript (ES modules) puros. Node só para o servidor
local, o gerador de linha de comando e os testes (`node --test`). Nenhum `npm install` é necessário
para rodar o app — isso foi decisão de projeto, não acidente (ver §3.1).

```
Tamanho atual:  núcleo 6.639 linhas · interface 4.313 · servidor/scripts 1.363 · testes 4.344
Conteúdo:       154 palavras no léxico base · 26 questões de nivelamento · 50 pontos de gramática
```

### Como rodar

```bash
npm start                      # servidor local (recomendado no PC): http://127.0.0.1:8000
HOST=0.0.0.0 npm start         # + acessível pelo celular na mesma Wi-Fi (exige chave)
npm test                       # 294 testes, ~4s, sem rede
npm run generate               # gera o pacote do dia (backend claude-code)
npm run generate:dry           # mostra o prompt exato, sem chamar modelo nenhum
npm run generate:mock          # pacote falso, para testar interface
npm run publicar               # monta publicar/ para o GitHub Pages
npm run seed:demo              # preenche data/state.json com dados FICTÍCIOS
npm run timer:install          # timer do systemd: gera o pacote às 5h
npm run caixa                  # atende os pedidos do celular (caixa postal no GitHub)
npm run caixa:timer            # timer do systemd: confere a caixa a cada 30 min
```

### Repositório e publicação

O projeto tem **repositório git próprio**, na própria pasta (`git init` feito em 2026-10-14, commit
inicial `19b4884`, 84 arquivos), publicado em **`git@github.com:Lucas-023/mandarim.git`** (remote
`origin`, branch `main`, push feito em 2026-10-14 no commit `635c2ca`). Autenticação por **SSH**
(`~/.ssh/id_ed25519`, já registrada no GitHub); o `gh` CLI não está instalado. Para publicar mudanças
basta `git push`.

**Publicado em <https://lucas-023.github.io/mandarim/>** (2026-10-14). Repositório tornado público e
Pages configurado com **Source: GitHub Actions**. O workflow `.github/workflows/pages.yml` roda os
testes, monta `publicar/` e publica a cada push em `main`. Público expõe o **código**, nunca os dados
(ficam no aparelho; `data/` está no `.gitignore` e há teste que falha se vazar para a publicação;
conferido no ar: `data/state.json` dá 404).

**Caixa postal instalada neste PC (2026-10-14):** repositório privado
`git@github.com:Lucas-023/mandarim-dados.git` clonado em `data/caixa/`; timer de usuário
`mandarin-quest-caixa.timer` (a cada 30 min) ativo; `loginctl enable-linger` ligado, então roda sem
login. Conferido: o serviço roda pelo systemd, puxa por SSH e acha o `claude` no PATH da unidade.
Log: `journalctl --user -u mandarin-quest-caixa.service -n 50`.

### Três modos de armazenamento (decididos em tempo de execução)

| Modo | Quando | Onde ficam os dados | Geração do pacote |
|---|---|---|---|
| `server` | aberto pelo PC com `npm start` | `data/state.json` | `claude -p` ou API, agendada às 5h |
| `device` | celular / app publicado | IndexedDB do aparelho | caixa postal (plano do Claude no PC) ou Claude API com a chave do aparelho |
| `local` | navegador sem IndexedDB | localStorage | não |
| `memory` | armazenamento bloqueado | nada é salvo (avisa em vermelho) | não |

---

## 2. Mapa dos arquivos

```
CLAUDE.md               especificação original (não alterar a especificação; só o bloco de estado no topo)
ESTADO-DO-PROJETO.md    este arquivo
README.md               manual de uso
index.html              página única
styles.css              estilo (tema claro/escuro, celular)
manifest.webmanifest    instalação na tela inicial do celular
icone.svg               ícone
server.mjs              servidor local: estado, pacotes, mídia, geração, acesso pelo celular
src/app.js              bootstrap, roteador por hash, escolha do armazenamento, teclado global

src/core/               LÓGICA PURA — sem DOM. É o que os testes exercitam.
  storage.js            estado único em JSON, migração, backends (memória/localStorage)
  idbStore.js           IndexedDB: estado e mídia no aparelho, cota, armazenamento permanente
  serverStore.js        persistência via /api, detecção de dados órfãos
  mediaStore.js         áudios: arquivo no servidor OU IndexedDB
  merge.js              mesclagem de dois aparelhos sem perder histórico
  fsrs.js               FSRS-4.5: estabilidade, dificuldade, retenção (o algoritmo do Anki)
  baralho.js            o "Anki" interno: cartões por rascunho aprovado, fila do dia, responder, desfazer
  fala.js               prática de fala: fila de frases, autoavaliação, conversa simulada (sem proficiência)
  caixaPostal.js        celular ↔ computador por repositório privado do GitHub (pedidos, pacotes, erros)
  session.js            sessão de exercício persistida (sobrevive a fechar o app)
  xp.js                 XP idempotente, meta diária, sequência, marcos
  skills.js             estimativa por habilidade a partir de evidências
  schedule.js           repetição espaçada (SM-2 simplificado), leeches, fila
  placement.js          motor do nivelamento, correção, relatório
  assessment.js         reavaliação periódica com itens novos
  plan.js               resultado do nivelamento → plano inicial
  exercises.js          geração/correção de exercícios (vocab, leitura, produção, revisão, escuta, ditado)
  flashcards.js         segmentação, pinyin, glosa, duplicatas, rascunhos
  packs.js              ingestão do pacote diário no app
  packValidation.js     schema do pacote gerado (roda no gerador E no app)
  packPipeline.js       orquestração da geração (compartilhada PC/celular)
  briefing.js           o que é enviado ao modelo (e fica auditável); completa pedidos atrasados do celular
  prompts/pack.js       prompt de sistema versionado (pack-v4)
  llmBrowser.js         Claude API direto do navegador, streaming
  secrets.js            chave da API, por aparelho, FORA do estado
  ankiExport.js         TSV/CSV + histórico de exportações
  ankiConnect.js        add-on do Anki: notas, mídia, histórico de revisões
  activities.js         sessões e conversas reais
  achievements.js       conquistas comprováveis
  recommendations.js    recomendações explicáveis
  demoData.js           dados fictícios de demonstração
  content/lexicon.js    154 entradas + registro em tempo de execução
  content/questions.js  26 itens do nivelamento
  content/grammar.js    50 estruturas em ordem de progressão

src/ui/                 telas (dom.js, dashboard, onboarding, placement, study, cards, pack,
                        activities, history, settings, audio, recorder, geracao, caixa, baralho, falar)
tools/generate.js       gerador por linha de comando
tools/caixaPostal.js    atende a caixa postal: pedido do celular → claude -p → pacote no repositório
tools/backends/         claude-code (padrão, testado), api (SDK oficial, NÃO testado), mock
scripts/                timer systemd, semear demonstração, montar publicação
.github/workflows/      publicação automática no GitHub Pages
tests/                  20 arquivos, 294 testes; tests/helpers/dom-shim.js é um DOM mínimo próprio
data/                   SEUS DADOS (fora do git): state.json, packs/, media/, outbox/, backups/
```

---

## 3. Decisões e por quê

A ordem aqui é de importância, não cronológica. Cada item diz **o que foi decidido**, **por quê** e
**o que quebraria se alguém mudar sem pensar**.

### 3.1 Zero dependências, sem build

O ambiente onde o projeto foi escrito **não tinha acesso ao registro npm**. Em vez de ficar
bloqueado, o projeto virou ES modules puros, que rodam no navegador e no `node --test` sem
transpilação. Efeito colateral bom: o app abre em qualquer máquina, e a pasta publicada tem ~365 KB
(50 arquivos). O número exato sai de `npm run publicar`.
**Se mudar:** qualquer dependência quebra o modo celular (o service worker lista arquivos locais) e
obriga build no workflow do GitHub Pages.

### 3.2 XP nunca é proficiência

`xp.js` mede atividade; `skills.js` mede desempenho. Estudar 50 cartões não move habilidade nenhuma.
Há teste explícito para isso (`skills.test.js`: 50 eventos de XP → todas as habilidades seguem
`null`). Exigência da especificação §7.3 e a regra mais fácil de violar por acidente.

### 3.3 Nada é estimado sem evidência

Habilidade sem dado aparece como `nao_avaliada`; com poucos dados, `dados_insuficientes`. O nível
geral só menciona HSK aproximado com 3+ itens respondidos na faixa. Toda pontuação carrega a fórmula
em texto ("precisão ponderada 80% em 7 itens, dificuldade média 1,8, fator 0,76 → 61/100").

### 3.4 Apoio usado reduz o peso do acerto

Revelar o pinyin antes de responder é registrado (`supportUsed`) e multiplica o acerto por 0,7.
Sem isso, o número sobe sem a pessoa melhorar.

### 3.5 O validador do pacote roda duas vezes

`packValidation.js` é chamado no gerador **e** de novo no app, porque `data/packs/*.json` pode ser
editado à mão. Ele **rejeita o pacote inteiro** se o modelo mandar campo de proficiência
(`skills`, `score`, `xp`…), exercício de produção oral, pinyin/tradução vazios, alternativas
repetidas, resposta fora da faixa, ou escuta sem o texto a ser falado.
**Por quê:** conteúdo gerado por LLM é dado não confiável; a fronteira é o schema.

### 3.6 Loop de correção em vez de confiar na primeira resposta

Quando a validação falha, o gerador devolve os erros ao modelo e pede correção (`--retries`, padrão
1). Isso já aconteceu de verdade na primeira geração real (a regra do `any` com mais de 12 itens).
Custo: uma chamada extra. Depois disso relaxei a regra que causou a retentativa.

### 3.7 O pacote tem duas metades obrigatórias

Pedido explícito do usuário: **entrada nova todo dia, sobretudo gramática, sem nunca perder de vista
o que já viu.** O prompt tem orçamento: 10–14 palavras novas + 1 estrutura nova da fila + até 8
palavras devidas reapresentadas **em frases diferentes** + estruturas antigas devidas reaparecendo no
diálogo e em 2+ exercícios. Medido no pacote real: 12 novas + 8 de revisão (8/8 vindas do
agendador), 12/12 exercícios com `targets`.

### 3.8 Currículo gramatical é uma fila, não sorteio

`content/grammar.js` tem 50 estruturas em ordem de dificuldade. O briefing informa as já
apresentadas e a próxima; o modelo ensina **essa**. Se a próxima for trivial para o nível, o prompt
manda resolvê-la em duas linhas e ensinar a seguinte — e o modelo fez exatamente isso no teste real
(passou por `是` e explicou `的`). Há tela para marcar "já domino" e pular a fila.

### 3.9 Agendador próprio em vez de depender do Anki

SM-2 simplificado em `schedule.js`: passos fixos de 1 e 3 dias, depois `intervalo × facilidade`;
erro volta a 1 dia e reduz a facilidade; 4 recaídas marcam o item como problemático (e o pacote muda
o ângulo em vez de repetir o cartão). **Por quê:** o Anki não devolve o estado item-por-item ao
navegador, e sem isso o briefing não sabe o que está esquecido — só o que foi errado ontem.
O agendador decide **quando** um item volta; não é proficiência.

### 3.10 Exercícios declaram o que treinam (`targets`)

Cada item diz quais palavras/estruturas exercita. É assim que o agendador sabe o que foi revisado.
Refs genéricas (nome de tema) são descartadas de propósito. Sem `targets` correto, a repetição
espaçada para de funcionar silenciosamente.

### 3.11 Sessão de exercício persistida

Era o ponto mais frágil: o exercício vivia na memória da aba. Agora cada resposta vai para o estado
e para o disco/IndexedDB. Retoma no mesmo item. **Sessão aberta não gera desempenho** — a correção
só acontece na conclusão, então abandonar pela metade registra zero.

### 3.12 Backend de geração: `claude-code` como padrão

A máquina tinha o Claude Code instalado e autenticado, e **nenhuma** chave de API. `claude -p` virou
o padrão: zero configuração, custo pela assinatura existente. O backend `api` (SDK oficial) está
escrito segundo a documentação, mas **nunca foi executado** — sem npm nem credencial no ambiente.
Está marcado como não testado no código, no README e aqui. O backend do navegador
(`llmBrowser.js`) é independente e usa `fetch` direto, com testes de cabeçalho/streaming/erro.

### 3.13 Chave da API fica fora do estado

`secrets.js` guarda a chave em `localStorage` sob outra chave, **não** no estado do app: assim ela
não entra no JSON exportado nem é sincronizada entre aparelhos. Decisão do usuário (ele escolheu
chave no celular para ter autonomia); os riscos estão escritos na própria tela.

### 3.14 Celular autônomo via GitHub Pages

Service worker exige HTTPS ou localhost — por HTTP na rede local o navegador recusa o registro.
Então "usar no celular sem o PC" obriga hospedagem. O app é 100% estático, então Pages resolve. A
pasta publicada contém **apenas o app**: há teste que falha se `data/`, `server.mjs`, `tools/` ou
`tests/` vazarem.

### 3.15 Mesclagem em vez de "importar"

Com dois aparelhos, importar apagaria o histórico do outro. Como quase tudo aqui só cresce, a união
é a operação correta: eventos por `key`, registros por `id`, pacotes por data, léxico por palavra,
agendamento item a item (fica o revisado mais recentemente), escalares pelo `updatedAt`.

### 3.16 Áudio: TTS é útil, mas é declarado como TTS

A escuta usa a voz do navegador e **gera evidência real** de 听力 — mas o cálculo da habilidade
anexa o aviso: "3 de 3 evidências vêm de voz sintetizada, não de fala natural". Gravar colegas
(`MediaRecorder`) existe justamente porque TTS não substitui gente real. Pronúncia **não** recebe
nota: não há avaliação automática confiável aqui.

### 3.17 Chave obrigatória no acesso pela rede local

Fora do loopback (`HOST=0.0.0.0`), toda requisição — inclusive a página — exige chave, gerada em
`data/lan-token.txt` (permissão 600) e guardada em cookie. Numa Wi-Fi compartilhada, sem isso
qualquer um leria e alteraria o progresso.

### 3.18 Falha nunca é reportada como sucesso

Envio ao AnkiConnect que falhou é registrado como erro, com o estágio; o cartão continua "aprovado",
não "exportado". Mídia que não subiu impede a nota de prometer áudio. Histórico de revisões do Anki
aparece como "indisponível" se o add-on não expõe a ação.

### 3.19 Caixa postal no GitHub em vez de Wi-Fi ou chave no celular

O usuário quis gerar pelo **plano do Claude** (sem pagar API) e usa **iPhone**. A assinatura só roda
no `claude -p` do computador, então o pacote precisa viajar PC → celular. Pela Wi-Fi não dá: o app
publicado é HTTPS e o servidor de casa é HTTP, e o Safari bloqueia conteúdo misto sem exceção (o
Chrome Android tem permissão de "rede local", o iOS não). Um repositório **privado** do GitHub fala
HTTPS com CORS, funciona fora de casa e o PC já tem SSH configurado.
- **Vai o briefing, não o estado:** é o mesmo resumo que iria ao modelo; histórico, cartões e
  gravações não saem do aparelho. Repositório público é recusado no `testarCaixa`.
- **Token fora do estado** (`localStorage`, chave própria), como a chave da API (§3.13).
- **Horário absoluto no pedido (`naoAntesDe`)**: o PC está em America/Sao_Paulo e o celular na China.
  O PC não decide o "hoje"; atende o pedido quando o horário chega (amanhã = 4h no fuso do celular)
  e ignora pedido vencido há 36h. Por isso o timer é `*:00/30`, não "às 5h".
- **Envio quando os dados mudam, não só ao abrir:** todo `commit` fora de exercício em andamento
  agenda o envio (15 s); sair da tela (`visibilitychange`/`pagehide`) manda na hora, com `keepalive`
  no PUT. Sem isso, quem estuda à noite e fecha o app recebe um pacote que não viu a última sessão.
  O digest do briefing evita escrita repetida.
- **Pacote revalidado no celular** (§3.5), e falha do PC vira `erros/DATA.json`, mostrado no
  celular; após 3 falhas no dia o PC para.
**Se mudar:** trocar o briefing pelo estado inteiro vaza dados privados para o GitHub; usar o fuso
do PC gera o pacote no dia errado.

### 3.20 Baralho próprio (FSRS) em vez de depender do Anki no iPhone

O usuário usa iPhone, onde o Anki é pago (AnkiMobile) e não aceita AnkiConnect, e pediu "um pequeno
Anki dentro do app". Decisões:
- **FSRS-4.5 com os pesos padrão**, implementado das fórmulas publicadas (não é código do Anki).
  Otimizar os pesos exige centenas de revisões que ainda não existem.
- **Conteúdo = rascunho aprovado** (`cardDrafts` approved/exported); o cartão guarda só o
  agendamento (`state.deck.cartoes`, id `rascunho:modelo`). Editar o rascunho muda o cartão sem cópia.
  Rejeitar apaga os cartões; desligar um tipo de cartão só esconde (o histórico volta).
- **Memória muda só na 1ª resposta do dia** (regra do FSRS-4.5); passos em minutos como no Anki;
  irmãos (reconhecer/produzir da mesma palavra) nunca no mesmo dia.
- **Autoavaliação não é proficiência:** responder dá XP (`review_session`, uma vez por dia, a partir
  de 10 respostas) e nunca cria `skillEvidence`. Teste cobre.
- **Ponte com o pacote diário:** se a palavra já está em `schedule.js`, a resposta conta lá, uma vez
  por dia (os dois irmãos não aceleram o item duas vezes). Palavra que o pacote nunca viu não é criada.
- **Desfazer** guarda o retrato anterior nas últimas 50 respostas; a mesclagem descarta esses retratos.
- Sem *fuzz* nos intervalos (o Anki espalha ±alguns dias): mantém o comportamento previsível e testável.
**Se mudar:** dar evidência de habilidade por revisão viola §3.2; copiar o conteúdo para o cartão
cria duas fontes que divergem ao editar.

### 3.21 O briefing manda o que o aluno JÁ VIU, não o dicionário

Até o pack-v3, `knownWords` era o léxico base inteiro (154 palavras) mais os cartões aprovados, e o
prompt proibia ensinar como novo o que estivesse ali. Resultado medido nos pacotes de 14 e 15/10:
o vocabulário de futebol escrito à mão (传球, 守门员, 换人, 越位…) nunca era ensinado, e mesmo assim
aparecia nas frases ("我是后卫") como se fosse sabido. Agora:
- `seenWords` = itens do agendador + cartões aprovados + vocabulário acertado no nivelamento;
- `candidateWords` = léxico base ainda não visto, em **rodízio** entre os objetivos do perfil (sem
  rodízio o primeiro objetivo ocupava as 30 vagas e o futebol sumia) e por nível dentro de cada um;
- o prompt manda usar nas frases só palavras vistas, do próprio pacote ou de nível 1 básico.
**Se mudar:** voltar a mandar o léxico como "conhecido" reabre o buraco do futebol.

### 3.22 O computador completa o pedido com os pacotes que ele já gerou

O celular pede hoje e amanhã de uma vez, antes de qualquer pacote existir; o de amanhã não sabia o que
o de hoje ensinou, e 是 foi ensinado em 14/10 e de novo em 15/10. Duas mudanças em
`tools/caixaPostal.js`: pedidos são atendidos do **mais antigo para o mais novo**, e cada briefing passa
por `incorporarPacotesAnteriores` (vocabulário vai para `alreadyTaught`, a gramática entra em `seen` e
a fila anda) com os pacotes da caixa da última semana. É idempotente. `atualizarBriefingAntigo`
converte pedidos que ainda chegam no formato pack-v3 (o iPhone só pega a versão nova na 2ª abertura).
**Se mudar:** atender do mais novo primeiro faz o pacote de amanhã ser gerado sem saber do de hoje.

### 3.23 Fala com autoavaliação, nunca com nota

Objetivo nº 1 do usuário é conversar, e nada no app fazia a boca trabalhar. A tela **Falar**
(`src/ui/falar.js`, lógica em `src/core/fala.js`) tem três modos: repetir em voz alta (shadowing),
dizer a partir do português (recuperação ativa falada) e conversa simulada. Decisões:
- **Nota é autoavaliação** (travei / quase / saiu bem). Ordena a fila (travou volta primeiro; saiu bem
  descansa 3 dias), vai para o briefing como `speakingStuck` e dá XP (`speaking_practice` com 8+
  frases no dia; `roleplay` por conversa concluída, ambos 1×/dia). **Nunca** cria `skillEvidence`:
  口语 segue "não avaliada". Teste cobre.
- **Gravação não é guardada** (`gravadorDeComparacao`): voz própria 30×/dia lotaria o aparelho. O
  microfone é solto a cada redesenho (`soltarMicrofone`), senão a gravação esquecida segura o mic
  e, no iPhone, o som sai baixo pelo alto-falante de chamada.
- **Revelar mexe só no DOM**: redesenhar jogaria fora a gravação recém-feita. Só a nota faz `commit`.
- **Conversa simulada vem do pacote** (`roleplay`, pack-v4: tarefa aberta em português + 1–3
  respostas aceitáveis) e, em pacote antigo, é montada do diálogo (você é quem fala em 2º lugar).
  Não há modelo respondendo ao vivo: o usuário escolheu não pagar API, e a caixa postal leva 30 min.
**Se mudar:** dar evidência de habilidade pela autoavaliação viola §3.2; guardar as gravações exige
cota e limpeza que não existem.

---

## 4. Histórico: o que foi feito em cada rodada

| Rodada | Entrega | Motivo |
|---|---|---|
| 1 | Fase 1 completa da especificação: onboarding, nivelamento, painel, XP, flashcards, exportação, histórico, configurações (105 testes) | cumprir `CLAUDE.md` §15 |
| 2 | Análise crítica para intensivo | o usuário pediu avaliação, não código |
| 3 | Pipeline de LLM: servidor local, gerador, schema, ingestão, timer, léxico que cresce (136 testes) | furo nº 1 e nº 2 da análise: conteúdo fixo e léxico de 154 palavras |
| 4 | Agendador SM-2, currículo de 50 estruturas, prompt v2 com orçamento novo/revisão (158 → 193) | pedido: material novo todo dia sem esquecer o antigo |
| 5 | Áudio (TTS, ditado, gravação, mídia no Anki), sessão persistida, teclado, aprovação em massa, reavaliação semanal, leitura do Anki, import JSON (193 → 202) | pedido: "faça tudo, especialmente salvar progresso se eu parar" |
| 6 | Rede local com chave, manifesto, CSS de celular, resgate de dados órfãos (202 → 210) | pergunta: "dá para usar no celular?" |
| 7 | IndexedDB, service worker, Claude API no navegador, mesclagem, publicação no Pages (210 → 223) | pedido: celular **sem** o PC ligado |
| 8 | Este documento, ponteiro no `CLAUDE.md`, repositório próprio do projeto e commit inicial | pedido: não gastar tokens recontando a história a cada sessão |
| 9 | Push para `github.com/Lucas-023/mandarim` (remote `origin`, SSH) | pedido: ter o repositório chamado `mandarim` |
| 10 | Repositório público + Pages via Actions; app no ar em `lucas-023.github.io/mandarim` | pedido: usar no celular |
| 11 | Configurações acessíveis antes do onboarding; caixa postal no GitHub para gerar pelo plano do Claude no PC (223 → 245) | pedido: não pagar API, iPhone |
| 12 | Baralho interno com FSRS ("um pequeno Anki"): estudo com 4 notas, navegador, adicionar, estatísticas, mesclagem (245 → 272) | pedido: Anki no iPhone sem pagar AnkiMobile |
| 13 | Briefing com `seenWords`/`candidateWords` (o léxico deixou de ir como "conhecido"); pedidos atendidos em ordem e completados com pacotes já gerados; tela Falar (repetir, dizer, conversa simulada) com autoavaliação; prompt pack-v4 com `roleplay`; recomendações desatualizadas corrigidas (272 → 294). Geração real com pack-v4 conferida: válida na 1ª tentativa, US$ 0,52, ensinou 守门员/传球/进球 | pedido: "o que falta para eu realmente aprender" — diagnóstico achou o bug do futebol e a falta de fala |

---

## 5. O que falta

Em ordem de valor para um intensivo. Cada item tem contexto suficiente para começar sem reler nada.

### 5.1 O agendador ignora o que você revisa dentro do Anki (o de verdade)
O painel já consegue **ler** quantas revisões você fez (`ankiConnect.reviewStats`), mas o agendador
não usa esse dado. Então um cartão revisado no Anki continua aparecendo como devido aqui.
**Caminho:** mapear nota do Anki → `ref` do agendador (provavelmente pela frente do cartão) e, ao ler
o histórico, empurrar o `due` dos itens correspondentes. Cuidado: não inventar `reps`/`ease` a
partir de dados que o add-on não dá.

### 5.1b Baralho: próximos passos naturais
`src/core/baralho.js` cobre o essencial do Anki. O que falta, em ordem de valor: otimizar os pesos do
FSRS com o histórico (`state.deck.registro` já guarda nota, data, S e D de cada resposta — precisa de
centenas de revisões antes); *fuzz* nos intervalos; tipo de cartão "completar a frase" usando o
exemplo; mapa de calor de dias estudados. Cuidado: nada disso pode virar evidência de proficiência.

### 5.2 Currículo gramatical acaba em 50 pontos
Cobre até perto de HSK 3. Para um intensivo longo, faltam estruturas de HSK 4+. Acrescentar em
`content/grammar.js` mantendo a ordem de dificuldade (a fila é a ordem do array).

### 5.3 Léxico base ainda é pequeno
154 entradas escritas à mão + o que os pacotes acrescentam. Para mineração de texto real, o ideal
seria importar CC-DICT/CC-CEDICT (~120 mil entradas) para IndexedDB e consultar de lá.
**Por que não foi feito:** sem rede no ambiente de desenvolvimento para baixar o dicionário.
`content/lexicon.js` já tem registro em tempo de execução (`registerEntries`), então o caminho está
aberto: basta uma função que carregue o dicionário e registre em lote.

### 5.4 Backend `api` (SDK oficial) nunca executado
`tools/backends/api.js` segue a documentação mas nunca rodou. Antes de confiar: `npm install
@anthropic-ai/sdk`, rodar com `--dry-run`, depois de verdade. O caminho do navegador
(`llmBrowser.js`) é o que foi testado de fato.

### 5.5 Fala: próximos passos
Gravar e comparar com o TTS existe (tela Falar), com autoavaliação. O que falta, em ordem de valor:
- **Transcrição como espelho**: `webkitSpeechRecognition` com `lang='zh-CN'` mostrando "o que o
  reconhecedor entendeu" depois de falar. Útil como pista de tom, nunca como nota (dá falso positivo
  e negativo demais). No iPhone só funciona no Safari com Siri ligada, e talvez não no app instalado
  na tela inicial: testar no aparelho antes de confiar.
- **Conversa ao vivo** com modelo respondendo: exige chave da API no aparelho (o usuário escolheu não
  pagar) ou um servidor acessível de fora. O roteiro do pacote cobre o essencial sem isso.
- Frases do modo Falar ainda não alimentam o agendador (`schedule.js`): só a fila da própria tela.

### 5.6 Mesclagem não tem desfazer
Resolve conflito por regra fixa e relata o que fez, mas não guarda versão anterior. Exportar antes é
a recomendação atual. Um "desfazer última mesclagem" seria barato (guardar o estado anterior em
IndexedDB sob outra chave).

### 5.7 Relatórios semanais automáticos (Fase 2 da especificação)
O histórico mostra tudo, mas ninguém resume. Um resumo semanal ("você consolidou 23 itens, 4 viraram
problemáticos, o tema futebol caiu de 60% para 30% de erro") seria útil e usaria só dados que já
existem.

### 5.8 Detecção de duplicata contra o Anki de verdade
Hoje a duplicata é detectada contra os cartões **deste app**. `ankiConnect.findDuplicates` existe,
mas não está ligado ao fluxo de aprovação.

### 5.9 Testes de interface usam um DOM próprio
`tests/helpers/dom-shim.js` é um DOM mínimo escrito à mão, não um navegador. Pega erro de render e de
fluxo, não pega problema de CSS, foco, rolagem ou toque. Validação visual real ainda é manual.

### 5.10 Caixa postal ainda não rodou contra o GitHub de verdade
`tests/caixaPostal.test.js` cobre a lógica com um GitHub falso (regras de sha, 404, rede caindo) e
o lado do PC com repositório git real local. A API de conteúdo do GitHub, o CORS no Safari do iPhone
e o token fine-grained só serão confirmados na primeira configuração real. Se algo divergir, o
ponto de mexer é `clienteGitHub` em `src/core/caixaPostal.js`.

---

## 6. Armadilhas que já custaram tempo

Registradas para ninguém cair de novo.

1. **Havia um `.git` solto em `/home/lucas`** — um `git init` acidental, nunca usado (zero commits,
   zero arquivos rastreados, sem remote). O perigo era real: `git add -A` a partir da pasta do
   projeto resolveria para aquele repositório e comitaria a pasta pessoal inteira (`.ssh`, `.aws`,
   `.gnupg`, histórico do bash) — e o destino era o GitHub. Hoje o projeto tem repositório próprio.
   **Sempre confira `git rev-parse --show-toplevel` antes do primeiro `git add` em um projeto novo.**
2. **Node 18 nesta máquina dá segfault** em `buildDemoState()` seguido de `import()` dinâmico no mesmo
   one-liner. Os caminhos reais (imports estáticos) não têm problema; é quirk de script improvisado.
   Se acontecer, mover o código para um arquivo com imports no topo (`scripts/semear-demo.mjs`).
3. **`maxEntryLen()` é função, não constante.** O léxico cresce em tempo de execução; quem importar
   um valor fixo vai segmentar errado as palavras novas.
4. **`resetRegistry()` nos testes.** Qualquer teste que registre vocabulário precisa de
   `t.after(resetRegistry)`, senão contamina os seguintes (o registro é módulo-global).
5. **`speakButton` usa o helper `h()`.** Montar elemento à mão com `textContent` quebrou o DOM dos
   testes e, de quebra, saiu do padrão da base.
6. **`autoPlay` precisa de chave por item.** Sem `autoKey`, o áudio toca de novo a cada redesenho.
7. **`trim()` em TSV come a coluna vazia final.** Teste de exportação deve comparar por coluna, não
   pelo fim da linha.
8. **`DATA_DIR` reabriu um furo de segurança:** com os dados em outro lugar, a pasta `data/` do
   projeto voltou a ser servida como estática, incluindo a chave da rede local. Hoje há lista de
   diretórios privados e teste cobrindo.
9. **Rede de celular cai.** Toda chamada de rede precisa devolver `{ok:false, error}` em vez de
   lançar exceção: já quebrou no `mediaStore`.
10. **Service worker não registra em HTTP simples.** Por isso o modo offline exige HTTPS (Pages).
11. **Os primeiros runs do Pages falham em `configure-pages`** se o push vier antes de ligar o Pages
    (e repositório privado em conta gratuita não tem Pages). Depois de ligar: aba **Actions** do
    repositório (não Settings → Actions) → workflow → *Run workflow*.
12. **Onboarding obrigatório escondia as Configurações.** O roteador mandava toda tela de volta ao
    onboarding; no celular novo não dava para colar chave nem restaurar backup. Hoje `settings` é
    exceção em `render()` (`src/app.js`).
13. **O PC e o celular estão em fusos diferentes** (America/Sao_Paulo × China, 11h). Qualquer lógica
    de "hoje" que rode no PC para o celular usa o relógio errado — ver §3.19.
14. **Atualização no celular leva duas aberturas.** O service worker serve do cache e baixa em
    segundo plano: a versão nova só aparece ao fechar e abrir de novo.
15. **`h()` ignora atributo com valor `false`.** Para `spellcheck="false"` passe a string `'false'`.
16. **"Repositório inválido" no iPhone:** o campo parecia preenchido (era só a dica em cinza), o
    teclado troca hífen por traço tipográfico, e o token pode ser colado no campo errado. Hoje o campo
    vem preenchido a partir do endereço do Pages, `normalizarRepo` tolera o teclado e o token no
    lugar errado é explicado. Valores são lidos do campo no toque, não do evento `input`.
17. **`knownWords` era o dicionário, não o aluno.** Ninguém percebeu por duas rodadas porque os
    pacotes saíam válidos e bonitos; só comparar o vocabulário ensinado com o léxico mostrou que o
    futebol nunca entrava. Ao mexer no briefing, olhe o que o modelo **deixou de** ensinar.
18. **Elemento passado como `extras` some quando o widget retorna cedo.** `gravadorDeComparacao`
    devolvia só o aviso quando o navegador não grava, e o botão "Ver resposta" ia junto. Quem recebe
    filhos de fora precisa anexá-los em todos os caminhos.
19. **`pkill -f "server.mjs"` mata o próprio shell** que roda o comando (o padrão aparece na linha
    de comando do bash). Para parar o servidor de teste, use o PID (`pgrep -af`, `kill <pid>`).
20. **`npm run generate --state=... --out=...` ainda grava o briefing em `data/outbox/`** do projeto.
    Ao testar com dados temporários, apague a cópia depois.

---

## 7. Convenções do código

- **Português** em nomes de função nova, comentários, interface e mensagens de erro. O código mais
  antigo (núcleo da Fase 1) tem nomes em inglês; não vale reescrever só por consistência.
- **Comentário explica o porquê**, não o quê. Decisão de projeto merece comentário; laço não.
- **Lógica pura em `src/core`** (sem DOM), interface em `src/ui`. O que entra no núcleo precisa de
  teste em `node --test`.
- **Testes descrevem comportamento em português** ("fechar o app no meio do exercício não perde as
  respostas"), e testam a regra, não a implementação.
- **Toda estimativa carrega a explicação em texto.** Se um número aparecer na tela sem poder
  justificar-se, está errado por construção.

---

## 8. Como manter este documento (leia antes de encerrar qualquer trabalho)

Este arquivo só serve se estiver correto. A regra é simples: **conhecimento que ficou só na
conversa está perdido.** Antes de encerrar uma tarefa relevante, passe por esta lista.

### Gatilhos: quando atualizar

| O que aconteceu | O que atualizar |
|---|---|
| Entreguei uma funcionalidade | linha nova em **§4**; remover/encolher o item correspondente em **§5**; marcar na tabela de situação do `README.md` |
| Tomei uma decisão de projeto (escolhi X em vez de Y) | item novo em **§3**, com o motivo **e** o que quebra se alguém mudar sem pensar |
| Perdi tempo com algo não óbvio (bug de ambiente, pegadinha de API, teste frágil) | item novo em **§6** — é a seção que mais economiza tempo futuro |
| Criei ou movi arquivo no núcleo | **§2** (mapa dos arquivos) |
| Descobri um limite honesto novo (algo que o sistema não consegue fazer bem) | **§5** se é para fazer, *Limitações conhecidas* do `README.md` se é para conviver |
| Mudei número visível (testes, léxico, gramática, tamanho) | cabeçalho (**data e contagem de testes**), **§1** e onde mais aparecer |
| Mudei como se roda, publica ou configura | **§1** e `README.md` |

### Como manter os números certos

Não escreva de memória. Estes comandos regeneram tudo que o documento afirma:

```bash
npm test 2>&1 | grep -E '^# (tests|pass|fail)'        # contagem de testes
ls tests/*.js | wc -l                                  # arquivos de teste
node -e "Promise.all([import('./src/core/content/lexicon.js'),import('./src/core/content/questions.js'),import('./src/core/content/grammar.js')]).then(([l,q,g])=>console.log('léxico',l.LEXICON.length,'| questões',q.QUESTIONS.length,'| gramática',g.GRAMMAR_SYLLABUS.length))"
node -e "import('./src/core/prompts/pack.js').then(m=>console.log(m.PROMPT_VERSION))"   # versão do prompt
npm run publicar | head -1                             # tamanho da publicação
cat src/core/*.js src/core/*/*.js | wc -l              # linhas do núcleo
```

### Regras de escrita deste documento

- **§3 é o coração.** Uma decisão sem motivo registrado será desfeita por alguém que não sabia o
  motivo. Sempre escreva *por quê* e *o que quebra*.
- **§5 é fila, não desejo.** Cada item precisa de contexto suficiente para alguém começar sem
  reler nada: onde mexer, o que já existe, qual o cuidado.
- **§6 é a seção mais valiosa.** Se algo custou mais de dez minutos para descobrir, vai para lá.
- **Não inflar.** Item concluído sai de §5; história vira uma linha em §4, não um parágrafo.
- **Honestidade acima de completude.** Se algo foi escrito mas nunca executado (como o backend
  `api`), o documento diz isso com essas palavras.

### Checklist de encerramento

```
[ ] npm test passando, com a contagem atualizada no cabeçalho e na §1
[ ] §4 tem a linha da entrega
[ ] §5 não lista mais o que acabou de ser feito
[ ] §6 tem o que custou tempo nesta rodada
[ ] README.md atualizado se mudou uso, limite ou situação
[ ] data/ e chaves continuam fora do git (git status --ignored)
```
