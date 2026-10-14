# Mandarin Quest

Sistema pessoal para estudar mandarim de forma adaptativa, acompanhar o progresso e transformar
material real (textos, diálogos, expressões ouvidas no futebol) em flashcards para o Anki.

Esta é a **Fase 1 (MVP)** da especificação em [`CLAUDE.md`](CLAUDE.md).

## Como rodar

Sem dependências e sem build. Há dois modos:

```bash
npm start                   # modo servidor (recomendado): http://127.0.0.1:8000
HOST=0.0.0.0 npm start      # idem, acessível pelo celular na mesma Wi-Fi (com chave)
PORT=9000 npm start         # outra porta
DATA_DIR=~/mandarim npm start  # guardar os dados em outro lugar
npm run serve:static        # modo local, só arquivos estáticos
```

Abra <http://127.0.0.1:8000>. No primeiro acesso o sistema pede o onboarding e o nivelamento.

| | Modo servidor (`npm start`) | Modo aparelho (celular / app publicado) |
|---|---|---|
| Onde o estado mora | `data/state.json`, em disco | IndexedDB do aparelho |
| Teto de tamanho | o do disco | cota do navegador (centenas de MB) |
| Backup | arquivo versionável + instantâneo diário | export manual em JSON |
| Geração do pacote | `claude -p` ou Claude API, agendada às 5h | Claude API com a chave do aparelho, sob demanda |
| Áudio gravado | `data/media/` | IndexedDB (vai no mesmo banco) |
| Envio direto ao Anki | sim (AnkiConnect) | não: exporta arquivo |

O servidor escuta apenas em `127.0.0.1` e não expõe nada na rede (veja abaixo para liberar o celular).

### Testes

```bash
npm test     # node --test tests/   (Node 18+)
```

272 testes cobrem XP, persistência, nivelamento, estimativa de habilidades, geração de cartões,
exportação para o Anki, exercícios, recomendações, o pipeline de LLM (validação do pacote, briefing,
ingestão, gerador por linha de comando), a repetição espaçada (intervalos, recaídas, leeches, fila de
revisão), o currículo gramatical, a sessão persistida (inclusive o ciclo de salvar e recarregar no
meio do exercício), o áudio (voz, escuta, ditado, gravação, envio de mídia ao Anki), a reavaliação
periódica, o servidor (persistência após `SIGKILL`, backups, chave da rede local, mídia, travessia de
caminho, manifesto do celular), a chamada direta à Claude API pelo navegador (cabeçalhos, streaming,
erros por situação, custo), a caixa postal celular ↔ computador pelo GitHub, o baralho interno (FSRS, fila do dia, irmãos, desfazer, XP sem proficiência), a mesclagem de aparelhos, a pasta de publicação e a renderização de
todas as telas.

## O que está implementado (Fase 1)

| Área | Situação |
|---|---|
| Onboarding (perfil, objetivos, questionário — Etapa A) | ✅ |
| Nivelamento com vocabulário (B), leitura/gramática (C) e produção escrita (E) | ✅ |
| Dificuldade adaptativa (2 acertos sobem, 2 erros descem), pausa e retomada | ✅ |
| Relatório diagnóstico: nível, habilidades, pontos fortes, dificuldades, limitações | ✅ |
| Plano da primeira semana derivado do resultado, com justificativa por item | ✅ |
| Dashboard: XP, marcos, sequência, meta diária, habilidades, recomendações, conquistas | ✅ |
| Exercícios: reconhecimento, recuperação ativa, leitura/gramática, produção escrita | ✅ |
| Registro manual de sessões e de conversas reais | ✅ |
| Gerador de flashcards a partir de texto, lista, diálogo ou transcrição colada | ✅ |
| Revisão, edição, aprovação e rejeição de cartões | ✅ |
| Exportação TSV/CSV compatível com o Anki | ✅ |
| Envio direto por AnkiConnect (opcional, local) | ✅ |
| Histórico, relatórios e comparação entre avaliações | ✅ |
| Configurações (objetivos, metas, regras de XP, integração, privacidade) | ✅ |
| Dados de demonstração claramente marcados como fictícios | ✅ |
| Servidor local com estado em arquivo | ✅ |
| Pacote diário de conteúdo gerado por LLM (vocabulário, diálogo, exercícios, frases de campo) | ✅ |
| Currículo gramatical de 50 pontos em ordem, uma estrutura nova por dia | ✅ |
| Repetição espaçada própria (SM-2 simplificado) alimentada pelos exercícios | ✅ |
| Exercício de revisão do que está devido, sem depender de modelo | ✅ |
| Progresso que sobrevive a fechar o app no meio de um exercício | ✅ |
| Escuta por síntese de voz do navegador (áudio → significado, ditado) | ✅ |
| Gravação de áudio real (colegas) anexada ao cartão e enviada ao Anki | ✅ |
| Atalhos de teclado nos exercícios | ✅ |
| Reavaliação periódica com itens novos de dificuldade equivalente | ✅ |
| Leitura do histórico de revisões do Anki (quando o add-on expõe) | ✅ |
| Importar/restaurar dados de um arquivo JSON | ✅ |
| Aprovação de cartões em massa | ✅ |
| Uso no celular pela rede local, com chave de acesso | ✅ |
| Celular autônomo: app publicado, offline, dados no aparelho (IndexedDB) | ✅ |
| Geração do pacote pelo próprio celular, com chave da Claude API no aparelho | ✅ |
| Pacote gerado pelo plano do Claude no computador e entregue ao celular via repositório privado | ✅ |
| Baralho interno estilo Anki (FSRS, 4 notas, passos, navegador, estatísticas), sem precisar do Anki | ✅ |
| Service worker para funcionar em modo avião | ✅ |
| Mesclagem de dois aparelhos sem perder histórico | ✅ |
| Léxico que cresce a cada pacote (segmentação e pinyin melhoram sozinhos) | ✅ |
| Agendamento diário por systemd (script de instalação) | ✅ |

