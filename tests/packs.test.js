import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { validatePack, extractJson, PACK_SCHEMA_VERSION } from '../src/core/packValidation.js';
import { emptyState } from '../src/core/storage.js';
import { ingestPack, isIngested, packToExercise, dialogueText, latestPack, MAX_STORED_PACKS } from '../src/core/packs.js';
import { registerEntries, resetRegistry, lookup, maxEntryLen } from '../src/core/content/lexicon.js';
import { dueItems, seenGrammarIds, getItem } from '../src/core/schedule.js';
import { addDays } from '../src/core/xp.js';
import { segment, pinyinFor } from '../src/core/flashcards.js';
import { gradeExercise } from '../src/core/exercises.js';
import { estimateAllSkills } from '../src/core/skills.js';
import { buildBriefing } from '../tools/briefing.js';
import { buildDemoState } from '../src/core/demoData.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);
const REAL_PACK = JSON.parse(await fs.readFile(path.join(ROOT, 'tests/fixtures/pack-real.json'), 'utf8'));

function clonePack() {
  return JSON.parse(JSON.stringify(REAL_PACK));
}

// ───────────────────────────── validação ─────────────────────────────

test('o pacote real gerado pelo modelo passa na validação', () => {
  const check = validatePack(clonePack());
  assert.deepEqual(check.errors, []);
  assert.equal(check.ok, true);
});

test('o pacote real traz as duas metades: entrada nova e reencontro', () => {
  const pack = clonePack();
  const novos = pack.vocab.filter((v) => v.status !== 'revisao');
  const revisao = pack.vocab.filter((v) => v.status === 'revisao');
  assert.ok(novos.length >= 8, 'precisa de vocabulário novo todo dia');
  assert.ok(revisao.length >= 1, 'precisa trazer de volta o que está devido');
  assert.ok(revisao.every((v) => v.example?.hz), 'revisão vem em frase de exemplo, não isolada');
  assert.ok(pack.grammarNote.pointId, 'estrutura nova identificada no currículo');
  assert.ok(pack.exercises.every((e) => Array.isArray(e.targets) && e.targets.length),
    'todo exercício declara o que treina');
  const comGramatica = pack.exercises.filter((e) => e.targets.some((t) => t.startsWith('gram:')));
  assert.ok(comGramatica.length >= 1, 'a estrutura nova é exercitada');
});

test('ingerir o pacote agenda vocabulário e a estrutura nova para voltarem', (t) => {
  t.after(resetRegistry);
  const state = emptyState();
  const pack = clonePack();
  const { scheduled } = ingestPack(state, pack, { at: `${pack.date}T06:00:00` });
  assert.equal(scheduled.length, pack.vocab.length + 1, 'vocabulário + 1 ponto de gramática');
  assert.deepEqual(seenGrammarIds(state), [pack.grammarNote.pointId]);
  // Nada é devido no dia em que foi apresentado; tudo volta no dia seguinte.
  assert.equal(dueItems(state, { today: pack.date }).length, 0);
  assert.equal(dueItems(state, { today: addDays(pack.date, 1) }).length, scheduled.length);
});

test('responder os exercícios do pacote reagenda os itens que eles miram', (t) => {
  t.after(resetRegistry);
  const state = emptyState();
  const pack = clonePack();
  ingestPack(state, pack, { at: `${pack.date}T06:00:00` });
  const exercise = packToExercise(pack);
  const alvo = exercise.items.find((i) => i.targets?.length && i.type === 'mc');
  const answers = Object.fromEntries(exercise.items.map((i) =>
    [i.id, i.type === 'open' ? '我每周踢两次足球。' : i.answer]));
  gradeExercise(state, exercise, answers, { at: `${pack.date}T20:00:00` });

  for (const target of alvo.targets) {
    const item = getItem(state, target);
    assert.ok(item, `${target} deveria estar agendado`);
    assert.equal(item.lastResult, 'acerto');
    assert.ok(item.due > pack.date, 'acertar empurra o item para o futuro');
  }
});

test('pacote vazio é rejeitado com erros nomeados', () => {
  const check = validatePack({});
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((e) => e.startsWith('version')));
  assert.ok(check.errors.some((e) => e.startsWith('vocab')));
});

test('campo de proficiência no conteúdo gerado é recusado', () => {
  const pack = clonePack();
  pack.skills = [{ skill: 'vocabulary', score: 90 }];
  const check = validatePack(pack);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((e) => /proficiência não é permitido/.test(e)));
});

