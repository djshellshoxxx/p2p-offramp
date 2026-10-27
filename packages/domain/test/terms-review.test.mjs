import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RegistryService } from '../src/registry.ts';
import { encodePrivateAgreement, encodeCapabilities } from '../src/trade-terms.ts';
import { reviewTermsBytes, reviewTermsDocument, TERMS_REVIEW_FORMAT, MAX_TERMS_REVIEW_BYTES } from '../index.ts';
// SYNTHETIC, TEST-ONLY local scenario (see fixtures/local-evm-scenario/README.md). These are regression inputs produced by the
// same authors as the code under test, not independent golden vectors.
const dir = new URL('./fixtures/local-evm-scenario/', import.meta.url);
const registryBytes = new Uint8Array(await readFile(new URL('registry.json', dir)));
const scenario = JSON.parse(await readFile(new URL('scenario.json', dir), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const nodeSha256 = async bytes => { const digest = createHash('sha256').update(bytes).digest(); return digest.buffer.slice(digest.byteOffset, digest.byteOffset + 32); };
const utf8 = new TextEncoder();
const ZERO = `0x${'0'.repeat(40)}`;
const U64_MAX = ((1n << 64n) - 1n).toString(), U256_MAX = ((1n << 256n) - 1n).toString();

async function loadRegistry(bytes, digest = sha(bytes)) {
  const service = new RegistryService();
  const result = await service.load(bytes, digest);
  assert.equal(result.ok, true, JSON.stringify(result));
  return service;
}
const registry = await loadRegistry(registryBytes, scenario.registrySha256);
/** Synthetic variant: the deployment lists only the native asset, plus a Solana network for NOT_EVM_NETWORK. */
const variantJson = JSON.parse(new TextDecoder().decode(registryBytes));
variantJson.networks[0].deployments[0].supportedAssetIds = ['native'];
variantJson.networks.push({
  id: 'local-sol', chain: 'solana', chainIdentity: '1'.repeat(32), genesisHash: '1'.repeat(32),
  endpoints: [{ id: 'sol-node', url: 'https://solana.invalid/' }], finality: { kind: 'solana-commitment', commitment: 'finalized' },
  assets: [{ id: 'native', kind: 'native', address: null, decimals: 9, transferPolicy: 'exact-transfer' }],
  deployments: [{ id: 'escrow-local-v1', address: `${'1'.repeat(31)}2`, protocolVersion: 1, artifactSha256: 'd'.repeat(64),
    runtime: { kind: 'solana-program', programDataSha256: 'e'.repeat(64), upgradeAuthority: null }, supportedAssetIds: ['native'] }],
  environment: 'local',
});
const variantRegistry = await loadRegistry(utf8.encode(JSON.stringify(variantJson)));

const documentFor = name => structuredClone({ format: TERMS_REVIEW_FORMAT, terms: scenario.sets[name].terms, privateAgreement: scenario.sets[name].privateAgreementInput });
const withTerms = (name, patch) => { const doc = documentFor(name); Object.assign(doc.terms, patch); return doc; };
/** Patches the private agreement and recomputes both public hashes (unless `keepHashes`) so the doc reaches later checks. */
function withAgreement(name, patch, { keepCapabilitiesHash = false } = {}) {
  const doc = documentFor(name); Object.assign(doc.privateAgreement, patch);
  doc.terms.privateAgreementHash = sha(encodePrivateAgreement(doc.privateAgreement));
  if (!keepCapabilitiesHash) doc.terms.capabilitiesHash = sha(encodeCapabilities(doc.privateAgreement.capabilities));
  return doc;
}
const bytesOf = value => utf8.encode(JSON.stringify(value));
async function review(doc, lookup = registry, sha256) {
  const result = await reviewTermsDocument(lookup, doc, sha256);
  assert.equal(Object.isFrozen(result), true);
  return result;
}
async function code(doc, lookup, sha256) {
  const result = await review(doc, lookup, sha256);
  assert.equal(result.ok, false, `expected rejection, got ${JSON.stringify(result)}`);
  return result.code;
}
async function bytesCode(bytes, lookup = registry, sha256) {
  const result = await reviewTermsBytes(lookup, bytes, sha256);
  assert.equal(result.ok, false, `expected rejection, got ${JSON.stringify(result)}`);
  assert.equal(Object.isFrozen(result), true);
  return result.code;
}
function assertDeepFrozen(value, path = 'value') {
  if (typeof value !== 'object' || value === null) return;
  assert.equal(Object.isFrozen(value), true, path);
  for (const [key, child] of Object.entries(value)) assertDeepFrozen(child, `${path}.${key}`);
}
function expected(name) {
  const set = scenario.sets[name], terms = set.terms, agreement = set.privateAgreementInput;
  return {
    network: { id: 'local-evm', chainId: '31337', environment: 'local' },
    deployment: { id: 'escrow-local-v1', address: '0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e', protocolVersion: 1 },
    asset: name === 'native' ? { id: 'native', kind: 'native', address: null, decimals: 18 }
      : { id: 'test-usd', kind: 'erc20', address: '0x7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a', decimals: 6 },
    orderId: terms.orderId, revision: '1', sellerNonce: terms.sellerNonce, seller: terms.seller, buyer: terms.buyer,
    amountBaseUnits: terms.amountBaseUnits, acceptBeforeSeconds: '1700000000', escrowExpirySeconds: '1700086400',
    agreement: { fiatCurrency: 'USD', fiatMinorUnits: agreement.fiatMinorUnits, fiatScale: 2, paymentInstructions: agreement.paymentInstructions,
      capabilities: [{ id: 'local-test-cap', version: '1', policyHash: '9c'.repeat(32) }] },
    privateAgreementSha256: set.privateAgreementSha256, capabilitiesSha256: set.capabilitiesSha256,
    unsupportedCapabilities: ['local-test-cap'],
  };
}

test('terms review: both synthetic sets are accepted with exact registry/input values, deep-frozen and uncoupled from the input', async () => {
  assert.equal(TERMS_REVIEW_FORMAT, 'p2p-offramp/local-terms-review/v1'); assert.equal(MAX_TERMS_REVIEW_BYTES, 65_536);
  for (const name of ['native', 'erc20']) {
    const doc = documentFor(name);
    const result = await review(doc);
    assert.equal(result.ok, true, `${name}: ${JSON.stringify(result)}`);
    assert.deepEqual(result.value, expected(name), name);
    assertDeepFrozen(result, name);
    assert.equal(scenario.sets[name].privateAgreementSha256, sha(encodePrivateAgreement(doc.privateAgreement)), name);
    assert.notEqual(result.value.agreement.capabilities[0], doc.privateAgreement.capabilities[0]);
    assert.notEqual(result.value.agreement.capabilities, doc.privateAgreement.capabilities);
    doc.terms.amountBaseUnits = '7'; doc.privateAgreement.capabilities[0].id = 'mutated'; doc.privateAgreement.capabilities.push({});
    assert.deepEqual(result.value, expected(name), `${name} after input mutation`);
    const fromBytes = await reviewTermsBytes(registry, bytesOf(documentFor(name)));
    assert.equal(fromBytes.ok, true); assert.deepEqual(fromBytes.value, expected(name)); assertDeepFrozen(fromBytes, `${name} bytes`);
    const injected = await review(documentFor(name), registry, nodeSha256);
    assert.deepEqual(injected, result);
  }
  // Node Buffer is a Uint8Array subclass and is accepted as bytes.
  assert.equal((await reviewTermsBytes(registry, Buffer.from(bytesOf(documentFor('native'))))).ok, true);
});

test('terms review: a core trade with no capabilities lists none as unsupported', async () => {
  const result = await review(withAgreement('erc20', { capabilities: [] }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.value.agreement.capabilities, []); assert.deepEqual(result.value.unsupportedCapabilities, []);
  assert.equal(result.value.capabilitiesSha256, sha(new Uint8Array([0])));
  const two = [{ id: 'a-cap', version: '1', policyHash: 'ab'.repeat(32) }, { id: 'b-cap', version: '2.0', policyHash: 'cd'.repeat(32) }];
  const listed = await review(withAgreement('native', { capabilities: two }));
  assert.equal(listed.ok, true); assert.deepEqual(listed.value.unsupportedCapabilities, ['a-cap', 'b-cap']);
  assert.deepEqual(listed.value.agreement.capabilities, two); assertDeepFrozen(listed);
});

test('terms review: container shape and format', async () => {
  for (const doc of [null, undefined, 1, 'x', true, [], [documentFor('native')], () => {}, Symbol('x'), 1n]) assert.equal(await code(doc), 'MALFORMED', String(typeof doc));
  const missing = documentFor('native'); delete missing.privateAgreement;
  const extra = { ...documentFor('native'), extra: 1 };
  const proto = JSON.parse(`{"__proto__":1,${JSON.stringify(documentFor('native')).slice(1)}`);
  for (const doc of [missing, extra, proto, {}]) assert.equal(await code(doc), 'MALFORMED');
  for (const format of [1, null, undefined, {}, [TERMS_REVIEW_FORMAT], true]) assert.equal(await code({ ...documentFor('native'), format }), 'MALFORMED', String(format));
  for (const format of ['', 'p2p-offramp/local-terms-review/v2', `${TERMS_REVIEW_FORMAT} `, TERMS_REVIEW_FORMAT.toUpperCase()]) {
    assert.equal(await code({ ...documentFor('native'), format }), 'UNSUPPORTED_FORMAT', format);
  }
  const v2 = documentFor('native'); v2.privateAgreement.v = 2; assert.equal(await code(v2), 'UNSUPPORTED_FORMAT');
  // Container values that are not objects fail at their own step, not as container shape.
  for (const terms of [null, 'x', [], 1]) assert.equal(await code({ ...documentFor('native'), terms }), 'INVALID_TERMS');
  for (const privateAgreement of [null, 'x', [], 1]) assert.equal(await code({ ...documentFor('native'), privateAgreement }), 'INVALID_AGREEMENT');
});

test('terms review: every public-terms field rejects noncanonical encodings as INVALID_TERMS', async () => {
  const hex = ['', 'A1'.repeat(32), `0x${'a1'.repeat(32)}`, 'a1'.repeat(31), `${'a1'.repeat(32)}0`, 'g'.repeat(64), ` ${'a1'.repeat(32)}`, 1];
  const address = ['0xACF7B7C8271E99B3BE70C3F476C7C20963E06B8E', '0xAcf7B7c8271e99B3Be70c3F476c7C20963E06B8E', 'acf7b7c8271e99b3be70c3f476c7c20963e06b8e',
    '0xacf7b7c8271e99b3be70c3f476c7c20963e06b8', '0xacf7b7c8271e99b3be70c3f476c7c20963e06b8e0', ZERO, '', null, 0];
  const id = ['', '-local', 'local..evm', 'local/evm', 'local evm', 'a'.repeat(65), 'lócal', '.x', 1, null];
  const integer = ['', '01', '00', '+1', '-1', '1.0', '1e3', '0x1', ' 1', '1 ', '١', 1, null];
  const bad = {
    orderId: hex, sellerNonce: hex, privateAgreementHash: hex, capabilitiesHash: hex,
    seller: address, buyer: address, networkId: id, deploymentId: id,
    revision: [...integer, '0', (1n << 64n).toString(), '1'.padEnd(21, '0')],
    amountBaseUnits: [...integer, '0', (1n << 256n).toString(), '9'.repeat(79), '1'.padEnd(400, '0')],
    acceptBeforeSeconds: [...integer, (1n << 64n).toString()], escrowExpirySeconds: [...integer, (1n << 64n).toString()],
    assetKind: ['NATIVE', 'Erc20', 'spl', '', null, 0], asset: address.filter(value => value !== ZERO),
  };
  assert.equal(Object.keys(bad).length, 14);
  for (const name of ['native', 'erc20']) {
    for (const [field, values] of Object.entries(bad)) {
      for (const value of values) assert.equal(await code(withTerms(name, { [field]: value })), 'INVALID_TERMS', `${name}.${field}=${JSON.stringify(value)}`);
    }
  }
  // Native requires the zero address; ERC-20 requires a nonzero canonical address.
  assert.equal(await code(withTerms('erc20', { asset: ZERO })), 'INVALID_TERMS');
  assert.equal(await code(withTerms('native', { asset: `0x${'0'.repeat(39)}1` })), 'INVALID_TERMS');
  assert.equal(await code(withTerms('native', { assetKind: 'erc20', asset: ZERO })), 'INVALID_TERMS');
  assert.equal(await code(withTerms('erc20', { assetKind: 'native' })), 'INVALID_TERMS');
  // Seller and buyer must differ.
  const { seller } = scenario.sets.native.terms;
  assert.equal(await code(withTerms('native', { buyer: seller })), 'INVALID_TERMS');
  // Exact key set.
  for (const name of ['native', 'erc20']) {
    for (const field of Object.keys(bad)) { const doc = documentFor(name); delete doc.terms[field]; assert.equal(await code(doc), 'INVALID_TERMS', `missing ${field}`); }
    assert.equal(await code(withTerms(name, { v: '1' })), 'INVALID_TERMS'); assert.equal(await code(withTerms(name, { mode: 'basic-manual-v1' })), 'INVALID_TERMS');
    const proto = documentFor(name); proto.terms = JSON.parse(`{"__proto__":"x",${JSON.stringify(proto.terms).slice(1)}`);
    assert.equal(await code(proto), 'INVALID_TERMS');
    const inherited = documentFor(name); inherited.terms = Object.assign(Object.create({ v: '1' }), inherited.terms);
    assert.equal((await review(inherited)).ok, true, 'inherited, non-own properties are not read as fields');
  }
});

test('terms review: valid-but-different public field values reach the right later check (or are accepted verbatim)', async () => {
  const name = 'erc20';
  const cases = {
    orderId: ['c3'.repeat(32), 'AGREEMENT_MISMATCH'], revision: ['2', 'AGREEMENT_MISMATCH'], networkId: ['other-evm', 'UNKNOWN_NETWORK'],
    deploymentId: ['escrow-local-v2', 'UNKNOWN_DEPLOYMENT'], asset: [`0x${'7b'.repeat(20)}`, 'UNSUPPORTED_ASSET'],
    privateAgreementHash: ['00'.repeat(32), 'AGREEMENT_HASH_MISMATCH'], capabilitiesHash: ['00'.repeat(32), 'CAPABILITIES_HASH_MISMATCH'],
    acceptBeforeSeconds: ['0', 'UNFUNDABLE_WINDOW'], escrowExpirySeconds: ['0', 'UNFUNDABLE_WINDOW'],
  };
  for (const [field, [value, expectedCode]] of Object.entries(cases)) assert.equal(await code(withTerms(name, { [field]: value })), expectedCode, field);
  const accepted = { seller: `0x${'11'.repeat(20)}`, buyer: `0x${'22'.repeat(20)}`, amountBaseUnits: U256_MAX, sellerNonce: 'ff'.repeat(32) };
  for (const [field, value] of Object.entries(accepted)) {
    const result = await review(withTerms(name, { [field]: value }));
    assert.equal(result.ok, true, field); assert.equal(result.value[field], value, field);
  }
  assert.equal((await review(withTerms(name, { amountBaseUnits: '1' }))).value.amountBaseUnits, '1');
  // assetKind flips: erc20 → native needs the zero address; with it, the network's native asset is selected.
  const flipped = await review(withTerms(name, { assetKind: 'native', asset: ZERO }));
  assert.equal(flipped.ok, true); assert.deepEqual(flipped.value.asset, { id: 'native', kind: 'native', address: null, decimals: 18 });
  // Revision is bound by the agreement: a matching max-u64 revision is accepted.
  const max = withAgreement(name, { revision: U64_MAX }); max.terms.revision = U64_MAX;
  assert.equal((await review(max)).value.revision, U64_MAX);
});

test('terms review: private agreement validation maps encoder errors', async () => {
  const name = 'native';
  const invalid = { orderId: 'A1'.repeat(32), revision: 1, fiatCurrency: 'usd', fiatMinorUnits: '0', fiatScale: 7, paymentInstructions: 5,
    capabilities: [{ id: 'x', version: '1' }], agreementSalt: '00', v: '1' };
  for (const [field, value] of Object.entries(invalid)) {
    const doc = documentFor(name); doc.privateAgreement[field] = value;
    assert.equal(await code(doc), field === 'v' ? 'UNSUPPORTED_FORMAT' : 'INVALID_AGREEMENT', field);
  }
  const extra = documentFor(name); extra.privateAgreement.note = 'x'; assert.equal(await code(extra), 'INVALID_AGREEMENT');
  const missing = documentFor(name); delete missing.privateAgreement.agreementSalt; assert.equal(await code(missing), 'INVALID_AGREEMENT');
  const unsorted = documentFor(name);
  unsorted.privateAgreement.capabilities = [{ id: 'b', version: '1', policyHash: 'ab'.repeat(32) }, { id: 'a', version: '1', policyHash: 'ab'.repeat(32) }];
  assert.equal(await code(unsorted), 'INVALID_AGREEMENT');
  // G16 size limits are TOO_LARGE.
  const nine = Array.from({ length: 9 }, (_, index) => ({ id: `cap-${index}`, version: '1', policyHash: 'ab'.repeat(32) }));
  const tooMany = documentFor(name); tooMany.privateAgreement.capabilities = nine; assert.equal(await code(tooMany), 'TOO_LARGE');
  const longText = documentFor(name); longText.privateAgreement.paymentInstructions = 'x'.repeat(4097); assert.equal(await code(longText), 'TOO_LARGE');
  const okText = withAgreement(name, { paymentInstructions: 'é'.repeat(2048) });
  assert.equal((await review(okText)).value.agreement.paymentInstructions, 'é'.repeat(2048));
  const surrogate = documentFor(name); surrogate.privateAgreement.paymentInstructions = 'x\uD800'; assert.equal(await code(surrogate), 'INVALID_AGREEMENT');
});

test('terms review: agreement binding, hashes, registry and asset checks', async () => {
  for (const name of ['native', 'erc20']) {
    assert.equal(await code(withAgreement(name, { orderId: 'c3'.repeat(32) })), 'AGREEMENT_MISMATCH');
    assert.equal(await code(withAgreement(name, { revision: '2' })), 'AGREEMENT_MISMATCH');
    const tampered = documentFor(name); tampered.privateAgreement.fiatMinorUnits = '5001';
    assert.equal(await code(tampered), 'AGREEMENT_HASH_MISMATCH');
    const salt = documentFor(name); salt.privateAgreement.agreementSalt = '00'.repeat(32);
    assert.equal(await code(salt), 'AGREEMENT_HASH_MISMATCH');
    assert.equal(await code(withAgreement(name, { capabilities: [] }, { keepCapabilitiesHash: true })), 'CAPABILITIES_HASH_MISMATCH');
    assert.equal(await code(withTerms(name, { networkId: 'local-evm2' })), 'UNKNOWN_NETWORK');
    assert.equal(await code(withTerms(name, { networkId: 'local-sol' }), variantRegistry), 'NOT_EVM_NETWORK');
    assert.equal(await code(withTerms(name, { deploymentId: 'escrow-local' })), 'UNKNOWN_DEPLOYMENT');
    // An unloaded registry knows nothing.
    assert.equal(await code(documentFor(name), new RegistryService()), 'UNKNOWN_NETWORK');
  }
  // Deployment not listing the ERC-20 asset (synthetic registry variant loaded with its own computed digest).
  assert.equal(await code(documentFor('erc20'), variantRegistry), 'UNSUPPORTED_ASSET');
  assert.equal((await review(documentFor('native'), variantRegistry)).ok, true);
  // A network with no native asset, through a narrow RegistryLookup.
  const network = registry.network('local-evm');
  const noNative = { ...network, assets: network.assets.filter(asset => asset.kind !== 'native') };
  const lookup = { network: id => (id === 'local-evm' ? noNative : null), deployment: (networkId, id) => registry.deployment(networkId, id) };
  assert.equal(await code(documentFor('native'), lookup), 'UNSUPPORTED_ASSET');
  assert.equal((await review(documentFor('erc20'), lookup)).ok, true);
  // A registry asset of the other kind at the same address is not a match.
  const swapped = { ...network, assets: network.assets.map(asset => asset.kind === 'erc20' ? { ...asset, kind: 'spl' } : asset) };
  assert.equal(await code(documentFor('erc20'), { network: () => swapped, deployment: lookup.deployment }), 'UNSUPPORTED_ASSET');
  // A lookup returning an entry for a different ID is not trusted.
  const wrong = { network: () => ({ ...network, id: 'other' }), deployment: lookup.deployment };
  assert.equal(await code(documentFor('native'), wrong), 'UNKNOWN_NETWORK');
  const wrongDeployment = { network: () => network, deployment: () => ({ ...network.deployments[0], id: 'other' }) };
  assert.equal(await code(documentFor('native'), wrongDeployment), 'UNKNOWN_DEPLOYMENT');
});

test('terms review: first failing check wins', async () => {
  const sevenSix = 'c3'.repeat(32);
  const pairs = [
    [{ ...withTerms('native', { revision: '01' }), format: 'other' }, 'UNSUPPORTED_FORMAT'],
    [(() => { const doc = withTerms('native', { revision: '01' }); doc.privateAgreement.fiatCurrency = 'usd'; return doc; })(), 'INVALID_TERMS'],
    [(() => { const doc = withTerms('native', { orderId: sevenSix }); doc.privateAgreement.fiatCurrency = 'usd'; return doc; })(), 'INVALID_AGREEMENT'],
    [(() => { const doc = withTerms('native', { orderId: sevenSix, privateAgreementHash: '00'.repeat(32) }); return doc; })(), 'AGREEMENT_MISMATCH'],
    [withTerms('native', { privateAgreementHash: '00'.repeat(32), capabilitiesHash: '00'.repeat(32), networkId: 'nowhere' }), 'AGREEMENT_HASH_MISMATCH'],
    [withTerms('native', { capabilitiesHash: '00'.repeat(32), networkId: 'nowhere' }), 'CAPABILITIES_HASH_MISMATCH'],
    [withTerms('native', { networkId: 'nowhere', deploymentId: 'nowhere', acceptBeforeSeconds: '0' }), 'UNKNOWN_NETWORK'],
    [withTerms('erc20', { deploymentId: 'nowhere', asset: `0x${'7b'.repeat(20)}`, acceptBeforeSeconds: '0' }), 'UNKNOWN_DEPLOYMENT'],
    [withTerms('erc20', { asset: `0x${'7b'.repeat(20)}`, acceptBeforeSeconds: '0' }), 'UNSUPPORTED_ASSET'],
  ];
  for (const [doc, expectedCode] of pairs) assert.equal(await code(doc), expectedCode, expectedCode);
  assert.equal(await code(withTerms('native', { networkId: 'local-sol', deploymentId: 'nowhere' }), variantRegistry), 'NOT_EVM_NETWORK');
  assert.equal(await code({ ...withTerms('native', { revision: '01' }), format: 7 }), 'MALFORMED');
  assert.equal(await code({ ...withTerms('native', { revision: '01' }), format: 'other', extra: 1 }), 'MALFORMED');
  // The SHA-256 provider is consulted only after structural checks pass.
  const broken = () => { throw new Error('no digest'); };
  assert.equal(await code(withTerms('native', { revision: '01' }), registry, broken), 'INVALID_TERMS');
  assert.equal(await code(withTerms('native', { orderId: sevenSix }), registry, broken), 'AGREEMENT_MISMATCH');
  assert.equal(await code(withTerms('native', { networkId: 'nowhere' }), registry, broken), 'UNAVAILABLE');
  // Oversize wins over everything, including invalid bytes.
  assert.equal(await bytesCode(new Uint8Array(MAX_TERMS_REVIEW_BYTES + 1).fill(0xff)), 'TOO_LARGE');
});

test('terms review: funding window boundaries (no device clock)', async () => {
  const big = 1_000_000_000n;
  const cases = [
    ['0', '1800', false], ['0', '0', false], ['1', '1800', true], ['1', '1799', false], ['1', '604800', true], ['1', '604801', false],
    ['2', '604801', true], [String(big), String(big + 604799n), true], [String(big), String(big + 604800n), false],
    [String(big), String(big + 1800n), true], [String(big), String(big), true], [String(big), '1800', true], [String(big), '1799', false],
    [U64_MAX, U64_MAX, true], ['1700000000', '1700086400', true], [U64_MAX, '0', false],
  ];
  const originalNow = Date.now; Date.now = () => { throw new Error('device clock must not be used'); };
  try {
    for (const [accept, expiry, ok] of cases) {
      const result = await review(withTerms('native', { acceptBeforeSeconds: accept, escrowExpirySeconds: expiry }));
      if (ok) { assert.equal(result.ok, true, `${accept}/${expiry}`); assert.equal(result.value.acceptBeforeSeconds, accept); assert.equal(result.value.escrowExpirySeconds, expiry); }
      else assert.equal(result.code, 'UNFUNDABLE_WINDOW', `${accept}/${expiry}`);
    }
  } finally { Date.now = originalNow; }
});

test('terms review: SHA-256 provider failures are UNAVAILABLE and the provider gets a fresh copy', async () => {
  const doc = documentFor('native');
  const failing = [
    () => { throw new Error('x'); }, async () => { throw new Error('x'); }, () => Promise.reject(new Error('x')),
    async () => new ArrayBuffer(31), async () => new Uint8Array(32), async () => null, async () => 'digest',
    () => ({ then() { throw new Error('x'); } }), null, 'sha256', 1,
  ];
  for (const sha256 of failing) assert.equal(await code(doc, registry, sha256), 'UNAVAILABLE');
  assert.equal(await code(doc, registry, async () => new ArrayBuffer(32)), 'AGREEMENT_HASH_MISMATCH');
  const seen = [];
  const recording = async bytes => { seen.push(bytes); const digest = await nodeSha256(bytes); bytes.fill(0); return digest; };
  const result = await review(doc, registry, recording);
  assert.equal(result.ok, true);
  assert.equal(seen.length, 2); assert.equal(seen[0] instanceof Uint8Array, true); assert.equal(seen[0].buffer instanceof ArrayBuffer, true);
  assert.notEqual(seen[0].buffer, seen[1].buffer);
  // Default provider unavailable.
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
  try { assert.equal(await code(documentFor('native')), 'UNAVAILABLE'); }
  finally { Object.defineProperty(globalThis, 'crypto', descriptor); }
  assert.equal((await review(documentFor('native'))).ok, true);
});

test('terms review bytes: size, strict UTF-8 and bounded strict JSON', async () => {
  const valid = JSON.stringify(documentFor('native'));
  const padded = size => utf8.encode(valid.slice(0, -1) + ' '.repeat(size - utf8.encode(valid).byteLength) + '}');
  const exact = await reviewTermsBytes(registry, padded(MAX_TERMS_REVIEW_BYTES));
  assert.equal(exact.ok, true, JSON.stringify(exact));
  assert.equal(await bytesCode(padded(MAX_TERMS_REVIEW_BYTES + 1)), 'TOO_LARGE');
  assert.equal(await bytesCode(new Uint8Array(65_537)), 'TOO_LARGE');
  // A Uint8Array subclass that under-reports its length is still bounded by its real length.
  class Lying extends Uint8Array { get byteLength() { return 1; } }
  assert.equal(await bytesCode(new Lying(65_537)), 'TOO_LARGE');
  const malformed = [
    new Uint8Array(0), utf8.encode(' '), utf8.encode('null'), utf8.encode('[]'), utf8.encode('"x"'), utf8.encode(`${valid}x`), utf8.encode(`${valid}${valid}`),
    Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8.encode(valid)]),
    utf8.encode(valid.replace('SYNTHETIC', 'SYNTH\uFFFDTIC')).map((byte, index, all) => byte === 0xef && all[index + 1] === 0xbf && all[index + 2] === 0xbd ? 0xc0 : byte),
    Uint8Array.from([...utf8.encode(valid.slice(0, -1)), 0x2c, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d]),
    utf8.encode(valid.replace('"format":', '"format":"x","format":')),
    utf8.encode(valid.replace('"revision":"1"', '"revision":"1","revision":"1"')),
    utf8.encode(valid.replace('{"format"', '{"__proto__":{},"format"')),
    utf8.encode(valid.replace('"orderId"', '"__proto__":"x","orderId"')),
    utf8.encode(valid.replace('"fiatScale":2', '"fiatScale":2.0')), utf8.encode(valid.replace('"fiatScale":2', '"fiatScale":2e0')),
    utf8.encode(valid.replace('"fiatScale":2', '"fiatScale":-2')), utf8.encode(valid.replace('"fiatScale":2', '"fiatScale":02')),
    utf8.encode(valid.replace('"v":1', '"v":1.0')), utf8.encode(valid.replace('"v":1', '"v":99999999999999999999')),
    utf8.encode(valid.replace('"format":', '\'format\':')), utf8.encode(valid.replace(/}$/, ',}')),
    utf8.encode(`{"format":"${TERMS_REVIEW_FORMAT}","terms":[[[[[[[[1]]]]]]]],"privateAgreement":{}}`),
    utf8.encode(`{"format":"${TERMS_REVIEW_FORMAT}","terms":{},"privateAgreement":{"capabilities":[{"id":{"x":{"y":{"z":1}}}}]}}`),
    utf8.encode('['.repeat(10_000) + ']'.repeat(10_000)),
  ];
  for (const [index, bytes] of malformed.entries()) assert.equal(await bytesCode(bytes), 'MALFORMED', `case ${index}`);
  // JSON numbers where strings are required are well-formed JSON but invalid terms.
  assert.equal(await bytesCode(utf8.encode(valid.replace('"revision":"1"', '"revision":1'))), 'INVALID_TERMS');
  assert.equal(await bytesCode(utf8.encode(valid.replace('"amountBaseUnits":"1000000000000000000"', '"amountBaseUnits":"1e18"'))), 'INVALID_TERMS');
  assert.equal(await bytesCode(utf8.encode(valid.replace('"amountBaseUnits":"1000000000000000000"', '"amountBaseUnits":"01000000000000000000"'))), 'INVALID_TERMS');
  assert.equal(await bytesCode(utf8.encode(valid.replace('"orderId":"a1', '"orderId":"A1'))), 'INVALID_TERMS');
  for (const input of [null, undefined, 'bytes', valid, [1, 2], new ArrayBuffer(4), new DataView(new ArrayBuffer(4)), new Uint16Array(4), {}]) {
    assert.equal(await bytesCode(input), 'MALFORMED', Object.prototype.toString.call(input));
  }
  const proxied = new Proxy(utf8.encode(valid), {});
  assert.equal(await bytesCode(proxied), 'MALFORMED');
});

