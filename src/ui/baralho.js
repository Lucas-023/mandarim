/**
 * Tela do Baralho: o "Anki" dentro do app. Lógica em core/baralho.js e
 * core/fsrs.js; aqui só desenho e teclado (Espaço mostra/Bom, 1–4 notas, Z desfaz).
 */
import { h, card, button, field, badge, bar, emptyNote, formatDate } from './dom.js';
import {
  MODELOS, ORDEM_MODELOS, NOTAS, configBaralho, fila, previsoes, responder, desfazer,
  sincronizarCartoes, precisaSincronizar, suspender, esquecer, salvarConfig, estatisticas,
  liberarNovosHoje, novosExtrasHoje,
} from '../core/baralho.js';
import { incorporarCurso, precisaIncorporarCurso } from '../core/curso.js';
import {
  FILTROS_TREINO, ORIGENS_TREINO, montarTreino, responderTreino, treinoDosErros, salvarTreino, treinoAtual, faltamNoTreino,
} from '../core/treino.js';
import { saveDrafts, editDraft, setDraftStatus, pinyinFor } from '../core/flashcards.js';
import { uid } from '../core/storage.js';
import { speakButton, playAudio, canSpeak } from './audio.js';

const COR = { novos: 'var(--accent-soft)', aprendendo: 'var(--warn)', revisao: 'var(--ok)' };
/** Como o Anki: tempo de resposta acima disso conta como distração, não como esforço. */
const TEMPO_MAX_MS = 60 * 1000;

export function renderBaralho(ctx) {
  // Palavras do curso (e o progresso da antiga aba Vocabulário) entram no baralho.
  if (precisaIncorporarCurso(ctx.state)) {
    const rel = ctx.commit((s) => incorporarCurso(s), { silent: true });
    avisarIncorporacao(ctx, rel);
  }
  // Rascunho aprovado em outra tela ainda sem cartão: cria antes de desenhar.
  if (precisaSincronizar(ctx.state)) ctx.commit((s) => sincronizarCartoes(s), { silent: true });
  const modo = ctx.params.modo || 'inicio';
  if (modo === 'estudar') return renderEstudo(ctx);
  if (modo === 'treino') return renderTreino(ctx);
  if (modo === 'navegar') return renderNavegador(ctx);
  if (modo === 'adicionar') return renderAdicionar(ctx);
  return renderInicio(ctx);
}

/** Conta o que a incorporação do curso fez (só quando fez algo visível). */
export function avisarIncorporacao(ctx, rel) {
  if (!rel) return;
  const partes = [];
  if (rel.jaSabidos) partes.push(`${rel.jaSabidos} cartões das lições do curso entraram como já sabidos, espalhados pelas próximas duas semanas`);
  if (rel.migrados) partes.push(`${rel.migrados} trouxeram o progresso da aba Vocabulário`);
  if (rel.novos) partes.push(`${rel.novos} cartões novos do curso`);
  if (rel.pacotesAprovados) partes.push(`${rel.pacotesAprovados} cartões de pacotes que estavam esperando aprovação entraram como novos`);
  if (partes.length) ctx.toast(`Baralho unificado: ${partes.join('; ')}.`, 'success');
}

function contagens(c, destaque = null) {
  const item = (chave, rotulo) => h('span', {
    class: 'baralho-conta', style: `color:${COR[chave]};${destaque === chave ? 'text-decoration:underline;' : ''}`,
    title: rotulo,
  }, String(c[chave]));
  return h('div', { class: 'baralho-contas' }, item('novos', 'novos'), item('aprendendo', 'aprendendo'), item('revisao', 'para revisar'));
}

