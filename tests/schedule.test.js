import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/core/storage.js';
import {
  introduceItems, reviewOutcome, dueItems, upcomingItems, leeches, scheduleStats,
  seenGrammarIds, markGrammarKnown, grammarRef, getItem, explainItem, daysBetween,
  LEECH_LAPSES, EASE_MIN, MATURE_DAYS,
} from '../src/core/schedule.js';
import { GRAMMAR_SYLLABUS, nextGrammarPoints, grammarProgress, grammarPoint } from '../src/core/content/grammar.js';
import { buildVocabExercise, buildReviewExercise, gradeExercise, targetsOf } from '../src/core/exercises.js';
import { dayKey, addDays } from '../src/core/xp.js';
import { registerEntries, resetRegistry } from '../src/core/content/lexicon.js';

const HOJE = '2026-10-13';
const em = (dia) => ({ at: `${dia}T08:00:00` });

// ───────────────────────── agendamento ─────────────────────────

test('item apresentado hoje volta amanhã, não hoje', () => {
  const s = emptyState();
  introduceItems(s, [{ ref: '休息', label: 'descansar' }], em(HOJE));
  assert.equal(dueItems(s, { today: HOJE }).length, 0);
  assert.equal(dueItems(s, { today: addDays(HOJE, 1) }).length, 1);
});

test('apresentar de novo não reinicia o progresso do item', () => {
  const s = emptyState();
  introduceItems(s, [{ ref: '休息' }], em(HOJE));
  reviewOutcome(s, '休息', true, em(addDays(HOJE, 1)));
  const antes = getItem(s, '休息').reps;
  const adicionados = introduceItems(s, [{ ref: '休息' }], em(addDays(HOJE, 2)));
  assert.equal(adicionados.length, 0);
  assert.equal(getItem(s, '休息').reps, antes);
});

test('acertos seguidos expandem o intervalo; errar volta para um dia', () => {
  const s = emptyState();
  introduceItems(s, [{ ref: '休息' }], em(HOJE));
  const intervalos = [];
  let dia = addDays(HOJE, 1);
  for (let i = 0; i < 4; i += 1) {
    const item = reviewOutcome(s, '休息', true, em(dia));
    intervalos.push(item.intervalDays);
    dia = item.due;
  }
  assert.deepEqual(intervalos.slice(0, 2), [1, 3], 'os dois primeiros passos são fixos');
  assert.ok(intervalos[2] > intervalos[1] && intervalos[3] > intervalos[2], 'depois cresce');

  const errado = reviewOutcome(s, '休息', false, em(dia));
  assert.equal(errado.intervalDays, 1);
  assert.equal(errado.lapses, 1);
  assert.equal(errado.reps, 0);
  assert.ok(errado.ease < 2.5, 'errar reduz a facilidade');
});

test('a facilidade tem piso e quatro recaídas marcam o item como problemático', () => {
  const s = emptyState();
  introduceItems(s, [{ ref: '越位' }], em(HOJE));
  let dia = addDays(HOJE, 1);
  for (let i = 0; i < 10; i += 1) {
    const item = reviewOutcome(s, '越位', false, em(dia));
    dia = addDays(dia, 1);
    if (i + 1 === LEECH_LAPSES) assert.equal(item.leech, true, 'leech na quarta recaída');
  }
  const item = getItem(s, '越位');
  assert.ok(item.ease >= EASE_MIN);
  assert.equal(leeches(s).length, 1);
});

test('a fila de revisão prioriza o mais atrasado e depois o que tem mais recaídas', () => {
  const s = emptyState();
  introduceItems(s, [{ ref: '甲' }, { ref: '乙' }, { ref: '丙' }], em(addDays(HOJE, -20)));
  // 甲 fica muito atrasado; 乙 tem recaída; 丙 foi revisado hoje.
  reviewOutcome(s, '乙', false, em(addDays(HOJE, -1)));
  reviewOutcome(s, '丙', true, em(HOJE));
  const fila = dueItems(s, { today: HOJE }).map((i) => i.ref);
  assert.equal(fila[0], '甲');
  assert.ok(!fila.includes('丙'), 'item revisado hoje não volta hoje');
});

