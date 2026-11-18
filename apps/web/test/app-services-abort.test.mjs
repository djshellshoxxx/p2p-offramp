import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
import { createVaultWorkerEndpoint } from '../src/runtime/worker-endpoint.ts';
import { startAppServices } from '../src/app-services.ts';

const pass = 'public synthetic abort facade passphrase';
const defaults = () => ({
  networkId: 'local-evm',
  deploymentId: 'escrow-local-v1',
  assetId: 'native',
  amountBaseUnits: '123456789',
  fiatCurrency: 'USD',
  fiatMinorUnits: '100',
  fiatScale: 2,
});
const consent = { reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true };
const retentionConsent = (p) => ({
  previewId: p.previewId,
  expectedRevision: p.revision,
  consentRevision: p.revision,
  ...consent,
});
const val = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};
const err = (result, code) => {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.error.code, code);
};
const clone = (value) => structuredClone(value);
const live = [];
afterEach(() => {
  for (const item of live.splice(0)) item.dispose();
});
class Store {
  rows = new Map();
  writes = 0;
  async get(id) {
    return clone(this.rows.get(id));
  }
  async listProfileIds() {
    return { profileIds: [...this.rows.keys()], truncated: false };
  }
  async add(row, options) {
    options?.assertCurrent?.();
    this.rows.set(row.profileId, clone(row));
    this.writes++;
  }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    this.rows.set(next.profileId, clone(next));
    this.writes++;
  }
  subscribeInvalidation() {
    return () => {};
  }
}
async function compose() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
  const store = new Store(),
    vault = new EncryptedVaultService(store, crypto, { lifecycle: false }),
    backup = new EncryptedBackupService(store);
  live.push(vault, backup);
  const sent = [];
  class Port extends EventTarget {
    hold = false;
    held = [];
    postMessage(command) {
      sent.push(command.operation);
      const copied = clone(command);
      queueMicrotask(() => void endpoint.dispatch(copied));
    }
    deliver(message) {
      this.dispatchEvent(new MessageEvent('message', { data: clone(message) }));
    }
    terminate() {
      endpoint.dispose();
    }
  }
  const port = new Port();
  const endpoint = createVaultWorkerEndpoint(
    (message) =>
      queueMicrotask(() => {
        if (
          port.hold &&
          port.held.length === 0 &&
          message.kind === 'response' &&
          message.operation === 'commitTradeDraftChange'
        )
          port.held.push(message);
        else port.deliver(message);
      }),
    { createServices: () => ({ vault, backup }) },
  );
  live.push(endpoint);
  const services = val(await startAppServices({ createWorker: () => port, lifecycle: false }));
  const restore = () => {
    if (previous) Object.defineProperty(globalThis, 'isSecureContext', previous);
    else delete globalThis.isSecureContext;
  };
  return { store, port, sent, services, restore };
}
async function planned(s) {
  const created = val(await s.services.create(pass));
  const initial = val(await s.services.loadTradeDraftLibrary());
  const change = { kind: 'put-template', slot: 0, defaults: defaults() };
  const preview = val(await s.services.planTradeDraftChange(initial.revision, change));
  return { created, initial, preview };
}

test('commitTradeDraftChange aborted before the Worker write persists nothing and rejects as CANCELLED', async () => {
  const s = await compose();
  try {
    const { initial, preview } = await planned(s);
    const writes = s.store.writes,
      posts = s.sent.length;
    const controller = new AbortController();
    controller.abort();
    const result = await s.services.commitTradeDraftChange(
      preview.previewId,
      preview.revision,
      consent,
      controller.signal,
    );
    err(result, 'CANCELLED');
    assert.equal(s.sent.length, posts, 'no commit command may reach the Worker');
    assert.equal(s.sent.includes('commitTradeDraftChange'), false);
    assert.equal(s.store.writes, writes);
    const after = val(await s.services.loadTradeDraftLibrary());
    assert.equal(after.revision, initial.revision);
    assert.equal(after.library.templates[0], undefined);
  } finally {
    await s.services.dispose();
    s.restore();
  }
});

