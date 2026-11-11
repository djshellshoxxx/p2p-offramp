import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

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

test('src-imports-only-allowed-modules', () => {
  for (const [name, text] of sources) {
    for (const [, specifier] of text.matchAll(/from '([^']+)'/g)) {
      assert.ok(ALLOWED_IMPORTS.has(specifier) || /^\.\/[a-z]+\.ts$/.test(specifier), `${name}: ${specifier}`);
    }
    assert.doesNotMatch(text, /\bimport\(|require\(/, name);
  }
});

test('src-lines-at-most-120', () => {
  for (const [name, text] of sources) {
    text.split('\n').forEach((line, index) => assert.ok(line.length <= 120, `${name}:${index + 1}`));
  }
});
