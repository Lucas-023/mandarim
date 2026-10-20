/** Painel principal. */
import { h, card, button, bar, badge, emptyNote, formatDateTime } from './dom.js';
import { totalXp, xpMilestone, dailyGoal, computeStreak, dayKey } from '../core/xp.js';
import { estimateAllSkills } from '../core/skills.js';
import { latestAttempt } from '../core/placement.js';
import { buildRecommendations, dismissRecommendation } from '../core/recommendations.js';
import { achievementStatus } from '../core/achievements.js';
import { minutesStudied } from '../core/activities.js';
import { renderSkillRow, renderPlanCard } from './placement.js';
import { latestPack } from '../core/packs.js';
import { scheduleStats, seenGrammarIds } from '../core/schedule.js';
import { assessmentStatus, lastAssessment } from '../core/assessment.js';
import { reviewStats } from '../core/ankiConnect.js';
import { formatDateTime as fmt } from './dom.js';
import { grammarProgress, nextGrammarPoints } from '../core/content/grammar.js';
import { resumoBaralho } from './baralho.js';
import { estatisticas } from '../core/baralho.js';
import { resumoFala, MINIMO_FRASES_XP } from '../core/fala.js';

export function renderDashboard(ctx) {
  const { state } = ctx;
  const wrap = h('div', { class: 'stack' });
  const xp = totalXp(state);
  const milestone = xpMilestone(xp);
  const goal = dailyGoal(state);
  const streak = computeStreak(state);
  const attempt = latestAttempt(state);
  const today = dayKey();

  const itemsToday = state.exerciseResults
    .filter((r) => dayKey(r.at) === today)
    .reduce((n, r) => n + r.total, 0);
  const newCardsToday = state.cardDrafts.filter(
    (d) => (d.status === 'approved' || d.status === 'exported') && dayKey(d.updatedAt || d.createdAt) === today,
  ).length;
  const minutes = minutesStudied(state, 7);

  wrap.append(h('div', { class: 'hero' },
    h('div', {},
      h('h1', {}, state.profile.name ? `你好, ${state.profile.name}!` : '你好!'),
      h('p', { class: 'hint' },
        attempt
          ? `Nível estimado: ${attempt.result.overall.label} (nivelamento de ${formatDateTime(attempt.finishedAt)})`
          : 'Nível ainda não estimado — faça o nivelamento.')),
    h('div', { class: 'stats' },
      stat('XP total', xp, `Nível ${milestone.level} · ${milestone.into}/${milestone.needed} até o próximo marco`),
      stat('Sequência', `${streak.streak} dia(s)`, streak.activeToday ? 'Atividade registrada hoje' : 'Nada registrado hoje ainda'),
      stat('Meta de hoje', `${goal.earned}/${goal.goal} XP`, goal.met ? 'Meta cumprida' : `Faltam ${goal.remaining} XP`),
      stat('Tempo (7 dias)', `${minutes.total} min`, `${minutes.sessions} min de estudo · ${minutes.conversations} min de conversa`))));

  wrap.append(card('Progresso de hoje',
    bar(goal.percent, `${goal.percent}% da meta diária`),
    h('div', { class: 'grid-2' },
      stat('Itens de exercício respondidos hoje', itemsToday, 'Registrado pelo próprio app'),
      stat('Cartões novos aprovados hoje', newCardsToday, 'Aprovados ou exportados hoje'),
      stat('Cartões revisados no baralho hoje', estatisticas(state).respondidosHoje, 'Respostas registradas no baralho do app'),
      stat('Frases faladas em voz alta hoje', resumoFala(state).hoje, `Autoavaliação, não nota · ${MINIMO_FRASES_XP} por dia dão XP`),
      // O Anki de verdade só é lido no computador (AnkiConnect); no celular é ruído.
      ctx.store.mode === 'server' || state.settings.usesAnki || state.ankiStats ? renderAnkiStat(ctx) : null),
  ));

  // Reavaliação periódica
  const aval = assessmentStatus(state);
  const ultimaAval = lastAssessment(state);
  wrap.append(card('Reavaliação',
    h('p', { class: 'hint' },
      aval.reason +
      (ultimaAval ? ` Última: ${ultimaAval.correct}/${ultimaAval.total} em ${fmt(ultimaAval.at)}.` : '')),
    h('p', { class: 'hint' },
      'A reavaliação usa itens diferentes dos da anterior, entre o que você já estudou — ' +
      'familiaridade com a mesma questão não é progresso.'),
    h('div', { class: 'actions' },
      button(aval.due ? 'Fazer a reavaliação agora' : 'Fazer uma reavaliação de qualquer forma',
        () => ctx.go('study', { exercise: 'assessment' }),
        { kind: aval.due ? 'primary' : 'ghost' }),
      state.assessments?.length || state.placementAttempts.length > 1
        ? button('Ver a evolução', () => ctx.go('history'), { kind: 'secondary' })
        : null)));

  // Revisão espaçada: o que precisa voltar hoje
  const sched = scheduleStats(state, { today });
  const seenGrammar = seenGrammarIds(state);
  const gProgress = grammarProgress(seenGrammar);
  const nextPoint = nextGrammarPoints(seenGrammar, { limit: 1 })[0];
  wrap.append(card('Revisão e progressão',
    h('div', { class: 'grid-2' },
      stat('Devido hoje', sched.dueToday,
        sched.overdue ? `${sched.overdue} em atraso` : 'nada atrasado'),
      stat('Itens em acompanhamento', sched.total,
        `${sched.words} palavras · ${sched.grammar} estruturas`),
      stat('Consolidados', sched.mature, `intervalo de ${21}+ dias`),
      stat('Problemáticos', sched.leeches, 'erros repetidos: precisam de outro ângulo')),
    h('h4', {}, 'Currículo gramatical'),
    bar(gProgress.percent, `${gProgress.done} de ${gProgress.total} estruturas apresentadas`),
    nextPoint
      ? h('p', { class: 'hint' }, `Próxima da fila: ${nextPoint.name} — ${nextPoint.pattern}`)
      : h('p', { class: 'hint' }, 'Currículo gramatical concluído.'),
    h('div', { class: 'actions' },
      sched.dueToday
        ? button(`Revisar ${Math.min(sched.dueToday, 10)} item(ns) agora`, () => ctx.go('study', { exercise: 'review' }))
        : button('Nada devido — ver o pacote do dia', () => ctx.go('pack'), { kind: 'secondary' }),
      button('Ajustar o que já domino', () => ctx.go('pack', { tab: 'gramatica' }), { kind: 'ghost' }))));

  // Pacote do dia gerado por LLM
  const baralho = resumoBaralho(ctx);
  if (baralho) wrap.append(baralho);

  const packEntry = latestPack(state);
  if (packEntry) {
    const pack = packEntry.pack;
    const fresh = dayKey(packEntry.ingestedAt) === today;
    wrap.append(card('Pacote do dia',
      h('div', { class: 'row between' },
        h('strong', {}, `${pack.date} · ${pack.focus.tags.join(', ')}`),
        fresh ? badge('novo hoje', 'ok') : badge(pack.date, 'neutral')),
      h('p', { class: 'hint' }, pack.focus.reason),
      h('p', { class: 'hint' },
        `${pack.vocab.length} palavras · ${pack.exercises.length} exercícios · ` +
        `diálogo com ${pack.dialogue.lines.length} falas · gerado por ${pack.provenance?.backend || 'LLM'}`),
      h('div', { class: 'actions' },
        button('Abrir pacote', () => ctx.go('pack', { date: pack.date })),
        button('Ir direto aos exercícios', () => ctx.go('study', { exercise: 'pack', date: pack.date }), { kind: 'secondary' }),
        button('Conversa simulada', () => ctx.go('speak', { modo: 'conversa', date: pack.date }), { kind: 'secondary' }))));
  } else {
    wrap.append(card('Pacote do dia',
      h('p', { class: 'hint' }, 'Nenhum pacote gerado ainda. O gerador monta um por dia a partir dos seus erros recentes.'),
      h('div', { class: 'actions' }, button('Ver como funciona', () => ctx.go('pack'), { kind: 'secondary' }))));
  }

  // Próximas recomendações
  const recs = buildRecommendations(state);
  const recCard = card('O que estudar agora');
  if (!recs.length) recCard.append(emptyNote('Sem recomendações pendentes. Bom momento para registrar uma conversa real.'));
  for (const rec of recs.slice(0, 4)) {
    recCard.append(h('div', { class: 'rec' },
      h('div', { class: 'row between' },
        h('strong', {}, rec.title),
        badge(rec.priority, rec.priority === 'alta' ? 'warn' : 'neutral')),
      h('p', { class: 'hint' }, `Por quê: ${rec.why}`),
      h('div', { class: 'actions' },
        button('Fazer', () => ctx.go(rec.action.view, rec.action.params || {}), { kind: 'primary' }),
        button('Ignorar', () => ctx.commit(() => dismissRecommendation(state, rec.id)), { kind: 'ghost' }))));
  }
  wrap.append(recCard);

  const skillCard = card('Habilidades');
  skillCard.append(h('p', { class: 'hint' },
    'Estimativa interna (0–100) calculada a partir das atividades registradas. Não é medida oficial de proficiência. ' +
    'XP não influencia estes valores.'));
  for (const est of estimateAllSkills(state)) skillCard.append(renderSkillRow(est));
  wrap.append(skillCard);

  wrap.append(card('Acesso rápido',
    h('div', { class: 'quick' },
      button('Começar estudo de hoje', () => ctx.go('study')),
      button('Revisar vocabulário', () => ctx.go('study', { exercise: 'vocab' }), { kind: 'secondary' }),
      button('Criar flashcards de um texto', () => ctx.go('cards'), { kind: 'secondary' }),
      button('Praticar a fala', () => ctx.go('speak'), { kind: 'secondary' }),
      button('Conversa simulada', () => ctx.go('speak', { modo: 'conversa' }), { kind: 'secondary' }),
      button('Registrar conversa real', () => ctx.go('activities', { tab: 'conversation' }), { kind: 'secondary' }),
      button('Exercício de escuta', () => ctx.go('study', { exercise: 'listening' }), { kind: 'secondary' }),
      button('Histórico e recomendações', () => ctx.go('history'), { kind: 'secondary' }))));

  if (state.plan) wrap.append(renderPlanCard(state.plan));

  const recent = state.exerciseResults.slice(-5).reverse();
  wrap.append(card('Resultados recentes de exercícios',
    recent.length
      ? h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Quando'), h('th', {}, 'Tipo'), h('th', {}, 'Acertos'))),
          h('tbody', {}, ...recent.map((r) => h('tr', {},
            h('td', {}, formatDateTime(r.at)),
            h('td', {}, r.kind),
            h('td', {}, `${r.correct}/${r.total}`)))))
      : emptyNote('Nenhum exercício registrado ainda.')));

  const achievements = achievementStatus(state);
  wrap.append(card('Conquistas',
    h('div', { class: 'chips' }, ...achievements.map((a) =>
      h('span', { class: `chip${a.unlocked ? ' chip-on' : ''}`, title: `${a.description}${a.at ? ` — ${formatDateTime(a.at)}` : ''}` },
        `${a.unlocked ? '✓ ' : ''}${a.title}`)))));

  return wrap;
}

