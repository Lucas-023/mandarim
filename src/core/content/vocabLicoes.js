/**
 * Vocabulário das lições 1–5 do livro do curso, transcrito da lista que o
 * aluno trouxe (vocab.png na raiz do projeto). É o conteúdo da aba
 * "Vocabulário" (ver core/vocab.js).
 *
 * A ordem dentro de cada lição é a da lista original: é a ordem em que os
 * cartões novos aparecem. Pinyin e tradução foram escritos à mão; `nota`
 * só onde a tradução sozinha engana (partículas, classificadores, pares
 * fáceis de confundir como 二/两, 几/多少, 你/您).
 *
 * Observação: na lista original o 你 aparece duas vezes seguidas na lição 1.
 * Ficou uma só, porque repetir a palavra criaria dois cartões iguais.
 */
export const LICOES = [
  {
    numero: 1,
    titulo: '你好',
    palavras: [
      { hanzi: '你', pinyin: 'nǐ', pt: 'você' },
      { hanzi: '您', pinyin: 'nín', pt: 'o senhor / a senhora', nota: 'Forma respeitosa de 你.' },
      { hanzi: '零', pinyin: 'líng', pt: 'zero' },
      { hanzi: '一', pinyin: 'yī', pt: 'um' },
      { hanzi: '二', pinyin: 'èr', pt: 'dois', nota: 'Para contar e em números; antes de classificador usa-se 两.' },
      { hanzi: '五', pinyin: 'wǔ', pt: 'cinco' },
      { hanzi: '八', pinyin: 'bā', pt: 'oito' },
    ],
  },
  {
    numero: 2,
    titulo: '你是哪国人',
    palavras: [
      { hanzi: '早上', pinyin: 'zǎoshang', pt: 'manhã (cedo)', nota: '早上好 = bom dia.' },
      { hanzi: '是', pinyin: 'shì', pt: 'ser' },
      { hanzi: '哪', pinyin: 'nǎ', pt: 'qual?' },
      { hanzi: '国', pinyin: 'guó', pt: 'país' },
      { hanzi: '人', pinyin: 'rén', pt: 'pessoa' },
      { hanzi: '我', pinyin: 'wǒ', pt: 'eu' },
      { hanzi: '呢', pinyin: 'ne', pt: 'e (você)?', nota: 'Partícula que devolve a pergunta: 我是巴西人，你呢？' },
      { hanzi: '他', pinyin: 'tā', pt: 'ele' },
      { hanzi: '美国', pinyin: 'Měiguó', pt: 'Estados Unidos' },
      { hanzi: '韩国', pinyin: 'Hánguó', pt: 'Coreia do Sul' },
      { hanzi: '日本', pinyin: 'Rìběn', pt: 'Japão' },
      { hanzi: '三', pinyin: 'sān', pt: 'três' },
      { hanzi: '四', pinyin: 'sì', pt: 'quatro' },
      { hanzi: '十', pinyin: 'shí', pt: 'dez' },
    ],
  },
  {
    numero: 3,
    titulo: '你叫什么名字',
    palavras: [
      { hanzi: '请问', pinyin: 'qǐngwèn', pt: 'com licença, posso perguntar…?' },
      { hanzi: '请', pinyin: 'qǐng', pt: 'por favor; convidar' },
      { hanzi: '问', pinyin: 'wèn', pt: 'perguntar' },
      { hanzi: '叫', pinyin: 'jiào', pt: 'chamar-se' },
      { hanzi: '什么', pinyin: 'shénme', pt: 'o quê? / que?' },
      { hanzi: '名字', pinyin: 'míngzi', pt: 'nome' },
      { hanzi: '姓', pinyin: 'xìng', pt: 'ter o sobrenome; sobrenome' },
      { hanzi: '认识', pinyin: 'rènshi', pt: 'conhecer (alguém)' },
      { hanzi: '很', pinyin: 'hěn', pt: 'muito' },
      { hanzi: '高兴', pinyin: 'gāoxìng', pt: 'contente' },
      { hanzi: '也', pinyin: 'yě', pt: 'também' },
      { hanzi: '老师', pinyin: 'lǎoshī', pt: 'professor(a)' },
      { hanzi: '贵姓', pinyin: 'guìxìng', pt: 'qual o seu sobrenome? (formal)', nota: '您贵姓？ — jeito educado de perguntar o sobrenome.' },
      { hanzi: '六', pinyin: 'liù', pt: 'seis' },
      { hanzi: '七', pinyin: 'qī', pt: 'sete' },
      { hanzi: '九', pinyin: 'jiǔ', pt: 'nove' },
    ],
  },
  {
    numero: 4,
    titulo: '你学习法语吗',
    palavras: [
      { hanzi: '留学生', pinyin: 'liúxuéshēng', pt: 'estudante estrangeiro' },
      { hanzi: '她', pinyin: 'tā', pt: 'ela' },
      { hanzi: '学习', pinyin: 'xuéxí', pt: 'estudar' },
      { hanzi: '他们', pinyin: 'tāmen', pt: 'eles' },
      { hanzi: '们', pinyin: 'men', pt: 'sufixo de plural', nota: 'Para pessoas: 我们, 你们, 他们, 老师们.' },
      { hanzi: '一起', pinyin: 'yìqǐ', pt: 'juntos' },
      { hanzi: '上课', pinyin: 'shàngkè', pt: 'ter aula' },
      { hanzi: '说', pinyin: 'shuō', pt: 'falar; dizer' },
      { hanzi: '法国', pinyin: 'Fǎguó', pt: 'França' },
      { hanzi: '汉语', pinyin: 'Hànyǔ', pt: 'língua chinesa' },
      { hanzi: '泰国', pinyin: 'Tàiguó', pt: 'Tailândia' },
      { hanzi: '吗', pinyin: 'ma', pt: 'partícula de pergunta (sim/não)', nota: 'Vai no fim da frase: 你是老师吗？' },
      { hanzi: '不', pinyin: 'bù', pt: 'não' },
      { hanzi: '中国', pinyin: 'Zhōngguó', pt: 'China' },
      { hanzi: '英语', pinyin: 'Yīngyǔ', pt: 'inglês (língua)' },
      { hanzi: '法语', pinyin: 'Fǎyǔ', pt: 'francês (língua)' },
      { hanzi: '谁', pinyin: 'shéi', pt: 'quem?' },
      { hanzi: '同学', pinyin: 'tóngxué', pt: 'colega de classe' },
    ],
  },
  {
    numero: 5,
    titulo: '你家有几口人',
    palavras: [
      { hanzi: '家', pinyin: 'jiā', pt: 'casa; família' },
      { hanzi: '有', pinyin: 'yǒu', pt: 'ter; haver' },
      { hanzi: '口', pinyin: 'kǒu', pt: 'boca; classificador para membros da família', nota: '你家有几口人？ — Quantas pessoas há na sua família?' },
      { hanzi: '爸爸', pinyin: 'bàba', pt: 'pai' },
      { hanzi: '妈妈', pinyin: 'māma', pt: 'mãe' },
      { hanzi: '哥哥', pinyin: 'gēge', pt: 'irmão mais velho' },
      { hanzi: '和', pinyin: 'hé', pt: 'e (entre substantivos)', nota: 'Liga nomes (爸爸和妈妈), não frases.' },
      { hanzi: '职员', pinyin: 'zhíyuán', pt: 'funcionário (de escritório)' },
      { hanzi: '都', pinyin: 'dōu', pt: 'todos; ambos', nota: 'Vem antes do verbo: 我们都是学生.' },
      { hanzi: '大学生', pinyin: 'dàxuéshēng', pt: 'universitário' },
      { hanzi: '几', pinyin: 'jǐ', pt: 'quantos? (número pequeno)', nota: 'Espera resposta até ~10; para qualquer quantidade, 多少.' },
      { hanzi: '做', pinyin: 'zuò', pt: 'fazer' },
      { hanzi: '工作', pinyin: 'gōngzuò', pt: 'trabalhar; trabalho' },
      { hanzi: '律师', pinyin: 'lǜshī', pt: 'advogado(a)' },
      { hanzi: '医生', pinyin: 'yīshēng', pt: 'médico(a)' },
      { hanzi: '你们', pinyin: 'nǐmen', pt: 'vocês' },
      { hanzi: '班', pinyin: 'bān', pt: 'turma' },
      { hanzi: '多少', pinyin: 'duōshao', pt: 'quanto(s)?', nota: 'Qualquer quantidade; para números pequenos, 几.' },
      { hanzi: '个', pinyin: 'gè', pt: 'classificador geral', nota: 'Entre número e substantivo: 三个学生.' },
      { hanzi: '学生', pinyin: 'xuésheng', pt: 'estudante' },
      { hanzi: '我们', pinyin: 'wǒmen', pt: 'nós' },
      { hanzi: '两', pinyin: 'liǎng', pt: 'dois (antes de classificador)', nota: '两个人, não 二个人.' },
    ],
  },
];

/** Todas as palavras, em ordem de lição, com o número da lição anexado. */
export const PALAVRAS = LICOES.flatMap((l) => l.palavras.map((p) => ({ ...p, licao: l.numero })));
