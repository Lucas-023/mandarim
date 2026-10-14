import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/core/storage.js';
import { mergeStates, descreverMesclagem } from '../src/core/merge.js';

function comHora(hora) {
  const s = emptyState('2026-10-01T00:00:00Z');
  s.updatedAt = hora;
  return s;
}

test('eventos de XP dos dois aparelhos são somados, sem duplicar', () => {
  const pc = comHora('2026-10-13T09:00:00Z');
  pc.xpEvents.push({ id: 'a', key: 'manha', type: 'review_session', amount: 10, at: '2026-10-13T09:00:00Z' });
  const celular = comHora('2026-10-13T18:00:00Z');
  celular.xpEvents.push({ id: 'a', key: 'manha', type: 'review_session', amount: 10, at: '2026-10-13T09:00:00Z' });
  celular.xpEvents.push({ id: 'b', key: 'tarde', type: 'dialog_study', amount: 15, at: '2026-10-13T18:00:00Z' });

  const { state, relatorio } = mergeStates(pc, celular);
  assert.equal(state.xpEvents.length, 2, 'o evento repetido entra uma vez');
  assert.equal(state.xpEvents.reduce((n, e) => n + e.amount, 0), 25);
  assert.equal(relatorio.adicionados.xpEvents, 1);
});

test('a mesclagem é simétrica no que importa: o total não depende da ordem', () => {
  const a = comHora('2026-10-13T09:00:00Z');
  a.skillEvidence.push({ id: 'e1', skill: 'vocabulary', score: 1, difficulty: 1, at: '2026-10-13T09:00:00Z' });
  const b = comHora('2026-10-13T18:00:00Z');
  b.skillEvidence.push({ id: 'e2', skill: 'reading', score: 0, difficulty: 2, at: '2026-10-13T18:00:00Z' });

  const ab = mergeStates(a, b).state;
  const ba = mergeStates(b, a).state;
  assert.equal(ab.skillEvidence.length, 2);
  assert.deepEqual(
    ab.skillEvidence.map((e) => e.id).sort(),
    ba.skillEvidence.map((e) => e.id).sort(),
  );
});

test('no agendamento, vale o item revisado mais recentemente', () => {
  const pc = comHora('2026-10-13T09:00:00Z');
  pc.schedule = { items: { 足球: { ref: '足球', reps: 1, intervalDays: 3, due: '2026-10-16', lastSeenAt: '2026-10-13T09:00:00Z', introducedAt: '2026-10-10T08:00:00Z' } } };
  const celular = comHora('2026-10-13T18:00:00Z');
  celular.schedule = {
    items: {
      足球: { ref: '足球', reps: 2, intervalDays: 8, due: '2026-10-21', lastSeenAt: '2026-10-13T18:00:00Z', introducedAt: '2026-10-10T08:00:00Z' },
      裁判: { ref: '裁判', reps: 0, lapses: 1, intervalDays: 1, due: '2026-10-14', lastSeenAt: '2026-10-13T18:30:00Z', introducedAt: '2026-10-13T18:00:00Z' },
    },
  };

  const { state } = mergeStates(pc, celular);
  assert.equal(state.schedule.items['足球'].intervalDays, 8, 'a revisão mais recente manda');
  assert.ok(state.schedule.items['裁判'], 'item que só existia no celular é incorporado');
});

test('cartões: um por frente, mantendo o estado mais avançado', () => {
  const a = comHora('2026-10-13T09:00:00Z');
  a.cardDrafts.push({ id: 'c1', front: '传球', back: 'passar', status: 'pending', tags: [] });
  const b = comHora('2026-10-13T18:00:00Z');
  b.cardDrafts.push({ id: 'c2', front: '传球', back: 'passar a bola', status: 'exported', tags: [] });
  b.cardDrafts.push({ id: 'c3', front: '射门', back: 'chutar', status: 'pending', tags: [] });

  const { state, relatorio } = mergeStates(a, b);
  const frentes = state.cardDrafts.map((d) => d.front).sort();
  assert.deepEqual(frentes, ['传球', '射门']);
  assert.equal(state.cardDrafts.find((d) => d.front === '传球').status, 'exported');
  assert.equal(relatorio.cartoesDuplicadosRemovidos, 1);
});

