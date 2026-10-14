#!/usr/bin/env node
/**
 * Servidor local do Mandarin Quest. Sem dependências.
 *
 * Por que existe: com o estado em arquivo (data/state.json), o gerador diário
 * roda sozinho de madrugada e o app encontra o pacote pronto. Enquanto o estado
 * vivia só no localStorage do navegador, nenhum processo externo podia lê-lo.
 * De quebra, resolve o teto de ~5 MB do localStorage.
 *
 * Rotas:
 *   GET  /api/health              → diz que o modo servidor está ativo
 *   GET  /api/state               → estado salvo (ou null)
 *   PUT  /api/state               → grava o estado (escrita atômica + backup)
 *   GET  /api/state/backup        → a versão anterior do estado (restauração)
 *   GET  /api/packs               → lista resumida dos pacotes do dia
 *   GET  /api/packs/<YYYY-MM-DD>  → um pacote completo
 *   POST /api/generate            → dispara o gerador agora (uma execução por vez)
 *   POST /api/media?name=x.webm   → guarda um áudio gravado (corpo = bytes)
 *   GET  /api/media               → lista os áudios guardados
 *   GET  /api/media/<arquivo>     → devolve um áudio
 *   qualquer outra                → arquivos estáticos do projeto
 *
 * Por padrão escuta apenas em 127.0.0.1 — nada sai da máquina.
 *
 * Para usar no celular, na mesma rede Wi-Fi:
 *     HOST=0.0.0.0 npm start
 * Nesse modo o servidor exige uma chave de acesso (gerada e impressa no
 * terminal, guardada em data/lan-token.txt) para que ninguém mais na rede
 * consiga ler ou alterar seu progresso.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
/** DATA_DIR permite guardar os dados em outro lugar (e isola os testes). */
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
/**
 * Diretórios que NUNCA são servidos como arquivo estático, mesmo que estejam
 * dentro do projeto: contêm estado, pacotes, áudios e a chave de acesso.
 * A pasta padrão entra na lista mesmo quando DATA_DIR aponta para outro lugar —
 * senão, configurar DATA_DIR acabaria expondo a pasta antiga.
 */
const DIRS_PRIVADOS = [...new Set([DATA, path.join(ROOT, 'data')])];
const PACKS = path.join(DATA, 'packs');
const MEDIA = path.join(DATA, 'media');
const BACKUPS = path.join(DATA, 'backups');
const STATE = path.join(DATA, 'state.json');
const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 32 * 1024 * 1024;
/** Fora do loopback, o acesso passa a exigir chave. */
const EXIGE_CHAVE = !['127.0.0.1', 'localhost', '::1'].includes(HOST);
const ARQUIVO_CHAVE = path.join(DATA, 'lan-token.txt');
let CHAVE = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
};

let generating = false;

/** Lê a chave de acesso existente ou cria uma nova. */
async function prepararChave() {
  if (!EXIGE_CHAVE) return null;
  try {
    const salva = (await fs.readFile(ARQUIVO_CHAVE, 'utf8')).trim();
    if (salva.length >= 16) return salva;
  } catch { /* primeira vez */ }
  const nova = crypto.randomBytes(16).toString('base64url');
  await fs.mkdir(DATA, { recursive: true });
  await fs.writeFile(ARQUIVO_CHAVE, `${nova}\n`, { mode: 0o600 });
  return nova;
}

function chaveDaRequisicao(req, url) {
  const daUrl = url.searchParams.get('key');
  if (daUrl) return daUrl;
  const header = req.headers['x-mq-key'];
  if (typeof header === 'string') return header;
  const cookie = String(req.headers.cookie || '').match(/(?:^|;\s*)mq_key=([^;]+)/);
  return cookie ? decodeURIComponent(cookie[1]) : null;
}

function chaveConfere(enviada) {
  if (!CHAVE) return true;
  if (typeof enviada !== 'string' || enviada.length !== CHAVE.length) return false;
  return crypto.timingSafeEqual(Buffer.from(enviada), Buffer.from(CHAVE));
}

