import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRADE_DRAFT_LIBRARY_FORMAT, TRADE_DRAFT_SCHEMA_VERSION, TRADE_DRAFT_RECORD_ID,
  MAX_TRADE_TEMPLATES, MAX_TRADE_DRAFT_LIBRARY_BYTES, MAX_DRAFT_INSTRUCTIONS_BYTES,
  parseTradeDraftDefaults, parseTradeDraftInput, parseTradeDraftLibrary, parseTradeDraftChange,
  encodeTradeDraftLibraryPayload, decodeTradeDraftLibraryPayload,
} from '../src/trade-drafts.ts';
import { encodeBase64url, ValidationError } from '../index.ts';

const defaults = () => ({ networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native',
  amountBaseUnits: '1000000000000000', fiatCurrency: 'USD', fiatMinorUnits: '100', fiatScale: 2 });
const input = () => ({ ...defaults(), seller: `0x${'12'.repeat(20)}`, buyer: `0x${'34'.repeat(20)}`,
  paymentInstructions: '', acceptBeforeSeconds: '1700000600', escrowExpirySeconds: '1700007200' });
const library = templates => ({ format: TRADE_DRAFT_LIBRARY_FORMAT, version: 1, templates, repeatDefaultSlot: null });
const invalid = code => error => error instanceof ValidationError && error.code === code;

test('draft library round-trips only seven safe defaults, with eight bounded local slots', () => {
  assert.equal(TRADE_DRAFT_SCHEMA_VERSION, 1); assert.match(TRADE_DRAFT_RECORD_ID, /^[0-9a-f]{32}$/);
  assert.equal(MAX_TRADE_TEMPLATES, 8); assert.equal(MAX_TRADE_DRAFT_LIBRARY_BYTES, 8192);
  assert.equal(MAX_DRAFT_INSTRUCTIONS_BYTES, 4096);
  const source = library(Array.from({ length: 8 }, (_, slot) => ({ slot, defaults: defaults() })));
  source.repeatDefaultSlot = 7;
  const payload = encodeTradeDraftLibraryPayload(source);
  const loaded = decodeTradeDraftLibraryPayload(payload, 1);
  assert.deepEqual(loaded, source); assert.ok(Object.isFrozen(loaded.templates[0].defaults));
  assert.deepEqual(Object.keys(loaded.templates[0].defaults), Object.keys(defaults()));
  source.templates[0].defaults.amountBaseUnits = '2'; assert.equal(loaded.templates[0].defaults.amountBaseUnits, '1000000000000000');
  assert.deepEqual(decodeTradeDraftLibraryPayload(encodeTradeDraftLibraryPayload(library([])), 1), library([]));
});

test('defaults enforce exact integer, currency and identifier boundaries without money normalization', () => {
  const max = { ...defaults(), amountBaseUnits: ((1n << 256n) - 1n).toString(), fiatMinorUnits: ((1n << 128n) - 1n).toString(), fiatScale: 6 };
  assert.deepEqual(parseTradeDraftDefaults(max), max);
  for (const [key, values] of Object.entries({
    networkId: ['', 'x..y', 'a'.repeat(65), '/local', 'local evm', 1], deploymentId: ['../a'], assetId: ['-native'],
    amountBaseUnits: ['0', '01', '+1', '1.0', '1e3', ' 1', 1, (1n << 256n).toString(), '9'.repeat(10000)],
    fiatMinorUnits: ['0', (1n << 128n).toString()], fiatCurrency: ['usd', 'USDD', 'UŞD'], fiatScale: [-1, 7, 1.5, '2'],
  })) for (const value of values) assert.throws(() => parseTradeDraftDefaults({ ...defaults(), [key]: value }), invalid('INVALID_INPUT'), key);
});

test('private/authority keys and hostile own properties are rejected without invoking accessors', () => {
  for (const key of ['orderId', 'revision', 'sellerNonce', 'seller', 'buyer', 'paymentInstructions', 'agreementSalt', 'acceptances', 'acceptBeforeSeconds', 'capabilities']) {
    assert.throws(() => parseTradeDraftDefaults({ ...defaults(), [key]: 'old-private-value' }), invalid('INVALID_INPUT'), key);
  }
  let reads = 0; const accessor = defaults(); Object.defineProperty(accessor, 'amountBaseUnits', { enumerable: true, get() { reads++; return '1'; } });
  assert.throws(() => parseTradeDraftDefaults(accessor), invalid('INVALID_INPUT')); assert.equal(reads, 0);
  const symbol = defaults(); symbol[Symbol('hidden')] = 'private'; assert.throws(() => parseTradeDraftDefaults(symbol), invalid('INVALID_INPUT'));
  const inherited = Object.assign(Object.create({ authority: true }), defaults()); assert.throws(() => parseTradeDraftDefaults(inherited), invalid('INVALID_INPUT'));
});

