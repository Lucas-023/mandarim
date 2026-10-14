import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  normalizarRepo, paraBase64, deBase64, clienteGitHub, testarCaixa, sincronizar,
  lerConfigCaixa, gravarConfigCaixa, anotarNaConfig, madrugadaLocal, repoSugerido,
} from '../src/core/caixaPostal.js';
import { emptyState } from '../src/core/storage.js';
import { ingestPack } from '../src/core/packs.js';
import { validatePack } from '../src/core/packValidation.js';
import { resetRegistry } from '../src/core/content/lexicon.js';
import { buildBriefing } from '../src/core/briefing.js';
import { agendarEnvio, descarregarEnvio, sincronizarCaixa } from '../src/ui/caixa.js';
import { main as atenderCaixa, pedidosAtendiveis } from '../tools/caixaPostal.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileP = promisify(execFile);
const REAL_PACK = JSON.parse(await fs.readFile(path.join(ROOT, 'tests/fixtures/pack-real.json'), 'utf8'));
const HOJE = '2026-10-20';
const AGORA = new Date(2026, 9, 20, 9, 0, 0); // 9h locais de HOJE

function pacoteDe(date) {
  return { ...JSON.parse(JSON.stringify(REAL_PACK)), date };
}

/**
 * GitHub falso: só a API de conteúdo, com as regras de sha que importam
 * (gravar por cima exige o sha atual; sha velho dá 409).
 */
function githubFalso({ privado = true, push = true } = {}) {
  const arquivos = new Map();
  let versao = 0;
  const chamadas = [];
  const resposta = (status, corpo) => ({ ok: status < 300, status, json: async () => corpo });
  const gh = {
    arquivos,
    chamadas,
    falharRede: false,
    pôr(caminho, texto) {
      arquivos.set(caminho, { texto, sha: `sha${(versao += 1)}` });
    },
    async fetch(url, opcoes = {}) {
      chamadas.push({ url, metodo: opcoes.method || 'GET', cache: opcoes.cache });
      if (gh.falharRede) throw new TypeError('Load failed');
      assert.match(opcoes.headers.Authorization, /^Bearer /);
      const m = url.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)(?:\/contents\/(.*))?$/);
      if (url.startsWith('https://api.github.com/user/repos')) return resposta(200, (gh.visiveis || []).map((n) => ({ full_name: n })));
      if (!m) return resposta(404, { message: 'Not Found' });
      if (gh.semAcesso) return resposta(404, { message: 'Not Found' });
      if (m[2] === undefined) return resposta(200, { full_name: m[1], private: privado, permissions: { push } });
      const caminho = decodeURIComponent(m[2]);
      if ((opcoes.method || 'GET') === 'PUT') {
        const corpo = JSON.parse(opcoes.body);
        const atual = arquivos.get(caminho);
        if (atual && !corpo.sha) return resposta(422, { message: 'sha wasn\'t supplied' });
        if (atual && corpo.sha !== atual.sha) return resposta(409, { message: 'conflict' });
        gh.pôr(caminho, deBase64(corpo.content));
        return resposta(atual ? 200 : 201, {});
      }
      const arquivo = arquivos.get(caminho);
      if (arquivo) return resposta(200, { type: 'file', sha: arquivo.sha, content: paraBase64(arquivo.texto) });
      const filhos = [...arquivos.keys()].filter((k) => k.startsWith(`${caminho}/`));
      if (filhos.length) return resposta(200, filhos.map((k) => ({ type: 'file', name: k.slice(caminho.length + 1), path: k })));
      return resposta(404, { message: 'Not Found' });
    },
  };
  gh.cliente = clienteGitHub({ repo: 'eu/dados', token: 'github_pat_teste', fetch: (u, o) => gh.fetch(u, o) });
  return gh;
}

function estadoCadastrado() {
  const s = emptyState();
  s.profile.onboardingDone = true;
  return s;
}

