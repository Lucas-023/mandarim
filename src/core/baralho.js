/**
 * Baralho: um pequeno Anki dentro do app.
 *
 * O conteúdo de cada cartão é o rascunho aprovado (state.cardDrafts com status
 * approved/exported) — fonte única: editar o rascunho muda o cartão, sem cópia
 * para dessincronizar. Cada rascunho gera um cartão por modelo ligado
 * (reconhecer, produzir, ouvir), e cada cartão guarda só o agendamento.
 *
 * Agendamento como o do Anki com FSRS (ver fsrs.js):
 *   - cartão novo passa por passos de aprendizado em minutos (1, 10);
 *   - "Bom" no último passo forma o cartão: o intervalo vem da estabilidade;
 *   - errar na revisão volta aos passos de reaprendizado (10 min);
 *   - a memória (S, D) só muda na primeira resposta de cada dia — como no
 *     FSRS-4.5, repetir no mesmo dia não é evidência de memória de longo prazo;
 *   - cartões irmãos (mesmo rascunho, outro modelo) não aparecem no mesmo dia.
 *
 * Isto NÃO é proficiência: a nota é você quem dá. Revisar rende XP (atividade)
 * e informa o agendador do pacote diário, mas não gera evidência em skills.js.
 */
import { uid } from './storage.js';
import { dayKey, addDays, awardXp } from './xp.js';
import { getItem, reviewOutcome } from './schedule.js';
import { PESOS_PADRAO, memoriaInicial, revisar, intervaloPara, retencao } from './fsrs.js';

export const MODELOS = {
  reconhecer: { nome: 'Reconhecer', descricao: '汉字 → português' },
  produzir: { nome: 'Produzir', descricao: 'português → 汉字' },
  ouvir: { nome: 'Ouvir', descricao: 'áudio → significado' },
};
export const ORDEM_MODELOS = ['reconhecer', 'produzir', 'ouvir'];
export const NOTAS = { 1: 'Errei', 2: 'Difícil', 3: 'Bom', 4: 'Fácil' };

export const CONFIG_PADRAO = Object.freeze({
  novosPorDia: 15,
  revisoesPorDia: 200,
  retencaoDesejada: 0.9,
  passos: [1, 10],
  passosReaprender: [10],
  intervaloMaximo: 3650,
  modelos: { reconhecer: true, produzir: true, ouvir: false },
  /** Minutos que se pode adiantar um cartão em aprendizado quando nada mais resta. */
  adiantarAprendizado: 20,
  audioAoMostrar: true,
});

/** Recaídas a partir das quais o cartão é marcado como problemático (padrão do Anki). */
export const SANGUESSUGA = 8;
/** Revisões no dia que contam como uma sessão concluída para o XP. */
export const REVISOES_PARA_XP = 10;
/** Quantas entradas recentes guardam o retrato anterior (para desfazer). */
const DESFAZER_MAX = 50;
const MINUTO = 60 * 1000;

const STATUS_NO_BARALHO = new Set(['approved', 'exported']);

export function garantirBaralho(state) {
  if (!state.deck || typeof state.deck !== 'object') state.deck = {};
  state.deck.cartoes ||= [];
  state.deck.registro ||= [];
  state.deck.config ||= {};
  return state.deck;
}

export function configBaralho(state) {
  const salvo = state.deck?.config || {};
  return { ...CONFIG_PADRAO, ...salvo, modelos: { ...CONFIG_PADRAO.modelos, ...(salvo.modelos || {}) } };
}

const idCartao = (draftId, modelo) => `${draftId}:${modelo}`;
const meiaNoite = (dia) => {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d).toISOString();
};

function rascunhosNoBaralho(state) {
  return state.cardDrafts.filter((d) => STATUS_NO_BARALHO.has(d.status) && String(d.front || '').trim() && String(d.back || '').trim());
}

/**
 * Garante um cartão por rascunho aprovado e modelo ligado; tira os de
 * rascunhos apagados ou rejeitados. Desligar um modelo NÃO apaga cartões (o
 * histórico volta se religar). @returns {{criados, removidos}}
 */
