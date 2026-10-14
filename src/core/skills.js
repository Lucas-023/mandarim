/**
 * Estimativa de proficiência por habilidade.
 *
 * Toda pontuação é DERIVADA das evidências registradas (respostas de
 * nivelamento e exercícios). Nenhuma habilidade recebe valor sem evidência:
 * sem registros, o status é 'nao_avaliada'.
 *
 * XP não entra neste cálculo em nenhuma hipótese.
 */
import { uid } from './storage.js';

export const SKILLS = [
  { id: 'listening', hz: '听力', py: 'Tīnglì', pt: 'Compreensão auditiva' },
  { id: 'speaking', hz: '口语', py: 'Kǒuyǔ', pt: 'Produção oral' },
  { id: 'vocabulary', hz: '词汇', py: 'Cíhuì', pt: 'Vocabulário' },
  { id: 'reading', hz: '阅读', py: 'Yuèdú', pt: 'Leitura' },
  { id: 'grammar', hz: '语法', py: 'Yǔfǎ', pt: 'Gramática e construção de frases' },
  { id: 'writing', hz: '写作', py: 'Xiězuò', pt: 'Escrita' },
];

export const SKILL_IDS = SKILLS.map((s) => s.id);
export const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

/** Peso por dificuldade do item (1 ≈ HSK1, 2 ≈ HSK2, 3 ≈ acima). */
const DIFFICULTY_VALUE = { 1: 1, 2: 2, 3: 3 };

/** Penalidade aplicada quando o usuário precisou de apoio (pinyin/tradução). */
export const SUPPORT_PENALTY = 0.7;

/** Meia-vida da evidência, em dias: dados antigos pesam menos. */
export const EVIDENCE_HALF_LIFE_DAYS = 45;

export const MIN_EVIDENCE = 4;

/**
 * Registra uma evidência.
 * @param {object} state
 * @param {object} ev
 * @param {string} ev.skill      id da habilidade
 * @param {number} ev.score      0..1 (0 = errou, 1 = acertou; parciais permitidos)
 * @param {number} ev.difficulty 1..3
 * @param {boolean} [ev.supportUsed] se o usuário revelou pinyin/tradução antes de responder
 * @param {string} ev.source     'placement' | 'exercise' | 'review' | ...
 */
export function recordEvidence(state, ev) {
  if (!SKILL_BY_ID.has(ev.skill)) throw new Error(`habilidade desconhecida: ${ev.skill}`);
  const record = {
    id: uid('ev'),
    skill: ev.skill,
    score: Math.max(0, Math.min(1, Number(ev.score))),
    difficulty: DIFFICULTY_VALUE[ev.difficulty] ? Number(ev.difficulty) : 1,
    supportUsed: Boolean(ev.supportUsed),
    /** 'texto' | 'tts' | 'audio_real' — de que canal veio a evidência. */
    channel: ev.channel || 'texto',
    source: ev.source || 'exercise',
    ref: ev.ref || null,
    at: ev.at || new Date().toISOString(),
  };
  state.skillEvidence.push(record);
  return record;
}

function recencyWeight(at, now) {
  const ageDays = (now - new Date(at).getTime()) / 86400000;
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / EVIDENCE_HALF_LIFE_DAYS);
}

export function confidenceOf(count) {
  if (count < MIN_EVIDENCE) return 'insuficiente';
  if (count < 10) return 'baixa';
  if (count < 25) return 'media';
  return 'alta';
}

/**
 * Estima uma habilidade a partir das evidências.
 *
 * Cálculo (exibido ao usuário em `explanation`):
 *   precisao  = Σ(peso · score_ajustado) / Σ(peso)
 *   difMedia  = Σ(peso · score_ajustado · dificuldade) / Σ(peso · score_ajustado)
 *   fator     = 0,6 + 0,2 · (difMedia − 1)         → 0,6 (só itens fáceis) .. 1,0
 *   pontuacao = precisao · fator · 100
 *
 * score_ajustado aplica SUPPORT_PENALTY quando houve apoio de pinyin/tradução.
 */
export function estimateSkill(state, skillId, now = Date.now()) {
  const evidence = state.skillEvidence.filter((e) => e.skill === skillId);
  const skill = SKILL_BY_ID.get(skillId);
  if (evidence.length === 0) {
    return {
      skill: skillId,
      label: skill,
      status: 'nao_avaliada',
      score: null,
      evidenceCount: 0,
      confidence: 'insuficiente',
      explanation: 'Nenhuma atividade registrada para esta habilidade ainda.',
      updatedAt: null,
    };
  }

  let wSum = 0;
  let wScore = 0;
  let wScoreDiff = 0;
  for (const e of evidence) {
    const w = recencyWeight(e.at, now);
    const adjusted = e.supportUsed ? e.score * SUPPORT_PENALTY : e.score;
    wSum += w;
    wScore += w * adjusted;
    wScoreDiff += w * adjusted * e.difficulty;
  }

  const accuracy = wSum === 0 ? 0 : wScore / wSum;
  const avgDifficulty = wScore === 0 ? 1 : wScoreDiff / wScore;
  const factor = Math.min(1, 0.6 + 0.2 * (avgDifficulty - 1));
  const score = Math.round(Math.max(0, Math.min(100, accuracy * factor * 100)));
  const confidence = confidenceOf(evidence.length);
  const updatedAt = evidence.reduce((m, e) => (e.at > m ? e.at : m), evidence[0].at);
  const ttsCount = evidence.filter((e) => e.channel === 'tts').length;

  return {
    skill: skillId,
    label: skill,
    status: confidence === 'insuficiente' ? 'dados_insuficientes' : 'avaliada',
    score,
    evidenceCount: evidence.length,
    confidence,
    supportUsedCount: evidence.filter((e) => e.supportUsed).length,
    ttsCount,
    explanation:
      `Precisão ponderada ${(accuracy * 100).toFixed(0)}% em ${evidence.length} ` +
      `item(ns), dificuldade média ${avgDifficulty.toFixed(1)} (fator ${factor.toFixed(2)}). ` +
      `${(accuracy * 100).toFixed(0)}% × ${factor.toFixed(2)} = ${score}/100. ` +
      'Evidências mais antigas pesam menos (meia-vida de 45 dias).' +
      (ttsCount
        ? ` ${ttsCount} de ${evidence.length} evidência(s) vêm de voz sintetizada do navegador, ` +
          'não de fala natural — a compreensão de falantes reais tende a ser mais difícil que este número sugere.'
        : ''),
    updatedAt,
  };
}

export function estimateAllSkills(state, now = Date.now()) {
  return SKILL_IDS.map((id) => estimateSkill(state, id, now));
}

/** Habilidades com pontuação mais baixa entre as efetivamente avaliadas. */
export function weakestSkills(state, limit = 2, now = Date.now()) {
  return estimateAllSkills(state, now)
    .filter((s) => s.score != null)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}
