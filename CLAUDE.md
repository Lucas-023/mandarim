> **LEIA PRIMEIRO: [`ESTADO-DO-PROJETO.md`](ESTADO-DO-PROJETO.md).**
>
> A especificação abaixo é o contrato original e segue valendo como referência de intenção, mas
> **já foi implementada e ultrapassada**. O estado real do código, as decisões tomadas (com o
> motivo de cada uma), o que falta e as armadilhas conhecidas estão em `ESTADO-DO-PROJETO.md`.
> Comece por lá para não reimplementar o que existe nem repetir erro já resolvido.
>
> Resumo em uma linha: Fase 1 completa + geração diária por LLM + repetição espaçada + currículo
> gramatical + áudio + celular autônomo (GitHub Pages, IndexedDB, chave própria). 223 testes.
>
> Ao concluir um trabalho relevante neste projeto, **atualize `ESTADO-DO-PROJETO.md`** (§4 histórico,
> §5 o que falta, §6 armadilhas) em vez de deixar o conhecimento só na conversa.

---

# Mandarin Quest — Especificação do Projeto

## 1. Visão geral

**Mandarin Quest** é um sistema pessoal para estudar mandarim de forma adaptativa, acompanhar o progresso e transformar materiais reais do dia a dia em flashcards. O objetivo é ajudar o usuário a desenvolver principalmente a capacidade de se comunicar em situações reais, incluindo conversas informais com colegas chineses e vocabulário relacionado ao futebol.

O sistema deve combinar:

- **Nivelamento inicial** para estimar o nível atual do usuário.
- **Plano de estudos adaptativo**, baseado no nível, nos objetivos e nas dificuldades observadas.
- **Flashcards gerados automaticamente** a partir de textos, diálogos, transcrições e expressões.
- **Integração com o Anki**, preferencialmente por meio do AnkiConnect ou de exportação compatível.
- **Gamificação**, com XP, metas diárias, sequência de dias e conquistas.
- **Avaliação de proficiência por habilidade**, separada dos pontos de gamificação.
- **Histórico e recomendações**, para orientar o que estudar a seguir.

O sistema deve responder diariamente a três perguntas:

1. O que eu já aprendi?
2. O que ainda tenho dificuldade para entender ou falar?
3. O que devo estudar ou praticar agora?

## 2. Contexto e objetivos do usuário

Considere o seguinte contexto inicial, que deverá poder ser editado nas configurações:

- O usuário está aprendendo mandarim.
- Seu nível declarado inicial é aproximadamente **HSK 1**, mas isso deve ser verificado pelo nivelamento.
- Ele vive ou passa um período na China e quer conseguir conversar melhor com pessoas chinesas.
- Ele joga futebol com colegas chineses e quer compreender conversas, instruções, brincadeiras e vocabulário relacionados ao esporte.
- O foco não deve ser apenas memorizar caracteres ou passar em provas: é importante desenvolver compreensão auditiva e capacidade de falar.

### Objetivos prioritários

1. Entender mandarim falado em situações cotidianas.
2. Conseguir iniciar e manter conversas simples.
3. Aprender vocabulário útil para futebol e convivência com colegas.
4. Revisar vocabulário de forma consistente usando repetição espaçada.
5. Identificar dificuldades recorrentes e direcionar o estudo para elas.

O sistema deve permitir alterar a prioridade dessas metas.

## 3. Princípios de design

- Interface simples, clara e agradável, com aparência de painel de progresso ou aplicativo de aprendizagem.
- Conteúdo adequado ao nível do usuário, evitando exercícios excessivamente difíceis.
- Explicações e traduções em português por padrão, com possibilidade de alterar o idioma.
- Chinês simplificado como padrão, com pinyin disponível para apoiar o aprendizado.
- Separação entre **XP (atividade e motivação)** e **proficiência (desempenho demonstrado)**.
- O sistema não deve considerar que o usuário domina uma palavra apenas porque ela foi exibida ou adicionada a um flashcard.
- Toda avaliação deve mostrar como a pontuação foi calculada e, quando possível, indicar incerteza.
- O usuário deve poder corrigir, editar, aprovar ou rejeitar cartões gerados automaticamente.
- Não inventar resultados de avaliações, histórico de Anki ou dados de aprendizagem que não tenham sido registrados.