export function sincronizarCartoes(state, { agora = new Date() } = {}) {
  const deck = garantirBaralho(state);
  const cfg = configBaralho(state);
  const existentes = new Set(deck.cartoes.map((c) => c.id));
  let criados = 0;
  for (const rascunho of rascunhosNoBaralho(state)) {
    for (const modelo of ORDEM_MODELOS) {
      if (!cfg.modelos[modelo] || existentes.has(idCartao(rascunho.id, modelo))) continue;
      deck.cartoes.push(novoCartao(rascunho.id, modelo, agora));
      existentes.add(idCartao(rascunho.id, modelo));
      criados += 1;
    }
  }
  const vivos = new Set(state.cardDrafts.filter((d) => d.status !== 'rejected').map((d) => d.id));
  const antes = deck.cartoes.length;
  deck.cartoes = deck.cartoes.filter((c) => vivos.has(c.draftId));
  return { criados, removidos: antes - deck.cartoes.length };
}

export function precisaSincronizar(state) {
  const cfg = configBaralho(state);
  const ids = new Set((state.deck?.cartoes || []).map((c) => c.id));
  const faltando = rascunhosNoBaralho(state).some((r) => ORDEM_MODELOS.some((m) => cfg.modelos[m] && !ids.has(idCartao(r.id, m))));
  if (faltando) return true;
  const vivos = new Set(state.cardDrafts.filter((d) => d.status !== 'rejected').map((d) => d.id));
  return (state.deck?.cartoes || []).some((c) => !vivos.has(c.draftId));
}

function novoCartao(draftId, modelo, agora) {
  return {
    id: idCartao(draftId, modelo),
    draftId,
    modelo,
    estado: 'novo', // novo | aprendendo | revisao | reaprendendo
    due: null,
    s: null,
    d: null,
    passo: 0,
    intervaloDias: 0,
    reps: 0,
    lapsos: 0,
    ultimaRevisao: null,
    suspenso: false,
    sanguessuga: false,
    criadoEm: agora.toISOString(),
  };
}

// ---------------------------------------------------------------- agendamento

function intervaloDias(s, cfg) {
  return Math.min(cfg.intervaloMaximo, Math.max(1, Math.round(intervaloPara(s, cfg.retencaoDesejada))));
}

