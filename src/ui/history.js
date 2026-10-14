/** Histórico e relatórios. */
import { h, card, badge, emptyNote, formatDateTime, formatDate } from './dom.js';
import { xpByDay, totalXp, activeDays, computeStreak, dayKey } from '../core/xp.js';
import { estimateAllSkills, SKILL_BY_ID, SKILLS } from '../core/skills.js';
import { errorTags } from '../core/exercises.js';
import { difficultiesByTag } from '../core/placement.js';
import { minutesStudied } from '../core/activities.js';
import { skillTimeline, lastAssessment } from '../core/assessment.js';
import { scheduleStats } from '../core/schedule.js';
import { renderSkillRow } from './placement.js';

export function renderHistory(ctx) {
  const { state } = ctx;
  const wrap = h('div', { class: 'stack' });
  const days = 30;
  const series = xpByDay(state, days);
  const max = Math.max(1, ...series.map((d) => d.xp));
  const active = activeDays(state);
  const streak = computeStreak(state);

  wrap.append(card(`XP por dia (últimos ${days} dias)`,
    h('div', { class: 'chart' }, ...series.map((d) =>
      h('div', {
        class: `chart-bar${d.xp ? '' : ' empty'}`,
        title: `${d.day}: ${d.xp} XP`,
        style: `height:${Math.round((d.xp / max) * 100)}%`,
      }))),
    h('p', { class: 'hint' },
      `Total acumulado: ${totalXp(state)} XP · ${[...active].filter((d) => series.some((s) => s.day === d)).length} dia(s) ` +
      `com atividade nesta janela · sequência atual ${streak.streak} dia(s) (recorde ${streak.longest}). ` +
      `Origem: eventos de XP registrados pelo app, ${series[0].day} a ${series.at(-1).day}.`)));

  const minutes = minutesStudied(state, 30);
  wrap.append(card('Resumo de atividade (30 dias)',
    h('ul', { class: 'tight' },
      h('li', {}, `Tempo registrado: ${minutes.total} min (${minutes.sessions} de estudo, ${minutes.conversations} de conversa)`),
      h('li', {}, `Sessões registradas: ${state.sessions.length}`),
      h('li', {}, `Conversas registradas: ${state.conversations.length}`),
      h('li', {}, `Cartões gerados: ${state.cardDrafts.length} · aprovados: ${state.cardDrafts.filter((d) => d.status === 'approved').length} · exportados: ${state.cardDrafts.filter((d) => d.status === 'exported').length}`),
      h('li', {}, `Exportações bem-sucedidas: ${state.cardExports.filter((e) => e.status === 'ok').length} · com erro: ${state.cardExports.filter((e) => e.status !== 'ok').length}`),
      h('li', {}, state.ankiStats?.ok
        ? `Revisões dentro do Anki: ${state.ankiStats.today} hoje (lido em ${formatDateTime(state.ankiStats.fetchedAt)})`
        : `Revisões dentro do Anki: sem dado${state.ankiStats?.error ? ` — ${state.ankiStats.error}` : ' (use "Ler do Anki agora" no painel)'}`))));

  const skillCard = card('Habilidades hoje');
  for (const est of estimateAllSkills(state)) skillCard.append(renderSkillRow(est));
  wrap.append(skillCard);

  // Evolução entre medições: nivelamentos e reavaliações na mesma linha do tempo
  const attempts = state.placementAttempts;
  const linha = skillTimeline(state);
  if (linha.length) {
    const tabela = h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Habilidade'),
        ...linha.map((p) => h('th', {}, `${formatDate(p.at)} (${p.tipo})`)))),
      h('tbody', {}, ...SKILLS.map((sk) => h('tr', {},
        h('td', {}, sk.pt),
        ...linha.map((p) => {
          const achado = p.skills.find((x) => x.skill === sk.id);
          return h('td', {}, achado?.score == null ? '—' : `${achado.score}/100`);
        })))));
    wrap.append(card('Evolução das habilidades',
      linha.length === 1
        ? h('p', { class: 'hint' },
            'Só há uma medição: sem base para falar de evolução ainda. A reavaliação fica disponível ' +
            'uma semana depois do nivelamento.')
        : h('p', { class: 'hint' },
            'Reavaliações usam itens diferentes dos anteriores, então a comparação não é inflada por ' +
            'familiaridade com as mesmas questões. Ainda assim, são estimativas internas.'),
      tabela,
      lastAssessment(state)
        ? h('p', { class: 'hint' },
            'Última reavaliação por habilidade: ' +
            lastAssessment(state).porHabilidade
              .map((x) => `${SKILL_BY_ID.get(x.skill).pt} ${x.correct}/${x.total}`)
              .join(' · '))
        : null));
  }

  // Estado do agendamento
  const sched = scheduleStats(state);
  wrap.append(card('Repetição espaçada',
    h('ul', { class: 'tight' },
      h('li', {}, `${sched.total} item(ns) em acompanhamento (${sched.words} palavras, ${sched.grammar} estruturas)`),
      h('li', {}, `${sched.dueToday} devido(s) hoje${sched.overdue ? `, ${sched.overdue} em atraso` : ''}`),
      h('li', {}, `${sched.mature} consolidado(s) (intervalo de 21 dias ou mais)`),
      h('li', {}, `${sched.leeches} problemático(s) (4 recaídas ou mais)`),
      h('li', {}, sched.nextDue ? `Próximo vencimento: ${sched.nextDue}` : 'Nada agendado ainda')),
    h('small', { class: 'hint' },
      'O agendador só conhece itens que passaram por um exercício ou por um pacote deste app. ' +
      'Revisões feitas dentro do Anki não aparecem aqui.')));

  const results = state.exerciseResults.slice().reverse().slice(0, 20);
  wrap.append(card('Resultados de exercícios',
    results.length
      ? h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Quando'), h('th', {}, 'Tipo'), h('th', {}, 'Acertos'), h('th', {}, 'Habilidades'))),
          h('tbody', {}, ...results.map((r) => h('tr', {},
            h('td', {}, formatDateTime(r.at)),
            h('td', {}, r.kind),
            h('td', {}, `${r.correct}/${r.total}`),
            h('td', {}, [...new Set(r.items.map((i) => SKILL_BY_ID.get(i.skill).pt))].join(', '))))))
      : emptyNote('Nenhum exercício feito ainda.')));

  // Dificuldades recorrentes
  const fromPlacement = attempts.length ? difficultiesByTag(attempts.at(-1).responses) : [];
  const fromExercises = errorTags(state);
  const combined = new Map();
  for (const src of [fromPlacement, fromExercises]) {
    for (const t of src) {
      const e = combined.get(t.tag) || { tag: t.tag, items: 0, misses: 0 };
      e.items += t.items;
      e.misses += t.misses;
      combined.set(t.tag, e);
    }
  }
  const recurring = [...combined.values()]
    .map((e) => ({ ...e, missRate: e.misses / e.items }))
    .sort((a, b) => b.missRate - a.missRate);
  wrap.append(card('Temas e dificuldades',
    recurring.length
      ? h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Tema'), h('th', {}, 'Itens'), h('th', {}, 'Erros'), h('th', {}, 'Situação'))),
          h('tbody', {}, ...recurring.map((t) => h('tr', {},
            h('td', {}, t.tag),
            h('td', {}, String(t.items)),
            h('td', {}, String(t.misses)),
            h('td', {}, t.items < 2
              ? badge('poucos dados', 'warn')
              : t.missRate >= 0.5 ? badge('dificuldade recorrente', 'error')
                : t.missRate > 0 ? badge('erros isolados', 'neutral') : badge('consistente', 'ok'))))))
      : emptyNote('Sem dados suficientes de temas ainda.'),
    h('small', { class: 'hint' }, 'Um tema só é chamado de dificuldade recorrente com 2 itens ou mais e metade de erros.')));

  const convs = state.conversations.slice().reverse();
  wrap.append(card('Conversas reais registradas',
    convs.length
      ? h('div', {}, ...convs.map((c) => h('div', { class: 'rec' },
          h('div', { class: 'row between' },
            h('strong', {}, `${c.context} · ${c.minutes} min`),
            h('small', { class: 'hint' }, formatDateTime(c.at))),
          c.understood ? h('p', {}, `Entendeu: ${c.understood}`) : null,
          c.couldNotSay ? h('p', {}, `Não conseguiu: ${c.couldNotSay}`) : null,
          c.newExpressions.length ? h('div', { class: 'chips' }, ...c.newExpressions.map((e) => h('span', { class: 'chip mono-zh' }, e))) : null)))
      : emptyNote('Nenhuma conversa registrada.')));

  wrap.append(card('Origem dos dados',
    h('p', { class: 'hint' },
      'Tudo nesta página vem de registros feitos neste navegador: respostas de nivelamento, exercícios, ' +
      'sessões e conversas que você registrou, e cartões gerados. Nada é importado do Anki nem estimado ' +
      `sem dados. Hoje: ${dayKey()}.`)));

  return wrap;
}
