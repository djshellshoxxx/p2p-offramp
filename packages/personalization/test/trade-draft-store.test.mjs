import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTradeDraftStore } from '../src/trade-draft-store.ts';
import { EncryptedVaultService, EncryptedBackupService } from '../../storage/index.ts';
import { TRADE_DRAFT_RECORD_ID, TRADE_DRAFT_LIBRARY_FORMAT, encodeBase64url, decodeTradeDraftLibraryPayload, parseVaultEnvelope, ValidationError } from '../../schemas/index.ts';

const passphrase = 'public synthetic draft template fixture passphrase';
const defaults = () => ({ networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native', amountBaseUnits: '123456789', fiatCurrency: 'USD', fiatMinorUnits: '100', fiatScale: 2 });
const consent = { reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true };
const live = []; afterEach(() => { for (const item of live.splice(0)) item.dispose(); });
const good = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const bad = (result, code) => { assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.error.code, code); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function assertEncryptedPreferenceOnly(envelope, record, library) {
  assert.deepEqual(parseVaultEnvelope(envelope), envelope, 'persisted row has only the strict encrypted G02 envelope shape');
  // Short fixture values can occur randomly in base64url ciphertext. Search exact known private data
  // and quoted private field names instead, including a decode to catch plaintext hidden by base64.
  const prohibited = [JSON.stringify(record), record.payload, JSON.stringify(library), '"fiatCurrency":', '"amountBaseUnits":', '"templates":'];
  const views = [JSON.stringify(envelope), Buffer.from(envelope.snapshot.ciphertext, 'base64url').toString('latin1'),
    Buffer.from(envelope.wrappedKey.ciphertext, 'base64url').toString('latin1')];
  for (const view of views) for (const needle of prohibited) assert.equal(view.includes(needle), false, 'private preference data must not persist as plaintext or base64');
}
class Store {
  rows = new Map(); writes = 0;
  async get(id) { return structuredClone(this.rows.get(id)); }
  async listProfileIds() { return { profileIds: [...this.rows.keys()], truncated: false }; }
  async add(next, options) { options?.assertCurrent?.(); this.rows.set(next.profileId, structuredClone(next)); this.writes++; }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) { const e = Error('CONFLICT'); e.code = 'CONFLICT'; throw e; }
    this.rows.set(next.profileId, structuredClone(next)); this.writes++;
  }
  subscribeInvalidation() { return () => {}; }
}
async function setup(extra = {}) {
  const storage = new Store(), vault = new EncryptedVaultService(storage, crypto, { lifecycle: false }); live.push(vault);
  const session = good(await vault.create(passphrase));
  const service = good(createTradeDraftStore({ vault, session, ...extra })); live.push(service);
  return { storage, vault, session, service };
}
async function mutate(service, revision, change) {
  const preview = good(await service.plan(revision, change));
  return good(await service.commit(preview.previewId, revision, consent));
}