function hora(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------- início

function renderInicio(ctx) {
  const { state } = ctx;
  const wrap = h('div', { class: 'stack' });
  const f = fila(state);
  const est = estatisticas(state);
  const pendentes = state.cardDrafts.filter((d) => d.status === 'pending').length;

  const temAlgo = Boolean(f.proximo);
  wrap.append(card('Baralho',
    h('p', { class: 'hint' }, 'Novos · aprendendo · para revisar hoje'),
    contagens(f.contagem),
    est.total === 0
      ? h('div', { class: 'callout' },
          'O baralho está vazio. Ele se enche com as palavras do curso, com o que chega no pacote do dia ',
          'e com os cartões que você aprova em "Criar cartões" ou adiciona aqui.')
      : null,
    !temAlgo && est.total > 0
      ? h('p', {}, f.espera
          ? `Por agora acabou. Um cartão em aprendizado volta às ${hora(f.espera)}.`
          : 'Tudo em dia por hoje. 加油！')
      : null,
    h('div', { class: 'actions' },
      button('Estudar agora', () => ctx.go('deck', { modo: 'estudar' }), { disabled: !temAlgo }),
      button('Adicionar cartão', () => ctx.go('deck', { modo: 'adicionar' }), { kind: 'secondary' }),
      button('Navegar cartões', () => ctx.go('deck', { modo: 'navegar' }), { kind: 'secondary' })),
    pendentes
      ? h('p', { class: 'hint' }, `${pendentes} cartão(ões) aguardando sua aprovação. `,
          h('button', { class: 'link', onClick: () => ctx.go('cards') }, 'Revisar e aprovar'),
          ' — só entram no baralho depois de aprovados.')
      : null,
    ctx.ui.foco ? h('div', { class: 'actions' }, button('Abrir o app completo', () => ctx.go('dashboard'), { kind: 'ghost' })) : null));

  wrap.append(renderIntensivo(ctx));
  wrap.append(renderEstatisticas(est));
  wrap.append(renderOpcoes(ctx));
  return wrap;
}

function renderEstatisticas(est) {
  const stat = (valor, rotulo) => h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(valor)), h('span', { class: 'stat-label' }, rotulo));
  const maxPrev = Math.max(1, ...est.previsao.map((p) => p.n));
  return card('Estatísticas',
    h('div', { class: 'stats' },
      stat(est.respondidosHoje, 'respondidos hoje'),
      stat(est.respondidosHoje ? `${Math.round((1 - est.errosHoje / est.respondidosHoje) * 100)}%` : '—', 'acertos hoje'),
      stat(`${est.minutosHoje} min`, 'tempo hoje'),
      stat(est.retencaoPeriodo == null ? '—' : `${Math.round(est.retencaoPeriodo * 100)}%`, `retenção (${est.dias} d)`)),
    h('p', { class: 'hint' },
      est.retencaoPeriodo == null
        ? 'Retenção aparece quando houver revisões de cartões já formados.'
        : `Retenção = revisões de cartões formados em que você não errou, nos últimos ${est.dias} dias ` +
          `(${est.revisoesPeriodo} revisões). Mede memória dos cartões, não proficiência.`),
    h('div', { class: 'stats' },
      stat(est.novos, 'cartões novos'), stat(est.aprendendo, 'aprendendo'),
      stat(est.jovens, 'jovens (< 21 d)'), stat(est.maduros, 'maduros (≥ 21 d)'),
      est.suspensos ? stat(est.suspensos, 'suspensos') : null,
      est.sanguessugas ? stat(est.sanguessugas, 'problemáticos') : null),
    h('h4', {}, 'Revisões previstas'),
    ...est.previsao.map((p, i) => h('div', { class: 'previsao-linha' },
      h('span', { class: 'previsao-dia' }, i === 0 ? 'hoje' : i === 1 ? 'amanhã' : formatDate(`${p.dia}T12:00:00`).slice(0, 5)),
      bar((p.n / maxPrev) * 100), h('span', { class: 'previsao-n' }, String(p.n)))));
}

