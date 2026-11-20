import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
import { createVaultWorkerEndpoint } from '../src/runtime/worker-endpoint.ts';

const clone = value => structuredClone(value);
const passphrase = 'independent complete backup verification passphrase';
const config = { version: 1, ReleaseEnabled: 0, connectOrigins: [] };
const val = result => { assert.equal(result?.ok, true, JSON.stringify(result)); return result.value; };
const bad = (result, code) => { assert.equal(result?.ok, false); assert.equal(result.error.code, code); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const cleanups = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });

class Store {
  rows = new Map(); writes = 0;
  subscribeInvalidation() { return () => {}; }
  async get(id) { return clone(this.rows.get(id)); }
  async listProfileIds() { return { profileIds: [...this.rows.keys()], truncated: false }; }
  async add(row, options) { options?.assertCurrent?.(); this.rows.set(row.profileId, clone(row)); this.writes++; }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    assert.deepEqual(this.rows.get(expected.profileId), expected);
    this.rows.set(next.profileId, clone(next)); this.writes++;
  }
}

async function setup({ wrap } = {}) {
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
  const backup = new EncryptedBackupService(store), messages = [];
  const profileId = val(await vault.create(passphrase)).profileId; vault.lockAll();
  let requestId = 0;
  const endpoint = createVaultWorkerEndpoint(message => messages.push(clone(message)), {
    createServices: () => ({ vault: wrap ? wrap(vault) : vault, backup }),
  });
  cleanups.push(() => { endpoint.dispose(); backup.dispose(); vault.dispose(); });
  const send = async (operation, fields = {}, generation = 0) => {
    const id = ++requestId;
    await endpoint.dispatch({ version: 1, requestId: id, generation, operation, ...fields });
    return messages.find(message => message.requestId === id)?.result;
  };
  val(await send('init', { config }));
  val(await send('unlock', { profileId, passphrase }));
  const verify = async (generation = 0) => {
    const bytes = await backup.export(profileId);
    const receipt = val(await send('verifyBackup', { profileId, passphrase, bytes }, generation));
    return { bytes, receipt };
  };
  const current = async (generation = 0) => val(await send('checkBackupVerification', { profileId }, generation));
  return { store, vault, backup, endpoint, messages, profileId, send, verify, current };
}

const defaults = {
  networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native', amountBaseUnits: '123',
  fiatCurrency: 'USD', fiatMinorUnits: '400', fiatScale: 2,
};
const consent = { reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true };

test('current backup fact survives read-only personalization but retires on favorites and template writes', async () => {
  const s = await setup(), profileId = s.profileId;
  const recordId = val(await s.send('saveTermsReview', {
    profileId, source: 'file', bytes: new TextEncoder().encode('{"independent-review":1}'),
  })).recordId;
  const first = await s.verify();
  assert.equal(first.receipt.revision, 1);
  val(await s.send('listFavoriteReviews', { profileId }));
  const library = val(await s.send('loadTradeTemplates', { profileId }));
  val(await s.send('previewTradeTemplateChange', {
    profileId, expectedRevision: library.revision, change: { kind: 'put-template', slot: 0, defaults },
  }));
  val(await s.send('cancelTradeTemplateChange', { profileId }));
  assert.deepEqual((await s.current()).verification, first.receipt);
  const before = s.store.writes;
  val(await s.send('setReviewFavorite', { profileId, recordId, favorite: true, expectedRevision: 1 }));
  assert.equal(s.store.writes, before + 1);
  assert.equal((await s.current()).verification, null);
  const second = await s.verify();
  assert.equal(second.receipt.revision, 2);
  const preview = val(await s.send('previewTradeTemplateChange', {
    profileId, expectedRevision: 2, change: { kind: 'put-template', slot: 0, defaults },
  }));
  assert.deepEqual((await s.current()).verification, second.receipt);
  val(await s.send('commitTradeTemplateChange', {
    profileId, expectedRevision: 2, previewId: preview.previewId, consent,
  }));
  assert.equal(s.store.writes, before + 2);
  assert.equal((await s.current()).verification, null);
  bad(await s.send('verifyBackup', { profileId, passphrase, bytes: second.bytes }), 'CONFLICT');
  assert.equal((await s.current()).verification, null);
  assert.equal((await s.verify()).receipt.revision, 3);
  assert.equal(s.store.writes, before + 2, 'verification is not an encrypted-profile write');
});

test('an explicit no-op template commit retires the fact without a hidden profile write', async () => {
  const s = await setup(), profileId = s.profileId;
  await s.verify();
  const before = s.store.writes;
  const preview = val(await s.send('previewTradeTemplateChange', {
    profileId, expectedRevision: 0, change: { kind: 'set-repeat-default', slot: null },
  }));
  assert.ok((await s.current()).verification);
  const committed = val(await s.send('commitTradeTemplateChange', {
    profileId, expectedRevision: 0, previewId: preview.previewId, consent,
  }));
  assert.equal(committed.changed, false);
  assert.equal(s.store.writes, before);
  assert.equal((await s.current()).verification, null);
});

test('a held freshness check cannot publish an old fact after lock or free native admission early', async () => {
  let hold = false;
  const entered = deferred(), release = deferred();
  const s = await setup({ wrap: vault => new Proxy(vault, { get(target, key) {
    if (key === 'assertFresh') return async (...args) => {
      const result = await target.assertFresh(...args);
      if (hold) { entered.resolve(); await release.promise; }
      return result;
    };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } }) });
  await s.verify();
  const writes = s.store.writes;
  hold = true;
  const pending = s.send('checkBackupVerification', { profileId: s.profileId });
  try {
    await entered.promise;
    val(await s.send('lock', {}, 1));
    bad(await s.send('unlock', { profileId: s.profileId, passphrase }, 1), 'BUSY');
    release.resolve();
    assert.equal(await pending, undefined, 'retired old-generation check must not emit a response');
    hold = false;
    val(await s.send('unlock', { profileId: s.profileId, passphrase }, 1));
    assert.equal((await s.current(1)).verification, null);
    assert.equal(s.store.writes, writes);
  } finally { release.resolve(); await pending; }
});
