import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EncryptedVaultService } from '../../../packages/storage/index.ts';
import { encodeBase64url } from '../../../packages/schemas/index.ts';
import { BUYER, makeWallet } from '../../../packages/chain-solana/test/lifecycle-support.mjs';
import { shaHex, PROGRAM_DATA } from '../../../packages/chain-solana/test/support.mjs';
import { parseSolanaCommand } from '../src/solana-localnet/validation.ts';
import { readSolanaBrowserVaultRecords } from '../../../scripts/lib/solana-localnet-send-evidence.mjs';
import { fixture, success, deferred, value, PASS, DEST } from './solana-funding-flow-support.mjs';
const records = async f => readSolanaBrowserVaultRecords(await f.read());
async function ready(t, options) {
  const f = await fixture(t, options); success(await f.save({ format: 'p2p-offramp/solana-local-funding-proposal/v1', terms: f.env.terms }));
  f.proposalId = f.controller.snapshot().proposals[0].id;
  f.connect = () => f.controller.dispatch({ type: 'funding.wallet.connect', proposalId: f.proposalId });
  f.prepare = (extra = {}) => f.controller.dispatch({ type: 'funding.prepare', proposalId: f.proposalId, ...extra });
  f.confirm = review => f.controller.dispatch({ type: 'review.confirm', reviewId: review.id });
  f.refresh = () => f.controller.dispatch({ type: 'refresh' });
  success(await f.connect()); return f;
}
test('explicit funding commands use record IDs and retain exit-only preparation', () => {
  const proposalId = 'ab'.repeat(16);
  for (const type of ['funding.wallet.connect', 'funding.prepare']) {
    assert.deepEqual(parseSolanaCommand({ type, proposalId }), { type, proposalId });
    for (const input of [{ type, proposalId, role: 'seller' }, { type, proposalId: 'ab'.repeat(32) }, { type, proposalId, transaction: 'AA==' }]) assert.throws(() => parseSolanaCommand(input));
    let calls = 0; assert.throws(() => parseSolanaCommand({ type, get proposalId() { calls++; return proposalId; } })); assert.equal(calls, 0);
  }
  assert.throws(() => parseSolanaCommand({ type: 'review.prepare', action: 'fund', tradeId: 'ab'.repeat(32) }));
});
test('original funding review sends once and only finalized escrow adds recovery', async t => {
  const f = await ready(t), original = (await records(f)).proposals[0].record;
  assert.equal(f.controller.snapshot().proposals[0].state, 'absent'); assert.equal(f.controller.snapshot().proposals[0].walletConnected, true);
  const review = success(await f.prepare()).snapshot.review; assert.equal(review.action, 'fund'); assert.equal(review.proposalId, f.proposalId);
  const fields = Object.fromEntries(review.fields.map(item => [item.label, item.value]));
  assert.equal(fields['Acceptance deadline (chain seconds)'], f.env.terms.acceptBeforeSeconds);
  assert.equal(fields['Escrow expiry (chain seconds)'], f.env.terms.escrowExpirySeconds);
  for (const label of ['Network fee (lamports)', 'Escrow rent (lamports)', 'Total debit (lamports)']) assert.equal(fields[label], 'Unknown');
  assert.equal(fields['Peer acceptance'], 'Not established');
  assert.equal((await records(f)).intents[0].message, fields['Message (base64)']); assert.equal(f.env.cluster.sent.length, 0);
  success(await f.confirm(review)); assert.equal(f.env.cluster.sent.length, 1); assert.equal(f.env.walletFake.calls.sign.length, 1);
  assert.equal((await records(f)).documents.length, 0); assert.equal(f.controller.snapshot().trades.length, 0);
  assert.equal((await f.confirm(review)).code, 'REVIEW_EXPIRED'); assert.equal(f.env.cluster.sent.length, 1);
  f.env.cluster.advance(1); f.env.cluster.setEscrow(); f.env.cluster.land(f.env.cluster.lastSentSignature()); const observed = success(await f.refresh());
  assert.equal(observed.snapshot.error, null, JSON.stringify(observed.snapshot.proposals));
  const stored = await records(f); assert.deepEqual(stored.proposals[0].record, original);
  assert.deepEqual(stored.documents, [{ document: f.recovery, role: 'seller', originProfileId: f.id }]);
  assert.equal(stored.intents[0].state, 'finalized'); assert.equal(f.controller.snapshot().proposals[0].recoveryRetained, true);
  assert.equal(f.controller.snapshot().tradeCapacity.used, 1);
  const exported = success(await f.controller.dispatch({ type: 'recovery.export', tradeId: f.recovery.termsHash })); assert.deepEqual(JSON.parse(exported.recoveryJson), f.recovery);
  const writes = f.data.writes; success(await f.refresh()); assert.equal(f.data.writes, writes);
});
test('live funding review survives explicit refresh without cancellation', async t => {
  const f = await ready(t), review = success(await f.prepare()).snapshot.review;
  success(await f.refresh()); assert.equal(f.controller.snapshot().review.id, review.id); assert.equal((await records(f)).intents[0].state, 'prepared');
  success(await f.confirm(review)); assert.equal(f.env.cluster.sent.length, 1);
});
test('cancel and expired funding reviews never sign or create recovery', async t => {
  const f = await ready(t), review = success(await f.prepare()).snapshot.review;
  success(await f.controller.dispatch({ type: 'review.cancel' })); assert.equal((await records(f)).intents[0].state, 'cancelled');
  assert.equal((await f.confirm(review)).code, 'REVIEW_EXPIRED');
  const next = success(await f.prepare()).snapshot.review; f.advanceNow(30001); assert.equal((await f.confirm(next)).code, 'REVIEW_EXPIRED');
  assert.equal(f.env.cluster.sent.length, 0); assert.equal((await records(f)).documents.length, 0);
});
for (const interrupt of ['lock', 'wallet']) test('held physical funding prompt is revoked by ' + interrupt, async t => {
  const f = await ready(t), entered = deferred(), held = deferred(), feature = f.env.walletFake.wallet.features['solana:signTransaction'], original = feature.signTransaction;
  feature.signTransaction = async (...args) => { entered.resolve(); await held.promise; return original(...args); };
  const result = f.confirm(success(await f.prepare()).snapshot.review); await entered.promise;
  if (interrupt === 'lock') success(await f.controller.dispatch({ type: 'profile.lock' })); else f.controller.walletChanged();
  assert.equal(f.controller.snapshot().review, null); assert.equal(f.controller.snapshot().wallet, null);
  held.resolve(); assert.equal((await result).ok, false); assert.equal(f.env.cluster.sent.length, 0);
  assert.ok((await records(f)).intents.every(r => r.sendMarkedAt === null)); assert.equal((await records(f)).documents.length, 0);
});
test('uncertain funding keeps its marker and requires explicit definitive-drop rebuild', async t => {
  const f = await ready(t); f.env.cluster.sendBehavior = () => { throw Error('controlled uncertain transport'); };
  success(await f.confirm(success(await f.prepare()).snapshot.review)); const old = (await records(f)).intents[0];
  assert.equal(old.state, 'unknown'); assert.equal(f.controller.snapshot().trades.length, 0); assert.equal((await f.prepare()).ok, false);
  f.env.cluster.advance(200); success(await f.refresh()); assert.equal((await records(f)).intents[0].state, 'dropped');
  const review = success(await f.prepare({ rebuildOf: old.intentId })).snapshot.review;
  const replacement = (await records(f)).intents.find(r => r.replacementOf === old.intentId); assert.ok(replacement); assert.notEqual(replacement.message, old.message);
  assert.equal(f.env.cluster.sent.length, 1); success(await f.controller.dispatch({ type: 'review.cancel' }));
  assert.equal((await f.prepare({ rebuildOf: old.intentId })).ok, false); assert.equal(review.action, 'fund');
});

