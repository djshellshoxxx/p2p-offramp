import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RegistryService } from '../src/registry.ts';
import { reviewTermsBytes } from '../src/terms-review.ts';
import { encodeCapabilities, encodePrivateAgreement } from '../src/trade-terms.ts';
import { buildTradeDraftDocument, draftDefaultsFromReviewed } from '../src/trade-draft.ts';

const bytes = new Uint8Array(await readFile(new URL('./fixtures/local-evm-scenario/registry.json', import.meta.url)));
const registry = new RegistryService(); assert.equal((await registry.load(bytes, createHash('sha256').update(bytes).digest('hex'))).ok, true);
const now = 1700000000n;
const input = () => ({ networkId: 'local-evm', deploymentId: 'escrow-local-v1', assetId: 'native', amountBaseUnits: '123456789',
  fiatCurrency: 'USD', fiatMinorUnits: '100', fiatScale: 2, seller: `0x${'12'.repeat(20)}`, buyer: `0x${'34'.repeat(20)}`,
  paymentInstructions: 'Fresh private draft instruction. No fiat payment.', acceptBeforeSeconds: String(now + 600n), escrowExpirySeconds: String(now + 7200n) });
let counter = 0;
const options = extra => ({ nowSeconds: () => now, isCurrent: () => true, randomBytes: length => new Uint8Array(length).fill(++counter), ...extra });
const document = async (draft = input(), extra) => {
  const result = await buildTradeDraftDocument(registry, draft, options(extra)); assert.equal(result.ok, true, JSON.stringify(result));
  return { bytes: result.bytes, parsed: JSON.parse(new TextDecoder().decode(result.bytes)) };
};
const fail = async (lookup, draft, code, extra) => { const result = await buildTradeDraftDocument(lookup, draft, options(extra)); assert.equal(result.ok, false); assert.equal(result.code, code); assert.equal('bytes' in result, false); };

test('fresh native and ERC20 draft documents pass the actual canonical terms review', async () => {
  for (const assetId of ['native', 'test-usd']) {
    const generated = await document({ ...input(), assetId });
    const reviewed = await reviewTermsBytes(registry, generated.bytes); assert.equal(reviewed.ok, true, JSON.stringify(reviewed));
    assert.equal(reviewed.value.asset.id, assetId); assert.equal(reviewed.value.amountBaseUnits, input().amountBaseUnits);
    assert.deepEqual(reviewed.value.agreement.capabilities, []);
    assert.equal(generated.parsed.terms.revision, '1'); assert.equal(generated.parsed.privateAgreement.revision, '1');
    assert.equal(generated.parsed.terms.privateAgreementHash, createHash('sha256').update(encodePrivateAgreement(generated.parsed.privateAgreement)).digest('hex'));
    assert.equal(generated.parsed.terms.capabilitiesHash, createHash('sha256').update(encodeCapabilities([])).digest('hex'));
    const safe = draftDefaultsFromReviewed(reviewed.value);
    assert.deepEqual(safe, Object.fromEntries(Object.entries({ ...input(), assetId }).slice(0, 7)));
    assert.doesNotMatch(JSON.stringify(safe), /Fresh private|orderId|sellerNonce|agreementSalt|seller|buyer|Seconds/);
  }
});

test('two reviews of equal defaults generate independent order, nonce and private salt', async () => {
  const a = (await document()).parsed, b = (await document()).parsed;
  for (const key of ['orderId', 'sellerNonce']) { assert.match(a.terms[key], /^[0-9a-f]{64}$/); assert.notEqual(a.terms[key], b.terms[key]); }
  assert.notEqual(a.privateAgreement.agreementSalt, b.privateAgreement.agreementSalt);
  assert.equal(new Set([a.terms.orderId, a.terms.sellerNonce, a.privateAgreement.agreementSalt]).size, 3);
  assert.notEqual(a.terms.privateAgreementHash, b.terms.privateAgreementHash);
  assert.throws(() => draftDefaultsFromReviewed({ ...a.terms, asset: {} }));
});

