/**
 * Interface da caixa postal: o pacote do dia vem do computador (plano do
 * Claude) por um repositório privado do GitHub. Lógica em core/caixaPostal.js.
 */
import { h, card, button, field } from './dom.js';
import {
  lerConfigCaixa, gravarConfigCaixa, anotarNaConfig, normalizarRepo, repoSugerido,
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
export async function sincronizarCaixa(ctx, { automatico = false, forcar = false } = {}) {
  const cfg = lerConfigCaixa();
  if (!cfg?.repo || !cfg?.token || ctx.store.mode === 'server') return null;
  // Antes do cadastro o briefing seria genérico: pedir pacote não faz sentido.
  if (!ctx.state.profile?.onboardingDone) {
    if (!automatico) ctx.toast('Acesso guardado. Os pedidos começam depois do cadastro inicial.', 'info');
    return null;
  }
  if (automatico && !forcar && cfg.ultimaTentativa && Date.now() - Date.parse(cfg.ultimaTentativa) < INTERVALO_AUTOMATICO_MS) return null;
  if (emAndamento) {
    // Envio forçado durante outra sincronia: espera e manda o estado mais novo.
    if (!forcar) return emAndamento;
    await emAndamento.catch(() => {});
  }

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

/**
 * Envio depois que os dados mudam (fim de exercício, nivelamento, conversa
 * registrada). Espera um pouco para juntar gravações seguidas; se o app sair
 * da tela antes, `descarregarEnvio` manda na hora. Sem isso, quem estuda à
 * noite e fecha o app recebe amanhã um pacote que não viu a última sessão.
 */
const ESPERA_ENVIO_MS = 15 * 1000;
let envioPendente = null;

/** `obterCtx` é função: o envio usa o estado da hora do envio, não o do agendamento. */
export function agendarEnvio(obterCtx) {
  if (!caixaConfigurada()) return;
  clearTimeout(envioPendente?.timer);
  envioPendente = { obterCtx, timer: setTimeout(descarregarEnvio, ESPERA_ENVIO_MS) };
}

export function descarregarEnvio() {
  if (!envioPendente) return null;
  clearTimeout(envioPendente.timer);
  const { obterCtx } = envioPendente;
  envioPendente = null;
  return sincronizarCaixa(obterCtx(), { automatico: true, forcar: true });
}

function quando(iso) {
  if (!iso) return 'nunca';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function cartaoCaixa(ctx) {
  const cfg = lerConfigCaixa();
  // Lê os campos na hora do toque: colar ou preencher automaticamente no iPhone
  // nem sempre dispara o evento de digitação.
  const campoRepo = h('input', {
    type: 'text', value: cfg?.repo || repoSugerido(), placeholder: 'dono/mandarim-dados', autocomplete: 'off',
    autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
  });
  const campoToken = h('input', {
    type: 'password', placeholder: cfg ? '(mantém o atual se ficar em branco)' : 'github_pat_…', autocomplete: 'off',
    autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
  });

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
    field('Repositório privado', campoRepo,
      'Formato dono/nome, ex.: Lucas-023/mandarim-dados. Precisa ser privado — repositório público é recusado.'),
    field('Token do GitHub', campoToken,
      'Token "fine-grained" com acesso SÓ a este repositório e permissão "Contents: Read and write".'),
    h('div', { class: 'actions' },
      button('Guardar e testar', async () => {
        const digitado = campoRepo.value;
        const repo = normalizarRepo(digitado);
        const token = campoToken.value.replace(/\s+/g, '') || cfg?.token;
        if (!repo && /^(github_pat_|ghp_|gho_)/.test(digitado.trim())) {
          campoRepo.value = repoSugerido();
          return ctx.toast('Isso é o token, e foi colado no campo do REPOSITÓRIO. O token vai no segundo ' +
            'campo; no primeiro vai dono/nome, ex.: Lucas-023/mandarim-dados.', 'error');
        }
        if (!repo) {
          return ctx.toast(digitado.trim()
            ? `Não reconheci "${digitado.trim()}" como repositório. Use dono/nome, ex.: Lucas-023/mandarim-dados.`
            : 'O campo do repositório está vazio. Escreva dono/nome, ex.: Lucas-023/mandarim-dados.', 'error');
        }
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
