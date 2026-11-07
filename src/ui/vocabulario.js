/**
 * Aba Vocabulário: flashcards só com as palavras das lições do curso.
 * Lógica em core/vocabulario.js; o visual reaproveita as classes do Baralho.
 * Teclado: Espaço mostra (e depois vale "Bom"), 1–4 dão a nota, Z desfaz.
 */
import { h, card, button, badge, bar, emptyNote, formatDate } from './dom.js';
import { NOTAS, previsoes } from '../core/baralho.js';
import {
  MODELOS_VOCAB, ORDEM_MODELOS_VOCAB, configVocabulario, salvarConfigVocabulario, filaVocabulario,
  responderVocabulario, desfazerVocabulario, sincronizarVocabulario, precisaSincronizarVocabulario,
  suspenderVocabulario, esquecerVocabulario, estatisticasVocabulario, palavraDe,
  liberarNovosHoje, novosExtrasHoje, montarTreino, responderTreino, treinoDosErros, salvarTreino, treinoAtual,
} from '../core/vocabulario.js';
import { LICOES } from '../core/content/vocabLicoes.js';
import { speakButton, playAudio, canSpeak } from './audio.js';

const COR = { novos: 'var(--accent-soft)', aprendendo: 'var(--warn)', revisao: 'var(--ok)' };
const TEMPO_MAX_MS = 60 * 1000;

export function renderVocabulario(ctx) {
  if (precisaSincronizarVocabulario(ctx.state)) ctx.commit((s) => sincronizarVocabulario(s), { silent: true });
  const modo = ctx.params.modo || 'inicio';
  if (modo === 'estudar') return renderEstudo(ctx);
  if (modo === 'lista') return renderLista(ctx);
  if (modo === 'treino') return renderTreino(ctx);
  return renderInicio(ctx);
}

function contagens(c, destaque = null) {
  const item = (chave, rotulo) => h('span', {
    class: 'baralho-conta', style: `color:${COR[chave]};${destaque === chave ? 'text-decoration:underline;' : ''}`,
    title: rotulo,
  }, String(c[chave]));
  return h('div', { class: 'baralho-contas' }, item('novos', 'novos'), item('aprendendo', 'aprendendo'), item('revisao', 'para revisar'));
}

const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// ---------------------------------------------------------------- início

function renderInicio(ctx) {
  const { state } = ctx;
  const f = filaVocabulario(state);
  const est = estatisticasVocabulario(state);
  const wrap = h('div', { class: 'stack' });

  wrap.append(card('Vocabulário das lições',
    h('p', { class: 'hint' }, `${est.palavras} palavras das lições 1–5. Novos · aprendendo · para revisar hoje`),
    contagens(f.contagem),
    !f.proximo
      ? h('p', {}, f.espera ? `Por agora acabou. Um cartão em aprendizado volta às ${hora(f.espera)}.` : 'Tudo em dia por hoje. 加油！')
      : null,
    h('div', { class: 'actions' },
      button('Estudar agora', () => ctx.go('vocab', { modo: 'estudar' }), { disabled: !f.proximo }),
      button('Ver palavras', () => ctx.go('vocab', { modo: 'lista' }), { kind: 'secondary' }),
      ctx.ui.foco ? button('Abrir o app completo', () => ctx.go('dashboard'), { kind: 'ghost' }) : null)));

  const stat = (valor, rotulo) => h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(valor)), h('span', { class: 'stat-label' }, rotulo));
  wrap.append(card('Progresso por lição',
    ...est.porLicao.map((l) => h('div', { class: 'previsao-linha' },
      h('span', { class: 'previsao-dia' }, `Lição ${l.numero}`),
      bar((l.vistas / l.total) * 100),
      h('span', { class: 'previsao-n' }, `${l.vistas}/${l.total}`),
      l.ligada ? null : badge('desligada', 'neutral'))),
    h('p', { class: 'hint' }, 'Barra = palavras que você já estudou ao menos uma vez. ',
      `Firmes (os dois cartões com intervalo de 21 dias ou mais): ${est.porLicao.reduce((t, l) => t + l.firmes, 0)}.`),
    h('div', { class: 'stats' },
      stat(est.respondidosHoje, 'respondidos hoje'),
      stat(est.respondidosHoje ? `${Math.round((1 - est.errosHoje / est.respondidosHoje) * 100)}%` : '—', 'acertos hoje'),
      stat(`${est.minutosHoje} min`, 'tempo hoje'),
      stat(est.retencaoPeriodo == null ? '—' : `${Math.round(est.retencaoPeriodo * 100)}%`, `retenção (${est.dias} d)`)),
    h('p', { class: 'hint' }, 'Mede a memória destes cartões, pela sua própria nota. Não é nota de proficiência.')));

  wrap.append(renderIntensivo(ctx));
  wrap.append(renderOpcoes(ctx));
  return wrap;
}

