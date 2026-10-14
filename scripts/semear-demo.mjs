/**
 * Escreve data/state.json com os dados de demonstração (fictícios).
 * Útil para ver o app cheio e para testar a geração do pacote.
 *   node scripts/semear-demo.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoState } from '../src/core/demoData.js';
import { buildBriefing, describeBriefing } from '../tools/briefing.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = buildDemoState();
mkdirSync(path.join(ROOT, 'data'), { recursive: true });
writeFileSync(path.join(ROOT, 'data', 'state.json'), JSON.stringify(state, null, 2));
console.log('data/state.json escrito com dados FICTÍCIOS de demonstração.');
console.log('briefing que o gerador usaria:', describeBriefing(buildBriefing(state)));
