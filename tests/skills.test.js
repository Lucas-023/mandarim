import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/core/storage.js';
import { recordEvidence, estimateSkill, estimateAllSkills, SUPPORT_PENALTY } from '../src/core/skills.js';
import { awardXp } from '../src/core/xp.js';

test('habilidade sem evidência fica "nao_avaliada" e sem pontuação', () => {
  const s = emptyState();
  const est = estimateSkill(s, 'listening');
  assert.equal(est.status, 'nao_avaliada');
  assert.equal(est.score, null);
  assert.equal(est.evidenceCount, 0);
});

test('todas as seis habilidades aparecem, nenhuma inventada', () => {
  const s = emptyState();
  const all = estimateAllSkills(s);
  assert.equal(all.length, 6);
  assert.ok(all.every((e) => e.score === null));
});

test('poucas evidências marcam dados_insuficientes mas já dão pontuação explicada', () => {
  const s = emptyState();
  recordEvidence(s, { skill: 'vocabulary', score: 1, difficulty: 1, source: 'placement' });
  const est = estimateSkill(s, 'vocabulary');
  assert.equal(est.status, 'dados_insuficientes');
  assert.equal(est.confidence, 'insuficiente');
  assert.equal(est.score, 60); // precisão 100% × fator 0,60 (só item fácil)
  assert.match(est.explanation, /Precisão ponderada 100%/);
});

test('acertos em itens difíceis valem mais que em itens fáceis', () => {
  const easy = emptyState();
  const hard = emptyState();
  for (let i = 0; i < 6; i += 1) {
    recordEvidence(easy, { skill: 'reading', score: 1, difficulty: 1 });
    recordEvidence(hard, { skill: 'reading', score: 1, difficulty: 3 });
  }
  assert.ok(estimateSkill(hard, 'reading').score > estimateSkill(easy, 'reading').score);
  assert.equal(estimateSkill(hard, 'reading').score, 100);
});

test('apoio de pinyin reduz o peso do acerto', () => {
  const s = emptyState();
  const t = emptyState();
  for (let i = 0; i < 5; i += 1) {
    recordEvidence(s, { skill: 'reading', score: 1, difficulty: 2 });
    recordEvidence(t, { skill: 'reading', score: 1, difficulty: 2, supportUsed: true });
  }
  const full = estimateSkill(s, 'reading').score;
  const supported = estimateSkill(t, 'reading').score;
  assert.ok(supported < full);
  assert.ok(Math.abs(supported / full - SUPPORT_PENALTY) < 0.05);
  assert.equal(estimateSkill(t, 'reading').supportUsedCount, 5);
});

test('evidências antigas pesam menos que recentes', () => {
  const s = emptyState();
  const old = new Date(Date.now() - 180 * 86400000).toISOString();
  for (let i = 0; i < 4; i += 1) recordEvidence(s, { skill: 'grammar', score: 0, difficulty: 2, at: old });
  for (let i = 0; i < 4; i += 1) recordEvidence(s, { skill: 'grammar', score: 1, difficulty: 2 });
  assert.ok(estimateSkill(s, 'grammar').score > 60);
});

test('XP não afeta proficiência em nenhuma hipótese', () => {
  const s = emptyState();
  for (let i = 0; i < 50; i += 1) awardXp(s, { type: 'review_session', key: `k${i}` });
  assert.ok(estimateAllSkills(s).every((e) => e.score === null));
});

test('habilidade inválida é rejeitada', () => {
  const s = emptyState();
  assert.throws(() => recordEvidence(s, { skill: 'telepatia', score: 1, difficulty: 1 }));
});
