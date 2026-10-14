/**
 * Caixa postal: o celular e o computador trocam arquivos por um repositório
 * PRIVADO do GitHub, para o pacote do dia ser gerado pelo plano do Claude no
 * computador (`claude -p`) sem chave de API no celular.
 *
 *   celular ──▶ pedidos/AAAA-MM-DD.json  (briefing daquele dia + a partir de quando atender)
 *   computador lê o pedido, gera e valida ──▶ pacotes/AAAA-MM-DD.json
 *   computador, se falhar ──▶ erros/AAAA-MM-DD.json
 *   celular ◀── pacotes/*.json (revalidados aqui antes de entrar)
 *
 * Por que não pela Wi-Fi: o app publicado é HTTPS e o servidor de casa é HTTP;
 * o Safari bloqueia essa mistura sem exceção. O GitHub fala HTTPS com CORS.
 *
 * Por que o briefing e não o estado inteiro: é o mesmo resumo que já iria ao
 * modelo. Histórico completo, conversas e cartões não saem do aparelho.
 */
import { buildBriefing } from './briefing.js';
import { digestBriefing } from './packPipeline.js';
import { validatePack } from './packValidation.js';
import { isIngested } from './packs.js';
import { dayKey, addDays } from './xp.js';

export const CHAVE_CAIXA = 'mandarin-quest:caixa-postal';
const API = 'https://api.github.com';
const DATA_ARQUIVO = /^(\d{4}-\d{2}-\d{2})\.json$/;
/** Quantos pacotes recentes da caixa o celular confere a cada sincronia. */
const JANELA_PACOTES = 7;

// ---------------------------------------------------------------- configuração

/**
 * A configuração mora fora do estado, como a chave da API (secrets.js): o
 * token não pode ir para o JSON exportado nem ser mesclado com outro aparelho.
 */
