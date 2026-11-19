/** External browser fixture only. The emitted app and both of its module Workers are always real. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { resolveChromiumPath } from './chromium-path.mjs';
import { buildWeb } from '../../apps/web/scripts/build.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const upload = (name, buffer, mimeType = 'application/octet-stream') => ({ name, mimeType, buffer });

/** Independent text-only fixture oracle. It does not import the production codec or encoder. */
export function readPublicEnvelope(text) {
  const prefix = 'P2POFFRAMP:1:';
  assert.ok(text.startsWith(prefix)); assert.ok(text.length <= 3085);
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:', body = text.slice(prefix.length), bytes = [];
  assert.notEqual(body.length % 3, 1);
  for (let offset = 0; offset < body.length; offset += 3) {
    const digits = [...body.slice(offset, offset + 3)].map(char => alphabet.indexOf(char));
    assert.ok(digits.every(digit => digit >= 0));
    const value = digits[0] + 45 * digits[1] + (digits.length === 3 ? 2025 * digits[2] : 0);
    assert.ok(value <= (digits.length === 3 ? 65535 : 255));
    if (digits.length === 3) bytes.push(value >> 8, value & 255); else bytes.push(value);
  }
  const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(new Uint8Array(bytes));
  const canonical = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const envelope = JSON.parse(raw);
  assert.equal(JSON.stringify(canonical(envelope)), raw);
  assert.equal(sha256(JSON.stringify(canonical(envelope.payload))), envelope.payloadSha256);
  assert.equal(envelope.protocol, 'p2p-offramp-qr'); assert.equal(envelope.v, 1);
  assert.match(envelope.requestId, /^[0-9a-f]{32}$/);
  return envelope;
}

function instrument() {
  const observed = { wallet: 0, fetch: 0, sockets: 0, beacon: 0, cameraRequests: 0, privateOperations: [], workers: [], policy: [] };
  const fixture = { observed, mode: 'deny', canvas: null, pending: null, streams: [] };
  window.__qrFixture = fixture;
  const prompt = async () => { observed.wallet++; throw Error('FIXTURE_WALLET_DENIED'); };
  Object.defineProperty(window, 'ethereum', { configurable: true, value: { request: prompt, enable: prompt } });
  Object.defineProperty(window, 'solana', { configurable: true, value: { connect: prompt, signTransaction: prompt, signMessage: prompt } });
  const fetch = window.fetch;
  window.fetch = (...args) => { observed.fetch++; return fetch(...args); };
  const Socket = window.WebSocket;
  window.WebSocket = class extends Socket { constructor(...args) { observed.sockets++; super(...args); } };
  const beacon = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = (...args) => { observed.beacon++; return beacon(...args); };
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(url, options) {
      super(url, options);
      this.observation = { url: String(url), type: options?.type, terminated: 0, sent: [], replies: 0 };
      observed.workers.push(this.observation);
      this.addEventListener('message', () => this.observation.replies++);
    }
    postMessage(message, transfer) {
      this.observation.sent.push({ keys: Object.keys(message).sort(), kind: message.kind, operation: message.operation,
        width: message.width, height: message.height, pixelBytes: message.pixels?.byteLength });
      if (message.operation) observed.privateOperations.push(message.operation);
      if (transfer === undefined) super.postMessage(message); else super.postMessage(message, transfer);
    }
    terminate() { this.observation.terminated++; super.terminate(); }
  };
  document.addEventListener('securitypolicyviolation', event => observed.policy.push(event.effectiveDirective));
  fixture.setCameraFrame = async bytes => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    try {
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0); fixture.canvas = canvas;
    } finally { bitmap.close(); }
  };
  const stream = () => {
    if (!fixture.canvas) throw Error('FIXTURE_FRAME_REQUIRED');
    const value = fixture.canvas.captureStream(5); fixture.streams.push(value);
    // Real CanvasCaptureMediaStreamTrack, real video.srcObject and real video-to-canvas capture.
    value.getVideoTracks()[0]?.requestFrame?.(); return value;
  };
  fixture.releaseCamera = () => {
    if (!fixture.pending) throw Error('FIXTURE_NO_PENDING_CAMERA');
    const resolve = fixture.pending; fixture.pending = null; resolve(stream());
  };
  if (!navigator.mediaDevices) throw Error('FIXTURE_MEDIA_DEVICES_REQUIRED');
  navigator.mediaDevices.getUserMedia = async constraints => {
    observed.cameraRequests++;
    if (constraints.audio !== false || !constraints.video) throw Error('FIXTURE_CAMERA_CONSTRAINTS');
    if (fixture.mode === 'deny') throw new DOMException('Synthetic permission denial', 'NotAllowedError');
    if (fixture.mode === 'hold') return new Promise(resolve => { fixture.pending = resolve; });
    return stream();
  };
}

