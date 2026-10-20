import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { emptyState } from '../src/core/storage.js';
import { ingestPack } from '../src/core/packs.js';
import { resetRegistry } from '../src/core/content/lexicon.js';
import { validatePack } from '../src/core/packValidation.js';
import { estimateAllSkills } from '../src/core/skills.js';
import { mergeStates } from '../src/core/merge.js';
import { addDays, totalXp } from '../src/core/xp.js';
import {
  filaDeFala, registrarFala, frasesTravadas, resumoFala, roteiroConversa, concluirConversa, MINIMO_FRASES_XP,
} from '../src/core/fala.js';
import {
  buildBriefing, palavrasVistas, incorporarPacotesAnteriores, atualizarBriefingAntigo,
} from '../src/core/briefing.js';
import { startPlacement, nextQuestion, submitAnswer, finishPlacement } from '../src/core/placement.js';

const REAL_PACK = JSON.parse(await fs.readFile(new URL('./fixtures/pack-real.json', import.meta.url), 'utf8'));
const clonePack = () => JSON.parse(JSON.stringify(REAL_PACK));
const HOJE = '2026-10-16';
const at = (dia, h = 10) => `${dia}T${String(h).padStart(2, '0')}:00:00`;

function estadoComPacote(t) {
  t.after(resetRegistry);
  const s = emptyState();
  ingestPack(s, clonePack(), { at: at(HOJE, 8) });
  return s;
}

const ROLEPLAY = {
  title: 'Depois do jogo',
  situation: 'Um colega novo puxa conversa.',
  turns: [
    {
      partner: { hz: '你踢什么位置？', py: 'Nǐ tī shénme wèizhì?', pt: 'Você joga em que posição?' },
      task: 'Diga que você é zagueiro.',
      answers: [{ hz: '我是后卫。', py: 'Wǒ shì hòuwèi.', pt: 'Sou zagueiro.' }],
    },
    {
      partner: { hz: '周末一起踢吧！', py: 'Zhōumò yìqǐ tī ba!', pt: 'Vamos jogar no fim de semana!' },
      task: 'Aceite o convite.',
      answers: [{ hz: '好啊！', py: 'Hǎo a!', pt: 'Beleza!' }, { hz: '好，周末见！', py: 'Hǎo, zhōumò jiàn!', pt: 'Combinado!' }],
    },
  ],
};

// ───────────────────────────── fila de fala ─────────────────────────────

test('a fila de fala começa pelas frases de campo do pacote e não repete frase', (t) => {
  const s = estadoComPacote(t);
  const fila = filaDeFala(s, { hoje: HOJE, limite: 50 });
  assert.equal(fila[0].hz, REAL_PACK.fieldPhrases[0].hz);
  assert.equal(fila[0].origem, 'frase de campo');
  assert.equal(new Set(fila.map((f) => f.hz)).size, fila.length);
  assert.ok(fila.some((f) => f.origem === 'diálogo'));
  assert.deepEqual(filaDeFala(emptyState(), { hoje: HOJE }), [], 'sem pacote nem cartão, fila vazia');
});

test('o que travou volta primeiro; o que saiu bem descansa 3 dias', (t) => {
  const s = estadoComPacote(t);
  const [primeira, segunda, terceira] = filaDeFala(s, { hoje: HOJE });
  registrarFala(s, { hz: primeira.hz, nota: 'bem', modo: 'repetir', at: at(HOJE) });
  registrarFala(s, { hz: terceira.hz, nota: 'travei', modo: 'dizer', at: at(HOJE) });

  const fila = filaDeFala(s, { hoje: HOJE, limite: 50 });
  assert.equal(fila[0].hz, terceira.hz, 'travada na frente');
  assert.equal(fila[0].ultimaNota, 'travei');
  assert.ok(!fila.some((f) => f.hz === primeira.hz), 'a que saiu bem descansa');
  assert.ok(fila.some((f) => f.hz === segunda.hz));

  const depois = filaDeFala(s, { hoje: addDays(HOJE, 3), limite: 50 });
  assert.ok(depois.some((f) => f.hz === primeira.hz), 'depois do descanso ela volta');
});

