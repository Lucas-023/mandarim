/**
 * Currículo de estruturas gramaticais, em ordem de progressão.
 *
 * Por que existe: "ver uma estrutura nova por dia" não pode depender do humor do
 * modelo. A ordem abaixo é a fila. O gerador recebe quais pontos você já viu e
 * qual é o próximo da fila, e ensina esse — então a progressão é previsível e
 * nada é sorteado nem repetido como se fosse novo.
 *
 * O modelo escreve a explicação e os exemplos; aqui ficam só a ordem, o padrão
 * e uma dica curta, para o pedido ao modelo ser preciso.
 *
 * `level`: 1 ≈ HSK1, 2 ≈ HSK2, 3 ≈ acima. `tags`: onde a estrutura é útil.
 */
export const GRAMMAR_SYLLABUS = [
  { id: 'shi-a-b', name: '是 — A é B', pattern: 'A + 是 + B', hint: 'identidade; negativo com 不是', level: 1, tags: ['base', 'apresentacao'] },
  { id: 'de-posse', name: '的 — posse e atributo', pattern: 'A + 的 + substantivo', hint: 'meu, do time, da escola', level: 1, tags: ['base'] },
  { id: 'ma-pergunta', name: '吗 — pergunta de sim/não', pattern: 'frase + 吗？', hint: 'transforma afirmação em pergunta', level: 1, tags: ['pergunta'] },
  { id: 'palavras-interrogativas', name: 'Palavras interrogativas', pattern: '什么 / 谁 / 哪儿 / 怎么 no lugar da resposta', hint: 'a ordem da frase não muda', level: 1, tags: ['pergunta'] },
  { id: 'bu-negacao', name: '不 — negação', pattern: '不 + verbo/adjetivo', hint: 'presente e futuro; 不是, 不去', level: 1, tags: ['base'] },
  { id: 'hen-adjetivo', name: '很 + adjetivo (sem 是)', pattern: 'sujeito + 很 + adjetivo', hint: 'erro comum: 我是累 em vez de 我很累', level: 1, tags: ['base'] },
  { id: 'you-existencia', name: '有 / 没有', pattern: 'sujeito + 有 + objeto', hint: 'ter e haver; negativo só com 没', level: 1, tags: ['base'] },
  { id: 'zai-lugar', name: '在 + lugar', pattern: 'sujeito + 在 + lugar', hint: 'estar em; 在球场', level: 1, tags: ['base', 'futebol'] },
  { id: 'mei-negacao-passado', name: '没(有) — negar o passado', pattern: '没 + verbo', hint: 'não fiz; contrasta com 不', level: 1, tags: ['tempo'] },
  { id: 'le-concluido', name: '了 — ação concluída', pattern: 'verbo + 了', hint: 'já aconteceu; 我踢了', level: 1, tags: ['tempo'] },
  { id: 'tempo-antes-verbo', name: 'Tempo antes do verbo', pattern: 'sujeito + tempo + verbo', hint: '我明天去, nunca 我去明天', level: 1, tags: ['tempo'] },
  { id: 'yao-xiang', name: '要 / 想 + verbo', pattern: '想/要 + verbo', hint: 'querer fazer; 想 é mais brando', level: 1, tags: ['conversa'] },
  { id: 'hui-neng-keyi', name: '会 / 能 / 可以', pattern: '会/能/可以 + verbo', hint: 'saber fazer, conseguir, ter permissão', level: 1, tags: ['conversa'] },
  { id: 'xihuan', name: '喜欢 + verbo/substantivo', pattern: '喜欢 + objeto ou verbo', hint: '喜欢踢足球', level: 1, tags: ['conversa', 'futebol'] },
  { id: 'classificador-ge', name: 'Número + classificador + substantivo', pattern: 'número + 个/场/个人 + substantivo', hint: 'nunca número direto no substantivo', level: 1, tags: ['base'] },
  { id: 'liang-vs-er', name: '两 vs 二', pattern: '两 + classificador', hint: '两次, 两个; 二 só em números soltos', level: 1, tags: ['base'] },
  { id: 'ye-dou', name: '也 / 都 — posição', pattern: 'sujeito + 也/都 + verbo', hint: 'vêm antes do verbo, não no fim', level: 1, tags: ['base'] },
  { id: 'he-gen-yiqi', name: '跟/和 … 一起 + verbo', pattern: 'A + 跟 + B + 一起 + verbo', hint: 'fazer junto com alguém', level: 1, tags: ['conversa', 'futebol'] },
  { id: 'ba-sugestao', name: '吧 — sugestão e suavização', pattern: 'frase + 吧', hint: '走吧, 一起踢吧', level: 1, tags: ['conversa'] },
  { id: 'frequencia-ci', name: 'Frequência: 每 + período + número + 次', pattern: '每周 + verbo + número + 次', hint: '我每周踢两次', level: 2, tags: ['tempo', 'futebol'] },
  { id: 'duoshao-ji', name: '多少 / 几', pattern: '几 + classificador / 多少 + substantivo', hint: '几 para pouco, 多少 para muito', level: 2, tags: ['pergunta'] },
  { id: 'zai-progressivo', name: '在 + verbo — ação em curso', pattern: '(正)在 + verbo + (呢)', hint: '他在踢球呢', level: 2, tags: ['tempo'] },
  { id: 'guo-experiencia', name: '过 — já fez alguma vez', pattern: 'verbo + 过', hint: '我去过中国', level: 2, tags: ['tempo'] },
  { id: 'yidianr', name: '一点儿 / 有点儿', pattern: 'adjetivo + 一点儿 / 有点儿 + adjetivo', hint: '说慢一点儿; 有点儿累', level: 2, tags: ['conversa'] },
  { id: 'tai-le', name: '太…了', pattern: '太 + adjetivo + 了', hint: '太累了, 太好了', level: 2, tags: ['conversa'] },
  { id: 'a-nao-a', name: 'Pergunta A-não-A', pattern: '会不会 / 能不能 / 累不累', hint: 'alternativa ao 吗', level: 2, tags: ['pergunta', 'futebol'] },
  { id: 'yixia', name: '一下 — fazer rapidinho', pattern: 'verbo + 一下', hint: '等一下, 休息一下', level: 2, tags: ['conversa'] },
  { id: 'verbo-reduplicado', name: 'Reduplicação do verbo', pattern: 'verbo + verbo', hint: '看看, 休息休息: tom informal e breve', level: 2, tags: ['conversa'] },
  { id: 'gei-beneficiario', name: '给 — para quem', pattern: 'verbo + 给 + pessoa', hint: '传给我, 给我看', level: 2, tags: ['futebol', 'conversa'] },
  { id: 'de-grau', name: '得 — complemento de grau', pattern: 'verbo + 得 + adjetivo', hint: '他踢得很好', level: 2, tags: ['futebol'] },
  { id: 'bi-comparacao', name: '比 — comparação', pattern: 'A + 比 + B + adjetivo', hint: '他比我快', level: 2, tags: ['conversa', 'futebol'] },
  { id: 'gen-yiyang', name: '跟…一样', pattern: 'A + 跟 + B + 一样 + adjetivo', hint: 'igual a', level: 2, tags: ['conversa'] },
  { id: 'zui', name: '最 — superlativo', pattern: '最 + adjetivo', hint: '最好的球员', level: 2, tags: ['conversa'] },
  { id: 'resultativo-wan-dong', name: 'Complemento resultativo: 完 / 懂 / 到', pattern: 'verbo + 完/懂/到', hint: '听懂, 吃完, 看到', level: 2, tags: ['base'] },
  { id: 'direcional-lai-qu', name: 'Complemento direcional 来/去', pattern: 'verbo + 来/去', hint: '回来, 进去, 过来', level: 2, tags: ['base'] },
  { id: 'yinwei-suoyi', name: '因为…所以', pattern: '因为 + causa + 所以 + consequência', hint: 'explicar motivo', level: 2, tags: ['conversa'] },
  { id: 'suiran-danshi', name: '虽然…但是', pattern: '虽然 + A + 但是 + B', hint: 'contraste', level: 2, tags: ['conversa'] },
  { id: 'ruguo-jiu', name: '如果…就', pattern: '如果 + condição + 就 + resultado', hint: 'condicional', level: 2, tags: ['conversa'] },
  { id: 'kuai-yao-le', name: '快要…了', pattern: '快要 + verbo + 了', hint: 'está quase acontecendo', level: 2, tags: ['tempo'] },
  { id: 'duration-tempo', name: 'Duração depois do verbo', pattern: 'verbo + duração', hint: '踢了两个小时', level: 3, tags: ['tempo', 'futebol'] },
  { id: 'ba-construcao', name: '把 — mover o objeto para antes do verbo', pattern: '把 + objeto + verbo + resultado', hint: '把球传给他', level: 3, tags: ['futebol'] },
  { id: 'bei-passiva', name: '被 — passiva', pattern: 'A + 被 + B + verbo', hint: '他被裁判罚了', level: 3, tags: ['futebol'] },
  { id: 'shi-de-enfase', name: '是…的 — ênfase', pattern: '是 + elemento enfatizado + 的', hint: '我是昨天来的', level: 3, tags: ['conversa'] },
  { id: 'yibian-yibian', name: '一边…一边', pattern: '一边 + A + 一边 + B', hint: 'duas ações ao mesmo tempo', level: 3, tags: ['conversa'] },
  { id: 'yue-lai-yue', name: '越来越', pattern: '越来越 + adjetivo', hint: 'cada vez mais', level: 3, tags: ['conversa'] },
  { id: 'lian-ye', name: '连…也/都', pattern: '连 + X + 也/都', hint: 'até mesmo X', level: 3, tags: ['conversa'] },
  { id: 'chule-yiwai', name: '除了…以外', pattern: '除了 + X + 以外，还/都', hint: 'além de X', level: 3, tags: ['conversa'] },
  { id: 'dui-direcao', name: '对 — direcionado a', pattern: '对 + alguém/algo + verbo', hint: '对我说, 对足球感兴趣', level: 3, tags: ['conversa'] },
  { id: 'keneng-yinggai', name: '可能 / 应该 — probabilidade e dever', pattern: '可能/应该 + verbo', hint: '他应该来, 可能下雨', level: 3, tags: ['conversa'] },
  { id: 'jiu-cai', name: '就 / 才 — antes e depois do esperado', pattern: '就 / 才 + verbo', hint: '他七点就来了 vs 他九点才来', level: 3, tags: ['tempo'] },
];

export const GRAMMAR_BY_ID = new Map(GRAMMAR_SYLLABUS.map((g) => [g.id, g]));

export function grammarPoint(id) {
  return GRAMMAR_BY_ID.get(id) || null;
}

/**
 * Próximos pontos da fila que ainda não foram ensinados.
 * A fila respeita o nível: nada de nível acima do `maxLevel` enquanto houver
 * pontos mais simples pendentes.
 */
export function nextGrammarPoints(seenIds = [], { limit = 2, maxLevel = 3 } = {}) {
  const seen = new Set(seenIds);
  const pending = GRAMMAR_SYLLABUS.filter((g) => !seen.has(g.id));
  const atLevel = pending.filter((g) => g.level <= maxLevel);
  return (atLevel.length ? atLevel : pending).slice(0, limit);
}

export function grammarProgress(seenIds = []) {
  const seen = new Set(seenIds);
  const done = GRAMMAR_SYLLABUS.filter((g) => seen.has(g.id)).length;
  return {
    done,
    total: GRAMMAR_SYLLABUS.length,
    percent: Math.round((done / GRAMMAR_SYLLABUS.length) * 100),
  };
}
