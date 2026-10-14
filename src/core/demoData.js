/**
 * DADOS DE DEMONSTRAÇÃO — TODOS FICTÍCIOS.
 *
 * Servem apenas para ver a interface preenchida. Nada aqui representa estudo
 * real: ao carregar, o estado é marcado com `demo: true` e a interface avisa.
 * Use "Apagar tudo" nas configurações para voltar ao estado real.
 */
import { emptyState } from './storage.js';
import { startPlacement, nextQuestion, submitAnswer, finishPlacement } from './placement.js';
import { buildInitialPlan } from './plan.js';
import { buildVocabExercise, gradeExercise } from './exercises.js';
import { logSession, logConversation } from './activities.js';
import { generateDrafts, saveDrafts, setDraftStatus } from './flashcards.js';
import { evaluateAchievements } from './achievements.js';
import { dayKey, addDays } from './xp.js';

const DEMO_DIALOG = `A: 你周末有什么计划？
B: 我想和朋友一起踢足球。
A: 你经常踢足球吗？
B: 是的，我每周踢两次。`;

/** Monta um estado completo e fictício, como se houvesse ~uma semana de uso. */
export function buildDemoState(today = dayKey()) {
  const state = emptyState();
  state.demo = true;
  state.profile = {
    ...state.profile,
    name: 'Demo (fictício)',
    onboardingDone: true,
    minutesPerDay: 20,
    questionnaire: { minutesPerDay: '15 a 20 minutos', mainGoal: 'Futebol e convivência', hskStudied: 'HSK 1' },
  };

  // Nivelamento: acerta os itens fáceis, erra parte dos difíceis.
  startPlacement(state, state.profile.questionnaire, `${addDays(today, -6)}T09:00:00`);
  let q;
  while ((q = nextQuestion(state.placementInProgress))) {
    let answer;
    if (q.type === 'self_report') answer = ['你好', '谢谢', '足球', '周末'];
    else if (q.type === 'open') answer = '我叫 Lucas，我是巴西人。我每周踢足球两次。';
    else answer = q.difficulty >= 3 ? (q.answer + 1) % q.options.length : q.answer;
    submitAnswer(state, { questionId: q.id, answer, at: `${addDays(today, -6)}T09:0${state.placementInProgress.responses.length}:00` });
  }
  const { result, attempt } = finishPlacement(state, `${addDays(today, -6)}T09:20:00`);
  state.plan = buildInitialPlan(result, { questionnaire: attempt.questionnaire, minutesPerDay: 20 });
  state.settings.dailyGoalXp = state.plan.dailyGoalXp;

  // Exercícios ao longo de alguns dias, com desempenho variado.
  [[-5, 1], [-4, 0.5], [-2, 0.83], [0, 0.66]].forEach(([offset, accuracy], i) => {
    const at = `${addDays(today, offset)}T19:00:00`;
    const ex = buildVocabExercise(state, { count: 6, tags: ['futebol', 'conversa'], seed: 100 + i });
    const answers = {};
    ex.items.forEach((item, idx) => {
      const correct = idx / ex.items.length < accuracy;
      answers[item.id] = correct ? item.answer : (item.answer + 1) % item.options.length;
    });
    gradeExercise(state, ex, answers, { at });
  });

  logSession(state, { type: 'review_session', minutes: 12, notes: 'Revisão no Anki (fictício)', at: `${addDays(today, -5)}T08:00:00` });
  logSession(state, { type: 'dialog_study', minutes: 18, notes: 'Diálogo do livro (fictício)', at: `${addDays(today, -2)}T08:00:00` });

  logConversation(state, {
    minutes: 15, context: 'futebol', perceivedDifficulty: 4,
    newExpressions: ['加油', '好球', '传给我', '快点', '小心'],
    understood: 'Instruções básicas durante o jogo.',
    couldNotSay: 'Não consegui responder com que frequência eu jogo.',
    notes: 'Registro fictício de demonstração.',
    at: `${addDays(today, -4)}T21:00:00`,
  });
  logConversation(state, {
    minutes: 8, context: 'restaurante', perceivedDifficulty: 3,
    newExpressions: ['多少钱'], understood: 'O preço.', couldNotSay: '',
    notes: 'Registro fictício de demonstração.',
    at: `${addDays(today, -1)}T12:30:00`,
  });

  const { drafts } = generateDrafts(state, DEMO_DIALOG, { source: 'diálogo de demonstração (fictício)' });
  saveDrafts(state, drafts);
  for (const d of state.cardDrafts.filter((x) => x.kind === 'word').slice(0, 4)) {
    setDraftStatus(state, d.id, 'approved');
  }

  evaluateAchievements(state, `${today}T20:00:00`);
  return state;
}
