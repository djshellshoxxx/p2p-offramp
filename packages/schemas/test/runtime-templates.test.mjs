import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRuntimeCommand, parseRuntimeMessage, TRADE_DRAFT_LIBRARY_FORMAT } from '../index.ts';
const defaults = { networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native', amountBaseUnits: '100000', fiatCurrency: 'USD', fiatMinorUnits: '100', fiatScale: 2 };
const library = { format: TRADE_DRAFT_LIBRARY_FORMAT, version: 1, templates: [], repeatDefaultSlot: null };
const consent = { reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true };
const command = (operation, fields = {}) => ({ version: 1, requestId: 1, generation: 0, operation, profileId: 'a'.repeat(32), ...fields });
const response = (operation, value) => ({ version: 1, requestId: 1, generation: 0, operation, kind: 'response', result: { ok: true, value } });
const change = { kind: 'put-template', slot: 0, defaults };
const preview = { previewId: 'b'.repeat(32), revision: 0, change, affectedTemplateCount: 1, clearsRepeatDefault: false, logicalOnly: true, backupAndRemoteCopiesUnaffected: true };

test('purpose-specific template protocol preserves revision zero and only seven reusable values', () => {
  for (const operation of ['loadTradeTemplates', 'cancelTradeTemplateChange']) assert.equal(parseRuntimeCommand(command(operation)).operation, operation);
  assert.deepEqual(parseRuntimeCommand(command('previewTradeTemplateChange', { expectedRevision: 0, change })).change, change);
  assert.deepEqual(parseRuntimeCommand(command('commitTradeTemplateChange', { expectedRevision: 0, previewId: preview.previewId, consent })).consent, consent);
  assert.equal(parseRuntimeMessage(response('loadTradeTemplates', { revision: 0, library })).result.value.revision, 0);
  assert.deepEqual(parseRuntimeMessage(response('previewTradeTemplateChange', preview)).result.value, preview);
  assert.deepEqual(parseRuntimeMessage(response('commitTradeTemplateChange', { revision: 0, changed: false, persisted: true, sessionCurrent: true })).result.value.revision, 0);
  assert.deepEqual(parseRuntimeMessage(response('cancelTradeTemplateChange', { cancelled: true })).result.value, { cancelled: true });
});
test('template commands reject generic payload authority, extra reusable fields, non-canonical values and invalid revision', () => {
  for (const extra of ['seller', 'buyer', 'paymentInstructions', 'acceptedTerms', 'signature', 'orderId', 'agreementSalt', 'deadline', 'submit']) {
    assert.throws(() => parseRuntimeCommand(command('previewTradeTemplateChange', { expectedRevision: 0, change: { ...change, defaults: { ...defaults, [extra]: 'foreign' } } })));
  }
  for (const expectedRevision of [-1, 0.5, '0', NaN, Infinity]) assert.throws(() => parseRuntimeCommand(command('previewTradeTemplateChange', { expectedRevision, change })));
  for (const slot of [-1, 8, 1.2, '1']) assert.throws(() => parseRuntimeCommand(command('previewTradeTemplateChange', { expectedRevision: 0, change: { ...change, slot } })));
  assert.throws(() => parseRuntimeCommand({ ...command('loadTradeTemplates'), records: [] }));
  assert.throws(() => parseRuntimeCommand(command('previewTradeTemplateChange', { expectedRevision: 0, change: { ...change, defaults: { ...defaults, amountBaseUnits: '01' } } })));
});
test('preview consent and nested responses reject accessors without invoking them', () => {
  let invoked = 0;
  for (const field of Object.keys(consent)) {
    const hostile = { ...consent }; Object.defineProperty(hostile, field, { get() { invoked++; return true; }, enumerable: true });
    assert.throws(() => parseRuntimeCommand(command('commitTradeTemplateChange', { expectedRevision: 0, previewId: preview.previewId, consent: hostile })));
    assert.throws(() => parseRuntimeCommand(command('commitTradeTemplateChange', { expectedRevision: 0, previewId: preview.previewId, consent: { ...consent, [field]: false } })));
  }
  const hostile = { ...defaults }; Object.defineProperty(hostile, 'fiatCurrency', { get() { invoked++; return 'USD'; }, enumerable: true });
  assert.throws(() => parseRuntimeMessage(response('previewTradeTemplateChange', { ...preview, change: { ...change, defaults: hostile } })));
  assert.equal(invoked, 0);
});
test('template response shape is bounded, detached, immutable and refuses foreign receipt claims', () => {
  const input = { revision: 0, library: { ...library, templates: [{ slot: 0, defaults }] } };
  const parsed = parseRuntimeMessage(response('loadTradeTemplates', input)).result.value;
  assert.notEqual(parsed.library, input.library); assert.notEqual(parsed.library.templates[0].defaults, defaults);
  assert.ok(Object.isFrozen(parsed.library.templates[0].defaults));
  assert.throws(() => parseRuntimeMessage(response('loadTradeTemplates', { ...input, records: [] })));
  assert.throws(() => parseRuntimeMessage(response('loadTradeTemplates', { ...input, library: { ...library, templates: Array.from({ length: 9 }, (_, slot) => ({ slot, defaults })) } })));
  assert.throws(() => parseRuntimeMessage(response('commitTradeTemplateChange', { revision: 0, changed: true, persisted: true, sessionCurrent: true })));
  assert.throws(() => parseRuntimeMessage(response('commitTradeTemplateChange', { revision: 1, changed: true, persisted: false, sessionCurrent: true })));
  assert.throws(() => parseRuntimeMessage(response('previewTradeTemplateChange', { ...preview, logicalOnly: false })));
});
