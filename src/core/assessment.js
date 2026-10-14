/**
 * Reavaliação periódica (§5.6 da especificação).
 *
 * Regra que dá sentido à comparação: a reavaliação NÃO repete os itens da
 * anterior. Acertar de novo a mesma questão mede familiaridade com a questão,
 * não proficiência. Então cada avaliação guarda os itens que usou, e a seguinte
 * sorteia outros de dificuldade equivalente entre o que você já estudou.
 *
 * Também não mede o que não foi ensinado: só entram itens que passaram pelo
 * agendador (ou seja, que o app realmente apresentou a você).
 */
import { uid } from './storage.js';
import { allItems } from './schedule.js';
import { lookup, allEntries } from './content/lexicon.js';
import { QUESTIONS } from './content/questions.js';
import { grammarIdFromRef, isGrammarRef } from './schedule.js';
import { grammarPoint } from './content/grammar.js';
import { makeRng } from './exercises.js';
import { dayKey, addDays } from './xp.js';
import { estimateAllSkills } from './skills.js';

export const ASSESSMENT_INTERVAL_DAYS = 7;
export const MIN_ITEMS = 6;

function assessments(state) {
  if (!Array.isArray(state.assessments)) state.assessments = [];
  return state.assessments;
}

export function lastAssessment(state) {
  const lista = assessments(state);
  return lista.length ? lista[lista.length - 1] : null;
}

/** Quando cabe uma nova reavaliação. */
export function assessmentStatus(state, { today = dayKey() } = {}) {
  const ultima = lastAssessment(state);
  const base = ultima?.at
    || state.placementAttempts?.[state.placementAttempts.length - 1]?.finishedAt
    || null;
  if (!base) {
    return { due: false, reason: 'Faça o nivelamento inicial antes da primeira reavaliação.', nextAt: null };
  }
  const nextAt = addDays(dayKey(base), ASSESSMENT_INTERVAL_DAYS);
  const disponivel = estoqueDeItens(state).length >= MIN_ITEMS;
  if (!disponivel) {
    return {
      due: false,
      nextAt,
      reason: 'Ainda há poucos itens estudados para montar uma reavaliação com itens novos.',
    };
  }
  return {
    due: today >= nextAt,
    nextAt,
    reason: today >= nextAt
      ? `Última medição em ${dayKey(base)}: já dá para comparar.`
      : `Próxima reavaliação a partir de ${nextAt}.`,
  };
}

/** Itens que o app já apresentou e que podem ser cobrados. */
function estoqueDeItens(state) {
  return allItems(state).filter((i) => (isGrammarRef(i.ref) ? grammarPoint(grammarIdFromRef(i.ref)) : lookup(i.ref)));
}

/** Refs já usadas nas últimas avaliações — a próxima evita repeti-las. */
export function refsJaUsadas(state, { ultimas = 2 } = {}) {
  return new Set(assessments(state).slice(-ultimas).flatMap((a) => a.refs || []));
}

/**
 * Monta a reavaliação: vocabulário (recuperação ativa), leitura/gramática do
 * banco, produção escrita e, se o ambiente tiver voz, escuta.
 */
