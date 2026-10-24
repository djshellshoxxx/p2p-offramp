/** Actual Chromium enforcement in local fixtures only; not shipped UI, device or release acceptance. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { buildOfflineContentPolicy } from '../packages/security/src/content-policy.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = await mkdtemp(resolve(tmpdir(), 'p2p-content-policy-browser-'));
const profiles = Object.fromEntries(['header', 'meta'].map(delivery => [delivery,
  buildOfflineContentPolicy({ version: 1, releaseId: 'local-browser-fixture', delivery })]));
const counters = { forbiddenHttp: 0, forbiddenWebSocket: 0, frameModules: { header: 0, meta: 0 } };
const unexpectedNetwork = [];
const diagnostics = {};
const served = { document: 0, runner: 0, policyModule: 0, script: 0, style: 0, image: 0, worker: 0, workerDependency: 0 };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7XcAAAAASUVORK5CYII=', 'base64');
let browser, protectedServer, forbiddenServer, protectedOrigin, forbiddenOrigin;

// This function is serialized into a served module. Its eval attempts therefore run with page CSP.
async function runFixture(forbidden) {
  const required = ['script-src-elem', 'script-src-attr', 'script-src', 'style-src-elem', 'style-src-attr',
    'font-src', 'img-src', 'frame-src', 'object-src', 'connect-src', 'worker-src', 'form-action', 'base-uri'];
  const violations = Object.fromEntries(required.map(key => [key, 0]));
  document.addEventListener('securitypolicyviolation', event => {
    // Never retain blockedURI, documentURI, sourceFile, samples or raw browser errors.
    if (Object.hasOwn(violations, event.effectiveDirective)) violations[event.effectiveDirective]++;
  });
  const result = { ready: false, failed: false, allowed: {}, blocked: {}, violations };
  window.fixtureResult = result;
  const ownedWorkers = [];
  let workerBlobUrl;
  const deadline = performance.now() + 10_000;
  const wait = async predicate => {
    while (!predicate()) {
      if (performance.now() >= deadline) throw new Error('FIXTURE_TIMEOUT');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  const append = (name, attributes = {}) => {
    const element = document.createElement(name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    document.body.append(element);
    return element;
  };
  try {
    const initialBase = document.baseURI;
    const base = document.createElement('base'); base.href = forbidden + '/forbidden/base/'; document.head.append(base);
    result.blocked.base = document.baseURI === initialBase;

    const allowedScript = append('script', { src: '/allowed-script.js' });
    const allowedImage = append('img', { src: '/allowed.png', alt: 'local fixture' });
    const worker = new Worker('/allowed-worker.js', { type: 'module' });
    ownedWorkers.push(worker);
    worker.addEventListener('message', event => { if (event.data === 'SELF_MODULE_WORKER_OK') result.allowed.moduleWorker = true; });
    worker.addEventListener('error', () => { result.failed = true; });

    append('script', { src: forbidden + '/forbidden/script.js' });
    append('link', { rel: 'stylesheet', href: forbidden + '/forbidden/style.css' });
    const font = new FontFace('ForbiddenFixtureFont', `url("${forbidden}/forbidden/font.woff2")`);
    void font.load().catch(() => {});
    append('img', { src: forbidden + '/forbidden/image.png', alt: 'blocked fixture' });
    append('iframe', { src: forbidden + '/forbidden/frame' });
    append('object', { data: forbidden + '/forbidden/object', type: 'text/html' });
    void fetch(forbidden + '/forbidden/fetch').catch(() => {});
    try {
      const socket = new WebSocket(forbidden.replace('http:', 'ws:') + '/forbidden/socket');
      socket.addEventListener('error', () => socket.close());
    } catch { /* A synchronous CSP denial is also valid. */ }
    // A foreign constructor can fail SOP before CSP, so it cannot by itself prove worker-src.
    // Blob/data probes have execution markers and must independently produce worker-src denials.
    workerBlobUrl = URL.createObjectURL(new Blob(["postMessage('FORBIDDEN_WORKER_EXECUTED')"], { type: 'text/javascript' }));
    for (const workerUrl of [forbidden + '/forbidden/worker.js', workerBlobUrl,
      'data:text/javascript,postMessage(%22FORBIDDEN_WORKER_EXECUTED%22)']) {
      try {
        const deniedWorker = new Worker(workerUrl, { type: 'module' }); ownedWorkers.push(deniedWorker);
        deniedWorker.addEventListener('message', () => { result.failed = true; });
      } catch { /* The foreign-origin constructor may instead fail SOP synchronously. */ }
    }

    const inlineScript = document.createElement('script'); inlineScript.textContent = 'window.inlineScriptRan = true'; document.body.append(inlineScript);
    const button = append('button', { onclick: 'window.inlineEventRan = true' }); button.click();
    const inlineStyle = document.createElement('style'); inlineStyle.textContent = '#inline-style-probe { color: rgb(222, 0, 0) !important }'; document.head.append(inlineStyle);
    const styleProbe = append('div', { id: 'inline-style-probe', style: 'background-color: rgb(222, 0, 0)' });
    let evalBlocked = false, functionBlocked = false;
    try { eval('window.evalRan = true'); } catch (error) { evalBlocked = error instanceof EvalError; }
    try { new Function('window.functionRan = true')(); } catch (error) { functionBlocked = error instanceof EvalError; }
    result.blocked.eval = evalBlocked; result.blocked.newFunction = functionBlocked;

    const hostile = '<img src=x onerror="window.literalRan=true"><script>window.literalRan=true</script><a href="javascript:alert(1)">literal</a>';
    const literal = append('div'); literal.textContent = validatePlainText(hostile, 'order');
    result.blocked.literal = literal.textContent === hostile && literal.childElementCount === 0 && literal.childNodes.length === 1 && literal.firstChild.nodeType === Node.TEXT_NODE;

    const form = append('form', { action: forbidden + '/forbidden/form', method: 'post' });
    form.submit();
    await wait(() => required.every(key => violations[key] > 0) && window.allowedSelfScript === true &&
      allowedImage.complete && allowedImage.naturalWidth === 1 && result.allowed.moduleWorker === true);
    result.allowed.script = allowedScript.src === location.origin + '/allowed-script.js' && window.allowedSelfScript === true;
    result.allowed.style = getComputedStyle(styleProbe).color === 'rgb(1, 2, 3)';
    result.allowed.image = allowedImage.naturalWidth === 1;
    result.blocked.inlineScript = window.inlineScriptRan !== true;
    result.blocked.inlineEvent = window.inlineEventRan !== true;
    result.blocked.inlineStyle = getComputedStyle(styleProbe).color === 'rgb(1, 2, 3)' && getComputedStyle(styleProbe).backgroundColor === 'rgba(0, 0, 0, 0)';
    result.blocked.externalScript = window.forbiddenScriptRan !== true;
    result.blocked.evalSideEffects = window.evalRan !== true && window.functionRan !== true && window.literalRan !== true;
    result.ready = true;
  } catch { result.failed = true; result.ready = true; }
  finally { for (const worker of ownedWorkers) worker.terminate(); if (workerBlobUrl) URL.revokeObjectURL(workerBlobUrl); }
}

