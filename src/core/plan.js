/**
 * Conversão do resultado do nivelamento em plano de estudo inicial.
 * Cada item do plano carrega a justificativa que o originou (§11.3: as
 * recomendações precisam ser explicáveis).
 */

const MINUTES_FROM_ANSWER = {
  'Até 10 minutos': 10,
  '15 a 20 minutos': 20,
  '30 minutos': 30,
  '1 hora ou mais': 60,
};

/** XP diário sugerido ≈ 2,5 XP por minuto disponível, arredondado a múltiplos de 10. */
export function suggestedDailyXp(minutes) {
  return Math.max(20, Math.round((minutes * 2.5) / 10) * 10);
}

export function minutesFromQuestionnaire(questionnaire, fallback = 20) {
  return MINUTES_FROM_ANSWER[questionnaire?.minutesPerDay] || fallback;
}

/** Quanto apoio (pinyin/tradução) oferecer por padrão. */
export function supportLevelFor(levelCode) {
  if (levelCode === 'hsk2_aprox') return 'minimo';
  if (levelCode === 'hsk1_plus') return 'sob_demanda';
  return 'completo';
}

export function dialogDifficultyFor(levelCode) {
  if (levelCode === 'hsk2_aprox') return 2;
  if (levelCode === 'hsk1_plus') return 2;
  return 1;
}

/**
 * Monta o plano da primeira semana.
 * @param {object} result resultado de finishPlacement
 * @param {object} opts   { questionnaire, goals }
 */
export function buildInitialPlan(result, { questionnaire = {}, minutesPerDay } = {}) {
  const minutes = minutesPerDay || minutesFromQuestionnaire(questionnaire);
  const levelCode = result.overall.code;
  const weak = result.skills
    .filter((s) => s.score != null)
    .sort((a, b) => a.score - b.score)
    .slice(0, 2);

  const focusTags = [];
  for (const t of result.priorityDifficulties) focusTags.push(t);
  if (questionnaire.mainGoal === 'Futebol e convivência' && !focusTags.includes('futebol')) {
    focusTags.push('futebol');
  }
  if (!focusTags.includes('conversa')) focusTags.push('conversa');

  const items = [];
  const add = (title, why, minutesSpent, type) =>
    items.push({ title, why, minutes: minutesSpent, type });

  add(
    'Revisão de vocabulário básico (10–15 cartões)',
    'Base de repetição espaçada: mantém o vocabulário já reconhecido disponível para uso.',
    Math.max(5, Math.round(minutes * 0.35)),
    'review',
  );
  add(
    `Diálogo curto de nível ${dialogDifficultyFor(levelCode)} sobre conversa cotidiana`,
    `Nível estimado: ${result.overall.label}. Diálogos nesse nível treinam frases completas, não palavras isoladas.`,
    Math.max(5, Math.round(minutes * 0.35)),
    'dialog',
  );
  if (focusTags.includes('futebol')) {
    add(
      'Bloco de vocabulário e expressões de futebol',
      'Objetivo declarado: conversar com os colegas durante e depois do futebol.',
      Math.max(5, Math.round(minutes * 0.2)),
      'vocab_futebol',
    );
  }
  for (const s of weak) {
    add(
      `Exercício focado em ${s.label.pt.toLowerCase()}`,
      `Habilidade mais baixa no nivelamento: ${s.score}/100 (${s.evidenceCount} itens, confiança ${s.confidence}).`,
      Math.max(5, Math.round(minutes * 0.2)),
      `focus_${s.skill}`,
    );
  }
  add(
    'Registrar uma conversa real (mesmo curta)',
    'A prática fora do app é o objetivo final; o registro alimenta as recomendações.',
    0,
    'conversation_log',
  );

  const notAssessed = result.skills.filter((s) => s.status === 'nao_avaliada').map((s) => s.label.pt);

  return {
    createdAt: new Date().toISOString(),
    levelCode,
    levelLabel: result.overall.label,
    minutesPerDay: minutes,
    dailyGoalXp: suggestedDailyXp(minutes),
    supportLevel: supportLevelFor(levelCode),
    dialogDifficulty: dialogDifficultyFor(levelCode),
    focusTags,
    items,
    notAssessed,
    caveats: [
      ...(notAssessed.length
        ? [`Sem dados para: ${notAssessed.join(', ')}. O plano não tenta exercitar o que não foi avaliado.`]
        : []),
      'O plano é uma sugestão inicial e muda conforme os resultados reais dos exercícios.',
    ],
  };
}
