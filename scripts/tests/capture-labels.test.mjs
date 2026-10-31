import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evidenceRoot = resolve(root, 'docs/evidence');
const runners = (await readdir(evidenceRoot, { recursive: true }))
  .filter(path => /(?:^|[/\\])run[-_]check\.py$/.test(path))
  .map(path => resolve(evidenceRoot, path));
assert.ok(runners.length > 0, 'discover every archived evidence capture runner');
// Adapt the historical checkout and source-hash preflight in memory. Execute each runner's
// original argument validation, file creation, subprocess capture and atomic receipt replace.
const harness = String.raw`
import ast, pathlib, sys
source, checkout, output, label, marker, child_code = sys.argv[1:]
tree = ast.parse(pathlib.Path(source).read_text(), filename=source)
for node in tree.body:
    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'repo' for t in node.targets):
        node.value = ast.Call(func=ast.Name(id='Path', ctx=ast.Load()), args=[ast.Constant(checkout)], keywords=[])
    if isinstance(node, ast.FunctionDef) and node.name == 'hashes':
        node.body = [ast.Return(value=ast.Dict(keys=[], values=[]))]
ast.fix_missing_locations(tree)
child = "from pathlib import Path; Path(" + repr(marker) + ").write_text('ran'); print('captured child output'); raise SystemExit(" + child_code + ")"
sys.argv = [source, label, sys.executable, '-c', child]
exec(compile(tree, source, 'exec'), {'__name__': '__main__', '__file__': str(pathlib.Path(output) / 'run-check.py')})
`;

function capture(runner, output, label, marker, childCode = 0) {
  const result = spawnSync('python', ['-c', harness, resolve(root, runner), root, output, label, marker, String(childCode)], {
    encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.error, undefined);
  return result;
}

for (const runner of runners) {
  test(`${runner}: capture labels cannot escape the evidence directory or start a child`, async () => {
    const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-capture-label-'));
    try {
      const invalid = ['../escaped', resolve(temporary, 'escaped'), 'nested/escaped', 'nested\\escaped', '.', '..', '', 'with space', 'line\nbreak', 'é', 'a'.repeat(129)];
      for (const [index, label] of invalid.entries()) {
        const output = resolve(temporary, `evidence-${index}`), marker = resolve(temporary, `child-${index}`);
        await mkdir(output);
        for (const suffix of ['.log', '.exit.tmp', '.exit.json']) await writeFile(resolve(temporary, `escaped${suffix}`), 'preserve existing evidence');
        const result = capture(runner, output, label, marker);
        assert.equal(result.status, 1, `${JSON.stringify(label)} must be rejected before capture`);
        assert.match(result.stderr, /Invalid capture label\./);
        assert.deepEqual(await readdir(output), [], 'invalid labels create no capture artifacts');
        assert.equal((await readdir(temporary)).includes(`child-${index}`), false, 'invalid labels never execute the supplied child');
        for (const suffix of ['.log', '.exit.tmp', '.exit.json']) assert.equal(await readFile(resolve(temporary, `escaped${suffix}`), 'utf8'), 'preserve existing evidence');
      }
    } finally { await rm(temporary, { recursive: true, force: true }); }
  });

  test(`${runner}: valid labels keep filenames, child output and child exit status`, async () => {
    const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-capture-valid-'));
    try {
      for (const [index, label] of ['01-focused-parity', 'focused-green', 'replay_81.v2', 'a'.repeat(128)].entries()) {
        const output = resolve(temporary, `evidence-${index}`), marker = resolve(temporary, `child-${index}`), childCode = index === 1 ? 7 : 0;
        await mkdir(output);
        const result = capture(runner, output, label, marker, childCode);
        assert.equal(result.status, childCode, result.stderr);
        assert.equal(await readFile(marker, 'utf8'), 'ran');
        assert.match(await readFile(resolve(output, `${label}.log`), 'utf8'), /captured child output/);
        const record = JSON.parse(await readFile(resolve(output, `${label}.exit.json`), 'utf8'));
        assert.equal(record.exitCode, childCode);
        assert.equal(record.sourceFilesUnchangedDuringRun, true);
        assert.deepEqual(new Set(await readdir(output)), new Set([`${label}.exit.json`, `${label}.log`]));
      }
    } finally { await rm(temporary, { recursive: true, force: true }); }
  });
}
