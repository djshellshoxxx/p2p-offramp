// Recovered S06 PR42 cancellation intent, adapted to the maintained main facade.
// Synthetic local fixture: actual runtime, endpoint, encrypted vault and CAS store;
// no actual browser, wallet, public RPC, or financial transaction.
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
import { createVaultWorkerEndpoint } from '../src/runtime/worker-endpoint.ts';
import { startAppServices } from '../src/app-services.ts';
const passphrase = 'local template runtime synthetic passphrase';
const defaults = { networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native', amountBaseUnits: '123456789', fiatCurrency: 'USD', fiatMinorUnits: '100', fiatScale: 2 };
const change = { kind: 'put-template', slot: 0, defaults }, consent = { reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true };
const live = [], clone = value => structuredClone(value);
let previousSecure;
beforeEach(() => { previousSecure = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext'); Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true }); });
afterEach(async () => { for (const item of live.splice(0).reverse()) await item.dispose(); if (previousSecure) Object.defineProperty(globalThis, 'isSecureContext', previousSecure); else delete globalThis.isSecureContext; });
class Store {
  rows = new Map(); writes = 0;
  subscribeInvalidation() { return () => {}; }
  async get(id) { return clone(this.rows.get(id)); }
  async listProfileIds() { return { profileIds: [...this.rows.keys()], truncated: false }; }
  async add(row, options) { options?.assertCurrent?.(); this.rows.set(row.profileId, clone(row)); this.writes++; }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.(); if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw Object.assign(Error('CONFLICT'), { code: 'CONFLICT' });
    this.rows.set(next.profileId, clone(next)); this.writes++;
  }
}
class Port extends EventTarget {
  commands = []; delivered = []; held = []; hold = null; terminated = false;
  constructor(storage) {
    super(); this.vault = new EncryptedVaultService(storage, crypto, { lifecycle: false }); this.backup = new EncryptedBackupService(storage);
    this.endpoint = createVaultWorkerEndpoint(message => { if (message.operation === this.hold) this.held.push(message); else this.reply(message); }, { createServices: () => ({ vault: this.vault, backup: this.backup }) });
  }
  reply(message) { this.delivered.push({ kind: message.kind, operation: message.operation, ok: message.result?.ok }); this.dispatchEvent(new MessageEvent('message', { data: clone(message) })); }
  postMessage(command) { this.commands.push(clone(command)); void this.endpoint.dispatch(clone(command)); }
  release() { this.hold = null; for (const message of this.held.splice(0)) this.reply(message); }
  terminate() { this.terminated = true; this.endpoint.dispose(); }
  dispose() { this.terminate(); }
}
const good = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
async function setup() {
  const storage = new Store(), port = new Port(storage); live.push(port);
  const services = good(await startAppServices({ createWorker: () => port, lifecycle: false })); live.push(services);
  const { profileId } = good(await services.create(passphrase)); return { storage, port, services, profileId };
}

const cancelled = (result, name) => {
  assert.equal(result.ok, false, name);
  assert.equal(result.error.code, 'CANCELLED', name);
};
async function until(predicate, label) {
  const deadline = performance.now() + 5000;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, label);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
test('S06: all current signal-taking facade methods refuse an already-aborted request without Worker posts or writes', async () => {
  const s = await setup(), svc = s.services;
  const preview = good(await svc.previewTradeTemplateChange(0, change));
  const id = 'a'.repeat(32), bytes = new Uint8Array(8);
  const controller = new AbortController(); controller.abort();
  const signal = controller.signal;
  const calls = {
    unlock: () => svc.unlock(s.profileId, passphrase, signal),
    create: () => svc.create(passphrase, signal),
    listProfiles: () => svc.listProfiles(signal),
    restore: () => svc.restore(bytes, passphrase, passphrase, signal),
    exportEncrypted: () => svc.exportEncrypted(s.profileId, signal),
    verifyBackup: () => svc.verifyBackup(bytes, passphrase, signal),
    checkBackupVerification: () => svc.checkBackupVerification(signal),
    saveTermsReview: () => svc.saveTermsReview('file', bytes, signal),
    listTermsReviews: () => svc.listTermsReviews(signal),
    deleteTermsReview: () => svc.deleteTermsReview(id, signal),
    listFavoriteReviews: () => svc.listFavoriteReviews(signal),
    setReviewFavorite: () => svc.setReviewFavorite(id, true, 0, signal),
    loadTradeTemplates: () => svc.loadTradeTemplates(signal),
    previewTradeTemplateChange: () => svc.previewTradeTemplateChange(0, change, signal),
    commitTradeTemplateChange: () => svc.commitTradeTemplateChange(preview.previewId, 0, consent, signal),
    cancelTradeTemplateChange: () => svc.cancelTradeTemplateChange(signal),
    listRecoveryReferences: () => svc.listRecoveryReferences(0, null, signal),
  };
  for (const [name, call] of Object.entries(calls)) {
    const posts = s.port.commands.length, writes = s.storage.writes;
    const durable = clone(s.storage.rows);
    cancelled(await call(), name);
    assert.equal(s.port.commands.length, posts, name + ': no Worker command');
    assert.equal(s.storage.writes, writes, name + ': no durable write');
    assert.deepEqual(s.storage.rows, durable, name + ': unchanged encrypted rows');
    assert.equal(svc.profileId, s.profileId, name + ': no selection change');
  }
  const after = good(await svc.loadTradeTemplates());
  assert.equal(after.revision, 0);
  assert.deepEqual(after.library.templates, []);
});
test('S06: abort after durable template commit locks, ignores stale acknowledgement and reconciles without retry', { timeout: 15000 }, async () => {
  const s = await setup(), svc = s.services;
  const preview = good(await svc.previewTradeTemplateChange(0, change));
  const writes = s.storage.writes;
  s.port.hold = 'commitTradeTemplateChange';
  const controller = new AbortController();
  const pending = svc.commitTradeTemplateChange(preview.previewId, 0, consent, controller.signal);
  await until(() => s.port.held.length > 0, 'durable commit acknowledgement not received');
  assert.equal(s.port.held.length, 1);
  assert.equal(s.port.held[0].result.ok, true);
  assert.equal(s.storage.writes, writes + 1);
  const durable = clone(s.storage.rows);
  controller.abort();
  cancelled(await pending, 'commit after durable write');
  assert.equal(svc.profileId, null);
  assert.equal(svc.current.state, 'locked');
  await until(() => s.port.delivered.some(x => x.kind === 'response' && x.operation === 'lock' && x.ok),
    'Worker lock was not acknowledged');
  s.port.release();
  assert.equal(svc.current.state, 'locked');
  assert.equal(svc.profileId, null);
  assert.equal(s.storage.writes, writes + 1);
  assert.deepEqual(s.storage.rows, durable);
  good(await svc.unlock(s.profileId, passphrase));
  const after = good(await svc.loadTradeTemplates());
  assert.equal(after.revision, 1);
  assert.deepEqual(after.library.templates, [{ slot: 0, defaults }]);
  assert.equal(s.port.commands.filter(x => x.operation === 'commitTradeTemplateChange').length, 1);
  assert.equal(s.storage.writes, writes + 1);
});