test('vocabulário sem pinyin ou sem tradução é recusado', () => {
  const noPy = clonePack();
  noPy.vocab[0].py = '';
  assert.ok(validatePack(noPy).errors.some((e) => e.includes('vocab[0].py')));
  const noPt = clonePack();
  noPt.vocab[1].pt = '   ';
  assert.ok(validatePack(noPt).errors.some((e) => e.includes('vocab[1].pt')));
});

test('campo chinês sem caracteres chineses é recusado', () => {
  const pack = clonePack();
  pack.vocab[0].hz = 'zuqiu';
  assert.ok(validatePack(pack).errors.some((e) => /vocab\[0\]\.hz.*chineses/.test(e)));
});

test('exercício de produção oral continua recusado (não há avaliação de pronúncia)', () => {
  const pack = clonePack();
  pack.exercises[0].skill = 'speaking';
  const check = validatePack(pack);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((e) => /produção oral não é avaliada/.test(e)));
});

test('escuta só é aceita com o texto que o app vai falar', () => {
  const semAudio = clonePack();
  semAudio.exercises[0] = {
    type: 'mc', skill: 'listening', difficulty: 1, tags: ['futebol'], targets: ['比赛'],
    prompt: 'Ouça e escolha:', options: ['a', 'b', 'c', 'd'], answer: 0,
  };
  assert.ok(validatePack(semAudio).errors.some((e) => /audio\.text/.test(e)));

  const comAudio = clonePack();
  comAudio.exercises[0] = {
    ...semAudio.exercises[0],
    audio: { text: '这场比赛我们赢了', pinyin: 'Zhè chǎng bǐsài wǒmen yíng le', pt: 'Ganhamos este jogo' },
  };
  assert.equal(validatePack(comAudio).ok, true);
});

test('ditado é aceito e corrigido por critérios, aceitando pinyin', () => {
  const pack = clonePack();
  pack.exercises[0] = {
    type: 'dictation', skill: 'listening', difficulty: 1, tags: ['futebol'], targets: ['比赛'],
    audio: { text: '比赛', pinyin: 'bǐsài' },
    prompt: 'Ouça e escreva:',
    rubric: { minLength: 1, criteria: [{ id: 'id', label: 'Escreveu 比赛 ou bǐsài', any: ['比赛', 'bisai'] }] },
  };
  assert.equal(validatePack(pack).ok, true);
});

test('múltipla escolha com resposta fora da faixa ou alternativa repetida é recusada', () => {
  const mc = clonePack().exercises.find((e) => e.type !== 'production');
  const badAnswer = clonePack();
  const i = badAnswer.exercises.findIndex((e) => e.type !== 'production');
  badAnswer.exercises[i].answer = 9;
  assert.ok(validatePack(badAnswer).errors.some((e) => /answer.*faixa/.test(e)));

  const dup = clonePack();
  dup.exercises[i].options = [mc.options[0], mc.options[0], 'x', 'y'];
  assert.ok(validatePack(dup).errors.some((e) => /repetidas/.test(e)));
});

test('exercício de produção sem critérios de correção é recusado', () => {
  const pack = clonePack();
  const i = pack.exercises.findIndex((e) => e.type === 'production');
  delete pack.exercises[i].rubric;
  assert.ok(validatePack(pack).errors.some((e) => /precisa de critérios/.test(e)));
});

