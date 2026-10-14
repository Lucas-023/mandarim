/**
 * Gravação de áudio real (MediaRecorder) — o colega falando, não voz sintética.
 *
 * É o caminho mais valioso para o objetivo deste projeto: entender gente real
 * em campo. O arquivo é guardado em data/media/ pelo servidor local e vai para
 * o Anki junto com o cartão.
 *
 * Sem servidor local não há onde guardar o arquivo (localStorage não serve para
 * áudio), então a gravação fica disponível apenas para baixar. A interface diz
 * isso em vez de fingir que salvou.
 */
import { h, button } from './dom.js';
import { salvarMidia } from '../core/mediaStore.js';

export function canRecord() {
  return Boolean(
    globalThis.navigator?.mediaDevices?.getUserMedia &&
    typeof globalThis.MediaRecorder === 'function',
  );
}

export function mimeSuportado() {
  const MR = globalThis.MediaRecorder;
  if (!MR?.isTypeSupported) return 'audio/webm';
  for (const tipo of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    if (MR.isTypeSupported(tipo)) return tipo;
  }
  return 'audio/webm';
}

function extensaoDe(mime) {
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('mp4')) return '.m4a';
  return '.webm';
}

/** Nome de arquivo previsível e seguro a partir do conteúdo do cartão. */
export function nomeDeArquivo(nomeBase, mime = 'audio/webm') {
  const limpo = String(nomeBase || 'audio')
    .normalize('NFD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '') || 'audio';
  return `mq-${limpo}-${Date.now()}${extensaoDe(mime)}`;
}

/**
 * Guarda o áudio onde der: arquivo no servidor (computador) ou IndexedDB
 * (celular). Devolve { ok, audio, bytes, error }.
 */
export async function enviarAudio(blob, nomeBase, { modo = 'device', db = null, fetchImpl = globalThis.fetch } = {}) {
  const mime = blob.type || 'audio/webm';
  return salvarMidia(blob, nomeDeArquivo(nomeBase, mime), { modo, db, fetchImpl });
}

/**
 * Widget de gravação. `onSaved({name, url, bytes})` é chamado quando o áudio
 * fica guardado no servidor.
 */
export function recordWidget({ nomeBase = 'audio', modo = 'device', db = null, podeSalvar = true, onSaved = () => {}, onStatus = () => {} } = {}) {
  const raiz = h('div', { class: 'audio-row' });
  if (!canRecord()) {
    raiz.append(h('small', { class: 'hint' },
      'Este navegador não permite gravar áudio (precisa de HTTPS ou localhost e permissão de microfone).'));
    return raiz;
  }

  let recorder = null;
  let pedacos = [];
  let stream = null;
  const estado = h('span', { class: 'hint' });
  const player = h('audio', { controls: 'controls', hidden: true });

  const parar = () => {
    try {
      recorder?.stop();
    } catch { /* já parado */ }
    stream?.getTracks().forEach((t) => t.stop());
  };

  const btnGravar = button('● Gravar', async () => {
    if (recorder && recorder.state === 'recording') {
      parar();
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      estado.textContent = `Microfone não autorizado: ${err?.message || err}`;
      return;
    }
    const mime = mimeSuportado();
    recorder = new MediaRecorder(stream, { mimeType: mime });
    pedacos = [];
    recorder.ondataavailable = (e) => {
      if (e.data?.size) pedacos.push(e.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(pedacos, { type: mime });
      player.src = URL.createObjectURL(blob);
      player.hidden = false;
      btnGravar.textContent = '● Gravar de novo';
      estado.textContent = `${(blob.size / 1024).toFixed(0)} KB gravados.`;
      onStatus('gravado');

      if (podeSalvar === false) {
        const baixar = button('Baixar o áudio', () => {
          const a = h('a', { href: player.src, download: `${nomeBase}${extensaoDe(mime)}` });
          document.body.append(a);
          a.click();
          a.remove();
        }, { kind: 'ghost' });
        raiz.append(baixar);
        estado.textContent += ' Sem servidor local, só é possível baixar o arquivo.';
        return;
      }
      estado.textContent += ' Guardando…';
      const res = await enviarAudio(blob, nomeBase, { modo, db });
      if (!res.ok) {
        estado.textContent = `Falha ao guardar o áudio: ${res.error}`;
        onStatus('erro');
        return;
      }
      estado.textContent =
        `Guardado como ${res.audio.name} (${(res.bytes / 1024).toFixed(0)} KB) ` +
        `${res.audio.armazenamento === 'servidor' ? 'em data/media/' : 'neste aparelho'}.`;
      onStatus('salvo');
      onSaved(res.audio);
    };
    recorder.start();
    btnGravar.textContent = '■ Parar';
    estado.innerHTML = '';
    estado.append(h('span', { class: 'rec-dot' }), 'Gravando…');
  }, { kind: 'secondary' });

  raiz.append(btnGravar, estado, player);
  return raiz;
}
