/** Loopback native Chromium evidence; no external service, credentials or release authority. */
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
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-locator-'));
let server, browser;
try {
  const vectorBytes = await readFile(resolve(root, 'packages/security/test/fixtures/release-locator-openssl.json'));
  const corpus = JSON.parse(vectorBytes); assert.ok(vectorBytes.length < 24 * 1024);
  const modules = new Set();
  await build({ configFile: false, logLevel: 'warn', plugins: [{ name: 'locator-qualified-fixture-graph', generateBundle(_options, output) {
    for (const chunk of Object.values(output)) if (chunk.type === 'chunk') for (const [name, info] of Object.entries(chunk.modules)) if (info.renderedLength) modules.add(name);
  } }], build: { outDir: temporary, emptyOutDir: true, target: 'es2023', minify: false, sourcemap: false,
    lib: { entry: resolve(root, 'scripts/fixtures/release-locator-browser.mjs'), formats: ['es'], fileName: () => 'qualification.js' } } });
  assert.ok([...modules].some(name => name.endsWith('/packages/security/src/release-locator.ts')));
  assert.equal([...modules].some(name => /node_modules|apps\/web|packages\/(?:wallet|identity)|locator-fixture/.test(name)), false);
  const worker = `import { runLocatorQualification } from './qualification.js'; self.onmessage = async event => {
    try { self.postMessage({ok:true,result:await runLocatorQualification(event.data)}); }
    catch { self.postMessage({ok:false,code:'LOCATOR_WORKER_ORACLE'}); }
  };`;
  await writeFile(resolve(temporary, 'worker.js'), worker);
  const assets = new Map([['/qualification.js', await readFile(resolve(temporary, 'qualification.js'))], ['/worker.js', Buffer.from(worker)]]);
  server = createServer((request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (path === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Local locator proof</title>'); return; }
    if (assets.has(path)) { response.setHeader('Content-Type', 'text/javascript'); response.end(assets.get(path)); return; }
    response.writeHead(404); response.end();
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' }); let unexpected = 0, errors = 0, messages = 0;
  await context.route('**/*', route => {
    const url = new URL(route.request().url()); if (url.origin === origin && ['/', '/qualification.js', '/worker.js'].includes(url.pathname)) return route.continue();
    unexpected++; return route.abort();
  });
  const page = await context.newPage(); page.on('pageerror', () => errors++); page.on('console', () => messages++); await page.goto(origin);
  const documentResult = await page.evaluate(async corpus => (await import('/qualification.js')).runLocatorQualification(corpus), corpus);
  const workerResult = await page.evaluate(corpus => new Promise((done, fail) => {
    const worker = new Worker('/worker.js', { type: 'module' });
    const timer = setTimeout(() => { worker.terminate(); fail(Error('LOCATOR_WORKER_TIMEOUT')); }, 30000);
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); fail(Error('LOCATOR_WORKER_ERROR')); };
    worker.onmessage = event => { clearTimeout(timer); worker.terminate(); event.data.ok ? done(event.data.result) : fail(Error(event.data.code)); };
    worker.postMessage(corpus);
  }), corpus);
  assert.equal(documentResult.runtime, 'document'); assert.equal(workerResult.runtime, 'dedicated-module-worker');
  const { runtime: _doc, ...d } = documentResult, { runtime: _worker, ...w } = workerResult; assert.deepEqual(d, w);
  const surfaces = await page.evaluate(async () => ({ localStorage: localStorage.length, sessionStorage: sessionStorage.length, databases: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length, serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length }));
  assert.deepEqual(Object.values(surfaces), [0, 0, 0, 0, 0]); assert.equal(unexpected, 0); assert.equal(errors, 0); assert.equal(messages, 0);
  console.log(JSON.stringify({ fixture: 'G15-locator-local-public-proof', browser: browser.version(), documentResult, workerResult, surfaces, unexpectedRequests: unexpected,
    vectorSha256: createHash('sha256').update(vectorBytes).digest('hex'), appIncluded: false, providerApproved: false, releaseEnabled: false,
    renderedModules: [...modules].map(name => name.replace(root, '')).sort() }));
} finally {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await rm(temporary, { recursive: true, force: true });
}