## 4. Fluxo geral de utilização

O fluxo ideal é:

1. O usuário abre o sistema pela primeira vez.
2. Informa seus objetivos, tempo disponível e experiência anterior com mandarim.
3. Faz o **nivelamento inicial**.
4. Recebe uma estimativa de nível, resultados por habilidade e um plano inicial.
5. Acessa o painel principal.
6. Estuda, faz exercícios e registra práticas reais.
7. Cria flashcards a partir de novos materiais e envia-os ao Anki.
8. O sistema registra as atividades e os resultados dos exercícios.
9. As recomendações e metas são atualizadas com base no desempenho.
10. Periodicamente, o usuário faz pequenas reavaliações para medir a evolução.

O nivelamento inicial deve ser feito uma vez na configuração inicial, mas o usuário poderá refazê-lo ou fazer avaliações menores posteriormente.

---

## 5. Nivelamento inicial obrigatório

### 5.1 Objetivo

Antes de recomendar um plano de estudo, o sistema deve estimar o nível atual do usuário. O nível declarado pelo usuário, como HSK 1, deve ser tratado como uma informação inicial, não como resultado comprovado.

O teste deve identificar tanto o conhecimento geral quanto as diferenças entre habilidades. Por exemplo, o usuário pode reconhecer palavras escritas, mas ter dificuldade para compreendê-las quando faladas.

### 5.2 Etapas do nivelamento

O nivelamento deve ser dividido em etapas curtas, com progresso visível. Sempre que possível, deve adaptar a dificuldade conforme as respostas.

#### Etapa A — Questionário inicial

Perguntar:

- Há quanto tempo o usuário estuda mandarim?
- Já estudou para algum nível do HSK? Qual?
- Consegue ler pinyin?
- Consegue reconhecer caracteres chineses?
- Consegue compreender frases simples quando ouvidas?
- Consegue responder a perguntas simples em mandarim?
- Qual é seu objetivo principal: conversação cotidiana, futebol, estudos, trabalho, prova HSK ou outro?
- Quanto tempo pode estudar por dia?
- Usa Anki atualmente? Se sim, já possui um baralho de mandarim?

O usuário deve poder pular perguntas não essenciais.

#### Etapa B — Vocabulário e reconhecimento

Apresentar palavras e expressões de dificuldade progressiva. Usar diferentes tipos de questão:

- Escolher o significado de uma palavra chinesa.
- Associar uma palavra ao seu pinyin.
- Escolher a palavra adequada para completar uma frase.
- Identificar quais palavras o usuário já conhece.
- Distinguir palavras conhecidas apenas visualmente daquelas que consegue usar.

Não se deve classificar uma palavra como dominada apenas porque o usuário acertou uma questão de múltipla escolha. Quando relevante, confirmar com outra pergunta ou atividade.

#### Etapa C — Compreensão de frases e leitura

Apresentar frases curtas e diálogos, aumentando gradualmente a dificuldade.

Exemplos de tarefas:

- Selecionar a tradução correta.
- Identificar a intenção de uma pergunta.
- Compreender um diálogo curto.
- Responder a uma pergunta sobre o conteúdo lido.
- Completar uma frase com a expressão apropriada.

Sempre que possível, oferecer o chinês sem pinyin primeiro e permitir que o usuário revele o pinyin como apoio. Registrar quando a resposta dependeu desse apoio.

#### Etapa D — Compreensão auditiva

