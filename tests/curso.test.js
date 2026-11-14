import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, byButton, byButtonLike, byTag } from './helpers/dom-shim.js';

installDom();

const { LICOES, PALAVRAS, ULTIMA_LICAO_SABIDA } = await import('../src/core/content/vocabLicoes.js');
const { incorporarCurso, precisaIncorporarCurso, idCurso, DIAS_ESPALHAR } = await import('../src/core/curso.js');
const {
  fila, responder, liberarNovosHoje, salvarConfig, estatisticas, sincronizarCartoes,
} = await import('../src/core/baralho.js');
const {
  montarTreino, responderTreino, treinoDosErros, salvarTreino, treinoAtual, VOLTA_APOS, origemDe,
} = await import('../src/core/treino.js');
const { emptyState, Store, memoryBackend } = await import('../src/core/storage.js');
const { mergeStates } = await import('../src/core/merge.js');
const { buildBriefing } = await import('../src/core/briefing.js');
const { estimateAllSkills } = await import('../src/core/skills.js');
const { removeDraft } = await import('../src/core/flashcards.js');
const { dayKey } = await import('../src/core/xp.js');
const { renderBaralho } = await import('../src/ui/baralho.js');

const INICIO = new Date(2026, 10, 9, 9, 0, 0);
const minutos = (d, n) => new Date(d.getTime() + n * 60000);
const dias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const NPAL = PALAVRAS.length;
/** Palavras das lições que ele declarou saber (1–7 desde 2026-11-14): nascem "já sabidas". */
const NSAB = PALAVRAS.filter((p) => p.licao <= ULTIMA_LICAO_SABIDA).length;
const N15 = PALAVRAS.filter((p) => p.licao <= 5).length;

/** Cartão da antiga aba Vocabulário, já estudado. */
function cartaoVocab(hanzi, modelo, extra = {}) {
  return {
    id: `${hanzi}:${modelo}`, palavra: hanzi, modelo, estado: 'revisao', due: dias(INICIO, 5).toISOString(),
    s: 6.5, d: 4.2, passo: 0, intervaloDias: 6, reps: 3, lapsos: 1, ultimaRevisao: dias(INICIO, -1).toISOString(),
    suspenso: false, criadoEm: dias(INICIO, -10).toISOString(), ...extra,
  };
}

