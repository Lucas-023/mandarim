/**
 * Interface da caixa postal: o pacote do dia vem do computador (plano do
 * Claude) por um repositório privado do GitHub. Lógica em core/caixaPostal.js.
 */
import { h, card, button, field } from './dom.js';
import {
  lerConfigCaixa, gravarConfigCaixa, anotarNaConfig, normalizarRepo,
  clienteGitHub, testarCaixa, sincronizar,
} from '../core/caixaPostal.js';
import { ingestPack } from '../core/packs.js';
import { mascararChave } from '../core/secrets.js';

/** Entre sincronias automáticas (abrir o app, voltar a ele). */
const INTERVALO_AUTOMATICO_MS = 5 * 60 * 1000;
let emAndamento = null;

export function caixaConfigurada() {
  const cfg = lerConfigCaixa();
  return Boolean(cfg?.repo && cfg?.token);
}

/**
 * Sincroniza e ingere o que chegou. `automatico` respeita o intervalo e só
 * fala quando chega pacote ou o computador avisa erro — falta de rede no
 * metrô não merece aviso.
 */
export async function sincronizarCaixa(ctx, { automatico = false } = {}) {
  const cfg = lerConfigCaixa();
  if (!cfg?.repo || !cfg?.token || ctx.store.mode === 'server') return null;
  // Antes do cadastro o briefing seria genérico: pedir pacote não faz sentido.
  if (!ctx.state.profile?.onboardingDone) {
    if (!automatico) ctx.toast('Acesso guardado. Os pedidos começam depois do cadastro inicial.', 'info');
    return null;
  }
  if (automatico && cfg.ultimaTentativa && Date.now() - Date.parse(cfg.ultimaTentativa) < INTERVALO_AUTOMATICO_MS) return null;
  if (emAndamento) return emAndamento;

  emAndamento = (async () => {
    anotarNaConfig({ ultimaTentativa: new Date().toISOString() });
    const cliente = clienteGitHub({ repo: cfg.repo, token: cfg.token });
    const r = await sincronizar(ctx.state, cliente, { digestsEnviados: cfg.digests || {} });
    if (!r.ok) {
      anotarNaConfig({ ultimoErro: r.error });
      if (!automatico) ctx.toast(`Sincronia falhou: ${r.error}`, 'error');
      return r;
    }

    let novos = 0;
    for (const pacote of r.pacotes) {
      const res = ctx.commit((s) => ingestPack(s, pacote), { silent: true });
      if (res?.ingested) novos += 1;
    }
    anotarNaConfig({
      ultimaSincronia: new Date().toISOString(),
      ultimoErro: r.recusados.length ? `pacote de ${r.recusados[0].date} recusado: ${r.recusados[0].errors[0]}` : null,
      erroDoComputador: r.errosDoComputador[0] || null,
      digests: r.digests,
    });

    if (novos) {
      ctx.toast(`${novos} pacote(s) novo(s) do computador carregado(s).`, 'success');
    } else if (r.errosDoComputador.length) {
      ctx.toast(`O computador tentou gerar o pacote e falhou: ${r.errosDoComputador[0].erro}`, 'error');
    } else if (!automatico) {
      ctx.toast(r.pedidos.length
        ? 'Sincronizado. Pedido enviado: o computador gera na próxima rodada (a cada 30 min, das 5h às 23h).'
        : 'Sincronizado. Nada novo.', 'success');
    }
    if (r.recusados.length && !automatico) {
      ctx.toast(`Pacote de ${r.recusados[0].date} recusado pela validação.`, 'error');
    }
    if (novos || !automatico) ctx.render();
    return r;
  })();
  try {
    return await emAndamento;
  } finally {
    emAndamento = null;
  }
}

