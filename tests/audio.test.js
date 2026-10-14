import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../src/core/storage.js';
import { setSpeechEngine, canSpeak, chineseVoice, audioStatus, playAudio, stopAudio } from '../src/ui/audio.js';
import { buildListeningExercise, buildDictationExercise, gradeItem, gradeExercise } from '../src/core/exercises.js';
import { estimateSkill } from '../src/core/skills.js';
import { introduceItems, getItem } from '../src/core/schedule.js';
import { enviarAudio, nomeDeArquivo } from '../src/ui/recorder.js';
import { urlDaMidia, midiaEmBase64 } from '../src/core/mediaStore.js';
import { toTsv, EXPORT_FIELDS } from '../src/core/ankiExport.js';
import { buildNote, addCards, storeMedia } from '../src/core/ankiConnect.js';

/** IndexedDB falso: um Map por trás das transações. */
function fakeIdb(mapa) {
  const loja = (nome) => ({
    put: (valor, chave) => {
      const r = {};
      setTimeout(() => {
        mapa.set(`${nome}:${chave}`, valor);
        r.onsuccess?.();
      }, 0);
      return r;
    },
    get: (chave) => {
      const r = {};
      setTimeout(() => {
        r.result = mapa.get(`${nome}:${chave}`) ?? null;
        r.onsuccess?.();
      }, 0);
      return r;
    },
    delete: (chave) => {
      const r = {};
      setTimeout(() => {
        mapa.delete(`${nome}:${chave}`);
        r.onsuccess?.();
      }, 0);
      return r;
    },
    getAllKeys: () => {
      const r = {};
      setTimeout(() => {
        r.result = [...mapa.keys()].filter((k) => k.startsWith(`${nome}:`)).map((k) => k.split(':')[1]);
        r.onsuccess?.();
      }, 0);
      return r;
    },
  });
  return { transaction: (nome) => ({ objectStore: () => loja(nome) }) };
}

/** Motor de voz falso: registra o que foi falado. */
function motorFalso({ vozes = [{ name: 'Tingting', lang: 'zh-CN' }] } = {}) {
  const falas = [];
  class Utterance {
    constructor(text) {
      this.text = text;
    }
  }
  return {
    falas,
    Utterance,
    getVoices: () => vozes,
    speak: (u) => falas.push({ text: u.text, rate: u.rate, lang: u.lang, voice: u.voice?.name }),
    cancel: () => falas.push({ cancel: true }),
    addEventListener: () => {},
  };
}

test('sem motor de voz, o app declara que não pode falar', () => {
  setSpeechEngine(null);
  // Em Node não existe speechSynthesis: é exatamente o caso do navegador sem suporte.
  assert.equal(canSpeak(), false);
  assert.equal(audioStatus().ok, false);
  assert.match(audioStatus().reason, /síntese de voz/i);
});

test('com voz zh-CN disponível, o status fica ok e a fala usa essa voz', (t) => {
  const motor = motorFalso();
  setSpeechEngine(motor);
  t.after(() => setSpeechEngine(null));
  assert.equal(canSpeak(), true);
  assert.equal(chineseVoice().lang, 'zh-CN');
  assert.equal(audioStatus().ok, true);

  playAudio('你好', { rate: 0.8 });
  const falado = motor.falas.filter((f) => !f.cancel);
  assert.equal(falado.length, 1);
  assert.equal(falado[0].text, '你好');
  assert.equal(falado[0].rate, 0.8);
  assert.equal(falado[0].voice, 'Tingting');
});

test('sem voz chinesa instalada, o status explica o que falta', (t) => {
  setSpeechEngine(motorFalso({ vozes: [{ name: 'Daniel', lang: 'en-GB' }] }));
  t.after(() => setSpeechEngine(null));
  const status = audioStatus();
  assert.equal(status.ok, false);
  assert.match(status.reason, /nenhuma voz em chinês/i);
});

test('exercício de escuta não revela o texto no enunciado', () => {
  const s = emptyState();
  const ex = buildListeningExercise(s, { count: 5, seed: 2 });
  assert.ok(ex.items.length > 0);
  for (const item of ex.items) {
    assert.equal(item.promptHz, '', 'mostrar o chinês transformaria escuta em leitura');
    assert.ok(item.audio.text, 'precisa do texto para o app falar');
    assert.equal(item.skill, 'listening');
    assert.equal(item.channel, 'tts');
    assert.ok(!item.prompt.includes(item.audio.text));
  }
  assert.match(ex.note, /sintetizada/);
});

