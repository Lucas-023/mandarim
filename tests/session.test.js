import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, Store, memoryBackend } from '../src/core/storage.js';
import {
  startSession, activeSession, recordAnswer, markSupportUsed, advance, clearSession,
  sessionProgress, isStale, describeSession, STALE_HOURS,
} from '../src/core/session.js';
import { buildVocabExercise, gradeExercise } from '../src/core/exercises.js';

function exercicio(state) {
  return buildVocabExercise(state, { count: 4, seed: 42 });
}

test('a sessão guarda respostas, apoio usado e posição', () => {
  const s = emptyState();
  const ex = exercicio(s);
  startSession(s, ex);
  recordAnswer(s, { itemId: ex.items[0].id, answer: 2, feedback: { correct: false, detail: 'x' } });
  markSupportUsed(s, ex.items[0].id);
  advance(s);
  const sessao = activeSession(s);
  assert.equal(sessao.answers[ex.items[0].id], 2);
  assert.equal(sessao.supportUsed[ex.items[0].id], true);
  assert.equal(sessao.index, 1);
  assert.equal(sessao.feedback, null, 'avançar limpa o feedback');
});

test('a sessão atravessa o ciclo de salvar e recarregar', () => {
  const backend = memoryBackend();
  const store = new Store(backend);
  const ex = exercicio(store.state);
  store.update((s) => startSession(s, ex));
  store.update((s) => recordAnswer(s, { itemId: ex.items[0].id, answer: 1 }));

  const recarregado = new Store(backend);
  const sessao = activeSession(recarregado.state);
  assert.ok(sessao, 'a sessão sobrevive ao recarregamento');
  assert.equal(sessao.answers[ex.items[0].id], 1);
  assert.equal(sessao.exercise.items.length, 4);
  assert.equal(describeSession(sessao), 'Reconhecimento de vocabulário — 1 de 4 respondido(s)');
});

test('sessão aberta não produz desempenho; só a conclusão produz', () => {
  const s = emptyState();
  const ex = exercicio(s);
  startSession(s, ex);
  recordAnswer(s, { itemId: ex.items[0].id, answer: ex.items[0].answer });
  assert.equal(s.skillEvidence.length, 0);
  assert.equal(s.exerciseResults.length, 0);

  gradeExercise(s, ex, activeSession(s).answers);
  assert.equal(s.exerciseResults.length, 1);
});

test('descartar a sessão não deixa rastro de desempenho', () => {
  const s = emptyState();
  const ex = exercicio(s);
  startSession(s, ex);
  recordAnswer(s, { itemId: ex.items[0].id, answer: 0 });
  const descartada = clearSession(s);
  assert.ok(descartada);
  assert.equal(activeSession(s), null);
  assert.equal(s.skillEvidence.length, 0);
});

test('o progresso é contado pelas respostas, não pelo cursor', () => {
  const s = emptyState();
  const ex = exercicio(s);
  startSession(s, ex);
  recordAnswer(s, { itemId: ex.items[0].id, answer: 0 });
  recordAnswer(s, { itemId: ex.items[1].id, answer: 0 });
  const p = sessionProgress(activeSession(s));
  assert.equal(p.answered, 2);
  assert.equal(p.remaining, 2);
  assert.equal(p.percent, 50);
  assert.equal(p.complete, false);
});

test('sessão antiga é sinalizada como obsoleta', () => {
  const s = emptyState();
  startSession(s, exercicio(s), { at: new Date(Date.now() - (STALE_HOURS + 1) * 3600 * 1000).toISOString() });
  assert.equal(isStale(activeSession(s)), true);
  startSession(s, exercicio(s));
  assert.equal(isStale(activeSession(s)), false);
});

test('operações sem sessão ativa não quebram', () => {
  const s = emptyState();
  assert.equal(recordAnswer(s, { itemId: 'x', answer: 1 }), null);
  assert.equal(advance(s), null);
  assert.equal(markSupportUsed(s, 'x'), null);
  assert.equal(sessionProgress(null), null);
  assert.equal(describeSession(null), '');
});
