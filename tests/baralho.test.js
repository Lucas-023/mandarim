import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PESOS_PADRAO, retencao, intervaloPara, memoriaInicial, revisar, estabilidadeAposErro,
} from '../src/core/fsrs.js';
import {
  configBaralho, sincronizarCartoes, precisaSincronizar, agendar, previsoes, fila, responder, desfazer,
  suspender, esquecer, salvarConfig, estatisticas, SANGUESSUGA, REVISOES_PARA_XP,
} from '../src/core/baralho.js';
import { emptyState, migrate } from '../src/core/storage.js';
import { mergeStates } from '../src/core/merge.js';
import { introduceItems, getItem } from '../src/core/schedule.js';
import { estimateAllSkills } from '../src/core/skills.js';
import { totalXp } from '../src/core/xp.js';

const INICIO = new Date(2026, 9, 20, 9, 0, 0);
const minutos = (data, n) => new Date(data.getTime() + n * 60000);
const dias = (data, n) => { const d = new Date(data); d.setDate(d.getDate() + n); return d; };

function rascunho(id, front, extra = {}) {
  return { id, front, back: `significado de ${front}`, pinyin: 'pīn', status: 'approved', createdAt: `2026-10-0${id.length % 9 + 1}T00:00:00Z`, ...extra };
}

function estadoCom(...rascunhos) {
  const s = emptyState();
  s.cardDrafts.push(...rascunhos);
  sincronizarCartoes(s, { agora: INICIO });
  return s;
}

const cartaoNovo = () => ({
  id: 'x:reconhecer', draftId: 'x', modelo: 'reconhecer', estado: 'novo', due: null, s: null, d: null,
  passo: 0, intervaloDias: 0, reps: 0, lapsos: 0, ultimaRevisao: null, suspenso: false, criadoEm: INICIO.toISOString(),
});

// ───────────────────────────── FSRS ─────────────────────────────

test('FSRS: com retenção de 90%, o intervalo é a própria estabilidade', () => {
  assert.ok(Math.abs(retencao(10, 10) - 0.9) < 1e-9);
  assert.ok(Math.abs(intervaloPara(10, 0.9) - 10) < 1e-9);
  assert.ok(intervaloPara(10, 0.95) < 10, 'retenção mais alta encurta o intervalo');
});

test('FSRS: primeira resposta usa os pesos padrão (Errei < Difícil < Bom < Fácil)', () => {
  const s = [1, 2, 3, 4].map((n) => memoriaInicial(n).s);
  assert.deepEqual(s, PESOS_PADRAO.slice(0, 4));
  const d = [1, 2, 3, 4].map((n) => memoriaInicial(n).d);
  assert.ok(d[0] > d[1] && d[1] > d[2] && d[2] > d[3], 'errar de cara marca o cartão como mais difícil');
  assert.ok(d.every((x) => x >= 1 && x <= 10));
});

test('FSRS: lembrar aumenta a estabilidade, esquecer nunca a aumenta', () => {
  const mem = { s: 10, d: 5 };
  const bom = revisar(mem, 10, 3);
  const dificil = revisar(mem, 10, 2);
  const facil = revisar(mem, 10, 4);
  assert.ok(dificil.s > 10 && bom.s > dificil.s && facil.s > bom.s);
  assert.ok(revisar(mem, 10, 1).s <= 10);
  assert.ok(estabilidadeAposErro(5, 2, 0.1) <= 2);
  // Lembrar quando já ia esquecer (mais dias) rende mais estabilidade.
  assert.ok(revisar(mem, 20, 3).s > revisar(mem, 5, 3).s);
});

// ───────────────────────────── ciclo de um cartão ─────────────────────────────

test('cartão novo: passos de 1 e 10 minutos, e "Bom" no último passo forma com 4 dias', () => {
  const cfg = configBaralho({});
  const c0 = cartaoNovo();
  assert.deepEqual(previsoes(c0, cfg, INICIO), { 1: '1 min', 2: '6 min', 3: '10 min', 4: '14 d' });
  const c1 = agendar(c0, 3, cfg, INICIO);
  assert.equal(c1.estado, 'aprendendo');
  assert.equal(c1.passo, 1);
  const c2 = agendar(c1, 3, cfg, minutos(INICIO, 11));
  assert.equal(c2.estado, 'revisao');
  assert.equal(c2.intervaloDias, 4);
  assert.equal(new Date(c2.due).getDate(), 24);
});

