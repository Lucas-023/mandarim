/**
 * Vocabulário: flashcards das lições do curso (content/vocabLicoes.js).
 *
 * Um baralho À PARTE do Baralho principal (baralho.js), de propósito: o aluno
 * pediu uma aba só de flashcards com exatamente as palavras da lista do curso,
 * e disse que a ligação com o resto do app vem depois. Por isso aqui:
 *   - o conteúdo vem da lista fixa, não de cardDrafts;
 *   - responder NÃO dá XP, NÃO mexe no agendador do pacote (schedule.js) e
 *     NÃO cria evidência de habilidade (skills.js);
 *   - o agendamento é o mesmo do Baralho: reaproveita `agendar`/`previsoes`
 *     (FSRS, passos em minutos, memória muda só na 1ª resposta do dia).
 *
 * Estado: state.vocabulario = { cartoes, registro, config }. O cartão guarda só
 * o agendamento; id = `${hanzi}:${modelo}`. Se uma palavra sair da lista, o
 * cartão fica guardado (e escondido): o histórico volta se ela voltar.
 */
import { dayKey, addDays } from './xp.js';
import { uid } from './storage.js';
import { agendar } from './baralho.js';
import { retencao } from './fsrs.js';
import { LICOES, PALAVRAS } from './content/vocabLicoes.js';

export const MODELOS_VOCAB = {
  reconhecer: { nome: 'Reconhecer', descricao: '汉字 → português' },
  produzir: { nome: 'Produzir', descricao: 'português → 汉字' },
};
export const ORDEM_MODELOS_VOCAB = ['reconhecer', 'produzir'];

export const CONFIG_VOCAB = Object.freeze({
  novosPorDia: 10,
  retencaoDesejada: 0.9,
  passos: [1, 10],
  passosReaprender: [10],
  intervaloMaximo: 3650,
  modelos: { reconhecer: true, produzir: true },
  /** Lições cujos cartões entram no estudo. Desligar esconde, não apaga. */
  licoes: LICOES.map((l) => l.numero),
  adiantarAprendizado: 20,
  audioAoMostrar: true,
});

const DESFAZER_MAX = 50;
const MINUTO = 60 * 1000;
const POSICAO = new Map(PALAVRAS.map((p, i) => [p.hanzi, i]));
const PALAVRA = new Map(PALAVRAS.map((p) => [p.hanzi, p]));

export function garantirVocabulario(state) {
  if (!state.vocabulario || typeof state.vocabulario !== 'object') state.vocabulario = {};
  state.vocabulario.cartoes ||= [];
  state.vocabulario.registro ||= [];
  state.vocabulario.config ||= {};
  return state.vocabulario;
}

export function configVocabulario(state) {
  const salvo = state.vocabulario?.config || {};
  return {
    ...CONFIG_VOCAB,
    ...salvo,
    modelos: { ...CONFIG_VOCAB.modelos, ...(salvo.modelos || {}) },
    licoes: Array.isArray(salvo.licoes) ? salvo.licoes : [...CONFIG_VOCAB.licoes],
  };
}

export function salvarConfigVocabulario(state, mudancas) {
  const v = garantirVocabulario(state);
  v.config = { ...v.config, ...mudancas };
  return configVocabulario(state);
}

export const palavraDe = (hanzi) => PALAVRA.get(hanzi) || null;
const idCartao = (hanzi, modelo) => `${hanzi}:${modelo}`;
const meiaNoite = (dia) => {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d).toISOString();
};

/** Cria os cartões que faltam (um por palavra e modelo). @returns número criado */
export function sincronizarVocabulario(state, { agora = new Date() } = {}) {
  const v = garantirVocabulario(state);
  const existentes = new Set(v.cartoes.map((c) => c.id));
  let criados = 0;
  for (const p of PALAVRAS) {
    for (const modelo of ORDEM_MODELOS_VOCAB) {
      const id = idCartao(p.hanzi, modelo);
      if (existentes.has(id)) continue;
      existentes.add(id);
      v.cartoes.push({
        id, palavra: p.hanzi, modelo,
        estado: 'novo', due: null, s: null, d: null, passo: 0, intervaloDias: 0,
        reps: 0, lapsos: 0, ultimaRevisao: null, suspenso: false, criadoEm: agora.toISOString(),
      });
      criados += 1;
    }
  }
  return criados;
}

