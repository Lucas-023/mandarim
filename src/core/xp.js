/**
 * XP, metas diárias, sequência de dias e marcos.
 *
 * Regra central do projeto: XP mede atividade e consistência. Nunca mede
 * proficiência (ver skills.js).
 */
import { uid } from './storage.js';

/** Valores sugeridos pela especificação; ajustáveis em settings.xpRules. */
export const DEFAULT_XP_RULES = {
  review_session: 10,
  dialog_study: 15,
  listening_exercise: 20,
  five_expressions: 15,
  real_conversation: 30,
  weekly_assessment: 40,
  placement_complete: 50,
  exercise_set: 10,
  cards_exported: 10,
  speaking_practice: 15,
  roleplay: 20,
  daily_goal_bonus: 25,
};

export const XP_LABELS = {
  review_session: 'Sessão de revisão concluída',
  dialog_study: 'Estudo de diálogo',
  listening_exercise: 'Exercício de escuta',
  five_expressions: 'Cinco expressões registradas',
  real_conversation: 'Conversa real de 10+ minutos',
  weekly_assessment: 'Avaliação semanal concluída',
  placement_complete: 'Nivelamento concluído',
  exercise_set: 'Conjunto de exercícios concluído',
  cards_exported: 'Cartões exportados',
  speaking_practice: 'Prática de fala (8+ frases em voz alta)',
  roleplay: 'Conversa simulada concluída',
  daily_goal_bonus: 'Bônus de meta diária',
};

export function xpRules(state) {
  return { ...DEFAULT_XP_RULES, ...(state?.settings?.xpRules || {}) };
}

/** Data local no formato YYYY-MM-DD. */
export function dayKey(dateish = new Date()) {
  const d = dateish instanceof Date ? dateish : new Date(dateish);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(dayStr, delta) {
  const [y, m, d] = dayStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return dayKey(dt);
}

/**
 * Concede XP de forma idempotente.
 *
 * `key` identifica a ação de maneira única (ex.: `placement:<attemptId>`,
 * `daily_goal:2026-10-13`). Se já existir um evento com a mesma key, nada é
 * concedido — isso impede XP duplicado por recarregar a página ou reenviar
 * um formulário.
 *
 * Retorna { granted, event, reason }.
 */
export function awardXp(state, { type, key, amount, meta = {}, at = new Date().toISOString() }) {
  const rules = xpRules(state);
  const value = amount != null ? amount : rules[type];
  if (value == null) {
    return { granted: false, event: null, reason: `tipo de XP desconhecido: ${type}` };
  }
  const eventKey = key || `${type}:${at}`;
  if (state.xpEvents.some((e) => e.key === eventKey)) {
    return { granted: false, event: null, reason: 'evento já registrado (duplicata evitada)' };
  }
  const event = { id: uid('xp'), key: eventKey, type, amount: value, at, meta };
  state.xpEvents.push(event);
  return { granted: true, event, reason: null };
}

export function totalXp(state) {
  return state.xpEvents.reduce((sum, e) => sum + e.amount, 0);
}

export function xpOnDay(state, day = dayKey()) {
  return state.xpEvents
    .filter((e) => dayKey(e.at) === day)
    .reduce((sum, e) => sum + e.amount, 0);
}

export function dailyGoal(state) {
  const goal = state.settings.dailyGoalXp || 50;
  const earned = xpOnDay(state);
  return {
    goal,
    earned,
    met: earned >= goal,
    remaining: Math.max(0, goal - earned),
    percent: goal === 0 ? 100 : Math.min(100, Math.round((earned / goal) * 100)),
  };
}

/**
 * Concede o bônus diário uma única vez por dia, e só se a meta foi atingida
 * pelo XP de atividades (o bônus não entra no próprio cálculo).
 */
export function maybeAwardDailyBonus(state, at = new Date().toISOString()) {
  const day = dayKey(at);
  const activityXp = state.xpEvents
    .filter((e) => dayKey(e.at) === day && e.type !== 'daily_goal_bonus')
    .reduce((s, e) => s + e.amount, 0);
  if (activityXp < (state.settings.dailyGoalXp || 50)) {
    return { granted: false, event: null, reason: 'meta diária ainda não atingida' };
  }
  return awardXp(state, { type: 'daily_goal_bonus', key: `daily_goal:${day}`, at, meta: { day } });
}

/** Dias (YYYY-MM-DD) em que houve qualquer atividade registrada. */
export function activeDays(state) {
  const days = new Set();
  for (const e of state.xpEvents) days.add(dayKey(e.at));
  for (const s of state.sessions) days.add(dayKey(s.at));
  for (const c of state.conversations) days.add(dayKey(c.at));
  return days;
}

/**
 * Sequência de dias consecutivos de estudo até hoje.
 * Se não houve atividade hoje, a sequência que terminou ontem continua
 * contando (ainda dá tempo de estudar), mas `activeToday` indica isso.
 */
export function computeStreak(state, today = dayKey()) {
  const days = activeDays(state);
  const activeToday = days.has(today);
  let cursor = activeToday ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return { streak, activeToday, longest: longestStreak(days) };
}

export function longestStreak(days) {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Marcos de XP: cada nível custa 100 XP a mais que o anterior. */
export function xpMilestone(total) {
  let level = 1;
  let floor = 0;
  let cost = 100;
  while (total >= floor + cost) {
    floor += cost;
    level += 1;
    cost += 100;
  }
  return {
    level,
    into: total - floor,
    needed: cost,
    nextAt: floor + cost,
    percent: Math.round(((total - floor) / cost) * 100),
  };
}

export function xpByDay(state, days = 30, today = dayKey()) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = addDays(today, -i);
    out.push({ day, xp: xpOnDay(state, day) });
  }
  return out;
}
