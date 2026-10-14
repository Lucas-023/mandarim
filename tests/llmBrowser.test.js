import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  chamarModelo, verificarChave, estimarCusto, API_URL, API_VERSION, MODELO_PADRAO,
} from '../src/core/llmBrowser.js';
import { lerChaveApi, gravarChaveApi, mascararChave } from '../src/core/secrets.js';
import { gerarPacote, digestBriefing } from '../src/core/packPipeline.js';
import { validatePack } from '../src/core/packValidation.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileAsync = promisify(execFile);
const PACOTE_REAL = JSON.parse(await fs.readFile(path.join(ROOT, 'tests/fixtures/pack-real.json'), 'utf8'));

/** Resposta em streaming (SSE) como a da Claude API. */
function respostaStream(blocos, { model = MODELO_PADRAO, stop = 'end_turn', usage = null } = {}) {
  const eventos = [
    { type: 'message_start', message: { model, usage: usage || { input_tokens: 1200, output_tokens: 0 } } },
    ...blocos.map((texto) => ({ type: 'content_block_delta', delta: { type: 'text_delta', text: texto } })),
    { type: 'message_delta', delta: { stop_reason: stop }, usage: { output_tokens: 4000 } },
  ];
  const corpo = eventos.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  const bytes = new TextEncoder().encode(corpo);
  let enviado = false;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (enviado) return { done: true };
          enviado = true;
          return { done: false, value: bytes };
        },
      }),
    },
  };
}

test('a chamada do navegador manda os cabeçalhos que a API exige', async () => {
  let pedido = null;
  await chamarModelo({
    system: 'sistema', user: 'usuário', apiKey: 'sk-ant-teste',
    fetchImpl: async (url, init) => {
      pedido = { url, init };
      return respostaStream(['{"ok":true}']);
    },
  });
  assert.equal(pedido.url, API_URL);
  assert.equal(pedido.init.headers['anthropic-version'], API_VERSION);
  assert.equal(pedido.init.headers['x-api-key'], 'sk-ant-teste');
  assert.equal(
    pedido.init.headers['anthropic-dangerous-direct-browser-access'], 'true',
    'sem este cabeçalho a API recusa chamadas de navegador',
  );
  const corpo = JSON.parse(pedido.init.body);
  assert.equal(corpo.model, MODELO_PADRAO);
  assert.equal(corpo.stream, true);
  assert.equal(corpo.system[0].cache_control.type, 'ephemeral', 'o prompt estável vai para o cache');
  assert.equal(corpo.output_config.effort, 'high');
  assert.ok(!('thinking' in corpo), 'no Opus 5.5 o raciocínio é sempre ligado: não se manda o campo');
});

test('o texto é montado a partir do fluxo e o progresso é informado', async () => {
  const parciais = [];
  const res = await chamarModelo({
    system: 's', user: 'u', apiKey: 'sk-ant-x',
    onTexto: (t) => parciais.push(t),
    fetchImpl: async () => respostaStream(['{"ver', 'sion":1}']),
  });
  assert.equal(res.text, '{"version":1}');
  assert.deepEqual(parciais, ['{"ver', '{"version":1}'], 'a interface recebe o texto crescendo');
  assert.equal(res.meta.backend, 'navegador');
  assert.ok(res.meta.costUsd > 0, 'o custo da geração é estimado');
});

test('erros da API viram mensagens em português, por situação', async () => {
  const casos = [
    [401, 'invalid x-api-key', /chave recusada/],
    [429, 'rate limit', /limite de uso/],
    [400, 'max_tokens too large', /requisição recusada/],
    [500, 'oops', /erro da Claude API/],
  ];
  for (const [status, mensagem, esperado] of casos) {
    await assert.rejects(
      chamarModelo({
        system: 's', user: 'u', apiKey: 'sk-ant-x',
        fetchImpl: async () => ({ ok: false, status, json: async () => ({ error: { message: mensagem } }) }),
      }),
      esperado,
    );
  }
});

test('recusa e resposta truncada são reportadas, não devolvidas como pacote', async () => {
  await assert.rejects(
    chamarModelo({
      system: 's', user: 'u', apiKey: 'sk-ant-x',
      fetchImpl: async () => respostaStream(['parcial'], { stop: 'refusal' }),
    }),
    /recusou a requisição/,
  );
  await assert.rejects(
    chamarModelo({
      system: 's', user: 'u', apiKey: 'sk-ant-x',
      fetchImpl: async () => respostaStream(['cortado'], { stop: 'max_tokens' }),
    }),
    /truncada por max_tokens/,
  );
});

test('a verificação da chave não gera tokens e recusa chave malformada', async () => {
  assert.match((await verificarChave('abc')).error, /sk-ant-/);
  let urlConsultada = null;
  const ok = await verificarChave('sk-ant-valida', {
    fetchImpl: async (url) => {
      urlConsultada = url;
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'claude-opus-5-5' }] }) };
    },
  });
  assert.equal(ok.ok, true);
  assert.match(urlConsultada, /\/v1\/models/, 'listar modelos é leitura: não consome tokens');
  assert.deepEqual(ok.modelos, ['claude-opus-5-5']);
  assert.equal((await verificarChave('sk-ant-ruim', { fetchImpl: async () => ({ ok: false, status: 401 }) })).error, 'chave recusada pela API (401)');
});

