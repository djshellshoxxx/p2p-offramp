import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as facade from '../index.ts';

// Optional modules gain no authority over funded trades: production sources may only reach
// the allow-listed neighbours, never exchange, escrow, wallet, release/refund or journal code.
const PKG = 'stealth';
const ALLOWED = new Set(['packages/schemas/index.ts', '@noble/curves/secp256k1.js', '@noble/hashes/sha3.js']);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sources = execFileSync('git', ['ls-files', '-z', `packages/${PKG}`], { cwd: root }).toString('utf8').split('\0')
  .filter((file) => /\.(?:ts|tsx|mjs)$/.test(file) && !file.includes('/test/'));

test('production sources import only the allow-listed modules', () => {
  assert.ok(sources.length > 3);
  const found = new Set();
  for (const file of sources) {
    for (const match of readFileSync(resolve(root, file), 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\1/g)) {
      const specifier = match[2];
      const target = specifier.startsWith('.') ? relative(root, resolve(root, dirname(file), specifier)).split('\\').join('/') : specifier;
      if (!target.startsWith(`packages/${PKG}/`) && target !== `packages/${PKG}`) found.add(target);
    }
  }
  assert.deepEqual([...found].filter((target) => !ALLOWED.has(target) && !target.startsWith('node:')), []);
});

test('the public facade exposes no funding, release, refund, terms, signing or wallet entry point', () => {
  const names = Object.keys(facade);
  assert.ok(names.length > 0);
  assert.deepEqual(names.filter((name) => /fund|release|refund|settle|terms|sign|wallet|escrow|approve|transfer|spend/i.test(name)), []);
});
