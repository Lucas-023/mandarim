/**
 * Monta o briefing enviado ao modelo.
 *
 * Princípios:
 *  - Mínimo necessário: só o que muda o conteúdo gerado.
 *  - Auditável: o gerador salva uma cópia exata em data/outbox/ antes de enviar.
 *  - Sem dados pessoais desnecessários: nome não vai; o texto livre das conversas
 *    vai apenas no campo `gaps`, truncado, porque é justamente o que define o que
 *    precisa ser ensinado. `includeGaps: false` corta até isso.
 */
import { estimateAllSkills } from './skills.js';
import { latestAttempt, difficultiesByTag } from './placement.js';
import { errorTags } from './exercises.js';
import { LEXICON, lookup } from './content/lexicon.js';
import { QUESTIONS } from './content/questions.js';
import { frasesTravadas } from './fala.js';
import { dayKey } from './xp.js';
import { dueItems, upcomingItems, leeches, scheduleStats, seenGrammarIds, isGrammarRef, grammarIdFromRef } from './schedule.js';
import { nextGrammarPoints, grammarProgress, grammarPoint } from './content/grammar.js';

const MAX_GAPS = 5;
const MAX_ERROR_ITEMS = 25;
const MAX_SEEN = 400;
const MAX_RECENT_VOCAB = 300;
const MAX_CANDIDATES = 30;
const SEM_OBJETIVO = 99;

/** Teto de nível da fila gramatical para cada resultado do nivelamento. */
function nivelMaximoGramatica(levelCode) {
  return { iniciante: 1, hsk1: 1, hsk1_plus: 2, hsk2_aprox: 3 }[levelCode] || 2;
}

/** Temas do léxico que cada objetivo puxa para a frente, na ordem de prioridade do perfil. */
const TAGS_POR_OBJETIVO = {
  futebol: ['futebol'],
  conversar_simples: ['conversa', 'expressao', 'pergunta'],
  ouvir_cotidiano: ['cotidiano', 'tempo'],
};

/**
 * Palavras que o aluno já ENCONTROU, com evidência registrada: apresentadas por
 * um pacote ou cobradas num exercício (agendador), aprovadas como cartão, ou
 * acertadas no nivelamento.
 *
 * O léxico base NÃO entra: ele é o dicionário do app, não o que o aluno sabe.
 * Mandá-lo inteiro como "conhecido" fazia o modelo nunca ensinar 传球, 守门员,
 * 换人… e ainda usá-las em frases como se fossem sabidas.
 */
export function palavrasVistas(state) {
  const doNivelamento = [];
  const porId = new Map(QUESTIONS.map((q) => [q.id, q]));
  for (const tentativa of state.placementAttempts || []) {
    for (const r of tentativa.responses || []) {
      const q = porId.get(r.questionId);
      if (r.correct && q?.skill === 'vocabulary' && q.promptHz && lookup(q.promptHz)) doNivelamento.push(q.promptHz);
    }
  }
  const doAgendador = Object.values(state.schedule?.items || {})
    .filter((i) => i.type === 'word')
    .sort((a, b) => String(a.introducedAt).localeCompare(String(b.introducedAt)))
    .map((i) => i.ref);
  const dosCartoes = (state.cardDrafts || [])
    .filter((d) => d.status === 'approved' || d.status === 'exported')
    .map((d) => d.front);
  return dedupe([...doNivelamento, ...doAgendador, ...dosCartoes]);
}

/**
 * Vocabulário curado (léxico base) que o aluno ainda não encontrou, ordenado
 * em rodízio entre os objetivos do perfil (na ordem de prioridade) e, dentro de
 * cada um, do nível mais fácil ao mais difícil. É a sugestão de palavras novas.
 * Palavras sem tema de objetivo (我, 是…) vão para o fim: quase certamente ele
 * já sabe, só não há evidência registrada.
 */
export function palavrasCandidatas(state, { excluir = [], maxLevel = 2, limite = MAX_CANDIDATES } = {}) {
  const fora = new Set(excluir);
  const objetivos = (state.profile?.goals || []).slice().sort((a, b) => a.priority - b.priority).map((g) => g.id);
  const rankTag = new Map();
  objetivos.forEach((id, i) => {
    for (const tag of TAGS_POR_OBJETIVO[id] || []) if (!rankTag.has(tag)) rankTag.set(tag, i);
  });
  const rank = (e) => Math.min(SEM_OBJETIVO, ...e.tags.map((t) => rankTag.get(t) ?? SEM_OBJETIVO));

  // Um grupo por objetivo, cada um do mais fácil ao mais difícil. Rodízio entre
  // os grupos: senão o primeiro objetivo ocupa todas as vagas e o futebol some.
  const grupos = new Map();
  for (const e of LEXICON.filter((x) => !fora.has(x.hz) && x.level <= maxLevel + 1)) {
    const r = rank(e);
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(e);
  }
  const filas = [...grupos.entries()]
    .filter(([r]) => r !== SEM_OBJETIVO)
    .sort(([a], [b]) => a - b)
    .map(([, lista]) => lista.sort((a, b) => a.level - b.level));
  const saida = [];
  while (saida.length < limite && filas.some((f) => f.length)) {
    for (const f of filas) if (f.length && saida.length < limite) saida.push(f.shift());
  }
  for (const e of (grupos.get(SEM_OBJETIVO) || []).sort((a, b) => a.level - b.level)) {
    if (saida.length >= limite) break;
    saida.push(e);
  }
  return saida.map((e) => ({ hz: e.hz, py: e.py, pt: e.pt, level: e.level, tags: e.tags }));
}

