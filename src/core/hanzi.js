/**
 * Treino de hanzi pelo caractere inteiro, não por um pedaço dele.
 *
 * Pedido do aluno (2026-11-18): com poucos hanzi conhecidos, ele acerta pelo
 * radical ("vejo um radical que só um dos que eu conheço tem e pronto"). Dois
 * exercícios tiram essa muleta:
 *
 *  - **parecidos**: o significado e o pinyin da palavra, com o caractere em
 *    branco (银行 → ＿行); escolher entre 4 que COMPARTILHAM componentes com o
 *    certo (银 很 跟 眼). O pedaço que ele reconhece está em todos.
 *  - **montar**: mesma pista, mas escolhendo as peças do caractere (钅 + 艮),
 *    misturadas com peças dos parecidos. Obriga a lembrar a estrutura inteira.
 *
 * A decomposição vem de content/componentes.js (gerado de Make Me a Hanzi; ver
 * scripts/gerar-componentes.mjs). Os distratores saem só dos caracteres do
 * léxico: são os que ele vai encontrar.
 *
 * O registro (state.hanziRegistro) serve para trazer antes o que ele errou. Não
 * é proficiência, não dá XP e não mexe no Baralho (mesma regra do treino livre).
 */
import { COMPONENTES } from './content/componentes.js';
import { allEntries } from './content/lexicon.js';
import { uid } from './storage.js';

const BINARIOS = new Set(['⿰', '⿱', '⿴', '⿵', '⿶', '⿷', '⿸', '⿹', '⿺', '⿻']);
const TERNARIOS = new Set(['⿲', '⿳']);
const HANZI = /[一-鿿㐀-䶿]/;

export const ESTRUTURAS = {
  '⿰': 'esquerda + direita', '⿱': 'em cima + embaixo', '⿲': 'esquerda + meio + direita',
  '⿳': 'cima + meio + baixo', '⿴': 'por fora + por dentro', '⿵': 'aberto embaixo',
  '⿶': 'aberto em cima', '⿷': 'aberto à direita', '⿸': 'canto de cima à esquerda',
  '⿹': 'canto de cima à direita', '⿺': 'canto de baixo à esquerda', '⿻': 'sobrepostos',
};

/** Lê uma sequência IDS. @returns {{op: string|null, partes: (string|object)[]}|string} */
export function lerIds(ids) {
  let i = 0;
  const chars = [...String(ids || '')];
  const no = () => {
    const c = chars[i++];
    if (c === undefined) return null;
    if (BINARIOS.has(c) || TERNARIOS.has(c)) {
      const n = TERNARIOS.has(c) ? 3 : 2;
      const partes = [];
      for (let k = 0; k < n; k += 1) partes.push(no());
      return { op: c, partes };
    }
    return c;
  };
  return no();
}

/** Texto de um nó (para mostrar uma peça composta, como ⿱亠口). */
const textoNo = (n) => (n == null ? '' : typeof n === 'string' ? n : n.op + n.partes.map(textoNo).join(''));

/** Peças de primeiro nível: o que o aluno monta. Peça desconhecida ('？') não conta. */
export function pecas(ch) {
  const info = COMPONENTES[ch];
  if (!info) return [];
  const arvore = lerIds(info.d);
  if (!arvore || typeof arvore === 'string') return [];
  return arvore.partes.map(textoNo).filter((p) => p && !p.includes('？'));
}

/** Todos os componentes, em qualquer profundidade (expandindo os que têm decomposição própria). */
export function componentesFundos(ch, visto = new Set()) {
  const saida = new Set();
  const andar = (n) => {
    if (n == null) return;
    if (typeof n === 'string') {
      if (n === '？' || visto.has(n)) return;
      saida.add(n);
      visto.add(n);
      const sub = COMPONENTES[n];
      if (sub && sub.d && sub.d !== n) andar(lerIds(sub.d));
      return;
    }
    n.partes.forEach(andar);
  };
  const info = COMPONENTES[ch];
  if (info) andar(lerIds(info.d));
  saida.delete(ch);
  return saida;
}

export const decomponivel = (ch) => pecas(ch).length >= 2;

/** Caracteres do léxico (o universo de distratores). */
function universo() {
  const s = new Set();
  for (const e of allEntries()) for (const c of e.hz) if (HANZI.test(c)) s.add(c);
  return [...s];
}

/**
 * Parecidos com `ch`: os que dividem componentes com ele, do mais parecido ao
 * menos. Pontos: radical igual, peça de primeiro nível igual, componente em
 * qualquer nível, mesma estrutura.
 */
export function parecidos(ch, { pool = universo(), n = 3, aleatorio = Math.random } = {}) {
  const info = COMPONENTES[ch];
  if (!info) return [];
  const meusTopo = new Set(pecas(ch));
  const meusFundo = componentesFundos(ch);
  const meuOp = lerIds(info.d)?.op;
  const pontuados = [];
  for (const outro of pool) {
    if (outro === ch || meusFundo.has(outro) || componentesFundos(outro).has(ch)) continue;
    const oi = COMPONENTES[outro];
    if (!oi) continue;
    let pts = 0;
    if (oi.r && oi.r === info.r) pts += 3;
    for (const p of pecas(outro)) if (meusTopo.has(p)) pts += 3;
    for (const c of componentesFundos(outro)) if (meusFundo.has(c)) pts += 1;
    if (pts && lerIds(oi.d)?.op === meuOp) pts += 0.5;
    if (pts > 0) pontuados.push({ ch: outro, pts: pts + aleatorio() * 0.4, fundo: componentesFundos(outro), topo: pecas(outro) });
  }
  pontuados.sort((a, b) => b.pts - a.pts);
  // Revezamento entre as peças: um parecido por peça de cada vez (钅 → 钱, 艮 → 很,
  // 钅 → 钟...). Se todos dividissem só o radical, a outra peça entregaria a resposta.
  const escolhidos = [];
  const usados = new Set();
  const porPeca = [...meusTopo].map((p) => pontuados.filter((x) => x.topo.includes(p) || x.fundo.has(p) || (p === info.r && COMPONENTES[x.ch].r === p)));
  for (let rodada = 0; escolhidos.length < n && rodada < n; rodada += 1) {
    for (const lista of porPeca) {
      const x = lista.find((y) => !usados.has(y.ch));
      if (x && escolhidos.length < n) { escolhidos.push(x.ch); usados.add(x.ch); }
    }
  }
  for (const x of pontuados) {
    if (escolhidos.length >= n) break;
    if (!usados.has(x.ch)) { escolhidos.push(x.ch); usados.add(x.ch); }
  }
  return escolhidos;
}

