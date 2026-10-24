import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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

test('G07 reports missing application graph entry instead of claiming it was checked', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-import-no-entry-'));
  try {
    await put(root, 'tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', noEmit: true } }));
    await put(root, 'apps/web/src/component.ts', 'export const component = 1;\n');
    const result = await inspectImportBoundaries(root);
    assert.equal(result.graphChecked, false);
    assert.ok(result.findings.some(finding => finding.code === 'CORE_GRAPH_NOT_CHECKED'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
