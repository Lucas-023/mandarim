import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/core/storage.js';
import {
  segment, splitUnits, pinyinFor, glossFor, generateDrafts, saveDrafts,
  setDraftStatus, editDraft, removeDraft, approvedCards, normalizeFront, estimateDifficulty,
} from '../src/core/flashcards.js';

const DIALOG = `A: 你周末有什么计划？
B: 我想和朋友一起踢足球。
A: 你经常踢足球吗？
B: 是的，我每周踢两次。`;

test('segmentação usa a maior correspondência do léxico', () => {
  assert.deepEqual(segment('踢足球').map((t) => t.hz), ['踢足球']);
  assert.deepEqual(segment('我喜欢足球').map((t) => t.hz), ['我', '喜欢', '足球']);
});

test('caracteres fora do léxico são marcados como desconhecidos', () => {
  const tokens = segment('我爱龙');
  assert.equal(tokens.find((t) => t.hz === '爱').known, false);
});

test('divide diálogo em falas e preserva quem falou', () => {
  const units = splitUnits(DIALOG);
  assert.equal(units.length, 4);
  assert.equal(units[0].speaker, 'A');
  assert.equal(units[0].hz, '你周末有什么计划？');
});

test('pinyin é montado do léxico e declara lacunas', () => {
  assert.equal(pinyinFor('踢足球').pinyin, 'tī zúqiú');
  assert.equal(pinyinFor('踢足球').confidence, 'alta');
  const gap = pinyinFor('我爱足球');
  assert.equal(gap.confidence, 'media');
  assert.deepEqual(gap.gaps, ['爱']);
  assert.ok(gap.pinyin.includes('?'));
});

test('tradução de frase é glosa marcada para revisão, não tradução final', () => {
  const s = emptyState();
  const { drafts } = generateDrafts(s, DIALOG);
  const sentence = drafts.find((d) => d.kind === 'sentence');
  assert.equal(sentence.needsReview, true);
  assert.ok(sentence.reviewNotes.some((n) => /glosa/i.test(n)));
  assert.equal(glossFor('踢足球').gloss, 'jogar futebol');
});

test('gera cartões de frase e de palavra a partir do diálogo da especificação', () => {
  const s = emptyState();
  const { drafts, stats } = generateDrafts(s, DIALOG);
  const fronts = drafts.map((d) => d.front);
  assert.equal(stats.sentences, 4);
  assert.ok(fronts.includes('你周末有什么计划？'));
  assert.ok(fronts.includes('踢足球'));
  assert.ok(fronts.includes('两次'));
  const tiZuqiu = drafts.find((d) => d.front === '踢足球');
  assert.equal(tiZuqiu.pinyin, 'tī zúqiú');
  assert.equal(tiZuqiu.back, 'jogar futebol');
  assert.equal(tiZuqiu.example, '我想和朋友一起踢足球。');
  assert.ok(tiZuqiu.tags.includes('futebol'));
});

test('sugestões nascem pendentes e nada é salvo sem pedido explícito', () => {
  const s = emptyState();
  const { drafts } = generateDrafts(s, DIALOG);
  assert.ok(drafts.every((d) => d.status === 'pending'));
  assert.equal(s.cardDrafts.length, 0);
});

test('duplicatas são sinalizadas e não reinseridas', () => {
  const s = emptyState();
  saveDrafts(s, generateDrafts(s, DIALOG).drafts);
  const before = s.cardDrafts.length;
  const second = generateDrafts(s, DIALOG);
  assert.ok(second.stats.duplicates > 0);
  assert.ok(second.drafts.every((d) => d.duplicate));
  saveDrafts(s, second.drafts);
  assert.equal(s.cardDrafts.length, before);
});

test('normalização ignora pontuação e espaços ao comparar frentes', () => {
  assert.equal(normalizeFront('你好，世界！'), normalizeFront('你好 世界'));
});

test('aprovar, editar e remover rascunhos', () => {
  const s = emptyState();
  saveDrafts(s, generateDrafts(s, DIALOG).drafts);
  const target = s.cardDrafts.find((d) => d.kind === 'sentence');
  editDraft(s, target.id, { back: 'Quais são seus planos para o fim de semana?' });
  assert.equal(target.needsReview, false);
  assert.equal(target.edited, true);
  setDraftStatus(s, target.id, 'approved');
  assert.equal(approvedCards(s).length, 1);
  const other = s.cardDrafts.find((d) => d.id !== target.id);
  assert.equal(removeDraft(s, other.id), true);
  assert.equal(s.cardDrafts.find((d) => d.id === other.id), undefined);
});

test('dificuldade estimada cresce com o nível das palavras', () => {
  assert.ok(estimateDifficulty('越位') > estimateDifficulty('你好'));
});

test('texto sem chinês não gera cartões', () => {
  const s = emptyState();
  const { drafts } = generateDrafts(s, 'apenas texto em português');
  assert.equal(drafts.length, 0);
});

test('lista de palavras também é aceita como entrada', () => {
  const s = emptyState();
  const { drafts } = generateDrafts(s, '足球\n传球\n守门员');
  const fronts = drafts.map((d) => d.front);
  assert.ok(['足球', '传球', '守门员'].every((w) => fronts.includes(w)));
});
