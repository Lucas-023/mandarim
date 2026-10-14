import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { detectarEstadoOrfao } from '../src/core/serverStore.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Sobe o servidor num diretório de dados temporário e espera ficar de pé. */
async function subirServidor({ host = '127.0.0.1', porta } = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mq-srv-'));
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(porta), HOST: host, DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let saida = '';
  proc.stdout.on('data', (d) => (saida += d));
  proc.stderr.on('data', (d) => (saida += d));

  const base = `http://127.0.0.1:${porta}`;
  for (let i = 0; i < 60; i += 1) {
    try {
      await fetch(`${base}/api/health`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return {
    base,
    dataDir,
    get log() {
      return saida;
    },
    async chave() {
      return (await fs.readFile(path.join(dataDir, 'lan-token.txt'), 'utf8')).trim();
    },
    async parar() {
      proc.kill('SIGKILL'); // mata sem chance de salvar nada na saída
      await new Promise((r) => setTimeout(r, 150));
    },
    async reiniciar() {
      return subirServidorEm(dataDir, porta, host);
    },
  };
}

async function subirServidorEm(dataDir, porta, host = '127.0.0.1') {
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(porta), HOST: host, DATA_DIR: dataDir },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${porta}`;
  for (let i = 0; i < 60; i += 1) {
    try {
      await fetch(`${base}/api/health`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return {
    base,
    dataDir,
    async parar() {
      proc.kill('SIGKILL');
      await new Promise((r) => setTimeout(r, 150));
    },
  };
}

test('o estado sobrevive a matar o servidor e subir de novo (desligar o PC)', async (t) => {
  const srv = await subirServidor({ porta: 8711 });
  t.after(() => fs.rm(srv.dataDir, { recursive: true, force: true }));

  const estudoDeHoje = {
    schemaVersion: 1,
    xpEvents: [{ id: 'xp1', key: 'k1', type: 'review_session', amount: 10, at: '2026-10-13T21:00:00', meta: {} }],
    activeSession: { id: 's1', exercise: { items: [{ id: 'i1' }, { id: 'i2' }] }, answers: { i1: 0 }, index: 1, updatedAt: '2026-10-13T21:05:00' },
  };
  const put = await fetch(`${srv.base}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(estudoDeHoje),
  });
  assert.equal(put.status, 200);
  await srv.parar();

  const amanha = await subirServidorEm(srv.dataDir, 8711);
  const voltou = await (await fetch(`${amanha.base}/api/state`)).json();
  assert.equal(voltou.xpEvents.length, 1);
  assert.equal(voltou.activeSession.answers.i1, 0, 'a resposta dada ontem continua lá');
  await amanha.parar();
});

