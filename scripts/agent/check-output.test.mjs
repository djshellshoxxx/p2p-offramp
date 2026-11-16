import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { checkBytes, checkIndex } from './check-output.mjs';
const sentinel = 'sentinel-private-credential-for-test-only';
function fixture(fn) {
  const cwd = mkdtempSync(join(tmpdir(), 'agent-output-test-'));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  try {
    git('init'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
    writeFileSync(join(cwd, 'source.txt'), 'original text\n'); git('add', '.'); git('commit', '-m', 'fixture');
    fn(cwd, git);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
test('known secret sentinel and common encodings are rejected without diagnostics', () => {
  for (const value of [sentinel, Buffer.from(sentinel).toString('base64'), Buffer.from(sentinel).toString('hex'), encodeURIComponent(sentinel)]) {
    assert.throws(() => checkBytes(Buffer.from(value), [sentinel]), /AGENT_OUTPUT_REFUSED/);
  }
  checkBytes(Buffer.from('ordinary source text'), [sentinel]);
});
test('credential shapes, binary, invalid UTF-8 and oversize content fail closed', () => {
  for (const bytes of [Buffer.from('sk-proj-' + 'A'.repeat(32)), Buffer.from('ghp_' + 'B'.repeat(36)), Buffer.from('-----BEGIN PRIVATE KEY-----'), Buffer.from([0]), Buffer.from([0xff]), Buffer.alloc(8 * 1024 * 1024 + 1, 65)]) {
    assert.throws(() => checkBytes(bytes));
  }
});
test('index scan rejects a staged secret even if working tree was cleaned afterward', () => fixture((cwd, git) => {
  writeFileSync(join(cwd, 'source.txt'), sentinel); git('add', '.');
  writeFileSync(join(cwd, 'source.txt'), 'clean working copy');
  assert.throws(() => checkIndex(cwd, [sentinel]), /AGENT_OUTPUT_REFUSED/);
}));
test('removed secret remains blocked in patch context', () => fixture((cwd, git) => {
  writeFileSync(join(cwd, 'source.txt'), sentinel); git('add', '.'); git('commit', '-m', 'sentinel fixture');
  writeFileSync(join(cwd, 'source.txt'), 'clean'); git('add', '.');
  assert.throws(() => checkIndex(cwd, [sentinel]), /AGENT_OUTPUT_REFUSED/);
}));
test('protected nested paths, newline paths, symlinks and binary files are refused', () => {
  for (const path of ['.github/workflows/test.yml', 'nested/.env.local', 'nested/package-lock.json', 'scripts/agent/check-output.mjs', 'secret.key', 'bad\nname', 'link', 'binary']) fixture((cwd, git) => {
    const full = join(cwd, path); mkdirSync(join(full, '..'), { recursive: true });
    if (path === 'link') symlinkSync('source.txt', full);
    else writeFileSync(full, path === 'binary' ? Buffer.from([1, 0, 2]) : 'innocent');
    git('add', '.'); assert.throws(() => checkIndex(cwd), /AGENT_OUTPUT_REFUSED/);
  });
});
test('normal modifications, additions and deletions pass', () => fixture((cwd, git) => {
  writeFileSync(join(cwd, 'source.txt'), 'modified source'); writeFileSync(join(cwd, 'new file.txt'), 'new text'); git('add', '.');
  assert.equal(checkIndex(cwd).files, 2);
  git('reset', '--hard', 'HEAD'); git('rm', 'source.txt'); assert.equal(checkIndex(cwd).files, 1);
}));
test('CLI failure never leaks sentinel, filename or underlying git diagnostics', () => fixture((cwd, git) => {
  writeFileSync(join(cwd, 'source.txt'), sentinel); git('add', '.');
  const result = spawnSync(process.execPath, [new URL('./check-output.mjs', import.meta.url).pathname, cwd], { env: { ...process.env, AGENT_OUTPUT_SECRET: sentinel }, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.equal(result.stderr, 'AGENT_OUTPUT_REFUSED\n');
}));

test('both workflow output boundaries gate publication and the write job never receives the API key', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/openai-agents.yml', import.meta.url), 'utf8');
  const [develop, publish] = workflow.split('\n  publish:\n');
  assert.ok(develop.includes("if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)"));
  const check = 'node "$RUNNER_TEMP/check-agent-output.mjs" "$GITHUB_WORKSPACE"';
  assert.ok(develop.indexOf(check) > develop.indexOf('git add -A'));
  assert.ok(develop.indexOf(check) < develop.indexOf('name: Upload patch'));
  assert.ok(publish.indexOf(check) > publish.indexOf('git apply --index'));
  assert.ok(publish.indexOf(check) < publish.indexOf('GH_TOKEN:'));
  assert.ok(!publish.includes('secrets.OPENAI_API_KEY'));
  assert.ok(!workflow.includes('git diff --cached --stat'));
});
