import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, byButton, byButtonLike } from './helpers/dom-shim.js';

installDom();

const { LICOES, PALAVRAS } = await import('../src/core/content/vocabLicoes.js');
const {
  sincronizarVocabulario, precisaSincronizarVocabulario, filaVocabulario, responderVocabulario, desfazerVocabulario,
  salvarConfigVocabulario, estatisticasVocabulario, suspenderVocabulario,
  liberarNovosHoje, montarTreino, configVocabulario, responderTreino, treinoDosErros, VOLTA_APOS,
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

test('tela: no modo foco oferece voltar ao app completo; fora dele, não', () => {
  const foco = makeCtx();
  foco.ui.foco = true;
  const view = renderVocabulario(foco);
  view.find(byButton('Abrir o app completo')).click();
  assert.deepEqual(foco.navigations.at(-1), { view: 'dashboard', params: {} });
  assert.doesNotMatch(renderVocabulario(makeCtx()).textContent, /Abrir o app completo/);
});

// ───────────────────────────── intensivo ─────────────────────────────

test('+10 novos hoje aumenta o limite só no dia, sem mudar o padrão', () => {
  const s = estado();
  for (let i = 0; i < 10; i += 1) {
    const f = filaVocabulario(s, { agora: minutos(INICIO, i) });
    responderVocabulario(s, f.proximo.id, 4, { agora: minutos(INICIO, i) });
  }
  assert.equal(filaVocabulario(s, { agora: minutos(INICIO, 20) }).contagem.novos, 0, 'limite normal esgotado');
  assert.equal(liberarNovosHoje(s, 10, { agora: INICIO }), 10);
  assert.equal(filaVocabulario(s, { agora: minutos(INICIO, 20) }).contagem.novos, 10);
  assert.equal(liberarNovosHoje(s, 10, { agora: INICIO }), 20, 'acumula no mesmo dia');
  assert.equal(configVocabulario(s).novosPorDia, 10, 'o padrão não muda');
  // Amanhã volta ao normal (10 novos), sem sobra de ontem.
  const amanha = filaVocabulario(s, { agora: dias(INICIO, 1) });
  assert.equal(amanha.contagem.novos, 10);
});

test('treino livre: errado volta alguns cartões depois até acertar; acerto sai', () => {
  const s = estado();
  const t = montarTreino(s, { licoes: [1], direcao: 'reconhecer', aleatorio: () => 0.99 });
  assert.equal(t.total, 7);
  const primeiro = t.fila[0];
  responderTreino(t, false);
  assert.equal(t.fila.length, 7, 'errado continua na fila');
  assert.deepEqual(t.fila[VOLTA_APOS], primeiro);
  while (t.fila.length) responderTreino(t, true);
  assert.equal(t.acertosDePrimeira, 6);
  assert.equal(t.respondidas, 8);
  assert.deepEqual(t.erradas, [primeiro]);
  const so = treinoDosErros(t);
  assert.equal(so.total, 1);
});

test('treino livre não mexe no agendamento nem no registro', () => {
  const s = estado();
  const antes = JSON.stringify(s.vocabulario);
  const t = montarTreino(s, { quais: 'todas' });
  assert.equal(t.total, 77);
  while (t.fila.length) responderTreino(t, Math.random() < 0.7);
  assert.equal(JSON.stringify(s.vocabulario), antes);
});

test('treino livre filtra estudadas e erradas', () => {
  const s = estado();
  assert.equal(montarTreino(s, { quais: 'estudadas' }).total, 0);
  responderVocabulario(s, '你:reconhecer', 3, { agora: INICIO });
  responderVocabulario(s, '您:reconhecer', 1, { agora: INICIO });
  assert.equal(montarTreino(s, { quais: 'estudadas' }).total, 2);
  const dif = montarTreino(s, { quais: 'dificeis' });
  assert.deepEqual(dif.fila.map((x) => x.palavra), ['您']);
});

test('tela: treino livre do início ao fim, com "só os que errei"', () => {
  const ctx = makeCtx();
  const inicio = renderVocabulario(ctx);
  inicio.find(byButton('Começar treino livre')).click();
  assert.deepEqual(ctx.navigations.at(-1), { view: 'vocab', params: { modo: 'treino' } });
  ctx.params = { modo: 'treino' };
  ctx.state.vocabulario.treino.fila = ctx.state.vocabulario.treino.fila.slice(0, 2);
  ctx.state.vocabulario.treino.total = 2;
  let view = renderVocabulario(ctx);
  assert.match(view.textContent, /Treino livre · 0\/2/);
  view.find(byButton('Mostrar resposta')).click();
  view = renderVocabulario(ctx);
  view.find(byButtonLike('Errei')).click();
  for (let i = 0; i < 3 && ctx.state.vocabulario.treino.fila.length; i += 1) {
    renderVocabulario(ctx);
    ctx.ui.keyHandler({ key: ' ', preventDefault() {} });
    renderVocabulario(ctx);
    ctx.ui.keyHandler({ key: ' ', preventDefault() {} });
  }
  view = renderVocabulario(ctx);
  assert.match(view.textContent, /Treino concluído/);
  assert.match(view.textContent, /1 de primeira/);
  view.find(byButton('Treinar só os que errei')).click();
  assert.equal(ctx.state.vocabulario.treino.total, 1);
  assert.equal(ctx.state.vocabulario.registro.length, 0, 'nada foi para o agendamento');
});

test('tela: ao terminar o dia oferece +10 novos e treino livre', () => {
  const ctx = makeCtx(emptyState(), { modo: 'estudar' });
  renderVocabulario(ctx);
  salvarConfigVocabulario(ctx.state, { novosPorDia: 0 });
  const view = renderVocabulario(ctx);
  assert.match(view.textContent, /Terminou por hoje/);
  view.find(byButton('+10 novos hoje')).click();
  assert.equal(ctx.state.vocabulario.config.extras.n, 10);
  assert.deepEqual(ctx.navigations.at(-1), { view: 'vocab', params: { modo: 'estudar' } });
});

test('treino livre sobrevive a recarregar: fica no estado salvo, com a mesma fila e o mesmo progresso', () => {
  const store = new Store(memoryBackend());
  const ctx = makeCtx(store.state);
  ctx.store = store;
  ctx.commit = (fn) => { const r = fn(store.state); store.save(); return r; };
  renderVocabulario(ctx).find(byButton('Começar treino livre')).click();
  ctx.params = { modo: 'treino' };
  let view = renderVocabulario(ctx);
  view.find(byButton('Mostrar resposta')).click();
  view = renderVocabulario(ctx);
  view.find(byButtonLike('Acertei')).click();
  const raw = store.backend.read();
  // "Recarregar": um Store novo lendo o que foi gravado, e uma interface sem memória.
  const depois = new Store(memoryBackend(raw));
  const ctx2 = makeCtx(depois.state, { modo: 'treino' });
  const tela = renderVocabulario(ctx2);
  assert.equal(depois.state.vocabulario.treino.respondidas, 1);
  assert.equal(depois.state.vocabulario.treino.fila.length, 76);
  assert.match(tela.textContent, /Treino livre · 1\/77/);
  assert.match(renderVocabulario(makeCtx(depois.state)).textContent, /Treino livre em andamento: faltam 76 de 77/);
});

test('irmãos no mesmo dia: desligado o produzir espera amanhã e a tela oferece liberar; ligado sai hoje', () => {
  const s = estado();
  salvarConfigVocabulario(s, { novosPorDia: 1 });
  responderVocabulario(s, '你:reconhecer', 4, { agora: INICIO });
  liberarNovosHoje(s, 1, { agora: INICIO });
  const f = filaVocabulario(s, { agora: minutos(INICIO, 1) });
  assert.equal(f.palavra.hanzi, '您', 'o produzir de 你 ficou para amanhã');
  assert.equal(f.irmaosEsperando, 1);
  salvarConfigVocabulario(s, { irmaosNoMesmoDia: true });
  const g = filaVocabulario(s, { agora: minutos(INICIO, 1) });
  assert.equal(g.proximo.id, '你:produzir');
  assert.equal(g.irmaosEsperando, 0);
});

test('tela: fim do dia com irmãos esperando oferece "Liberar hoje"', () => {
  const ctx = makeCtx(emptyState(), { modo: 'estudar' });
  renderVocabulario(ctx);
  // Só os dois cartões de 你 ativos, para o dia acabar logo depois do primeiro.
  for (const c of ctx.state.vocabulario.cartoes) if (c.palavra !== '你') suspenderVocabulario(ctx.state, c.id);
  salvarConfigVocabulario(ctx.state, { novosPorDia: 1 });
  responderVocabulario(ctx.state, '你:reconhecer', 4);
  assert.doesNotMatch(renderVocabulario(ctx).textContent, /outra direção/, 'sem vaga de novos, liberar não adiantaria');
  liberarNovosHoje(ctx.state, 1);
  const view = renderVocabulario(ctx);
  assert.match(view.textContent, /Terminou por hoje/);
  assert.match(view.textContent, /1 cartão\(ões\) da outra direção/);
  view.find(byButton('Liberar hoje')).click();
  assert.equal(ctx.state.vocabulario.config.irmaosNoMesmoDia, true);
  assert.equal(filaVocabulario(ctx.state).proximo.id, '你:produzir');
});
