// D1 composed verifier: account class from pinned eth_getCode, both statements per scheme, registry-only domain.
// Fake EIP-1193 read port only; no network. Synthetic public scenario keys; no production approval.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RegistryService } from '../../domain/index.ts';
import { evmTermsHash, keccak256 } from '../src/evm-terms.ts';
import { peerAcceptanceHash } from '../src/evm-peer-acceptance.ts';
import { createPeerAcceptanceVerifier, isPeerAcceptanceEvidence, PEER_VERIFIER_LIMITS } from '../src/evm-peer-verifier.ts';

const scenario = JSON.parse(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/scenario.json', import.meta.url), 'utf8'));
const registryJSON = JSON.parse(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/registry.json', import.meta.url), 'utf8'));
const vectors = JSON.parse(await readFile(new URL('./fixtures/peer-acceptance-v1.json', import.meta.url), 'utf8'));
const ESCROW_CODE = '0x6000', W = '0x' + '88'.repeat(20), MAGIC = '0x1626ba7e' + '0'.repeat(56), NOW = 1_699_990_000;
const H1 = '0x' + '12'.repeat(32), H2 = '0x' + '34'.repeat(32), WALLET_CODE = '0x60016000526001601ff3';
const DELEGATED = '0xef0100' + '77'.repeat(20);
const hexOf = bytes => Buffer.from(bytes).toString('hex');
const bytes = value => new Uint8Array(Buffer.from(value.replace(/^0x/, ''), 'hex'));
const sha = data => createHash('sha256').update(data).digest('hex');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function registryWith(patch = () => {}) {
  const raw = structuredClone(registryJSON);
  raw.networks[0].deployments[0].runtime.keccak256 = hexOf(keccak256(bytes(ESCROW_CODE)));
  patch(raw);
  const encoded = new TextEncoder().encode(JSON.stringify(raw)), registry = new RegistryService();
  assert.equal((await registry.load(encoded, sha(encoded))).ok, true);
  return { registry, raw };
}
/** Fake chain: code per account, ERC-1271 approvals per (digest, signature), mutable anchor and interception. */
async function chain(patch) {
  const { registry, raw } = await registryWith(patch);
  const state = { chainId: '0x7a69', genesis: raw.networks[0].genesisHash, anchor: { number: '0x10', hash: H1, timestamp: '0x' + NOW.toString(16) },
    codes: new Map(), approved: new Set(), calls: [], intercept: undefined };
  const request = async ({ method, params = [] }) => {
    state.calls.push({ method, params });
    const overridden = await state.intercept?.(method, params, state); if (overridden !== undefined) return overridden;
    if (method === 'eth_chainId') return state.chainId;
    if (method === 'eth_getBlockByNumber') return params[0] === '0x0' ? { number: '0x0', hash: state.genesis, timestamp: '0x0' } : { ...state.anchor };
    if (method === 'eth_getCode') return params[0] === raw.networks[0].deployments[0].address ? ESCROW_CODE : state.codes.get(params[0]) ?? '0x';
    if (method === 'eth_call') {
      const data = params[0].data, digest = data.slice(10, 74), length = parseInt(data.slice(138, 202), 16), signature = data.slice(202, 202 + 2 * length);
      return state.approved.has(`${params[0].to}:${digest}:${signature}`) ? MAGIC : '0xffffffff' + '0'.repeat(56);
    }
    throw Error('PRIVATE unexpected method ' + method);
  };
  return { registry, state, request, verifier: createPeerAcceptanceVerifier({ registry, request }) };
}
function eoaInput(role = 'seller', asset = 'native') {
  const vector = vectors.vectors.find(row => row.role === role && row.assetKind === asset);
  return { terms: { ...scenario.sets[asset].terms }, role, signerMessagingKey: vector.binding.ownMessagingKey,
    counterpartyMessagingKey: vector.binding.counterpartyMessagingKey, nowSeconds: String(NOW), envelopeExpiresAtSeconds: String(NOW + 6000),
    binding: { ...vector.binding }, termsSignature: bytes(vector.termsSignature), bindingSignature: bytes(vector.bindingSignature) };
}
/** A contract-wallet seller W: arbitrary-length signatures that the fake wallet approves per digest. */
function contractInput(f, { approveTerms = true, approveBinding = true, sizes = [97, 130] } = {}) {
  const base = eoaInput(), terms = { ...base.terms, seller: W };
  const binding = { ...base.binding, account: W, termsHash: evmTermsHash(scenario.domain, terms) };
  const termsSignature = new Uint8Array(sizes[0]).fill(7), bindingSignature = new Uint8Array(sizes[1]).fill(9);
  if (approveTerms) f.state.approved.add(`${W}:${binding.termsHash}:${hexOf(termsSignature)}`);
  if (approveBinding) f.state.approved.add(`${W}:${peerAcceptanceHash(scenario.domain, binding)}:${hexOf(bindingSignature)}`);
  f.state.codes.set(W, WALLET_CODE);
  return { ...base, terms, binding, termsSignature, bindingSignature };
}
const methods = f => f.state.calls.map(call => call.method);
function deepFrozen(value) { if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(deepFrozen); } }

test('empty code at the recorded block: EOA path verifies both strict signatures for both roles and asset kinds', async () => {
  for (const role of ['seller', 'buyer']) for (const asset of ['native', 'erc20']) {
    const f = await chain(), input = eoaInput(role, asset), result = await f.verifier.verify(input);
    assert.equal(result.ok, true, JSON.stringify(result));
    const evidence = result.value;
    assert.equal(evidence.scheme, 'eoa'); assert.equal(evidence.termsHash, evmTermsHash(scenario.domain, input.terms));
    assert.equal(evidence.bindingHash, peerAcceptanceHash(scenario.domain, input.binding));
    assert.deepEqual({ ...evidence.binding }, input.binding); assert.equal(evidence.walletCodeKeccak256, null);
    assert.deepEqual({ ...evidence.anchor }, { height: '16', hash: H1, timestamp: String(NOW) });
    assert.equal(evidence.effectiveNotAfterSeconds, input.binding.notAfterSeconds); assert.equal(evidence.finality, 'unfinalized');
    assert.equal(evidence.economicPreparationAllowed, false); assert.equal(isPeerAcceptanceEvidence(evidence), true);
    assert.equal(isPeerAcceptanceEvidence({ ...evidence }), false, 'a copied shape is not verifier evidence');
    deepFrozen(result);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(hexOf(input.termsSignature).slice(0, 40)));
    const code = f.state.calls.find(call => call.method === 'eth_getCode' && call.params[0] === input.binding.account);
    assert.deepEqual(code.params[1], { blockHash: H1, requireCanonical: true }, 'classification is pinned to the recorded block by hash');
    assert.ok(methods(f).every(method => ['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode'].includes(method)), 'EOA path never eth_calls');
    assert.ok(!methods(f).some(method => /send|sign/i.test(method)));
  }
});
test('EIP-7702 delegated and reserved 0xef code are refused UNSUPPORTED before any signature check', async () => {
  for (const [code, reason] of [[DELEGATED, 'eip7702-delegated'], ['0xef01007777', 'reserved-code-prefix'], ['0xef00', 'reserved-code-prefix']]) {
    const f = await chain(), input = eoaInput(); f.state.codes.set(input.binding.account, code);
    const result = await f.verifier.verify(input);
    assert.deepEqual(result, { ok: false, code: 'UNSUPPORTED', reason }); assert.equal(methods(f).includes('eth_call'), false);
  }
});
test('contract code: ERC-1271 for BOTH statements at the recorded block; either missing approval refuses', async () => {
  const f = await chain(), input = contractInput(f), result = await f.verifier.verify(input);
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.value.scheme, 'erc1271');
  assert.equal(result.value.walletCodeKeccak256, hexOf(keccak256(bytes(WALLET_CODE))));
  const calls = f.state.calls.filter(call => call.method === 'eth_call');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.params[0].data.slice(10, 74)), [result.value.termsHash, result.value.bindingHash]);
  assert.ok(calls.every(call => call.params[1].blockHash === H1 && call.params[1].requireCanonical === true && call.params[0].to === W && call.params[0].gas === '0x186a0'));
  for (const approvals of [{ approveTerms: false }, { approveBinding: false }]) {
    const g = await chain(); assert.deepEqual(await g.verifier.verify(contractInput(g, approvals)), { ok: false, code: 'UNAUTHORIZED' });
  }
  // Bad returns: short, padded, wrong magic, revert.
  for (const reply of ['0x1626ba7e', MAGIC + '00', '0x' + '00'.repeat(32), new Error('PRIVATE revert')]) {
    const g = await chain(), input = contractInput(g);
    g.state.intercept = method => { if (method === 'eth_call') { if (reply instanceof Error) throw reply; return reply; } };
    const refused = await g.verifier.verify(input);
    assert.equal(refused.ok, false); assert.ok(['UNAUTHORIZED', 'UNAVAILABLE'].includes(refused.code)); assert.doesNotMatch(JSON.stringify(refused), /PRIVATE/);
  }
});
test('contract policy is point-in-time: a later recheck after revocation, a reorg or a code change refuses', async () => {
  const f = await chain(), input = contractInput(f);
  assert.equal((await f.verifier.verify(input)).ok, true);
  f.state.approved.clear();
  assert.deepEqual(await f.verifier.verify(input), { ok: false, code: 'UNAUTHORIZED' }, 'revoked approval');
  const reorg = await chain(), reorgInput = contractInput(reorg);
  reorg.state.intercept = (method, params, state) => { if (method === 'eth_call') state.anchor = { ...state.anchor, hash: H2 }; };
  assert.deepEqual(await reorg.verifier.verify(reorgInput), { ok: false, code: 'INTEGRITY_FAILURE' });
  const swapped = await chain(), swappedInput = contractInput(swapped);
  swapped.state.intercept = (method, params, state) => { if (method === 'eth_call') state.codes.set(W, WALLET_CODE + '00'); };
  assert.deepEqual(await swapped.verifier.verify(swappedInput), { ok: false, code: 'INTEGRITY_FAILURE' });
  // Contract wallets may accept a high-s twin; no low-s rule applies to them and deduplication never uses bytes.
  const twin = await chain(), twinInput = contractInput(twin, { sizes: [65, 65] });
  assert.equal((await twin.verifier.verify(twinInput)).ok, true);
});
test('counterfactual or undeployed contract wallets are refused: empty code with a non-EOA signature', async () => {
  for (const sizes of [[66, 65], [65, 200]]) {
    const f = await chain(), input = eoaInput();
    input.termsSignature = new Uint8Array(sizes[0]).fill(1); input.bindingSignature = new Uint8Array(sizes[1]).fill(1);
    assert.deepEqual(await f.verifier.verify(input), { ok: false, code: 'UNSUPPORTED', reason: 'counterfactual-or-undeployed' });
  }
  const f = await chain(), input = eoaInput(), wrapped = new Uint8Array(65 + 32);
  wrapped.set(input.bindingSignature); wrapped.set(bytes('6492'.repeat(16)), 65); input.bindingSignature = wrapped;
  assert.deepEqual(await f.verifier.verify(input), { ok: false, code: 'UNSUPPORTED', reason: 'counterfactual-or-undeployed' }, 'ERC-6492 wrapper');
});
test('EOA path: high-s twin, wrong v, swapped or foreign signatures are refused', async () => {
  const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  for (const field of ['termsSignature', 'bindingSignature']) {
    const f = await chain(), input = eoaInput(), high = new Uint8Array(input[field]);
    const s = BigInt('0x' + hexOf(high.subarray(32, 64)));
    high.set(bytes((n - s).toString(16).padStart(64, '0')), 32); high[64] = high[64] === 27 ? 28 : 27;
    assert.deepEqual(await f.verifier.verify({ ...input, [field]: high }), { ok: false, code: 'INVALID_INPUT' });
    const wrongV = new Uint8Array(input[field]); wrongV[64] = 29;
    assert.deepEqual(await f.verifier.verify({ ...input, [field]: wrongV }), { ok: false, code: 'INVALID_INPUT' });
  }
  const f = await chain(), input = eoaInput(), buyer = eoaInput('buyer');
  assert.deepEqual(await f.verifier.verify({ ...input, termsSignature: input.bindingSignature, bindingSignature: input.termsSignature }), { ok: false, code: 'UNAUTHORIZED' });
  assert.deepEqual(await f.verifier.verify({ ...input, bindingSignature: buyer.bindingSignature }), { ok: false, code: 'UNAUTHORIZED' }, 'other wallet');
});
test('wrong role, keys, account, revision, network or deployment refuse before any chain read', async () => {
  const cases = [
    input => ({ ...input, role: 'buyer' }), input => ({ ...input, signerMessagingKey: input.counterpartyMessagingKey, counterpartyMessagingKey: input.signerMessagingKey }),
    input => ({ ...input, signerMessagingKey: '1b'.repeat(32) }), input => ({ ...input, binding: { ...input.binding, account: input.terms.buyer } }),
    input => ({ ...input, terms: { ...input.terms, revision: '2' } }), input => ({ ...input, terms: { ...input.terms, amountBaseUnits: '1' } }),
  ];
  for (const change of cases) {
    const f = await chain(), result = await f.verifier.verify(change(eoaInput()));
    assert.equal(result.ok, false); assert.ok(['UNAUTHORIZED', 'INVALID_INPUT'].includes(result.code), JSON.stringify(result)); assert.equal(f.state.calls.length, 0);
  }
  for (const terms of [{ networkId: 'other' }, { deploymentId: 'other' }]) {
    const f = await chain(), input = eoaInput();
    assert.deepEqual(await f.verifier.verify({ ...input, terms: { ...input.terms, ...terms } }), { ok: false, code: 'WRONG_CHAIN' }); assert.equal(f.state.calls.length, 0);
  }
});
test('the domain comes only from the local registry; chain, genesis and escrow code must match it', async () => {
  // A registry naming another chain id: the proof (signed for 31337) is unauthorized, never re-domained by input.
  const other = await chain(raw => { raw.networks[0].chainIdentity = '1'; });
  other.state.chainId = '0x1';
  assert.deepEqual(await other.verifier.verify(eoaInput()), { ok: false, code: 'UNAUTHORIZED' });
  for (const [mutate, code] of [[s => { s.chainId = '0x1'; }, 'WRONG_CHAIN'], [s => { s.genesis = H2; }, 'WRONG_CHAIN']]) {
    const f = await chain(); mutate(f.state); assert.deepEqual(await f.verifier.verify(eoaInput()), { ok: false, code });
  }
  const f = await chain(); f.state.intercept = (method, params) => method === 'eth_getCode' && params[0] === scenario.domain.verifyingContract ? '0x6001' : undefined;
  assert.deepEqual(await f.verifier.verify(eoaInput()), { ok: false, code: 'INTEGRITY_FAILURE' }, 'escrow code differs from the registry runtime hash');
  const input = eoaInput();
  assert.ok(!('domain' in input) && !('chainId' in input), 'the verifier input has no caller domain at all');
  const extra = await chain(); assert.deepEqual(await extra.verifier.verify({ ...input, domain: scenario.domain }), { ok: false, code: 'INVALID_INPUT' });
});
test('deadlines: binding, terms, envelope (on arrival only) and chain block time; recheck has no envelope deadline', async () => {
  const at = async (overrides, anchorTime) => {
    const f = await chain(); if (anchorTime !== undefined) f.state.anchor.timestamp = '0x' + anchorTime.toString(16);
    return f.verifier.verify({ ...eoaInput(), ...overrides });
  };
  assert.equal((await at({ nowSeconds: '1699994999' }, 1_699_994_999)).ok, true);
  assert.deepEqual(await at({ nowSeconds: '1699995000' }), { ok: false, code: 'EXPIRED' }, 'binding notAfter');
  assert.deepEqual(await at({ envelopeExpiresAtSeconds: String(NOW) }), { ok: false, code: 'EXPIRED' }, 'envelope expiry on arrival');
  const recheck = await at({ envelopeExpiresAtSeconds: null, nowSeconds: String(NOW + 4000) }, NOW + 4000);
  assert.equal(recheck.ok, true); assert.equal(recheck.value.effectiveNotAfterSeconds, '1699995000');
  assert.deepEqual(await at({ nowSeconds: '1699994990' }, 1_699_995_000), { ok: false, code: 'EXPIRED' }, 'block.timestamp at the deadline');
});
test('inputs are snapshotted before the first await; hostile inputs and oversize signatures never reach the chain', async () => {
  const held = deferred(), f = await chain(), input = eoaInput();
  f.state.intercept = method => method === 'eth_chainId' && f.state.calls.length === 1 ? held.promise.then(() => '0x7a69') : undefined;
  const pending = f.verifier.verify(input);
  input.terms.amountBaseUnits = '1'; input.binding.account = '0x' + '99'.repeat(20); input.termsSignature.fill(0); input.role = 'buyer';
  held.resolve(); const result = await pending; assert.equal(result.ok, true, JSON.stringify(result));
  let touched = 0;
  for (const hostile of [() => { const v = eoaInput(); Object.defineProperty(v, 'binding', { enumerable: true, get() { touched++; return {}; } }); return v; },
    () => ({ ...eoaInput(), extra: true }), () => { const v = eoaInput(); v.termsSignature = new Uint8Array(PEER_VERIFIER_LIMITS.contractSignatureBytes + 1); return v; },
    () => { const v = eoaInput(); v.termsSignature = new Uint8Array(0); return v; }]) {
    const g = await chain(), refused = await g.verifier.verify(hostile());
    assert.equal(refused.ok, false); assert.ok(['INVALID_INPUT', 'LIMIT_EXCEEDED'].includes(refused.code)); assert.equal(g.state.calls.length, 0);
  }
  assert.equal(touched, 0);
});
test('timeout, abort, dispose and the pending bound end verification without later reads', async context => {
  const held = deferred(), f = await chain();
  f.state.intercept = method => method === 'eth_getCode' ? held.promise : undefined;
  const controller = new AbortController(), pending = f.verifier.verify(eoaInput(), controller.signal);
  while (!methods(f).includes('eth_getCode')) await new Promise(r => setImmediate(r));
  controller.abort(); assert.deepEqual(await pending, { ok: false, code: 'CANCELLED' });
  const count = f.state.calls.length; held.resolve(ESCROW_CODE); await new Promise(r => setImmediate(r)); assert.equal(f.state.calls.length, count);
  const g = await chain(); g.state.intercept = () => new Promise(() => {});
  const jobs = Array.from({ length: PEER_VERIFIER_LIMITS.pending }, () => g.verifier.verify(eoaInput()));
  assert.deepEqual(await g.verifier.verify(eoaInput()), { ok: false, code: 'LIMIT_EXCEEDED' });
  g.verifier.dispose(); for (const job of jobs) assert.deepEqual(await job, { ok: false, code: 'CANCELLED' });
  assert.deepEqual(await g.verifier.verify(eoaInput()), { ok: false, code: 'CANCELLED' });
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { registry } = await registryWith(), slow = createPeerAcceptanceVerifier({ registry, request: () => new Promise(() => {}), timeoutMs: 10 });
  const timed = slow.verify(eoaInput()); await new Promise(r => setImmediate(r)); context.mock.timers.tick(10);
  assert.deepEqual(await timed, { ok: false, code: 'TIMEOUT' }); slow.dispose(); context.mock.timers.reset();
});
test('review NIT: reads are pinned by EIP-1898 block hash (fail closed if unsupported) and the latest block must be current', async () => {
  // Every state read names the anchor's hash with requireCanonical; a provider that rejects that form fails closed.
  const f = await chain(), input = contractInput(f), result = await f.verifier.verify(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  const stateReads = f.state.calls.filter(call => call.method === 'eth_getCode' || call.method === 'eth_call');
  assert.equal(stateReads.length, 5);
  assert.ok(stateReads.every(call => JSON.stringify(call.params.at(-1)) === JSON.stringify({ blockHash: H1, requireCanonical: true })));
  const legacy = await chain(), legacyInput = contractInput(legacy);
  legacy.state.intercept = (method, params) => { if ((method === 'eth_getCode' || method === 'eth_call') && typeof params.at(-1) === 'object') throw Error('PRIVATE invalid block param'); };
  const refusedLegacy = await legacy.verifier.verify(legacyInput);
  assert.deepEqual(refusedLegacy, { ok: false, code: 'UNAVAILABLE' }); assert.doesNotMatch(JSON.stringify(refusedLegacy), /PRIVATE/);
  // A stale or future 'latest' is not a current observation.
  for (const [timestamp, reason] of [[NOW - PEER_VERIFIER_LIMITS.maxAnchorAgeSeconds - 1, 'stale-block'], [NOW + PEER_VERIFIER_LIMITS.maxAnchorFutureSeconds + 1, 'future-block']]) {
    const g = await chain(); g.state.anchor.timestamp = '0x' + timestamp.toString(16);
    assert.deepEqual(await g.verifier.verify(eoaInput()), { ok: false, code: 'UNAVAILABLE', reason });
    assert.ok(!g.state.calls.some(call => call.method === 'eth_getCode'), 'no state read against a stale block');
  }
  const edge = await chain(); edge.state.anchor.timestamp = '0x' + (NOW - PEER_VERIFIER_LIMITS.maxAnchorAgeSeconds).toString(16);
  assert.equal((await edge.verifier.verify(eoaInput())).ok, true, 'exactly at the age bound');
  const { registry } = await registryWith();
  assert.throws(() => createPeerAcceptanceVerifier({ registry, request: async () => null, maxAnchorAgeSeconds: 0 }), /Invalid peer verifier configuration/);
});