export function precisaSincronizarVocabulario(state) {
  const ids = new Set((state.vocabulario?.cartoes || []).map((c) => c.id));
  return PALAVRAS.some((p) => ORDEM_MODELOS_VOCAB.some((m) => !ids.has(idCartao(p.hanzi, m))));
}

/** Cartões que valem agora: palavra na lista, lição ligada, modelo ligado. */
function cartoesAtivos(state, cfg) {
  const licoes = new Set(cfg.licoes);
  return (state.vocabulario?.cartoes || []).filter((c) => {
    const p = PALAVRA.get(c.palavra);
    return p && licoes.has(p.licao) && cfg.modelos[c.modelo];
  });
}

const respondidosNoDia = (state, dia) => (state.vocabulario?.registro || []).filter((r) => dayKey(new Date(r.at)) === dia);

/**
 * Próximo cartão e contagens (novos · aprendendo · revisão), na mesma ordem do
 * Baralho: aprendizado vencido primeiro, depois revisões e novos intercalados.
 * Os dois cartões da mesma palavra não aparecem no mesmo dia (fora dos passos).
 */
export function filaVocabulario(state, { agora = new Date() } = {}) {
  const cfg = configVocabulario(state);
  const hoje = dayKey(agora);
  const cartoes = cartoesAtivos(state, cfg).filter((c) => !c.suspenso);
  const hojeReg = respondidosNoDia(state, hoje);

  const fimDoDia = Date.parse(meiaNoite(addDays(hoje, 1)));
  const emPassos = cartoes.filter((c) => c.estado === 'aprendendo' || c.estado === 'reaprendendo');
  const vencidos = emPassos.filter((c) => Date.parse(c.due) <= agora.getTime()).sort((a, b) => a.due.localeCompare(b.due));

  const usados = new Set([...hojeReg.map((r) => r.palavra), ...emPassos.map((c) => c.palavra)]);
  const pegar = (lista) => lista.filter((c) => {
    if (usados.has(c.palavra)) return false;
    usados.add(c.palavra);
    return true;
  });

  const revisoes = pegar(cartoes
    .filter((c) => c.estado === 'revisao' && dayKey(new Date(c.due)) <= hoje)
    .sort((a, b) => a.due.localeCompare(b.due)));

  const novosFeitos = hojeReg.filter((r) => r.estadoAntes === 'novo').length;
  const limiteNovos = cfg.novosPorDia + novosExtrasHoje(state, hoje);
  // Ordem da lista do curso; reconhecer antes de produzir.
  const novos = pegar(cartoes
    .filter((c) => c.estado === 'novo')
    .sort((a, b) => POSICAO.get(a.palavra) - POSICAO.get(b.palavra)
      || ORDEM_MODELOS_VOCAB.indexOf(a.modelo) - ORDEM_MODELOS_VOCAB.indexOf(b.modelo)))
    .slice(0, Math.max(0, limiteNovos - novosFeitos));

  const contagem = {
    novos: novos.length,
    aprendendo: emPassos.filter((c) => Date.parse(c.due) < fimDoDia).length,
    revisao: revisoes.length,
  };

  let proximo = vencidos[0] || null;
  if (!proximo && (revisoes.length || novos.length)) {
    const cada = novos.length ? Math.max(1, Math.floor(revisoes.length / novos.length)) : Infinity;
    const vez = hojeReg.length + 1;
    proximo = (novos.length && (!revisoes.length || vez % (cada + 1) === 0)) ? novos[0] : revisoes[0];
  }
  let espera = null;
  if (!proximo && emPassos.length) {
    const prox = emPassos.slice().sort((a, b) => a.due.localeCompare(b.due))[0];
    if (Date.parse(prox.due) - agora.getTime() <= cfg.adiantarAprendizado * MINUTO) proximo = prox;
    else if (Date.parse(prox.due) < fimDoDia) espera = prox.due;
  }
  return { proximo, palavra: proximo ? PALAVRA.get(proximo.palavra) : null, contagem, espera };
}

