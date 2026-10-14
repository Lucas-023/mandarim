/**
 * Tela de estudo.
 *
 * O exercício em andamento vive em state.activeSession (persistido), não na
 * memória da aba: fechar o navegador ou derrubar o servidor no meio não perde
 * as respostas já dadas. Ao voltar, a sessão é retomada no mesmo item.
 *
 * Atalhos de teclado: 1–4 escolhem alternativa, Enter envia/continua,
 * P revela o pinyin, Esc sai sem corrigir.
 */
import { h, card, button, bar, badge, emptyNote } from './dom.js';
import {
  buildVocabExercise, buildReadingExercise, buildProductionExercise, buildReviewExercise,
  buildListeningExercise, buildDictationExercise, gradeItem, gradeExercise,
} from '../core/exercises.js';
import { scheduleStats } from '../core/schedule.js';
import { SKILL_BY_ID } from '../core/skills.js';
import { logSession } from '../core/activities.js';
import { latestPack, getPack, packToExercise, markPackStudied } from '../core/packs.js';
import {
  startSession, activeSession, recordAnswer, markSupportUsed, advance, clearSession,
  sessionProgress, isStale, describeSession,
} from '../core/session.js';
import { assessmentStatus, buildWeeklyAssessment, recordAssessment } from '../core/assessment.js';
import { renderPlanCard } from './placement.js';
import { speakButton, playAudio, canSpeak, resetAutoPlay } from './audio.js';

export function renderStudy(ctx) {
  const session = activeSession(ctx.state);
  if (session) return renderRunning(ctx, session);
  if (ctx.ui.lastResult) return renderResult(ctx, ctx.ui.lastResult);
  return renderPicker(ctx);
}

function start(ctx, exercise) {
  resetAutoPlay();
  if (!exercise.items.length) {
    ctx.toast('Não há itens suficientes para montar este exercício.', 'error');
    return;
  }
  ctx.ui.lastResult = null;
  ctx.commit((s) => startSession(s, exercise));
}

