import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, byButton, byButtonLike } from './helpers/dom-shim.js';

installDom();

const { LICOES, PALAVRAS } = await import('../src/core/content/vocabLicoes.js');
const {
  sincronizarVocabulario, precisaSincronizarVocabulario, filaVocabulario, responderVocabulario, desfazerVocabulario,
  salvarConfigVocabulario, estatisticasVocabulario, suspenderVocabulario,
} = await import('../src/core/vocabulario.js');
const { emptyState, migrate, Store, memoryBackend } = await import('../src/core/storage.js');
const { mergeStates } = await import('../src/core/merge.js');
const { estimateAllSkills } = await import('../src/core/skills.js');
const { totalXp } = await import('../src/core/xp.js');
const { renderVocabulario } = await import('../src/ui/vocabulario.js');

const INICIO = new Date(2026, 10, 7, 9, 0, 0);
const minutos = (d, n) => new Date(d.getTime() + n * 60000);
const dias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function estado() {
  const s = emptyState();
  sincronizarVocabulario(s, { agora: INICIO });
  return s;
}

test('lista do curso: 5 lições, palavras únicas, todas com pinyin e tradução', () => {
  assert.equal(LICOES.length, 5);
  assert.equal(PALAVRAS.length, 77);
  assert.equal(new Set(PALAVRAS.map((p) => p.hanzi)).size, PALAVRAS.length, 'sem palavra repetida');
  for (const p of PALAVRAS) {
    assert.ok(p.pinyin && p.pt, `${p.hanzi} tem pinyin e tradução`);
    assert.match(p.hanzi, /^[一-鿿]+$/);
  }
});

test('cada palavra vira dois cartões; sincronizar é idempotente; estado antigo ganha o campo', () => {
  const s = estado();
  assert.equal(s.vocabulario.cartoes.length, 77 * 2);
  assert.equal(sincronizarVocabulario(s), 0);
  assert.equal(precisaSincronizarVocabulario(s), false);
  const antigo = migrate({ profile: {}, deck: { cartoes: [], registro: [] } });
  assert.deepEqual(antigo.vocabulario, { cartoes: [], registro: [], config: {} });
  assert.equal(precisaSincronizarVocabulario(antigo), true);
});

test('novos seguem a ordem da lista, respeitam o limite do dia e não juntam irmãos', () => {
  const s = estado();
  const f = filaVocabulario(s, { agora: INICIO });
  assert.equal(f.contagem.novos, 10, 'padrão: 10 novos por dia');
  assert.equal(f.palavra.hanzi, '你');
  assert.equal(f.proximo.modelo, 'reconhecer');
  // Responde "Fácil" (forma o cartão): o irmão "produzir" de 你 espera amanhã.
  responderVocabulario(s, f.proximo.id, 4, { agora: INICIO });
  const depois = filaVocabulario(s, { agora: minutos(INICIO, 1) });
  assert.equal(depois.palavra.hanzi, '您');
  assert.equal(depois.contagem.novos, 9);
});

test('errar volta ao passo de 1 min; Bom duas vezes forma; revisão cai no dia certo', () => {
  const s = estado();
  const id = '你:reconhecer';
  responderVocabulario(s, id, 1, { agora: INICIO });
  let c = s.vocabulario.cartoes.find((x) => x.id === id);
  assert.equal(c.estado, 'aprendendo');
  assert.equal(Date.parse(c.due) - INICIO.getTime(), 60000);
  responderVocabulario(s, id, 3, { agora: minutos(INICIO, 1) });
  responderVocabulario(s, id, 3, { agora: minutos(INICIO, 11) });
  c = s.vocabulario.cartoes.find((x) => x.id === id);
  assert.equal(c.estado, 'revisao');
  assert.ok(c.intervaloDias >= 1);
  const venc = filaVocabulario(s, { agora: dias(INICIO, c.intervaloDias) });
  assert.ok(venc.contagem.revisao >= 1);
});

test('desligar uma lição esconde os cartões dela, sem apagar', () => {
  const s = estado();
  salvarConfigVocabulario(s, { licoes: [3] });
  const f = filaVocabulario(s, { agora: INICIO });
  assert.equal(f.palavra.licao, 3);
  assert.equal(f.palavra.hanzi, '请问');
  assert.equal(s.vocabulario.cartoes.length, 154);
});

