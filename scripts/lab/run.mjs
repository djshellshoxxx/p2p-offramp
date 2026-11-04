#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanLabEnvironment, createLabRecipe, LabError, sha256 } from './recipe.mjs';
import { isMain } from '../lib/is-main.mjs';
import { runLabCommand } from './command.mjs';

export const LAB_COMMANDS = Object.freeze({
  foundation: Object.freeze([
    ['npm', ['run', 'typecheck']], ['npm', ['test']], ['npm', ['run', 'check:boundaries']],
    ['npm', ['run', 'test:build-policy']], ['npm', ['run', 'build']],
  ]),
  journey: Object.freeze([
    ['npm', ['run', 'test:evm']], ['npm', ['run', 'test:exchange:evm']],
    ['npm', ['run', 'test:payment:preflight']], ['npm', ['run', 'test:recovery:evm']],
  ]),
});

export async function runLab({
  root, mode, output = resolve(root, 'dist-lab'), env = process.env, signal,
  // Test seams only: the CLI never passes these, and commands still come solely from LAB_COMMANDS.
  createRecipe = createLabRecipe, runCommand = runLabCommand,
}) {
  // Use the table's own key from here on, never the caller's string, so CLI input cannot select a command.
  const selected = Object.keys(LAB_COMMANDS).find(name => name === mode);
  if (selected === undefined) throw new LabError('LAB_UNSUPPORTED');
  const recipe = await createRecipe(root, env);
  await mkdir(output, { recursive: true, mode: 0o700 });
  // Each invocation owns a new, exclusively created 0700 directory, so no run can replace another run's evidence.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = await mkdtemp(resolve(output, `${selected}-${stamp}-`));
  const exclusive = { flag: 'wx', mode: 0o600 };
  await writeFile(resolve(runDir, 'recipe.json'), JSON.stringify(recipe, null, 2) + '\n', exclusive);
  const results = [];
  for (const [command, args] of LAB_COMMANDS[selected]) {
    const result = await runCommand(command, args, { root, env: cleanLabEnvironment(env), signal });
    const { log, ...record } = result;
    const name = `command-${results.length + 1}.log`;
    await writeFile(resolve(runDir, name), log, exclusive);
    results.push({ ...record, report: name });
    const run = { version: 1, mode: selected, recipeSha256: sha256(JSON.stringify(recipe)), sourceCommit: recipe.sourceCommit, sourceDirty: recipe.sourceDirty, chainIds: recipe.chainIds, fixtureDigest: recipe.fixturesDigest, toolVersions: recipe.toolVersions, results, qualification: 'local-fake-funds-only' };
    await writeFile(resolve(runDir, 'run.json'), JSON.stringify(run, null, 2) + '\n', { mode: 0o600 });
    if (result.exitCode !== 0 || !result.bounded || result.timedOut || result.cancelled) throw new LabError('LAB_COMMAND_FAILED');
  }
  return {
    passed: results.length, output: runDir, sourceCommit: recipe.sourceCommit, sourceDirty: recipe.sourceDirty,
    qualification: 'local-fake-funds-only',
  };
}

if (isMain(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const controller = new AbortController();
  const cancel = () => controller.abort(); process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  runLab({ root, mode: process.argv[2], signal: controller.signal }).then(value => process.stdout.write(JSON.stringify(value) + '\n')).catch(error => {
    process.stderr.write((error instanceof LabError ? error.code : 'LAB_FAILED') + '\n'); process.exitCode = 1;
  }).finally(() => { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); });
}
