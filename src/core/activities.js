/**
 * Registro de atividades: sessões de estudo e conversas reais.
 *
 * Atividade concede XP (consistência). NÃO altera proficiência: sem
 * evidência de desempenho, nada entra em skillEvidence.
 */
import { uid } from './storage.js';
import { awardXp } from './xp.js';

export const SESSION_TYPES = {
  review_session: 'Revisão de vocabulário',
  dialog_study: 'Estudo de diálogo',
  listening_exercise: 'Exercício de escuta (fora do app)',
  exercise_set: 'Exercícios no app',
  other: 'Outro estudo',
};

export const CONVERSATION_CONTEXTS = [
  'futebol',
  'restaurante',
  'universidade',
  'transporte',
  'trabalho',
  'conversa casual',
  'outro',
];

export function logSession(state, { type = 'other', minutes = 0, notes = '', at = new Date().toISOString() } = {}) {
  const session = { id: uid('ses'), type, minutes: Number(minutes) || 0, notes, at };
  state.sessions.push(session);
  const xp = awardXp(state, { type: type in SESSION_TYPES && type !== 'other' ? type : 'review_session', key: `session:${session.id}`, at, meta: { sessionId: session.id, minutes: session.minutes } });
  return { session, xp };
}

/**
 * Registra uma conversa real.
 * Regras de XP: conversa de 10+ minutos concede `real_conversation`;
 * cinco ou mais expressões novas concedem `five_expressions`.
 */
export function logConversation(state, {
  minutes = 0,
  context = 'conversa casual',
  perceivedDifficulty = 3,
  newExpressions = [],
  understood = '',
  couldNotSay = '',
  notes = '',
  at = new Date().toISOString(),
} = {}) {
  const log = {
    id: uid('conv'),
    at,
    minutes: Number(minutes) || 0,
    context,
    perceivedDifficulty: Number(perceivedDifficulty) || 3,
    newExpressions: newExpressions.filter((e) => String(e).trim()),
    understood,
    couldNotSay,
    notes,
  };
  state.conversations.push(log);

  const awards = [];
  if (log.minutes >= 10) {
    awards.push(awardXp(state, { type: 'real_conversation', key: `conv:${log.id}`, at, meta: { context, minutes: log.minutes } }));
  }
  if (log.newExpressions.length >= 5) {
    awards.push(awardXp(state, { type: 'five_expressions', key: `conv_expr:${log.id}`, at, meta: { count: log.newExpressions.length } }));
  }
  return { log, awards };
}

export function minutesStudied(state, sinceDays = 7, now = Date.now()) {
  const cutoff = now - sinceDays * 86400000;
  const fromSessions = state.sessions
    .filter((s) => new Date(s.at).getTime() >= cutoff)
    .reduce((sum, s) => sum + s.minutes, 0);
  const fromConversations = state.conversations
    .filter((c) => new Date(c.at).getTime() >= cutoff)
    .reduce((sum, c) => sum + c.minutes, 0);
  return { total: fromSessions + fromConversations, sessions: fromSessions, conversations: fromConversations };
}