test('lista do curso: 7 lições, palavras únicas, todas com pinyin e tradução', () => {
  assert.deepEqual(LICOES.map((l) => l.numero), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(N15, 84, '77 da lista original + 7 da revisão para a prova');
  assert.equal(ULTIMA_LICAO_SABIDA, 7, 'ele já estudou as lições 6–7 em aula');
  assert.equal(NSAB, NPAL);
  assert.ok(NPAL > 250, `lições 6 e 7 dos slides: ${NPAL}`);
  // Vocabulário oficial primeiro, extras dos slides no fim da fila de novos.
  const primeiroExtra = PALAVRAS.findIndex((p) => p.extra);
  assert.ok(PALAVRAS.slice(primeiroExtra).every((p) => p.extra));
  assert.ok(PALAVRAS.filter((p) => p.pronuncia).every((p) => p.extra && p.licao === 7));
  for (const p of PALAVRAS) assert.doesNotMatch(p.pinyin, /ɡ/, `${p.hanzi}: pinyin com g comum, não o ɡ dos slides`);
  assert.equal(new Set(PALAVRAS.map((p) => p.hanzi)).size, NPAL, 'sem palavra repetida');
  for (const p of PALAVRAS) {
    assert.ok(p.pinyin && p.pt, `${p.hanzi} tem pinyin e tradução`);
    assert.match(p.hanzi, /^[一-鿿]+$/);
  }
});

test('aparelho novo: as lições sabidas entram como já sabidas, espalhadas, sem inventar respostas', () => {
  const s = emptyState();
  assert.equal(precisaIncorporarCurso(s), true);
  const rel = incorporarCurso(s, { agora: INICIO });
  assert.equal(rel.rascunhos, NPAL);
  assert.equal(rel.jaSabidos, NSAB * 2);
  assert.equal(rel.novos, (NPAL - NSAB) * 2);
  assert.equal(s.cardDrafts.length, NPAL);
  assert.ok(s.cardDrafts.every((d) => d.status === 'approved' && d.id === idCurso(d.front) && d.tags.includes('curso')));
  assert.equal(s.deck.cartoes.length, NPAL * 2);
  const licao = new Map(PALAVRAS.map((p) => [idCurso(p.hanzi), p.licao]));
  const sabidos = s.deck.cartoes.filter((c) => licao.get(c.draftId) <= ULTIMA_LICAO_SABIDA);
  const novos = s.deck.cartoes.filter((c) => licao.get(c.draftId) > ULTIMA_LICAO_SABIDA);
  assert.ok(sabidos.every((c) => c.estado === 'revisao' && c.conhecidoDeclarado && c.reps === 0));
  assert.ok(novos.every((c) => c.estado === 'novo' && !c.conhecidoDeclarado), 'lição além da sabida não é declarada');
  assert.equal(s.deck.licoesSabidasAte, ULTIMA_LICAO_SABIDA);
  assert.equal(s.deck.registro.length, 0, 'declarar que sabe não é responder');
  assert.equal(precisaIncorporarCurso(s), false);

  // Nada vence hoje; reconhecer na primeira semana, produzir na segunda.
  const hoje = dayKey(INICIO);
  const diaDe = (c) => Math.round((Date.parse(c.due) - Date.parse(`${hoje}T00:00:00`)) / 86400000);
  const rec = sabidos.filter((c) => c.modelo === 'reconhecer').map(diaDe);
  const prod = sabidos.filter((c) => c.modelo === 'produzir').map(diaDe);
  assert.ok(rec.every((d) => d >= 1 && d <= DIAS_ESPALHAR));
  assert.ok(prod.every((d) => d > DIAS_ESPALHAR && d <= DIAS_ESPALHAR * 2));
  const hojeFila = fila(s, { agora: INICIO });
  assert.equal(hojeFila.contagem.revisao, 0, 'hoje nada do que ele sabe cobra revisão');
  assert.equal(hojeFila.contagem.novos, 0, 'nada do curso fica na fila de novos');
  const amanha = fila(s, { agora: dias(INICIO, 1) });
  assert.ok(amanha.contagem.revisao > 0 && amanha.contagem.revisao <= Math.ceil(NSAB / DIAS_ESPALHAR));
  const primeiraRevisao = sabidos.slice().sort((x, y) => x.due.localeCompare(y.due) || x.criadoEm.localeCompare(y.criadoEm))[0];
  assert.equal(primeiraRevisao.draftId, idCurso('你'), 'ordem das lições');

  // Não é proficiência.
  assert.ok(estimateAllSkills(s).every((x) => x.status === 'nao_avaliada'));
  // Idempotente.
  const antes = JSON.stringify(s.deck);
  incorporarCurso(s, { agora: dias(INICIO, 3) });
  assert.equal(JSON.stringify(s.deck), antes);
});

test('o progresso da antiga aba Vocabulário vai junto, com o registro de respostas', () => {
  const s = emptyState();
  s.vocabulario.cartoes.push(cartaoVocab('你', 'reconhecer'), { ...cartaoVocab('你', 'produzir'), estado: 'novo', s: null, d: null, ultimaRevisao: null });
  s.vocabulario.registro.push({
    id: 'voc_1', at: dias(INICIO, -1).toISOString(), cartaoId: '你:reconhecer', palavra: '你', modelo: 'reconhecer',
    nota: 3, estadoAntes: 'revisao', intervaloDias: 6, s: 6.5, d: 4.2, duracaoMs: 3000, anterior: {},
  });
  s.vocabulario.treino = { fila: [{ palavra: '你', modelo: 'reconhecer' }] };
  const rel = incorporarCurso(s, { agora: INICIO });
  assert.equal(rel.migrados, 1);
  assert.equal(rel.registro, 1);
  const c = s.deck.cartoes.find((x) => x.id === `${idCurso('你')}:reconhecer`);
  assert.equal(c.s, 6.5);
  assert.equal(c.reps, 3);
  assert.equal(c.lapsos, 1);
  assert.equal(c.due, dias(INICIO, 5).toISOString());
  assert.ok(!('palavra' in c));
  assert.ok(!c.conhecidoDeclarado);
  // O irmão nunca estudado entra como já sabido.
  assert.ok(s.deck.cartoes.find((x) => x.id === `${idCurso('你')}:produzir`).conhecidoDeclarado);
  // Ainda há "reconhecer" por estudar, então o "produzir" fica para a segunda semana.
  const dueProd = s.deck.cartoes.find((x) => x.id === `${idCurso('你')}:produzir`).due;
  assert.ok(dueProd >= dias(INICIO, DIAS_ESPALHAR).toISOString().slice(0, 10));
  const r = s.deck.registro[0];
  assert.equal(r.draftId, idCurso('你'));
  assert.equal(r.cartaoId, `${idCurso('你')}:reconhecer`);
  assert.ok(!('anterior' in r), 'desfazer não atravessa a mudança');
  assert.deepEqual(s.vocabulario, { cartoes: [], registro: [], config: {} }, 'a aba antiga fica vazia');
  assert.ok(estatisticas(s, { agora: INICIO }).revisoesPeriodo >= 1, 'a resposta antiga conta na retenção');
});

test('se todo "reconhecer" já foi estudado, o "produzir" sabido começa amanhã', () => {
  const s = emptyState();
  for (const p of PALAVRAS) s.vocabulario.cartoes.push(cartaoVocab(p.hanzi, 'reconhecer'));
  incorporarCurso(s, { agora: INICIO });
  const prod = s.deck.cartoes.filter((c) => c.modelo === 'produzir');
  assert.equal(prod.length, NPAL);
  const primeiro = prod.map((c) => c.due).sort()[0];
  assert.equal(dayKey(new Date(primeiro)), dayKey(dias(INICIO, 1)));
});

test('palavra que já estava no baralho é aproveitada; excluída não volta', () => {
  const s = emptyState();
  s.cardDrafts.push(
    { id: 'card_x', front: '你', back: 'tu', pinyin: 'nǐ', status: 'approved', tags: ['gerado'], createdAt: INICIO.toISOString() },
    { id: 'card_y', front: '您', back: 'senhor', pinyin: 'nín', status: 'rejected', createdAt: INICIO.toISOString() },
  );
  incorporarCurso(s, { agora: INICIO });
  assert.equal(s.cardDrafts.filter((d) => d.front === '你').length, 1, 'sem duplicata');
  const ni = s.cardDrafts.find((d) => d.front === '你');
  assert.equal(ni.id, 'card_x');
  assert.ok(ni.tags.includes('curso') && ni.tags.includes('gerado'));
  assert.equal(ni.back, 'tu', 'o que ele editou fica');
  assert.ok(!s.cardDrafts.some((d) => d.front === '您' && d.status !== 'rejected'), 'rejeitada continua rejeitada');

  // Excluir pelo baralho (ou apagar o rascunho) não faz a palavra voltar.
  removeDraft(s, idCurso('零'));
  incorporarCurso(s, { agora: dias(INICIO, 1) });
  assert.ok(!s.cardDrafts.some((d) => d.front === '零'));
});

test('palavra que entrar na lista depois (lição nova) vira cartão novo, não sabido', () => {
  const s = emptyState();
  incorporarCurso(s, { agora: INICIO });
  // Simula uma palavra que ainda não existia na primeira vez.
  s.deck.cursoIncluido = s.deck.cursoIncluido.filter((hz) => hz !== '八');
  s.cardDrafts = s.cardDrafts.filter((d) => d.front !== '八');
  s.deck.cartoes = s.deck.cartoes.filter((c) => c.draftId !== idCurso('八'));
  const rel = incorporarCurso(s, { agora: dias(INICIO, 2) });
  assert.equal(rel.novos, 2);
  const cs = s.deck.cartoes.filter((c) => c.draftId === idCurso('八'));
  assert.equal(cs.length, 2);
  assert.ok(cs.every((c) => c.estado === 'novo'));
});

test('na primeira vez, cartões de pacote que estavam pendentes entram; texto colado continua pendente', () => {
  const s = emptyState();
  s.cardDrafts.push(
    { id: 'p1', front: '饺子', back: 'guioza', status: 'pending', source: 'pacote 2026-11-08 (gerado por x)', createdAt: INICIO.toISOString() },
    { id: 't1', front: '地铁', back: 'metrô', status: 'pending', source: 'texto colado', createdAt: INICIO.toISOString() },
  );
  const rel = incorporarCurso(s, { agora: INICIO });
  assert.equal(rel.pacotesAprovados, 1);
  assert.equal(s.cardDrafts.find((d) => d.id === 'p1').status, 'approved');
  assert.equal(s.cardDrafts.find((d) => d.id === 't1').status, 'pending');
  assert.ok(s.deck.cartoes.filter((c) => c.draftId === 'p1').every((c) => c.estado === 'novo'), 'pacote entra como desconhecido');
});

test('dois aparelhos: mesmo id, a mesclagem junta; aparelho antigo traz progresso do Vocabulário', () => {
  const a = emptyState();
  incorporarCurso(a, { agora: INICIO });
  const b = emptyState();
  incorporarCurso(b, { agora: minutos(INICIO, 5) });
  const { state } = mergeStates(a, b);
  assert.equal(state.cardDrafts.length, NPAL);
  assert.equal(state.deck.cartoes.length, NPAL * 2);
  assert.equal(state.deck.cursoIncluido.length, NPAL);

  // Aparelho que ainda está na versão antiga: só tem a aba Vocabulário.
  const antigo = emptyState();
  antigo.vocabulario.cartoes.push(cartaoVocab('五', 'reconhecer', { ultimaRevisao: dias(INICIO, 1).toISOString(), s: 9 }));
  const junto = mergeStates(state, antigo).state;
  assert.equal(precisaIncorporarCurso(junto), true);
  incorporarCurso(junto, { agora: dias(INICIO, 1) });
  assert.equal(junto.deck.cartoes.find((c) => c.id === `${idCurso('五')}:reconhecer`).s, 9, 'a revisão mais recente vence');
  assert.equal(junto.deck.cartoes.length, NPAL * 2);
});

test('briefing: palavras do curso vão como vistas e não são sugeridas como novas', () => {
  const s = emptyState();
  incorporarCurso(s, { agora: INICIO });
  const b = buildBriefing(s, { date: dayKey(INICIO) });
  for (const p of PALAVRAS) assert.ok(b.seenWords.includes(p.hanzi), p.hanzi);
  assert.ok(b.candidateWords.every((c) => !PALAVRAS.some((p) => p.hanzi === c.hz)));
  // Com muitas palavras vistas, o corte não leva as do curso.
  for (let i = 0; i < 500; i += 1) s.schedule.items[`词${i}`] = { ref: `词${i}`, type: 'word', introducedAt: INICIO.toISOString() };
  const cheio = buildBriefing(s, { date: dayKey(INICIO) });
  assert.ok(PALAVRAS.every((p) => cheio.seenWords.includes(p.hanzi)));
});

// ───────────────────────────── intensivo no baralho ─────────────────────────────

/** Baralho com duas palavras novas (fora do curso). */
function baralhoSimples() {
  const s = emptyState();
  s.deck.cursoIncluido = PALAVRAS.map((p) => p.hanzi);
  s.cardDrafts.push(
    { id: 'a', front: '踢球', back: 'jogar bola', pinyin: 'tī qiú', status: 'approved', source: 'pacote 2026-11-08', createdAt: '2026-10-01T00:00:00Z' },
    { id: 'b', front: '地铁', back: 'metrô', pinyin: 'dìtiě', status: 'approved', source: 'adicionado no baralho', createdAt: '2026-10-02T00:00:00Z' },
  );
  sincronizarCartoes(s, { agora: dias(INICIO, -1) });
  return s;
}

test('+10 novos hoje aumenta o limite só no dia', () => {
  const s = baralhoSimples();
  salvarConfig(s, { novosPorDia: 1 });
  const r = responder(s, fila(s, { agora: INICIO }).proximo.id, 4, { agora: INICIO });
  assert.ok(r);
  assert.equal(fila(s, { agora: minutos(INICIO, 1) }).contagem.novos, 0, 'limite de 1 atingido');
  liberarNovosHoje(s, 10, { agora: INICIO });
  assert.equal(fila(s, { agora: minutos(INICIO, 1) }).contagem.novos, 1);
  liberarNovosHoje(s, 10, { agora: INICIO });
  assert.equal(fila(s, { agora: dias(INICIO, 1) }).contagem.novos, 1, 'amanhã volta ao limite de 1');
});

test('irmãos no mesmo dia: desligado espera amanhã e avisa; ligado libera', () => {
  const s = baralhoSimples();
  const f = fila(s, { agora: INICIO });
  responder(s, f.proximo.id, 4, { agora: INICIO });
  responder(s, fila(s, { agora: INICIO }).proximo.id, 4, { agora: INICIO });
  const fim = fila(s, { agora: minutos(INICIO, 2) });
  assert.equal(fim.proximo, null);
  assert.equal(fim.irmaosEsperando, 2);
  salvarConfig(s, { irmaosNoMesmoDia: true });
  assert.ok(fila(s, { agora: minutos(INICIO, 2) }).proximo, 'o produzir sai hoje');
});

test('treino livre: filtra por hoje e por origem, não toca no agendamento', () => {
  const s = baralhoSimples();
  incorporarCurso(s); // sem efeito: curso marcado como incluído
  const f = fila(s, { agora: INICIO });
  responder(s, f.proximo.id, 3, { agora: INICIO });
  const antes = JSON.stringify(s.deck);
  const todos = montarTreino(s, { agora: INICIO, aleatorio: () => 0.1 });
  assert.equal(todos.total, 2);
  assert.ok(todos.fila.every((x) => x.modelo === 'reconhecer'));
  const hoje = montarTreino(s, { quais: 'hoje', agora: INICIO });
  assert.deepEqual(hoje.fila.map((x) => x.draftId), [f.rascunho.id]);
  assert.equal(montarTreino(s, { quais: 'hoje', agora: dias(INICIO, 1) }).total, 0);
  assert.deepEqual(montarTreino(s, { origem: 'pacotes' }).fila.map((x) => x.draftId), ['a']);
  assert.deepEqual(montarTreino(s, { origem: 'outras', direcao: 'produzir' }).fila, [{ draftId: 'b', modelo: 'produzir' }]);
  assert.equal(origemDe({ tags: ['curso'] }), 'curso');
  assert.equal(JSON.stringify(s.deck), antes, 'montar o treino não mexe no baralho');
});

test('treino livre: errado volta depois de alguns cartões até acertar; refazer só os erros', () => {
  const s = emptyState();
  incorporarCurso(s, { agora: INICIO });
  const t = montarTreino(s, { origem: 'curso', aleatorio: () => 0.3 });
  assert.equal(t.total, NPAL);
  const primeiro = t.fila[0];
  responderTreino(t, false);
  assert.deepEqual(t.fila[VOLTA_APOS], primeiro);
  for (let i = 0; i < VOLTA_APOS; i += 1) responderTreino(t, true);
  responderTreino(t, true);
  assert.equal(t.erradas.length, 1);
  assert.equal(t.acertosDePrimeira, VOLTA_APOS);
  const deNovo = treinoDosErros(t);
  assert.deepEqual(deNovo.fila, [primeiro]);
});

test('treino salvo sobrevive a recarregar; cartão excluído sai da fila', () => {
  const backend = memoryBackend();
  const store = new Store(backend);
  incorporarCurso(store.state, { agora: INICIO });
  salvarTreino(store.state, montarTreino(store.state, { origem: 'curso' }));
  store.save();
  const recarregado = new Store(backend);
  assert.equal(treinoAtual(recarregado.state).fila.length, NPAL);
  recarregado.state.cardDrafts.find((d) => d.id === idCurso('你')).status = 'rejected';
  assert.equal(treinoAtual(recarregado.state).fila.length, NPAL - 1);
  // A mesclagem não leva o treino.
  assert.ok(!('treino' in mergeStates(recarregado.state, emptyState()).state.deck));
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

test('tela: abrir o baralho num aparelho novo traz o curso e avisa o que fez', () => {
  const ctx = makeCtx();
  const view = renderBaralho(ctx);
  assert.equal(ctx.state.deck.cartoes.length, NPAL * 2);
  assert.match(ctx.toasts.at(-1).m, new RegExp(`${NSAB * 2} cartões das lições do curso entraram como já sabidos`));
  assert.doesNotMatch(ctx.toasts.at(-1).m, /cartões novos do curso/);
  assert.match(view.textContent, /Treino livre/);
  assert.match(view.textContent, /Palavras do curso/);
  renderBaralho(ctx);
  assert.equal(ctx.toasts.length, 1, 'avisa uma vez só');
});

test('tela: treino livre do começo ao fim, sem mexer no agendamento', () => {
  const ctx = makeCtx();
  renderBaralho(ctx);
  const antes = JSON.stringify(ctx.state.deck.cartoes);
  const inicio = renderBaralho(ctx);
  const [quais, origem] = inicio.findAll(byTag('select'));
  origem.value = 'curso';
  origem.dispatch?.('change');
  quais.value = 'todas';
  inicio.find(byButton('Começar treino livre')).click();
  assert.deepEqual(ctx.navigations.at(-1), { view: 'deck', params: { modo: 'treino' } });
  ctx.params = { modo: 'treino' };
  let view = renderBaralho(ctx);
  assert.match(view.textContent, new RegExp(`Treino livre · 0/${NPAL}`));
  view.find(byButton('Mostrar resposta')).click();
  view = renderBaralho(ctx);
  view.find(byButtonLike('Errei')).click();
  view = renderBaralho(ctx);
  ctx.ui.keyHandler({ key: ' ', preventDefault() {} });
  renderBaralho(ctx);
  ctx.ui.keyHandler({ key: ' ', preventDefault() {} });
  assert.equal(treinoAtual(ctx.state).respondidas, 2);
  assert.equal(JSON.stringify(ctx.state.deck.cartoes), antes);
  // Termina o treino acertando o resto.
  while (treinoAtual(ctx.state).fila.length) responderTreino(treinoAtual(ctx.state), true);
  view = renderBaralho(ctx);
  assert.match(view.textContent, /Treino concluído/);
  view.find(byButton('Treinar só os que errei')).click();
  assert.equal(treinoAtual(ctx.state).total, 1);
});

test('tela: fim do estudo oferece treino do que viu hoje e liberar irmãos', () => {
  const s = baralhoSimples();
  s.profile.onboardingDone = true;
  const ctx = makeCtx(s, { modo: 'estudar' });
  for (let i = 0; i < 2; i += 1) {
    const f = fila(ctx.state);
    responder(ctx.state, f.proximo.id, 4);
  }
  const view = renderBaralho(ctx);
  assert.match(view.textContent, /2 cartão\(ões\) da outra direção/);
  view.find(byButton('Treino livre do que vi hoje')).click();
  assert.equal(treinoAtual(ctx.state).total, 2);
  renderBaralho(ctx).find(byButton('Liberar hoje')).click();
  assert.equal(ctx.state.deck.config.irmaosNoMesmoDia, true);
});

test('tela: o cartão do curso mostra a nota de uso no verso', () => {
  const s = emptyState();
  incorporarCurso(s, { agora: INICIO });
  const comNota = PALAVRAS.find((p) => p.nota);
  const ctx = makeCtx(s, { modo: 'treino' });
  salvarTreino(s, { fila: [{ draftId: idCurso(comNota.hanzi), modelo: 'reconhecer' }], total: 1, respondidas: 0, acertosDePrimeira: 0, erradas: [], jaErrou: [] });
  renderBaralho(ctx).find(byButton('Mostrar resposta')).click();
  assert.ok(renderBaralho(ctx).textContent.includes(comNota.nota));
});

test('léxico base inclui as palavras do curso; a entrada escrita à mão vence; par de pronúncia fica fora dos sorteios', async () => {
  const { lookup, allEntries, ehVocabulario } = await import('../src/core/content/lexicon.js');
  for (const p of PALAVRAS) assert.ok(lookup(p.hanzi), `${p.hanzi} no léxico`);
  assert.equal(lookup('谢谢').tags.includes('curso'), false, 'base escrita à mão não é sobrescrita');
  assert.deepEqual(lookup('香蕉').tags, ['curso', 'licao-6']);
  assert.equal(lookup('香蕉').level, 2);
  assert.equal(lookup('猕猴桃').level, 3, 'extra dos slides é nível 3');
  assert.ok(lookup('牺牲').tags.includes('pronuncia'));
  const sorteaveis = allEntries().filter(ehVocabulario).map((e) => e.hz);
  assert.ok(!sorteaveis.includes('白痴') && !sorteaveis.includes('蒿子秆') && sorteaveis.includes('图书馆'));
});

test('lições 6–7 passam a sabidas num aparelho que já as tinha como novas: só o que nunca foi respondido muda', () => {
  // Estado como o do celular na versão anterior: curso incorporado, lições 6–7 novas.
  const s = emptyState();
  incorporarCurso(s, { agora: INICIO });
  const licao = new Map(PALAVRAS.map((p) => [idCurso(p.hanzi), p.licao]));
  s.deck.cartoes = s.deck.cartoes.filter((c) => licao.get(c.draftId) <= 5);
  delete s.deck.licoesSabidasAte;
  sincronizarCartoes(s, { agora: INICIO });
  assert.ok(s.deck.cartoes.filter((c) => licao.get(c.draftId) > 5).every((c) => c.estado === 'novo'));
  // Ele já estudou 想 (reconhecer) no baralho: esse cartão não pode ser tocado.
  const estudado = s.deck.cartoes.find((c) => c.draftId === idCurso('想') && c.modelo === 'reconhecer');
  Object.assign(estudado, { estado: 'revisao', reps: 2, s: 3.1, due: dias(INICIO, 4).toISOString(), ultimaRevisao: INICIO.toISOString() });
  s.deck.registro.push({ id: 'r1', cartaoId: estudado.id, draftId: estudado.draftId, at: INICIO.toISOString(), nota: 3, estadoAntes: 'novo' });
  const licoes15 = JSON.stringify(s.deck.cartoes.filter((c) => licao.get(c.draftId) <= 5));
  const copiaEstudado = JSON.stringify(estudado);

  const depois = dias(INICIO, 2);
  assert.equal(precisaIncorporarCurso(s), true);
  const rel = incorporarCurso(s, { agora: depois });
  assert.equal(rel.jaSabidos, (NPAL - N15) * 2 - 1);
  assert.equal(rel.novos, 0);
  assert.equal(s.deck.licoesSabidasAte, 7);
  assert.equal(JSON.stringify(s.deck.cartoes.find((c) => c.id === estudado.id)), copiaEstudado, 'cartão respondido intacto');
  assert.equal(JSON.stringify(s.deck.cartoes.filter((c) => licao.get(c.draftId) <= 5)), licoes15, 'lições 1–5 intactas');
  const convertidos = s.deck.cartoes.filter((c) => licao.get(c.draftId) > 5 && c.id !== estudado.id);
  assert.ok(convertidos.every((c) => c.estado === 'revisao' && c.conhecidoDeclarado && c.reps === 0));
  const diaDe = (c) => Math.round((Date.parse(c.due) - Date.parse(`${dayKey(depois)}T00:00:00`)) / 86400000);
  assert.ok(convertidos.filter((c) => c.modelo === 'reconhecer').every((c) => diaDe(c) >= 1 && diaDe(c) <= DIAS_ESPALHAR));
  assert.ok(convertidos.filter((c) => c.modelo === 'produzir').every((c) => diaDe(c) > DIAS_ESPALHAR && diaDe(c) <= DIAS_ESPALHAR * 2));
  assert.equal(s.deck.registro.length, 1, 'declarar não cria respostas');
  assert.equal(fila(s, { agora: depois }).contagem.novos, 0, 'fila de novos livre para o pacote');

  // Idempotente, e a mesclagem com o aparelho antigo não faz converter de novo.
  assert.equal(precisaIncorporarCurso(s), false);
  const antes = JSON.stringify(s.deck);
  incorporarCurso(s, { agora: dias(depois, 1) });
  assert.equal(JSON.stringify(s.deck), antes);
  const velho = emptyState();
  velho.deck = { ...velho.deck, cursoIncluido: [...s.deck.cursoIncluido] };
  assert.equal(mergeStates(velho, s).state.deck.licoesSabidasAte, 7);
});

test('reavaliação: cobra o vocabulário oficial do curso em estudo, nunca os extras nem cartões novos', async () => {
  const { buildWeeklyAssessment, assessmentStatus } = await import('../src/core/assessment.js');
  const s = emptyState();
  assert.equal(assessmentStatus(s).due, false, 'sem nada estudado não dá para montar');
  incorporarCurso(s, { agora: INICIO });
  const oficiais = new Set(PALAVRAS.filter((p) => !p.extra).map((p) => p.hanzi));
  const extras = new Set(PALAVRAS.filter((p) => p.extra).map((p) => p.hanzi));
  assert.notEqual(assessmentStatus(s).reason, 'Ainda há poucos itens estudados para montar uma reavaliação com itens novos.');
  const alvos = [];
  for (let seed = 1; seed <= 20; seed += 1) {
    const a = buildWeeklyAssessment(s, { seed });
    alvos.push(...a.items.filter((i) => i.skill === 'vocabulary').flatMap((i) => i.targets || [i.ref]));
  }
  assert.ok(alvos.length > 0);
  assert.ok(alvos.every((hz) => oficiais.has(hz) && !extras.has(hz)), `só oficiais: ${alvos.filter((hz) => !oficiais.has(hz))}`);
  // Cartão ainda novo não conta como estudado.
  for (const c of s.deck.cartoes) if (c.draftId === idCurso('香蕉')) Object.assign(c, { estado: 'novo', conhecidoDeclarado: false });
  for (let seed = 1; seed <= 20; seed += 1) {
    assert.ok(!buildWeeklyAssessment(s, { seed }).items.some((i) => (i.targets || []).includes('香蕉') || i.ref === '香蕉'));
  }
});
