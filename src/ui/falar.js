/**
 * Tela "Falar": repetir em voz alta, dizer a partir do português e conversa
 * simulada. A lógica (fila, registro, roteiro) está em core/fala.js.
 *
 * Revelar a resposta mexe só no DOM, sem redesenhar: um redesenho jogaria fora
 * a gravação que a pessoa acabou de fazer. Só a nota grava no estado.
 */
import { h, card, button, badge, emptyNote } from './dom.js';
import { speakButton, canSpeak, playAudio, stopAudio } from './audio.js';
import { gravadorDeComparacao, soltarMicrofone } from './recorder.js';
import {
  NOTAS_FALA, MODOS_FALA, MINIMO_FRASES_XP,
  filaDeFala, registrarFala, resumoFala, roteiroConversa, concluirConversa,
} from '../core/fala.js';
import { latestPack, getPack } from '../core/packs.js';

const TECLA_NOTA = { 1: 'travei', 2: 'quase', 3: 'bem' };

function estadoTela(ctx) {
  const date = ctx.params.date || null;
  const modo = MODOS_FALA[ctx.params.modo] ? ctx.params.modo : null;
  if (!ctx.ui.fala || ctx.ui.fala.date !== date || (modo && ctx.ui.fala.pedido !== modo)) {
    ctx.ui.fala = { date, pedido: modo, modo: modo || 'repetir', fila: null, indice: 0, notas: [], conversa: null };
  }
  return ctx.ui.fala;
}

export function renderFalar(ctx) {
  soltarMicrofone();
  stopAudio();
  const f = estadoTela(ctx);
  const wrap = h('div', { class: 'stack' });
  wrap.append(renderTopo(ctx, f));
  if (f.modo === 'conversa') wrap.append(renderConversa(ctx, f));
  else wrap.append(renderFrases(ctx, f));
  return wrap;
}

function renderTopo(ctx, f) {
  const r = resumoFala(ctx.state);
  const trocar = (modo) => {
    Object.assign(f, { modo, fila: null, indice: 0, notas: [], conversa: null });
    ctx.render();
  };
  return card('Falar',
    h('p', {},
      'A parte que nenhum exercício escrito treina: abrir a boca. Ouça, fale em voz alta, grave e compare. ',
      'Fale de verdade, em voz alta — sussurrar ou "falar de cabeça" não treina a boca.'),
    h('div', { class: 'chips' },
      ...Object.entries(MODOS_FALA).map(([id, nome]) => h('button', {
        class: `chip${f.modo === id ? ' chip-on' : ''}`,
        onClick: () => trocar(id),
      }, nome))),
    h('p', { class: 'hint' },
      `Hoje: ${r.hoje} frase(s) falada(s)` +
      (r.faltamParaXp ? ` · faltam ${r.faltamParaXp} para o XP de prática (${MINIMO_FRASES_XP} por dia)` : ' · XP de prática do dia garantido') +
      ` · ${r.semana} nos últimos 7 dias` +
      (r.travadasAgora ? ` · ${r.travadasAgora} frase(s) travada(s) esperando nova tentativa` : '') + '.'),
    h('small', { class: 'hint' },
      'A nota é sua autoavaliação: ela decide o que volta primeiro e avisa o gerador do pacote ' +
      'do que travou, mas não vira pontuação de produção oral — o app não tem como avaliar ' +
      'pronúncia com confiança. Gravações não são guardadas.'),
    canSpeak() ? null : h('div', { class: 'callout' },
      'Este navegador não tem voz em chinês: o modelo de áudio não vai tocar. Use o pinyin, ',
      'e prefira gravar os colegas dizendo as frases (Criar cartões → gravar áudio).'));
}

// ───────────────────────────── frases ─────────────────────────────

