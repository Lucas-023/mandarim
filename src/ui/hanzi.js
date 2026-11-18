/**
 * Tela "Hanzi": escolher entre parecidos e montar pelas peças (core/hanzi.js).
 * A rodada vive em ctx.ui.hanzi (só nesta aba); o registro de acertos e erros
 * vai para o estado, para os errados voltarem primeiro.
 */
import { h, card, button, badge, emptyNote } from './dom.js';
import { speakButton, canSpeak } from './audio.js';
import {
  montarRodada, corrigir, registrarHanzi, sobre, resumoHanzi, pecas, ESTRUTURAS,
} from '../core/hanzi.js';
import { renderExiste } from './lexchi.js';

const MODOS = { misturado: 'Os dois', parecidos: 'Escolher entre parecidos', montar: 'Montar pelas peças', existe: 'Existe? (teste)' };

function tela(ctx) {
  if (!ctx.ui.hanzi) ctx.ui.hanzi = { modo: 'misturado', itens: null, i: 0, escolha: [], resposta: null, acertos: 0 };
  return ctx.ui.hanzi;
}

function novaRodada(ctx, t) {
  Object.assign(t, { itens: montarRodada(ctx.state, { modo: t.modo }), i: 0, escolha: [], resposta: null, acertos: 0 });
}

export function renderHanzi(ctx) {
  const t = tela(ctx);
  const wrap = h('div', { class: 'stack' });
  wrap.append(renderTopo(ctx, t));
  if (t.modo === 'existe') {
    wrap.append(renderExiste(ctx));
    return wrap;
  }
  if (!t.itens) novaRodada(ctx, t);
  if (!t.itens.length) {
    wrap.append(card(null, emptyNote(
      'Ainda não há caracteres para treinar: eles vêm das palavras do seu Baralho. Abra o Baralho uma vez para trazer as palavras do curso.')));
    return wrap;
  }
  wrap.append(t.i >= t.itens.length ? renderFim(ctx, t) : renderItem(ctx, t));
  return wrap;
}

function renderTopo(ctx, t) {
  const r = resumoHanzi(ctx.state);
  const trocar = (modo) => {
    t.modo = modo;
    t.itens = null;
    ctx.render();
  };
  return card('Hanzi',
    h('p', {},
      'Para reconhecer o caractere inteiro, não só um pedaço dele. As opções têm o mesmo radical ou as mesmas peças, ',
      'então o pedaço que você conhece não serve de pista.'),
    h('div', { class: 'chips' },
      ...Object.entries(MODOS).map(([id, nome]) => h('button', {
        class: `chip${t.modo === id ? ' chip-on' : ''}`, onClick: () => trocar(id),
      }, nome))),
    h('p', { class: 'hint' },
      `${r.disponiveis} caracteres das suas palavras · ${r.vistos} já treinados aqui` +
      (r.errados.length ? ` · voltam primeiro: ${r.errados.slice(0, 12).join(' ')}` : '') + '.'),
    h('small', { class: 'hint' }, 'Não mexe no agendamento do Baralho e não conta como avaliação: é treino, repita à vontade.'));
}

/** A palavra com o caractere treinado em branco: 银行 → ＿行. */
const comLacuna = (item) => [...item.palavra].map((c) => (c === item.ch ? '＿' : c)).join('');

function renderItem(ctx, t) {
  const item = t.itens[t.i];
  const respondido = t.resposta != null;
  const cabecalho = h('div', { class: 'row between' },
    h('strong', {}, `${t.i + 1} de ${t.itens.length}`),
    badge(item.tipo === 'parecidos' ? 'escolher' : 'montar', 'neutral'));
  const pista = h('div', { class: 'hanzi-pista' },
    h('div', { class: 'mono-zh big' }, item.palavra.length > 1 ? comLacuna(item) : '＿'),
    h('div', { class: 'baralho-pinyin' }, item.pinyin || ''),
    h('div', {}, item.pt));

  const corpo = item.tipo === 'parecidos' ? opcoesParecidos(ctx, t, item) : opcoesMontar(ctx, t, item);
  return card(null, cabecalho,
    h('p', { class: 'hint' }, item.tipo === 'parecidos'
      ? 'Qual caractere completa a palavra?'
      : `Monte o caractere que completa a palavra: escolha as ${item.pecas.length} peças (${ESTRUTURAS[item.estrutura] || 'estrutura composta'}).`),
    pista, corpo,
    respondido ? renderRetorno(ctx, t, item) : null);
}

