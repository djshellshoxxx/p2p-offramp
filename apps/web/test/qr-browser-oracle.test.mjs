import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readPublicEnvelope, noQrAuthority } from '../../../scripts/lib/qr-browser-fixture.mjs';

test('browser fixture text oracle independently recovers frozen envelopes with the complete 13-character prefix', async () => {
  const matrices = JSON.parse(await readFile(new URL('../../../packages/qr/test/fixtures/vectors.json', import.meta.url), 'utf8')).vectors.qrSymbol.matrices;
  const envelopes = matrices.filter(symbol => symbol.name.startsWith('envelope-'));
  assert.ok(envelopes.length >= 10);
  for (const symbol of envelopes) {
    const decoded = readPublicEnvelope(symbol.text);
    assert.equal(decoded.protocol, 'p2p-offramp-qr'); assert.equal(decoded.v, 1);
  }
  assert.throws(() => readPublicEnvelope('https://example.test/'));
  assert.throws(() => readPublicEnvelope(envelopes[0].text + '\n'));
  assert.throws(() => readPublicEnvelope(envelopes[0].text.replace(':1:', ':2:')));
});

const lifecycleSnapshot = () => ({
  observed: { wallet: 0, fetch: 0, sockets: 0, beacon: 0, policy: [],
    privateOperations: ['init', 'unlock', 'activity', 'lock'],
    workers: [{ url: 'http://127.0.0.1/vault.worker-fixture.js', type: 'module', sent: [{
      keys: ['generation', 'operation', 'requestId', 'version'], operation: 'activity',
      version: 1, requestId: 3, generation: 0,
      activityInput: { trusted: true, dispatching: true, type: 'pointerdown' },
    }] }],
  },
  localStorage: 0, sessionStorage: 0, caches: [], registrations: 0, tracks: [], href: 'http://127.0.0.1/#/recovery',
});
const snapshotPage = snapshot => ({ evaluate: async () => snapshot });
const unlockedLifecycle = { expectedPrivateOperations: ['unlock', 'lock'], allowTrustedActivity: true };

test('QR browser authority oracle permits only empty trusted activity inside explicit unlock and lock', async () => {
  const snapshot = lifecycleSnapshot();
  await noQrAuthority(snapshotPage(snapshot), unlockedLifecycle);
  await assert.rejects(noQrAuthority(snapshotPage(snapshot), { expectedPrivateOperations: ['unlock', 'lock'] }));
});

test('QR browser authority oracle rejects fabricated activity, extra payloads and private operations', async () => {
  const cases = [
    value => { value.observed.workers[0].sent[0].activityInput.trusted = false; },
    value => { value.observed.workers[0].sent[0].activityInput.dispatching = false; },
    value => { value.observed.workers[0].sent[0].activityInput.type = 'click'; },
    value => { value.observed.workers[0].sent[0].keys.push('payload'); },
    value => { value.observed.workers[0].sent[0].version = 2; },
    value => { value.observed.workers[0].sent[0].requestId = 0; },
    value => { value.observed.workers[0].sent[0].generation = -1; },
    value => { value.observed.workers[0].sent = []; },
    value => { value.observed.privateOperations.unshift('activity'); },
    value => { value.observed.privateOperations.push('activity'); },
    value => { value.observed.privateOperations.splice(2, 0, 'saveTermsReview'); },
    value => { value.observed.privateOperations.splice(2, 0, 'sign'); },
  ];
  for (const mutate of cases) {
    const snapshot = lifecycleSnapshot(); mutate(snapshot);
    await assert.rejects(noQrAuthority(snapshotPage(snapshot), unlockedLifecycle));
  }
});
