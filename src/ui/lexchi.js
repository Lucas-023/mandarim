/**
 * Teste "Existe?" (formato LexCHI) dentro da aba Hanzi. Ver core/lexchi.js.
 * O teste em andamento fica em ctx.ui.lexchi (dura 2–3 minutos); o resultado
 * vai para state.lexchiTestes.
 */
import { h, card, button, badge, emptyNote, formatDate } from './dom.js';
import {
  carregarDicionario, montarTeste, registrarTeste, historicoTestes, explicarFalsa, tamanhoPossivel, N_PADRAO,
} from '../core/lexchi.js';

let dicionario = null;
let carregando = null;

function tela(ctx) {
  if (!ctx.ui.lexchi) ctx.ui.lexchi = { teste: null, modo: 'teste', i: 0, respostas: [], resultado: null };
  return ctx.ui.lexchi;
}

export function renderExiste(ctx) {
  const t = tela(ctx);
  if (!dicionario) {
    if (!carregando) {
      carregando = carregarDicionario()
        .then((d) => { dicionario = d; ctx.render(); })
        .catch((err) => { carregando = null; ctx.toast(`Não deu para carregar o dicionário: ${err.message}`, 'error'); });
    }
    return card(null, h('p', {}, 'Carregando o dicionário de palavras…'));
  }
  if (t.resultado) return renderResultado(ctx, t);
  if (t.teste) return renderItem(ctx, t);
  return renderInicio(ctx, t);
}

function comecar(ctx, t, modo) {
  const teste = montarTeste(ctx.state, dicionario);
  if (!teste.itens.length) {
    ctx.toast('Ainda há poucas palavras de dois caracteres no seu Baralho para montar o teste.', 'warn');
    return;
  }
  Object.assign(t, { teste, modo, i: 0, respostas: [], resultado: null, retorno: null });
  ctx.render();
}

function renderInicio(ctx, t) {
  const hist = historicoTestes(ctx.state);
  const n = tamanhoPossivel(ctx.state);
  ctx.ui.keyHandler = (e) => { if (e.key === 'Enter') comecar(ctx, t, 'teste'); };
  return card('Existe ou não existe?',
    h('p', {},
      'No formato do LexCHI, um teste de vocabulário chinês: aparece uma palavra de dois caracteres por vez e você diz se ela existe. ',
      'Um terço é inventado. Metade das inventadas troca um caractere por um parecido (', h('span', { class: 'mono-zh' }, '银行 → 很行'),
      '), a outra junta o começo de uma palavra com o fim de outra. Quase tudo vem das palavras que você estuda.'),
    h('ul', { class: 'tight' },
      h('li', {}, 'Sem pressa e sem dicionário. Na dúvida, responda "não existe".'),
      h('li', {}, 'Nota = (sim às reais − 2 × sim às inventadas) ÷ nº de reais. Chutar "existe" para tudo dá 0%.'),
      h('li', {}, 'Não conta como avaliação de nível: mede o reconhecimento das SUAS palavras.')),
    n < N_PADRAO ? h('p', { class: 'hint' }, `Com o seu vocabulário atual dá para montar ${n} itens.`) : null,
    h('div', { class: 'actions' },
      button(`Fazer o teste (${n} itens, Enter)`, () => comecar(ctx, t, 'teste'), { disabled: n < 9 }),
      button('Treinar (mostra a resposta a cada item)', () => comecar(ctx, t, 'treino'), { kind: 'secondary', disabled: n < 9 })),
    hist.length
      ? h('div', {},
          h('h3', {}, 'Seus testes'),
          h('ul', { class: 'tight' }, ...hist.slice(-8).reverse().map((r) => h('li', {},
            `${formatDate(r.at)}: `, h('strong', {}, `${r.nota}%`),
            ` · reais reconhecidas ${r.simReais}/${r.nReais} · inventadas aceitas ${r.simFalsas}/${r.nFalsas}`))))
      : emptyNote('Nenhum teste feito ainda.'));
}