Apresentar áudio em mandarim, preferencialmente com voz natural e velocidade adequada ao nível. O áudio deve ser reproduzido antes de mostrar a transcrição, para que o teste realmente avalie a compreensão auditiva.

Tipos de tarefa:

- Escolher o significado do que foi ouvido.
- Identificar uma palavra ou expressão.
- Responder a uma pergunta sobre o áudio.
- Entender a intenção de uma fala em um diálogo curto.

A transcrição e o pinyin podem ser revelados depois da resposta. Se não houver capacidade de gerar ou reproduzir áudio na primeira versão, essa limitação deve ser informada claramente e a habilidade auditiva deve ser marcada como **não avaliada**, em vez de ser estimada com base em leitura.

#### Etapa E — Produção escrita

Solicitar respostas simples em chinês, começando por tarefas compatíveis com iniciantes:

- Escrever uma apresentação pessoal.
- Responder a perguntas simples.
- Completar frases.
- Produzir uma frase curta a partir de uma situação em português.

Aceitar, conforme a tarefa, caracteres chineses ou pinyin. Registrar qual forma foi utilizada.

As respostas abertas devem ser avaliadas com critérios claros, levando em conta compreensão, vocabulário, gramática e inteligibilidade. Não exigir que um iniciante escreva caracteres se a tarefa pretende avaliar apenas a capacidade de formular uma frase oral.

#### Etapa F — Produção oral (se disponível)

Se o sistema tiver suporte a microfone e reconhecimento de fala, solicitar respostas faladas a perguntas simples.

Avaliar, quando tecnicamente possível:

- Se a resposta transmite o significado pretendido.
- Uso de vocabulário e estruturas adequadas.
- Capacidade de responder sem ler uma resposta pronta.
- Pronúncia e tons, com cautela e explicação dos limites da avaliação automática.

Não afirmar que a pronúncia é perfeita ou incorreta com certeza quando o modelo não tiver evidência suficiente. Se não houver suporte confiável a áudio, permitir que esta etapa seja pulada e marcar produção oral como não avaliada.

### 5.3 Adaptação da dificuldade

O nivelamento deve começar com questões fáceis e aumentar ou diminuir a dificuldade conforme o desempenho.

- Se o usuário acertar várias questões, apresentar questões mais difíceis.
- Se errar repetidamente, apresentar questões mais simples para localizar o nível adequado.
- Evitar um teste excessivamente longo.
- Incluir uma opção de pausa e retomada.
- Não mostrar a resposta correta antes de o usuário responder.
- Evitar que todas as questões sejam de múltipla escolha, pois isso pode superestimar o conhecimento.

A quantidade de questões deve ser suficiente para produzir uma estimativa útil sem tornar o processo cansativo. A implementação pode começar com um conjunto fixo e bem organizado de questões e evoluir depois para um teste adaptativo.

### 5.4 Resultado do nivelamento

Ao terminar, mostrar um relatório com:

- **Nível estimado geral**, por exemplo, iniciante / compatível com HSK 1 / aproximado de HSK 2, quando houver evidência suficiente.
- Resultados por habilidade:
  - Vocabulário.
  - Leitura.
  - Compreensão auditiva.
  - Gramática e construção de frases.
  - Produção escrita.
  - Produção oral, se avaliada.
- Pontos fortes.
- Dificuldades prioritárias.
- Vocabulário e estruturas que parecem conhecidos.
- Conteúdos que precisam ser confirmados em exercícios futuros.
- Plano de estudo recomendado para a primeira semana.
- Tempo diário sugerido com base na disponibilidade informada.

Não apresentar uma equivalência exata ao HSK se o teste não cobrir conteúdo suficiente para sustentá-la. Deixar claro que o resultado é uma estimativa diagnóstica, não uma certificação oficial.

### 5.5 Conversão do resultado em plano inicial

Usar o nivelamento para definir:

- Quais categorias de palavras devem ser priorizadas.
- Qual dificuldade de diálogos apresentar.
- Quanta ajuda fornecer (pinyin, tradução, dicas).
- Quais tipos de exercício recomendar.
- Qual meta diária de aprendizagem sugerir.
- Quais assuntos priorizar com base nos objetivos do usuário.

Como o usuário quer conversar com colegas chineses e joga futebol, incluir desde cedo situações práticas de conversação e vocabulário de futebol, sem abandonar as estruturas básicas necessárias.

### 5.6 Reavaliação

Depois do nivelamento inicial:

- Propor pequenas avaliações semanais ou quinzenais.
- Comparar resultados por habilidade ao longo do tempo.
- Não confundir maior familiaridade com as mesmas perguntas com aumento real de proficiência.
- Introduzir questões novas de dificuldade semelhante nas reavaliações.
- Permitir refazer o nivelamento completo manualmente.

---

## 6. Painel principal (dashboard)

O painel deve resumir o estado atual do aprendizado.

### 6.1 Informações principais

Exibir:

- Nível estimado atual.
- XP total e progresso até o próximo marco.
- Sequência de dias de estudo.
- Meta diária e progresso de hoje.
- Número de cartões revisados hoje.
- Número de cartões novos estudados.
- Resultados recentes dos exercícios.
- Tempo de estudo registrado.
- Próxima recomendação de atividade.

### 6.2 Habilidades

Exibir indicadores separados para:

- **听力 — Tīnglì — Compreensão auditiva**
- **口语 — Kǒuyǔ — Produção oral**
- **词汇 — Cíhuì — Vocabulário**
- **阅读 — Yuèdú — Leitura**
- **语法 — Yǔfǎ — Gramática e construção de frases**
- **写作 — Xiězuò — Escrita**

Cada habilidade pode ter uma pontuação de 0 a 100, desde que a interface deixe claro que se trata de uma estimativa interna baseada nas atividades registradas, e não de uma medida oficial de proficiência.

Não preencher uma habilidade com uma pontuação inventada se não houver dados suficientes. Exibir “ainda não avaliada” ou “dados insuficientes”.

### 6.3 Acesso rápido

Disponibilizar ações como:

- Começar estudo de hoje.
- Fazer revisão de vocabulário.
- Criar flashcards a partir de um texto.
- Registrar uma conversa real.
- Fazer um exercício de escuta.
- Ver histórico e recomendações.

---

## 7. Sistema de XP e gamificação

O XP deve incentivar a consistência, não substituir a avaliação de aprendizagem.

### 7.1 Exemplos de recompensas

Os valores abaixo são sugestões iniciais e devem poder ser ajustados:

| Atividade | XP sugerido |
|---|---:|
| Concluir uma sessão de revisão | +10 |
| Estudar um diálogo | +15 |
| Concluir exercício de escuta | +20 |
| Registrar cinco expressões úteis | +15 |
| Fazer uma conversa de pelo menos 10 minutos em mandarim | +30 |
| Concluir uma avaliação semanal | +40 |
| Cumprir a meta diária | bônus configurável |

Definir regras contra duplicação acidental de XP. Por exemplo, não conceder repetidamente a mesma recompensa apenas atualizando a página.

### 7.2 Conquistas

Exemplos:

- Primeira conversa registrada.
- Primeira semana de estudos concluída.
- Sete dias de consistência.
- Primeiro diálogo compreendido sem pinyin.
- Primeiro conjunto de vocabulário de futebol aprendido.
- Primeira avaliação concluída.
- Primeira sequência de revisões sem cartões esquecidos — apenas se esse indicador for calculado de maneira confiável.

### 7.3 XP não é proficiência

O sistema deve manter duas coisas separadas:

1. **XP:** representa atividades concluídas e consistência.
2. **Proficiência:** representa o desempenho demonstrado nos exercícios e avaliações.

