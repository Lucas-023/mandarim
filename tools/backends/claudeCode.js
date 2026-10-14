/**
 * Backend padrão: usa o Claude Code em modo headless (`claude -p`).
 *
 * Por que este é o padrão aqui: o Claude Code já está instalado e autenticado
 * nesta máquina, então não há chave de API para guardar nem dependência para
 * instalar. O custo sai pela assinatura já existente.
 *
 * As ferramentas são desligadas: este trabalho é geração de texto, o modelo não
 * deve ler nem escrever arquivos do projeto.
 */
import { spawn } from 'node:child_process';

export const name = 'claude-code';

const DISALLOWED = ['Bash', 'Read', 'Write', 'Edit', 'NotebookEdit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task'];

export async function generate({ system, user, model = null, timeoutMs = 300000, cliPath = 'claude' }) {
  const args = ['-p', '--output-format', 'json', '--append-system-prompt', system, '--disallowed-tools', ...DISALLOWED];
  if (model) args.push('--model', model);

  const raw = await run(cliPath, args, user, timeoutMs);
  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    // Alguma versão pode imprimir texto puro; devolvemos como veio.
    return { text: raw, meta: { backend: name, model: model || 'claude-code-default', costUsd: null } };
  }
  if (envelope.is_error || envelope.subtype === 'error_during_execution') {
    throw new Error(`claude -p falhou: ${envelope.result || envelope.subtype || 'erro desconhecido'}`);
  }
  return {
    text: envelope.result ?? '',
    meta: {
      backend: name,
      model: envelope.model || model || 'claude-code-default',
      costUsd: typeof envelope.total_cost_usd === 'number' ? envelope.total_cost_usd : null,
      sessionId: envelope.session_id || null,
      usage: envelope.usage || null,
    },
  };
}

function run(cmd, args, stdin, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`tempo esgotado (${Math.round(timeoutMs / 1000)}s) esperando o ${cmd}`));
    }, timeoutMs);

    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`não foi possível executar "${cmd}": ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${cmd} saiu com código ${code}: ${err.trim().slice(0, 500)}`));
      else resolve(out);
    });
    child.stdin.end(stdin);
  });
}
