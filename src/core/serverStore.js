/**
 * Camada de persistência quando o app roda sob server.mjs.
 *
 * Com o estado em data/state.json, o gerador diário pode lê-lo de madrugada e
 * deixar o pacote pronto. Sem servidor (abrindo por um http.server qualquer), o
 * app continua funcionando no localStorage — só a geração automática deixa de
 * acontecer.
 *
 * A gravação é adiada (debounce) para não enviar um PUT por tecla digitada, e
 * forçada quando a aba perde o foco ou é fechada.
 */

const DEBOUNCE_MS = 500;

export async function probeServer({ fetchImpl = globalThis.fetch, timeoutMs = 1500 } = {}) {
  if (!fetchImpl) return { available: false, reason: 'fetch indisponível' };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl('/api/health', { signal: controller?.signal });
    if (!res.ok) return { available: false, reason: `HTTP ${res.status}` };
    const info = await res.json();
    return { available: Boolean(info?.ok), info };
  } catch (err) {
    return { available: false, reason: err?.message || String(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Busca o estado salvo no servidor. Devolve a string crua (ou null). */
export async function fetchState({ fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl('/api/state');
  if (!res.ok) throw new Error(`não foi possível ler o estado (HTTP ${res.status})`);
  const text = await res.text();
  return text && text !== 'null' ? text : null;
}

/**
 * Backend compatível com o Store: read() devolve o que já foi carregado,
 * write() agenda o envio ao servidor.
 */
export function serverBackend({ initialRaw = null, fetchImpl = globalThis.fetch, onError = () => {}, onSaved = () => {} } = {}) {
  let raw = initialRaw;
  let timer = null;
  let inFlight = false;
  let pending = false;

  async function flush() {
    if (inFlight) {
      pending = true;
      return;
    }
    inFlight = true;
    const body = raw;
    try {
      const res = await fetchImpl('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved(await res.json().catch(() => ({})));
    } catch (err) {
      onError(err);
    } finally {
      inFlight = false;
      if (pending) {
        pending = false;
        flush();
      }
    }
  }

  const backend = {
    read: () => raw,
    write: (value) => {
      raw = value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    },
    clear: () => {
      raw = null;
      backend.write(JSON.stringify(null));
    },
    flushNow: () => {
      if (timer) clearTimeout(timer);
      return flush();
    },
  };
  return backend;
}

/**
 * Resgate de dados presos no navegador.
 *
 * Armadilha real: abrir o app sem o servidor usa o localStorage, que é uma
 * caixa separada do data/state.json. Se depois você subir o servidor, o
 * progresso daquele dia pareceria perdido. Esta função detecta o caso —
 * servidor sem estado e navegador com estado — para a interface oferecer a
 * importação em vez de deixar o dado órfão.
 */
export function detectarEstadoOrfao({ servidorRaw, storage = globalThis.localStorage, key = 'mandarin-quest:state' } = {}) {
  const servidorVazio = !servidorRaw || servidorRaw === 'null';
  let local = null;
  try {
    local = storage?.getItem(key) || null;
  } catch {
    return { encontrado: false };
  }
  if (!local) return { encontrado: false };
  let parsed;
  try {
    parsed = JSON.parse(local);
  } catch {
    return { encontrado: false };
  }
  const temConteudo =
    (parsed?.xpEvents?.length || 0) > 0 ||
    (parsed?.placementAttempts?.length || 0) > 0 ||
    (parsed?.cardDrafts?.length || 0) > 0;
  if (!temConteudo) return { encontrado: false };
  return {
    encontrado: true,
    servidorVazio,
    raw: local,
    resumo:
      `${parsed.xpEvents?.length || 0} evento(s) de XP, ` +
      `${parsed.cardDrafts?.length || 0} cartão(ões), ` +
      `${parsed.placementAttempts?.length || 0} nivelamento(s)`,
  };
}

/** Lista os pacotes disponíveis no servidor (resumos). */
export async function listPacks({ fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl('/api/packs');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Baixa um pacote completo. */
export async function fetchPack(date, { fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(`/api/packs/${date}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Dispara o gerador no servidor. Pode demorar minutos. */
export async function requestGeneration({ backend = null, date = null, model = null, sendGaps = true, force = false, fetchImpl = globalThis.fetch } = {}) {
  const params = new URLSearchParams();
  if (backend) params.set('backend', backend);
  if (date) params.set('date', date);
  if (model) params.set('model', model);
  if (force) params.set('force', '1');
  if (!sendGaps) params.set('gaps', '0');
  const res = await fetchImpl(`/api/generate?${params}`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}`, log: data.log || '' };
  return { ok: Boolean(data.ok), log: data.log || '', exitCode: data.exitCode };
}
