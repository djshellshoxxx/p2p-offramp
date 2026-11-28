/** Development-only upstream relay process. No download, public listener, identity or app wiring. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';

export const NAK_PIN = Object.freeze(JSON.parse(await readFile(new URL('../fixtures/nostr-relay/nak.json', import.meta.url), 'utf8')));
const runFile = promisify(execFile);

export async function verifyNak(binary = process.env.P2P_NAK) {
  assert.equal(process.platform, NAK_PIN.binary.platform, 'The recorded native relay binary is Linux only');
  assert.equal(process.arch, NAK_PIN.binary.arch, 'The recorded native relay binary is x64 only');
  assert.ok(typeof binary === 'string' && isAbsolute(binary), 'Set P2P_NAK to the absolute path of the pinned nak binary');
  assert.ok((await stat(binary)).isFile(), 'P2P_NAK must name a regular file');
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(binary)) digest.update(chunk);
  assert.equal(digest.digest('hex'), NAK_PIN.binary.sha256, 'Native relay binary does not match the release digest');
  const version = await runFile(binary, ['--version'], { timeout: 5_000, maxBuffer: 4096 });
  assert.equal(version.stdout.trim(), `nak version ${NAK_PIN.version}`);
  return binary;
}

function vacantPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function exited(child) { return child.exitCode !== null || child.signalCode !== null; }
async function waitForExit(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!exited(child) && Date.now() < deadline) await pause(20);
  return exited(child);
}

export async function startNak({ auth = false, eagerAuth = false, binary } = {}) {
  const executable = await verifyNak(binary);
  const port = await vacantPort();
  const args = ['serve', '--hostname', '127.0.0.1', '--port', String(port)];
  if (auth) args.push('--auth');
  if (eagerAuth) args.push('--eager-auth');
  // The relay does not sign. Do not inherit a user's optional nak signing identity.
  const env = { ...process.env }; delete env.NOSTR_SECRET_KEY;
  const child = spawn(executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let spawnError = false;
  child.once('error', () => { spawnError = true; });
  // Drain upstream diagnostic output without retaining event bodies or secret material.
  child.stdout.resume(); child.stderr.resume();
  let closing;
  const close = () => closing ??= (async () => {
    if (spawnError || exited(child)) return;
    child.kill('SIGTERM');
    if (!await waitForExit(child, 2_000)) {
      child.kill('SIGKILL');
      assert.ok(await waitForExit(child, 2_000), 'Owned native relay did not exit');
    }
  })();
  const httpUrl = `http://127.0.0.1:${port}/`;
  try {
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      assert.ok(!spawnError && !exited(child), 'Owned native relay exited during startup');
      try {
        const response = await fetch(httpUrl, { headers: { Accept: 'application/nostr+json' }, signal: AbortSignal.timeout(300) });
        const info = await response.json();
        assert.equal(info.name, 'nak serve');
        assert.equal(info.version, NAK_PIN.version);
        assert.equal(info.software, NAK_PIN.source);
        // Refuse an occupied-port/stale-process result if our own child could not bind.
        await pause(30);
        assert.ok(!spawnError && !exited(child), 'Owned native relay is not the responding process');
        return Object.freeze({ wsUrl: `ws://127.0.0.1:${port}/`, info: Object.freeze(info), close });
      } catch { /* Startup is bounded; no alternative host or relay is tried. */ }
      await pause(30);
    }
    throw new Error('Pinned native relay did not become ready on its owned loopback port');
  } catch (error) { await close(); throw error; }
}
