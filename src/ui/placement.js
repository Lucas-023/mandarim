/** Nivelamento: etapas, adaptação de dificuldade e relatório diagnóstico. */
import { h, card, button, bar, badge, emptyNote, formatDateTime } from './dom.js';
import {
  startPlacement, nextQuestion, submitAnswer, finishPlacement, progressOf,
  STAGE_PLAN, TOTAL_ITEMS, latestAttempt,
} from '../core/placement.js';
import { UNAVAILABLE_STAGES } from '../core/content/questions.js';
import { buildInitialPlan } from '../core/plan.js';
import { SKILL_BY_ID } from '../core/skills.js';

export function renderPlacement(ctx) {
  const { state } = ctx;
  if (state.placementInProgress) return renderQuestion(ctx);
  if (ctx.params.report === 'latest' || (latestAttempt(state) && !ctx.ui.placementRestart)) {
    const attempt = latestAttempt(state);
    if (attempt) return renderReport(ctx, attempt);
  }
  return renderIntro(ctx);
}

function renderIntro(ctx) {
  const { commit, state } = ctx;
  const wrap = h('div', { class: 'stack' });
  wrap.append(card('Nivelamento inicial',
    h('p', {}, 'O nível que você declarou é só um ponto de partida. Este teste aplica ' +
      `${TOTAL_ITEMS} itens curtos, começa fácil e ajusta a dificuldade conforme suas respostas.`),
    h('ul', { class: 'tight' },
      ...STAGE_PLAN.map((s) => h('li', {}, `Etapa ${s.stage} — ${s.label}: ${s.limit} itens`)),
      h('li', {}, 'Etapa B inclui uma autoavaliação de vocabulário (não conta como prova de domínio).')),
    h('div', { class: 'callout' },
      h('strong', {}, 'O que esta versão não avalia: '),
      h('ul', { class: 'tight' },
        ...UNAVAILABLE_STAGES.map((s) => h('li', {}, `Etapa ${s.stage} — ${s.label}: ${s.reason}`)))),
    h('p', { class: 'hint' }, 'Você pode pausar e retomar: as respostas ficam salvas.'),
    h('div', { class: 'actions' },
      button('Começar o nivelamento', () => {
        ctx.ui.placementRestart = false;
        ctx.ui.placementFeedback = null;
        commit((s) => startPlacement(s, s.profile.questionnaire || {}));
      }),
      state.placementAttempts.length
        ? button('Ver último relatório', () => ctx.go('placement', { report: 'latest' }), { kind: 'ghost' })
        : null),
  ));
  return wrap;
}

