/**
 * Sessão de exercício persistente.
 *
 * Problema que resolve: um exercício em andamento ficava só na memória da aba.
 * Fechar o navegador, recarregar a página, derrubar o servidor ou apertar
 * Ctrl+C no meio perdia tudo que já havia sido respondido.
 *
 * Agora cada resposta é gravada no estado, e o estado vai para disco (modo
 * servidor) ou para o localStorage. Ao voltar, o app oferece retomar de onde
 * parou — mesmo item, mesmas respostas, mesmo apoio já usado.
 *
 * A sessão NÃO gera evidência de proficiência enquanto está aberta: a correção
 * só acontece quando o exercício é concluído, em gradeExercise. Abandonar uma
 * sessão pela metade não registra desempenho nenhum.
 */
import { uid } from './storage.js';

/** Idade a partir da qual uma sessão retomada deixa de fazer sentido. */
export const STALE_HOURS = 48;

export function startSession(state, exercise, { at = new Date().toISOString() } = {}) {
  state.activeSession = {
    id: uid('ses'),
    startedAt: at,
    updatedAt: at,
    exercise,
    answers: {},
    supportUsed: {},
    index: 0,
    feedback: null,
  };
  return state.activeSession;
}

export function activeSession(state) {
  return state.activeSession || null;
}

/** Grava a resposta de um item e avança o cursor da sessão. */
export function recordAnswer(state, { itemId, answer, feedback = null, at = new Date().toISOString() }) {
  const session = state.activeSession;
  if (!session) return null;
  session.answers[itemId] = answer;
  session.feedback = feedback;
  session.updatedAt = at;
  return session;
}

export function markSupportUsed(state, itemId) {
  const session = state.activeSession;
  if (!session) return null;
  session.supportUsed[itemId] = true;
  session.updatedAt = new Date().toISOString();
  return session;
}

export function advance(state, { at = new Date().toISOString() } = {}) {
  const session = state.activeSession;
  if (!session) return null;
  session.feedback = null;
  session.index = Math.min(session.index + 1, session.exercise.items.length);
  session.updatedAt = at;
  return session;
}

export function clearSession(state) {
  const session = state.activeSession;
  state.activeSession = null;
  return session;
}

export function sessionProgress(session) {
  if (!session) return null;
  const total = session.exercise.items.length;
  const answered = Object.keys(session.answers).length;
  return {
    total,
    answered,
    index: session.index,
    percent: total ? Math.round((answered / total) * 100) : 0,
    remaining: Math.max(0, total - answered),
    complete: answered >= total,
  };
}

export function isStale(session, { now = Date.now() } = {}) {
  if (!session) return false;
  return now - new Date(session.updatedAt).getTime() > STALE_HOURS * 3600 * 1000;
}

/** Descrição curta para o aviso de retomada. */
export function describeSession(session) {
  if (!session) return '';
  const p = sessionProgress(session);
  return `${session.exercise.title} — ${p.answered} de ${p.total} respondido(s)`;
}