function renderFrases(ctx, f) {
  if (!f.fila) {
    f.fila = filaDeFala(ctx.state, { date: f.date, limite: 12 });
    f.indice = 0;
    f.notas = [];
  }
  if (!f.fila.length) {
    return card(null, emptyNote(
      'Nenhuma frase disponível agora: elas vêm do pacote do dia (frases de campo, exemplos, diálogo) ' +
      'e dos cartões de frase aprovados. As que saíram bem descansam alguns dias.'),
    h('div', { class: 'actions' }, button('Ver o pacote do dia', () => ctx.go('pack'), { kind: 'secondary' })));
  }
  if (f.indice >= f.fila.length) return renderFimDaRodada(ctx, f);

  const frase = f.fila[f.indice];
  const dizer = f.modo === 'dizer';
  const audios = h('div', { class: 'actions' },
    canSpeak() ? speakButton(frase.hz, { label: '▶ Modelo', autoPlay: !dizer, autoKey: `fala:${f.modo}:${f.indice}:${frase.hz}` }) : null,
    canSpeak() ? speakButton(frase.hz, { label: '🐢 Devagar', rate: 0.65, kind: 'ghost' }) : null);
  // No modo "dizer" o áudio também fica escondido: ouvir antes entregaria a resposta.
  const resposta = h('div', { class: dizer ? 'fala-resposta hidden' : 'fala-resposta' },
    h('div', { class: 'mono-zh big' }, frase.hz),
    h('div', { class: 'baralho-pinyin' }, frase.py),
    dizer ? audios : h('div', { class: 'fala-pt' }, frase.pt));
  const notas = h('div', { class: dizer ? 'fala-notas hidden' : 'fala-notas' },
    ...botoesDeNota((nota) => avaliarFrase(ctx, f, frase, nota)));
  let revelado = !dizer;
  const revelar = () => {
    if (revelado) return;
    revelado = true;
    resposta.classList.remove('hidden');
    notas.classList.remove('hidden');
    btnRevelar.remove();
    playAudio(frase.hz);
  };
  const btnRevelar = dizer ? button('Mostrar a frase (espaço)', revelar) : null;

  ctx.ui.keyHandler = (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !revelado) {
      e.preventDefault();
      revelar();
    } else if (revelado && TECLA_NOTA[e.key]) {
      avaliarFrase(ctx, f, frase, TECLA_NOTA[e.key]);
    }
  };

  return card(null,
    h('div', { class: 'row between' },
      h('strong', {}, `Frase ${f.indice + 1} de ${f.fila.length}`),
      h('span', {},
        frase.ultimaNota ? badge(`última vez: ${NOTAS_FALA[frase.ultimaNota].toLowerCase()}`, frase.ultimaNota === 'travei' ? 'warn' : 'neutral') : badge('nova', 'ok'),
        ' ', badge(frase.origem, 'neutral'))),
    frase.contexto ? h('p', { class: 'hint' }, frase.contexto) : null,
    dizer
      ? h('div', { class: 'fala-enunciado' },
          h('div', { class: 'hint' }, 'Como se diz em chinês:'),
          h('div', { class: 'fala-pt' }, frase.pt))
      : null,
    h('p', { class: 'hint' }, dizer
      ? 'Diga em voz alta ANTES de revelar (grave, se quiser comparar). Errar aqui é o treino — ninguém está ouvindo.'
      : 'Ouça, repita em voz alta três vezes imitando a melodia de cada sílaba, grave a última e compare com o modelo.'),
    resposta,
    dizer ? h('div', { class: 'actions' }, btnRevelar) : audios,
    gravadorDeComparacao(),
    notas);
}

function botoesDeNota(onNota) {
  return [['travei', 1], ['quase', 2], ['bem', 3]].map(([nota, tecla]) =>
    h('button', { class: `btn fala-nota fala-nota-${nota}`, onClick: () => onNota(nota) },
      h('span', {}, NOTAS_FALA[nota]), h('small', {}, `tecla ${tecla}`)));
}

function avaliarFrase(ctx, f, frase, nota) {
  f.notas.push({ hz: frase.hz, nota });
  f.indice += 1;
  const res = ctx.commit((s) => registrarFala(s, { hz: frase.hz, nota, modo: f.modo, origem: frase.origem }));
  if (res?.xp?.granted) ctx.toast(`+${res.xp.event.amount} XP: prática de fala do dia.`, 'success');
}