test('a memória só muda na primeira resposta do dia (como no FSRS-4.5)', () => {
  const cfg = configBaralho({});
  const c1 = agendar(cartaoNovo(), 3, cfg, INICIO);
  const c2 = agendar(c1, 1, cfg, minutos(INICIO, 2));
  assert.equal(c2.s, c1.s);
  assert.equal(c2.d, c1.d);
  assert.equal(c2.passo, 0, 'errar volta ao primeiro passo');
});

test('revisão: Difícil < Bom < Fácil sempre, e errar vai ao reaprendizado com recaída contada', () => {
  const cfg = configBaralho({});
  let c = agendar(agendar(cartaoNovo(), 3, cfg, INICIO), 3, cfg, minutos(INICIO, 11));
  const quando = dias(INICIO, 4);
  const ivl = Object.fromEntries([2, 3, 4].map((n) => [n, agendar(c, n, cfg, quando).intervaloDias]));
  assert.ok(ivl[2] < ivl[3] && ivl[3] < ivl[4], JSON.stringify(ivl));
  c = agendar(c, 1, cfg, quando);
  assert.equal(c.estado, 'reaprendendo');
  assert.equal(c.lapsos, 1);
  assert.equal(previsoes(c, cfg, minutos(quando, 11))[1], '10 min');
});

test(`cartão vira problemático depois de ${SANGUESSUGA} recaídas`, () => {
  const cfg = configBaralho({});
  let c = agendar(cartaoNovo(), 4, cfg, INICIO);
  let quando = INICIO;
  for (let i = 0; i < SANGUESSUGA; i += 1) {
    quando = dias(quando, c.intervaloDias || 1);
    c = agendar(c, 1, cfg, quando);
    c = agendar(c, 3, cfg, minutos(quando, 11));
  }
  assert.equal(c.lapsos, SANGUESSUGA);
  assert.equal(c.sanguessuga, true);
});

// ───────────────────────────── cartões a partir dos rascunhos ─────────────────────────────

test('rascunho aprovado vira um cartão por tipo ligado; pendente não entra; rejeitado sai', () => {
  const s = estadoCom(rascunho('a', '踢球'), rascunho('b', '传球', { status: 'pending' }));
  assert.deepEqual(s.deck.cartoes.map((c) => c.id).sort(), ['a:produzir', 'a:reconhecer']);
  assert.equal(precisaSincronizar(s), false);

  salvarConfig(s, { modelos: { ouvir: true } });
  assert.equal(precisaSincronizar(s), true);
  sincronizarCartoes(s);
  assert.equal(s.deck.cartoes.length, 3);

  // Desligar um tipo esconde, não apaga (o histórico volta ao religar).
  salvarConfig(s, { modelos: { ouvir: false } });
  sincronizarCartoes(s);
  assert.equal(s.deck.cartoes.length, 3);
  assert.ok(!fila(s, { agora: INICIO }).proximo?.id.endsWith(':ouvir'));

  s.cardDrafts[0].status = 'rejected';
  sincronizarCartoes(s);
  assert.equal(s.deck.cartoes.length, 0);
});

test('editar o rascunho muda o cartão sem perder o agendamento (fonte única)', () => {
  const s = estadoCom(rascunho('a', '踢球'));
  responder(s, 'a:reconhecer', 3, { agora: INICIO });
  s.cardDrafts[0].back = 'jogar bola (corrigido)';
  const f = fila(s, { agora: minutos(INICIO, 11) });
  assert.equal(f.rascunho.back, 'jogar bola (corrigido)');
  assert.equal(f.proximo.passo, 1);
});

// ───────────────────────────── fila do dia ─────────────────────────────

