/** Native Worker/encrypted-vault composition, with explicitly controlled update
 * ports. --build-only prepares and inspects artifacts without launching a browser. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { API } from 'typescript/unstable/sync';
import { isCallExpression, isExportDeclaration, isImportDeclaration, isImportExpression, isStringLiteral } from 'typescript/unstable/ast';
import { buildWeb } from '../apps/web/scripts/build.mjs';
import { locatorFixture } from '../packages/security/test/lib/locator-fixture.mjs';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { isMain } from './lib/is-main.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const scenarios = ['missing-proof', 'verified', 'persisted-mutation', 'held-own-lock', 'cancel-held-lock', 'competing-opening'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => [...new TextEncoder().encode(JSON.stringify(value))];
const policy = "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'";

function publicCorpus() {
  const source = locatorFixture(), { release } = source;
  // The existing Node signer never exports its private key. Serialize an exact
  // public-data allowlist; no fixture function or signing material is transferred.
  assert.deepEqual(Object.keys(release.key).sort(), ['crv', 'ext', 'key_ops', 'kty', 'x', 'y']);
  const corpus = { key: release.key, keyId: release.keyId, cid: source.locator.cid, sequence: release.manifest.sequence,
    locator: [...source.bytes], locatorEnvelope: encode(source.envelope),
    manifest: [...release.bytes], manifestEnvelope: encode(release.envelope),
    assets: release.assets.map(asset => ({ path: asset.path, bytes: [...asset.bytes] })) };
  assert.ok(JSON.stringify(corpus).length < 32 * 1024);
  return corpus;
}

/** Build preparation is also an explicit local qualification path. It never
 * resolves a browser binary, opens a server, or calls a browser launcher. */
export async function prepareUpdateRuntimeFixture(directory) {
  const app = resolve(directory, 'app'), emitted = resolve(directory, 'fixture');
  const config = resolve(directory, 'fixture-tsconfig.json');
  await writeFile(config, JSON.stringify({ compilerOptions: {
    target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
    noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, rewriteRelativeImportExtensions: true,
    rootDir: root, outDir: emitted, lib: ['ES2023', 'DOM'], types: [], skipLibCheck: false,
  }, files: [resolve(root, 'scripts/fixtures/update-runtime-browser.ts')] }));
  execFileSync(resolve(root, 'node_modules/.bin/tsc'), ['-p', config], { cwd: root, stdio: 'inherit' });
  const files = new Map(), compiled = new Map();
  async function include(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await include(path);
      else {
        assert.ok(entry.isFile() && entry.name.endsWith('.js'), 'fixture emit is JavaScript only');
        compiled.set(path, await readFile(path));
      }
    }
  }
  await include(emitted);
  const fixtureEntry = '/fixture/scripts/fixtures/update-runtime-browser.js';
  // Walk actual JavaScript imports with the installed compiler AST. Strings such
  // as an intent's "import" label are data, not module imports. Type-only source
  // dependencies can be emitted by tsc but are not served unless reachable here.
  const graphConfig = resolve(directory, 'fixture-graph-tsconfig.json');
  await writeFile(graphConfig, JSON.stringify({ compilerOptions: { allowJs: true, noEmit: true, types: [] }, files: [...compiled.keys()] }));
  const api = new API({ cwd: directory }), reached = new Set();
  try {
    const projects = api.updateSnapshot({ openProjects: [graphConfig], openFiles: [...compiled.keys()] }).getProjects();
    function visit(path) {
      if (reached.has(path)) return;
      assert.ok(compiled.has(path), 'fixture dependency is emitted: ' + relative(emitted, path));
      const source = projects.map(project => project.program.getSourceFile(path)).find(Boolean);
      assert.ok(source, 'fixture module AST is available'); reached.add(path);
      function walk(node) {
        let specifier;
        if (isImportDeclaration(node) || isExportDeclaration(node)) specifier = node.moduleSpecifier;
        else if (isCallExpression(node) && isImportExpression(node.expression)) specifier = node.arguments[0];
        if (specifier) {
          assert.ok(isStringLiteral(specifier) && specifier.text.startsWith('.'), 'only literal relative fixture module imports');
          visit(resolve(dirname(path), specifier.text));
        }
        node.forEachChild(child => { walk(child); });
      }
      walk(source);
    }
    visit(resolve(emitted, 'scripts/fixtures/update-runtime-browser.js'));
    for (const path of reached) files.set('/fixture/' + relative(emitted, path).split(sep).join('/'), compiled.get(path));
  } finally { api.close(); }
  assert.ok(files.has(fixtureEntry) && files.has('/fixture/scripts/fixtures/update-attempts.js'));
  const evidence = await buildWeb({ outDir: app });
  assert.equal(evidence.ReleaseEnabled, 0);
  const workers = evidence.assets.filter(asset => /^assets\/vault\.worker-[A-Za-z0-9_-]+\.js$/.test(asset.path));
  assert.equal(workers.length, 1, 'reuse the exact current default-build vault Worker');
  const worker = workers[0], workerPath = '/app/' + worker.path;
  const workerBytes = await readFile(resolve(app, worker.path));
  assert.equal(sha(workerBytes), worker.sha256);
  files.set(workerPath, workerBytes);
  const graphs = [];
  for (const name of ['core-graph-document.json', 'core-graph-worker.json', 'qr-graph-worker.json']) {
    const bytes = await readFile(resolve(app, name)), graph = JSON.parse(bytes);
    assert.equal(graph.modules.some(item => /packages\/security\/src\/release-update(?:-http|-store)?\.ts$/.test(item.path)), false,
      'default document/Worker/QR graphs exclude the executable updater');
    graphs.push({ path: name, sha256: sha(bytes), modules: graph.modules.length });
  }
  const corpus = publicCorpus();
  return { files, fixtureEntry, workerPath, corpus, preparation: {
    fixture: 'native-update-runtime-controlled-composition', nativeExecuted: false,
    strictFixtureCompilation: true, fixtureModules: reached.size,
    fixtureModuleSha256: sha(JSON.stringify([...reached].map(path => ({
      path: relative(emitted, path).split(sep).join('/'), sha256: sha(compiled.get(path)),
    })).sort((a, b) => a.path.localeCompare(b.path)))),
    emittedWorker: { path: worker.path, sha256: worker.sha256 }, defaultGraphs: graphs,
    publicCorpusSha256: sha(JSON.stringify(corpus)), defaultUpdaterIncluded: false, ReleaseEnabled: 0,
  } };
}

