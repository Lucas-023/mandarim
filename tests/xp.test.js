import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/core/storage.js';
import {
  awardXp, totalXp, dailyGoal, maybeAwardDailyBonus, computeStreak,
  xpMilestone, dayKey, addDays, xpByDay,
} from '../src/core/xp.js';

test('XP usa os valores padrão por tipo', () => {
  const s = emptyState();
  awardXp(s, { type: 'review_session', key: 'a' });
  assert.equal(totalXp(s), 10);
});

test('a mesma key não concede XP duas vezes (recarregar a página não duplica)', () => {
  const s = emptyState();
  const first = awardXp(s, { type: 'real_conversation', key: 'conv:1' });
  const second = awardXp(s, { type: 'real_conversation', key: 'conv:1' });
  assert.equal(first.granted, true);
  assert.equal(second.granted, false);
  assert.match(second.reason, /duplicata/);
  assert.equal(totalXp(s), 30);
});

test('tipo desconhecido não concede XP', () => {
  const s = emptyState();
  const res = awardXp(s, { type: 'inexistente', key: 'x' });
  assert.equal(res.granted, false);
  assert.equal(totalXp(s), 0);
});

test('meta diária reflete apenas o XP de hoje', () => {
  const s = emptyState();
  s.settings.dailyGoalXp = 30;
  awardXp(s, { type: 'review_session', key: 'hoje', at: new Date().toISOString() });
  awardXp(s, { type: 'weekly_assessment', key: 'antigo', at: new Date(Date.now() - 3 * 86400000).toISOString() });
  const goal = dailyGoal(s);
  assert.equal(goal.earned, 10);
  assert.equal(goal.met, false);
  assert.equal(goal.remaining, 20);
});

test('bônus diário sai uma vez e só depois da meta', () => {
  const s = emptyState();
  s.settings.dailyGoalXp = 20;
  assert.equal(maybeAwardDailyBonus(s).granted, false);
  awardXp(s, { type: 'listening_exercise', key: 'ex1' });
  assert.equal(maybeAwardDailyBonus(s).granted, true);
  assert.equal(maybeAwardDailyBonus(s).granted, false);
  assert.equal(totalXp(s), 20 + 25);
});

test('sequência conta dias consecutivos e tolera o dia de hoje sem atividade', () => {
  const s = emptyState();
  const today = dayKey();
  for (const d of [-1, -2, -3]) {
    awardXp(s, { type: 'review_session', key: `d${d}`, at: `${addDays(today, d)}T10:00:00` });
  }
  const st = computeStreak(s, today);
  assert.equal(st.activeToday, false);
  assert.equal(st.streak, 3);
  assert.equal(st.longest, 3);
});

test('sequência quebra com dia vazio no meio', () => {
  const s = emptyState();
  const today = dayKey();
  for (const d of [0, -1, -3, -4]) {
    awardXp(s, { type: 'review_session', key: `d${d}`, at: `${addDays(today, d)}T10:00:00` });
  }
  const st = computeStreak(s, today);
  assert.equal(st.streak, 2);
  assert.equal(st.longest, 2);
});

test('marcos de XP crescem progressivamente', () => {
  assert.deepEqual(xpMilestone(0).level, 1);
  assert.equal(xpMilestone(100).level, 2);
  assert.equal(xpMilestone(299).level, 2);
  assert.equal(xpMilestone(300).level, 3);
  assert.equal(xpMilestone(150).into, 50);
});

test('xpByDay devolve a janela pedida em ordem cronológica', () => {
  const s = emptyState();
  const today = dayKey();
  awardXp(s, { type: 'review_session', key: 'k', at: `${today}T08:00:00` });
  const series = xpByDay(s, 7, today);
  assert.equal(series.length, 7);
  assert.equal(series.at(-1).day, today);
  assert.equal(series.at(-1).xp, 10);
  assert.equal(series[0].xp, 0);
});
