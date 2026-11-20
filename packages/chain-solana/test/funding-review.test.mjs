import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { connected, setupClient, splitWire } from './lifecycle-support.mjs';
import { error, key, makeRegistry, ok } from './support.mjs';
import { buildFundNative } from '../src/instructions.ts';
import { compileLegacyMessage, encodeBase64 } from '../src/message.ts';

// Explicit missing-feature assertion preserves a useful baseline without a module-load failure.
const source = new URL('../src/funding-review.ts', import.meta.url);
const projection = existsSync(source) ? await import(source.href) : {};
const projector = () => {
  assert.equal(typeof projection.projectNativeFundingReview, 'function', 'native funding review projection exists');
  return projection.projectNativeFundingReview;
};
const invalid = work => assert.throws(work, value =>
  value?.code === 'INVALID_INPUT' && value.message === 'Solana read failed.');
async function fixture(kind = 'native', options = {}) {
  const env = setupClient(kind, { ...options, clusterOptions: { absent: true, ...options.clusterOptions } });
  const session = await connected(env, 'seller');
  return { ...env, session, handle: ok(await env.client.prepareFunding(env.trade, session)) };
}
const clone = handle => structuredClone(handle);
const frozen = value => {
  if (value && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) frozen(child);
  }
};

test('the maintained G32 fixture prepares native funding without signing or sending', async () => {
  const env = await fixture();
  assert.equal(env.handle.action, 'fund');
  assert.equal(env.journalFake.records(env.binding)[0].state, 'prepared');
  assert.equal(env.walletFake.calls.sign.length, 0);
  assert.equal(env.cluster.sent.length, 0);
  ok(await env.client.cancel(env.handle));
});

test('native projection shows the complete fixed terms, deployment pins and exact reviewed transaction', async () => {
  const project = projector(), env = await fixture();
  const { trade, handle } = env;
  const actual = project(trade, handle);
  assert.deepEqual(actual, {
    action: 'fund', role: 'seller', expectedEscrowState: 'absent', effect: 'fund-fixed-escrow-terms',
    validation: 'data-consistency-only', confirmationAuthority: false,
    counterpartyAcceptance: 'not-established', fundingOutcome: 'not-established',
    network: { id: trade.binding.networkId, chain: 'solana', genesisHash: trade.terms.genesisHash },
    deployment: { id: trade.binding.deploymentId, programId: trade.terms.programId,
      programDataAddress: trade.programDataAddress, programDataSha256: trade.deployment.runtime.programDataSha256,
      artifactSha256: trade.deployment.artifactSha256, upgradeAuthority: null, evidence: 'supplied-bound-trade' },
    terms: { hash: trade.termsHash, orderId: trade.terms.orderId, revision: trade.terms.revision,
      sellerNonce: trade.terms.sellerNonce, seller: trade.terms.seller, buyer: trade.terms.buyer,
      capabilitiesHash: trade.terms.capabilitiesHash, privateAgreementHash: trade.terms.privateAgreementHash,
      acceptBeforeSeconds: trade.terms.acceptBeforeSeconds, escrowExpirySeconds: trade.terms.escrowExpirySeconds },
    principal: { amountBaseUnits: trade.terms.amountBaseUnits, assetId: trade.asset.id,
      assetKind: 'native', assetAddress: null, decimals: 9 },
    escrow: trade.escrow.address, fundingSource: { kind: 'native-seller', address: trade.terms.seller },
    transaction: { feePayer: handle.feePayer, message: handle.message, blockhash: handle.blockhash,
      lastValidBlockHeight: handle.lastValidBlockHeight, lastValidBlockHeightEvidence: 'supplied-metadata' },
    costs: { feeLamports: null, escrowRentLamports: null, totalDebitLamports: null },
  });
  assert.notEqual(actual.terms, trade.terms);
  assert.notEqual(actual.deployment, trade.deployment);
  assert.equal('intentId' in actual, false);
  assert.equal('walletRequest' in actual, false);
  ok(await env.client.cancel(handle));
});