function maisNovos(ctx) {
  const total = ctx.commit((s) => liberarNovosHoje(s, 10), { silent: true });
  ctx.toast(`+10 cartões novos liberados hoje (${total} a mais que o normal).`, 'success');
  ctx.go('vocab', { modo: 'estudar' });
  ctx.render();
}

function renderIntensivo(ctx) {
  const extras = novosExtrasHoje(ctx.state);
  const andamento = treinoAtual(ctx.state);
  const escolha = { quais: 'todas', direcao: 'misturado' };
  const opcao = (chave, valores) => h('select', { onChange: (e) => { escolha[chave] = e.target.value; } },
    ...valores.map(([v, rotulo]) => h('option', { value: v, selected: v === escolha[chave] }, rotulo)));
  return card('Intensivo',
    h('p', {}, h('strong', {}, 'Mais palavras novas hoje. '),
      'Libera 10 cartões novos além do limite, só hoje. Eles entram no agendamento normal.',
      extras ? ` Hoje você já liberou ${extras} a mais.` : ''),
    h('div', { class: 'actions' }, button('+10 novos hoje', () => maisNovos(ctx), { kind: 'secondary' })),
    h('p', {}, h('strong', {}, 'Treino livre. '),
      'Passa pelos cartões quantas vezes quiser, embaralhados; o que você errar volta até acertar. ',
      'Não mexe no agendamento: pode repetir à vontade sem bagunçar as revisões.'),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Quais palavras'),
      opcao('quais', [['todas', 'Todas das lições ligadas'], ['estudadas', 'Só as que já estudei'], ['dificeis', 'Só as que já errei']])),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Direção'),
      opcao('direcao', [['misturado', 'Misturado'], ['reconhecer', '汉字 → português'], ['produzir', 'português → 汉字']])),
    andamento?.fila?.length
      ? h('div', { class: 'callout' },
          `Treino livre em andamento: faltam ${new Set(andamento.fila.map((x) => `${x.palavra}:${x.modelo}`)).size} de ${andamento.total}. `,
          button('Continuar treino', () => ctx.go('vocab', { modo: 'treino' })))
      : null,
    h('div', { class: 'actions' }, button(andamento?.fila?.length ? 'Começar outro treino' : 'Começar treino livre', () => iniciarTreino(ctx, escolha),
      { kind: andamento?.fila?.length ? 'secondary' : 'primary' })));
}

function iniciarTreino(ctx, escolha) {
  const treino = montarTreino(ctx.state, escolha);
  if (!treino.total) {
    ctx.toast(escolha.quais === 'dificeis' ? 'Nenhuma palavra errada ainda. 👏' : 'Nenhuma palavra com esse filtro.', 'info');
    return;
  }
  ctx.ui.treinoVirado = null;
  ctx.commit((s) => salvarTreino(s, { ...treino, escolha }), { silent: true });
  ctx.go('vocab', { modo: 'treino' });
  ctx.render();
}

