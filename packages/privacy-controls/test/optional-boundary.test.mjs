import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Optional-package boundary (D7): nothing outside packages/privacy-controls may import it, and
// no tsconfig or bundler config may include it. Removing the directory must leave core intact.
const PKG = 'privacy-controls';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const pkgDir = resolve(root, 'packages', PKG);
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 64 << 20 }).toString('utf8').split('\0').filter(Boolean);
const outside = (file) => !file.startsWith(`packages/${PKG}/`);
const codeFiles = tracked.filter((file) => outside(file) && /\.(?:ts|tsx|js|mjs)$/.test(file));
const configFiles = tracked.filter((file) => outside(file) && /(?:^|\/)(?:tsconfig[^/]*\.json|vite\.config\.[cm]?[jt]s|vitest\.config\.[cm]?[jt]s)$/.test(file));
const pattern = new RegExp(`(^|[\\\\/])packages[\\\\/]${PKG}([\\\\/]|$)`);

function specifiers(source) {
  const found = [];
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"`])([^'"`\n]+)\1/g;
  for (let match = re.exec(source); match; match = re.exec(source)) found.push(match[2]);
  return found;
}
export function resolvesIntoPackage(file, specifier, base = root, dir = pkgDir) {
  if (specifier.startsWith('.')) {
    const target = resolve(base, dirname(file), specifier);
    const rel = relative(dir, target);
    return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..');
  }
  return pattern.test(specifier) || specifier === `@p2p/${PKG}`;
}

test(`no tracked source outside packages/${PKG} imports it`, () => {
  assert.ok(codeFiles.length > 100, 'scan must cover the repository');
  const hits = [];
  for (const file of codeFiles) {
    for (const specifier of specifiers(readFileSync(resolve(root, file), 'utf8'))) {
      if (resolvesIntoPackage(file, specifier)) hits.push(`${file} -> ${specifier}`);
    }
  }
  assert.deepEqual(hits, []);
});

test(`no tsconfig or bundler config includes packages/${PKG}`, () => {
  assert.ok(configFiles.length > 0);
  const hits = configFiles.filter((file) => pattern.test(readFileSync(resolve(root, file), 'utf8').replaceAll('\\\\', '/')));
  assert.deepEqual(hits, []);
});

test('the resolver detects relative, aliased and dynamic probes', () => {
  assert.equal(resolvesIntoPackage('apps/web/src/x.ts', `../../../packages/${PKG}/index.ts`), true);
  assert.equal(resolvesIntoPackage('packages/schemas/src/x.ts', `../../${PKG}/index.ts`), true);
  assert.equal(resolvesIntoPackage('scripts/x.mjs', `packages/${PKG}/src/a.ts`), true);
  assert.equal(resolvesIntoPackage('packages/schemas/src/x.ts', './other.ts'), false);
  assert.deepEqual(specifiers(`const m = await import('../packages/${PKG}/index.ts'); require("../packages/${PKG}")`), [`../packages/${PKG}/index.ts`, `../packages/${PKG}`]);
});

test('the import-boundary checker classifies the package as advanced', () => {
  const source = readFileSync(resolve(root, 'scripts/check-import-boundaries.mjs'), 'utf8');
  const block = /const ADVANCED_PACKAGES = new Set\(\[([\s\S]*?)\]\)/.exec(source);
  assert.ok(block, 'ADVANCED_PACKAGES literal not found');
  assert.ok([...block[1].matchAll(/'([^']+)'/g)].some((entry) => entry[1] === PKG), `${PKG} missing from ADVANCED_PACKAGES`);
});
