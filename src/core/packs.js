/**
 * Ingestão dos pacotes diários gerados por LLM.
 *
 * O que um pacote pode fazer no app:
 *  - acrescentar vocabulário ao léxico em execução (melhora segmentação, pinyin
 *    e detecção de duplicatas);
 *  - virar exercícios para ele responder;
 *  - virar rascunhos de cartão, que continuam exigindo aprovação manual.
 *
 * O que um pacote NÃO pode fazer:
 *  - mexer em proficiência, XP, conquistas ou histórico. Pontuação continua
 *    vindo só das respostas dele nos exercícios (ver skills.js). Receber conteúdo
 *    não é ter aprendido nada.
 */
import { uid } from './storage.js';
import { registerEntries } from './content/lexicon.js';
import { saveDrafts } from './flashcards.js';
import { introduceItems, grammarRef } from './schedule.js';
import { grammarPoint } from './content/grammar.js';

/** Quantos pacotes completos ficam guardados no estado (o resto vive em data/packs/). */
export const MAX_STORED_PACKS = 30;

/** Registra no léxico o vocabulário dos pacotes já ingeridos. Chamar no boot. */
export function restoreLexicon(state) {
  return registerEntries(state.lexiconExtra || [], { source: 'pacote (restaurado)' });
}

export function isIngested(state, date) {
  return (state.packs || []).some((p) => p.date === date);
}

/**
 * Ingere um pacote já validado.
 * @returns {{ingested: boolean, reason?: string, vocabAdded: object[], draftsAdded: object[]}}
 */
export function ingestPack(state, pack, { at = new Date().toISOString() } = {}) {
  if (!pack || !pack.date) return { ingested: false, reason: 'pacote sem data', vocabAdded: [], draftsAdded: [] };
  if (isIngested(state, pack.date)) {
    return { ingested: false, reason: `o pacote de ${pack.date} já foi ingerido`, vocabAdded: [], draftsAdded: [] };
  }

  const source = `pacote ${pack.date}`;
  const vocabAdded = registerEntries(pack.vocab, { source, addedAt: at });
  state.lexiconExtra = [...(state.lexiconExtra || []), ...vocabAdded];

  // Rascunhos de cartão: vocabulário e frases de campo. Nascem pendentes.
  const candidates = [
    ...pack.vocab.map((v) => ({
      front: v.hz,
      back: v.pt,
      pinyin: v.py,
      example: v.example?.hz || '',
      exampleTranslation: v.example?.pt || '',
      context: (v.tags || []).join(', '),
      difficulty: v.level,
      tags: [...(v.tags || []), 'gerado'],
      kind: 'word',
    })),
    ...(pack.fieldPhrases || []).map((f) => ({
      front: f.hz,
      back: f.pt,
      pinyin: f.py,
      example: '',
      exampleTranslation: '',
      context: f.when || 'frase de campo',
      difficulty: 2,
      tags: ['futebol', 'expressao', 'gerado'],
      kind: 'sentence',
    })),
  ];

  const drafts = candidates.map((c) => ({
    id: uid('card'),
    status: 'pending',
    duplicate: false,
    createdAt: at,
    source: `${source} (gerado por ${pack.provenance?.model || 'LLM'})`,
    template: 'zh_pt',
    needsReview: true,
    reviewNotes: [
      'Tradução e pinyin gerados por modelo de linguagem: confirme antes de aprovar.',
    ],
    confidence: { pinyin: 'gerada', translation: 'gerada' },
    ...c,
  }));
  const draftsAdded = saveDrafts(state, drafts);

  // Agendamento: tudo que o pacote apresenta entra na fila de revisão hoje
  // mesmo, para voltar amanhã. Sem isso, "novo todo dia" viraria um funil sem
  // fundo: o conteúdo entraria e nunca voltaria.
  const scheduled = introduceItems(state, [
    ...pack.vocab.map((v) => ({ ref: v.hz, type: 'word', label: `${v.hz} — ${v.pt}`, tags: v.tags, source: source })),
    ...(pack.grammarNote?.pointId
      ? [{
          ref: grammarRef(pack.grammarNote.pointId),
          type: 'grammar',
          label: grammarPoint(pack.grammarNote.pointId)?.name || pack.grammarNote.point,
          tags: ['gramatica'],
          source,
        }]
      : []),
  ], { at });

  state.packs = [
    ...(state.packs || []),
    { date: pack.date, ingestedAt: at, pack, studiedExerciseIds: [] },
  ].slice(-MAX_STORED_PACKS);

  return { ingested: true, vocabAdded, draftsAdded, scheduled };
}

export function latestPack(state) {
  const packs = state.packs || [];
  return packs.length ? packs[packs.length - 1] : null;
}

export function getPack(state, date) {
  return (state.packs || []).find((p) => p.date === date) || null;
}

/**
 * Converte os exercícios do pacote no formato que exercises.js corrige.
 * 'cloze' e 'mc' viram múltipla escolha; 'production' vira resposta aberta.
 */
export function packToExercise(pack, { includeDialogue = true } = {}) {
  const items = [];

  for (const ex of pack.exercises || []) {
    const base = {
      id: uid('item'),
      skill: ex.skill,
      difficulty: ex.difficulty,
      prompt: ex.prompt,
      promptHz: ex.promptHz || '',
      pinyin: '',
      tags: ex.tags || [],
      ref: refOf(ex),
      targets: Array.isArray(ex.targets) ? ex.targets : [],
      rationale: ex.rationale || '',
      generated: true,
    };
    if (ex.type === 'production') {
      items.push({ ...base, type: 'open', rubric: ex.rubric });
    } else {
      items.push({ ...base, type: 'mc', options: ex.options, answer: ex.answer });
    }
  }

  if (includeDialogue) {
    for (const q of pack.dialogue?.questions || []) {
      items.push({
        id: uid('item'),
        type: 'mc',
        skill: 'reading',
        difficulty: pack.focus?.level || 2,
        prompt: q.prompt,
        promptHz: '',
        pinyin: '',
        options: q.options,
        answer: q.answer,
        rationale: q.rationale || '',
        tags: [...(pack.focus?.tags || []), 'dialogo'],
        ref: `dialogo:${pack.date}`,
        generated: true,
      });
    }
  }

  return {
    id: `pack_${pack.date}`,
    kind: 'pack',
    title: `Pacote de ${pack.date}`,
    createdAt: pack.provenance?.generatedAt || new Date().toISOString(),
    items,
    note:
      'Exercícios gerados por modelo de linguagem a partir dos seus erros recentes. ' +
      'A correção automática de respostas escritas é por palavras-chave: confiança baixa.',
  };
}

function refOf(ex) {
  const hz = String(ex.promptHz || '').match(/[㐀-䶿一-鿿]+/);
  return hz ? hz[0] : (ex.tags || ['gerado'])[0];
}

/** Texto do diálogo no formato que o gerador de cartões já entende. */
export function dialogueText(pack) {
  return (pack.dialogue?.lines || []).map((l) => `${l.speaker}: ${l.hz}`).join('\n');
}

/** Marca que os exercícios de um pacote já foram feitos (evita refazer sem querer). */
export function markPackStudied(state, date, exerciseId) {
  const entry = getPack(state, date);
  if (!entry) return false;
  if (!entry.studiedExerciseIds.includes(exerciseId)) entry.studiedExerciseIds.push(exerciseId);
  return true;
}
