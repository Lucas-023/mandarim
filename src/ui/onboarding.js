/** Onboarding: perfil, objetivos e Etapa A do nivelamento (questionário). */
import { h, card, field, button, select } from './dom.js';
import { QUESTIONNAIRE } from '../core/placement.js';
import { minutesFromQuestionnaire, suggestedDailyXp } from '../core/plan.js';

export const GOAL_LABELS = {
  ouvir_cotidiano: 'Entender mandarim falado no dia a dia',
  conversar_simples: 'Iniciar e manter conversas simples',
  futebol: 'Vocabulário de futebol e convivência',
  revisao_consistente: 'Revisar com consistência (repetição espaçada)',
  corrigir_dificuldades: 'Atacar minhas dificuldades recorrentes',
};

export function renderOnboarding(ctx) {
  const { state, commit, go } = ctx;
  const answers = { ...(ctx.ui.onboardingAnswers || {}) };
  const goals = [...state.profile.goals];
  let name = state.profile.name || '';

  const wrap = h('div', { class: 'stack' });

  wrap.append(card('Bem-vindo ao Mandarin Quest',
    h('p', {},
      'Este é um sistema pessoal de estudo de mandarim. Antes de sugerir qualquer plano, ' +
      'precisamos de duas coisas: seus objetivos e um nivelamento real. ' +
      'Nada é estimado sem dados.'),
    h('ul', { class: 'tight' },
      h('li', {}, 'Explicações em português; chinês simplificado com pinyin disponível.'),
      h('li', {}, 'Esta versão não tem áudio nem reconhecimento de fala: compreensão auditiva e produção oral ficam marcadas como não avaliadas.'),
      h('li', {}, 'Seus dados ficam apenas neste navegador (localStorage). Nada é enviado para fora.')),
  ));

  wrap.append(card('Quem está estudando',
    field('Como quer ser chamado? (opcional)',
      h('input', { type: 'text', value: name, placeholder: 'Seu nome', onInput: (e) => { name = e.target.value; } })),
  ));

  const qCard = card('Questionário inicial (Etapa A)');
  qCard.append(h('p', { class: 'hint' }, 'As perguntas marcadas como opcionais podem ser puladas.'));
  for (const q of QUESTIONNAIRE) {
    const options = [
      { value: '', label: q.optional ? 'Prefiro não responder' : 'Selecione…' },
      ...q.options.map((o) => ({ value: o, label: o })),
    ];
    qCard.append(field(
      q.label + (q.optional ? ' (opcional)' : ''),
      select(options, answers[q.id] || '', (v) => {
        answers[q.id] = v;
        ctx.ui.onboardingAnswers = answers;
      }),
    ));
  }
  wrap.append(qCard);

  const goalsCard = card('Prioridade dos objetivos');
  goalsCard.append(h('p', { class: 'hint' }, 'A ordem muda o que o sistema recomenda primeiro. Use as setas para reordenar.'));
  const list = h('ol', { class: 'goal-list' });
  const paint = () => {
    list.replaceChildren(...goals.map((g, i) => h('li', {},
      h('span', {}, GOAL_LABELS[g.id] || g.id),
      h('span', { class: 'row-actions' },
        button('↑', () => {
          if (i === 0) return;
          [goals[i - 1], goals[i]] = [goals[i], goals[i - 1]];
          paint();
        }, { kind: 'ghost', title: 'Subir' }),
        button('↓', () => {
          if (i === goals.length - 1) return;
          [goals[i + 1], goals[i]] = [goals[i], goals[i + 1]];
          paint();
        }, { kind: 'ghost', title: 'Descer' })),
    )));
  };
  paint();
  goalsCard.append(list);
  wrap.append(goalsCard);

  wrap.append(h('div', { class: 'actions' },
    button('Salvar e fazer o nivelamento', () => {
      const required = QUESTIONNAIRE.filter((q) => !q.optional && !answers[q.id]);
      if (required.length) {
        ctx.toast(`Responda: ${required[0].label}`, 'error');
        return;
      }
      const minutes = minutesFromQuestionnaire(answers);
      commit((s) => {
        s.profile.name = name.trim();
        s.profile.goals = goals.map((g, i) => ({ id: g.id, priority: i + 1 }));
        s.profile.minutesPerDay = minutes;
        s.profile.onboardingDone = true;
        s.profile.declaredLevel = answers.hskStudied === 'Não' ? 'nenhum' : (answers.hskStudied || 'hsk1').toLowerCase().replace(' ', '');
        s.profile.questionnaire = answers;
        s.settings.dailyGoalXp = suggestedDailyXp(minutes);
        s.settings.usesAnki = (answers.usesAnki || '').startsWith('Uso');
        s.settings.pinyinByDefault = answers.readsHanzi === 'Nenhum' || answers.readsHanzi === 'Alguns poucos';
      }, { silent: true });
      ctx.ui.onboardingAnswers = null;
      go('placement');
    }),
  ));

  return wrap;
}
