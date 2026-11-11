import test from 'node:test';
import assert from 'node:assert/strict';
import { createTradeDraftController } from '../src/trade/draft-controller.ts';
import { TRADE_DRAFT_LIBRARY_FORMAT } from '../../../packages/schemas/index.ts';

const defaults = () => ({ networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native', amountBaseUnits: '123', fiatCurrency: 'USD', fiatMinorUnits: '456', fiatScale: 2 });
const choice = { networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native', chainId: '31337', environment: 'local', escrowAddress: `0x${'56'.repeat(20)}`, assetKind: 'native', assetAddress: null, decimals: 18 };
const yes = value => ({ ok: true, value });
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup() {
  let scope = 1, unlocked = true; const listeners = new Set(), reviews = [], changes = [];
  let library = { format: TRADE_DRAFT_LIBRARY_FORMAT, version: 1, templates: [{ slot: 0, defaults: defaults() }], repeatDefaultSlot: 0 };
  const port = { getSnapshot: () => ({ state: unlocked ? 'unlocked' : 'locked' }), selectionScope: () => scope,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    loadTradeDraftLibrary: async () => yes({ revision: 7, library }),
    planTradeDraftChange: async (revision, change) => { changes.push(change); return yes({ previewId: 'a'.repeat(32), revision, change, affectedTemplateCount: 1, clearsRepeatDefault: false, logicalOnly: true, backupAndRemoteCopiesUnaffected: true }); },
    commitTradeDraftChange: async () => yes({ revision: 8, changed: true, persisted: true, sessionCurrent: true }),
  };
  const review = { getDraftChoices: () => [choice], subscribe: () => () => {}, reviewDraft: async (input, signal) => { reviews.push({ input, signal }); return { kind: 'accepted', localId: 'A'.repeat(22) }; } };
  const controller = createTradeDraftController({ review, persistence: port });
  const lock = () => { unlocked = false; scope++; for (const listener of [...listeners]) listener(); };
  const switchBack = () => { unlocked = true; scope++; for (const listener of [...listeners]) listener(); };
  return { controller, port, review, reviews, changes, lock, switchBack, setLibrary: next => { library = next; } };
}
function complete(c) {
  c.edit('seller', `0x${'12'.repeat(20)}`); c.edit('buyer', `0x${'34'.repeat(20)}`);
  c.edit('paymentInstructions', 'New draft instruction'); c.edit('acceptBeforeSeconds', '1700000600'); c.edit('escrowExpirySeconds', '1700007200');
  c.confirmAmounts(true); c.confirmIdentities(true);
}

test('template and repeat-default application populate only seven defaults and reset all fresh fields every time', async () => {
  const s = setup(), c = s.controller; await c.loadTemplates(); c.useRepeatDefault(); complete(c);
  assert.equal(await c.review(), 'A'.repeat(22));
  c.useTemplate(0); const state = c.getSnapshot();
  assert.equal(state.form.amountBaseUnits, '123'); assert.equal(state.form.fiatScale, '2');
  for (const key of ['seller', 'buyer', 'paymentInstructions', 'acceptBeforeSeconds', 'escrowExpirySeconds']) assert.equal(state.form[key], '', key);
  assert.equal(state.amountsConfirmed, false); assert.equal(state.identitiesConfirmed, false); assert.equal(state.emptyInstructionsConfirmed, false); assert.equal(state.reviewId, null);
  assert.equal(await c.review(), null); assert.equal(s.reviews.length, 1); c.dispose();
});

test('changing asset/network or fiat scale clears amounts instead of reinterpreting units', async () => {
  const { controller: c } = setup(); await c.loadTemplates(); c.useTemplate(0); complete(c);
  c.edit('assetId', 'test-usd'); assert.equal(c.getSnapshot().form.amountBaseUnits, ''); assert.equal(c.getSnapshot().amountsConfirmed, false);
  c.useTemplate(0); c.edit('networkId', 'another'); for (const key of ['deploymentId', 'assetId', 'amountBaseUnits']) assert.equal(c.getSnapshot().form[key], '');
  c.useTemplate(0); c.edit('fiatScale', '3'); assert.equal(c.getSnapshot().form.fiatMinorUnits, ''); c.dispose();
});

test('save/replace preview contains only safe defaults and commit needs explicit change confirmation', async () => {
  const s = setup(), c = s.controller; await c.loadTemplates(); c.useTemplate(0); complete(c);
  await c.planChange({ kind: 'put-template', slot: 1, defaults: c.currentDefaults() });
  assert.deepEqual(s.changes, [{ kind: 'put-template', slot: 1, defaults: defaults() }]);
  assert.doesNotMatch(JSON.stringify(s.changes), /seller|buyer|instruction|Seconds|orderId|nonce/i);
  await c.commitChange(false); assert.equal(c.getSnapshot().code, 'INVALID_INPUT');
  await c.commitChange(true); assert.equal(c.getSnapshot().library.revision, 8); assert.equal(c.getSnapshot().library.library.templates.length, 2); c.dispose();
});

test('profile A-to-null-to-A and a late review cannot restore another selection private fields', async () => {
  const s = setup(), c = s.controller, held = defer(); await c.loadTemplates(); c.useTemplate(0); complete(c);
  s.review.reviewDraft = async () => held.promise;
  const pending = c.review(); s.lock(); s.switchBack(); held.resolve({ kind: 'accepted', localId: 'B'.repeat(22) });
  assert.equal(await pending, null); assert.equal(c.getSnapshot().form.seller, ''); assert.equal(c.getSnapshot().library, null); assert.equal(c.getSnapshot().reviewId, null); c.dispose();
});

test('late library replies and reentrant admission cancellation never publish or start stale work', async () => {
  const s = setup(), c = s.controller, held = defer(); s.port.loadTradeDraftLibrary = async () => held.promise;
  const pending = c.loadTemplates(); s.lock(); s.switchBack(); held.resolve(yes({ revision: 7, library: { format: TRADE_DRAFT_LIBRARY_FORMAT, version: 1, templates: [], repeatDefaultSlot: null } })); await pending;
  assert.equal(c.getSnapshot().library, null);
  let calls = 0; s.port.loadTradeDraftLibrary = async () => { calls++; return yes({ revision: 7, library: { format: TRADE_DRAFT_LIBRARY_FORMAT, version: 1, templates: [], repeatDefaultSlot: null } }); };
  const unsub = c.subscribe(() => { if (c.getSnapshot().busy) c.cancel(); });
  await c.loadTemplates(); assert.equal(calls, 0); unsub(); c.dispose();
});

test('failed/unknown commit consumes the displayed preview and requires an explicit fresh load or plan', async () => {
  const s = setup(), c = s.controller; await c.loadTemplates(); c.useTemplate(0);
  await c.planChange({ kind: 'put-template', slot: 1, defaults: c.currentDefaults() });
  const held = defer(); s.port.commitTradeDraftChange = async () => held.promise;
  const pending = c.commitChange(true); c.cancel(); assert.equal(c.getSnapshot().preview, null); assert.equal(c.getSnapshot().code, 'UNKNOWN_OUTCOME');
  held.resolve(yes({ revision: 8, changed: true, persisted: true, sessionCurrent: true })); await pending;
  assert.equal(c.getSnapshot().code, 'UNKNOWN_OUTCOME'); assert.equal(c.getSnapshot().library.revision, 7); c.dispose();
});

test('foreign errors stay fixed and a hidden selection change cannot expose old draft defaults', async () => {
  const s = setup(), c = s.controller; await c.loadTemplates(); c.useTemplate(0);
  const hostile = new Proxy({}, { getPrototypeOf() { throw new Error('private diagnostic trap'); } });
  s.port.planTradeDraftChange = async () => { throw hostile; };
  await c.planChange({kind:'set-repeat-default',slot:0}); assert.equal(c.getSnapshot().code, 'PROTOCOL_ERROR');
  s.port.selectionScope = () => 3;
  assert.throws(() => c.currentDefaults()); assert.equal(c.getSnapshot().form.amountBaseUnits, ''); c.dispose();
});

test('throwing external unsubscribe callbacks cannot retain private state on replacement or disposal', async () => {
  const s=setup(); let cleaned=0;
  const persistence={...s.port,subscribe:listener=>{const off=s.port.subscribe(listener);return()=>{cleaned++;off();throw Error('foreign cleanup');};}};
  const review={...s.review,subscribe:()=>()=>{cleaned++;throw Error('foreign review cleanup');}};
  const c=createTradeDraftController({persistence,review});await c.loadTemplates();c.useTemplate(0);complete(c);
  assert.doesNotThrow(()=>c.setPersistence({...s.port,selectionScope:()=>2}));
  assert.equal(c.getSnapshot().form.paymentInstructions,'');assert.equal(c.getSnapshot().library,null);
  assert.doesNotThrow(()=>c.setReview(s.review));assert.equal(cleaned,2);
  await c.loadTemplates();c.useTemplate(0);complete(c);c.setReview(review);complete(c);
  assert.doesNotThrow(()=>c.dispose());assert.equal(c.getSnapshot().form.seller,'');assert.equal(c.getSnapshot().unlocked,false);assert.equal(c.getSnapshot().library,null);
  s.controller.dispose();
});