function renderQuestion(ctx) {
  const { state, commit } = ctx;
  const attempt = state.placementInProgress;
  const feedback = ctx.ui.placementFeedback;
  const wrap = h('div', { class: 'stack' });

  const prog = progressOf(attempt);
  wrap.append(h('div', { class: 'card' },
    h('div', { class: 'row between' },
      h('strong', {}, `Nivelamento — ${prog.answered} de ${prog.total}`),
      badge(`dificuldade ${attempt.difficulty}/3`, 'neutral')),
    bar(prog.percent),
    h('div', { class: 'actions' },
      button('Pausar e sair', () => ctx.go('dashboard'), { kind: 'ghost' }))));

  if (feedback) {
    const { grading, question } = feedback;
    wrap.append(card(grading.correct === false ? 'Resposta incorreta' : grading.scored ? 'Resposta correta' : 'Registrado',
      h('p', { class: 'mono-zh' }, question.promptHz || question.prompt),
      h('p', {}, grading.detail),
      grading.criteria
        ? h('ul', { class: 'tight' }, ...grading.criteria.map((c) =>
            h('li', {}, `${c.met ? '✓' : '✕'} ${c.label}`)))
        : null,
      h('div', { class: 'actions' },
        button('Continuar', () => {
          ctx.ui.placementFeedback = null;
          if (!nextQuestion(attempt)) {
            const { attempt: done, result } = commit((s) => finishPlacement(s), { silent: true });
            commit((s) => {
              s.plan = buildInitialPlan(result, {
                questionnaire: done.questionnaire,
                minutesPerDay: s.profile.minutesPerDay,
              });
              s.settings.dailyGoalXp = s.plan.dailyGoalXp;
            }, { silent: true });
            ctx.go('placement', { report: 'latest' });
            ctx.render();
          } else {
            ctx.render();
          }
        }))));
    return wrap;
  }

  const question = nextQuestion(attempt);
  if (!question) {
    wrap.append(card('Nivelamento respondido',
      h('p', {}, 'Todas as etapas disponíveis foram respondidas.'),
      h('div', { class: 'actions' }, button('Ver resultado', () => {
        const { result, attempt: done } = commit((s) => finishPlacement(s), { silent: true });
        commit((s) => {
          s.plan = buildInitialPlan(result, { questionnaire: done.questionnaire, minutesPerDay: s.profile.minutesPerDay });
          s.settings.dailyGoalXp = s.plan.dailyGoalXp;
        }, { silent: true });
        ctx.go('placement', { report: 'latest' });
        ctx.render();
      }))));
    return wrap;
  }

  const qCard = card(null);
  qCard.append(h('div', { class: 'row between' },
    h('small', { class: 'hint' }, `Etapa ${question.stage} · ${SKILL_BY_ID.get(question.skill).pt}`),
    badge(`nível ${question.difficulty}`, 'neutral')));
  qCard.append(h('p', { class: 'question' }, question.prompt));
  if (question.promptHz) qCard.append(h('div', { class: 'mono-zh big' }, question.promptHz));

  let supportUsed = false;
  if (question.pinyin) {
    const pinyinBox = h('div', { class: 'pinyin hidden' }, question.pinyin);
    const revealBtn = button('Mostrar pinyin (registra apoio usado)', () => {
      supportUsed = true;
      pinyinBox.classList.remove('hidden');
      revealBtn.remove();
    }, { kind: 'ghost' });
    qCard.append(revealBtn, pinyinBox);
  }

  const send = (answer) => {
    const res = commit((s) => submitAnswer(s, { questionId: question.id, answer, supportUsed }), { silent: true });
    ctx.ui.placementFeedback = { grading: res.grading, question };
    ctx.render();
  };

  if (question.type === 'self_report') {
    const chosen = new Set();
    qCard.append(h('div', { class: 'chips' }, ...question.items.map((hz) =>
      h('button', {
        class: 'chip',
        onClick: (e) => {
          if (chosen.has(hz)) chosen.delete(hz);
          else chosen.add(hz);
          e.target.classList.toggle('chip-on');
        },
      }, hz))));
    qCard.append(h('div', { class: 'actions' },
      button('Confirmar seleção', () => send([...chosen])),
      button('Não conheço nenhuma', () => send([]), { kind: 'ghost' })));
  } else if (question.type === 'open') {
    const ta = h('textarea', { rows: 3, placeholder: 'Escreva em caracteres ou em pinyin…' });
    qCard.append(ta);
    qCard.append(h('details', {}, h('summary', {}, 'Como esta resposta é corrigida'),
      h('ul', { class: 'tight' }, ...question.rubric.criteria.map((c) => h('li', {}, c.label)))));
    qCard.append(h('div', { class: 'actions' },
      button('Enviar resposta', () => send(ta.value)),
      button('Não sei responder', () => send(''), { kind: 'ghost' })));
  } else {
    qCard.append(h('div', { class: 'options' }, ...question.options.map((opt, i) =>
      h('button', { class: 'option', onClick: () => send(i) }, opt))));
    qCard.append(h('div', { class: 'actions' },
      button('Não sei', () => send(-1), { kind: 'ghost' })));
  }

  wrap.append(qCard);
  return wrap;
}