### O que **não** está implementado (e por quê)

- **Reconhecimento de fala / avaliação de pronúncia (Etapa F)**: 口语 continua **não avaliada**. Dá
  para gravar sua voz e comparar com o áudio, mas o sistema não atribui nota de pronúncia — não há
  como fazer isso com confiança aqui.
- **Fala natural de nativo sob demanda**: a escuta no app usa a voz sintetizada do navegador. Áudio
  real só existe para o que você gravar.
- **Tradução automática por LLM**: não há serviço externo nem chave de API configurada. A tradução
  sugerida para frases é uma **glosa palavra-a-palavra** montada do léxico local, sempre marcada
  para revisão. Palavras do léxico têm tradução e pinyin confiáveis.
- **Importação de PDF/documentos/áudio**: só entrada por texto colado.
- Fase 2 (duplicatas via Anki, relatórios semanais automáticos) e Fase 3 (áudio, conversa simulada)
  não foram implementadas.

## Baralho: um pequeno Anki dentro do app

Para quem não quer (ou não pode, como no iPhone sem pagar o AnkiMobile) depender do Anki. Aba
**Baralho**.

- **Algoritmo FSRS-4.5**, o mesmo que o Anki usa hoje, com os pesos padrão e retenção desejada
  ajustável (90% por padrão).
- **Cartões vêm do que você aprova** em *Criar cartões* (inclusive o vocabulário do pacote do dia) ou
  do botão *Adicionar cartão*. Cada palavra vira até três cartões: **reconhecer** (汉字 → português),
  **produzir** (português → 汉字) e, se ligado, **ouvir** (áudio → significado). Os irmãos nunca
  aparecem no mesmo dia.
- **Estudo como no Anki:** passos de 1 e 10 min para cartões novos, os quatro botões (Errei, Difícil,
  Bom, Fácil) mostrando o próximo intervalo, limite de novos e de revisões por dia, desfazer. No
  computador: Espaço mostra a resposta (e depois vale "Bom"), 1–4 dão a nota, Z desfaz. O áudio toca
  ao mostrar a resposta.
- **Navegador:** buscar, filtrar (novos, em revisão, suspensos, problemáticos), editar, suspender,
  esquecer, excluir. Cartão errado 8 vezes é marcado como problemático, com a sugestão de reescrevê-lo.
- **Estatísticas:** respondidos e acertos de hoje, retenção dos últimos 30 dias (só cartões já
  formados), cartões novos/jovens/maduros e previsão de revisões para 7 dias.

Revisar rende XP (uma sessão por dia, a partir de 10 respostas) mas **não** mexe na proficiência: a
nota é você quem dá. Se a palavra já está na revisão do pacote do dia, a resposta conta lá também. A
exportação para o Anki de verdade continua disponível para quem quiser os dois.

## Geração diária de conteúdo por LLM

O gargalo da Fase 1 era o conteúdo: 154 palavras escritas à mão e 26 questões fixas. O pipeline
abaixo resolve isso gerando **um pacote por dia** a partir do seu desempenho real.

```
data/state.json ──▶ tools/briefing.js ──▶ prompt ──▶ modelo ──▶ validação ──▶ data/packs/AAAA-MM-DD.json
   (seu estado)      (o que é enviado)                           (schema)        (o pacote do dia)
                            │                                                           │
                            ▼                                                           ▼
                     data/outbox/ (auditoria)                        app ingere: léxico + exercícios + cartões
```

### Rodando

```bash
npm run generate:dry     # mostra o prompt exato e NÃO chama modelo nenhum
npm run generate         # gera o pacote de hoje (backend padrão: Claude Code headless)
npm run generate:mock    # pacote de exemplo, sem modelo, para testar a interface
node tools/generate.js --date=2026-10-20 --force --no-gaps
```

Todo dia às 5h, automaticamente:

```bash
npm run timer:install    # instala um timer do systemd (modo usuário, sem sudo)
npm run timer:remove     # desinstala
systemctl --user list-timers mandarin-quest-pacote.timer
journalctl --user -u mandarin-quest-pacote.service -n 50
```