/**
 * Revisões feitas dentro do Anki. Só mostra número se o add-on respondeu;
 * caso contrário diz exatamente por que não há dado.
 */
function renderAnkiStat(ctx) {
  const { state } = ctx;
  const cache = state.ankiStats;
  const valor = cache?.ok ? cache.today : cache?.unsupported ? 'indisponível' : state.settings.usesAnki ? 'não lido' : 'não configurado';
  const dica = cache?.ok
    ? `Lido do Anki em ${fmt(cache.fetchedAt)}.`
    : cache?.error
      ? `Sem dado: ${cache.error}.`
      : 'Precisa do Anki aberto com o AnkiConnect. Nada é estimado se a leitura falhar.';

  const bloco = h('div', { class: 'stat' },
    h('span', { class: 'stat-value' }, String(valor)),
    h('span', { class: 'stat-label' }, 'Revisões no Anki hoje'),
    h('small', { class: 'hint' }, dica),
    h('button', {
      class: 'link',
      onClick: async () => {
        ctx.toast('Consultando o Anki…', 'info');
        const res = await reviewStats({ url: state.settings.ankiConnectUrl });
        ctx.commit((s) => {
          s.ankiStats = res.ok
            ? { ok: true, today: res.today, byDay: res.byDay, fetchedAt: res.fetchedAt }
            : { ok: false, unsupported: Boolean(res.unsupported), error: res.error, fetchedAt: new Date().toISOString() };
        });
        ctx.toast(res.ok ? `Anki: ${res.today} revisão(ões) hoje.` : `Anki: ${res.error}`, res.ok ? 'success' : 'warn');
      },
    }, 'Ler do Anki agora'));
  return bloco;
}

function stat(label, value, hint = '') {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat-value' }, String(value)),
    h('span', { class: 'stat-label' }, label),
    hint ? h('small', { class: 'hint' }, hint) : null);
}
