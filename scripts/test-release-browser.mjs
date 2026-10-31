/** Owned loopback G15 public-data qualification only; no app/provider/release approval. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { fixture } from '../packages/security/test/lib/release-fixture.mjs';
import { registryFixture } from '../packages/security/test/lib/release-registry-fixture.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-g15-'));
let server, browser;
try {
  const f = fixture(), vectorBytes = await readFile(resolve(root, 'packages/security/test/fixtures/rfc6979-p256-public.json'));
  const corpus = { publicVector: JSON.parse(vectorBytes), manifestBytes: Array.from(f.bytes), envelope: f.envelope, keys: [f.key], channel: 'fixture-beta',
    assets: f.assets.map(a => ({ path: a.path, bytes: Array.from(a.bytes) })), wrongDomainEnvelope: f.makeEnvelope(f.bytes, 'p2p-offramp/release-locator/v1\n') };
  const registry = registryFixture();
  corpus.registry = { manifestBytes: Array.from(registry.bytes), envelope: registry.envelope, keys: [registry.key],
    assets: registry.assets.map(a => ({ path: a.path, bytes: Array.from(a.bytes) })), registryPath: registry.registryPath, registryBytes: Array.from(registry.registryBytes) };
  assert.ok(Buffer.byteLength(JSON.stringify(corpus)) < 16 * 1024);
  const modules = new Set();
  await build({ configFile: false, logLevel: 'warn', plugins: [{ name: 'g15-qualified-fixture-graph', generateBundle(_options, output) {
    for (const chunk of Object.values(output)) if (chunk.type === 'chunk') for (const [name, info] of Object.entries(chunk.modules)) if (info.renderedLength) modules.add(name);
  } }], build: { outDir: temporary, emptyOutDir: true, target: 'es2023', minify: false, sourcemap: false,
    lib: { entry: resolve(root, 'scripts/fixtures/release-browser.mjs'), formats: ['es'], fileName: () => 'qualification.js' } } });
  assert.ok([...modules].some(name => name.endsWith('/packages/security/src/release-manifest.ts')));
  assert.equal([...modules].some(name => /node_modules|apps\/web|packages\/(?:wallet|identity)|release-fixture/.test(name)), false);
  const worker = `import { runReleaseQualification } from './qualification.js'; self.onmessage = async event => {
    try { self.postMessage({ ok: true, result: await runReleaseQualification(event.data) }); }
    catch { self.postMessage({ ok: false, code: 'G15_WORKER_ORACLE' }); }
  };`;
  await writeFile(resolve(temporary, 'worker.js'), worker);
  const assets = new Map([['/qualification.js', await readFile(resolve(temporary, 'qualification.js'))], ['/worker.js', Buffer.from(worker)]]);
  server = createServer((request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Private G15 qualification</title>'); return; }
    if (assets.has(path)) { response.setHeader('Content-Type', 'text/javascript'); response.end(assets.get(path)); return; }
    response.writeHead(404); response.end();
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' }); let unexpected = 0, pageErrors = 0, consoleMessages = 0;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && ['/', '/qualification.js', '/worker.js'].includes(url.pathname)) return route.continue();
    unexpected++; return route.abort();
  });
  const page = await context.newPage(); page.on('pageerror', () => pageErrors++); page.on('console', () => consoleMessages++);
  await page.goto(origin);
  const documentResult = await page.evaluate(async corpus => (await import('/qualification.js')).runReleaseQualification(corpus), corpus);
  const workerResult = await page.evaluate(corpus => new Promise((done, fail) => {
    const worker = new Worker('/worker.js', { type: 'module' });
    const timer = setTimeout(() => { worker.terminate(); fail(Error('G15_WORKER_TIMEOUT')); }, 30000);
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); fail(Error('G15_WORKER_ERROR')); };
    worker.onmessage = event => { clearTimeout(timer); worker.terminate(); event.data.ok ? done(event.data.result) : fail(Error(event.data.code)); };
    worker.postMessage(corpus);
  }), corpus);
  assert.equal(documentResult.runtime, 'document'); assert.equal(workerResult.runtime, 'dedicated-module-worker');
  const { runtime: _doc, ...d } = documentResult, { runtime: _worker, ...w } = workerResult; assert.deepEqual(d, w);
  const surfaces = await page.evaluate(async () => ({ localStorage: localStorage.length, sessionStorage: sessionStorage.length, databases: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length, serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length }));
  assert.deepEqual(Object.values(surfaces), [0, 0, 0, 0, 0]); assert.equal(unexpected, 0); assert.equal(pageErrors, 0); assert.equal(consoleMessages, 0);
  console.log(JSON.stringify({ fixture: 'G15-public-data-local-qualification', browser: browser.version(), documentResult, workerResult, surfaces, unexpectedRequests: unexpected,
    vectorSha256: createHash('sha256').update(vectorBytes).digest('hex'), appIncluded: false, providerApproved: false, releaseEnabled: false, renderedModules: [...modules].map(name => name.replace(root, '')).sort() }));
} finally {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await rm(temporary, { recursive: true, force: true });
}
