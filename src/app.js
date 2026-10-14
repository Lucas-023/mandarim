/**
 * Mandarin Quest — bootstrap, roteador e contexto compartilhado da interface.
 */
import { Store, localStorageBackend, memoryBackend, STORAGE_KEY } from './core/storage.js';
import { probeServer, fetchState, serverBackend, fetchPack, detectarEstadoOrfao } from './core/serverStore.js';
import {
  temIndexedDB, abrirBanco, carregarEstado, idbBackend, pedirArmazenamentoPersistente,
} from './core/idbStore.js';
import { restoreLexicon, ingestPack, isIngested } from './core/packs.js';
import { activeSession, sessionProgress, describeSession, clearSession } from './core/session.js';
import { validatePack } from './core/packValidation.js';
import { dayKey, maybeAwardDailyBonus } from './core/xp.js';
import { evaluateAchievements } from './core/achievements.js';
import { h, clear } from './ui/dom.js';

import { renderDashboard } from './ui/dashboard.js';
import { renderOnboarding } from './ui/onboarding.js';
import { renderPlacement } from './ui/placement.js';
import { renderStudy } from './ui/study.js';
import { renderCards } from './ui/cards.js';
import { renderActivities } from './ui/activities.js';
import { renderHistory } from './ui/history.js';
import { renderSettings } from './ui/settings.js';
import { renderPack } from './ui/pack.js';
import { renderBaralho } from './ui/baralho.js';
import { sincronizarCartoes, precisaSincronizar } from './core/baralho.js';
import { sincronizarCaixa, agendarEnvio, descarregarEnvio } from './ui/caixa.js';

const VIEWS = {
  dashboard: { label: 'Painel', render: renderDashboard },
  study: { label: 'Estudar', render: renderStudy },
  deck: { label: 'Baralho', render: renderBaralho },
  cards: { label: 'Criar cartões', render: renderCards },
  activities: { label: 'Registrar', render: renderActivities },
  history: { label: 'Histórico', render: renderHistory },
  settings: { label: 'Configurações', render: renderSettings },
  pack: { label: 'Pacote do dia', render: renderPack },
  placement: { label: 'Nivelamento', render: renderPlacement, hidden: true },
  onboarding: { label: 'Início', render: renderOnboarding, hidden: true },
};

/**
 * Escolhe onde o estado mora, em ordem de preferência:
 *
 *  1. servidor local (data/state.json) — quando o app é aberto pelo computador
 *     com `npm start`. É o único modo em que a geração diária automática roda.
 *  2. IndexedDB do aparelho — o modo do celular (e de qualquer navegador sem
 *     servidor). Cota grande, guarda áudio e sobrevive a fechar tudo.
 *  3. localStorage — último recurso em navegador antigo.
 *  4. memória — nada é salvo; a interface avisa em vermelho.
 *
 * Ao usar o IndexedDB pela primeira vez, o que estiver no localStorage é
 * migrado, para ninguém perder o que estudou antes da mudança.
 */
async function createStore() {
  const probe = await probeServer();
  if (probe.available) {
    try {
      const initialRaw = await fetchState();
      const backend = serverBackend({
        initialRaw,
        onError: (err) => toast(`Falha ao salvar no servidor: ${err.message}`, 'error'),
      });
      const store = new Store(backend);
      store.mode = 'server';
      store.orfao = detectarEstadoOrfao({ servidorRaw: initialRaw });
      registrarDescarga(backend);
      return store;
    } catch (err) {
      console.warn('Servidor respondeu, mas o estado não pôde ser lido:', err);
    }
  }

  if (temIndexedDB()) {
    try {
      const db = await abrirBanco();
      let initialRaw = await carregarEstado(db);
      let migrado = false;
      if (!initialRaw) {
        // Primeira vez no IndexedDB: traz o que estiver no localStorage.
        try {
          const antigo = globalThis.localStorage?.getItem(STORAGE_KEY);
          if (antigo) {
            initialRaw = antigo;
            migrado = true;
          }
        } catch { /* localStorage bloqueado: nada a migrar */ }
      }
      const backend = idbBackend({
        db,
        initialRaw,
        onError: (err) => toast(`Falha ao salvar no aparelho: ${err.message}`, 'error'),
      });
      const store = new Store(backend);
      store.mode = 'device';
      store.db = db;
      store.migradoDoLocalStorage = migrado;
      if (migrado) backend.write(initialRaw);
      registrarDescarga(backend);
      // Pede ao navegador para tratar estes dados como permanentes.
      pedirArmazenamentoPersistente().then((r) => {
        store.persistente = r.ok;
      });
      return store;
    } catch (err) {
      console.warn('IndexedDB indisponível, caindo para localStorage:', err);
    }
  }

  try {
    const store = new Store(localStorageBackend());
    store.mode = 'local';
    store.serverReason = probe.reason || null;
    return store;
  } catch (err) {
    console.warn('Sem armazenamento: os dados desta sessão NÃO serão salvos.', err);
    const store = new Store(memoryBackend());
    store.mode = 'memory';
    store.volatile = true;
    return store;
  }
}

