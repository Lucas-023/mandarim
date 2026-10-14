/**
 * Contrato do "pacote do dia" gerado por LLM.
 *
 * Tudo que vem do modelo passa por aqui antes de encostar no estado do app.
 * Regras não negociáveis:
 *  - Nenhum campo de proficiência: o pacote é CONTEÚDO, nunca nota. Se o modelo
 *    tentar mandar pontuação de habilidade, o pacote é rejeitado.
 *  - Campos chineses precisam conter caracteres chineses; pinyin e português
 *    não podem vir vazios (senão o cartão nasce inútil).
 *  - Erros são acumulados e devolvidos todos de uma vez, para o gerador poder
 *    pedir correção ao modelo em vez de salvar lixo.
 */

export const PACK_SCHEMA_VERSION = 1;

const HANZI = /[㐀-䶿一-鿿]/;
/** Campos proibidos: o modelo não escreve avaliação de proficiência. */
const FORBIDDEN_KEYS = ['skills', 'skillScores', 'score', 'scores', 'xp', 'level_score', 'proficiency'];

class Validator {
  constructor() {
    this.errors = [];
  }

  fail(path, message) {
    this.errors.push(`${path}: ${message}`);
    return false;
  }

  str(value, path, { min = 1, max = 2000 } = {}) {
    if (typeof value !== 'string') return this.fail(path, 'esperava texto');
    const t = value.trim();
    if (t.length < min) return this.fail(path, `texto vazio ou curto demais (mínimo ${min})`);
    if (t.length > max) return this.fail(path, `texto longo demais (máximo ${max})`);
    return true;
  }

  hanzi(value, path, opts = {}) {
    if (!this.str(value, path, opts)) return false;
    if (!HANZI.test(value)) return this.fail(path, 'esperava caracteres chineses');
    return true;
  }

  int(value, path, { min, max }) {
    if (!Number.isInteger(value)) return this.fail(path, 'esperava número inteiro');
    if (value < min || value > max) return this.fail(path, `fora da faixa ${min}–${max}`);
    return true;
  }

  array(value, path, { min = 1, max = 60 } = {}) {
    if (!Array.isArray(value)) return this.fail(path, 'esperava lista');
    if (value.length < min) return this.fail(path, `lista com menos de ${min} item(ns)`);
    if (value.length > max) return this.fail(path, `lista com mais de ${max} itens`);
    return true;
  }

  noForbiddenKeys(obj, path) {
    if (!obj || typeof obj !== 'object') return true;
    for (const key of Object.keys(obj)) {
      if (FORBIDDEN_KEYS.includes(key)) {
        this.fail(`${path}.${key}`, 'campo de proficiência não é permitido em conteúdo gerado');
      }
    }
    return true;
  }

  /** Trio padrão {hz, py, pt} usado em vocabulário, exemplos e falas. */
  triple(value, path, { ptRequired = true } = {}) {
    if (!value || typeof value !== 'object') return this.fail(path, 'esperava objeto {hz, py, pt}');
    this.hanzi(value.hz, `${path}.hz`, { max: 200 });
    this.str(value.py, `${path}.py`, { max: 300 });
    if (ptRequired) this.str(value.pt, `${path}.pt`, { max: 400 });
    return true;
  }
}

/**
 * Valida um pacote.
 * @returns {{ok: boolean, errors: string[], pack: object|null}}
 */