const utf8 = new TextEncoder(), json = input => utf8.encode(JSON.stringify(input));
const recoveryId = f => createHash('sha256').update('p2p-offramp/solana-local-recovery/v1' + String.fromCharCode(0) + f.recovery.termsHash).digest('hex').slice(0, 32);
test('another proposal cannot reuse the first wallet owner even with the same seller', async t => {
  const f = await ready(t); success(await f.save(f.proposal(2)));
  const second = f.controller.snapshot().proposals.find(p => p.id !== f.proposalId);
  assert.equal(second.walletConnected, false);
  assert.equal((await f.controller.dispatch({ type: 'funding.prepare', proposalId: second.id })).code, 'WALLET_REQUIRED');
  assert.equal((await records(f)).intents.length, 0); assert.equal(f.env.walletFake.calls.sign.length, 0);
});
test('same-profile unlock displays unmarked intent without RPC; explicit refresh cancels abandoned preparation', async t => {
  const f = await ready(t); success(await f.prepare()); const calls = f.env.cluster.calls.length;
  success(await f.controller.dispatch({ type: 'profile.lock' })); success(await f.reopen());
  assert.equal(f.env.cluster.calls.length, calls); assert.equal(f.controller.snapshot().proposals[0].intents[0].state, 'prepared');
  assert.equal(f.controller.snapshot().proposals[0].walletConnected, false);
  success(await f.refresh()); assert.equal((await records(f)).intents[0].state, 'cancelled'); assert.equal(f.env.cluster.sent.length, 0);
});
test('fresh-profile restore preserves uncertainty and original proposal origin through explicit rebuilt funding', async t => {
  const f = await ready(t); success(await f.prepare()); const original = (await records(f)).proposals[0].record;
  const bytes = success(await f.controller.dispatch({ type: 'backup.export' })).backupBytes, calls = f.env.cluster.calls.length;
  const restored = success(await f.controller.dispatch({ type: 'backup.restore', bytes, sourcePassphrase: PASS, destinationPassphrase: DEST }));
  const fresh = restored.snapshot.profileId;
  assert.notEqual(fresh, f.id); assert.equal(f.env.cluster.calls.length, calls); assert.equal(restored.snapshot.proposals[0].restored, true);
  success(await f.refresh()); assert.equal(f.controller.snapshot().proposals[0].intents[0].state, 'prepared');
  success(await f.connect()); assert.equal((await f.prepare()).code, 'PENDING_TRANSACTION'); assert.equal(f.env.cluster.sent.length, 0);
  f.env.cluster.advance(200); success(await f.refresh());
  const before = await readSolanaBrowserVaultRecords(await f.read(fresh, DEST)), old = before.intents[0]; assert.equal(old.state, 'dropped');
  f.env.cluster.sendBehavior = (_params, cluster) => { const signature = cluster.lastSentSignature(); cluster.advance(1); cluster.setEscrow(); cluster.land(signature); return signature; };
  success(await f.confirm(success(await f.prepare({ rebuildOf: old.intentId })).snapshot.review));
  const after = await readSolanaBrowserVaultRecords(await f.read(fresh, DEST)); assert.deepEqual(after.proposals[0].record, original);
  assert.equal(after.documents[0].originProfileId, f.id); assert.equal(after.intents.find(r => r.replacementOf === old.intentId).originProfileId, fresh);
  assert.equal(f.controller.snapshot().trades[0].restored, true); assert.equal(f.env.cluster.sent.length, 1);
});
test('trusted escrow promotion retains uncertain intents and does not open settlement', async t => {
  const f = await ready(t); f.env.cluster.sendBehavior = () => { throw Error('controlled uncertainty'); };
  success(await f.confirm(success(await f.prepare()).snapshot.review)); f.env.cluster.advance(1); f.env.cluster.setEscrow();
  const result = success(await f.refresh()); assert.equal(result.snapshot.trades[0].state, 'funded');
  assert.equal(result.snapshot.trades[0].intents[0].state, 'unknown'); assert.equal(result.snapshot.trades[0].canRelease, false);
  assert.equal((await records(f)).intents[0].state, 'unknown'); assert.equal(f.env.cluster.sent.length, 1);
});
for (const kind of ['trade', 'preference']) test('promotion refuses occupied ' + kind + ' ID without overwriting', async t => {
  const f = await ready(t), foreign = { id: recoveryId(f), kind, schemaVersion: 1, payload: encodeBase64url(json({ format: 'ordinary-unknown-family' })) };
  success(await f.seed([foreign])); f.env.cluster.setEscrow(); const writes = f.data.writes;
  const result = await f.refresh(); assert.equal(result.code, 'CONFLICT'); assert.equal(result.snapshot.profileId, null);
  assert.equal(f.data.writes, writes); assert.deepEqual((await f.read()).records.find(r => r.id === foreign.id), foreign);
});
test('known paired buyer recovery keeps original role and encrypted payload with no write', async t => {
  const f = await ready(t); f.env.cluster.setEscrow();
  success(await f.controller.dispatch({ type: 'recovery.import', text: JSON.stringify(f.recovery), role: 'buyer' }));
  const before = await f.read(), writes = f.data.writes; success(await f.refresh()); assert.deepEqual(await f.read(), before); assert.equal(f.data.writes, writes);
  success(await f.controller.dispatch({ type: 'wallet.connect', tradeId: f.recovery.termsHash }));
  assert.equal(f.controller.snapshot().trades[0].role, 'buyer'); assert.equal(f.controller.snapshot().proposals[0].walletConnected, false);
});
test('automatic promotion counts its existing binding once in a historical overflow inventory', async t => {
  const f = await ready(t), additional = [];
  for (let i = 0; i < 8; i++) {
    const { createSolanaFundingProposalRecord } = await import('../src/solana-localnet/funding-proposal.ts');
    additional.push((await createSolanaFundingProposalRecord(json(f.proposal(i + 2)), f.config, f.id)).record);
  }
  success(await f.seed(additional)); assert.equal(f.controller.snapshot().tradeCapacity.used, 9);
  f.env.cluster.setEscrow(); const result = success(await f.refresh()); assert.equal(result.snapshot.trades.length, 1);
  assert.equal(result.snapshot.tradeCapacity.used, 9); assert.equal((await records(f)).proposals.length, 9);
});
for (const interrupt of ['lock', 'wallet', 'conflict']) test('promotion atomic CAS cannot publish after ' + interrupt, async t => {
  const f = await ready(t); f.env.cluster.setEscrow(); const entered = deferred(), held = deferred(), writes = f.data.writes;
  f.data.before = async () => { entered.resolve(); await held.promise; };
  const result = f.refresh(); await entered.promise;
  if (interrupt === 'lock') success(await f.controller.dispatch({ type: 'profile.lock' })); else if (interrupt === 'wallet') f.controller.walletChanged(); else f.data.conflict = true;
  held.resolve(); const finished = await result; assert.equal(finished.ok, false); assert.equal(f.data.writes, writes);
  assert.equal((await records(f)).documents.length, 0); assert.equal(finished.snapshot.trades.length, 0);
});
test('a revision change after the promotion occupancy read cannot be adopted to overwrite a concurrent record', async t => {
  const f = await ready(t); f.env.cluster.setEscrow(); const id = recoveryId(f), original = EncryptedVaultService.prototype.read;
  const occupant = { id, kind: 'preference', schemaVersion: 1, payload: encodeBase64url(json({ saved: 'concurrent writer' })) }; let injected = false;
  EncryptedVaultService.prototype.read = async function(...args) {
    const result = await Reflect.apply(original, this, args);
    if (!injected && args[1] === id && result.ok && result.value === null) {
      injected = true; value(await this.commit(args[0], f.data.rows.get(f.id).revision, [{ op: 'put', record: occupant }]));
    }
    return result;
  };
  try { const result = await f.refresh(); assert.equal(result.code, 'CONFLICT'); assert.equal(result.snapshot.profileId, null); }
  finally { EncryptedVaultService.prototype.read = original; }
  assert.equal(injected, true); assert.deepEqual((await f.read()).records.find(r => r.id === id), occupant);
});
for (const interrupt of ['lock', 'wallet']) test('held recovery-ID hashing cannot promote after ' + interrupt, async t => {
  const f = await ready(t); f.env.cluster.setEscrow(); const entered = deferred(), held = deferred(), original = crypto.subtle.digest; let intercepted = false;
  crypto.subtle.digest = async function(...args) { if (!intercepted) { intercepted = true; entered.resolve(); await held.promise; } return Reflect.apply(original, this, args); };
  try {
    const result = f.refresh(); await entered.promise;
    if (interrupt === 'lock') success(await f.controller.dispatch({ type: 'profile.lock' })); else f.controller.walletChanged();
    held.resolve(); assert.equal((await result).ok, false); assert.equal((await records(f)).documents.length, 0);
  } finally { held.resolve(); crypto.subtle.digest = original; }
});
for (const [label, options] of [
  ['wrong seller', { walletFake: makeWallet([BUYER]) }],
  ['expired acceptance', { termsChanges: { acceptBeforeSeconds: '0' } }],
  ['non-core commitment', { termsChanges: { capabilitiesHash: '00'.repeat(32) } }],
]) test('native funding policy refuses ' + label + ' before preparation or signing', async t => {
  const f = await fixture(t, options); success(await f.save({ format: 'p2p-offramp/solana-local-funding-proposal/v1', terms: f.env.terms }));
  const proposalId = f.controller.snapshot().proposals[0].id, connected = await f.controller.dispatch({ type: 'funding.wallet.connect', proposalId });
  const result = connected.ok ? await f.controller.dispatch({ type: 'funding.prepare', proposalId }) : connected;
  assert.equal(result.ok, false); assert.equal(f.env.walletFake.calls.sign.length, 0); assert.equal(f.env.cluster.sent.length, 0);
  assert.equal((await records(f)).intents.length, 0); assert.equal((await records(f)).documents.length, 0);
});
test('changed program data prevents review and clears the current finalized observation', async t => {
  const f = await ready(t); f.env.cluster.world.accounts.delete(PROGRAM_DATA);
  const result = await f.prepare(); assert.equal(result.ok, false); assert.equal(result.snapshot.proposals[0].state, 'unverified');
  assert.equal((await records(f)).intents.length, 0); assert.equal(f.env.walletFake.calls.sign.length, 0);
});
test('stale and failed finalized observations cannot appear current or establish recovery', async t => {
  const f = await ready(t); f.advanceNow(60001); assert.equal(f.controller.snapshot().proposals[0].state, 'unverified');
  assert.equal(f.controller.snapshot().proposals[0].chainTimeSeconds, null);
  f.env.cluster.handle = () => { throw Error('controlled offline RPC'); }; success(await f.refresh());
  assert.equal(f.controller.snapshot().proposals[0].state, 'unverified'); assert.equal((await records(f)).documents.length, 0);
});

