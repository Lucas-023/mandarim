/**
 * Gerador de flashcards a partir de texto real (colado pelo usuário).
 *
 * Nada aqui toca a avaliação de proficiência: criar um cartão não é
 * evidência de que a palavra foi aprendida.
 *
 * Sem serviço de tradução externo nesta versão: a tradução sugerida para
 * frases é uma GLOSA montada a partir do léxico local, sempre marcada como
 * "revisar" para o usuário corrigir antes de salvar. O sistema não inventa
 * traduções apresentadas como corretas.
 */
import { uid } from './storage.js';
import { maxEntryLen, lookup } from './content/lexicon.js';

const HANZI = /[㐀-䶿一-鿿]/;
const SENTENCE_SPLIT = /(?<=[。！？!?；;\n])/;

export const CARD_TEMPLATES = {
  zh_pt: 'Chinês → português',
  pt_zh: 'Português/situação → chinês',
  cloze: 'Completar a frase',
  audio_pt: 'Áudio → significado (requer áudio; não gerado nesta versão)',
};

export function isHanzi(ch) {
  return HANZI.test(ch);
}

/** Segmentação por maior correspondência no léxico local. */
export function segment(text) {
  const tokens = [];
  let i = 0;
  const s = String(text || '');
  while (i < s.length) {
    const ch = s[i];
    if (!isHanzi(ch)) {
      i += 1;
      continue;
    }
    let matched = null;
    for (let len = Math.min(maxEntryLen(), s.length - i); len >= 1; len -= 1) {
      const slice = s.slice(i, i + len);
      if (lookup(slice)) {
        matched = slice;
        break;
      }
    }
    if (matched) {
      tokens.push({ hz: matched, known: true });
      i += matched.length;
    } else {
      tokens.push({ hz: ch, known: false });
      i += 1;
    }
  }
  return tokens;
}

/** Divide o texto em falas/frases, preservando o rótulo de quem falou. */
export function splitUnits(text) {
  const units = [];
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const speakerMatch = line.match(/^([A-Za-z一-鿿]{1,6})\s*[:：]\s*(.+)$/);
    const speaker = speakerMatch ? speakerMatch[1] : null;
    const body = speakerMatch ? speakerMatch[2] : line;
    for (const piece of body.split(SENTENCE_SPLIT)) {
      const sentence = piece.trim();
      if (sentence && HANZI.test(sentence)) units.push({ speaker, hz: sentence });
    }
  }
  return units;
}

/** Pinyin montado a partir do léxico; `confidence` cai se houver lacunas. */
export function pinyinFor(hz) {
  const tokens = segment(hz);
  if (tokens.length === 0) return { pinyin: '', confidence: 'nenhuma', gaps: [] };
  const gaps = tokens.filter((t) => !t.known).map((t) => t.hz);
  const parts = tokens.map((t) => (t.known ? lookup(t.hz).py : '?'));
  const confidence = gaps.length === 0 ? 'alta' : gaps.length <= 2 ? 'media' : 'baixa';
  return { pinyin: parts.join(' '), confidence, gaps };
}

/** Glosa palavra-a-palavra — rascunho para o usuário editar, nunca tradução final. */
export function glossFor(hz) {
  const tokens = segment(hz);
  const known = tokens.filter((t) => t.known);
  if (known.length === 0) return { gloss: '', confidence: 'nenhuma' };
  const gloss = known.map((t) => lookup(t.hz).pt).join(' · ');
  const coverage = known.length / tokens.length;
  return { gloss, confidence: coverage === 1 ? 'media' : 'baixa', coverage };
}

export function normalizeFront(front) {
  return String(front || '').replace(/\s+/g, '').replace(/[。！？!?，,；;]/g, '');
}

/** Cartões já conhecidos pelo sistema (rascunhos salvos e exportados). */
export function existingFronts(state) {
  const set = new Set();
  for (const d of state.cardDrafts) set.add(normalizeFront(d.front));
  for (const e of state.cardExports) {
    for (const f of e.fronts || []) set.add(normalizeFront(f));
  }
  return set;
}

/**
 * Gera sugestões de cartões a partir de um texto.
 * @returns {{drafts: object[], stats: object}} nada é salvo no estado aqui.
 */