### Backends

| Backend | Como autentica | Situação |
|---|---|---|
| `claude-code` (padrão) | usa o Claude Code já instalado e logado (`claude -p`), sem chave de API | **testado**: foi com ele que os pacotes deste repositório foram gerados |
| `api` | SDK oficial `@anthropic-ai/sdk` + `ANTHROPIC_API_KEY` (ou `ant auth login`); modelo padrão `claude-opus-5-5` | **não testado nesta instalação** — o ambiente onde foi escrito não tinha acesso ao npm nem credencial. Rode com `--dry-run` primeiro e exige `npm install @anthropic-ai/sdk` |
| `mock` | nada | sempre funciona, devolve um pacote fixo |

Custo observado no backend `claude-code`: **US$ 0,40 a 0,90 por pacote**, debitado do uso da sua
assinatura. Uma geração leva 1 a 3 minutos — é por isso que ela roda de madrugada, não quando você
abre o app. No backend `api`, o preço depende do modelo escolhido (`claude-opus-5-5` custa
US$ 4/US$ 20 por milhão de tokens de entrada/saída; `claude-sonnet-5-5` e `claude-haiku-5-5` são mais
baratos — a escolha é sua, em Configurações).

### As duas metades do pacote: entrada nova + reencontro

O pacote é desenhado para resolver duas exigências ao mesmo tempo: **ver coisa nova todo dia** (em
especial estrutura gramatical) e **nunca perder de vista o que já foi visto**.

**A) Entrada nova.** Todo dia entra *uma* estrutura gramatical nova, tirada do currículo em
`src/core/content/grammar.js` — 50 pontos em ordem de dificuldade, de `是 (A é B)` a `把`, `被`,
`是…的`. O briefing informa o que já foi apresentado e qual é o próximo da fila; o gerador ensina
esse, e só esse. Se o próximo for trivial para o seu nível, o prompt manda tratá-lo em duas linhas e
ensinar o seguinte — foi o que aconteceu no pacote de exemplo: ele passou por 是 em dois exercícios e
explicou 的. Mais 10 a 14 palavras novas, que não estejam em `knownWords` nem nos pacotes recentes.

**B) Reencontro.** O agendador (`src/core/schedule.js`) decide o que precisa voltar. Até 8 palavras
devidas são reapresentadas **em frases de exemplo diferentes** das que você já viu, marcadas com
`"status": "revisao"`; as estruturas antigas devidas reaparecem dentro do diálogo e em pelo menos 2
exercícios, sem reexplicar a regra; e todo exercício declara em `targets` o que está treinando, que é
como o agendador sabe o que foi revisado.

Medido no pacote real deste repositório: 12 palavras novas + 8 de revisão (8/8 vindas da fila do
agendador), 12 de 12 exercícios com `targets`, 9 deles mirando itens devidos, 6 na estrutura nova.

### Repetição espaçada

Algoritmo em `src/core/schedule.js`, SM-2 simplificado e documentado linha a linha:

| Evento | Efeito |
|---|---|
| item apresentado | fica devido no dia seguinte (nunca no mesmo dia) |
| acerto | 1º e 2º acertos usam passos fixos de 1 e 3 dias; depois `intervalo × facilidade` |
| erro | intervalo volta a 1 dia, facilidade cai 0,20, conta uma recaída |
| 4 recaídas | item marcado como problemático: o pacote muda o ângulo em vez de repetir o cartão |
| intervalo ≥ 21 dias | item considerado consolidado |

A progressão real de um item acertado sempre: 1 → 3 → 8 → 22 → 58 dias. O painel mostra quantos itens
estão devidos, consolidados e problemáticos, e **"Revisar N itens agora"** monta o exercício na hora —
atrasados vêm como recuperação ativa (português → chinês), os demais como reconhecimento. Esse laço
funciona sem pacote novo e sem modelo nenhum.

Nada disso é proficiência: o agendador decide *quando* um item volta; a pontuação por habilidade
continua saindo só das suas respostas (`src/core/skills.js`).

### Pular a fila do que você já sabe

Em **Pacote do dia → Currículo gramatical** há a lista dos 50 pontos. Marcar "já domino" faz a fila
pular para o próximo ponto não dominado, e o item marcado entra na revisão espaçada com intervalo de
7 dias em vez de 1 — você não gasta dias reaprendendo 吗, mas a estrutura ainda reaparece de vez em
quando.

### O que o pacote contém

Vocabulário com pinyin, tradução e frase de exemplo; um diálogo de 6 a 12 falas; 6 a 10 exercícios
(múltipla escolha, completar frase e produção escrita); pares de tom que você provavelmente confunde;
frases de campo de futebol com o momento de usar cada uma; uma nota de gramática; e observações do
gerador sobre seus erros recentes.

Exemplo real, do pacote gerado a partir do estado de demonstração — o modelo pegou a lacuna anotada
depois de um jogo ("não consegui responder com que frequência eu jogo") e montou o dia em volta dela:

> *Foco:* "Na última conversa depois do futebol você não conseguiu dizer com que frequência joga. Por
> isso hoje o foco é a estrutura de frequência (tempo + verbo + número + 次). Também voltam palavras
> de futebol que você errou recentemente (比赛, 红牌, 中场, 裁判) e as expressões 走吧 e 我来, agora em
> situações diferentes."

### O que o pacote NÃO pode fazer

O validador em `src/core/packValidation.js` roda duas vezes — no gerador e de novo no app, porque o
arquivo pode ser editado à mão — e **rejeita o pacote inteiro** se o modelo:

- mandar qualquer campo de proficiência (`skills`, `score`, `xp`, `proficiency`…). Conteúdo gerado
  nunca mexe na sua pontuação: ela continua vindo só das suas respostas;
- gerar exercício de escuta ou fala (`listening`/`speaking`), porque o app não tem áudio nem microfone;
- devolver pinyin ou tradução vazios, campo chinês sem caracteres chineses, alternativas repetidas,
  resposta fora da faixa, ou exercício de produção sem critérios de correção.

Quando a validação falha, o gerador devolve os erros ao modelo e pede correção (uma tentativa por
padrão, `--retries=N`). Se ainda falhar, nada é salvo e a resposta vai para
`data/packs/<data>.rejeitado.txt` para você olhar.

Os cartões gerados nascem **pendentes**, marcados "tradução e pinyin gerados por modelo de linguagem:
confirme antes de aprovar". Nada vai para o Anki sem a sua aprovação.

### O léxico cresce

O vocabulário de cada pacote é registrado no léxico em tempo de execução
(`src/core/content/lexicon.js`) e persistido em `state.lexiconExtra`. Efeito prático: a segmentação,
o pinyin automático e a detecção de duplicatas do gerador de cartões melhoram todo dia. Depois do
primeiro pacote real, o minerador já reconhecia 比赛, 休息 e outras 8 palavras que antes eram
"caractere desconhecido". A base escrita à mão nunca é sobrescrita por conteúdo gerado.

### Privacidade da integração

O que é enviado ao modelo: nível estimado, pontuações e contagem de evidências por habilidade,
objetivos, minutos por dia, itens que você errou recentemente, temas fracos, expressões novas que
você anotou, o texto do campo "o que não consegui dizer" das últimas conversas, e a lista de palavras
já conhecidas (para não repetir).

O que **não** é enviado: seu nome, o histórico completo, o conteúdo dos seus cartões, suas anotações
livres, nada de áudio.

Cada briefing é salvo em `data/outbox/<data>-briefing.json` **antes** do envio, para você conferir
exatamente o que saiu. `--no-gaps` (ou o controle em Configurações) remove até o texto das conversas,
ao custo de um pacote menos personalizado. O diretório `data/` inteiro está no `.gitignore`.

## Usar no celular

Dois arranjos, para necessidades diferentes.

### A) Celular sozinho, sem o computador ligado (recomendado)

O app é publicado como site estático com HTTPS, instalado na tela inicial do celular, e passa a
guardar **os próprios dados** no aparelho. Funciona em modo avião. É o arranjo que não depende de
nada ligado em casa.

```bash
npm run publicar          # monta a pasta publicar/ e gera o service worker
git add -A && git commit -m "app" && git push
```

No GitHub: **Settings → Pages → Source: GitHub Actions**. O workflow
`.github/workflows/pages.yml` roda os testes, monta a pasta e publica. Depois, no celular:

1. abra o endereço do Pages;
2. **Adicionar à tela de início** (o manifesto faz abrir em tela cheia, com ícone);
3. Configurações → **Gerar neste aparelho** → cole uma chave da Claude API e toque em *Guardar e
   testar*;
4. Configurações → Armazenamento → **Pedir armazenamento permanente** (faz o navegador tratar os
   dados como do aplicativo, não como cache descartável).

Pronto: nivelamento, pacote do dia, revisão espaçada, escuta, exercícios e flashcards funcionam com
o computador desligado. O que é publicado é **só o app** — seus dados nunca saem do aparelho, e a
pasta `data/` fica fora da publicação (há teste que verifica isso).

**Sobre a chave no aparelho.** É a troca que torna o celular autônomo: a chave fica no
armazenamento do navegador, e quem tiver acesso ao aparelho pode lê-la. Use uma chave dedicada a
este app, com limite de gasto definido no console da Anthropic, e revogue-a se perder o celular. A
chave **não** entra no arquivo exportado nem é sincronizada entre aparelhos — cada um tem a sua. O
app diz tudo isso na própria tela antes de você colar a chave.

Custo: cada pacote gasta alguns centavos de dólar pela Claude API com o modelo padrão
(`claude-opus-5-5`) — menos do que pela assinatura do Claude Code, porque aqui não há o prompt de
sistema dele. O valor real de cada geração aparece na procedência do pacote.

### A2) Celular sem chave de API: o computador gera pelo plano do Claude