test('cartões de frase aprovados também entram na fila', () => {
  const s = emptyState();
  s.cardDrafts.push({ id: 'c1', status: 'approved', kind: 'sentence', front: '传给我！', pinyin: 'Chuán gěi wǒ!', back: 'Passa pra mim!' });
  s.cardDrafts.push({ id: 'c2', status: 'pending', kind: 'sentence', front: '射门！', pinyin: 'Shèmén!', back: 'Chuta!' });
  assert.deepEqual(filaDeFala(s).map((f) => f.hz), ['传给我！']);
});

// ───────────────────────── XP sem proficiência ─────────────────────────

test(`praticar fala dá XP uma vez por dia a partir de ${MINIMO_FRASES_XP} frases, e nunca vira proficiência`, (t) => {
  const s = estadoComPacote(t);
  const fila = filaDeFala(s, { hoje: HOJE, limite: 50 });
  const resultados = fila.slice(0, MINIMO_FRASES_XP + 3)
    .map((f) => registrarFala(s, { hz: f.hz, nota: 'bem', modo: 'repetir', at: at(HOJE) }));
  const concedidos = resultados.filter((r) => r.xp?.granted);
  assert.equal(concedidos.length, 1, 'uma vez por dia');
  assert.equal(resultados.findIndex((r) => r.xp?.granted), MINIMO_FRASES_XP - 1);
  assert.equal(s.skillEvidence.length, 0, 'autoavaliação não é evidência');
  const fala = estimateAllSkills(s).find((e) => e.skill === 'speaking');
  assert.equal(fala.status, 'nao_avaliada');
  assert.equal(resumoFala(s, { hoje: HOJE }).hoje, MINIMO_FRASES_XP + 3);
});

test('nota ou modo desconhecido é recusado', () => {
  const s = emptyState();
  assert.throws(() => registrarFala(s, { hz: '好', nota: 'perfeito', modo: 'repetir' }), /nota/);
  assert.throws(() => registrarFala(s, { hz: '好', nota: 'bem', modo: 'cantar' }), /modo/);
});

test('conversa simulada concluída dá XP uma vez por dia', () => {
  const s = emptyState();
  assert.equal(concluirConversa(s, { titulo: 'x', turnos: 4, at: at(HOJE) }).granted, true);
  assert.equal(concluirConversa(s, { titulo: 'y', turnos: 4, at: at(HOJE, 18) }).granted, false);
  assert.equal(totalXp(s), 20);
});

test('frases travadas vão para o briefing e saem quando passam a sair bem', (t) => {
  const s = estadoComPacote(t);
  registrarFala(s, { hz: '回来防守！', nota: 'travei', modo: 'dizer', at: at(HOJE) });
  registrarFala(s, { hz: '左边有人！', nota: 'travei', modo: 'conversa', at: at(HOJE) });
  assert.deepEqual(buildBriefing(s, { date: HOJE }).speakingStuck.sort(), ['回来防守！', '左边有人！'].sort());

  registrarFala(s, { hz: '回来防守！', nota: 'bem', modo: 'dizer', at: at(HOJE, 11) });
  assert.deepEqual(frasesTravadas(s, { hoje: HOJE }), ['左边有人！']);
  assert.deepEqual(frasesTravadas(s, { hoje: addDays(HOJE, 30) }), [], 'travada antiga sai do briefing');
});

test('mesclar dois aparelhos une o registro de fala sem duplicar', () => {
  const a = emptyState();
  const b = emptyState();
  const r = registrarFala(a, { hz: '好球！', nota: 'quase', modo: 'repetir', at: at(HOJE) }).registro;
  b.falaRegistro.push(r);
  registrarFala(b, { hz: '加油！', nota: 'bem', modo: 'repetir', at: at(HOJE, 11) });
  const { state } = mergeStates(a, b);
  assert.deepEqual(state.falaRegistro.map((x) => x.hz), ['好球！', '加油！']);
});

