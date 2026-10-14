import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/core/storage.js';
import {
  buildVocabExercise, buildReadingExercise, buildProductionExercise,
  gradeItem, gradeExercise, errorTags, makeRng,
} from '../src/core/exercises.js';
import { estimateSkill } from '../src/core/skills.js';
import { totalXp } from '../src/core/xp.js';

test('o gerador é reprodutível com a mesma semente', () => {
  const s = emptyState();
  const a = buildVocabExercise(s, { seed: 42 });
  const b = buildVocabExercise(s, { seed: 42 });
  assert.deepEqual(a.items.map((i) => i.ref), b.items.map((i) => i.ref));
  const c = buildVocabExercise(s, { seed: 43 });
  assert.notDeepEqual(a.items.map((i) => i.ref), c.items.map((i) => i.ref));
  assert.ok(makeRng(1)() !== makeRng(2)());
});

test('cada item tem 4 alternativas distintas e uma resposta válida', () => {
  const s = emptyState();
  for (const item of buildVocabExercise(s, { count: 8, seed: 7 }).items) {
    assert.equal(item.options.length, 4);
    assert.equal(new Set(item.options).size, 4);
    assert.ok(item.answer >= 0 && item.answer < 4);
  }
});

test('filtro por tag mantém o exercício no tema pedido', () => {
  const s = emptyState();
  const ex = buildVocabExercise(s, { count: 6, tags: ['futebol'], seed: 3 });
  assert.ok(ex.items.every((i) => i.tags.includes('futebol')));
});

test('filtro por dificuldade não ultrapassa o nível pedido', () => {
  const s = emptyState();
  const ex = buildVocabExercise(s, { count: 6, difficulty: 1, seed: 5 });
  assert.ok(ex.items.every((i) => i.difficulty <= 1));
});

test('corrigir exercício grava evidência e concede XP uma única vez', () => {
  const s = emptyState();
  const ex = buildVocabExercise(s, { count: 4, seed: 11 });
  const answers = Object.fromEntries(ex.items.map((i) => [i.id, i.answer]));
  const first = gradeExercise(s, ex, answers);
  assert.equal(first.result.correct, 4);
  assert.equal(first.result.accuracy, 1);
  assert.equal(s.skillEvidence.length, 4);
  assert.equal(totalXp(s), 10);
  assert.ok(estimateSkill(s, 'vocabulary').score > 0);

  const second = gradeExercise(s, ex, answers);
  assert.equal(second.xp.granted, false, 'reenviar o mesmo exercício não dá XP de novo');
  assert.equal(totalXp(s), 10);
});

test('erro é corrigido com a resposta esperada visível', () => {
  const s = emptyState();
  const ex = buildReadingExercise(s, { count: 3, seed: 9 });
  const item = ex.items[0];
  const g = gradeItem(item, (item.answer + 1) % item.options.length);
  assert.equal(g.correct, false);
  assert.match(g.detail, /Esperado:/);
});

test('exercício de produção aceita pinyin e explica a correção', () => {
  const s = emptyState();
  const ex = buildProductionExercise(s, { count: 1, seed: 21 });
  const item = ex.items[0];
  const g = gradeItem(item, `我 ${item.ref} 很好`);
  assert.equal(g.correct, true);
  assert.equal(g.autoGraded, true);
  assert.match(g.detail, /confiança baixa/);
  const bad = gradeItem(item, 'x');
  assert.ok(bad.score < g.score);
});

test('apoio usado é registrado na evidência', () => {
  const s = emptyState();
  const ex = buildVocabExercise(s, { count: 2, seed: 13 });
  const answers = Object.fromEntries(ex.items.map((i) => [i.id, i.answer]));
  gradeExercise(s, ex, answers, { supportUsed: { [ex.items[0].id]: true } });
  assert.equal(s.skillEvidence.filter((e) => e.supportUsed).length, 1);
});

test('tags com erros recorrentes são identificadas', () => {
  const s = emptyState();
  const ex = buildVocabExercise(s, { count: 6, tags: ['futebol'], seed: 17 });
  const answers = Object.fromEntries(ex.items.map((i) => [i.id, (i.answer + 1) % 4]));
  gradeExercise(s, ex, answers);
  const tags = errorTags(s);
  const futebol = tags.find((t) => t.tag === 'futebol');
  assert.equal(futebol.missRate, 1);
});

test('exercício de leitura avisa sobre reaproveitamento de questões', () => {
  const s = emptyState();
  assert.match(buildReadingExercise(s, { count: 2, seed: 1 }).note, /familiaridade/);
});