test('suspenso não aparece; desfazer devolve o cartão como estava', () => {
  const s = estado();
  suspenderVocabulario(s, '你:reconhecer');
  assert.equal(filaVocabulario(s, { agora: INICIO }).proximo.id, '你:produzir', 'o irmão não suspenso segue valendo');
  suspenderVocabulario(s, '你:produzir');
  assert.equal(filaVocabulario(s, { agora: INICIO }).palavra.hanzi, '您');
  const id = filaVocabulario(s, { agora: INICIO }).proximo.id;
  responderVocabulario(s, id, 3, { agora: INICIO });
  desfazerVocabulario(s);
  assert.equal(s.vocabulario.cartoes.find((c) => c.id === id).estado, 'novo');
  assert.equal(s.vocabulario.registro.length, 0);
});

test('isolado do resto do app: responder não dá XP, não agenda pacote, não vira proficiência', () => {
  const s = estado();
  for (let i = 0; i < 20; i += 1) {
    const f = filaVocabulario(s, { agora: minutos(INICIO, i) });
    if (!f.proximo) break;
    responderVocabulario(s, f.proximo.id, 3, { agora: minutos(INICIO, i) });
  }
  assert.ok(s.vocabulario.registro.length >= 10);
  assert.equal(totalXp(s), 0);
  assert.deepEqual(s.schedule?.items || {}, {});
  assert.equal(s.skillEvidence.length, 0);
  assert.ok(Object.values(estimateAllSkills(s)).every((e) => e.score == null));
});

test('estatísticas por lição contam palavras estudadas', () => {
  const s = estado();
  responderVocabulario(s, '你:reconhecer', 3, { agora: INICIO });
  const est = estatisticasVocabulario(s, { agora: INICIO });
  assert.equal(est.porLicao[0].vistas, 1);
  assert.equal(est.porLicao[0].total, 7);
  assert.equal(est.respondidosHoje, 1);
});

test('mesclagem de dois aparelhos une respostas e fica com o cartão respondido por último', () => {
  const a = estado();
  const b = estado();
  responderVocabulario(a, '你:reconhecer', 3, { agora: INICIO });
  responderVocabulario(b, '您:reconhecer', 4, { agora: minutos(INICIO, 5) });
  const { state } = mergeStates(a, b);
  assert.equal(state.vocabulario.registro.length, 2);
  assert.equal(state.vocabulario.cartoes.length, 154);
  assert.equal(state.vocabulario.cartoes.find((c) => c.id === '您:reconhecer').estado, 'revisao');
  assert.ok(state.vocabulario.registro.every((r) => !('anterior' in r)));
});

// ───────────────────────────── tela ─────────────────────────────

function makeCtx(state = emptyState(), params = {}) {
  const store = new Store(memoryBackend());
  store.state = state;
  const ctx = {
    state, store, params, ui: {}, toasts: [], navigations: [],
    toast: (m, k) => ctx.toasts.push({ m, k }),
    go: (view, p = {}) => ctx.navigations.push({ view, params: p }),
    render: () => {},
    commit: (fn) => { const r = fn(state); store.save(); return r; },
  };
  return ctx;
}

test('tela: início cria os cartões e mostra o progresso das 5 lições', () => {
  const ctx = makeCtx();
  const view = renderVocabulario(ctx);
  assert.equal(ctx.state.vocabulario.cartoes.length, 154);
  assert.match(view.textContent, /77 palavras/);
  assert.match(view.textContent, /Lição 5/);
  view.find(byButton('Estudar agora')).click();
  assert.deepEqual(ctx.navigations.at(-1), { view: 'vocab', params: { modo: 'estudar' } });
});

test('tela: estudar esconde a resposta, mostrar revela pinyin, nota registra; teclado funciona', () => {
  const ctx = makeCtx(emptyState(), { modo: 'estudar' });
  let view = renderVocabulario(ctx);
  assert.match(view.textContent, /你/);
  assert.doesNotMatch(view.textContent, /nǐ/);
  view.find(byButton('Mostrar resposta')).click();
  view = renderVocabulario(ctx);
  assert.match(view.textContent, /nǐ/);
  assert.match(view.textContent, /você/);
  view.find(byButtonLike('Bom')).click();
  assert.equal(ctx.state.vocabulario.registro.at(-1).nota, 3);
  renderVocabulario(ctx);
  ctx.ui.keyHandler({ key: ' ', preventDefault() {} });
  renderVocabulario(ctx);
  ctx.ui.keyHandler({ key: '1' });
  assert.equal(ctx.state.vocabulario.registro.at(-1).nota, 1);
  renderVocabulario(ctx);
  ctx.ui.keyHandler({ key: 'z' });
  assert.equal(ctx.state.vocabulario.registro.length, 1);
});

test('tela: lista mostra todas as palavras por lição', () => {
  const view = renderVocabulario(makeCtx(emptyState(), { modo: 'lista' }));
  for (const p of PALAVRAS) assert.ok(view.textContent.includes(p.hanzi), p.hanzi);
});
