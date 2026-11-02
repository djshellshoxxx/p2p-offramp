import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises, { mkdtemp, mkdir, writeFile, symlink, rm, readFile, rename } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scheduler } from 'node:timers/promises';
import { cleanLabEnvironment, digestFiles, validatePortPolicy, IMAGE_DIGEST } from './recipe.mjs';
import { LAB_COMMANDS, runLab } from './run.mjs';
import { runLabCommand } from './command.mjs';

test('lab never inherits wallet/RPC/publication credentials or ambient compiler recipe', () => {
  const safe = cleanLabEnvironment({ PATH: '/bin', HOME: '/tmp/test', SEPOLIA_RPC_URL: 'secret', PRIVATE_KEY: 'secret', GITHUB_TOKEN: 'secret', FOUNDRY_PROFILE: 'evil', FOUNDRY_CONFIG: 'evil', FOUNDRY_OFFLINE: 'false' });
  assert.deepEqual(safe, { PATH: '/bin', HOME: '/tmp/test', FOUNDRY_OFFLINE: 'true' });
});
test('lab permits only private frontend forwarding and no inferred native RPC forwarding', async () => {
  const config = JSON.parse(await readFile(new URL('../../.devcontainer/devcontainer.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => validatePortPolicy(config));
  assert.throws(() => validatePortPolicy({ ...config, forwardPorts: [3000, 8545] }), /PORT_EXPOSURE/);
  assert.throws(() => validatePortPolicy({ ...config, portsAttributes: { 3000: { visibility: 'private' } } }), /PORT_EXPOSURE/);
  const docker = await readFile(new URL('../../.devcontainer/Dockerfile', import.meta.url), 'utf8');
  assert.ok(docker.includes('@' + IMAGE_DIGEST));
  assert.ok(docker.includes('USER node'));
  for (const commands of Object.values(LAB_COMMANDS)) assert.ok(commands.every(([cmd, args]) => cmd === 'npm' && !args.some(value => /deploy|publish|sepolia:trade/.test(value))));
  await assert.rejects(runLab({ root: '/absent', mode: 'production' }), /LAB_UNSUPPORTED/);
});
test('recipe digests bind actual bytes and reject traversal and symlink parents', async t => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-lab-recipe-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'a')); await writeFile(join(root, 'a/file'), 'one');
  const before = await digestFiles(root, ['a/file']);
  await writeFile(join(root, 'a/file'), 'two'); assert.notEqual(await digestFiles(root, ['a/file']), before);
  await symlink(join(root, 'a'), join(root, 'link'));
  await assert.rejects(digestFiles(root, ['link/file']), /LAB_PATH_INVALID/);
  await assert.rejects(digestFiles(root, ['a/../a/file']), /LAB_PATH_INVALID/);
  await assert.rejects(digestFiles(root, ['/etc/passwd']), /LAB_PATH_INVALID/);
});
test('lab subprocess bounds logs, timeout and cancellation without a shell', async () => {
  const options = { root: process.cwd(), env: cleanLabEnvironment(process.env) };
  const noisy = await runLabCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(20000));setInterval(()=>{},1000)'], { ...options, maxBytes: 1024 });
  assert.equal(noisy.bounded, false); assert.ok(noisy.log.length <= 1024); assert.notEqual(noisy.exitCode, 0);
  const timed = await runLabCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { ...options, timeoutMs: 100 });
  assert.equal(timed.timedOut, true);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runLabCommand(process.execPath, [], { ...options, signal: controller.signal }), /LAB_CANCELLED/);
});
test('successful and terminated parents cannot leave their owned process group running', { timeout: 12000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'p2p-lab-descendants-')); const pids = [];
  const exited = async pid => {
    try {
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
      const state = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0];
      return state === 'Z' || state === 'X';
    } catch (error) { if (error.code === 'ENOENT') return true; throw error; }
  };
  t.after(async () => {
    for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    await rm(directory, { recursive: true, force: true });
  });
  for (const hang of [false, true]) {
    const file = join(directory, hang ? 'timeout' : 'success'); const controller = new AbortController();
    const program = 'const {spawn}=require("node:child_process");const fs=require("node:fs");const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});c.unref();process.stdout.write(String(c.pid)+"\\n",()=>fs.writeFileSync(process.argv[1],String(c.pid)));if(process.argv[2]==="hang")setInterval(()=>{},1000);';
    // Keep the 150ms timeout, but arm its test clock after startup and PID output.
    // Native scheduler.wait and subprocess exit observation remain on the real clock.
    if (hang) t.mock.timers.enable({ apis: ['setTimeout'] });
    const pending = runLabCommand(process.execPath, ['-e', program, file, hang ? 'hang' : 'exit'], { root: process.cwd(), env: cleanLabEnvironment(process.env), signal: controller.signal, timeoutMs: hang ? 150 : 3000 });
    try {
      if (hang) {
        let readyPid;
        for (let i = 0; i < 40; i++) {
          try { readyPid = Number(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
          if (Number.isSafeInteger(readyPid) && readyPid > 1) break;
          await scheduler.wait(25);
        }
        assert.ok(Number.isSafeInteger(readyPid) && readyPid > 1, 'timeout fixture must first publish its descendant PID');
        pids.push(readyPid); t.mock.timers.tick(150);
      }
      const result = await pending; assert.equal(result.timedOut, hang);
      const pid = Number(result.log.toString().trim()); assert.ok(Number.isSafeInteger(pid) && pid > 1); pids.push(pid);
      // SIGKILL delivery is asynchronous; observe native exit, including pending reap.
      for (let i = 0; i < 40 && !await exited(pid); i++) await scheduler.wait(25);
      assert.equal(await exited(pid), true, 'descendant must have exited, even if not yet reaped');
    } finally {
      controller.abort(); if (hang) t.mock.timers.tick(2000);
      await pending; if (hang) t.mock.timers.reset();
    }
  }
});
test('a file swapped for a symlink after metadata inspection is never hashed', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'p2p-lab-race-')); t.after(() => rm(temp, { recursive: true, force: true }));
  const root = join(temp, 'root'); await mkdir(root); const file = join(root, 'file');
  await writeFile(file, 'inside'); const outside = join(temp, 'outside'); await writeFile(outside, 'outside');
  const original = fsPromises.lstat; let calls = 0;
  try {
    fsPromises.lstat = async (...args) => {
      const stat = await original(...args);
      if (args[0] === file && ++calls === 2) { await rename(file, join(root, 'old')); await symlink(outside, file); }
      return stat;
    };
    syncBuiltinESMExports();
    await assert.rejects(digestFiles(root, ['file'])); assert.equal(calls, 2);
  } finally { fsPromises.lstat = original; syncBuiltinESMExports(); }
});