export function buildBriefing(state, { date = dayKey(), includeGaps = true, recentPacks = [] } = {}) {
  const attempt = latestAttempt(state);
  const skills = estimateAllSkills(state);

  // Itens errados recentemente — o alvo principal do pacote do dia.
  const missed = [];
  for (const result of state.exerciseResults.slice(-12)) {
    for (const item of result.items) {
      if (!item.correct) missed.push({ ref: item.ref, skill: item.skill, tags: item.tags });
    }
  }
  const missedCounts = new Map();
  for (const m of missed) {
    const entry = missedCounts.get(m.ref) || { ref: m.ref, skill: m.skill, tags: m.tags, misses: 0 };
    entry.misses += 1;
    missedCounts.set(m.ref, entry);
  }

  const placementTags = attempt ? difficultiesByTag(attempt.responses) : [];
  const combined = new Map();
  for (const src of [placementTags, errorTags(state)]) {
    for (const t of src) {
      const e = combined.get(t.tag) || { tag: t.tag, items: 0, misses: 0 };
      e.items += t.items;
      e.misses += t.misses;
      combined.set(t.tag, e);
    }
  }
  const weakTags = [...combined.values()]
    .filter((t) => t.items >= 2 && t.misses / t.items >= 0.4)
    .sort((a, b) => b.misses / b.items - a.misses / a.items)
    .slice(0, 4)
    .map((t) => ({ tag: t.tag, misses: t.misses, items: t.items }));

  // O que o aluno já encontrou (com evidência) e o que os pacotes recentes já deram.
  const seen = palavrasVistas(state);
  const alreadyGiven = recentPacks
    .flatMap((p) => (p.vocab || []).map((v) => v.hz))
    .slice(-MAX_RECENT_VOCAB);

  // ---- Revisão: o que o agendador diz que precisa voltar hoje ----
  const due = dueItems(state, { today: date, limit: 30 });
  const stats = scheduleStats(state, { today: date });
  const seenGrammar = seenGrammarIds(state);
  const dueGrammar = due.filter((i) => isGrammarRef(i.ref)).map((i) => {
    const point = grammarPoint(grammarIdFromRef(i.ref));
    return {
      id: grammarIdFromRef(i.ref),
      name: point?.name || i.label,
      pattern: point?.pattern || null,
      overdueDays: i.overdueDays,
      lapses: i.lapses,
    };
  });
  const maxLevel = nivelMaximoGramatica(attempt?.result?.overall?.code);
  const nextGrammar = nextGrammarPoints(seenGrammar, { limit: 2, maxLevel });

  const gaps = includeGaps
    ? state.conversations
        .slice(-MAX_GAPS)
        .map((c) => ({ context: c.context, difficulty: c.perceivedDifficulty, couldNotSay: truncate(c.couldNotSay, 240) }))
        .filter((c) => c.couldNotSay)
    : [];

  const newExpressions = state.conversations
    .slice(-MAX_GAPS)
    .flatMap((c) => c.newExpressions || [])
    .slice(-20);

  return {
    date,
    level: attempt
      ? { code: attempt.result.overall.code, label: attempt.result.overall.label }
      : { code: 'desconhecido', label: 'nivelamento não feito' },
    minutesPerDay: state.profile.minutesPerDay,
    goals: state.profile.goals.map((g) => g.id),
    focusTags: state.plan?.focusTags || [],
    skills: skills.map((s) => ({
      skill: s.skill,
      status: s.status,
      evidenceCount: s.evidenceCount,
      // `score` vai como contexto de dificuldade, não como alvo a ser alterado.
      score: s.score,
    })),
    weakTags,
    missedItems: [...missedCounts.values()].sort((a, b) => b.misses - a.misses).slice(0, MAX_ERROR_ITEMS),
    conversationGaps: gaps,
    recentExpressions: newExpressions,
    seenWords: seen.slice(-MAX_SEEN),
    alreadyTaught: dedupe(alreadyGiven),
    candidateWords: palavrasCandidatas(state, { excluir: [...seen, ...alreadyGiven], maxLevel }),
    // Autoavaliação da prática de fala: frases que ele tentou dizer e travou.
    speakingStuck: frasesTravadas(state, { hoje: date }),
    notAssessed: skills.filter((s) => s.status === 'nao_avaliada').map((s) => s.skill),

    // Revisão espaçada
    review: {
      stats,
      dueWords: due
        .filter((i) => !isGrammarRef(i.ref))
        .slice(0, 20)
        .map((i) => ({ hz: i.ref, overdueDays: i.overdueDays, lapses: i.lapses, intervalDays: i.intervalDays })),
      dueGrammar,
      leeches: leeches(state, { limit: 8 }).map((i) => ({ ref: i.ref, label: i.label, lapses: i.lapses })),
      upcoming: upcomingItems(state, { today: date, days: 3, limit: 15 }).map((i) => ({ ref: i.ref, due: i.due })),
    },

    // Progressão gramatical
    grammar: {
      seen: seenGrammar,
      progress: grammarProgress(seenGrammar),
      nextInSyllabus: nextGrammar.map((g) => ({ id: g.id, name: g.name, pattern: g.pattern, hint: g.hint, level: g.level })),
    },
  };
}