const metaMarkup = profile => profile.meta.map(record => 'httpEquiv' in record
  ? `<meta http-equiv="${record.httpEquiv}" content="${record.content}">`
  : `<meta name="${record.name}" content="${record.content}">`).join('');
const listen = server => new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
const originOf = server => { const address = server.address(); assert.ok(address && typeof address === 'object'); return `http://127.0.0.1:${address.port}`; };
const close = async server => { if (!server) return; server.closeAllConnections(); await new Promise(done => server.close(done)); };

try {
  const config = resolve(output, 'tsconfig.json');
  await writeFile(config, JSON.stringify({ compilerOptions: {
    target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', strict: true,
    noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, rewriteRelativeImportExtensions: true,
    rootDir: root, outDir: output, lib: ['ES2023', 'DOM'], types: [], skipLibCheck: false,
  }, files: [resolve(root, 'packages/security/src/content-policy.ts')] }));
  execFileSync(resolve(root, 'node_modules/.bin/tsc'), ['-p', config], { cwd: root, stdio: 'inherit' });
  const policyModule = await readFile(resolve(output, 'packages/security/src/content-policy.js'));

  forbiddenServer = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    response.setHeader('Cache-Control', 'no-store');
    if (pathname === '/parent/header' || pathname === '/parent/meta') {
      const delivery = pathname.split('/').at(-1);
      response.setHeader('Content-Type', 'text/html');
      // Install the parent listener before parsing the iframe, avoiding a fast-child reply race.
      response.end(`<!doctype html><title>Unprotected local framing parent</title><script src="/parent.js"></script><iframe src="${protectedOrigin}/frame/${delivery}"></iframe>`); return;
    }
    if (pathname === '/parent.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(`window.frameExecuted = false; addEventListener('message', event => { if (event.origin === ${JSON.stringify(protectedOrigin)} && event.source === document.querySelector('iframe').contentWindow && event.data === 'PROTECTED_FRAME_MODULE_OK') window.frameExecuted = true; });`); return;
    }
    if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    counters.forbiddenHttp++;
    response.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript' : 'text/plain');
    response.end(pathname.endsWith('.js') ? 'window.forbiddenScriptRan = true' : 'FORBIDDEN_RESOURCE_REACHED');
  });
  forbiddenServer.on('upgrade', (_request, socket) => { counters.forbiddenWebSocket++; socket.destroy(); });
  await listen(forbiddenServer); forbiddenOrigin = originOf(forbiddenServer);

  protectedServer = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const documentMatch = /^\/(fixture|frame)\/(header|meta)$/.exec(pathname);
    if (documentMatch) {
      served.document++;
      const [, kind, delivery] = documentMatch, profile = profiles[delivery];
      for (const [key, value] of Object.entries(profile.headers)) response.setHeader(key, value);
      response.setHeader('Content-Type', 'text/html');
      // Generated meta data is fixed trusted policy text, before every resource-bearing element.
      const resource = kind === 'fixture' ? '<link rel="stylesheet" href="/allowed-style.css"><script type="module" src="/runner.js"></script>'
        : `<script type="module" src="/frame-module.js?delivery=${delivery}"></script>`;
      response.end(`<!doctype html><html><head><meta charset="utf-8">${metaMarkup(profile)}<title>Local content-policy fixture</title>${resource}</head><body></body></html>`); return;
    }
    if (pathname === '/content-policy.js') { served.policyModule++; response.setHeader('Content-Type', 'text/javascript'); response.end(policyModule); return; }
    if (pathname === '/runner.js') { served.runner++; response.setHeader('Content-Type', 'text/javascript'); response.end(`import { validatePlainText } from '/content-policy.js';\n(${runFixture.toString()})(${JSON.stringify(forbiddenOrigin)});`); return; }
    if (pathname === '/allowed-script.js') { served.script++; response.setHeader('Content-Type', 'text/javascript'); response.end('window.allowedSelfScript = true'); return; }
    if (pathname === '/allowed-style.css') { served.style++; response.setHeader('Content-Type', 'text/css'); response.end('#inline-style-probe { color: rgb(1, 2, 3) }'); return; }
    if (pathname === '/allowed.png') { served.image++; response.setHeader('Content-Type', 'image/png'); response.end(png); return; }
    if (pathname === '/allowed-worker.js') { served.worker++; response.setHeader('Content-Type', 'text/javascript'); response.end("import { token } from '/allowed-worker-dependency.js'; postMessage(token);"); return; }
    if (pathname === '/allowed-worker-dependency.js') { served.workerDependency++; response.setHeader('Content-Type', 'text/javascript'); response.end("export const token = 'SELF_MODULE_WORKER_OK';"); return; }
    if (pathname === '/frame-module.js') {
      const delivery = new URL(request.url, protectedOrigin).searchParams.get('delivery');
      if (delivery === 'header' || delivery === 'meta') counters.frameModules[delivery]++;
      response.setHeader('Content-Type', 'text/javascript'); response.end(`parent.postMessage('PROTECTED_FRAME_MODULE_OK', ${JSON.stringify(forbiddenOrigin)});`); return;
    }
    response.writeHead(404); response.end();
  });
  await listen(protectedServer); protectedOrigin = originOf(protectedServer);

  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if ((url.origin === protectedOrigin || url.origin === forbiddenOrigin) && url.hostname === '127.0.0.1') return route.continue();
    unexpectedNetwork.push('NON_LOOPBACK_OR_UNEXPECTED_ORIGIN'); return route.abort();
  });
  // WebSocket routes do not pass through the HTTP route handler. Unknown destinations are denied
  // independently; the forbidden loopback WebSocket is left to CSP, not intercepted as a false pass.
  await context.routeWebSocket(url => new URL(url).origin !== forbiddenOrigin.replace('http:', 'ws:'), socket => {
    unexpectedNetwork.push('UNEXPECTED_WEBSOCKET_ORIGIN'); socket.close();
  });

  for (const delivery of ['header', 'meta']) {
    const profile = profiles[delivery];
    assert.equal(profile.manifest.framingProtected, false);
    assert.deepEqual(profile.manifest.connectOrigins, []);
    const page = await context.newPage();
    const response = await page.goto(`${protectedOrigin}/fixture/${delivery}`, { waitUntil: 'commit' });
    assert.ok(response); assert.equal(response.status(), 200);
    const headers = response.headers();
    const document = await response.text();
    if (delivery === 'header') {
      for (const [name, value] of Object.entries(profile.headers)) assert.equal(headers[name.toLowerCase()], value);
      assert.equal(document.includes('http-equiv="Content-Security-Policy"'), false);
    } else {
      assert.equal(headers['content-security-policy'], undefined);
      assert.equal(headers['referrer-policy'], undefined);
      assert.ok(document.indexOf(metaMarkup(profile)) > 0);
      assert.ok(document.indexOf(metaMarkup(profile)) < document.indexOf('<link'));
      assert.ok(document.indexOf(metaMarkup(profile)) < document.indexOf('<script'));
      assert.equal(profile.csp.includes('frame-ancestors'), false);
    }
    try { await page.waitForFunction(() => window.fixtureResult?.ready === true, undefined, { timeout: 20_000 }); }
    catch { throw new Error(`FIXTURE_RUNNER_NOT_READY ${JSON.stringify({ served, forbiddenHttp: counters.forbiddenHttp, unexpected: unexpectedNetwork.length, state: await page.evaluate(() => ({ document: document.readyState, result: window.fixtureResult ?? null })) })}`); }
    const result = await page.evaluate(() => window.fixtureResult);
    assert.equal(result.failed, false, `${delivery}: served runner failed; directive counters ${JSON.stringify(result.violations)}`);
    assert.deepEqual(result.allowed, { moduleWorker: true, script: true, style: true, image: true });
    for (const [name, passed] of Object.entries(result.blocked)) assert.equal(passed, true, `${delivery}: ${name}`);
    assert.equal(Object.keys(result.blocked).length, 9);
    for (const count of Object.values(result.violations)) assert.ok(Number.isInteger(count) && count > 0);
    assert.ok(result.violations['script-src'] >= 2, 'Both eval and new Function must be refused');
    assert.ok(result.violations['script-src-elem'] >= 2, 'Both foreign and inline scripts must be refused');
    assert.ok(result.violations['style-src-elem'] >= 2, 'Both foreign and inline stylesheets must be refused');
    assert.ok(result.violations['connect-src'] >= 2, 'Both fetch and WebSocket must be refused');
    assert.ok(result.violations['worker-src'] >= 2, 'Both blob and data Workers must be refused');
    assert.equal(page.url(), `${protectedOrigin}/fixture/${delivery}`);
    diagnostics[delivery] = result.violations;
    await page.close();
  }

  const framed = {};
  for (const delivery of ['header', 'meta']) {
    const page = await context.newPage();
    await page.goto(`${forbiddenOrigin}/parent/${delivery}`, { waitUntil: 'domcontentloaded' });
    if (delivery === 'header') {
      await page.waitForFunction(() => document.querySelector('iframe') !== null);
      if (!page.frames().some(frame => frame.parentFrame() !== null && frame.url() === 'chrome-error://chromewebdata/')) await page.waitForEvent('framenavigated', {
        predicate: frame => frame.parentFrame() !== null && frame.url() === 'chrome-error://chromewebdata/', timeout: 10_000,
      }).catch(error => {
        // The blocked navigation can finish during page.goto, before the listener is installed.
        if (!page.frames().some(frame => frame.parentFrame() !== null && frame.url() === 'chrome-error://chromewebdata/')) throw error;
      });
      assert.equal(await page.evaluate(() => window.frameExecuted), false);
      assert.equal(counters.frameModules.header, 0);
      framed.headerBlocked = true;
    } else {
      await page.waitForFunction(() => window.frameExecuted === true, undefined, { timeout: 10_000 });
      assert.equal(counters.frameModules.meta, 1);
      assert.ok(page.frames().some(frame => frame.url() === `${protectedOrigin}/frame/meta`));
      framed.metaPermitsFraming = true;
    }
    await page.close();
  }
  assert.deepEqual(unexpectedNetwork, []);
  assert.equal(counters.forbiddenHttp, 0, 'CSP must prevent requests reaching the second loopback server');
  assert.equal(counters.forbiddenWebSocket, 0, 'CSP must prevent the second loopback WebSocket handshake');
  console.log(JSON.stringify({ fixture: 'content-policy-local-chromium', browser: browser.version(), profiles: ['header', 'meta'],
    diagnostics, framing: framed, forbiddenHttpRequests: counters.forbiddenHttp, forbiddenWebSocketRequests: counters.forbiddenWebSocket,
    unexpectedOutgoingRequests: unexpectedNetwork.length, framingAttestation: false, releaseAcceptance: false }));
  await context.close();
} finally {
  await browser?.close();
  await close(protectedServer); await close(forbiddenServer);
  await rm(output, { recursive: true, force: true });
}