function renderOpcoes(ctx) {
  const cfg = configBaralho(ctx.state);
  const rascunho = { ...cfg, modelos: { ...cfg.modelos } };
  const numero = (chave, min, max) => h('input', {
    type: 'number', min, max, value: cfg[chave], inputmode: 'numeric',
    onInput: (e) => { rascunho[chave] = Number(e.target.value); },
  });
  const passos = (chave) => h('input', {
    type: 'text', value: cfg[chave].join(' '), inputmode: 'numeric',
    onInput: (e) => { rascunho[chave] = e.target.value.split(/[\s,]+/).map(Number).filter((n) => n > 0); },
  });
  return h('details', { class: 'card' },
    h('summary', {}, h('strong', {}, 'Opções do baralho')),
    field('Cartões novos por dia', numero('novosPorDia', 0, 200), 'Cada palavra nova vira até 3 cartões, um por dia. 10–20 é sustentável.'),
    field('Máximo de revisões por dia', numero('revisoesPorDia', 10, 9999)),
    field('Retenção desejada',
      h('select', { onChange: (e) => { rascunho.retencaoDesejada = Number(e.target.value); } },
        ...[0.8, 0.85, 0.9, 0.93, 0.95].map((v) => h('option', { value: v, selected: v === cfg.retencaoDesejada },
          `${Math.round(v * 100)}%${v === 0.9 ? ' (padrão do Anki)' : ''}`))),
      'Mais alta = intervalos menores e mais revisões por dia. O algoritmo é o FSRS, o mesmo do Anki.'),
    field('Passos de aprendizado (minutos)', passos('passos')),
    field('Passos de reaprendizado (minutos)', passos('passosReaprender')),
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Tipos de cartão'),
      ...ORDEM_MODELOS.map((m) => h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: cfg.modelos[m], onChange: (e) => { rascunho.modelos[m] = e.target.checked; } }),
        ` ${MODELOS[m].nome} (${MODELOS[m].descricao})`,
        m === 'ouvir' && !canSpeak() ? ' — este navegador não tem voz em chinês' : '')),
      h('small', { class: 'hint' }, 'Desligar um tipo esconde esses cartões sem apagar o histórico deles.')),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: cfg.irmaosNoMesmoDia, onChange: (e) => { rascunho.irmaosNoMesmoDia = e.target.checked; } }),
      ' Reconhecer e produzir da mesma palavra podem sair no mesmo dia'),
    h('small', { class: 'hint' }, 'Desligado (padrão, como o Anki), o "produzir" espera o dia seguinte ao "reconhecer". Ligue num intensivo.'),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: cfg.pacoteDireto, onChange: (e) => { rascunho.pacoteDireto = e.target.checked; } }),
      ' Palavras e frases do pacote do dia entram direto no baralho'),
    h('small', { class: 'hint' }, 'Entram como cartões novos. Tradução e pinyin vêm do modelo de linguagem: se algum estiver errado, ',
      'corrija em "Navegar cartões". Desligado, elas esperam aprovação em "Criar cartões".'),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: cfg.audioAoMostrar, onChange: (e) => { rascunho.audioAoMostrar = e.target.checked; } }),
      ' Tocar o áudio ao mostrar a resposta'),
    h('div', { class: 'actions' },
      button('Salvar opções', () => {
        if (!rascunho.passos.length) rascunho.passos = [...cfg.passos];
        ctx.commit((s) => {
          salvarConfig(s, rascunho);
          sincronizarCartoes(s);
        });
        ctx.toast('Opções do baralho salvas.', 'success');
      })));
}

// ---------------------------------------------------------------- estudo

function exemplo(r) {
  if (!r.example) return null;
  return h('div', { class: 'baralho-exemplo' },
    h('span', { class: 'mono-zh' }, r.example), ' ',
    canSpeak() ? speakButton(r.example, { label: '▶', kind: 'ghost' }) : null,
    r.exampleTranslation ? h('div', { class: 'hint' }, r.exampleTranslation) : null);
}

function frente(cartao, r) {
  if (cartao.modelo === 'produzir') {
    return h('div', { class: 'baralho-frente' },
      h('div', { class: 'baralho-texto' }, r.back),
      r.context ? h('div', { class: 'hint' }, r.context) : null,
      h('div', { class: 'hint' }, 'Como se diz em chinês? Diga em voz alta antes de virar.'));
  }
  if (cartao.modelo === 'ouvir') {
    return h('div', { class: 'baralho-frente' },
      canSpeak()
        ? h('div', { class: 'actions audio-row' },
            speakButton(r.front, { label: '▶ Ouvir', kind: 'primary' }),
            speakButton(r.front, { label: '🐢 Devagar', rate: 0.7 }))
        : h('p', { class: 'hint' }, 'Sem voz em chinês neste navegador: desligue o tipo "Ouvir" nas opções.'),
      h('div', { class: 'hint' }, 'O que significa?'));
  }
  return h('div', { class: 'baralho-frente' },
    h('div', { class: 'mono-zh baralho-hanzi' }, r.front),
    canSpeak() ? speakButton(r.front, { label: '▶', kind: 'ghost' }) : null);
}

function verso(cartao, r) {
  return h('div', { class: 'baralho-verso' },
    h('div', { class: 'mono-zh baralho-hanzi' }, r.front),
    r.pinyin ? h('div', { class: 'baralho-pinyin' }, r.pinyin) : null,
    h('div', { class: 'baralho-texto' }, r.back),
    canSpeak() ? h('div', { class: 'actions audio-row' },
      speakButton(r.front, { label: '▶ Ouvir' }), speakButton(r.front, { label: '🐢 Devagar', rate: 0.7, kind: 'ghost' })) : null,
    r.usageNote ? h('div', { class: 'baralho-exemplo' }, r.usageNote) : null,
    exemplo(r),
    r.context && cartao.modelo !== 'produzir' ? h('div', { class: 'hint' }, r.context) : null,
    cartao.sanguessuga
      ? h('div', { class: 'callout' }, 'Cartão problemático: você já errou este muitas vezes. Mais repetição raramente ',
          'resolve — vale reescrever (Navegar → Editar) com um exemplo que tenha a ver com você.')
      : null);
}

