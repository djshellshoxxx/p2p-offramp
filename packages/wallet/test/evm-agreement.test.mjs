import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, acceptances, privateVectors } from './lib/g16-bundle-fixture.mjs';
import { evmTermsHash } from '../src/evm-terms.ts';
const api = await import('../src/evm-agreement.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
const hex = bytes => Buffer.from(bytes).toString('hex');
function verify(bundle, options = {}) {
  assert.equal(typeof api.verifyEvmAgreementBundle, 'function', 'missing offline G16 agreement-bundle verifier');
  return api.verifyEvmAgreementBundle(bundle, { isCurrent: () => true, ...options });
}
function value(result) { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; }
function failure(result, code) { assert.equal(result.ok, false); assert.equal(result.error.code, code); assert.doesNotMatch(JSON.stringify(result), /PRIVATE-FIXTURE|paymentInstructions|agreementSalt|signature|https:\/\//); }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const cleared = arrays => arrays.every(bytes => bytes.every(byte => byte === 0));

test('coherent private commitments and two EOA acceptances bind one immutable public digest without spend authority', async () => {
  const bundle = await fixture(), before = structuredClone(bundle), result = value(await verify(bundle));
  assert.equal(bundle.terms.privateAgreementHash, privateVectors.privateAgreements[0].privateAgreementHash);
  assert.equal(bundle.terms.capabilitiesHash, privateVectors.privateAgreements[0].capabilitiesHash);
  assert.equal(result.termsHash, evmTermsHash(bundle.domain, bundle.terms));
  assert.deepEqual(result.accounts, { seller: bundle.terms.seller, buyer: bundle.terms.buyer });
  assert.equal(result.testOnly, true); assert.equal(result.economicPreparationAllowed, false);
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.accounts), true);
  assert.deepEqual(bundle, before); assert.doesNotMatch(JSON.stringify(result), /paymentInstructions|agreementSalt|signature|PRIVATE-FIXTURE/);
});

test('private order/revision, fiat fields, instructions, salt and capability commitments cannot be substituted', async () => {
  const base = await fixture();
  const changes = { orderId: 'f'.repeat(64), revision: '2', fiatCurrency: 'USD', fiatMinorUnits: '12346', fiatScale: 3,
    paymentInstructions: 'PRIVATE-FIXTURE changed', agreementSalt: 'e'.repeat(64), capabilities: [{ id: 'fixture', version: '1', policyHash: 'd'.repeat(64) }] };
  for (const [field, replacement] of Object.entries(changes)) {
    const bundle = structuredClone(base); bundle.privateAgreement[field] = replacement;
    failure(await verify(bundle), 'INTEGRITY_FAILURE');
  }
  for (const field of ['privateAgreementHash', 'capabilitiesHash']) {
    const bundle = structuredClone(base); bundle.terms[field] = 'f'.repeat(64); bundle.acceptances = acceptances(bundle.domain, bundle.terms);
    failure(await verify(bundle), 'INTEGRITY_FAILURE');
  }
});

test('edited terms and domain replay cannot pass by changing self-declared acceptance hashes', async () => {
  const base = await fixture();
  for (const kind of ['amount', 'chain', 'contract']) {
    const bundle = structuredClone(base);
    if (kind === 'amount') bundle.terms.amountBaseUnits = '2';
    if (kind === 'chain') bundle.domain.chainId = '1';
    if (kind === 'contract') bundle.domain.verifyingContract = '0x' + '55'.repeat(20);
    failure(await verify(bundle), 'INTEGRITY_FAILURE');
    for (const acceptance of bundle.acceptances) acceptance.termsHash = evmTermsHash(bundle.domain, bundle.terms);
    failure(await verify(bundle), 'UNAUTHORIZED');
  }
});

test('two distinct role accounts and actual EOA signatures are required, with existing malleability checks', async () => {
  const base = await fixture();
  const swapped = structuredClone(base); swapped.acceptances[0].signature = swapped.acceptances[1].signature;
  failure(await verify(swapped), 'UNAUTHORIZED');
  const claimed = structuredClone(base); claimed.acceptances[0].walletAccount = claimed.terms.buyer;
  failure(await verify(claimed), 'UNAUTHORIZED');
  const duplicate = structuredClone(base); duplicate.acceptances[0].role = 'buyer'; failure(await verify(duplicate), 'INVALID_INPUT');
  const missing = structuredClone(base); missing.acceptances.pop(); failure(await verify(missing), 'INVALID_INPUT');
  const extra = structuredClone(base); extra.acceptances.push(extra.acceptances[0]); failure(await verify(extra), 'LIMIT_EXCEEDED');
  for (const size of [64, 66, 100000]) {
    const bundle = structuredClone(base); bundle.acceptances[0].signature = new Uint8Array(size); failure(await verify(bundle), 'INVALID_INPUT');
  }
  const badV = structuredClone(base); badV.acceptances[0].signature[64] = 0; failure(await verify(badV), 'INVALID_INPUT');
  const highS = structuredClone(base), signature = highS.acceptances[0].signature;
  const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  signature.set(Buffer.from((n - BigInt('0x' + hex(signature.subarray(32, 64)))).toString(16).padStart(64, '0'), 'hex'), 32);
  signature[64] = signature[64] === 27 ? 28 : 27; failure(await verify(highS), 'INVALID_INPUT');
});

test('strict nested schemas and existing byte/count/integer bounds fail without private-data diagnostics', async () => {
  const base = await fixture();
  for (const target of ['outer', 'privateAgreement', 'terms', 'domain', 'acceptance']) {
    const bundle = structuredClone(base), object = target === 'outer' ? bundle : target === 'acceptance' ? bundle.acceptances[0] : bundle[target];
    object.privateApproval = 'PRIVATE-FIXTURE'; failure(await verify(bundle), 'INVALID_INPUT');
  }
  const long = structuredClone(base); long.privateAgreement.paymentInstructions = 'x'.repeat(4097); failure(await verify(long), 'LIMIT_EXCEEDED');
  const caps = structuredClone(base); caps.privateAgreement.capabilities = Array.from({ length: 9 }, (_, i) => ({ id: 'c' + i, version: '1', policyHash: 'a'.repeat(64) }));
  failure(await verify(caps), 'LIMIT_EXCEEDED');
  for (const amount of [1, '01', (1n << 128n).toString()]) {
    const bundle = structuredClone(base); bundle.privateAgreement.fiatMinorUnits = amount; failure(await verify(bundle), 'INVALID_INPUT');
  }
  const version = structuredClone(base); version.privateAgreement.v = 2; failure(await verify(version), 'UNSUPPORTED_VERSION');
  const utf8 = structuredClone(base); utf8.privateAgreement.paymentInstructions = '\ud800'; failure(await verify(utf8), 'INVALID_INPUT');
});

test('accessors, sparse arrays and incompatible signature proxies are malformed input, not provider outages', async () => {
  const base = await fixture(); let getterCalls = 0;
  for (const target of ['outer', 'privateAgreement', 'terms', 'domain', 'acceptance', 'array']) {
    const bundle = structuredClone(base), object = target === 'outer' ? bundle : target === 'acceptance' ? bundle.acceptances[0] : target === 'array' ? bundle.acceptances : bundle[target];
    const key = target === 'array' ? '0' : Object.keys(object)[0];
    Object.defineProperty(object, key, { get() { getterCalls++; throw Error('PRIVATE-FIXTURE accessor'); } });
    failure(await verify(bundle), 'INVALID_INPUT');
  }
  assert.equal(getterCalls, 0);
  const sparse = structuredClone(base); delete sparse.acceptances[0]; failure(await verify(sparse), 'INVALID_INPUT');
  const proxy = structuredClone(base); proxy.acceptances[0].signature = new Proxy(proxy.acceptances[0].signature, {});
  failure(await verify(proxy), 'INVALID_INPUT');
  const revoked = Proxy.revocable(new Uint8Array(65), {}); revoked.revoke();
  const bad = structuredClone(base); bad.acceptances[0].signature = revoked.proxy; failure(await verify(bad), 'INVALID_INPUT');
});

test('intrinsic signature bytes are used without invoking caller length, iterator or subarray overrides', async () => {
  const bundle = await fixture(); let calls = 0;
  for (const acceptance of bundle.acceptances) {
    Object.defineProperty(acceptance.signature, 'byteLength', { get() { calls++; throw Error('PRIVATE-FIXTURE length'); } });
    acceptance.signature[Symbol.iterator] = () => { calls++; throw Error('PRIVATE-FIXTURE iterator'); };
    acceptance.signature.subarray = () => { calls++; throw Error('PRIVATE-FIXTURE subarray'); };
  }
  value(await verify(bundle)); assert.equal(calls, 0);
});

test('all payloads and signature bytes are captured before SHA awaits and owned temporary buffers clear', async () => {
  const bundle = await fixture(), originalDigest = evmTermsHash(bundle.domain, bundle.terms), entered = deferred(), gate = deferred(), observed = [];
  const pending = verify(bundle, { sha256: async bytes => {
    observed.push(bytes); const result = crypto.subtle.digest('SHA-256', bytes);
    if (observed.length === 1) { entered.resolve(); await gate.promise; }
    return result;
  } });
  await entered.promise;
  bundle.privateAgreement.paymentInstructions = 'PRIVATE-FIXTURE late mutation'; bundle.privateAgreement.capabilities.push({ id: 'late', version: '1', policyHash: 'f'.repeat(64) });
  bundle.terms.amountBaseUnits = '2'; bundle.domain.chainId = '1'; bundle.acceptances[0].signature.fill(0); bundle.acceptances[1].role = 'seller';
  gate.resolve(); const result = value(await pending);
  assert.equal(result.termsHash, originalDigest); assert.equal(observed.length, 2); assert.equal(cleared(observed), true);
});

test('abort and generation change at either hash await suppress completion and wipe owned buffers', async () => {
  for (const at of [1, 2]) for (const reason of ['abort', 'generation']) {
    const bundle = await fixture(), entered = deferred(), gate = deferred(), observed = [], controller = new AbortController(); let generation = 1;
    const pending = verify(bundle, { signal: controller.signal, isCurrent: () => generation === 1, sha256: async bytes => {
      observed.push(bytes); const result = crypto.subtle.digest('SHA-256', bytes);
      if (observed.length === at) { entered.resolve(); await gate.promise; } return result;
    } });
    await entered.promise;
    if (reason === 'abort') { controller.abort(); assert.equal(cleared(observed), true, 'abort immediately clears owned input arrays'); }
    else generation++;
    gate.resolve(); failure(await pending, 'CANCELLED'); assert.equal(observed.length, at); assert.equal(cleared(observed), true);
  }
});

test('private encoded bytes clear before the unrelated capability hash finishes', async () => {
  const bundle = await fixture(), entered = deferred(), gate = deferred(), observed = [];
  const pending = verify(bundle, { sha256: async bytes => {
    observed.push(bytes); const result = crypto.subtle.digest('SHA-256', bytes);
    if (observed.length === 2) { entered.resolve(); await gate.promise; } return result;
  } });
  await entered.promise; const privateBytesAlreadyCleared = observed[0].every(byte => byte === 0);
  gate.resolve(); value(await pending);
  assert.equal(privateBytesAlreadyCleared, true, 'private encoding must not linger during the later public commitment hash');
  assert.equal(cleared(observed), true);
});

test('backend failure, mismatched commitments and already-cancelled work never return a verified bundle', async () => {
  for (const at of [1, 2]) {
    const bundle = await fixture(), observed = [];
    failure(await verify(bundle, { sha256: async bytes => {
      observed.push(bytes); if (observed.length === at) throw Error('PRIVATE-FIXTURE backend https://private.invalid'); return crypto.subtle.digest('SHA-256', bytes);
    } }), 'UNAVAILABLE'); assert.equal(cleared(observed), true); assert.equal(observed.length, at);
  }
  const bundle = await fixture(), controller = new AbortController(); controller.abort(); let calls = 0;
  failure(await verify(bundle, { signal: controller.signal, sha256: async () => { calls++; return new ArrayBuffer(32); } }), 'CANCELLED'); assert.equal(calls, 0);
  failure(await verify(bundle, { isCurrent: () => false }), 'CANCELLED');
});

test('matching nonempty capability commitments verify data only, without activating policy or exporting private data', async () => {
  const bundle = await fixture(structuredClone(privateVectors.privateAgreements[1].input));
  const result = value(await verify(bundle)); assert.equal(result.testOnly, true); assert.equal(result.economicPreparationAllowed, false);
  assert.equal('capabilities' in result, false); assert.equal('privateAgreement' in result, false);
  const facade = await import('../../domain/index.ts'); assert.equal('verifyEvmAgreementBundle' in facade, false);
});
