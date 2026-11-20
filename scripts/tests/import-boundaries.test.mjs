import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { inspectImportBoundaries } from '../check-import-boundaries.mjs';

async function put(root, path, contents) {
  const target = join(root, path);
  await mkdir(join(target, '..'), { recursive: true });
  await writeFile(target, contents);
}

test('G07 import boundaries use the TypeScript AST and report fixture violations without false positives', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-import-boundaries-'));
  try {
    await put(root, 'tsconfig.json', JSON.stringify({
      compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true, allowImportingTsExtensions: true },
      include: ['packages/*/src/**/*', 'apps/web/src/**/*'],
    }));
    await put(root, 'packages/schemas/index.ts', "export * from './src/internal.ts';\n");
    await put(root, 'packages/schemas/src/internal.ts', 'export const value = 1;\n');
    await put(root, 'packages/domain/index.ts', "export * from './src/safe.ts'; export * from './src/advanced.ts';\n");
    await put(root, 'packages/domain/src/safe-dependency.ts', 'export const local = 1;\n');
    await put(root, 'packages/domain/src/safe.ts', `
      import { local } from './safe-dependency.ts';
      import { value } from '../../schemas/index.ts';
      // These words in a comment are not references: window document navigator fetch.
      const note = 'localStorage WebSocket indexedDB';
      export const safe = [local, value, note, { document: 'field-name' }, new TextEncoder(), crypto.subtle];
    `);
    await put(root, 'packages/domain/src/dom.ts', 'export const title = document.title;\n');
    await put(root, 'packages/schemas/src/dom-globals.ts', `
      export const browserApis = [window, document, navigator, localStorage, sessionStorage, indexedDB,
        Worker, SharedWorker, WebSocket, fetch, XMLHttpRequest, EventSource];
    `);
    await put(root, 'packages/domain/src/provider.ts', 'export const provider = globalThis["ethereum"];\n');
    await put(root, 'packages/domain/src/node.ts', "import fs from 'node:fs'; export { fs };\n");
    await put(root, 'packages/domain/src/sdk.ts', "import React from 'react'; export { React };\n");
    await put(root, 'packages/domain/src/private.ts', "import { value } from '../../schemas/src/internal.ts'; export { value };\n");
    await put(root, 'packages/domain/src/escape.ts', "import '../../../../outside.ts';\n");
    await put(root, 'packages/domain/src/dynamic.ts', 'export const load = (name: string) => import(name);\n');
    await put(root, 'packages/storage/index.ts', "export * from './src/store.ts';\n");
    await put(root, 'packages/storage/src/store.ts', 'export const store = 1;\n');
    await put(root, 'packages/extensions/index.ts', "export * from './src/feature.ts';\n");
    await put(root, 'packages/extensions/src/feature.ts', 'export const feature = true;\n');
    await put(root, 'packages/domain/src/advanced.ts', "import { feature } from '../../extensions/index.ts'; export { feature };\n");
    await put(root, 'packages/server/index.ts', "export * from './src/handler.ts';\n");
    await put(root, 'packages/server/src/handler.ts', 'export const handler = true;\n');
    await put(root, 'apps/web/src/main.ts', `
      import '../ui.ts';
      import '../../../packages/domain/index.ts';
      import '../../../packages/storage/src/store.ts';
      import '../../../packages/server/index.ts';
      import 'https://example.invalid/chunk.js';
      import '@fixture/domain/src/private.ts';
    `);
    await put(root, 'apps/web/src/ui.ts', 'export const ui = true;\n');

    const result = await inspectImportBoundaries(root);
    const codes = new Set(result.findings.map(finding => finding.code));
    assert.equal(result.graphChecked, true);
    assert.ok(result.graphModules >= 2);
    assert.ok(codes.has('CORE_BROWSER_GLOBAL'));
    assert.ok(codes.has('CORE_PROVIDER_GLOBAL'));
    assert.ok(codes.has('CORE_NODE_IMPORT'));
    assert.ok(codes.has('CORE_EXTERNAL_IMPORT'));
    assert.ok(codes.has('CROSS_PACKAGE_PRIVATE_IMPORT'));
    assert.ok(codes.has('APP_PACKAGE_PRIVATE_IMPORT'));
    assert.ok(codes.has('EXTERNAL_URL_IMPORT'));
    assert.ok(codes.has('IMPORT_PATH_ESCAPE'));
    assert.ok(codes.has('NON_LITERAL_IMPORT'));
    assert.ok(codes.has('CORE_GRAPH_FORBIDDEN_MODULE'));
    assert.ok(result.findings.some(finding => finding.code === 'CORE_GRAPH_FORBIDDEN_MODULE' && finding.detail === 'packages/extensions/index.ts'),
      'the graph follows app imports through package facades to transitive advanced modules');
    assert.equal(result.findings.some(finding => finding.file.endsWith('/packages/domain/src/safe.ts')), false,
      'comments, strings, same-package imports, TextEncoder and Web Crypto are allowed');
    const blockedGlobals = new Set(result.findings.filter(finding => finding.code === 'CORE_BROWSER_GLOBAL').map(finding => finding.detail));
    for (const name of ['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'Worker', 'SharedWorker', 'WebSocket', 'fetch', 'XMLHttpRequest', 'EventSource']) {
      assert.ok(blockedGlobals.has(name), `${name} is treated as browser-specific`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('G07 permits only the explicit read-only release side entry and follows its dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-import-release-context-'));
  try {
    await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true, allowImportingTsExtensions: true }, include: ['packages/**/*', 'apps/web/src/**/*'] }));
    await put(root, 'packages/security/release-context.ts', "export { context } from './src/release-proof.ts';\n");
    await put(root, 'packages/security/src/release-proof.ts', 'export const context = true;\n');
    await put(root, 'packages/other/release-context.ts', 'export const context = true;\n');
    await put(root, 'apps/web/src/main.ts', "import '../../../packages/security/release-context.ts'; import '../../../packages/security/src/release-proof.ts'; import '../../../packages/security/other-context.ts'; import '../../../packages/other/release-context.ts';\n");
    let result = await inspectImportBoundaries(root);
    const privateImports = result.findings.filter(finding => finding.code === 'APP_PACKAGE_PRIVATE_IMPORT');
    assert.equal(privateImports.length, 3, 'private/similar-named entries remain rejected');
    assert.equal(privateImports.some(finding => finding.detail === '../../../packages/security/release-context.ts'), false);
    await put(root, 'packages/proofs/index.ts', 'export const proof = true;\n');
    await put(root, 'packages/security/src/release-proof.ts', "export * from '../../proofs/index.ts';\n");
    result = await inspectImportBoundaries(root);
    assert.ok(result.findings.some(finding => finding.code === 'CORE_GRAPH_FORBIDDEN_MODULE' && finding.detail === 'packages/proofs/index.ts'), 'side-entry dependencies remain checked');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('favorites facade belongs only to the native vault endpoint; document, QR, barrel and private imports fail closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-import-favorites-'));
  try {
    await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true, allowImportingTsExtensions: true }, include: ['packages/**/*', 'apps/web/src/**/*'] }));
    await put(root, 'packages/personalization/favorites.ts', "export * from './src/favorites.ts';\n");
    await put(root, 'packages/personalization/src/favorites.ts', 'export const favorites = true;\n');
    await put(root, 'packages/personalization/index.ts', "export * from './src/favorites.ts';\n");
    await put(root, 'apps/web/src/runtime/worker-endpoint.ts', "import '../../../../packages/personalization/favorites.ts';\n");
    await put(root, 'apps/web/src/main.ts', 'export const document = true;\n');
    let result = await inspectImportBoundaries(root); assert.deepEqual(result.findings, []);
    await put(root, 'apps/web/src/main.ts', "import '../../../packages/personalization/favorites.ts'; import '../../../packages/personalization/index.ts'; import '../../../packages/personalization/src/favorites.ts';\n");
    await put(root, 'apps/web/src/qr/decode.worker.ts', "import '../../../../packages/personalization/favorites.ts';\n");
    await put(root, 'packages/other/src/consumer.ts', "import '../../personalization/favorites.ts';\n");
    result = await inspectImportBoundaries(root);
    assert.equal(result.findings.filter(finding => finding.code === 'PERSONALIZATION_OUTSIDE_VAULT_WORKER').length, 5);
    assert.ok(result.findings.some(finding => finding.code === 'APP_PACKAGE_PRIVATE_IMPORT'));
    assert.equal(result.findings.some(finding => finding.file.endsWith('/runtime/worker-endpoint.ts')), false);
    await put(root, 'packages/proof-jobs/index.ts', 'export const optional = true;\n');
    await put(root, 'packages/personalization/src/favorites.ts', "export * from '../../proof-jobs/index.ts';\n");
    result = await inspectImportBoundaries(root);
    assert.ok(result.findings.some(finding => finding.code === 'CORE_GRAPH_FORBIDDEN_MODULE' && finding.detail === 'packages/proof-jobs/index.ts'), 'favorites never exempt transitive optional modules');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('G07 permits only the existing release side entry and excludes parked optional dependencies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-import-acceptance-context-'));
  try {
    await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true }, include: ['packages/**/*', 'apps/web/src/**/*'] }));
    await put(root, 'packages/security/release-context.ts', "export * from './src/native-reader.ts';\n");
    await put(root, 'packages/security/src/native-reader.ts', 'export const reader = true;\n');
    await put(root, 'packages/security/not-approved.ts', 'export const hidden = true;\n');
    await put(root, 'apps/web/src/main.ts', "import '../../../packages/security/release-context.ts'; import '../../../packages/security/not-approved.ts';\n");
    let result = await inspectImportBoundaries(root);
    const privateImports = result.findings.filter(finding => finding.code === 'APP_PACKAGE_PRIVATE_IMPORT');
    assert.equal(privateImports.length, 1);
    assert.equal(privateImports[0].detail, '../../../packages/security/not-approved.ts');
    await put(root, 'packages/meetup/index.ts', "export const optional = true;\n");
    await put(root, 'packages/security/src/native-reader.ts', "export * from '../../meetup/index.ts';\n");
    result = await inspectImportBoundaries(root);
    assert.ok(result.findings.some(finding => finding.code === 'CORE_GRAPH_FORBIDDEN_MODULE' && finding.detail === 'packages/meetup/index.ts'), 'approved side entry cannot pull optional location code into the core graph');
    await put(root, 'packages/privacy-policy/index.ts', 'export const optional = true;\n');
    await put(root, 'packages/security/src/native-reader.ts', "export * from '../../privacy-policy/index.ts';\n");
    result = await inspectImportBoundaries(root);
    assert.ok(result.findings.some(finding => finding.code === 'CORE_GRAPH_FORBIDDEN_MODULE' && finding.detail === 'packages/privacy-policy/index.ts'), 'compound optional package names stay excluded');
    for (const name of ['privacy-controls', 'proof-jobs', 'liquidity']) {
      await put(root, `packages/${name}/index.ts`, 'export const optional = true;\n');
      await put(root, 'packages/security/src/native-reader.ts', `export * from '../../${name}/index.ts';\n`);
      result = await inspectImportBoundaries(root);
      assert.ok(result.findings.some(finding => finding.code === 'CORE_GRAPH_FORBIDDEN_MODULE' && finding.detail === `packages/${name}/index.ts`), name + ' remains outside the default core graph');
    }
    await put(root, 'packages/domain/index.ts', "export * from './src/privacy.ts';\n");
    await put(root, 'packages/domain/src/privacy.ts', 'export const corePrivacy = true;\n');
    await put(root, 'packages/security/src/native-reader.ts', "export * from '../../domain/index.ts';\n");
    result = await inspectImportBoundaries(root);
    assert.ok(!result.findings.some(finding => finding.code === 'CORE_GRAPH_FORBIDDEN_MODULE'), 'core privacy helpers remain available');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('G07 reports missing application graph entry instead of claiming it was checked', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-import-no-entry-'));
  try {
    await mkdir(join(root, 'packages'));
    await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true } }));
    await put(root, 'apps/web/src/component.ts', 'export const component = 1;\n');
    const result = await inspectImportBoundaries(root);
    assert.equal(result.graphChecked, false);
    assert.ok(result.findings.some(finding => finding.code === 'CORE_GRAPH_NOT_CHECKED'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('G07 refuses missing or unreadable expected roots instead of passing a partial inventory', async () => {
  for (const missing of ['packages', 'apps/web/src', 'packages-is-file']) {
    const root = await mkdtemp(join(tmpdir(), 'p2p-import-incomplete-'));
    try {
      await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true }, include: ['packages/**/*', 'apps/web/src/**/*'] }));
      await mkdir(join(root, 'packages'));
      await put(root, 'packages/domain/index.ts', 'export const domain = true;\n');
      await put(root, 'apps/web/src/main.ts', 'export const app = true;\n');
      const unavailable = missing === 'packages-is-file' ? 'packages' : missing;
      await rm(join(root, unavailable), { recursive: true });
      if (missing === 'packages-is-file') await writeFile(join(root, 'packages'), 'not a directory');
      const result = await inspectImportBoundaries(root);
      assert.equal(result.graphChecked, false, missing + ' cannot qualify a partial graph');
      assert.ok(result.findings.some(finding => finding.code === 'SOURCE_ENUMERATION_FAILED' && finding.file === join(root, unavailable)), missing + ' must report its unavailable source root');
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('G07 refuses source-directory symlinks instead of silently omitting their subtree', async () => {
  for (const link of ['packages', 'packages/linked', 'apps/web/src/linked']) {
    const root = await mkdtemp(join(tmpdir(), 'p2p-import-linked-'));
    try {
      await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true }, include: ['packages/**/*', 'apps/web/src/**/*'] }));
      await mkdir(join(root, 'packages'));
      await put(root, 'apps/web/src/main.ts', 'export const app = true;\n');
      await put(root, 'link-target/src/local.ts', 'export const local = true;\n');
      if (link === 'packages') await rm(join(root, 'packages'), { recursive: true });
      await symlink(join(root, 'link-target'), join(root, link), 'dir');
      const result = await inspectImportBoundaries(root);
      assert.equal(result.graphChecked, false, link + ' cannot silently reduce coverage');
      assert.ok(result.findings.some(finding => finding.code === 'SOURCE_ENUMERATION_FAILED' && finding.file === join(root, link)), link + ' must report the omitted source subtree');
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('G07 accepts an explicitly empty packages root with a complete application inventory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-import-empty-packages-'));
  try {
    await mkdir(join(root, 'packages'));
    await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true }, include: ['packages/**/*', 'apps/web/src/**/*'] }));
    await put(root, 'apps/web/src/main.ts', 'export const app = true;\n');
    const result = await inspectImportBoundaries(root);
    assert.equal(result.graphChecked, true);
    assert.deepEqual(result.findings, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('G07 follows literal dynamic imports into the entry graph and still rejects non-literal ones', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-import-dynamic-'));
  try {
    await put(root, 'tsconfig.json', JSON.stringify({
      compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true, allowImportingTsExtensions: true },
      include: ['packages/*/src/**/*', 'apps/web/src/**/*'],
    }));
    await put(root, 'packages/proofs/index.ts', 'export const proof = true;\n');
    await put(root, 'apps/web/src/lazy.ts', "export const lazy = () => import('../../../packages/proofs/index.ts');\n");
    await put(root, 'apps/web/src/demo.ts', 'export const demo = 1;\n');
    await put(root, 'apps/web/src/main.ts', "export const load = () => import('./demo.ts'); export const other = () => import('./lazy.ts');\n");
    await put(root, 'apps/web/src/computed.ts', 'export const load = (name: string) => import(name);\n');
    const result = await inspectImportBoundaries(root);
    assert.ok(result.findings.some(finding => finding.code === 'CORE_GRAPH_FORBIDDEN_MODULE' && finding.detail === 'packages/proofs/index.ts'),
      'a forbidden module reached only through literal dynamic imports is reported');
    assert.equal(result.findings.some(finding => finding.code === 'NON_LITERAL_IMPORT' && finding.file.endsWith('/apps/web/src/main.ts')), false,
      'literal dynamic imports are resolvable, not NON_LITERAL');
    assert.ok(result.findings.some(finding => finding.code === 'NON_LITERAL_IMPORT' && finding.file.endsWith('/apps/web/src/computed.ts')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Area review of the consolidation candidate (2bc0f62, MEDIUM-2): a `.js` specifier for a `.ts` source was not followed,
// so a forbidden module behind `import './helper.js'` passed with "visited 1 module".
test('G07 follows JavaScript-extension specifiers into their TypeScript sources', async () => {
  for (const [specifier, file] of [['./helper.js', 'helper.ts'], ['./view.jsx', 'view.tsx'], ['./worker.mjs', 'worker.mts'], ['./legacy.cjs', 'legacy.cts']]) {
    const root = await mkdtemp(join(tmpdir(), 'p2p-import-jsext-'));
    try {
      await put(root, 'tsconfig.json', JSON.stringify({
        compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true, allowImportingTsExtensions: true, jsx: 'preserve' },
        include: ['packages/*/src/**/*', 'apps/web/src/**/*'],
      }));
      await put(root, 'packages/proofs/index.ts', 'export const proof = true;\n');
      await put(root, `apps/web/src/${file}`, "export { proof } from '../../../packages/proofs/index.ts';\n");
      await put(root, 'apps/web/src/main.ts', `export * from '${specifier}';\n`);
      const result = await inspectImportBoundaries(root);
      assert.ok(result.findings.some(finding => finding.code === 'CORE_GRAPH_FORBIDDEN_MODULE' && finding.detail === 'packages/proofs/index.ts'),
        `forbidden module behind ${specifier} is reported: ${JSON.stringify(result.findings)}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

// A3 localnet facades: public side entries reachable only from apps/web/src/localnet/**, and only lazily from outside it.
test('G07 localnet facades are side entries reachable only from the localnet app subtree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-import-localnet-'));
  try {
    await put(root, 'tsconfig.json', JSON.stringify({
      compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true, allowImportingTsExtensions: true, jsx: 'preserve' },
      include: ['packages/**/*', 'apps/web/src/**/*'],
    }));
    await put(root, 'packages/wallet/localnet.ts', "export { adapter } from './src/evm-adapter.ts';\n");
    await put(root, 'packages/wallet/src/evm-adapter.ts', 'export const adapter = true;\n');
    await put(root, 'packages/domain/localnet.ts', "export { lifecycle } from './src/tx-lifecycle.ts';\n");
    await put(root, 'packages/domain/src/tx-lifecycle.ts', 'export const lifecycle = true;\n');
    await put(root, 'packages/chain-evm/localnet.ts', "export { reader } from './src/reader.ts';\n");
    await put(root, 'packages/chain-evm/src/reader.ts', 'export const reader = true;\n');
    await put(root, 'packages/messaging/localnet.ts', 'export const notApproved = true;\n');
    await put(root, 'apps/web/src/localnet/LocalnetRoot.tsx', [
      "import { adapter } from '../../../../packages/wallet/localnet.ts';",
      "import { lifecycle } from '../../../../packages/domain/localnet.ts';",
      "import { reader } from '../../../../packages/chain-evm/localnet.ts';",
      "import { local } from './config.ts';",
      'export const LocalnetRoot = () => [adapter, lifecycle, reader, local];', ''].join('\n'));
    await put(root, 'apps/web/src/localnet/config.ts', 'export const local = 1;\n');
    await put(root, 'apps/web/src/main.tsx', "export const load = () => import('./localnet/LocalnetRoot.tsx');\n");
    let result = await inspectImportBoundaries(root);
    assert.deepEqual(result.findings, [], 'facades from the localnet subtree and a lazy localnet import from main are permitted');
    assert.equal(result.graphChecked, true);

    await put(root, 'apps/web/src/ui.ts', "import { adapter } from '../../../packages/wallet/localnet.ts'; export const ui = adapter;\n");
    await put(root, 'apps/web/src/eager.ts', "import { LocalnetRoot } from './localnet/LocalnetRoot.tsx'; export const eager = LocalnetRoot;\n");
    await put(root, 'apps/web/src/typed.ts', "import type { local } from './localnet/config.ts'; export type Local = typeof local;\n");
    await put(root, 'apps/web/src/localnet/other.ts', "import '../../../../packages/messaging/localnet.ts';\n");
    await put(root, 'packages/exchange/index.ts', "export * from './src/exchange.ts';\n");
    await put(root, 'packages/exchange/src/exchange.ts', "import { reader } from '../../chain-evm/localnet.ts'; export const exchange = reader;\n");
    await put(root, 'packages/domain/src/uses-facade.ts', "import { adapter } from '../../wallet/localnet.ts'; export const leaked = adapter;\n");
    await put(root, 'packages/chain-evm/src/bad.ts', "import React from 'react'; export { React };\n");
    await put(root, 'packages/domain/src/core-react.ts', "import React from 'react'; export { React };\n");
    result = await inspectImportBoundaries(root);
    const has = (code, file, detail) => result.findings.some(finding => finding.code === code && finding.file.endsWith(file) && (detail === undefined || finding.detail === detail));
    assert.ok(has('APP_LOCALNET_FACADE_OUTSIDE_LOCALNET', '/apps/web/src/ui.ts'), JSON.stringify(result.findings));
    assert.ok(has('APP_LOCALNET_STATIC_IMPORT', '/apps/web/src/eager.ts'));
    assert.ok(has('APP_LOCALNET_STATIC_IMPORT', '/apps/web/src/typed.ts'));
    assert.ok(has('APP_PACKAGE_PRIVATE_IMPORT', '/apps/web/src/localnet/other.ts', '../../../../packages/messaging/localnet.ts'), 'only the three approved localnet facades are public');
    assert.ok(has('PACKAGE_IMPORT_LOCALNET_FACADE', '/packages/exchange/src/exchange.ts'));
    assert.ok(has('PACKAGE_IMPORT_LOCALNET_FACADE', '/packages/domain/src/uses-facade.ts'));
    assert.ok(has('CORE_EXTERNAL_IMPORT', '/packages/domain/src/core-react.ts'));
    assert.equal(has('CORE_EXTERNAL_IMPORT', '/packages/chain-evm/src/bad.ts'), false, 'chain-evm is not a core package');
    assert.equal(result.findings.some(finding => finding.file.endsWith('/apps/web/src/main.tsx')), false);
    assert.equal(result.findings.some(finding => finding.file.endsWith('/apps/web/src/localnet/LocalnetRoot.tsx')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('G07 a localnet facade is classified under its own package, so the domain facade keeps core-package rules', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-import-localnet-core-'));
  try {
    await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true, allowImportingTsExtensions: true }, include: ['packages/**/*', 'apps/web/src/**/*'] }));
    await put(root, 'packages/domain/localnet.ts', "import fs from 'node:fs'; export { fs };\nexport const title = document.title;\n");
    await put(root, 'apps/web/src/main.ts', 'export const app = true;\n');
    const result = await inspectImportBoundaries(root);
    assert.ok(result.findings.some(finding => finding.code === 'CORE_NODE_IMPORT' && finding.file.endsWith('/packages/domain/localnet.ts')), JSON.stringify(result.findings));
    assert.ok(result.findings.some(finding => finding.code === 'CORE_BROWSER_GLOBAL' && finding.file.endsWith('/packages/domain/localnet.ts')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('G07 the repository passes with the localnet facades registered', async () => {
  const result = await inspectImportBoundaries(resolve(import.meta.dirname, '../..'));
  assert.deepEqual(result.findings, []);
  assert.equal(result.graphChecked, true);
});
