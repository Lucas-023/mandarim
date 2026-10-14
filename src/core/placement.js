/**
 * Motor de nivelamento.
 *
 * Responsabilidades: sequenciar as etapas, adaptar a dificuldade, corrigir
 * respostas com critérios explícitos e produzir um relatório diagnóstico.
 *
 * Limites honestos embutidos:
 *  - Habilidades sem itens aplicados ficam 'nao_avaliada' (áudio e fala nesta fase).
 *  - A equivalência com HSK só é afirmada se houver itens suficientes na
 *    dificuldade correspondente; caso contrário o relatório diz isso.
 */
import { uid } from './storage.js';
import { QUESTIONS, QUESTIONS_BY_ID, QUESTION_BANK_VERSION, UNAVAILABLE_STAGES } from './content/questions.js';
import { recordEvidence, estimateAllSkills } from './skills.js';
import { awardXp } from './xp.js';

/** Etapa A — questionário inicial. Perguntas marcadas `optional` podem ser puladas. */
export const QUESTIONNAIRE = [
  { id: 'studyTime', label: 'Há quanto tempo você estuda mandarim?', type: 'choice',
    options: ['Nunca estudei formalmente', 'Menos de 6 meses', '6 a 12 meses', 'Mais de 1 ano'] },
  { id: 'hskStudied', label: 'Já estudou para algum nível do HSK?', type: 'choice',
    options: ['Não', 'HSK 1', 'HSK 2', 'HSK 3 ou acima'] },
  { id: 'readsPinyin', label: 'Você consegue ler pinyin?', type: 'choice',
    options: ['Não', 'Com dificuldade', 'Sim'] },
  { id: 'readsHanzi', label: 'Consegue reconhecer caracteres chineses?', type: 'choice',
    options: ['Nenhum', 'Alguns poucos', 'Vários do dia a dia', 'Muitos'] },
  { id: 'understandsSpoken', label: 'Compreende frases simples quando ouvidas?', type: 'choice',
    options: ['Não', 'Só palavras isoladas', 'Frases simples e lentas', 'Frases em velocidade normal'] },
  { id: 'answersSpoken', label: 'Consegue responder a perguntas simples em mandarim?', type: 'choice',
    options: ['Não', 'Com muita dificuldade', 'Respostas curtas', 'Sim, com alguma fluência'] },
  { id: 'mainGoal', label: 'Qual é seu objetivo principal?', type: 'choice',
    options: ['Conversação cotidiana', 'Futebol e convivência', 'Estudos', 'Trabalho', 'Prova HSK', 'Outro'] },
  { id: 'minutesPerDay', label: 'Quanto tempo pode estudar por dia?', type: 'choice',
    options: ['Até 10 minutos', '15 a 20 minutos', '30 minutos', '1 hora ou mais'] },
  { id: 'usesAnki', label: 'Usa o Anki atualmente?', type: 'choice', optional: true,
    options: ['Não uso', 'Uso, sem baralho de mandarim', 'Uso, com baralho de mandarim'] },
];

/** Quantos itens aplicar em cada etapa (além do item de autoavaliação). */
export const STAGE_PLAN = [
  { stage: 'B', limit: 6, label: 'Vocabulário e reconhecimento' },
  { stage: 'C', limit: 6, label: 'Frases, leitura e gramática' },
  { stage: 'E', limit: 2, label: 'Produção escrita' },
];

export const TOTAL_ITEMS = STAGE_PLAN.reduce((n, s) => n + s.limit, 0) + 1; // +1 = autoavaliação

/** Remove acentos/tons para comparar texto latino de forma tolerante. */
export function normalizeText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Inicia uma tentativa. Fica salva em `state.placementInProgress` (pausa/retomada). */
export function startPlacement(state, questionnaire = {}, at = new Date().toISOString()) {
  const attempt = {
    id: uid('pl'),
    version: QUESTION_BANK_VERSION,
    startedAt: at,
    finishedAt: null,
    questionnaire,
    responses: [],
    askedIds: [],
    stageIndex: 0,
    difficulty: 1,
    streakCorrect: 0,
    streakWrong: 0,
  };
  state.placementInProgress = attempt;
  return attempt;
}

/** Itens pontuados já aplicados na etapa (a autoavaliação não conta para o limite). */
function stageCount(attempt, stage) {
  return attempt.responses.filter(
    (r) => QUESTIONS_BY_ID.get(r.questionId)?.stage === stage && r.type !== 'self_report',
  ).length;
}

/**
 * Escolhe a próxima questão.
 * Regras: a autoavaliação abre a etapa B; depois busca um item não aplicado na
 * dificuldade atual e, se não houver, o item de dificuldade mais próxima.
 */
