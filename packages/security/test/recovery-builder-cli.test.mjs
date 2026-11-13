import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const builder = fileURLToPath(new URL('../../../scripts/recovery/build-evm.mjs', import.meta.url));
const loader = fileURLToPath(new URL('../../../scripts/test-support/register-tsx.mjs', import.meta.url));

function run(args, cwd) {
  const result = spawnSync(process.execPath, ['--import', loader, builder, ...args], { cwd, encoding: 'utf8' });
  assert.ifError(result.error);
  return result;
}

test('recovery package help is available offline before trust or output is required', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'recovery-help-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  for (const option of ['--help', '-h']) {
    const result = run([option], cwd);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /--out <new-directory>/);
    assert.match(result.stdout, /historical/i);
  }
  assert.deepEqual(await readdir(cwd), []);
});

test('ambiguous and malformed packaging arguments produce a fixed input error', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'recovery-usage-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  for (const args of [[], ['--out'], ['--out='], ['--other'], ['extra'],
    ['--help', '--out', 'archive'], ['--out', 'first', '--out=second']]) {
    const result = run(args, cwd);
    assert.equal(result.status, 1, String(args));
    assert.deepEqual(JSON.parse(result.stdout), { ok: false, error: { code: 'INVALID_INPUT' } }, String(args));
  }
  assert.deepEqual(await readdir(cwd), []);
});