Mesmo arranjo A (app publicado, dados no aparelho), mas o pacote do dia é gerado **no computador**,
pelo `claude -p` da sua assinatura, e chega ao celular por um **repositório privado do GitHub** que
funciona como caixa postal. Sem custo de API, e funciona fora de casa.

```
celular ──▶ pedidos/AAAA-MM-DD.json  (o briefing, o mesmo resumo que iria ao modelo)
computador (a cada 30 min) gera e valida ──▶ pacotes/AAAA-MM-DD.json ──▶ celular revalida e carrega
```

Por que não pela Wi-Fi: o app publicado é HTTPS e o servidor de casa é HTTP; o Safari bloqueia essa
mistura sem exceção. O GitHub fala HTTPS. O que vai ao GitHub é só o briefing — histórico completo,
cartões e gravações não saem do aparelho.

Uma vez só:

1. **Crie um repositório privado** no GitHub (ex.: `mandarim-dados`), marcando *Add a README*.
2. **Crie um token** em GitHub → Settings → Developer settings → Personal access tokens →
   **Fine-grained tokens** → *Generate new token*: *Repository access: Only select repositories* →
   `mandarim-dados`; *Permissions → Repository permissions → Contents: Read and write*. Copie o token.
3. **No computador:**
   ```bash
   npm run caixa -- --repo=git@github.com:SEU-USUARIO/mandarim-dados.git   # clona em data/caixa/
   npm run caixa:timer                                                     # confere a cada 30 min
   loginctl enable-linger $USER     # para o timer rodar mesmo sem você logado
   ```
4. **No celular**, dentro do app instalado: Configurações → **Receber pacotes do computador** → repositório
   `SEU-USUARIO/mandarim-dados` e o token → *Guardar e testar*. Repositório público é recusado.

Daí em diante: ao abrir o app, o celular busca pacotes novos; e sempre que seus dados mudam (fim de
exercício, nivelamento, conversa registrada) ou o app sai da tela, ele atualiza o pedido do dia seguinte,
marcado para as 4h **no fuso do celular** (o computador pode estar em outro fuso: quem manda é o
horário gravado no pedido). Se você abrir o app sem pacote do dia, ele pede na hora, e o computador
atende em até 30 min. Se a geração falhar, o aviso aparece no celular; depois de 3 falhas no mesmo
dia o computador para de tentar.

Comandos úteis: `npm run caixa` (atender agora), `npm run caixa -- --backend=mock` (testar sem gastar
o plano), `journalctl --user -u mandarin-quest-caixa.service -n 50` (log), `npm run caixa:timer:remove`.

**Limite honesto:** o computador precisa estar ligado e com internet para gerar. Desligado, o celular
continua funcionando com o que já baixou, e a revisão espaçada não depende de pacote novo.

### B) Celular como tela do computador (rede local)

Útil quando você está em casa e quer digitar menos, ou quando prefere não ter chave no celular:

```bash
HOST=0.0.0.0 npm start
```

O terminal imprime o endereço com a chave de acesso:

```
Acesso pela rede local LIGADO. Abra no celular (mesma Wi-Fi):
  http://192.168.0.12:8000/?key=aSmGV9rgE-wM9cNfwMkdoQ   (wlp1s0)
```

A chave é obrigatória fora do loopback: sem ela, qualquer requisição (inclusive a página) recebe
401. Fica em `data/lan-token.txt` (permissão 600) e é guardada em cookie no celular. Nesse arranjo
os dois aparelhos veem o **mesmo** estado, mas o computador precisa estar ligado — e gravar áudio
não funciona, porque o navegador só libera o microfone em HTTPS ou localhost (no arranjo A, com
HTTPS, a gravação funciona no celular).

### Juntando os dois aparelhos

Se você usa o computador **e** o celular no arranjo A, cada um tem seu histórico. Em Configurações →
Privacidade e dados → **Juntar dois aparelhos**: exporte o JSON de um lado e carregue no outro. A
mesclagem (`src/core/merge.js`) é feita para não perder nada:

| Dado | Regra |
|---|---|
| Eventos de XP | união pela `key` (a mesma que evita XP duplicado) |
| Evidências, resultados, sessões, conversas, avaliações | união por `id` |
| Cartões | união por `id`, depois um por frente, ficando o estado mais avançado |
| Conquistas | fica a data mais antiga |
| Agendamento | por item, fica o registro revisado mais recentemente |
| Perfil, configurações, plano | vêm do lado alterado mais recentemente (`updatedAt`) |
| Sessão em andamento | fica a mais recente |

A operação relata exatamente o que incorporou (`12 registro(s) novo(s): 3 em xpEvents, 9 em
schedule…`) antes de você confirmar. Faça nos dois sentidos para os aparelhos ficarem iguais.

### O que continua sendo coisa do computador

- **Enviar direto ao Anki** (AnkiConnect é desktop). No celular, exporte o arquivo TSV e importe no
  AnkiDroid/AnkiMobile.
- **A geração automática às 5h** (o timer do systemd). No celular a geração é sob demanda, com um
  toque — leva de 1 a 3 minutos, com progresso na tela.

