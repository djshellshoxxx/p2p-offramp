import assert from 'node:assert/strict';
import { EncryptedVaultService } from '../../../storage/src/vault-service.ts';
import { VaultStorageError } from '../../../storage/src/idb-vault-store.ts';
export const REAL_PASS = 'T59 normal public fixture passphrase', DECOY_PASS = 'T59 decoy independent fixture password';
export const val = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.value; };
export const fail = (r, code) => { assert.equal(r.ok, false, JSON.stringify(r)); if (code) assert.equal(r.error.code, code); assert.doesNotMatch(JSON.stringify(r), /PRIVATE_ERROR|fixture password|https:\/\//); return r.error.code; };
export const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
export const tick = () => new Promise(done => setImmediate(done));
export const FOREIGN = Object.freeze({ id: 'aa'.repeat(16), kind: 'preference', schemaVersion: 9, payload: Buffer.from('foreign future preference').toString('base64url') });
/** Controlled storage interleavings, actual native WebCrypto and actual G02 service. Not IndexedDB/broadcast evidence. */
export class MemoryRows {
  rows = new Map(); writes = 0; beforeWrite; afterWrite; beforeGet;
  async get(id) { await this.beforeGet?.(); return structuredClone(this.rows.get(id)); }
  async add(row, options) {
    await this.beforeWrite?.(); options?.assertCurrent?.(); if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
    if (this.rows.has(row.profileId)) throw new VaultStorageError('ALREADY_EXISTS'); this.rows.set(row.profileId, structuredClone(row)); this.writes++; this.afterWrite?.();
  }
  async compareAndSwap(expected, next, options) {
    await this.beforeWrite?.(); options?.assertCurrent?.(); if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw new VaultStorageError('CONFLICT');
    this.rows.set(next.profileId, structuredClone(next)); this.writes++; this.afterWrite?.();
  }
  subscribeInvalidation() { return () => {}; }
}
export async function setup(t, provider = crypto) {
  const storage = new MemoryRows(), vault = new EncryptedVaultService(storage, provider, { lifecycle: false });
  t.after(() => vault.dispose()); const session = val(await vault.create(REAL_PASS));
  return { storage, vault, session };
}
export const scope = Object.freeze({ chain: 'evm', networkId: 'local-native-31337', account: '0x' + '11'.repeat(20), accountGeneration: 7, policyRevision: 1 });
export const policy = over => ({ ...scope, destination: '0x' + '22'.repeat(20), assets: [{ id: 'ETH', amountCap: '12345678901234567890' }], feeCap: '1000000', expiresAt: 100_000, ...over });
export const consent = Object.freeze({ explainedLimits: true, explicit: true });
export function clock() { const state = { wall: 1000, mono: 0 }; return { state, port: { wall: () => state.wall, monotonic: () => state.mono }, advance(ms) { state.wall += ms; state.mono += ms; } }; }
