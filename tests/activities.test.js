import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/core/storage.js';
import { logSession, logConversation, minutesStudied } from '../src/core/activities.js';
import { totalXp } from '../src/core/xp.js';
import { estimateAllSkills } from '../src/core/skills.js';
import { evaluateAchievements, achievementStatus } from '../src/core/achievements.js';
import { buildRecommendations, dismissRecommendation } from '../src/core/recommendations.js';

test('sessão registrada concede XP conforme o tipo', () => {
  const s = emptyState();
  logSession(s, { type: 'dialog_study', minutes: 15 });
  assert.equal(totalXp(s), 15);
  assert.equal(s.sessions.length, 1);
});

test('conversa de 10+ minutos concede XP; conversa curta não', () => {
  const s = emptyState();
  logConversation(s, { minutes: 12, context: 'futebol' });
  assert.equal(totalXp(s), 30);
  logConversation(s, { minutes: 4, context: 'restaurante' });
  assert.equal(totalXp(s), 30);
  assert.equal(s.conversations.length, 2);
});

test('cinco expressões novas concedem o bônus de expressões', () => {
  const s = emptyState();
  logConversation(s, { minutes: 12, newExpressions: ['加油', '好球', '传给我', '快点', '小心'] });
  assert.equal(totalXp(s), 30 + 15);
});

test('registrar atividade nunca altera proficiência', () => {
  const s = emptyState();
  logSession(s, { type: 'review_session', minutes: 30 });
  logConversation(s, { minutes: 60, context: 'futebol' });
  assert.ok(estimateAllSkills(s).every((e) => e.score === null));
  assert.equal(s.skillEvidence.length, 0);
});

test('minutos estudados somam sessões e conversas da janela', () => {
  const s = emptyState();
  logSession(s, { type: 'review_session', minutes: 20 });
  logConversation(s, { minutes: 10 });
  logSession(s, { type: 'review_session', minutes: 99, at: new Date(Date.now() - 30 * 86400000).toISOString() });
  const m = minutesStudied(s, 7);
  assert.equal(m.total, 30);
  assert.equal(m.conversations, 10);
});

test('conquistas só saem com registro que as comprove', () => {
  const s = emptyState();
  assert.equal(evaluateAchievements(s).length, 0);
  logConversation(s, { minutes: 10 });
  const fresh = evaluateAchievements(s);
  assert.deepEqual(fresh.map((a) => a.id), ['first_conversation']);
  assert.equal(evaluateAchievements(s).length, 0, 'não desbloqueia duas vezes');
  assert.equal(achievementStatus(s).find((a) => a.id === 'first_conversation').unlocked, true);
  assert.equal(achievementStatus(s).find((a) => a.id === 'first_export').unlocked, false);
});

test('recomendação inicial é fazer o nivelamento', () => {
  const s = emptyState();
  const recs = buildRecommendations(s);
  assert.equal(recs[0].id, 'do_placement');
  assert.ok(recs[0].why);
});

test('conversa com lacuna gera recomendação explicada e dispensável', () => {
  const s = emptyState();
  s.profile.placementDone = true;
  logConversation(s, { minutes: 15, context: 'futebol', perceivedDifficulty: 5, couldNotSay: 'com que frequência eu jogo' });
  const recs = buildRecommendations(s);
  const gap = recs.find((r) => r.id.startsWith('conv_gap_'));
  assert.ok(gap);
  assert.match(gap.why, /com que frequência eu jogo/);
  assert.ok(recs.some((r) => r.id === 'football_focus'));
  dismissRecommendation(s, gap.id);
  assert.ok(!buildRecommendations(s).some((r) => r.id === gap.id));
});

test('habilidades não avaliadas geram aviso, não exercício inventado', () => {
  const s = emptyState();
  s.profile.placementDone = true;
  const recs = buildRecommendations(s);
  const listening = recs.find((r) => r.id === 'listening_unassessed');
  assert.ok(listening);
  assert.match(listening.why, /não estima/);
  assert.equal(listening.action.params.exercise, 'listening', 'leva ao exercício de escuta que existe');
});
