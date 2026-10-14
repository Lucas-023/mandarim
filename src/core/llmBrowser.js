/**
 * Chamada direta à Claude API pelo navegador — o caminho do celular sem computador.
 *
 * Como funciona: a chave fica guardada SÓ neste aparelho (ver secrets.js) e a
 * requisição vai do navegador para api.anthropic.com. O cabeçalho
 * `anthropic-dangerous-direct-browser-access` é o que a API exige para aceitar
 * uma chamada vinda de navegador; o nome é um aviso explícito de que a chave
 * passa a viver no dispositivo.
 *
 * Riscos, declarados na interface:
 *  - Qualquer coisa com acesso ao armazenamento deste navegador pode ler a chave.
 *  - Por isso: use uma chave dedicada, com limite de gasto, e revogue-a se
 *    perder o aparelho.
 *
 * A resposta é lida em streaming, porque o pacote é grande (minutos de geração)
 * e conexão de celular cai: assim a interface mostra progresso e o texto já
 * recebido não se perde a cada bloco.
 */

export const API_URL = 'https://api.anthropic.com/v1/messages';
export const API_VERSION = '2023-06-01';
export const MODELO_PADRAO = 'claude-opus-5-5';

/** Preços por milhão de tokens (Claude API), conferidos em 2026-10. */
const PRECOS = {
  'claude-opus-5-5': { entrada: 4, saida: 20, cache: 0.2 },
  'claude-opus-5': { entrada: 5, saida: 25, cache: 0.5 },
  'claude-sonnet-5-5': { entrada: 2, saida: 10, cache: 0.2 },
  'claude-haiku-5-5': { entrada: 0.1, saida: 0.5, cache: 0.01 },
};

export function estimarCusto(modelo, uso) {
  const preco = PRECOS[modelo];
  if (!preco || !uso) return null;
  const custo =
    (uso.input_tokens || 0) * preco.entrada +
    (uso.output_tokens || 0) * preco.saida +
    (uso.cache_read_input_tokens || 0) * preco.cache +
    (uso.cache_creation_input_tokens || 0) * preco.entrada * 1.25;
  return Number((custo / 1e6).toFixed(4));
}

function cabecalhos(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

/**
 * Confere a chave sem gerar tokens: lista os modelos disponíveis.
 * @returns {{ok, modelos?, error?}}
 */
export async function verificarChave(apiKey, { fetchImpl = globalThis.fetch } = {}) {
  if (!apiKey || !/^sk-ant-/.test(apiKey)) {
    return { ok: false, error: 'a chave da Claude API começa com "sk-ant-"' };
  }
  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/models?limit=20', {
      headers: cabecalhos(apiKey),
    });
    if (res.status === 401) return { ok: false, error: 'chave recusada pela API (401)' };
    if (!res.ok) return { ok: false, error: `a API respondeu HTTP ${res.status}` };
    const dados = await res.json();
    return { ok: true, modelos: (dados.data || []).map((m) => m.id) };
  } catch (err) {
    return { ok: false, error: `não foi possível falar com a API (${err?.message || err})` };
  }
}

/**
 * Faz a chamada em streaming e devolve o texto completo.
 * `onTexto(parcial)` é chamado conforme o texto chega, para a interface mostrar
 * progresso em vez de uma tela parada por três minutos.
 */
export async function chamarModelo({
  system,
  user,
  apiKey,
  model = MODELO_PADRAO,
  maxTokens = 16000,
  effort = 'high',
  onTexto = () => {},
  fetchImpl = globalThis.fetch,
  signal = null,
}) {
  const corpo = {
    model,
    max_tokens: maxTokens,
    stream: true,
    output_config: { effort },
    // O prompt de sistema é estável entre os dias: marcá-lo para cache deixa as
    // próximas gerações mais baratas.
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  };

  const res = await fetchImpl(API_URL, {
    method: 'POST',
    headers: cabecalhos(apiKey),
    body: JSON.stringify(corpo),
    signal,
  });

  if (!res.ok) {
    let detalhe = `HTTP ${res.status}`;
    try {
      const erro = await res.json();
      detalhe = erro?.error?.message || detalhe;
    } catch { /* corpo não era JSON */ }
    if (res.status === 401) throw new Error(`chave recusada pela API: ${detalhe}`);
    if (res.status === 429) throw new Error(`limite de uso atingido: ${detalhe}`);
    if (res.status === 400) throw new Error(`requisição recusada: ${detalhe}`);
    throw new Error(`erro da Claude API: ${detalhe}`);
  }

  const { texto, uso, modelo, motivoParada, recusa } = await lerStream(res, onTexto);

  if (motivoParada === 'refusal') {
    throw new Error(`o modelo recusou a requisição${recusa ? ` (${recusa})` : ''}`);
  }
  if (motivoParada === 'max_tokens') {
    throw new Error('resposta truncada por max_tokens; gere de novo ou reduza o pedido');
  }

  return {
    text: texto,
    meta: {
      backend: 'navegador',
      model: modelo || model,
      usage: uso,
      costUsd: estimarCusto(modelo || model, uso),
    },
  };
}

/** Lê o fluxo de eventos (SSE) e junta o texto. */
async function lerStream(res, onTexto) {
  let texto = '';
  let uso = null;
  let modelo = null;
  let motivoParada = null;
  let recusa = null;

  const leitor = res.body?.getReader?.();
  if (!leitor) {
    // Sem streaming disponível: cai para o corpo inteiro de uma vez.
    const dados = await res.json();
    return {
      texto: (dados.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''),
      uso: dados.usage || null,
      modelo: dados.model || null,
      motivoParada: dados.stop_reason || null,
      recusa: dados.stop_details?.category || null,
    };
  }

  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const linhas = buffer.split('\n');
    buffer = linhas.pop() || '';
    for (const linha of linhas) {
      if (!linha.startsWith('data:')) continue;
      const conteudo = linha.slice(5).trim();
      if (!conteudo || conteudo === '[DONE]') continue;
      let evento;
      try {
        evento = JSON.parse(conteudo);
      } catch {
        continue;
      }
      if (evento.type === 'message_start') {
        modelo = evento.message?.model || modelo;
        uso = evento.message?.usage || uso;
      } else if (evento.type === 'content_block_delta' && evento.delta?.type === 'text_delta') {
        texto += evento.delta.text;
        onTexto(texto);
      } else if (evento.type === 'message_delta') {
        motivoParada = evento.delta?.stop_reason || motivoParada;
        recusa = evento.delta?.stop_details?.category || recusa;
        if (evento.usage) uso = { ...(uso || {}), ...evento.usage };
      } else if (evento.type === 'error') {
        throw new Error(evento.error?.message || 'erro no fluxo da API');
      }
    }
  }
  return { texto, uso, modelo, motivoParada, recusa };
}