test('repositório é aceito como dono/nome, URL ou endereço SSH', () => {
  assert.equal(normalizarRepo('Lucas-023/mandarim-dados'), 'Lucas-023/mandarim-dados');
  assert.equal(normalizarRepo('https://github.com/Lucas-023/mandarim-dados'), 'Lucas-023/mandarim-dados');
  assert.equal(normalizarRepo('git@github.com:Lucas-023/mandarim-dados.git'), 'Lucas-023/mandarim-dados');
  assert.equal(normalizarRepo('mandarim-dados'), null);
  // O teclado do iPhone: traço tipográfico, espaços, @ do autocompletar.
  assert.equal(normalizarRepo(' Lucas–023 / mandarim—dados '), 'Lucas-023/mandarim-dados');
  assert.equal(normalizarRepo('@Lucas-023/mandarim-dados'), 'Lucas-023/mandarim-dados');
  assert.equal(normalizarRepo('github_pat_11ABCDEF'), null);
});

test('o campo do repositório vem preenchido a partir do endereço do Pages', () => {
  assert.equal(repoSugerido('lucas-023.github.io'), 'lucas-023/mandarim-dados');
  assert.equal(repoSugerido('127.0.0.1'), '');
});

test('base64 preserva caracteres chineses e acentos', () => {
  const texto = '你周末有什么计划？ — ação';
  assert.equal(deBase64(paraBase64(texto)), texto);
});

test('repositório público é recusado: os dados de estudo ficariam visíveis', async () => {
  const r = await testarCaixa(githubFalso({ privado: false }).cliente);
  assert.equal(r.ok, false);
  assert.match(r.error, /PÚBLICO/);
  assert.equal((await testarCaixa(githubFalso({ push: false }).cliente)).ok, false);
  assert.deepEqual(await testarCaixa(githubFalso().cliente), { ok: true, nome: 'eu/dados' });
});

test('repositório 404: o diagnóstico diz se é o token sem acesso a privados, outro repo ou nome errado', async () => {
  const gh = githubFalso();
  gh.semAcesso = true;
  gh.visiveis = [];
  assert.match((await testarCaixa(gh.cliente)).error, /Public repositories.*Only select repositories.*dados/s);
  gh.visiveis = ['eu/outro'];
  assert.match((await testarCaixa(gh.cliente)).error, /só enxerga: eu\/outro/);
  gh.visiveis = ['Eu/dados'];
  gh.cliente = clienteGitHub({ repo: 'ue/dados', token: 'github_pat_teste', fetch: (u, o) => gh.fetch(u, o) });
  assert.match((await testarCaixa(gh.cliente)).error, /token enxerga "Eu\/dados"/);
});

test('caixa vazia: pede o pacote de hoje e o de amanhã, este só para a madrugada', async () => {
  const gh = githubFalso();
  const r = await sincronizar(estadoCadastrado(), gh.cliente, { hoje: HOJE, agora: AGORA });
  assert.equal(r.ok, true);
  assert.deepEqual(r.pedidos, [HOJE, '2026-10-21']);
  const deHoje = JSON.parse(gh.arquivos.get(`pedidos/${HOJE}.json`).texto);
  const deAmanha = JSON.parse(gh.arquivos.get('pedidos/2026-10-21.json').texto);
  assert.equal(deHoje.briefing.date, HOJE);
  assert.equal(deHoje.naoAntesDe, AGORA.toISOString());
  assert.equal(deAmanha.naoAntesDe, madrugadaLocal('2026-10-21').toISOString());
  // Nenhum cache do navegador pode esconder um pacote novo.
  assert.ok(gh.chamadas.every((c) => c.cache === 'no-store'));
});