// After the command is posted the runtime cannot know whether the Worker wrote, so the abort
// locks the runtime and the caller reconciles by unlocking and reloading.
const postCommitAbortTitle =
  'commitTradeDraftChange aborted after the write crossed the boundary is CANCELLED and reconciled by reload';
test(postCommitAbortTitle, async () => {
  const s = await compose();
  try {
    const { created, initial, preview } = await planned(s);
    const writes = s.store.writes;
    s.port.hold = true;
    const controller = new AbortController();
    const pending = s.services.commitTradeDraftChange(preview.previewId, preview.revision, consent, controller.signal);
    while (s.port.held.length === 0) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(s.store.writes, writes + 1, 'the write already happened; the outcome is unknown to the caller');
    controller.abort();
    err(await pending, 'CANCELLED');
    s.port.hold = false;
    assert.equal(s.services.profileId, null, 'abort locks the runtime; the caller must unlock and reload');
    assert.equal(s.store.writes, writes + 1, 'no blind resend');
    val(await s.services.unlock(created.profileId, pass));
    const reloaded = val(await s.services.loadTradeDraftLibrary());
    assert.equal(reloaded.revision, initial.revision + 1);
    assert.deepEqual(reloaded.library.templates[0].defaults, defaults());
  } finally {
    await s.services.dispose();
    s.restore();
  }
});

test('every AppServices method that accepts a signal sends nothing to the Worker when already aborted', async () => {
  const s = await compose();
  try {
    const { preview } = await planned(s);
    const retention = val(await s.services.reviewRetention());
    const id = 'a'.repeat(32),
      bytes = new Uint8Array(8),
      controller = new AbortController();
    controller.abort();
    const signal = controller.signal,
      svc = s.services;
    const change = { kind: 'put-template', slot: 1, defaults: defaults() };
    const calls = {
      getTransportSelection: () => svc.getTransportSelection(signal),
      selectTransportMode: () =>
        svc.selectTransportMode({ mode: 'strict', expectedBrokerGeneration: 0, ordinaryConsent: false }, signal),
      unlock: () => svc.unlock(id, pass, signal),
      create: () => svc.create(pass, signal),
      listProfiles: () => svc.listProfiles(signal),
      restore: () => svc.restore(bytes, pass, pass, signal),
      planRetention: () => svc.planRetention(signal),
      reviewRetention: () => svc.reviewRetention(signal),
      deleteReviewedRecords: () => svc.deleteReviewedRecords(retentionConsent(retention), signal),
      exportEncrypted: () => svc.exportEncrypted(id, signal),
      verifyBackup: () => svc.verifyBackup(bytes, pass, signal),
      checkBackupVerification: () => svc.checkBackupVerification(signal),
      saveTermsReview: () => svc.saveTermsReview('pasted', bytes, signal),
      listTermsReviews: () => svc.listTermsReviews(signal),
      listReviewFavorites: () => svc.listReviewFavorites(signal),
      loadTradeDraftLibrary: () => svc.loadTradeDraftLibrary(signal),
      planTradeDraftChange: () => svc.planTradeDraftChange(preview.revision, change, signal),
      commitTradeDraftChange: () => svc.commitTradeDraftChange(preview.previewId, preview.revision, consent, signal),
      setReviewFavorite: () => svc.setReviewFavorite(id, true, preview.revision, signal),
      deleteTermsReview: () => svc.deleteTermsReview(id, signal),
      listRecoveryReferences: () => svc.listRecoveryReferences(0, null, signal),
    };
    for (const [name, call] of Object.entries(calls)) {
      const posts = s.sent.length,
        writes = s.store.writes;
      const result = await call();
      assert.equal(result.ok, false, `${name} must not succeed once aborted: ${JSON.stringify(result)}`);
      assert.equal(result.error.code, 'CANCELLED', `${name} must reject with CANCELLED`);
      assert.equal(s.sent.length, posts, `${name} must not post a command`);
      assert.equal(s.store.writes, writes, `${name} must not write`);
    }
  } finally {
    await s.services.dispose();
    s.restore();
  }
});