function renderOpcoes(ctx) {
  const cfg = configVocabulario(ctx.state);
  const rascunho = {
    novosPorDia: cfg.novosPorDia, modelos: { ...cfg.modelos }, licoes: new Set(cfg.licoes),
    audioAoMostrar: cfg.audioAoMostrar, irmaosNoMesmoDia: cfg.irmaosNoMesmoDia,
  };
  return h('details', { class: 'card' },
    h('summary', {}, h('strong', {}, 'Opções')),
    h('label', { class: 'field' },
      h('span', { class: 'field-label' }, 'Cartões novos por dia'),
      h('input', { type: 'number', min: 0, max: 200, value: cfg.novosPorDia, inputmode: 'numeric', onInput: (e) => { rascunho.novosPorDia = Number(e.target.value); } }),
      h('small', { class: 'hint' }, 'Cada palavra tem dois cartões (reconhecer e produzir), em dias diferentes.')),
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Lições'),
      ...LICOES.map((l) => h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: cfg.licoes.includes(l.numero), onChange: (e) => { if (e.target.checked) rascunho.licoes.add(l.numero); else rascunho.licoes.delete(l.numero); } }),
        ` Lição ${l.numero} — ${l.titulo} (${l.palavras.length})`)),
      h('small', { class: 'hint' }, 'Desligar uma lição esconde os cartões dela sem perder o progresso.')),
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'Tipos de cartão'),
      ...ORDEM_MODELOS_VOCAB.map((m) => h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: cfg.modelos[m], onChange: (e) => { rascunho.modelos[m] = e.target.checked; } }),
        ` ${MODELOS_VOCAB[m].nome} (${MODELOS_VOCAB[m].descricao})`))),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: cfg.irmaosNoMesmoDia, onChange: (e) => { rascunho.irmaosNoMesmoDia = e.target.checked; } }),
      ' Reconhecer e produzir da mesma palavra podem sair no mesmo dia'),
    h('small', { class: 'hint' }, 'Desligado (padrão), o "produzir" de uma palavra espera o dia seguinte ao "reconhecer". Ligue num intensivo.'),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: cfg.audioAoMostrar, onChange: (e) => { rascunho.audioAoMostrar = e.target.checked; } }),
      ' Tocar o áudio ao mostrar a resposta'),
    h('div', { class: 'actions' },
      button('Salvar opções', () => {
        ctx.commit((s) => salvarConfigVocabulario(s, {
          ...rascunho,
          licoes: LICOES.map((l) => l.numero).filter((n) => rascunho.licoes.has(n)),
        }));
        ctx.toast('Opções salvas.', 'success');
      })));
}

// ---------------------------------------------------------------- estudo

function frente(cartao, p) {
  if (cartao.modelo === 'produzir') {
    return h('div', { class: 'baralho-frente' },
      h('div', { class: 'baralho-texto' }, p.pt),
      h('div', { class: 'hint' }, 'Como se diz em chinês? Diga em voz alta antes de virar.'));
  }
  return h('div', { class: 'baralho-frente' },
    h('div', { class: 'mono-zh baralho-hanzi' }, p.hanzi),
    canSpeak() ? speakButton(p.hanzi, { label: '▶', kind: 'ghost' }) : null);
}

function verso(p) {
  return h('div', { class: 'baralho-verso' },
    h('div', { class: 'mono-zh baralho-hanzi' }, p.hanzi),
    h('div', { class: 'baralho-pinyin' }, p.pinyin),
    h('div', { class: 'baralho-texto' }, p.pt),
    p.nota ? h('div', { class: 'baralho-exemplo' }, p.nota) : null,
    canSpeak() ? h('div', { class: 'actions audio-row' },
      speakButton(p.hanzi, { label: '▶ Ouvir' }), speakButton(p.hanzi, { label: '🐢 Devagar', rate: 0.7, kind: 'ghost' })) : null,
    h('div', { class: 'hint' }, `Lição ${p.licao}`));
}