test('o que vai à caixa é o briefing, não o estado: conversas e cartões ficam no aparelho', async () => {
  const gh = githubFalso();
  const s = estadoCadastrado();
  s.conversations = [{ id: 'c1', notes: 'NOTA-PRIVADA-XYZ', gaps: '' }];
  await sincronizar(s, gh.cliente, { hoje: HOJE, agora: AGORA });
  const pedido = gh.arquivos.get(`pedidos/${HOJE}.json`).texto;
  assert.doesNotMatch(pedido, /NOTA-PRIVADA-XYZ/);
  assert.deepEqual(Object.keys(JSON.parse(pedido)).sort(), ['briefing', 'criadoEm', 'date', 'naoAntesDe', 'versao']);
});

test('pacote válido na caixa é devolvido para ingestão e hoje não é pedido de novo', async (t) => {
  t.after(resetRegistry);
  const gh = githubFalso();
  gh.pôr(`pacotes/${HOJE}.json`, JSON.stringify(pacoteDe(HOJE)));
  const s = estadoCadastrado();
  const r = await sincronizar(s, gh.cliente, { hoje: HOJE, agora: AGORA });
  assert.equal(r.pacotes.length, 1);
  assert.deepEqual(r.pedidos, ['2026-10-21']);
  assert.equal(ingestPack(s, r.pacotes[0]).ingested, true);

  // Já ingerido: não baixa de novo.
  gh.chamadas.length = 0;
  const r2 = await sincronizar(s, gh.cliente, { hoje: HOJE, agora: AGORA, digestsEnviados: r.digests });
  assert.equal(r2.pacotes.length, 0);
  assert.ok(!gh.chamadas.some((c) => c.url.endsWith(`pacotes/${HOJE}.json`)));
});

test('pacote adulterado na caixa é recusado pela validação, não ingerido', async () => {
  const gh = githubFalso();
  gh.pôr(`pacotes/${HOJE}.json`, JSON.stringify({ ...pacoteDe(HOJE), skills: { tingli: 100 } }));
  gh.pôr('pacotes/2026-10-19.json', '{ isto não é json');
  const r = await sincronizar(estadoCadastrado(), gh.cliente, { hoje: HOJE, agora: AGORA });
  assert.equal(r.pacotes.length, 0);
  assert.deepEqual(r.recusados.map((x) => x.date).sort(), ['2026-10-19', HOJE]);
});

test('briefing igual ao último enviado não gera nova escrita', async () => {
  const gh = githubFalso();
  const s = estadoCadastrado();
  const r1 = await sincronizar(s, gh.cliente, { hoje: HOJE, agora: AGORA });
  gh.chamadas.length = 0;
  const r2 = await sincronizar(s, gh.cliente, { hoje: HOJE, agora: AGORA, digestsEnviados: r1.digests });
  assert.deepEqual(r2.pedidos, []);
  assert.ok(!gh.chamadas.some((c) => c.metodo === 'PUT'));
});

test('sha velho (o computador gravou no meio) é relido e a escrita passa', async () => {
  const gh = githubFalso();
  gh.pôr('pedidos/x.json', 'velho');
  const original = gh.fetch;
  let primeira = true;
  gh.fetch = async (url, opcoes = {}) => {
    if (opcoes.method === 'PUT' && primeira) {
      primeira = false;
      gh.pôr('pedidos/x.json', 'gravado pelo computador');
    }
    return original(url, opcoes);
  };
  assert.deepEqual(await gh.cliente.gravar('pedidos/x.json', 'novo', 'teste'), { ok: true });
  assert.equal(gh.arquivos.get('pedidos/x.json').texto, 'novo');
});

test('sem rede: devolve erro legível em vez de lançar exceção', async () => {
  const gh = githubFalso();
  gh.falharRede = true;
  const r = await sincronizar(estadoCadastrado(), gh.cliente, { hoje: HOJE, agora: AGORA });
  assert.equal(r.ok, false);
  assert.match(r.error, /sem conexão/);
});

test('falha do computador ao gerar chega ao celular como aviso', async () => {
  const gh = githubFalso();
  gh.pôr(`erros/${HOJE}.json`, JSON.stringify({ tentativas: 2, erro: 'tempo esgotado' }));
  const r = await sincronizar(estadoCadastrado(), gh.cliente, { hoje: HOJE, agora: AGORA });
  assert.equal(r.errosDoComputador[0].erro, 'tempo esgotado');
  assert.equal(r.errosDoComputador[0].tentativas, 2);
});

