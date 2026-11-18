import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, byButtonLike } from './helpers/dom-shim.js';

installDom();

const H = await import('../src/core/hanzi.js');
const { COMPONENTES } = await import('../src/core/content/componentes.js');
const { PALAVRAS } = await import('../src/core/content/vocabLicoes.js');
const { emptyState } = await import('../src/core/storage.js');
const { incorporarCurso } = await import('../src/core/curso.js');
const { mergeStates } = await import('../src/core/merge.js');
const { renderHanzi } = await import('../src/ui/hanzi.js');

const fixo = () => 0;
let semente = 1;
const rng = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };

function comCurso() {
  const s = emptyState();
  incorporarCurso(s, { agora: new Date(2026, 10, 18, 9) });
  return s;
}

test('componentes: todo caractere das palavras do curso tem decomposição', () => {
  const faltam = [...new Set(PALAVRAS.map((p) => p.hanzi).join(''))].filter((c) => !COMPONENTES[c]);
  assert.deepEqual(faltam, []);
  assert.deepEqual(COMPONENTES['银'], { d: '⿰钅艮', r: '钅' });
});

test('peças e leitura de IDS', () => {
  assert.deepEqual(H.pecas('银'), ['钅', '艮']);
  assert.deepEqual(H.lerIds('⿰钅艮'), { op: '⿰', partes: ['钅', '艮'] });
  assert.ok(H.componentesFundos('银').has('艮'));
  assert.equal(H.decomponivel('银'), true);
  assert.equal(H.decomponivel('一'), false);
});

test('parecidos dividem peças com o certo, e não só o radical', () => {
  const v = H.parecidos('银', { aleatorio: fixo });
  assert.equal(v.length, 3);
  assert.ok(!v.includes('银'));
  const comMetal = v.filter((c) => H.componentesFundos(c).has('钅'));
  const comGen = v.filter((c) => H.componentesFundos(c).has('艮'));
  assert.ok(comMetal.length >= 1 && comGen.length >= 1, `mistura as duas peças: ${v}`);
  // Nunca um componente do próprio caractere (艮 como "parecido" de 银 seria pista grátis).
  for (const ch of ['银', '想', '您', '楼']) {
    const fundo = H.componentesFundos(ch);
    assert.ok(H.parecidos(ch, { aleatorio: fixo }).every((x) => !fundo.has(x)));
  }
});

test('rodada: itens dos dois tipos, a palavra contém o caractere, correção certa', () => {
  const s = comCurso();
  const itens = H.montarRodada(s, { n: 12, aleatorio: rng });
  assert.equal(itens.length, 12);
  assert.ok(itens.some((i) => i.tipo === 'parecidos') && itens.some((i) => i.tipo === 'montar'));
  for (const i of itens) {
    assert.ok(i.palavra.includes(i.ch) && i.pt);
    if (i.tipo === 'parecidos') {
      assert.equal(i.opcoes.length, 4);
      assert.ok(i.opcoes.includes(i.ch));
      assert.equal(H.corrigir(i, i.ch), true);
      assert.equal(H.corrigir(i, i.vizinhos[0]), false);
    } else {
      assert.ok(i.pecas.length >= 2 && i.pecas.every((p) => i.opcoes.includes(p)));
      assert.ok(i.opcoes.length > i.pecas.length, 'tem peças falsas');
      assert.equal(H.corrigir(i, [...i.pecas].reverse()), true, 'ordem não importa');
      assert.equal(H.corrigir(i, i.pecas.slice(0, 1)), false, 'faltando peça');
      const falsa = i.opcoes.find((p) => !i.pecas.includes(p));
      assert.equal(H.corrigir(i, [...i.pecas, falsa]), false, 'peça a mais');
    }
  }
  assert.equal(H.montarRodada(s, { n: 8, modo: 'montar', aleatorio: rng }).every((i) => i.tipo === 'montar'), true);
});

test('errado volta primeiro; registro não mexe no baralho e atravessa a mesclagem', () => {
  const s = comCurso();
  const antes = JSON.stringify(s.deck);
  const [primeiro] = H.montarRodada(s, { n: 1, modo: 'parecidos', aleatorio: rng });
  const alvo = H.montarRodada(s, { n: 30, aleatorio: rng }).find((i) => i.ch !== primeiro.ch);
  H.registrarHanzi(s, alvo, false);
  for (let k = 0; k < 5; k += 1) assert.equal(H.montarRodada(s, { n: 3, aleatorio: rng })[0].ch, alvo.ch);
  assert.equal(JSON.stringify(s.deck), antes);
  assert.deepEqual(H.resumoHanzi(s).errados, [alvo.ch]);
  H.registrarHanzi(s, alvo, true);
  assert.deepEqual(H.resumoHanzi(s).errados, []);
  const outro = emptyState();
  assert.equal(mergeStates(outro, s).state.hanziRegistro.length, 2);
});

test('tela: responde um item de cada tipo e registra', () => {
  const state = comCurso();
  const ctx = {
    state, params: {}, ui: {}, toasts: [],
    toast: (m) => ctx.toasts.push(m), go: () => {}, render: () => {},
    commit: (fn) => fn(state),
  };
  let view = renderHanzi(ctx);
  assert.match(view.textContent, /Hanzi/);
  const t = ctx.ui.hanzi;
  // parecidos
  t.itens[0] = { ...H.montarRodada(state, { n: 1, modo: 'parecidos', aleatorio: rng })[0] };
  view = renderHanzi(ctx);
  const certo = t.itens[0].ch;
  view.find((el) => el.tagName === 'BUTTON' && el.textContent === `${t.itens[0].opcoes.indexOf(certo) + 1}${certo}`).click();
  assert.equal(t.resposta.ok, true);
  view = renderHanzi(ctx);
  assert.match(view.textContent, /Compare o certo com os parecidos/);
  view.find(byButtonLike('Próximo')).click();
  // montar
  t.itens[1] = { ...H.montarRodada(state, { n: 1, modo: 'montar', aleatorio: rng })[0] };
  for (const p of t.itens[1].pecas) {
    view = renderHanzi(ctx);
    view.find((el) => el.tagName === 'BUTTON' && el.textContent === `${t.itens[1].opcoes.indexOf(p) + 1}${p}`).click();
  }
  view = renderHanzi(ctx);
  view.find(byButtonLike('Conferir')).click();
  assert.equal(t.resposta.ok, true);
  assert.equal(state.hanziRegistro.length, 2);
});
