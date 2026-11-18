/**
 * Teste "existe ou não?", no formato do LexCHI (Wen, Qiu, Leong & van Heuven,
 * Behavior Research Methods, 2024; https://osf.io/dh3ty/): itens de dois
 * caracteres, um por vez, e a pessoa diz se é uma palavra de verdade. 2/3 são
 * palavras reais e 1/3 são combinações de caracteres reais que não existem.
 * Nota de Ghent normalizada: (sim às reais − 2 × sim às falsas) / nº de reais,
 * de −100% a 100%; responder sempre "sim" (ou sempre "não") dá 0.
 *
 * Diferença do original, pedida pelo aluno: os itens do LexCHI são de nível
 * avançado (烹饪, 慷慨). Aqui os caracteres são, em maioria, os que ele conhece
 * (das palavras do Baralho), e metade das falsas troca um caractere por um
 * PARECIDO (银行 → 很行): pega quem reconhece pelo radical. A outra metade junta
 * o começo de uma palavra conhecida com o fim de outra (银行 + 超市 → 银市).
 *
 * Uma falsa só entra se não estiver no CC-CEDICT (content/palavrasReais.js,
 * carregado sob demanda), nem ao contrário, e se NENHUM dos dois caracteres for
 * palavra sozinho (打, 写, 妈, 很...): esses formam frases válidas que nenhum
 * dicionário lista (打妈 "bater na mãe", 写上 "escrever em cima", 很好). Sobram os
 * caracteres que só vivem dentro de palavras (银, 超, 葡, 嫉), como no original.
 *
 * O resultado fica em state.lexchiTestes, para comparar ao longo do tempo. Não
 * vira evidência de proficiência: os itens saem do que ele estuda, então medem
 * reconhecimento desse vocabulário, não o nível geral.
 */
import { uid } from './storage.js';
import { parecidos, pecas } from './hanzi.js';
import { COMPONENTES } from './content/componentes.js';
import { allEntries } from './content/lexicon.js';

export const N_PADRAO = 60;
const HANZI = /^[一-鿿]$/u;
/** Caracteres que formam expressões válidas com quase tudo: fora das falsas. */
const FUNCAO = new Set([...'很太不也都就才再还又没别最真我你他她它这那哪是在有的了吗吧呢们着过个和跟去来要想会能可好多少大小一二三四五六七八九十两几些每各儿子头们家']);

/** Dicionário a partir de content/palavrasReais.js. */
export function montarDicionario({ GRUPOS, VERIFICAVEIS }) {
  const reais = new Set();
  for (const linha of GRUPOS.split('\n')) {
    const [a, ...resto] = [...linha];
    for (const b of resto) reais.add(a + b);
  }
  return { reais, verificaveis: new Set(VERIFICAVEIS) };
}

export async function carregarDicionario() {
  return montarDicionario(await import('./content/palavrasReais.js'));
}

