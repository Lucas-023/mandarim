#!/usr/bin/env node
/**
 * Atende a caixa postal do celular: gera no computador, pelo plano do Claude
 * (`claude -p`), o pacote que o celular pediu, e devolve pelo GitHub.
 *
 * Uso:
 *   node tools/caixaPostal.js --repo=git@github.com:Lucas-023/mandarim-dados.git   # primeira vez (clona)
 *   node tools/caixaPostal.js                    # rodadas seguintes (o timer chama assim)
 *   node tools/caixaPostal.js --backend=mock     # testar o caminho sem gastar o plano
 *
 * A caixa é um clone de um repositório PRIVADO em data/caixa/ (data/ não vai
 * para o git do projeto nem para a publicação). O celular escreve
 * pedidos/AAAA-MM-DD.json com `naoAntesDe` (horário absoluto). Este script
 * atende os pedidos cujo horário já chegou — o de amanhã espera, o vencido há
 * mais de 36h é ignorado — e grava pacotes/AAAA-MM-DD.json (ou
 * erros/AAAA-MM-DD.json, que o celular mostra). O relógio que manda é o do
 * celular: o computador pode estar em outro fuso. Ver src/core/caixaPostal.js.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { BACKENDS } from './generate.js';
import { gerarPacote } from '../src/core/packPipeline.js';
import { describeBriefing, atualizarBriefingAntigo, incorporarPacotesAnteriores } from '../src/core/briefing.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execFileP = promisify(execFile);
/** Depois de tantas falhas no mesmo dia, para de tentar e deixa o aviso. */
export const MAX_TENTATIVAS = 3;
/** Pedido mais velho que isso já perdeu o sentido (o dia passou). */
const VALIDADE_PEDIDO_MS = 36 * 3600 * 1000;
const DATA_ARQUIVO = /^(\d{4}-\d{2}-\d{2})\.json$/;

function parseArgs(argv) {
  const opts = {
    dir: path.join(ROOT, 'data', 'caixa'),
    outbox: path.join(ROOT, 'data', 'outbox'),
    repo: null,
    backend: 'claude-code',
    model: null,
    agora: new Date(),
    retries: 1,
    quiet: false,
  };
  for (const arg of argv) {
    const [key, ...resto] = arg.replace(/^--/, '').split('=');
    const value = resto.join('=');
    switch (key) {
      case 'dir': opts.dir = path.resolve(value); break;
      case 'outbox': opts.outbox = path.resolve(value); break;
      case 'repo': opts.repo = value; break;
      case 'backend': opts.backend = value; break;
      case 'model': opts.model = value; break;
      case 'agora': opts.agora = new Date(value); break;
      case 'retries': opts.retries = Number(value); break;
      case 'quiet': opts.quiet = true; break;
      default: throw new Error(`argumento desconhecido: --${key}`);
    }
  }
  if (!BACKENDS[opts.backend]) throw new Error(`backend inválido: ${opts.backend}`);
  if (Number.isNaN(opts.agora.getTime())) throw new Error('--agora inválido');
  return opts;
}

