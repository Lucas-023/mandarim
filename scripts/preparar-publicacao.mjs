/**
 * Monta a pasta `publicar/` com a versão estática do app, pronta para o
 * GitHub Pages — e gera o service worker que faz tudo funcionar offline.
 *
 *   node scripts/preparar-publicacao.mjs
 *
 * O que NÃO vai para a publicação: seus dados (data/), o servidor local
 * (server.mjs), o gerador de linha de comando (tools/), os testes e a chave de
 * acesso da rede local. A versão publicada é só o app; os dados ficam no
 * aparelho de quem abre.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(ROOT, 'publicar');

const ARQUIVOS_RAIZ = ['index.html', 'styles.css', 'manifest.webmanifest', 'icone.svg'];

async function listarJs(dir, base = dir) {
  const saida = [];
  for (const entrada of await fs.readdir(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...(await listarJs(completo, base)));
    else if (entrada.name.endsWith('.js')) saida.push(path.relative(ROOT, completo).split(path.sep).join('/'));
  }
  return saida;
}

async function copiar(relativo) {
  const destino = path.join(SAIDA, relativo);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.copyFile(path.join(ROOT, relativo), destino);
}

function swFonte(arquivos, versao) {
  return `/**
 * Service worker do Mandarin Quest — GERADO por scripts/preparar-publicacao.mjs.
 * Não edite à mão: rode o script de novo.
 *
 * Estratégia:
 *  - instala guardando todos os arquivos do app (lista abaixo);
 *  - serve do cache primeiro, para abrir offline e instantâneo;
 *  - busca a rede em segundo plano para atualizar o cache;
 *  - nunca guarda chamadas de API (api.anthropic.com, /api/...): elas precisam
 *    ser sempre frescas, e a resposta do modelo não deve ficar em cache.
 */
const VERSAO = '${versao}';
const CACHE = 'mandarin-quest-' + VERSAO;
const ARQUIVOS = ${JSON.stringify(['./', ...arquivos], null, 2)};

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  // API do modelo e rotas do servidor local nunca entram no cache.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  evento.respondWith(
    caches.match(pedido).then((guardado) => {
      const daRede = fetch(pedido)
        .then((resposta) => {
          if (resposta && resposta.ok) {
            const copia = resposta.clone();
            caches.open(CACHE).then((cache) => cache.put(pedido, copia));
          }
          return resposta;
        })
        .catch(() => guardado);
      return guardado || daRede;
    }),
  );
});
`;
}

async function main() {
  await fs.rm(SAIDA, { recursive: true, force: true });
  await fs.mkdir(SAIDA, { recursive: true });

  const js = await listarJs(path.join(ROOT, 'src'));
  const arquivos = [...ARQUIVOS_RAIZ, ...js];

  const hash = crypto.createHash('sha256');
  for (const relativo of arquivos) {
    await copiar(relativo);
    hash.update(await fs.readFile(path.join(ROOT, relativo)));
  }
  const versao = `${new Date().toISOString().slice(0, 10)}-${hash.digest('hex').slice(0, 8)}`;

  await fs.writeFile(path.join(SAIDA, 'sw.js'), swFonte(arquivos, versao));
  // .nojekyll impede o GitHub Pages de esconder arquivos e pastas.
  await fs.writeFile(path.join(SAIDA, '.nojekyll'), '');

  const total = (await Promise.all(arquivos.map(async (f) => (await fs.stat(path.join(SAIDA, f))).size)))
    .reduce((a, b) => a + b, 0);

  console.log(`publicar/ pronto: ${arquivos.length + 2} arquivo(s), ${(total / 1024).toFixed(0)} KB`);
  console.log(`versão do service worker: ${versao}`);
  console.log('\nPróximos passos (GitHub Pages):');
  console.log('  1. git add -A && git commit -m "app" && git push');
  console.log('  2. no GitHub: Settings → Pages → Source: GitHub Actions');
  console.log('  3. o workflow .github/workflows/pages.yml publica a pasta publicar/');
  console.log('  4. abra o endereço no celular e use "Adicionar à tela de início"');
}

main().catch((err) => {
  console.error(`[erro] ${err.message}`);
  process.exit(1);
});
