import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeBase64url, encodeIntentPayload, parseRecoveryReferenceExportBytes, parseRuntimeMessage, projectRecoveryReferences,
} from '../index.ts';
import { EncryptedBackupService } from '../../storage/src/backup-service.ts';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { SolanaVaultJournal, solanaJournalRecordId, SOLANA_VAULT_JOURNAL_FORMAT } from '../../chain-solana/src/vaultjournal.ts';
import { connected, setupClient } from '../../chain-solana/test/lifecycle-support.mjs';
import { ok } from '../../chain-solana/test/support.mjs';

const PASS = 'synthetic v2 recovery projection passphrase';
const RESTORED_PASS = 'synthetic restored v2 recovery projection passphrase';
const id = n => encodeBase64url(new Uint8Array(32).fill(n));
const byId = (a, b) => a.intentId < b.intentId ? -1 : a.intentId > b.intentId ? 1 : 0;
class Store {
  rows = new Map(); writes = 0;
  subscribeInvalidation() { return () => {}; }
  async get(key) { return structuredClone(this.rows.get(key)); }
  async add(row, options) {
    options?.assertCurrent?.();
    if (this.rows.has(row.profileId)) throw new VaultStorageError('ALREADY_EXISTS');
    this.rows.set(row.profileId, structuredClone(row)); this.writes++;
  }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw new VaultStorageError('CONFLICT');
    this.rows.set(next.profileId, structuredClone(next)); this.writes++;
  }
}
const rows = [], fixture = setupClient('native', {
  journal: { hooks: { after: record => rows.push(structuredClone(record)) } },
});
try { ok(await fixture.client.release(fixture.trade, await connected(fixture, 'seller'))); }
finally { fixture.client.dispose(); }
const binding = fixture.binding;

async function setup(t) {
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
  const session = ok(await vault.create(PASS)), journal = new SolanaVaultJournal(vault, session);
  t.after(() => { journal.dispose(); vault.dispose(); });
  return { store, vault, session, journal };
}
const privateRecord = (s, session = s.session) => s.vault.read(session.sessionId, solanaJournalRecordId(binding)).then(ok);
const raw = record => JSON.parse(Buffer.from(record.payload, 'base64url'));
const wrap = data => ({ id: solanaJournalRecordId(binding), kind: 'journal', schemaVersion: 2,
  payload: encodeBase64url(new TextEncoder().encode(JSON.stringify(data))) });
const changed = (record, mutate) => { const data = raw(record); mutate(data); return { ...record, payload: wrap(data).payload }; };
const project = (record, revision = 7) => projectRecoveryReferences([record], 0, revision);
const local = (s, record) => ({ ...structuredClone(record), originProfileId: s.session.profileId });
async function seed(s, records, revision = records.length) {
  ok(await s.vault.commit(s.session.sessionId, 0, [{ op: 'put', record: {
    ...wrap({ format: SOLANA_VAULT_JOURNAL_FORMAT, binding, revision, records: [...records].sort(byId) }), schemaVersion: 1,
  } }]));
}
function assertPrivateProjection(page, fullRecord) {
  assert.equal(page.authority, 'unverified-offline-reference');
  assert.doesNotMatch(JSON.stringify(page), /generation|replaces|originProfileId|sendMarkedAt|outcome|message|blockhash|programData/);
  assert.ok(!JSON.stringify(page).includes(fullRecord.payload));
  const exported = { format: 'p2p-offramp/offline-recovery-references/v1', authority: page.authority,
    localSnapshotRevision: page.revision, items: page.items };
  assert.deepEqual(parseRecoveryReferenceExportBytes(new TextEncoder().encode(JSON.stringify(exported))), exported);
  assert.deepEqual(parseRuntimeMessage({ version: 1, requestId: 1, generation: 0, operation: 'listRecoveryReferences',
    kind: 'response', result: { ok: true, value: page } }).result.value, page);
}

