import assert from 'node:assert/strict';
import { SolanaRecoveryController } from '../src/solana-localnet/controller.ts';
import { parseSolanaLocalnetConfig, solanaLocalnetConfigDocument } from '../src/solana-localnet/config.ts';
import { SOLANA_FUNDING_PROPOSAL_FORMAT as FORMAT } from '../src/solana-localnet/funding-proposal.ts';
import { EncryptedVaultService } from '../../../packages/storage/index.ts';
import { openEnvelope, disposeMaterial } from '../../../packages/storage/src/vault-crypto.ts';
import { VaultStorageError } from '../../../packages/storage/src/idb-vault-store.ts';
import { createRecoveryDocument } from '../../../packages/chain-solana/src/recovery.ts';
import { setupClient } from '../../../packages/chain-solana/test/lifecycle-support.mjs';
import { shaHex } from '../../../packages/chain-solana/test/support.mjs';
import { configOption } from './solana-localnet-support.mjs';

const PASS = 'synthetic proposal admission profile passphrase', DEST = 'synthetic restored proposal passphrase';
const utf8 = new TextEncoder();
const success = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result; };
const value = result => success(result).value;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function store() {
  const rows = new Map();
  return { rows, writes: 0, conflict: false, before: null,
    async get(id) { return structuredClone(rows.get(id)); },
    async add(row, options) { options?.assertCurrent?.(); assert.equal(rows.has(row.profileId), false); rows.set(row.profileId, structuredClone(row)); },
    async compareAndSwap(before, after, options) {
      await this.before?.(); options?.assertCurrent?.();
      if (this.conflict || JSON.stringify(rows.get(before.profileId)) !== JSON.stringify(before)) throw new VaultStorageError('CONFLICT');
      rows.set(after.profileId, structuredClone(after)); this.writes++;
    },
    async addWithSource(before, after, options) { assert.deepEqual(rows.get(before.profileId), before); await this.add(after, options); },
    async listProfileIds() { return { profileIds: [...rows.keys()].sort(), truncated: false }; },
    subscribeInvalidation: () => () => {},
  };
}
async function fixture(t, options = {}) {
  const env = setupClient('native', { clusterOptions: { absent: true }, ...options }), data = store(); let mono = 0, wall = Date.now();
  const option = configOption(network => {
    network.genesisHash = network.chainIdentity = env.terms.genesisHash;
    network.deployments[0].artifactSha256 = env.trade.deployment.artifactSha256;
    network.deployments[0].runtime.programDataSha256 = env.trade.deployment.runtime.programDataSha256;
  });
  const config = await parseSolanaLocalnetConfig(solanaLocalnetConfigDocument(option));
  const controller = new SolanaRecoveryController(config, env.walletFake.wallet, env.cluster.rpc,
    { store: data, monotonicNow: () => mono, now: () => wall });
  t.after(() => { controller.dispose(); env.client.dispose(); });
  const created = success(await controller.dispatch({ type: 'profile.create', passphrase: PASS }));
  assert.ok(Array.isArray(created.snapshot.proposals), 'missing proposal inventory');
  const id = created.snapshot.profileId;
  const proposal = (number = 1, changes = {}) => ({ format: FORMAT, terms: { ...env.terms,
    sellerNonce: shaHex(utf8.encode(`proposal-admission:${number}`)), ...changes } });
  const save = document => controller.dispatch({ type: 'funding.proposal.import', text: JSON.stringify(document) });
  const read = async (profile = id, passphrase = PASS) => {
    const opened = await openEnvelope(data.rows.get(profile), passphrase, crypto);
    try { return structuredClone(opened.snapshot); } finally { disposeMaterial(opened.material); }
  };
  const reopen = () => controller.dispatch({ type: 'profile.unlock', profileId: id, passphrase: PASS });
  const seed = async records => {
    success(await controller.dispatch({ type: 'profile.lock' }));
    const vault = new EncryptedVaultService(data, crypto, { lifecycle: false });
    try { const s = value(await vault.unlock(id, PASS)); value(await vault.commit(s.sessionId, s.revision, records.map(record => ({ op: 'put', record })))); }
    finally { vault.dispose(); }
    return reopen();
  };
  const recovery = value(createRecoveryDocument(env.trade));
  const importRecovery = () => controller.dispatch({ type: 'recovery.import', text: JSON.stringify(recovery), role: 'seller' });
  return { env, data, controller, config, id, proposal, save, read, reopen, seed, recovery, importRecovery, expire() { mono += 300001; }, advanceNow(ms) { wall += ms; } };
}

export { fixture, success, value, deferred, PASS, DEST };