export function renderSkillRow(est) {
  const label = `${est.label.hz} — ${est.label.py} — ${est.label.pt}`;
  if (est.score == null) {
    return h('div', { class: 'skill' },
      h('div', { class: 'row between' }, h('strong', {}, label), badge('não avaliada', 'warn')),
      h('small', { class: 'hint' }, est.explanation));
  }
  return h('div', { class: 'skill' },
    h('div', { class: 'row between' },
      h('strong', {}, label),
      h('span', {},
        `${est.score}/100 `,
        badge(est.status === 'dados_insuficientes' ? 'dados insuficientes' : `confiança ${est.confidence}`,
          est.status === 'dados_insuficientes' ? 'warn' : 'ok'))),
    bar(est.score),
    h('details', {}, h('summary', {}, 'Como foi calculado'), h('p', { class: 'hint' }, est.explanation)));
}

function renderReport(ctx, attempt) {
  const { state } = ctx;
  const result = attempt.result;
  const wrap = h('div', { class: 'stack' });
  if (!result) return emptyNote('Esta tentativa não tem resultado registrado.');

  wrap.append(card('Resultado do nivelamento',
    h('p', { class: 'hint' }, `Tentativa de ${formatDateTime(attempt.finishedAt)} · banco de questões ${attempt.version}`),
    h('h3', {}, result.overall.label),
    h('p', {}, result.overall.explanation),
    h('p', { class: 'hint' }, `${result.answeredCount} itens pontuados. Estimativa diagnóstica interna — não é certificação oficial do HSK.`)));

  wrap.append(card('Resultados por habilidade', ...result.skills.map(renderSkillRow)));

  wrap.append(card('Pontos fortes e dificuldades',
    h('h4', {}, 'Pontos fortes'),
    result.strengths.length ? h('div', { class: 'chips' }, ...result.strengths.map((t) => h('span', { class: 'chip chip-on' }, t)))
      : emptyNote('Ainda sem tema com acerto consistente suficiente.'),
    h('h4', {}, 'Dificuldades prioritárias'),
    result.priorityDifficulties.length ? h('div', { class: 'chips' }, ...result.priorityDifficulties.map((t) => h('span', { class: 'chip' }, t)))
      : emptyNote('Nenhuma dificuldade recorrente identificada neste teste.')));

  wrap.append(card('Vocabulário',
    h('h4', {}, 'Parece conhecido'),
    result.likelyKnown.length ? h('div', { class: 'chips' }, ...result.likelyKnown.map((w) => h('span', { class: 'chip' }, w)))
      : emptyNote('Sem itens suficientes.'),
    h('h4', {}, 'Precisa confirmar em exercícios'),
    result.toConfirm.length ? h('div', { class: 'chips' }, ...result.toConfirm.map((w) => h('span', { class: 'chip' }, w)))
      : emptyNote('Nada pendente de confirmação.'),
    h('small', { class: 'hint' }, 'Acertar uma múltipla escolha não é prova de domínio: estes itens voltam em exercícios futuros.')));

  wrap.append(card('Limitações desta avaliação',
    h('ul', { class: 'tight' }, ...result.limitations.map((l) => h('li', {}, l)))));

  if (state.plan) wrap.append(renderPlanCard(state.plan));

  wrap.append(h('div', { class: 'actions' },
    button('Ir para o painel', () => ctx.go('dashboard')),
    button('Refazer o nivelamento', () => {
      ctx.ui.placementRestart = true;
      ctx.go('placement');
      ctx.render();
    }, { kind: 'ghost' })));
  return wrap;
}

export function renderPlanCard(plan) {
  return card('Plano recomendado para a primeira semana',
    h('p', { class: 'hint' },
      `Nível considerado: ${plan.levelLabel} · ${plan.minutesPerDay} min/dia · meta de ${plan.dailyGoalXp} XP/dia · ` +
      `apoio de pinyin: ${plan.supportLevel.replace('_', ' ')}`),
    h('ul', { class: 'plan' }, ...plan.items.map((i) => h('li', {},
      h('strong', {}, i.title),
      i.minutes ? h('span', { class: 'hint' }, ` · ~${i.minutes} min`) : null,
      h('div', { class: 'hint' }, `Por quê: ${i.why}`)))),
    h('ul', { class: 'tight' }, ...plan.caveats.map((c) => h('li', { class: 'hint' }, c))));
}