test('projection recursively freezes detached data without retaining caller-owned presentation containers',
  async () => {
  const project = projector(), env = await fixture(), copy = clone(env.handle);
  const actual = project(env.trade, copy), saved = structuredClone(actual);
  frozen(actual);
  assert.throws(() => { actual.terms.seller = key('changed-display-seller'); }, TypeError);
  assert.throws(() => { actual.costs.feeLamports = '0'; }, TypeError);
  assert.throws(() => { actual.transaction.message = ''; }, TypeError);
  copy.binding.tradeId = 'f'.repeat(64);
  copy.shape.sellerTokenAccount = key('changed-display-source');
  copy.message = '';
  copy.lastValidBlockHeight = '0';
  assert.deepEqual(actual, saved);
  assert.equal(env.journalFake.records(env.binding)[0].state, 'prepared');
  ok(await env.client.cancel(env.handle));
});

const changedFields = [
  ['action', env => ({ ...env.handle, action: 'release' })],
  ['role', env => ({ ...env.handle, role: 'buyer' })],
  ['fee payer', env => ({ ...env.handle, feePayer: env.terms.buyer })],
  ['program', env => ({ ...env.handle, programId: key('other-program') })],
  ['escrow', env => ({ ...env.handle, escrow: key('other-escrow') })],
  ['escrow precondition', env => ({ ...env.handle, expectedEscrowState: 'funded' })],
  ['chain', env => ({ ...env.handle, binding: { ...env.binding, chain: 'evm' } })],
  ['network', env => ({ ...env.handle, binding: { ...env.binding, networkId: 'other-network' } })],
  ['deployment', env => ({ ...env.handle, binding: { ...env.binding, deploymentId: 'other-deployment' } })],
  ['terms hash', env => ({ ...env.handle, binding: { ...env.binding, tradeId: 'a'.repeat(64) } })],
  ['funding source', env => ({ ...env.handle, shape: { action: 'fund', sellerTokenAccount: key('other-source') } })],
  ['shape action', env => ({ ...env.handle, shape: { action: 'release', sellerTokenAccount: null } })],
  ['blockhash', env => ({ ...env.handle, blockhash: key('other-blockhash') })],
  ['noncanonical message', env => ({ ...env.handle, message: env.handle.message + '\n' })],
  ['trailing message byte', env => ({ ...env.handle,
    message: encodeBase64(Uint8Array.from([...Buffer.from(env.handle.message, 'base64'), 0])) })],
  ['oversized message', env => ({ ...env.handle, message: 'A'.repeat(1648) })],
  ['noncanonical height', env => ({ ...env.handle, lastValidBlockHeight: '01' })],
  ['overflow height', env => ({ ...env.handle, lastValidBlockHeight: '18446744073709551616' })],
  ['noncanonical intent id', env => ({ ...env.handle, intentId: 'not-an-intent' })],
];
for (const [name, change] of changedFields) test(`projection refuses inconsistent ${name}`, async () => {
  const project = projector(), env = await fixture();
  invalid(() => project(env.trade, change(env)));
  assert.equal(env.journalFake.records(env.binding)[0].state, 'prepared');
  assert.equal(env.walletFake.calls.sign.length, 0);
  assert.equal(env.cluster.sent.length, 0);
  ok(await env.client.cancel(env.handle));
});

for (const [name, changes] of [
  ['principal', { amountBaseUnits: '2000001' }],
  ['buyer', { buyer: key('different-buyer') }],
  ['seller', { seller: key('different-seller') }],
  ['acceptance deadline', { acceptBeforeSeconds: '1700000601' }],
  ['escrow deadline', { escrowExpirySeconds: '1700007201' }],
]) test(`original message cannot be displayed against different bound ${name}`, async () => {
  const project = projector(), env = await fixture();
  const other = setupClient('native', { terms: { ...env.terms, ...changes }, clusterOptions: { absent: true } });
  invalid(() => project(other.trade, env.handle));
  // Rebinding displayed fields cannot rewrite the fixed terms encoded in the original message.
  const rebound = { ...env.handle, binding: other.binding, feePayer: other.terms.seller,
    programId: other.terms.programId, escrow: other.trade.escrow.address };
  invalid(() => project(other.trade, rebound));
  ok(await env.client.cancel(env.handle));
});

