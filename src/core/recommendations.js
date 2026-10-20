/**
 * Recomendações adaptativas.
 *
 * Toda recomendação carrega `why` — a evidência concreta que a gerou (§11.3).
 * Nada é recomendado com base em dados que não existem: habilidades não
 * avaliadas não produzem exercício, produzem um aviso de limitação.
 */
import { estimateAllSkills, SKILL_BY_ID } from './skills.js';
import { errorTags } from './exercises.js';
import { dailyGoal, computeStreak, dayKey } from './xp.js';
import { difficultiesByTag } from './placement.js';
import { resumoFala } from './fala.js';

const PRIORITY = { alta: 0, media: 1, baixa: 2 };

export function buildRecommendations(state, { now = Date.now() } = {}) {
  const recs = [];
  const add = (r) => recs.push({ id: r.key, ...r });

  if (!state.profile.placementDone) {
    add({
      key: 'do_placement',
      title: 'Fazer o nivelamento inicial',
      why: 'Sem nivelamento não há estimativa de nível nem plano: o nível declarado é só um ponto de partida.',
      action: { view: 'placement' },
      priority: 'alta',
    });
    return recs.filter((r) => !state.dismissedRecommendations.includes(r.id));
  }

  const skills = estimateAllSkills(state, now);
  const assessed = skills.filter((s) => s.score != null).sort((a, b) => a.score - b.score);

  if (assessed.length) {
    const weakest = assessed[0];
    const map = {
      vocabulary: { view: 'study', params: { exercise: 'vocab', direction: 'pt_zh' } },
      reading: { view: 'study', params: { exercise: 'reading' } },
      grammar: { view: 'study', params: { exercise: 'reading' } },
      writing: { view: 'study', params: { exercise: 'production' } },
    };
    if (map[weakest.skill]) {
      add({
        key: `weak_${weakest.skill}`,
        title: `Treinar ${SKILL_BY_ID.get(weakest.skill).pt.toLowerCase()}`,
        why: `É sua habilidade mais baixa entre as avaliadas: ${weakest.score}/100 com ${weakest.evidenceCount} item(ns) registrado(s) (confiança ${weakest.confidence}).`,
        action: map[weakest.skill],
        priority: 'alta',
      });
    }
  }

  // Dificuldades recorrentes: só contam com 2+ itens e metade de erros.
  const placementTags = state.placementAttempts.length
    ? difficultiesByTag(state.placementAttempts[state.placementAttempts.length - 1].responses)
    : [];
  const combined = new Map();
  for (const source of [placementTags, errorTags(state)]) {
    for (const t of source) {
      const e = combined.get(t.tag) || { tag: t.tag, items: 0, misses: 0 };
      e.items += t.items;
      e.misses += t.misses;
      combined.set(t.tag, e);
    }
  }
  const recurring = [...combined.values()]
    .map((e) => ({ ...e, missRate: e.misses / e.items }))
    .filter((e) => e.items >= 2 && e.missRate >= 0.5)
    .sort((a, b) => b.missRate - a.missRate)
    .slice(0, 2);

  for (const t of recurring) {
    add({
      key: `tag_${t.tag}`,
      title: `Revisar o tema "${t.tag}"`,
      why: `${t.misses} erro(s) em ${t.items} item(ns) desse tema — dificuldade recorrente, não erro isolado.`,
      action: { view: 'study', params: { exercise: 'vocab', tags: [t.tag] } },
      priority: 'alta',
    });
  }

  // Lacunas apontadas pelas conversas reais.
  const recentConvs = state.conversations.slice(-5);
  const blocked = recentConvs.filter((c) => String(c.couldNotSay || '').trim());
  if (blocked.length) {
    const last = blocked[blocked.length - 1];
    add({
      key: `conv_gap_${last.id}`,
      title: 'Transformar o que você não conseguiu dizer em cartões',
      why: `Na conversa de ${new Date(last.at).toLocaleDateString('pt-BR')} (${last.context}) você anotou: "${last.couldNotSay}".`,
      action: { view: 'cards', params: { prefill: last.couldNotSay } },
      priority: 'alta',
    });
  }
  const hardFootball = recentConvs.filter((c) => c.context === 'futebol' && c.perceivedDifficulty >= 4);
  if (hardFootball.length >= 1) {
    add({
      key: 'football_focus',
      title: 'Bloco de expressões de futebol',
      why: `${hardFootball.length} conversa(s) de futebol registrada(s) com dificuldade alta percebida.`,
      action: { view: 'study', params: { exercise: 'vocab', tags: ['futebol'] } },
      priority: 'media',
    });
  }

  const pending = state.cardDrafts.filter((d) => d.status === 'pending');
  if (pending.length) {
    add({
      key: 'review_drafts',
      title: `Revisar ${pending.length} cartão(ões) sugerido(s)`,
      why: 'Cartões gerados ficam pendentes até você aprovar — nada é enviado ao Anki sem revisão.',
      action: { view: 'cards' },
      priority: 'media',
    });
  }
  const approved = state.cardDrafts.filter((d) => d.status === 'approved');
  if (approved.length) {
    add({
      key: 'export_cards',
      title: `Exportar ${approved.length} cartão(ões) aprovado(s)`,
      why: 'Opcional: só se você também usa o Anki de verdade. Aprovados já entram no baralho do app.',
      action: { view: 'cards', params: { tab: 'export' } },
      priority: 'baixa',
    });
  }

  // Falar é o objetivo principal e nenhum exercício escrito treina a boca.
  const querConversar = state.profile.goals.some((g) => ['conversar_simples', 'futebol'].includes(g.id) && g.priority <= 3);
  const fala = resumoFala(state);
  if (querConversar && fala.hoje === 0 && (state.packs || []).length) {
    add({
      key: `speak_${dayKey(new Date(now))}`,
      title: 'Falar em voz alta (10 minutos)',
      why: 'Conversar é um dos seus objetivos principais, e os exercícios escritos não treinam a fala. ' +
        `Hoje: nenhuma frase dita em voz alta${fala.travadasAgora ? `; ${fala.travadasAgora} frase(s) travada(s) esperando nova tentativa` : ''}.`,
      action: { view: 'speak' },
      priority: 'alta',
    });
  }

  const goal = dailyGoal(state);
  if (!goal.met) {
    add({
      key: 'daily_goal',
      title: 'Completar a meta de hoje',
      why: `${goal.earned} de ${goal.goal} XP hoje. Faltam ${goal.remaining} XP.`,
      action: { view: 'study' },
      priority: 'media',
    });
  }

  const streak = computeStreak(state);
  if (streak.streak >= 3 && !streak.activeToday) {
    add({
      key: 'keep_streak',
      title: `Manter a sequência de ${streak.streak} dias`,
      why: 'Você tem uma sequência ativa, mas ainda não registrou atividade hoje.',
      action: { view: 'study' },
      priority: 'alta',
    });
  }

  for (const s of skills) {
    if (s.status !== 'nao_avaliada') continue;
    if (s.skill === 'listening') {
      add({
        key: 'listening_unassessed',
        title: 'Compreensão auditiva ainda não avaliada',
        why: 'Nenhum exercício de escuta foi feito ainda: sem eles o app não estima a compreensão auditiva. A voz é sintetizada pelo navegador.',
        action: { view: 'study', params: { exercise: 'listening' } },
        priority: 'media',
      });
    }
    if (s.skill === 'speaking') {
      add({
        key: 'speaking_unassessed',
        title: 'Produção oral ainda não avaliada',
        why: 'O app não avalia pronúncia com confiança, então não dá nota de fala. Pratique na tela Falar (autoavaliação) e registre conversas reais.',
        action: { view: 'speak' },
        priority: 'baixa',
      });
    }
  }

  return recs
    .filter((r) => !state.dismissedRecommendations.includes(r.id))
    .sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority]);
}

export function dismissRecommendation(state, id) {
  if (!state.dismissedRecommendations.includes(id)) state.dismissedRecommendations.push(id);
}

export function nextRecommendation(state) {
  return buildRecommendations(state)[0] || null;
}