Estudar muitos cartões pode aumentar o XP, mas não deve aumentar automaticamente a pontuação de proficiência. A proficiência deve depender de evidências como respostas corretas, compreensão de áudio e produção de frases.

---

## 8. Gerador automático de flashcards

### 8.1 Objetivo

Permitir que o usuário transforme conteúdo que encontra na vida real em cartões úteis para estudar.

### 8.2 Entradas aceitas

Na primeira versão, permitir:

- Texto colado manualmente.
- Lista de palavras ou frases.
- Diálogo.
- Transcrição de áudio.
- Conteúdo copiado de uma aula ou material de estudo.

Em versões posteriores, considerar importação de arquivos PDF, documentos e transcrições de áudio. Não prometer suporte a formatos que ainda não estejam implementados.

### 8.3 Fluxo de geração

1. O usuário cola ou importa o conteúdo.
2. O sistema identifica palavras, expressões e estruturas potencialmente úteis.
3. Remove duplicatas óbvias.
4. Compara os itens com o vocabulário conhecido e os cartões existentes, quando esses dados estiverem disponíveis.
5. Prioriza expressões úteis para o nível e os objetivos do usuário.
6. Gera sugestões de cartões.
7. O usuário revisa cada sugestão e pode aprovar, editar ou rejeitar.
8. Os cartões aprovados são exportados ou enviados ao Anki.
9. O sistema registra os cartões criados e evita duplicatas em futuras importações.

### 8.4 Campos de um cartão

Campos recomendados:

- Frente: palavra, expressão, pergunta ou frase em chinês.
- Verso: significado em português.
- Pinyin.
- Exemplo de uso em chinês.
- Tradução do exemplo.
- Contexto ou categoria.
- Nível de dificuldade estimado.
- Tags.
- Áudio, quando disponível.
- Observações de uso, quando realmente úteis.

Permitir modelos de cartão diferentes, como:

- Chinês → português.
- Português/situação → chinês.
- Áudio → significado.
- Completar uma frase.

Não gerar cartões excessivamente complexos. Um cartão deve, preferencialmente, testar uma ideia ou expressão principal.

### 8.5 Exemplo de geração

Entrada:

```text
A: 你周末有什么计划？
B: 我想和朋友一起踢足球。
A: 你经常踢足球吗？
B: 是的，我每周踢两次。
```

Sugestões de cartões:

| Frente | Verso | Pinyin |
|---|---|---|
| 你周末有什么计划？ | Quais são seus planos para o fim de semana? | Nǐ zhōumò yǒu shénme jìhuà? |
| 踢足球 | Jogar futebol | tī zúqiú |
| 你经常踢足球吗？ | Você joga futebol com frequência? | Nǐ jīngcháng tī zúqiú ma? |
| 每周两次 | Duas vezes por semana | měi zhōu liǎng cì |

As traduções devem considerar o contexto. O sistema deve permitir editar traduções, pinyin e exemplos antes de salvar.

### 8.6 Qualidade e controle do usuário

- Mostrar claramente quais cartões são novos e quais podem ser duplicatas.
- Nunca adicionar automaticamente grandes quantidades de cartões sem uma opção de revisão, a menos que o usuário ative explicitamente essa preferência.
- Sinalizar traduções ou pinyin de baixa confiança, quando possível.
- Permitir excluir, editar e etiquetar cartões.
- Guardar a origem do cartão, como o texto ou diálogo que o gerou, se o usuário quiser.
- Priorizar expressões que possam ser usadas em conversas reais, e não apenas palavras isoladas sem contexto.

---

## 9. Integração com o Anki

### 9.1 Objetivo

O Anki deve continuar sendo a ferramenta principal de repetição espaçada, enquanto Mandarin Quest organiza o aprendizado, gera cartões e acompanha outras atividades.

### 9.2 Estratégia de integração

Priorizar uma destas opções:

1. **AnkiConnect:** integração local com o Anki Desktop, se disponível e configurada pelo usuário.
2. **Exportação de arquivo:** CSV ou outro formato compatível, para importar cartões manualmente.