test('a escuta prioriza o que está devido no agendador', () => {
  const s = emptyState();
  introduceItems(s, [{ ref: '足球' }, { ref: '谢谢' }], { at: '2026-01-01T08:00:00' });
  const ex = buildListeningExercise(s, { count: 2, today: '2026-02-01', seed: 1 });
  const refs = ex.items.map((i) => i.ref);
  assert.ok(refs.includes('足球') && refs.includes('谢谢'));
});

test('ditado aceita caracteres, pinyin com tom e pinyin sem tom', () => {
  const s = emptyState();
  const ex = buildDictationExercise(s, { count: 1, seed: 3 });
  const item = ex.items[0];
  assert.equal(item.type, 'dictation');
  assert.equal(gradeItem(item, item.audio.text).correct, true, 'caracteres');
  assert.equal(gradeItem(item, item.audio.pinyin).correct, true, 'pinyin com tom');
  assert.equal(gradeItem(item, item.audio.pinyin.normalize('NFD').replace(/[̀-ͯ]/g, '')).correct, true, 'sem tom');
  assert.equal(gradeItem(item, 'qualquer coisa').correct, false);
});

test('escuta gera evidência de 听力 e o cálculo avisa que a voz é sintetizada', () => {
  const s = emptyState();
  assert.equal(estimateSkill(s, 'listening').status, 'nao_avaliada');
  const ex = buildListeningExercise(s, { count: 5, seed: 8 });
  gradeExercise(s, ex, Object.fromEntries(ex.items.map((i) => [i.id, i.answer])));
  const est = estimateSkill(s, 'listening');
  assert.notEqual(est.status, 'nao_avaliada');
  assert.ok(est.score > 0);
  assert.equal(est.ttsCount, 5);
  assert.match(est.explanation, /voz sintetizada/);
  assert.match(est.explanation, /mais difícil que este número sugere/);
});

test('escuta também reagenda o item ouvido', () => {
  const s = emptyState();
  const ex = buildListeningExercise(s, { count: 3, seed: 6 });
  gradeExercise(s, ex, Object.fromEntries(ex.items.map((i) => [i.id, i.answer])), { at: '2026-05-01T10:00:00' });
  for (const item of ex.items) {
    assert.ok(getItem(s, item.ref), `${item.ref} deveria entrar no agendamento`);
  }
});

test('a gravação vai para o servidor quando há servidor, com nome seguro', async () => {
  const chamadas = [];
  const okFetch = async (url, init) => {
    chamadas.push({ url, type: init.headers['Content-Type'] });
    return { ok: true, json: async () => ({ ok: true, name: 'x.webm', bytes: 10 }) };
  };
  const blob = { type: 'audio/webm', size: 10 };
  const bom = await enviarAudio(blob, 'passa a bola / 传球!', { modo: 'server', fetchImpl: okFetch });
  assert.equal(bom.ok, true);
  assert.equal(bom.audio.armazenamento, 'servidor');
  assert.match(chamadas[0].url, /^\/api\/media\?name=mq-passa-a-bola-\d+\.webm$/);
  assert.equal(chamadas[0].type, 'audio/webm');
  assert.match(nomeDeArquivo('好球！'), /^mq-audio-\d+\.webm$/, 'nome sem caracteres latinos usa o padrão');
});

test('sem servidor, a gravação é guardada no próprio aparelho', async () => {
  const guardado = new Map();
  const db = fakeIdb(guardado);
  const blob = { type: 'audio/webm', size: 2048, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  const res = await enviarAudio(blob, '传球', { modo: 'device', db });
  assert.equal(res.ok, true);
  assert.equal(res.audio.armazenamento, 'aparelho');
  assert.equal(guardado.size, 1);

  // e volta como URL tocável, criada na hora
  const url = await urlDaMidia(res.audio, { db, criarUrl: () => 'blob:tocavel' });
  assert.equal(url, 'blob:tocavel');

  // e em base64 para o Anki
  const base64 = await midiaEmBase64(res.audio, { db });
  assert.equal(base64.ok, true);
  assert.equal(base64.data, Buffer.from([1, 2, 3]).toString('base64'));
});

test('falha ao guardar é relatada, nunca disfarçada de sucesso', async () => {
  const blob = { type: 'audio/webm', size: 10 };
  const ruim = await enviarAudio(blob, 'teste', {
    modo: 'server',
    fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({ error: 'disco cheio' }) }),
  });
  assert.equal(ruim.ok, false);
  assert.equal(ruim.error, 'disco cheio');

  const semRede = await enviarAudio(blob, 'teste', {
    modo: 'server',
    fetchImpl: async () => {
      throw new Error('sem servidor');
    },
  });
  assert.equal(semRede.ok, false);
  assert.match(semRede.error, /sem servidor/);

  const semBanco = await enviarAudio(blob, 'teste', { modo: 'device', db: null });
  assert.equal(semBanco.ok, false);
  assert.match(semBanco.error, /sem armazenamento/);
});