function renderEstudo(ctx) {
  const { state, ui } = ctx;
  const f = fila(state);
  const wrap = h('div', { class: 'stack' });
  const ultima = state.deck?.registro?.at(-1);
  const podeDesfazer = Boolean(ultima?.anterior);
  const acaoDesfazer = () => {
    const desfeita = ctx.commit((s) => desfazer(s), { silent: true });
    if (desfeita) {
      ui.baralho = { cartaoId: desfeita.cartaoId, resposta: false, inicio: Date.now() };
      ctx.toast('Última resposta desfeita.', 'info');
    }
    ctx.render();
  };

  if (!f.proximo) {
    ui.keyHandler = (e) => { if ((e.key === 'z' || e.key === 'Z') && podeDesfazer) acaoDesfazer(); };
    const est = estatisticas(state);
    wrap.append(card(f.espera ? 'Pausa' : 'Terminou por hoje 🎉',
      h('p', {}, f.espera
        ? `Os cartões em aprendizado voltam às ${hora(f.espera)}. Pode fechar o app: o progresso está salvo.`
        : `${est.respondidosHoje} resposta(s) hoje. Amanhã tem mais — a revisão de amanhã já está agendada.`),
      f.irmaosEsperando
        ? h('div', { class: 'callout' },
            `${f.irmaosEsperando} cartão(ões) da outra direção estão esperando amanhã, porque a mesma palavra já saiu hoje. `,
            button('Liberar hoje', () => {
              ctx.commit((s) => salvarConfig(s, { irmaosNoMesmoDia: true }), { silent: true });
              ctx.toast('Agora reconhecer e produzir da mesma palavra podem sair no mesmo dia (dá para desligar nas Opções).', 'success');
              ctx.render();
            }))
        : null,
      h('div', { class: 'actions' },
        button('Treino livre do que vi hoje', () => iniciarTreino(ctx, { quais: 'hoje', origem: 'todas', direcao: 'misturado' })),
        button('+10 novos hoje', () => maisNovos(ctx), { kind: 'secondary' }),
        button('Voltar ao baralho', () => ctx.go('deck'), { kind: 'ghost' }),
        podeDesfazer ? button('Desfazer última', acaoDesfazer, { kind: 'ghost' }) : null)),
      h('p', { class: 'hint' }, 'Quer mais? O treino livre repete à vontade sem mexer no agendamento; "+10 novos" traz cartões novos para hoje.'));
    return wrap;
  }

  const { proximo: cartao, rascunho: r } = f;
  if (!ui.baralho || ui.baralho.cartaoId !== cartao.id) ui.baralho = { cartaoId: cartao.id, resposta: false, inicio: Date.now() };
  const atual = ui.baralho;
  const cfg = configBaralho(state);
  const destaque = cartao.estado === 'novo' ? 'novos' : cartao.estado === 'revisao' ? 'revisao' : 'aprendendo';

  const mostrar = () => {
    atual.resposta = true;
    // Tocar dentro do toque: o iPhone só libera som que nasce de um gesto.
    if (canSpeak() && cfg.audioAoMostrar) playAudio(r.front);
    ctx.render();
  };
  const responderCom = (nota) => {
    const duracaoMs = Math.min(TEMPO_MAX_MS, Date.now() - atual.inicio);
    const res = ctx.commit((s) => responder(s, cartao.id, nota, { duracaoMs }), { silent: true });
    if (res?.xp?.granted) ctx.toast(`Sessão de revisão: +${res.xp.event.amount} XP`, 'success');
    if (res?.cartao?.sanguessuga && !cartao.sanguessuga) ctx.toast('Este cartão virou problemático: considere reescrevê-lo.', 'warn');
    ui.baralho = null;
    ctx.render();
  };

  ui.keyHandler = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault?.();
      if (!atual.resposta) mostrar();
      else responderCom(3);
    } else if (atual.resposta && ['1', '2', '3', '4'].includes(e.key)) {
      responderCom(Number(e.key));
    } else if ((e.key === 'z' || e.key === 'Z') && podeDesfazer) {
      acaoDesfazer();
    }
  };

  const prev = atual.resposta ? previsoes(cartao, cfg) : null;
  wrap.append(h('section', { class: 'card baralho-cartao' },
    h('div', { class: 'baralho-topo' },
      contagens(f.contagem, destaque),
      h('span', { class: 'hint' }, `${MODELOS[cartao.modelo].nome}`, cartao.sanguessuga ? ' · ' : '', cartao.sanguessuga ? badge('problemático', 'warn') : '')),
    atual.resposta ? verso(cartao, r) : frente(cartao, r),
    atual.resposta
      ? h('div', { class: 'baralho-notas' },
          ...[1, 2, 3, 4].map((n) => h('button', {
            class: `btn baralho-nota baralho-nota-${n}`, onClick: () => responderCom(n), title: `Tecla ${n}`,
          }, h('span', { class: 'baralho-nota-int' }, prev[n]), h('span', {}, NOTAS[n]))))
      : h('div', { class: 'actions' }, button('Mostrar resposta', mostrar)),
    h('div', { class: 'actions' },
      podeDesfazer ? button('↶ Desfazer', acaoDesfazer, { kind: 'ghost', title: 'Tecla Z' }) : null,
      button('Sair', () => { ui.baralho = null; ctx.go('deck'); }, { kind: 'ghost' }))));
  wrap.append(h('p', { class: 'hint' },
    'Seja honesto na nota: "Bom" é lembrar sem ajuda, "Difícil" é lembrar com esforço, "Errei" é qualquer outra coisa. ',
    'Atalhos: Espaço mostra a resposta (e depois vale "Bom"), 1–4 dão a nota, Z desfaz.'));
  return wrap;
}

