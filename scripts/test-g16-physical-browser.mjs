/** Private qualification only: real document→MessagePort→Worker scheduling of the existing host.
 * Fixture controls are trusted test instructions, NOT the future control protocol or application API.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { fixture, privateVectors } from '../packages/wallet/test/lib/g16-bundle-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-g16-physical-'));
const sha = data => createHash('sha256').update(data).digest('hex');
const hostPath = 'packages/wallet/test/lib/evm-agreement-host.ts';
const expectedHostHash = '21233bf9feb82d6109c020f41e9d4a5896ad8297d8407148cf31023a57276e37';
const policy = "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'";
let server, browser;
try {
  assert.equal(sha(await readFile(resolve(root, hostPath))), expectedHostHash, 'QUALIFIED_HOST_SOURCE');
  const bundle = await fixture(), heldBundle = await fixture(structuredClone(privateVectors.privateAgreements[1].input));
  const signatureArrays = [bundle, heldBundle].map(b => b.acceptances.map(a => Array.from(a.signature)));
  const modules = new Set();
  await build({ configFile: false, logLevel: 'warn', plugins: [{ name: 'physical-fixture-graph', generateBundle(_options, output) {
    for (const chunk of Object.values(output)) if (chunk.type === 'chunk') for (const name of Object.keys(chunk.modules)) modules.add(name);
  } }], build: { outDir: temporary, emptyOutDir: true, target: 'es2023', minify: false, sourcemap: false,
    lib: { entry: resolve(root, 'scripts/fixtures/g16-physical-worker.mjs'), formats: ['es'], fileName: () => 'worker.js' } } });
  assert.ok([...modules].some(p => p.endsWith('/' + hostPath)), 'REAL_QUALIFIED_HOST');
  assert.ok([...modules].some(p => p.endsWith('/packages/wallet/src/evm-agreement.ts')), 'REAL_BUNDLE_VERIFIER');
  assert.equal([...modules].some(p => /g16-bundle-fixture|packages\/identity|evm-adapter|apps\/web|evm-agreement-control/.test(p)), false, 'NO_APP_SIGNER_OR_RESERVED_CONTROL');
  const asset = await readFile(resolve(temporary, 'worker.js'));
  const wrapper = `<!doctype html><title>Private physical-settlement fixture</title>`;
  server = createServer((request, response) => {
    response.setHeader('Content-Security-Policy', policy); response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.url === '/') { response.setHeader('Content-Type', 'text/html'); response.end(wrapper); }
    else if (request.url === '/worker.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(asset); }
    else { response.writeHead(404); response.end(); }
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  let unexpectedRequests = 0, consoleMessages = 0, pageErrors = 0;
  await context.route('**/*', async route => {
    const u = route.request().url();
    if (u === origin + '/' || u === origin + '/worker.js') await route.continue();
    else { unexpectedRequests++; await route.abort(); }
  });
  const page = await context.newPage();
  page.on('console', () => consoleMessages++); page.on('pageerror', () => pageErrors++);
  await page.goto(origin + '/', { waitUntil: 'load' });
  const result = await page.evaluate(async ({ bundle, heldBundle, expectedHostHash }) => {
    let assertions = 0;
    for (const b of [bundle, heldBundle]) for (const acceptance of b.acceptances) acceptance.signature = Uint8Array.from(acceptance.signature);
    const check = (value, code) => { assertions++; if (!value) throw Error('PHYSICAL_BROWSER_' + code); };
    const records = [], privatePattern = /PRIVATE-FIXTURE|paymentInstructions|agreementSalt|signature|https:\/\//;
    const session = async options => {
      const worker = new Worker('/worker.js', { type: 'module' }), channel = new MessageChannel();
      const events = [], waiters = [];
      let serial = 0, failed = false;
      channel.port1.onmessage = event => {
        const m = event.data;
        if (m.type === 'fixtureError' || m.type === 'fixtureUnhandled') { fail(); return; }
        if (privatePattern.test(JSON.stringify(m))) { failed = true; for (const w of waiters.splice(0)) w.reject(Error('PHYSICAL_BROWSER_PRIVATE_FRAME')); return; }
        events.push(m);
        for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].match(m)) { const [w] = waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(m); }
      };
      const fail = () => { failed = true; for (const w of waiters.splice(0)) { clearTimeout(w.timer); w.reject(Error('PHYSICAL_BROWSER_WORKER_FAILURE')); } };
      worker.onerror = fail; channel.port1.onmessageerror = fail;
      const wait = match => {
        const found = events.find(match); if (found) return Promise.resolve(found);
        if (failed) return Promise.reject(Error('PHYSICAL_BROWSER_CHANNEL_FAILED'));
        return new Promise((resolve, reject) => {
          const w = { match, resolve, reject, timer: undefined };
          w.timer = setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); reject(Error('PHYSICAL_BROWSER_EVENT_TIMEOUT')); }, 45000);
          waiters.push(w);
        });
      };
      const send = (command, data = {}) => { const id = ++serial; channel.port1.postMessage({ id, command, ...data }); return id; };
      const response = async (command, data) => { const id = send(command, data); return wait(m => m.id === id && m.type === 'response'); };
      worker.postMessage({ port: channel.port2, options }, [channel.port2]);
      await wait(m => m.type === 'ready');
      return { events, wait, send, response, close: () => { for (const w of waiters.splice(0)) { clearTimeout(w.timer); w.reject(Error('PHYSICAL_BROWSER_FIXTURE_CLOSED')); } channel.port1.close(); worker.terminate(); } };
    };
    // Coherent request proves the fixture really uses the existing verifier; no browser signing.
    let s = await session({ holdAt: 0 });
    try {
      const before = JSON.stringify(bundle), answer = await s.response('check', { bundle, requestId: 1 });
      check(answer.code === 'OK' && answer.termsHash === bundle.acceptances[0].termsHash, 'COHERENT_VERIFIER');
      check(JSON.stringify(bundle) === before, 'SOURCE_UNCHANGED');
      const id = s.send('drain'); const drained = await s.wait(m => m.type === 'drained' && m.id === id);
      check(drained.state.terminal && !drained.state.held && drained.active === 0, 'COHERENT_PHYSICAL_DRAIN');
      records.push({ schedule: 'normal', verdict: answer.code });
    } finally { s.close(); }
    for (const holdAt of [1, 2]) for (const action of ['invalidate', 'dispose', 'timeout']) for (const backend of ['resolve', 'reject']) {
      s = await session({ holdAt });
      try {
        const checkId = s.send('check', { bundle: heldBundle, requestId: 1 });
        const held = await s.wait(m => m.type === 'held' && m.at === holdAt);
        check(held.active === 1 && held.capturedNonzero === true && held.wiped === false, 'POSITIVE_CAPTURE_BEFORE_WIPE');
        if (action === 'timeout') {
          const almost = await s.response('advance', { elapsed: 29999 });
          check(almost.state.held && !almost.state.terminal && !s.events.some(m => m.id === checkId && m.type === 'response'), '29999_STILL_PENDING');
        }
        const control = await s.response(action === 'timeout' ? 'advance' : action, action === 'timeout' ? { elapsed: 30000 } : {});
        check(control.state.held && control.active === 1, 'LOGICAL_CONTROL_RETAINS_PHYSICAL_SLOT');
        check(control.wiped === true, 'CANCELLED_ENCODINGS_WIPED');
        const logical = await s.wait(m => m.id === checkId && m.type === 'response');
        check(logical.code === (action === 'timeout' ? 'TIMEOUT' : 'SUPPRESSED'), 'LOGICAL_OUTCOME');
        if (action === 'invalidate') {
          check(control.state.generation === 1 && !control.state.terminal, 'GENERATION_ADVANCED');
          const busy = await s.response('check', { bundle, requestId: 2 });
          check(busy.code === 'BUSY' && busy.hashes === holdAt, 'BUSY_UNTIL_SETTLEMENT');
        } else check(control.state.terminal, 'LOGICALLY_TERMINAL');
        const drainId = s.send('drain');
        const draining = await s.wait(m => m.type === 'draining' && m.id === drainId);
        check(draining.state.terminal && draining.state.held, 'DRAINING_IS_NOT_DRAINED');
        const barrier = await s.response('state');
        check(barrier.state.held && !s.events.some(m => m.type === 'drained'), 'MESSAGE_BARRIER_STILL_HELD');
        await s.response('release', { backend });
        const drained = await s.wait(m => m.type === 'drained' && m.id === drainId);
        check(drained.state.terminal && !drained.state.held && drained.active === 0, 'ACTUAL_DRAIN_COMPLETION');
        check(drained.hashes === holdAt && drained.maximumActive === 1 && drained.wiped && drained.unhandled === 0, 'NO_STALE_HASH_OR_LEAK');
        check(drained.delays.length === 1 && drained.delays[0] === 30000, 'PRODUCTION_DEADLINE_UNCHANGED');
        const observed = await s.response('observe');
        check(observed.unhandled === 0 && !observed.state.held && observed.active === 0, 'POST_DRAIN_NOTIFICATION_WINDOW');
        const late = await s.response('check', { bundle, requestId: 3 });
        check(late.code === 'SUPPRESSED' && late.hashes === holdAt && !late.state.held && late.unhandled === 0, 'TERMINAL_HOST_REFUSES_NEW_WORK');
        check(s.events.filter(m => m.type === 'response' && m.id === checkId).length === 1, 'NO_LATE_RESULT');
        // Actual observed drain precedes closing this Worker and creating the next one.
        records.push({ holdAt, action, backend, logical: logical.code, physicalDrained: true });
      } finally { s.close(); }
    }
    const surfaces = { local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length,
      caches: (await caches.keys()).length, serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length };
    check(Object.values(surfaces).every(n => n === 0), 'NO_PERSISTENT_DATA');
    return { assertions, schedules: records, surfaces, sourceHostSha256: expectedHostHash, actualMessagePortAndDedicatedWorker: true,
      timeoutMode: 'trusted monotonic/timer fixture at29999/30000; not native30second wall-clock acceptance',
      unhandledObservation: 'event reporting through post-drain task checkpoint; not indefinite absence proof',
      heldSchedulesUseNonemptyCapabilities: true, fixtureControlsOnly: true, productionControlProtocolImplemented: false, appIncluded: false, spendingEnabled: false };
  }, { bundle: { ...bundle, acceptances: bundle.acceptances.map(a => ({ ...a, signature: Array.from(a.signature) })) },
    heldBundle: { ...heldBundle, acceptances: heldBundle.acceptances.map(a => ({ ...a, signature: Array.from(a.signature) })) }, expectedHostHash });
  assert.equal(result.schedules.length, 13); assert.equal(unexpectedRequests, 0); assert.equal(consoleMessages, 0); assert.equal(pageErrors, 0);
  assert.deepEqual([bundle, heldBundle].map(b => b.acceptances.map(a => Array.from(a.signature))), signatureArrays);
  console.log(JSON.stringify({ fixture: 'G16-physical-message-qualification', browser: await browser.version(), ...result,
    browserArtifactSha256: sha(asset), unexpectedRequests, consoleMessages, pageErrors, providerApproval: false, auditAcceptance: false }));
} finally {
  await browser?.close(); if (server) await new Promise(done => server.close(done));
  await rm(temporary, { recursive: true, force: true });
}