export async function startQrBrowserFixture() {
  const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-public-qr-'));
  const unexpected = [], contexts = [];
  let browser, server;
  const close = async () => {
    await browser?.close();
    if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    await rm(temporary, { recursive: true, force: true });
  };
  try {
    const out = resolve(temporary, 'web'), evidence = await buildWeb({ outDir: out });
    assert.equal(evidence.ReleaseEnabled, 0); assert.equal(evidence.releaseAcceptance, false);
    assert.equal(evidence.qr.authority, 'none'); assert.equal(evidence.qr.physicalDeviceQualification, false);
    server = createServer((request, response) => {
      response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      const target = resolve(out, path === '/' ? 'index.html' : '.' + path);
      if (!target.startsWith(out + sep) || !/\.(?:html|js|css|json)$/.test(target)) { response.writeHead(404); response.end(); return; }
      void readFile(target).then(bytes => {
        response.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : target.endsWith('.html') ? 'text/html' : 'application/json'); response.end(bytes);
      }, () => { response.writeHead(404); response.end(); });
    });
    server.on('upgrade', (_request, socket) => { unexpected.push('UNEXPECTED_WEBSOCKET'); socket.destroy(); });
    await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ executablePath: resolveChromiumPath(), args: ['--no-sandbox'] });
    const python = JSON.parse(await readFile(resolve(root, 'packages/storage/test/fixtures/vault-python-v1.json'), 'utf8'));
    const backupObject = { format: 'p2p-offramp-backup', version: 1, envelope: python.envelope, checksum: sha256(JSON.stringify(python.envelope)) };
    const backup = Buffer.from(JSON.stringify(backupObject)), differentBackup = Buffer.from(JSON.stringify(backupObject, null, 2));
    const references = Buffer.from(JSON.stringify({ format: 'p2p-offramp/offline-recovery-references/v1', authority: 'unverified-offline-reference', localSnapshotRevision: 0,
      items: [{ recordId: '01'.repeat(16), intentId: Buffer.alloc(32, 1).toString('base64url'), binding: { chain: 'evm', networkId: 'evm:1', deploymentId: 'escrow-v1', tradeId: 'trade-1' },
        account: '0x' + '12'.repeat(20), action: 'fund', storedState: 'broadcast-unknown', chainReference: null, nonce: '1' }] }));
    async function page() {
      const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
      contexts.push(context); await context.addInitScript(instrument);
      await context.route('**/*', route => {
        const destination = new URL(route.request().url());
        if (destination.origin === origin && destination.hostname === '127.0.0.1') return route.continue();
        unexpected.push('UNEXPECTED_NETWORK'); return route.abort();
      });
      await context.routeWebSocket(() => true, socket => { unexpected.push('UNEXPECTED_WEBSOCKET'); socket.close(); });
      const value = await context.newPage();
      value.on('pageerror', error => unexpected.push(`PAGE_ERROR:${error.message}`));
      value.on('dialog', dialog => { unexpected.push('UNEXPECTED_DIALOG'); void dialog.dismiss(); });
      await value.goto(origin + '/#/recovery');
      await value.getByRole('heading', { name: 'Public QR tools', exact: true }).waitFor();
      await value.getByRole('button', { name: 'Refresh vault status', exact: true }).waitFor();
      return value;
    }
    return { page, origin, evidence, python, backup, differentBackup, references, unexpected, close,
      browserVersion: () => browser.version(), contexts };
  } catch (error) { await close(); throw error; }
}

export async function noQrAuthority(page, { expectedPrivateOperations } = {}) {
  const snapshot = await page.evaluate(async () => ({ observed: window.__qrFixture.observed,
    localStorage: localStorage.length, sessionStorage: sessionStorage.length,
    caches: typeof caches === 'undefined' ? [] : await caches.keys(),
    registrations: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    tracks: window.__qrFixture.streams.flatMap(stream => stream.getTracks().map(track => track.readyState)),
    href: location.href }));
  for (const key of ['wallet', 'fetch', 'sockets', 'beacon']) assert.equal(snapshot.observed[key], 0, key);
  assert.equal(snapshot.localStorage, 0); assert.equal(snapshot.sessionStorage, 0); assert.deepEqual(snapshot.caches, []); assert.equal(snapshot.registrations, 0);
  assert.deepEqual(snapshot.observed.policy, [], 'unchanged actual CSP must permit only the intended local flow');
  // The existing Recovery/Unlock forms read the opaque profile inventory on mount. No QR operation may mutate it.
  const privateOps = snapshot.observed.privateOperations.filter(value => !['init', 'status', 'listProfiles'].includes(value));
  assert.deepEqual(privateOps, expectedPrivateOperations ?? [], 'QR cannot dispatch private domain operations');
  for (const worker of snapshot.observed.workers) {
    assert.equal(worker.type, 'module'); assert.equal(new URL(worker.url, snapshot.href).origin, new URL(snapshot.href).origin);
    if (/decode\.worker-/.test(worker.url)) {
      assert.equal(worker.terminated, 1, 'each physical decode Worker must terminate');
      for (const message of worker.sent) {
        assert.deepEqual(message.keys, ['height', 'id', 'kind', 'pixels', 'width']); assert.equal(message.kind, 'decode');
        assert.equal(message.pixelBytes, message.width * message.height * 4); assert.ok(message.pixelBytes <= 4_000_000);
      }
    } else assert.match(worker.url, /vault\.worker-[A-Za-z0-9_-]+\.js$/);
  }
  assert.ok(snapshot.tracks.every(state => state === 'ended'), 'all requested camera tracks must stop');
  return snapshot;
}