/**
 * Força a gravação quando a aba perde o foco ou é fechada.
 * 'visibilitychange' e 'pagehide' são os eventos confiáveis no celular;
 * 'beforeunload' não dispara em parte dos navegadores móveis.
 */
function registrarDescarga(backend) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') backend.flushNow();
  });
  window.addEventListener('pagehide', () => backend.flushNow());
  window.addEventListener('beforeunload', () => backend.flushNow());
}

let store;
let current = { view: 'dashboard', params: {} };
/** Estado efêmero da UI (exercício em andamento, rascunhos gerados etc.). */
const ui = {};

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [view, query] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  return { view: VIEWS[view] ? view : 'dashboard', params };
}

function go(view, params = {}) {
  const query = new URLSearchParams(params).toString();
  location.hash = `#/${view}${query ? `?${query}` : ''}`;
}

function toast(message, kind = 'info') {
  const host = document.getElementById('toasts');
  const el = h('div', { class: `toast toast-${kind}`, role: 'status' }, message);
  host.append(el);
  setTimeout(() => el.classList.add('toast-out'), 4000);
  setTimeout(() => el.remove(), 4600);
}

/**
 * Aplica uma mutação ao estado: avalia conquistas, verifica o bônus diário,
 * persiste e redesenha. Toda escrita da UI passa por aqui.
 */
function commit(mutator, { silent = false } = {}) {
  const result = mutator(store.state);
  const fresh = evaluateAchievements(store.state);
  maybeAwardDailyBonus(store.state);
  const saved = store.save();
  if (!saved) toast('Não foi possível salvar os dados neste navegador.', 'error');
  for (const a of fresh) toast(`Conquista desbloqueada: ${a.title}`, 'success');
  // Exercício pela metade não muda o briefing (a correção é no fim): só agenda fora dele.
  if (!activeSession(store.state)) agendarEnvio(ctx);
  if (!silent) render();
  return result;
}

function ctx() {
  return { state: store.state, store, go, toast, commit, ui, params: current.params, render };
}

function renderNav() {
  const nav = document.getElementById('nav');
  clear(nav);
  for (const [key, def] of Object.entries(VIEWS)) {
    if (def.hidden) continue;
    nav.append(
      h('button', {
        class: `nav-item${current.view === key ? ' active' : ''}`,
        onClick: () => go(key),
      }, def.label),
    );
  }
}

function render() {
  const main = document.getElementById('view');
  const state = store.state;
  ui.keyHandler = null;

  // Onboarding é obrigatório antes de qualquer outra tela, exceto Configurações:
  // num aparelho novo é lá que se cola a chave ou se restaura um backup.
  if (!state.profile.onboardingDone && !['onboarding', 'settings'].includes(current.view)) {
    current = { view: 'onboarding', params: {} };
    location.hash = '#/onboarding';
  }

  renderNav();
  clear(main);
  const banners = document.getElementById('banners');
  clear(banners);
  if (store.volatile) {
    banners.append(h('div', { class: 'banner banner-error' },
      'Este navegador bloqueou o armazenamento local: nada será salvo ao fechar a página.'));
  }
  if (store.mode === 'local') {
    banners.append(h('div', { class: 'banner' },
      'Este navegador não tem IndexedDB: os dados ficam no armazenamento simples, com cota pequena. ',
      h('span', { class: 'hint' }, 'Exporte uma cópia de vez em quando (Configurações → Privacidade e dados).')));
  }
  if (store.migradoDoLocalStorage && !ui.migracaoAvisada) {
    ui.migracaoAvisada = true;
    toast('Seus dados anteriores do navegador foram migrados para o armazenamento do aparelho.', 'success');
  }
  if (store.orfao?.encontrado && !ui.orfaoDispensado) {
    banners.append(h('div', { class: 'banner' },
      `Encontrei dados guardados no navegador deste computador (${store.orfao.resumo}) — ` +
      'provavelmente de um dia em que o app foi aberto sem o servidor. ',
      h('button', {
        class: 'link',
        onClick: () => {
          if (!confirm('Substituir o estado atual pelos dados que estavam no navegador?')) return;
          try {
            store.state = JSON.parse(store.orfao.raw);
            restoreLexicon(store.state);
            store.save();
            ui.orfaoDispensado = true;
            toast('Dados do navegador importados para o arquivo do servidor.', 'success');
            render();
          } catch (err) {
            toast(`Falha ao importar: ${err.message}`, 'error');
          }
        },
      }, 'Importar para cá'),
      ' · ',
      h('button', {
        class: 'link',
        onClick: () => {
          ui.orfaoDispensado = true;
          render();
        },
      }, 'Ignorar')));
  }

  const sessao = activeSession(state);
  if (sessao && current.view !== 'study') {
    const p = sessionProgress(sessao);
    banners.append(h('div', { class: 'banner' },
      `Exercício em andamento: ${describeSession(sessao)}. Suas respostas estão salvas. `,
      h('button', { class: 'link', onClick: () => go('study') }, 'Retomar'),
      ' · ',
      h('button', {
        class: 'link',
        onClick: () => {
          commit((s) => clearSession(s));
          toast(`Sessão descartada (${p.answered} resposta(s) não corrigidas).`, 'info');
        },
      }, 'Descartar')));
  }
  if (state.demo) {
    banners.append(h('div', { class: 'banner' },
      'Você está vendo DADOS DE DEMONSTRAÇÃO fictícios. Apague tudo em Configurações para começar de verdade.'));
  }
  if (state.profile.onboardingDone && !state.profile.placementDone && current.view !== 'placement') {
    banners.append(h('div', { class: 'banner' },
      'Você ainda não concluiu o nivelamento. Até lá, as habilidades aparecem como não avaliadas. ',
      h('button', { class: 'link', onClick: () => go('placement') }, 'Fazer agora')));
  }

  try {
    main.append(VIEWS[current.view].render(ctx()));
  } catch (err) {
    console.error(err);
    main.append(h('div', { class: 'banner banner-error' }, `Erro ao desenhar a tela: ${err.message}`));
  }
  document.title = `Mandarin Quest — ${VIEWS[current.view].label}`;
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', () => {
  current = parseHash();
  render();
});

