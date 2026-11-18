// Regression tests for scripts/consolidation/lib.sh. lines_on_main gates branch deletion in the
// retirement scripts, so every case it cannot prove must fail closed (exit 1).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const lib = fileURLToPath(new URL('../consolidation/lib.sh', import.meta.url));
const env = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
};
let dir;
const git = (...args) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();
const write = (name, text) => writeFileSync(join(dir, name), text);
const commit = message => { git('add', '-A'); git('commit', '-q', '-m', message); return git('rev-parse', 'HEAD'); };
// Exit status of lines_on_main <sha> main, run in the fixture repository.
const linesOnMain = sha => spawnSync('bash', ['-c', '. "$1"; lines_on_main "$2" main', 'test', lib, sha],
  { cwd: dir, env, encoding: 'utf8' }).status;
// A branch from the root commit that applies change(), committed; returns its tip.
const branch = (name, change) => { git('checkout', '-q', '-b', name, 'root'); change(); const tip = commit(name); git('checkout', '-q', 'main'); return tip; };

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'consolidation-lib-'));
  git('init', '-q', '-b', 'main');
  write('a.txt', 'alpha\n  beta\n');
  commit('root');
  git('tag', 'root');
  // main later gains these lines, so branches adding them are contained.
  write('a.txt', 'alpha\n  beta\ngamma\n++ plus-prefixed\n');
  write('b.txt', 'kept\n');
  commit('main work');
});
after(() => rmSync(dir, { recursive: true, force: true }));

test('a branch whose added lines are all on main passes, ignoring indentation', () => {
  const tip = branch('contained', () => write('a.txt', 'alpha\n  beta\n    gamma\n'));
  assert.equal(linesOnMain(tip), 0);
});

test('a branch with an added line missing from main fails', () => {
  const tip = branch('missing', () => write('a.txt', 'alpha\n  beta\nnot on main\n'));
  assert.equal(linesOnMain(tip), 1);
});

test('content that starts with "++ " is checked rather than mistaken for a diff header', () => {
  const present = branch('plus-present', () => write('a.txt', 'alpha\n  beta\n++ plus-prefixed\n'));
  const absent = branch('plus-absent', () => write('a.txt', 'alpha\n  beta\n++ only on the branch\n'));
  assert.equal(linesOnMain(present), 0);
  assert.equal(linesOnMain(absent), 1);
});

test('unrelated history and unknown SHAs fail closed instead of passing vacuously', () => {
  git('checkout', '-q', '--orphan', 'orphan');
  git('rm', '-q', '-rf', '.');
  write('a.txt', 'alpha\n');
  const orphan = commit('orphan');
  git('checkout', '-q', 'main');
  assert.equal(linesOnMain(orphan), 1);
  assert.equal(linesOnMain('0123456789abcdef0123456789abcdef01234567'), 1);
});

test('a renamed file with new content is checked under its new path', () => {
  const tip = branch('renamed', () => { git('mv', 'a.txt', 'renamed.txt'); write('renamed.txt', 'alpha\n  beta\nnew line\n'); });
  assert.equal(linesOnMain(tip), 1);
});

test('a path absent on main fails', () => {
  const tip = branch('new-file', () => write('only-here.txt', 'alpha\n'));
  assert.equal(linesOnMain(tip), 1);
});

test('a binary change fails because its content cannot be line-checked', () => {
  const tip = branch('binary', () => write('b.txt', Buffer.from([0, 1, 2, 0, 255])));
  assert.equal(linesOnMain(tip), 1);
});

test('a branch that only deletes a file has nothing to preserve and passes', () => {
  git('checkout', '-q', '-b', 'with-extra', 'main');
  write('extra.txt', 'temporary\n');
  commit('extra');
  git('checkout', '-q', 'main');
  git('merge', '-q', '--ff-only', 'with-extra');
  git('checkout', '-q', '-b', 'deleter', 'main');
  git('rm', '-q', 'extra.txt');
  const deleter = commit('delete extra');
  git('checkout', '-q', 'main');
  assert.equal(linesOnMain(deleter), 0);
});