/**
 * Briefing feito por uma versão antiga do app (antes de `seenWords`): ela mandava
 * o léxico inteiro em `knownWords`. O celular só pega a versão nova na segunda
 * abertura, então o computador converte o que chegar no formato antigo, com o
 * que dá para reconstruir do próprio briefing (itens devidos, próximos e errados).
 */
export function atualizarBriefingAntigo(briefing) {
  if (!briefing || !('knownWords' in briefing) || 'seenWords' in briefing) return briefing;
  const { knownWords, ...resto } = briefing;
  const seen = dedupe([
    ...(resto.missedItems || []).map((m) => m.ref),
    ...(resto.review?.dueWords || []).map((w) => w.hz),
    ...(resto.review?.upcoming || []).map((u) => u.ref).filter((r) => !isGrammarRef(r)),
  ]);
  const perfil = { profile: { goals: (resto.goals || []).map((id, i) => ({ id, priority: i + 1 })) } };
  return {
    ...resto,
    seenWords: seen,
    candidateWords: palavrasCandidatas(perfil, {
      excluir: [...seen, ...(resto.alreadyTaught || [])],
      maxLevel: nivelMaximoGramatica(resto.level?.code),
    }),
    speakingStuck: resto.speakingStuck || [],
  };
}

/**
 * Acrescenta ao briefing o que pacotes anteriores já ensinaram e o aparelho
 * ainda não tinha recebido quando montou o pedido.
 *
 * Por que: o celular pede hoje e amanhã de uma vez. Os dois pedidos saem antes
 * de o pacote de hoje existir, então o de amanhã não sabe o que o de hoje
 * ensinou — e o modelo repetia a mesma estrutura e as mesmas palavras como
 * novas (aconteceu: 是 ensinado em 14/10 e de novo em 15/10). Quem gera os dois
 * é o computador, então é ele que completa o pedido. Idempotente: pacote que o
 * aparelho já tinha não muda nada.
 */
export function incorporarPacotesAnteriores(briefing, pacotes = []) {
  const anteriores = pacotes
    .filter((p) => p?.date && p.date < briefing.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!anteriores.length) return { briefing, incorporados: [] };

  const ensinadas = anteriores.flatMap((p) => (p.vocab || []).map((v) => v.hz));
  const alreadyTaught = dedupe([...(briefing.alreadyTaught || []), ...ensinadas]).slice(-MAX_RECENT_VOCAB);
  const seenGram = dedupe([
    ...(briefing.grammar?.seen || []),
    ...anteriores.map((p) => p.grammarNote?.pointId).filter((id) => id && grammarPoint(id)),
  ]);
  const maxLevel = nivelMaximoGramatica(briefing.level?.code);
  const fora = new Set([...alreadyTaught, ...(briefing.seenWords || [])]);

  return {
    briefing: {
      ...briefing,
      alreadyTaught,
      candidateWords: (briefing.candidateWords || []).filter((c) => !fora.has(c.hz)),
      grammar: {
        ...briefing.grammar,
        seen: seenGram,
        progress: grammarProgress(seenGram),
        nextInSyllabus: nextGrammarPoints(seenGram, { limit: 2, maxLevel })
          .map((g) => ({ id: g.id, name: g.name, pattern: g.pattern, hint: g.hint, level: g.level })),
      },
    },
    incorporados: anteriores.map((p) => p.date),
  };
}

function dedupe(list) {
  return [...new Set(list.filter(Boolean))];
}

function truncate(text, max) {
  const t = String(text || '').trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** Resumo legível de uma linha, para o log e para a interface. */
export function describeBriefing(b) {
  return (
    `nível ${b.level.code}; ${b.missedItems.length} item(ns) errado(s) recentemente; ` +
    `${b.review.dueWords.length} palavra(s) e ${b.review.dueGrammar.length} estrutura(s) devidas; ` +
    `gramática ${b.grammar.progress.done}/${b.grammar.progress.total}, próxima: ` +
    `${b.grammar.nextInSyllabus[0]?.name || '—'}; ` +
    `temas fracos: ${b.weakTags.map((t) => t.tag).join(', ') || 'nenhum'}; ` +
    `${b.conversationGaps.length} lacuna(s) de conversa` +
    (b.speakingStuck?.length ? `; ${b.speakingStuck.length} frase(s) travada(s) na fala` : '')
  );
}
