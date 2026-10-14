import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/core/storage.js';
import { toTsv, toCsv, csvEscape, recordExport, exportFilename, EXPORT_FIELDS } from '../src/core/ankiExport.js';
import { buildNote, addCards, invoke } from '../src/core/ankiConnect.js';

const CARD = {
  id: 'card_1',
  front: '踢足球',
  back: 'jogar futebol',
  pinyin: 'tī zúqiú',
  example: '我想和朋友一起踢足球。',
  exampleTranslation: 'Quero jogar futebol com amigos.',
  context: 'futebol',
  difficulty: 1,
  tags: ['futebol', 'verbo'],
  status: 'approved',
};

test('TSV tem cabeçalho e uma linha por cartão', () => {
  const tsv = toTsv([CARD]);
  const lines = tsv.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].split('\t').length, EXPORT_FIELDS.length);
  assert.ok(lines[1].startsWith('踢足球\tjogar futebol\ttī zúqiú'));
  assert.ok(lines[1].endsWith('futebol verbo'));
});

test('TSV neutraliza tabs e quebras de linha dentro dos campos', () => {
  const tsv = toTsv([{ ...CARD, back: 'linha1\nlinha2\tcom tab' }]);
  assert.equal(tsv.trim().split('\n').length, 2);
  assert.ok(tsv.includes('linha1 linha2 com tab'));
});

test('CSV escapa vírgulas, aspas e quebras de linha', () => {
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('diz "oi"'), '"diz ""oi"""');
  assert.equal(csvEscape('simples'), 'simples');
  const csv = toCsv([{ ...CARD, back: 'jogar futebol, com amigos' }]);
  assert.ok(csv.includes('"jogar futebol, com amigos"'));
});

test('nome do arquivo inclui a data', () => {
  assert.equal(exportFilename('tsv', new Date('2026-10-13T12:00:00Z')), 'mandarin-quest-2026-10-13.tsv');
});

test('exportação bem-sucedida marca os cartões como exportados', () => {
  const s = emptyState();
  s.cardDrafts.push({ ...CARD });
  const rec = recordExport(s, { cards: [CARD], destination: 'arquivo', format: 'tsv', status: 'ok' });
  assert.equal(rec.status, 'ok');
  assert.equal(rec.count, 1);
  assert.equal(s.cardDrafts[0].status, 'exported');
});

test('falha de exportação registra o erro e NÃO marca como exportado', () => {
  const s = emptyState();
  s.cardDrafts.push({ ...CARD });
  const rec = recordExport(s, {
    cards: [CARD], destination: 'ankiconnect', status: 'erro', error: 'não foi possível conectar',
  });
  assert.equal(rec.status, 'erro');
  assert.match(rec.error, /conectar/);
  assert.equal(s.cardDrafts[0].status, 'approved');
});

test('nota do AnkiConnect mapeia campos e prefixa a tag do app', () => {
  const note = buildNote(CARD, {
    deck: 'Mandarim', model: 'Basic',
    fieldMap: { Front: 'front', Back: 'back', Pinyin: 'pinyin' },
  });
  assert.equal(note.deckName, 'Mandarim');
  assert.deepEqual(note.fields, { Front: '踢足球', Back: 'jogar futebol', Pinyin: 'tī zúqiú' });
  assert.deepEqual(note.tags, ['mandarin-quest', 'futebol', 'verbo']);
  assert.equal(note.options.allowDuplicate, false);
});

test('invoke devolve erro claro quando não há conexão', async () => {
  const res = await invoke('version', {}, {
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  assert.equal(res.ok, false);
  assert.match(res.error, /não foi possível conectar/);
});

test('invoke propaga o erro devolvido pelo add-on', async () => {
  const res = await invoke('addNotes', {}, {
    fetchImpl: async () => ({ ok: true, json: async () => ({ result: null, error: 'model was not found' }) }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'model was not found');
});

/** Simula o AnkiConnect com respostas por ação. */
function fakeAnki(handlers) {
  return async (_url, init) => {
    const { action, params } = JSON.parse(init.body);
    if (!(action in handlers)) return { ok: true, json: async () => ({ result: null, error: `unsupported action: ${action}` }) };
    return { ok: true, json: async () => ({ result: handlers[action](params), error: null }) };
  };
}

test('envio bem-sucedido informa quantas notas foram criadas', async () => {
  const res = await addCards([CARD], {
    deck: 'Mandarim', model: 'Basic', fieldMap: { Front: 'front', Back: 'back' },
    fetchImpl: fakeAnki({
      version: () => 6,
      deckNames: () => ['Mandarim'],
      modelNames: () => ['Basic'],
      modelFieldNames: () => ['Front', 'Back'],
      addNotes: () => [1700000000000],
    }),
  });
  assert.equal(res.ok, true);
  assert.equal(res.added.length, 1);
  assert.equal(res.partial, false);
});

test('nota recusada pelo Anki é reportada como recusada, não como enviada', async () => {
  const res = await addCards([CARD, { ...CARD, id: 'card_2' }], {
    deck: 'Mandarim', model: 'Basic', fieldMap: { Front: 'front', Back: 'back' },
    fetchImpl: fakeAnki({
      version: () => 6,
      deckNames: () => ['Mandarim'],
      modelNames: () => ['Basic'],
      modelFieldNames: () => ['Front', 'Back'],
      addNotes: () => [1700000000000, null],
    }),
  });
  assert.equal(res.ok, true);
  assert.equal(res.added.length, 1);
  assert.equal(res.rejected.length, 1);
  assert.equal(res.partial, true);
  assert.match(res.message, /recusada/);
});

test('modelo inexistente falha antes de tentar enviar', async () => {
  let addNotesCalled = false;
  const res = await addCards([CARD], {
    deck: 'Mandarim', model: 'Inexistente', fieldMap: { Front: 'front' },
    fetchImpl: fakeAnki({
      version: () => 6,
      deckNames: () => ['Mandarim'],
      modelNames: () => ['Basic'],
      addNotes: () => {
        addNotesCalled = true;
        return [];
      },
    }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.stage, 'modelos');
  assert.equal(addNotesCalled, false);
});

test('campo inexistente no modelo é detectado', async () => {
  const res = await addCards([CARD], {
    deck: 'Mandarim', model: 'Basic', fieldMap: { Frente: 'front' },
    fetchImpl: fakeAnki({
      version: () => 6,
      deckNames: () => ['Mandarim'],
      modelNames: () => ['Basic'],
      modelFieldNames: () => ['Front', 'Back'],
    }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.stage, 'campos');
  assert.match(res.error, /Frente/);
});
