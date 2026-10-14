#!/usr/bin/env node
/**
 * Gera o "pacote do dia" do Mandarin Quest.
 *
 * Uso:
 *   node tools/generate.js                      # backend padrão (claude -p)
 *   node tools/generate.js --dry-run            # mostra o prompt e não chama modelo
 *   node tools/generate.js --backend=mock       # pacote falso, para testar o app
 *   node tools/generate.js --backend=api --model=claude-opus-5-5
 *   node tools/generate.js --date=2026-10-15 --force
 *   node tools/generate.js --no-gaps            # não envia texto das conversas
 *
 * Ele lê data/state.json (o estado do app, servido por server.mjs), monta um
 * briefing, pede o pacote ao modelo, VALIDA contra o schema e só então grava em
 * data/packs/<data>.json. Nada entra no app sem passar pela validação.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBriefing, describeBriefing } from './briefing.js';
import { SYSTEM_PROMPT, buildUserMessage } from './prompts/pack.js';
import { gerarPacote } from '../src/core/packPipeline.js';
import { migrate, emptyState } from '../src/core/storage.js';
import { dayKey } from '../src/core/xp.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKENDS = {
  'claude-code': () => import('./backends/claudeCode.js'),
  api: () => import('./backends/api.js'),
  mock: () => import('./backends/mock.js'),
};

function parseArgs(argv) {
  const opts = {
    backend: 'claude-code',
    model: null,
    date: dayKey(),
    state: path.join(ROOT, 'data', 'state.json'),
    outDir: path.join(ROOT, 'data', 'packs'),
    outbox: path.join(ROOT, 'data', 'outbox'),
    dryRun: false,
    includeGaps: true,
    retries: 1,
    force: false,
    quiet: false,
  };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    switch (key) {
      case 'backend': opts.backend = value; break;
      case 'model': opts.model = value; break;
      case 'date': opts.date = value; break;
      case 'state': opts.state = path.resolve(value); break;
      case 'out': opts.outDir = path.resolve(value); break;
      case 'dry-run': opts.dryRun = true; break;
      case 'no-gaps': opts.includeGaps = false; break;
      case 'retries': opts.retries = Number(value); break;
      case 'force': opts.force = true; break;
      case 'quiet': opts.quiet = true; break;
      case 'help': opts.help = true; break;
      default: throw new Error(`argumento desconhecido: --${key}`);
    }
  }
  if (!BACKENDS[opts.backend]) {
    throw new Error(`backend inválido: ${opts.backend} (use ${Object.keys(BACKENDS).join(', ')})`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) throw new Error(`data inválida: ${opts.date}`);
  return opts;
}

async function readState(file) {
  try {
    return migrate(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(
        `[aviso] ${path.relative(ROOT, file)} não existe. Gerando a partir de um estado vazio: ` +
          'o pacote vai ser genérico. Abra o app com `npm start` para que o estado passe a ser salvo em arquivo.',
      );
      return emptyState();
    }
    throw new Error(`não foi possível ler o estado (${file}): ${err.message}`);
  }
}

async function readRecentPacks(dir, limit = 7) {
  try {
    const files = (await fs.readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-limit);
    const packs = [];
    for (const f of files) {
      try {
        packs.push(JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')));
      } catch { /* pacote corrompido é ignorado de propósito */ }
    }
    return packs;
  } catch {
    return [];
  }
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log(await fs.readFile(fileURLToPath(import.meta.url), 'utf8').then((s) => s.split('*/')[0]));
    return 0;
  }
  const log = (...args) => {
    if (!opts.quiet) console.log(...args);
  };

  const target = path.join(opts.outDir, `${opts.date}.json`);
  if (!opts.force) {
    try {
      await fs.access(target);
      log(`[ok] pacote de ${opts.date} já existe (${path.relative(ROOT, target)}). Use --force para refazer.`);
      return 0;
    } catch { /* não existe: segue */ }
  }

  const state = await readState(opts.state);
  const recentPacks = await readRecentPacks(opts.outDir);
  const briefing = buildBriefing(state, { date: opts.date, includeGaps: opts.includeGaps, recentPacks });
  const user = buildUserMessage(briefing);

  // Registro do que sai da máquina, antes de sair.
  await fs.mkdir(opts.outbox, { recursive: true });
  const outboxFile = path.join(opts.outbox, `${opts.date}-briefing.json`);
  await fs.writeFile(outboxFile, JSON.stringify(briefing, null, 2));

  log(`[briefing] ${describeBriefing(briefing)}`);
  log(`[briefing] cópia do que será enviado: ${path.relative(ROOT, outboxFile)}`);

  if (opts.dryRun) {
    log('\n===== PROMPT DE SISTEMA =====\n');
    log(SYSTEM_PROMPT);
    log('\n===== MENSAGEM DO USUÁRIO =====\n');
    log(user);
    log('\n[dry-run] nada foi enviado a nenhum modelo.');
    return 0;
  }

  const backend = await BACKENDS[opts.backend]();
  log(`[modelo] backend=${backend.name}${opts.model ? ` model=${opts.model}` : ''}`);

  let inicio = Date.now();
  const resultado = await gerarPacote({
    briefing,
    retries: opts.retries,
    chamar: async ({ system, user: mensagem }) => {
      inicio = Date.now();
      return backend.generate({ system, user: mensagem, briefing, model: opts.model });
    },
    onProgresso: (evento) => {
      if (evento.fase === 'recebido') {
        log(`[modelo] tentativa ${evento.tentativa}: ${evento.caracteres} caracteres em ` +
          `${((Date.now() - inicio) / 1000).toFixed(1)}s`);
      } else if (evento.fase === 'recusado') {
        log(`[validação] rejeitado com ${evento.erros.length} problema(s):`);
        for (const e of evento.erros.slice(0, 10)) log(`  - ${e}`);
        if (evento.tentativa <= opts.retries) log('[validação] pedindo correção ao modelo…');
      }
    },
  });

  if (resultado.ok) {
    const pack = resultado.pack;
    if (pack.provenance.costUsd != null) {
      log(`[modelo] custo ~US$ ${Number(pack.provenance.costUsd).toFixed(4)}`);
    }
    // Escrita atômica: um Ctrl+C no meio não deixa pacote pela metade.
    await fs.mkdir(opts.outDir, { recursive: true });
    const temp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(pack, null, 2));
    await fs.rename(temp, target);
    log(`[ok] pacote salvo em ${path.relative(ROOT, target)}`);
    log(`[ok] ${pack.vocab.length} palavras, ${pack.exercises.length} exercícios, ` +
      `diálogo com ${pack.dialogue.lines.length} falas, foco: ${pack.focus.tags.join(', ')}`);
    return 0;
  }

  const lastErrors = resultado.errors;
  const lastRaw = resultado.raw;
  const failFile = path.join(opts.outDir, `${opts.date}.rejeitado.txt`);
  await fs.mkdir(opts.outDir, { recursive: true });
  await fs.writeFile(failFile, `Erros:\n${lastErrors.join('\n')}\n\nResposta:\n${lastRaw}`);
  console.error(`[erro] não foi possível obter um pacote válido. Resposta salva em ${path.relative(ROOT, failFile)}`);
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(`[erro] ${err.message}`);
    process.exit(1);
  });
}