test('configuração (com o token) fica fora do estado, em armazenamento próprio', () => {
  const mapa = new Map();
  const storage = { getItem: (k) => mapa.get(k) ?? null, setItem: (k, v) => mapa.set(k, v), removeItem: (k) => mapa.delete(k) };
  assert.equal(lerConfigCaixa({ storage }), null);
  gravarConfigCaixa({ repo: 'eu/dados', token: 't' }, { storage });
  anotarNaConfig({ ultimaSincronia: 'x' }, { storage });
  assert.deepEqual(lerConfigCaixa({ storage }), { repo: 'eu/dados', token: 't', ultimaSincronia: 'x' });
  gravarConfigCaixa(null, { storage });
  assert.equal(lerConfigCaixa({ storage }), null);
  assert.ok(!('caixa' in emptyState().settings));
});

test('escrita do pedido usa keepalive: termina mesmo se o app for fechado em seguida', async () => {
  const gh = githubFalso();
  const opcoesVistas = [];
  const original = gh.fetch;
  gh.fetch = async (url, opcoes = {}) => {
    opcoesVistas.push(opcoes);
    return original(url, opcoes);
  };
  await sincronizar(estadoCadastrado(), gh.cliente, { hoje: HOJE, agora: AGORA });
  const puts = opcoesVistas.filter((o) => o.method === 'PUT');
  assert.ok(puts.length > 0);
  assert.ok(puts.every((o) => o.keepalive === true));
});