test('fila respeita o limite de novos por dia e não mostra irmãos no mesmo dia', () => {
  const s = estadoCom(...['一', '二', '三', '四'].map((hz, i) => rascunho(`r${i}`, hz)));
  salvarConfig(s, { novosPorDia: 3 });
  const f = fila(s, { agora: INICIO });
  assert.equal(f.contagem.novos, 3, 'três rascunhos distintos, não seis cartões');
  assert.equal(f.proximo.modelo, 'reconhecer');

  let agora = INICIO;
  for (let i = 0; i < 3; i += 1) {
    const { proximo } = fila(s, { agora });
    responder(s, proximo.id, 4, { agora });
    agora = minutos(agora, 1);
  }
  const depois = fila(s, { agora });
  assert.equal(depois.proximo, null, 'limite atingido e os irmãos "produzir" esperam amanhã');
  const amanha = fila(s, { agora: dias(INICIO, 1) });
  assert.ok(amanha.proximo, 'no dia seguinte há novos de novo');
});

test('aprendizado vencido vem antes; o que vence em até 20 min é adiantado; depois disso, espera', () => {
  const s = estadoCom(rascunho('a', '踢球'));
  salvarConfig(s, { novosPorDia: 1, modelos: { produzir: false } });
  responder(s, 'a:reconhecer', 3, { agora: INICIO }); // próximo passo em 10 min
  assert.equal(fila(s, { agora: minutos(INICIO, 1) }).proximo?.id, 'a:reconhecer', 'adiantado: nada mais a fazer');

  salvarConfig(s, { passos: [1, 60] });
  const s2 = estadoCom(rascunho('b', '传球'));
  salvarConfig(s2, { passos: [1, 60], novosPorDia: 1, modelos: { produzir: false } });
  responder(s2, 'b:reconhecer', 3, { agora: INICIO });
  const f = fila(s2, { agora: minutos(INICIO, 1) });
  assert.equal(f.proximo, null);
  assert.equal(f.espera, minutos(INICIO, 60).toISOString());
});

test('cartões irmãos (reconhecer e produzir da mesma palavra) nunca no mesmo dia', () => {
  const s = estadoCom(rascunho('a', '踢球'), rascunho('b', '传球'));
  salvarConfig(s, { novosPorDia: 10 });
  assert.equal(fila(s, { agora: INICIO }).contagem.novos, 2, 'dois rascunhos, não quatro cartões');
  for (const id of ['a:reconhecer', 'b:reconhecer']) responder(s, id, 4, { agora: INICIO });
  assert.equal(fila(s, { agora: minutos(INICIO, 1) }).proximo, null, 'os "produzir" esperam amanhã');
  assert.equal(fila(s, { agora: dias(INICIO, 1) }).proximo?.modelo, 'produzir');
});

test('suspenso some da fila; esquecer volta a novo', () => {
  const s = estadoCom(rascunho('a', '踢球'));
  suspender(s, 'a:reconhecer');
  suspender(s, 'a:produzir');
  assert.equal(fila(s, { agora: INICIO }).proximo, null);
  suspender(s, 'a:reconhecer', false);
  responder(s, 'a:reconhecer', 4, { agora: INICIO });
  esquecer(s, 'a:reconhecer');
  const c = s.deck.cartoes.find((x) => x.id === 'a:reconhecer');
  assert.equal(c.estado, 'novo');
  assert.equal(c.s, null);
});

// ───────────────────────────── responder: XP, proficiência, pacote ─────────────────────────────

test('revisar dá XP uma vez por dia e NÃO mexe na proficiência', () => {
  const s = estadoCom(...Array.from({ length: 12 }, (_, i) => rascunho(`r${i}`, `词${i}`)));
  salvarConfig(s, { novosPorDia: 20 });
  const habilidadesAntes = JSON.stringify(estimateAllSkills(s));
  let agora = INICIO;
  for (let i = 0; i < REVISOES_PARA_XP + 2; i += 1) {
    const { proximo } = fila(s, { agora });
    responder(s, proximo.id, 4, { agora });
    agora = minutos(agora, 1);
  }
  assert.equal(totalXp(s), 10, 'uma sessão de revisão por dia, sem duplicar');
  assert.equal(s.skillEvidence.length, 0);
  assert.equal(JSON.stringify(estimateAllSkills(s)), habilidadesAntes);
});