function assertScenario(result, scenario) {
  assert.equal(result.scenario, scenario);
  assert.equal(result.ReleaseEnabled, 0); assert.equal(result.actualOriginTransition, false);
  assert.equal(result.encryptedVault, true); assert.ok(result.nativeMessages > 0); assert.ok(result.controlledFetches > 0);
  assert.deepEqual(result.attempts.map(attempt => attempt.id), result.attemptIds);
  assert.equal(new Set(result.attemptIds).size, result.attemptIds.length);
  assert.ok(result.attempts.every(attempt => attempt.state === 'completed'));
  const codes = result.attempts.map(attempt => attempt.result.ok ? 'accepted' : attempt.result.error.code);
  const expected = {
    'missing-proof': ['BACKUP_REQUIRED', 'BACKUP_REQUIRED'],
    verified: ['accepted', 'UPDATE_UNTRUSTED'],
    'persisted-mutation': ['BACKUP_REQUIRED'],
    'held-own-lock': ['BACKUP_REQUIRED', 'accepted'],
    'cancel-held-lock': ['CANCELLED'],
    'competing-opening': ['UNAVAILABLE'],
  };
  assert.deepEqual(codes, expected[scenario]);
  assert.equal(result.nativeChecks, scenario === 'held-own-lock' ? 3 : 2);
  assert.equal(result.floorWrites, scenario === 'missing-proof' ? 0 : 1);
  const transitioned = scenario === 'verified' || scenario === 'held-own-lock';
  assert.equal(result.destinationObservations, transitioned ? 1 : 0);
  assert.equal(result.ciphertextUnchanged, scenario !== 'persisted-mutation');
  assert.equal(result.afterRevision, result.beforeRevision + (scenario === 'persisted-mutation' ? 1 : 0));
  assert.equal(result.observedPending, ['held-own-lock', 'cancel-held-lock', 'competing-opening'].includes(scenario));
  assert.equal(result.lateResponseDrained, scenario === 'cancel-held-lock');
  assert.equal(result.admittedOpening, scenario === 'competing-opening');
  const usesLock = !['missing-proof', 'persisted-mutation'].includes(scenario);
  assert.equal(result.nativeLocks, usesLock ? 1 : 0);
  assert.equal(result.walletDisconnects, usesLock ? 1 : 0);
}

