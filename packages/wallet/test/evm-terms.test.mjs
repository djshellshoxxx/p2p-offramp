import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { keccak256, uintWord, addressWord, stringWord, eip712Digest, tradeTermsStructHash, evmTermsHash, TRADE_TERMS_TYPE } from '../src/evm-terms.ts';
const hex = bytes => Buffer.from(bytes).toString('hex');
const enc = text => new TextEncoder().encode(text);
const cat = (...parts) => Buffer.concat(parts.map(part => Buffer.from(part)));
const vectors = JSON.parse(await readFile(new URL('./fixtures/eip712-keccak-vectors.json', import.meta.url), 'utf8'));

test('Keccak-256 matches published vectors (distinct from SHA3-256)', () => {
  assert.equal(vectors.keccak256.length, 2);
  for (const vector of vectors.keccak256) assert.equal(hex(keccak256(enc(vector.utf8))), vector.digest);
});
// Official EIP-712 reference example, ethereum/EIPs@7372d10a457b29eceb02cd052345af165de1fb60
// assets/eip-712/Example.js (sha256 c6bdb395cdfd0cf8408328156960203d5b984f2fe0087ca74c74c99e266c0e3b), CC0.
test('EIP-712 primitives reproduce the official Ether Mail vector exactly', () => {
  const personType = 'Person(string name,address wallet)', mailType = `Mail(Person from,Person to,string contents)${personType}`;
  assert.equal(hex(keccak256(enc(mailType))), vectors.etherMail.mailTypeHash);
  const person = (name, wallet) => keccak256(cat(keccak256(enc(personType)), stringWord(name), addressWord(wallet)));
  const mail = keccak256(cat(keccak256(enc(mailType)), person('Cow', '0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826'),
    person('Bob', '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), stringWord('Hello, Bob!')));
  assert.equal(hex(mail), vectors.etherMail.mailStructHash);
  const domain = keccak256(cat(keccak256(enc('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
    stringWord('Ether Mail'), stringWord('1'), uintWord(1n, (1n << 256n) - 1n), addressWord('0xcccccccccccccccccccccccccccccccccccccccc')));
  assert.equal(hex(domain), vectors.etherMail.domainSeparator);
  assert.equal(hex(eip712Digest(domain, mail)), vectors.etherMail.signingHash);
});
// Synthetic terms only (local dev chain ID, repeated-digit addresses); no real order, account or contract.
const domain = { chainId: '31337', verifyingContract: `0x${'22'.repeat(20)}` };
const terms = { orderId: 'a'.repeat(64), revision: '1', networkId: 'local-evm', deploymentId: 'escrow-v1', seller: `0x${'33'.repeat(20)}`,
  buyer: `0x${'44'.repeat(20)}`, assetKind: 'native', asset: `0x${'0'.repeat(40)}`, amountBaseUnits: '1000000000000000000',
  privateAgreementHash: 'b'.repeat(64), capabilitiesHash: 'c'.repeat(64), sellerNonce: 'd'.repeat(64), acceptBeforeSeconds: '1700000000',
  escrowExpirySeconds: '1700086400' };
test('G16 EVM terms hash binds every field, domain chain and verifying contract', () => {
  assert.equal(TRADE_TERMS_TYPE.includes(' '), true); assert.equal(TRADE_TERMS_TYPE.includes(', '), false);
  const base = evmTermsHash(domain, terms); assert.match(base, /^[0-9a-f]{64}$/);
  for (const [field, value] of Object.entries({ orderId: 'e'.repeat(64), revision: '2', networkId: 'other', deploymentId: 'escrow-v2', seller: `0x${'55'.repeat(20)}`,
    buyer: `0x${'55'.repeat(20)}`, amountBaseUnits: '1', privateAgreementHash: 'e'.repeat(64), capabilitiesHash: 'e'.repeat(64), sellerNonce: 'e'.repeat(64),
    acceptBeforeSeconds: '1', escrowExpirySeconds: '1' })) assert.notEqual(evmTermsHash(domain, { ...terms, [field]: value }), base, field);
  assert.notEqual(evmTermsHash(domain, { ...terms, seller: terms.buyer, buyer: terms.seller }), base, 'role swap');
  assert.notEqual(evmTermsHash(domain, { ...terms, assetKind: 'erc20', asset: `0x${'11'.repeat(20)}` }), base, 'asset kind');
  assert.notEqual(evmTermsHash({ ...domain, chainId: '1' }, terms), base, 'chain replay'); assert.notEqual(evmTermsHash({ ...domain, verifyingContract: `0x${'66'.repeat(20)}` }, terms), base, 'contract replay');
  assert.equal(evmTermsHash(domain, { ...terms }), base, 'deterministic');
});
test('G16 EVM terms reject malformed, ambiguous or out-of-range input', () => {
  for (const change of [{ seller: terms.buyer }, { seller: `0x${'AB'.repeat(20)}` }, { seller: `0x${'0'.repeat(40)}` }, { asset: `0x${'11'.repeat(20)}` },
    { assetKind: 'erc20' }, { assetKind: 'spl' }, { revision: '0' }, { revision: '18446744073709551616' }, { amountBaseUnits: '0' },
    { amountBaseUnits: (1n << 256n).toString() }, { amountBaseUnits: '1.5' }, { orderId: 'A'.repeat(64) }, { networkId: '../x' }, { extra: 1 }])
    assert.throws(() => tradeTermsStructHash({ ...terms, ...change }), error => error.code === 'INVALID_INPUT', JSON.stringify(change));
  for (const bad of [{ chainId: '0' }, { chainId: '0x7a69' }, { verifyingContract: `0x${'0'.repeat(40)}` }])
    assert.throws(() => evmTermsHash({ ...domain, ...bad }, terms), error => error.code === 'INVALID_INPUT');
});
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { verifyEoaSignature, verifyEoaAcceptance, evmTermsHash as termsHashOf } from '../src/evm-terms.ts';
const sigBytes = (r, s, v) => Uint8Array.from([...Buffer.from(r, 'hex'), ...Buffer.from(s, 'hex'), v]);
test('EOA recovery reproduces the official EIP-712 example signer and is strict about malleability and format', () => {
  const { signature: sig, signingHash } = { ...vectors.etherMail };
  const good = sigBytes(sig.r, sig.s, sig.v);
  assert.equal(verifyEoaSignature(signingHash, good, sig.signer), true);
  assert.equal(verifyEoaSignature(signingHash, good, `0x${'44'.repeat(20)}`), false, 'other account');
  assert.equal(verifyEoaSignature('0'.repeat(63) + '1', good, sig.signer), false, 'other digest');
  const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const highS = (n - BigInt(`0x${sig.s}`)).toString(16).padStart(64, '0');
  for (const bad of [sigBytes(sig.r, highS, 27), sigBytes(sig.r, sig.s, 29), sigBytes(sig.r, sig.s, 1), good.subarray(0, 64), sigBytes('0'.repeat(64), sig.s, 28),
    sigBytes(sig.r, '0'.repeat(64), 28), sigBytes(n.toString(16), sig.s, 28)])
    assert.throws(() => verifyEoaSignature(signingHash, bad, sig.signer), error => error.code === 'INVALID_INPUT');
  assert.throws(() => verifyEoaSignature(signingHash, good, sig.signer.toUpperCase().replace('0X', '0x')), error => error.code === 'INVALID_INPUT');
});
test('G16 acceptance is checked against the stored role account; both parties sign the identical digest', () => {
  // Deterministic test-only keys (like the EIP example's keccak('cow')); never credentials, never persisted.
  const keyOf = label => keccak256(enc(`p2p-offramp-test-only-${label}`));
  const addressOf = key => `0x${hex(keccak256(secp256k1.getPublicKey(key, false).subarray(1)).subarray(12))}`;
  const sellerKey = keyOf('seller'), buyerKey = keyOf('buyer');
  const local = { ...terms, seller: addressOf(sellerKey), buyer: addressOf(buyerKey) };
  const sign = (key, digestHex) => { const raw = secp256k1.sign(Buffer.from(digestHex, 'hex'), key, { prehash: false, format: 'recovered', lowS: true });
    return Uint8Array.from([...raw.subarray(1), raw[0] + 27]); };
  const digest = termsHashOf(domain, local);
  const sellerSig = sign(sellerKey, digest), buyerSig = sign(buyerKey, digest);
  assert.equal(verifyEoaAcceptance(domain, local, 'seller', sellerSig), true); assert.equal(verifyEoaAcceptance(domain, local, 'buyer', buyerSig), true);
  assert.equal(verifyEoaAcceptance(domain, local, 'buyer', sellerSig), false, 'seller signature is not buyer acceptance');
  assert.equal(verifyEoaAcceptance(domain, { ...local, amountBaseUnits: '2' }, 'seller', sellerSig), false, 'edited terms need new signatures');
  assert.equal(verifyEoaAcceptance({ ...domain, chainId: '1' }, local, 'seller', sellerSig), false, 'cross-chain replay');
  assert.throws(() => verifyEoaAcceptance(domain, local, 'arbiter', sellerSig), error => error.code === 'INVALID_INPUT');
});