export function generateDrafts(state, text, { source = 'texto colado', maxWords = 25, level = null } = {}) {
  const units = splitUnits(text);
  const seen = new Set();
  const existing = existingFronts(state);
  const drafts = [];
  const stats = { units: units.length, words: 0, sentences: 0, duplicates: 0, unknown: 0 };

  const push = (card) => {
    const key = normalizeFront(card.front);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const duplicate = existing.has(key);
    if (duplicate) stats.duplicates += 1;
    drafts.push({
      id: uid('card'),
      status: 'pending',
      duplicate,
      createdAt: new Date().toISOString(),
      source,
      ...card,
    });
  };

  // 1) Frases e falas completas: são o que serve para conversar de verdade.
  for (const unit of units) {
    const py = pinyinFor(unit.hz);
    const gl = glossFor(unit.hz);
    if (!py.pinyin) continue;
    stats.sentences += 1;
    push({
      front: unit.hz,
      back: gl.gloss,
      pinyin: py.pinyin,
      example: '',
      exampleTranslation: '',
      context: unit.speaker ? `Diálogo (fala de ${unit.speaker})` : 'Frase do material',
      difficulty: estimateDifficulty(unit.hz),
      tags: collectTags(unit.hz),
      template: 'zh_pt',
      kind: 'sentence',
      needsReview: true,
      reviewNotes: [
        gl.confidence === 'baixa' || gl.confidence === 'nenhuma'
          ? 'Tradução é apenas uma glosa palavra-a-palavra: revise antes de salvar.'
          : 'Tradução sugerida por glosa do léxico local: confirme o sentido no contexto.',
        ...(py.gaps.length ? [`Sem pinyin para: ${py.gaps.join(', ')}`] : []),
      ],
      confidence: { pinyin: py.confidence, translation: gl.confidence },
    });
  }

  // 2) Palavras e expressões do léxico encontradas no texto.
  const wordCount = new Map();
  for (const unit of units) {
    for (const token of segment(unit.hz)) {
      if (!token.known) {
        stats.unknown += 1;
        continue;
      }
      wordCount.set(token.hz, (wordCount.get(token.hz) || 0) + 1);
    }
  }
  const ranked = [...wordCount.entries()]
    .map(([hz, count]) => ({ entry: lookup(hz), count }))
    .filter(({ entry }) => entry && !entry.tags.includes('gramatica'))
    .sort((a, b) => priority(b, level) - priority(a, level));

  for (const { entry, count } of ranked.slice(0, maxWords)) {
    const example = units.find((u) => u.hz.includes(entry.hz));
    stats.words += 1;
    push({
      front: entry.hz,
      back: entry.pt,
      pinyin: entry.py,
      example: example ? example.hz : '',
      exampleTranslation: example ? glossFor(example.hz).gloss : '',
      context: entry.tags.join(', '),
      difficulty: entry.level,
      tags: entry.tags,
      template: 'zh_pt',
      kind: 'word',
      occurrences: count,
      needsReview: false,
      reviewNotes: example ? ['Tradução do exemplo é uma glosa: revise se for usá-la.'] : [],
      confidence: { pinyin: 'alta', translation: 'alta' },
    });
  }

  return { drafts, stats };
}

/** Prioriza expressões úteis: objetivos do usuário, frequência e nível. */
function priority({ entry, count }, level) {
  let p = count;
  if (entry.tags.includes('futebol')) p += 3;
  if (entry.tags.includes('conversa') || entry.tags.includes('expressao')) p += 2;
  if (level && entry.level === level) p += 1;
  if (entry.hz.length > 1) p += 1;
  return p;
}

function collectTags(hz) {
  const tags = new Set();
  for (const token of segment(hz)) {
    if (!token.known) continue;
    for (const t of lookup(token.hz).tags) tags.add(t);
  }
  tags.delete('gramatica');
  return [...tags];
}

export function estimateDifficulty(hz) {
  const tokens = segment(hz).filter((t) => t.known);
  if (tokens.length === 0) return 3;
  const max = Math.max(...tokens.map((t) => lookup(t.hz).level));
  const lengthBump = hz.length > 10 ? 1 : 0;
  return Math.min(3, max + lengthBump);
}

/** Salva rascunhos no estado (sem aprovar). */
export function saveDrafts(state, drafts) {
  const existing = existingFronts(state);
  const added = [];
  for (const d of drafts) {
    const key = normalizeFront(d.front);
    if (existing.has(key)) continue;
    existing.add(key);
    state.cardDrafts.push(d);
    added.push(d);
  }
  return added;
}

export function setDraftStatus(state, id, status) {
  const draft = state.cardDrafts.find((d) => d.id === id);
  if (!draft) return null;
  draft.status = status;
  draft.updatedAt = new Date().toISOString();
  return draft;
}

export function editDraft(state, id, fields) {
  const draft = state.cardDrafts.find((d) => d.id === id);
  if (!draft) return null;
  Object.assign(draft, fields, { updatedAt: new Date().toISOString(), edited: true });
  if (fields.back) draft.needsReview = false;
  return draft;
}

export function removeDraft(state, id) {
  const i = state.cardDrafts.findIndex((d) => d.id === id);
  if (i === -1) return false;
  state.cardDrafts.splice(i, 1);
  return true;
}

export function approvedCards(state) {
  return state.cardDrafts.filter((d) => d.status === 'approved');
}
