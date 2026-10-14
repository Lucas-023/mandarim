import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/core/storage.js';
import {
  startPlacement, nextQuestion, submitAnswer, finishPlacement, gradeAnswer,
  estimateOverallLevel, accuracyByDifficulty, progressOf, TOTAL_ITEMS, difficultiesByTag,
} from '../src/core/placement.js';
import { QUESTIONS_BY_ID } from '../src/core/content/questions.js';
import { totalXp } from '../src/core/xp.js';
import { estimateSkill } from '../src/core/skills.js';
import { buildInitialPlan } from '../src/core/plan.js';

/** Responde o nivelamento inteiro com uma estratégia dada. */
function run(state, answerFor) {
  startPlacement(state, { minutesPerDay: '15 a 20 minutos', mainGoal: 'Futebol e convivência' });
  let q;
  let guard = 0;
  while ((q = nextQuestion(state.placementInProgress)) && guard++ < 50) {
    submitAnswer(state, { questionId: q.id, answer: answerFor(q) });
  }
  return finishPlacement(state);
}

const allCorrect = (q) => {
  if (q.type === 'self_report') return ['你好', '谢谢', '足球'];
  if (q.type === 'open') return '我叫 Lucas，我是巴西人。我每周踢足球两次，请说慢一点，一起踢足球吧，周末怎么样？';
  return q.answer;
};
const allWrong = (q) => {
  if (q.type === 'self_report') return [];
  if (q.type === 'open') return 'x';
  return (q.answer + 1) % q.options.length;
};

test('o nivelamento termina com a quantidade planejada de itens', () => {
  const s = emptyState();
  const { attempt } = run(s, allCorrect);
  assert.equal(attempt.responses.length, TOTAL_ITEMS);
  assert.equal(progressOf(attempt).percent, 100);
  assert.equal(s.placementInProgress, null);
  assert.equal(s.placementAttempts.length, 1);
  assert.equal(s.profile.placementDone, true);
});

test('acertar tudo sobe a dificuldade até a faixa 3', () => {
  const s = emptyState();
  const { attempt } = run(s, allCorrect);
  const diffs = attempt.responses.filter((r) => r.score != null).map((r) => r.difficulty);
  assert.ok(Math.max(...diffs) === 3, 'deveria alcançar itens difíceis');
});

test('errar tudo mantém o usuário na faixa fácil', () => {
  const s = emptyState();
  const { attempt, result } = run(s, allWrong);
  const scored = attempt.responses.filter((r) => r.score != null);
  assert.ok(scored.every((r) => r.difficulty <= 2));
  assert.equal(result.overall.code, 'iniciante');
});

test('desempenho alto gera estimativa acima de HSK 1 com explicação', () => {
  const s = emptyState();
  const { result } = run(s, allCorrect);
  assert.ok(['hsk1_plus', 'hsk2_aprox'].includes(result.overall.code));
  assert.match(result.overall.explanation, /%/);
});

test('o relatório marca escuta e fala como não avaliadas', () => {
  const s = emptyState();
  const { result } = run(s, allCorrect);
  const listening = result.skills.find((x) => x.skill === 'listening');
  const speaking = result.skills.find((x) => x.skill === 'speaking');
  assert.equal(listening.status, 'nao_avaliada');
  assert.equal(speaking.status, 'nao_avaliada');
  assert.ok(result.limitations.some((l) => /áudio/i.test(l)));
  assert.ok(result.limitations.some((l) => /microfone/i.test(l)));
});

test('nivelamento gera evidência de proficiência e XP uma única vez', () => {
  const s = emptyState();
  run(s, allCorrect);
  assert.ok(estimateSkill(s, 'vocabulary').score > 0);
  assert.equal(totalXp(s), 50);
  assert.equal(s.xpEvents.filter((e) => e.type === 'placement_complete').length, 1);
});

test('autoavaliação não entra como evidência de proficiência', () => {
  const s = emptyState();
  run(s, allCorrect);
  assert.equal(s.skillEvidence.filter((e) => e.ref?.includes('b12')).length, 0);
});

test('palavras autodeclaradas sem teste entram em "toConfirm"', () => {
  const s = emptyState();
  const { result } = run(s, (q) => (q.type === 'self_report' ? ['越位'] : allCorrect(q)));
  assert.ok(result.toConfirm.includes('越位') || result.likelyKnown.includes('越位'));
});

test('respostas abertas são corrigidas por critérios visíveis', () => {
  const q = QUESTIONS_BY_ID.get('e1');
  const good = gradeAnswer(q, '我叫 Lucas，我是巴西人。');
  assert.equal(good.correct, true);
  assert.ok(good.criteria.every((c) => c.met));
  const short = gradeAnswer(q, '我');
  assert.equal(short.tooShort, true);
  assert.ok(short.score < good.score);
  assert.match(short.detail, /confiança baixa/);
});

test('resposta aberta em pinyin é aceita', () => {
  const q = QUESTIONS_BY_ID.get('e2');
  const g = gradeAnswer(q, 'wo mei zhou ti zuqiu liang ci');
  assert.equal(g.correct, true);
});

test('não repete a mesma questão nem aceita resposta duplicada', () => {
  const s = emptyState();
  startPlacement(s, {});
  const q = nextQuestion(s.placementInProgress);
  submitAnswer(s, { questionId: q.id, answer: [] });
  const again = submitAnswer(s, { questionId: q.id, answer: [] });
  assert.equal(again.duplicate, true);
  assert.equal(s.placementInProgress.responses.length, 1);
});

test('nível não é afirmado sem itens suficientes', () => {
  const level = estimateOverallLevel([{ difficulty: 1, score: 1 }]);
  assert.equal(level.code, 'insuficiente');
  assert.equal(accuracyByDifficulty([])[2].accuracy, null);
});

test('dificuldades são agrupadas por tema', () => {
  const s = emptyState();
  const { attempt } = run(s, (q) => (['b2', 'b6', 'b8'].includes(q.id) ? allWrong(q) : allCorrect(q)));
  const tags = difficultiesByTag(attempt.responses);
  const futebol = tags.find((t) => t.tag === 'futebol');
  assert.ok(futebol.misses >= 2);
});

test('o plano inicial deriva do resultado e declara o que não foi avaliado', () => {
  const s = emptyState();
  const { result } = run(s, allCorrect);
  const plan = buildInitialPlan(result, { questionnaire: { minutesPerDay: '30 minutos', mainGoal: 'Futebol e convivência' } });
  assert.equal(plan.minutesPerDay, 30);
  assert.equal(plan.dailyGoalXp, 80);
  assert.ok(plan.focusTags.includes('futebol'));
  assert.ok(plan.items.every((i) => i.why));
  assert.ok(plan.notAssessed.includes('Compreensão auditiva'));
  assert.ok(plan.caveats.some((c) => /Compreensão auditiva/.test(c)));
});

test('retomar o nivelamento salvo preserva as respostas', () => {
  const s = emptyState();
  startPlacement(s, {});
  const q1 = nextQuestion(s.placementInProgress);
  submitAnswer(s, { questionId: q1.id, answer: ['你好'] });
  const snapshot = JSON.parse(JSON.stringify(s));
  const q2 = nextQuestion(snapshot.placementInProgress);
  assert.equal(snapshot.placementInProgress.responses.length, 1);
  assert.notEqual(q2.id, q1.id);
});
