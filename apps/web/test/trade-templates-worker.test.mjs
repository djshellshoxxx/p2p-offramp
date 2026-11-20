import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService, EncryptedBackupService } from '../../../packages/storage/index.ts';
import { encodeBase64url } from '../../../packages/schemas/index.ts';
import { TRADE_DRAFT_RECORD_ID } from '../../../packages/schemas/index.ts';
import { createVaultWorkerEndpoint } from '../src/runtime/worker-endpoint.ts';

const passphrase = 'saved favorites native fixture passphrase';
const config = { version: 1, ReleaseEnabled: 0, connectOrigins: [] };
const bytes = n => new TextEncoder().encode(`{"synthetic-favorite-terms":${n}}`);
const clone = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const live = [];
afterEach(() => { for (const service of live.splice(0)) service.dispose(); });

class Store {
  rows = new Map(); writes = 0;
  subscribeInvalidation() { return () => {}; }
  async get(id) { return clone(this.rows.get(id)); }
  async listProfileIds() { return { profileIds: [...this.rows.keys()], truncated: false }; }
  async add(row, options) { options?.assertCurrent?.(); this.rows.set(row.profileId, clone(row)); this.writes++; }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw Object.assign(new Error('CONFLICT'), { code: 'CONFLICT' });
    this.rows.set(next.profileId, clone(next)); this.writes++;
  }
}

async function setup({ wrap, now } = {}) {
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
  const backup = new EncryptedBackupService(store), messages = [];
  live.push(vault, backup);
  const session = (await vault.create(passphrase)).value; vault.lockAll();
  const endpoint = createVaultWorkerEndpoint(message => messages.push(clone(message)), {
    createServices: () => ({ vault: wrap ? wrap(vault) : vault, backup }), ...(now ? { now } : {}),
  });
  live.push(endpoint);
  let requestId = 0;
  const send = (operation, fields = {}, generation = 0) => endpoint.dispatch({ version: 1, requestId: ++requestId, generation, operation, ...fields });
  const result = () => messages.at(-1).result;
  const value = () => { assert.equal(result()?.ok, true, JSON.stringify(messages.at(-1))); return result().value; };
  const error = () => { assert.equal(result()?.ok, false, JSON.stringify(messages.at(-1))); return result().error.code; };
  const profileId = session.profileId;
  const unlock = async (generation = 0) => { await send('unlock', { profileId, passphrase }, generation); value(); };
  const save = async (n, generation = 0) => { await send('saveTermsReview', { profileId, source: 'file', bytes: bytes(n) }, generation); return value().recordId; };
  const list = async (generation = 0) => { await send('loadTradeTemplates', { profileId }, generation); return value(); };
  const plan = async (change, revision, generation = 0) => { await send('previewTradeTemplateChange', { profileId, expectedRevision: revision, change }, generation); return value(); };
  const commit = async (preview, generation = 0) => { await send('commitTradeTemplateChange', { profileId, expectedRevision: preview.revision, previewId: preview.previewId, consent }, generation); return value(); };
  await send('init', { config }); value();
  return { store, vault, backup, endpoint, messages, profileId, send, value, error, unlock, save, list, plan, commit };
}

