/** Real emitted UI + image primitives + jsQR module Worker. Synthetic camera source, never a physical-device PASS. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startQrBrowserFixture, noQrAuthority, readPublicEnvelope, sha256, upload } from './lib/qr-browser-fixture.mjs';

const f = await startQrBrowserFixture(), reports = [];
const panel = page => page.locator('.qr-panel');
const button = (page, name) => panel(page).getByRole('button', { name, exact: true });
const confirm = async page => {
  await panel(page).locator('[id="qr-review-title"]').waitFor();
  assert.equal(await panel(page).getAttribute('data-qr-confirmed'), 'false');
  assert.equal(await button(page, 'Display reviewed QR symbol').count(), 0);
  assert.ok((await panel(page).innerText()).includes('Unauthenticated public data'));
  await button(page, 'Confirm this local review').click();
  await panel(page).locator('[role="status"]').filter({ hasText: 'Reviewed locally. No wallet, trade or recovery authority is granted.' }).waitFor();
  assert.equal(await panel(page).getAttribute('data-qr-confirmed'), 'true');
};
const fingerprint = async (page, bytes = f.backup, format = 'p2p-offramp-backup/v1') => {
  await panel(page).getByLabel('Selected file format', { exact: true }).selectOption(format);
  await panel(page).getByLabel('Local encrypted backup or private reference file', { exact: true }).setInputFiles(upload('unshared-private-filename.json', bytes));
  await button(page, 'Review a fingerprint of this file').click();
  await panel(page).locator('#qr-review-title').waitFor();
  const review = await panel(page).locator('.qr-review').innerText();
  assert.ok(review.includes(sha256(bytes))); assert.ok(review.includes(String(bytes.length)));
  assert.equal(review.includes('unshared-private-filename'), false); assert.equal(review.includes(f.python.passphrase), false);
};
const discard = page => button(page, 'Discard QR data and stop capture').click();
const image = async (page, bytes, mime = 'image/png') => {
  await panel(page).getByLabel('PNG or JPEG containing one public code', { exact: true }).setInputFiles(upload('public-code.' + (mime === 'image/png' ? 'png' : 'jpg'), bytes, mime));
  await button(page, 'Read selected image').click();
};
const compare = async (page, bytes, result) => {
  await panel(page).getByLabel('File to compare with the reviewed fingerprint', { exact: true }).setInputFiles(upload('local-file.json', bytes));
  await button(page, 'Compare exact file bytes').click();
  await panel(page).locator(`[data-qr-comparison="${result}"]`).waitFor();
};
const alerts = (page, text) => panel(page).getByRole('alert').filter({ hasText: text }).waitFor();
const privateRows = page => page.evaluate(() => new Promise((done, fail) => {
  const request = indexedDB.open('p2p-offramp-vault', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('vaults', { keyPath: 'profileId' });
  request.onerror = () => fail(Error('FIXTURE_IDB_OPEN'));
  request.onsuccess = () => {
    const database = request.result, transaction = database.transaction('vaults', 'readonly'), all = transaction.objectStore('vaults').getAll();
    all.onsuccess = () => done(JSON.stringify(all.result)); all.onerror = () => fail(Error('FIXTURE_IDB_READ')); transaction.oncomplete = () => database.close();
  };
}));

try {
  // Real app generates a public fingerprint, renders its own matrix, and downloads exact text.
  const source = await f.page(), sourceRows = await privateRows(source);
  await fingerprint(source); await confirm(source);
  await button(source, 'Display reviewed QR symbol').click();
  const symbol = panel(source).getByRole('img', { name: 'Reviewed public QR symbol with a four-module quiet zone', exact: true });
  const png = await symbol.screenshot({ type: 'png' });
  const downloadEvent = source.waitForEvent('download'); await button(source, 'Download reviewed public text').click();
  const download = await downloadEvent; assert.equal(download.suggestedFilename(), 'p2p-offramp-public-qr.txt');
  const publicText = (await readFile(await download.path())).toString('utf8');
  const envelope = readPublicEnvelope(publicText);
  assert.equal(envelope.type, 'recovery-fingerprint'); assert.equal(envelope.chain, null); assert.equal(envelope.signature, undefined);
  assert.deepEqual(envelope.payload, { byteLength: f.backup.length, format: 'p2p-offramp-backup/v1', sha256: sha256(f.backup) });
  await compare(source, f.backup, 'match'); await compare(source, f.differentBackup, 'different');
  assert.equal(await privateRows(source), sourceRows);
  await noQrAuthority(source); reports.push('generated-display-download-exact-fingerprint-and-comparison');

  // A second fresh page reads a PNG screenshot of the real emitted SVG through real bitmap + Worker decoding.
  const imported = await f.page(), importedRows = await privateRows(imported);
  await image(imported, png); await confirm(imported); await compare(imported, f.backup, 'match');
  const pngStats = await noQrAuthority(imported);
  assert.equal(pngStats.observed.workers.filter(worker => /decode\.worker-/.test(worker.url)).length, 1);
  await discard(imported);
  await panel(imported).getByLabel('Exact public QR text', { exact: true }).fill(publicText);
  await button(imported, 'Review exact text').click();
  await alerts(imported, 'already confirmed in this page session');
  assert.equal(await privateRows(imported), importedRows); reports.push('real-png-worker-and-local-replay');
  await imported.context().close();

  // Native JPEG conversion is fixture-side; production still checks complete headers and decodes its file input.
  const jpegBytes = await source.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    try {
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      const blob = await new Promise(done => canvas.toBlob(done, 'image/jpeg', 0.98));
      if (!blob) throw Error('FIXTURE_JPEG'); return [...new Uint8Array(await blob.arrayBuffer())];
    } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
  }, [...png]);
  const jpeg = await f.page(); await image(jpeg, Buffer.from(jpegBytes), 'image/jpeg'); await confirm(jpeg);
  await noQrAuthority(jpeg); reports.push('real-jpeg-worker');
  await jpeg.context().close();

  // Bounded text/file/image ingress; no trim, BOM removal, URL navigation, wallet pairing or secret import.
  const refused = await f.page();
  for (const [text, error] of [['https://example.test/never-open', 'A URL cannot'], ['wc:never-connect', 'Wallet-session codes'],
    ['0x' + 'ab'.repeat(32), 'Secret-bearing content'], [publicText + '\n', 'exact QR text encoding is invalid']]) {
    await panel(refused).getByLabel('Exact public QR text', { exact: true }).fill(text); await button(refused, 'Review exact text').click(); await alerts(refused, error);
    assert.equal(await panel(refused).locator('.qr-review').count(), 0);
  }
  for (const [bytes, error] of [[Buffer.concat([Buffer.from([239, 187, 191]), Buffer.from(publicText)]), 'not a supported P2POFFRAMP'],
    [Buffer.alloc(65537, 65), 'selected file exceeds']]) {
    await panel(refused).getByLabel('Public QR text file', { exact: true }).setInputFiles(upload('exact-public.txt', bytes, 'text/plain'));
    await button(refused, 'Read selected public text file').click(); await alerts(refused, error);
  }
  await image(refused, Buffer.from('<svg onload="fetch(\'https://example.test/\')"></svg>')); await alerts(refused, 'complete, non-animated PNG or JPEG');
  await panel(refused).getByLabel('Public QR text file', { exact: true }).setInputFiles(upload('exact-public.txt', Buffer.from(publicText), 'text/plain'));
  await button(refused, 'Read selected public text file').click(); await confirm(refused);
  assert.equal(refused.url(), f.origin + '/#/recovery');
  await noQrAuthority(refused); reports.push('bounded-exact-file-text-and-hostile-image-refusals');
  await refused.context().close();

  // Camera permission is an external synthetic port; stream, preview, frame capture and decoder Worker are real.
  const camera = await f.page(); await camera.evaluate(bytes => window.__qrFixture.setCameraFrame(bytes), [...png]);
  await button(camera, 'Start camera').click(); await alerts(camera, 'Camera access or preview is unavailable');
  await camera.evaluate(() => { window.__qrFixture.mode = 'hold'; });
  await button(camera, 'Start camera').click();
  await panel(camera).getByText('Waiting for the camera permission request to finish…', { exact: true }).waitFor();
  await camera.getByRole('link', { name: 'Home', exact: true }).click();
  await camera.getByRole('link', { name: 'Recovery', exact: true }).click();
  await button(camera, 'Start camera').click(); await alerts(camera, 'earlier camera, file or decoder operation');
  assert.equal(await camera.evaluate(() => window.__qrFixture.observed.cameraRequests), 2, 'remount cannot start a second native permission request');
  await camera.evaluate(() => window.__qrFixture.releaseCamera());
  await camera.waitForFunction(() => window.__qrFixture.streams.length === 1 && window.__qrFixture.streams[0].getTracks().every(track => track.readyState === 'ended'));
  assert.equal(await panel(camera).locator('.qr-review').count(), 0);
  await camera.evaluate(() => { window.__qrFixture.mode = 'allow'; }); await button(camera, 'Start camera').click();
  try { await camera.waitForFunction(() => document.querySelector('.qr-camera')?.readyState >= 2); }
  catch (error) {
    const state = await camera.evaluate(() => {
      const video = document.querySelector('.qr-camera');
      return { readyState: video?.readyState, paused: video?.paused, width: video?.videoWidth, height: video?.videoHeight,
        hidden: video?.hidden, active: video?.srcObject?.active, producers: window.__qrFixture.producers,
        tracks: window.__qrFixture.streams.map(stream => stream.getTracks().map(track => ({ readyState: track.readyState, muted: track.muted }))),
        policy: window.__qrFixture.observed.policy, alerts: [...document.querySelectorAll('.qr-panel [role="alert"]')].map(node => node.textContent) };
    });
    throw new Error(`Camera preview did not receive the fixture stream: ${JSON.stringify(state)}`, { cause: error });
  }
  await button(camera, 'Scan one camera frame').click(); await confirm(camera);
  await noQrAuthority(camera);
  // Actual app event handler, with a deterministic synthetic hidden-page signal (no physical device claim).
  await button(camera, 'Start camera').click(); await camera.waitForFunction(() => document.querySelector('.qr-camera')?.readyState >= 2);
  await panel(camera).getByLabel('Exact public QR text', { exact: true }).fill('discard on hidden');
  await camera.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState;
  });
  assert.equal(await panel(camera).getByLabel('Exact public QR text', { exact: true }).inputValue(), '');
  assert.equal(await panel(camera).locator('.qr-review').count(), 0); await noQrAuthority(camera);
  await camera.waitForFunction(() => window.__qrFixture.producers.every(producer => !producer.active));
  reports.push('synthetic-permission-real-stream-late-cancel-remount-capture-hidden-cleanup');
  await camera.context().close();

  // Selected profile lock clears both QR review and input, without changing the independently derived encrypted row.
  const locked = await f.page();
  await locked.evaluate(envelope => new Promise((done, fail) => {
    const request = indexedDB.open('p2p-offramp-vault', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('vaults', { keyPath: 'profileId' });
    request.onerror = () => fail(Error('FIXTURE_IDB_OPEN'));
    request.onsuccess = () => {
      const database = request.result, transaction = database.transaction('vaults', 'readwrite'); transaction.objectStore('vaults').put(envelope);
      transaction.oncomplete = () => { database.close(); done(); }; transaction.onerror = () => { database.close(); fail(Error('FIXTURE_IDB_SEED')); };
    };
  }), f.python.envelope);
  await locked.getByRole('link', { name: 'Home', exact: true }).click();
  await locked.getByRole('button', { name: 'Unlock existing profile', exact: true }).click();
  await locked.getByLabel('Profile ID', { exact: true }).fill(f.python.envelope.profileId);
  await locked.getByLabel('Passphrase', { exact: true }).fill(f.python.passphrase);
  await locked.getByRole('button', { name: 'Unlock local vault', exact: true }).click(); await locked.getByText('Vault unlocked', { exact: true }).waitFor();
  await locked.getByRole('link', { name: 'Recovery', exact: true }).click();
  const encryptedBefore = await privateRows(locked);
  await fingerprint(locked, f.references, 'p2p-offramp/offline-recovery-references/v1'); await confirm(locked); await compare(locked, f.references, 'match');
  await panel(locked).getByLabel('Exact public QR text', { exact: true }).fill('discard on lock');
  await locked.getByRole('button', { name: 'Lock vault', exact: true }).click(); await locked.getByText('Vault locked', { exact: true }).waitFor();
  assert.equal(await panel(locked).locator('.qr-review').count(), 0);
  assert.equal(await panel(locked).getByLabel('Exact public QR text', { exact: true }).inputValue(), '');
  assert.equal(await privateRows(locked), encryptedBefore);
  const lockStats = await noQrAuthority(locked, { expectedPrivateOperations: ['unlock', 'lock'] });
  reports.push('reference-fingerprint-and-real-vault-lock-clears-memory');
  await locked.context().close();

  for (const width of [320, 768, 1440]) {
    await source.setViewportSize({ width, height: 1000 });
    assert.equal(await source.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no horizontal clipping at ${width}px`);
  }
  assert.deepEqual(f.unexpected, []);
  console.log(JSON.stringify({ fixture: 'emitted-public-qr-local-chromium', browser: f.browserVersion(), journeys: reports,
    emittedWorker: f.evidence.qr.worker, decoderVersion: f.evidence.qr.decoderVersion, dependencySha256: f.evidence.qr.dependencySha256,
    actualModuleWorker: true, actualBitmapDecode: true, actualPrivateVaultLock: true, physicalCamera: false, physicalDeviceQualification: false,
    sourcePngSha256: sha256(png), sourcePngBytes: png.length, backupFingerprintSha256: sha256(f.backup),
    observedPrivateOperationsDuringExplicitUnlockAndLock: lockStats.observed.privateOperations,
    unexpectedRequests: f.unexpected.length, tradingEnabled: false, ReleaseEnabled: 0, releaseAcceptance: false }));
} finally { await f.close(); }