async function git(dir, ...args) {
  const { stdout } = await execFileP('git', ['-C', dir, ...args], { maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

async function existe(arquivo) {
  try {
    await fs.access(arquivo);
    return true;
  } catch {
    return false;
  }
}

async function lerJson(arquivo) {
  try {
    return JSON.parse(await fs.readFile(arquivo, 'utf8'));
  } catch {
    return null;
  }
}

async function prepararClone(opts, log) {
  if (await existe(path.join(opts.dir, '.git'))) return;
  if (!opts.repo) {
    throw new Error(`a caixa ainda não foi clonada em ${path.relative(ROOT, opts.dir) || opts.dir}. ` +
      'Rode uma vez com --repo=git@github.com:SEU-USUARIO/mandarim-dados.git');
  }
  await fs.mkdir(path.dirname(opts.dir), { recursive: true });
  await execFileP('git', ['clone', '--quiet', opts.repo, opts.dir]);
  log(`[caixa] clonada em ${opts.dir}`);
}

async function remotoTemCommits(dir) {
  return (await git(dir, 'ls-remote', '--heads', 'origin')).length > 0;
}

async function atualizar(dir) {
  if (await remotoTemCommits(dir)) await git(dir, 'pull', '--rebase', '--quiet');
}

/** Commit + push; se o celular gravou no meio, rebase e tenta de novo. */
async function publicar(dir, mensagem) {
  await git(dir, 'add', '--all');
  if (!(await git(dir, 'status', '--porcelain'))) return;
  await git(dir, 'commit', '--quiet', '-m', mensagem);
  const ramo = await git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
  try {
    await git(dir, 'push', '--quiet', 'origin', `HEAD:${ramo}`);
  } catch {
    await git(dir, 'pull', '--rebase', '--quiet', 'origin', ramo);
    await git(dir, 'push', '--quiet', 'origin', `HEAD:${ramo}`);
  }
}

/**
 * Pedidos prontos para atender, do mais ANTIGO ao mais recente: assim o pacote de
 * hoje já existe quando o de amanhã é gerado, e entra no briefing dele.
 */
export async function pedidosAtendiveis(dir, agora) {
  let nomes = [];
  try {
    nomes = await fs.readdir(path.join(dir, 'pedidos'));
  } catch { /* sem pasta: nenhum pedido */ }
  const prontos = [];
  for (const nome of nomes.sort()) {
    const date = nome.match(DATA_ARQUIVO)?.[1];
    if (!date || (await existe(path.join(dir, 'pacotes', `${date}.json`)))) continue;
    const pedido = await lerJson(path.join(dir, 'pedidos', nome));
    if (!pedido || pedido.date !== date || pedido.briefing?.date !== date) continue;
    const quando = Date.parse(pedido.naoAntesDe || pedido.criadoEm);
    if (Number.isNaN(quando) || quando > agora.getTime() || agora.getTime() - quando > VALIDADE_PEDIDO_MS) continue;
    prontos.push(pedido);
  }
  return prontos;
}

/** Pacotes já entregues na caixa nos 7 dias antes de `date`. */
async function pacotesAnteriores(dir, date) {
  let nomes = [];
  try {
    nomes = await fs.readdir(path.join(dir, 'pacotes'));
  } catch { return []; }
  const [a, m, d] = date.split('-').map(Number);
  const semanaAntes = new Date(Date.UTC(a, m - 1, d - 7)).toISOString().slice(0, 10);
  const pacotes = [];
  for (const nome of nomes) {
    const dia = nome.match(DATA_ARQUIVO)?.[1];
    if (!dia || dia >= date || dia < semanaAntes) continue;
    const p = await lerJson(path.join(dir, 'pacotes', nome));
    if (p) pacotes.push(p);
  }
  return pacotes;
}

async function atender(pedido, opts, log) {
  const { date } = pedido;
  // O pedido pode ter saído antes do pacote de ontem existir, ou de uma versão
  // antiga do app: completa com o que este computador já gerou.
  const completado = incorporarPacotesAnteriores(atualizarBriefingAntigo(pedido.briefing), await pacotesAnteriores(opts.dir, date));
  const { briefing } = completado;
  if (completado.incorporados.length) log(`[pedido ${date}] considerando pacotes já gerados: ${completado.incorporados.join(', ')}`);
  const arqPacote = path.join(opts.dir, 'pacotes', `${date}.json`);
  const arqErro = path.join(opts.dir, 'erros', `${date}.json`);

  const tentativas = (await lerJson(arqErro))?.tentativas || 0;
  if (tentativas >= MAX_TENTATIVAS) {
    log(`[aviso] ${date}: ${tentativas} tentativas falharam; não tento de novo. Veja erros/${date}.json na caixa.`);
    return 1;
  }

  // Registro do que sai da máquina, como no gerador normal.
  await fs.mkdir(opts.outbox, { recursive: true });
  await fs.writeFile(path.join(opts.outbox, `${date}-briefing-celular.json`), JSON.stringify(briefing, null, 2));
  log(`[pedido ${date}] ${describeBriefing(briefing)}`);

  const backend = await BACKENDS[opts.backend]();
  log(`[modelo] backend=${backend.name}${opts.model ? ` model=${opts.model}` : ''}`);
  let resultado;
  try {
    resultado = await gerarPacote({
      briefing,
      retries: opts.retries,
      chamar: ({ system, user }) => backend.generate({ system, user, briefing, model: opts.model }),
      onProgresso: (e) => {
        if (e.fase === 'recusado') log(`[validação] tentativa ${e.tentativa}: ${e.erros.slice(0, 3).join('; ')}`);
      },
    });
  } catch (err) {
    resultado = { ok: false, errors: [err.message] };
  }

  if (resultado.ok) {
    await fs.mkdir(path.dirname(arqPacote), { recursive: true });
    await fs.writeFile(arqPacote, JSON.stringify(resultado.pack, null, 2));
    await fs.rm(arqErro, { force: true });
    await publicar(opts.dir, `pacote ${date}`);
    log(`[ok] pacote de ${date} entregue na caixa: ${resultado.pack.vocab.length} palavras, ` +
      `${resultado.pack.exercises.length} exercícios.`);
    return 0;
  }

  await fs.mkdir(path.dirname(arqErro), { recursive: true });
  await fs.writeFile(arqErro, JSON.stringify({
    tentativas: tentativas + 1,
    em: new Date().toISOString(),
    erro: resultado.errors[0] || 'motivo desconhecido',
    erros: resultado.errors.slice(0, 10),
  }, null, 2));
  await publicar(opts.dir, `erro ${date}`);
  console.error(`[erro] ${date}: geração falhou (${tentativas + 1}/${MAX_TENTATIVAS}): ${resultado.errors[0]}`);
  return 1;
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const log = (...a) => { if (!opts.quiet) console.log(...a); };

  await prepararClone(opts, log);
  await atualizar(opts.dir);

  const pedidos = await pedidosAtendiveis(opts.dir, opts.agora);
  if (!pedidos.length) {
    log('[ok] nenhum pedido pronto para atender. Nada a fazer.');
    return 0;
  }
  let codigo = 0;
  for (const pedido of pedidos) codigo = Math.max(codigo, await atender(pedido, opts, log));
  return codigo;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(`[erro] ${err.message}`);
    process.exit(1);
  });
}