// ───────────────────────────── conversa ─────────────────────────────

test('sem roleplay no pacote, a conversa sai do diálogo: você é quem responde', () => {
  const r = roteiroConversa(clonePack());
  assert.equal(r.origem, 'dialogo');
  assert.match(r.situacao, /Você é B/);
  const linhasB = REAL_PACK.dialogue.lines.filter((l) => l.speaker === 'B');
  assert.equal(r.turnos.length, linhasB.length);
  assert.equal(r.turnos[0].parceiro[0].hz, REAL_PACK.dialogue.lines[0].hz);
  assert.equal(r.turnos[0].respostas[0].hz, linhasB[0].hz);
  assert.match(r.turnos[0].tarefa, new RegExp(linhasB[0].pt.slice(0, 10)));
  assert.equal(r.fecho.at(-1).hz, REAL_PACK.dialogue.lines.at(-1).hz, 'fala final do colega fecha a conversa');
});

test('com roleplay no pacote, a conversa usa as tarefas abertas do modelo', () => {
  const r = roteiroConversa({ ...clonePack(), roleplay: ROLEPLAY });
  assert.equal(r.origem, 'roleplay');
  assert.equal(r.turnos.length, 2);
  assert.equal(r.turnos[1].respostas.length, 2);
  assert.equal(r.turnos[0].tarefa, 'Diga que você é zagueiro.');
});

test('o validador aceita roleplay bem formado e recusa o malformado', () => {
  assert.deepEqual(validatePack({ ...clonePack(), roleplay: ROLEPLAY }).errors, []);
  const semResposta = JSON.parse(JSON.stringify(ROLEPLAY));
  semResposta.turns[0].answers = [];
  assert.match(validatePack({ ...clonePack(), roleplay: semResposta }).errors.join(' '), /answers/);
  const comNota = JSON.parse(JSON.stringify(ROLEPLAY));
  comNota.turns[0].score = 80;
  assert.match(validatePack({ ...clonePack(), roleplay: comNota }).errors.join(' '), /proficiência/);
  const semPinyin = JSON.parse(JSON.stringify(ROLEPLAY));
  semPinyin.turns[1].answers[0].py = '';
  assert.equal(validatePack({ ...clonePack(), roleplay: semPinyin }).ok, false);
});

// ───────────────────── briefing: o que ele já viu de verdade ─────────────────────

test('briefing de aluno novo não dá o dicionário como sabido e sugere vocabulário de futebol', () => {
  const b = buildBriefing(emptyState(), { date: HOJE });
  assert.deepEqual(b.seenWords, []);
  assert.ok(!('knownWords' in b));
  const sugeridas = b.candidateWords.map((c) => c.hz);
  assert.ok(b.candidateWords.length >= 20);
  assert.ok(sugeridas.some((hz) => ['传球', '守门员', '射门', '球门'].includes(hz)), 'futebol entra nas sugestões');
  assert.ok(sugeridas.indexOf('我') === -1 || sugeridas.indexOf('我') > 15, 'palavra básica sem tema fica para o fim');
  assert.ok(b.candidateWords.every((c) => c.py && c.pt), 'sugestão leva pinyin e tradução');
});

test('palavra apresentada por pacote vira vista e sai das sugestões', (t) => {
  const s = estadoComPacote(t);
  const b = buildBriefing(s, { date: addDays(HOJE, 1) });
  for (const v of REAL_PACK.vocab) assert.ok(b.seenWords.includes(v.hz), v.hz);
  const sugeridas = new Set(b.candidateWords.map((c) => c.hz));
  assert.ok(REAL_PACK.vocab.every((v) => !sugeridas.has(v.hz)));
});

