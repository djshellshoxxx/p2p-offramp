import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RegistryService } from '../../../packages/domain/index.ts';
import { TRADE_DRAFT_LIBRARY_FORMAT } from '../../../packages/schemas/index.ts';
import { createTradeReviewController } from '../src/trade/review-controller.ts';
import { createTradeDraftController, DRAFT_FIELD_NAMES } from '../src/trade/draft-controller.ts';
const registryBytes = new Uint8Array(await readFile(new URL('../../../packages/domain/test/fixtures/local-evm-scenario/registry.json', import.meta.url)));
const defaults = { networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native', amountBaseUnits: '123456789', fiatCurrency: 'USD', fiatMinorUnits: '100', fiatScale: 2 };
const now = 1700000000n, consent = { amounts: true, identities: true, emptyInstructions: false };
const input = () => ({ ...defaults, seller: `0x${'12'.repeat(20)}`, buyer: `0x${'34'.repeat(20)}`, paymentInstructions: 'Fresh private instruction never persisted by a template',
  acceptBeforeSeconds: String(now + 600n), escrowExpirySeconds: String(now + 7200n) });
const ok = value => ({ ok: true, value }), bad = code => ({ ok: false, error: { code, messageKey: `runtime.error.${code.toLowerCase()}` } });
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve: value => resolve(value) }; };
const clone = value => structuredClone(value), live = [];
afterEach(() => { for (const value of live.splice(0).reverse()) value.dispose(); });
function memoryPort() {
  let state = { state: 'unlocked' }, scope = 1, revision = 0, pending = null, counter = 0;
  let library = { format: TRADE_DRAFT_LIBRARY_FORMAT, version: 1, templates: [], repeatDefaultSlot: null };
  const calls = [], listeners = new Set();
  return {
    calls, getSnapshot: () => state, selectionScope: () => scope,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    select(unlocked = true, notify = true) { state = { state: unlocked ? 'unlocked' : 'locked' }; scope++; if (notify) for (const fn of listeners) fn(); },
    async loadTradeTemplates(signal) { calls.push({ operation: 'load', signal }); return ok({ revision, library: clone(library) }); },
    async previewTradeTemplateChange(expectedRevision, change, signal) {
      calls.push({ operation: 'preview', expectedRevision, change: clone(change), signal });
      if (expectedRevision !== revision) return bad('CONFLICT');
      pending = { previewId: (++counter).toString(16).padStart(32, '0'), revision, change: clone(change), affectedTemplateCount: 1,
        clearsRepeatDefault: change.kind === 'remove-template' && change.slot === library.repeatDefaultSlot, logicalOnly: true, backupAndRemoteCopiesUnaffected: true };
      return ok(clone(pending));
    },
    async commitTradeTemplateChange(previewId, expectedRevision, consent, signal) {
      calls.push({ operation: 'commit', previewId, expectedRevision, consent: clone(consent), signal });
      if (!pending || pending.previewId !== previewId) return bad('NOT_FOUND');
      if (expectedRevision !== revision) return bad('CONFLICT');
      const change = pending.change; pending = null;
      if (change.kind === 'put-template') library.templates = [...library.templates.filter(t => t.slot !== change.slot), { slot: change.slot, defaults: change.defaults }].sort((a,b) => a.slot-b.slot);
      if (change.kind === 'remove-template') { library.templates = library.templates.filter(t => t.slot !== change.slot); if (library.repeatDefaultSlot === change.slot) library.repeatDefaultSlot = null; }
      if (change.kind === 'set-repeat-default') library.repeatDefaultSlot = change.slot;
      return ok({ revision: ++revision, changed: true, persisted: true, sessionCurrent: true });
    },
    async cancelTradeTemplateChange(signal) { calls.push({ operation: 'cancel', signal }); pending = null; return ok({ cancelled: true }); },
    bump() { revision++; },
  };
}
async function setup({ port = memoryPort(), review } = {}) {
  const registry = new RegistryService(); assert.equal((await registry.load(registryBytes, createHash('sha256').update(registryBytes).digest('hex'))).ok, true);
  let counter = 0, valid = true;
  const lookup = { network: id => valid ? registry.network(id) : null, deployment: (network, id) => valid ? registry.deployment(network, id) : null };
  const trade = createTradeReviewController({ source: async () => ({ kind: 'ready', label: 'synthetic-demo', registry: lookup, samples: [] }), nowSeconds: () => now,
    randomBytes: length => new Uint8Array(length).fill(++counter), ...(review ? { review } : {}) });
  live.push(trade); await trade.loadRegistry(); const drafts = createTradeDraftController(port, trade); live.push(drafts);
  const fill = (values = input()) => { for (const [field, value] of Object.entries(values)) drafts.edit(field, String(value)); };
  const save = async () => { await drafts.load(); fill(); await drafts.previewPut(0); await drafts.commit(true); await drafts.load(); };
  return { port, trade, drafts, fill, save, retireRegistry() { valid = false; } };
}
test('load and changes are explicit; revision zero, preview consent and no automatic retry are retained', async () => {
  const s = await setup(); assert.equal(s.port.calls.length, 0); s.fill(); await s.drafts.previewPut(0); assert.equal(s.drafts.getSnapshot().code, 'CONFLICT');
  await s.drafts.load(); await s.drafts.previewPut(0); const preview = s.drafts.getSnapshot().preview;
  assert.equal(preview.revision, 0); assert.deepEqual(preview.change.defaults, defaults);
  assert.doesNotMatch(JSON.stringify(preview), /Fresh private instruction|seller|buyer|Seconds|signature|Salt|orderId/);
  await s.drafts.commit(false); assert.equal(s.port.calls.filter(c => c.operation === 'commit').length, 0);
  await s.drafts.commit(true); assert.equal(s.drafts.getSnapshot().status, 'saved'); assert.equal(s.drafts.getSnapshot().library, null);
  assert.deepEqual(s.port.calls.at(-1).consent, { reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true });
  await s.drafts.load(); s.port.bump(); await s.drafts.previewPut(1); assert.equal(s.drafts.getSnapshot().code, 'CONFLICT');
  assert.equal(s.port.calls.filter(c => c.operation === 'preview').length, 2); assert.equal(s.drafts.getSnapshot().library, null);
});
test('apply and repeat default apply only seven fields, clear prior private inputs and never review implicitly', async () => {
  const s = await setup(); await s.save(); const before = s.drafts.getSnapshot().generation;
  s.drafts.apply(0); const fields = s.drafts.getSnapshot().fields;
  assert.ok(s.drafts.getSnapshot().generation > before);
  for (const [key, value] of Object.entries(defaults)) assert.equal(fields[key], String(value));
  for (const key of DRAFT_FIELD_NAMES.slice(7)) assert.equal(fields[key], '');
  assert.deepEqual(s.trade.getSnapshot().reviews, []);
  await s.drafts.preview({ kind: 'set-repeat-default', slot: 0 }); await s.drafts.commit(true); await s.drafts.load();
  s.fill(); s.drafts.applyRepeatDefault(); assert.equal(s.drafts.getSnapshot().fields.paymentInstructions, ''); assert.equal(s.drafts.getSnapshot().fields.acceptBeforeSeconds, '');
  assert.equal(await s.drafts.review(consent), null, 'fresh parties and windows must be entered');
});
test('fresh explicit review uses actual current registry and canonical builder, with new identity and no persistence/signing authority', async () => {
  const s = await setup(); await s.save(); s.drafts.apply(0); s.fill();
  assert.equal(await s.drafts.review({ ...consent, amounts: false }), null); assert.equal(s.trade.getSnapshot().reviews.length, 0);
  const first = await s.drafts.review(consent); assert.ok(first); const old = s.trade.find(first), a = JSON.parse(new TextDecoder().decode(old.bytes));
  assert.equal(old.source, 'local-draft'); assert.equal(old.savedId, null); assert.deepEqual(a.privateAgreement.capabilities, []);
  let persisted = false; await s.trade.saveToProfile(first, { saveTermsReview() { persisted = true; } }); assert.equal(persisted, false, 'file/sample saved-review schema stays unchanged');
  s.drafts.apply(0); assert.equal(s.trade.find(first), null); assert.equal(old.bytes.every(value => value === 0), true);
  s.fill(); const second = await s.drafts.review(consent), b = JSON.parse(new TextDecoder().decode(s.trade.find(second).bytes));
  for (const key of ['orderId', 'sellerNonce']) assert.notEqual(a.terms[key], b.terms[key]);
  assert.notEqual(a.privateAgreement.agreementSalt, b.privateAgreement.agreementSalt); assert.notEqual(a.terms.privateAgreementHash, b.terms.privateAgreementHash);
  assert.equal(s.port.calls.filter(c => c.operation === 'commit').length, 1, 'review performs no persistence, transaction or signing action');
});
test('registry retirement refuses applying or reviewing formerly valid stored defaults', async () => {
  const s = await setup(); await s.save(); s.retireRegistry(); const before = s.drafts.getSnapshot().fields;
  s.drafts.apply(0); assert.equal(s.drafts.getSnapshot().code, 'REGISTRY_NOT_READY'); assert.equal(s.drafts.getSnapshot().fields, before);
  assert.equal(await s.drafts.review(consent), null); assert.equal(s.trade.getSnapshot().reviews.length, 0);
});
test('selection change and lock clear fields, preview, observed library and owned private reviewed bytes', async () => {
  for (const [unlocked, notify] of [[false, true], [true, true], [true, false]]) {
    const s = await setup(); await s.save(); const id = await s.drafts.review(consent), bytes = s.trade.find(id).bytes;
    await s.drafts.previewPut(0); assert.ok(s.drafts.getSnapshot().preview);
    s.port.select(unlocked, notify); const state = s.drafts.getSnapshot();
    assert.equal(state.library, null); assert.equal(state.preview, null); assert.equal(Object.values(state.fields).every(v => v === ''), true);
    assert.equal(s.trade.find(id), null); assert.equal(bytes.every(v => v === 0), true);
  }
});
test('cancel consumes an idle preview and prevents any later commit without a new plan', async () => {
  const s = await setup(); await s.drafts.load(); s.fill(); await s.drafts.previewPut(0); await s.drafts.cancel();
  assert.equal(s.drafts.getSnapshot().preview, null); await s.drafts.commit(true); assert.equal(s.port.calls.some(c => c.operation === 'commit'), false);
  assert.equal(s.port.calls.filter(c => c.operation === 'cancel').length, 1);
});
test('held load, plan and commit replies cannot republish private projections after silent selection retirement', async () => {
  for (const method of ['loadTradeTemplates', 'previewTradeTemplateChange', 'commitTradeTemplateChange']) {
    const s = await setup(); await s.save(); s.fill();
    if (method === 'commitTradeTemplateChange') await s.drafts.previewPut(0);
    const held = deferred(), original = s.port[method]; let response;
    s.port[method] = async (...args) => { response = await original(...args); await held.promise; return response; };
    const pending = method === 'loadTradeTemplates' ? s.drafts.load() : method === 'previewTradeTemplateChange' ? s.drafts.previewPut(0) : s.drafts.commit(true);
    await new Promise(done => setImmediate(done)); s.port.select(true, false); held.resolve(); await pending;
    const state = s.drafts.getSnapshot(); assert.equal(state.library, null); assert.equal(state.preview, null); assert.equal(state.status, 'idle'); assert.equal(state.busy, null);
    assert.equal(Object.values(state.fields).every(value => value === ''), true);
  }
});
test('cancel during a held durable commit reports uncertainty, aborts admission, and never retries', async () => {
  const s = await setup(); await s.drafts.load(); s.fill(); await s.drafts.previewPut(0);
  const held = deferred(), original = s.port.commitTradeTemplateChange;
  s.port.commitTradeTemplateChange = async (...args) => { const receipt = await original(...args); await held.promise; return receipt; };
  const pending = s.drafts.commit(true); await new Promise(done => setImmediate(done)); const signal = s.port.calls.at(-1).signal;
  await s.drafts.cancel(); assert.equal(signal.aborted, true); assert.equal(s.drafts.getSnapshot().code, 'UNKNOWN_OUTCOME');
  held.resolve(); await pending; assert.equal(s.drafts.getSnapshot().status, 'failed'); assert.equal(s.port.calls.filter(c => c.operation === 'commit').length, 1);
  await s.drafts.load(); assert.equal(s.drafts.getSnapshot().library.library.templates.length, 1, 'explicit read reconciles native persistence');
});