const embaralhar = (xs, aleatorio) => {
  for (let i = xs.length - 1; i > 0; i -= 1) {
    const j = Math.floor(aleatorio() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
};

/**
 * Palavras de dois caracteres do Baralho, por grau de conhecimento: 3 =
 * respondida no Baralho; 2 = oficial do curso ou de pacote, já em estudo; 1 =
 * extra dos slides em estudo; 0 = ainda nova.
 */
export function palavrasDoAluno(state) {
  const emEstudo = new Set((state.deck?.cartoes || []).filter((c) => c.estado !== 'novo').map((c) => c.draftId));
  const respondidas = new Set((state.deck?.registro || []).map((r) => r.draftId));
  const vistas = new Set();
  const saida = [];
  for (const d of state.cardDrafts || []) {
    if (!['approved', 'exported'].includes(d.status)) continue;
    const cs = [...(d.front || '')];
    if (cs.length !== 2 || !cs.every((c) => HANZI.test(c)) || vistas.has(d.front)) continue;
    // Pares mínimos de pronúncia (白漆, 背风) são palavras raras escolhidas pelo som: fora.
    if ((d.tags || []).includes('pronuncia')) continue;
    vistas.add(d.front);
    const grau = respondidas.has(d.id) ? 3 : !emEstudo.has(d.id) ? 0 : (d.tags || []).includes('extra') ? 1 : 2;
    saida.push({ hz: d.front, py: d.pinyin || '', pt: d.back || '', grau, conhecida: grau >= 2 });
  }
  return saida;
}

/** Quantos itens dá para montar com o vocabulário atual (múltiplo de 3, até `n`). */
export function tamanhoPossivel(state, n = N_PADRAO) {
  const reais = palavrasDoAluno(state).length;
  return Math.max(0, Math.min(n, Math.floor((reais * 3) / 4 / 3) * 3));
}

/**
 * Monta o teste. @returns {{id, itens: [{hz, real, py?, pt?, origem?}]}}
 * origem (falsas): { tipo: 'parecido', de: '银行', trocou: '银', por: '很' } | { tipo: 'mistura', de: ['银行', '超市'] }
 */
export function montarTeste(state, dic, { n = N_PADRAO, aleatorio = Math.random } = {}) {
  const todas = palavrasDoAluno(state);
  const ordem = embaralhar(todas.slice(), aleatorio).sort((a, b) => b.grau - a.grau);
  const conhecidas = ordem.filter((p) => p.conhecida);
  const soltos = new Set(allEntries().filter((e) => [...e.hz].length === 1).map((e) => e.hz));
  const total = Math.min(n, tamanhoPossivel(state, n));
  const nReais = (total / 3) * 2;
  const nFalsas = total / 3;
  if (nReais < 6) return { id: uid('lex'), itens: [] };

  // Caracteres conhecidos: o universo dos parecidos (a troca usa um que ele já viu).
  const charsConhecidos = [...new Set(conhecidas.flatMap((p) => [...p.hz]))];
  const usados = new Set();
  const livre = (hz) => [...hz].every((c) => !usados.has(c));
  const marcar = (hz) => [...hz].forEach((c) => usados.add(c));

  const reais = [];
  const fontes = []; // palavras que viram falsas (não aparecem como reais)
  // Reserva fontes primeiro (metade das conhecidas, alternando), para as falsas usarem vocabulário conhecido.
  for (const p of ordem) {
    if (reais.length >= nReais) break;
    if (!livre(p.hz)) continue;
    if (fontes.length < nFalsas * 2 && reais.length >= fontes.length) { fontes.push(p); continue; }
    reais.push(p);
    marcar(p.hz);
  }
  // Se faltou real (vocabulário pequeno), aceita repetir caractere.
  for (const p of ordem) {
    if (reais.length >= nReais) break;
    if (!reais.includes(p) && !fontes.includes(p)) reais.push(p);
  }

  const valida = (hz) => {
    const [a, b] = [...hz];
    return a !== b && !FUNCAO.has(a) && !FUNCAO.has(b) && !soltos.has(a) && !soltos.has(b)
      && dic.verificaveis.has(a) && dic.verificaveis.has(b)
      && !dic.reais.has(hz) && !dic.reais.has(b + a);
  };

  const falsas = [];
  const jaFalsa = new Set();
  const aceitar = (hz, origem) => {
    if (falsas.length >= nFalsas || jaFalsa.has(hz) || !valida(hz)) return false;
    falsas.push({ hz, real: false, origem });
    jaFalsa.add(hz);
    marcar(hz);
    return true;
  };

  // Metade: troca por parecido.
  const metade = Math.ceil(nFalsas / 2);
  for (const p of fontes) {
    if (falsas.length >= metade) break;
    const cs = [...p.hz];
    const pos = aleatorio() < 0.5 ? [0, 1] : [1, 0];
    for (const k of pos) {
      const alvo = cs[k];
      if (FUNCAO.has(alvo) || soltos.has(alvo) || !COMPONENTES[alvo]) continue;
      // Parecido de verdade: mesmo radical ou uma peça igual (não só um traço em comum).
      const minhas = new Set(pecas(alvo));
      const vizinhos = parecidos(alvo, { pool: charsConhecidos, n: 6, aleatorio })
        .filter((v) => !usados.has(v))
        .filter((v) => COMPONENTES[v]?.r === COMPONENTES[alvo].r || pecas(v).some((x) => minhas.has(x)));
      const feita = vizinhos.some((v) => {
        const novo = cs.slice();
        novo[k] = v;
        return livre(novo[1 - k]) && aceitar(novo.join(''), { tipo: 'parecido', de: p.hz, trocou: alvo, por: v });
      });
      if (feita) break;
    }
  }
  // Resto: começo de uma palavra conhecida + fim de outra.
  const restantes = fontes.filter((p) => livre(p.hz));
  for (let i = 0; i < restantes.length && falsas.length < nFalsas; i += 1) {
    for (let j = 0; j < restantes.length && falsas.length < nFalsas; j += 1) {
      if (i === j) continue;
      const x = restantes[i];
      const y = restantes[j];
      const hz = [...x.hz][0] + [...y.hz][1];
      if (livre(hz) && aceitar(hz, { tipo: 'mistura', de: [x.hz, y.hz] })) break;
    }
  }
  // Ainda faltando (vocabulário pequeno): permite repetir caractere, no máximo 2 vezes no teste.
  const vezes = new Map();
  for (const x of [...reais.slice(0, nReais), ...falsas]) for (const c of x.hz) vezes.set(c, (vezes.get(c) || 0) + 1);
  const cabe = (hz) => [...hz].every((c) => (vezes.get(c) || 0) < 2);
  for (const x of embaralhar(todas.slice(), aleatorio)) {
    for (const y of embaralhar(todas.slice(), aleatorio)) {
      if (falsas.length >= nFalsas) break;
      const hz = [...x.hz][0] + [...y.hz][1];
      if (x === y || !cabe(hz)) continue;
      if (aceitar(hz, { tipo: 'mistura', de: [x.hz, y.hz] })) for (const c of hz) vezes.set(c, (vezes.get(c) || 0) + 1);
    }
  }

  const itens = [...reais.slice(0, nReais).map((p) => ({ hz: p.hz, real: true, py: p.py, pt: p.pt })), ...falsas];
  return { id: uid('lex'), itens: ordenarSemSequencias(itens, aleatorio) };
}

/**
 * Ordem sem mais de 4 do mesmo tipo seguidos (o original permite até 5): as
 * inventadas vão para posições sorteadas entre blocos de 1 a 4 reais.
 */
function ordenarSemSequencias(itens, aleatorio) {
  const reais = embaralhar(itens.filter((x) => x.real), aleatorio);
  const falsas = embaralhar(itens.filter((x) => !x.real), aleatorio);
  // Tamanhos dos blocos de reais entre as falsas (falsas + 1 blocos, cada um de 0 a 4).
  const blocos = Array(falsas.length + 1).fill(0);
  for (let r = 0; r < reais.length; r += 1) {
    const livres = blocos.map((b, k) => (b < 4 ? k : -1)).filter((k) => k >= 0);
    blocos[livres[Math.floor(aleatorio() * livres.length)]] += 1;
  }
  // Inventadas seguidas = blocos vazios entre elas; 4 vazios internos seguidos dariam 5 juntas.
  for (let k = 1; k + 3 < falsas.length; k += 1) {
    if (blocos.slice(k, k + 4).every((x) => x === 0)) {
      const maior = blocos.indexOf(Math.max(...blocos));
      if (blocos[maior] > 1) { blocos[maior] -= 1; blocos[k + 1] += 1; }
    }
  }
  const saida = [];
  blocos.forEach((b, k) => {
    saida.push(...reais.splice(0, b));
    if (k < falsas.length) saida.push(falsas[k]);
  });
  return saida.concat(reais);
}

/** Nota de Ghent normalizada, em %. `respostas[i]` é true para "existe". */
export function pontuar(itens, respostas) {
  const nReais = itens.filter((x) => x.real).length;
  let simReais = 0;
  let simFalsas = 0;
  itens.forEach((x, i) => {
    if (respostas[i] === true && x.real) simReais += 1;
    if (respostas[i] === true && !x.real) simFalsas += 1;
  });
  const nota = nReais ? Math.round(((simReais - 2 * simFalsas) / nReais) * 100) : 0;
  return { nota, simReais, nReais, simFalsas, nFalsas: itens.length - nReais };
}

export function registrarTeste(state, teste, respostas, { at = new Date().toISOString(), modo = 'teste' } = {}) {
  if (!Array.isArray(state.lexchiTestes)) state.lexchiTestes = [];
  const p = pontuar(teste.itens, respostas);
  const r = {
    id: teste.id,
    at,
    modo,
    ...p,
    itens: teste.itens.map((x, i) => ({ hz: x.hz, real: x.real, resposta: respostas[i] ?? null, ...(x.origem ? { origem: x.origem } : {}) })),
  };
  state.lexchiTestes = [...state.lexchiTestes.filter((t) => t.id !== r.id), r];
  return r;
}

export function historicoTestes(state) {
  return (state.lexchiTestes || []).filter((t) => t.modo === 'teste').sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

/** Explicação de uma falsa, para a revisão do fim. */
export function explicarFalsa(item) {
  const o = item.origem;
  if (!o) return '';
  if (o.tipo === 'parecido') return `${o.por} no lugar de ${o.trocou} (de ${o.de})`;
  return `começo de ${o.de[0]} + fim de ${o.de[1]}`;
}