/** Aparelho configurado: localStorage e fetch globais trocados por falsos. */
function aparelhoComCaixa(t) {
  const gh = githubFalso();
  const mapa = new Map();
  const antes = { localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  globalThis.localStorage = { getItem: (k) => mapa.get(k) ?? null, setItem: (k, v) => mapa.set(k, v), removeItem: (k) => mapa.delete(k) };
  globalThis.fetch = (u, o) => gh.fetch(u, o);
  t.after(() => Object.assign(globalThis, antes));
  gravarConfigCaixa({ repo: 'eu/dados', token: 'github_pat_teste' });
  const state = estadoCadastrado();
  const ctx = {
    state, store: { mode: 'device' }, toasts: [],
    toast: (m, k) => ctx.toasts.push({ m, k }),
    commit: (fn) => fn(state),
    render: () => {},
  };
  return { gh, ctx, state };
}

test('dados mudaram depois de uma sincronia recente: o envio agendado não espera os 5 minutos', async (t) => {
  const { gh, ctx, state } = aparelhoComCaixa(t);
  await sincronizarCaixa(ctx, { automatico: true });
  const putsAntes = gh.chamadas.filter((c) => c.metodo === 'PUT').length;
  assert.ok(putsAntes > 0);

  // Sincronia automática logo depois é barrada pelo intervalo…
  gh.chamadas.length = 0;
  assert.equal(await sincronizarCaixa(ctx, { automatico: true }), null);
  assert.equal(gh.chamadas.length, 0);

  // …mas terminar um exercício muda o briefing e o envio agendado passa.
  state.conversations.push({ id: 'c1', date: '2026-10-19', durationMin: 10, context: 'futebol',
    couldNotSay: 'com que frequência eu jogo', newExpressions: [] });
  agendarEnvio(() => ctx);
  const r = await descarregarEnvio();
  assert.equal(r.ok, true);
  assert.ok(r.pedidos.length > 0, 'o pedido com o estado novo foi reenviado');
  assert.equal(descarregarEnvio(), null, 'nada fica pendente depois de descarregar');
});

test('sem caixa configurada, agendar envio não faz nada', () => {
  const antes = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  try {
    agendarEnvio(() => { throw new Error('não deveria montar contexto'); });
    assert.equal(descarregarEnvio(), null);
  } finally {
    globalThis.localStorage = antes;
  }
});

// ───────────────────────────── lado do computador ─────────────────────────────

async function git(dir, ...args) {
  return (await execFileP('git', ['-C', dir, ...args])).stdout.trim();
}

/** Repositório "remoto" (bare) + um clone que faz o papel do celular. */
async function montarCaixa(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'caixa-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  // O CI não tem identidade do git configurada.
  for (const [k, v] of Object.entries({ GIT_AUTHOR_NAME: 'teste', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'teste', GIT_COMMITTER_EMAIL: 't@t' })) {
    process.env[k] = v;
  }
  const remoto = path.join(base, 'remoto.git');
  await execFileP('git', ['init', '--quiet', '--bare', remoto]);
  const celular = path.join(base, 'celular');
  await execFileP('git', ['clone', '--quiet', remoto, celular]);
  const pedir = async (pedidos) => {
    await fs.mkdir(path.join(celular, 'pedidos'), { recursive: true });
    for (const p of pedidos) await fs.writeFile(path.join(celular, 'pedidos', `${p.date}.json`), JSON.stringify(p));
    await git(celular, 'add', '--all');
    await git(celular, 'commit', '--quiet', '-m', 'pedidos');
    await git(celular, 'push', '--quiet', 'origin', 'HEAD');
  };
  return { base, remoto, celular, pedir, pc: path.join(base, 'pc') };
}

function pedido(date, naoAntesDe) {
  const briefing = buildBriefing(estadoCadastrado(), { date });
  return { versao: 1, date, criadoEm: naoAntesDe.toISOString(), naoAntesDe: naoAntesDe.toISOString(), briefing };
}

test('computador atende só pedidos cujo horário chegou e que não venceram', async (t) => {
  const { pc, pedir, remoto } = await montarCaixa(t);
  const agora = new Date('2026-10-20T12:00:00Z');
  await pedir([
    pedido('2026-10-20', new Date('2026-10-20T11:00:00Z')), // pronto
    pedido('2026-10-21', new Date('2026-10-21T04:00:00Z')), // ainda não
    pedido('2026-10-17', new Date('2026-10-17T04:00:00Z')), // vencido
  ]);
  await execFileP('git', ['clone', '--quiet', remoto, pc]);
  const prontos = await pedidosAtendiveis(pc, agora);
  assert.deepEqual(prontos.map((p) => p.date), ['2026-10-20']);
});

test('ciclo completo: pedido do celular → pacote válido de volta pelo git', async (t) => {
  const { pc, pedir, celular, remoto, base } = await montarCaixa(t);
  const agora = new Date('2026-10-20T12:00:00Z');
  await pedir([pedido('2026-10-20', new Date('2026-10-20T11:00:00Z'))]);

  const args = [`--dir=${pc}`, `--repo=${remoto}`, `--outbox=${path.join(base, 'outbox')}`,
    '--backend=mock', `--agora=${agora.toISOString()}`, '--quiet'];
  assert.equal(await atenderCaixa(args), 0);

  await git(celular, 'pull', '--quiet');
  const pacote = JSON.parse(await fs.readFile(path.join(celular, 'pacotes', '2026-10-20.json'), 'utf8'));
  assert.equal(pacote.date, '2026-10-20');
  assert.equal(validatePack(pacote).ok, true);
  // Briefing auditável, como no gerador normal.
  await fs.access(path.join(base, 'outbox', '2026-10-20-briefing-celular.json'));

  // Segunda rodada: nada a fazer, nenhum commit novo.
  const antes = await git(pc, 'rev-parse', 'HEAD');
  assert.equal(await atenderCaixa(args), 0);
  assert.equal(await git(pc, 'rev-parse', 'HEAD'), antes);
});

test('sem clone e sem --repo: erro explica o que fazer', async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'caixa-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  await assert.rejects(atenderCaixa([`--dir=${path.join(base, 'nada')}`, '--quiet']), /--repo=/);
});
