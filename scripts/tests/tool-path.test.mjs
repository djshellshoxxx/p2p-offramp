import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
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
  const searchPath = ['.', 'relative/bin', open, plantedFile, notExecutable, trusted].join(delimiter);
  assert.equal(resolveTool('fixture-tool', searchPath), join(trusted, 'fixture-tool'));
  assert.throws(() => resolveTool('fixture-tool', [open, plantedFile, notExecutable].join(delimiter)), /TOOL_NOT_FOUND/);
  assert.throws(() => resolveTool('fixture-tool', ''), /TOOL_NOT_FOUND/);
  for (const name of ['../fixture-tool', 'bin/fixture-tool', '', '-x', 'a'.repeat(65), 7]) {
    assert.throws(() => resolveTool(name, trusted), /TOOL_NAME_INVALID/, String(name));
  }
});