A primeira versão deve implementar ao menos uma forma confiável de exportação. A integração direta com AnkiConnect pode depender de configuração local e não deve ser tratada como disponível em todos os dispositivos.

### 9.3 Criação de cartões

Se usar AnkiConnect:

- Permitir escolher o baralho de destino.
- Verificar se o baralho e o modelo de nota existem.
- Mapear corretamente os campos.
- Informar sucesso ou falha ao usuário.
- Detectar duplicatas quando possível.
- Não afirmar que um cartão foi enviado se a chamada falhou.

### 9.4 Histórico de revisões

A criação de cartões e a leitura do histórico de revisões são funcionalidades distintas.

Se a integração permitir consultar dados de revisão, utilizá-los para enriquecer o painel. Se não permitir ou não estiver configurada, deixar essa informação como indisponível e permitir que o usuário registre sessões manualmente.

Não inventar dados de cartões dominados, revisões, intervalos ou retenção.

### 9.5 Referência técnica

AnkiConnect: https://github.com/amikey/anki-connect

A documentação e as limitações atuais devem ser verificadas durante a implementação.

---

## 10. Registro de conversas e prática real

Como o objetivo principal inclui falar com pessoas chinesas, o sistema deve permitir registrar prática fora do aplicativo.

O registro pode incluir:

- Data.
- Duração aproximada.
- Contexto: futebol, restaurante, universidade, transporte, conversa casual etc.
- Dificuldade percebida.
- Expressões novas.
- O que o usuário conseguiu compreender.
- O que não conseguiu dizer ou entender.
- Uma observação opcional.

Exemplo: “Conversei por 10 minutos com colegas depois do futebol. Entendi as instruções básicas, mas não consegui responder quando perguntaram com que frequência eu jogo.”

A partir desse registro, o sistema pode sugerir expressões e exercícios relacionados. O registro de uma conversa deve render XP conforme as regras, mas não deve, por si só, aumentar automaticamente a pontuação de proficiência.

---

## 11. Detecção de dificuldades e recomendações adaptativas

### 11.1 Objetivo

O sistema deve usar o histórico de exercícios, os erros e os objetivos para recomendar o próximo passo de estudo.

### 11.2 Exemplos

- Se o usuário erra repetidamente expressões de tempo, recomendar exercícios sobre dias, horários e frequência.
- Se reconhece uma frase por escrito, mas erra quando ela é falada, recomendar exercícios de escuta com vocabulário já conhecido.
- Se compreende perguntas, mas tem dificuldade para responder, recomendar prática de produção de frases.
- Se registra dificuldade em conversas de futebol, priorizar instruções, posições, passes, pedidos e conversas após a partida.
- Se esquece palavras em revisões, sugerir cartões mais claros, frases de exemplo ou menos cartões novos por dia.

### 11.3 Regras importantes

- Recomendações devem ser explicáveis: mostrar qual dificuldade ou objetivo levou à sugestão.
- Distinguir erro isolado de dificuldade recorrente.
- Não recomendar conteúdo muito acima do nível sem uma razão clara.
- Dar prioridade a conteúdo útil para a vida real do usuário.
- Permitir ignorar recomendações e escolher outro tema.

---

## 12. Histórico e relatórios

Criar uma página de histórico com:

- XP ganho por dia e por semana.
- Dias de estudo.
- Cartões criados, revisados e exportados, quando houver dados.
- Resultados de exercícios.
- Evolução das habilidades avaliadas.
- Conversas reais registradas.
- Temas estudados.
- Dificuldades recorrentes.
- Comparação entre avaliações ao longo do tempo.

Evitar gráficos que sugiram precisão excessiva. Sempre indicar o período e a origem dos dados. Se houver poucos dados para uma conclusão, mostrar isso claramente.

---

## 13. Arquitetura conceitual

