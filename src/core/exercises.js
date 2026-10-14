/**
 * Exercícios curtos gerados a partir do léxico e do banco de questões.
 *
 * Diferente do nivelamento, aqui o objetivo é prática. As respostas geram
 * evidência de proficiência (skillEvidence) porque são desempenho medido —
 * mas nunca por simplesmente exibir um cartão.
 */
import { uid } from './storage.js';
import { allEntries } from './content/lexicon.js';
import { QUESTIONS, QUESTIONS_BY_ID } from './content/questions.js';
import { recordEvidence } from './skills.js';
import { awardXp } from './xp.js';
import { reviewOutcome, isGrammarRef, dueItems } from './schedule.js';
import { lookup } from './content/lexicon.js';
import { normalizeText } from './placement.js';

/** PRNG determinístico (mulberry32) — permite testes reprodutíveis. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickPool({ tags = [], difficulty = null }) {
  let pool = allEntries().filter((e) => !e.tags.includes('gramatica'));
  if (tags.length) {
    const filtered = pool.filter((e) => e.tags.some((t) => tags.includes(t)));
    if (filtered.length >= 8) pool = filtered;
  }
  if (difficulty) {
    const filtered = pool.filter((e) => e.level <= difficulty);
    if (filtered.length >= 8) pool = filtered;
  }
  return pool;
}

/**
 * Quiz de vocabulário. `direction`:
 *  - 'zh_pt': mostra o chinês, escolhe o significado (reconhecimento)
 *  - 'pt_zh': mostra o português, escolhe o chinês (recuperação ativa)
 */
export function buildVocabExercise(state, { count = 6, tags = [], difficulty = null, direction = 'zh_pt', seed = Date.now() } = {}) {
  const rng = makeRng(seed);
  const pool = pickPool({ tags, difficulty });
  const chosen = shuffle(pool, rng).slice(0, Math.min(count, pool.length));
  const items = chosen.map((entry) => {
    const distractors = shuffle(
      pool.filter((e) => e.hz !== entry.hz && e.pt !== entry.pt),
      rng,
    ).slice(0, 3);
    const optionEntries = shuffle([entry, ...distractors], rng);
    const options = optionEntries.map((e) => (direction === 'zh_pt' ? e.pt : e.hz));
    return {
      id: uid('item'),
      type: 'mc',
      skill: direction === 'zh_pt' ? 'vocabulary' : 'vocabulary',
      difficulty: entry.level,
      prompt: direction === 'zh_pt' ? `O que significa ${entry.hz}?` : `Como se diz "${entry.pt}" em mandarim?`,
      promptHz: direction === 'zh_pt' ? entry.hz : '',
      pinyin: entry.py,
      options,
      answer: optionEntries.indexOf(entry),
      tags: entry.tags,
      ref: entry.hz,
    };
  });
  return {
    id: uid('ex'),
    kind: 'vocab',
    direction,
    title: direction === 'zh_pt' ? 'Reconhecimento de vocabulário' : 'Recuperação ativa de vocabulário',
    createdAt: new Date().toISOString(),
    items,
  };
}

/** Exercício de leitura/gramática reaproveitando o banco de questões. */
export function buildReadingExercise(state, { count = 4, difficulty = null, seed = Date.now() } = {}) {
  const rng = makeRng(seed);
  let pool = QUESTIONS.filter((q) => q.stage === 'C');
  if (difficulty) {
    const filtered = pool.filter((q) => q.difficulty <= difficulty);
    if (filtered.length >= count) pool = filtered;
  }
  const items = shuffle(pool, rng)
    .slice(0, Math.min(count, pool.length))
    .map((q) => ({
      id: uid('item'),
      type: 'mc',
      skill: q.skill,
      difficulty: q.difficulty,
      prompt: q.prompt,
      promptHz: q.promptHz || '',
      pinyin: q.pinyin || '',
      options: q.options,
      answer: q.answer,
      rationale: q.rationale || '',
      tags: q.tags,
      ref: q.id,
    }));
  return {
    id: uid('ex'),
    kind: 'reading',
    title: 'Leitura e construção de frases',
    createdAt: new Date().toISOString(),
    items,
    note: 'Itens reaproveitados do banco do nivelamento: familiaridade com a mesma questão não é o mesmo que progresso.',
  };
}

