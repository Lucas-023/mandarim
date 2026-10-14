/** Registro manual de sessões de estudo e conversas reais. */
import { h, card, button, field, select, emptyNote, formatDateTime } from './dom.js';
import { logSession, logConversation, SESSION_TYPES, CONVERSATION_CONTEXTS } from '../core/activities.js';
import { generateDrafts, saveDrafts } from '../core/flashcards.js';

export function renderActivities(ctx) {
  const tab = ctx.ui.actTab || ctx.params.tab || 'session';
  ctx.ui.actTab = tab;
  const wrap = h('div', { class: 'stack' });

  wrap.append(h('div', { class: 'tabs' },
    ...[['session', 'Sessão de estudo'], ['conversation', 'Conversa real']].map(([key, label]) =>
      h('button', {
        class: `tab${tab === key ? ' active' : ''}`,
        onClick: () => {
          ctx.ui.actTab = key;
          ctx.render();
        },
      }, label))));

  wrap.append(tab === 'session' ? renderSessionForm(ctx) : renderConversationForm(ctx));
  wrap.append(renderHistoryList(ctx));
  return wrap;
}

function renderSessionForm(ctx) {
  let type = 'review_session';
  let minutes = 15;
  let notes = '';
  return card('Registrar sessão de estudo',
    h('p', { class: 'hint' }, 'Para estudo feito fora do app. Concede XP de atividade; não altera proficiência.'),
    field('Tipo', select(Object.entries(SESSION_TYPES).map(([value, label]) => ({ value, label })), type, (v) => (type = v))),
    field('Duração (minutos)', h('input', { type: 'number', min: 0, value: minutes, onInput: (e) => (minutes = e.target.value) })),
    field('Observação (opcional)', h('input', { type: 'text', onInput: (e) => (notes = e.target.value) })),
    h('div', { class: 'actions' },
      button('Registrar sessão', () => {
        const { xp } = ctx.commit((s) => logSession(s, { type, minutes, notes }));
        ctx.toast(xp.granted ? `Sessão registrada (+${xp.event.amount} XP).` : 'Sessão registrada.', 'success');
      })));
}

function renderConversationForm(ctx) {
  let minutes = 10;
  let context = 'futebol';
  let difficulty = 3;
  let expressions = '';
  let understood = '';
  let couldNotSay = '';
  let notes = '';

  return card('Registrar conversa real',
    h('p', { class: 'hint' },
      'Conversa de 10+ minutos concede +30 XP; cinco ou mais expressões novas concedem +15 XP. ' +
      'Nada disso altera a pontuação de proficiência — ela depende de desempenho medido em exercícios.'),
    h('div', { class: 'grid-2' },
      field('Duração (minutos)', h('input', { type: 'number', min: 0, value: minutes, onInput: (e) => (minutes = e.target.value) })),
      field('Contexto', select(CONVERSATION_CONTEXTS, context, (v) => (context = v))),
      field('Dificuldade percebida (1 fácil – 5 difícil)',
        h('input', { type: 'number', min: 1, max: 5, value: difficulty, onInput: (e) => (difficulty = e.target.value) }))),
    field('Expressões novas que apareceram (uma por linha)',
      h('textarea', { rows: 4, placeholder: '加油\n好球\n传给我', onInput: (e) => (expressions = e.target.value) })),
    field('O que você conseguiu entender',
      h('textarea', { rows: 2, onInput: (e) => (understood = e.target.value) })),
    field('O que não conseguiu dizer ou entender',
      h('textarea', {
        rows: 2,
        placeholder: 'Ex.: não consegui responder com que frequência eu jogo',
        onInput: (e) => (couldNotSay = e.target.value),
      }),
      'Isso vira recomendação e sugestão de cartões.'),
    field('Observação (opcional)', h('input', { type: 'text', onInput: (e) => (notes = e.target.value) })),
    h('div', { class: 'actions' },
      button('Registrar conversa', () => {
        const list = expressions.split('\n').map((e) => e.trim()).filter(Boolean);
        const { awards, log } = ctx.commit((s) => logConversation(s, {
          minutes, context, perceivedDifficulty: difficulty, newExpressions: list, understood, couldNotSay, notes,
        }), { silent: true });
        const gained = awards.filter((a) => a.granted).reduce((n, a) => n + a.event.amount, 0);

        // Expressões anotadas em chinês viram sugestões de cartões direto.
        const chinese = list.filter((e) => /[一-鿿]/.test(e));
        let created = 0;
        if (chinese.length) {
          created = ctx.commit((s) => {
            const { drafts } = generateDrafts(s, chinese.join('\n'), { source: `conversa (${context}) ${formatDateTime(log.at)}` });
            return saveDrafts(s, drafts).length;
          }, { silent: true });
        }
        ctx.render();
        ctx.toast(
          `Conversa registrada${gained ? ` (+${gained} XP)` : ''}` +
          `${created ? `; ${created} sugestão(ões) de cartão criada(s)` : ''}.`,
          'success',
        );
      })));
}

function renderHistoryList(ctx) {
  const { state } = ctx;
  const items = [
    ...state.sessions.map((s) => ({ at: s.at, kind: SESSION_TYPES[s.type] || s.type, detail: `${s.minutes} min ${s.notes ? `· ${s.notes}` : ''}` })),
    ...state.conversations.map((c) => ({
      at: c.at,
      kind: `Conversa (${c.context})`,
      detail: `${c.minutes} min · dificuldade ${c.perceivedDifficulty}/5` +
        (c.couldNotSay ? ` · lacuna: ${c.couldNotSay}` : ''),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);

  return card('Últimos registros',
    items.length
      ? h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Quando'), h('th', {}, 'O quê'), h('th', {}, 'Detalhe'))),
          h('tbody', {}, ...items.map((i) => h('tr', {},
            h('td', {}, formatDateTime(i.at)), h('td', {}, i.kind), h('td', {}, i.detail)))))
      : emptyNote('Nada registrado ainda.'));
}
