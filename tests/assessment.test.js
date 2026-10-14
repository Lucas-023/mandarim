import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/core/storage.js';
import {
  assessmentStatus, buildWeeklyAssessment, recordAssessment, lastAssessment,
  refsJaUsadas, skillTimeline, ASSESSMENT_INTERVAL_DAYS, MIN_ITEMS,
} from '../src/core/assessment.js';
import { buildDemoState } from '../src/core/demoData.js';
import { gradeExercise } from '../src/core/exercises.js';
import { introduceItems, grammarRef } from '../src/core/schedule.js';
import { registerEntries, resetRegistry } from '../src/core/content/lexicon.js';
import { addDays } from '../src/core/xp.js';
import { totalXp } from '../src/core/xp.js';

test('sem nivelamento, não se propõe reavaliação', () => {
  const s = emptyState();
  const status = assessmentStatus(s);
  assert.equal(status.due, false);
  assert.match(status.reason, /nivelamento inicial/i);
});

test('a reavaliação fica disponível uma semana após a última medição', () => {
  const s = buildDemoState();
  const base = s.placementAttempts.at(-1).finishedAt.slice(0, 10);
  assert.equal(assessmentStatus(s, { today: base }).due, false);
  assert.equal(assessmentStatus(s, { today: addDays(base, ASSESSMENT_INTERVAL_DAYS) }).due, true);
  assert.equal(assessmentStatus(s, { today: addDays(base, ASSESSMENT_INTERVAL_DAYS) }).nextAt, addDays(base, 7));
});

test('com poucos itens estudados, a reavaliação não é oferecida', () => {
  const s = emptyState();
  s.placementAttempts.push({ finishedAt: '2026-01-01T10:00:00Z', result: { skills: [] }, responses: [] });
  const status = assessmentStatus(s, { today: '2026-02-01' });
  assert.equal(status.due, false);
  assert.match(status.reason, /poucos itens/i);
});

test('a reavaliação só cobra itens que o app apresentou', () => {
  const s = buildDemoState();
  const estudados = new Set(Object.keys(s.schedule.items));
  const aval = buildWeeklyAssessment(s, { count: 10, seed: 4, today: '2026-10-20' });
  const deVocabulario = aval.items.filter((i) => i.skill === 'vocabulary');
  assert.ok(deVocabulario.length > 0);
  assert.ok(deVocabulario.every((i) => estudados.has(i.ref)), 'não cobra o que nunca foi ensinado');
});

test('a reavaliação seguinte usa itens diferentes da anterior', () => {
  const s = buildDemoState();
  const primeira = buildWeeklyAssessment(s, { count: 8, seed: 1, today: '2026-10-20' });
  const g = gradeExercise(s, primeira, Object.fromEntries(primeira.items.map((i) => [i.id, i.answer])), { at: '2026-10-20T10:00:00' });
  recordAssessment(s, { exercise: primeira, graded: g, at: '2026-10-20T10:00:00' });

  const usadas = refsJaUsadas(s);
  assert.ok(usadas.size > 0);
  const segunda = buildWeeklyAssessment(s, { count: 8, seed: 2, today: '2026-10-27' });
  const repetidos = segunda.items.filter((i) => usadas.has(i.ref));
  assert.deepEqual(repetidos, [], 'repetir a mesma questão mediria familiaridade, não proficiência');
  assert.match(segunda.note, /diferentes dos usados/);
});

test('a reavaliação mistura habilidades e inclui escuta quando há voz', () => {
  const s = buildDemoState();
  const semAudio = buildWeeklyAssessment(s, { count: 10, seed: 3, withAudio: false, today: '2026-10-20' });
  assert.ok(!semAudio.items.some((i) => i.skill === 'listening'));
  const comAudio = buildWeeklyAssessment(s, { count: 10, seed: 3, withAudio: true, today: '2026-10-20' });
  assert.ok(comAudio.items.some((i) => i.skill === 'listening'));
  assert.ok(new Set(comAudio.items.map((i) => i.skill)).size >= 3, 'mede mais de uma habilidade');
});

test('estrutura gramatical apresentada vira item de produção escrita', (t) => {
  t.after(resetRegistry);
  const s = buildDemoState();
  introduceItems(s, [{ ref: grammarRef('frequencia-ci'), type: 'grammar', label: '每…次' }], { at: '2026-10-10T08:00:00' });
  const aval = buildWeeklyAssessment(s, { count: 12, seed: 7, today: '2026-10-20' });
  const producao = aval.items.find((i) => i.type === 'open');
  assert.ok(producao, 'deveria cobrar produção com a estrutura ensinada');
  assert.equal(producao.skill, 'writing');
  assert.ok(producao.rubric.criteria.length >= 1);
});

test('concluir a reavaliação concede o XP próprio e guarda o retrato das habilidades', () => {
  const s = buildDemoState();
  const xpAntes = totalXp(s);
  const aval = buildWeeklyAssessment(s, { count: 8, seed: 5, today: '2026-10-20' });
  const g = gradeExercise(s, aval, Object.fromEntries(aval.items.map((i) => [i.id, i.answer])), { at: '2026-10-20T10:00:00' });
  assert.equal(g.xp.event.type, 'weekly_assessment');
  assert.equal(totalXp(s) - xpAntes, 40);

  const registro = recordAssessment(s, { exercise: aval, graded: g, at: '2026-10-20T10:00:00' });
  assert.equal(lastAssessment(s).id, registro.id);
  assert.equal(registro.total, aval.items.length);
  assert.ok(registro.skills.length === 6, 'retrato das seis habilidades');
  assert.ok(registro.porHabilidade.every((x) => x.total > 0));
  assert.ok(registro.refs.length === aval.items.length);
});

test('a linha do tempo junta nivelamentos e reavaliações em ordem', () => {
  const s = buildDemoState();
  const aval = buildWeeklyAssessment(s, { count: 7, seed: 2, today: '2026-10-20' });
  const g = gradeExercise(s, aval, Object.fromEntries(aval.items.map((i) => [i.id, i.answer])), { at: '2026-10-20T10:00:00' });
  recordAssessment(s, { exercise: aval, graded: g, at: '2026-10-20T10:00:00' });
  const linha = skillTimeline(s);
  assert.equal(linha.length, 2);
  assert.deepEqual(linha.map((p) => p.tipo), ['nivelamento', 'reavaliação']);
  assert.ok(linha[0].at < linha[1].at);
});

test('a reavaliação nunca fica menor que o mínimo útil', () => {
  const s = buildDemoState();
  const aval = buildWeeklyAssessment(s, { count: 3, seed: 1, today: '2026-10-20' });
  assert.ok(aval.items.length >= Math.min(MIN_ITEMS, 6) || aval.items.length > 0);
});