Separar o sistema em componentes para facilitar manutenção e evolução.

### Componentes principais

1. **Interface**
   - Dashboard.
   - Nivelamento.
   - Exercícios.
   - Gerador de cartões.
   - Histórico.
   - Configurações.

2. **Perfil e objetivos**
   - Nível inicial.
   - Metas.
   - Tempo disponível.
   - Preferências de estudo.

3. **Motor de avaliação**
   - Banco de questões.
   - Correção.
   - Resultados por habilidade.
   - Reavaliações.

4. **Gerador de flashcards**
   - Extração de vocabulário.
   - Geração de cartões.
   - Verificação de duplicatas.
   - Aprovação e edição.

5. **Integração com Anki**
   - Envio por AnkiConnect.
   - Exportação de arquivos.
   - Relato de erros e status.

6. **Gamificação**
   - XP.
   - Metas.
   - Sequências.
   - Conquistas.

7. **Recomendações**
   - Identificação de dificuldades.
   - Seleção de exercícios.
   - Plano de estudo.

8. **Persistência**
   - Perfil.
   - Resultados.
   - Cartões gerados.
   - Atividades.
   - Histórico.

### Modelo de dados conceitual

A implementação pode usar entidades equivalentes a:

- `UserProfile`: objetivos, nível declarado, tempo disponível e preferências.
- `PlacementAttempt`: tentativa de nivelamento, data e versão do teste.
- `AssessmentResponse`: questão, resposta, correção, apoio utilizado e resultado.
- `SkillEstimate`: habilidade, estimativa, quantidade de evidências e data.
- `StudySession`: tipo de atividade, duração e data.
- `FlashcardDraft`: cartão sugerido, origem, estado de aprovação e campos.
- `FlashcardExport`: destino, data, status e erros.
- `ConversationLog`: contexto, duração, dificuldades e expressões.
- `XPEvent`: atividade que concedeu pontos, quantidade e identificador único.
- `Achievement`: conquista desbloqueada e data.
- `Recommendation`: sugestão, justificativa, estado e data.
- `AssessmentQuestion`: conteúdo, habilidade, dificuldade, respostas e critérios de correção.

A tecnologia específica deve ser escolhida durante o planejamento da implementação. Não é necessário adotar todos esses nomes literalmente, mas as responsabilidades devem permanecer separadas.

---

## 14. Privacidade e segurança

- Guardar apenas os dados necessários para as funcionalidades.
- Não enviar dados pessoais a serviços externos sem informar o usuário.
- Se usar uma API de LLM para gerar cartões ou avaliar respostas, centralizar a configuração da chave de API em variáveis de ambiente ou mecanismo seguro equivalente.
- Nunca incluir chaves secretas diretamente no código-fonte.
- Explicar quais dados de texto ou áudio serão enviados a serviços externos, quando aplicável.
- Permitir apagar o histórico e os dados do usuário.
- Tratar textos pessoais usados para gerar cartões como conteúdo privado.

---

## 15. Escopo de implementação por fases

Para reduzir a complexidade, implementar em etapas.

### Fase 1 — MVP funcional

Prioridade máxima:

1. Configuração inicial do perfil.
2. Nivelamento inicial com vocabulário, leitura e construção de frases.
3. Resultado do nivelamento com estimativas por habilidade e plano inicial.
4. Dashboard.
5. Registro manual de sessões e conversas.
6. XP, meta diária e sequência de estudo.
7. Gerador de flashcards a partir de texto colado.
8. Tela de revisão, edição e aprovação de cartões.
9. Exportação dos cartões para CSV ou formato compatível com Anki.
10. Persistência de dados e histórico básico.

Se áudio ou avaliação oral não puderem ser implementados com qualidade nessa fase, marcar essas habilidades como não avaliadas. Não simular funcionalidades inexistentes.

### Fase 2 — Personalização e Anki