function renderFimDaRodada(ctx, f) {
  const conta = (n) => f.notas.filter((x) => x.nota === n).length;
  const travadas = f.notas.filter((x) => x.nota === 'travei');
  return card('Rodada concluída',
    h('p', {}, `${conta('bem')} saíram bem · ${conta('quase')} quase · ${conta('travei')} travaram.`),
    travadas.length
      ? h('div', { class: 'callout' },
          'As que travaram voltam primeiro na próxima rodada e vão para o pedido do pacote de amanhã: ',
          h('span', { class: 'mono-zh' }, travadas.map((x) => x.hz).join(' · ')))
      : null,
    h('p', { class: 'hint' }, 'O melhor uso destas frases é fora do app: tente dizer uma delas hoje no campo.'),
    h('div', { class: 'actions' },
      button('Nova rodada', () => {
        f.fila = null;
        ctx.render();
      }),
      button('Conversa simulada', () => {
        Object.assign(f, { modo: 'conversa', fila: null, conversa: null });
        ctx.render();
      }, { kind: 'secondary' }),
      button('Registrar uma conversa real', () => ctx.go('activities', { tab: 'conversation' }), { kind: 'ghost' })));
}

// ───────────────────────────── conversa ─────────────────────────────

function renderConversa(ctx, f) {
  const entry = f.date ? getPack(ctx.state, f.date) : latestPack(ctx.state);
  const roteiro = roteiroConversa(entry?.pack);
  if (!roteiro) {
    return card(null, emptyNote('Sem pacote com diálogo para montar a conversa. Ela vem do pacote do dia.'),
      h('div', { class: 'actions' }, button('Ver o pacote do dia', () => ctx.go('pack'), { kind: 'secondary' })));
  }
  if (!f.conversa) f.conversa = { turno: 0, notas: [], concluida: false };
  const c = f.conversa;
  const wrap = h('div', { class: 'stack' });

  wrap.append(card(`Conversa — ${roteiro.titulo}`,
    h('p', {}, roteiro.situacao),
    roteiro.origem === 'dialogo'
      ? h('small', { class: 'hint' },
          'Este pacote não traz conversa própria: o roteiro sai do diálogo, e a tarefa é dizer a fala ' +
          'do seu personagem a partir da tradução. Os pacotes novos trazem tarefas abertas.')
      : null));

  if (c.turno >= roteiro.turnos.length) {
    wrap.append(renderFimDaConversa(ctx, f, roteiro));
    return wrap;
  }

  const turno = roteiro.turnos[c.turno];
  const falasParceiro = turno.parceiro.map((l) => {
    const texto = h('div', { class: 'pinyin hidden' },
      h('div', { class: 'mono-zh' }, l.hz), h('div', {}, l.py), h('div', { class: 'hint' }, l.pt));
    return h('div', { class: 'dialog-line' },
      h('div', { class: 'row' },
        canSpeak() ? speakButton(l.hz, { label: '▶', kind: 'ghost' }) : null,
        canSpeak() ? speakButton(l.hz, { label: '🐢', rate: 0.65, kind: 'ghost' }) : null,
        h('button', { class: 'dialog-hz', onClick: () => texto.classList.toggle('hidden') },
          `${l.speaker ? `${l.speaker}: ` : 'Colega: '}${canSpeak() ? '(toque para ver o texto)' : l.hz}`)),
      texto);
  });
  if (canSpeak() && turno.parceiro.length) {
    falarEmSequencia(turno.parceiro.map((l) => l.hz), `conversa:${roteiro.titulo}:${c.turno}`);
  }

  const respostas = h('div', { class: 'fala-resposta hidden' },
    h('div', { class: 'hint' }, turno.respostas.length > 1 ? 'Respostas possíveis (qualquer uma serve):' : 'Resposta-modelo:'),
    ...turno.respostas.map((r) => h('div', { class: 'draft' },
      h('div', { class: 'row' },
        canSpeak() ? speakButton(r.hz, { label: '▶', kind: 'ghost' }) : null,
        h('span', { class: 'mono-zh big' }, r.hz)),
      h('div', { class: 'baralho-pinyin' }, r.py),
      h('div', { class: 'hint' }, r.pt))));
  const notas = h('div', { class: 'fala-notas hidden' },
    ...botoesDeNota((nota) => avaliarTurno(ctx, f, roteiro, turno, nota)));
  let revelado = false;
  const revelar = () => {
    if (revelado) return;
    revelado = true;
    respostas.classList.remove('hidden');
    notas.classList.remove('hidden');
    btnRevelar.remove();
    playAudio(turno.respostas[0].hz);
  };
  const btnRevelar = button('Ver resposta (espaço)', revelar);

  ctx.ui.keyHandler = (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !revelado) {
      e.preventDefault();
      revelar();
    } else if (revelado && TECLA_NOTA[e.key]) {
      avaliarTurno(ctx, f, roteiro, turno, TECLA_NOTA[e.key]);
    }
  };

  wrap.append(card(null,
    h('div', { class: 'row between' },
      h('strong', {}, `Turno ${c.turno + 1} de ${roteiro.turnos.length}`),
      badge('fale em voz alta', 'warn')),
    ...falasParceiro,
    h('div', { class: 'fala-enunciado' },
      h('div', { class: 'hint' }, 'Sua vez:'),
      h('div', { class: 'fala-pt' }, turno.tarefa)),
    h('p', { class: 'hint' }, 'Responda em voz alta antes de ver a resposta. Pode ser simples — o que importa é sair.'),
    gravadorDeComparacao({ extras: [btnRevelar] }),
    respostas,
    notas));
  return wrap;
}