for (const state of ['signed', 'sendMarked', 'unknown']) {
  test(`native migration preserves the ${state} recovery hint through encrypted fresh-key restore`, async t => {
    const s = await setup(t);
    let revision = 0;
    const steps = state === 'signed' ? rows.slice(0, 2) : rows.slice(0, 3);
    for (const record of steps) revision = ok(await s.journal.write(binding, revision, local(s, record)));
    if (state === 'unknown') revision = ok(await s.journal.write(binding, revision,
      { ...local(s, rows[2]), state: 'unknown', updatedAt: rows[2].updatedAt + 1 }));
    const before = await privateRecord(s), baseline = project(before);
    const migrated = ok(await s.journal.migrate(binding, revision)), after = await privateRecord(s);
    assert.equal(after.schemaVersion, 2); assert.equal(after.id, before.id);
    assert.deepEqual(migrated.entries.map(entry => entry.intent), raw(before).records);
    const writes = s.store.writes, rpcCalls = fixture.cluster.calls.length;
    const page = project(after);
    assert.deepEqual(page, baseline); assert.equal(page.items[0].storedState, state);
    assert.equal(page.unsupported, 0); assert.equal(page.items.length, 1);
    assertPrivateProjection(page, after);
    assert.deepEqual(await privateRecord(s), after); assert.equal(s.store.writes, writes);
    assert.equal(fixture.cluster.calls.length, rpcCalls);

    const backup = new EncryptedBackupService(s.store, crypto); t.after(() => backup.dispose());
    const receipt = await backup.restore(await backup.export(s.session.profileId), PASS, RESTORED_PASS);
    const restored = ok(await s.vault.unlock(receipt.newProfileId, RESTORED_PASS));
    assert.notEqual(restored.profileId, s.session.profileId); assert.equal(restored.revision, 0);
    const restoredRecord = await privateRecord(s, restored), afterRestoreWrites = s.store.writes;
    assert.deepEqual(restoredRecord, after);
    const restoredPage = project(restoredRecord, 0);
    assert.deepEqual(restoredPage.items, page.items); assert.equal(restoredPage.unsupported, 0);
    assertPrivateProjection(restoredPage, restoredRecord);
    const nativeReader = new SolanaVaultJournal(s.vault, restored); t.after(() => nativeReader.dispose());
    assert.deepEqual(ok(await nativeReader.read(binding)), migrated);
    assert.equal(s.store.writes, afterRestoreWrites); assert.equal(fixture.cluster.calls.length, rpcCalls);
  });
}

async function migratedReferences(t) {
  const s = await setup(t), ids = [id(3), id(10)].sort();
  const predecessor = { ...local(s, rows[0]), intentId: ids[1], state: 'dropped', originProfileId: 'b'.repeat(32),
    createdAt: 100, updatedAt: 100 };
  const successor = { ...local(s, rows[0]), intentId: ids[0], state: 'cancelled', replacementOf: ids[1],
    createdAt: 100, updatedAt: 100 };
  await seed(s, [predecessor, successor], 8);
  const before = await privateRecord(s);
  ok(await s.journal.migrate(binding, 8));
  return { s, before, record: await privateRecord(s) };
}

test('v2 predecessor references preserve original provenance and need not follow generation order', async t => {
  const { s, before, record } = await migratedReferences(t), data = raw(record), writes = s.store.writes;
  assert.ok(data.entries[0].generation < data.entries[0].replaces.generation);
  assert.notEqual(data.entries[0].intent.originProfileId, data.entries[0].replaces.originProfileId);
  assert.deepEqual(project(record), project(before));
  assert.equal(project(record).items[0].intentId, data.entries[1].intent.intentId, 'the existing update/id tie comparator remains');
  assertPrivateProjection(project(record), record);
  assert.deepEqual(await privateRecord(s), record); assert.equal(s.store.writes, writes);
});

