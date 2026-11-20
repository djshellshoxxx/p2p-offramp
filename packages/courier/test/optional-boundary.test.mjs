// Optional-package boundary (D7 accepted 2026-11-18): nothing outside packages/courier may import it,
// and no tsconfig or bundler config may name it. This is a static source check, not proof of runtime isolation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { inspectImportBoundaries } from '../../../scripts/check-import-boundaries.mjs';

const PKG = 'courier';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PKG_DIR = `packages/${PKG}`;
const tracked = () => execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0').filter(Boolean);
const outside = path => path !== PKG_DIR && !path.startsWith(`${PKG_DIR}/`);
const intoPackage = path => path === PKG_DIR || path.startsWith(`${PKG_DIR}/`);

// Static/side-effect/re-export/dynamic/require specifiers written as string literals.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"`])([^'"`\n]+)\1/g;
export function specifiersOf(text) {
  return [...text.matchAll(SPECIFIER)].map(match => match[2]);
}
export function resolvesIntoPackage(file, specifier) {
  if (specifier.startsWith('.')) return intoPackage(posix.normalize(posix.join(posix.dirname(file), specifier)));
  if (specifier.startsWith('/')) return false;
  return new RegExp(`(?:^|/)packages/${PKG}(?:/|$)`).test(specifier);
}
export function offendingImports(files, read) {
  const found = [];
  for (const file of files) {
    if (!outside(file) || !/\.(?:ts|tsx|js|mjs)$/.test(file)) continue;
    for (const specifier of specifiersOf(read(file))) if (resolvesIntoPackage(file, specifier)) found.push({ file, specifier });
  }
  return found;
}
const CONFIG = /(?:^|\/)(?:tsconfig[^/]*\.json|(?:vite|vitest|rollup|webpack|esbuild)[^/]*\.config\.[cm]?[jt]s)$/;
export function offendingConfigs(files, read) {
  const found = [];
  for (const file of files) {
    if (!outside(file) || !CONFIG.test(file)) continue;
    for (const literal of read(file).matchAll(/(['"`])([^'"`\n]+)\1/g)) {
      const value = literal[2];
      if (!/[./]/.test(value) || value.includes('*') && !value.includes(PKG)) continue;
      const base = value.startsWith('.') ? posix.normalize(posix.join(posix.dirname(file), value)) : value.replace(/^\/+/, '');
      if (intoPackage(base.replace(/\/\*.*$/, '')) || new RegExp(`(?:^|/)packages/${PKG}(?:/|$)`).test(value)) found.push({ file, entry: value });
    }
  }
  return found;
}
const read = file => readFileSync(join(ROOT, file), 'utf8');

test(`courier: the package exists and tracked sources outside it are scanned`, () => {
  const files = tracked();
  assert.ok(files.some(file => file === `${PKG_DIR}/index.ts`), 'package facade is tracked');
  assert.ok(files.filter(file => outside(file) && /^(?:apps\/web|packages\/(?!courier\/)|scripts)\/.*\.(?:ts|tsx|js|mjs)$/.test(file)).length > 100, 'core, web and scripts are scanned');
});

test(`courier: no tracked source outside the package imports, re-exports, requires or dynamically imports it`, () => {
  assert.deepEqual(offendingImports(tracked(), read), []);
});

test(`courier: no tsconfig or bundler config outside the package names it`, () => {
  assert.deepEqual(offendingConfigs(tracked(), read), []);
});

test(`courier: the scanner detects relative, bare, re-export, dynamic and require imports (probe)`, () => {
  const probes = {
    'apps/web/src/probe-a.ts': `import { x } from '../../../${PKG_DIR}/index.ts';`,
    'apps/web/src/probe-b.ts': `export * from "../../../${PKG_DIR}/src/x.ts";`,
    'packages/domain/src/probe-c.ts': `const m = await import('../../${PKG}/index.ts');`,
    'scripts/probe-d.mjs': `const m = require('../${PKG_DIR}/index.ts');`,
    'scripts/probe-e.mjs': `import '${PKG_DIR}/index.ts';`,
  };
  const found = offendingImports(Object.keys(probes), file => probes[file]);
  assert.equal(found.length, Object.keys(probes).length);
  assert.deepEqual(offendingImports([`${PKG_DIR}/test/self.test.mjs`], () => `import '../index.ts';`), [], 'self imports are allowed');
  assert.deepEqual(offendingImports(['scripts/ok.mjs'], () => `import '../packages/schemas/index.ts'; import './${PKG}-note.mjs';`), []);
  const configs = {
    'tsconfig.json': `{"include":["${PKG_DIR}/**/*.ts"]}`,
    'apps/web/tsconfig.ui.json': `{"include":["../../${PKG_DIR}/index.ts"]}`,
    'apps/web/vite.config.ts': `alias: { x: '../../${PKG_DIR}/src' }`,
  };
  assert.equal(offendingConfigs(Object.keys(configs), file => configs[file]).length, 3);
  assert.deepEqual(offendingConfigs(['tsconfig.json'], () => `{"include":["packages/*/src/**/*.ts"]}`), [], 'the generic typecheck glob does not name the package');
});

test(`courier: the import-boundary checker rejects the package from the default app graph`, async () => {
  const root = await mkdtemp(join(tmpdir(), `p2p-optional-courier-`));
  try {
    const put = async (path, contents) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), contents); };
    await put('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true, allowImportingTsExtensions: true }, include: ['packages/*/src/**/*', 'apps/web/src/**/*'] }));
    await put(`${PKG_DIR}/index.ts`, 'export const optional = true;\n');
    await put('apps/web/src/main.ts', `import '../../../${PKG_DIR}/index.ts';\n`);
    const clean = await inspectImportBoundaries(root);
    assert.ok(clean.graphChecked);
    assert.ok(clean.findings.some(finding => finding.code === 'CORE_GRAPH_FORBIDDEN_MODULE' && finding.detail === `${PKG_DIR}/index.ts`),
      'ADVANCED_PACKAGES coverage: the checker treats this package as advanced');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test(`courier: the real repository still passes the import-boundary checker`, async () => {
  const result = await inspectImportBoundaries(ROOT);
  assert.deepEqual(result.findings, []);
  assert.ok(result.graphChecked);
});
