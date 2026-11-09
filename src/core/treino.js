/**
 * Treino livre do Baralho: passar pelos cartões quantas vezes quiser, fora do
 * agendamento. Veio da antiga aba Vocabulário e agora vale para o baralho todo
 * (palavras do curso, dos pacotes e as adicionadas à mão).
 *
 * NÃO mexe em `deck.cartoes` nem em `deck.registro`, de propósito: repetir
 * dezenas de vezes no mesmo dia, com a palavra fresca, mexeria na estabilidade
 * do FSRS (cada "Errei" conta) sem dizer nada sobre a memória de longo prazo.
 * Também não dá XP nem é proficiência. O agendamento continua trazendo cada
 * cartão de volta no dia certo.
 *
 * O treino em andamento fica em state.deck.treino (sobrevive a recarregar). É
 * coisa do aparelho: a mesclagem não o leva.
 */
import { garantirBaralho, configBaralho } from './baralho.js';
import { dayKey } from './xp.js';

const NO_BARALHO = new Set(['approved', 'exported']);
const DIRECOES = ['reconhecer', 'produzir'];

/** Quantos cartões depois o errado volta (perto para fixar, longe para não decorar a posição). */
export const VOLTA_APOS = 4;

export const FILTROS_TREINO = {
  todas: 'Todo o baralho',
  hoje: 'Só as que vi hoje',
  estudadas: 'Só as que já estudei',
  dificeis: 'Só as que já errei',
};
export const ORIGENS_TREINO = {
  todas: 'Todas as origens',
  curso: 'Palavras do curso',
  pacotes: 'Pacotes do dia',
  outras: 'Adicionadas por mim',
};

export function origemDe(rascunho) {
  if ((rascunho.tags || []).includes('curso')) return 'curso';
  if (String(rascunho.source || '').startsWith('pacote')) return 'pacotes';
  return 'outras';
}

/**
 * @param quais 'todas' | 'hoje' (respondidas hoje no estudo normal) | 'estudadas' | 'dificeis'
 * @param origem 'todas' | 'curso' | 'pacotes' | 'outras'
 * @param direcao 'reconhecer' | 'produzir' | 'misturado'
 */
export function montarTreino(state, { quais = 'todas', origem = 'todas', direcao = 'misturado', agora = new Date(), aleatorio = Math.random } = {}) {
  const cfg = configBaralho(state);
  const cartoes = (state.deck?.cartoes || []).filter((c) => !c.suspenso);
  const porRascunho = new Map();
  for (const c of cartoes) {
    if (!porRascunho.has(c.draftId)) porRascunho.set(c.draftId, []);
    porRascunho.get(c.draftId).push(c);
  }
  const registro = state.deck?.registro || [];
  const hoje = dayKey(agora);
  const vistasHoje = new Set(registro.filter((r) => dayKey(new Date(r.at)) === hoje).map((r) => r.draftId));
  const erradas = new Set(registro.filter((r) => r.nota === 1).map((r) => r.draftId));

  const rascunhos = state.cardDrafts.filter((d) => {
    if (!NO_BARALHO.has(d.status) || !porRascunho.has(d.id)) return false;
    if (origem !== 'todas' && origemDe(d) !== origem) return false;
    const cs = porRascunho.get(d.id);
    // "Estudada" = respondida de verdade ou declarada sabida (palavras do curso).
    if (quais === 'estudadas') return cs.some((c) => c.estado !== 'novo');
    if (quais === 'hoje') return vistasHoje.has(d.id);
    if (quais === 'dificeis') return erradas.has(d.id) || cs.some((c) => c.lapsos > 0);
    return true;
  });
  const ligadas = DIRECOES.filter((m) => cfg.modelos[m]);
  const sortear = () => (ligadas.length ? ligadas[Math.floor(aleatorio() * ligadas.length)] : 'reconhecer');
  const fila = rascunhos.map((d) => ({
    draftId: d.id,
    modelo: direcao === 'misturado' ? sortear() : direcao,
  }));
  embaralhar(fila, aleatorio);
  return novoTreino(fila);
}

const novoTreino = (fila) => ({ fila, total: fila.length, respondidas: 0, acertosDePrimeira: 0, erradas: [], jaErrou: [] });

function embaralhar(lista, aleatorio) {
  for (let i = lista.length - 1; i > 0; i -= 1) {
    const j = Math.floor(aleatorio() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
}

/**
 * Responde o primeiro da fila. Acertou: sai. Errou: volta VOLTA_APOS cartões
 * depois, até acertar. Muda o objeto do treino e o devolve.
 */
export function responderTreino(treino, acertou) {
  const atual = treino.fila.shift();
  if (!atual) return treino;
  treino.respondidas += 1;
  const chave = `${atual.draftId}:${atual.modelo}`;
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
  return novoTreino(fila);
}

export function salvarTreino(state, treino) {
  garantirBaralho(state).treino = treino;
  return treino;
}

/** Treino em andamento; cartão cujo rascunho sumiu (excluído) sai da fila. */
export function treinoAtual(state) {
  const t = state.deck?.treino;
  if (!t) return null;
  const vivos = new Set(state.cardDrafts.filter((d) => NO_BARALHO.has(d.status)).map((d) => d.id));
  if (t.fila.some((x) => !vivos.has(x.draftId))) t.fila = t.fila.filter((x) => vivos.has(x.draftId));
  return t;
}

/** Quantos cartões distintos ainda faltam no treino. */
export const faltamNoTreino = (t) => new Set(t.fila.map((x) => `${x.draftId}:${x.modelo}`)).size;