function opcoesParecidos(ctx, t, item) {
  const respondido = t.resposta != null;
  const responder = (ch) => {
    if (respondido) return;
    const ok = corrigir(item, ch);
    t.resposta = { ok, dada: ch };
    if (ok) t.acertos += 1;
    ctx.commit((s) => registrarHanzi(s, item, ok), { silent: true });
    ctx.render();
  };
  ctx.ui.keyHandler = (e) => {
    const n = Number(e.key);
    if (!respondido && n >= 1 && n <= item.opcoes.length) responder(item.opcoes[n - 1]);
    else if (respondido && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); proximo(ctx, t); }
  };
  return h('div', { class: 'hanzi-opcoes' },
    ...item.opcoes.map((ch, k) => {
      let cls = 'option hanzi-opcao mono-zh';
      if (respondido && ch === item.ch) cls += ' hanzi-certo';
      else if (respondido && ch === t.resposta.dada) cls += ' hanzi-errado';
      return h('button', { class: cls, onClick: () => responder(ch), disabled: respondido },
        h('span', { class: 'option-key' }, String(k + 1)), h('span', {}, ch));
    }));
}

function opcoesMontar(ctx, t, item) {
  const respondido = t.resposta != null;
  const alternar = (p) => {
    if (respondido) return;
    t.escolha = t.escolha.includes(p) ? t.escolha.filter((x) => x !== p) : [...t.escolha, p];
    ctx.render();
  };
  const conferir = () => {
    if (respondido || !t.escolha.length) return;
    const ok = corrigir(item, t.escolha);
    t.resposta = { ok, dada: t.escolha.slice() };
    if (ok) t.acertos += 1;
    ctx.commit((s) => registrarHanzi(s, item, ok), { silent: true });
    ctx.render();
  };
  ctx.ui.keyHandler = (e) => {
    const n = Number(e.key);
    if (!respondido && n >= 1 && n <= item.opcoes.length) alternar(item.opcoes[n - 1]);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (respondido) proximo(ctx, t); else conferir();
    }
  };
  return h('div', {},
    h('div', { class: 'hanzi-opcoes hanzi-pecas' },
      ...item.opcoes.map((p, k) => {
        let cls = 'option hanzi-opcao mono-zh';
        if (t.escolha.includes(p)) cls += ' hanzi-marcada';
        if (respondido && item.pecas.includes(p)) cls += ' hanzi-certo';
        else if (respondido && t.escolha.includes(p)) cls += ' hanzi-errado';
        return h('button', { class: cls, onClick: () => alternar(p), disabled: respondido },
          h('span', { class: 'option-key' }, String(k + 1)), h('span', {}, p));
      })),
    respondido ? null : h('div', { class: 'actions' },
      button(`Conferir${t.escolha.length ? ` (${t.escolha.join(' + ')})` : ''}`, conferir, { disabled: !t.escolha.length })));
}

/** O momento de aprender: o certo, as peças dele e no que os parecidos diferem. */
function renderRetorno(ctx, t, item) {
  const linha = (ch) => {
    const s = sobre(ch);
    const ps = pecas(ch);
    return h('li', {},
      h('span', { class: 'mono-zh hanzi-mini' }, ch), ' ',
      s ? `${s.py} — ${s.pt}` : '(só aparece dentro de palavras)',
      ps.length ? h('span', { class: 'hint' }, ` · ${ps.join(' + ')}`) : null);
  };
  return h('div', { class: t.resposta.ok ? 'callout hanzi-ok' : 'callout hanzi-erro' },
    h('p', {}, h('strong', {}, t.resposta.ok ? 'Isso! ' : 'Não foi dessa vez. '),
      h('span', { class: 'mono-zh' }, item.palavra), ` (${item.pinyin || ''}) = ${item.pt}`,
      canSpeak() ? ' ' : null, canSpeak() ? speakButton(item.palavra, { label: '▶', kind: 'ghost' }) : null),
    h('p', { class: 'hint' }, 'Compare o certo com os parecidos:'),
    h('ul', { class: 'tight' }, linha(item.ch), ...item.vizinhos.map(linha)),
    h('div', { class: 'actions' }, button(t.i + 1 < t.itens.length ? 'Próximo (Enter)' : 'Ver resultado', () => proximo(ctx, t))));
}

function proximo(ctx, t) {
  t.i += 1;
  t.escolha = [];
  t.resposta = null;
  ctx.render();
}

function renderFim(ctx, t) {
  ctx.ui.keyHandler = (e) => { if (e.key === 'Enter') { novaRodada(ctx, t); ctx.render(); } };
  return card('Fim da rodada',
    h('p', {}, `Você acertou ${t.acertos} de ${t.itens.length}. Os que você errou voltam primeiro na próxima rodada.`),
    h('div', { class: 'actions' }, button('Outra rodada (Enter)', () => { novaRodada(ctx, t); ctx.render(); })));
}