/** Endereços da máquina na rede local, para mostrar no terminal. */
function enderecosLocais() {
  const saida = [];
  for (const [nome, lista] of Object.entries(os.networkInterfaces())) {
    for (const info of lista || []) {
      if (info.family === 'IPv4' && !info.internal) saida.push({ nome, endereco: info.address });
    }
  }
  return saida;
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

async function readRaw(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('corpo da requisição muito grande');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readBody(req) {
  return (await readRaw(req)).toString('utf8');
}

/** Escrita atômica: grava em arquivo temporário e renomeia. */
async function writeAtomic(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, content);
  await fs.rename(tmp, file);
}

async function handleState(req, res) {
  if (req.method === 'GET') {
    try {
      return send(res, 200, await fs.readFile(STATE, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return send(res, 200, 'null');
      throw err;
    }
  }
  if (req.method === 'PUT') {
    const body = await readBody(req);
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return send(res, 400, { error: 'JSON inválido' });
    }
    if (!parsed || typeof parsed !== 'object') return send(res, 400, { error: 'esperava um objeto de estado' });

    // Backup da versão anterior antes de sobrescrever, e um instantâneo por dia.
    try {
      await fs.copyFile(STATE, path.join(DATA, 'state.backup.json'));
      const hoje = new Date().toISOString().slice(0, 10);
      const diario = path.join(BACKUPS, `state-${hoje}.json`);
      try {
        await fs.access(diario);
      } catch {
        await fs.mkdir(BACKUPS, { recursive: true });
        await fs.copyFile(STATE, diario);
      }
    } catch { /* primeira gravação: não há o que copiar */ }

    await writeAtomic(STATE, JSON.stringify(parsed, null, 2));
    return send(res, 200, { ok: true, bytes: body.length, savedAt: new Date().toISOString() });
  }
  return send(res, 405, { error: 'método não permitido' });
}

async function handleStateBackup(req, res) {
  try {
    return send(res, 200, await fs.readFile(path.join(DATA, 'state.backup.json'), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return send(res, 404, { error: 'nenhum backup disponível ainda' });
    throw err;
  }
}

/** Nome de arquivo seguro para mídia: nada de caminho, só letras, números e . _ - */
function safeMediaName(name) {
  const base = path.basename(String(name || ''));
  return /^[A-Za-z0-9._-]{1,120}$/.test(base) && !base.startsWith('.') ? base : null;
}

const MEDIA_MIME = { '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav' };

async function handleMedia(req, res, url) {
  const match = url.pathname.match(/^\/api\/media\/(.+)$/);

  if (req.method === 'POST' && !match) {
    const name = safeMediaName(url.searchParams.get('name'));
    if (!name) return send(res, 400, { error: 'nome de arquivo inválido' });
    if (!MEDIA_MIME[path.extname(name)]) return send(res, 400, { error: 'formato de áudio não aceito' });
    const bytes = await readRaw(req);
    if (!bytes.length) return send(res, 400, { error: 'corpo vazio' });
    await fs.mkdir(MEDIA, { recursive: true });
    await fs.writeFile(path.join(MEDIA, name), bytes);
    return send(res, 200, { ok: true, name, bytes: bytes.length, url: `/api/media/${name}` });
  }

  if (req.method === 'GET' && match) {
    const name = safeMediaName(decodeURIComponent(match[1]));
    if (!name) return send(res, 400, { error: 'nome de arquivo inválido' });
    try {
      const content = await fs.readFile(path.join(MEDIA, name));
      return send(res, 200, content, { 'Content-Type': MEDIA_MIME[path.extname(name)] || 'application/octet-stream' });
    } catch (err) {
      if (err.code === 'ENOENT') return send(res, 404, { error: 'áudio não encontrado' });
      throw err;
    }
  }

  if (req.method === 'GET') {
    try {
      const nomes = await fs.readdir(MEDIA);
      const lista = [];
      for (const nome of nomes) {
        const info = await fs.stat(path.join(MEDIA, nome));
        lista.push({ name: nome, bytes: info.size, url: `/api/media/${nome}`, savedAt: info.mtime.toISOString() });
      }
      return send(res, 200, lista);
    } catch {
      return send(res, 200, []);
    }
  }

  if (req.method === 'DELETE' && match) {
    const name = safeMediaName(decodeURIComponent(match[1]));
    if (!name) return send(res, 400, { error: 'nome de arquivo inválido' });
    await fs.rm(path.join(MEDIA, name), { force: true });
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'método não permitido' });
}

async function handlePacks(req, res, url) {
  const match = url.pathname.match(/^\/api\/packs\/(\d{4}-\d{2}-\d{2})$/);
  if (match) {
    try {
      return send(res, 200, await fs.readFile(path.join(PACKS, `${match[1]}.json`), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return send(res, 404, { error: `sem pacote para ${match[1]}` });
      throw err;
    }
  }

  let files = [];
  try {
    files = (await fs.readdir(PACKS)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
  } catch { /* diretório ainda não existe */ }

  const list = [];
  for (const file of files.slice(0, 60)) {
    try {
      const pack = JSON.parse(await fs.readFile(path.join(PACKS, file), 'utf8'));
      list.push({
        date: pack.date,
        focus: pack.focus,
        provenance: pack.provenance || null,
        counts: {
          vocab: pack.vocab?.length || 0,
          exercises: pack.exercises?.length || 0,
          dialogueLines: pack.dialogue?.lines?.length || 0,
          fieldPhrases: pack.fieldPhrases?.length || 0,
        },
      });
    } catch { /* ignora arquivo corrompido */ }
  }
  return send(res, 200, list);
}

function handleGenerate(req, res, url) {
  if (req.method !== 'POST') return send(res, 405, { error: 'método não permitido' });
  if (generating) return send(res, 409, { error: 'já existe uma geração em andamento' });

  const params = url.searchParams;
  const args = [path.join(ROOT, 'tools', 'generate.js')];
  const backend = params.get('backend');
  const date = params.get('date');
  const model = params.get('model');
  if (backend && /^[a-z-]+$/.test(backend)) args.push(`--backend=${backend}`);
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) args.push(`--date=${date}`);
  if (model && /^[a-z0-9.\-]+$/i.test(model)) args.push(`--model=${model}`);
  if (params.get('force') === '1') args.push('--force');
  if (params.get('gaps') === '0') args.push('--no-gaps');

  generating = true;
  const child = spawn(process.execPath, args, { cwd: ROOT });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  child.on('close', (code) => {
    generating = false;
    send(res, code === 0 ? 200 : 500, { ok: code === 0, exitCode: code, log: out.slice(-8000) });
  });
  child.on('error', (err) => {
    generating = false;
    send(res, 500, { ok: false, error: err.message });
  });
}

async function serveStatic(req, res, url) {
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) {
    return send(res, 403, { error: 'caminho fora do projeto' });
  }
  // Os diretórios de dados ficam fora do alcance estático: só as rotas de API
  // os expõem, e nem elas devolvem a chave de acesso.
  if (DIRS_PRIVADOS.some((dir) => file === dir || file.startsWith(dir + path.sep))) {
    return send(res, 403, { error: 'conteúdo privado: use /api/' });
  }
  if (path.basename(file) === 'lan-token.txt') return send(res, 403, { error: 'conteúdo privado' });

  try {
    const content = await fs.readFile(file);
    return send(res, 200, content, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return send(res, 404, { error: 'não encontrado' });
    throw err;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  try {
    if (EXIGE_CHAVE) {
      const enviada = chaveDaRequisicao(req, url);
      if (!chaveConfere(enviada)) {
        return send(res, 401, {
          error: 'chave de acesso ausente ou inválida',
          dica: 'abra o endereço completo que apareceu no terminal do computador, incluindo ?key=…',
        }, { 'Cache-Control': 'no-store' });
      }
      // Guarda a chave no navegador do celular para as próximas requisições.
      if (url.searchParams.get('key')) {
        res.setHeader('Set-Cookie', `mq_key=${encodeURIComponent(enviada)}; Path=/; Max-Age=31536000; SameSite=Lax`);
      }
    }
    if (url.pathname === '/api/health') {
      return send(res, 200, {
        ok: true,
        mode: 'server',
        dataDir: path.relative(ROOT, DATA),
        rede: EXIGE_CHAVE ? 'rede local (com chave)' : 'somente esta máquina',
      });
    }
    if (url.pathname === '/api/state') return await handleState(req, res);
    if (url.pathname === '/api/state/backup') return await handleStateBackup(req, res);
    if (url.pathname.startsWith('/api/media')) return await handleMedia(req, res, url);
    if (url.pathname.startsWith('/api/packs')) return await handlePacks(req, res, url);
    if (url.pathname === '/api/generate') return handleGenerate(req, res, url);
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'rota inexistente' });
    return await serveStatic(req, res, url);
  } catch (err) {
    console.error('[erro]', err);
    return send(res, 500, { error: err.message });
  }
});

CHAVE = await prepararChave();

server.listen(PORT, HOST, () => {
  console.log(`Mandarin Quest em http://127.0.0.1:${PORT}`);
  console.log(`Estado: ${path.relative(ROOT, STATE)} · pacotes: ${path.relative(ROOT, PACKS)}`);
  if (!EXIGE_CHAVE) {
    console.log('Acesso: somente esta máquina. Para usar no celular: HOST=0.0.0.0 npm start');
    return;
  }
  console.log('\nAcesso pela rede local LIGADO. Abra no celular (mesma Wi-Fi):');
  for (const { nome, endereco } of enderecosLocais()) {
    console.log(`  http://${endereco}:${PORT}/?key=${CHAVE}   (${nome})`);
  }
  console.log('\nA chave fica guardada em data/lan-token.txt e no navegador do celular.');
  console.log('Quem estiver na mesma rede sem a chave recebe 401. Apague o arquivo para trocar a chave.');
  console.log('Observação: gravar áudio pelo celular não funciona por HTTP simples — o navegador');
  console.log('exige HTTPS ou localhost para liberar o microfone.');
});