export function nextQuestion(attempt) {
  while (attempt.stageIndex < STAGE_PLAN.length) {
    const { stage, limit } = STAGE_PLAN[attempt.stageIndex];
    const pool = QUESTIONS.filter((q) => q.stage === stage && !attempt.askedIds.includes(q.id));

    const selfReport = pool.find((q) => q.type === 'self_report');
    if (selfReport) return selfReport;

    const scored = pool.filter((q) => q.type !== 'self_report');
    if (stageCount(attempt, stage) >= limit || scored.length === 0) {
      attempt.stageIndex += 1;
      attempt.difficulty = 1;
      attempt.streakCorrect = 0;
      attempt.streakWrong = 0;
      continue;
    }
    scored.sort(
      (a, b) =>
        Math.abs(a.difficulty - attempt.difficulty) - Math.abs(b.difficulty - attempt.difficulty) ||
        a.difficulty - b.difficulty,
    );
    return scored[0];
  }
  return null;
}

/** Corrige uma resposta mostrando sempre por que a nota foi essa. */
export function gradeAnswer(question, answer) {
  if (question.type === 'self_report') {
    return {
      scored: false,
      score: null,
      correct: null,
      detail: 'Autoavaliação: registrada como pista, não como evidência de proficiência.',
    };
  }
  if (question.type === 'open') {
    const text = normalizeText(answer);
    const raw = String(answer || '').trim();
    const criteria = (question.rubric?.criteria || []).map((c) => ({
      id: c.id,
      label: c.label,
      met: c.any.some((needle) => {
        const n = normalizeText(needle);
        return /[一-鿿]/.test(needle) ? raw.includes(needle) : n && text.includes(n);
      }),
    }));
    const met = criteria.filter((c) => c.met).length;
    let score = criteria.length === 0 ? 0 : met / criteria.length;
    const tooShort = raw.length < (question.rubric?.minLength || 0);
    if (tooShort) score *= 0.5;
    return {
      scored: true,
      score,
      correct: score >= 0.6,
      criteria,
      tooShort,
      autoGraded: true,
      detail:
        `${met} de ${criteria.length} critério(s) atendido(s)` +
        (tooShort ? '; resposta curta demais (nota reduzida pela metade)' : '') +
        '. Correção automática por palavras-chave — confiança baixa; você pode revisar.',
    };
  }
  const correct = Number(answer) === question.answer;
  return {
    scored: true,
    score: correct ? 1 : 0,
    correct,
    expected: question.options?.[question.answer],
    detail: correct
      ? 'Resposta correta.'
      : `Resposta esperada: ${question.options?.[question.answer]}.` +
        (question.rationale ? ` ${question.rationale}` : ''),
  };
}

/**
 * Registra uma resposta e adapta a dificuldade:
 * 2 acertos seguidos sobem um nível, 2 erros seguidos descem um nível.
 */
export function submitAnswer(state, { questionId, answer, supportUsed = false, at = new Date().toISOString() }) {
  const attempt = state.placementInProgress;
  if (!attempt) throw new Error('nenhum nivelamento em andamento');
  const question = QUESTIONS_BY_ID.get(questionId);
  if (!question) throw new Error(`questão desconhecida: ${questionId}`);
  if (attempt.askedIds.includes(questionId)) {
    return { duplicate: true, grading: null };
  }

  const grading = gradeAnswer(question, answer);
  attempt.askedIds.push(questionId);
  attempt.responses.push({
    questionId,
    stage: question.stage,
    skill: question.skill,
    difficulty: question.difficulty,
    type: question.type,
    answer,
    supportUsed,
    score: grading.score,
    correct: grading.correct,
    grading,
    at,
  });

  if (grading.scored) {
    if (grading.correct) {
      attempt.streakCorrect += 1;
      attempt.streakWrong = 0;
    } else {
      attempt.streakWrong += 1;
      attempt.streakCorrect = 0;
    }
    if (attempt.streakCorrect >= 2) {
      attempt.difficulty = Math.min(3, attempt.difficulty + 1);
      attempt.streakCorrect = 0;
    } else if (attempt.streakWrong >= 2) {
      attempt.difficulty = Math.max(1, attempt.difficulty - 1);
      attempt.streakWrong = 0;
    }
  }
  return { duplicate: false, grading };
}

export function progressOf(attempt) {
  const answered = attempt.responses.length;
  return { answered, total: TOTAL_ITEMS, percent: Math.round((answered / TOTAL_ITEMS) * 100) };
}

/** Precisão por faixa de dificuldade, com a contagem que a sustenta. */
export function accuracyByDifficulty(responses) {
  const out = {};
  for (const d of [1, 2, 3]) {
    const items = responses.filter((r) => r.difficulty === d && r.score != null);
    out[d] = {
      count: items.length,
      accuracy: items.length ? items.reduce((s, r) => s + r.score, 0) / items.length : null,
    };
  }
  return out;
}

/**
 * Nível geral estimado. Só afirma equivalência aproximada ao HSK quando há
 * pelo menos 3 itens respondidos na faixa correspondente.
 */
