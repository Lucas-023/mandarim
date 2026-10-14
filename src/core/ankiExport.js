/**
 * Exportação de cartões em formato compatível com o Anki.
 *
 * O caminho garantido desta versão é a exportação de arquivo (TSV/CSV).
 * A integração direta via AnkiConnect está em ankiConnect.js e só é usada
 * se o usuário tiver o Anki Desktop aberto com o add-on instalado.
 */
import { uid } from './storage.js';

export const EXPORT_FIELDS = [
  ['front', 'Frente'],
  ['back', 'Verso'],
  ['pinyin', 'Pinyin'],
  ['example', 'Exemplo'],
  ['exampleTranslation', 'TraducaoExemplo'],
  ['context', 'Contexto'],
  ['difficulty', 'Dificuldade'],
  ['tags', 'Tags'],
  ['audio', 'Audio'],
];

function cellValue(card, key) {
  if (key === 'audio') {
    // Formato que o Anki entende para tocar um arquivo de mídia.
    return card.audio?.name ? `[sound:${card.audio.name}]` : '';
  }
  const v = card[key];
  if (Array.isArray(v)) return v.join(' ');
  return v == null ? '' : String(v);
}

/** TSV: formato que o Anki importa sem configuração extra de separador. */
export function toTsv(cards, { header = true } = {}) {
  const clean = (s) => s.replace(/[\t\r\n]+/g, ' ').trim();
  const lines = [];
  if (header) lines.push(EXPORT_FIELDS.map(([, label]) => label).join('\t'));
  for (const card of cards) {
    lines.push(EXPORT_FIELDS.map(([key]) => clean(cellValue(card, key))).join('\t'));
  }
  return lines.join('\n') + '\n';
}

export function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(cards, { header = true } = {}) {
  const lines = [];
  if (header) lines.push(EXPORT_FIELDS.map(([, label]) => label).join(','));
  for (const card of cards) {
    lines.push(EXPORT_FIELDS.map(([key]) => csvEscape(cellValue(card, key))).join(','));
  }
  return lines.join('\n') + '\n';
}

export function exportFilename(format = 'tsv', date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return `mandarin-quest-${day}.${format}`;
}

/** Cartões aprovados que têm áudio gravado para levar junto. */
export function cardsComAudio(cards) {
  return cards.filter((c) => c.audio?.name);
}

/**
 * Registra a exportação no histórico. `status` deve refletir o que realmente
 * aconteceu — nunca registrar sucesso para uma chamada que falhou.
 */
export function recordExport(state, { cards, destination, format = null, status, error = null, at = new Date().toISOString() }) {
  const record = {
    id: uid('exp'),
    at,
    destination,
    format,
    status,
    error,
    count: cards.length,
    fronts: cards.map((c) => c.front),
  };
  state.cardExports.push(record);
  if (status === 'ok') {
    for (const card of cards) {
      const draft = state.cardDrafts.find((d) => d.id === card.id);
      if (draft) {
        draft.status = 'exported';
        draft.exportedAt = at;
        draft.exportDestination = destination;
      }
    }
  }
  return record;
}
