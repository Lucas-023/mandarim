/**
 * Armazenamento no próprio aparelho, via IndexedDB.
 *
 * Por que não o localStorage: ele tem cota de ~5 MB, guarda só texto e, em
 * alguns navegadores móveis, é descartado antes do IndexedDB quando o aparelho
 * fica sem espaço. Para o celular ser a instalação principal — com milhares de
 * itens agendados e áudios gravados — o IndexedDB é o lugar certo.
 *
 * O Store do projeto é sincrono: por isso o estado é lido UMA vez na abertura
 * (`carregarEstado`) e as gravações seguintes são assíncronas e agrupadas, com
 * erro reportado em vez de silenciado.
 */

export const DB_NOME = 'mandarin-quest';
export const DB_VERSAO = 1;
export const LOJA_ESTADO = 'estado';
export const LOJA_MIDIA = 'midia';
export const CHAVE_ESTADO = 'atual';

const DEBOUNCE_MS = 400;

/** O navegador tem IndexedDB utilizável? */
export function temIndexedDB(escopo = globalThis) {
  return Boolean(escopo?.indexedDB);
}

/** Abre (e cria, se preciso) o banco. */
export function abrirBanco({ escopo = globalThis } = {}) {
  return new Promise((resolve, reject) => {
    if (!temIndexedDB(escopo)) {
      reject(new Error('IndexedDB indisponível neste navegador'));
      return;
    }
    const pedido = escopo.indexedDB.open(DB_NOME, DB_VERSAO);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(LOJA_ESTADO)) db.createObjectStore(LOJA_ESTADO);
      if (!db.objectStoreNames.contains(LOJA_MIDIA)) db.createObjectStore(LOJA_MIDIA);
    };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error || new Error('falha ao abrir o IndexedDB'));
    pedido.onblocked = () => reject(new Error('IndexedDB bloqueado por outra aba aberta'));
  });
}

function transacao(db, loja, modo) {
  return db.transaction(loja, modo).objectStore(loja);
}

export function ler(db, loja, chave) {
  return new Promise((resolve, reject) => {
    const pedido = transacao(db, loja, 'readonly').get(chave);
    pedido.onsuccess = () => resolve(pedido.result ?? null);
    pedido.onerror = () => reject(pedido.error);
  });
}

export function gravar(db, loja, chave, valor) {
  return new Promise((resolve, reject) => {
    const pedido = transacao(db, loja, 'readwrite').put(valor, chave);
    pedido.onsuccess = () => resolve(true);
    pedido.onerror = () => reject(pedido.error);
  });
}

export function apagar(db, loja, chave) {
  return new Promise((resolve, reject) => {
    const pedido = transacao(db, loja, 'readwrite').delete(chave);
    pedido.onsuccess = () => resolve(true);
    pedido.onerror = () => reject(pedido.error);
  });
}

export function listarChaves(db, loja) {
  return new Promise((resolve, reject) => {
    const pedido = transacao(db, loja, 'readonly').getAllKeys();
    pedido.onsuccess = () => resolve(pedido.result || []);
    pedido.onerror = () => reject(pedido.error);
  });
}

/** Lê o estado salvo (string JSON) ou null. */
export async function carregarEstado(db) {
  const valor = await ler(db, LOJA_ESTADO, CHAVE_ESTADO);
  return typeof valor === 'string' ? valor : valor == null ? null : JSON.stringify(valor);
}

/**
 * Backend compatível com o Store: leitura sincrona do que já foi carregado,
 * gravação assíncrona e agrupada no IndexedDB.
 */
export function idbBackend({ db, initialRaw = null, onError = () => {}, onSaved = () => {} } = {}) {
  let raw = initialRaw;
  let timer = null;
  let gravando = false;
  let pendente = false;

  async function descarregar() {
    if (gravando) {
      pendente = true;
      return;
    }
    gravando = true;
    try {
      await gravar(db, LOJA_ESTADO, CHAVE_ESTADO, raw);
      onSaved({ bytes: raw ? raw.length : 0 });
    } catch (err) {
      onError(err);
    } finally {
      gravando = false;
      if (pendente) {
        pendente = false;
        descarregar();
      }
    }
  }

  const backend = {
    read: () => raw,
    write: (valor) => {
      raw = valor;
      if (timer) clearTimeout(timer);
      timer = setTimeout(descarregar, DEBOUNCE_MS);
    },
    clear: () => {
      raw = null;
      if (timer) clearTimeout(timer);
      apagar(db, LOJA_ESTADO, CHAVE_ESTADO).catch(onError);
    },
    flushNow: () => {
      if (timer) clearTimeout(timer);
      return descarregar();
    },
  };
  return backend;
}

/** Quanto espaço o navegador concedeu e quanto já foi usado. */
export async function espacoEmDisco({ escopo = globalThis } = {}) {
  try {
    const est = await escopo.navigator?.storage?.estimate?.();
    if (!est) return null;
    return {
      usado: est.usage || 0,
      cota: est.quota || 0,
      percentual: est.quota ? Math.round(((est.usage || 0) / est.quota) * 100) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Pede ao navegador para não descartar os dados quando o aparelho ficar sem
 * espaço. No celular isso é o que separa "dados do app" de "cache descartável".
 */
export async function pedirArmazenamentoPersistente({ escopo = globalThis } = {}) {
  try {
    if (await escopo.navigator?.storage?.persisted?.()) return { ok: true, jaEra: true };
    const concedido = await escopo.navigator?.storage?.persist?.();
    return { ok: Boolean(concedido), jaEra: false };
  } catch (err) {
    return { ok: false, erro: err?.message || String(err) };
  }
}
