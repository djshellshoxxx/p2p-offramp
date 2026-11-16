/** Actual two-document IndexedDB race, full reload, lock and portable encrypted
 * replay-history restore. No wallet, public relay, RPC or live trade is used. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { build } from 'vite';
import { resolveChromiumPath } from './lib/chromium-path.mjs';

const artifact = await build({ configFile: false, logLevel: 'error', build: {
  write: false, target: 'es2023', lib: { entry: fileURLToPath(new URL('./fixtures/peer-replay-browser.mjs', import.meta.url)), formats: ['es'] },
} });
const entry = artifact[0].output.find(output => output.type === 'chunk' && output.isEntry);
assert.ok(entry);
const server = createServer((request, response) => {
  response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'none'");
  if (request.url === '/') response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Peer replay fixture</title><script type="module" src="/fixture.mjs"></script>');
  else if (request.url === '/fixture.mjs') response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(entry.code);
  else response.writeHead(404).end();
});
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = 'http://127.0.0.1:' + server.address().port, unexpected = [];
  browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
  async function isolatedContext() {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      unexpected.push(route.request().url()); return route.abort();
    });
    await context.routeWebSocket(() => true, socket => { unexpected.push(socket.url()); socket.close(); });
    return context;
  }
  async function openPage(context) {
    const page = await context.newPage(); await page.goto(origin); await page.waitForFunction(() => !!window.peerFixture); return page;
  }
  const context = await isolatedContext(), first = await openPage(context), second = await openPage(context);
  const profileId = await first.evaluate(() => window.peerFixture.create());
  await second.evaluate(id => window.peerFixture.open(id), profileId);
  const raced = await Promise.all([first, second].map(page => page.evaluate(() => window.peerFixture.admit())));
  assert.equal(raced.filter(result => result.ok).length, 1, 'exactly one same-revision encrypted CAS winner');
  assert.equal(raced.find(result => !result.ok).error.code, 'CONFLICT');
  assert.equal(raced.find(result => result.ok).value.economicPreparationAllowed, false);

  // Recreate the JS realm as well as the service; no cached ledger survives.
  for (const page of [first, second]) {
    await page.reload(); await page.waitForFunction(() => !!window.peerFixture);
    await page.evaluate(id => window.peerFixture.open(id), profileId);
  }
  const stored = await first.evaluate(() => window.peerFixture.stored());
  assert.equal(stored.revision, 1);
  assert.doesNotMatch(JSON.stringify(stored), /termsHash|ownMessagingKey|termsSignature|bindingSignature/);
  const duplicate = await first.evaluate(() => window.peerFixture.admit());
  assert.equal(duplicate.ok, true); assert.equal(duplicate.value.status, 'duplicate');
  assert.deepEqual(await first.evaluate(() => window.peerFixture.stored()), stored, 'duplicate must not rewrite encrypted state');
  const olderBackup = await first.evaluate(() => window.peerFixture.export());
  const tombstone = await first.evaluate(() => window.peerFixture.tombstone()); assert.equal(tombstone.ok, true);
  const stale = await second.evaluate(() => window.peerFixture.admit());
  assert.equal(stale.ok, false); assert.equal(stale.error.code, 'CONFLICT', 'stale duplicate must check persisted tombstone');

  await first.reload(); await first.waitForFunction(() => !!window.peerFixture);
  await first.evaluate(id => window.peerFixture.open(id), profileId);
  const reopened = await first.evaluate(() => window.peerFixture.admit());
  assert.equal(reopened.ok, false); assert.equal(reopened.error.code, 'CONFLICT');
  const latestBackup = await first.evaluate(() => window.peerFixture.export());
  const freshContext = await isolatedContext(), restored = await openPage(freshContext);
  const restoration = await restored.evaluate(bytes => window.peerFixture.restore(bytes), latestBackup);
  assert.equal(restoration.sourceAbsent, true, 'fresh profile has no access to the source IndexedDB');
  assert.equal(restoration.receipt.sourceProfileId, profileId);
  assert.notEqual(restoration.receipt.newProfileId, profileId);
  const restoredAdmission = await restored.evaluate(() => window.peerFixture.admit());
  assert.equal(restoredAdmission.ok, false); assert.equal(restoredAdmission.error.code, 'CONFLICT');

  // Explicit evidence of the remaining protocol limit: offline old backups cannot
  // learn tombstones committed after export. No test labels this globally fresh.
  const oldContext = await isolatedContext(), oldPage = await openPage(oldContext);
  await oldPage.evaluate(bytes => window.peerFixture.restore(bytes), olderBackup);
  const oldAdmission = await oldPage.evaluate(() => window.peerFixture.admit());
  assert.equal(oldAdmission.ok, true); assert.equal(oldAdmission.value.status, 'duplicate');
  assert.equal(oldAdmission.value.economicPreparationAllowed, false);
  await first.evaluate(() => window.peerFixture.lock());
  const locked = await first.evaluate(() => window.peerFixture.admit());
  assert.equal(locked.ok, false); assert.equal(locked.error.code, 'LOCKED');
  assert.deepEqual(unexpected, []);
  console.log(`PASS: Chromium ${browser.version()}; CAS race, reload, encrypted storage, duplicate freshness, tombstone restore, lock and old-backup limitation verified.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
