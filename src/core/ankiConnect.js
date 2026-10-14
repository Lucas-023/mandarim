/**
 * Cliente mínimo do AnkiConnect (add-on do Anki Desktop).
 * Referência: https://github.com/amikey/anki-connect
 *
 * Premissas conservadoras:
 *  - A integração só funciona com o Anki aberto na MESMA máquina, com o
 *    add-on instalado e o navegador autorizado (webCorsOriginList).
 *  - Nenhuma função aqui devolve sucesso sem resposta válida do add-on.
 *  - Ler histórico de revisões é funcionalidade separada de criar notas;
 *    se não estiver disponível, o painel mostra "indisponível", não dados falsos.
 */

export const DEFAULT_URL = 'http://127.0.0.1:8765';
export const API_VERSION = 6;

/** Executa uma ação do AnkiConnect. Retorna { ok, result?, error? }. */
export async function invoke(action, params = {}, { url = DEFAULT_URL, timeoutMs = 5000, fetchImpl = globalThis.fetch } = {}) {
  if (!fetchImpl) return { ok: false, error: 'fetch indisponível neste ambiente' };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, version: API_VERSION, params }),
      signal: controller?.signal,
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} do AnkiConnect` };
    const data = await res.json();
    if (data && data.error) return { ok: false, error: String(data.error) };
    if (!data || !('result' in data)) return { ok: false, error: 'resposta inesperada do AnkiConnect' };
    return { ok: true, result: data.result };
  } catch (err) {
    const msg = err?.name === 'AbortError'
      ? 'tempo esgotado ao falar com o AnkiConnect'
      : `não foi possível conectar ao AnkiConnect (${err?.message || err})`;
    return { ok: false, error: msg };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkConnection(opts = {}) {
  const res = await invoke('version', {}, opts);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, version: res.result, compatible: Number(res.result) >= API_VERSION };
}

export async function listDecks(opts = {}) {
  return invoke('deckNames', {}, opts);
}

export async function listModels(opts = {}) {
  return invoke('modelNames', {}, opts);
}

export async function modelFields(modelName, opts = {}) {
  return invoke('modelFieldNames', { modelName }, opts);
}

/**
 * Monta a nota no formato do AnkiConnect.
 * `fieldMap` liga campos do cartão aos campos do modelo de nota escolhido.
 */
export function buildNote(card, { deck, model, fieldMap, allowDuplicate = false }) {
  const fields = {};
  for (const [modelField, cardKey] of Object.entries(fieldMap)) {
    if (cardKey === 'audio') {
      fields[modelField] = card.audio?.name ? `[sound:${card.audio.name}]` : '';
      continue;
    }
    const value = card[cardKey];
    fields[modelField] = Array.isArray(value) ? value.join(' ') : value == null ? '' : String(value);
  }
  return {
    deckName: deck,
    modelName: model,
    fields,
    options: { allowDuplicate, duplicateScope: 'deck' },
    tags: ['mandarin-quest', ...(card.tags || [])].map((t) => String(t).replace(/\s+/g, '-')),
  };
}

/**
 * Envia notas. Garante que o baralho e o modelo existem antes de tentar.
 * Retorna o resultado por nota: ids numéricos indicam criação; null indica
 * que o Anki recusou (duplicata, campo vazio etc.).
 */
/**
 * Guarda um arquivo de mídia no Anki. `dataBase64` é o conteúdo do arquivo.
 * Se o add-on instalado não tiver esta ação, o erro é devolvido como está —
 * nada é reportado como enviado.
 */
export async function storeMedia(filename, dataBase64, opts = {}) {
  return invoke('storeMediaFile', { filename, data: dataBase64 }, opts);
}

export async function addCards(cards, { deck, model, fieldMap, allowDuplicate = false, media = [], ...opts }) {
  const conn = await checkConnection(opts);
  if (!conn.ok) return { ok: false, error: conn.error, stage: 'conexao' };

  const decks = await listDecks(opts);
  if (!decks.ok) return { ok: false, error: decks.error, stage: 'baralhos' };
  if (!decks.result.includes(deck)) {
    const created = await invoke('createDeck', { deck }, opts);
    if (!created.ok) return { ok: false, error: `baralho "${deck}" não existe e não pôde ser criado: ${created.error}`, stage: 'baralhos' };
  }

  const models = await listModels(opts);
  if (!models.ok) return { ok: false, error: models.error, stage: 'modelos' };
  if (!models.result.includes(model)) {
    return { ok: false, error: `o modelo de nota "${model}" não existe no seu Anki`, stage: 'modelos' };
  }

  const fieldsRes = await modelFields(model, opts);
  if (!fieldsRes.ok) return { ok: false, error: fieldsRes.error, stage: 'campos' };
  const unknown = Object.keys(fieldMap).filter((f) => !fieldsRes.result.includes(f));
  if (unknown.length) {
    return { ok: false, error: `campos inexistentes no modelo "${model}": ${unknown.join(', ')}`, stage: 'campos' };
  }

  // Mídia primeiro: se o áudio não entrar, o cartão não deve prometer áudio.
  const midiaFalhou = [];
  for (const arquivo of media) {
    const res = await storeMedia(arquivo.filename, arquivo.data, opts);
    if (!res.ok) midiaFalhou.push({ filename: arquivo.filename, error: res.error });
  }
  if (midiaFalhou.length === media.length && media.length > 0) {
    return {
      ok: false,
      stage: 'midia',
      error: `nenhum áudio pôde ser enviado (${midiaFalhou[0].error})`,
      mediaFailed: midiaFalhou,
    };
  }

  const notes = cards.map((c) => buildNote(c, { deck, model, fieldMap, allowDuplicate }));
  const res = await invoke('addNotes', { notes }, opts);
  if (!res.ok) return { ok: false, error: res.error, stage: 'envio' };

  const ids = res.result || [];
  const added = [];
  const rejected = [];
  ids.forEach((id, i) => (id ? added.push({ card: cards[i], id }) : rejected.push(cards[i])));
  return {
    ok: true,
    added,
    rejected,
    mediaFailed: midiaFalhou,
    partial: rejected.length > 0 || midiaFalhou.length > 0,
    message:
      `${added.length} de ${cards.length} nota(s) criada(s).` +
      (rejected.length ? ` ${rejected.length} recusada(s) pelo Anki (possível duplicata).` : '') +
      (midiaFalhou.length ? ` ${midiaFalhou.length} áudio(s) não foram enviados.` : ''),
  };
}

/**
 * Histórico de revisões do Anki.
 *
 * A criação de notas e a leitura do histórico são ações distintas do add-on, e
 * nem toda versão instalada tem as duas. Se a ação não existir, devolvemos
 * `unsupported: true` e a interface mostra "indisponível" — nunca um número
 * inventado.
 */
export async function reviewStats({ days = 30, ...opts } = {}) {
  const hoje = await invoke('getNumCardsReviewedToday', {}, opts);
  if (!hoje.ok) {
    const indisponivel = /unsupported action/i.test(hoje.error || '');
    return {
      ok: false,
      unsupported: indisponivel,
      error: indisponivel
        ? 'esta versão do AnkiConnect não expõe o histórico de revisões'
        : hoje.error,
    };
  }

  const porDia = await invoke('getNumCardsReviewedByDay', {}, opts);
  const serie = porDia.ok && Array.isArray(porDia.result)
    ? porDia.result
        .map(([dia, quantidade]) => ({ day: String(dia), count: Number(quantidade) || 0 }))
        .sort((a, b) => a.day.localeCompare(b.day))
        .slice(-days)
    : [];

  return {
    ok: true,
    today: Number(hoje.result) || 0,
    byDay: serie,
    byDayAvailable: porDia.ok,
    byDayError: porDia.ok ? null : porDia.error,
    fetchedAt: new Date().toISOString(),
  };
}

/** Quantos cartões existem no baralho e quantos estão vencidos. */
export async function deckSnapshot({ deck, ...opts } = {}) {
  const total = await invoke('findCards', { query: `deck:"${deck}"` }, opts);
  if (!total.ok) return { ok: false, error: total.error };
  const vencidos = await invoke('findCards', { query: `deck:"${deck}" is:due` }, opts);
  return {
    ok: true,
    total: total.result.length,
    due: vencidos.ok ? vencidos.result.length : null,
    dueError: vencidos.ok ? null : vencidos.error,
  };
}

/** Conta notas já existentes com a mesma frente, para avisar sobre duplicatas. */
export async function findDuplicates(fronts, { deck, ...opts }) {
  const out = {};
  for (const front of fronts) {
    const query = `deck:"${deck}" "${String(front).replace(/"/g, '')}"`;
    const res = await invoke('findNotes', { query }, opts);
    if (!res.ok) return { ok: false, error: res.error };
    out[front] = res.result.length;
  }
  return { ok: true, counts: out };
}