function renderPicker(ctx) {
  const { state } = ctx;
  const focusTags = state.plan?.focusTags || [];
  const difficulty = state.plan?.dialogDifficulty || null;
  const wrap = h('div', { class: 'stack' });

  // Atalhos vindos de uma recomendação ou do painel.
  if (!ctx.ui.autostarted) {
    const wanted = ctx.params.exercise;
    if (wanted === 'review') {
      ctx.ui.autostarted = true;
      const exercise = buildReviewExercise(state, { count: 10 });
      if (exercise.items.length) {
        start(ctx, exercise);
        return renderStudy(ctx);
      }
      ctx.toast('Nada devido para revisar agora.', 'info');
    } else if (wanted === 'pack') {
      ctx.ui.autostarted = true;
      const entry = ctx.params.date ? getPack(state, ctx.params.date) : latestPack(state);
      if (entry) {
        start(ctx, packToExercise(entry.pack));
        return renderStudy(ctx);
      }
      ctx.toast('Nenhum pacote disponível para estudar.', 'error');
    } else if (wanted === 'vocab') {
      ctx.ui.autostarted = true;
      const tags = ctx.params.tags ? String(ctx.params.tags).split(',') : focusTags;
      start(ctx, buildVocabExercise(state, { count: 6, tags, difficulty, direction: ctx.params.direction || 'zh_pt' }));
      return renderStudy(ctx);
    } else if (wanted === 'assessment') {
      ctx.ui.autostarted = true;
      const aval = buildWeeklyAssessment(state, { count: 10, withAudio: canSpeak() });
      if (aval.items.length >= 6) {
        start(ctx, aval);
        return renderStudy(ctx);
      }
      ctx.toast('Ainda há poucos itens estudados para montar uma reavaliação com itens novos.', 'warn');
    } else if (wanted === 'listening') {
      ctx.ui.autostarted = true;
      start(ctx, buildListeningExercise(state, { count: 8 }));
      return renderStudy(ctx);
    }
  }
  ctx.ui.autostarted = false;

  const aval = assessmentStatus(state);
  if (aval.due) {
    wrap.append(card('Reavaliação disponível',
      h('p', { class: 'hint' }, `${aval.reason} Itens diferentes dos da última vez.`),
      h('div', { class: 'quick' },
        button('Fazer a reavaliação (10 itens)',
          () => start(ctx, buildWeeklyAssessment(state, { count: 10, withAudio: canSpeak() }))))));
  }

  const sched = scheduleStats(state);
  wrap.append(card('Revisar o que está devido',
    h('p', { class: 'hint' },
      sched.total
        ? `${sched.dueToday} item(ns) devido(s) hoje de ${sched.total} em acompanhamento` +
          `${sched.overdue ? ` · ${sched.overdue} em atraso` : ''}. ` +
          'Os atrasados vêm como recuperação ativa (português → chinês), os demais como reconhecimento.'
        : 'Nada em acompanhamento ainda: o agendamento começa quando você faz exercícios ou recebe um pacote.'),
    h('div', { class: 'quick' },
      button(sched.dueToday ? `Revisar ${Math.min(sched.dueToday, 10)} item(ns)` : 'Nada devido agora',
        () => start(ctx, buildReviewExercise(state, { count: 10 })),
        { kind: 'primary', disabled: !sched.dueToday }),
      canSpeak() && sched.dueToday
        ? button('Revisar de ouvido (áudio → significado)', () => start(ctx, buildListeningExercise(state, { count: 8 })), { kind: 'secondary' })
        : null,
      sched.leeches
        ? h('span', { class: 'hint' }, `${sched.leeches} item(ns) problemático(s): o pacote do dia muda o ângulo deles.`)
        : null)));

  const packEntry = latestPack(state);
  if (packEntry) {
    wrap.append(card('Pacote do dia',
      h('p', { class: 'hint' },
        `Pacote de ${packEntry.pack.date}, focado em ${packEntry.pack.focus.tags.join(', ')} — ` +
        'montado a partir dos seus erros recentes.'),
      h('div', { class: 'quick' },
        button(`Fazer os ${packToExercise(packEntry.pack).items.length} exercícios do pacote`,
          () => start(ctx, packToExercise(packEntry.pack))),
        button('Ver o pacote inteiro', () => ctx.go('pack', { date: packEntry.pack.date }), { kind: 'secondary' }))));
  }

  wrap.append(card('Estudar agora',
    h('p', { class: 'hint' },
      'As respostas aqui geram evidência de proficiência — ao contrário de só visualizar cartões, ' +
      'que conta apenas como atividade.'),
    h('div', { class: 'quick' },
      button('Reconhecimento de vocabulário (chinês → português)',
        () => start(ctx, buildVocabExercise(state, { count: 6, tags: focusTags, difficulty, direction: 'zh_pt' }))),
      button('Recuperação ativa (português → chinês)',
        () => start(ctx, buildVocabExercise(state, { count: 6, tags: focusTags, difficulty, direction: 'pt_zh' })), { kind: 'secondary' }),
      button('Leitura e construção de frases',
        () => start(ctx, buildReadingExercise(state, { count: 4, difficulty })), { kind: 'secondary' }),
      button('Produzir frases (escrita)',
        () => start(ctx, buildProductionExercise(state, { count: 2, tags: focusTags.length ? focusTags : ['conversa', 'futebol'] })), { kind: 'secondary' }))));

  wrap.append(renderListeningCard(ctx));

  wrap.append(card('Vocabulário de futebol',
    h('p', { class: 'hint' }, 'Bloco temático pedido nos seus objetivos.'),
    h('div', { class: 'quick' },
      button('Quiz de futebol (reconhecimento)',
        () => start(ctx, buildVocabExercise(state, { count: 6, tags: ['futebol'], direction: 'zh_pt' })), { kind: 'secondary' }),
      button('Quiz de futebol (produzir)',
        () => start(ctx, buildVocabExercise(state, { count: 6, tags: ['futebol'], direction: 'pt_zh' })), { kind: 'secondary' }))));

  if (state.plan) wrap.append(renderPlanCard(state.plan));

  wrap.append(card('Registrar estudo feito fora do app',
    h('div', { class: 'actions' },
      button('Registrei uma revisão (+10 XP)', () => {
        ctx.commit((s) => logSession(s, { type: 'review_session', minutes: 10, notes: 'Registro rápido pelo painel de estudo' }));
        ctx.toast('Sessão de revisão registrada.', 'success');
      }, { kind: 'ghost' }),
      button('Estudei um diálogo (+15 XP)', () => {
        ctx.commit((s) => logSession(s, { type: 'dialog_study', minutes: 15, notes: 'Registro rápido pelo painel de estudo' }));
        ctx.toast('Estudo de diálogo registrado.', 'success');
      }, { kind: 'ghost' }))));

  return wrap;
}

function renderListeningCard(ctx) {
  const { state } = ctx;
  if (!canSpeak()) {
    return card('Escuta',
      h('p', {}, 'Este navegador não expõe vozes em chinês, então os exercícios de escuta ficam desligados.'),
      h('p', { class: 'hint' },
        'A síntese de voz existe no Chrome, no Edge e no Safari. Em Linux pode ser necessário instalar ' +
        'vozes do sistema (por exemplo, o pacote de voz zh-CN do speech-dispatcher). Enquanto isso, ' +
        '听力 continua marcada como não avaliada e você pode registrar práticas reais de escuta em "Registrar".'),
      h('div', { class: 'actions' }, button('Registrar prática de escuta', () => ctx.go('activities'), { kind: 'secondary' })));
  }
  return card('Escuta (voz sintetizada do navegador)',
    h('p', { class: 'hint' },
      'O áudio é gerado pelo próprio navegador, não é fala natural de um chinês. Serve para treinar ' +
      'reconhecimento de palavra e tom; não substitui ouvir gente real — para isso, grave seus colegas ' +
      'na tela de cartões.'),
    h('div', { class: 'quick' },
      button('Áudio → significado', () => start(ctx, buildListeningExercise(state, { count: 8 }))),
      button('Ditado (ouvir e escrever)', () => start(ctx, buildDictationExercise(state, { count: 6 })), { kind: 'secondary' })));
}