## Nada se perde se você parar no meio## Nada se perde se você parar no meio

Era o ponto mais frágil do app: o exercício em andamento vivia na memória da aba.

- **Sessão de exercício persistida** (`src/core/session.js`): cada resposta vai para o estado e,
  no modo servidor, para `data/state.json`. Fechar o navegador, recarregar, derrubar o servidor ou
  dar Ctrl+C no meio e voltar retoma **no mesmo item, com as respostas e o apoio já usado**. Há aviso
  de retomada no painel e botão de descartar.
- **Sessão aberta não vira desempenho.** A correção acontece só na conclusão: abandonar pela metade
  não registra proficiência nem XP. Descartar deixa rastro zero.
- **Rascunhos de cartão persistidos**: o texto colado e as sugestões geradas ficam em
  `state.workspace` — recarregar não obriga a colar tudo de novo.
- **Escritas atômicas**: o estado (`data/state.json`) e cada pacote são gravados em arquivo
  temporário e renomeados, então uma interrupção não deixa arquivo pela metade.
- **Três camadas de backup no modo servidor**: a versão anterior em `data/state.backup.json`, um
  instantâneo por dia em `data/backups/state-AAAA-MM-DD.json`, e o download manual em JSON.
- **Restauração**: Configurações → Privacidade e dados carrega um JSON exportado ou volta para o
  backup do servidor, sempre com confirmação e com um resumo do que está sendo carregado.
- **Nivelamento** já tinha pausa e retomada; continua tendo.
- **Resgate de dados órfãos**: se um dia o app for aberto sem o servidor, ele usa o armazenamento do
  navegador — uma caixa separada. Ao subir o servidor depois, o app detecta esse estado e oferece
  importá-lo, em vez de deixar o progresso daquele dia parecer perdido.
- **Teste que prova isso**: `tests/server.test.js` sobe o servidor, grava um exercício interrompido,
  mata o processo com `SIGKILL` (sem chance de salvar na saída), sobe de novo e confere que a
  resposta dada continua lá.

Uma janela de risco que continua existindo, por honestidade: a gravação do navegador é agrupada em
meio segundo. Se o computador perder energia **no meio** desse intervalo, a última resposta pode não
ter chegado ao disco. Fechar a aba, fechar o navegador ou desligar normalmente não têm esse problema,
porque o app força a gravação ao perder o foco (`visibilitychange`, `pagehide`, `beforeunload`).

## Áudio

| Recurso | Como funciona | Limite declarado na interface |
|---|---|---|
| Ouvir vocabulário, diálogo e frases de campo | Síntese de voz do navegador (`speechSynthesis`), voz zh-CN, com botão de 0,7× | Voz sintetizada, não fala natural |
| Exercício "áudio → significado" | O app fala; o texto só aparece **depois** da resposta | Mede reconhecimento auditivo do que você já viu escrito |
| Ditado | O app fala; você escreve. Aceita caracteres, pinyin com tom e sem tom | Correção por palavra-chave, confiança baixa |
| Gravar áudio real | `MediaRecorder` → `data/media/` no servidor local → anexado ao cartão | Precisa do servidor local; sem ele, só download |
| Enviar áudio ao Anki | `storeMediaFile` antes das notas; campo `[sound:arquivo]` | Se a mídia falhar, a nota não promete áudio que não existe |

A escuta agora **gera evidência real** de 听力, e o cálculo da habilidade diz quantas evidências
vieram de voz sintetizada: *"3 de 3 evidência(s) vêm de voz sintetizada do navegador, não de fala
natural — a compreensão de falantes reais tende a ser mais difícil que este número sugere."*

Sem voz chinesa instalada, a interface diz exatamente isso e mantém 听力 como não avaliada, em vez
de simular o exercício. Em Linux pode ser necessário instalar uma voz zh-CN do sistema.

## Atalhos de teclado

Nos exercícios: **1–4** responde, **Enter** continua, **P** mostra o pinyin (registrando o apoio),
**Esc** sai guardando a sessão. Em campos de texto, **Ctrl+Enter** envia. Um único ouvinte global
despacha para a tela ativa, então não há acúmulo de listeners a cada redesenho.

## Reavaliação periódica

Disponível uma semana depois da última medição (`src/core/assessment.js`). Dez itens misturando
vocabulário (recuperação ativa), leitura/gramática do banco, produção escrita com uma estrutura já
ensinada e, se houver voz, escuta. Duas regras que fazem a comparação valer:

1. **Nunca repete os itens das duas reavaliações anteriores** — acertar a mesma questão de novo mede
   familiaridade, não proficiência.
2. **Só cobra o que o app apresentou** (itens que passaram pelo agendador).

Cada reavaliação guarda um retrato das seis habilidades, e o histórico mostra nivelamentos e
reavaliações na mesma linha do tempo.

## Histórico de revisões do Anki

