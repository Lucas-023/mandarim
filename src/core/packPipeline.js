/**
 * Orquestração da geração do pacote, compartilhada pelo computador e pelo celular.
 *
 * Quem chama fornece apenas a função que fala com o modelo (`chamar`). O resto —
 * montar o prompt, validar contra o schema, pedir correção quando falha e
 * estampar a procedência — é igual nos dois lugares, para o celular não virar
 * uma segunda implementação com outras regras.
 */
import { validatePack, extractJson, PACK_SCHEMA_VERSION } from './packValidation.js';
import { SYSTEM_PROMPT, PROMPT_VERSION, buildUserMessage, buildRepairMessage } from './prompts/pack.js';
import { describeBriefing } from './briefing.js';

/**
 * Impressão digital do briefing (FNV-1a, 64 bits em hex).
 *
 * Serve para comparar identidade: dois pacotes com o mesmo digest nasceram do
 * mesmo retrato de desempenho. Não é segurança, é rastreabilidade — e precisa
 * ser sincrona e sem dependência, porque roda no computador e no celular.
 */
export function digestBriefing(briefing) {
  const texto = JSON.stringify(briefing);
  let alto = 0x811c9dc5;
  let baixo = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto.charCodeAt(i);
    alto = Math.imul(alto ^ c, 0x01000193) >>> 0;
    baixo = Math.imul(baixo ^ ((c << 5) | (c >>> 3)), 0x01000193) >>> 0;
  }
  return (alto.toString(16).padStart(8, '0') + baixo.toString(16).padStart(8, '0'));
}

/**
 * @param {object} opts
 * @param {object} opts.briefing      briefing já montado
 * @param {Function} opts.chamar      async ({system, user, tentativa}) => { text, meta }
 * @param {number} [opts.retries]     pedidos de correção depois da primeira falha
 * @param {Function} [opts.onProgresso] recebe eventos para a interface mostrar
 * @returns {Promise<{ok, pack, errors, raw, attempts, meta}>}
 */
export async function gerarPacote({ briefing, chamar, retries = 1, onProgresso = () => {} }) {
  let mensagem = buildUserMessage(briefing);
  let erros = [];
  let bruto = '';
  let meta = null;

  for (let tentativa = 1; tentativa <= retries + 1; tentativa += 1) {
    onProgresso({ fase: 'enviando', tentativa });
    const resposta = await chamar({ system: SYSTEM_PROMPT, user: mensagem, tentativa });
    bruto = resposta.text || '';
    meta = resposta.meta || null;
    onProgresso({ fase: 'recebido', tentativa, caracteres: bruto.length });

    const extraido = extractJson(bruto);
    if (!extraido.ok) {
      erros = [`resposta não continha JSON utilizável (${extraido.error})`];
    } else {
      const conferido = validatePack({ ...extraido.value, date: extraido.value.date || briefing.date });
      if (conferido.ok) {
        const pacote = {
          ...conferido.pack,
          provenance: {
            backend: meta?.backend || 'desconhecido',
            model: meta?.model || null,
            promptVersion: PROMPT_VERSION,
            schemaVersion: PACK_SCHEMA_VERSION,
            generatedAt: new Date().toISOString(),
            costUsd: meta?.costUsd ?? null,
            usage: meta?.usage || null,
            attempts: tentativa,
            briefingDigest: digestBriefing(briefing),
            briefingSummary: describeBriefing(briefing),
          },
        };
        onProgresso({ fase: 'validado', tentativa });
        return { ok: true, pack: pacote, errors: [], raw: bruto, attempts: tentativa, meta };
      }
      erros = conferido.errors;
    }

    onProgresso({ fase: 'recusado', tentativa, erros });
    if (tentativa <= retries) mensagem = buildRepairMessage(erros, bruto);
  }

  return { ok: false, pack: null, errors: erros, raw: bruto, attempts: retries + 1, meta };
}
