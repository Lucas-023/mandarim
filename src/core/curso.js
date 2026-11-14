/**
 * Palavras das lições do curso (content/vocabLicoes.js) dentro do Baralho.
 *
 * Até 2026-11-09 elas viviam numa aba à parte (Vocabulário, state.vocabulario).
 * O aluno pediu tudo num baralho só, e disse que essas palavras ele já sabe:
 * entram para ele não esquecer. Então, na primeira vez:
 *   - cada palavra vira um rascunho aprovado (id fixo `curso:<汉字>`, para dois
 *     aparelhos produzirem o mesmo id e a mesclagem juntar em vez de duplicar);
 *   - o cartão que já tinha progresso na aba Vocabulário leva o agendamento junto,
 *     e o registro de respostas também;
 *   - o cartão que nunca foi estudado entra como JÁ SABIDO: em revisão, com a
 *     memória inicial de um "Bom", espalhado pelas próximas duas semanas (todos
 *     os "reconhecer" primeiro, depois os "produzir") para não chegarem juntos.
 *     Fica marcado `conhecidoDeclarado`: é declaração do aluno, não resposta. Nenhuma
 *     entrada é criada no registro.
 *
 * Na mesma primeira vez, cartões de pacotes que estavam pendentes são aprovados
 * (eles entram como novos), porque a partir daqui o pacote vai direto ao baralho.
 *
 * Palavra que entrar na lista depois vira cartão NOVO, como qualquer outro. E
 * mesmo na primeira vez (aparelho novo, dados apagados) só as lições até
 * ULTIMA_LICAO_SABIDA (5) entram como sabidas: as lições 6+ nascem novas. A lista do que já foi incorporado fica em `deck.cursoIncluido`:
 * excluir o cartão de uma palavra do curso não faz ela voltar sozinha.
 *
 * Nada aqui é proficiência nem dá XP.
 */
import { LICOES, PALAVRAS, ULTIMA_LICAO_SABIDA } from './content/vocabLicoes.js';
import { normalizeFront } from './flashcards.js';
import { garantirBaralho, configBaralho, sincronizarCartoes, idCartao } from './baralho.js';
import { memoriaInicial } from './fsrs.js';
import { dayKey, addDays } from './xp.js';

export const idCurso = (hanzi) => `curso:${hanzi}`;
/** Em quantos dias espalhar os cartões "já sabidos" de cada direção. */
export const DIAS_ESPALHAR = 7;
const MODELOS_CURSO = ['reconhecer', 'produzir'];

const LICAO = new Map(LICOES.map((l) => [l.numero, l]));

export function precisaIncorporarCurso(state) {
  const feitos = new Set(state.deck?.cursoIncluido || []);
  return PALAVRAS.some((p) => !feitos.has(p.hanzi)) || Boolean(state.vocabulario?.cartoes?.length || state.vocabulario?.registro?.length);
}

function rascunhoDoCurso(p, agora, i) {
  const licao = LICAO.get(p.licao);
  return {
    id: idCurso(p.hanzi),
    status: 'approved',
    front: p.hanzi,
    back: p.pt,
    pinyin: p.pinyin,
    example: '',
    exampleTranslation: '',
    usageNote: p.nota || '',
    context: `Lição ${p.licao}${licao ? ` — ${licao.titulo}` : ''}`,
    difficulty: 1,
    tags: ['curso', `licao-${p.licao}`, ...(p.extra ? ['extra'] : []), ...(p.pronuncia ? ['pronuncia'] : [])],
    kind: 'word',
    template: 'zh_pt',
    duplicate: false,
    needsReview: false,
    source: `curso, lição ${p.licao}`,
    // Um milissegundo por palavra: a ordem da lista vira a ordem dos cartões novos.
    createdAt: new Date(agora.getTime() + i).toISOString(),
  };
}

const meiaNoite = (dia) => {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d).toISOString();
};

/** Cartão em revisão com a memória de um primeiro "Bom", vencendo daqui a `dias`. */
function cartaoJaSabido(draftId, modelo, dias, agora) {
  const { s, d } = memoriaInicial(3);
  return {
    id: idCartao(draftId, modelo),
    draftId,
    modelo,
    estado: 'revisao',
    due: meiaNoite(addDays(dayKey(agora), dias)),
    s,
    d,
    passo: 0,
    intervaloDias: dias,
    reps: 0,
    lapsos: 0,
    ultimaRevisao: agora.toISOString(),
    suspenso: false,
    sanguessuga: false,
    conhecidoDeclarado: true,
    criadoEm: agora.toISOString(),
  };
}

const maisRecente = (a, b) => (String(b?.ultimaRevisao || '') > String(a?.ultimaRevisao || '') ? b : a);

/**
 * Traz as palavras do curso (e o progresso da antiga aba Vocabulário) para o
 * Baralho. Idempotente. @returns {{rascunhos, migrados, jaSabidos, novos, registro}}
 */
