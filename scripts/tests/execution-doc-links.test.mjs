import assert from 'node:assert/strict';
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';

const repo = await realpath(new URL('../../', import.meta.url));
const docsRoot = join(repo, 'docs', 'execution');

/** Every Markdown file under docs/execution, found by walking the tree (no git, so worktrees work). */
async function markdownFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await markdownFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(path);
  }
  return found.sort();
}

/** Inline link and image targets, without an optional <...> wrapper or "title". */
function inlineTargets(text) {
  const targets = [];
  for (const [index, line] of text.split('\n').entries()) {
    for (const match of line.matchAll(/\]\(([^)]*)\)/g)) {
      const raw = match[1].trim();
      const target = raw.startsWith('<') ? raw.slice(1).split('>')[0] : raw.split(/\s+/)[0];
      targets.push({ line: index + 1, target });
    }
  }
  return targets;
}

const external = target => /^(?:https?:|mailto:|#)/i.test(target);

/** Why a repository-local link target cannot be opened from a checkout, or null when it resolves to a file. */
async function problem(file, target) {
  if (target.startsWith('/') || target.startsWith('\\') || /^[A-Za-z]:/.test(target)) return 'absolute path';
  const path = target.split('#')[0];
  if (path === '') return 'empty path';
  const resolved = resolve(dirname(file), path);
  const inside = relative(repo, resolved);
  if (inside === '' || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    return 'outside the repository';
  }
  try {
    return (await stat(resolved)).isFile() ? null : 'not a file';
  } catch {
    return 'missing file';
  }
}

test('every repository-local link in docs/execution opens a committed file', async () => {
  const files = await markdownFiles(docsRoot);
  assert.ok(files.length > 0, 'docs/execution has Markdown files');
  const offenders = [];
  for (const file of files) {
    for (const { line, target } of inlineTargets(await readFile(file, 'utf8'))) {
      if (external(target)) continue;
      const why = await problem(file, target);
      if (why) offenders.push(`${relative(repo, file)}:${line} ${target} (${why})`);
    }
  }
  assert.deepEqual(offenders, [], `unopenable links:\n${offenders.join('\n')}`);
});

test('the link check refuses absolute, escaping and missing targets', async () => {
  const file = join(docsRoot, 'audit-2026-11-02', 'domain-evm.md');
  assert.equal(await problem(file, '/workspace/work/audit-domain-evm.json'), 'absolute path');
  assert.equal(await problem(file, 'C:/work/audit.json'), 'absolute path');
  assert.equal(await problem(file, '../../../../outside.md'), 'outside the repository');
  assert.equal(await problem(file, 'missing-receipt.json'), 'missing file');
  assert.equal(await problem(file, '../'), 'not a file');
  assert.equal(await problem(file, ''), 'empty path');
  assert.equal(await problem(file, 'domain-evm.json#findings'), null);
  assert.deepEqual(inlineTargets('[a](<x y.md>) [b](z.md "title") ![c](d.png)').map(row => row.target),
    ['x y.md', 'z.md', 'd.png']);
});