export function estimateOverallLevel(responses) {
  const acc = accuracyByDifficulty(responses);
  const enough = (d) => acc[d].count >= 3;
  const ok = (d, t = 0.6) => enough(d) && acc[d].accuracy >= t;

  if (!enough(1)) {
    return {
      label: 'Evidência insuficiente',
      code: 'insuficiente',
      explanation: 'Poucos itens respondidos para estimar um nível geral.',
      accuracyByDifficulty: acc,
    };
  }
  if (acc[1].accuracy < 0.5) {
    return {
      label: 'Iniciante — base em formação',
      code: 'iniciante',
      explanation: `Precisão de ${(acc[1].accuracy * 100).toFixed(0)}% nos itens mais básicos (${acc[1].count} itens).`,
      accuracyByDifficulty: acc,
    };
  }
  if (ok(3, 0.6) && ok(2, 0.7)) {
    return {
      label: 'Aproximado de HSK 2 (estimativa)',
      code: 'hsk2_aprox',
      explanation:
        `Bom desempenho nas faixas intermediária (${(acc[2].accuracy * 100).toFixed(0)}%) e avançada ` +
        `(${(acc[3].accuracy * 100).toFixed(0)}%) deste banco de questões.`,
      accuracyByDifficulty: acc,
    };
  }
  if (ok(2, 0.6)) {
    return {
      label: 'Compatível com HSK 1, avançando para HSK 2',
      code: 'hsk1_plus',
      explanation:
        `Itens básicos com ${(acc[1].accuracy * 100).toFixed(0)}% e intermediários com ` +
        `${(acc[2].accuracy * 100).toFixed(0)}% de precisão.`,
      accuracyByDifficulty: acc,
    };
  }
  return {
    label: 'Compatível com HSK 1 (estimativa)',
    code: 'hsk1',
    explanation:
      `Itens básicos com ${(acc[1].accuracy * 100).toFixed(0)}% de precisão; ` +
      'desempenho ainda irregular nos itens intermediários.',
    accuracyByDifficulty: acc,
  };
}

/** Agrupa erros por tag para apontar dificuldades prioritárias. */
export function difficultiesByTag(responses) {
  const tally = new Map();
  for (const r of responses) {
    if (r.score == null) continue;
    const q = QUESTIONS_BY_ID.get(r.questionId);
    for (const tag of q.tags || []) {
      const entry = tally.get(tag) || { tag, items: 0, misses: 0 };
      entry.items += 1;
      if (r.score < 0.6) entry.misses += 1;
      tally.set(tag, entry);
    }
  }
  return [...tally.values()]
    .map((e) => ({ ...e, missRate: e.items ? e.misses / e.items : 0 }))
    .sort((a, b) => b.missRate - a.missRate || b.items - a.items);
}

/**
 * Encerra a tentativa: grava evidências por habilidade, concede XP e devolve
 * o relatório diagnóstico.
 */
export function finishPlacement(state, at = new Date().toISOString()) {
  const attempt = state.placementInProgress;
  if (!attempt) throw new Error('nenhum nivelamento em andamento');
  attempt.finishedAt = at;

  for (const r of attempt.responses) {
    if (r.score == null) continue;
    recordEvidence(state, {
      skill: r.skill,
      score: r.score,
      difficulty: r.difficulty,
      supportUsed: r.supportUsed,
      source: 'placement',
      ref: `${attempt.id}:${r.questionId}`,
      at: r.at,
    });
  }

  const selfReport = attempt.responses.find((r) => r.type === 'self_report');
  const claimedKnown = Array.isArray(selfReport?.answer) ? selfReport.answer : [];
  const testedCorrect = attempt.responses
    .filter((r) => r.score >= 0.6)
    .map((r) => QUESTIONS_BY_ID.get(r.questionId).promptHz)
    .filter(Boolean);

  const overall = estimateOverallLevel(attempt.responses);
  const skills = estimateAllSkills(state);
  const tags = difficultiesByTag(attempt.responses);

  const result = {
    overall,
    skills,
    strengths: tags.filter((t) => t.items >= 2 && t.missRate <= 0.25).map((t) => t.tag),
    priorityDifficulties: tags.filter((t) => t.missRate >= 0.5).map((t) => t.tag),
    likelyKnown: [...new Set([...claimedKnown, ...testedCorrect])],
    toConfirm: claimedKnown.filter((hz) => !testedCorrect.includes(hz)),
    limitations: [
      ...UNAVAILABLE_STAGES.map((s) => `${s.label}: ${s.reason}`),
      'Resultado diagnóstico interno baseado em um banco fixo de 26 itens — não é certificação oficial do HSK.',
      'Respostas escritas foram corrigidas automaticamente por palavras-chave (confiança baixa).',
    ],
    answeredCount: attempt.responses.filter((r) => r.score != null).length,
  };

  attempt.result = result;
  state.placementAttempts.push(attempt);
  state.placementInProgress = null;
  state.profile.placementDone = true;

  awardXp(state, {
    type: 'placement_complete',
    key: `placement:${attempt.id}`,
    at,
    meta: { attemptId: attempt.id, level: overall.code },
  });

  return { attempt, result };
}

export function latestAttempt(state) {
  return state.placementAttempts.length
    ? state.placementAttempts[state.placementAttempts.length - 1]
    : null;
}
