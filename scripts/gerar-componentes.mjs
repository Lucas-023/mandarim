/**
 * Gera src/core/content/componentes.js a partir do dictionary.txt do projeto
 * Make Me a Hanzi (https://github.com/skishore/makemeahanzi, LGPL-3.0).
 *
 *   curl -L -o /tmp/dictionary.txt https://cdn.jsdelivr.net/gh/skishore/makemeahanzi@master/dictionary.txt
 *   node scripts/gerar-componentes.mjs /tmp/dictionary.txt
 *
 * Recorte: os 3755 caracteres mais comuns (GB2312 nível 1, que é ordenado por
 * frequência de uso), os caracteres do léxico do app e, recursivamente, os
 * componentes de todos eles. Guarda só decomposição (IDS) e radical.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEXICON } from '../src/core/content/lexicon.js';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fonte = process.argv[2];
if (!fonte) {
  console.error('uso: node scripts/gerar-componentes.mjs <dictionary.txt>');
  process.exit(1);
}

const dic = new Map();
for (const linha of fs.readFileSync(fonte, 'utf8').split('\n')) {
  if (!linha.trim()) continue;
  const e = JSON.parse(linha);
  dic.set(e.character, { d: e.decomposition, r: e.radical });
}

// GB2312 nível 1: bytes 0xB0A1–0xD7F9, na ordem de frequência.
const gb = new TextDecoder('gb18030');
const nivel1 = [];
for (let a = 0xb0; a <= 0xd7; a += 1) {
  for (let b = 0xa1; b <= 0xfe; b += 1) {
    if (a === 0xd7 && b > 0xf9) break;
    nivel1.push(gb.decode(new Uint8Array([a, b])));
  }
}

const HANZI = /[一-鿿㐀-䶿⺀-⿕]/u;
const querer = new Set(nivel1);
for (const e of LEXICON) for (const c of e.hz) if (HANZI.test(c)) querer.add(c);

const saida = {};
const fila = [...querer];
while (fila.length) {
  const c = fila.shift();
  if (saida[c] || !dic.has(c)) continue;
  saida[c] = dic.get(c);
  for (const p of saida[c].d || '') if (!saida[p] && p !== c && dic.has(p)) fila.push(p);
}

const faltam = [...querer].filter((c) => !saida[c]);
const linhas = Object.entries(saida).map(([c, { d, r }]) => `'${c}':['${d}','${r}']`);
const js = `/**
 * Decomposição dos caracteres (IDS de primeiro nível) e radical.
 * GERADO por scripts/gerar-componentes.mjs — não edite à mão.
 *
 * Dados derivados do dictionary.txt de Make Me a Hanzi
 * (https://github.com/skishore/makemeahanzi), por sua vez derivado de Unihan e
 * cjklib. Distribuído sob a GNU Lesser General Public License v3 ou posterior.
 * ${Object.keys(saida).length} caracteres: GB2312 nível 1 + léxico do app + componentes.
 */
const BRUTO = {${linhas.join(',')}};

/** { '银': { d: '⿰钅艮', r: '钅' } } */
export const COMPONENTES = Object.fromEntries(Object.entries(BRUTO).map(([c, [d, r]]) => [c, { d, r }]));
`;
fs.writeFileSync(path.join(raiz, 'src/core/content/componentes.js'), js);
console.log(`${Object.keys(saida).length} caracteres, ${(js.length / 1024).toFixed(0)} KB; sem dados: ${faltam.join('') || 'nenhum'}`);
