/**
 * Persistência do Mandarin Quest.
 *
 * O estado inteiro é um único objeto JSON serializável. A camada de
 * armazenamento é injetável para que os testes rodem fora do browser.
 */

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'mandarin-quest:state';

/** Estado inicial — vazio de propósito: nada é estimado antes de haver evidência. */
export function emptyState(now = new Date().toISOString()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    profile: {
      name: '',
      declaredLevel: 'hsk1',
      goals: [
        { id: 'ouvir_cotidiano', priority: 1 },
        { id: 'conversar_simples', priority: 2 },
        { id: 'futebol', priority: 3 },
        { id: 'revisao_consistente', priority: 4 },
        { id: 'corrigir_dificuldades', priority: 5 },
      ],
      minutesPerDay: 20,
      onboardingDone: false,
      placementDone: false,
    },
    settings: {
      language: 'pt',
      script: 'simplified',
      pinyinByDefault: false,
      dailyGoalXp: 50,
      usesAnki: false,
      ankiDeck: 'Mandarin Quest',
      ankiModel: 'Basic',
      ankiConnectUrl: 'http://127.0.0.1:8765',
      xpRules: null, // null = usa os valores padrão de xp.js
      /** Geração de conteúdo por LLM. backend 'claude-code' não precisa de chave de API. */
      llm: { backend: 'claude-code', model: null, sendGaps: true },
    },
    /**
     * Exercício em andamento. Fica no estado (e não só na memória da aba) para
     * que fechar o navegador, recarregar ou derrubar o servidor no meio de uma
     * sessão não perca as respostas já dadas.
     */
    activeSession: null,
    /** Rascunho da tela de cartões: texto colado e sugestões ainda não salvas. */
    workspace: { cardsText: '', suggestions: null },
    /** Pacotes diários gerados por LLM, já validados e ingeridos (os mais recentes). */
    packs: [],
    /** Vocabulário vindo dos pacotes, registrado no léxico a cada carregamento. */
    lexiconExtra: [],
    /** Plano de estudo atual, derivado do último nivelamento. */
    plan: null,
    /** Tentativas de nivelamento concluídas. */
    placementAttempts: [],
    /** Tentativa em andamento (permite pausar e retomar). */
    placementInProgress: null,
    /** Evidências brutas por habilidade. As estimativas são sempre derivadas daqui. */
    skillEvidence: [],
    /** Último retrato lido do Anki (com data), ou null se nunca foi lido. */
    ankiStats: null,
    /** Reavaliações periódicas, com retrato das habilidades em cada uma. */
    assessments: [],
    /** Respostas de exercícios fora do nivelamento. */
    exerciseResults: [],
    xpEvents: [],
    sessions: [],
    conversations: [],
    cardDrafts: [],
    cardExports: [],
    achievements: [],
    dismissedRecommendations: [],
  };
}

/** Backend em memória (testes, ou fallback quando localStorage não existe). */
export function memoryBackend(initialRaw = null) {
  let raw = initialRaw;
  return {
    read: () => raw,
    write: (value) => {
      raw = value;
    },
    clear: () => {
      raw = null;
    },
  };
}

/** Backend localStorage. Lança se o browser bloqueou o armazenamento. */
export function localStorageBackend(key = STORAGE_KEY, storage = globalThis.localStorage) {
  if (!storage) throw new Error('localStorage indisponível neste ambiente');
  return {
    read: () => storage.getItem(key),
    write: (value) => storage.setItem(key, value),
    clear: () => storage.removeItem(key),
  };
}

/**
 * Migra um estado antigo para o schema atual.
 * Hoje só existe a versão 1; a função garante que campos novos nunca
 * fiquem `undefined` em estados salvos por versões anteriores.
 */
export function migrate(state) {
  const base = emptyState(state?.createdAt);
  const merged = { ...base, ...state };
  for (const key of Object.keys(base)) {
    if (merged[key] === undefined || merged[key] === null) {
      if (base[key] !== null) merged[key] = base[key];
    }
  }
  merged.profile = { ...base.profile, ...(state?.profile || {}) };
  merged.settings = { ...base.settings, ...(state?.settings || {}) };
  merged.schemaVersion = SCHEMA_VERSION;
  return merged;
}

export class Store {
  constructor(backend = memoryBackend()) {
    this.backend = backend;
    this.listeners = new Set();
    this.state = this.#read();
  }

  #read() {
    let raw;
    try {
      raw = this.backend.read();
    } catch (err) {
      console.warn('Falha ao ler o armazenamento:', err);
      return emptyState();
    }
    if (!raw) return emptyState();
    try {
      return migrate(JSON.parse(raw));
    } catch (err) {
      console.warn('Estado salvo corrompido; iniciando um estado novo.', err);
      return emptyState();
    }
  }

  /** Aplica uma mutação sobre o estado e persiste. `fn` pode retornar um valor. */
  update(fn) {
    const result = fn(this.state);
    this.save();
    return result;
  }

  save() {
    // Marca quando este aparelho alterou o estado: a mesclagem usa isso para
    // decidir campos que não são listas (perfil, configurações, plano).
    this.state.updatedAt = new Date().toISOString();
    try {
      this.backend.write(JSON.stringify(this.state));
    } catch (err) {
      console.error('Não foi possível salvar o estado:', err);
      this.lastSaveError = err;
      this.#emit();
      return false;
    }
    this.lastSaveError = null;
    this.#emit();
    return true;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  #emit() {
    for (const fn of this.listeners) {
      try {
        fn(this.state);
      } catch (err) {
        console.error('Erro em listener do store:', err);
      }
    }
  }

  /** Apaga todos os dados do usuário (requisito de privacidade). */
  reset() {
    this.backend.clear();
    this.state = emptyState();
    this.save();
  }

  exportJson() {
    return JSON.stringify(this.state, null, 2);
  }
}

/** Gera ids estáveis e únicos sem dependências externas. */
export function uid(prefix = 'id') {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}
