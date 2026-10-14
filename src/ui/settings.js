/** Configurações: objetivos, tempo, idioma, integrações e privacidade. */
import { h, card, button, field, select, downloadText } from './dom.js';
import { GOAL_LABELS } from './onboarding.js';
import { DEFAULT_XP_RULES, XP_LABELS, xpRules } from '../core/xp.js';
import { suggestedDailyXp } from '../core/plan.js';
import { buildDemoState } from '../core/demoData.js';
import { migrate, SCHEMA_VERSION } from '../core/storage.js';
import { mergeStates, descreverMesclagem } from '../core/merge.js';
import { restoreLexicon } from '../core/packs.js';
import { lerChaveApi, gravarChaveApi, mascararChave } from '../core/secrets.js';
import { verificarChave, MODELO_PADRAO } from '../core/llmBrowser.js';
import { espacoEmDisco, pedirArmazenamentoPersistente } from '../core/idbStore.js';
import { gerarNoAparelho } from './geracao.js';
import { cartaoCaixa } from './caixa.js';

export function renderSettings(ctx) {
  const { state, commit } = ctx;
  const wrap = h('div', { class: 'stack' });

  // --- Objetivos ---
  const goals = [...state.profile.goals];
  const goalsCard = card('Objetivos e prioridades');
  const list = h('ol', { class: 'goal-list' });
  const paint = () => {
    list.replaceChildren(...goals.map((g, i) => h('li', {},
      h('span', {}, GOAL_LABELS[g.id] || g.id),
      h('span', { class: 'row-actions' },
        button('↑', () => {
          if (i > 0) {
            [goals[i - 1], goals[i]] = [goals[i], goals[i - 1]];
            paint();
          }
        }, { kind: 'ghost' }),
        button('↓', () => {
          if (i < goals.length - 1) {
            [goals[i + 1], goals[i]] = [goals[i], goals[i + 1]];
            paint();
          }
        }, { kind: 'ghost' })))));
  };
  paint();
  goalsCard.append(list, h('div', { class: 'actions' },
    button('Salvar prioridades', () => {
      commit((s) => {
        s.profile.goals = goals.map((g, i) => ({ id: g.id, priority: i + 1 }));
      });
      ctx.toast('Prioridades salvas.', 'success');
    })));
  wrap.append(goalsCard);

  // --- Estudo ---
  let minutes = state.profile.minutesPerDay;
  let dailyXp = state.settings.dailyGoalXp;
  wrap.append(card('Tempo e metas',
    field('Minutos disponíveis por dia',
      h('input', { type: 'number', min: 5, max: 240, value: minutes, onInput: (e) => (minutes = Number(e.target.value)) })),
    field('Meta diária de XP',
      h('input', { type: 'number', min: 10, max: 500, value: dailyXp, onInput: (e) => (dailyXp = Number(e.target.value)) }),
      `Sugestão para o tempo informado: ${suggestedDailyXp(state.profile.minutesPerDay)} XP.`),
    h('div', { class: 'actions' },
      button('Salvar', () => {
        commit((s) => {
          s.profile.minutesPerDay = minutes;
          s.settings.dailyGoalXp = dailyXp;
        });
        ctx.toast('Metas atualizadas.', 'success');
      }),
      button('Usar a sugestão', () => {
        commit((s) => {
          s.settings.dailyGoalXp = suggestedDailyXp(s.profile.minutesPerDay);
        });
        ctx.toast('Meta ajustada pela sugestão.', 'success');
      }, { kind: 'ghost' }))));

  // --- Idioma e apoio ---
  wrap.append(card('Idioma e apresentação',
    field('Idioma das explicações',
      select([{ value: 'pt', label: 'Português (implementado)' }], state.settings.language, () => {}),
      'Apenas português está implementado nesta versão.'),
    field('Escrita chinesa',
      select([{ value: 'simplified', label: 'Chinês simplificado (implementado)' }], state.settings.script, () => {}),
      'Tradicional não está implementado.'),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', checked: state.settings.pinyinByDefault,
        onChange: (e) => commit((s) => {
          s.settings.pinyinByDefault = e.target.checked;
        }),
      }),
      ' Mostrar pinyin por padrão nos cartões gerados'),
    h('p', { class: 'hint' },
      'Nos exercícios e no nivelamento o pinyin fica escondido até você pedir, e o apoio usado é registrado ' +
      'para não inflar a estimativa de proficiência.')));

  // --- XP ---
  const rules = xpRules(state);
  const inputs = {};
  const xpCard = card('Regras de XP');
  xpCard.append(h('p', { class: 'hint' }, 'XP mede atividade e consistência. Mudar estes valores não altera proficiência.'));
  for (const [type, value] of Object.entries(DEFAULT_XP_RULES)) {
    inputs[type] = h('input', { type: 'number', min: 0, max: 500, value: rules[type] });
    xpCard.append(field(XP_LABELS[type] || type, inputs[type], `Padrão: ${value}`));
  }
  xpCard.append(h('div', { class: 'actions' },
    button('Salvar regras', () => {
      commit((s) => {
        s.settings.xpRules = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, Number(el.value)]));
      });
      ctx.toast('Regras de XP salvas.', 'success');
    }),
    button('Restaurar padrões', () => {
      commit((s) => {
        s.settings.xpRules = null;
      });
      ctx.toast('Regras restauradas.', 'success');
    }, { kind: 'ghost' })));
  wrap.append(xpCard);

  // --- Integrações ---
  let url = state.settings.ankiConnectUrl;
  let deck = state.settings.ankiDeck;
  let model = state.settings.ankiModel;
  wrap.append(card('Integração com o Anki',
    h('p', { class: 'hint' },
      'A exportação de arquivo TSV/CSV funciona sempre. O AnkiConnect depende do Anki Desktop aberto nesta ' +
      'máquina com o add-on instalado — teste a conexão na aba "Exportar" de "Criar cartões".'),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', checked: state.settings.usesAnki,
        onChange: (e) => commit((s) => {
          s.settings.usesAnki = e.target.checked;
        }),
      }),
      ' Eu uso o Anki'),
    h('div', { class: 'grid-2' },
      field('Endereço do AnkiConnect', h('input', { type: 'text', value: url, onInput: (e) => (url = e.target.value) })),
      field('Baralho padrão', h('input', { type: 'text', value: deck, onInput: (e) => (deck = e.target.value) })),
      field('Modelo de nota padrão', h('input', { type: 'text', value: model, onInput: (e) => (model = e.target.value) }))),
    h('div', { class: 'actions' },
      button('Salvar integração', () => {
        commit((s) => {
          s.settings.ankiConnectUrl = url;
          s.settings.ankiDeck = deck;
          s.settings.ankiModel = model;
        });
        ctx.toast('Configuração do Anki salva.', 'success');
      }))));

  // --- Geração por LLM ---
  const llm = { ...(state.settings.llm || {}) };
  wrap.append(card('Geração automática de conteúdo (LLM)',
    h('p', { class: 'hint' },
      'Um pacote por dia — vocabulário, diálogo, exercícios, frases de campo — gerado a partir dos ' +
      'seus erros recentes e das lacunas das suas conversas. O conteúdo é validado contra um schema ' +
      'antes de entrar no app, e os cartões continuam exigindo sua aprovação.'),
    h('div', { class: 'callout' },
      h('strong', {}, 'O que sai da sua máquina: '),
      'nível estimado, pontuações por habilidade, itens que você errou, temas fracos, expressões novas ' +
      'anotadas, o texto de "o que não consegui dizer" e a lista de palavras já conhecidas. ' +
      'Seu nome, o histórico completo e o conteúdo dos seus cartões não são enviados. ',
      'Cada briefing enviado fica salvo em ', h('code', {}, 'data/outbox/'), ' para auditoria.'),
    field('Backend',
      select([
        { value: 'claude-code', label: 'Claude Code headless (padrão — usa sua assinatura, sem chave de API)' },
        { value: 'api', label: 'Claude API via SDK oficial (precisa de npm install e credencial)' },
        { value: 'mock', label: 'Falso/local (pacote de exemplo, sem chamar modelo)' },
      ], llm.backend || 'claude-code', (v) => { llm.backend = v; }),
      'O backend "api" não foi testado nesta instalação: ele exige `npm install @anthropic-ai/sdk` e ANTHROPIC_API_KEY.'),
    field('Modelo (opcional)',
      h('input', { type: 'text', value: llm.model || '', placeholder: 'ex.: claude-opus-5-5',
        onInput: (e) => { llm.model = e.target.value.trim() || null; } }),
      'Em branco usa o padrão do backend. Modelos mais baratos existem (claude-sonnet-5-5, claude-haiku-5-5); a escolha é sua.'),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: llm.sendGaps !== false,
        onChange: (e) => { llm.sendGaps = e.target.checked; } }),
      ' Enviar o texto das lacunas de conversa (é o que mais personaliza o pacote)'),
    h('div', { class: 'actions' },
      button('Salvar preferências de geração', () => {
        commit((s) => { s.settings.llm = llm; });
        ctx.toast('Preferências de geração salvas.', 'success');
      }),
      button('Abrir o pacote do dia', () => ctx.go('pack'), { kind: 'secondary' })),
    h('h4', {}, 'Rodar todo dia automaticamente'),
    h('p', { class: 'hint' },
      'A geração precisa do servidor local (npm start), porque é ele que mantém o estado em arquivo. ' +
      'Para instalar o temporizador diário das 5h:'),
    h('p', {}, h('code', {}, 'bash scripts/instalar-timer.sh')),
    h('p', { class: 'hint' },
      'Custo observado por pacote no backend claude-code: cerca de US$ 0,40 a 0,90 por dia, debitado do ' +
      'uso da sua assinatura do Claude Code. Rode `node tools/generate.js --dry-run` para ver o prompt ' +
      'exato sem gastar nada.'),
  ));

  // --- Pacotes vindos do computador (plano do Claude), sem chave no aparelho ---
  if (ctx.store.mode !== 'server') wrap.append(cartaoCaixa(ctx));

  // --- Geração no próprio aparelho ---
  const chaveAtual = lerChaveApi();
  let chaveDigitada = '';
  const estadoChave = h('div', { class: 'hint' },
    chaveAtual
      ? `Chave guardada neste aparelho: ${mascararChave(chaveAtual)}`
      : 'Nenhuma chave guardada neste aparelho.');

  wrap.append(card('Gerar neste aparelho (sem computador)',
    h('p', { class: 'hint' },
      'Com uma chave da Claude API guardada aqui, este aparelho gera o pacote do dia sozinho — ' +
      'é o que faz o celular funcionar sem o computador ligado. O briefing, o prompt e a validação ' +
      'são os mesmos do computador.'),
    h('div', { class: 'banner banner-error' },
      h('strong', {}, 'Leia antes: '),
      'a chave fica no armazenamento deste navegador. Quem tiver acesso ao aparelho pode lê-la. ',
      'Use uma chave dedicada a este app, com limite de gasto definido no console da Anthropic, e ',
      'revogue-a se perder o aparelho. A chave NÃO entra no arquivo exportado e NÃO é sincronizada ',
      'entre aparelhos — cada um tem a sua.'),
    estadoChave,
    field('Chave da Claude API',
      h('input', {
        type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off',
        onInput: (e) => { chaveDigitada = e.target.value.trim(); },
      }),
      'Criada em console.anthropic.com. Começa com "sk-ant-".'),
    field('Modelo',
      h('input', {
        type: 'text', value: state.settings.llm?.model || '', placeholder: MODELO_PADRAO,
        onInput: (e) => { llm.model = e.target.value.trim() || null; },
      }),
      `Em branco usa ${MODELO_PADRAO}. Modelos mais baratos: claude-sonnet-5-5, claude-haiku-5-5.`),
    h('div', { class: 'actions' },
      button('Guardar e testar a chave', async () => {
        if (!chaveDigitada) {
          ctx.toast('Digite a chave antes.', 'error');
          return;
        }
        ctx.toast('Testando a chave na Claude API…', 'info');
        const res = await verificarChave(chaveDigitada);
        if (!res.ok) {
          ctx.toast(`Chave não aceita: ${res.error}`, 'error');
          return;
        }
        gravarChaveApi(chaveDigitada);
        ctx.toast(`Chave válida e guardada. ${res.modelos.length} modelo(s) disponíveis.`, 'success');
        ctx.render();
      }),
      chaveAtual
        ? button('Gerar o pacote de hoje agora', () => gerarNoAparelho(ctx, { force: false }), { kind: 'secondary' })
        : null,
      chaveAtual
        ? button('Remover a chave deste aparelho', () => {
            if (!confirm('Remover a chave guardada? O aparelho deixa de gerar pacotes sozinho.')) return;
            gravarChaveApi(null);
            ctx.toast('Chave removida deste aparelho.', 'success');
            ctx.render();
          }, { kind: 'danger' })
        : null),
    h('p', { class: 'hint' },
      'Custo por pacote na Claude API, com o modelo padrão: tipicamente alguns centavos de dólar — ' +
      'bem menos que pela assinatura do Claude Code, porque aqui não há o prompt de sistema dele. ' +
      'O valor real de cada geração aparece na procedência do pacote.'),
  ));

  // --- Armazenamento deste aparelho ---
  const infoArmazenamento = h('p', { class: 'hint' }, 'Consultando o navegador…');
  espacoEmDisco().then((info) => {
    infoArmazenamento.textContent = info
      ? `Usado: ${(info.usado / 1048576).toFixed(1)} MB de ${(info.cota / 1048576).toFixed(0)} MB concedidos` +
        `${info.percentual != null ? ` (${info.percentual}%)` : ''}.`
      : 'Este navegador não informa o espaço disponível.';
  });
  wrap.append(card('Armazenamento deste aparelho',
    h('p', { class: 'hint' },
      ctx.store.mode === 'server'
        ? 'Aberto pelo computador: os dados estão em data/state.json, no disco.'
        : ctx.store.mode === 'device'
          ? 'Os dados estão no IndexedDB deste aparelho — é o modo do celular.'
          : 'Armazenamento simples do navegador (cota pequena). Exporte cópias com regularidade.'),
    infoArmazenamento,
    ctx.store.mode === 'device'
      ? h('div', { class: 'actions' },
          button('Pedir armazenamento permanente', async () => {
            const r = await pedirArmazenamentoPersistente();
            ctx.toast(
              r.jaEra ? 'Já estava marcado como permanente.'
                : r.ok ? 'Navegador concedeu armazenamento permanente.'
                  : 'O navegador não concedeu; os dados podem ser descartados se o aparelho ficar sem espaço.',
              r.ok ? 'success' : 'warn',
            );
          }, { kind: 'secondary' }))
      : null,
    h('p', { class: 'hint' },
      'Armazenamento permanente faz o navegador tratar estes dados como do aplicativo, e não como ' +
      'cache descartável. Vale pedir no celular.')));

  // --- Avaliação ---
  wrap.append(card('Avaliação',
    h('p', { class: 'hint' },
      state.placementAttempts.length
        ? `${state.placementAttempts.length} avaliação(ões) registrada(s). Reavaliar a cada 1–2 semanas ajuda a medir evolução.`
        : 'Nenhuma avaliação registrada ainda.'),
    h('div', { class: 'actions' },
      button('Refazer o nivelamento', () => {
        ctx.ui.placementRestart = true;
        ctx.go('placement');
      }, { kind: 'secondary' }),
      state.placementAttempts.length
        ? button('Ver último relatório', () => ctx.go('placement', { report: 'latest' }), { kind: 'ghost' })
        : null)));

  // --- Privacidade ---
  wrap.append(card('Privacidade e dados',
    h('ul', { class: 'tight' },
      h('li', {}, 'Todos os dados ficam no localStorage deste navegador.'),
      h('li', {}, 'Nenhum texto que você cola é enviado para serviços externos: a geração de cartões usa apenas o léxico local.'),
      h('li', {}, 'A única conexão de rede possível é com o AnkiConnect, em 127.0.0.1, e somente quando você clica em testar ou enviar.'),
      h('li', {}, 'Não há chave de API nem serviço de LLM configurado nesta versão.')),
    h('h4', {}, 'Juntar dois aparelhos'),
    h('p', { class: 'hint' },
      'Se você usa o computador e o celular, cada um tem seu próprio histórico. Mesclar junta os ' +
      'dois sem apagar nada: eventos, evidências, cartões e agendamento são unidos; perfil e ' +
      'configurações vêm do lado alterado mais recentemente. Exporte no outro aparelho e carregue ' +
      'o arquivo aqui (e depois faça o contrário, para os dois ficarem iguais).'),
    field('Mesclar com um arquivo exportado',
      h('input', {
        type: 'file', accept: '.json,application/json',
        onChange: async (e) => {
          const arquivo = e.target.files?.[0];
          if (!arquivo) return;
          let recebido;
          try {
            recebido = JSON.parse(await arquivo.text());
          } catch (err) {
            ctx.toast(`Arquivo inválido: ${err.message}`, 'error');
            return;
          }
          if (!recebido || typeof recebido !== 'object' || !('schemaVersion' in recebido)) {
            ctx.toast('Isto não parece um arquivo de dados do Mandarin Quest.', 'error');
            return;
          }
          let resultado;
          try {
            resultado = mergeStates(ctx.store.state, recebido);
          } catch (err) {
            ctx.toast(`Falha ao mesclar: ${err.message}`, 'error');
            return;
          }
          const resumo = descreverMesclagem(resultado.relatorio);
          if (!confirm(`Mesclar agora?\n\n${resumo}\n\nNada é apagado.`)) return;
          ctx.store.state = resultado.state;
          restoreLexicon(ctx.store.state);
          ctx.store.save();
          ctx.toast(resumo, 'success');
          ctx.go('dashboard');
          ctx.render();
        },
      })),
    h('h4', {}, 'Restaurar'),
    h('p', { class: 'hint' },
      'Um arquivo exportado por este app pode ser carregado de volta. O estado atual é substituído, ' +
      'então baixe uma cópia antes se tiver dúvida. No modo servidor, cada gravação já deixa a versão ' +
      'anterior em data/state.backup.json e um instantâneo por dia em data/backups/.'),
    field('Carregar arquivo JSON exportado',
      h('input', {
        type: 'file', accept: '.json,application/json',
        onChange: async (e) => {
          const arquivo = e.target.files?.[0];
          if (!arquivo) return;
          let dados;
          try {
            dados = JSON.parse(await arquivo.text());
          } catch (err) {
            ctx.toast(`Arquivo inválido: ${err.message}`, 'error');
            return;
          }
          if (!dados || typeof dados !== 'object' || !('schemaVersion' in dados)) {
            ctx.toast('Isto não parece um arquivo de dados do Mandarin Quest.', 'error');
            return;
          }
          const resumo =
            `${(dados.xpEvents || []).length} evento(s) de XP, ` +
            `${(dados.cardDrafts || []).length} cartão(ões), ` +
            `${(dados.placementAttempts || []).length} nivelamento(s)`;
          if (!confirm(`Substituir seus dados atuais por este arquivo (${resumo})?`)) return;
          ctx.store.state = migrate(dados);
          restoreLexicon(ctx.store.state);
          ctx.store.save();
          ctx.toast(`Dados restaurados (schema ${SCHEMA_VERSION}).`, 'success');
          ctx.go('dashboard');
          ctx.render();
        },
      })),
    ctx.store.mode === 'server'
      ? h('div', { class: 'actions' },
          button('Restaurar a versão anterior (backup do servidor)', async () => {
            try {
              const res = await fetch('/api/state/backup');
              if (res.status === 404) {
                ctx.toast('Ainda não há backup no servidor.', 'warn');
                return;
              }
              const dados = await res.json();
              if (!confirm('Voltar o estado para a versão anterior salva pelo servidor?')) return;
              ctx.store.state = migrate(dados);
              restoreLexicon(ctx.store.state);
              ctx.store.save();
              ctx.toast('Estado restaurado a partir do backup.', 'success');
              ctx.go('dashboard');
              ctx.render();
            } catch (err) {
              ctx.toast(`Falha ao restaurar: ${err.message}`, 'error');
            }
          }, { kind: 'secondary' }))
      : null,
    h('div', { class: 'actions' },
      button('Baixar meus dados (JSON)', () => {
        downloadText('mandarin-quest-dados.json', ctx.store.exportJson(), 'application/json;charset=utf-8');
      }, { kind: 'secondary' }),
      button('Carregar dados de demonstração (fictícios)', () => {
        if (!confirm('Isto SUBSTITUI seus dados atuais por dados fictícios de demonstração. Continuar?')) return;
        ctx.store.state = buildDemoState();
        ctx.store.save();
        ctx.toast('Dados fictícios carregados. Use "Apagar tudo" para limpar.', 'warn');
        ctx.go('dashboard');
        ctx.render();
      }, { kind: 'ghost' }),
      button('Apagar tudo', () => {
        if (!confirm('Apagar perfil, nivelamentos, XP, cartões e histórico? Esta ação não pode ser desfeita.')) return;
        ctx.store.reset();
        ctx.toast('Todos os dados foram apagados.', 'success');
        ctx.go('onboarding');
        ctx.render();
      }, { kind: 'danger' }))));

  return wrap;
}