test('a exportação traz a coluna de áudio no formato do Anki', () => {
  const comAudio = {
    front: '传球', back: 'passar a bola', pinyin: 'chuán qiú', example: '', exampleTranslation: '',
    context: 'futebol', difficulty: 2, tags: ['futebol'], audio: { name: 'mq-chuanqiu-1.webm' },
  };
  const semAudio = { ...comAudio, front: '射门', audio: null };
  const linhas = toTsv([comAudio, semAudio]).split('\n');
  const colunas = (linha) => linha.split('\t');
  assert.equal(colunas(linhas[0]).length, EXPORT_FIELDS.length);
  assert.equal(colunas(linhas[0]).at(-1), 'Audio');
  assert.equal(colunas(linhas[1]).at(-1), '[sound:mq-chuanqiu-1.webm]');
  assert.equal(colunas(linhas[2]).at(-1), '', 'cartão sem áudio deixa a coluna vazia');

  const nota = buildNote(comAudio, { deck: 'D', model: 'M', fieldMap: { Front: 'front', Som: 'audio' } });
  assert.equal(nota.fields.Som, '[sound:mq-chuanqiu-1.webm]');
  assert.equal(buildNote(semAudio, { deck: 'D', model: 'M', fieldMap: { Som: 'audio' } }).fields.Som, '');
});

/** AnkiConnect falso, com ações configuráveis. */
function ankiFalso(handlers) {
  return async (_url, init) => {
    const { action, params } = JSON.parse(init.body);
    if (!(action in handlers)) {
      return { ok: true, json: async () => ({ result: null, error: `unsupported action: ${action}` }) };
    }
    return { ok: true, json: async () => ({ result: handlers[action](params), error: null }) };
  };
}

test('o áudio é enviado ao Anki antes das notas', async () => {
  const ordem = [];
  const res = await addCards([{ front: '传球', back: 'passar', audio: { name: 'a.webm' } }], {
    deck: 'D', model: 'Basic', fieldMap: { Front: 'front', Back: 'back' },
    media: [{ filename: 'a.webm', data: 'YWJj' }],
    fetchImpl: ankiFalso({
      version: () => 6,
      deckNames: () => ['D'],
      modelNames: () => ['Basic'],
      modelFieldNames: () => ['Front', 'Back'],
      storeMediaFile: (p) => {
        ordem.push(`midia:${p.filename}`);
        return p.filename;
      },
      addNotes: () => {
        ordem.push('notas');
        return [123];
      },
    }),
  });
  assert.equal(res.ok, true);
  assert.deepEqual(ordem, ['midia:a.webm', 'notas']);
  assert.equal(res.mediaFailed.length, 0);
});

test('se o add-on não aceita mídia, nada é prometido como enviado', async () => {
  const res = await addCards([{ front: '传球', back: 'passar', audio: { name: 'a.webm' } }], {
    deck: 'D', model: 'Basic', fieldMap: { Front: 'front' },
    media: [{ filename: 'a.webm', data: 'YWJj' }],
    fetchImpl: ankiFalso({
      version: () => 6,
      deckNames: () => ['D'],
      modelNames: () => ['Basic'],
      modelFieldNames: () => ['Front'],
      addNotes: () => [1],
    }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.stage, 'midia');
  assert.match(res.error, /nenhum áudio pôde ser enviado/);
});

test('storeMedia propaga o erro do add-on', async () => {
  const res = await storeMedia('a.webm', 'YWJj', {
    fetchImpl: async () => ({ ok: true, json: async () => ({ result: null, error: 'disk full' }) }),
  });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'disk full');
});