O painel tem **"Ler do Anki agora"**: consulta `getNumCardsReviewedToday` / `getNumCardsReviewedByDay`
e guarda o resultado com a data da leitura. Se o add-on instalado não tiver essas ações, aparece
*"indisponível: esta versão do AnkiConnect não expõe o histórico de revisões"* — nunca um número
inventado. O agendador deste app continua sem ver o que você revisa dentro do Anki.

## Princípios que o código respeita

- **XP ≠ proficiência.** XP vem de atividade registrada; a pontuação por habilidade vem só de
  desempenho medido (`skillEvidence`). Registrar 50 revisões não muda nenhuma habilidade —
  há teste para isso.
- **Nada é inventado.** Habilidade sem evidência aparece como *não avaliada*; com poucas
  evidências, como *dados insuficientes*. O nível geral só menciona HSK aproximado se houver
  pelo menos 3 itens respondidos na faixa de dificuldade correspondente.
- **Toda pontuação é explicável.** Cada estimativa traz a fórmula aplicada ("precisão ponderada
  80% em 7 itens, dificuldade média 1,8, fator 0,76 → 61/100") e cada recomendação traz a
  evidência que a gerou.
- **Apoio contabilizado.** Revelar o pinyin antes de responder é registrado e reduz o peso do
  acerto (fator 0,7).
- **Nenhum cartão sai sem revisão.** Sugestões nascem pendentes; nada vai ao Anki sem aprovação.
- **Falha não é sucesso.** Um envio ao AnkiConnect que falhou é registrado como erro, com o
  estágio onde falhou, e o cartão continua "aprovado", não "exportado".

## Estrutura

```
index.html            página única
styles.css            folha de estilo (tema claro/escuro automático)
server.mjs            servidor local: estado em arquivo, pacotes, mídia, geração, acesso pelo celular
manifest.webmanifest  instalação na tela inicial do celular
icone.svg             ícone do app
scripts/              instalador do timer diário (systemd, modo usuário)
tools/                gerador do pacote do dia (linha de comando)
  generate.js         orquestra: briefing → modelo → validação → data/packs/
  backends/           claude-code (padrão), api (SDK oficial), mock
scripts/              timer diário, semear demonstração, montar publicação
.github/workflows/    publicação automática no GitHub Pages
manifest.webmanifest  instalação na tela inicial do celular
data/                 seus dados: state.json, packs/, outbox/  (fora do git)
src/app.js            bootstrap, roteador por hash, contexto da UI
src/core/             lógica pura, sem DOM — é o que os testes exercitam
  storage.js          estado único em JSON, migração, localStorage ou memória
  xp.js               regras de XP idempotentes, meta diária, sequência, marcos
  skills.js           estimativa por habilidade a partir de evidências
  placement.js        motor do nivelamento, correção e relatório
  plan.js             conversão do resultado em plano inicial
  exercises.js        geração e correção de exercícios
  flashcards.js       segmentação, pinyin, glosa, duplicatas, rascunhos
  ankiExport.js       TSV/CSV e histórico de exportações
  ankiConnect.js      cliente do add-on AnkiConnect
  activities.js       sessões e conversas reais
  achievements.js     conquistas comprováveis
  recommendations.js  recomendações explicáveis
  demoData.js         dados fictícios de demonstração
  schedule.js         repetição espaçada: quando cada item volta, leeches, estatísticas
  session.js          sessão de exercício persistida (sobrevive a fechar o app)
  idbStore.js         armazenamento no aparelho (IndexedDB) e cota
  mediaStore.js       áudios: arquivo no servidor ou IndexedDB no celular
  merge.js            mesclagem de dois aparelhos
  llmBrowser.js       Claude API direto do navegador (streaming), para o celular
  secrets.js          chave da API, guardada por aparelho e fora do estado
  packPipeline.js     orquestração da geração, igual no computador e no celular
  briefing.js         o que é enviado ao modelo
  prompts/pack.js     prompt de sistema versionado
  assessment.js       reavaliação periódica com itens novos
  content/grammar.js  currículo de 50 estruturas em ordem de progressão
  packValidation.js   schema do pacote gerado (usado pelo gerador E pelo app)
  packs.js            ingestão do pacote: léxico, exercícios, rascunhos de cartão
  serverStore.js      persistência em arquivo via /api, com queda para localStorage
  content/
    lexicon.js        154 entradas (base HSK1/2, cotidiano, futebol)
    questions.js      26 itens do banco de nivelamento
src/ui/               telas (dashboard, onboarding, placement, study, cards, pack, …)
  audio.js            síntese de voz em zh-CN, com diagnóstico do que falta
  recorder.js         gravação de áudio real e envio ao servidor local
tests/                node:test + um DOM mínimo em tests/helpers/dom-shim.js
```

### Modelo de dados

Um único objeto JSON em `localStorage` sob a chave `mandarin-quest:state`:

| Campo | Conteúdo |
|---|---|
| `profile` | nome, objetivos e prioridades, minutos/dia, questionário, flags de onboarding |
| `settings` | idioma, pinyin padrão, meta de XP, regras de XP, configuração do Anki |
| `plan` | plano atual derivado do último nivelamento |
| `placementAttempts` / `placementInProgress` | tentativas concluídas e a em andamento (pausa/retomada) |
| `skillEvidence` | evidências brutas: habilidade, nota, dificuldade, apoio usado, origem, data |
| `exerciseResults` | resultados de exercícios item por item |
| `xpEvents` | eventos de XP com `key` única (impede duplicação por recarregar) |
| `sessions`, `conversations` | prática registrada manualmente |
| `cardDrafts`, `cardExports` | cartões sugeridos/aprovados/exportados e histórico de exportações |
| `achievements`, `dismissedRecommendations` | gamificação e recomendações ignoradas |
| `packs` | últimos 30 pacotes diários ingeridos, com procedência |
| `lexiconExtra` | vocabulário vindo dos pacotes, re-registrado no léxico a cada carregamento |
| `schedule.items` | um registro por palavra/estrutura: intervalo, facilidade, recaídas, data de volta |
| `activeSession` | exercício em andamento: respostas, apoio usado e posição |
| `workspace` | texto colado e sugestões de cartão ainda não salvas |
| `assessments` | reavaliações, com os itens usados e o retrato das habilidades |
| `ankiStats` | último retrato lido do Anki, com a data da leitura |
| `updatedAt` | quando este aparelho alterou o estado (usado pela mesclagem) |

Em Configurações há "Baixar meus dados (JSON)" e "Apagar tudo".

## Usando com o Anki

### Exportação de arquivo (sempre funciona)

Em **Criar cartões → Exportar**, baixe o TSV (ou CSV). No Anki: *Arquivo → Importar*, separador
tabulação, marque "primeira linha é cabeçalho" e mapeie as colunas
(`Frente, Verso, Pinyin, Exemplo, TraducaoExemplo, Contexto, Dificuldade, Tags`) para os campos do
seu modelo de nota.

### AnkiConnect (opcional, só local)

1. Instale o add-on [AnkiConnect](https://github.com/amikey/anki-connect) no Anki Desktop
   (código `2055492159`) e reinicie o Anki.
2. Em *Ferramentas → Add-ons → AnkiConnect → Config*, adicione a origem deste app em
   `webCorsOriginList`, por exemplo:

   ```json
   { "webCorsOriginList": ["http://localhost", "http://localhost:8000"] }
   ```

3. Com o Anki aberto, use **Testar conexão** na aba Exportar. O app verifica versão, baralho,
   modelo e campos antes de enviar, e reporta exatamente o que o Anki respondeu —
   incluindo notas recusadas por duplicata.

## Privacidade

- Todos os dados ficam no `localStorage` deste navegador; não há servidor nem conta.
- O texto que você cola para gerar cartões é processado localmente, usando apenas `content/lexicon.js`.
  Nada é enviado para serviços externos.
- A única requisição de rede possível é ao AnkiConnect em `127.0.0.1`, e somente quando você clica
  em *Testar conexão* ou *Enviar*.
- Não há chave de API no código nem serviço de LLM configurado. Se um dia for adicionado, a chave
  deve vir de variável de ambiente/mecanismo seguro, nunca do código-fonte.

## Limitações conhecidas

- O léxico começa com 154 entradas escritas à mão e cresce com os pacotes diários. Caracteres que
  nenhum pacote cobriu ainda são segmentados um a um, ficam sem pinyin automático e são sinalizados
  na geração de cartões.
- O backend `api` (SDK oficial) nunca foi executado: foi escrito a partir da documentação, sem npm
  nem credencial disponíveis no ambiente de desenvolvimento. O backend padrão (`claude-code`) é o
  testado.
- A geração leva 1 a 3 minutos e custa de US$ 0,40 a 0,90 por pacote. O botão "Gerar agora" na
  interface não dá progresso parcial: ele espera o processo terminar.
- O agendamento só conhece itens que passaram por um exercício ou por um pacote deste app. O painel
  consegue ler quantas revisões você fez no Anki, mas o agendador não usa esse dado.
- A escuta usa voz sintetizada. É útil, mas não equivale a entender um falante real — por isso o
  número de 听力 vem com esse aviso explícito.
- A gravação de áudio real precisa de HTTPS ou localhost (exigência do navegador): funciona no
  computador e no app publicado, mas não pela rede local em HTTP simples.
- A mesclagem resolve conflitos por regra fixa (mais recente ganha nos campos que não são lista).
  Não há histórico de versões nem desfazer: exporte antes se estiver em dúvida.
- A pronúncia não recebe nota: não há avaliação automática confiável aqui.
- O currículo gramatical tem 50 pontos — cobre com folga o caminho até algo próximo de HSK 3, mas
  não além disso.
- A correção de respostas abertas é por palavras-chave, com confiança declarada como baixa.
- O banco de nivelamento é fixo (26 itens). Reavaliações reaproveitam itens — a interface avisa que
  familiaridade com a mesma questão não é o mesmo que progresso.
- O teste de interface usa um DOM mínimo próprio (`tests/helpers/dom-shim.js`), não um browser real.