test('o custo é estimado a partir do uso informado', () => {
  const uso = { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  assert.equal(estimarCusto('claude-opus-5-5', uso), 4);
  assert.equal(estimarCusto('claude-haiku-5-5', uso), 0.1);
  assert.equal(estimarCusto('modelo-inexistente', uso), null);
});

test('a chave fica guardada fora do estado do app', () => {
  const guardado = new Map();
  const storage = {
    getItem: (k) => guardado.get(k) ?? null,
    setItem: (k, v) => guardado.set(k, v),
    removeItem: (k) => guardado.delete(k),
  };
  assert.equal(lerChaveApi({ storage }), null);
  gravarChaveApi('sk-ant-abcdefghijklmnop', { storage });
  assert.equal(lerChaveApi({ storage }), 'sk-ant-abcdefghijklmnop');
  assert.equal(mascararChave('sk-ant-abcdefghijklmnop'), 'sk-ant-abcd…mnop');
  gravarChaveApi(null, { storage });
  assert.equal(lerChaveApi({ storage }), null);
  // A chave não está em nenhuma lista do estado: só nesta gaveta separada.
  assert.equal([...guardado.keys()].length, 0);
});

test('o pipeline compartilhado valida, pede correção e estampa a procedência', async () => {
  const chamadas = [];
  const resultado = await gerarPacote({
    briefing: { date: '2026-10-20', level: { code: 'hsk1' }, review: { dueWords: [], dueGrammar: [] }, grammar: { progress: { done: 0, total: 50 }, nextInSyllabus: [] }, missedItems: [], weakTags: [], conversationGaps: [] },
    retries: 1,
    chamar: async ({ user }) => {
      chamadas.push(user);
      // Primeira resposta inválida, segunda válida: exercita o loop de correção.
      if (chamadas.length === 1) return { text: '{"version":1,"date":"2026-10-20"}', meta: { backend: 'falso' } };
      return { text: JSON.stringify(PACOTE_REAL), meta: { backend: 'falso', model: 'modelo-x', costUsd: 0.12 } };
    },
  });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.attempts, 2);
  assert.match(chamadas[1], /rejeitado pelo validador/, 'a segunda chamada leva os erros encontrados');
  assert.equal(resultado.pack.provenance.backend, 'falso');
  assert.equal(resultado.pack.provenance.model, 'modelo-x');
  assert.equal(resultado.pack.provenance.attempts, 2);
  assert.equal(resultado.pack.provenance.costUsd, 0.12);
  assert.ok(resultado.pack.provenance.briefingDigest.length >= 8);
  assert.equal(validatePack(resultado.pack).ok, true);
});

test('o pipeline desiste depois das tentativas e não devolve pacote inválido', async () => {
  const resultado = await gerarPacote({
    briefing: { date: '2026-10-20', review: { dueWords: [], dueGrammar: [] }, grammar: { progress: { done: 0, total: 50 }, nextInSyllabus: [] }, level: { code: 'x' }, missedItems: [], weakTags: [], conversationGaps: [] },
    retries: 1,
    chamar: async () => ({ text: 'desculpe, não consigo', meta: {} }),
  });
  assert.equal(resultado.ok, false);
  assert.equal(resultado.pack, null);
  assert.equal(resultado.attempts, 2);
  assert.ok(resultado.errors.length > 0);
});

test('o mesmo briefing gera o mesmo digest; briefing diferente, digest diferente', () => {
  const a = { date: '2026-10-20', x: 1 };
  assert.equal(digestBriefing(a), digestBriefing({ date: '2026-10-20', x: 1 }));
  assert.notEqual(digestBriefing(a), digestBriefing({ date: '2026-10-20', x: 2 }));
  assert.equal(digestBriefing(a).length, 16);
});

test('a pasta de publicação leva o app e deixa seus dados de fora', async () => {
  const { stdout } = await execFileAsync(process.execPath, [path.join(ROOT, 'scripts/preparar-publicacao.mjs')], { cwd: ROOT });
  assert.match(stdout, /publicar\/ pronto/);
  const pasta = path.join(ROOT, 'publicar');

  for (const esperado of ['index.html', 'styles.css', 'manifest.webmanifest', 'icone.svg', 'sw.js', '.nojekyll', 'src/app.js']) {
    await fs.access(path.join(pasta, esperado));
  }
  for (const proibido of ['data', 'server.mjs', 'tools', 'tests', 'CLAUDE.md', 'package.json']) {
    await assert.rejects(fs.access(path.join(pasta, proibido)), `${proibido} não deveria ser publicado`);
  }

  const sw = await fs.readFile(path.join(pasta, 'sw.js'), 'utf8');
  assert.match(sw, /const VERSAO = '\d{4}-\d{2}-\d{2}-[0-9a-f]{8}'/, 'versão do cache muda com o conteúdo');
  assert.match(sw, /src\/app\.js/, 'o service worker guarda os arquivos do app');
  assert.match(sw, /api\.anthropic\.com|url\.origin !== self\.location\.origin/, 'chamadas de API não entram no cache');
  assert.match(sw, /startsWith\('\/api\//, 'rotas do servidor local também ficam fora do cache');
});
