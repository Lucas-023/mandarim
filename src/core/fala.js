/**
 * Prática de fala: repetir em voz alta, dizer a partir do português e conversa
 * simulada.
 *
 * Por que existe: o objetivo principal do usuário é conversar, e todo o resto do
 * app treina olho e ouvido. Aqui a boca trabalha — ouvir o modelo, falar, gravar
 * a própria voz e comparar.
 *
 * Limite honesto, repetido na interface: a nota é AUTOAVALIAÇÃO. Não há
 * avaliação automática de pronúncia confiável neste app, então nada daqui vira
 * evidência de proficiência (skills.js) — produção oral continua "não avaliada".
 * O que a autoavaliação faz:
 *  - decide a ordem da fila (o que travou volta primeiro);
 *  - vai para o briefing do pacote, para o modelo trazer de volta o que travou;
 *  - dá XP de atividade, uma vez por dia.
 *
 * Gravações não são guardadas: ficam só na memória da tela, para comparar e
 * descartar. Voz própria repetida 30 vezes por dia lotaria o aparelho.
 */
import { uid } from './storage.js';
import { awardXp, dayKey, addDays } from './xp.js';
import { latestPack, getPack } from './packs.js';

export const NOTAS_FALA = {
  bem: 'Saiu bem',
  quase: 'Quase (tom ou som)',
  travei: 'Travei',
};

export const MODOS_FALA = {
  repetir: 'Repetir em voz alta',
  dizer: 'Dizer a partir do português',
  conversa: 'Conversa simulada',
};

/** Frases avaliadas no dia a partir das quais a prática rende XP. */
export const MINIMO_FRASES_XP = 8;
/** Frase que saiu bem descansa estes dias antes de voltar à fila. */
const DESCANSO_BEM_DIAS = 3;
const MAX_REGISTRO = 3000;
const MAX_CARACTERES = 40;

function registro(state) {
  if (!Array.isArray(state.falaRegistro)) state.falaRegistro = [];
  return state.falaRegistro;
}

/** Última nota de cada frase: Map hz -> {nota, at, modo}. */
export function ultimaNotaPorFrase(state) {
  const mapa = new Map();
  for (const r of registro(state)) {
    const atual = mapa.get(r.hz);
    if (!atual || String(r.at) >= String(atual.at)) mapa.set(r.hz, r);
  }
  return mapa;
}

/**
 * Todas as frases disponíveis para falar, sem repetição, na ordem de origem:
 * pacote escolhido (frases de campo, exemplos da gramática do dia, exemplos do
 * vocabulário, falas do diálogo), frases de campo de pacotes anteriores e
 * cartões de frase aprovados.
 */
export function frasesDisponiveis(state, { date = null } = {}) {
  const entry = date ? getPack(state, date) : latestPack(state);
  const vistas = new Set();
  const saida = [];
  const add = (t, origem, contexto = '') => {
    const hz = String(t?.hz || '').trim();
    if (!hz || hz.length > MAX_CARACTERES || vistas.has(hz) || !t.py || !t.pt) return;
    vistas.add(hz);
    saida.push({ hz, py: t.py, pt: t.pt, origem, contexto });
  };

  if (entry) {
    const p = entry.pack;
    for (const f of p.fieldPhrases || []) add(f, 'frase de campo', f.when);
    for (const e of p.grammarNote?.examples || []) add(e, 'gramática do dia', p.grammarNote.point);
    for (const v of p.vocab || []) if (v.example) add(v.example, 'exemplo do vocabulário', `${v.hz} — ${v.pt}`);
    for (const l of p.dialogue?.lines || []) add(l, 'diálogo', p.dialogue.title);
  }
  for (const outro of (state.packs || []).slice().reverse()) {
    if (entry && outro.date === entry.date) continue;
    for (const f of outro.pack.fieldPhrases || []) add(f, `frase de campo (${outro.date})`, f.when);
  }
  for (const d of state.cardDrafts || []) {
    if (d.kind !== 'sentence' || !['approved', 'exported'].includes(d.status)) continue;
    add({ hz: d.front, py: d.pinyin, pt: d.back }, 'cartão aprovado', d.context);
  }
  return saida;
}

/**
 * Fila de prática: primeiro o que travou, depois o que ficou "quase", depois o
 * que nunca foi falado (na ordem de origem), e por último o que saiu bem há mais
 * de alguns dias. O que saiu bem recentemente fica de fora.
 */
export function filaDeFala(state, { date = null, hoje = dayKey(), limite = 12 } = {}) {
  const notas = ultimaNotaPorFrase(state);
  const limiteDescanso = addDays(hoje, -DESCANSO_BEM_DIAS);
  const peso = { travei: 0, quase: 1, nova: 2, bem: 3 };
  return frasesDisponiveis(state, { date })
    .map((f, ordem) => {
      const ultima = notas.get(f.hz);
      return { ...f, ordem, ultimaNota: ultima?.nota || null, ultimaVez: ultima?.at || null };
    })
    .filter((f) => f.ultimaNota !== 'bem' || dayKey(f.ultimaVez) <= limiteDescanso)
    .sort((a, b) => peso[a.ultimaNota || 'nova'] - peso[b.ultimaNota || 'nova'] || a.ordem - b.ordem)
    .slice(0, limite);
}

