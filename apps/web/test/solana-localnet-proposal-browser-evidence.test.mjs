import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeBase64url, decodeBase64url } from '../../../packages/schemas/index.ts';
import { parseSolanaLocalnetConfig, solanaLocalnetConfigDocument } from '../src/solana-localnet/config.ts';
import { createSolanaFundingProposalRecord, SOLANA_FUNDING_PROPOSAL_FORMAT,
  SOLANA_FUNDING_PROPOSAL_RECORD_FORMAT } from '../src/solana-localnet/funding-proposal.ts';
import { configOption } from './solana-localnet-support.mjs';
import { connected, setupClient } from '../../../packages/chain-solana/test/lifecycle-support.mjs';
import { createRecoveryDocument } from '../../../packages/chain-solana/src/recovery.ts';
import { ok } from '../../../packages/chain-solana/test/support.mjs';
import * as oracle from '../../../scripts/lib/solana-localnet-send-evidence.mjs';

const PROFILE = '12'.repeat(16), restoredProfile = '34'.repeat(16);
const utf8 = new TextEncoder(), bytes = input => utf8.encode(JSON.stringify(input));
const sha = input => createHash('sha256').update(input).digest('hex');
const reader = () => {
  assert.equal(typeof oracle.readSolanaBrowserVaultRecords, 'function', 'missing proposal-aware browser oracle');
  return oracle.readSolanaBrowserVaultRecords;
};
const inspect = snapshot => reader()(snapshot);
const changed = (record, update) => {
  const body = JSON.parse(new TextDecoder().decode(decodeBase64url(record.payload, 1, 8192)));
  update(body); return { ...record, payload: encodeBase64url(bytes(body)) };
};
async function fixture(t) {
  const env = setupClient(); t.after(() => env.client.dispose());
  const config = await parseSolanaLocalnetConfig(solanaLocalnetConfigDocument(configOption(network => {
    network.genesisHash = network.chainIdentity = env.terms.genesisHash;
    network.deployments[0].address = env.terms.programId;
    network.deployments[0].artifactSha256 = env.trade.deployment.artifactSha256;
    network.deployments[0].runtime.programDataSha256 = env.trade.deployment.runtime.programDataSha256;
  })));
  const proposal = await createSolanaFundingProposalRecord(bytes({ format: SOLANA_FUNDING_PROPOSAL_FORMAT, terms: env.terms }), config, PROFILE);
  const document = ok(createRecoveryDocument(env.trade)), format = 'p2p-offramp/solana-local-recovery/v1';
  const recovery = { id: sha(`${format}\0${document.termsHash}`).slice(0, 32), kind: 'trade', schemaVersion: 1,
    payload: encodeBase64url(bytes({ format, document, role: 'seller', originProfileId: PROFILE })) };
  const prepared = ok(await env.client.prepare(env.trade, await connected(env, 'seller'), 'release'));
  const record = env.journalFake.records(env.binding).find(r => r.intentId === prepared.intentId);
  assert.ok(record, 'fixture has an actual prepared journal record');
  const journalFormat = 'p2p-offramp/solana/vault-journal/v1';
  const journal = { id: sha(JSON.stringify([journalFormat, env.binding.chain, env.binding.networkId,
    env.binding.deploymentId, env.binding.tradeId])).slice(0, 32), kind: 'journal', schemaVersion: 1,
    payload: encodeBase64url(bytes({ format: journalFormat, binding: env.binding, revision: 1, records: [record] })) };
  return { env, proposal, recovery, document, journal, intent: record };
}