/**
 * Exercício de produção escrita: o usuário formula uma frase usando a palavra
 * pedida. Corrigido por critérios explícitos, com confiança baixa declarada.
 */
export function buildProductionExercise(state, { count = 2, tags = ['conversa', 'futebol'], seed = Date.now() } = {}) {
  const rng = makeRng(seed);
  const pool = pickPool({ tags }).filter((e) => e.hz.length >= 2);
  const items = shuffle(pool, rng)
    .slice(0, Math.min(count, pool.length))
    .map((entry) => ({
      id: uid('item'),
      type: 'open',
      skill: 'writing',
      difficulty: entry.level,
      prompt: `Escreva uma frase usando ${entry.hz} (${entry.py} — ${entry.pt}). Pode usar caracteres ou pinyin.`,
      rubric: {
        minLength: 5,
        criteria: [
          { id: 'palavra', label: `Usou ${entry.hz} ou ${entry.py}`, any: [entry.hz, entry.py] },
          { id: 'frase', label: 'Formou uma frase com pelo menos duas palavras', any: [' '] },
        ],
      },
      tags: entry.tags,
      ref: entry.hz,
    }));
  return {
    id: uid('ex'),
    kind: 'production',
    title: 'Produzir frases',
    createdAt: new Date().toISOString(),
    items,
    note: 'Correção automática por palavras-chave: use-a como apoio, não como nota definitiva.',
  };
}

export function gradeItem(item, answer) {
  if (item.type === 'open' || item.type === 'dictation') {
    const raw = String(answer || '').trim();
    const text = normalizeText(raw);
    const criteria = item.rubric.criteria.map((c) => ({
      id: c.id,
      label: c.label,
      met: c.any.some((n) => (/[一-鿿]/.test(n) ? raw.includes(n) : text.includes(normalizeText(n)))),
    }));
    const met = criteria.filter((c) => c.met).length;
    let score = met / criteria.length;
    if (raw.length < (item.rubric.minLength || 0)) score *= 0.5;
    return { score, correct: score >= 0.6, criteria, autoGraded: true,
      detail: `${met} de ${criteria.length} critério(s). Correção automática — confiança baixa.` };
  }
  const correct = Number(answer) === item.answer;
  return {
    score: correct ? 1 : 0,
    correct,
    detail: correct ? 'Correto.' : `Esperado: ${item.options[item.answer]}.${item.rationale ? ' ' + item.rationale : ''}`,
  };
}

/**
 * Corrige o exercício, grava evidências e concede XP uma única vez por
 * exercício (a key impede duplicação ao reenviar).
 */
export function gradeExercise(state, exercise, answers, { supportUsed = {}, at = new Date().toISOString() } = {}) {
  const graded = exercise.items.map((item) => {
    const g = gradeItem(item, answers[item.id]);
    recordEvidence(state, {
      skill: item.skill,
      score: g.score,
      difficulty: item.difficulty,
      supportUsed: Boolean(supportUsed[item.id]),
      source: 'exercise',
      channel: item.channel || 'texto',
      ref: `${exercise.id}:${item.ref}`,
      at,
    });
    // Reagenda os itens que este exercício treinou, para a revisão espaçada.
    for (const target of targetsOf(item)) {
      reviewOutcome(state, target, g.correct, { at, label: labelFor(target), tags: item.tags });
    }
    return { itemId: item.id, ref: item.ref, skill: item.skill, difficulty: item.difficulty, tags: item.tags, ...g };
  });

  const correctCount = graded.filter((g) => g.correct).length;
  const result = {
    id: uid('exres'),
    exerciseId: exercise.id,
    kind: exercise.kind,
    at,
    total: graded.length,
    correct: correctCount,
    accuracy: graded.length ? correctCount / graded.length : 0,
    items: graded,
  };
  state.exerciseResults.push(result);

  const xpType = exercise.kind === 'assessment'
    ? 'weekly_assessment'
    : ['vocab', 'review', 'listening', 'dictation'].includes(exercise.kind)
      ? 'review_session'
      : 'exercise_set';
  const xp = awardXp(state, { type: xpType, key: `exercise:${exercise.id}`, at, meta: { kind: exercise.kind, accuracy: result.accuracy } });

  return { result, graded, xp };
}

