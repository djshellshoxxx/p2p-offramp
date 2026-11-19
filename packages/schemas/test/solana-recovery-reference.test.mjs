import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeBase64url, encodeIntentPayload, parseRecoveryReferenceExportBytes, parseRecoveryReferences,
  parseRuntimeMessage, projectRecoveryReferences,
} from '../index.ts';
import { parseSolanaIntent } from '../../chain-solana/src/intent.ts';
import { solanaJournalRecordId, SOLANA_VAULT_JOURNAL_FORMAT } from '../../chain-solana/src/vaultjournal.ts';
import { connected, setupClient } from '../../chain-solana/test/lifecycle-support.mjs';
import { key, ok } from '../../chain-solana/test/support.mjs';

async function nativeRecords(action) {
  const rows = [], env = setupClient('native', {
    journal: { hooks: { after: record => { rows.push(structuredClone(record)); } } },
  });
  try {
    if (action === 'payout') env.cluster.setEscrow({ state: 1 });
    ok(await env.client[action](env.trade, await connected(env, action === 'payout' ? 'buyer' : 'seller')));
    return rows;
  } finally { env.client.dispose(); }
}
const release = await nativeRecords('release'), payout = await nativeRecords('payout');
const intentId = n => encodeBase64url(new Uint8Array(32).fill(n));
function terminal(base, n, updatedAt = base.updatedAt + n) {
  return parseSolanaIntent({ ...structuredClone(base), intentId: intentId(n), state: 'finalized', updatedAt,
    outcome: { slot: '123456', err: null } });
}
function journal(records, options = {}) {
  const list = [...records].sort((a, b) => a.intentId < b.intentId ? -1 : a.intentId > b.intentId ? 1 : 0);
  const binding = list[0]?.binding ?? release[0].binding;
  const data = { format: SOLANA_VAULT_JOURNAL_FORMAT, binding, revision: 100, records: list, ...options };
  return { id: solanaJournalRecordId(binding), kind: 'journal', schemaVersion: 1,
    payload: encodeBase64url(new TextEncoder().encode(JSON.stringify(data))) };
}
const projection = record => projectRecoveryReferences([record], 0, 7);
const raw = record => JSON.parse(Buffer.from(record.payload, 'base64url'));
const changed = (record, mutate) => {
  const copy = raw(record); mutate(copy);
  return { ...record, payload: encodeBase64url(new TextEncoder().encode(JSON.stringify(copy))) };
};

test('native pre-marker signature remains the current unverified hint ahead of a later terminal label', () => {
  const signed = release.find(record => record.state === 'signed');
  const record = journal([signed, terminal(release.at(-1), 2, signed.updatedAt + 10_000)]);
  const before = JSON.stringify(record), page = projection(record);
  assert.equal(page.unsupported, 0); assert.equal(page.items.length, 1);
  assert.equal(page.authority, 'unverified-offline-reference');
  assert.deepEqual(page.items[0], { recordId: record.id, intentId: signed.intentId, binding: signed.binding,
    account: signed.feePayer, action: 'release', storedState: 'signed', chainReference: signed.signature, nonce: null });
  assert.equal(JSON.stringify(record), before, 'the complete native payload remains byte-for-byte unchanged');
  assert.doesNotMatch(JSON.stringify(page), /message|outcome|sendMarkedAt|originProfileId|blockhash|programData/);
  assert.equal(Object.isFrozen(page.items[0].binding), true);
});

test('native terminal payout keeps its actual action/state and latest tie-break is deterministic', () => {
  const first = terminal(release.at(-1), 1, 5000), second = terminal(payout.at(-1), 2, 5000);
  const record = journal([second, first]), page = projection(record);
  assert.equal(page.unsupported, 0); assert.equal(page.items.length, 1);
  const selected = [first, second].sort((a, b) => a.intentId < b.intentId ? -1 : 1).at(-1);
  assert.equal(page.items[0].intentId, selected.intentId);
  assert.equal(page.items[0].action, selected.action);
  assert.equal(page.items[0].storedState, 'finalized');
  assert.equal(page.items[0].chainReference, selected.signature);
  const exportValue = { format: 'p2p-offramp/offline-recovery-references/v1',
    authority: 'unverified-offline-reference', localSnapshotRevision: 7, items: page.items };
  assert.deepEqual(parseRecoveryReferenceExportBytes(new TextEncoder().encode(JSON.stringify(exportValue))), exportValue);
  assert.deepEqual(parseRuntimeMessage({ version: 1, requestId: 1, generation: 0, operation: 'listRecoveryReferences',
    kind: 'response', result: { ok: true, value: page } }).result.value, page);
});