function renderEstudo(ctx) {
  const { state, ui } = ctx;
  const f = filaVocabulario(state);
  const wrap = h('div', { class: 'stack' });
  const podeDesfazer = Boolean(state.vocabulario?.registro?.at(-1)?.anterior);
  const acaoDesfazer = () => {
    const desfeita = ctx.commit((s) => desfazerVocabulario(s), { silent: true });
    if (desfeita) {
      ui.vocab = { cartaoId: desfeita.cartaoId, resposta: false, inicio: Date.now() };
      ctx.toast('Última resposta desfeita.', 'info');
    }
    ctx.render();
  };

  if (!f.proximo) {
    ui.keyHandler = (e) => { if ((e.key === 'z' || e.key === 'Z') && podeDesfazer) acaoDesfazer(); };
    const est = estatisticasVocabulario(state);
    wrap.append(card(f.espera ? 'Pausa' : 'Terminou por hoje 🎉',
      h('p', {}, f.espera
        ? `Os cartões em aprendizado voltam às ${hora(f.espera)}. Pode fechar o app: o progresso está salvo.`
        : `${est.respondidosHoje} resposta(s) hoje. A revisão de amanhã já está agendada.`),
      f.irmaosEsperando
        ? h('div', { class: 'callout' },
            `${f.irmaosEsperando} cartão(ões) da outra direção estão esperando amanhã, porque a mesma palavra já saiu hoje. `,
            button('Liberar hoje', () => {
              ctx.commit((s) => salvarConfigVocabulario(s, { irmaosNoMesmoDia: true }), { silent: true });
              ctx.toast('Agora reconhecer e produzir da mesma palavra podem sair no mesmo dia (dá para desligar nas Opções).', 'success');
              ctx.render();
            }))
        : null,
      h('div', { class: 'actions' },
        button('+10 novos hoje', () => maisNovos(ctx)),
        button('Treino livre', () => iniciarTreino(ctx, { quais: 'estudadas', direcao: 'misturado' }), { kind: 'secondary' }),
        button('Voltar', () => ctx.go('vocab'), { kind: 'ghost' }),
        podeDesfazer ? button('Desfazer última', acaoDesfazer, { kind: 'ghost' }) : null)),
      h('p', { class: 'hint' }, 'Quer continuar? "+10 novos" traz palavras novas; o treino livre repete as que você já viu sem mexer no agendamento.'));
    return wrap;
  }

  const { proximo: cartao, palavra: p } = f;
  if (!ui.vocab || ui.vocab.cartaoId !== cartao.id) ui.vocab = { cartaoId: cartao.id, resposta: false, inicio: Date.now() };
  const atual = ui.vocab;
  const cfg = configVocabulario(state);
  const destaque = cartao.estado === 'novo' ? 'novos' : cartao.estado === 'revisao' ? 'revisao' : 'aprendendo';

  const mostrar = () => {
    atual.resposta = true;
    // Dentro do toque: o iPhone só libera som que nasce de um gesto.
    if (canSpeak() && cfg.audioAoMostrar) playAudio(p.hanzi);
    ctx.render();
  };
  const responderCom = (nota) => {
    const duracaoMs = Math.min(TEMPO_MAX_MS, Date.now() - atual.inicio);
    ctx.commit((s) => responderVocabulario(s, cartao.id, nota, { duracaoMs }), { silent: true });
    ui.vocab = null;
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
      h('span', { class: 'hint' }, MODELOS_VOCAB[cartao.modelo].nome)),
    atual.resposta ? verso(p) : frente(cartao, p),
    atual.resposta
      ? h('div', { class: 'baralho-notas' },
          ...[1, 2, 3, 4].map((n) => h('button', {
            class: `btn baralho-nota baralho-nota-${n}`, onClick: () => responderCom(n), title: `Tecla ${n}`,
          }, h('span', { class: 'baralho-nota-int' }, prev[n]), h('span', {}, NOTAS[n]))))
      : h('div', { class: 'actions' }, button('Mostrar resposta', mostrar)),
    h('div', { class: 'actions' },
      podeDesfazer ? button('↶ Desfazer', acaoDesfazer, { kind: 'ghost', title: 'Tecla Z' }) : null,
      button('Sair', () => { ui.vocab = null; ctx.go('vocab'); }, { kind: 'ghost' }))));
  wrap.append(h('p', { class: 'hint' },
    '"Bom" é lembrar sem ajuda, "Difícil" é lembrar com esforço, "Errei" é qualquer outra coisa. ',
    'Atalhos: Espaço mostra a resposta (e depois vale "Bom"), 1–4 dão a nota, Z desfaz.'));
  return wrap;
}

// ---------------------------------------------------------------- lista

function descrever(c) {
  if (c.suspenso) return 'suspenso';
  if (c.estado === 'novo') return 'novo';
  if (c.estado !== 'revisao') return `aprendendo · volta ${hora(c.due)}`;
  return `${c.intervaloDias} d · próxima ${formatDate(c.due)}${c.lapsos ? ` · ${c.lapsos} erro(s)` : ''}`;
}

