import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, byButtonLike } from './helpers/dom-shim.js';

installDom();

const L = await import('../src/core/lexchi.js');
const { emptyState } = await import('../src/core/storage.js');
const { incorporarCurso } = await import('../src/core/curso.js');
const { mergeStates } = await import('../src/core/merge.js');
const { allEntries } = await import('../src/core/content/lexicon.js');
const { renderHanzi } = await import('../src/ui/hanzi.js');

const dic = await L.carregarDicionario();
let semente = 7;
const rng = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };

function comCurso() {
  const s = emptyState();
  incorporarCurso(s, { agora: new Date(2026, 10, 18, 9) });
  return s;
}

test('dicionário: palavras reais conhecidas estão lá, invenções não', () => {
  for (const w of ['银行', '超市', '好人', '香蕉']) assert.ok(dic.reais.has(w), w);
  for (const w of ['很行', '银市']) assert.ok(!dic.reais.has(w), w);
  assert.ok(dic.verificaveis.has('银') && dic.verificaveis.has('行'));
});

test('teste: 2/3 reais do baralho, 1/3 inventadas que não existem nem usam palavra solta', () => {
  const s = comCurso();
  const soltos = new Set(allEntries().filter((e) => [...e.hz].length === 1).map((e) => e.hz));
  const doBaralho = new Set(L.palavrasDoAluno(s).map((p) => p.hz));
  for (let k = 0; k < 5; k += 1) {
    const { itens } = L.montarTeste(s, dic, { aleatorio: rng });
    assert.equal(itens.length, 60);
    const reais = itens.filter((x) => x.real);
    const falsas = itens.filter((x) => !x.real);
    assert.equal(reais.length, 40);
    assert.ok(reais.every((x) => doBaralho.has(x.hz) && x.pt));
    assert.equal(new Set(itens.map((x) => x.hz)).size, 60, 'sem item repetido');
    for (const f of falsas) {
      const [a, b] = [...f.hz];
      assert.ok(!dic.reais.has(f.hz) && !dic.reais.has(b + a), `${f.hz} não existe`);
      assert.ok(!soltos.has(a) && !soltos.has(b), `${f.hz} sem caractere que é palavra sozinho`);
      assert.ok(f.origem && L.explicarFalsa(f));
    }
    assert.ok(falsas.some((f) => f.origem.tipo === 'parecido') && falsas.some((f) => f.origem.tipo === 'mistura'));
    // Nenhum caractere mais de 2 vezes; nunca mais de 4 do mesmo tipo seguidos.
    const vezes = {};
    for (const c of itens.flatMap((x) => [...x.hz])) vezes[c] = (vezes[c] || 0) + 1;
    assert.ok(Object.values(vezes).every((v) => v <= 2), JSON.stringify(Object.entries(vezes).filter(([, v]) => v > 2)));
    let seguidas = 1;
    for (let i = 1; i < itens.length; i += 1) {
      seguidas = itens[i].real === itens[i - 1].real ? seguidas + 1 : 1;
      assert.ok(seguidas <= 4);
    }
  }
  // Pares de pronúncia não entram.
  assert.ok(!L.palavrasDoAluno(s).some((p) => p.hz === '白漆'));
});

test('nota de Ghent: chutar sim em tudo dá 0, perfeito dá 100, inventada aceita desconta o dobro', () => {
  const itens = [...Array(4)].map((_, i) => ({ hz: `r${i}`, real: true })).concat([{ hz: 'f0', real: false }, { hz: 'f1', real: false }]);
  assert.equal(L.pontuar(itens, itens.map(() => true)).nota, 0);
  assert.equal(L.pontuar(itens, itens.map(() => false)).nota, 0);
  assert.equal(L.pontuar(itens, itens.map((x) => x.real)).nota, 100);
  assert.equal(L.pontuar(itens, [true, true, true, true, true, false]).nota, 50);
});

test('vocabulário pequeno: tamanho proporcional, e vazio sem palavras', () => {
  const s = emptyState();
  assert.equal(L.montarTeste(s, dic).itens.length, 0);
  const c = comCurso();
  assert.equal(L.tamanhoPossivel(c, 30), 30);
});

test('resultado gravado, histórico e mesclagem', () => {
  const s = comCurso();
  const t = L.montarTeste(s, dic, { aleatorio: rng });
  const r = L.registrarTeste(s, t, t.itens.map((x) => x.real));
  assert.equal(r.nota, 100);
  assert.equal(L.historicoTestes(s).length, 1);
  L.registrarTeste(s, L.montarTeste(s, dic, { aleatorio: rng }), [], { modo: 'treino' });
  assert.equal(L.historicoTestes(s).length, 1, 'treino não entra no histórico de notas');
  assert.equal(mergeStates(emptyState(), s).state.lexchiTestes.length, 2);
});

test('tela: faz o teste inteiro pelo teclado de botões e mostra o resultado', async () => {
  const state = comCurso();
  const ctx = {
    state, params: {}, ui: {}, toasts: [],
    toast: (m) => ctx.toasts.push(m), go: () => {}, render: () => {},
    commit: (fn) => fn(state),
  };
  ctx.ui.hanzi = { modo: 'existe', itens: null, i: 0, escolha: [], resposta: null, acertos: 0 };
  let view = renderHanzi(ctx);
  await new Promise((r) => setTimeout(r, 50)); // dicionário carregado
  view = renderHanzi(ctx);
  view.find(byButtonLike('Fazer o teste')).click();
  const t = ctx.ui.lexchi;
  for (let i = 0; i < t.teste.itens.length; i += 1) {
    view = renderHanzi(ctx);
    view.find(byButtonLike(t.teste.itens[i].real ? 'Existe (1)' : 'Não existe (2)')).click();
  }
  view = renderHanzi(ctx);
  assert.match(view.textContent, /Resultado: 100%/);
  assert.equal(state.lexchiTestes.length, 1);
});
