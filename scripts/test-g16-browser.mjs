/** Isolated G16 PUBLIC-DATA qualification. Local fixture only, outside the emitted application.
 * Does not sign in the browser, ask a wallet, approve a provider, trust a deployment or enable spending.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { fixture, acceptances, privateVectors } from '../packages/wallet/test/lib/g16-bundle-fixture.mjs';
import { verifyEvmAgreementBundle } from '../packages/wallet/src/evm-agreement.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-g16-private-browser-'));
const sha = data => createHash('sha256').update(data).digest('hex');
const fixtureHashes = {
  'packages/wallet/test/fixtures/eip712-keccak-vectors.json': '88e7a0c0d7cc82c0e5a73026d1e8afff2b427b5240abc3ab2182e8a20dd9d828',
  'packages/wallet/test/fixtures/g16-evm-independent.json': 'e876b2f6ee1cb8a2088d64215749038b55ecfbfe66877860eb6f27561370db70',
  'packages/domain/test/fixtures/g16-vectors.json': 'c53e04a786c2d74b7aefe7e2ed03178c202f32beb6d51de0c437de508b29b5af',
};
const policy = "default-src 'none'; script-src 'self'; connect-src 'none'; worker-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'; frame-ancestors 'none'";
let server, browser;
try {
  const providerVersions = {}, providerManifestHashes = {};
  const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json')));
  for (const name of ['@noble/hashes', '@noble/curves']) {
    const bytes = await readFile(resolve(root, 'node_modules', name, 'package.json')), installed = JSON.parse(bytes);
    assert.equal(installed.version, '2.4.0', 'QUALIFIED_PROVIDER_PIN');
    assert.equal(lock.packages['node_modules/' + name].version, installed.version, 'LOCKED_PROVIDER_PIN');
    providerVersions[name] = installed.version; providerManifestHashes[name] = sha(bytes);
  }
  const fixtures = {};
  for (const [name, expected] of Object.entries(fixtureHashes)) {
    const bytes = await readFile(resolve(root, name)); assert.equal(sha(bytes), expected, 'RETAINED_FIXTURE_HASH');
    fixtures[name] = JSON.parse(bytes);
  }
  const bundles = [await fixture(), await fixture(structuredClone(privateVectors.privateAgreements[1].input))];
  const erc20 = await fixture(); erc20.terms.assetKind = 'erc20'; erc20.terms.asset = '0x' + '11'.repeat(20);
  erc20.acceptances = acceptances(erc20.domain, erc20.terms); bundles.push(erc20);
  const nodeDigests = [];
  for (const bundle of bundles) {
    const result = await verifyEvmAgreementBundle(bundle, { isCurrent: () => true });
    assert.equal(result.ok, true, 'SYNTHETIC_NODE_BUNDLE_BASELINE');
    nodeDigests.push(result.value.termsHash);
  }
  // No private keys cross the fixture boundary: only existing public synthetic recipe inputs/signatures.
  const corpus = { keccak: fixtures[Object.keys(fixtureHashes)[0]], evm: fixtures[Object.keys(fixtureHashes)[1]],
    private: fixtures[Object.keys(fixtureHashes)[2]], nodeDigests,
    bundles: bundles.map(bundle => ({ ...bundle, acceptances: bundle.acceptances.map(a => ({ ...a, signature: Array.from(a.signature) })) })) };
  assert.ok(Buffer.byteLength(JSON.stringify(corpus)) < 128 * 1024, 'FIXTURE_CORPUS_BOUND');
  const modules = new Set();
  await build({ configFile: false, logLevel: 'warn', plugins: [{ name: 'private-fixture-graph', generateBundle(_options, output) {
    for (const chunk of Object.values(output)) if (chunk.type === 'chunk') for (const name of Object.keys(chunk.modules)) modules.add(name);
  } }], build: { outDir: temporary, emptyOutDir: true, target: 'es2023', minify: false, sourcemap: false,
    lib: { entry: resolve(root, 'scripts/fixtures/g16-browser.mjs'), formats: ['es'], fileName: () => 'qualification.js' } } });
  assert.ok([...modules].some(name => name.endsWith('/packages/wallet/src/evm-agreement.ts')), 'FIXTURE_USES_REAL_VERIFIER');
  assert.equal([...modules].some(name => /g16-bundle-fixture|packages\/identity|evm-adapter|apps\/web/.test(name)), false, 'PRIVATE_FIXTURE_GRAPH');
  const worker = `import { runG16BrowserQualification } from './qualification.js';\nself.onmessage = async event => {\n try { self.postMessage({ ok: true, result: await runG16BrowserQualification(event.data) }); }\n catch (error) { self.postMessage({ ok: false, code: /^G16_BROWSER_[A-Z_]+$/.test(error?.message) ? error.message : 'G16_BROWSER_UNEXPECTED_FAILURE' }); }\n};\n`;
  await writeFile(resolve(temporary, 'worker.js'), worker);
  const assets = new Map([['/qualification.js', await readFile(resolve(temporary, 'qualification.js'))], ['/worker.js', Buffer.from(worker)]]);
  const requests = [];
  server = createServer((request, response) => {
    response.setHeader('Content-Security-Policy', policy); response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    requests.push(path);
    if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Private local G16 qualification</title>'); return; }
    if (assets.has(path)) { response.setHeader('Content-Type', 'text/javascript'); response.end(assets.get(path)); return; }
    response.writeHead(404); response.end();
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  let unexpectedRequests = 0, consoleMessages = 0, pageErrors = 0;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && ['/', '/qualification.js', '/worker.js'].includes(url.pathname)) return route.continue();
    unexpectedRequests++; return route.abort();
  });
  const page = await context.newPage(); page.on('console', () => { consoleMessages++; }); page.on('pageerror', () => { pageErrors++; });
  await page.goto(origin);
  const documentResult = await page.evaluate(async corpus => {
    const { runG16BrowserQualification } = await import('/qualification.js');
    return runG16BrowserQualification(corpus);
  }, corpus);
  const workerResult = await page.evaluate(corpus => new Promise((done, fail) => {
    const worker = new Worker('/worker.js', { type: 'module' });
    worker.onerror = () => { worker.terminate(); fail(new Error('G16_WORKER_RUNTIME_ERROR')); };
    worker.onmessage = event => { worker.terminate(); event.data.ok ? done(event.data.result) : fail(new Error(event.data.code)); };
    worker.postMessage(corpus);
  }), corpus);
  assert.equal(documentResult.runtime, 'document'); assert.equal(workerResult.runtime, 'dedicated-module-worker');
  const { runtime: _documentRuntime, ...doc } = documentResult, { runtime: _workerRuntime, ...work } = workerResult;
  assert.deepEqual(doc, work, 'DOCUMENT_WORKER_PARITY');
  assert.equal(unexpectedRequests, 0); assert.equal(consoleMessages, 0); assert.equal(pageErrors, 0);
  const privateSurfaces = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length,
    databases: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).length : null,
    cacheEntries: (await caches.keys()).length, serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length }));
  assert.deepEqual(privateSurfaces, { local: 0, session: 0, databases: 0, cacheEntries: 0, serviceWorkers: 0 });
  for (const [name, expected] of Object.entries(fixtureHashes)) assert.equal(sha(await readFile(resolve(root, name))), expected, 'RETAINED_FIXTURE_CHANGED');
  console.log(JSON.stringify({ fixture: 'private-g16-public-data-chromium', browser: browser.version(), node: process.versions.node,
    providerVersions, providerManifestHashes, fixtureHashes, document: documentResult, worker: workerResult,
    browserArtifactSha256: sha(assets.get('/qualification.js')), fixtureModuleCount: modules.size, allowedFixturePaths: [...new Set(requests)].sort(),
    unexpectedRequests, consoleMessages, pageErrors, privateSurfaces,
    integrationFixtureProvenance: 'Node-only existing Noble-family deterministic synthetic signing; not independent qualification',
    appInclusion: false, providerApproval: false, auditAcceptance: false, deviceAcceptance: false, releaseEnabled: 0, economicPreparationAllowed: false }));
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(done => server.close(done));
  await rm(temporary, { recursive: true, force: true });
}
