import assert from 'node:assert/strict';
import { EncryptedVaultService } from '../../../storage/src/vault-service.ts';
import { VaultStorageError } from '../../../storage/src/idb-vault-store.ts';
import { createOfflineStealth, createEncryptedComparisonStore, ANNOUNCEMENT_TOPIC0 } from '../../index.ts';
export const REF = 'local-erc5564-reference-xy64-v1', SDK = 'local-scopelift-ecdh33-comparison-v1';
export const CONTEXT = Object.freeze({ kind: 'offline-fixture', id: 'stealth-test-v1' });
export const SPEND = '02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9';
export const ANNOUNCER = '0x' + '55'.repeat(20), CALLER = '0x' + '66'.repeat(20), HASH = '0x' + 'ab'.repeat(32);
const printable = r => JSON.stringify(r, (_, v) => typeof v === 'bigint' ? v.toString() : v);
export const val = r => { assert.equal(r.ok, true, printable(r)); return r.value; };
export const fail = (r, code) => { assert.equal(r.ok, false, printable(r)); if (code) assert.equal(r.error.code, code); assert.doesNotMatch(printable(r), /secret error|https:\/\//); return r.error.code; };
export const word = n => BigInt(n).toString(16).padStart(64, '0');
export const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
export const tick = () => new Promise(done => setImmediate(done));
export function logFor(claim) {
  const meta = claim.metadataHex;
  return { address: ANNOUNCER, topics: [ANNOUNCEMENT_TOPIC0, '0x' + word(1), '0x' + '0'.repeat(24) + claim.stealthAddress.slice(2), '0x' + '0'.repeat(24) + CALLER.slice(2)],
    data: '0x' + word(64) + word(160) + word(33) + claim.ephemeralPublicKeyHex + '0'.repeat(62) + word(meta.length / 2) + meta.padEnd(Math.ceil(meta.length / 64) * 64, '0') };
}
export const eventFor = (claim, over = {}) => ({ blockNumber: 1n, blockHash: HASH, transactionHash: '0x' + 'cd'.repeat(32), logIndex: 0n, log: logFor(claim), ...over });
export const requestFor = (over = {}) => ({ profileId: REF, context: CONTEXT, expectedAnnouncer: ANNOUNCER, fromBlock: 1n, toBlock: 1n, anchorHash: HASH, expectedCursor: null, ...over });
export const pageFor = (query, logs, over = {}) => ({ profileId: query.profileId, context: query.context, fromBlock: query.fromBlock, toBlock: query.toBlock, anchorHash: query.anchorHash,
  token: query.token, nextToken: null, complete: true, logs, ...over });
export function nativeFill(fill, work) {
  const original = crypto.getRandomValues, own = Object.getOwnPropertyDescriptor(crypto, 'getRandomValues');
  Object.defineProperty(crypto, 'getRandomValues', { configurable: true, writable: true, value: fill });
  try { return work(); } finally { if (own) Object.defineProperty(crypto, 'getRandomValues', own); else delete crypto.getRandomValues; assert.equal(crypto.getRandomValues, original); }
}
export class Store {
  rows = new Map(); writes = 0; beforeGet; beforeWrite; afterWrite;
  async get(id) { await this.beforeGet?.(); return structuredClone(this.rows.get(id)); }
  async add(row, options) { options?.assertCurrent?.(); if (this.rows.has(row.profileId)) throw new VaultStorageError('ALREADY_EXISTS'); this.rows.set(row.profileId, structuredClone(row)); this.writes++; }
  async compareAndSwap(expected, next, options) {
    await this.beforeWrite?.(); options?.assertCurrent?.(); if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw new VaultStorageError('CONFLICT');
    this.rows.set(next.profileId, structuredClone(next)); this.writes++; this.afterWrite?.();
  }
  subscribeInvalidation() { return () => {}; }
}
export async function setup(t, over = {}) {
  const storage = new Store(), vault = new EncryptedVaultService(storage, crypto, { lifecycle: false }), session = val(await vault.create('Synthetic offline stealth fixture passphrase'));
  const owner = { live: true }, service = val(createOfflineStealth({ profileId: REF, context: CONTEXT, isCurrent: () => owner.live, ...over }));
  const view = val(service.createViewingKey()), uri = val(service.recipientMetaAddress(view, SPEND)).uri, claim = val(service.generateAnnouncement(uri));
  const store = val(createEncryptedComparisonStore({ profileId: REF, context: CONTEXT, viewingPublicKeyHex: view.viewingPublicKeyHex, spendingPublicKeyHex: SPEND,
    vault, session, isCurrent: () => owner.live }));
  t.after(() => { service.close(); store.close(); vault.dispose(); });
  const run = (request = requestFor(), source = { async readOfflinePage(q) { return pageFor(q, [eventFor(claim)]); } }, signal) => service.comparePages(view, SPEND, request, source, store, signal);
  return { storage, vault, session, owner, service, view, uri, claim, store, run };
}
