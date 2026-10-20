/**
 * Backend falso: devolve um pacote fixo e válido.
 * Serve para testar o pipeline (validação, ingestão, interface) sem gastar
 * chamada de modelo e sem rede.
 */
export const name = 'mock';

export async function generate({ briefing }) {
  const pack = {
    version: 1,
    date: briefing.date,
    focus: {
      reason: 'Pacote de demonstração gerado localmente, sem modelo de linguagem.',
      tags: ['futebol', 'conversa'],
      level: 1,
    },
    vocab: [
      {
        hz: '接球', py: 'jiē qiú', pt: 'receber a bola', level: 2, tags: ['futebol'], status: 'novo',
        example: { hz: '他接球很稳。', py: 'Tā jiē qiú hěn wěn.', pt: 'Ele recebe a bola com firmeza.' },
      },
      {
        hz: '多久一次', py: 'duō jiǔ yí cì', pt: 'com que frequência', level: 2, tags: ['tempo', 'conversa'], status: 'novo',
        example: { hz: '你多久踢一次球？', py: 'Nǐ duō jiǔ tī yí cì qiú?', pt: 'Com que frequência você joga bola?' },
      },
    ],
    dialogue: {
      title: 'Depois do jogo',
      context: 'Dois colegas conversando no vestiário.',
      lines: [
        { speaker: 'A', hz: '你多久踢一次球？', py: 'Nǐ duō jiǔ tī yí cì qiú?', pt: 'Com que frequência você joga?' },
        { speaker: 'B', hz: '我每周踢两次。', py: 'Wǒ měi zhōu tī liǎng cì.', pt: 'Eu jogo duas vezes por semana.' },
      ],
      questions: [
        {
          prompt: 'O que B respondeu?',
          options: ['Que joga duas vezes por semana', 'Que não joga', 'Que jogou ontem', 'Que quer aprender'],
          answer: 0,
          rationale: '每周两次 = duas vezes por semana.',
        },
      ],
    },
    exercises: [
      {
        type: 'cloze', skill: 'grammar', difficulty: 2, tags: ['tempo'], targets: ['gram:frequencia-ci'],
        prompt: 'Complete: 我每周踢 ___ 次足球。', promptHz: '我每周踢 ___ 次足球。',
        options: ['两', '二', '双', '俩'], answer: 0,
        rationale: 'Antes de classificador usa-se 两, não 二.',
      },
      {
        type: 'production', skill: 'writing', difficulty: 2, tags: ['conversa'], targets: ['gram:frequencia-ci', '多久一次'],
        prompt: 'Responda em mandarim com que frequência você joga futebol.',
        rubric: {
          minLength: 6,
          criteria: [
            { id: 'freq', label: 'Indicou frequência (每周 / měi zhōu)', any: ['每周', 'mei zhou'] },
            { id: 'verbo', label: 'Usou 踢 / tī', any: ['踢', 'ti'] },
          ],
        },
      },
    ],
    tonePairs: [
      { a: { hz: '四', py: 'sì', pt: 'quatro' }, b: { hz: '十', py: 'shí', pt: 'dez' }, note: 'Tom 4 descendente contra tom 2 ascendente.' },
    ],
    fieldPhrases: [
      { hz: '好球！', py: 'Hǎo qiú!', pt: 'Boa bola!', when: 'quando um colega acerta um passe' },
    ],
    roleplay: {
      title: 'Depois do jogo',
      situation: 'Um colega novo puxa conversa na saída do campo.',
      turns: [
        {
          partner: { hz: '你经常踢足球吗？', py: 'Nǐ jīngcháng tī zúqiú ma?', pt: 'Você joga futebol com frequência?' },
          task: 'Diga que joga duas vezes por semana.',
          answers: [
            { hz: '我每周踢两次。', py: 'Wǒ měi zhōu tī liǎng cì.', pt: 'Jogo duas vezes por semana.' },
          ],
        },
        {
          partner: { hz: '周末一起踢吧！', py: 'Zhōumò yìqǐ tī ba!', pt: 'Vamos jogar juntos no fim de semana!' },
          task: 'Aceite o convite.',
          answers: [
            { hz: '好啊！', py: 'Hǎo a!', pt: 'Beleza!' },
            { hz: '好，周末见！', py: 'Hǎo, zhōumò jiàn!', pt: 'Combinado, até o fim de semana!' },
          ],
        },
      ],
    },
    grammarNote: {
      pointId: 'frequencia-ci',
      point: 'Frequência com 每…次',
      explanation: 'Para dizer quantas vezes por período: 每 + período + verbo + número + 次.',
      examples: [{ hz: '我每天跑两次。', py: 'Wǒ měitiān pǎo liǎng cì.', pt: 'Eu corro duas vezes por dia.' }],
    },
    coachNotes: ['Pacote de demonstração: use --backend=claude-code para gerar conteúdo de verdade.'],
  };
  return { text: JSON.stringify(pack), meta: { backend: 'mock', model: 'mock', costUsd: 0 } };
}