test('estatísticas separam devidos, consolidados e problemáticos', () => {
  const s = emptyState();
  introduceItems(s, [{ ref: '甲' }, { ref: s.schedule ? '乙' : '乙' }], em(addDays(HOJE, -5)));
  introduceItems(s, [{ ref: 'gram:shi-a-b', type: 'grammar' }], em(addDays(HOJE, -5)));
  const stats = scheduleStats(s, { today: HOJE });
  assert.equal(stats.total, 3);
  assert.equal(stats.words, 2);
  assert.equal(stats.grammar, 1);
  assert.equal(stats.dueToday, 3);
  assert.equal(stats.overdue, 3);
  assert.equal(stats.mature, 0);
});

test('itens que vencem em breve aparecem separados dos devidos', () => {
  const s = emptyState();
  introduceItems(s, [{ ref: '甲' }], em(HOJE));
  assert.equal(upcomingItems(s, { today: HOJE, days: 3 }).length, 1);
  assert.equal(dueItems(s, { today: HOJE }).length, 0);
});

test('a explicação do item é legível e diz quando ele volta', () => {
  const s = emptyState();
  introduceItems(s, [{ ref: '甲' }], em(HOJE));
  const texto = explainItem(getItem(s, '甲'), { today: HOJE });
  assert.match(texto, /intervalo atual 1 dia/);
  assert.match(texto, /volta em 1 dia/);
  assert.equal(daysBetween(HOJE, addDays(HOJE, 7)), 7);
});

// ───────────────────── currículo gramatical ─────────────────────

test('o currículo tem ordem e ids únicos, do mais simples ao mais difícil', () => {
  const ids = GRAMMAR_SYLLABUS.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length, 'ids duplicados');
  assert.ok(GRAMMAR_SYLLABUS.length >= 40);
  const niveis = GRAMMAR_SYLLABUS.map((g) => g.level);
  assert.equal(niveis[0], 1);
  assert.ok(niveis.at(-1) >= 2, 'o fim da fila é mais difícil que o começo');
  assert.ok(GRAMMAR_SYLLABUS.every((g) => g.pattern && g.hint && g.name));
});

test('a fila entrega a próxima estrutura não vista e respeita o nível', () => {
  const primeiros = GRAMMAR_SYLLABUS.slice(0, 5).map((g) => g.id);
  const proximo = nextGrammarPoints(primeiros, { limit: 1 })[0];
  assert.equal(proximo.id, GRAMMAR_SYLLABUS[5].id);

  const soNivel1 = nextGrammarPoints([], { limit: 3, maxLevel: 1 });
  assert.ok(soNivel1.every((g) => g.level === 1));
});

test('quando tudo do nível já foi visto, a fila avança para o nível seguinte', () => {
  const nivel1 = GRAMMAR_SYLLABUS.filter((g) => g.level === 1).map((g) => g.id);
  const proximo = nextGrammarPoints(nivel1, { limit: 1, maxLevel: 1 })[0];
  assert.ok(proximo.level > 1);
});

test('marcar estruturas como dominadas pula a fila mas mantém a revisão', () => {
  const s = emptyState();
  const alvo = GRAMMAR_SYLLABUS.slice(0, 3).map((g) => g.id);
  markGrammarKnown(s, alvo, { ...em(HOJE), labelFor: (id) => grammarPoint(id).name });
  assert.deepEqual(seenGrammarIds(s), alvo);
  assert.equal(nextGrammarPoints(seenGrammarIds(s), { limit: 1 })[0].id, GRAMMAR_SYLLABUS[3].id);

  const item = getItem(s, grammarRef(alvo[0]));
  assert.equal(item.intervalDays, 7, 'entra com intervalo de 7 dias, não 1');
  assert.equal(dueItems(s, { today: addDays(HOJE, 7) }).length, 3);
  assert.equal(grammarProgress(seenGrammarIds(s)).done, 3);
});