export function incorporarCurso(state, { agora = new Date() } = {}) {
  const deck = garantirBaralho(state);
  const primeiraVez = !Array.isArray(deck.cursoIncluido);
  const feitos = new Set(deck.cursoIncluido || []);
  const porFrente = new Map(state.cardDrafts.map((d) => [normalizeFront(d.front), d]));
  const rel = { rascunhos: 0, migrados: 0, jaSabidos: 0, novos: 0, registro: 0, pacotesAprovados: 0 };

  // Junto com a mudança veio "o que o pacote traz entra sozinho": os cartões de
  // pacotes que ficaram pendentes antes disso entram agora, como novos.
  if (primeiraVez && configBaralho(state).pacoteDireto) {
    for (const d of state.cardDrafts) {
      if (d.status === 'pending' && String(d.source || '').startsWith('pacote')) {
        d.status = 'approved';
        rel.pacotesAprovados += 1;
      }
    }
  }

  // 1. Um rascunho aprovado por palavra ainda não incorporada.
  const entraram = [];
  PALAVRAS.forEach((p, i) => {
    if (feitos.has(p.hanzi)) return;
    feitos.add(p.hanzi);
    let d = porFrente.get(normalizeFront(p.hanzi));
    if (d?.status === 'rejected') return; // ele já tinha excluído essa palavra
    if (d) {
      // Já existia (de um pacote ou adicionada à mão): aproveita, marcando a origem.
      if (d.status === 'pending') d.status = 'approved';
      d.tags = [...new Set([...(d.tags || []), 'curso', `licao-${p.licao}`])];
    } else {
      d = rascunhoDoCurso(p, agora, i);
      state.cardDrafts.push(d);
      porFrente.set(normalizeFront(p.hanzi), d);
      rel.rascunhos += 1;
    }
    entraram.push({ p, d });
  });
  deck.cursoIncluido = [...feitos];

  // 2. Progresso da aba Vocabulário (cartão `汉字:modelo`) vai para o cartão do baralho.
  const draftDe = (hanzi) => {
    const d = porFrente.get(normalizeFront(hanzi));
    return d && d.status !== 'rejected' ? d : null;
  };
  const cartoes = new Map(deck.cartoes.map((c) => [c.id, c]));
  for (const v of state.vocabulario?.cartoes || []) {
    if (v.estado === 'novo') continue;
    const d = draftDe(v.palavra);
    if (!d) continue;
    const { palavra, ...resto } = v;
    const id = idCartao(d.id, v.modelo);
    const migrado = { sanguessuga: false, ...resto, id, draftId: d.id };
    const atual = cartoes.get(id);
    if (!atual || atual.estado === 'novo' || maisRecente(atual, migrado) === migrado) {
      cartoes.set(id, migrado);
      rel.migrados += 1;
    }
  }

  // 3. O que nunca foi estudado: já sabido (primeira vez) ou novo (palavras que chegarem depois).
  const cfg = configBaralho(state);
  const modelos = MODELOS_CURSO.filter((m) => cfg.modelos[m]);
  const semEstudo = [];
  for (const m of modelos) {
    for (const { d } of entraram) {
      const id = idCartao(d.id, m);
      if (!cartoes.has(id) || cartoes.get(id).estado === 'novo') semEstudo.push({ d, m, id });
    }
  }
  const licaoDe = new Map(entraram.map(({ p, d }) => [d.id, p.licao]));
  const sabida = (x) => primeiraVez && licaoDe.get(x.d.id) <= ULTIMA_LICAO_SABIDA;
  if (primeiraVez) {
    // Reconhecer nos dias 1–7, produzir nos dias 8–14: irmãos longe um do outro.
    // Se não sobrou nenhum "reconhecer" por estudar, o "produzir" já começa amanhã.
    let inicio = 1;
    for (const m of modelos) {
      const lista = semEstudo.filter((x) => x.m === m && sabida(x));
      if (!lista.length) continue;
      const porDia = Math.max(1, Math.ceil(lista.length / DIAS_ESPALHAR));
      lista.forEach((x, i) => {
        cartoes.set(x.id, cartaoJaSabido(x.d.id, m, inicio + Math.floor(i / porDia), agora));
        rel.jaSabidos += 1;
      });
      inicio += DIAS_ESPALHAR;
    }
  }
  rel.novos = semEstudo.filter((x) => !sabida(x)).length;
  deck.cartoes = [...cartoes.values()];

  // 4. Registro de respostas da aba Vocabulário, com os ids do baralho.
  const ids = new Set(deck.registro.map((r) => r.id));
  for (const r of state.vocabulario?.registro || []) {
    if (ids.has(r.id)) continue;
    const d = draftDe(r.palavra);
    if (!d) continue;
    const { palavra, anterior, ...resto } = r;
    deck.registro.push({ ...resto, cartaoId: idCartao(d.id, r.modelo), draftId: d.id, origem: 'vocabulario' });
    ids.add(r.id);
    rel.registro += 1;
  }
  deck.registro.sort((a, b) => String(a.at).localeCompare(String(b.at)));

  // A aba antiga deixa de existir: o que restava nela já está no baralho.
  state.vocabulario = { cartoes: [], registro: [], config: {} };
  // Cartões que faltam (palavras novas do curso, outros tipos ligados) nascem novos.
  sincronizarCartoes(state, { agora });
  return rel;
}

/**
 * Palavras do curso que vão para o briefing como vistas: o vocabulário oficial
 * das lições (dado em aula). Os extras dos slides (frutas, legumes, pares de
 * pronúncia...) ficam de fora: estão no baralho, mas ele ainda não os viu de fato.
 */
export const palavrasDoCurso = () => PALAVRAS.filter((p) => !p.extra).map((p) => p.hanzi);