test('cada gravação deixa backup da versão anterior e um instantâneo do dia', async (t) => {
  const srv = await subirServidor({ porta: 8712 });
  t.after(async () => {
    await srv.parar();
    await fs.rm(srv.dataDir, { recursive: true, force: true });
  });

  for (const n of [1, 2]) {
    await fetch(`${srv.base}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, versao: n }),
    });
  }
  const backup = JSON.parse(await fs.readFile(path.join(srv.dataDir, 'state.backup.json'), 'utf8'));
  assert.equal(backup.versao, 1, 'o backup guarda a versão anterior');
  const diarios = await fs.readdir(path.join(srv.dataDir, 'backups'));
  assert.equal(diarios.length, 1);
  assert.match(diarios[0], /^state-\d{4}-\d{2}-\d{2}\.json$/);
});

test('JSON inválido é recusado sem destruir o estado salvo', async (t) => {
  const srv = await subirServidor({ porta: 8713 });
  t.after(async () => {
    await srv.parar();
    await fs.rm(srv.dataDir, { recursive: true, force: true });
  });

  await fetch(`${srv.base}/api/state`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 1, bom: true }),
  });
  const ruim = await fetch(`${srv.base}/api/state`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{quebrado',
  });
  assert.equal(ruim.status, 400);
  const atual = await (await fetch(`${srv.base}/api/state`)).json();
  assert.equal(atual.bom, true, 'o estado anterior continua intacto');
});

test('no modo rede local, sem a chave não se lê nem se escreve nada', async (t) => {
  const srv = await subirServidor({ host: '0.0.0.0', porta: 8714 });
  t.after(async () => {
    await srv.parar();
    await fs.rm(srv.dataDir, { recursive: true, force: true });
  });

  assert.equal((await fetch(`${srv.base}/api/state`)).status, 401);
  assert.equal((await fetch(`${srv.base}/api/state?key=chute`)).status, 401);
  assert.equal((await fetch(`${srv.base}/`)).status, 401, 'nem a página abre sem chave');

  const chave = await srv.chave();
  assert.ok(chave.length >= 16);
  const comChave = await fetch(`${srv.base}/api/state?key=${chave}`);
  assert.equal(comChave.status, 200);
  assert.match(comChave.headers.get('set-cookie') || '', /mq_key=/, 'a chave fica no navegador');
  assert.equal((await fetch(`${srv.base}/api/state`, { headers: { 'X-MQ-Key': chave } })).status, 200);
  assert.match(srv.log, /rede local LIGADO/);
  assert.match(srv.log, /microfone/, 'avisa que o microfone não funciona por HTTP simples');
});

test('áudio gravado é guardado, servido e protegido contra travessia de caminho', async (t) => {
  const srv = await subirServidor({ porta: 8715 });
  t.after(async () => {
    await srv.parar();
    await fs.rm(srv.dataDir, { recursive: true, force: true });
  });

  const envio = await fetch(`${srv.base}/api/media?name=mq-teste-1.webm`, {
    method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: new Uint8Array([1, 2, 3, 4]),
  });
  const dados = await envio.json();
  assert.equal(dados.ok, true);
  assert.equal(dados.bytes, 4);

  const baixado = await fetch(`${srv.base}${dados.url}`);
  assert.equal(baixado.status, 200);
  assert.equal(baixado.headers.get('content-type'), 'audio/webm');
  assert.equal((await baixado.arrayBuffer()).byteLength, 4);

  const lista = await (await fetch(`${srv.base}/api/media`)).json();
  assert.equal(lista.length, 1);

  assert.equal((await fetch(`${srv.base}/api/media?name=../state.json`, { method: 'POST', body: 'x' })).status, 400);
  assert.equal((await fetch(`${srv.base}/api/media?name=virus.exe`, { method: 'POST', body: 'x' })).status, 400);
  assert.equal((await fetch(`${srv.base}/data/state.json`)).status, 403, 'data/ não é servido como estático');
});

test('a página, o manifesto e o ícone são servidos para instalar no celular', async (t) => {
  const srv = await subirServidor({ porta: 8716 });
  t.after(async () => {
    await srv.parar();
    await fs.rm(srv.dataDir, { recursive: true, force: true });
  });

  const pagina = await fetch(`${srv.base}/`);
  const html = await pagina.text();
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-mobile-web-app-capable/);

  const manifesto = await fetch(`${srv.base}/manifest.webmanifest`);
  assert.equal(manifesto.status, 200);
  const dados = await manifesto.json();
  assert.equal(dados.display, 'standalone');
  assert.equal(dados.lang, 'pt-BR');
  assert.equal((await fetch(`${srv.base}/icone.svg`)).status, 200);
});

test('dados presos no navegador são detectados para resgate', () => {
  const comConteudo = JSON.stringify({
    schemaVersion: 1,
    xpEvents: [{ id: 'x', amount: 10 }],
    cardDrafts: [{ id: 'c' }],
    placementAttempts: [],
  });
  const storage = { getItem: () => comConteudo };
  const achado = detectarEstadoOrfao({ servidorRaw: null, storage });
  assert.equal(achado.encontrado, true);
  assert.equal(achado.servidorVazio, true);
  assert.match(achado.resumo, /1 evento\(s\) de XP/);

  assert.equal(detectarEstadoOrfao({ servidorRaw: null, storage: { getItem: () => null } }).encontrado, false);
  assert.equal(
    detectarEstadoOrfao({ servidorRaw: null, storage: { getItem: () => JSON.stringify({ schemaVersion: 1, xpEvents: [] }) } }).encontrado,
    false,
    'estado vazio não vale resgate',
  );
  assert.equal(detectarEstadoOrfao({ servidorRaw: null, storage: { getItem: () => '{quebrado' } }).encontrado, false);
});