/** Registra a nota e reagenda. Só isso: sem XP, sem pacote, sem proficiência. */
export function responderVocabulario(state, cartaoId, nota, { agora = new Date(), duracaoMs = null } = {}) {
  if (![1, 2, 3, 4].includes(nota)) throw new Error(`nota inválida: ${nota}`);
  const v = garantirVocabulario(state);
  const i = v.cartoes.findIndex((c) => c.id === cartaoId);
  if (i === -1) return null;
  const antes = v.cartoes[i];
  const depois = agendar(antes, nota, configVocabulario(state), agora);
  v.cartoes[i] = depois;
  const entrada = {
    id: uid('voc'),
    at: agora.toISOString(),
    cartaoId,
    palavra: antes.palavra,
    modelo: antes.modelo,
    nota,
    estadoAntes: antes.estado,
    intervaloDias: depois.estado === 'revisao' ? depois.intervaloDias : 0,
    s: depois.s,
    d: depois.d,
    duracaoMs,
    anterior: antes,
  };
  v.registro.push(entrada);
  for (let k = v.registro.length - DESFAZER_MAX - 1; k >= 0 && v.registro[k].anterior; k -= 1) delete v.registro[k].anterior;
  return { cartao: depois, entrada };
}

export function desfazerVocabulario(state) {
  const v = garantirVocabulario(state);
  const ultima = v.registro.at(-1);
  if (!ultima?.anterior) return null;
  const i = v.cartoes.findIndex((c) => c.id === ultima.cartaoId);
  if (i !== -1) v.cartoes[i] = ultima.anterior;
  v.registro.pop();
  return ultima;
}

function editar(state, id, mudar) {
  const c = garantirVocabulario(state).cartoes.find((x) => x.id === id);
  if (c) mudar(c);
  return c || null;
}
export const suspenderVocabulario = (state, id, valor = true) => editar(state, id, (c) => { c.suspenso = valor; });
export const esquecerVocabulario = (state, id) => editar(state, id, (c) => {
  Object.assign(c, { estado: 'novo', due: null, s: null, d: null, passo: 0, intervaloDias: 0 });
});

