/**
 * Gera src/core/content/palavrasReais.js: as palavras de DOIS caracteres do
 * CC-CEDICT, para o teste "existe ou não?" (core/lexchi.js) garantir que uma
 * combinação inventada não é, por acaso, uma palavra de verdade.
 *
 *   curl -L -o /tmp/cedict.txt.gz https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz
 *   gunzip /tmp/cedict.txt.gz
 *   node scripts/gerar-palavras-reais.mjs /tmp/cedict.txt
 *
 * Recorte: palavras cujos dois caracteres estão entre os 2500 mais comuns
 * (GB2312 nível 1, ordenado por frequência) ou no léxico do app. O teste só
 * inventa combinações com esses caracteres (VERIFICAVEIS), então a checagem é
 * completa dentro do recorte.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEXICON } from '../src/core/content/lexicon.js';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fonte = process.argv[2];
if (!fonte) {
  console.error('uso: node scripts/gerar-palavras-reais.mjs <cedict.txt>');
  process.exit(1);
}

const gb = new TextDecoder('gb18030');
const nivel1 = [];
for (let a = 0xb0; a <= 0xd7; a += 1) {
  for (let b = 0xa1; b <= 0xfe; b += 1) {
    if (a === 0xd7 && b > 0xf9) break;
    nivel1.push(gb.decode(new Uint8Array([a, b])));
  }
}
const HANZI = /^[一-鿿]$/u;
const ok = new Set(nivel1.slice(0, 2500));
for (const e of LEXICON) for (const c of e.hz) if (HANZI.test(c)) ok.add(c);

const grupos = new Map();
let total = 0;
for (const linha of fs.readFileSync(fonte, 'utf8').split('\n')) {
  if (!linha || linha.startsWith('#')) continue;
  const w = [...(linha.split(' ')[1] || '')];
  if (w.length !== 2 || !ok.has(w[0]) || !ok.has(w[1])) continue;
  if (!grupos.has(w[0])) grupos.set(w[0], new Set());
  if (!grupos.get(w[0]).has(w[1])) total += 1;
  grupos.get(w[0]).add(w[1]);
}
// As palavras do próprio léxico também contam como reais.
for (const e of LEXICON) {
  const w = [...e.hz];
  if (w.length === 2 && ok.has(w[0]) && ok.has(w[1])) {
    if (!grupos.has(w[0])) grupos.set(w[0], new Set());
    if (!grupos.get(w[0]).has(w[1])) total += 1;
    grupos.get(w[0]).add(w[1]);
  }
}

const linhas = [...grupos].map(([a, s]) => a + [...s].join(''));
const js = `/**
 * Palavras reais de dois caracteres, agrupadas pelo primeiro: "银行河..." = 银行, 银河...
 * GERADO por scripts/gerar-palavras-reais.mjs — não edite à mão.
 *
 * Derivado do CC-CEDICT (https://cc-cedict.org/, publicado pela MDBG), licença
 * Creative Commons Atribuição-CompartilhaIgual 4.0 Internacional
 * (https://creativecommons.org/licenses/by-sa/4.0/). Este arquivo é distribuído
 * sob a mesma licença. ${total} palavras.
 */
export const GRUPOS = ${JSON.stringify(linhas.join('\n'))};
/** Caracteres cujas combinações estão todas cobertas pela lista acima. */
export const VERIFICAVEIS = ${JSON.stringify([...ok].join(''))};
`;
fs.writeFileSync(path.join(raiz, 'src/core/content/palavrasReais.js'), js);
console.log(`${total} palavras, ${ok.size} caracteres verificáveis, ${(Buffer.byteLength(js) / 1024).toFixed(0)} KB`);
