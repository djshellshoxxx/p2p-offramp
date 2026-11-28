// Localnet-only fixture: production encryption and native journal semantics over an atomic in-memory store.
// This does not replace the browser IndexedDB/Worker gate. No wallet, network or synthetic chain state lives here.
import { webcrypto } from 'node:crypto';
import { EncryptedVaultService } from '../../../packages/storage/src/vault-service.ts';
import { VaultStorageError } from '../../../packages/storage/src/idb-vault-store.ts';
import { decodeBase64url, MAX_PAYLOAD_BYTES } from '../../../packages/schemas/index.ts';
import { SolanaVaultJournal, solanaJournalRecordId, SOLANA_VAULT_JOURNAL_FORMAT_V2 }
  from '../../../packages/chain-solana/src/vaultjournal.ts';

const PASSPHRASE = 'synthetic localnet encrypted journal acceptance passphrase';
const unwrap = (label, result) => {
  if (!result.ok) throw new Error(`${label}: ${result.error.code}`);
  return result.value;
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const actionOrder = (left, right) => left.record.createdAt - right.record.createdAt ||
  (left.record.intentId < right.record.intentId ? -1 : left.record.intentId > right.record.intentId ? 1 : 0);

class MemoryVaultStore {
  rows = new Map();
  writes = 0;
  subscribeInvalidation() { return () => {}; }
  async get(id) { return structuredClone(this.rows.get(id)); }
  async add(row, options) {
    options?.assertCurrent?.();
    if (this.rows.has(row.profileId)) throw new VaultStorageError('ALREADY_EXISTS');
    this.rows.set(row.profileId, structuredClone(row)); this.writes++;
  }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    if (!same(this.rows.get(expected.profileId), expected)) throw new VaultStorageError('CONFLICT');
    // Guard, comparison and replacement run in one synchronous turn; no await can split this CAS.
    this.rows.set(next.profileId, structuredClone(next)); this.writes++;
  }
}

export async function createEncryptedClientJournal() {
  const store = new MemoryVaultStore();
  const vault = new EncryptedVaultService(store, webcrypto, { lifecycle: false });
  try {
    const session = unwrap('create synthetic encrypted vault', await vault.create(PASSPHRASE));
    const journal = new SolanaVaultJournal(vault, session);
    return {
      journal, profileId: session.profileId,
      get writes() { return store.writes; },
      record: binding => vault.read(session.sessionId, solanaJournalRecordId(binding)),
      async reopened(binding) {
        const fresh = unwrap('reopen encrypted vault', await vault.unlock(session.profileId, PASSPHRASE));
        const reader = new SolanaVaultJournal(vault, fresh);
        try { return await reader.read(binding); }
        finally { reader.dispose(); vault.lock(fresh.sessionId); }
      },
      dispose() { journal.dispose(); vault.dispose(); },
    };
  } catch (error) { vault.dispose(); throw error; }
}

/** Nine mandatory checks per flow; inspection, conversion and decrypted readback stay entirely local. */
export async function migrateClientJournal({ client, trade, encrypted, label, measure, must }) {
  const calls = measure(), writes = encrypted.writes;
  const before = unwrap(`${label} inspect v1`, await client.journalState(trade));
  const oldRecord = unwrap(`${label} read v1 private record`, await encrypted.record(trade.binding));
  must(`${label}: nonempty native v1 journal before explicit migration`, before.version === 1 &&
    before.migrationSupported && before.entries.length > 0 && oldRecord?.schemaVersion === 1);
  const review = unwrap(`${label} review migration`, await client.prepareJournalMigration(trade));
  must(`${label}: migration review names the exact revision and compatibility change`,
    review.revision === before.revision && review.recordCount === before.entries.length &&
    review.fromVersion === 1 && review.toVersion === 2 && review.requiresUpgradedReader === true &&
    same(review.binding, trade.binding));
  const after = unwrap(`${label} confirm migration`, await client.confirmJournalMigration(review));
  must(`${label}: migration advances the native high-water mark without retirement`, after.version === 2 &&
    !after.migrationSupported && after.revision === before.revision + before.entries.length + 1 &&
    after.entries.length === before.entries.length);
  must(`${label}: every pre-migration intent field is preserved`,
    same(after.entries.map(entry => entry.record), before.entries.map(entry => entry.record)));
  must(`${label}: every migrated record receives its fresh complete identity`, after.entries.every((entry, index) =>
    entry.identity?.generation === before.revision + index + 1 &&
    entry.identity.originProfileId === entry.record.originProfileId &&
    entry.identity.intentId === entry.record.intentId && same(entry.identity.binding, trade.binding)));
  const newRecord = unwrap(`${label} read v2 private record`, await encrypted.record(trade.binding));
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64url(newRecord.payload, 1, MAX_PAYLOAD_BYTES)));
  must(`${label}: v2 keeps the original private-record locator`, newRecord.id === oldRecord.id &&
    newRecord.id === solanaJournalRecordId(trade.binding) && newRecord.schemaVersion === 2 &&
    payload.format === SOLANA_VAULT_JOURNAL_FORMAT_V2 && payload.revision === after.revision);
  const current = unwrap(`${label} native read`, await encrypted.journal.read(trade.binding));
  const reopened = unwrap(`${label} decrypted readback`, await encrypted.reopened(trade.binding));
  must(`${label}: a fresh decrypt reads the complete committed v2 aggregate`, same(reopened, current));
  must(`${label}: migration commits exactly one encrypted compare-and-swap`, encrypted.writes === writes + 1);
  must(`${label}: migration makes zero wallet or RPC calls`, same(measure(), calls));
  return { before, after };
}