test('v2 wrappers, generations, bindings and predecessor graphs must all be valid before projection', async t => {
  const { s, record } = await migratedReferences(t);
  const cases = [
    ['outer/inner version mismatch', { ...record, schemaVersion: 1 }],
    ['future outer version', { ...record, schemaVersion: 3 }],
    ['future native format', changed(record, data => { data.format = 'p2p-offramp/solana/vault-journal/v3'; })],
    ['v1 fields under v2', changed(record, data => { data.records = data.entries.map(entry => entry.intent); delete data.entries; })],
    ['extra wrapper field', changed(record, data => { data.entries[0].extra = true; })],
    ['missing generation', changed(record, data => { delete data.entries[0].generation; })],
    ['zero generation', changed(record, data => { data.entries[0].generation = 0; })],
    ['negative generation', changed(record, data => { data.entries[0].generation = -1; })],
    ['fractional generation', changed(record, data => { data.entries[0].generation = 1.5; })],
    ['unsafe generation', changed(record, data => { data.entries[0].generation = Number.MAX_SAFE_INTEGER + 1; })],
    ['generation exceeds revision', changed(record, data => { data.entries[0].generation = data.revision + 1; })],
    ['duplicate generation', changed(record, data => { data.entries[0].generation = data.entries[1].generation; })],
    ['zero revision', changed(record, data => { data.revision = 0; })],
    ['foreign binding', changed(record, data => { data.entries[0].intent.binding.tradeId = 'f'.repeat(64); })],
    ['invalid intent structure', changed(record, data => { data.entries[0].intent.message = 'invalid'; })],
    ['missing predecessor reference', changed(record, data => { data.entries[0].replaces = null; })],
    ['reference without legacy link', changed(record, data => { data.entries[0].intent.replacementOf = null; })],
    ['reference generation mismatch', changed(record, data => { data.entries[0].replaces.generation = data.revision; })],
    ['reference profile mismatch', changed(record, data => { data.entries[0].replaces.originProfileId = 'c'.repeat(32); })],
    ['reference id mismatch', changed(record, data => { data.entries[0].replaces.intentId = id(201); })],
    ['extra reference field', changed(record, data => { data.entries[0].replaces.extra = true; })],
    ['predecessor not dropped', changed(record, data => { data.entries[1].intent.state = 'cancelled'; })],
    ['different replacement action', changed(record, data => { data.entries[0].intent.action = 'refund'; })],
    ['duplicate intent', changed(record, data => { data.entries[1].intent.intentId = data.entries[0].intent.intentId; })],
    ['unsorted entries', changed(record, data => { data.entries.reverse(); })],
    ['too many entries', changed(record, data => { data.entries = Array(33).fill(data.entries[0]); })],
    ['oversized payload', { ...record, payload: encodeBase64url(new Uint8Array(262145)) }],
  ];
  cases.push(['competing successors', changed(record, data => {
    data.entries.push({ ...structuredClone(data.entries[0]), generation: data.revision,
      intent: { ...structuredClone(data.entries[0].intent), intentId: id(202) } });
    data.entries.sort((a, b) => byId(a.intent, b.intent));
  })]);
  cases.push(['cyclic references', changed(record, data => {
    const [first, second] = data.entries; first.intent.state = 'dropped';
    second.intent.replacementOf = first.intent.intentId;
    second.replaces = { generation: first.generation, intentId: first.intent.intentId,
      originProfileId: first.intent.originProfileId };
  })]);
  cases.push(['competing open intents', changed(record, data => {
    for (const entry of data.entries) {
      entry.intent.state = 'prepared'; entry.intent.replacementOf = null; entry.replaces = null;
    }
  })]);
  const writes = s.store.writes;
  for (const [label, candidate] of cases) {
    const before = JSON.stringify(candidate), page = project(candidate);
    assert.equal(page.totalJournalRecords, 1, label); assert.equal(page.unsupported, 1, label);
    assert.equal(page.items.length, 0, label); assert.equal(JSON.stringify(candidate), before, label);
  }
  assert.deepEqual(await privateRecord(s), record); assert.equal(s.store.writes, writes);
});