/**
 * Teclado: cada tela que quer atalhos define ui.keyHandler no render.
 * Um único ouvinte global evita acumular listeners a cada redesenho.
 */
document.addEventListener('keydown', (event) => {
  if (!ui.keyHandler) return;
  const alvo = event.target;
  const digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable);
  // Em campo de texto, só atalhos com modificador ou Escape passam.
  if (digitando && !event.ctrlKey && !event.metaKey && event.key !== 'Escape') return;
  try {
    ui.keyHandler(event);
  } catch (err) {
    console.error('Erro no atalho de teclado:', err);
  }
});

/**
 * Ingere o pacote do dia, se houver um no servidor e ainda não tiver entrado.
 * O pacote é revalidado no cliente: o gerador já valida, mas o arquivo pode ter
 * sido editado à mão depois.
 */
async function syncTodayPack() {
  if (store.mode !== 'server') return;
  const today = dayKey();
  if (isIngested(store.state, today)) return;
  let pack;
  try {
    pack = await fetchPack(today);
  } catch (err) {
    console.warn('Não foi possível buscar o pacote do dia:', err);
    return;
  }
  if (!pack) return;
  const check = validatePack(pack);
  if (!check.ok) {
    toast(`O pacote de ${today} foi recusado pela validação (${check.errors.length} problema(s)).`, 'error');
    console.warn('Pacote inválido:', check.errors);
    return;
  }
  const result = commit((s) => ingestPack(s, pack), { silent: true });
  if (result.ingested) {
    toast(
      `Pacote de hoje carregado: ${pack.vocab.length} palavras, ${pack.exercises.length} exercícios. ` +
      `${result.draftsAdded.length} cartão(ões) aguardando revisão.`,
      'success',
    );
    render();
  }
}

/**
 * Registra o service worker, que é o que permite abrir o app offline no celular.
 *
 * Só em contexto seguro (HTTPS) e fora do localhost: durante o desenvolvimento
 * um cache agressivo só atrapalharia, e por HTTP simples na rede local o próprio
 * navegador recusa o registro.
 */
async function registrarServiceWorker() {
  const local = /^(127\.|localhost$|0\.0\.0\.0$|\[::1\]$)/.test(location.hostname);
  if (!globalThis.isSecureContext || local || !navigator.serviceWorker) return;
  try {
    const registro = await navigator.serviceWorker.register('sw.js');
    registro.addEventListener('updatefound', () => {
      toast('Nova versão do app baixada. Ela entra no próximo abrir.', 'info');
    });
  } catch (err) {
    console.warn('Service worker não registrado:', err);
  }
}

(async () => {
  store = await createStore();
  restoreLexicon(store.state);
  // Cartões aprovados antes de o baralho existir entram nele já na abertura.
  if (precisaSincronizar(store.state)) commit((s) => sincronizarCartoes(s), { silent: true });
  current = parseHash();
  render();
  syncTodayPack();
  sincronizarCaixa(ctx(), { automatico: true });
  // No iPhone o app instalado volta do fundo sem recarregar: sincroniza ao reaparecer.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sincronizarCaixa(ctx(), { automatico: true });
    // Saindo da tela: manda já o que estava esperando (o iOS congela o app logo depois).
    else descarregarEnvio();
  });
  window.addEventListener('pagehide', () => descarregarEnvio());
  registrarServiceWorker();
})();
