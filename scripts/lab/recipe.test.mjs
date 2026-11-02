import { test } from 'node:test';
import assert from 'node:assert/strict';
import fsPromises, { mkdtemp, mkdir, writeFile, symlink, rm, readFile, rename } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
test('successful and terminated parents cannot leave their owned process group running', async () => {
  for (const hang of [false, true]) {
    const program = 'const {spawn}=require("node:child_process");const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});c.unref();console.log(c.pid);' + (hang ? 'setInterval(()=>{},1000);' : '');
    const result = await runLabCommand(process.execPath, ['-e', program], { root: process.cwd(), env: cleanLabEnvironment(process.env), timeoutMs: hang ? 150 : 3000 });
    assert.equal(result.timedOut, hang);
    const pid = Number(result.log.toString().trim()); assert.ok(Number.isSafeInteger(pid) && pid > 1);
    try {
      const state = (await readFile(`/proc/${pid}/stat`, 'utf8')).split(' ')[2];
      assert.ok(state === 'Z' || state === 'X', 'descendant must have exited, even if not yet reaped');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
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
