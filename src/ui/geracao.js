/**
 * Geração do pacote no próprio aparelho (celular sem computador).
 *
 * Usa o mesmo briefing, o mesmo prompt e o mesmo validador do computador — a
 * única diferença é quem fala com o modelo: aqui é o navegador, com a chave
 * guardada no aparelho.
 */
import { h, button } from './dom.js';
import { buildBriefing } from '../core/briefing.js';
import { gerarPacote } from '../core/packPipeline.js';
import { chamarModelo, MODELO_PADRAO } from '../core/llmBrowser.js';
import { lerChaveApi } from '../core/secrets.js';
import { ingestPack, isIngested } from '../core/packs.js';
import { dayKey } from '../core/xp.js';

/** Pode gerar aqui mesmo? (sem servidor, mas com chave no aparelho) */
export function podeGerarNoAparelho(ctx) {
  return ctx.store.mode !== 'server' && Boolean(lerChaveApi());
}

/** Painel fixo de progresso: a geração leva minutos e não pode parecer travada. */
function abrirPainel() {
  const titulo = h('strong', {}, 'Gerando o pacote do dia…');
  const fase = h('div', { class: 'hint' }, 'Montando o briefing a partir do seu desempenho.');
  const previa = h('pre', { class: 'previa' });
  const painel = h('div', { class: 'painel-progresso' }, titulo, fase, previa);
  document.body.append(painel);
  return {
    painel,
    diz: (texto) => {
      fase.textContent = texto;
    },
    mostra: (texto) => {
      // Mostra o fim do que já chegou, para dar sinal de vida.
      previa.textContent = String(texto).slice(-320);
    },
    fecha: () => painel.remove(),
  };
}

/**
 * Gera e ingere o pacote. Devolve { ok, pack, error }.
 */
export async function gerarNoAparelho(ctx, { date = dayKey(), force = false, model = null } = {}) {
  const { state } = ctx;
  const apiKey = lerChaveApi();
  if (!apiKey) {
    ctx.toast('Nenhuma chave da Claude API guardada neste aparelho (Configurações).', 'error');
    return { ok: false, error: 'sem chave' };
  }
  if (!force && isIngested(state, date)) {
    ctx.toast(`O pacote de ${date} já está carregado.`, 'info');
    return { ok: false, error: 'já existe' };
  }

  const cfg = state.settings.llm || {};
  const briefing = buildBriefing(state, { date, includeGaps: cfg.sendGaps !== false, recentPacks: (state.packs || []).map((p) => p.pack) });
  const painel = abrirPainel();

  try {
    const resultado = await gerarPacote({
      briefing,
      retries: 1,
      chamar: ({ system, user, tentativa }) => {
        painel.diz(tentativa === 1
          ? 'Falando com o modelo. Pode levar de 1 a 3 minutos — pode deixar a tela ligada.'
          : 'O conteúdo não passou na validação; pedindo correção ao modelo.');
        return chamarModelo({
          system,
          user,
          apiKey,
          model: model || cfg.model || MODELO_PADRAO,
          onTexto: (parcial) => painel.mostra(parcial),
        });
      },
      onProgresso: (evento) => {
        if (evento.fase === 'recebido') painel.diz(`Resposta recebida (${evento.caracteres} caracteres). Validando…`);
        if (evento.fase === 'recusado') painel.diz(`Recusado pela validação: ${evento.erros[0] || 'motivo desconhecido'}`);
        if (evento.fase === 'validado') painel.diz('Pacote válido. Carregando no app…');
      },
    });

    if (!resultado.ok) {
      painel.fecha();
      ctx.toast(`O pacote não passou na validação: ${resultado.errors[0] || 'motivo desconhecido'}`, 'error');
      console.warn('Erros de validação:', resultado.errors, resultado.raw?.slice(0, 2000));
      return { ok: false, error: resultado.errors[0] };
    }

    const ingestao = ctx.commit((s) => ingestPack(s, resultado.pack), { silent: true });
    painel.fecha();
    const custo = resultado.pack.provenance.costUsd;
    ctx.toast(
      `Pacote de ${date} pronto: ${resultado.pack.vocab.length} palavras, ` +
      `${resultado.pack.exercises.length} exercícios` +
      `${custo != null ? ` · custo ~US$ ${custo.toFixed(3)}` : ''}.`,
      'success',
    );
    ctx.go('pack', { date });
    ctx.render();
    return { ok: true, pack: resultado.pack, ingestao };
  } catch (err) {
    painel.fecha();
    ctx.toast(`Falha na geração: ${err.message}`, 'error');
    return { ok: false, error: err.message };
  }
}

/** Botão pronto para as telas que oferecem geração. */
export function botaoGerar(ctx, { force = false, label = null } = {}) {
  return button(label || (force ? 'Gerar de novo neste aparelho' : 'Gerar o pacote de hoje aqui'),
    () => gerarNoAparelho(ctx, { force }),
    { kind: force ? 'ghost' : 'primary' });
}
