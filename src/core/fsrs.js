/**
 * FSRS-4.5 — o algoritmo de repetição espaçada que o Anki usa hoje.
 *
 * Implementado a partir das fórmulas publicadas pelo projeto open-spaced-
 * repetition (não é cópia de código do Anki). Dois números por cartão:
 *
 *   S (estabilidade): em quantos dias a chance de lembrar cai para 90%.
 *   D (dificuldade):  de 1 a 10, o quanto o cartão resiste a ficar na memória.
 *
 * A chance de lembrar depois de t dias é R(t) = (1 + F·t/S)^-0,5, com F = 19/81
 * (escolhido para que R(S) = 0,9). O próximo intervalo é o t em que R cai até a
 * retenção desejada; com 90%, o intervalo é a própria S.
 *
 * Notas: 1 = Errei, 2 = Difícil, 3 = Bom, 4 = Fácil.
 * Os pesos são os padrão do FSRS-4.5; otimizá-los exige centenas de revisões
 * suas, e não há como fazer isso com honestidade antes delas existirem.
 */
export const PESOS_PADRAO = Object.freeze([
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031,
  1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
]);

const DECAIMENTO = -0.5;
const FATOR = 19 / 81;

const limitar = (x, min, max) => Math.min(max, Math.max(min, x));

/** Probabilidade de lembrar depois de `dias` com estabilidade `s`. */
export function retencao(dias, s) {
  return Math.pow(1 + (FATOR * Math.max(0, dias)) / s, DECAIMENTO);
}

/** Dias até a retenção cair para `alvo` (sem arredondar). */
export function intervaloPara(s, alvo = 0.9) {
  return (s / FATOR) * (Math.pow(alvo, 1 / DECAIMENTO) - 1);
}

function dificuldadeInicial(nota, w) {
  return limitar(w[4] - (nota - 3) * w[5], 1, 10);
}

/** Estado de memória depois da primeira resposta a um cartão novo. */
export function memoriaInicial(nota, w = PESOS_PADRAO) {
  return { s: w[nota - 1], d: dificuldadeInicial(nota, w) };
}

/** Errar sobe a dificuldade, Fácil desce; sempre puxada de volta para a média. */
export function proximaDificuldade(d, nota, w = PESOS_PADRAO) {
  const bruta = d - w[6] * (nota - 3);
  return limitar(w[7] * dificuldadeInicial(3, w) + (1 - w[7]) * bruta, 1, 10);
}

/** Estabilidade depois de lembrar (nota 2 a 4). Lembrar quando já ia esquecer rende mais. */
export function estabilidadeAposAcerto(d, s, r, nota, w = PESOS_PADRAO) {
  const dificil = nota === 2 ? w[15] : 1;
  const facil = nota === 4 ? w[16] : 1;
  return s * (Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * dificil * facil + 1);
}

/** Estabilidade depois de esquecer. Nunca maior que a anterior. */
export function estabilidadeAposErro(d, s, r, w = PESOS_PADRAO) {
  const nova = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  return Math.min(nova, s);
}

/**
 * Revisão de um cartão já na memória de longo prazo.
 * @returns {{s, d}} novo estado de memória
 */
export function revisar({ s, d }, diasDecorridos, nota, w = PESOS_PADRAO) {
  const r = retencao(diasDecorridos, s);
  const novaD = proximaDificuldade(d, nota, w);
  const novaS = nota === 1 ? estabilidadeAposErro(d, s, r, w) : estabilidadeAposAcerto(d, s, r, nota, w);
  return { s: novaS, d: novaD, r };
}