test('extração de JSON tolera cercas de código, texto em volta e chaves dentro de strings', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```').value, { a: 1 });
  assert.deepEqual(extractJson('Claro! {"a":{"b":"}"}} pronto').value, { a: { b: '}' } });
  assert.equal(extractJson('{"a":').ok, false);
  assert.equal(extractJson('sem json aqui').ok, false);
  assert.match(extractJson('{"a":').error, /truncado|inválido/);
});

// ───────────────────────────── briefing ─────────────────────────────

test('o briefing leva erros recentes, temas fracos e lacunas de conversa', () => {
  const state = buildDemoState();
  const b = buildBriefing(state, { date: '2026-10-14' });
  assert.equal(b.date, '2026-10-14');
  assert.ok(b.missedItems.length > 0);
  assert.ok(b.weakTags.some((t) => t.tag === 'futebol'));
  assert.ok(b.conversationGaps.some((g) => /frequência/i.test(g.couldNotSay)));
  // O dicionário do app não é o que o aluno sabe: vai como sugestão, não como sabido.
  assert.ok(b.candidateWords.length > 0);
  assert.ok(Array.isArray(b.seenWords));
});

test('o briefing não envia o nome do usuário', () => {
  const state = buildDemoState();
  state.profile.name = 'Lucas Barcelos';
  const serialized = JSON.stringify(buildBriefing(state));
  assert.ok(!serialized.includes('Lucas'), 'nome não deve sair da máquina');
});

test('--no-gaps remove o texto das conversas do briefing', () => {
  const state = buildDemoState();
  const b = buildBriefing(state, { includeGaps: false });
  assert.deepEqual(b.conversationGaps, []);
});

test('o briefing evita repetir o que já foi ensinado em pacotes recentes', () => {
  const state = buildDemoState();
  const b = buildBriefing(state, { recentPacks: [clonePack()] });
  assert.ok(b.alreadyTaught.includes(REAL_PACK.vocab[0].hz));
});

// ───────────────────────── léxico em execução ─────────────────────────

test('vocabulário registrado melhora a segmentação e o pinyin', (t) => {
  t.after(resetRegistry);
  assert.equal(lookup('休息'), null, 'palavra não deveria estar na base inicial');
  registerEntries([{ hz: '休息', py: 'xiūxi', pt: 'descansar', level: 2, tags: ['cotidiano'] }], { source: 'teste' });
  assert.equal(lookup('休息').py, 'xiūxi');
  assert.deepEqual(segment('我想休息').map((x) => x.hz), ['我', '想', '休息']);
  assert.ok(pinyinFor('休息').pinyin.includes('xiūxi'));
});

test('registro não sobrescreve a base escrita à mão nem aceita entradas incompletas', (t) => {
  t.after(resetRegistry);
  const added = registerEntries([
    { hz: '足球', py: 'ERRADO', pt: 'ERRADO', level: 1, tags: ['x'] },
    { hz: '新词', py: '', pt: 'sem pinyin', level: 1, tags: ['x'] },
    { hz: '', py: 'a', pt: 'b', level: 1, tags: ['x'] },
  ], { source: 'teste' });
  assert.equal(added.length, 0);
  assert.equal(lookup('足球').py, 'zúqiú');
});

test('entrada mais longa amplia a janela da segmentação', (t) => {
  t.after(resetRegistry);
  const before = maxEntryLen();
  registerEntries([{ hz: '一个星期踢两次', py: 'yí gè xīngqī tī liǎng cì', pt: 'duas vezes por semana', level: 2, tags: ['tempo'] }], { source: 'teste' });
  assert.ok(maxEntryLen() > before);
  assert.deepEqual(segment('我一个星期踢两次').map((x) => x.hz), ['我', '一个星期踢两次']);
});

// ───────────────────────────── ingestão ─────────────────────────────

test('ingerir um pacote acrescenta léxico e cartões pendentes', (t) => {
  t.after(resetRegistry);
  const state = emptyState();
  const result = ingestPack(state, clonePack());
  assert.equal(result.ingested, true);
  assert.ok(result.vocabAdded.length > 0);
  assert.equal(state.lexiconExtra.length, result.vocabAdded.length);
  assert.ok(result.draftsAdded.length >= REAL_PACK.vocab.length);
  assert.ok(state.cardDrafts.every((d) => d.status === 'pending'));
  assert.ok(state.cardDrafts.every((d) => d.needsReview && /gerad/i.test(d.reviewNotes.join(' '))));
  assert.ok(state.cardDrafts.every((d) => d.tags.includes('gerado')));
});

test('ingerir conteúdo NÃO cria proficiência, XP nem conquista', (t) => {
  t.after(resetRegistry);
  const state = emptyState();
  ingestPack(state, clonePack());
  assert.equal(state.skillEvidence.length, 0);
  assert.equal(state.xpEvents.length, 0);
  assert.equal(state.achievements.length, 0);
  assert.ok(estimateAllSkills(state).every((s) => s.score === null));
});

test('o mesmo pacote não é ingerido duas vezes', (t) => {
  t.after(resetRegistry);
  const state = emptyState();
  ingestPack(state, clonePack());
  const cards = state.cardDrafts.length;
  const again = ingestPack(state, clonePack());
  assert.equal(again.ingested, false);
  assert.match(again.reason, /já foi ingerido/);
  assert.equal(state.cardDrafts.length, cards);
  assert.equal(isIngested(state, REAL_PACK.date), true);
});

test('só os pacotes mais recentes ficam guardados no estado', (t) => {
  t.after(resetRegistry);
  const state = emptyState();
  for (let i = 0; i < MAX_STORED_PACKS + 5; i += 1) {
    const pack = clonePack();
    pack.date = `2026-01-${String((i % 28) + 1).padStart(2, '0')}`;
    pack.vocab = pack.vocab.slice(0, 1);
    state.packs = (state.packs || []).filter((p) => p.date !== pack.date);
    ingestPack(state, pack);
  }
  assert.ok(state.packs.length <= MAX_STORED_PACKS);
});

// ──────────────────── pacote → exercício do app ────────────────────

test('exercícios do pacote viram itens corrigíveis pelo app', () => {
  const pack = clonePack();
  const exercise = packToExercise(pack);
  assert.equal(exercise.kind, 'pack');
  assert.equal(exercise.items.length, pack.exercises.length + pack.dialogue.questions.length);
  const production = exercise.items.find((i) => i.type === 'open');
  assert.ok(production.rubric.criteria.length > 0);
  assert.ok(exercise.items.every((i) => i.skill && i.difficulty >= 1 && i.ref));
  assert.ok(exercise.items.every((i) => i.generated === true));
  assert.match(exercise.note, /confiança baixa/);
});

test('responder o pacote gera evidência e XP uma única vez', (t) => {
  t.after(resetRegistry);
  const state = emptyState();
  ingestPack(state, clonePack());
  const exercise = packToExercise(latestPack(state).pack);
  const answers = Object.fromEntries(exercise.items.map((i) =>
    [i.id, i.type === 'open' ? '我一个星期踢两次足球。' : i.answer]));

  const first = gradeExercise(state, exercise, answers);
  assert.equal(first.result.total, exercise.items.length);
  assert.equal(state.skillEvidence.length, exercise.items.length);
  assert.equal(first.xp.granted, true);

  const second = gradeExercise(state, exercise, answers);
  assert.equal(second.xp.granted, false);
});

test('o diálogo do pacote alimenta o minerador de cartões', () => {
  const text = dialogueText(clonePack());
  assert.match(text, /^A: /);
  assert.equal(text.split('\n').length, REAL_PACK.dialogue.lines.length);
});

// ─────────────────────── gerador (linha de comando) ───────────────────────

test('o gerador grava um pacote válido e respeita o pacote já existente', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mq-gen-'));
  const out = path.join(dir, 'packs');
  const statePath = path.join(dir, 'state.json');
  await fs.writeFile(statePath, JSON.stringify(buildDemoState()));

  const run = (extra = []) => execFileAsync(process.execPath,
    [path.join(ROOT, 'tools/generate.js'), '--backend=mock', '--date=2026-03-01',
      `--state=${statePath}`, `--out=${out}`, ...extra], { cwd: ROOT });

  const first = await run();
  assert.match(first.stdout, /pacote salvo/);
  const saved = JSON.parse(await fs.readFile(path.join(out, '2026-03-01.json'), 'utf8'));
  assert.equal(validatePack(saved).ok, true);
  assert.equal(saved.provenance.backend, 'mock');
  assert.equal(saved.provenance.schemaVersion, PACK_SCHEMA_VERSION);
  assert.ok(saved.provenance.briefingDigest.length >= 8);

  const second = await run();
  assert.match(second.stdout, /já existe/);

  const forced = await run(['--force']);
  assert.match(forced.stdout, /pacote salvo/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('o gerador salva uma cópia auditável do que enviaria e o dry-run não chama modelo', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mq-dry-'));
  const statePath = path.join(dir, 'state.json');
  await fs.writeFile(statePath, JSON.stringify(buildDemoState()));
  const { stdout } = await execFileAsync(process.execPath,
    [path.join(ROOT, 'tools/generate.js'), '--dry-run', '--date=2026-03-02',
      `--state=${statePath}`, `--out=${path.join(dir, 'packs')}`], { cwd: ROOT });
  assert.match(stdout, /nada foi enviado a nenhum modelo/);
  assert.match(stdout, /PROMPT DE SISTEMA/);
  const outbox = path.join(ROOT, 'data', 'outbox', '2026-03-02-briefing.json');
  const briefing = JSON.parse(await fs.readFile(outbox, 'utf8'));
  assert.equal(briefing.date, '2026-03-02');
  await fs.rm(outbox, { force: true });
  await fs.rm(dir, { recursive: true, force: true });
});

test('backend inválido falha com mensagem clara', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [path.join(ROOT, 'tools/generate.js'), '--backend=gpt'], { cwd: ROOT }),
    (err) => /backend inválido/.test(err.stderr),
  );
});
