import test from 'node:test';
import assert from 'node:assert/strict';
import { SolanaRecoveryController } from '../src/solana-localnet/controller.ts';
import { parseSolanaCommand } from '../src/solana-localnet/validation.ts';
import { parseSolanaLocalnetConfig, solanaLocalnetConfigDocument } from '../src/solana-localnet/config.ts';
import { createSolanaFundingProposalRecord, decodeSolanaFundingProposalRecord,
  SOLANA_FUNDING_PROPOSAL_FORMAT as FORMAT } from '../src/solana-localnet/funding-proposal.ts';
import { EncryptedVaultService } from '../../../packages/storage/index.ts';
import { encodeBase64url, decodeBase64url } from '../../../packages/schemas/index.ts';
import { openEnvelope, disposeMaterial } from '../../../packages/storage/src/vault-crypto.ts';
import { VaultStorageError } from '../../../packages/storage/src/idb-vault-store.ts';
import { createRecoveryDocument } from '../../../packages/chain-solana/src/recovery.ts';
import { setupClient } from '../../../packages/chain-solana/test/lifecycle-support.mjs';
import { shaHex } from '../../../packages/chain-solana/test/support.mjs';
import { configOption } from './solana-localnet-support.mjs';

const PASS = 'synthetic proposal admission profile passphrase', DEST = 'synthetic restored proposal passphrase';
const utf8 = new TextEncoder(), json = value => utf8.encode(JSON.stringify(value));
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
async function fixture(t) {
  const env = setupClient(), data = store(); let mono = 0;
  const option = configOption(network => {
    network.genesisHash = network.chainIdentity = env.terms.genesisHash;
    network.deployments[0].artifactSha256 = env.trade.deployment.artifactSha256;
    network.deployments[0].runtime.programDataSha256 = env.trade.deployment.runtime.programDataSha256;
  });
  const config = await parseSolanaLocalnetConfig(solanaLocalnetConfigDocument(option));
  const controller = new SolanaRecoveryController(config, env.walletFake.wallet, env.cluster.rpc,
    { store: data, monotonicNow: () => mono });
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
  return { env, data, controller, config, id, proposal, save, read, reopen, seed, recovery, importRecovery, expire() { mono += 300001; } };
}
test('proposal command captures only bounded own text and never adds a role or funding action', () => {
  assert.deepEqual(parseSolanaCommand({ type: 'funding.proposal.import', text: '{}' }), { type: 'funding.proposal.import', text: '{}' });
  let getters = 0;
  for (const input of [{ type: 'funding.proposal.import', text: '', role: 'seller' },
    { type: 'funding.proposal.import', text: 'x'.repeat(4097) },
    { type: 'funding.proposal.import', get text() { getters++; return '{}'; } }]) assert.throws(() => parseSolanaCommand(input));
  assert.equal(getters, 0);
  assert.throws(() => parseSolanaCommand({ type: 'review.prepare', action: 'fund', tradeId: 'ab'.repeat(32) }));
});
test('explicit proposal save performs one encrypted write and no RPC, wallet, native intent or preparation', async t => {
  const f = await fixture(t), input = f.proposal(), before = f.data.writes;
  const saved = success(await f.save(input)), view = saved.snapshot.proposals[0];
  assert.equal(f.data.writes, before + 1); assert.equal(saved.snapshot.trades.length, 0);
  assert.deepEqual(view.terms, input.terms); assert.equal(view.bindingStatus, 'available'); assert.equal(view.restored, false);
  assert.equal(view.recoveryRetained, false); assert.equal(view.escrowConflict, false); assert.ok(view.escrow);
  assert.deepEqual(saved.snapshot.tradeCapacity, { used: 1, limit: 8 }); assert.equal(saved.snapshot.review, null);
  assert.equal(f.env.cluster.calls.length, 0); assert.equal(f.env.walletFake.calls.connect, 0);
  assert.equal(f.env.walletFake.calls.sign.length, 0); assert.equal(f.env.cluster.sent.length, 0);
  const records = (await f.read()).records; assert.equal(records.length, 1);
  const retained = await decodeSolanaFundingProposalRecord(records[0]); assert.equal(retained.originProfileId, f.id);
  assert.equal(JSON.stringify(f.data.rows.get(f.id)).includes(view.binding.tradeId), false);
  assert.ok(!('originProfileId' in view) && !('configuration' in view) && !('payload' in view) && !('canFund' in view));
});
test('lock, unlock and fresh-key restore preserve exact proposal payload and original provenance without native recovery', async t => {
  const f = await fixture(t); success(await f.save(f.proposal())); const original = (await f.read()).records[0];
  const backup = success(await f.controller.dispatch({ type: 'backup.export' })).backupBytes;
  const locked = success(await f.controller.dispatch({ type: 'profile.lock' })).snapshot;
  assert.deepEqual(locked.proposals, []); assert.deepEqual(locked.tradeCapacity, { used: 0, limit: 8 });
  assert.equal(success(await f.reopen()).snapshot.proposals[0].restored, false);
  const restored = success(await f.controller.dispatch({ type: 'backup.restore', bytes: backup, sourcePassphrase: PASS, destinationPassphrase: DEST }));
  assert.notEqual(restored.snapshot.profileId, f.id); assert.equal(restored.snapshot.proposals[0].restored, true);
  assert.deepEqual((await f.read(restored.snapshot.profileId, DEST)).records[0], original);
  const before = f.data.writes; success(await f.save(f.proposal())); assert.equal(f.data.writes, before);
  assert.equal((await decodeSolanaFundingProposalRecord((await f.read(restored.snapshot.profileId, DEST)).records[0])).originProfileId, f.id);
  assert.equal(f.env.cluster.calls.length, 0); assert.equal(f.env.walletFake.calls.connect, 0); assert.equal(f.env.cluster.sent.length, 0);
});
test('exact duplicate at capacity succeeds without a write; a ninth distinct binding is refused', async t => {
  const f = await fixture(t); for (let i = 1; i <= 8; i++) success(await f.save(f.proposal(i)));
  const before = f.data.writes, retained = (await f.read()).records;
  const duplicate = success(await f.save(f.proposal(1))); assert.equal(duplicate.snapshot.tradeCapacity.used, 8);
  assert.equal(f.data.writes, before); assert.deepEqual((await f.read()).records, retained);
  const refused = await f.save(f.proposal(9)); assert.equal(refused.code, 'LIMIT_EXCEEDED'); assert.equal(refused.snapshot.proposals.length, 8);
});
test('funded recovery and a paired proposal consume one binding and recovery remains available at capacity', async t => {
  const f = await fixture(t); const same = { format: FORMAT, terms: f.env.terms };
  success(await f.save(same)); for (let i = 1; i <= 7; i++) success(await f.save(f.proposal(i)));
  const imported = success(await f.importRecovery()); assert.equal(imported.snapshot.tradeCapacity.used, 8);
  assert.equal(imported.snapshot.trades.length, 1); assert.equal(imported.snapshot.proposals.find(p => p.binding.tradeId === f.recovery.termsHash).recoveryRetained, true);
  const before = f.data.writes; const denied = await f.save(same); assert.equal(denied.code, 'CONFLICT'); assert.equal(f.data.writes, before);
  assert.equal(denied.snapshot.profileId, null);
});
test('funded recovery alone contributes to shared capacity', async t => {
  const f = await fixture(t); success(await f.importRecovery());
  for (let i = 1; i <= 7; i++) success(await f.save(f.proposal(i)));
  const denied = await f.save(f.proposal(8)); assert.equal(denied.code, 'LIMIT_EXCEEDED'); assert.equal(denied.snapshot.tradeCapacity.used, 8);
});
test('same escrow with different terms is a conflict even though its terms hash changes', async t => {
  const f = await fixture(t), original = f.proposal(); success(await f.save(original)); const before = f.data.writes;
  assert.equal((await f.save({ ...original, terms: { ...original.terms, amountBaseUnits: '123' } })).code, 'CONFLICT');
  assert.equal(f.data.writes, before);
});
test('incompatible registry IDs still reserve the original escrow without installing retained configuration', async t => {
  const f = await fixture(t), input = f.proposal(), alternate = { ...f.config, network: { ...f.config.network,
    id: 'older-local-network', deployments: [{ ...f.config.network.deployments[0], id: 'older-deployment' }] } };
  const made = await createSolanaFundingProposalRecord(json(input), alternate, '12'.repeat(16));
  const opened = success(await f.seed([made.record])); assert.equal(opened.snapshot.proposals[0].bindingStatus, 'configuration-mismatch');
  assert.equal(opened.snapshot.proposals[0].escrow, null); assert.equal(f.env.cluster.calls.length, 0);
  assert.equal((await f.save(input)).code, 'CONFLICT');
});
for (const [label, edit] of [
  ['registry digest', v => { v.configuration.registrySha256 = 'ef'.repeat(32); }],
  ['program data', v => { v.configuration.programDataSha256 = 'ef'.repeat(32); }],
  ['artifact', v => { v.configuration.artifactSha256 = 'ef'.repeat(32); }],
  ['asset', v => { v.configuration.assetId = 'old-native'; }],
  ['RPC', v => { v.configuration.rpcUrl = 'http://127.0.0.1:19995/'; }],
  ['submit margin', v => { v.configuration.margins.submitMarginSeconds = '0'; }],
  ['release margin', v => { v.configuration.margins.releaseMarginSeconds = '0'; }],
]) test(`historical ${label} mismatch stays readable and an exact duplicate preserves its payload`, async t => {
  const f = await fixture(t), input = f.proposal(), made = await createSolanaFundingProposalRecord(json(input), f.config, '12'.repeat(16));
  const raw = JSON.parse(new TextDecoder().decode(decodeBase64url(made.record.payload, 1, 8192))); edit(raw);
  const record = { ...made.record, payload: encodeBase64url(json(raw)) };
  const opened = success(await f.seed([record])); assert.equal(opened.snapshot.proposals[0].bindingStatus, 'configuration-mismatch');
  const before = f.data.writes; success(await f.save(input)); assert.equal(f.data.writes, before); assert.deepEqual((await f.read()).records[0], record);
  assert.equal(f.env.cluster.calls.length, 0);
});
test('historical unsupported amount remains visible while new unsupported admission is refused', async t => {
  const f = await fixture(t), input = f.proposal(1, { amountBaseUnits: (1n << 63n).toString() });
  const made = await createSolanaFundingProposalRecord(json(input), f.config, f.id);
  const opened = success(await f.seed([made.record])); assert.equal(opened.snapshot.proposals[0].bindingStatus, 'unsupported');
  assert.equal(opened.snapshot.proposals[0].escrow, null); assert.equal(f.env.cluster.calls.length, 0);
  assert.equal((await f.save(f.proposal(2, { amountBaseUnits: input.terms.amountBaseUnits }))).code, 'LIMIT_EXCEEDED');
});
test('mixed-version overflow loads valid proposal and funded recovery records and preserves exports and exit eligibility', async t => {
  const f = await fixture(t); success(await f.importRecovery()); const records = [];
  for (let i = 1; i <= 8; i++) records.push((await createSolanaFundingProposalRecord(json(f.proposal(i)), f.config, f.id)).record);
  const opened = success(await f.seed(records)); assert.equal(opened.snapshot.tradeCapacity.used, 9);
  assert.equal(opened.snapshot.proposals.length, 8); assert.equal(opened.snapshot.trades[0].state, 'funded');
  assert.equal((await f.save(f.proposal(9))).code, 'LIMIT_EXCEEDED');
  const exported = success(await f.controller.dispatch({ type: 'recovery.export', tradeId: f.recovery.termsHash }));
  assert.deepEqual(JSON.parse(exported.recoveryJson), f.recovery);
  const connected = success(await f.controller.dispatch({ type: 'wallet.connect', tradeId: f.recovery.termsHash }));
  assert.equal(connected.snapshot.trades[0].canRelease, true);
  assert.equal(f.env.walletFake.calls.sign.length, 0); assert.equal(f.env.cluster.sent.length, 0);
});
test('finalized recovery wins over a conflicting unfunded proposal while the proposal remains readable', async t => {
  const f = await fixture(t), input = { format: FORMAT, terms: { ...f.env.terms, amountBaseUnits: '123' } };
  success(await f.save(input)); const imported = success(await f.importRecovery());
  assert.equal(imported.snapshot.trades[0].state, 'funded'); assert.equal(imported.snapshot.tradeCapacity.used, 2);
  assert.equal(imported.snapshot.proposals[0].escrowConflict, true); assert.equal(imported.snapshot.proposals[0].recoveryRetained, false);
  success(await f.controller.dispatch({ type: 'profile.lock' })); const opened = success(await f.reopen());
  assert.equal(opened.snapshot.trades.length, 1); assert.equal(opened.snapshot.proposals[0].escrowConflict, true);
});
test('unknown or non-trade data occupying a prospective proposal record ID is never overwritten', async t => {
  for (const kind of ['trade', 'journal']) {
    const f = await fixture(t), input = f.proposal(), made = await createSolanaFundingProposalRecord(json(input), f.config, f.id);
    const foreign = { id: made.record.id, kind, schemaVersion: 1, payload: encodeBase64url(json({ format: 'ordinary-unknown-family/v1' })) };
    success(await f.seed([foreign])); const before = f.data.writes;
    assert.equal((await f.save(input)).code, 'CONFLICT'); assert.equal(f.data.writes, before);
    assert.deepEqual((await f.read()).records[0], foreign);
  }
});
test('a concurrent writer keeps its record when proposal admission observes an empty slot', async t => {
  const f = await fixture(t), input = f.proposal();
  const { record } = await createSolanaFundingProposalRecord(json(input), f.config, f.id);
  const occupant = { id: record.id, kind: 'preference', schemaVersion: 1, payload: encodeBase64url(json({ retained: true })) };
  const original = EncryptedVaultService.prototype.read;
  let inserted = false;
  EncryptedVaultService.prototype.read = async function(...args) {
    const result = await Reflect.apply(original, this, args);
    if (!inserted && args[1] === record.id && result.ok && result.value === null) {
      inserted = true;
      value(await this.commit(args[0], f.data.rows.get(f.id).revision, [{ op: 'put', record: occupant }]));
    }
    return result;
  };
  try {
    assert.equal((await f.save(input)).code, 'CONFLICT');
  } finally { EncryptedVaultService.prototype.read = original; }
  assert.equal(inserted, true);
  assert.deepEqual((await f.read()).records, [occupant]);
  assert.equal(f.env.cluster.calls.length, 0);
});
for (const interruption of ['lock', 'wallet change', 'idle']) test(`held proposal hashing cannot admit after ${interruption}`, async t => {
  const f = await fixture(t), gate = deferred(), entered = deferred(), original = crypto.subtle.digest;
  let held = false;
  crypto.subtle.digest = async function(...args) { if (!held) { held = true; entered.resolve(); await gate.promise; } return Reflect.apply(original, this, args); };
  try {
    const before = f.data.writes, pending = f.save(f.proposal()); await entered.promise;
    if (interruption === 'lock') success(await f.controller.dispatch({ type: 'profile.lock' }));
    else if (interruption === 'wallet change') f.controller.walletChanged(); else f.expire();
    gate.resolve(); const result = await pending; assert.equal(result.ok, false); assert.equal(f.data.writes, before);
    assert.equal((await f.read()).records.length, 0); assert.equal(f.env.cluster.calls.length, 0);
  } finally { gate.resolve(); crypto.subtle.digest = original; }
});
for (const interruption of ['lock', 'wallet change', 'conflict']) test(`held atomic proposal write rejects ${interruption}`, async t => {
  const f = await fixture(t), gate = deferred(), entered = deferred();
  f.data.before = async () => { entered.resolve(); await gate.promise; };
  const before = f.data.writes, pending = f.save(f.proposal()); await entered.promise;
  if (interruption === 'lock') success(await f.controller.dispatch({ type: 'profile.lock' }));
  else if (interruption === 'wallet change') f.controller.walletChanged(); else f.data.conflict = true;
  gate.resolve(); const result = await pending; assert.equal(result.ok, false); assert.equal(f.data.writes, before);
  assert.equal((await f.read()).records.length, 0);
});
test('stale vault revision refuses proposal admission before writing and funded-only recovery remains enforced', async t => {
  const f = await fixture(t); f.data.rows.get(f.id).revision++;
  const before = f.data.writes; assert.equal((await f.save(f.proposal())).code, 'CONFLICT'); assert.equal(f.data.writes, before);
  const g = await fixture(t); g.env.cluster.world.accounts.delete(g.env.trade.escrow.address);
  assert.equal((await g.importRecovery()).code, 'FUNDED_ESCROW_REQUIRED');
  assert.equal((await g.read()).records.length, 0);
});
test('locked proposal import refuses before native work and exposes no private inventory', async t => {
  const f = await fixture(t); success(await f.controller.dispatch({ type: 'profile.lock' }));
  const denied = await f.save(f.proposal()); assert.equal(denied.code, 'LOCKED'); assert.deepEqual(denied.snapshot.proposals, []);
  assert.deepEqual(denied.snapshot.tradeCapacity, { used: 0, limit: 8 }); assert.equal(f.env.cluster.calls.length, 0);
  assert.equal(f.env.walletFake.calls.connect, 0); assert.equal(f.env.cluster.sent.length, 0);
});
test('new admission retains canonical non-core and historical deadline data without asserting funding eligibility', async t => {
  const f = await fixture(t), input = f.proposal(1, { capabilitiesHash: '00'.repeat(32), acceptBeforeSeconds: '0', escrowExpirySeconds: '0' });
  const saved = success(await f.save(input)); assert.equal(saved.snapshot.proposals[0].bindingStatus, 'available');
  assert.deepEqual(saved.snapshot.proposals[0].terms, input.terms); assert.equal(saved.snapshot.review, null);
  assert.equal(f.env.cluster.calls.length, 0); assert.equal(f.env.walletFake.calls.connect, 0); assert.equal(f.env.cluster.sent.length, 0);
});
test('public JSON failures retain their bounded parser error and never persist', async t => {
  const f = await fixture(t), before = f.data.writes;
  assert.equal((await f.controller.dispatch({ type: 'funding.proposal.import', text: '{' })).code, 'INVALID_INPUT');
  const text = '\u00a0'.repeat(1800) + JSON.stringify(f.proposal()); assert.ok(text.length <= 4096);
  assert.ok(utf8.encode(text).length > 4096);
  assert.equal((await f.controller.dispatch({ type: 'funding.proposal.import', text })).code, 'LIMIT_EXCEEDED');
  assert.equal(f.data.writes, before); assert.equal(f.env.cluster.calls.length, 0);
});
test('a full-binding hash collision still compares complete canonical proposal contents before duplicate admission', async t => {
  const f = await fixture(t), input = f.proposal(); const saved = success(await f.save(input)); const before = f.data.writes;
  const digest = crypto.subtle.digest; crypto.subtle.digest = async () => Uint8Array.from(Buffer.from(saved.snapshot.proposals[0].binding.tradeId, 'hex')).buffer;
  try { assert.equal((await f.save({ ...input, terms: { ...input.terms, amountBaseUnits: '123' } })).code, 'CONFLICT'); }
  finally { crypto.subtle.digest = digest; }
  assert.equal(f.data.writes, before); assert.equal((await f.read()).records.length, 1);
});
test('historical competing proposals both remain readable with collision flags after complete inventory loading', async t => {
  const f = await fixture(t), input = f.proposal(), first = await createSolanaFundingProposalRecord(json(input), f.config, f.id);
  const second = await createSolanaFundingProposalRecord(json({ ...input, terms: { ...input.terms, amountBaseUnits: '123' } }), f.config, f.id);
  const opened = success(await f.seed([second.record, first.record])); assert.equal(opened.snapshot.proposals.length, 2);
  assert.ok(opened.snapshot.proposals.every(p => p.escrowConflict)); assert.equal(opened.snapshot.tradeCapacity.used, 2);
  assert.equal(f.env.cluster.calls.length, 0); assert.equal(f.env.walletFake.calls.sign.length, 0);
});