// ---------------------------------------------------------------- intensivo e treino livre

function maisNovos(ctx) {
  const total = ctx.commit((s) => liberarNovosHoje(s, 10), { silent: true });
  ctx.toast(`+10 cartões novos liberados hoje (${total} a mais que o normal).`, 'success');
  ctx.go('deck', { modo: 'estudar' });
  ctx.render();
}

function iniciarTreino(ctx, escolha) {
  const treino = montarTreino(ctx.state, escolha);
  if (!treino.total) {
    const msg = { dificeis: 'Nenhum cartão errado ainda. 👏', hoje: 'Você ainda não estudou nenhum cartão hoje.' }[escolha.quais];
    ctx.toast(msg || 'Nenhum cartão com esse filtro.', 'info');
    return;
  }
  ctx.ui.treinoVirado = null;
  ctx.commit((s) => salvarTreino(s, { ...treino, escolha }), { silent: true });
  ctx.go('deck', { modo: 'treino' });
  ctx.render();
}

function renderIntensivo(ctx) {
  const extras = novosExtrasHoje(ctx.state);
  const andamento = treinoAtual(ctx.state);
  const escolha = { quais: 'todas', origem: 'todas', direcao: 'misturado' };
  const opcao = (chave, valores) => h('select', { onChange: (e) => { escolha[chave] = e.target.value; } },
    ...valores.map(([v, rotulo]) => h('option', { value: v, selected: v === escolha[chave] }, rotulo)));
  const emAndamento = andamento?.fila?.length;
  return card('Treino livre e intensivo',
    h('p', {}, h('strong', {}, 'Treino livre. '),
      'Passa pelos cartões quantas vezes quiser, embaralhados; o que você errar volta até acertar. ',
      'Não mexe no agendamento: pode repetir à vontade, durante o dia, sem bagunçar as revisões.'),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Quais cartões'), opcao('quais', Object.entries(FILTROS_TREINO))),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'De onde'), opcao('origem', Object.entries(ORIGENS_TREINO))),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Direção'),
      opcao('direcao', [['misturado', 'Misturado'], ['reconhecer', '汉字 → português'], ['produzir', 'português → 汉字']])),
    emAndamento
      ? h('div', { class: 'callout' },
          `Treino livre em andamento: faltam ${faltamNoTreino(andamento)} de ${andamento.total}. `,
          button('Continuar treino', () => ctx.go('deck', { modo: 'treino' })))
      : null,
    h('div', { class: 'actions' },
      button(emAndamento ? 'Começar outro treino' : 'Começar treino livre', () => iniciarTreino(ctx, escolha),
        { kind: emAndamento ? 'secondary' : 'primary' })),
    h('p', {}, h('strong', {}, 'Mais cartões novos hoje. '),
      'Libera 10 cartões novos além do limite, só hoje. Eles entram no agendamento normal.',
      extras ? ` Hoje você já liberou ${extras} a mais.` : ''),
    h('div', { class: 'actions' }, button('+10 novos hoje', () => maisNovos(ctx), { kind: 'secondary' })));
}

