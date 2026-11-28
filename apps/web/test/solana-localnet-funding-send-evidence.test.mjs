import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBase64url, decodeBase64url } from '../../../packages/schemas/index.ts';
import { parseSolanaLocalnetConfig, solanaLocalnetConfigDocument } from '../src/solana-localnet/config.ts';
import { createSolanaFundingProposalRecord, SOLANA_FUNDING_PROPOSAL_FORMAT } from '../src/solana-localnet/funding-proposal.ts';
import { configOption } from './solana-localnet-support.mjs';
import { connected, setupClient } from '../../../packages/chain-solana/test/lifecycle-support.mjs';
import { ok, key } from '../../../packages/chain-solana/test/support.mjs';
import * as oracle from '../../../scripts/lib/solana-localnet-send-evidence.mjs';

const originalProfile = '12'.repeat(16), bytes = value => new TextEncoder().encode(JSON.stringify(value));
const fundingOracle = () => {
  assert.equal(typeof oracle.assertSolanaFundingSendMarked, 'function', 'missing fixed funding physical-send verifier');
  return oracle.assertSolanaFundingSendMarked;
};
async function fixture(t) {
  const env = setupClient('native', { clusterOptions: { absent: true } }); t.after(() => env.client.dispose());
  const config = await parseSolanaLocalnetConfig(solanaLocalnetConfigDocument(configOption(network => {
    network.genesisHash = network.chainIdentity = env.terms.genesisHash;
    network.deployments[0].address = env.terms.programId;
    network.deployments[0].artifactSha256 = env.trade.deployment.artifactSha256;
    network.deployments[0].runtime.programDataSha256 = env.trade.deployment.runtime.programDataSha256;
  })));
  const proposal = await createSolanaFundingProposalRecord(bytes({ format: SOLANA_FUNDING_PROPOSAL_FORMAT, terms: env.terms }), config, originalProfile);
  let marker, wire;
  env.cluster.handle = input => {
    if (input.method === 'sendTransaction') {
      wire = input.params[0]; marker = structuredClone(env.journalFake.records(env.binding)[0]);
    }
  };
  const wallet = await connected(env, 'seller'), prepared = ok(await env.client.prepareFunding(env.trade, wallet));
  const submission = ok(await env.client.confirm(prepared, wallet));
  assert.equal(submission.state, 'sent'); assert.equal(marker.state, 'sendMarked');
  const profileId = env.journalFake.journal.profileId();
  const pins = { genesisHash: env.terms.genesisHash, programId: env.terms.programId,
    programDataSha256: env.trade.deployment.runtime.programDataSha256 };
  return { env, config, proposal, marker, wire, profileId, pins };
}
const changedRecord = (record, update) => {
  const value = JSON.parse(new TextDecoder().decode(decodeBase64url(record.payload, 1, 8192)));
  update(value); return { ...record, payload: encodeBase64url(bytes(value)) };
};
const prove = (fn, f, options = {}) => fn(options.intents ?? [f.marker], options.proposals ?? [f.proposal],
  options.wire ?? f.wire, options.profileId ?? f.profileId, options.pins ?? f.pins,
  options.config ?? f.config, options.seen ?? new Set());