/**
 * Escuta: o app fala a palavra ou frase e você escolhe o significado. O texto
 * não é mostrado antes da resposta — senão o exercício mede leitura, não escuta.
 *
 * Prioriza o que está devido no agendador: ouvir é outro canal para o mesmo
 * item, e justamente o canal em que ele costuma falhar.
 */
export function buildListeningExercise(state, { count = 8, today = undefined, seed = Date.now() } = {}) {
  const rng = makeRng(seed);
  const pool = allEntries().filter((e) => !e.tags.includes('gramatica') && e.py && e.pt);
  const devidos = dueItems(state, { today, limit: 40, type: 'word' })
    .map((i) => lookup(i.ref))
    .filter(Boolean);
  const escolhidos = [...devidos, ...shuffle(pool, rng)]
    .filter((e, i, arr) => arr.findIndex((x) => x.hz === e.hz) === i)
    .slice(0, Math.min(count, pool.length));

  const items = escolhidos.map((entry) => {
    const distratores = shuffle(pool.filter((e) => e.hz !== entry.hz && e.pt !== entry.pt), rng).slice(0, 3);
    const opcoes = shuffle([entry, ...distratores], rng);
    return {
      id: uid('item'),
      type: 'mc',
      skill: 'listening',
      difficulty: entry.level,
      prompt: 'Ouça e escolha o significado:',
      promptHz: '',
      pinyin: entry.py,
      audio: { text: entry.hz, pinyin: entry.py, pt: entry.pt, rate: 0.9 },
      options: opcoes.map((e) => e.pt),
      answer: opcoes.indexOf(entry),
      tags: entry.tags,
      ref: entry.hz,
      targets: [entry.hz],
      channel: 'tts',
    };
  });

  return {
    id: uid('ex'),
    kind: 'listening',
    title: 'Escuta: áudio → significado',
    createdAt: new Date().toISOString(),
    items,
    note:
      'Voz sintetizada do navegador, não fala natural. Mede reconhecimento auditivo de palavras que ' +
      'você já viu escritas; não equivale a entender um falante real.',
  };
}

/**
 * Ditado: o app fala, você escreve. Aceita caracteres ou pinyin (com ou sem
 * tons), porque o objetivo é provar que você identificou o que ouviu.
 */
export function buildDictationExercise(state, { count = 6, today = undefined, seed = Date.now() } = {}) {
  const rng = makeRng(seed);
  const pool = allEntries().filter((e) => e.py && e.pt && !e.tags.includes('gramatica'));
  const devidos = dueItems(state, { today, limit: 30, type: 'word' })
    .map((i) => lookup(i.ref))
    .filter(Boolean);
  const escolhidos = [...devidos, ...shuffle(pool, rng)]
    .filter((e, i, arr) => arr.findIndex((x) => x.hz === e.hz) === i)
    .slice(0, Math.min(count, pool.length));

  const items = escolhidos.map((entry) => ({
    id: uid('item'),
    type: 'dictation',
    skill: 'listening',
    difficulty: entry.level,
    prompt: 'Ouça e escreva o que foi dito (caracteres ou pinyin):',
    promptHz: '',
    pinyin: entry.py,
    audio: { text: entry.hz, pinyin: entry.py, pt: entry.pt, rate: 0.85 },
    rubric: {
      minLength: 1,
      criteria: [
        {
          id: 'identificou',
          label: `Escreveu ${entry.hz} ou ${entry.py}`,
          any: [entry.hz, entry.py, entry.py.replace(/\s+/g, '')],
        },
      ],
    },
    tags: entry.tags,
    ref: entry.hz,
    targets: [entry.hz],
    channel: 'tts',
  }));

  return {
    id: uid('ex'),
    kind: 'dictation',
    title: 'Ditado',
    createdAt: new Date().toISOString(),
    items,
    note:
      'Voz sintetizada. Acertar o pinyin sem tons já conta: o objetivo é identificar o que foi dito. ' +
      'A correção é por palavra-chave, com confiança baixa.',
  };
}