for (const [name, make] of [
  ['null', () => null], ['array', () => []], ['primitive', () => 'review'],
  ['non-plain prototype', h => Object.assign(Object.create({ inherited: true }), h)],
  ['unknown field', h => ({ ...h, certified: true })],
  ['symbol field', h => ({ ...h, [Symbol('authority')]: true })],
  ['missing field', h => { const out = clone(h); delete out.message; return out; }],
  ['unknown binding field', h => ({ ...h, binding: { ...h.binding, authority: true } })],
  ['unknown shape field', h => ({ ...h, shape: { ...h.shape, topUp: '0' } })],
]) test(`projection refuses malformed view: ${name}`, async () => {
  const project = projector(), env = await fixture();
  invalid(() => project(env.trade, make(env.handle)));
  ok(await env.client.cancel(env.handle));
});

for (const [container, field] of [
  ['view', 'message'], ['view', 'binding'], ['view', 'shape'],
  ['binding', 'tradeId'], ['shape', 'sellerTokenAccount'],
]) test(`projection refuses ${container}.${field} accessors without invoking them`, async () => {
  const project = projector(), env = await fixture(), copy = clone(env.handle);
  const target = container === 'view' ? copy : copy[container];
  let reads = 0;
  Object.defineProperty(target, field, { enumerable: true, get() { reads++; throw new Error('private detail'); } });
  Object.freeze(target);
  invalid(() => project(env.trade, copy));
  assert.equal(reads, 0);
  ok(await env.client.cancel(env.handle));
});

test('an unbranded trade is rejected before trade or view properties are observed', async () => {
  const project = projector(), env = await fixture();
  let reads = 0;
  const fake = { get terms() { reads++; throw new Error('private detail'); } };
  const hostile = { get message() { reads++; throw new Error('private detail'); } };
  for (const trade of [fake, { ...env.trade }, structuredClone(env.trade), null]) {
    invalid(() => project(trade, hostile));
  }
  assert.equal(reads, 0);
  ok(await env.client.cancel(env.handle));
});

test('native projection refuses a real SPL funding review without changing its prepared intent', async () => {
  const project = projector(), env = await fixture('spl');
  invalid(() => project(env.trade, env.handle));
  assert.equal(env.journalFake.records(env.binding)[0].state, 'prepared');
  assert.equal(env.walletFake.calls.sign.length, 0);
  ok(await env.client.cancel(env.handle));
});

test('projection and fixed refusals perform no additional port, clock, random or network operation', async () => {
  const project = projector(), env = await fixture();
  const before = { rpc: env.cluster.calls.length, wallet: structuredClone(env.walletFake.calls),
    writes: [...env.journalFake.writes], records: structuredClone(env.journalFake.records(env.binding)) };
  const descriptors = new Map(['Date', 'crypto', 'fetch'].map(name =>
    [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const random = Math.random, read = env.journalFake.journal.read, profile = env.journalFake.journal.profileId;
  let operations = 0;
  const forbidden = () => { operations++; throw new Error('projection attempted an operation'); };
  try {
    Object.defineProperty(globalThis, 'Date', { configurable: true, value: class { constructor() { forbidden(); }
      static now() { return forbidden(); } } });
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: forbidden } });
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: forbidden });
    Math.random = forbidden;
    env.journalFake.journal.read = forbidden;
    env.journalFake.journal.profileId = forbidden;
    assert.equal(project(env.trade, env.handle).transaction.message, env.handle.message);
    invalid(() => project(env.trade, { ...env.handle, message: '' }));
  } finally {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
    Math.random = random;
    env.journalFake.journal.read = read;
    env.journalFake.journal.profileId = profile;
  }
  assert.equal(operations, 0);
  assert.deepEqual({ rpc: env.cluster.calls.length, wallet: env.walletFake.calls,
    writes: env.journalFake.writes, records: env.journalFake.records(env.binding) }, before);
  ok(await env.client.cancel(env.handle));
});