/** Nine mandatory checks; the returned real review is subsequently confirmed against the validator. */
export async function prepareWithCancellationRetirement({ client, trade, session, encrypted, label, measure, must }) {
  const initial = unwrap(`${label} initial journal`, await client.journalState(trade));
  must(`${label}: pressure exercise starts with one finalized fund`, initial.version === 2 &&
    initial.entries.length === 1 && initial.entries[0].record.action === 'fund' &&
    initial.entries[0].record.state === 'finalized');
  const calls = measure(), cancelledIds = new Set();
  for (let index = 0; index < 31; index++) {
    const review = unwrap(`${label} prepare cancellation ${index}`, await client.prepare(trade, session, 'release'));
    unwrap(`${label} cancel ${index}`, await client.cancel(review));
    cancelledIds.add(review.intentId);
  }
  const full = unwrap(`${label} full journal`, await client.journalState(trade));
  const cancellations = full.entries.filter(entry => cancelledIds.has(entry.record.intentId)).sort(actionOrder);
  must(`${label}: 31 real unsigned cancellations fill the 32-record bound`, full.version === 2 &&
    full.entries.length === 32 && cancellations.length === 31 && cancelledIds.size === 31 &&
    cancellations.every(({ record }) => record.state === 'cancelled' && record.signature === null &&
      record.sendMarkedAt === null && record.outcome === null && record.replacementOf === null &&
      record.originProfileId === encrypted.profileId));
  const oldest = cancellations[0], head = cancellations.at(-1), writes = encrypted.writes;
  const review = unwrap(`${label} prepare at capacity`, await client.prepare(trade, session, 'release'));
  const after = unwrap(`${label} admission journal`, await client.journalState(trade));
  must(`${label}: capacity admission replaces one record and advances one revision`, after.version === 2 &&
    after.entries.length === 32 && after.revision === full.revision + 1);
  const retired = full.entries.filter(entry => !after.entries.some(next => next.record.intentId === entry.record.intentId));
  must(`${label}: only the oldest eligible cancellation retires`, retired.length === 1 &&
    retired[0].record.intentId === oldest.record.intentId && oldest.record.intentId !== head.record.intentId);
  must(`${label}: all retained bytes and identities including action heads stay exact`,
    full.entries.filter(entry => entry !== oldest).every(entry =>
      same(after.entries.find(next => next.record.intentId === entry.record.intentId), entry)));
  const prepared = after.entries.find(entry => entry.record.intentId === review.intentId);
  must(`${label}: the admitted review has a fresh durable reservation identity`, prepared?.record.state === 'prepared' &&
    prepared.record.action === 'release' && prepared.record.signature === null && prepared.record.sendMarkedAt === null &&
    prepared.identity?.generation === after.revision && prepared.identity.originProfileId === encrypted.profileId &&
    prepared.identity.intentId === review.intentId && same(prepared.identity.binding, trade.binding));
  must(`${label}: retirement and reservation use one encrypted compare-and-swap`, encrypted.writes === writes + 1);
  const currentCalls = measure();
  must(`${label}: filling and retiring never connect, sign or send`, currentCalls.connects === calls.connects &&
    currentCalls.signs === calls.signs && currentCalls.sends === calls.sends);
  const durable = unwrap(`${label} decrypt admission`, await encrypted.reopened(trade.binding));
  must(`${label}: a fresh decrypt preserves the complete admission`,
    same(durable, unwrap(`${label} native admission`, await encrypted.journal.read(trade.binding))));
  return { review, identity: prepared.identity, retiredIntentId: oldest.record.intentId,
    protectedHeadIntentId: head.record.intentId, revision: after.revision };
}
