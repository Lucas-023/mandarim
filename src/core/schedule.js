/**
 * Agendamento de revisão (repetição espaçada) dos itens já apresentados.
 *
 * Para que serve: o briefing do gerador precisa saber não só o que você errou
 * ontem, mas o que você acertou há três semanas e está na hora de rever. Sem
 * isso, "nunca esquecer" depende de sorte.
 *
 * Algoritmo (SM-2 simplificado, propositalmente explicável):
 *   - ao ser apresentado, o item fica devido no dia seguinte (intervalo 1);
 *   - acerto:  os dois primeiros acertos usam passos fixos de 1 e 3 dias;
 *              a partir daí  intervalo = arredonda(intervalo anterior × facilidade);
 *   - erro:    intervalo volta a 1 dia, facilidade cai 0,20 e conta uma recaída;
 *   - facilidade começa em 2,5 e vive entre 1,3 e 3,0 (+0,05 por acerto).
 *   - 4 recaídas marcam o item como problemático ("leech"): ele precisa de
 *     cartão melhor ou de contexto novo, não de mais repetição.
 *
 * Isto NÃO é proficiência. A pontuação por habilidade continua vindo de
 * skills.js. Aqui só se decide quando um item volta a aparecer.
 */

export const EASE_START = 2.5;
export const EASE_MIN = 1.3;
export const EASE_MAX = 3.0;
export const LEARNING_STEPS = [1, 3];
export const LEECH_LAPSES = 4;
/** A partir deste intervalo, consideramos o item consolidado. */
export const MATURE_DAYS = 21;

import { dayKey, addDays } from './xp.js';

/** Itens de gramática são identificados com prefixo, para não colidir com hanzi. */
export function grammarRef(pointId) {
  return `gram:${pointId}`;
}

export function isGrammarRef(ref) {
  return String(ref).startsWith('gram:');
}

export function grammarIdFromRef(ref) {
  return isGrammarRef(ref) ? String(ref).slice(5) : null;
}

function ensureSchedule(state) {
  if (!state.schedule || typeof state.schedule !== 'object') state.schedule = { items: {} };
  if (!state.schedule.items) state.schedule.items = {};
  return state.schedule;
}

export function getItem(state, ref) {
  return ensureSchedule(state).items[ref] || null;
}

export function allItems(state) {
  return Object.values(ensureSchedule(state).items);
}

/**
 * Apresenta itens ao agendador. Já apresentados são ignorados (não reiniciam).
 * @param {object[]} items  [{ref, type, label, tags, source}]
 * @returns {object[]} os que entraram agora
 */
export function introduceItems(state, items, { at = new Date().toISOString(), intervalDays = LEARNING_STEPS[0], reps = 0 } = {}) {
  const schedule = ensureSchedule(state);
  const day = dayKey(at);
  const added = [];
  for (const raw of items || []) {
    const ref = String(raw?.ref || '').trim();
    if (!ref || schedule.items[ref]) continue;
    const item = {
      ref,
      type: raw.type || (isGrammarRef(ref) ? 'grammar' : 'word'),
      label: raw.label || ref,
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      source: raw.source || null,
      introducedAt: at,
      reps,
      lapses: 0,
      ease: EASE_START,
      intervalDays,
      due: addDays(day, intervalDays),
      lastSeenAt: null,
      lastResult: null,
    };
    schedule.items[ref] = item;
    added.push(item);
  }
  return added;
}

/**
 * Registra o resultado de uma revisão e reagenda o item.
 * Itens nunca apresentados são criados aqui mesmo (por exemplo, quando um
 * exercício cobra uma palavra da base escrita à mão).
 */
export function reviewOutcome(state, ref, correct, { at = new Date().toISOString(), label = null, tags = null } = {}) {
  const schedule = ensureSchedule(state);
  const day = dayKey(at);
  let item = schedule.items[ref];
  if (!item) {
    [item] = introduceItems(state, [{ ref, label: label || ref, tags: tags || [] }], { at });
    if (!item) return null;
  }

  if (correct) {
    item.reps += 1;
    item.ease = Math.min(EASE_MAX, item.ease + 0.05);
    if (item.reps <= LEARNING_STEPS.length) {
      item.intervalDays = LEARNING_STEPS[item.reps - 1];
    } else {
      item.intervalDays = Math.max(1, Math.round(item.intervalDays * item.ease));
    }
  } else {
    item.lapses += 1;
    item.reps = 0;
    item.ease = Math.max(EASE_MIN, item.ease - 0.2);
    item.intervalDays = LEARNING_STEPS[0];
  }

  item.lastSeenAt = at;
  item.lastResult = correct ? 'acerto' : 'erro';
  item.due = addDays(day, item.intervalDays);
  item.leech = item.lapses >= LEECH_LAPSES;
  return item;
}