function renderLista(ctx) {
  const { state } = ctx;
  const porPalavra = new Map();
  for (const c of state.vocabulario?.cartoes || []) {
    if (!porPalavra.has(c.palavra)) porPalavra.set(c.palavra, []);
    porPalavra.get(c.palavra).push(c);
  }
  const wrap = h('div', { class: 'stack' });
  wrap.append(h('div', { class: 'actions' }, button('Voltar', () => ctx.go('vocab'), { kind: 'ghost' })));
  for (const l of LICOES) {
    const linhas = l.palavras.map((p) => {
      const cartoes = (porPalavra.get(p.hanzi) || []).slice()
        .sort((a, b) => ORDEM_MODELOS_VOCAB.indexOf(a.modelo) - ORDEM_MODELOS_VOCAB.indexOf(b.modelo));
      return h('div', { class: 'baralho-item' },
        h('div', {},
          h('span', { class: 'mono-zh baralho-item-hz' }, p.hanzi), ' ',
          h('span', { class: 'baralho-pinyin' }, p.pinyin), ' — ', p.pt,
          canSpeak() ? speakButton(p.hanzi, { label: '▶', kind: 'ghost' }) : null),
        ...cartoes.map((c) => h('div', { class: 'baralho-item-cartao' },
          h('strong', {}, MODELOS_VOCAB[c.modelo].nome), ': ', descrever(c), ' ',
          button(c.suspenso ? 'Reativar' : 'Suspender', () => ctx.commit((s) => suspenderVocabulario(s, c.id, !c.suspenso)), { kind: 'ghost' }),
          c.estado !== 'novo'
            ? button('Esquecer', () => {
                if (!confirm(`Voltar o cartão de ${palavraDe(c.palavra)?.hanzi || c.palavra} a novo? O agendamento recomeça.`)) return;
                ctx.commit((s) => esquecerVocabulario(s, c.id));
              }, { kind: 'ghost' })
            : null)));
    });
    wrap.append(card(`Lição ${l.numero} — ${l.titulo}`, ...(linhas.length ? linhas : [emptyNote('Sem palavras.')])));
  }
  return wrap;
}

// ---------------------------------------------------------------- treino livre

function renderTreino(ctx) {
  const { ui } = ctx;
  const t = treinoAtual(ctx.state);
  const encerrar = () => {
    ui.treinoVirado = null;
    ctx.commit((s) => salvarTreino(s, null), { silent: true });
    ctx.go('vocab');
  };
  const wrap = h('div', { class: 'stack' });
  if (!t) {
    ui.keyHandler = null;
    wrap.append(card('Treino livre', h('p', {}, 'Nenhum treino em andamento.'),
      h('div', { class: 'actions' }, button('Voltar', () => ctx.go('vocab')))));
    return wrap;
  }

  if (!t.fila.length) {
    ui.keyHandler = null;
    const pct = t.total ? Math.round((t.acertosDePrimeira / t.total) * 100) : 0;
    wrap.append(card('Treino concluído 🎉',
      h('p', {}, `${t.total} cartão(ões), ${t.acertosDePrimeira} de primeira (${pct}%), ${t.respondidas} respostas no total.`),
      t.erradas.length
        ? h('p', {}, 'Errou alguma vez: ', ...t.erradas.map((x) => h('span', { class: 'mono-zh' }, `${x.palavra} `)))
        : h('p', {}, 'Nenhum erro. 太棒了！'),
      h('div', { class: 'actions' },
        t.erradas.length ? button('Treinar só os que errei', () => {
          ctx.commit((s) => salvarTreino(s, { ...treinoDosErros(t), escolha: t.escolha }), { silent: true });
          ctx.render();
        }) : null,
        button('De novo, tudo', () => iniciarTreino(ctx, t.escolha), { kind: t.erradas.length ? 'secondary' : 'primary' }),
        button('Voltar', encerrar, { kind: 'ghost' }))));
    return wrap;
  }

  const atual = t.fila[0];
  const p = palavraDe(atual.palavra);
  const cfg = configVocabulario(ctx.state);
  // "Virado" fica só na tela, preso à resposta da vez: recarregar volta a frente do cartão.
  const virado = ui.treinoVirado === t.respondidas;
  const mostrar = () => {
    ui.treinoVirado = t.respondidas;
    if (canSpeak() && cfg.audioAoMostrar) playAudio(p.hanzi);
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

  const feitas = t.total - new Set(t.fila.map((x) => `${x.palavra}:${x.modelo}`)).size;
  wrap.append(h('section', { class: 'card baralho-cartao' },
    h('div', { class: 'baralho-topo' },
      h('span', { class: 'hint' }, `Treino livre · ${feitas}/${t.total} · ${t.respondidas} respostas`),
      h('span', { class: 'hint' }, MODELOS_VOCAB[atual.modelo].nome)),
    bar((feitas / t.total) * 100),
    virado ? verso(p) : frente(atual, p),
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