/**
 * Registra a autoavaliação de uma frase. Concede XP de prática uma vez por dia,
 * quando o dia atinge MINIMO_FRASES_XP frases.
 * @returns {{registro: object, xp: object|null}}
 */
export function registrarFala(state, { hz, nota, modo, origem = '', at = new Date().toISOString() }) {
  if (!NOTAS_FALA[nota]) throw new Error(`nota de fala desconhecida: ${nota}`);
  if (!MODOS_FALA[modo]) throw new Error(`modo de fala desconhecido: ${modo}`);
  const lista = registro(state);
  const r = { id: uid('fala'), at, hz: String(hz), nota, modo, origem };
  lista.push(r);
  if (lista.length > MAX_REGISTRO) lista.splice(0, lista.length - MAX_REGISTRO);

  const dia = dayKey(at);
  let xp = null;
  if (frasesNoDia(state, dia) >= MINIMO_FRASES_XP) {
    xp = awardXp(state, { type: 'speaking_practice', key: `fala:${dia}`, at, meta: { dia } });
  }
  return { registro: r, xp };
}

export function frasesNoDia(state, dia = dayKey()) {
  return registro(state).filter((r) => dayKey(r.at) === dia).length;
}

/** Conversa simulada concluída: XP uma vez por dia. */
export function concluirConversa(state, { titulo, turnos, at = new Date().toISOString() }) {
  const dia = dayKey(at);
  return awardXp(state, { type: 'roleplay', key: `conversa:${dia}`, at, meta: { titulo, turnos } });
}

/**
 * Frases cuja última nota foi "travei" nos últimos `dias`. Vai para o briefing:
 * é o equivalente falado do "o que não consegui dizer" das conversas.
 */
export function frasesTravadas(state, { hoje = dayKey(), dias = 14, limite = 10 } = {}) {
  const corte = addDays(hoje, -dias);
  return [...ultimaNotaPorFrase(state).values()]
    .filter((r) => r.nota === 'travei' && dayKey(r.at) >= corte)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limite)
    .map((r) => r.hz);
}

/** Números para o painel e o histórico. Autoavaliação, não nota. */
export function resumoFala(state, { hoje = dayKey() } = {}) {
  const lista = registro(state);
  const semana = addDays(hoje, -6);
  const notas = ultimaNotaPorFrase(state);
  return {
    hoje: lista.filter((r) => dayKey(r.at) === hoje).length,
    semana: lista.filter((r) => dayKey(r.at) >= semana).length,
    frasesDiferentes: notas.size,
    travadasAgora: [...notas.values()].filter((r) => r.nota === 'travei').length,
    faltamParaXp: Math.max(0, MINIMO_FRASES_XP - lista.filter((r) => dayKey(r.at) === hoje).length),
  };
}

/**
 * Roteiro da conversa simulada.
 *
 * Usa `pack.roleplay` quando o pacote traz um (prompt pack-v4 em diante): o
 * modelo escreve tarefas abertas com mais de uma resposta aceitável. Pacotes
 * anteriores não têm, então o roteiro sai do próprio diálogo: você faz o papel
 * de quem responde (o segundo a falar) e a tarefa é dizer a fala dele a partir
 * da tradução.
 *
 * Formato: { titulo, situacao, origem, turnos: [{ parceiro: [linha], tarefa, respostas: [linha] }], fecho: [linha] }
 */
export function roteiroConversa(pack) {
  if (!pack) return null;
  if (pack.roleplay?.turns?.length) {
    return {
      titulo: pack.roleplay.title,
      situacao: pack.roleplay.situation,
      origem: 'roleplay',
      turnos: pack.roleplay.turns.map((t) => ({
        parceiro: t.partner ? [t.partner] : [],
        tarefa: t.task,
        respostas: t.answers,
      })),
      fecho: [],
    };
  }

  const linhas = pack.dialogue?.lines || [];
  if (linhas.length < 2) return null;
  const voce = linhas[1].speaker === linhas[0].speaker
    ? linhas.find((l) => l.speaker !== linhas[0].speaker)?.speaker
    : linhas[1].speaker;
  if (!voce) return null;

  const turnos = [];
  let parceiro = [];
  for (const l of linhas) {
    if (l.speaker !== voce) {
      parceiro.push(l);
      continue;
    }
    turnos.push({ parceiro, tarefa: `Diga: “${l.pt}”`, respostas: [l] });
    parceiro = [];
  }
  if (!turnos.length) return null;
  return {
    titulo: pack.dialogue.title,
    situacao: `${pack.dialogue.context} Você é ${voce}.`,
    origem: 'dialogo',
    turnos,
    fecho: parceiro,
  };
}
