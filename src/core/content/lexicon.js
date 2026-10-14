/**
 * Léxico base do Mandarin Quest.
 *
 * Usado para: segmentação de texto chinês (longest-match), sugestão de pinyin e
 * tradução ao gerar flashcards, e banco de questões do nivelamento.
 *
 * Campos:
 *  - hz: chinês simplificado
 *  - py: pinyin com tons
 *  - pt: significado em português
 *  - level: faixa de dificuldade estimada (1 = HSK1 aprox., 2 = HSK2 aprox., 3 = acima)
 *  - tags: categorias de uso
 *
 * Importante: `level` é uma estimativa interna de dificuldade, não uma
 * classificação oficial do HSK.
 */
export const LEXICON = [
  // --- Pronomes e estruturas básicas ---
  { hz: '我', py: 'wǒ', pt: 'eu', level: 1, tags: ['base'] },
  { hz: '你', py: 'nǐ', pt: 'você', level: 1, tags: ['base'] },
  { hz: '他', py: 'tā', pt: 'ele', level: 1, tags: ['base'] },
  { hz: '她', py: 'tā', pt: 'ela', level: 1, tags: ['base'] },
  { hz: '我们', py: 'wǒmen', pt: 'nós', level: 1, tags: ['base'] },
  { hz: '你们', py: 'nǐmen', pt: 'vocês', level: 1, tags: ['base'] },
  { hz: '他们', py: 'tāmen', pt: 'eles', level: 1, tags: ['base'] },
  { hz: '是', py: 'shì', pt: 'ser', level: 1, tags: ['base'] },
  { hz: '不', py: 'bù', pt: 'não', level: 1, tags: ['base'] },
  { hz: '有', py: 'yǒu', pt: 'ter, haver', level: 1, tags: ['base'] },
  { hz: '没有', py: 'méiyǒu', pt: 'não ter, não haver', level: 1, tags: ['base'] },
  { hz: '很', py: 'hěn', pt: 'muito', level: 1, tags: ['base'] },
  { hz: '太', py: 'tài', pt: 'demais, muito', level: 1, tags: ['base'] },
  { hz: '也', py: 'yě', pt: 'também', level: 1, tags: ['base'] },
  { hz: '都', py: 'dōu', pt: 'todos, ambos', level: 1, tags: ['base'] },
  { hz: '还', py: 'hái', pt: 'ainda', level: 2, tags: ['base'] },
  { hz: '和', py: 'hé', pt: 'e, com', level: 1, tags: ['base'] },
  { hz: '跟', py: 'gēn', pt: 'com, junto de', level: 2, tags: ['base'] },
  { hz: '的', py: 'de', pt: 'partícula de posse/atributo', level: 1, tags: ['gramatica'] },
  { hz: '了', py: 'le', pt: 'partícula de ação concluída', level: 1, tags: ['gramatica'] },
  { hz: '吗', py: 'ma', pt: 'partícula de pergunta', level: 1, tags: ['gramatica'] },
  { hz: '吧', py: 'ba', pt: 'partícula de sugestão', level: 2, tags: ['gramatica'] },
  { hz: '在', py: 'zài', pt: 'estar em; em', level: 1, tags: ['base'] },

  // --- Perguntas ---
  { hz: '什么', py: 'shénme', pt: 'o que, qual', level: 1, tags: ['pergunta'] },
  { hz: '谁', py: 'shéi', pt: 'quem', level: 1, tags: ['pergunta'] },
  { hz: '哪儿', py: 'nǎr', pt: 'onde', level: 1, tags: ['pergunta'] },
  { hz: '哪里', py: 'nǎlǐ', pt: 'onde', level: 1, tags: ['pergunta'] },
  { hz: '怎么', py: 'zěnme', pt: 'como', level: 1, tags: ['pergunta'] },
  { hz: '怎么样', py: 'zěnmeyàng', pt: 'que tal, como está', level: 2, tags: ['pergunta', 'conversa'] },
  { hz: '为什么', py: 'wèishénme', pt: 'por que', level: 1, tags: ['pergunta'] },
  { hz: '多少', py: 'duōshao', pt: 'quanto, quantos', level: 1, tags: ['pergunta'] },
  { hz: '几', py: 'jǐ', pt: 'quantos (poucos)', level: 1, tags: ['pergunta'] },
  { hz: '多久', py: 'duō jiǔ', pt: 'quanto tempo', level: 2, tags: ['pergunta'] },

  // --- Verbos frequentes ---
  { hz: '去', py: 'qù', pt: 'ir', level: 1, tags: ['verbo'] },
  { hz: '来', py: 'lái', pt: 'vir', level: 1, tags: ['verbo'] },
  { hz: '吃', py: 'chī', pt: 'comer', level: 1, tags: ['verbo'] },
  { hz: '喝', py: 'hē', pt: 'beber', level: 1, tags: ['verbo'] },
  { hz: '看', py: 'kàn', pt: 'ver, olhar, assistir', level: 1, tags: ['verbo'] },
  { hz: '听', py: 'tīng', pt: 'ouvir, escutar', level: 1, tags: ['verbo'] },
  { hz: '说', py: 'shuō', pt: 'falar, dizer', level: 1, tags: ['verbo'] },
  { hz: '读', py: 'dú', pt: 'ler', level: 1, tags: ['verbo'] },
  { hz: '写', py: 'xiě', pt: 'escrever', level: 1, tags: ['verbo'] },
  { hz: '学习', py: 'xuéxí', pt: 'estudar', level: 1, tags: ['verbo'] },
  { hz: '工作', py: 'gōngzuò', pt: 'trabalhar; trabalho', level: 1, tags: ['verbo'] },
  { hz: '住', py: 'zhù', pt: 'morar', level: 1, tags: ['verbo'] },
  { hz: '喜欢', py: 'xǐhuan', pt: 'gostar de', level: 1, tags: ['verbo'] },
  { hz: '想', py: 'xiǎng', pt: 'querer; pensar', level: 1, tags: ['verbo'] },
  { hz: '要', py: 'yào', pt: 'querer, precisar; vai', level: 1, tags: ['verbo'] },
  { hz: '会', py: 'huì', pt: 'saber fazer; vai (futuro)', level: 1, tags: ['verbo'] },
  { hz: '能', py: 'néng', pt: 'poder, conseguir', level: 1, tags: ['verbo'] },
  { hz: '可以', py: 'kěyǐ', pt: 'poder, ser permitido', level: 1, tags: ['verbo'] },
  { hz: '知道', py: 'zhīdào', pt: 'saber', level: 1, tags: ['verbo'] },
  { hz: '认识', py: 'rènshi', pt: 'conhecer (alguém)', level: 1, tags: ['verbo'] },
  { hz: '叫', py: 'jiào', pt: 'chamar-se', level: 1, tags: ['verbo'] },
  { hz: '懂', py: 'dǒng', pt: 'entender, compreender', level: 2, tags: ['verbo'] },
  { hz: '帮', py: 'bāng', pt: 'ajudar', level: 2, tags: ['verbo'] },

  // --- Pessoas e lugares ---
  { hz: '名字', py: 'míngzi', pt: 'nome', level: 1, tags: ['cotidiano'] },
  { hz: '老师', py: 'lǎoshī', pt: 'professor(a)', level: 1, tags: ['cotidiano'] },
  { hz: '学生', py: 'xuésheng', pt: 'aluno(a)', level: 1, tags: ['cotidiano'] },
  { hz: '朋友', py: 'péngyou', pt: 'amigo(a)', level: 1, tags: ['cotidiano'] },
  { hz: '同事', py: 'tóngshì', pt: 'colega de trabalho', level: 2, tags: ['cotidiano'] },
  { hz: '中国', py: 'Zhōngguó', pt: 'China', level: 1, tags: ['cotidiano'] },
  { hz: '巴西', py: 'Bāxī', pt: 'Brasil', level: 1, tags: ['cotidiano'] },
  { hz: '中文', py: 'Zhōngwén', pt: 'chinês (idioma escrito/falado)', level: 1, tags: ['cotidiano'] },
  { hz: '汉语', py: 'Hànyǔ', pt: 'chinês (idioma)', level: 1, tags: ['cotidiano'] },
  { hz: '英语', py: 'Yīngyǔ', pt: 'inglês', level: 1, tags: ['cotidiano'] },
  { hz: '葡萄牙语', py: 'Pútáoyáyǔ', pt: 'português', level: 2, tags: ['cotidiano'] },
  { hz: '饭馆', py: 'fànguǎn', pt: 'restaurante', level: 2, tags: ['cotidiano'] },
  { hz: '学校', py: 'xuéxiào', pt: 'escola', level: 1, tags: ['cotidiano'] },
  { hz: '大学', py: 'dàxué', pt: 'universidade', level: 2, tags: ['cotidiano'] },
  { hz: '家', py: 'jiā', pt: 'casa, família', level: 1, tags: ['cotidiano'] },

  // --- Tempo e frequência ---
  { hz: '今天', py: 'jīntiān', pt: 'hoje', level: 1, tags: ['tempo'] },
  { hz: '明天', py: 'míngtiān', pt: 'amanhã', level: 1, tags: ['tempo'] },
  { hz: '昨天', py: 'zuótiān', pt: 'ontem', level: 1, tags: ['tempo'] },
  { hz: '现在', py: 'xiànzài', pt: 'agora', level: 1, tags: ['tempo'] },
  { hz: '周末', py: 'zhōumò', pt: 'fim de semana', level: 2, tags: ['tempo'] },
  { hz: '星期', py: 'xīngqī', pt: 'semana', level: 1, tags: ['tempo'] },
  { hz: '时间', py: 'shíjiān', pt: 'tempo, horário', level: 1, tags: ['tempo'] },
  { hz: '点', py: 'diǎn', pt: 'hora (no relógio)', level: 1, tags: ['tempo'] },
  { hz: '分钟', py: 'fēnzhōng', pt: 'minuto', level: 1, tags: ['tempo'] },
  { hz: '早上', py: 'zǎoshang', pt: 'manhã', level: 1, tags: ['tempo'] },
  { hz: '中午', py: 'zhōngwǔ', pt: 'meio-dia', level: 1, tags: ['tempo'] },
  { hz: '下午', py: 'xiàwǔ', pt: 'tarde', level: 1, tags: ['tempo'] },
  { hz: '晚上', py: 'wǎnshang', pt: 'noite', level: 1, tags: ['tempo'] },
  { hz: '常常', py: 'chángcháng', pt: 'frequentemente', level: 2, tags: ['tempo'] },
  { hz: '经常', py: 'jīngcháng', pt: 'com frequência', level: 2, tags: ['tempo'] },
  { hz: '一起', py: 'yìqǐ', pt: 'juntos', level: 1, tags: ['tempo', 'conversa'] },
  { hz: '次', py: 'cì', pt: 'vez(es)', level: 1, tags: ['tempo'] },
  { hz: '每', py: 'měi', pt: 'cada', level: 2, tags: ['tempo'] },
  { hz: '每天', py: 'měitiān', pt: 'todos os dias', level: 1, tags: ['tempo'] },
  { hz: '每周', py: 'měi zhōu', pt: 'toda semana', level: 2, tags: ['tempo'] },
  { hz: '两次', py: 'liǎng cì', pt: 'duas vezes', level: 1, tags: ['tempo'] },
  { hz: '计划', py: 'jìhuà', pt: 'plano', level: 2, tags: ['cotidiano'] },
  { hz: '一点儿', py: 'yìdiǎnr', pt: 'um pouco', level: 1, tags: ['base'] },
  { hz: '一会儿', py: 'yíhuìr', pt: 'um instante', level: 2, tags: ['tempo'] },
  { hz: '快', py: 'kuài', pt: 'rápido', level: 1, tags: ['base'] },
  { hz: '慢', py: 'màn', pt: 'devagar', level: 1, tags: ['base'] },

  // --- Expressões de conversa ---
  { hz: '你好', py: 'nǐ hǎo', pt: 'olá', level: 1, tags: ['conversa', 'expressao'] },
  { hz: '好', py: 'hǎo', pt: 'bom, bem', level: 1, tags: ['base'] },
  { hz: '谢谢', py: 'xièxie', pt: 'obrigado', level: 1, tags: ['conversa', 'expressao'] },
  { hz: '不客气', py: 'bù kèqi', pt: 'de nada', level: 1, tags: ['conversa', 'expressao'] },
  { hz: '对不起', py: 'duìbuqǐ', pt: 'desculpe', level: 1, tags: ['conversa', 'expressao'] },
  { hz: '没关系', py: 'méi guānxi', pt: 'não tem problema', level: 1, tags: ['conversa', 'expressao'] },
  { hz: '再见', py: 'zàijiàn', pt: 'até logo', level: 1, tags: ['conversa', 'expressao'] },
  { hz: '请', py: 'qǐng', pt: 'por favor', level: 1, tags: ['conversa'] },
  { hz: '没问题', py: 'méi wèntí', pt: 'sem problema', level: 2, tags: ['conversa', 'expressao'] },
  { hz: '当然', py: 'dāngrán', pt: 'claro, com certeza', level: 2, tags: ['conversa', 'expressao'] },
  { hz: '听不懂', py: 'tīng bu dǒng', pt: 'não entendi (ao ouvir)', level: 2, tags: ['conversa', 'expressao'] },
  { hz: '请再说一遍', py: 'qǐng zài shuō yí biàn', pt: 'por favor, repita', level: 2, tags: ['conversa', 'expressao'] },
  { hz: '说慢一点', py: 'shuō màn yìdiǎn', pt: 'fale mais devagar', level: 2, tags: ['conversa', 'expressao'] },
  { hz: '走吧', py: 'zǒu ba', pt: 'vamos', level: 1, tags: ['conversa', 'expressao'] },
  { hz: '多少钱', py: 'duōshao qián', pt: 'quanto custa', level: 1, tags: ['conversa', 'expressao'] },

  // --- Futebol ---
  { hz: '足球', py: 'zúqiú', pt: 'futebol', level: 1, tags: ['futebol'] },
  { hz: '踢足球', py: 'tī zúqiú', pt: 'jogar futebol', level: 1, tags: ['futebol'] },
  { hz: '踢', py: 'tī', pt: 'chutar', level: 1, tags: ['futebol'] },
  { hz: '球', py: 'qiú', pt: 'bola', level: 1, tags: ['futebol'] },
  { hz: '传球', py: 'chuán qiú', pt: 'passar a bola', level: 2, tags: ['futebol'] },
  { hz: '传给我', py: 'chuán gěi wǒ', pt: 'passa pra mim', level: 2, tags: ['futebol', 'expressao'] },
  { hz: '射门', py: 'shèmén', pt: 'chutar ao gol', level: 2, tags: ['futebol'] },
  { hz: '进球', py: 'jìnqiú', pt: 'fazer gol; gol', level: 2, tags: ['futebol'] },
  { hz: '球门', py: 'qiúmén', pt: 'gol (a trave)', level: 2, tags: ['futebol'] },
  { hz: '守门员', py: 'shǒuményuán', pt: 'goleiro', level: 2, tags: ['futebol'] },
  { hz: '后卫', py: 'hòuwèi', pt: 'zagueiro', level: 3, tags: ['futebol'] },
  { hz: '前锋', py: 'qiánfēng', pt: 'atacante', level: 3, tags: ['futebol'] },
  { hz: '中场', py: 'zhōngchǎng', pt: 'meio-campo', level: 3, tags: ['futebol'] },
  { hz: '球队', py: 'qiúduì', pt: 'time', level: 2, tags: ['futebol'] },
  { hz: '队友', py: 'duìyǒu', pt: 'companheiro de equipe', level: 2, tags: ['futebol'] },
  { hz: '对手', py: 'duìshǒu', pt: 'adversário', level: 3, tags: ['futebol'] },
  { hz: '比赛', py: 'bǐsài', pt: 'partida, competição', level: 2, tags: ['futebol'] },
  { hz: '球场', py: 'qiúchǎng', pt: 'campo (de futebol)', level: 2, tags: ['futebol'] },
  { hz: '裁判', py: 'cáipàn', pt: 'árbitro', level: 3, tags: ['futebol'] },
  { hz: '犯规', py: 'fànguī', pt: 'falta (infração)', level: 3, tags: ['futebol'] },
  { hz: '越位', py: 'yuèwèi', pt: 'impedimento', level: 3, tags: ['futebol'] },
  { hz: '角球', py: 'jiǎoqiú', pt: 'escanteio', level: 3, tags: ['futebol'] },
  { hz: '点球', py: 'diǎnqiú', pt: 'pênalti', level: 3, tags: ['futebol'] },
  { hz: '黄牌', py: 'huángpái', pt: 'cartão amarelo', level: 3, tags: ['futebol'] },
  { hz: '红牌', py: 'hóngpái', pt: 'cartão vermelho', level: 3, tags: ['futebol'] },
  { hz: '上半场', py: 'shàng bànchǎng', pt: 'primeiro tempo', level: 3, tags: ['futebol'] },
  { hz: '下半场', py: 'xià bànchǎng', pt: 'segundo tempo', level: 3, tags: ['futebol'] },
  { hz: '加油', py: 'jiāyóu', pt: 'força!, vamos!', level: 1, tags: ['futebol', 'expressao'] },
  { hz: '好球', py: 'hǎo qiú', pt: 'boa bola!', level: 2, tags: ['futebol', 'expressao'] },
  { hz: '我来', py: 'wǒ lái', pt: 'deixa comigo', level: 2, tags: ['futebol', 'expressao'] },
  { hz: '快点', py: 'kuài diǎn', pt: 'mais rápido', level: 2, tags: ['futebol', 'expressao'] },
  { hz: '小心', py: 'xiǎoxīn', pt: 'cuidado', level: 2, tags: ['futebol', 'expressao'] },
  { hz: '换人', py: 'huànrén', pt: 'substituição', level: 3, tags: ['futebol'] },
  { hz: '平局', py: 'píngjú', pt: 'empate', level: 3, tags: ['futebol'] },
  { hz: '赢', py: 'yíng', pt: 'ganhar', level: 2, tags: ['futebol'] },
  { hz: '输', py: 'shū', pt: 'perder', level: 2, tags: ['futebol'] },
  { hz: '比分', py: 'bǐfēn', pt: 'placar', level: 3, tags: ['futebol'] },
  { hz: '累', py: 'lèi', pt: 'cansado', level: 1, tags: ['futebol', 'cotidiano'] },
  { hz: '受伤', py: 'shòushāng', pt: 'se machucar', level: 3, tags: ['futebol'] },
  { hz: '热身', py: 'rèshēn', pt: 'aquecimento', level: 3, tags: ['futebol'] },
  { hz: '训练', py: 'xùnliàn', pt: 'treino, treinar', level: 2, tags: ['futebol'] },
  { hz: '球鞋', py: 'qiúxié', pt: 'chuteira, tênis de jogo', level: 3, tags: ['futebol'] },
];