// ───────────────────────── exercício em andamento ─────────────────────────

function renderRunning(ctx, session) {
  const { exercise } = session;
  const index = Math.min(session.index, exercise.items.length - 1);
  const item = exercise.items[index];
  const progress = sessionProgress(session);
  const wrap = h('div', { class: 'stack' });

  wrap.append(h('div', { class: 'card' },
    h('div', { class: 'row between' },
      h('strong', {}, exercise.title),
      h('span', {},
        badge(`${index + 1}/${exercise.items.length}`, 'neutral'), ' ',
        badge('salvo automaticamente', 'ok'))),
    bar(Math.round((progress.answered / progress.total) * 100)),
    exercise.note ? h('small', { class: 'hint' }, exercise.note) : null,
    isStale(session)
      ? h('div', { class: 'callout' },
          'Esta sessão ficou aberta por mais de 48 horas. Você pode continuar, mas talvez prefira começar outra.')
      : null,
    h('div', { class: 'actions' },
      button('Sair e continuar depois', () => {
        ctx.toast('Sessão guardada. Ela estará aqui quando você voltar.', 'success');
        ctx.go('dashboard');
      }, { kind: 'ghost' }),
      button('Descartar sessão', () => {
        ctx.commit((s) => clearSession(s));
        ctx.toast('Sessão descartada. Nenhum desempenho foi registrado.', 'info');
      }, { kind: 'ghost' }))));

  // ---- Feedback do item respondido ----
  if (session.feedback) {
    const g = session.feedback;
    const continuar = () => {
      const answered = Object.keys(session.answers).length;
      if (answered >= exercise.items.length) {
        finish(ctx, session);
      } else {
        ctx.commit((s) => advance(s));
      }
    };
    ctx.ui.keyHandler = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        continuar();
      }
    };
    wrap.append(card(g.correct ? 'Correto' : 'Incorreto',
      h('p', {}, g.detail),
      g.criteria ? h('ul', { class: 'tight' }, ...g.criteria.map((c) => h('li', {}, `${c.met ? '✓' : '✕'} ${c.label}`))) : null,
      item.audio ? h('p', { class: 'mono-zh big' }, item.audio.text) : null,
      item.audio ? h('p', { class: 'hint' }, `${item.audio.pinyin || ''} ${item.audio.pt ? `· ${item.audio.pt}` : ''}`) : null,
      item.audio ? speakButton(item.audio.text, { label: 'Ouvir de novo' }) : null,
      h('div', { class: 'actions' }, button('Continuar (Enter)', continuar))));
    return wrap;
  }

  // ---- Item a responder ----
  const qCard = card(null);
  qCard.append(h('small', { class: 'hint' }, `${SKILL_BY_ID.get(item.skill).pt} · nível ${item.difficulty}`));

  if (item.audio) {
    // Escuta: o texto não aparece antes da resposta, senão vira leitura.
    qCard.append(h('p', { class: 'question' }, item.prompt));
    qCard.append(h('div', { class: 'audio-row' },
      speakButton(item.audio.text, { label: '▶ Ouvir', autoPlay: true, rate: item.audio.rate, autoKey: item.id }),
      speakButton(item.audio.text, { label: '🐢 Mais devagar', rate: 0.7, kind: 'ghost' })));
    qCard.append(h('small', { class: 'hint' }, 'O texto aparece depois que você responder.'));
  } else {
    qCard.append(h('p', { class: 'question' }, item.prompt));
    if (item.promptHz) {
      qCard.append(h('div', { class: 'mono-zh big' }, item.promptHz));
      if (canSpeak()) qCard.append(speakButton(item.promptHz, { label: '🔊 Ouvir', kind: 'ghost' }));
    }
  }

  if (item.pinyin && (item.promptHz || item.audio)) {
    const box = h('div', { class: 'pinyin hidden' }, item.pinyin);
    const btn = button('Mostrar pinyin (P) — registra apoio usado', () => {
      ctx.commit((s) => markSupportUsed(s, item.id), { silent: true });
      box.classList.remove('hidden');
      btn.remove();
    }, { kind: 'ghost' });
    qCard.append(btn, box);
  }

  const answer = (value) => {
    const feedback = gradeItem(item, value);
    ctx.commit((s) => recordAnswer(s, { itemId: item.id, answer: value, feedback }));
  };

  if (item.type === 'open' || item.type === 'dictation') {
    const ta = h('textarea', {
      rows: item.type === 'dictation' ? 2 : 3,
      placeholder: item.type === 'dictation' ? 'Escreva o que você ouviu (caracteres ou pinyin)…' : 'Caracteres ou pinyin…',
    });
    qCard.append(ta);
    if (item.rubric) {
      qCard.append(h('details', {}, h('summary', {}, 'Critérios de correção'),
        h('ul', { class: 'tight' }, ...item.rubric.criteria.map((c) => h('li', {}, c.label)))));
    }
    qCard.append(h('div', { class: 'actions' },
      button('Enviar (Enter)', () => answer(ta.value)),
      button('Não sei', () => answer(''), { kind: 'ghost' })));
    ctx.ui.keyHandler = (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || item.type === 'dictation')) {
        e.preventDefault();
        answer(ta.value);
      } else if (e.key === 'Escape') {
        ctx.go('dashboard');
      }
    };
  } else {
    qCard.append(h('div', { class: 'options' }, ...item.options.map((opt, i) =>
      h('button', { class: 'option', onClick: () => answer(i) },
        h('span', { class: 'option-key' }, String(i + 1)), ' ', opt))));
    qCard.append(h('div', { class: 'actions' }, button('Não sei', () => answer(-1), { kind: 'ghost' })));
    ctx.ui.keyHandler = (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= item.options.length) {
        e.preventDefault();
        answer(n - 1);
      } else if (e.key.toLowerCase() === 'p' && item.pinyin) {
        e.preventDefault();
        ctx.commit((s) => markSupportUsed(s, item.id), { silent: true });
        ctx.toast(`Pinyin: ${item.pinyin}`, 'info');
      } else if (e.key === 'Escape') {
        ctx.go('dashboard');
      } else if (item.audio && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        playAudio(item.audio.text, { rate: item.audio.rate });
      }
    };
  }

  wrap.append(qCard);
  wrap.append(h('p', { class: 'hint' },
    item.type === 'open' || item.type === 'dictation'
      ? 'Atalhos: Ctrl+Enter envia · Esc sai (a sessão fica guardada)'
      : 'Atalhos: 1–4 responde · P mostra pinyin · Esc sai (a sessão fica guardada)'));
  return wrap;
}