export function validatePack(raw) {
  const v = new Validator();
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['pacote: esperava um objeto JSON'], pack: null };
  }
  v.noForbiddenKeys(raw, 'pacote');

  if (raw.version !== PACK_SCHEMA_VERSION) {
    v.fail('version', `esperava ${PACK_SCHEMA_VERSION}, recebi ${JSON.stringify(raw.version)}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || ''))) {
    v.fail('date', 'esperava data no formato YYYY-MM-DD');
  }

  // --- foco do dia ---
  if (!raw.focus || typeof raw.focus !== 'object') {
    v.fail('focus', 'esperava objeto com o foco do dia');
  } else {
    v.str(raw.focus.reason, 'focus.reason', { max: 600 });
    v.array(raw.focus.tags, 'focus.tags', { min: 1, max: 8 });
    v.int(raw.focus.level, 'focus.level', { min: 1, max: 3 });
  }

  // --- vocabulário ---
  if (v.array(raw.vocab, 'vocab', { min: 1, max: 40 })) {
    raw.vocab.forEach((item, i) => {
      const p = `vocab[${i}]`;
      v.noForbiddenKeys(item, p);
      v.triple(item, p);
      v.int(item.level, `${p}.level`, { min: 1, max: 3 });
      v.array(item.tags, `${p}.tags`, { min: 1, max: 6 });
      if (item.status !== undefined && !['novo', 'revisao'].includes(item.status)) {
        v.fail(`${p}.status`, 'esperava "novo" ou "revisao"');
      }
      if (item.example !== undefined) v.triple(item.example, `${p}.example`);
    });
  }

  // --- diálogo ---
  if (!raw.dialogue || typeof raw.dialogue !== 'object') {
    v.fail('dialogue', 'esperava objeto de diálogo');
  } else {
    v.str(raw.dialogue.title, 'dialogue.title', { max: 160 });
    v.str(raw.dialogue.context, 'dialogue.context', { max: 400 });
    if (v.array(raw.dialogue.lines, 'dialogue.lines', { min: 2, max: 24 })) {
      raw.dialogue.lines.forEach((line, i) => {
        const p = `dialogue.lines[${i}]`;
        v.str(line?.speaker, `${p}.speaker`, { max: 40 });
        v.triple(line, p);
      });
    }
    if (raw.dialogue.questions !== undefined && v.array(raw.dialogue.questions, 'dialogue.questions', { min: 1, max: 6 })) {
      raw.dialogue.questions.forEach((q, i) => validateChoice(v, q, `dialogue.questions[${i}]`));
    }
  }

  // --- exercícios ---
  if (v.array(raw.exercises, 'exercises', { min: 1, max: 20 })) {
    raw.exercises.forEach((ex, i) => validateExercise(v, ex, `exercises[${i}]`));
  }

  // --- blocos opcionais ---
  if (raw.tonePairs !== undefined && v.array(raw.tonePairs, 'tonePairs', { min: 1, max: 10 })) {
    raw.tonePairs.forEach((pair, i) => {
      const p = `tonePairs[${i}]`;
      v.triple(pair?.a, `${p}.a`);
      v.triple(pair?.b, `${p}.b`);
      v.str(pair?.note, `${p}.note`, { max: 400 });
    });
  }
  if (raw.fieldPhrases !== undefined && v.array(raw.fieldPhrases, 'fieldPhrases', { min: 1, max: 15 })) {
    raw.fieldPhrases.forEach((item, i) => {
      const p = `fieldPhrases[${i}]`;
      v.triple(item, p);
      v.str(item.when, `${p}.when`, { max: 300 });
    });
  }
  if (raw.grammarNote !== undefined) {
    v.str(raw.grammarNote?.pointId, 'grammarNote.pointId', { max: 60 });
    v.str(raw.grammarNote?.point, 'grammarNote.point', { max: 200 });
    v.str(raw.grammarNote?.explanation, 'grammarNote.explanation', { max: 2000 });
    if (v.array(raw.grammarNote?.examples, 'grammarNote.examples', { min: 1, max: 6 })) {
      raw.grammarNote.examples.forEach((ex, i) => v.triple(ex, `grammarNote.examples[${i}]`));
    }
  }
  if (raw.coachNotes !== undefined && v.array(raw.coachNotes, 'coachNotes', { min: 1, max: 8 })) {
    raw.coachNotes.forEach((note, i) => v.str(note, `coachNotes[${i}]`, { max: 600 }));
  }

  return { ok: v.errors.length === 0, errors: v.errors, pack: v.errors.length === 0 ? raw : null };
}

function validateChoice(v, q, path) {
  v.noForbiddenKeys(q, path);
  if (!q || typeof q !== 'object') return v.fail(path, 'esperava objeto de questão');
  v.str(q.prompt, `${path}.prompt`, { max: 600 });
  if (v.array(q.options, `${path}.options`, { min: 2, max: 4 })) {
    q.options.forEach((opt, i) => v.str(opt, `${path}.options[${i}]`, { max: 300 }));
    if (new Set(q.options.map((o) => String(o).trim())).size !== q.options.length) {
      v.fail(`${path}.options`, 'alternativas repetidas');
    }
    v.int(q.answer, `${path}.answer`, { min: 0, max: q.options.length - 1 });
  }
  if (q.rationale !== undefined) v.str(q.rationale, `${path}.rationale`, { max: 600 });
  return true;
}

const EXERCISE_TYPES = ['mc', 'cloze', 'production', 'dictation'];
/**
 * Habilidades aceitas. 'listening' entrou quando o app passou a falar por
 * síntese de voz: o exercício só vale se trouxer o texto a ser falado em
 * `audio.text`. 'speaking' continua fora — não há como avaliar pronúncia com
 * confiança nesta versão.
 */
const EXERCISE_SKILLS = ['vocabulary', 'reading', 'grammar', 'writing', 'listening'];

function validateExercise(v, ex, path) {
  v.noForbiddenKeys(ex, path);
  if (!ex || typeof ex !== 'object') return v.fail(path, 'esperava objeto de exercício');
  if (!EXERCISE_TYPES.includes(ex.type)) {
    return v.fail(`${path}.type`, `esperava um de ${EXERCISE_TYPES.join(', ')}`);
  }
  // Escuta e fala não entram: esta versão do app não tem áudio nem microfone.
  if (!EXERCISE_SKILLS.includes(ex.skill)) {
    v.fail(`${path}.skill`, `esperava um de ${EXERCISE_SKILLS.join(', ')} (produção oral não é avaliada nesta versão)`);
  }
  // Escuta precisa do texto que o app vai falar; sem isso não há o que ouvir.
  if (ex.skill === 'listening' || ex.type === 'dictation') {
    if (!ex.audio || typeof ex.audio !== 'object') {
      v.fail(`${path}.audio`, 'exercício de escuta precisa de audio.text (o que o app vai falar)');
    } else {
      v.hanzi(ex.audio.text, `${path}.audio.text`, { max: 120 });
      if (ex.audio.pinyin !== undefined) v.str(ex.audio.pinyin, `${path}.audio.pinyin`, { max: 200 });
      if (ex.audio.pt !== undefined) v.str(ex.audio.pt, `${path}.audio.pt`, { max: 300 });
    }
  }
  v.int(ex.difficulty, `${path}.difficulty`, { min: 1, max: 3 });
  v.array(ex.tags, `${path}.tags`, { min: 1, max: 6 });
  v.str(ex.prompt, `${path}.prompt`, { max: 600 });
  // `targets` diz quais itens (palavra ou gram:<id>) o exercício treina. É o que
  // permite ao agendador saber o que foi revisado de fato.
  if (ex.targets !== undefined && v.array(ex.targets, `${path}.targets`, { min: 1, max: 6 })) {
    ex.targets.forEach((t, i) => v.str(t, `${path}.targets[${i}]`, { max: 60 }));
  }
  if (ex.promptHz !== undefined && String(ex.promptHz).trim()) {
    v.hanzi(ex.promptHz, `${path}.promptHz`, { max: 400 });
  }

  if (ex.type === 'production' || ex.type === 'dictation') {
    if (ex.rubric === undefined) return v.fail(`${path}.rubric`, 'exercício de produção ou ditado precisa de critérios');
    v.int(ex.rubric.minLength ?? 5, `${path}.rubric.minLength`, { min: 1, max: 200 });
    if (v.array(ex.rubric.criteria, `${path}.rubric.criteria`, { min: 1, max: 5 })) {
      ex.rubric.criteria.forEach((c, i) => {
        const p = `${path}.rubric.criteria[${i}]`;
        v.str(c?.id, `${p}.id`, { max: 40 });
        v.str(c?.label, `${p}.label`, { max: 200 });
        if (v.array(c?.any, `${p}.any`, { min: 1, max: 20 })) {
          c.any.forEach((needle, j) => v.str(needle, `${p}.any[${j}]`, { max: 60 }));
        }
      });
    }
    return true;
  }
  return validateChoice(v, ex, path);
}

/** Extrai o primeiro objeto JSON de uma resposta que pode vir com texto em volta. */
export function extractJson(text) {
  const raw = String(text ?? '');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  if (start === -1) return { ok: false, error: 'nenhum objeto JSON encontrado na resposta', value: null };
  // Varre equilibrando chaves, ignorando o que está dentro de strings.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const slice = candidate.slice(start, i + 1);
        try {
          return { ok: true, error: null, value: JSON.parse(slice) };
        } catch (err) {
          return { ok: false, error: `JSON inválido: ${err.message}`, value: null };
        }
      }
    }
  }
  return { ok: false, error: 'JSON truncado (chaves não fecham)', value: null };
}