test('legacy synchronous oracle continues to verify recovery and journal records and reject proposals', async t => {
  const f = await fixture(t), snapshot = { records: [f.recovery, f.journal] };
  const result = oracle.readSolanaVaultRecords(snapshot);
  assert.equal(result.documents.length, 1); assert.deepEqual(result.documents[0].document, f.document);
  assert.deepEqual(result.intents, [f.intent]);
  assert.throws(() => oracle.readSolanaVaultRecords({ records: [f.proposal.record] }));
});
test('browser oracle validates the exact proposal alongside unchanged recovery and intent evidence', async t => {
  const f = await fixture(t), snapshot = { profileId: PROFILE, records: [f.journal, f.proposal.record, f.recovery] };
  const original = structuredClone(snapshot), result = await inspect(snapshot);
  assert.deepEqual(result.documents, [{ document: f.document, role: 'seller', originProfileId: PROFILE }]);
  assert.deepEqual(result.intents, [f.intent]); assert.deepEqual(result.proposals, [f.proposal]);
  assert.deepEqual(snapshot, original, 'the oracle does not rewrite encrypted-snapshot input');
  assert.equal(result.proposals[0].record.payload, f.proposal.record.payload);
  assert.equal(result.proposals[0].value.binding.tradeId, f.document.termsHash);
});
test('browser oracle rejects malformed proposal wrappers, IDs, terms bindings and original provenance', async t => {
  const inspect = reader(), f = await fixture(t);
  for (const record of [
    { ...f.proposal.record, id: '00'.repeat(16) }, { ...f.proposal.record, schemaVersion: 2 },
    { ...f.proposal.record, extra: true },
    changed(f.proposal.record, value => { value.binding.tradeId = '00'.repeat(32); }),
    changed(f.proposal.record, value => { value.binding.networkId = 'another-local-network'; }),
    changed(f.proposal.record, value => { value.originProfileId = '00'.repeat(16); }),
    changed(f.proposal.record, value => { value.proposal.terms.amountBaseUnits = '01'; }),
    changed(f.proposal.record, value => { value.configuration.rpcUrl = 'https://invalid.example/'; }),
  ]) await assert.rejects(async () => inspect({ records: [f.recovery, record] }));
});
test('browser oracle preserves strict refusal of unknown formats and malformed legacy records', async t => {
  const inspect = reader(), f = await fixture(t);
  for (const record of [
    changed(f.proposal.record, value => { value.format = SOLANA_FUNDING_PROPOSAL_RECORD_FORMAT.replace('/v1', '/v2'); }),
    { ...f.proposal.record, kind: 'journal' },
    { ...f.recovery, id: '00'.repeat(16) }, { ...f.journal, id: '00'.repeat(16) },
    { ...f.recovery, payload: encodeBase64url(bytes({ format: 'unknown-trade-format' })) },
  ]) await assert.rejects(async () => inspect({ records: [f.proposal.record, record] }));
});
test('browser oracle enforces the proposal decoded-byte bound and strict JSON before accepting its family', async t => {
  const inspect = reader(), f = await fixture(t);
  const raw = new TextDecoder().decode(decodeBase64url(f.proposal.record.payload, 1, 8192));
  for (const payload of [utf8.encode(raw.padEnd(8193, ' ')),
    utf8.encode(raw.replace('"format":', `"format":"${SOLANA_FUNDING_PROPOSAL_RECORD_FORMAT}","format":`)),
    Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8.encode(raw)]), new Uint8Array([0xc0, 0xaf]),
  ]) await assert.rejects(async () => inspect({ records: [{ ...f.proposal.record, payload: encodeBase64url(payload) }] }));
});
test('changing the destination profile preserves the original proposal wrapper, payload and origin', async t => {
  const f = await fixture(t), before = await inspect({ profileId: PROFILE, records: [f.proposal.record] });
  const after = await inspect({ profileId: restoredProfile, records: [structuredClone(f.proposal.record)] });
  assert.deepEqual(after, before); assert.equal(after.proposals[0].value.originProfileId, PROFILE);
  assert.equal(after.proposals[0].record.payload, f.proposal.record.payload);
  assert.notEqual(after.proposals[0].value.originProfileId, restoredProfile);
});
test('proposal-aware inspection adds no wallet, send, network, clock or random operation', async t => {
  const f = await fixture(t), original = { fetch: globalThis.fetch, now: Date.now, random: crypto.getRandomValues };
  const calls = { fetch: 0, clock: 0, random: 0 }, connects = f.env.walletFake.calls.connect;
  const signs = f.env.walletFake.calls.sign.length, sends = f.env.cluster.sent.length;
  try {
    globalThis.fetch = () => { calls.fetch++; throw Error('unexpected fetch'); };
    Date.now = () => { calls.clock++; throw Error('unexpected clock'); };
    crypto.getRandomValues = () => { calls.random++; throw Error('unexpected random'); };
    const result = await inspect({ records: [f.proposal.record, f.recovery, f.journal] });
    assert.equal(result.proposals.length, 1);
  } finally { globalThis.fetch = original.fetch; Date.now = original.now; crypto.getRandomValues = original.random; }
  assert.deepEqual(calls, { fetch: 0, clock: 0, random: 0 });
  assert.equal(f.env.walletFake.calls.connect, connects); assert.equal(f.env.walletFake.calls.sign.length, signs);
  assert.equal(f.env.cluster.sent.length, sends);
});
