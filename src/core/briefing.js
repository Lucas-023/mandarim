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
import { allEntries } from './content/lexicon.js';
import { dayKey } from './xp.js';
import { dueItems, upcomingItems, leeches, scheduleStats, seenGrammarIds, isGrammarRef, grammarIdFromRef } from './schedule.js';
import { nextGrammarPoints, grammarProgress, grammarPoint } from './content/grammar.js';

const MAX_GAPS = 5;
const MAX_ERROR_ITEMS = 25;
const MAX_KNOWN = 400;
const MAX_RECENT_VOCAB = 300;

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

  // Vocabulário que o sistema já conhece — evita repetir o que já existe.
  const known = [
    ...allEntries().map((e) => e.hz),
    ...state.cardDrafts.filter((d) => d.status === 'approved' || d.status === 'exported').map((d) => d.front),
  ];
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
  const maxLevel = { iniciante: 1, hsk1: 1, hsk1_plus: 2, hsk2_aprox: 3 }[attempt?.result?.overall?.code] || 2;
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
    knownWords: dedupe(known).slice(-MAX_KNOWN),
    alreadyTaught: dedupe(alreadyGiven),
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
    `${b.conversationGaps.length} lacuna(s) de conversa`
  );
}