const defaults = { networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native', amountBaseUnits: '123456789', fiatCurrency: 'USD', fiatMinorUnits: '100', fiatScale: 2 };
const consent = { reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true };
const put = (slot = 0) => ({ kind: 'put-template', slot, defaults });

test('real Worker native store keeps revision-zero preview authority across commands and encrypted writes survive reopening', async () => {
  const s = await setup(); await s.unlock(); const initial = await s.list(), writes = s.store.writes;
  assert.equal(initial.revision, 0); assert.deepEqual(initial.library.templates, []);
  const emptyDefault = await s.plan({ kind: 'set-repeat-default', slot: null }, 0);
  assert.deepEqual(await s.commit(emptyDefault), { revision: 0, changed: false, persisted: true, sessionCurrent: true });
  const planned = await s.plan(put(), 0); assert.equal(s.store.writes, writes);
  assert.deepEqual(await s.commit(planned), { revision: 1, changed: true, persisted: true, sessionCurrent: true });
  assert.equal(s.store.writes, writes + 1);
  assert.doesNotMatch(JSON.stringify([...s.store.rows.values()]), /trade-drafts|fiatCurrency|amountBaseUnits|escrow-local-v1/);
  await s.send('lock', {}, 1); await s.unlock(1);
  const reopened = await s.list(1); assert.deepEqual(reopened.library.templates, [{ slot: 0, defaults }]); assert.equal(reopened.revision, 1);
});
test('max-eight templates, update, repeat selection, explicit remove and noop preserve native bounded semantics', async () => {
  const s = await setup(); await s.unlock(); let revision = 0;
  for (let slot = 0; slot < 8; slot++) revision = (await s.commit(await s.plan(put(slot), revision))).revision;
  assert.equal((await s.list()).library.templates.length, 8);
  const updated = { ...put(), defaults: { ...defaults, fiatMinorUnits: '250' } };
  revision = (await s.commit(await s.plan(updated, revision))).revision;
  revision = (await s.commit(await s.plan({ kind: 'set-repeat-default', slot: 0 }, revision))).revision;
  const writes = s.store.writes;
  const noop = await s.commit(await s.plan({ kind: 'set-repeat-default', slot: 0 }, revision));
  assert.equal(noop.changed, false); assert.equal(noop.revision, revision); assert.equal(s.store.writes, writes);
  const remove = await s.plan({ kind: 'remove-template', slot: 0 }, revision); assert.equal(remove.clearsRepeatDefault, true);
  await s.commit(remove); const after = await s.list(); assert.equal(after.library.repeatDefaultSlot, null); assert.equal(after.library.templates.length, 7);
});
test('cancelled and stale previews cannot commit or silently retry', async () => {
  const s = await setup(); await s.unlock(); const planned = await s.plan(put(), 0), writes = s.store.writes;
  await s.send('cancelTradeTemplateChange', { profileId: s.profileId }); assert.deepEqual(s.value(), { cancelled: true });
  await s.send('commitTradeTemplateChange', { profileId: s.profileId, expectedRevision: 0, previewId: planned.previewId, consent }); assert.equal(s.error(), 'NOT_FOUND');
  const fresh = await s.plan(put(), 0); await s.save(1);
  await s.send('commitTradeTemplateChange', { profileId: s.profileId, expectedRevision: 0, previewId: fresh.previewId, consent }); assert.equal(s.error(), 'CONFLICT');
  assert.equal(s.store.writes, writes + 1); assert.deepEqual((await s.list()).library.templates, []);
});
test('five-minute expiry cannot be extended by ordinary activity, load or status', async () => {
  let now = 0; const s = await setup({ now: () => now }); await s.unlock(); const planned = await s.plan(put(), 0), writes = s.store.writes;
  now = 299_000; await s.send('activity'); s.value(); await s.list();
  now = 300_000; await s.send('commitTradeTemplateChange', { profileId: s.profileId, expectedRevision: 0, previewId: planned.previewId, consent });
  assert.equal(s.error(), 'CONFLICT'); assert.equal(s.store.writes, writes);
});
test('profile/epoch replacement refuses old preview and foreign selection before access', async () => {
  const s = await setup(); await s.unlock(); const planned = await s.plan(put(), 0), writes = s.store.writes;
  await s.send('loadTradeTemplates', { profileId: 'f'.repeat(32) }); assert.equal(s.error(), 'LOCKED');
  await s.send('lock', {}, 1); await s.unlock(1);
  await s.send('commitTradeTemplateChange', { profileId: s.profileId, expectedRevision: 0, previewId: planned.previewId, consent }, 1); assert.equal(s.error(), 'NOT_FOUND');
  assert.equal(s.store.writes, writes); assert.deepEqual((await s.list(1)).library.templates, []);
});
test('foreign reserved rows are refused unchanged through real Worker load and preview', async () => {
  for (const kind of ['trade', 'preference']) {
    const s = await setup(), native = (await s.vault.unlock(s.profileId, passphrase)).value;
    const row = { id: TRADE_DRAFT_RECORD_ID, kind, schemaVersion: 1, payload: encodeBase64url(bytes(7)) };
    assert.equal((await s.vault.commit(native.sessionId, native.revision, [{ op: 'put', record: row }])).ok, true);
    s.vault.lockAll(); await s.unlock(); const before = clone(s.store.rows), writes = s.store.writes;
    await s.send('loadTradeTemplates', { profileId: s.profileId }); assert.equal(s.error(), kind === 'trade' ? 'CONFLICT' : 'INVALID_INPUT');
    await s.send('previewTradeTemplateChange', { profileId: s.profileId, expectedRevision: 1, change: put() }); assert.equal(s.error(), kind === 'trade' ? 'CONFLICT' : 'INVALID_INPUT');
    assert.equal(s.store.writes, writes); assert.deepEqual(s.store.rows, before);
  }
});
test('native durable commit after timeout is reconciled on explicit reload and never reported as cancellation rollback', async () => {
  let now = 0, hold = false; const entered = deferred(), release = deferred();
  const s = await setup({ now: () => now, wrap: vault => new Proxy(vault, { get(target, key) {
    if (key === 'commit') return async (...args) => { const result = await target.commit(...args); if (hold && args[2].length > 0) { entered.resolve(); await release.promise; } return result; };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } }) });
  await s.unlock(); const planned = await s.plan(put(), 0); hold = true;
  const pending = s.send('commitTradeTemplateChange', { profileId: s.profileId, expectedRevision: 0, previewId: planned.previewId, consent });
  await entered.promise; now = 30_001; release.resolve(); await pending;
  assert.equal(s.error(), 'TIMEOUT'); assert.equal(s.messages.some(m => m.operation === 'commitTradeTemplateChange' && m.result.ok), false);
  hold = false; await s.unlock(); assert.deepEqual((await s.list()).library.templates, [{ slot: 0, defaults }]);
});

test('lock during a held pre-write commit aborts it, keeps physical admission busy and suppresses the retired reply', async () => {
  let hold = false; const entered = deferred(), release = deferred();
  const s = await setup({ wrap: vault => new Proxy(vault, { get(target, key) {
    if (key === 'commit') return async (...args) => { if (hold && args[2].length > 0) { entered.resolve(); await release.promise; } return target.commit(...args); };
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } }) });
  await s.unlock(); const planned = await s.plan(put(), 0), writes = s.store.writes; hold = true;
  const pending = s.send('commitTradeTemplateChange', { profileId: s.profileId, expectedRevision: 0, previewId: planned.previewId, consent });
  await entered.promise; await s.send('lock', {}, 1); s.value();
  await s.send('unlock', { profileId: s.profileId, passphrase }, 1); assert.equal(s.error(), 'BUSY');
  release.resolve(); await pending; assert.equal(s.store.writes, writes);
  assert.equal(s.messages.some(m => m.operation === 'commitTradeTemplateChange'), false);
  hold = false; await s.unlock(1); assert.deepEqual((await s.list(1)).library.templates, []);
});
