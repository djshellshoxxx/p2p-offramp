/**
 * Sepolia testnet build (owner-signed registry) in local Chromium: build-time verification of an ephemeral-key fixture
 * trust root, the emitted artifact's testnet badge and banner, a Sepolia terms file reviewed against the verified
 * registry, a terms file for an unknown deployment refused, and runtime fail-closed once the manifest has expired.
 * Also checks that a missing or tampered trust root stops the build. Fixture data only; nothing connects or funds.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './lib/chromium-path.mjs';
import { buildWeb } from '../apps/web/scripts/build.mjs';
import { TESTNET_TRUST_FILES } from '../apps/web/scripts/testnet-trust.mjs';
import { fixtureTermsDocument, FIXTURE_ESCROW, writeTestnetTrust } from './lib/testnet-fixture.mjs';

const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-testnet-build-'));
const unexpected = [];
let browser, server;
try {
  const trustRoot = resolve(temporary, 'trust');
  const { keyId, expiresAt } = await writeTestnetTrust(trustRoot);
  // Build refusals first: missing and tampered trust roots never produce an artifact.
  await assert.rejects(buildWeb({ delivery: 'testnet', outDir: resolve(temporary, 'missing'), trustRoot: resolve(temporary, 'nowhere') }), /TESTNET_TRUST_MISSING/);
  const tamperedRoot = resolve(temporary, 'tampered');
  await writeTestnetTrust(tamperedRoot);
  const registryPath = resolve(tamperedRoot, TESTNET_TRUST_FILES.registry);
  await writeFile(registryPath, (await readFile(registryPath, 'utf8')).replace('sepolia-public', 'sepolia-other'));
  await assert.rejects(buildWeb({ delivery: 'testnet', outDir: resolve(temporary, 'tampered-out'), trustRoot: tamperedRoot }), /TESTNET_TRUST_INVALID/);

  const out = resolve(temporary, 'testnet');
  const evidence = await buildWeb({ delivery: 'testnet', outDir: out, trustRoot });
  assert.equal(evidence.testnet, true); assert.equal(evidence.syntheticDemo, false); assert.equal(evidence.ReleaseEnabled, 0);
  assert.equal(evidence.testnetTrust.keyId, keyId);

  server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const target = resolve(out, path === '/' ? 'index.html' : '.' + path);
    if (!target.startsWith(out + sep) || !/\.(?:html|js|css|json)$/.test(target)) { response.writeHead(404); response.end(); return; }
    void readFile(target).then(bytes => {
      response.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : target.endsWith('.html') ? 'text/html' : 'application/json');
      response.end(bytes);
    }, () => { response.writeHead(404); response.end(); });
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });

  const nowSeconds = Math.floor(Date.now() / 1000);
  const good = resolve(temporary, 'sepolia-terms.json'), unknown = resolve(temporary, 'unknown-deployment.json');
  await writeFile(good, JSON.stringify(await fixtureTermsDocument(nowSeconds), null, 2));
  await writeFile(unknown, JSON.stringify(await fixtureTermsDocument(nowSeconds, { deploymentId: 'escrow-other' }), null, 2));

  async function open(fixedTime) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => { if (new URL(route.request().url()).origin === origin) return route.continue(); unexpected.push('UNEXPECTED_NETWORK'); return route.abort(); });
    const page = await context.newPage();
    page.on('pageerror', () => unexpected.push('PAGE_ERROR'));
    page.on('dialog', dialog => { unexpected.push('UNEXPECTED_DIALOG'); void dialog.dismiss(); });
    if (fixedTime) await page.clock.setFixedTime(fixedTime);
    await page.goto(origin + '/#/offers');
    await page.getByRole('heading', { level: 1, name: 'Offers', exact: true }).waitFor();
    return { context, page };
  }

  // 1. Valid manifest: testnet badge and banner name the verified key; no synthetic samples exist.
  {
    const { context, page } = await open();
    await page.getByText('SEPOLIA TESTNET · owner-signed registry', { exact: true }).waitFor();
    const banner = page.getByRole('note').filter({ hasText: 'SEPOLIA TESTNET: the network registry is signed' });
    await banner.waitFor();
    const bannerText = await banner.innerText();
    assert.ok(bannerText.includes(`key ${keyId.slice(0, 16)}… (manifest 1, valid until ${new Date(expiresAt * 1000).toISOString()})`), bannerText);
    assert.equal(await page.getByText('SYNTHETIC', { exact: false }).count(), 0, 'no synthetic data or samples in the testnet build');
    assert.equal(await page.getByRole('heading', { name: 'Synthetic samples' }).count(), 0);
    // 2. A Sepolia terms file for the signed deployment is reviewed with exact values.
    await page.getByLabel('Trade-terms file (JSON, at most 64 KiB)').setInputFiles(good);
    await page.getByRole('button', { name: 'Check terms', exact: true }).click();
    await page.waitForURL(/#\/trade\/[A-Za-z0-9_-]{22}$/);
    await page.getByRole('heading', { level: 1, name: 'Trade review', exact: true }).waitFor();
    const text = await page.locator('main').innerText();
    for (const expected of ['11155111', FIXTURE_ESCROW, '0.0001 native', '1.00 EUR', 'SEPOLIA TESTNET: the network registry is signed', 'Trading, wallet connections, signing and funding are disabled in this build.']) {
      assert.ok(text.includes(expected), `review shows ${expected}`);
    }
    assert.equal(await page.locator('main').getByRole('button', { name: /accept|sign|fund/i }).count(), 0, 'no accept/sign/fund controls');
    // 3. A terms file naming a deployment outside the signed registry is refused with the fixed message.
    await page.getByRole('link', { name: 'Back to offers', exact: true }).click();
    await page.getByLabel('Trade-terms file (JSON, at most 64 KiB)').setInputFiles(unknown);
    await page.getByRole('button', { name: 'Check terms', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Refused: the escrow deployment is not in the loaded registry.' }).waitFor();
    await context.close();
  }

  // 4. Device clock past the manifest expiry: the registry fails closed and nothing can be checked.
  {
    const { context, page } = await open(new Date((expiresAt + 60) * 1000));
    await page.getByRole('alert').filter({ hasText: 'The network registry failed its integrity check and was not used.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Check terms', exact: true }).count(), 0);
    assert.equal(await page.getByText('SEPOLIA TESTNET · owner-signed registry', { exact: true }).count(), 0, 'no testnet badge for a failed registry');
    await context.close();
  }

  assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ fixture: 'sepolia-testnet-build-local-chromium', browser: browser.version(), keyId, journey: ['build-refusals', 'banner', 'review', 'unknown-deployment', 'expired-fail-closed'],
    unexpectedRequests: unexpected.length, tradingEnabled: false, releaseAcceptance: false }));
} finally {
  await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await rm(temporary, { recursive: true, force: true });
}