test('display data and serialization confer no authority; the original handle remains confirmable',
  async () => {
  const project = projector(), env = await fixture(), display = project(env.trade, env.handle);
  for (const copy of [display, structuredClone(display), clone(env.handle)]) {
    error(await env.client.confirm(copy, env.session), 'UNAUTHORIZED');
    error(await env.client.cancel(copy), 'UNAUTHORIZED');
  }
  assert.equal(env.journalFake.records(env.binding)[0].state, 'prepared');
  assert.equal(env.walletFake.calls.sign.length, 0);
  assert.equal(ok(await env.client.confirm(env.handle, env.session)).state, 'sent');
  assert.equal(env.walletFake.calls.sign.length, 1);
  assert.equal(env.cluster.sent.length, 1);
  const signed = splitWire(env.walletFake.calls.sign[0][0].transaction).message;
  assert.equal(encodeBase64(signed), display.transaction.message);
});

test('a cancelled review remains display data without claiming live authority or current chain state',
  async () => {
  const project = projector(), env = await fixture();
  ok(await env.client.cancel(env.handle));
  const display = project(env.trade, env.handle);
  assert.equal(display.validation, 'data-consistency-only');
  assert.equal(display.confirmationAuthority, false);
  assert.equal(display.fundingOutcome, 'not-established');
  error(await env.client.confirm(env.handle, env.session), 'CONFLICT');
  assert.equal(env.walletFake.calls.sign.length, 0);
  assert.equal(env.cluster.sent.length, 0);
});

test('consistent copied bytes and height metadata may display but cannot prove original handle provenance',
  async () => {
  const project = projector(), env = await fixture(), copy = clone(env.handle);
  copy.blockhash = key('supplied-display-blockhash');
  copy.message = encodeBase64(compileLegacyMessage(copy.feePayer, [ok(buildFundNative(env.trade))], copy.blockhash));
  copy.lastValidBlockHeight = '123456';
  const display = project(env.trade, copy);
  assert.equal(display.transaction.blockhash, copy.blockhash);
  assert.equal(display.transaction.lastValidBlockHeight, '123456');
  assert.equal(display.transaction.lastValidBlockHeightEvidence, 'supplied-metadata');
  assert.equal(display.validation, 'data-consistency-only');
  assert.equal(display.confirmationAuthority, false);
  error(await env.client.confirm(copy, env.session), 'UNAUTHORIZED');
  assert.equal(env.journalFake.records(env.binding)[0].message, env.handle.message);
  ok(await env.client.cancel(env.handle));
});

test('same-binding alternate registry pins are supplied trade metadata, not original preparation proof', async () => {
  const project = projector(), env = await fixture();
  const alternate = setupClient('native', { terms: env.terms, registry: makeRegistry({ deployment: {
    artifactSha256: '1'.repeat(64), runtime: { kind: 'solana-program',
      programDataSha256: '2'.repeat(64), upgradeAuthority: null },
  } }) });
  assert.deepEqual(alternate.binding, env.binding);
  const display = project(alternate.trade, env.handle);
  assert.equal(display.deployment.artifactSha256, '1'.repeat(64));
  assert.equal(display.deployment.programDataSha256, '2'.repeat(64));
  assert.equal(display.deployment.evidence, 'supplied-bound-trade');
  assert.equal(display.validation, 'data-consistency-only');
  assert.equal(display.confirmationAuthority, false);
  assert.equal(display.transaction.message, env.handle.message);
  assert.equal(alternate.cluster.calls.length, 0);
  assert.equal(alternate.walletFake.calls.sign.length, 0);
  ok(await env.client.cancel(env.handle));
});
