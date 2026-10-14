/**
 * Áudio em mandarim pela síntese de voz do navegador (Web Speech API).
 *
 * Limite honesto, repetido na interface: isto é voz SINTETIZADA, não fala
 * natural de um chinês. Serve para treinar reconhecimento de palavra, tom e
 * velocidade; não serve para dizer que você entende gente real falando. Para
 * isso existe a gravação de áudio real (ver gravacao.js).
 *
 * Nada aqui depende de rede: as vozes são as instaladas no sistema/navegador.
 */
import { h } from './dom.js';

let engine = null;        // injetável nos testes
let cachedVoice = null;
let voiceSearched = false;

export function setSpeechEngine(fake) {
  engine = fake;
  cachedVoice = null;
  voiceSearched = false;
}

function speech() {
  if (engine) return engine;
  return typeof globalThis !== 'undefined' && globalThis.speechSynthesis ? globalThis.speechSynthesis : null;
}

/** Existe síntese de voz utilizável? */
export function canSpeak() {
  return Boolean(speech());
}

/** Melhor voz chinesa disponível, ou null. */
export function chineseVoice() {
  const s = speech();
  if (!s) return null;
  if (cachedVoice) return cachedVoice;
  const voices = typeof s.getVoices === 'function' ? s.getVoices() || [] : [];
  if (!voices.length) {
    // As vozes carregam de forma assíncrona em alguns navegadores.
    if (!voiceSearched && typeof s.addEventListener === 'function') {
      voiceSearched = true;
      s.addEventListener('voiceschanged', () => {
        cachedVoice = null;
      });
    }
    return null;
  }
  const zhCN = voices.find((v) => /^zh[-_]?CN/i.test(v.lang || '')) || voices.find((v) => /^zh/i.test(v.lang || ''));
  cachedVoice = zhCN || null;
  return cachedVoice;
}

/** Diagnóstico para a interface: o que está disponível e o que falta. */
export function audioStatus() {
  if (!canSpeak()) {
    return { ok: false, reason: 'Este navegador não expõe a API de síntese de voz.' };
  }
  const voice = chineseVoice();
  if (!voice) {
    return {
      ok: false,
      pending: true,
      reason:
        'A síntese de voz existe, mas nenhuma voz em chinês foi encontrada. ' +
        'Instale uma voz zh-CN no sistema (ou abra no Chrome/Edge, que trazem vozes próprias).',
    };
  }
  return { ok: true, voice: voice.name, lang: voice.lang };
}

/** Fala um texto em chinês. `rate` 1 é normal; 0,7 é bem mais devagar. */
export function playAudio(text, { rate = 1, onEnd = null, onError = null } = {}) {
  const s = speech();
  if (!s || !text) return false;
  try {
    s.cancel();
    const Utterance = globalThis.SpeechSynthesisUtterance || engine?.Utterance;
    const utterance = Utterance ? new Utterance(String(text)) : { text: String(text) };
    const voice = chineseVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'zh-CN';
    utterance.rate = rate;
    if (onEnd) utterance.onend = onEnd;
    if (onError) utterance.onerror = onError;
    s.speak(utterance);
    return true;
  } catch (err) {
    console.warn('Falha ao falar:', err);
    if (onError) onError(err);
    return false;
  }
}

export function stopAudio() {
  const s = speech();
  if (s) s.cancel();
}

/**
 * Botão de áudio. `autoPlay` toca uma vez ao aparecer — usado nos exercícios de
 * escuta, em que o som é o enunciado.
 */
/** Itens cujo áudio já tocou automaticamente, para não repetir a cada redesenho. */
const jaTocouAutomatico = new Set();

export function resetAutoPlay() {
  jaTocouAutomatico.clear();
}

export function speakButton(text, { label = '🔊 Ouvir', rate = 1, autoPlay = false, kind = 'secondary', autoKey = null } = {}) {
  const el = h('button', {
    class: `btn btn-${kind}`,
    onClick: () => playAudio(text, { rate }),
    title: 'Voz sintetizada do navegador',
  }, label);
  if (autoPlay) {
    const chave = autoKey || text;
    if (!jaTocouAutomatico.has(chave)) {
      jaTocouAutomatico.add(chave);
      setTimeout(() => playAudio(text, { rate }), 120);
    }
  }
  return el;
}
