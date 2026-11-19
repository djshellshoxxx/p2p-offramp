import test from 'node:test';
import assert from 'node:assert/strict';
import { SolanaRecoveryController } from '../src/solana-localnet/controller.ts';
import { parseSolanaLocalnetConfig, solanaLocalnetConfigDocument } from '../src/solana-localnet/config.ts';
import { configOption } from './solana-localnet-support.mjs';
import { setupClient } from '../../../packages/chain-solana/test/lifecycle-support.mjs';
import { createRecoveryDocument } from '../../../packages/chain-solana/src/recovery.ts';
import { openEnvelope, disposeMaterial } from '../../../packages/storage/src/vault-crypto.ts';
import { VaultStorageError } from '../../../packages/storage/src/idb-vault-store.ts';
import { readSolanaVaultRecords, assertSolanaSendMarked } from '../../../scripts/lib/solana-localnet-send-evidence.mjs';

const PASS = 'synthetic Solana unit profile passphrase';
const success = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result; };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function store() {
  const rows = new Map();
  return { async get(id) { return structuredClone(rows.get(id)); },
    async add(row, options) { options?.assertCurrent?.(); assert.equal(rows.has(row.profileId), false); rows.set(row.profileId, structuredClone(row)); },
    async compareAndSwap(before, after, options) { options?.assertCurrent?.();
      if (this.conflict || JSON.stringify(rows.get(before.profileId)) !== JSON.stringify(before)) throw new VaultStorageError('CONFLICT');
      rows.set(after.profileId, structuredClone(after)); },
    async addWithSource(source, next, options) { assert.deepEqual(rows.get(source.profileId), source); await this.add(next, options); },
    async listProfileIds() { return { profileIds: [...rows.keys()].sort(), truncated: false }; },
    subscribeInvalidation() { return () => {}; }, rows, conflict: false };
}
async function composed(t) {
  const env = setupClient(), data = store(), option = configOption(network => {
    network.genesisHash = network.chainIdentity = env.terms.genesisHash;
    network.deployments[0].artifactSha256 = env.trade.deployment.artifactSha256;
    network.deployments[0].runtime.programDataSha256 = env.trade.deployment.runtime.programDataSha256;
  });
  const config = await parseSolanaLocalnetConfig(solanaLocalnetConfigDocument(option));
  const controller = new SolanaRecoveryController(config, env.walletFake.wallet, env.cluster.rpc, { store: data });
  t.after(() => { controller.dispose(); env.client.dispose(); });
  const id = success(await controller.dispatch({ type: 'profile.create', passphrase: PASS })).snapshot.profileId;
  const receipt = createRecoveryDocument(env.trade); assert.equal(receipt.ok, true);
  const document = receipt.value;
  const read = async (profile = id, passphrase = PASS) => {
    const opened = await openEnvelope(data.rows.get(profile), passphrase, crypto);
    try { return { snapshot: opened.snapshot, ...readSolanaVaultRecords(opened.snapshot) }; } finally { disposeMaterial(opened.material); }
  };
  const importTrade = async () => success(await controller.dispatch({ type: 'recovery.import', text: JSON.stringify(document), role: 'seller' }));
  const connect = async () => success(await controller.dispatch({ type: 'wallet.connect', tradeId: document.termsHash }));
  const prepare = async (extra = {}) => success(await controller.dispatch({ type: 'review.prepare', tradeId: document.termsHash, action: 'release', fiatReceiptConfirmed: true, ...extra }));
  return { env, data, config, controller, id, document, read, importTrade, connect, prepare };
}
test('locked recovery Worker refuses every economic command and never touches RPC or wallet', async () => {
  const config = await parseSolanaLocalnetConfig(solanaLocalnetConfigDocument(configOption()));
  let calls = 0;
  const controller = new SolanaRecoveryController(config, { features: {} }, { request: async () => { calls++; throw Error(); } }, { store: store() });
  for (const command of [{ type: 'wallet.connect', tradeId: 'ab'.repeat(32) },
    { type: 'review.prepare', tradeId: 'ab'.repeat(32), action: 'release', fiatReceiptConfirmed: true },
    { type: 'recovery.import', text: '{}', role: 'seller' }]) {
    const result = await controller.dispatch(command); assert.equal(result.ok, false); assert.equal(result.code, 'LOCKED');
  }
  assert.equal(calls, 0); controller.dispose();
});
test('profile lock revokes the controller immediately; unsupported commands cannot mint authority', async () => {
  const config = await parseSolanaLocalnetConfig(solanaLocalnetConfigDocument(configOption()));
  const controller = new SolanaRecoveryController(config, { features: {} }, { request: async () => { throw Error(); } }, { store: store() });
  const created = await controller.dispatch({ type: 'profile.create', passphrase: 'test-only recovery controller passphrase' });
  assert.equal(created.ok, true, JSON.stringify(created)); assert.equal(created.snapshot.trades.length, 0);
  assert.equal((await controller.dispatch({ type: 'review.prepare', action: 'fund', tradeId: 'ab'.repeat(32) })).ok, false);
  assert.equal((await controller.dispatch({ type: 'profile.lock' })).snapshot.profileId, null);
  assert.equal((await controller.dispatch({ type: 'refresh' })).code, 'LOCKED'); controller.dispose();
});
test('only an original finalized funded native escrow with the embedded deployment pin can be imported', async t => {
  const f = await composed(t), wrong = structuredClone(f.document); wrong.network.programDataSha256 = 'ef'.repeat(32);
  assert.equal((await f.controller.dispatch({ type: 'recovery.import', text: JSON.stringify(wrong), role: 'seller' })).code, 'WRONG_CHAIN');
  assert.equal((await f.read()).documents.length, 0);
  f.env.cluster.world.accounts.delete(f.env.trade.escrow.address);
  assert.equal((await f.controller.dispatch({ type: 'recovery.import', text: JSON.stringify(f.document), role: 'seller' })).code, 'FUNDED_ESCROW_REQUIRED');
  assert.equal((await f.read()).documents.length, 0); assert.equal(f.env.walletFake.calls.sign.length, 0);
});
test('the complete canonical recovery document is encrypted and survives lock/reopen with its original provenance', async t => {
  const f = await composed(t); await f.importTrade();
  const records = await f.read(); assert.deepEqual(records.documents, [{ document: f.document, role: 'seller', originProfileId: f.id }]);
  assert.equal(JSON.stringify(f.data.rows.get(f.id)).includes(f.document.termsHash), false);
  success(await f.controller.dispatch({ type: 'profile.lock' }));
  const reopened = success(await f.controller.dispatch({ type: 'profile.unlock', profileId: f.id, passphrase: PASS }));
  assert.equal(reopened.snapshot.trades[0].id, f.document.termsHash); assert.equal(reopened.snapshot.trades[0].restored, false);
  assert.equal(reopened.snapshot.trades[0].canRelease, false, 'reopening never reconnects a wallet or grants transaction consent');
});
test('manual receipt, exact review, cancellation and IndexedDB-compatible encrypted CAS precede signing and sending', async t => {
  const f = await composed(t); await f.importTrade(); await f.connect();
  assert.equal((await f.controller.dispatch({ type: 'review.prepare', tradeId: f.document.termsHash, action: 'release' })).code, 'FIAT_RECEIPT_REQUIRED');
  const first = await f.prepare(), message = first.snapshot.review.fields.find(field => field.label === 'Message (base64)').value;
  assert.equal((await f.read()).intents.at(-1).message, message); assert.equal(f.env.walletFake.calls.sign.length, 0);
  success(await f.controller.dispatch({ type: 'review.cancel' })); assert.equal((await f.read()).intents[0].state, 'cancelled');
  assert.equal((await f.controller.dispatch({ type: 'review.confirm', reviewId: first.snapshot.review.id })).code, 'REVIEW_EXPIRED');
  const second = await f.prepare(); let proved = 0;
  f.env.cluster.handle = async input => {
    if (input.method === 'sendTransaction') {
      const records = await f.read(); assertSolanaSendMarked(records.intents, input.params[0], f.id, {
        genesisHash: f.document.network.genesisHash, programId: f.document.network.programId, programDataSha256: f.document.network.programDataSha256,
      }, new Set()); proved++;
    }
  };
  success(await f.controller.dispatch({ type: 'review.confirm', reviewId: second.snapshot.review.id }));
  assert.equal(proved, 1); assert.equal(f.env.walletFake.calls.sign.length, 1); assert.equal(f.env.cluster.sent.length, 1);
});
test('wallet scope revocation while the physical signer is pending cannot send or restore review authority', async t => {
  const f = await composed(t); await f.importTrade(); await f.connect();
  const entered = deferred(), release = deferred(), feature = f.env.walletFake.wallet.features['solana:signTransaction'], original = feature.signTransaction;
  feature.signTransaction = async (...args) => { entered.resolve(); await release.promise; return original(...args); };
  const prepared = await f.prepare(), confirmation = f.controller.dispatch({ type: 'review.confirm', reviewId: prepared.snapshot.review.id });
  await entered.promise; f.controller.walletChanged(); assert.equal(f.controller.snapshot().review, null); assert.equal(f.controller.snapshot().wallet, null);
  release.resolve(); assert.equal((await confirmation).ok, false); assert.equal(f.env.cluster.sent.length, 0);
  assert.equal((await f.read()).intents.every(record => record.sendMarkedAt === null), true);
});
test('fresh-key restore preserves uncertain provenance and requires a definitive drop plus explicit rebuild', async t => {
  const f = await composed(t); await f.importTrade(); await f.connect();
  f.env.cluster.sendBehavior = () => { throw Error('test transport uncertain'); };
  const prepared = await f.prepare(); success(await f.controller.dispatch({ type: 'review.confirm', reviewId: prepared.snapshot.review.id }));
  const old = (await f.read()).intents[0]; assert.equal(old.state, 'unknown'); assert.notEqual(old.sendMarkedAt, null);
  const backup = success(await f.controller.dispatch({ type: 'backup.export' })).backupBytes;
  success(await f.controller.dispatch({ type: 'profile.lock' })); const NEW_PASS = 'fresh synthetic recovery profile key';
  const restored = success(await f.controller.dispatch({ type: 'backup.restore', bytes: backup, sourcePassphrase: PASS, destinationPassphrase: NEW_PASS }));
  const fresh = restored.snapshot.profileId; assert.notEqual(fresh, f.id); assert.equal(restored.snapshot.trades[0].restored, true);
  assert.deepEqual((await f.read(fresh, NEW_PASS)).intents[0], old); assert.equal(f.env.cluster.sent.length, 1);
  await f.connect(); assert.equal(f.controller.snapshot().trades[0].canRelease, false);
  f.env.cluster.advance(200); success(await f.controller.dispatch({ type: 'refresh' }));
  const dropped = (await f.read(fresh, NEW_PASS)).intents[0]; assert.equal(dropped.state, 'dropped'); assert.equal(dropped.originProfileId, f.id);
  const rebuilt = await f.prepare({ rebuildOf: old.intentId });
  const current = (await f.read(fresh, NEW_PASS)).intents.find(r => r.state === 'prepared');
  assert.equal(current.replacementOf, old.intentId); assert.equal(current.originProfileId, fresh); assert.notEqual(current.message, old.message);
  assert.equal(f.env.cluster.sent.length, 1); success(await f.controller.dispatch({ type: 'review.cancel' }));
  assert.equal(rebuilt.snapshot.review.action, 'release');
});
test('a persistent CAS conflict locks the profile before any wallet signature or send', async t => {
  const f = await composed(t); await f.importTrade(); await f.connect(); f.data.conflict = true;
  const result = await f.controller.dispatch({ type: 'review.prepare', tradeId: f.document.termsHash, action: 'release', fiatReceiptConfirmed: true });
  assert.equal(result.ok, false); assert.equal(result.snapshot.profileId, null);
  assert.equal(f.env.walletFake.calls.sign.length, 0); assert.equal(f.env.cluster.sent.length, 0);
});