/** Itens devidos hoje ou atrasados, do mais atrasado para o menos. */
export function dueItems(state, { today = dayKey(), limit = 50, type = null } = {}) {
  return allItems(state)
    .filter((i) => i.due <= today && (!type || i.type === type))
    .map((i) => ({ ...i, overdueDays: daysBetween(i.due, today) }))
    .sort((a, b) => b.overdueDays - a.overdueDays || b.lapses - a.lapses)
    .slice(0, limit);
}

/** Itens que vão vencer nos próximos dias — úteis para antecipar revisão. */
export function upcomingItems(state, { today = dayKey(), days = 3, limit = 30 } = {}) {
  const horizon = addDays(today, days);
  return allItems(state)
    .filter((i) => i.due > today && i.due <= horizon)
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, limit);
}

export function leeches(state, { limit = 10 } = {}) {
  return allItems(state)
    .filter((i) => i.lapses >= LEECH_LAPSES)
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, limit);
}

export function daysBetween(fromDay, toDay) {
  const [y1, m1, d1] = fromDay.split('-').map(Number);
  const [y2, m2, d2] = toDay.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function scheduleStats(state, { today = dayKey() } = {}) {
  const items = allItems(state);
  const due = items.filter((i) => i.due <= today);
  return {
    total: items.length,
    words: items.filter((i) => i.type === 'word').length,
    grammar: items.filter((i) => i.type === 'grammar').length,
    dueToday: due.length,
    overdue: due.filter((i) => i.due < today).length,
    learning: items.filter((i) => i.intervalDays < MATURE_DAYS && !i.leech).length,
    mature: items.filter((i) => i.intervalDays >= MATURE_DAYS).length,
    leeches: items.filter((i) => i.leech).length,
    nextDue: items.length ? items.map((i) => i.due).sort()[0] : null,
  };
}

/**
 * Marca estruturas como já dominadas, para pular a fila do currículo.
 * Elas entram com intervalo de 7 dias (e não 1): você já sabe, mas ainda assim
 * precisa reencontrá-las — a diferença é que não ocupam o lugar da estrutura
 * nova do dia.
 */
export function markGrammarKnown(state, pointIds, { at = new Date().toISOString(), labelFor = (id) => id } = {}) {
  return introduceItems(
    state,
    (pointIds || []).map((id) => ({
      ref: grammarRef(id),
      type: 'grammar',
      label: labelFor(id),
      tags: ['gramatica'],
      source: 'marcado como já dominado',
    })),
    { at, intervalDays: 7, reps: 2 },
  );
}

/** Pontos de gramática já apresentados, na ordem em que entraram. */
export function seenGrammarIds(state) {
  return allItems(state)
    .filter((i) => i.type === 'grammar')
    .sort((a, b) => String(a.introducedAt).localeCompare(String(b.introducedAt)))
    .map((i) => grammarIdFromRef(i.ref))
    .filter(Boolean);
}

/** Explica em português por que um item está (ou não) devido hoje. */
export function explainItem(item, { today = dayKey() } = {}) {
  if (!item) return 'Item nunca apresentado.';
  const when = item.due <= today
    ? `devido${item.due < today ? ` há ${daysBetween(item.due, today)} dia(s)` : ' hoje'}`
    : `volta em ${daysBetween(today, item.due)} dia(s) (${item.due})`;
  return (
    `${item.reps} acerto(s) seguido(s), ${item.lapses} recaída(s), ` +
    `intervalo atual ${item.intervalDays} dia(s), facilidade ${item.ease.toFixed(2)} — ${when}.` +
    (item.leech ? ' Marcado como problemático: precisa de cartão melhor ou contexto novo.' : '')
  );
}
