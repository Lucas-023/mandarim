/**
 * Conquistas. Cada uma só é concedida quando existe registro que a comprove —
 * nenhuma conquista é desbloqueada por estimativa.
 */
import { computeStreak } from './xp.js';

export const ACHIEVEMENTS = [
  {
    id: 'first_placement',
    title: 'Primeira avaliação concluída',
    description: 'Você completou o nivelamento inicial.',
    check: (state) => state.placementAttempts.length >= 1,
  },
  {
    id: 'first_conversation',
    title: 'Primeira conversa registrada',
    description: 'Você registrou uma conversa real em mandarim.',
    check: (state) => state.conversations.length >= 1,
  },
  {
    id: 'first_cards',
    title: 'Primeiros cartões criados',
    description: 'Você aprovou cartões gerados a partir de material real.',
    check: (state) => state.cardDrafts.filter((d) => d.status === 'approved' || d.status === 'exported').length >= 1,
  },
  {
    id: 'first_export',
    title: 'Primeira exportação para o Anki',
    description: 'Você exportou cartões com sucesso.',
    check: (state) => state.cardExports.some((e) => e.status === 'ok'),
  },
  {
    id: 'streak_7',
    title: 'Sete dias de consistência',
    description: 'Sete dias consecutivos com atividade registrada.',
    check: (state) => computeStreak(state).longest >= 7,
  },
  {
    id: 'football_vocab',
    title: 'Primeiro bloco de futebol',
    description: 'Dez ou mais cartões de futebol aprovados.',
    check: (state) =>
      state.cardDrafts.filter(
        (d) => (d.tags || []).includes('futebol') && (d.status === 'approved' || d.status === 'exported'),
      ).length >= 10,
  },
  {
    id: 'dialog_no_pinyin',
    title: 'Diálogo compreendido sem pinyin',
    description: 'Você acertou um item de leitura de diálogo sem revelar o pinyin.',
    check: (state) =>
      state.skillEvidence.some(
        (e) => e.skill === 'reading' && e.score >= 1 && !e.supportUsed && e.difficulty >= 2,
      ),
  },
];

/** Desbloqueia o que já é comprovável e devolve as novas conquistas. */
export function evaluateAchievements(state, at = new Date().toISOString()) {
  const unlocked = new Set(state.achievements.map((a) => a.id));
  const fresh = [];
  for (const def of ACHIEVEMENTS) {
    if (unlocked.has(def.id)) continue;
    let ok = false;
    try {
      ok = Boolean(def.check(state));
    } catch {
      ok = false;
    }
    if (ok) {
      const entry = { id: def.id, at };
      state.achievements.push(entry);
      fresh.push({ ...def, ...entry });
    }
  }
  return fresh;
}

export function achievementStatus(state) {
  const byId = new Map(state.achievements.map((a) => [a.id, a]));
  return ACHIEVEMENTS.map((def) => ({
    ...def,
    unlocked: byId.has(def.id),
    at: byId.get(def.id)?.at || null,
  }));
}