test('real encrypted native vault stores only bounded seven-field templates and repeat selection', async () => {
  const s = await setup(); const initialWrites = s.storage.writes;
  assert.deepEqual(good(await s.service.load()).library.templates, []); assert.equal(s.storage.writes, initialWrites);
  let revision = s.session.revision;
  for (let slot = 0; slot < 8; slot++) revision = (await mutate(s.service, revision, { kind: 'put-template', slot, defaults: defaults() })).revision;
  revision = (await mutate(s.service, revision, { kind: 'set-repeat-default', slot: 3 })).revision;
  assert.equal(good(await s.service.load()).library.repeatDefaultSlot, 3);
  bad(await s.service.plan(revision, { kind: 'put-template', slot: 8, defaults: defaults() }), 'INVALID_INPUT');
  const before = s.storage.writes;
  const noop = await mutate(s.service, revision, { kind: 'set-repeat-default', slot: 3 }); assert.equal(noop.changed, false); assert.equal(s.storage.writes, before);
  const preview = good(await s.service.plan(revision, { kind: 'remove-template', slot: 3 })); assert.equal(preview.clearsRepeatDefault, true);
  assert.equal(preview.affectedTemplateCount, 1); assert.equal(preview.logicalOnly, true);
  const removed = good(await s.service.commit(preview.previewId, revision, consent)); revision = removed.revision;
  const loaded = good(await s.service.load()); assert.equal(loaded.library.templates.length, 7); assert.equal(loaded.library.repeatDefaultSlot, null);
  const rows = good(await s.vault.list(s.session.sessionId)); assert.equal(rows.length, 1); assert.equal(rows[0].kind, 'preference');
  assert.deepEqual(decodeTradeDraftLibraryPayload(rows[0].payload, 1), loaded.library);
  for (const envelope of s.storage.rows.values()) assertEncryptedPreferenceOnly(envelope, rows[0], loaded.library);
  const envelope = structuredClone([...s.storage.rows.values()][0]);
  const incidental = structuredClone(envelope), ciphertext = incidental.snapshot.ciphertext;
  incidental.snapshot.ciphertext = ciphertext.slice(0, 100) + 'USD' + ciphertext.slice(103);
  assert.doesNotThrow(() => assertEncryptedPreferenceOnly(incidental, rows[0], loaded.library), 'an incidental three-character ciphertext match is allowed');
  // These controls retain a structurally valid padded envelope, so their rejection proves the
  // plaintext guard detects both the canonical private JSON and its stored base64 payload.
  for (const text of [JSON.stringify(loaded.library), JSON.stringify(rows[0])]) {
    const leaked = structuredClone(envelope), content = Buffer.from(text);
    const padded = Buffer.alloc(Math.ceil(content.length / 4096) * 4096 + 16); content.copy(padded);
    leaked.snapshot.ciphertext = padded.toString('base64url');
    assert.doesNotThrow(() => parseVaultEnvelope(leaked));
    assert.throws(() => assertEncryptedPreferenceOnly(leaked, rows[0], loaded.library), { name: 'AssertionError' });
  }
});

test('future, malformed and foreign reserved rows remain intact and unrelated records never change', async () => {
  for (const record of [
    { kind: 'trade', schemaVersion: 1, payload: encodeBase64url(new TextEncoder().encode('{}')) },
    { kind: 'preference', schemaVersion: 2, payload: encodeBase64url(new TextEncoder().encode('{}')) },
    { kind: 'preference', schemaVersion: 1, payload: encodeBase64url(new TextEncoder().encode(JSON.stringify({ format: TRADE_DRAFT_LIBRARY_FORMAT, version: 2, templates: [], repeatDefaultSlot: null }))) },
    { kind: 'preference', schemaVersion: 1, payload: encodeBase64url(new TextEncoder().encode('{}')) },
  ]) {
    const s = await setup(); good(await s.vault.commit(s.session.sessionId, s.session.revision, [
      { op: 'put', record: { id: TRADE_DRAFT_RECORD_ID, ...record } },
      { op: 'put', record: { id: 'a'.repeat(32), kind: 'journal', schemaVersion: 1, payload: encodeBase64url(new TextEncoder().encode('unresolved original bytes')) } },
    ]));
    const before = good(await s.vault.list(s.session.sessionId));
    assert.equal((await s.service.load()).ok, false); assert.equal((await s.service.plan(s.session.revision, { kind: 'put-template', slot: 0, defaults: defaults() })).ok, false);
    assert.deepEqual(good(await s.vault.list(s.session.sessionId)), before);
  }
});