/**
 * Quais itens um exercício treina. `targets` (declarado nos pacotes gerados) tem
 * prioridade; na falta dele, vale o `ref` quando for hanzi ou ponto de gramática.
 * Refs genéricas, como o nome de um tema, não entram no agendador.
 */
export function targetsOf(item) {
  if (Array.isArray(item.targets) && item.targets.length) {
    return item.targets.filter((t) => /[㐀-䶿一-鿿]/.test(t) || isGrammarRef(t));
  }
  const ref = String(item.ref || '');
  return /[㐀-䶿一-鿿]/.test(ref) || isGrammarRef(ref) ? [ref] : [];
}

function labelFor(ref) {
  const entry = lookup(ref);
  return entry ? `${entry.hz} — ${entry.pt}` : ref;
}

/**
 * Monta um exercício só com o que está devido hoje — o laço de "não esquecer".
 * Funciona sem pacote novo e sem modelo: usa o léxico que o app já conhece.
 */
export function buildReviewExercise(state, { count = 10, today = undefined, seed = Date.now() } = {}) {
  const rng = makeRng(seed);
  const due = dueItems(state, { today, limit: 60, type: 'word' })
    .map((i) => ({ item: i, entry: lookup(i.ref) }))
    .filter(({ entry }) => entry);

  const pool = allEntries().filter((e) => !e.tags.includes('gramatica'));
  const items = [];
  for (const { item, entry } of due.slice(0, count)) {
    // Item atrasado ou com recaídas cobra recuperação ativa (português → chinês);
    // o resto cobra reconhecimento, que é mais barato.
    const active = item.overdueDays > 0 || item.lapses > 0;
    const distractors = shuffle(pool.filter((e) => e.hz !== entry.hz && e.pt !== entry.pt), rng).slice(0, 3);
    const optionEntries = shuffle([entry, ...distractors], rng);
    items.push({
      id: uid('item'),
      type: 'mc',
      skill: 'vocabulary',
      difficulty: entry.level,
      prompt: active ? `Como se diz "${entry.pt}" em mandarim?` : `O que significa ${entry.hz}?`,
      promptHz: active ? '' : entry.hz,
      pinyin: entry.py,
      options: optionEntries.map((e) => (active ? e.hz : e.pt)),
      answer: optionEntries.indexOf(entry),
      tags: entry.tags,
      ref: entry.hz,
      targets: [entry.hz],
      review: { overdueDays: item.overdueDays, lapses: item.lapses, intervalDays: item.intervalDays },
    });
  }

  return {
    id: uid('ex'),
    kind: 'review',
    title: 'Revisão do que está devido',
    createdAt: new Date().toISOString(),
    items,
    note:
      'Itens escolhidos pelo agendador: os atrasados ou com recaídas vêm como recuperação ativa ' +
      '(português → chinês); os demais, como reconhecimento.',
  };
}

/** Tags com mais erros nos exercícios recentes (para recomendações). */
export function errorTags(state, limit = 40) {
  const tally = new Map();
  const items = state.exerciseResults.slice(-limit).flatMap((r) => r.items);
  for (const it of items) {
    for (const tag of it.tags || []) {
      const e = tally.get(tag) || { tag, items: 0, misses: 0 };
      e.items += 1;
      if (!it.correct) e.misses += 1;
      tally.set(tag, e);
    }
  }
  return [...tally.values()]
    .map((e) => ({ ...e, missRate: e.misses / e.items }))
    .filter((e) => e.items >= 2)
    .sort((a, b) => b.missRate - a.missRate);
}

export { QUESTIONS_BY_ID };