function finish(ctx, session) {
  const { exercise } = session;
  const graded = ctx.commit((s) => {
    const out = gradeExercise(s, exercise, session.answers, { supportUsed: session.supportUsed });
    if (exercise.kind === 'pack') markPackStudied(s, exercise.id.replace('pack_', ''), exercise.id);
    if (exercise.kind === 'assessment') recordAssessment(s, { exercise, graded: out });
    clearSession(s);
    return out;
  }, { silent: true });
  ctx.ui.lastResult = graded;
  ctx.render();
}

function renderResult(ctx, graded) {
  const wrap = h('div', { class: 'stack' });
  const r = graded.result;
  wrap.append(card('Exercício concluído',
    h('h3', {}, `${r.correct} de ${r.total} corretos (${Math.round(r.accuracy * 100)}%)`),
    h('p', { class: 'hint' },
      graded.xp.granted
        ? `+${graded.xp.event.amount} XP de atividade. A proficiência foi atualizada a partir das ${r.total} respostas, ` +
          'e os itens treinados foram reagendados para voltar no momento certo.'
        : `XP não concedido: ${graded.xp.reason}.`),
    h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', {}, 'Habilidade'), h('th', {}, 'Resultado'))),
      h('tbody', {}, ...graded.graded.map((g) => h('tr', {},
        h('td', { class: 'mono-zh' }, g.ref),
        h('td', {}, SKILL_BY_ID.get(g.skill).pt),
        h('td', {}, g.correct ? '✓' : '✕'))))),
    h('div', { class: 'actions' },
      button('Fazer outro', () => {
        ctx.ui.lastResult = null;
        ctx.render();
      }),
      button('Voltar ao painel', () => {
        ctx.ui.lastResult = null;
        ctx.go('dashboard');
      }, { kind: 'ghost' }))));

  const missed = graded.graded.filter((g) => !g.correct);
  if (missed.length) {
    wrap.append(card('Itens para revisar',
      h('div', { class: 'chips' }, ...missed.map((g) => h('span', { class: 'chip mono-zh' }, g.ref))),
      h('p', { class: 'hint' },
        'Estes voltaram para o início da fila: o agendador marcou cada um para reaparecer amanhã.')));
  } else {
    wrap.append(emptyNote('Sem erros neste exercício.'));
  }
  return wrap;
}