test('vocabulário acertado no nivelamento conta como visto; o errado não', () => {
  const s = emptyState();
  startPlacement(s, {});
  let q;
  const respondidas = [];
  while ((q = nextQuestion(s.placementInProgress))) {
    const certa = q.stage === 'B' && q.type === 'mc' && respondidas.length % 2 === 0;
    const answer = q.type === 'self_report' ? [] : q.type === 'open' ? '' : certa ? q.answer : (q.answer + 1) % (q.options?.length || 2);
    submitAnswer(s, { questionId: q.id, answer });
    respondidas.push({ q, certa });
  }
  finishPlacement(s);
  const vistas = new Set(palavrasVistas(s));
  const acertos = respondidas.filter((r) => r.certa && r.q.skill === 'vocabulary' && r.q.promptHz);
  const erros = respondidas.filter((r) => !r.certa && r.q.skill === 'vocabulary' && r.q.stage === 'B' && r.q.promptHz);
  assert.ok(acertos.length > 0);
  for (const r of acertos) if (r.q.promptHz.length <= 4) assert.ok(vistas.has(r.q.promptHz), r.q.promptHz);
  for (const r of erros) assert.ok(!vistas.has(r.q.promptHz) || acertos.some((a) => a.q.promptHz === r.q.promptHz), r.q.promptHz);
});

test('pedido de amanhã feito antes do pacote de hoje é completado com o que hoje ensinou', () => {
  const amanha = addDays(REAL_PACK.date, 1);
  const pedido = buildBriefing(emptyState(), { date: amanha });
  assert.equal(pedido.grammar.nextInSyllabus[0].id, 'shi-a-b');

  const anterior = { ...clonePack(), grammarNote: { ...REAL_PACK.grammarNote, pointId: 'shi-a-b' } };
  const { briefing, incorporados } = incorporarPacotesAnteriores(pedido, [anterior]);
  assert.deepEqual(incorporados, [REAL_PACK.date]);
  assert.ok(briefing.grammar.seen.includes('shi-a-b'));
  assert.notEqual(briefing.grammar.nextInSyllabus[0].id, 'shi-a-b', 'a fila anda: não ensina 是 duas vezes');
  assert.equal(briefing.grammar.progress.done, 1);
  for (const v of REAL_PACK.vocab) assert.ok(briefing.alreadyTaught.includes(v.hz));
  assert.ok(briefing.candidateWords.every((c) => !REAL_PACK.vocab.some((v) => v.hz === c.hz)));

  const deNovo = incorporarPacotesAnteriores(briefing, [anterior]).briefing;
  assert.deepEqual(deNovo.grammar.seen, briefing.grammar.seen, 'idempotente');
  assert.deepEqual(deNovo.alreadyTaught, briefing.alreadyTaught);

  const doMesmoDia = incorporarPacotesAnteriores(buildBriefing(emptyState(), { date: REAL_PACK.date }), [anterior]);
  assert.deepEqual(doMesmoDia.incorporados, [], 'pacote do próprio dia ou futuro não conta');
});

test('briefing de versão antiga do app (knownWords) é convertido no computador', () => {
  const novo = buildBriefing(emptyState(), { date: HOJE });
  const { seenWords, candidateWords, speakingStuck, ...resto } = novo;
  const antigo = {
    ...resto,
    knownWords: ['我', '传球', '守门员'],
    missedItems: [{ ref: '时间', skill: 'vocabulary', tags: ['tempo'], misses: 2 }],
    goals: ['futebol', 'conversar_simples'],
  };
  const b = atualizarBriefingAntigo(antigo);
  assert.ok(!('knownWords' in b));
  assert.deepEqual(b.seenWords, ['时间']);
  assert.ok(b.candidateWords.some((c) => c.hz === '传球'), 'o dicionário volta a ser sugestão');
  assert.equal(b.candidateWords[0].tags.includes('futebol'), true, 'objetivo de maior prioridade primeiro');
  assert.deepEqual(b.speakingStuck, []);
  assert.equal(atualizarBriefingAntigo(novo), novo, 'briefing novo passa intacto');
});