function responder(ctx, t, existe) {
  if (t.retorno) return;
  t.respostas[t.i] = existe;
  if (t.modo === 'treino') {
    t.retorno = { ok: existe === t.teste.itens[t.i].real };
    ctx.render();
    return;
  }
  avancar(ctx, t);
}

function avancar(ctx, t) {
  t.retorno = null;
  t.i += 1;
  if (t.i >= t.teste.itens.length) {
    t.resultado = ctx.commit((s) => registrarTeste(s, t.teste, t.respostas, { modo: t.modo }), { silent: true });
  }
  ctx.render();
}

function renderItem(ctx, t) {
  const item = t.teste.itens[t.i];
  ctx.ui.keyHandler = (e) => {
    if (t.retorno) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); avancar(ctx, t); }
      return;
    }
    if (e.key === '1' || e.key === 'ArrowLeft') responder(ctx, t, true);
    else if (e.key === '2' || e.key === 'ArrowRight') responder(ctx, t, false);
  };
  const sair = () => { Object.assign(t, { teste: null, resultado: null, retorno: null }); ctx.render(); };
  return card(null,
    h('div', { class: 'row between' },
      h('strong', {}, `${t.i + 1} de ${t.teste.itens.length}`),
      badge(t.modo === 'teste' ? 'teste' : 'treino', 'neutral')),
    h('div', { class: 'lexchi-item mono-zh' }, item.hz),
    t.retorno
      ? h('div', { class: t.retorno.ok ? 'callout hanzi-ok' : 'callout hanzi-erro' },
          h('p', {}, h('strong', {}, t.retorno.ok ? 'Certo. ' : 'Errado. '),
            item.real ? `Existe: ${item.py} — ${item.pt}` : `Inventada: ${explicarFalsa(item)}.`),
          h('div', { class: 'actions' }, button('Próximo (Enter)', () => avancar(ctx, t))))
      : h('div', { class: 'lexchi-botoes' },
          button('Existe (1)', () => responder(ctx, t, true)),
          button('Não existe (2)', () => responder(ctx, t, false), { kind: 'secondary' })),
    h('div', { class: 'actions' }, button('Sair do teste', sair, { kind: 'ghost' })));
}

function renderResultado(ctx, t) {
  const r = t.resultado;
  const itens = t.teste.itens;
  const realNao = itens.filter((x, i) => x.real && t.respostas[i] !== true);
  const falsaSim = itens.filter((x, i) => !x.real && t.respostas[i] === true);
  const voltar = () => { Object.assign(t, { teste: null, resultado: null }); ctx.render(); };
  ctx.ui.keyHandler = (e) => { if (e.key === 'Enter') voltar(); };
  return card(`Resultado: ${r.nota}%`,
    h('p', {},
      `Reconheceu ${r.simReais} de ${r.nReais} palavras reais e aceitou ${r.simFalsas} de ${r.nFalsas} inventadas. `,
      r.simFalsas ? 'Cada inventada aceita desconta o dobro: é o que pega o reconhecimento só pelo radical.' : 'Nenhuma inventada passou. 👏'),
    falsaSim.length
      ? h('div', {}, h('h3', {}, 'Inventadas que você aceitou'),
          h('ul', { class: 'tight' }, ...falsaSim.map((x) => h('li', {}, h('span', { class: 'mono-zh hanzi-mini' }, x.hz), ` — ${explicarFalsa(x)}`))))
      : null,
    realNao.length
      ? h('div', {}, h('h3', {}, 'Reais que você não reconheceu'),
          h('ul', { class: 'tight' }, ...realNao.map((x) => h('li', {}, h('span', { class: 'mono-zh hanzi-mini' }, x.hz), ` ${x.py} — ${x.pt}`))))
      : null,
    h('div', { class: 'actions' }, button('Voltar (Enter)', voltar)));
}