test('legacy exit-only oracle still refuses a real prepared-and-confirmed funding marker', async t => {
  const f = await fixture(t);
  assert.throws(() => oracle.assertSolanaSendMarked([f.marker], f.wire, f.profileId, f.pins, new Set()), /browser never funds/);
});
test('fixed funding oracle verifies one actual client marker, saved proposal, full binding and exact wire', async t => {
  const fn = fundingOracle(), f = await fixture(t), seen = new Set(), before = structuredClone(f.proposal);
  const proof = await prove(fn, f, { seen });
  assert.equal(proof.action, 'fund'); assert.equal(proof.intentId, f.marker.intentId);
  assert.equal(proof.signature, f.marker.signature); assert.equal(proof.durableState, 'sendMarked');
  assert.equal(proof.proposalId, f.proposal.record.id); assert.equal(proof.tradeId, f.env.binding.tradeId);
  assert.equal(proof.profileId, f.profileId); assert.equal(proof.proposalOriginProfileId, originalProfile);
  assert.deepEqual(f.proposal, before); assert.equal(seen.size, 1);
  await assert.rejects(() => prove(fn, f, { seen }), /physical/);
});
test('funding proof preserves restored proposal origin while requiring current-profile physical-send origin', async t => {
  const fn = fundingOracle(), f = await fixture(t);
  assert.notEqual(f.profileId, originalProfile);
  const proof = await prove(fn, f);
  assert.equal(proof.originProfileId, f.profileId); assert.equal(proof.proposalOriginProfileId, originalProfile);
  await assert.rejects(() => prove(fn, f, { profileId: originalProfile }));
});
test('funding proof requires exactly one independently decoded saved proposal for the full binding', async t => {
  const fn = fundingOracle(), f = await fixture(t);
  for (const proposals of [[], [f.proposal, f.proposal], [{ ...f.proposal, record: { ...f.proposal.record, id: '00'.repeat(16) } }],
    [{ ...f.proposal, record: { ...f.proposal.record, schemaVersion: 2 } }],
    [{ ...f.proposal, record: changedRecord(f.proposal.record, p => { p.binding.networkId = 'another-local-network'; }) }],
    [{ ...f.proposal, record: changedRecord(f.proposal.record, p => { p.binding.deploymentId = 'another-deployment'; }) }],
  ]) await assert.rejects(() => prove(fn, f, { proposals }));
});
test('cached proposal display data cannot substitute for decoding the retained private payload', async t => {
  const fn = fundingOracle(), f = await fixture(t);
  const record = changedRecord(f.proposal.record, p => { p.proposal.terms.amountBaseUnits = '01'; });
  await assert.rejects(() => prove(fn, f, { proposals: [{ record, value: f.proposal.value }] }));
  const proof = await prove(fn, f, { proposals: [{ record: f.proposal.record, value: null }] });
  assert.equal(proof.proposalId, f.proposal.record.id, 'only independently decoded private bytes establish the saved proposal');
});
test('funding proof refuses every installed-provenance mismatch before recording the physical signature', async t => {
  const fn = fundingOracle(), f = await fixture(t), seen = new Set();
  for (const change of [
    { registrySha256: 'ef'.repeat(32) }, { programDataSha256: 'ef'.repeat(32) }, { artifactSha256: 'ef'.repeat(32) },
    { assetId: 'another-asset' }, { rpcUrl: 'http://127.0.0.1:18888/' },
    { margins: { ...f.config.margins, submitMarginSeconds: '301' } },
    { margins: { ...f.config.margins, releaseMarginSeconds: '301' } },
  ]) {
    const record = changedRecord(f.proposal.record, p => { Object.assign(p.configuration, change); });
    await assert.rejects(() => prove(fn, f, { proposals: [{ record }], seen }));
    assert.equal(seen.size, 0);
  }
  await prove(fn, f, { seen }); assert.equal(seen.size, 1);
});
test('funding proof binds native recipe bytes to all canonical saved terms even with a valid role signature', async t => {
  const fn = fundingOracle(), f = await fixture(t);
  for (const change of [
    { amountBaseUnits: String(BigInt(f.env.terms.amountBaseUnits) + 1n) }, { privateAgreementHash: 'ef'.repeat(32) },
    { acceptBeforeSeconds: String(BigInt(f.env.terms.acceptBeforeSeconds) + 1n) },
    { escrowExpirySeconds: String(BigInt(f.env.terms.escrowExpirySeconds) + 1n) },
  ]) {
    const proposal = await createSolanaFundingProposalRecord(bytes({ format: SOLANA_FUNDING_PROPOSAL_FORMAT,
      terms: { ...f.env.terms, ...change } }), f.config, originalProfile);
    const marker = { ...f.marker, binding: proposal.value.binding };
    await assert.rejects(() => prove(fn, f, { intents: [marker], proposals: [proposal] }));
  }
});
test('funding proof refuses wrong marker state, action, role, expectation, binding, escrow and pins', async t => {
  const fn = fundingOracle(), f = await fixture(t);
  for (const change of [
    { state: 'signed', sendMarkedAt: null }, { state: 'sent' }, { state: 'unknown' }, { action: 'release', expectedEscrowState: 'funded' },
    { role: 'buyer' }, { expectedEscrowState: 'funded' }, { escrow: key('wrong-escrow') },
    { binding: { ...f.marker.binding, networkId: 'other-network' } },
    { binding: { ...f.marker.binding, deploymentId: 'other-deployment' } },
    { genesisHash: key('wrong-genesis') }, { programId: key('wrong-program') }, { programDataSha256: 'ef'.repeat(32) },
    { originProfileId: originalProfile }, { sendMarkedAt: f.marker.updatedAt + 1 },
  ]) await assert.rejects(() => prove(fn, f, { intents: [{ ...f.marker, ...change }] }));
  await assert.rejects(() => prove(fn, f, { intents: [f.marker, f.marker] }));
});
test('funding proof independently refuses changed signatures, wire messages and noncanonical encodings', async t => {
  const fn = fundingOracle(), f = await fixture(t), signature = Buffer.from(f.wire, 'base64'), message = Buffer.from(f.wire, 'base64');
  signature[1] ^= 1; message[message.length - 1] ^= 1;
  for (const wire of [signature.toString('base64'), message.toString('base64'), `${f.wire}\n`, 'A'.repeat(1648), 'AAAA']) {
    const seen = new Set(); await assert.rejects(() => prove(fn, f, { wire, seen })); assert.equal(seen.size, 0);
  }
});