export function buildWeeklyAssessment(state, { count = 10, withAudio = false, seed = Date.now(), today = dayKey() } = {}) {
  const rng = makeRng(seed);
  const usadas = refsJaUsadas(state);
  const pool = allEntries().filter((e) => e.py && e.pt && !e.tags.includes('gramatica'));

  const palavras = estoqueDeItens(state)
    .filter((i) => !isGrammarRef(i.ref) && !usadas.has(i.ref))
    .map((i) => ({ item: i, entry: lookup(i.ref) }))
    .filter(({ entry }) => entry);
  const gramaticas = estoqueDeItens(state)
    .filter((i) => isGrammarRef(i.ref) && !usadas.has(i.ref));

  const sorteadas = embaralhar(palavras, rng);
  const items = [];

  const metaVocab = Math.max(3, Math.round(count * 0.5));
  for (const { entry } of sorteadas.slice(0, metaVocab)) {
    const distratores = embaralhar(pool.filter((e) => e.hz !== entry.hz && e.pt !== entry.pt), rng).slice(0, 3);
    const opcoes = embaralhar([entry, ...distratores], rng);
    items.push({
      id: uid('item'),
      type: 'mc',
      skill: 'vocabulary',
      difficulty: entry.level,
      prompt: `Como se diz "${entry.pt}" em mandarim?`,
      promptHz: '',
      pinyin: entry.py,
      options: opcoes.map((e) => e.hz),
      answer: opcoes.indexOf(entry),
      tags: entry.tags,
      ref: entry.hz,
      targets: [entry.hz],
    });
  }

  if (withAudio) {
    for (const { entry } of sorteadas.slice(metaVocab, metaVocab + 2)) {
      const distratores = embaralhar(pool.filter((e) => e.pt !== entry.pt), rng).slice(0, 3);
      const opcoes = embaralhar([entry, ...distratores], rng);
      items.push({
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
      });
    }
  }

  // Leitura e gramática: itens do banco ainda não usados nas últimas avaliações.
  const doBanco = embaralhar(QUESTIONS.filter((q) => q.stage === 'C' && !usadas.has(q.id)), rng).slice(0, 2);
  for (const q of doBanco) {
    items.push({
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
      targets: [],
    });
  }

  // Produção escrita usando uma estrutura já apresentada.
  const gram = embaralhar(gramaticas, rng)[0];
  if (gram) {
    const ponto = grammarPoint(grammarIdFromRef(gram.ref));
    items.push({
      id: uid('item'),
      type: 'open',
      skill: 'writing',
      difficulty: ponto.level,
      prompt: `Escreva uma frase usando a estrutura "${ponto.name}" (${ponto.pattern}).`,
      rubric: {
        minLength: 6,
        criteria: [
          { id: 'estrutura', label: `Usou o padrão ${ponto.pattern}`, any: marcadoresDe(ponto) },
          { id: 'frase', label: 'Formou uma frase, não uma palavra isolada', any: [' '] },
        ],
      },
      tags: ['gramatica', ...(ponto.tags || [])],
      ref: gram.ref,
      targets: [gram.ref],
    });
  }

  return {
    id: uid('aval'),
    kind: 'assessment',
    title: `Reavaliação de ${today}`,
    createdAt: new Date().toISOString(),
    items: items.slice(0, Math.max(count, MIN_ITEMS)),
    note:
      'Itens diferentes dos usados nas reavaliações anteriores, escolhidos entre o que você já estudou. ' +
      'Serve para comparar com a medição passada — não é certificação.',
  };
}

/** Palavras-chave que indicam uso do padrão, para corrigir a produção escrita. */
function marcadoresDe(ponto) {
  const doPadrao = String(ponto.pattern || '').match(/[㐀-䶿一-鿿]+/g) || [];
  const daDica = String(ponto.hint || '').match(/[㐀-䶿一-鿿]+/g) || [];
  const lista = [...new Set([...doPadrao, ...daDica])].filter((t) => t.length <= 4);
  return lista.length ? lista : [ponto.id];
}

function embaralhar(arr, rng) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Guarda o resultado da reavaliação com um retrato das habilidades no momento,
 * para a comparação ao longo do tempo.
 */
export function recordAssessment(state, { exercise, graded, at = new Date().toISOString() }) {
  const registro = {
    id: exercise.id,
    at,
    total: graded.result.total,
    correct: graded.result.correct,
    accuracy: graded.result.accuracy,
    refs: exercise.items.map((i) => i.ref),
    skills: estimateAllSkills(state).map((s) => ({
      skill: s.skill,
      score: s.score,
      status: s.status,
      evidenceCount: s.evidenceCount,
      confidence: s.confidence,
    })),
    porHabilidade: resumoPorHabilidade(graded.graded),
  };
  assessments(state).push(registro);
  return registro;
}

function resumoPorHabilidade(itens) {
  const mapa = new Map();
  for (const item of itens) {
    const atual = mapa.get(item.skill) || { skill: item.skill, total: 0, correct: 0 };
    atual.total += 1;
    if (item.correct) atual.correct += 1;
    mapa.set(item.skill, atual);
  }
  return [...mapa.values()];
}

/** Série temporal das habilidades: nivelamentos + reavaliações, em ordem. */
export function skillTimeline(state) {
  const doNivelamento = (state.placementAttempts || []).map((a) => ({
    at: a.finishedAt,
    tipo: 'nivelamento',
    skills: (a.result?.skills || []).map((s) => ({ skill: s.skill, score: s.score })),
  }));
  const dasAvaliacoes = assessments(state).map((a) => ({
    at: a.at,
    tipo: 'reavaliação',
    skills: a.skills.map((s) => ({ skill: s.skill, score: s.score })),
  }));
  return [...doNivelamento, ...dasAvaliacoes].sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