/**
 * Registro em tempo de execução.
 *
 * O léxico acima é a base escrita à mão. As entradas que chegam nos pacotes
 * diários gerados por LLM são registradas aqui no carregamento do app, para que
 * a segmentação, o pinyin automático e a detecção de duplicatas melhorem a cada
 * dia em vez de ficarem presas à base inicial.
 *
 * Entradas registradas carregam `source` e `addedAt` — a interface mostra de
 * onde cada palavra veio.
 */
const registry = new Map(LEXICON.map((e) => [e.hz, e]));
let maxLen = LEXICON.reduce((m, e) => Math.max(m, e.hz.length), 1);

/** Índice hanzi -> entrada (base + registradas). Leitura apenas. */
export const LEXICON_BY_HZ = registry;

/** Maior comprimento de entrada, usado pela segmentação longest-match. */
export function maxEntryLen() {
  return maxLen;
}

export function lookup(hz) {
  return registry.get(hz) || null;
}

/** Todas as entradas conhecidas agora, incluindo as registradas em execução. */
export function allEntries() {
  return [...registry.values()];
}

export function byTag(tag) {
  return allEntries().filter((e) => e.tags.includes(tag));
}

/**
 * Registra entradas novas. Entradas já conhecidas são ignoradas (a base escrita
 * à mão nunca é sobrescrita por conteúdo gerado).
 * @returns {object[]} as entradas efetivamente adicionadas
 */
export function registerEntries(entries, { source = 'pacote', addedAt = null } = {}) {
  const added = [];
  for (const raw of entries || []) {
    const hz = String(raw?.hz || '').trim();
    if (!hz || registry.has(hz)) continue;
    const entry = {
      hz,
      py: String(raw.py || '').trim(),
      pt: String(raw.pt || '').trim(),
      level: Number(raw.level) >= 1 && Number(raw.level) <= 3 ? Number(raw.level) : 2,
      tags: Array.isArray(raw.tags) && raw.tags.length ? raw.tags.map(String) : ['gerado'],
      example: raw.example || null,
      source,
      addedAt: addedAt || new Date().toISOString(),
    };
    if (!entry.py || !entry.pt) continue;
    registry.set(hz, entry);
    maxLen = Math.max(maxLen, hz.length);
    added.push(entry);
  }
  return added;
}

/** Só as entradas vindas de fora da base escrita à mão. */
export function extraEntries() {
  return allEntries().filter((e) => e.source);
}

/** Usado pelos testes para voltar ao estado inicial. */
export function resetRegistry() {
  registry.clear();
  for (const e of LEXICON) registry.set(e.hz, e);
  maxLen = LEXICON.reduce((m, e) => Math.max(m, e.hz.length), 1);
}
