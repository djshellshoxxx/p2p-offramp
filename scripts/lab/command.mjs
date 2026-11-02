import { spawn } from 'node:child_process';
import { sha256 } from './recipe.mjs';

/** Bounded local logs and owned process groups; callers cannot supply shell code. */
export function runLabCommand(command, args, { root, env, signal, maxBytes = 16 * 1024 * 1024, timeoutMs = 30 * 60 * 1000 }) {
  return new Promise((done, fail) => {
    if (signal?.aborted) { fail(new Error('LAB_CANCELLED')); return; }
    const child = spawn(command, args, { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = []; let size = 0, stopping = false, timedOut = false, killTimer;
    const stop = () => {
      if (stopping) return; stopping = true;
      const kill = sig => { try { if (child.pid) process.kill(-child.pid, sig); } catch { /* already exited */ } };
      kill('SIGTERM'); killTimer = setTimeout(() => kill('SIGKILL'), 2000); killTimer.unref();
    };
    const timeout = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    const cleanup = () => {
      clearTimeout(timeout); clearTimeout(killTimer); signal?.removeEventListener('abort', stop);
      // Even a successful child may leave an unref'd descendant with closed pipes.
      // This group belongs solely to this invocation, including its descendants.
      if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* group already exited */ } }
    };
    const collect = chunk => {
      size += chunk.length;
      if (size > maxBytes) { stop(); return; }
      chunks.push(chunk);
    };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.once('error', () => { cleanup(); fail(new Error('LAB_COMMAND_FAILED')); });
    child.once('close', (exitCode, exitSignal) => {
      cleanup(); const log = Buffer.concat(chunks);
      done({ command: [command, ...args], exitCode, exitSignal, logSha256: sha256(log), log, bounded: size <= maxBytes, timedOut, cancelled: signal?.aborted === true });
    });
  });
}
