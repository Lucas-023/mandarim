/**
 * Guarda a chave da Claude API no aparelho.
 *
 * Fica FORA do estado do app de propósito: assim ela não entra no JSON exportado
 * nem é sincronizada entre aparelhos. Cada dispositivo tem a sua.
 *
 * Isto não é um cofre: quem tiver acesso ao navegador deste aparelho consegue
 * ler a chave. A interface diz isso com essas palavras, e recomenda chave
 * dedicada, com limite de gasto, revogável.
 */
export const CHAVE_API = 'mandarin-quest:api-key';

export function lerChaveApi({ storage = globalThis.localStorage } = {}) {
  try {
    return storage?.getItem(CHAVE_API) || null;
  } catch {
    return null;
  }
}

export function gravarChaveApi(valor, { storage = globalThis.localStorage } = {}) {
  try {
    if (!valor) storage?.removeItem(CHAVE_API);
    else storage?.setItem(CHAVE_API, valor);
    return true;
  } catch {
    return false;
  }
}

export function temChaveApi(opts) {
  return Boolean(lerChaveApi(opts));
}

/** Mostra só o começo e o fim, para o usuário confirmar qual chave está ali. */
export function mascararChave(valor) {
  const v = String(valor || '');
  if (v.length < 16) return '—';
  return `${v.slice(0, 11)}…${v.slice(-4)}`;
}