function diasEntre(deISO, ateDia) {
  const [a1, m1, d1] = dayKey(new Date(deISO)).split('-').map(Number);
  const [a2, m2, d2] = ateDia.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

/**
 * Números da aba. "Vistas" = palavras com ao menos um cartão já respondido;
 * "firmes" = os dois cartões ligados formados com intervalo ≥ 21 dias.
 * É memória dos cartões, não proficiência.
 */
export function estatisticasVocabulario(state, { agora = new Date(), dias = 30 } = {}) {
  const hoje = dayKey(agora);
  const cfg = configVocabulario(state);
  const todos = (state.vocabulario?.cartoes || []).filter((c) => PALAVRA.has(c.palavra) && cfg.modelos[c.modelo]);
  const registro = state.vocabulario?.registro || [];
  const hojeReg = respondidosNoDia(state, hoje);
  const desde = addDays(hoje, -dias + 1);
  const revisoesPeriodo = registro.filter((r) => r.estadoAntes === 'revisao' && dayKey(new Date(r.at)) >= desde);

  const porPalavra = new Map();
  for (const c of todos) {
    if (!porPalavra.has(c.palavra)) porPalavra.set(c.palavra, []);
    porPalavra.get(c.palavra).push(c);
  }
  const porLicao = LICOES.map((l) => {
    let vistas = 0;
    let firmes = 0;
    for (const p of l.palavras) {
      const cs = porPalavra.get(p.hanzi) || [];
      if (cs.some((c) => c.estado !== 'novo')) vistas += 1;
      if (cs.length && cs.every((c) => c.estado === 'revisao' && c.intervaloDias >= 21)) firmes += 1;
    }
    return { numero: l.numero, titulo: l.titulo, total: l.palavras.length, vistas, firmes, ligada: cfg.licoes.includes(l.numero) };
  });

  const formados = todos.filter((c) => c.estado === 'revisao' && c.s && !c.suspenso);
  return {
    palavras: PALAVRAS.length,
    respondidosHoje: hojeReg.length,
    errosHoje: hojeReg.filter((r) => r.nota === 1).length,
    minutosHoje: Math.round(hojeReg.reduce((t, r) => t + (r.duracaoMs || 0), 0) / 60000),
    revisoesPeriodo: revisoesPeriodo.length,
    retencaoPeriodo: revisoesPeriodo.length ? revisoesPeriodo.filter((r) => r.nota > 1).length / revisoesPeriodo.length : null,
    dias,
    porLicao,
    retencaoEstimadaHoje: formados.length
      ? formados.reduce((t, c) => t + retencao(Math.max(0, diasEntre(c.ultimaRevisao, hoje)), c.s), 0) / formados.length
      : null,
  };
}

// ---------------------------------------------------------------- intensivo

/** Novos liberados a mais só para hoje (botão "+10 novos hoje"). */
export function novosExtrasHoje(state, hoje = dayKey()) {
  const e = state.vocabulario?.config?.extras;
  return e && e.dia === hoje ? e.n : 0;
}

/** Libera `n` cartões novos além do limite, só no dia de hoje. @returns total extra de hoje */
export function liberarNovosHoje(state, n = 10, { agora = new Date() } = {}) {
  const v = garantirVocabulario(state);
  const hoje = dayKey(agora);
  const atual = novosExtrasHoje(state, hoje);
  v.config = { ...v.config, extras: { dia: hoje, n: atual + n } };
  return atual + n;
}

/**
 * Treino livre: passar pelos cartões quantas vezes quiser, fora do agendamento.
 *
 * NÃO mexe em `cartoes` nem em `registro`, de propósito: o FSRS só aprende com a
 * 1ª resposta do dia, e adiantar revisões encurtaria intervalos sem ganho de
 * memória de longo prazo. Aqui é repetição pura para um intensivo; o agendamento
 * continua cuidando de trazer cada palavra de volta no dia certo.
 *
 * @param quais 'todas' | 'estudadas' (já respondidas no agendamento) | 'dificeis' (erradas alguma vez)
 * @param direcao 'reconhecer' | 'produzir' | 'misturado'
 */
export function montarTreino(state, { licoes = null, quais = 'todas', direcao = 'misturado', aleatorio = Math.random } = {}) {
  const cfg = configVocabulario(state);
  const ligadas = new Set(licoes || cfg.licoes);
  const cartoes = new Map((state.vocabulario?.cartoes || []).map((c) => [c.id, c]));
  const erradas = new Set((state.vocabulario?.registro || []).filter((r) => r.nota === 1).map((r) => r.palavra));
  const palavras = PALAVRAS.filter((p) => {
    if (!ligadas.has(p.licao)) return false;
    const cs = ORDEM_MODELOS_VOCAB.map((m) => cartoes.get(idCartao(p.hanzi, m))).filter(Boolean);
    if (quais === 'estudadas') return cs.some((c) => c.estado !== 'novo');
    if (quais === 'dificeis') return erradas.has(p.hanzi) || cs.some((c) => c.lapsos > 0);
    return true;
  });
  const fila = palavras.map((p) => ({
    palavra: p.hanzi,
    modelo: direcao === 'misturado' ? (aleatorio() < 0.5 ? 'reconhecer' : 'produzir') : direcao,
  }));
  embaralhar(fila, aleatorio);
  return { fila, total: fila.length, respondidas: 0, acertosDePrimeira: 0, erradas: [], jaErrou: [] };
}

function embaralhar(lista, aleatorio) {
  for (let i = lista.length - 1; i > 0; i -= 1) {
    const j = Math.floor(aleatorio() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
}

/** Quantos cartões depois o errado volta (perto o bastante para fixar, longe o bastante para não decorar a posição). */
export const VOLTA_APOS = 4;

/**
 * Responde o primeiro da fila. Acertou: sai. Errou: volta VOLTA_APOS cartões
 * depois, até acertar. Muda o objeto do treino e o devolve.
 */
export function responderTreino(treino, acertou) {
  const atual = treino.fila.shift();
  if (!atual) return treino;
  treino.respondidas += 1;
  const chave = `${atual.palavra}:${atual.modelo}`;
  if (acertou) {
    if (!treino.jaErrou.includes(chave)) treino.acertosDePrimeira += 1;
  } else {
    if (!treino.jaErrou.includes(chave)) {
      treino.jaErrou.push(chave);
      treino.erradas.push(atual);
    }
    treino.fila.splice(Math.min(VOLTA_APOS, treino.fila.length), 0, atual);
  }
  return treino;
}

/** Novo treino só com os cartões errados no anterior (mesma direção de cada um). */
export function treinoDosErros(treino, aleatorio = Math.random) {
  const fila = treino.erradas.map((x) => ({ ...x }));
  embaralhar(fila, aleatorio);
  return { fila, total: fila.length, respondidas: 0, acertosDePrimeira: 0, erradas: [], jaErrou: [] };
}