test('terms review: hostile inputs never throw and each field is read once', async () => {
  const boom = () => { throw new Error('getter'); };
  const hostileError = () => { throw new Proxy({}, { get: boom, getPrototypeOf: boom, has: boom }); };
  const getterOn = (target, key, thrower = boom) => { Object.defineProperty(target, key, { get: thrower, enumerable: true }); return target; };
  const revoked = () => { const { proxy, revoke } = Proxy.revocable({}, {}); revoke(); return proxy; };
  const throwingKeys = new Proxy({}, { ownKeys: boom });
  const cases = [
    [getterOn(documentFor('native'), 'format'), 'MALFORMED'], [getterOn(documentFor('native'), 'terms', hostileError), 'MALFORMED'],
    [throwingKeys, 'MALFORMED'], [revoked(), 'MALFORMED'], [new Proxy(documentFor('native'), { getOwnPropertyDescriptor: boom }), 'MALFORMED'],
    [(() => { const doc = documentFor('native'); getterOn(doc.terms, 'revision'); return doc; })(), 'INVALID_TERMS'],
    [(() => { const doc = documentFor('native'); getterOn(doc.terms, 'orderId', hostileError); return doc; })(), 'INVALID_TERMS'],
    [{ ...documentFor('native'), terms: revoked() }, 'INVALID_TERMS'],
    [{ ...documentFor('native'), terms: new Proxy({}, { ownKeys: boom }) }, 'INVALID_TERMS'],
    [(() => { const doc = documentFor('native'); getterOn(doc.privateAgreement, 'agreementSalt'); return doc; })(), 'INVALID_AGREEMENT'],
    [{ ...documentFor('native'), privateAgreement: revoked() }, 'INVALID_AGREEMENT'],
    [(() => { const doc = documentFor('native'); doc.privateAgreement.capabilities = revoked(); return doc; })(), 'INVALID_AGREEMENT'],
    [(() => { const doc = documentFor('native'); getterOn(doc.privateAgreement.capabilities[0], 'id', hostileError); return doc; })(), 'INVALID_AGREEMENT'],
    [(() => { const doc = documentFor('native'); doc.privateAgreement.capabilities = new Proxy([], { get: (t, k) => k === 'length' ? 2 ** 32 - 1 : t[k] }); return doc; })(), 'TOO_LARGE'],
    [(() => { const doc = documentFor('native'); doc.privateAgreement.capabilities = new Proxy([], { get: (t, k) => k === 'length' ? -1 : t[k] }); return doc; })(), 'INVALID_AGREEMENT'],
    [(() => { const doc = documentFor('native'); doc.privateAgreement.capabilities = new Proxy([], { get: boom }); return doc; })(), 'INVALID_AGREEMENT'],
    [(() => { const doc = documentFor('native'); doc.privateAgreement.capabilities = [revoked()]; return doc; })(), 'INVALID_AGREEMENT'],
    [(() => { const doc = documentFor('native'); doc.privateAgreement.fiatCurrency = new Proxy({}, { get: boom, getPrototypeOf: boom }); return doc; })(), 'INVALID_AGREEMENT'],
  ];
  for (const [index, [doc, expectedCode]] of cases.entries()) assert.equal(await code(doc), expectedCode, `case ${index}`);
  // Hostile registries map to the lookup step instead of throwing.
  assert.equal(await code(documentFor('native'), { network: boom, deployment: boom }), 'UNKNOWN_NETWORK');
  assert.equal(await code(documentFor('native'), { network: hostileError, deployment: boom }), 'UNKNOWN_NETWORK');
  assert.equal(await code(documentFor('native'), null), 'UNKNOWN_NETWORK');
  assert.equal(await code(documentFor('native'), { network: () => getterOn({}, 'chain'), deployment: boom }), 'UNKNOWN_NETWORK');
  assert.equal(await code(documentFor('native'), { network: id => registry.network(id), deployment: hostileError }), 'UNKNOWN_DEPLOYMENT');
  const network = registry.network('local-evm');
  assert.equal(await code(documentFor('native'), { network: () => ({ ...network, assets: revoked() }), deployment: (n, d) => registry.deployment(n, d) }), 'UNSUPPORTED_ASSET');
  assert.equal(await code(documentFor('native'), { network: id => registry.network(id), deployment: () => ({ ...network.deployments[0], supportedAssetIds: revoked() }) }), 'UNSUPPORTED_ASSET');
  // A getter that changes its answer cannot pass validation with one value and be displayed with another: each field is read once.
  const reads = new Map();
  const counting = value => new Proxy(value, { get(target, key, receiver) { reads.set(key, (reads.get(key) ?? 0) + 1); return Reflect.get(target, key, receiver); } });
  const doc = documentFor('native');
  let amountReads = 0;
  Object.defineProperty(doc.terms, 'amountBaseUnits', { enumerable: true, get: () => (amountReads++ === 0 ? '5' : 'not-a-number') });
  const result = await review(counting({ ...doc, terms: counting(doc.terms) }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.amountBaseUnits, '5'); assert.equal(amountReads, 1);
  for (const key of [...Object.keys(doc.terms), 'format', 'terms', 'privateAgreement']) assert.equal(reads.get(key), 1, key);
});