test('v2 open signature takes precedence over later terminal updates', async t => {
  const s = await setup(t), signed = { ...local(s, rows[1]), intentId: id(41) };
  const terminal = { ...local(s, rows[3]), intentId: id(42), state: 'finalized',
    updatedAt: signed.updatedAt + 10000, outcome: { slot: '123456', err: null } };
  await seed(s, [signed, terminal], 10);
  const before = await privateRecord(s); ok(await s.journal.migrate(binding, 10));
  const record = await privateRecord(s), page = project(record);
  assert.deepEqual(page, project(before)); assert.equal(page.items[0].intentId, signed.intentId);
  assert.equal(page.items[0].storedState, 'signed'); assert.equal(page.items[0].chainReference, signed.signature);
  assertPrivateProjection(page, record);
});

test('v2 terminal payout remains a scalar unverified payout reference', async t => {
  const payoutRows = [], env = setupClient('native', {
    journal: { hooks: { after: record => payoutRows.push(structuredClone(record)) } },
  });
  t.after(() => env.client.dispose()); env.cluster.setEscrow({ state: 1 });
  ok(await env.client.payout(env.trade, await connected(env, 'buyer')));
  assert.deepEqual(env.binding, binding);
  const s = await setup(t), payout = { ...local(s, payoutRows.at(-1)), state: 'finalized',
    outcome: { slot: '123456', err: null } };
  await seed(s, [payout]);
  const before = await privateRecord(s); ok(await s.journal.migrate(binding, 1));
  const record = await privateRecord(s), page = project(record);
  assert.deepEqual(page, project(before)); assert.equal(page.items[0].action, 'payout');
  assert.equal(page.items[0].storedState, 'finalized'); assert.equal(page.items[0].chainReference, payout.signature);
  assertPrivateProjection(page, record);
});

test('one full v2 aggregate occupies one unchanged pagination slot among legacy records', async t => {
  const s = await setup(t);
  await seed(s, Array.from({ length: 32 }, (_, n) => ({ ...local(s, rows[0]), intentId: id(n + 1), state: 'cancelled' })));
  ok(await s.journal.migrate(binding, 32));
  const native = await privateRecord(s);
  const legacy = n => ({ id: n.toString(16).padStart(32, '0'), kind: 'journal', schemaVersion: 1,
    payload: encodeIntentPayload({ version: 1, intentId: id(n), binding: { chain: 'evm', networkId: 'evm:1',
      deploymentId: 'escrow', tradeId: `trade-${n}` }, account: '0x' + '12'.repeat(20), action: 'fund',
    state: 'finalized', walletGeneration: 0, expectedEscrowState: 'absent', preparedRequest: 'PRIVATE_CALLDATA',
    submission: { chain: 'evm', hash: null, nonce: '1' }, replacementOf: null, createdAt: 0, updatedAt: 0 }) });
  const records = [native, ...Array.from({ length: 64 }, (_, n) => legacy(n + 1))], before = JSON.stringify(records);
  const first = projectRecoveryReferences(records, 0, 7), second = projectRecoveryReferences(records, 64, 7);
  assert.equal(first.totalJournalRecords, 65); assert.equal(first.items.length, 64); assert.equal(first.unsupported, 0);
  assert.equal(first.items[0].recordId, native.id); assert.equal(first.nextOffset, 64);
  assert.equal(second.items.length, 1); assert.equal(second.nextOffset, null);
  assert.equal(JSON.stringify(records), before);
  const unsupportedLegacy = project({ ...legacy(1), schemaVersion: 2 });
  assert.equal(unsupportedLegacy.unsupported, 1); assert.equal(unsupportedLegacy.items.length, 0);
});

test('an explicitly migrated empty journal has no invented hint and retains complete accounting', async t => {
  const s = await setup(t); ok(await s.journal.migrate(binding, 0));
  const record = await privateRecord(s), writes = s.store.writes, page = project(record);
  assert.deepEqual(page, { authority: 'unverified-offline-reference', revision: 7, offset: 0, nextOffset: null,
    totalJournalRecords: 1, unsupported: 1, items: [] });
  assert.deepEqual(await privateRecord(s), record); assert.equal(s.store.writes, writes);
});