test('all native stored states project literally, with prepared references null and payout supported', () => {
  const signed = release[1], marked = release[2], sent = release[3];
  const cases = [...release,
    { ...marked, state: 'unknown' }, terminal(sent, 3),
    { ...sent, state: 'failed', outcome: { slot: '123456', err: 'InstructionError:0:Custom:6016' } },
    { ...sent, state: 'dropped' }, { ...signed, state: 'cancelled' }, ...payout];
  for (const candidate of cases) {
    const parsed = parseSolanaIntent(candidate), page = projection(journal([parsed]));
    assert.equal(page.unsupported, 0, candidate.state);
    assert.equal(page.items[0].storedState, parsed.state);
    assert.equal(page.items[0].action, parsed.action);
    assert.equal(page.items[0].chainReference, parsed.signature);
  }
});

test('native future, malformed and mismatched payloads stay opaque and cannot hide competing open intents', () => {
  const record = journal([release[1]]);
  const cases = [
    { ...record, schemaVersion: 2 },
    changed(record, data => { data.format = 'p2p-offramp/solana/vault-journal/v2'; }),
    changed(record, data => { data.binding.networkId = 'different'; }),
    changed(record, data => { data.records[0].binding.tradeId = 'f'.repeat(64); }),
    changed(record, data => { data.records[0].feePayer = key('different-account'); }),
    changed(record, data => { data.records[0].feePayer = 'not-a-wallet'; }),
    changed(record, data => { data.records[0].action = 'approve'; }),
    changed(record, data => { data.records[0].role = 'buyer'; }),
    changed(record, data => { data.records[0].expectedEscrowState = 'released'; }),
    changed(record, data => { data.records[0].state = 'verified'; }),
    changed(record, data => { data.records[0].signature = 'https://foreign.invalid'; }),
    changed(record, data => { data.records[0].signature = '1'.repeat(88); }),
    changed(record, data => { data.records[0].state = 'sent'; }),
    changed(record, data => { data.records[0].extra = true; }),
    changed(record, data => { data.records = []; }),
    changed(record, data => { data.records = Array(33).fill(data.records[0]); }),
    changed(record, data => { data.records.push(data.records[0]); }),
    changed(record, data => { data.records.push({ ...data.records[0], intentId: intentId(7) }); }),
    changed(record, data => { data.revision = 0; }),
    changed(record, data => { data.records[0].message = 'A'.repeat(1648); }),
    { ...record, payload: encodeBase64url(new Uint8Array(262145)) },
  ];
  for (const candidate of cases) {
    const before = JSON.stringify(candidate), page = projection(candidate);
    assert.equal(page.unsupported, 1); assert.equal(page.items.length, 0);
    assert.equal(JSON.stringify(candidate), before);
  }
  const duplicateKey = JSON.stringify(raw(record)).replace('"revision":', '"revision":100,"revision":');
  assert.equal(projection({ ...record,
    payload: encodeBase64url(new TextEncoder().encode(duplicateKey)) }).unsupported, 1);
});

test('native and legacy records share unchanged bounded raw-record pagination', () => {
  const native = journal(Array.from({ length: 32 }, (_, i) => terminal(release[3], i + 1)));
  const legacy = n => ({ id: n.toString(16).padStart(32, '0'), kind: 'journal', schemaVersion: 1,
    payload: encodeIntentPayload({ version: 1, intentId: intentId(n), binding: { chain: 'evm', networkId: 'evm:1',
      deploymentId: 'escrow', tradeId: `trade-${n}` }, account: '0x' + '12'.repeat(20), action: 'fund',
    state: 'finalized', walletGeneration: 0, expectedEscrowState: 'absent', preparedRequest: 'PRIVATE_CALLDATA',
    submission: { chain: 'evm', hash: null, nonce: '1' }, replacementOf: null, createdAt: 0, updatedAt: 0 }) });
  const records = [native, ...Array.from({ length: 64 }, (_, i) => legacy(i + 1))];
  const first = projectRecoveryReferences(records, 0, 7), second = projectRecoveryReferences(records, 64, 7);
  assert.equal(first.items.length, 64); assert.equal(first.unsupported, 0); assert.equal(first.nextOffset, 64);
  assert.equal(first.totalJournalRecords, 65); assert.equal(second.items.length, 1); assert.equal(second.nextOffset, null);
});

test('Solana-only labels cannot widen EVM recovery authority or the scalar response shape', () => {
  const page = projection(journal([payout[1]])), item = page.items[0];
  assert.ok(item, 'native payout must produce a current reference');
  for (const patch of [{ authority: 'verified' }, { items: [{ ...item, storedState: 'paid' }] },
    { items: [{ ...item, action: 'payout', binding: { ...item.binding, chain: 'evm' }, account: '0x' + '12'.repeat(20),
      chainReference: null }] }, { items: [{ ...item, message: release[0].message }] }]) {
    assert.throws(() => parseRecoveryReferences({ ...page, ...patch }));
  }
});
