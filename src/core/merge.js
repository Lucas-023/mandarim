/**
 * Mesclagem de dois estados — o do computador e o do celular.
 *
 * Por que mesclar em vez de sobrescrever: com duas instalações, "importar" um
 * arquivo apagaria o que foi estudado no outro aparelho. Como quase tudo aqui é
 * histórico que só cresce (eventos de XP, evidências, resultados, cartões), a
 * união é a operação correta e sem perda.
 *
 * Regras, todas explícitas:
 *  - Listas de histórico: união, sem duplicar (por `key` nos eventos de XP, por
 *    `id` no resto, por `date` nos pacotes, por `hz` no léxico).
 *  - Cartões: união por id e, em seguida, um por frente — fica o de estado mais
 *    avançado (exportado > aprovado > pendente > rejeitado).
 *  - Conquistas: fica a data mais antiga (foi quando você realmente conseguiu).
 *  - Agendamento: por item, fica o registro revisado mais recentemente.
 *  - Baralho: respostas por união; cada cartão fica com a versão respondida
 *    por último; cartões de rascunho duplicado passam para o que ficou.
 *  - Campos que não são lista (perfil, configurações, plano): fica o do estado
 *    alterado por último, pelo `updatedAt`.
 *  - Sessão em andamento: fica a mais recente.
 *
 * A chave da API nunca entra aqui: ela vive fora do estado, por aparelho.
 */
import { migrate } from './storage.js';
import { normalizeFront } from './flashcards.js';

const PESO_STATUS = { exported: 4, approved: 3, pending: 2, rejected: 1 };

function unirPor(a = [], b = [], chave) {
  const mapa = new Map();
  let novos = 0;
  for (const item of a) {
    const k = chave(item);
    if (k != null) mapa.set(k, item);
  }
  for (const item of b) {
    const k = chave(item);
    if (k == null) continue;
    if (!mapa.has(k)) {
      mapa.set(k, item);
      novos += 1;
    }
  }
  return { lista: [...mapa.values()], novos };
}

function ordenarPorData(lista, campo = 'at') {
  return lista.slice().sort((x, y) => String(x[campo] || '').localeCompare(String(y[campo] || '')));
}

/**
 * @returns {{state: object, relatorio: object}}
 */