function renderTreino(ctx) {
  const { ui, state } = ctx;
  const t = treinoAtual(state);
  const encerrar = () => {
    ui.treinoVirado = null;
    ctx.commit((s) => salvarTreino(s, null), { silent: true });
    ctx.go('deck');
  };
  const wrap = h('div', { class: 'stack' });
  if (!t) {
    ui.keyHandler = null;
    wrap.append(card('Treino livre', h('p', {}, 'Nenhum treino em andamento.'),
      h('div', { class: 'actions' }, button('Voltar ao baralho', () => ctx.go('deck')))));
    return wrap;
  }
  const rascunhos = new Map(state.cardDrafts.map((d) => [d.id, d]));

  if (!t.fila.length) {
    ui.keyHandler = null;
    const pct = t.total ? Math.round((t.acertosDePrimeira / t.total) * 100) : 0;
    wrap.append(card('Treino concluído 🎉',
      h('p', {}, `${t.total} cartão(ões), ${t.acertosDePrimeira} de primeira (${pct}%), ${t.respondidas} respostas no total.`),
      t.erradas.length
        ? h('p', {}, 'Errou alguma vez: ', ...t.erradas.map((x) => h('span', { class: 'mono-zh' }, `${rascunhos.get(x.draftId)?.front || '?'} `)))
        : h('p', {}, 'Nenhum erro. 太棒了！'),
      h('div', { class: 'actions' },
        t.erradas.length ? button('Treinar só os que errei', () => {
          ctx.commit((s) => salvarTreino(s, { ...treinoDosErros(t), escolha: t.escolha }), { silent: true });
          ctx.render();
        }) : null,
        button('De novo, tudo', () => iniciarTreino(ctx, t.escolha || {}), { kind: t.erradas.length ? 'secondary' : 'primary' }),
        button('Voltar ao baralho', encerrar, { kind: 'ghost' }))));
    return wrap;
  }

  const atual = t.fila[0];
  const r = rascunhos.get(atual.draftId);
  const cartao = { modelo: atual.modelo };
  const cfg = configBaralho(state);
  // "Virado" fica só na tela, preso à resposta da vez: recarregar volta a frente do cartão.
  const virado = ui.treinoVirado === t.respondidas;
  const mostrar = () => {
    ui.treinoVirado = t.respondidas;
    if (canSpeak() && cfg.audioAoMostrar) playAudio(r.front);
    ctx.render();
  };
  const marcar = (acertou) => {
    ctx.commit((s) => responderTreino(treinoAtual(s), acertou), { silent: true });
    ui.treinoVirado = null;
    ctx.render();
  };
  ui.keyHandler = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault?.();
      if (!virado) mostrar(); else marcar(true);
    } else if (virado && e.key === '1') marcar(false);
    else if (virado && (e.key === '2' || e.key === '3' || e.key === '4')) marcar(true);
  };

  const feitas = t.total - faltamNoTreino(t);
  wrap.append(h('section', { class: 'card baralho-cartao' },
    h('div', { class: 'baralho-topo' },
      h('span', { class: 'hint' }, `Treino livre · ${feitas}/${t.total} · ${t.respondidas} respostas`),
      h('span', { class: 'hint' }, MODELOS[atual.modelo]?.nome || '')),
    bar((feitas / t.total) * 100),
    virado ? verso(cartao, r) : frente(cartao, r),
    virado
      ? h('div', { class: 'baralho-notas' },
          h('button', { class: 'btn baralho-nota baralho-nota-1', onClick: () => marcar(false), title: 'Tecla 1' },
            h('span', { class: 'baralho-nota-int' }, 'volta já'), h('span', {}, 'Errei')),
          h('button', { class: 'btn baralho-nota baralho-nota-3', onClick: () => marcar(true), title: 'Espaço' },
            h('span', { class: 'baralho-nota-int' }, 'sai da fila'), h('span', {}, 'Acertei')))
      : h('div', { class: 'actions' }, button('Mostrar resposta', mostrar)),
    h('div', { class: 'actions' }, button('Parar', encerrar, { kind: 'ghost', title: 'Encerra e descarta este treino' }))));
  wrap.append(h('p', { class: 'hint' },
    'Treino livre não mexe no agendamento. Atalhos: Espaço mostra (e depois vale "Acertei"), 1 = Errei.'));
  return wrap;
}

// ---------------------------------------------------------------- navegador

function descreverCartao(c) {
  if (c.suspenso) return 'suspenso';
  if (c.estado === 'novo') return 'novo';
  if (c.estado !== 'revisao') return `aprendendo · volta ${hora(c.due)}`;
  return `${c.intervaloDias} d · próxima ${formatDate(c.due)}${c.lapsos ? ` · ${c.lapsos} erro(s)` : ''}`;
}