- Integração direta com AnkiConnect.
- Melhor detecção de duplicatas.
- Comparação com cartões e vocabulário existentes.
- Avaliações periódicas.
- Identificação de erros recorrentes.
- Recomendações personalizadas.
- Relatórios semanais.

### Fase 3 — Áudio e conversação

- Exercícios auditivos com áudio.
- Diálogos com dificuldade adaptativa.
- Entrada de áudio do usuário.
- Reconhecimento de fala.
- Avaliação cautelosa da produção oral e pronúncia.
- Conversas simuladas com situações cotidianas e de futebol.
- Criação de cartões a partir de transcrições.

---

## 16. Requisitos de interface

A interface deve ter, no mínimo, estas áreas:

### A. Onboarding e nivelamento
Questionário inicial, teste por etapas, salvamento do progresso e relatório final.

### B. Dashboard
Resumo do progresso, metas, XP e próxima atividade recomendada.

### C. Estudar
Atividades recomendadas, exercícios curtos e acesso às revisões.

### D. Criar cartões
Área para colar texto, gerar sugestões, editar cartões e exportar.

### E. Histórico
Evolução, atividades e conversas registradas.

### F. Configurações
Objetivos, tempo disponível, preferências de idioma, integrações e privacidade.

A interface deve ser responsiva e comunicar claramente quando uma função depende de uma integração ou serviço externo ainda não configurado.

---

## 17. Critérios de aceitação

Considerar a primeira versão funcional quando:

- Um novo usuário consegue completar o onboarding.
- O sistema aplica um nivelamento inicial e salva as respostas.
- O sistema mostra uma estimativa de nível, resultados por habilidade e limitações da avaliação.
- O usuário consegue acessar um plano inicial baseado nos resultados.
- O dashboard exibe atividades e XP calculados a partir de registros reais.
- O usuário consegue registrar uma sessão de estudo e uma conversa.
- O usuário consegue colar um texto e receber sugestões de flashcards.
- O usuário consegue editar, aprovar e rejeitar sugestões.
- O usuário consegue exportar cartões para um formato compatível com Anki.
- Os dados persistem ao recarregar ou reabrir a aplicação.
- Erros de integração são apresentados claramente.
- O sistema não inventa pontuações, revisões ou avaliações para preencher áreas vazias.
- As habilidades sem evidência suficiente aparecem como “não avaliadas” ou “dados insuficientes”.

---

## 18. Orientações para a LLM que vai implementar o projeto

Antes de começar a programar:

1. Leia toda esta especificação.
2. Apresente uma proposta breve de arquitetura e escolha tecnológica, explicando as razões.
3. Identifique requisitos ambíguos e dependências externas.
4. Defina a estrutura de pastas e o modelo de dados.
5. Divida a implementação em etapas pequenas e verificáveis.
6. Implemente primeiro o MVP da Fase 1.
7. Não implemente recursos de fases posteriores como se já estivessem prontos.
8. Inclua instruções para instalar, configurar e executar o projeto localmente.
9. Inclua dados de demonstração claramente identificados como fictícios, caso sejam necessários para testar a interface.
10. Inclua testes para as funções principais, especialmente cálculo de XP, persistência, nivelamento e exportação de cartões.
11. Documente quaisquer limitações, chaves de API, configurações ou serviços externos necessários.
12. Não invente funcionalidades de AnkiConnect: confira a documentação durante a implementação.
13. Mantenha a geração de cartões separada da lógica de avaliação de proficiência.
14. Priorize um sistema simples e funcional antes de adicionar recursos sofisticados.

### Resultado esperado

Entregar uma aplicação funcional que permita ao usuário descobrir seu nível inicial, estudar de acordo com suas necessidades, transformar materiais reais em flashcards, acompanhar sua evolução e receber recomendações úteis para conversar melhor em mandarim.

A prioridade é a utilidade prática para o aprendizado real, não a quantidade de funcionalidades.
