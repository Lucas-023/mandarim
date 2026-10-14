/**
 * Onde os áudios gravados ficam guardados.
 *
 * Dois destinos, decididos pelo modo do app:
 *  - 'servidor': aberto pelo computador → arquivo em data/media/, que o
 *    AnkiConnect consegue enviar e que você pode copiar à mão para o Anki.
 *  - 'aparelho': celular ou navegador sem servidor → o próprio IndexedDB.
 *
 * O cartão guarda só `{ name, armazenamento }`. A URL para tocar é resolvida na
 * hora: URLs de blob não sobrevivem a recarregar a página, então guardá-las
 * seria guardar um link quebrado.
 */
import { LOJA_MIDIA, ler, gravar, apagar, listarChaves } from './idbStore.js';

export const DESTINO_SERVIDOR = 'servidor';
export const DESTINO_APARELHO = 'aparelho';

/** Guarda o áudio e devolve a referência para o cartão. */
export async function salvarMidia(blob, nome, { modo, db, fetchImpl = globalThis.fetch } = {}) {
  if (modo === 'server') {
    // Conexão de celular cai: a falha tem de voltar como resultado, não como
    // exceção solta que ninguém trata.
    try {
      const res = await fetchImpl(`/api/media?name=${encodeURIComponent(nome)}`, {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok || !dados.ok) return { ok: false, error: dados.error || `HTTP ${res.status}` };
      return { ok: true, audio: { name: dados.name, armazenamento: DESTINO_SERVIDOR }, bytes: dados.bytes };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  if (!db) return { ok: false, error: 'sem armazenamento no aparelho para guardar o áudio' };
  try {
    await gravar(db, LOJA_MIDIA, nome, blob);
    return { ok: true, audio: { name: nome, armazenamento: DESTINO_APARELHO }, bytes: blob.size || 0 };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/** URL tocável para o áudio de um cartão (criada na hora). */
export async function urlDaMidia(audio, { db, criarUrl = globalThis.URL?.createObjectURL } = {}) {
  if (!audio?.name) return null;
  if (audio.armazenamento === DESTINO_APARELHO) {
    if (!db || !criarUrl) return null;
    try {
      const blob = await ler(db, LOJA_MIDIA, audio.name);
      return blob ? criarUrl(blob) : null;
    } catch {
      return null;
    }
  }
  return `/api/media/${encodeURIComponent(audio.name)}`;
}

/** Bytes em base64, para enviar ao Anki pelo AnkiConnect. */
export async function midiaEmBase64(audio, { db, fetchImpl = globalThis.fetch } = {}) {
  try {
    let buffer;
    if (audio.armazenamento === DESTINO_APARELHO) {
      const blob = await ler(db, LOJA_MIDIA, audio.name);
      if (!blob) return { ok: false, error: 'áudio não encontrado no aparelho' };
      buffer = await blob.arrayBuffer();
    } else {
      const res = await fetchImpl(`/api/media/${encodeURIComponent(audio.name)}`);
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      buffer = await res.arrayBuffer();
    }
    return { ok: true, data: paraBase64(buffer) };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export function paraBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binario = '';
  const bloco = 0x8000;
  for (let i = 0; i < bytes.length; i += bloco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + bloco));
  }
  return (globalThis.btoa || nodeBtoa)(binario);
}

function nodeBtoa(bin) {
  return Buffer.from(bin, 'binary').toString('base64');
}

export async function removerMidia(audio, { db, fetchImpl = globalThis.fetch } = {}) {
  if (!audio?.name) return { ok: true };
  if (audio.armazenamento === DESTINO_APARELHO) {
    if (!db) return { ok: false, error: 'sem armazenamento no aparelho' };
    await apagar(db, LOJA_MIDIA, audio.name);
    return { ok: true };
  }
  try {
    const res = await fetchImpl(`/api/media/${encodeURIComponent(audio.name)}`, { method: 'DELETE' });
    return { ok: res.ok };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/** Lista os áudios guardados no aparelho (para a tela de armazenamento). */
export async function listarMidiaDoAparelho(db) {
  if (!db) return [];
  try {
    return await listarChaves(db, LOJA_MIDIA);
  } catch {
    return [];
  }
}