test('palavra que já está no agendador do pacote é informada, uma vez por dia', () => {
  const s = estadoCom(rascunho('a', '踢球'));
  introduceItems(s, [{ ref: '踢球', type: 'word' }], { at: dias(INICIO, -3).toISOString() });
  const antes = getItem(s, '踢球').reps;
  responder(s, 'a:reconhecer', 3, { agora: INICIO });
  responder(s, 'a:reconhecer', 3, { agora: minutos(INICIO, 11) });
  assert.equal(getItem(s, '踢球').reps, antes + 1);
  assert.equal(getItem(s, '踢球').lastResult, 'acerto');

  // Palavra que o pacote nunca apresentou não é criada lá.
  const s2 = estadoCom(rascunho('b', '一会儿见'));
  responder(s2, 'b:reconhecer', 3, { agora: INICIO });
  assert.equal(getItem(s2, '一会儿见'), null);
});

test('desfazer restaura o cartão, o registro e o agendador do pacote', () => {
  const s = estadoCom(rascunho('a', '踢球'));
  introduceItems(s, [{ ref: '踢球', type: 'word' }], { at: dias(INICIO, -3).toISOString() });
  const itemAntes = { ...getItem(s, '踢球') };
  const cartaoAntes = { ...s.deck.cartoes.find((c) => c.id === 'a:reconhecer') };
  responder(s, 'a:reconhecer', 1, { agora: INICIO });
  assert.ok(desfazer(s));
  assert.deepEqual(s.deck.cartoes.find((c) => c.id === 'a:reconhecer'), cartaoAntes);
  assert.deepEqual(getItem(s, '踢球'), itemAntes);
  assert.equal(s.deck.registro.length, 0);
  assert.equal(desfazer(s), null, 'nada mais para desfazer');
});

test('estatísticas: retenção só conta revisões de cartões formados', () => {
  const s = estadoCom(rascunho('a', '踢球'), rascunho('b', '传球'));
  salvarConfig(s, { modelos: { produzir: false } });
  responder(s, 'a:reconhecer', 4, { agora: INICIO });
  responder(s, 'b:reconhecer', 4, { agora: INICIO });
  assert.equal(estatisticas(s, { agora: INICIO }).retencaoPeriodo, null);
  const depois = dias(INICIO, 14);
  responder(s, 'a:reconhecer', 3, { agora: depois });
  responder(s, 'b:reconhecer', 1, { agora: depois });
  const e = estatisticas(s, { agora: depois });
  assert.equal(e.retencaoPeriodo, 0.5);
  assert.equal(e.respondidosHoje, 2);
  assert.equal(e.previsao.length, 7);
});

// ───────────────────────────── persistência e dois aparelhos ─────────────────────────────

test('estado antigo, sem baralho, ganha um vazio ao migrar', () => {
  const velho = emptyState();
  delete velho.deck;
  assert.deepEqual(migrate(velho).deck, { cartoes: [], registro: [], config: {} });
});

test('mesclar aparelhos: respostas por união, cartão fica com a versão respondida por último', () => {
  const pc = estadoCom(rascunho('a', '踢球'));
  const cel = JSON.parse(JSON.stringify(pc));
  responder(pc, 'a:reconhecer', 3, { agora: INICIO });
  responder(cel, 'a:reconhecer', 4, { agora: minutos(INICIO, 30) });
  const { state } = mergeStates(pc, cel);
  assert.equal(state.deck.registro.length, 2);
  assert.ok(state.deck.registro.every((r) => !r.anterior), 'desfazer não atravessa aparelhos');
  const c = state.deck.cartoes.find((x) => x.id === 'a:reconhecer');
  assert.equal(c.estado, 'revisao', 'veio o "Fácil" do celular, mais recente');
});

test('mesclar aparelhos: cartões de rascunho duplicado passam para o rascunho que ficou', () => {
  const pc = estadoCom(rascunho('a', '踢球'));
  const cel = estadoCom(rascunho('z', '踢球', { status: 'exported' }));
  responder(cel, 'z:reconhecer', 4, { agora: INICIO });
  const { state } = mergeStates(pc, cel);
  assert.deepEqual(state.cardDrafts.map((d) => d.id), ['z']);
  const ids = state.deck.cartoes.map((c) => c.id).sort();
  assert.deepEqual(ids, ['z:produzir', 'z:reconhecer']);
  assert.equal(state.deck.cartoes.find((c) => c.id === 'z:reconhecer').estado, 'revisao');
});
