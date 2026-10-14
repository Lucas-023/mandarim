/**
 * Banco de questões do nivelamento (versão 1).
 *
 * Etapas (ver CLAUDE.md §5.2):
 *   B = vocabulário e reconhecimento
 *   C = compreensão de frases e leitura / gramática
 *   D = compreensão auditiva  → NÃO IMPLEMENTADA nesta fase (sem áudio)
 *   E = produção escrita
 *   F = produção oral        → NÃO IMPLEMENTADA nesta fase (sem microfone)
 *
 * Tipos:
 *   'mc'          múltipla escolha
 *   'cloze'       completar frase (múltipla escolha)
 *   'match_py'    associar palavra ao pinyin
 *   'self_report' autoavaliação de conhecimento (NÃO gera evidência de proficiência)
 *   'open'        resposta escrita livre, corrigida por critérios explícitos
 */

export const QUESTION_BANK_VERSION = 'v1';

export const QUESTIONS = [
  // ───────────────────────── Etapa B — vocabulário ─────────────────────────
  {
    id: 'b1', stage: 'B', skill: 'vocabulary', difficulty: 1, type: 'mc',
    prompt: 'O que significa 谢谢?', promptHz: '谢谢', pinyin: 'xièxie',
    options: ['Obrigado', 'Desculpe', 'Até logo', 'Por favor'], answer: 0,
    tags: ['conversa'],
  },
  {
    id: 'b2', stage: 'B', skill: 'vocabulary', difficulty: 1, type: 'mc',
    prompt: 'O que significa 足球?', promptHz: '足球', pinyin: 'zúqiú',
    options: ['Futebol', 'Basquete', 'Corrida', 'Natação'], answer: 0,
    tags: ['futebol'],
  },
  {
    id: 'b3', stage: 'B', skill: 'vocabulary', difficulty: 1, type: 'match_py',
    prompt: 'Qual é o pinyin de 老师?', promptHz: '老师',
    options: ['lǎoshī', 'lǎoshi', 'làoshī', 'lǎosī'], answer: 0,
    tags: ['cotidiano'],
  },
  {
    id: 'b4', stage: 'B', skill: 'vocabulary', difficulty: 1, type: 'mc',
    prompt: 'O que significa 朋友?', promptHz: '朋友', pinyin: 'péngyou',
    options: ['Amigo', 'Irmão', 'Vizinho', 'Chefe'], answer: 0,
    tags: ['cotidiano'],
  },
  {
    id: 'b5', stage: 'B', skill: 'vocabulary', difficulty: 2, type: 'mc',
    prompt: 'O que significa 周末?', promptHz: '周末', pinyin: 'zhōumò',
    options: ['Fim de semana', 'Feriado', 'Manhã', 'Mês'], answer: 0,
    tags: ['tempo'],
  },
  {
    id: 'b6', stage: 'B', skill: 'vocabulary', difficulty: 2, type: 'mc',
    prompt: 'O que significa 传球?', promptHz: '传球', pinyin: 'chuán qiú',
    options: ['Passar a bola', 'Chutar ao gol', 'Defender', 'Driblar'], answer: 0,
    tags: ['futebol'],
  },
  {
    id: 'b7', stage: 'B', skill: 'vocabulary', difficulty: 2, type: 'match_py',
    prompt: 'Qual é o pinyin de 经常?', promptHz: '经常',
    options: ['jīngcháng', 'jīnchang', 'jǐngcháng', 'jīngchǎng'], answer: 0,
    tags: ['tempo'],
  },
  {
    id: 'b8', stage: 'B', skill: 'vocabulary', difficulty: 2, type: 'mc',
    prompt: 'O que significa 守门员?', promptHz: '守门员', pinyin: 'shǒuményuán',
    options: ['Goleiro', 'Árbitro', 'Técnico', 'Atacante'], answer: 0,
    tags: ['futebol'],
  },
  {
    id: 'b9', stage: 'B', skill: 'vocabulary', difficulty: 3, type: 'mc',
    prompt: 'O que significa 越位?', promptHz: '越位', pinyin: 'yuèwèi',
    options: ['Impedimento', 'Escanteio', 'Pênalti', 'Substituição'], answer: 0,
    tags: ['futebol'],
  },
  {
    id: 'b10', stage: 'B', skill: 'vocabulary', difficulty: 3, type: 'mc',
    prompt: 'O que significa 受伤?', promptHz: '受伤', pinyin: 'shòushāng',
    options: ['Se machucar', 'Descansar', 'Treinar', 'Comemorar'], answer: 0,
    tags: ['futebol'],
  },
  {
    id: 'b11', stage: 'B', skill: 'vocabulary', difficulty: 3, type: 'mc',
    prompt: 'Em uma conversa, 没问题 significa:', promptHz: '没问题', pinyin: 'méi wèntí',
    options: ['Sem problema', 'Não sei', 'Não gosto', 'Não entendi'], answer: 0,
    tags: ['conversa'],
  },
  {
    id: 'b12', stage: 'B', skill: 'vocabulary', difficulty: 1, type: 'self_report',
    prompt: 'Marque as palavras que você reconhece e saberia usar em uma frase:',
    items: ['你好', '谢谢', '足球', '周末', '经常', '越位', '守门员', '计划'],
    tags: ['autoavaliacao'],
  },

  // ─────────────── Etapa C — frases, leitura e gramática ───────────────
  {
    id: 'c1', stage: 'C', skill: 'reading', difficulty: 1, type: 'mc',
    prompt: 'Qual é a tradução correta?', promptHz: '我是巴西人。', pinyin: 'Wǒ shì Bāxī rén.',
    options: ['Eu sou brasileiro.', 'Eu moro no Brasil.', 'Eu vou ao Brasil.', 'Eu gosto do Brasil.'],
    answer: 0, tags: ['apresentacao'],
  },
  {
    id: 'c2', stage: 'C', skill: 'reading', difficulty: 1, type: 'mc',
    prompt: 'O que esta pergunta quer saber?', promptHz: '你叫什么名字？', pinyin: 'Nǐ jiào shénme míngzi?',
    options: ['O seu nome', 'A sua idade', 'De onde você é', 'O que você faz'],
    answer: 0, tags: ['apresentacao'],
  },
  {
    id: 'c3', stage: 'C', skill: 'grammar', difficulty: 1, type: 'cloze',
    prompt: 'Complete: 我 ___ 踢足球。(Eu gosto de jogar futebol.)',
    promptHz: '我 ___ 踢足球。',
    options: ['喜欢', '谢谢', '名字', '昨天'], answer: 0, tags: ['futebol'],
  },
  {
    id: 'c4', stage: 'C', skill: 'reading', difficulty: 2, type: 'mc',
    prompt: 'Qual é a tradução correta?', promptHz: '你周末有什么计划？', pinyin: 'Nǐ zhōumò yǒu shénme jìhuà?',
    options: [
      'Quais são seus planos para o fim de semana?',
      'Você trabalhou no fim de semana?',
      'Onde você foi no fim de semana?',
      'Você gosta do fim de semana?',
    ],
    answer: 0, tags: ['conversa'],
  },
  {
    id: 'c5', stage: 'C', skill: 'grammar', difficulty: 2, type: 'cloze',
    prompt: 'Complete: 我每周踢 ___ 次足球。(Jogo futebol duas vezes por semana.)',
    promptHz: '我每周踢 ___ 次足球。',
    options: ['两', '二', '双', '俩'], answer: 0,
    rationale: 'Antes de classificadores como 次 usa-se 两, não 二.',
    tags: ['tempo'],
  },
  {
    id: 'c6', stage: 'C', skill: 'reading', difficulty: 2, type: 'mc',
    prompt: 'Leia o diálogo. O que B respondeu?',
    promptHz: 'A: 你经常踢足球吗？\nB: 是的，我每周踢两次。',
    pinyin: 'A: Nǐ jīngcháng tī zúqiú ma?\nB: Shì de, wǒ měi zhōu tī liǎng cì.',
    options: [
      'Que joga duas vezes por semana',
      'Que não joga futebol',
      'Que jogou ontem',
      'Que quer aprender a jogar',
    ],
    answer: 0, tags: ['futebol', 'dialogo'],
  },
  {
    id: 'c7', stage: 'C', skill: 'grammar', difficulty: 2, type: 'cloze',
    prompt: 'Complete a pergunta: 你 ___ 说葡萄牙语？(Você sabe falar português?)',
    promptHz: '你 ___ 说葡萄牙语？',
    options: ['会不会', '有没有', '是不是', '要不要'], answer: 0,
    rationale: '会 expressa habilidade aprendida; a forma 会不会 faz a pergunta.',
    tags: ['gramatica'],
  },
  {
    id: 'c8', stage: 'C', skill: 'reading', difficulty: 3, type: 'mc',
    prompt: 'No diálogo, o que o colega está pedindo?',
    promptHz: 'A: 快点，传给我！\nB: 好球！',
    pinyin: 'A: Kuài diǎn, chuán gěi wǒ!\nB: Hǎo qiú!',
    options: [
      'Que passem a bola para ele, rápido',
      'Que o jogo termine',
      'Que ele vai sair do jogo',
      'Que o adversário cometeu falta',
    ],
    answer: 0, tags: ['futebol', 'dialogo'],
  },
  {
    id: 'c9', stage: 'C', skill: 'grammar', difficulty: 3, type: 'cloze',
    prompt: 'Complete: 我学中文 ___ 半年了。(Estudo chinês há meio ano.)',
    promptHz: '我学中文 ___ 半年了。',
    options: ['已经', '刚才', '一起', '非常'], answer: 0,
    rationale: '已经…了 marca algo que já ocorre há um tempo.',
    tags: ['gramatica'],
  },
  {
    id: 'c10', stage: 'C', skill: 'reading', difficulty: 3, type: 'mc',
    prompt: 'O que a pessoa quis dizer?', promptHz: '你说慢一点，我听不懂。',
    pinyin: 'Nǐ shuō màn yìdiǎn, wǒ tīng bu dǒng.',
    options: [
      'Pediu para falar mais devagar porque não entendeu',
      'Disse que fala devagar',
      'Disse que não quer conversar',
      'Pediu para repetir por escrito',
    ],
    answer: 0, tags: ['conversa'],
  },

  // ───────────────────── Etapa E — produção escrita ─────────────────────
  {
    id: 'e1', stage: 'E', skill: 'writing', difficulty: 1, type: 'open',
    prompt: 'Apresente-se em mandarim: diga seu nome e que é brasileiro. Pode escrever em caracteres ou em pinyin.',
    rubric: {
      minLength: 6,
      criteria: [
        { id: 'nome', label: 'Disse o nome (叫 / jiào ou 我是 / wǒ shì)', any: ['叫', 'jiao', 'jiào', '我是', 'wo shi', 'wǒ shì'] },
        { id: 'origem', label: 'Mencionou o Brasil (巴西 / Bāxī)', any: ['巴西', 'baxi', 'bāxī'] },
        { id: 'pronome', label: 'Usou o pronome 我 / wǒ', any: ['我', 'wo', 'wǒ'] },
      ],
    },
    tags: ['apresentacao'],
  },
  {
    id: 'e2', stage: 'E', skill: 'writing', difficulty: 2, type: 'open',
    prompt: 'Responda em mandarim: 你经常踢足球吗？(Você joga futebol com frequência?) Diga com que frequência você joga.',
    rubric: {
      minLength: 6,
      criteria: [
        { id: 'frequencia', label: 'Indicou frequência (每周 / 每天 / 次)', any: ['每周', '每天', '次', 'mei zhou', 'měi zhōu', 'meitian', 'měitiān', 'ci', 'cì'] },
        { id: 'verbo', label: 'Usou 踢 / tī com 足球 / zúqiú', any: ['踢', 'ti ', 'tī', '足球', 'zuqiu', 'zúqiú'] },
        { id: 'pronome', label: 'Usou o pronome 我 / wǒ', any: ['我', 'wo', 'wǒ'] },
      ],
    },
    tags: ['futebol'],
  },
  {
    id: 'e3', stage: 'E', skill: 'writing', difficulty: 2, type: 'open',
    prompt: 'Situação: você não entendeu o que um colega disse. Escreva uma frase pedindo para ele repetir mais devagar.',
    rubric: {
      minLength: 5,
      criteria: [
        { id: 'pedido', label: 'Fez um pedido com 请 / qǐng ou 再说一遍 / zài shuō yí biàn', any: ['请', 'qing', 'qǐng', '再说', 'zai shuo', 'zài shuō', '一遍', 'yi bian', 'yí biàn'] },
        { id: 'devagar', label: 'Pediu para falar devagar (慢 / màn)', any: ['慢', 'man', 'màn'] },
      ],
    },
    tags: ['conversa'],
  },
  {
    id: 'e4', stage: 'E', skill: 'writing', difficulty: 3, type: 'open',
    prompt: 'Escreva uma frase convidando um colega para jogar futebol no fim de semana.',
    rubric: {
      minLength: 8,
      criteria: [
        { id: 'tempo', label: 'Mencionou o fim de semana (周末 / zhōumò)', any: ['周末', 'zhoumo', 'zhōumò'] },
        { id: 'atividade', label: 'Mencionou jogar futebol (踢足球 / tī zúqiú)', any: ['踢足球', 'ti zuqiu', 'tī zúqiú', '足球', 'zuqiu'] },
        { id: 'convite', label: 'Formulou convite (一起 / 吧 / 怎么样 / 想)', any: ['一起', 'yiqi', 'yìqǐ', '吧', 'ba', '怎么样', 'zenmeyang', '想', 'xiang', 'xiǎng'] },
      ],
    },
    tags: ['futebol', 'conversa'],
  },
];

export const QUESTIONS_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

/** Etapas declaradas mas não implementadas nesta fase, com o motivo. */
export const UNAVAILABLE_STAGES = [
  {
    stage: 'D',
    skill: 'listening',
    label: 'Compreensão auditiva',
    reason:
      'Esta versão não gera nem reproduz áudio em mandarim. A habilidade fica marcada ' +
      'como NÃO AVALIADA — não é estimada a partir da leitura.',
  },
  {
    stage: 'F',
    skill: 'speaking',
    label: 'Produção oral',
    reason:
      'Esta versão não captura microfone nem faz reconhecimento de fala. A habilidade ' +
      'fica marcada como NÃO AVALIADA. Você pode registrar conversas reais manualmente.',
  },
];

export function questionsByStage(stage) {
  return QUESTIONS.filter((q) => q.stage === stage);
}
