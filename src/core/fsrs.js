/**
 * FSRS-6 — o algoritmo de repetição espaçada do Anki atual.
 *
 * Fórmulas e pesos padrão conferidos em 2026-11-07 contra a implementação de
 * referência do projeto open-spaced-repetition (py-fsrs, fsrs/scheduler.py),
 * que acompanha o fsrs-rs usado pelo Anki. Não é cópia de código do Anki.
 *
 * Dois números por cartão:
 *   S (estabilidade): em quantos dias a chance de lembrar cai para 90%.
 *   D (dificuldade):  de 1 a 10, o quanto o cartão resiste a ficar na memória.
 *
 * R(t) = (1 + F·t/S)^(−w20), com F = 0,9^(−1/w20) − 1 (assim R(S) = 0,9).
 * O intervalo é o t em que R cai até a retenção desejada.
 *
 * Diferença em relação ao FSRS-4.5 (versão anterior deste arquivo): revisões no
 * MESMO dia agora mexem na memória, pela fórmula de curto prazo (w17–w19), e o
 * decaimento da curva virou parâmetro (w20).
 *
 * Notas: 1 = Errei, 2 = Difícil, 3 = Bom, 4 = Fácil.
 * Pesos padrão: otimizá-los exige centenas de revisões suas.
 */
export const PESOS_PADRAO = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001,
  1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
  1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]);

const S_MIN = 0.001;
const limitar = (x, min, max) => Math.min(max, Math.max(min, x));
const limitarD = (d) => limitar(d, 1, 10);
const limitarS = (s) => Math.max(S_MIN, s);
const decaimento = (w) => -w[20];
const fator = (w) => Math.pow(0.9, 1 / decaimento(w)) - 1;

/** Probabilidade de lembrar depois de `dias` com estabilidade `s`. */
export function retencao(dias, s, w = PESOS_PADRAO) {
  return Math.pow(1 + (fator(w) * Math.max(0, dias)) / s, decaimento(w));
}

/** Dias até a retenção cair para `alvo` (sem arredondar). */
export function intervaloPara(s, alvo = 0.9, w = PESOS_PADRAO) {
  return (s / fator(w)) * (Math.pow(alvo, 1 / decaimento(w)) - 1);
}

function dificuldadeInicialBruta(nota, w) {
  return w[4] - Math.exp(w[5] * (nota - 1)) + 1;
}

/** Estado de memória depois da primeira resposta a um cartão novo. */
export function memoriaInicial(nota, w = PESOS_PADRAO) {
  return { s: limitarS(w[nota - 1]), d: limitarD(dificuldadeInicialBruta(nota, w)) };
}

/**
 * Errar sobe a dificuldade, Fácil desce; a mudança encolhe perto de 10
 * (amortecimento linear) e é puxada de volta para a dificuldade de "Fácil".
 */
export function proximaDificuldade(d, nota, w = PESOS_PADRAO) {
  const delta = -w[6] * (nota - 3);
  const amortecida = d + ((10 - d) * delta) / 9;
  return limitarD(w[7] * dificuldadeInicialBruta(4, w) + (1 - w[7]) * amortecida);
}

/** Estabilidade depois de lembrar (nota 2 a 4). Lembrar quando já ia esquecer rende mais. */
export function estabilidadeAposAcerto(d, s, r, nota, w = PESOS_PADRAO) {
  const dificil = nota === 2 ? w[15] : 1;
  const facil = nota === 4 ? w[16] : 1;
  return limitarS(s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * dificil * facil));
}

/** Estabilidade depois de esquecer. Nunca maior que a de curto prazo. */
export function estabilidadeAposErro(d, s, r, w = PESOS_PADRAO) {
  const longo = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]);
  const curto = s / Math.exp(w[17] * w[18]);
  return limitarS(Math.min(longo, curto));
}

/** Estabilidade depois de uma revisão no mesmo dia (passos de aprendizado, repetição). */
export function estabilidadeCurtoPrazo(s, nota, w = PESOS_PADRAO) {
  let aumento = Math.exp(w[17] * (nota - 3 + w[18])) * Math.pow(s, -w[19]);
  if (nota > 1) aumento = Math.max(aumento, 1);
  return limitarS(s * aumento);
}

/**
 * Revisão de um cartão que já tem memória.
 * `diasDecorridos` < 1 (mesmo dia) usa a fórmula de curto prazo.
 * @returns {{s, d, r}} novo estado de memória
 */
export function revisar({ s, d }, diasDecorridos, nota, w = PESOS_PADRAO) {
  const r = retencao(diasDecorridos, s, w);
  const novaD = proximaDificuldade(d, nota, w);
  let novaS;
  if (diasDecorridos < 1) novaS = estabilidadeCurtoPrazo(s, nota, w);
  else novaS = nota === 1 ? estabilidadeAposErro(d, s, r, w) : estabilidadeAposAcerto(d, s, r, nota, w);
  return { s: novaS, d: novaD, r };
}

// ---------------------------------------------------------------- fuzz

/** Faixas de variação do Anki: 15% entre 2,5 e 7 dias, 10% até 20, 5% acima. */
const FAIXAS_FUZZ = [
  { de: 2.5, ate: 7, fator: 0.15 },
  { de: 7, ate: 20, fator: 0.1 },
  { de: 20, ate: Infinity, fator: 0.05 },
];

/** Limites [mín, máx] em que o intervalo pode cair depois da variação. */
export function faixaFuzz(dias, maximo = 36500) {
  if (dias < 2.5) return [dias, dias];
  let delta = 1;
  for (const f of FAIXAS_FUZZ) delta += f.fator * Math.max(Math.min(dias, f.ate) - f.de, 0);
  let min = Math.max(2, Math.round(dias - delta));
  const max = Math.min(Math.round(dias + delta), maximo);
  min = Math.min(min, max);
  return [min, max];
}

/**
 * Espalha o intervalo dentro da faixa do Anki, para cartões aprendidos juntos
 * não vencerem todos no mesmo dia. `sorteio` em [0, 1): o Baralho passa um
 * valor derivado do cartão, para a previsão do botão bater com o resultado.
 */
export function aplicarFuzz(dias, sorteio, { minimo = 0, maximo = 36500 } = {}) {
  if (dias < 2.5) return Math.max(dias, minimo);
  let [min, max] = faixaFuzz(dias, maximo);
  min = Math.max(min, minimo);
  max = Math.max(max, min);
  return Math.min(maximo, min + Math.floor(sorteio * (max - min + 1)));
}

/** Número em [0, 1) estável para o mesmo texto (como o Anki semeia pelo id do cartão e nº de revisões). */
export function sorteioEstavel(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000000) / 1000000;
}