test('new draft input validates fresh addresses, uint64 times and exact UTF-8 instruction bytes', () => {
  assert.deepEqual(parseTradeDraftInput(input()), input());
  const atCap = { ...input(), paymentInstructions: 'é'.repeat(2048) }; assert.equal(parseTradeDraftInput(atCap).paymentInstructions, atCap.paymentInstructions);
  assert.throws(() => parseTradeDraftInput({ ...input(), paymentInstructions: 'é'.repeat(2049) }), invalid('LIMIT_EXCEEDED'));
  for (const patch of [{ seller: input().buyer }, { buyer: `0x${'0'.repeat(40)}` }, { seller: input().seller.toUpperCase() },
    { paymentInstructions: '\ud800' }, { acceptBeforeSeconds: '01' }, { escrowExpirySeconds: (1n << 64n).toString() }, { agreementSalt: 'old' }]) {
    assert.throws(() => parseTradeDraftInput({ ...input(), ...patch }), invalid('INVALID_INPUT'));
  }
});

test('future, duplicate, unsorted, sparse and dangling-pointer libraries fail closed', () => {
  const entry = slot => ({ slot, defaults: defaults() });
  assert.throws(() => parseTradeDraftLibrary({ ...library([]), version: 2 }), invalid('UNSUPPORTED_VERSION'));
  for (const value of [library([entry(8)]), library([entry(0), entry(0)]), library([entry(1), entry(0)]),
    { ...library([]), repeatDefaultSlot: 0 }, { ...library([]), extra: 'secret' }]) assert.throws(() => parseTradeDraftLibrary(value), invalid('INVALID_INPUT'));
  assert.throws(() => parseTradeDraftLibrary(library(Array.from({ length: 9 }, (_, slot) => entry(slot)))), invalid('LIMIT_EXCEEDED'));
  const sparse = Array(1); assert.throws(() => parseTradeDraftLibrary(library(sparse)), invalid('INVALID_INPUT'));
  let reads = 0; const list = [entry(0)]; Object.defineProperty(list, '0', { get() { reads++; return entry(0); } });
  assert.throws(() => parseTradeDraftLibrary(library(list)), invalid('INVALID_INPUT')); assert.equal(reads, 0);
});

test('uninspectable foreign array reflection normalizes to a fixed schema error', () => {
  const hostile = new Proxy({}, { getPrototypeOf() { throw new Error('foreign exception trap'); } });
  const templates = new Proxy([], { getPrototypeOf() { throw hostile; } });
  assert.throws(() => parseTradeDraftLibrary(library(templates)), invalid('INVALID_INPUT'));
});

test('payload parser enforces canonical bytes, duplicate-key and byte/version limits', () => {
  const good = library([{ slot: 0, defaults: defaults() }]); const encoded = encodeTradeDraftLibraryPayload(good);
  assert.throws(() => decodeTradeDraftLibraryPayload(encoded, 2), invalid('UNSUPPORTED_VERSION'));
  for (const text of [' ' + JSON.stringify(good), JSON.stringify({ version: 1, ...good }), '{"format":"x","format":"y"}']) {
    assert.throws(() => decodeTradeDraftLibraryPayload(encodeBase64url(new TextEncoder().encode(text)), 1), invalid('INVALID_INPUT'));
  }
  assert.throws(() => decodeTradeDraftLibraryPayload(encodeBase64url(new Uint8Array(8193)), 1), invalid('LIMIT_EXCEEDED'));
});

test('named local changes have exact bounded shapes and no generic record mutation', () => {
  for (const change of [{ kind: 'put-template', slot: 0, defaults: defaults() }, { kind: 'remove-template', slot: 7 },
    { kind: 'set-repeat-default', slot: null }, { kind: 'set-repeat-default', slot: 0 }]) assert.deepEqual(parseTradeDraftChange(change), change);
  for (const change of [{ kind: 'put', record: {} }, { kind: 'remove-template', slot: -1 }, { kind: 'put-template', slot: 0, defaults: defaults(), recordId: 'a'.repeat(32) }]) {
    assert.throws(() => parseTradeDraftChange(change), invalid('INVALID_INPUT'));
  }
});