function renderNavegador(ctx) {
  const { state, ui } = ctx;
  ui.navegar ||= { busca: '', filtro: 'todos', editando: null };
  const nav = ui.navegar;
  const cartoesPorRascunho = new Map();
  for (const c of state.deck?.cartoes || []) {
    if (!cartoesPorRascunho.has(c.draftId)) cartoesPorRascunho.set(c.draftId, []);
    cartoesPorRascunho.get(c.draftId).push(c);
  }
  const rascunhos = state.cardDrafts.filter((d) => cartoesPorRascunho.has(d.id) && d.status !== 'rejected' && d.status !== 'pending');
  const termo = nav.busca.trim().toLowerCase();
  const filtros = {
    todos: () => true,
    novos: (cs) => cs.some((c) => c.estado === 'novo' && !c.suspenso),
    aprendendo: (cs) => cs.some((c) => (c.estado === 'aprendendo' || c.estado === 'reaprendendo') && !c.suspenso),
    revisao: (cs) => cs.some((c) => c.estado === 'revisao' && !c.suspenso),
    suspensos: (cs) => cs.some((c) => c.suspenso),
    problematicos: (cs) => cs.some((c) => c.sanguessuga),
  };
  const lista = rascunhos
    .filter((d) => !termo || [d.front, d.back, d.pinyin, ...(d.tags || [])].join(' ').toLowerCase().includes(termo))
    .filter((d) => filtros[nav.filtro](cartoesPorRascunho.get(d.id)));

  const wrap = h('div', { class: 'stack' });
  const busca = h('input', { type: 'search', value: nav.busca, placeholder: 'Buscar por 汉字, pinyin, português ou etiqueta' });
  busca.addEventListener('change', (e) => { nav.busca = e.target.value; ctx.render(); });
  wrap.append(card(`Navegar cartões (${lista.length} de ${rascunhos.length})`,
    busca,
    h('div', { class: 'chips' }, ...Object.keys(filtros).map((k) => h('button', {
      class: `chip${nav.filtro === k ? ' chip-on' : ''}`, onClick: () => { nav.filtro = k; ctx.render(); },
    }, k === 'problematicos' ? 'problemáticos' : k === 'revisao' ? 'revisão' : k))),
    h('div', { class: 'actions' }, button('Voltar ao baralho', () => ctx.go('deck'), { kind: 'ghost' }))));

  if (!lista.length) wrap.append(emptyNote('Nenhum cartão com esse filtro.'));
  for (const d of lista.slice(0, 150)) {
    if (nav.editando === d.id) {
      wrap.append(formEdicao(ctx, d));
      continue;
    }
    const cartoes = cartoesPorRascunho.get(d.id).slice().sort((a, b) => ORDEM_MODELOS.indexOf(a.modelo) - ORDEM_MODELOS.indexOf(b.modelo));
    wrap.append(h('section', { class: 'card baralho-item' },
      h('div', {}, h('span', { class: 'mono-zh baralho-item-hz' }, d.front), ' ', h('span', { class: 'baralho-pinyin' }, d.pinyin || ''),
        canSpeak() ? speakButton(d.front, { label: '▶', kind: 'ghost' }) : null),
      h('div', {}, d.back),
      ...cartoes.map((c) => h('div', { class: 'baralho-item-cartao' },
        h('strong', {}, MODELOS[c.modelo].nome), ': ', descreverCartao(c), ' ',
        c.sanguessuga ? badge('problemático', 'warn') : null,
        button(c.suspenso ? 'Reativar' : 'Suspender', () => ctx.commit((s) => suspender(s, c.id, !c.suspenso)), { kind: 'ghost' }),
        c.estado !== 'novo'
          ? button('Esquecer', () => {
              if (!confirm('Voltar este cartão a novo? O agendamento recomeça; o histórico de respostas fica.')) return;
              ctx.commit((s) => esquecer(s, c.id));
            }, { kind: 'ghost' })
          : null)),
      h('div', { class: 'actions' },
        button('Editar', () => { nav.editando = d.id; ctx.render(); }, { kind: 'secondary' }),
        button('Excluir', () => {
          if (!confirm(`Excluir "${d.front}" do baralho? Os cartões e o agendamento dele somem.`)) return;
          ctx.commit((s) => {
            setDraftStatus(s, d.id, 'rejected');
            sincronizarCartoes(s);
          });
          ctx.toast('Cartão excluído do baralho.', 'success');
        }, { kind: 'danger' }))));
  }
  if (lista.length > 150) wrap.append(h('p', { class: 'hint' }, `Mostrando 150 de ${lista.length}. Refine a busca.`));
  return wrap;
}

