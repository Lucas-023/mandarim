/**
 * Backend alternativo: Claude API pelo SDK oficial.
 *
 * ATENÇÃO — este caminho NÃO foi executado nesta máquina: o ambiente onde o
 * projeto foi escrito não tinha acesso ao registro npm para instalar o SDK nem
 * credencial de API configurada. O código segue a documentação oficial, mas
 * trate a primeira execução como teste: rode com --dry-run antes.
 *
 * Requisitos:
 *   npm install @anthropic-ai/sdk
 *   export ANTHROPIC_API_KEY=...        (ou `ant auth login`, que o SDK também lê)
 *
 * Escolhas e por quê:
 *  - Modelo padrão claude-opus-5-5: é o modelo atual da linha Opus e o conteúdo
 *    pedagógico (pinyin correto, tradução natural, diálogo coerente) é
 *    justamente onde a qualidade do modelo aparece. Para baixar custo, passe
 *    --model claude-sonnet-5-5 ou --model claude-haiku-5-5; a decisão é sua.
 *  - O prompt de sistema vai com cache_control: ele é estável entre os dias, e
 *    leituras de cache custam uma fração do preço de entrada.
 *  - Sem `thinking` explícito: no Opus 5.5 o raciocínio é sempre ligado e
 *    desligá-lo (ou passar budget_tokens) devolve erro 400. A profundidade se
 *    controla por output_config.effort.
 */
export const name = 'api';

export const DEFAULT_MODEL = 'claude-opus-5-5';

export async function generate({ system, user, model = DEFAULT_MODEL, maxTokens = 16000, effort = 'high' }) {
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    throw new Error(
      'backend "api" precisa do SDK oficial: rode `npm install @anthropic-ai/sdk`. ' +
        'Sem ele, use --backend=claude-code (padrão), que não precisa de dependência nem de chave.',
    );
  }

  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      output_config: { effort },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new Error('credencial inválida: exporte ANTHROPIC_API_KEY ou rode `ant auth login`');
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new Error('limite de uso atingido na Claude API; tente mais tarde');
    }
    if (err instanceof Anthropic.APIError) {
      throw new Error(`erro ${err.status} da Claude API: ${err.message}`);
    }
    throw err;
  }

  if (response.stop_reason === 'refusal') {
    throw new Error(`o modelo recusou a requisição (${response.stop_details?.category || 'sem categoria'})`);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('resposta truncada por max_tokens; aumente --max-tokens');
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return {
    text,
    meta: {
      backend: name,
      model: response.model,
      usage: response.usage,
      costUsd: estimateCost(response.model, response.usage),
    },
  };
}

/** Preços por milhão de tokens (Claude API, primeira parte), conferidos em 2026-10. */
const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export function estimateCost(model, usage) {
  const price = PRICES[model];
  if (!price || !usage) return null;
  const million = 1e6;
  const cacheRead = (usage.cache_read_input_tokens || 0) * price.cacheRead;
  const cacheWrite = (usage.cache_creation_input_tokens || 0) * price.input * 1.25;
  const input = (usage.input_tokens || 0) * price.input;
  const output = (usage.output_tokens || 0) * price.output;
  return Number(((input + output + cacheRead + cacheWrite) / million).toFixed(4));
}