// ───────────── exercícios alimentam e consomem o agendamento ─────────────

test('corrigir exercício reagenda os itens treinados', () => {
  const s = emptyState();
  const ex = buildVocabExercise(s, { count: 4, seed: 7 });
  const certas = Object.fromEntries(ex.items.map((i) => [i.id, i.answer]));
  gradeExercise(s, ex, certas, em(HOJE));

  for (const item of ex.items) {
    const agendado = getItem(s, item.ref);
    assert.ok(agendado, `${item.ref} deveria estar agendado`);
    assert.equal(agendado.reps, 1);
    assert.equal(agendado.lastResult, 'acerto');
  }
});

test('errar no exercício marca recaída no item', () => {
  const s = emptyState();
  const ex = buildVocabExercise(s, { count: 2, seed: 11 });
  const erradas = Object.fromEntries(ex.items.map((i) => [i.id, (i.answer + 1) % 4]));
  gradeExercise(s, ex, erradas, em(HOJE));
  assert.ok(ex.items.every((i) => getItem(s, i.ref).lapses === 1));
});

test('targets declarados mandam no agendamento; refs genéricas são ignoradas', () => {
  assert.deepEqual(targetsOf({ ref: 'futebol', targets: ['传球', 'gram:ba-construcao'] }), ['传球', 'gram:ba-construcao']);
  assert.deepEqual(targetsOf({ ref: '传球' }), ['传球']);
  assert.deepEqual(targetsOf({ ref: 'futebol' }), [], 'nome de tema não é item de revisão');
  assert.deepEqual(targetsOf({ ref: 'x', targets: ['tema'] }), [], 'target inválido é descartado');
});

test('o exercício de revisão usa só o que está devido e cobra recuperação ativa do atrasado', (t) => {
  t.after(resetRegistry);
  const s = emptyState();
  registerEntries([{ hz: '休息', py: 'xiūxi', pt: 'descansar', level: 2, tags: ['cotidiano'] }], { source: 'teste' });
  introduceItems(s, [{ ref: '休息' }, { ref: '足球' }], em(addDays(HOJE, -10)));
  introduceItems(s, [{ ref: '谢谢' }], em(HOJE)); // ainda não devido

  const ex = buildReviewExercise(s, { count: 10, today: HOJE, seed: 3 });
  const refs = ex.items.map((i) => i.ref);
  assert.ok(refs.includes('休息') && refs.includes('足球'));
  assert.ok(!refs.includes('谢谢'), 'item não devido não entra na revisão');
  assert.ok(ex.items.every((i) => i.options.length === 4 && i.targets.length === 1));
  assert.ok(ex.items.every((i) => /Como se diz/.test(i.prompt)), 'atrasado vira recuperação ativa');
  assert.match(ex.note, /agendador/);
});

test('sem nada devido, o exercício de revisão vem vazio em vez de inventar itens', () => {
  const s = emptyState();
  introduceItems(s, [{ ref: '足球' }], em(HOJE));
  assert.equal(buildReviewExercise(s, { today: HOJE }).items.length, 0);
});

test('revisar pelo exercício de revisão empurra o item para o futuro', (t) => {
  t.after(resetRegistry);
  const s = emptyState();
  introduceItems(s, [{ ref: '足球' }], em(addDays(HOJE, -3)));
  const ex = buildReviewExercise(s, { count: 1, today: HOJE, seed: 1 });
  gradeExercise(s, ex, { [ex.items[0].id]: ex.items[0].answer }, em(HOJE));
  const item = getItem(s, '足球');
  assert.ok(item.due > HOJE, 'depois de acertar, só volta depois');
  assert.equal(dueItems(s, { today: HOJE }).length, 0);
});

test('item consolidado é aquele com intervalo longo', () => {
  const s = emptyState();
  introduceItems(s, [{ ref: '足球' }], em(HOJE));
  const item = getItem(s, '足球');
  item.intervalDays = MATURE_DAYS + 5;
  assert.equal(scheduleStats(s, { today: HOJE }).mature, 1);
});