function diasEntre(deISO, ateDia) {
  const [a1, m1, d1] = dayKey(new Date(deISO)).split('-').map(Number);
  const [a2, m2, d2] = ateDia.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

/** Estado de memória depois de responder, aplicando a regra de "uma vez por dia". */
function memoriaApos(cartao, nota, hoje, w) {
  if (cartao.s == null) return memoriaInicial(nota, w);
  if (cartao.ultimaRevisao && dayKey(new Date(cartao.ultimaRevisao)) === hoje) return { s: cartao.s, d: cartao.d };
  const decorridos = cartao.ultimaRevisao ? diasEntre(cartao.ultimaRevisao, hoje) : 0;
  const { s, d } = revisar({ s: cartao.s, d: cartao.d }, decorridos, nota, w);
  return { s, d };
}

function formar(cartao, dias, hoje) {
  return { ...cartao, estado: 'revisao', passo: 0, intervaloDias: dias, due: meiaNoite(addDays(hoje, dias)) };
}

function emPasso(cartao, estado, passo, minutos, agora) {
  return { ...cartao, estado, passo, due: new Date(agora.getTime() + minutos * MINUTO).toISOString() };
}

/**
 * Função pura: o cartão depois de receber `nota` agora. Não mexe no estado.
 * @returns {object} cartão novo, com `ultimaRevisao` e contadores atualizados
 */
export function agendar(cartao, nota, cfg, agora = new Date(), w = PESOS_PADRAO) {
  const hoje = dayKey(agora);
  const mem = memoriaApos(cartao, nota, hoje, w);
  const base = { ...cartao, s: mem.s, d: mem.d, reps: cartao.reps + 1, ultimaRevisao: agora.toISOString() };

  if (cartao.estado === 'revisao') {
    if (nota === 1) {
      const com = { ...base, lapsos: cartao.lapsos + 1 };
      com.sanguessuga = com.lapsos >= SANGUESSUGA;
      if (!cfg.passosReaprender.length) return formar(com, intervaloDias(mem.s, cfg), hoje);
      return emPasso(com, 'reaprendendo', 0, cfg.passosReaprender[0], agora);
    }
    // Difícil ≤ Bom < Fácil, sempre: cada um calculado pela própria memória.
    const ivl = {};
    for (const n of [2, 3, 4]) ivl[n] = intervaloDias(memoriaApos(cartao, n, hoje, w).s, cfg);
    ivl[2] = Math.min(ivl[2], ivl[3]);
    ivl[3] = Math.max(ivl[3], ivl[2] + 1);
    ivl[4] = Math.max(ivl[4], ivl[3] + 1);
    return formar(base, Math.min(cfg.intervaloMaximo, ivl[nota]), hoje);
  }

  // novo, aprendendo ou reaprendendo: passos em minutos.
  const passos = cartao.estado === 'reaprendendo' ? cfg.passosReaprender : cfg.passos;
  const estado = cartao.estado === 'reaprendendo' ? 'reaprendendo' : 'aprendendo';
  const passo = cartao.estado === 'novo' ? 0 : cartao.passo;
  const formado = intervaloDias(mem.s, cfg);

  if (nota === 4 || !passos.length) {
    // Fácil pula os passos; fora do cartão novo, rende ao menos um dia a mais que Bom.
    return formar(base, cartao.estado === 'novo' || !passos.length ? formado : formado + 1, hoje);
  }
  if (nota === 1) return emPasso(base, estado, 0, passos[0], agora);
  if (nota === 2) {
    const espera = passo === 0 && passos.length > 1 ? (passos[0] + passos[1]) / 2 : passos[passo] * 1.5;
    return emPasso(base, estado, passo, espera, agora);
  }
  if (passo + 1 < passos.length) return emPasso(base, estado, passo + 1, passos[passo + 1], agora);
  return formar(base, formado, hoje);
}

/** Texto curto para um intervalo, como nos botões do Anki. */
export function rotuloIntervalo(cartaoDepois, agora = new Date()) {
  if (cartaoDepois.estado !== 'revisao') {
    const min = Math.max(1, Math.round((Date.parse(cartaoDepois.due) - agora.getTime()) / MINUTO));
    return min < 60 ? `${min} min` : `${(min / 60).toFixed(1).replace('.', ',').replace(',0', '')} h`;
  }
  const d = cartaoDepois.intervaloDias;
  if (d < 30) return `${d} d`;
  if (d < 365) return `${(d / 30).toFixed(1).replace('.', ',').replace(',0', '')} mês`;
  return `${(d / 365).toFixed(1).replace('.', ',').replace(',0', '')} ano`;
}

/** O que cada botão faria agora: { 1: '1 min', 2: '6 min', 3: '10 min', 4: '4 d' }. */
export function previsoes(cartao, cfg, agora = new Date()) {
  const saida = {};
  for (const n of [1, 2, 3, 4]) saida[n] = rotuloIntervalo(agendar(cartao, n, cfg, agora), agora);
  return saida;
}

// ---------------------------------------------------------------- fila do dia

function respondidosHoje(state, hoje) {
  return (state.deck?.registro || []).filter((r) => dayKey(new Date(r.at)) === hoje);
}

/**
 * Próximo cartão e as contagens do topo (novos · aprendendo · revisão).
 * Ordem: aprendizado vencido primeiro; depois revisões e novos intercalados.
 */
export function fila(state, { agora = new Date() } = {}) {
  const cfg = configBaralho(state);
  const hoje = dayKey(agora);
  const rascunhos = new Map(rascunhosNoBaralho(state).map((r) => [r.id, r]));
  const cartoes = (state.deck?.cartoes || []).filter((c) => rascunhos.has(c.draftId) && cfg.modelos[c.modelo] && !c.suspenso);
  const hojeReg = respondidosHoje(state, hoje);
  const irmaosVistos = new Set(hojeReg.map((r) => r.draftId));

  const fimDoDia = Date.parse(meiaNoite(addDays(hoje, 1)));
  const emPassos = cartoes.filter((c) => c.estado === 'aprendendo' || c.estado === 'reaprendendo');
  const vencidosAprendizado = emPassos.filter((c) => Date.parse(c.due) <= agora.getTime()).sort((a, b) => a.due.localeCompare(b.due));

  // Um cartão por rascunho por dia (fora do aprendizado): os irmãos esperam amanhã.
  const usados = new Set([...irmaosVistos, ...emPassos.map((c) => c.draftId)]);
  const pegar = (lista) => {
    const saida = [];
    for (const c of lista) {
      if (usados.has(c.draftId)) continue;
      usados.add(c.draftId);
      saida.push(c);
    }
    return saida;
  };

  const revisoesFeitas = hojeReg.filter((r) => r.estadoAntes === 'revisao').length;
  const revisoes = pegar(cartoes
    .filter((c) => c.estado === 'revisao' && dayKey(new Date(c.due)) <= hoje)
    .sort((a, b) => a.due.localeCompare(b.due)))
    .slice(0, Math.max(0, cfg.revisoesPorDia - revisoesFeitas));

  const novosFeitos = hojeReg.filter((r) => r.estadoAntes === 'novo').length;
  const ordemModelo = (m) => ORDEM_MODELOS.indexOf(m);
  const novos = pegar(cartoes
    .filter((c) => c.estado === 'novo')
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || ordemModelo(a.modelo) - ordemModelo(b.modelo)))
    .slice(0, Math.max(0, cfg.novosPorDia - novosFeitos));

  const contagem = {
    novos: novos.length,
    aprendendo: emPassos.filter((c) => Date.parse(c.due) < fimDoDia).length,
    revisao: revisoes.length,
  };

  let proximo = vencidosAprendizado[0] || null;
  if (!proximo && (revisoes.length || novos.length)) {
    // Intercala: um novo a cada tantas revisões, para os novos não ficarem todos no fim.
    const cada = novos.length ? Math.max(1, Math.floor(revisoes.length / novos.length)) : Infinity;
    const vez = hojeReg.length + 1;
    proximo = (novos.length && (!revisoes.length || vez % (cada + 1) === 0)) ? novos[0] : revisoes[0];
  }
  let espera = null;
  if (!proximo && emPassos.length) {
    const prox = emPassos.slice().sort((a, b) => a.due.localeCompare(b.due))[0];
    const faltaMs = Date.parse(prox.due) - agora.getTime();
    // Nada mais a fazer: adianta o aprendizado que vence logo (como o Anki).
    if (faltaMs <= cfg.adiantarAprendizado * MINUTO) proximo = prox;
    else if (Date.parse(prox.due) < fimDoDia) espera = prox.due;
  }

  return { proximo, rascunho: proximo ? rascunhos.get(proximo.draftId) : null, contagem, espera };
}