test('observer retirement during accepted-draft publication removes the just-created private projection and route', async () => {
  const s = await setup(); s.fill(); let captured;
  const stop = s.trade.subscribe(() => {
    if (s.trade.getSnapshot().job.kind === 'accepted') { captured = s.trade.getSnapshot().reviews.at(-1).bytes; s.port.select(true, false); }
  });
  assert.equal(await s.drafts.review(consent), null); stop();
  assert.deepEqual(s.trade.getSnapshot().reviews, []); assert.ok(captured); assert.equal(captured.every(value => value === 0), true);
  assert.equal(Object.values(s.drafts.getSnapshot().fields).every(value => value === ''), true);
});

test('lock during a held commit clears private fields while retaining only generic outcome uncertainty', async () => {
  const s = await setup(); await s.drafts.load(); s.fill(); await s.drafts.previewPut(0);
  const held = deferred(), original = s.port.commitTradeTemplateChange;
  s.port.commitTradeTemplateChange = async (...args) => { const receipt = await original(...args); await held.promise; return receipt; };
  const pending = s.drafts.commit(true); await new Promise(done => setImmediate(done)); s.port.select(false);
  const locked = s.drafts.getSnapshot(); assert.equal(locked.status, 'failed'); assert.equal(locked.code, 'UNKNOWN_OUTCOME');
  assert.equal(locked.library, null); assert.equal(locked.preview, null); assert.equal(Object.values(locked.fields).every(value => value === ''), true);
  held.resolve(); await pending; assert.equal(s.drafts.getSnapshot().code, 'UNKNOWN_OUTCOME');
  s.port.select(true); assert.equal(s.drafts.getSnapshot().status, 'idle'); await s.drafts.load(); assert.equal(s.drafts.getSnapshot().library.library.templates.length, 1);
});
test('disposing an idle preview clears its local fields and explicitly cancels its native preview authority', async () => {
  const s = await setup(); await s.drafts.load(); s.fill(); await s.drafts.previewPut(0); s.drafts.dispose();
  assert.equal(s.port.calls.at(-1).operation, 'cancel'); assert.equal(s.drafts.getSnapshot().preview, null);
  assert.equal(Object.values(s.drafts.getSnapshot().fields).every(value => value === ''), true);
});

test('blank new instructions require their own explicit acknowledgement before fresh review', async () => {
  const s = await setup(); s.fill({ ...input(), paymentInstructions: '' });
  assert.equal(await s.drafts.review(consent), null); assert.equal(s.trade.getSnapshot().reviews.length, 0);
  assert.ok(await s.drafts.review({ ...consent, emptyInstructions: true }));
});
test('locking during held draft review wipes the owned byte view and suppresses any eventual route', async () => {
  const held = deferred(); let bytes;
  const s = await setup({ review: async (_registry, value) => { bytes = value; await held.promise; return { ok: false, code: 'UNAVAILABLE' }; } });
  s.trade.setPersistence(s.port); // The maintained OfflineRoot binds this same selected-profile port.
  s.fill(); const pending = s.drafts.review(consent);
  while (!bytes) await new Promise(done => setImmediate(done));
  s.port.select(false); assert.equal(bytes.every(value => value === 0), true, 'profile retirement clears the owned private view before physical review drains');
  held.resolve(); assert.equal(await pending, null); assert.equal(bytes.every(value => value === 0), true); assert.equal(s.trade.getSnapshot().reviews.length, 0);
});
