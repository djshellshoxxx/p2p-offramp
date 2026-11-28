import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join, relative } from 'node:path';
import { resolveTool } from '../lib/tool-path.mjs';

test('tools resolve only from absolute, non-world-writable PATH entries', async t => {
  const base = await mkdtemp(join(tmpdir(), 'p2p-tool-path-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const make = async (name, dirMode, fileMode) => {
    const directory = join(base, name);
    await mkdir(directory);
    await writeFile(join(directory, 'fixture-tool'), '#!/bin/sh\n');
    await chmod(join(directory, 'fixture-tool'), fileMode);
    await chmod(directory, dirMode);
    return directory;
  };
  const open = await make('open', 0o777, 0o755);
  const plantedFile = await make('planted-file', 0o755, 0o777);
  const notExecutable = await make('not-executable', 0o755, 0o644);
  const trusted = await make('trusted', 0o755, 0o755);
  // A relative entry that does reach an executable, non-world-writable fixture from the current directory, so only
  // the absolute-entry rule can skip it.
  const reachable = relative(process.cwd(), await make('relative-target', 0o755, 0o755));
  assert.ok(!isAbsolute(reachable), reachable);
  assert.throws(() => resolveTool('fixture-tool', reachable), /TOOL_NOT_FOUND/);
  const searchPath = ['.', 'relative/bin', reachable, open, plantedFile, notExecutable, trusted].join(delimiter);
  assert.equal(resolveTool('fixture-tool', searchPath), join(trusted, 'fixture-tool'));
  // Entries inside the working directory ('.', 'bin', './bin') reach planted tools from a directory that holds them.
  // A child process runs there so this test never changes its own working directory.
  const inside = await make('inside', 0o755, 0o755);
  await mkdir(join(inside, 'bin'));
  await chmod(join(inside, 'bin'), 0o755); // refused for being relative, never for being world-writable
  await writeFile(join(inside, 'bin', 'fixture-tool'), '#!/bin/sh\n');
  await chmod(join(inside, 'bin', 'fixture-tool'), 0o755);
  const entries = ['.', 'bin', './bin', 'bin/', ['.', 'bin', './bin', trusted].join(delimiter)];
  const probe = `import { resolveTool } from ${JSON.stringify(new URL('../lib/tool-path.mjs', import.meta.url).href)};
    const results = JSON.parse(process.argv[1]).map(entry => { try { return resolveTool('fixture-tool', entry); } catch (error) { return error.message; } });
    console.log(JSON.stringify(results));`;
  const results = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', probe, JSON.stringify(entries)], { cwd: inside, encoding: 'utf8' }));
  assert.deepEqual(results, ['TOOL_NOT_FOUND', 'TOOL_NOT_FOUND', 'TOOL_NOT_FOUND', 'TOOL_NOT_FOUND', join(trusted, 'fixture-tool')]);
  assert.throws(() => resolveTool('fixture-tool', [open, plantedFile, notExecutable].join(delimiter)), /TOOL_NOT_FOUND/);
  assert.throws(() => resolveTool('fixture-tool', ''), /TOOL_NOT_FOUND/);
  for (const name of ['../fixture-tool', 'bin/fixture-tool', '', '-x', 'a'.repeat(65), 7]) {
    assert.throws(() => resolveTool(name, trusted), /TOOL_NAME_INVALID/, String(name));
  }
});
