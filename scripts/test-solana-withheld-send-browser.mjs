/** Actual Chromium transport diagnostic. No validator, wallet, signed transaction or funds are involved. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { rejectWithheldSolanaSend } from './lib/solana-localnet-withheld-send.mjs';
import { MAX_TRANSPORT_TRIALS, WARM_READS, qualifyWarmedSolanaTransport }
  from './lib/solana-withheld-transport-qualification.mjs';

const GENESIS = 'public transport diagnostic; not a chain identity';
const PARAMS = ['public-transport-fixture-not-a-transaction', { encoding: 'base64', skipPreflight: true, maxRetries: 0 }];

export async function buildSolanaRpcDiagnostic() {
  const modules = new Set();
  const artifact = await build({ configFile: false, logLevel: 'error', plugins: [{
    name: 'actual-solana-local-rpc', generateBundle(_options, output) {
      for (const item of Object.values(output)) if (item.type === 'chunk') for (const id of Object.keys(item.modules)) modules.add(id);
    },
  }], build: { write: false, target: 'es2023', minify: false, sourcemap: false,
    lib: { entry: fileURLToPath(new URL('../apps/web/src/solana-localnet/rpc.ts', import.meta.url)), formats: ['es'] },
  } });
  const entry = artifact[0].output.find(item => item.type === 'chunk' && item.isEntry);
  assert.ok(entry); assert.deepEqual(entry.imports, []); assert.deepEqual(entry.dynamicImports, []);
  for (const name of ['rpc.ts', 'config.ts']) assert.ok([...modules].some(id => id.endsWith(`/apps/web/src/solana-localnet/${name}`)));
  return { code: entry.code, sha256: createHash('sha256').update(entry.code).digest('hex') };
}

async function runSolanaWithheldSendTrial(artifact, browser) {
  const sockets = new WeakMap(), warm = [], sends = [], errors = [], unexpected = [], pageErrors = [], completed = [];
  const pending = new Set();
  let nextSocket = 0, context, observed;
  const server = createServer((request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; worker-src 'none'; object-src 'none'; base-uri 'none'");
    response.setHeader('Cache-Control', 'no-store');
    const run = async () => {
      if (request.method === 'GET' && request.url === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><meta charset="utf-8"><title>Local RPC transport diagnostic</title>'); return;
      }
      if (request.method === 'GET' && request.url === '/rpc.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(artifact.code); return;
      }
      assert.equal(request.method, 'POST'); assert.equal(request.url, '/');
      let body = '';
      for await (const chunk of request) { body += chunk; assert.ok(body.length <= 16384); }
      const input = JSON.parse(body), socket = sockets.get(request.socket);
      assert.ok(socket); assert.equal(input.jsonrpc, '2.0');
      if (input.method === 'getGenesisHash') {
        warm.push({ socket, id: input.id });
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: input.id, result: GENESIS })); return;
      }
      assert.equal(input.method, 'sendTransaction'); sends.push({ socket, input });
      assert.equal(sends.length, 1, 'one physical POST for the one application send call');
      assert.deepEqual(input.params, PARAMS);
      response.once('finish', () => completed.push(response.statusCode));
      rejectWithheldSolanaSend(response, {});
      // This diagnostic has no upstream forwarding capability.
    };
    const handling = run().catch(error => {
      errors.push(error.message);
      if (!response.headersSent && !response.destroyed) response.writeHead(500).end('Fixture refused.');
      else response.destroy();
    });
    pending.add(handling); void handling.then(() => pending.delete(handling));
  });
  server.on('connection', socket => sockets.set(socket, ++nextSocket));
  try {
    await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => {
      if ([origin + '/', origin + '/rpc.js'].includes(route.request().url())) return route.continue();
      unexpected.push(route.request().url()); return route.abort();
    });
    await context.routeWebSocket(() => true, socket => { unexpected.push(socket.url()); socket.close(); });
    const page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(origin);
    observed = await page.evaluate(async ({ url, warmReads, expectedGenesis, params }) => {
      const { createSolanaLocalRpc } = await import('/rpc.js');
      const rpc = createSolanaLocalRpc(url), nativeFetch = globalThis.fetch;
      let applicationCalls = 0, fetchCalls = 0, fetchFailures = 0, refusal = null;
      const statuses = [];
      globalThis.fetch = async (input, options) => {
        const sending = JSON.parse(options.body).method === 'sendTransaction';
        if (sending) fetchCalls++;
        try {
          const response = await nativeFetch(input, options);
          if (sending) statuses.push(response.status);
          return response;
        } catch (error) { if (sending) fetchFailures++; throw error; }
      };
      try {
        for (let n = 0; n < warmReads; n++) {
          if (await rpc.request({ method: 'getGenesisHash' }) !== expectedGenesis) throw Error('WARM_REPLY');
        }
        applicationCalls++;
        try { await rpc.request({ method: 'sendTransaction', params }); } catch (error) { refusal = error.message; }
        if (await rpc.request({ method: 'getGenesisHash' }) !== expectedGenesis) throw Error('FOLLOWUP_REPLY');
        return { applicationCalls, fetchCalls, fetchFailures, statuses, refusal };
      } finally { rpc.dispose(); globalThis.fetch = nativeFetch; }
    }, { url: origin + '/', warmReads: WARM_READS, expectedGenesis: GENESIS, params: PARAMS });
  } finally {
    // Each trial owns its context/server until teardown finishes. No late request can be
    // attributed to a later trial, and no execution or teardown error permits resampling.
    try { await context?.close(); }
    finally {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await Promise.all(pending);
    }
  }
  return { observed, warm, sends, completed, errors, pageErrors, unexpected };
}

export async function runSolanaWithheldSendBrowser() {
  const artifact = await buildSolanaRpcDiagnostic();
  const browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  let qualification, browserVersion;
  try {
    // Chromium chooses its connection. Keep every invariant-clean cold trial and require
    // an actually observed warmed socket; this is never a retry of a failed send assertion.
    qualification = await qualifyWarmedSolanaTransport(() => runSolanaWithheldSendTrial(artifact, browser));
    browserVersion = await browser.version();
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ ok: true, kind: 'SOLANA_WITHHELD_ACK_TRANSPORT_DIAGNOSTIC', receiptVersion: 2,
    browser: browserVersion, actualRuntimeRpc: true, warmedConnection: true,
    ...qualification.totals, refusal: 'RPC_UNAVAILABLE', validatorForwards: 0,
    trialCount: qualification.trials.length, qualifiedTrial: qualification.qualifiedTrial,
    maxTrials: MAX_TRANSPORT_TRIALS, trials: qualification.trials, artifactSha256: artifact.sha256,
    rawResetQualified: false, generalBrowserRetransmissionGuarantee: false, nativeChainQualified: false, ReleaseEnabled: 0 }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runSolanaWithheldSendBrowser();