function quando(iso) {
  if (!iso) return 'nunca';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function cartaoCaixa(ctx) {
  const cfg = lerConfigCaixa();
  let repoDigitado = cfg?.repo || '';
  let tokenDigitado = '';

  const status = cfg
    ? h('div', { class: 'hint' },
        h('div', {}, `Repositório: ${cfg.repo} · token ${mascararChave(cfg.token)}`),
        h('div', {}, `Última sincronia: ${quando(cfg.ultimaSincronia)}`),
        cfg.ultimoErro ? h('div', { class: 'banner banner-error' }, `Último problema: ${cfg.ultimoErro}`) : null,
        cfg.erroDoComputador
          ? h('div', { class: 'banner banner-error' },
              `O computador falhou ao gerar o pacote de ${cfg.erroDoComputador.date} ` +
              `(${cfg.erroDoComputador.tentativas} tentativa(s)): ${cfg.erroDoComputador.erro}`)
          : null)
    : h('div', { class: 'hint' }, 'Não configurado neste aparelho.');

  return card('Receber pacotes do computador (plano do Claude)',
    h('p', { class: 'hint' },
      'O computador gera o pacote do dia pelo seu plano do Claude (sem chave de API e sem custo extra) ' +
      'e o entrega por um repositório PRIVADO do GitHub. Este aparelho envia o pedido e busca o pacote ' +
      'sozinho ao abrir o app, de qualquer lugar com internet.'),
    h('p', { class: 'hint' },
      'O que vai ao GitHub: o mesmo resumo que vai ao modelo (nível, itens errados, temas fracos, palavras ' +
      'devidas e, se ativado, as lacunas das conversas). Histórico completo, cartões e gravações não saem ' +
      'do aparelho. O token fica só neste navegador e não entra no arquivo exportado.'),
    status,
    field('Repositório privado',
      h('input', {
        type: 'text', value: repoDigitado, placeholder: 'Lucas-023/mandarim-dados', autocomplete: 'off',
        autocapitalize: 'off', spellcheck: 'false',
        onInput: (e) => { repoDigitado = e.target.value; },
      }),
      'Formato dono/nome. Precisa ser privado — repositório público é recusado.'),
    field('Token do GitHub',
      h('input', {
        type: 'password', placeholder: cfg ? '(mantém o atual se ficar em branco)' : 'github_pat_…', autocomplete: 'off',
        onInput: (e) => { tokenDigitado = e.target.value.trim(); },
      }),
      'Token "fine-grained" com acesso SÓ a este repositório e permissão "Contents: Read and write".'),
    h('div', { class: 'actions' },
      button('Guardar e testar', async () => {
        const repo = normalizarRepo(repoDigitado);
        const token = tokenDigitado || cfg?.token;
        if (!repo) return ctx.toast('Repositório inválido. Use o formato dono/nome.', 'error');
        if (!token) return ctx.toast('Cole o token do GitHub.', 'error');
        ctx.toast('Testando o acesso ao repositório…', 'info');
        const teste = await testarCaixa(clienteGitHub({ repo, token }));
        if (!teste.ok) return ctx.toast(`Não deu: ${teste.error}`, 'error');
        gravarConfigCaixa({ repo, token });
        ctx.toast(`Acesso confirmado a ${teste.nome}. Sincronizando…`, 'success');
        await sincronizarCaixa(ctx);
        ctx.render();
      }),
      cfg ? button('Sincronizar agora', () => sincronizarCaixa(ctx), { kind: 'secondary' }) : null,
      cfg
        ? button('Desligar neste aparelho', () => {
            if (!confirm('Apagar o token e parar de receber pacotes do computador neste aparelho?')) return;
            gravarConfigCaixa(null);
            ctx.toast('Caixa postal desligada neste aparelho. Revogue o token no GitHub se não for mais usar.', 'success');
            ctx.render();
          }, { kind: 'danger' })
        : null),
    h('p', { class: 'hint' },
      'No computador, uma vez: ', h('code', {}, 'npm run caixa -- --repo=git@github.com:SEU-USUARIO/mandarim-dados.git'),
      ' e depois ', h('code', {}, 'npm run caixa:timer'),
      ' (confere a caixa a cada 30 min, das 5h às 23h). O passo a passo completo está no README.'));
}