function camposCartao(valores) {
  const campo = (nome, rotulo, extra = {}) => {
    const el = h(extra.multilinha ? 'textarea' : 'input', { type: 'text', value: valores[nome] || '', rows: 2, ...extra.attrs });
    return { nome, el, linha: field(rotulo, el, extra.dica || '') };
  };
  const lista = [
    campo('front', 'Chinês (汉字)', { attrs: { lang: 'zh-CN', class: 'mono-zh' } }),
    campo('pinyin', 'Pinyin', { dica: 'Em branco: preenchido pelo dicionário do app, quando ele conhece a palavra.' }),
    campo('back', 'Significado em português'),
    campo('example', 'Exemplo em chinês (opcional)', { attrs: { lang: 'zh-CN', class: 'mono-zh' } }),
    campo('exampleTranslation', 'Tradução do exemplo (opcional)'),
    campo('tags', 'Etiquetas (opcional)', { dica: 'Separadas por espaço, ex.: futebol conversa' }),
  ];
  const ler = () => {
    const v = Object.fromEntries(lista.map((c) => [c.nome, c.el.value.trim()]));
    v.tags = v.tags ? v.tags.split(/[\s,]+/).filter(Boolean) : [];
    if (!v.pinyin && v.front) v.pinyin = pinyinFor(v.front) || '';
    return v;
  };
  return { linhas: lista.map((c) => c.linha), ler };
}

function formEdicao(ctx, d) {
  const { linhas, ler } = camposCartao({ ...d, tags: (d.tags || []).join(' ') });
  return card(`Editar ${d.front}`, ...linhas,
    h('div', { class: 'actions' },
      button('Salvar', () => {
        const v = ler();
        if (!v.front || !v.back) return ctx.toast('Chinês e significado são obrigatórios.', 'error');
        ctx.commit((s) => editDraft(s, d.id, v));
        ctx.ui.navegar.editando = null;
        ctx.toast('Cartão atualizado. O agendamento continua o mesmo.', 'success');
        ctx.render();
      }),
      button('Cancelar', () => { ctx.ui.navegar.editando = null; ctx.render(); }, { kind: 'ghost' })));
}

// ---------------------------------------------------------------- adicionar

function renderAdicionar(ctx) {
  const { linhas, ler } = camposCartao({});
  return h('div', { class: 'stack' }, card('Adicionar cartão',
    h('p', { class: 'hint' },
      'Uma ideia por cartão: uma palavra ou uma frase curta que você realmente ouviu ou quer dizer. ',
      'Cada uma vira um cartão por tipo ligado (reconhecer, produzir…).'),
    ...linhas,
    h('div', { class: 'actions' },
      button('Adicionar', () => {
        const v = ler();
        if (!v.front || !v.back) return ctx.toast('Chinês e significado são obrigatórios.', 'error');
        const agora = new Date().toISOString();
        const rascunho = {
          id: uid('card'), status: 'approved', createdAt: agora, source: 'adicionado no baralho',
          template: 'zh_pt', kind: /[\s，。？！]/.test(v.front) || v.front.length > 4 ? 'sentence' : 'word',
          context: v.tags.join(', '), difficulty: 2, duplicate: false, ...v,
        };
        const entrou = ctx.commit((s) => {
          const add = saveDrafts(s, [rascunho]);
          sincronizarCartoes(s);
          return add;
        }, { silent: true });
        if (!entrou.length) {
          ctx.toast(`"${v.front}" já existe nos seus cartões.`, 'error');
          return;
        }
        ctx.toast(`"${v.front}" adicionado ao baralho.`, 'success');
        ctx.render();
      }),
      button('Voltar ao baralho', () => ctx.go('deck'), { kind: 'ghost' }))));
}

/** Resumo para o painel principal. */
export function resumoBaralho(ctx) {
  const { state } = ctx;
  if (!(state.deck?.cartoes || []).length && !state.cardDrafts.some((d) => d.status === 'approved' || d.status === 'exported')) return null;
  const f = fila(state);
  const est = estatisticas(state);
  return card('Baralho',
    contagens(f.contagem),
    h('p', { class: 'hint' }, `${est.respondidosHoje} cartão(ões) respondido(s) hoje · ${est.total} no baralho.`),
    h('div', { class: 'actions' },
      button(f.proximo ? 'Estudar baralho' : 'Abrir baralho', () => ctx.go('deck', f.proximo ? { modo: 'estudar' } : {}),
        { kind: f.proximo ? 'primary' : 'secondary' })));
}