// ---------------------------------------------------------------- responder

/**
 * Registra a resposta, reagenda, informa o agendador do pacote diário e dá XP
 * ao completar uma sessão no dia. @returns {{cartao, entrada, xp}}
 */
export function responder(state, cartaoId, nota, { agora = new Date(), duracaoMs = null } = {}) {
  if (![1, 2, 3, 4].includes(nota)) throw new Error(`nota inválida: ${nota}`);
  const deck = garantirBaralho(state);
  const i = deck.cartoes.findIndex((c) => c.id === cartaoId);
  if (i === -1) return null;
  const antes = deck.cartoes[i];
  const depois = agendar(antes, nota, configBaralho(state), agora);
  deck.cartoes[i] = depois;

  // O pacote diário usa o agendador de exercícios (schedule.js). Se a palavra
  // já está lá, a revisão daqui conta — uma vez por dia, para não acelerar
  // o item duas vezes com os dois cartões irmãos.
  const rascunho = state.cardDrafts.find((d) => d.id === antes.draftId);
  const ref = rascunho?.front;
  const item = ref ? getItem(state, ref) : null;
  let agendaAnterior;
  if (item && (!item.lastSeenAt || dayKey(new Date(item.lastSeenAt)) !== dayKey(agora))) {
    agendaAnterior = { ref, item: { ...item } };
    reviewOutcome(state, ref, nota > 1, { at: agora.toISOString() });
  }

  const entrada = {
    id: uid('rev'),
    at: agora.toISOString(),
    cartaoId,
    draftId: antes.draftId,
    modelo: antes.modelo,
    nota,
    estadoAntes: antes.estado,
    intervaloDias: depois.estado === 'revisao' ? depois.intervaloDias : 0,
    s: depois.s,
    d: depois.d,
    duracaoMs,
    anterior: antes,
    ...(agendaAnterior ? { agendaAnterior } : {}),
  };
  deck.registro.push(entrada);
  // Só as últimas guardam o retrato para desfazer; o resto vira histórico enxuto.
  for (let k = deck.registro.length - DESFAZER_MAX - 1; k >= 0 && deck.registro[k].anterior; k -= 1) {
    delete deck.registro[k].anterior;
    delete deck.registro[k].agendaAnterior;
  }

  let xp = null;
  const hoje = dayKey(agora);
  if (respondidosHoje(state, hoje).length >= REVISOES_PARA_XP) {
    xp = awardXp(state, { type: 'review_session', key: `baralho:${hoje}`, at: agora.toISOString(), meta: { origem: 'baralho' } });
  }
  return { cartao: depois, entrada, xp };
}