test('previews require exact current consent and cannot be forged, reused or silently rebased', async () => {
  const s = await setup(), rev = s.session.revision;
  const first = good(await s.service.plan(rev, { kind: 'put-template', slot: 0, defaults: defaults() }));
  bad(await s.service.commit('a'.repeat(32), rev, consent), 'NOT_FOUND');
  const second = good(await s.service.plan(rev, { kind: 'put-template', slot: 1, defaults: defaults() }));
  bad(await s.service.commit(first.previewId, rev, consent), 'NOT_FOUND');
  bad(await s.service.commit(second.previewId, rev, { ...consent, reviewed: false }), 'INVALID_INPUT');
  bad(await s.service.commit(second.previewId, rev, consent), 'NOT_FOUND');
  const third = good(await s.service.plan(rev, { kind: 'put-template', slot: 0, defaults: defaults() }));
  const foreign = new EncryptedVaultService(s.storage, crypto, { lifecycle: false }); live.push(foreign);
  const other = good(await foreign.unlock(s.session.profileId, passphrase));
  good(await foreign.commit(other.sessionId, other.revision, [{ op: 'put', record: { id: 'b'.repeat(32), kind: 'preference', schemaVersion: 1, payload: encodeBase64url(new Uint8Array([1])) } }]));
  const count = s.storage.writes;
  bad(await s.service.commit(third.previewId, rev, consent), 'CONFLICT'); assert.equal(s.storage.writes, count);
});

test('lock and A-to-null-to-A lease retirement permanently reject the old consumer', async () => {
  let selected = true; const s = await setup({ isCurrent: () => selected });
  const preview = good(await s.service.plan(s.session.revision, { kind: 'put-template', slot: 0, defaults: defaults() }));
  selected = false; bad(await s.service.load(), 'LOCKED'); selected = true;
  bad(await s.service.commit(preview.previewId, s.session.revision, consent), 'LOCKED');
  bad(await s.service.load(), 'LOCKED');
  const locked = await setup(); locked.vault.lock(locked.session.sessionId); bad(await locked.service.load(), 'LOCKED');
});

test('ignored native write reply retains physical admission and preserves durable outcome after cancellation', async () => {
  const s = await setup(); s.service.dispose();
  const held = deferred(), written = deferred(); let guardLive = true;
  const vault = { captureSession: s.vault.captureSession.bind(s.vault), list: s.vault.list.bind(s.vault),
    async commit(...args) { const result = await s.vault.commit(...args); if (args[2].length) { written.resolve(); await held.promise; } return result; } };
  const service = good(createTradeDraftStore({ vault, session: s.session, isCurrent: () => guardLive })); live.push(service);
  const preview = good(await service.plan(s.session.revision, { kind: 'put-template', slot: 0, defaults: defaults() }));
  const commit = service.commit(preview.previewId, s.session.revision, consent); await written.promise;
  service.cancel(); guardLive = false;
  bad(await service.load(), 'BUSY'); held.resolve();
  const receipt = good(await commit); assert.equal(receipt.persisted, true); assert.equal(receipt.changed, true); assert.equal(receipt.sessionCurrent, false);
  const rows = good(await s.vault.list(s.session.sessionId)); assert.equal(decodeTradeDraftLibraryPayload(rows[0].payload, 1).templates.length, 1);
});

test('real complete-profile backup restores safe defaults into a fresh-key destination only', async () => {
  const s = await setup(); await mutate(s.service, s.session.revision, { kind: 'put-template', slot: 0, defaults: defaults() });
  const backup = new EncryptedBackupService(s.storage); live.push(backup);
  const exported = await backup.exportWithStatus(s.session.profileId);
  const restored = await backup.restore(exported.bytes, passphrase, 'fresh destination draft fixture passphrase');
  assert.notEqual(restored.newProfileId, s.session.profileId); assert.notEqual(restored.newKeyId, [...s.storage.rows.values()][0].keyId);
  const session = good(await s.vault.unlock(restored.newProfileId, 'fresh destination draft fixture passphrase'));
  const store = good(createTradeDraftStore({ vault: s.vault, session })); live.push(store);
  const loaded = good(await store.load()); assert.deepEqual(loaded.library.templates[0].defaults, defaults());
  assert.doesNotMatch(JSON.stringify(loaded.library), /seller|buyer|agreementSalt|paymentInstructions|orderId|Seconds|previewId/);
});

