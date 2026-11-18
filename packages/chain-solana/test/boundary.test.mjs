import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import * as address from '../src/address.ts';

const dir = new URL('../src/', import.meta.url);
const sources = readdirSync(dir)
  .filter(name => name.endsWith('.ts'))
  .map(name => [name, readFileSync(new URL(name, dir), 'utf8')]);
const ALLOWED_IMPORTS = new Set(['../../domain/index.ts', '../../schemas/index.ts', '@noble/hashes/sha2.js']);
/** Lifecycle (B1b) modules. Only wallet.ts verifies Ed25519 and only submit.ts may name the one send method. */
const LIFECYCLE = ['adapter.ts', 'auxiliary.ts', 'compose.ts', 'intent.ts', 'journal.ts', 'message.ts', 'plan.ts',
  'submit.ts', 'wallet.ts'];
const LIFECYCLE_EXCEPTIONS = { 'wallet.ts': '@noble/curves', 'submit.ts': 'sendTransaction' };

test('src-has-no-io-or-forbidden-apis', () => {
  assert.deepEqual(sources.map(([name]) => name).sort(), [
    'address.ts',
    'bind.ts',
    'codec.ts',
    'instructions.ts',
    'layout.ts',
    'reader.ts',
    'window.ts',
    ...LIFECYCLE,
  ].sort());
  for (const [name, text] of sources) {
    const allowed = LIFECYCLE_EXCEPTIONS[name];
    const forbidden = ['Buffer', 'node:', '@noble/curves', 'fetch', 'atob', 'contracts/', 'sendTransaction',
      'simulateTransaction'].filter(word => word !== allowed);
    for (const word of forbidden) assert.ok(!text.includes(word), `${name}: ${word}`);
  }
  // The exceptions are narrow: one import, one RPC method name.
  const wallet = sources.find(([name]) => name === 'wallet.ts')[1];
  assert.deepEqual(importSpecifiers(wallet).filter(spec => spec.startsWith('@noble')), ['@noble/curves/ed25519.js']);
  const submit = sources.find(([name]) => name === 'submit.ts')[1];
  assert.equal(submit.match(/'sendTransaction'/g).length, 1);
});

/**
 * Every module specifier, whatever the quote style, spacing or form: `import x from`, side-effect `import '…'`,
 * `import type`, `export … from` (also `export*from"…"`), and `import (…)`. A `from` or `import` keyword is
 * matched at any word boundary, so a false positive can only fail the guard, never pass it.
 */
const importSpecifiers = text =>
  [...text.matchAll(/(?:\bimport\s*\(\s*|\b(?:from|import)\s*)(['"`])([^'"`\n]+)\1/g)].map(match => match[2]);
/** Dynamic import and require, with or without a space before the parenthesis. */
const DYNAMIC_LOAD = /\bimport\s*\(|\brequire\s*\(/;

test('import-scan-sees-every-static-form', () => {
  const sample = [
    `import { a } from "../../transport/index.ts";`,
    `import '../../storage/index.ts';`,
    'import "./side.ts";',
    `import type { T } from '../../relay/index.ts';`,
    `export { b } from "../../crypto/index.ts";`,
    `export * from './x.ts';`,
    'import {\n  c,\n} from\n  "./multi.ts";',
    'export*from"../../ledger/index.ts";',
    'const load = () => import ("../../wallet/index.ts");',
  ].join('\n');
  assert.deepEqual(importSpecifiers(sample), [
    '../../transport/index.ts',
    '../../storage/index.ts',
    './side.ts',
    '../../relay/index.ts',
    '../../crypto/index.ts',
    './x.ts',
    './multi.ts',
    '../../ledger/index.ts',
    '../../wallet/index.ts',
  ]);
  for (const form of ['import("x")', 'import ("x")', 'require ("x")']) assert.match(form, DYNAMIC_LOAD);
});

test('src-imports-only-allowed-modules', () => {
  for (const [name, text] of sources) {
    for (const specifier of importSpecifiers(text)) {
      const curves = name === 'wallet.ts' && specifier === '@noble/curves/ed25519.js';
      const local = /^\.\/[a-z]+\.ts$/.test(specifier);
      assert.ok(ALLOWED_IMPORTS.has(specifier) || curves || local, `${name}: ${specifier}`);
    }
    assert.doesNotMatch(text, DYNAMIC_LOAD, name);
  }
});

/** The 120-character limit holds for the whole package: src, tests, fakes and README. */
const packageTexts = () => {
  const tests = new URL('./', import.meta.url);
  const testFiles = readdirSync(tests)
    .filter(name => name.endsWith('.mjs'))
    .map(name => [`test/${name}`, readFileSync(new URL(name, tests), 'utf8')]);
  return [...sources, ...testFiles, ['README.md', readFileSync(new URL('../README.md', import.meta.url), 'utf8')]];
};

test('package-lines-at-most-120', () => {
  for (const [name, text] of packageTexts()) {
    text.split('\n').forEach((line, index) => assert.ok(line.length <= 120, `${name}:${index + 1}`));
  }
});

// The M2B-1 spec names TOKEN_PROGRAM_ID / TOKEN_2022_PROGRAM_ID; the exported names differ and the README says so.
test('readme-records-token-program-id-rename', () => {
  assert.equal(address.SPL_PROGRAM_ID, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  assert.equal(address.SPL_2022_PROGRAM_ID, 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
  assert.ok(!('TOKEN_PROGRAM_ID' in address) && !('TOKEN_2022_PROGRAM_ID' in address));
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const name of ['SPL_PROGRAM_ID', 'SPL_2022_PROGRAM_ID', 'TOKEN_PROGRAM_ID', 'TOKEN_2022_PROGRAM_ID']) {
    assert.match(readme, new RegExp(`\\b${name}\\b`), name);
  }
});