export async function runUpdateRuntimeBrowser(prepared) {
  let server, browser;
  const unexpected = [], results = [];
  const assets = new Map(prepared.files);
  assets.set('/', Buffer.from('<!doctype html><meta charset="utf-8"><title>Native update runtime qualification</title>'));
  try {
    server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1'), bytes = assets.get(url.pathname);
      if (request.method !== 'GET' || url.search || !bytes) {
        unexpected.push('UNEXPECTED_SERVER_REQUEST'); response.writeHead(404).end(); return;
      }
      response.writeHead(200, { 'Content-Security-Policy': policy, 'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
        'Content-Type': url.pathname === '/' ? 'text/html' : 'text/javascript' }).end(bytes);
    });
    await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
    for (const scenario of scenarios) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      try {
        await context.route('**/*', route => {
          const request = route.request(), url = new URL(request.url());
          if (request.method() === 'GET' && url.origin === origin && !url.search && assets.has(url.pathname)) return route.continue();
          unexpected.push('UNEXPECTED_NETWORK'); return route.abort();
        });
        await context.routeWebSocket(() => true, socket => { unexpected.push('UNEXPECTED_WEBSOCKET'); socket.close(); });
        await context.addInitScript(() => {
          window.__updateWalletPrompts = 0;
          const denied = async () => { window.__updateWalletPrompts++; throw Error('FIXTURE_WALLET_DENIED'); };
          window.ethereum = { request: denied, enable: denied };
          window.solana = { connect: denied, signTransaction: denied, signMessage: denied };
        });
        const page = await context.newPage(), workerUrls = [];
        page.setDefaultTimeout(30_000);
        page.on('worker', worker => workerUrls.push(worker.url()));
        page.on('pageerror', () => unexpected.push('PAGE_ERROR'));
        page.on('console', message => { if (message.type() === 'error') unexpected.push('CONSOLE_ERROR'); });
        page.on('dialog', dialog => { unexpected.push('DIALOG'); void dialog.dismiss(); });
        await page.goto(origin);
        const id = await page.evaluate(async input => {
          const { AttemptLedger } = await import('/fixture/scripts/fixtures/update-attempts.js');
          window.__updateRuntimeAttempts = new AttemptLedger();
          return window.__updateRuntimeAttempts.start(async () => {
            const { runUpdateRuntimeScenario } = await import('/fixture/scripts/fixtures/update-runtime-browser.js');
            return runUpdateRuntimeScenario(input);
          });
        }, { scenario, workerUrl: origin + prepared.workerPath, corpus: prepared.corpus });
        // Correlate completion with this exact run. The ledger also gives every
        // controller acceptance inside the run its own distinct attempt identity.
        await page.waitForFunction(id => window.__updateRuntimeAttempts.read(id).state !== 'pending', id);
        const result = await page.evaluate(id => window.__updateRuntimeAttempts.wait(id), id);
        assertScenario(result, scenario);
        assert.deepEqual(workerUrls, [origin + prepared.workerPath]);
        const surfaces = await page.evaluate(async () => ({ href: location.href, wallets: window.__updateWalletPrompts,
          local: localStorage.length, session: sessionStorage.length, caches: (await caches.keys()).length,
          serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length,
          databases: (await indexedDB.databases()).map(item => item.name).sort() }));
        assert.deepEqual(surfaces, { href: origin + '/', wallets: 0, local: 0, session: 0, caches: 0,
          serviceWorkers: 0, databases: ['p2p-offramp-vault'] });
        results.push(result);
      } finally { await context.close(); }
    }
    assert.deepEqual(unexpected, []);
    return { ...prepared.preparation, nativeExecuted: true, browser: browser.version(), platform: process.platform,
      nativeModuleWorker: true, nativeEncryptedVaultIndexedDB: true, actualOriginTransition: false,
      controlledPorts: ['HTTP bytes and route registry', 'accepted floor', 'wallet lease', 'gesture', 'destination observer', 'release clock', 'response delivery scheduling'],
      physicalWalletQualified: false, nativeAcceptedFloorQualified: false, browserActivationQualified: false,
      unexpectedRequests: 0, walletPrompts: 0, results };
  } finally {
    try { if (browser) await browser.close(); } finally {
      if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    }
  }
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { 'build-only': { type: 'boolean', default: false } } });
  const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-update-runtime-browser-'));
  try {
    const prepared = await prepareUpdateRuntimeFixture(temporary);
    console.log(JSON.stringify(values['build-only'] ? prepared.preparation : await runUpdateRuntimeBrowser(prepared)));
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