export function mergeStates(aBruto, bBruto) {
  const a = migrate(aBruto);
  const b = migrate(bBruto);
  const aMaisNovo = String(a.updatedAt || a.createdAt || '') >= String(b.updatedAt || b.createdAt || '');
  const recente = aMaisNovo ? a : b;
  const antigo = aMaisNovo ? b : a;

  const relatorio = { escalaresDe: aMaisNovo ? 'este aparelho' : 'o arquivo recebido', adicionados: {} };
  const resultado = { ...recente };

  const listas = [
    ['xpEvents', (x) => x.key || x.id],
    ['skillEvidence', (x) => x.id],
    ['exerciseResults', (x) => x.id],
    ['sessions', (x) => x.id],
    ['conversations', (x) => x.id],
    ['cardExports', (x) => x.id],
    ['placementAttempts', (x) => x.id],
    ['assessments', (x) => x.id],
    ['packs', (x) => x.date],
    ['lexiconExtra', (x) => x.hz],
    ['cardDrafts', (x) => x.id],
  ];
  for (const [campo, chave] of listas) {
    const { lista, novos } = unirPor(a[campo], b[campo], chave);
    resultado[campo] = campo === 'packs' ? ordenarPorData(lista, 'ingestedAt') : ordenarPorData(lista);
    relatorio.adicionados[campo] = novos;
  }

  // Cartões: um por frente, mantendo o mais avançado.
  const porFrente = new Map();
  for (const d of resultado.cardDrafts) {
    const k = normalizeFront(d.front);
    const atual = porFrente.get(k);
    if (!atual || (PESO_STATUS[d.status] || 0) > (PESO_STATUS[atual.status] || 0)) porFrente.set(k, d);
  }
  const antesCartoes = resultado.cardDrafts.length;
  // Rascunho descartado como duplicata: seus cartões do baralho passam para o que ficou.
  const remapear = new Map();
  for (const d of resultado.cardDrafts) {
    const ficou = porFrente.get(normalizeFront(d.front));
    if (ficou && ficou.id !== d.id) remapear.set(d.id, ficou.id);
  }
  resultado.cardDrafts = [...porFrente.values()];
  relatorio.cartoesDuplicadosRemovidos = antesCartoes - resultado.cardDrafts.length;

  // Conquistas: a data mais antiga vale.
  const conquistas = new Map();
  for (const c of [...(a.achievements || []), ...(b.achievements || [])]) {
    const atual = conquistas.get(c.id);
    if (!atual || String(c.at) < String(atual.at)) conquistas.set(c.id, c);
  }
  resultado.achievements = [...conquistas.values()];

  resultado.dismissedRecommendations = [
    ...new Set([...(a.dismissedRecommendations || []), ...(b.dismissedRecommendations || [])]),
  ];

  // Agendamento: por item, fica o revisado mais recentemente.
  const itens = {};
  let itensNovos = 0;
  for (const estado of [a, b]) {
    for (const [ref, item] of Object.entries(estado.schedule?.items || {})) {
      const atual = itens[ref];
      if (!atual) {
        itens[ref] = item;
        if (estado === b) itensNovos += 1;
        continue;
      }
      const marcoAtual = atual.lastSeenAt || atual.introducedAt || '';
      const marcoNovo = item.lastSeenAt || item.introducedAt || '';
      if (String(marcoNovo) > String(marcoAtual)) itens[ref] = item;
    }
  }
  resultado.schedule = { items: itens };
  relatorio.adicionados.schedule = itensNovos;

  // Baralho: registro de respostas por união; cada cartão fica com a versão
  // respondida por último (é ela que carrega o agendamento certo).
  const cartoes = new Map();
  let cartoesNovos = 0;
  for (const estado of [a, b]) {
    for (const bruto of estado.deck?.cartoes || []) {
      const draftId = remapear.get(bruto.draftId) || bruto.draftId;
      const c = { ...bruto, draftId, id: `${draftId}:${bruto.modelo}` };
      const atual = cartoes.get(c.id);
      if (!atual) {
        cartoes.set(c.id, c);
        if (estado === b) cartoesNovos += 1;
      } else if (String(c.ultimaRevisao || '') > String(atual.ultimaRevisao || '')) {
        cartoes.set(c.id, c);
      }
    }
  }
  const registro = unirPor(a.deck?.registro, b.deck?.registro, (x) => x.id);
  resultado.deck = {
    cartoes: [...cartoes.values()],
    // O retrato para desfazer só vale no aparelho onde a resposta foi dada.
    registro: ordenarPorData(registro.lista).map(({ anterior, agendaAnterior, ...r }) => r),
    config: recente.deck?.config || antigo.deck?.config || {},
  };
  relatorio.adicionados.baralho = cartoesNovos + registro.novos;

  // Sessão em andamento: a mais recente das duas (ou a que existir).
  const sessaoA = a.activeSession;
  const sessaoB = b.activeSession;
  resultado.activeSession = !sessaoA ? sessaoB
    : !sessaoB ? sessaoA
      : String(sessaoA.updatedAt) >= String(sessaoB.updatedAt) ? sessaoA : sessaoB;

  resultado.createdAt = [a.createdAt, b.createdAt].filter(Boolean).sort()[0] || recente.createdAt;
  resultado.updatedAt = new Date().toISOString();
  resultado.demo = Boolean(a.demo && b.demo);
  // Campos escalares vêm do estado alterado por último; registramos qual foi.
  for (const campo of ['profile', 'settings', 'plan', 'workspace', 'ankiStats']) {
    resultado[campo] = recente[campo] ?? antigo[campo] ?? null;
  }

  relatorio.total = Object.values(relatorio.adicionados).reduce((n, v) => n + v, 0);
  return { state: resultado, relatorio };
}

/** Frase para a interface mostrar depois da mesclagem. */
export function descreverMesclagem(relatorio) {
  const partes = Object.entries(relatorio.adicionados)
    .filter(([, n]) => n > 0)
    .map(([campo, n]) => `${n} em ${campo}`);
  if (!partes.length) return 'Nada novo: os dois lados já estavam iguais.';
  return (
    `${relatorio.total} registro(s) novo(s) incorporado(s) (${partes.join(', ')}). ` +
    `Perfil e configurações vieram de ${relatorio.escalaresDe}.` +
    (relatorio.cartoesDuplicadosRemovidos ? ` ${relatorio.cartoesDuplicadosRemovidos} cartão(ões) duplicado(s) unificado(s).` : '')
  );
}