/** Fala as linhas do colega uma depois da outra, uma única vez por turno. */
const turnosJaFalados = new Set();
function falarEmSequencia(textos, chave) {
  if (turnosJaFalados.has(chave)) return;
  turnosJaFalados.add(chave);
  const proxima = (i) => {
    if (i >= textos.length) return;
    playAudio(textos[i], { rate: 0.95, onEnd: () => setTimeout(() => proxima(i + 1), 400) });
  };
  setTimeout(() => proxima(0), 150);
}

function avaliarTurno(ctx, f, roteiro, turno, nota) {
  const c = f.conversa;
  c.notas.push({ hz: turno.respostas[0].hz, nota });
  c.turno += 1;
  const fim = c.turno >= roteiro.turnos.length;
  const res = ctx.commit((s) => {
    const r = registrarFala(s, { hz: turno.respostas[0].hz, nota, modo: 'conversa', origem: `conversa: ${roteiro.titulo}` });
    const xpConversa = fim ? concluirConversa(s, { titulo: roteiro.titulo, turnos: roteiro.turnos.length }) : null;
    return { fala: r.xp, conversa: xpConversa };
  });
  for (const xp of [res?.fala, res?.conversa]) {
    if (xp?.granted) ctx.toast(`+${xp.event.amount} XP: ${xp.event.type === 'roleplay' ? 'conversa simulada' : 'prática de fala do dia'}.`, 'success');
  }
}

function renderFimDaConversa(ctx, f, roteiro) {
  const c = f.conversa;
  const conta = (n) => c.notas.filter((x) => x.nota === n).length;
  return card('Conversa concluída',
    roteiro.fecho.length
      ? h('div', {}, ...roteiro.fecho.map((l) => h('div', { class: 'dialog-line' },
          h('span', { class: 'mono-zh' }, `${l.speaker}: ${l.hz}`), h('div', { class: 'hint' }, `${l.py} · ${l.pt}`))))
      : null,
    h('p', {}, `${conta('bem')} turno(s) saíram bem · ${conta('quase')} quase · ${conta('travei')} travaram.`),
    h('p', { class: 'hint' },
      'Faça de novo amanhã: na segunda vez a resposta sai mais rápido, e rapidez é o que falta numa conversa de verdade.'),
    h('div', { class: 'actions' },
      button('Repetir a conversa', () => {
        f.conversa = null;
        turnosJaFalados.clear();
        ctx.render();
      }),
      button('Treinar frases soltas', () => {
        Object.assign(f, { modo: 'repetir', fila: null });
        ctx.render();
      }, { kind: 'secondary' })));
}