/** Uma pista por caractere: a palavra mais curta do baralho (ou do léxico) que o contém. */
function pistas(state) {
  const doBaralho = (state.cardDrafts || [])
    .filter((d) => (d.status === 'approved' || d.status === 'exported') && d.kind !== 'sentence')
    .map((d) => ({ hz: d.front, py: d.pinyin, pt: d.back }));
  const porChar = new Map();
  for (const w of doBaralho) {
    if (!w.hz || !w.pt || w.hz.length > 4) continue;
    for (const c of new Set(w.hz)) {
      if (!HANZI.test(c) || !COMPONENTES[c]) continue;
      const atual = porChar.get(c);
      if (!atual || w.hz.length < atual.hz.length) porChar.set(c, w);
    }
  }
  return porChar;
}

/** Erros e acertos por caractere, do registro. */
function historico(state) {
  const m = new Map();
  for (const r of state.hanziRegistro || []) {
    const x = m.get(r.ch) || { erros: 0, acertos: 0, ultima: '' };
    if (r.ok) x.acertos += 1; else x.erros += 1;
    if (String(r.at) > x.ultima) { x.ultima = r.at; x.ultimoOk = r.ok; }
    m.set(r.ch, x);
  }
  return m;
}

const embaralhar = (xs, aleatorio) => {
  for (let i = xs.length - 1; i > 0; i -= 1) {
    const j = Math.floor(aleatorio() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
};

/**
 * Monta uma rodada. Prioridade: o que ele errou por último, depois o que nunca
 * viu aqui, depois o resto (menos acertos primeiro); sorteio dentro de cada faixa.
 * @param modo 'parecidos' | 'montar' | 'misturado'
 */
export function montarRodada(state, { n = 12, modo = 'misturado', aleatorio = Math.random } = {}) {
  const pool = universo();
  const hist = historico(state);
  const candidatos = [...pistas(state).entries()].filter(([ch]) => decomponivel(ch));
  const faixa = (ch) => {
    const x = hist.get(ch);
    if (!x) return 1;
    if (x.ultimoOk === false) return 0;
    return 2 + Math.min(x.acertos, 5);
  };
  const ordenados = embaralhar(candidatos.slice(), aleatorio).sort((a, b) => faixa(a[0]) - faixa(b[0]));
  const itens = [];
  for (const [ch, pista] of ordenados) {
    if (itens.length >= n) break;
    const vizinhos = parecidos(ch, { pool, n: 3, aleatorio });
    if (vizinhos.length < 3) continue;
    const certas = [...new Set(pecas(ch))];
    // Peça repetida (林 = 木+木) não dá para montar escolhendo peças: vira "parecidos".
    let tipo = modo === 'misturado' ? (itens.length % 2 ? 'montar' : 'parecidos') : modo;
    if (tipo === 'montar' && certas.length < 2) {
      if (modo === 'montar') continue;
      tipo = 'parecidos';
    }
    const base = { id: uid('hz'), ch, palavra: pista.hz, pinyin: pista.py, pt: pista.pt, tipo, vizinhos };
    if (tipo === 'parecidos') {
      itens.push({ ...base, opcoes: embaralhar([ch, ...vizinhos], aleatorio) });
    } else {
      const falsas = [...new Set(vizinhos.flatMap(pecas))].filter((p) => !certas.includes(p));
      const opcoes = embaralhar([...certas, ...embaralhar(falsas, aleatorio).slice(0, Math.max(3, 6 - certas.length))], aleatorio);
      itens.push({ ...base, pecas: certas, estrutura: lerIds(COMPONENTES[ch].d).op, opcoes });
    }
  }
  return itens;
}

/** Corrige a resposta. `montar`: o conjunto de peças escolhidas tem de ser exatamente o certo. */
export function corrigir(item, resposta) {
  if (item.tipo === 'parecidos') return resposta === item.ch;
  const a = [...(resposta || [])].sort();
  const b = [...item.pecas].sort();
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function registrarHanzi(state, item, ok, { at = new Date().toISOString() } = {}) {
  if (!Array.isArray(state.hanziRegistro)) state.hanziRegistro = [];
  const r = { id: uid('hzr'), at, ch: item.ch, tipo: item.tipo, ok: Boolean(ok) };
  state.hanziRegistro.push(r);
  return r;
}

/** Pinyin e significado de um caractere solto (para o retorno depois da resposta). */
export function sobre(ch) {
  const e = allEntries().find((x) => x.hz === ch);
  return e ? { py: e.py, pt: e.pt } : null;
}

export function resumoHanzi(state) {
  const hist = historico(state);
  const errados = [...hist.entries()].filter(([, x]) => x.ultimoOk === false).map(([ch]) => ch);
  return { vistos: hist.size, errados, disponiveis: [...pistas(state).keys()].filter(decomponivel).length };
}