/** Desfaz a última resposta (o XP do dia, se já foi dado, permanece: é atividade). */
export function desfazer(state) {
  const deck = garantirBaralho(state);
  const ultima = deck.registro[deck.registro.length - 1];
  if (!ultima?.anterior) return null;
  const i = deck.cartoes.findIndex((c) => c.id === ultima.cartaoId);
  if (i !== -1) deck.cartoes[i] = ultima.anterior;
  if (ultima.agendaAnterior) state.schedule.items[ultima.agendaAnterior.ref] = ultima.agendaAnterior.item;
  deck.registro.pop();
  return ultima;
}

// ---------------------------------------------------------------- gestão

function editarCartao(state, cartaoId, mudar) {
  const c = garantirBaralho(state).cartoes.find((x) => x.id === cartaoId);
  if (c) mudar(c);
  return c || null;
}

export const suspender = (state, id, valor = true) => editarCartao(state, id, (c) => { c.suspenso = valor; });

/** Volta o cartão a novo, apagando o agendamento (o histórico de respostas fica). */
export function esquecer(state, id) {
  return editarCartao(state, id, (c) => {
    Object.assign(c, { estado: 'novo', due: null, s: null, d: null, passo: 0, intervaloDias: 0, sanguessuga: false });
  });
}

export function salvarConfig(state, mudancas) {
  const deck = garantirBaralho(state);
  deck.config = { ...deck.config, ...mudancas };
  return configBaralho(state);
}

// ---------------------------------------------------------------- estatísticas

/** Números do baralho. Retenção só com revisões de cartões já formados. */
export function estatisticas(state, { agora = new Date(), dias = 30 } = {}) {
  const hoje = dayKey(agora);
  const cfg = configBaralho(state);
  const noBaralho = new Set(rascunhosNoBaralho(state).map((r) => r.id));
  const cartoes = (state.deck?.cartoes || []).filter((c) => noBaralho.has(c.draftId) && cfg.modelos[c.modelo]);
  const registro = state.deck?.registro || [];
  const hojeReg = registro.filter((r) => dayKey(new Date(r.at)) === hoje);
  const desde = addDays(hoje, -dias + 1);
  const revisoesPeriodo = registro.filter((r) => r.estadoAntes === 'revisao' && dayKey(new Date(r.at)) >= desde);
  const acertosPeriodo = revisoesPeriodo.filter((r) => r.nota > 1).length;

  const previsao = [];
  for (let k = 0; k < 7; k += 1) {
    const dia = addDays(hoje, k);
    previsao.push({
      dia,
      n: cartoes.filter((c) => !c.suspenso && c.estado === 'revisao' && (k === 0 ? dayKey(new Date(c.due)) <= dia : dayKey(new Date(c.due)) === dia)).length,
    });
  }

  const porDia = new Map();
  for (const r of registro) {
    const dia = dayKey(new Date(r.at));
    if (dia >= desde) porDia.set(dia, (porDia.get(dia) || 0) + 1);
  }

  const formados = cartoes.filter((c) => c.estado === 'revisao' && c.s);
  return {
    total: cartoes.length,
    novos: cartoes.filter((c) => c.estado === 'novo' && !c.suspenso).length,
    aprendendo: cartoes.filter((c) => (c.estado === 'aprendendo' || c.estado === 'reaprendendo') && !c.suspenso).length,
    jovens: cartoes.filter((c) => c.estado === 'revisao' && c.intervaloDias < 21 && !c.suspenso).length,
    maduros: cartoes.filter((c) => c.estado === 'revisao' && c.intervaloDias >= 21 && !c.suspenso).length,
    suspensos: cartoes.filter((c) => c.suspenso).length,
    sanguessugas: cartoes.filter((c) => c.sanguessuga).length,
    respondidosHoje: hojeReg.length,
    errosHoje: hojeReg.filter((r) => r.nota === 1).length,
    minutosHoje: Math.round(hojeReg.reduce((t, r) => t + (r.duracaoMs || 0), 0) / 60000),
    revisoesPeriodo: revisoesPeriodo.length,
    retencaoPeriodo: revisoesPeriodo.length ? acertosPeriodo / revisoesPeriodo.length : null,
    dias,
    previsao,
    porDia: [...porDia.entries()].sort(),
    // Média da chance de lembrar hoje, pelo modelo: estimativa, não medida.
    retencaoEstimadaHoje: formados.length
      ? formados.reduce((t, c) => t + retencao(Math.max(0, diasEntre(c.ultimaRevisao, hoje)), c.s), 0) / formados.length
      : null,
  };
}