test('idle expiry between snapshot ownership checks keeps each projection coherent and subsequent actions locked', async t => {
  const f = await ready(t), calls = f.env.cluster.calls.length; let reads = 0;
  f.setMonotonic(() => reads++ === 0 ? 299999 : 300000);
  const first = f.controller.snapshot();
  const assertLocked = snapshot => {
    assert.equal(snapshot.phase, 'locked'); assert.equal(snapshot.profileId, null); assert.equal(snapshot.wallet, null);
    assert.deepEqual(snapshot.proposals, []); assert.deepEqual(snapshot.trades, []); assert.equal(snapshot.review, null);
    assert.deepEqual(snapshot.tradeCapacity, { used: 0, limit: 8 });
  };
  if (first.phase === 'ready') {
    assert.equal(first.profileId, f.id); assert.notEqual(first.wallet, null); assert.equal(first.proposals.length, 1);
    assert.equal(first.proposals[0].id, f.proposalId); assert.equal(first.proposals[0].walletConnected, true);
    assert.deepEqual(first.tradeCapacity, { used: 1, limit: 8 });
  } else assertLocked(first);
  assertLocked(f.controller.snapshot());
  const denied = await f.prepare(); assert.equal(denied.ok, false); assert.equal(denied.code, 'LOCKED'); assertLocked(denied.snapshot);
  assert.equal(f.env.cluster.calls.length, calls); assert.equal(f.env.walletFake.calls.sign.length, 0);
  assert.equal(f.env.cluster.sent.length, 0); assert.equal((await records(f)).intents.length, 0);
});