test('invalid, unavailable and unsupported current selectors produce no draft bytes', async () => {
  await fail(registry, { ...input(), orderId: 'a'.repeat(64) }, 'INVALID_TERMS');
  await fail(registry, { ...input(), assetId: 'missing' }, 'UNSUPPORTED_ASSET');
  await fail(registry, { ...input(), networkId: 'missing' }, 'UNKNOWN_NETWORK');
  await fail(registry, { ...input(), deploymentId: 'missing' }, 'UNKNOWN_DEPLOYMENT');
  const n = registry.network('local-evm');
  await fail({ network: () => ({ ...n, chain: 'solana' }), deployment: () => null }, input(), 'NOT_EVM_NETWORK');
  await fail({ network: () => n, deployment: () => ({ ...n.deployments[0], supportedAssetIds: [] }) }, input(), 'UNSUPPORTED_ASSET');
});

test('fresh device window refuses stale/too-short/too-long and non-uint64 clocks', async () => {
  for (const patch of [{ acceptBeforeSeconds: String(now) }, { escrowExpirySeconds: String(now + 1799n) }, { escrowExpirySeconds: String(now + 604801n) }]) {
    await fail(registry, { ...input(), ...patch }, 'UNFUNDABLE_WINDOW');
  }
  await fail(registry, input(), 'UNAVAILABLE', { nowSeconds: () => -1n });
  await fail(registry, input(), 'UNAVAILABLE', { nowSeconds: () => 1n << 64n });
  await document({ ...input(), escrowExpirySeconds: String(now + 1800n) });
  await document({ ...input(), escrowExpirySeconds: String(now + 604800n) });
});

test('clock, randomness and hash provider failures return fixed refusals and no partial document', async () => {
  await fail(registry, input(), 'UNAVAILABLE', { randomBytes: () => new Uint8Array(31) });
  await fail(registry, input(), 'UNAVAILABLE', { randomBytes: () => new Uint8Array(32) });
  await fail(registry, input(), 'UNAVAILABLE', { randomBytes: () => { throw new Error('private provider details'); } });
  await fail(registry, input(), 'UNAVAILABLE', { sha256: async () => new ArrayBuffer(31) });
  await fail(registry, input(), 'UNAVAILABLE', { sha256: async () => { throw new Error('private hash details'); } });
});

test('an uninspectable foreign dependency rejection still returns a fixed refusal', async () => {
  const hostile = new Proxy({}, { getPrototypeOf() { throw new Error('foreign exception trap'); } });
  await fail(registry, input(), 'UNAVAILABLE', { sha256: async () => { throw hostile; } });
});

test('scope retirement, cancellation, registry expiry and elapsed deadlines after a hash discard output', async () => {
  for (const mode of ['scope', 'abort', 'registry', 'clock']) {
    let release; const held = new Promise(resolve => { release = resolve; }); let started; const admitted = new Promise(resolve => { started = resolve; });
    let current = true, present = true, clock = now; const abort = new AbortController(); let owned;
    const lookup = { network: id => present ? registry.network(id) : null, deployment: (n, d) => present ? registry.deployment(n, d) : null };
    const build = buildTradeDraftDocument(lookup, input(), options({ nowSeconds: () => clock, signal: abort.signal, isCurrent: () => current,
      sha256: async data => { owned = data; started(); await held; return crypto.subtle.digest('SHA-256', data); } }));
    await admitted;
    if (mode === 'scope') current = false; if (mode === 'abort') abort.abort(); if (mode === 'registry') present = false; if (mode === 'clock') clock = now + 600n;
    release(); const result = await build; assert.equal(result.ok, false, mode); assert.equal('bytes' in result, false, mode);
    assert.ok(owned.every(byte => byte === 0), mode + ': owned private hash buffer cleared');
  }
});