export function lerConfigCaixa({ storage = globalThis.localStorage } = {}) {
  try {
    const bruto = storage?.getItem(CHAVE_CAIXA);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

export function gravarConfigCaixa(config, { storage = globalThis.localStorage } = {}) {
  try {
    if (!config) storage?.removeItem(CHAVE_CAIXA);
    else storage?.setItem(CHAVE_CAIXA, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

/** Atualiza só alguns campos (registro da última sincronia, por exemplo). */
export function anotarNaConfig(campos, opts) {
  const atual = lerConfigCaixa(opts);
  if (!atual) return false;
  return gravarConfigCaixa({ ...atual, ...campos }, opts);
}

/**
 * Aceita "dono/repo", URL https ou endereço SSH. Devolve "dono/repo" ou null.
 * Tolera o que o teclado do iPhone faz sozinho: espaço, traço tipográfico
 * (– — ‐) no lugar do hífen e barra de largura total.
 */
export function normalizarRepo(texto) {
  const t = String(texto || '')
    .replace(/\s+/g, '')
    .replace(/[\u2010-\u2015\u2212\uFE63\uFF0D]/g, '-')
    .replace(/\uFF0F/g, '/')
    .replace(/^@/, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
  const m = t.match(/(?:github\.com[/:])?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Sugestão de repositório a partir do endereço do Pages (dono.github.io → dono/mandarim-dados). */
export function repoSugerido(hostname = globalThis.location?.hostname || '') {
  const m = String(hostname).match(/^([A-Za-z0-9-]+)\.github\.io$/i);
  return m ? `${m[1]}/mandarim-dados` : '';
}

// ---------------------------------------------------------------- base64 UTF-8

export function paraBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

export function deBase64(b64) {
  const binario = atob(String(b64).replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binario, (c) => c.charCodeAt(0)));
}

// ---------------------------------------------------------------- cliente

/**
 * Cliente mínimo da API de conteúdo do GitHub. Nunca lança exceção para erro
 * de rede: devolve { ok:false, error } (rede de celular cai, ver §6 do estado).
 */
export function clienteGitHub({ repo, token, fetch: buscar = globalThis.fetch }) {
  const base = `${API}/repos/${repo}`;
  const cabecalhos = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  async function chamar(caminho, opcoes = {}) {
    let resposta;
    try {
      // no-store: a API responde com max-age=60, e um cache velho esconderia o pacote novo.
      resposta = await buscar(`${base}${caminho}`, { cache: 'no-store', ...opcoes, headers: { ...cabecalhos, ...opcoes.headers } });
    } catch (err) {
      return { ok: false, status: 0, error: `sem conexão com o GitHub (${err.message})` };
    }
    let corpo = null;
    try {
      corpo = await resposta.json();
    } catch { /* corpo vazio */ }
    if (!resposta.ok) return { ok: false, status: resposta.status, error: explicarErro(resposta.status, corpo) };
    return { ok: true, status: resposta.status, corpo };
  }

  const caminhoConteudo = (p) => `/contents/${p.split('/').map(encodeURIComponent).join('/')}`;

  return {
    repo,
    /** Metadados do repositório (serve para testar token e visibilidade). */
    info: () => chamar(''),
    /** Lista uma pasta. Pasta inexistente (ou repositório vazio) é lista vazia, não erro. */
    async listar(pasta) {
      const r = await chamar(caminhoConteudo(pasta));
      if (r.status === 404) return { ok: true, itens: [] };
      if (!r.ok) return r;
      return { ok: true, itens: Array.isArray(r.corpo) ? r.corpo.filter((i) => i.type === 'file') : [] };
    },
    /** Lê um arquivo de texto. Inexistente devolve { ok:true, existe:false }. */
    async ler(caminho) {
      const r = await chamar(caminhoConteudo(caminho));
      if (r.status === 404) return { ok: true, existe: false };
      if (!r.ok) return r;
      return { ok: true, existe: true, sha: r.corpo.sha, texto: deBase64(r.corpo.content || '') };
    },
    /**
     * Cria ou substitui um arquivo. Se o sha estiver velho (o computador acabou
     * de escrever), relê e tenta uma vez mais.
     */
    async gravar(caminho, texto, mensagem) {
      for (let tentativa = 0; tentativa < 2; tentativa += 1) {
        const atual = await this.ler(caminho);
        if (!atual.ok) return atual;
        const corpo = JSON.stringify({ message: mensagem, content: paraBase64(texto), ...(atual.existe ? { sha: atual.sha } : {}) });
        const r = await chamar(caminhoConteudo(caminho), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: corpo,
          // keepalive deixa a escrita terminar mesmo se o app for fechado logo
          // depois de estudar; o navegador só aceita corpo de até 64 KB.
          keepalive: corpo.length < 60000,
        });
        if (r.ok) return { ok: true };
        if (r.status !== 409 && r.status !== 422) return r;
      }
      return { ok: false, error: 'conflito ao gravar no GitHub; tente de novo' };
    },
  };
}

function explicarErro(status, corpo) {
  const msg = corpo?.message ? ` (${corpo.message})` : '';
  if (status === 401) return 'token recusado pelo GitHub: confira se foi copiado inteiro e se não expirou';
  if (status === 403) return `o token não tem permissão para isso${msg}. Ele precisa de "Contents: Read and write" neste repositório`;
  if (status === 404) return 'repositório não encontrado, ou o token não tem acesso a ele';
  return `GitHub respondeu ${status}${msg}`;
}

/**
 * Confere token e repositório antes de guardar. Recusa repositório público:
 * o briefing tem seus erros e lacunas, e ficaria visível para qualquer um.
 */
export async function testarCaixa(cliente) {
  const r = await cliente.info();
  if (!r.ok) return r;
  if (!r.corpo?.private) {
    return { ok: false, error: 'este repositório é PÚBLICO: seus dados de estudo ficariam visíveis. Use um repositório privado.' };
  }
  if (r.corpo.permissions && r.corpo.permissions.push === false) {
    return { ok: false, error: 'o token só lê este repositório; ele precisa de "Contents: Read and write"' };
  }
  return { ok: true, nome: r.corpo.full_name };
}

// ---------------------------------------------------------------- sincronia

/**
 * O pedido carrega `naoAntesDe` em horário ABSOLUTO (UTC): o computador pode
 * estar em outro fuso (PC no horário de Brasília, celular na China), então ele
 * não decide sozinho qual é o "dia de hoje" — obedece ao relógio do celular.
 */
export function montarPedido(state, date, { agora = new Date(), naoAntesDe = agora } = {}) {
  const cfg = state.settings?.llm || {};
  const briefing = buildBriefing(state, {
    date,
    includeGaps: cfg.sendGaps !== false,
    recentPacks: (state.packs || []).map((p) => p.pack),
  });
  return { versao: 1, date, criadoEm: agora.toISOString(), naoAntesDe: naoAntesDe.toISOString(), briefing };
}

/** 4h da manhã de `date` no fuso DESTE aparelho: o pacote fica pronto antes de acordar. */
export function madrugadaLocal(date, hora = 4) {
  const [a, m, d] = date.split('-').map(Number);
  return new Date(a, m - 1, d, hora, 0, 0);
}

/**
 * Uma rodada de sincronia. Não altera o estado: devolve os pacotes válidos para
 * quem chama ingerir com commit (assim a gravação segue o caminho de sempre).
 *
 * @returns {Promise<{ok, error?, pacotes, recusados, pedidos, errosDoComputador, digests}>}
 */
export async function sincronizar(state, cliente, { hoje = dayKey(), digestsEnviados = {}, agora = new Date() } = {}) {
  const saida = { ok: true, pacotes: [], recusados: [], pedidos: [], errosDoComputador: [], digests: { ...digestsEnviados } };

  // 1. Receber: pacotes recentes que ainda não entraram neste aparelho.
  const lista = await cliente.listar('pacotes');
  if (!lista.ok) return { ...saida, ok: false, error: lista.error };
  const datasNaCaixa = new Set(lista.itens.map((i) => i.name.match(DATA_ARQUIVO)?.[1]).filter(Boolean));
  const pendentes = [...datasNaCaixa].sort().slice(-JANELA_PACOTES).filter((d) => !isIngested(state, d));
  for (const date of pendentes) {
    const arquivo = await cliente.ler(`pacotes/${date}.json`);
    if (!arquivo.ok) return { ...saida, ok: false, error: arquivo.error };
    if (!arquivo.existe) continue;
    let pacote;
    try {
      pacote = JSON.parse(arquivo.texto);
    } catch (err) {
      saida.recusados.push({ date, errors: [`JSON inválido: ${err.message}`] });
      continue;
    }
    // Revalida aqui: o arquivo veio pela rede e pode ter sido editado à mão.
    const conferido = validatePack(pacote);
    if (conferido.ok) saida.pacotes.push(pacote);
    else saida.recusados.push({ date, errors: conferido.errors });
  }

  // 2. Avisos do computador (geração que falhou) para hoje.
  const erroHoje = await cliente.ler(`erros/${hoje}.json`);
  if (erroHoje.ok && erroHoje.existe && !datasNaCaixa.has(hoje)) {
    try {
      saida.errosDoComputador.push({ date: hoje, ...JSON.parse(erroHoje.texto) });
    } catch { /* aviso ilegível não impede a sincronia */ }
  }

  // 3. Pedir: hoje (se ainda não há pacote) e amanhã (para a rodada das 5h).
  const temHoje = datasNaCaixa.has(hoje) || isIngested(state, hoje) || saida.pacotes.some((p) => p.date === hoje);
  const datas = [...(temHoje ? [] : [hoje]), addDays(hoje, 1)];
  for (const date of datas) {
    const naoAntesDe = date === hoje ? agora : madrugadaLocal(date);
    const pedido = montarPedido(state, date, { agora, naoAntesDe });
    const digest = digestBriefing(pedido.briefing);
    // Briefing igual ao último enviado: não gasta escrita nem gera commit à toa.
    if (digestsEnviados[date] === digest) continue;
    const r = await cliente.gravar(`pedidos/${date}.json`, JSON.stringify(pedido, null, 2), `pedido ${date}`);
    if (!r.ok) return { ...saida, ok: false, error: r.error };
    saida.pedidos.push(date);
    saida.digests[date] = digest;
  }
  // Só guarda digests recentes.
  for (const d of Object.keys(saida.digests)) if (d < hoje) delete saida.digests[d];
  return saida;
}