test('conquistas ficam com a data mais antiga', () => {
  const a = comHora('2026-10-13T09:00:00Z');
  a.achievements.push({ id: 'first_conversation', at: '2026-10-05T10:00:00Z' });
  const b = comHora('2026-10-13T18:00:00Z');
  b.achievements.push({ id: 'first_conversation', at: '2026-10-12T10:00:00Z' });
  const { state } = mergeStates(a, b);
  assert.equal(state.achievements.length, 1);
  assert.equal(state.achievements[0].at, '2026-10-05T10:00:00Z');
});

test('perfil e configurações vêm do lado alterado mais recentemente', () => {
  const antigo = comHora('2026-10-13T09:00:00Z');
  antigo.profile.minutesPerDay = 20;
  antigo.settings.dailyGoalXp = 50;
  const novo = comHora('2026-10-13T18:00:00Z');
  novo.profile.minutesPerDay = 60;
  novo.settings.dailyGoalXp = 150;

  const { state, relatorio } = mergeStates(antigo, novo);
  assert.equal(state.profile.minutesPerDay, 60);
  assert.equal(state.settings.dailyGoalXp, 150);
  assert.match(relatorio.escalaresDe, /arquivo recebido/);

  const inverso = mergeStates(novo, antigo);
  assert.equal(inverso.state.profile.minutesPerDay, 60, 'quem decide é a data, não a posição');
  assert.match(inverso.relatorio.escalaresDe, /este aparelho/);
});

test('a sessão em andamento mais recente sobrevive à mesclagem', () => {
  const a = comHora('2026-10-13T09:00:00Z');
  a.activeSession = { id: 's_pc', updatedAt: '2026-10-13T09:00:00Z', answers: { i1: 0 }, exercise: { items: [] } };
  const b = comHora('2026-10-13T18:00:00Z');
  b.activeSession = { id: 's_cel', updatedAt: '2026-10-13T18:00:00Z', answers: { i1: 1, i2: 2 }, exercise: { items: [] } };
  assert.equal(mergeStates(a, b).state.activeSession.id, 's_cel');

  const semSessao = comHora('2026-10-13T20:00:00Z');
  assert.equal(mergeStates(semSessao, a).state.activeSession.id, 's_pc', 'não apaga a sessão do outro lado');
});

test('pacotes e léxico são unidos por data e por palavra', () => {
  const a = comHora('2026-10-13T09:00:00Z');
  a.packs.push({ date: '2026-10-12', ingestedAt: '2026-10-12T06:00:00Z', pack: { date: '2026-10-12' }, studiedExerciseIds: [] });
  a.lexiconExtra.push({ hz: '休息', py: 'xiūxi', pt: 'descansar', level: 2, tags: [] });
  const b = comHora('2026-10-13T18:00:00Z');
  b.packs.push({ date: '2026-10-13', ingestedAt: '2026-10-13T06:00:00Z', pack: { date: '2026-10-13' }, studiedExerciseIds: [] });
  b.lexiconExtra.push({ hz: '休息', py: 'xiūxi', pt: 'descansar', level: 2, tags: [] });
  b.lexiconExtra.push({ hz: '教练', py: 'jiàoliàn', pt: 'técnico', level: 2, tags: [] });

  const { state } = mergeStates(a, b);
  assert.deepEqual(state.packs.map((p) => p.date), ['2026-10-12', '2026-10-13']);
  assert.equal(state.lexiconExtra.length, 2, 'palavra repetida não duplica');
});

test('mesclar dois estados iguais não muda nada e diz isso', () => {
  const a = comHora('2026-10-13T09:00:00Z');
  a.xpEvents.push({ id: 'a', key: 'k', type: 'review_session', amount: 10, at: '2026-10-13T09:00:00Z' });
  const { state, relatorio } = mergeStates(a, JSON.parse(JSON.stringify(a)));
  assert.equal(state.xpEvents.length, 1);
  assert.equal(relatorio.total, 0);
  assert.match(descreverMesclagem(relatorio), /já estavam iguais/);
});

test('a data de criação mais antiga é preservada', () => {
  const antigo = emptyState('2026-01-01T00:00:00Z');
  antigo.updatedAt = '2026-10-13T09:00:00Z';
  const novo = emptyState('2026-09-01T00:00:00Z');
  novo.updatedAt = '2026-10-13T18:00:00Z';
  assert.equal(mergeStates(antigo, novo).state.createdAt, '2026-01-01T00:00:00Z');
});
