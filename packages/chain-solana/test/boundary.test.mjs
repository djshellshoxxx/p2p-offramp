import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import * as address from '../src/address.ts';

const dir = new URL('../src/', import.meta.url);
const sources = readdirSync(dir)
  .filter(name => name.endsWith('.ts'))
  .map(name => [name, readFileSync(new URL(name, dir), 'utf8')]);
const ALLOWED_IMPORTS = new Set(['../../domain/index.ts', '../../schemas/index.ts', '@noble/hashes/sha2.js']);

test('src-has-no-io-or-forbidden-apis', () => {
  assert.deepEqual(sources.map(([name]) => name).sort(), [
    'address.ts',
    'bind.ts',
    'codec.ts',
    'instructions.ts',
    'layout.ts',
    'reader.ts',
    'window.ts',
  ]);
  for (const [name, text] of sources) {
    assert.doesNotMatch(
      text,
      /Buffer|node:|@noble\/curves|fetch|atob|contracts\/|sendTransaction|simulateTransaction/,
      name,
    );
  }
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
      assert.ok(ALLOWED_IMPORTS.has(specifier) || /^\.\/[a-z]+\.ts$/.test(specifier), `${name}: ${specifier}`);
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
