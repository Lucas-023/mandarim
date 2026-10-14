/**
 * Reexporta o validador do pacote.
 *
 * A implementação vive em src/core/packValidation.js porque o navegador também
 * precisa dela (o app revalida o arquivo antes de ingerir, já que data/packs/
 * pode ser editado à mão). Uma fonte de verdade só para as duas pontas.
 */
export * from '../src/core/packValidation.js';