test('recognized foreign errors cannot expose accessor or unknown diagnostic codes', async () => {
  for (const mode of ['accessor', 'unknown', 'uninspectable']) {
    const s = await setup(); let reads = 0;
    const rejection = mode === 'uninspectable' ? new Proxy({}, { getPrototypeOf() { throw new Error('foreign trap'); } }) : new ValidationError();
    if (mode === 'accessor') Object.defineProperty(rejection, 'code', { get() { reads++; return 'private-accessor-code'; } });
    if (mode === 'unknown') rejection.code = 'private-unrecognized-code';
    const vault = { captureSession: s.vault.captureSession.bind(s.vault), list: s.vault.list.bind(s.vault), commit: async () => { throw rejection; } };
    const store = good(createTradeDraftStore({ vault, session: s.session })); live.push(store);
    const result = await store.load(); bad(result, 'STORAGE_UNAVAILABLE'); assert.equal(reads, 0);
    assert.doesNotMatch(JSON.stringify(result), /private-|foreign trap/);
  }
});

test('change previews expire at exactly five minutes and reject reversed or invalid monotonic clocks', async () => {
  for (const elapsed of [299999, 300000]) {
    let clock = 0; const s = await setup({ now: () => clock }); const rev = s.session.revision;
    const preview = good(await s.service.plan(rev, { kind: 'put-template', slot: 0, defaults: defaults() }));
    clock = elapsed; const result = await s.service.commit(preview.previewId, rev, consent);
    if (elapsed < 300000) good(result); else { bad(result, 'CONFLICT'); assert.equal(good(await s.vault.list(s.session.sessionId)).length, 0); }
  }
  for (const later of [-1, 99, NaN, Infinity]) {
    let clock = 100; const s = await setup({ now: () => clock }); const rev = s.session.revision;
    const preview = good(await s.service.plan(rev, { kind: 'put-template', slot: 0, defaults: defaults() }));
    clock = later; bad(await s.service.commit(preview.previewId, rev, consent), 'UNSUPPORTED_ENVIRONMENT');
    assert.equal(good(await s.vault.list(s.session.sessionId)).length, 0);
  }
});

test('expiry after freshness I/O and at the final native write guard starts no write', async () => {
  for (const mode of ['freshness', 'native-write']) {
    const s = await setup(); let clock = 0, armed = false;
    const vault = { captureSession: s.vault.captureSession.bind(s.vault), list: s.vault.list.bind(s.vault),
      async commit(...args) {
        if (armed && args[2].length && mode === 'native-write') clock = 300000;
        const result = await s.vault.commit(...args);
        if (armed && !args[2].length && mode === 'freshness') clock = 300000;
        return result;
      } };
    const service = good(createTradeDraftStore({ vault, session: s.session, now: () => clock })); live.push(service);
    const rev = s.session.revision, preview = good(await service.plan(rev, { kind: 'put-template', slot: 0, defaults: defaults() }));
    const writes = s.storage.writes; armed = true;
    bad(await service.commit(preview.previewId, rev, consent), 'CONFLICT'); assert.equal(s.storage.writes, writes, mode);
  }
});

test('a reentrant last clock callback cannot authorize a cancelled change', async () => {
  const s = await setup(); let service, cancelOnClock = false;
  service = good(createTradeDraftStore({ vault: s.vault, session: s.session, now: () => { if (cancelOnClock) service.cancel(); return 0; } })); live.push(service);
  const rev = s.session.revision, preview = good(await service.plan(rev, { kind: 'put-template', slot: 0, defaults: defaults() }));
  cancelOnClock = true; const writes = s.storage.writes;
  bad(await service.commit(preview.previewId, rev, consent), 'CANCELLED'); assert.equal(s.storage.writes, writes);
});
