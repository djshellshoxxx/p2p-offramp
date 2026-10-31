import assert from 'node:assert/strict';
import { createLocalNobleNostrProvider } from '../../nostr-crypto/index.ts';
import { EncryptedVaultService } from '../../storage/index.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { createDurableTradeChat, encodeMessage } from '../index.ts';

export const NOW = 1_800_000_000;
export const PASS = 'synthetic chat history fixture passphrase';
export const binding = Object.freeze({ chain: 'evm', networkId: 'local-evm', deploymentId: 'basic-v1', tradeId: 'ab'.repeat(32) });
export const provider = createLocalNobleNostrProvider();
export const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
export const bad = (result, code) => { assert.equal(result.ok, false); if (code) assert.equal(result.error.code, code); assert.doesNotMatch(JSON.stringify(result), /SECRET|fixture private note/); };
export class Store {
  rows = new Map(); beforeCas; afterCas; writes = 0;
  get = async id => structuredClone(this.rows.get(id));
  add = async (row, options) => { options?.assertCurrent?.(); if (this.rows.has(row.profileId)) throw new VaultStorageError('ALREADY_EXISTS'); this.rows.set(row.profileId, structuredClone(row)); };
  compareAndSwap = async (expected, next, options) => {
    await this.beforeCas?.(expected, next); options?.assertCurrent?.();
    if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw new VaultStorageError('CONFLICT');
    this.rows.set(next.profileId, structuredClone(next)); this.writes++; await this.afterCas?.(expected, next);
  };
  listProfileIds = async () => ({ profileIds: [...this.rows.keys()], truncated: false });
  subscribeInvalidation = () => () => {};
}
export async function setup(extra = {}) {
  const store = new Store(), alice = await provider.generate(), bob = await provider.generate(), outsider = await provider.generate();
  const participants = [alice.publicKey, bob.publicKey];
  const vault = new EncryptedVaultService(store, crypto, { lifecycle: false }), session = ok(await vault.create(PASS));
  const bobVault = new EncryptedVaultService(store, crypto, { lifecycle: false }), bobSession = ok(await bobVault.create(PASS));
  const make = (who = alice, options = {}) => ok(createDurableTradeChat({ vault: who === bob ? bobVault : vault,
    session: who === bob ? bobSession : session, provider, binding, participants,
    selfPublicKey: who.publicKey, now: () => NOW, nowMs: () => 5000, ...extra, ...options }));
  return { store, alice, bob, outsider, participants, vault, session, bobVault, bobSession, make,
    dispose() { vault.dispose(); bobVault.dispose(); for (const key of [alice, bob, outsider]) key.secretKey.fill(0); } };
}
export function envelope(sender, recipient, changes = {}) {
  return ok(encodeMessage({ format: 'p2p-offramp-message', version: 1, binding, termsHash: binding.tradeId,
    messageId: '12'.repeat(16), sender: sender.publicKey, recipient: recipient.publicKey, kind: 'text', createdAt: 100,
    body: 'fixture private note <b>inert</b>', ...changes }));
}
export const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
