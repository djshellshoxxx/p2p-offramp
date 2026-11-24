import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalnetCommand } from '../src/localnet/validation.ts';
import { EncryptedVaultService } from '../../../packages/storage/src/vault-service.ts';
import { decodeBase64url, encodeBase64url } from '../../../packages/schemas/index.ts';
import { PASS, RESTORED_PASS, world, negotiate, until } from './support/localnet-resumption-fixture.mjs';

async function reopen(owner) {
  const profileId = owner.snapshot.profileId;
  await owner.command({ type: 'profile.lock' });
  await owner.command({ type: 'profile.unlock', profileId, passphrase: PASS });
  await owner.command({ type: 'wallet.connect' });
}

test('resumption command selects one saved trade and accepts no peer proof or wallet request from the document', () => {
  const command = { type: 'trade.resume', tradeId: 'aa'.repeat(32) };
  assert.deepEqual(parseLocalnetCommand(command), command);
  for (const extra of [{ checkpoint: {} }, { account: `0x${'11'.repeat(20)}` }, { notAfterSeconds: '9999999999' }, { walletRequests: [] }])
    assert.throws(() => parseLocalnetCommand({ ...command, ...extra }));
});

for (const restored of [false, true]) test(`complete bilateral terms require explicit resume and a new funding review after ${restored ? 'fresh profile restore' : 'lock/unlock'}`, async t => {
  const w = await world(t), id = await negotiate(w), original = w.seller.snapshot;
  const before = { ...w.chain.counts };
  let owner = w.seller;
  if (restored) {
    const backup = (await owner.command({ type: 'backup.export' })).backupBytes;
    owner.close(); owner = await w.party(0);
    await owner.command({ type: 'backup.restore', bytes: backup, sourcePassphrase: PASS, destinationPassphrase: RESTORED_PASS });
    assert.notEqual(owner.snapshot.profileId, original.profileId);
  } else {
    await owner.command({ type: 'profile.lock' });
    await owner.command({ type: 'profile.unlock', profileId: original.profileId, passphrase: PASS });
  }
  assert.equal(owner.snapshot.publicKey, original.publicKey);
  assert.equal(owner.snapshot.trades[0].id, id);
  assert.equal(owner.snapshot.wallet, null); assert.equal(owner.snapshot.review, null);
  assert.equal(owner.snapshot.trades[0].canFund, false);
  assert.deepEqual(w.chain.counts, before, 'unlock/restore never reconnects, signs, or sends');
  await owner.command({ type: 'wallet.connect' });
  assert.equal(owner.snapshot.trades[0].canFund, false, 'wallet reconnect alone cannot resume a trade');
  await owner.command({ type: 'trade.resume', tradeId: id });
  const resumed = owner.snapshot.trades[0];
  assert.equal(resumed.id, id); assert.equal(resumed.peerAcceptance, 'both-verified'); assert.equal(resumed.resumption, 'ready');
  assert.equal(resumed.canFund, true); assert.equal(owner.snapshot.review, null);
  assert.equal(w.chain.counts.signatures, before.signatures); assert.equal(w.chain.counts.sends, before.sends);
  await owner.command({ type: 'trade.resume', tradeId: id });
  assert.equal(owner.snapshot.trades.length, 1, 'repeat resume is idempotent');
  await owner.command({ type: 'review.prepare', action: 'fund', tradeId: id });
  assert.equal(owner.snapshot.review.action, 'fund'); assert.equal(w.chain.counts.sends, before.sends);
  await owner.command({ type: 'review.cancel' }); assert.equal(w.chain.counts.sends, before.sends);
});

test('interrupted seller-only negotiation is not converted into bilateral authorization on restore', async t => {
  const w = await world(t), id = await negotiate(w, { complete: false }), profileId = w.seller.snapshot.profileId;
  await w.seller.command({ type: 'profile.lock' });
  await w.seller.command({ type: 'profile.unlock', profileId, passphrase: PASS });
  await w.seller.command({ type: 'wallet.connect' });
  const before = { ...w.chain.counts }, result = await w.seller.command({ type: 'trade.resume', tradeId: id }, false);
  assert.equal(result.code, 'RESUMPTION_HISTORY_UNAVAILABLE');
  assert.equal(result.snapshot.trades[0].canFund, false); assert.equal(result.snapshot.review, null);
  assert.deepEqual(w.chain.counts, before);
});

test('resumption refuses wrong account/network, changed peer classification and expired terms without a wallet prompt', async t => {
  const w = await world(t), id = await negotiate(w); await reopen(w.seller);
  const { seller, chain } = w, before = { ...chain.counts };
  seller.external.state.account = w.addresses[1]; seller.external.emit('accountsChanged', [w.addresses[1]]);
  await seller.command({ type: 'wallet.connect' });
  assert.equal((await seller.command({ type: 'trade.resume', tradeId: id }, false)).code, 'UNAUTHORIZED');
  seller.external.state.account = w.addresses[0]; seller.external.emit('accountsChanged', [w.addresses[0]]);
  await seller.command({ type: 'wallet.connect' });
  chain.chainId = '0x1';
  assert.equal((await seller.command({ type: 'trade.resume', tradeId: id }, false)).code, 'WRONG_CHAIN');
  assert.equal(seller.snapshot.trades[0].canFund, false); chain.chainId = '0x7a69';
  chain.codes.set(w.addresses[1], `0xef0100${'77'.repeat(20)}`);
  assert.equal((await seller.command({ type: 'trade.resume', tradeId: id }, false)).code, 'UNSUPPORTED_ACCOUNT');
  assert.equal(seller.snapshot.trades[0].canFund, false); chain.codes.clear();
  chain.now += 901;
  assert.equal((await seller.command({ type: 'trade.resume', tradeId: id }, false)).code, 'EXPIRED');
  assert.equal(seller.snapshot.trades[0].canFund, false);
  assert.equal(chain.counts.sends, before.sends); assert.equal(chain.counts.signatures, before.signatures);
});

test('corrupted encrypted checkpoint blocks unfunded resumption without hiding funded exits', async t => {
  const w = await world(t), id = await negotiate(w), profileId = w.seller.snapshot.profileId, original = w.seller.snapshot.trades[0];
  await w.seller.command({ type: 'profile.lock' });
  const vault = new EncryptedVaultService(w.seller.store, crypto, { lifecycle: false });
  const session = await vault.unlock(profileId, PASS); assert.equal(session.ok, true);
  try {
    const listed = await vault.list(session.value.sessionId, 'preference'); assert.equal(listed.ok, true);
    const entry = listed.value.map(record => ({ record, raw: JSON.parse(new TextDecoder().decode(decodeBase64url(record.payload, 1, 262144))) }))
      .find(({ raw }) => raw.format === 'p2p-offramp/localnet-exchange-history/v1');
    assert.ok(entry, 'a completed agreement must retain encrypted bilateral evidence');
    entry.raw.checkpoint.history[0].wrap.content = 'not authenticated ciphertext';
    const payload = encodeBase64url(new TextEncoder().encode(JSON.stringify(entry.raw)));
    assert.equal((await vault.commit(session.value.sessionId, session.value.revision, [{ op: 'put', record: { ...entry.record, payload } }])).ok, true);
  } finally { vault.dispose(); }
  await w.seller.command({ type: 'profile.unlock', profileId, passphrase: PASS }); await w.seller.command({ type: 'wallet.connect' });
  await w.seller.command({ type: 'trade.resume', tradeId: id }, false);
  assert.equal(w.seller.snapshot.trades[0].canFund, false);
  const word = value => BigInt(value).toString(16).padStart(64, '0');
  w.chain.escrows.set(id, `0x${[original.seller, original.escrowExpirySeconds, 1, original.buyer, 0, original.amountBaseUnits].map(word).join('')}`);
  await w.seller.command({ type: 'refresh' });
  assert.equal(w.seller.snapshot.trades[0].chainState, 'funded'); assert.equal(w.seller.snapshot.trades[0].canRelease, true);
});

test('fresh-profile restoration keeps the D9 hold on an imported prepared funding intent', async t => {
  const w = await world(t), id = await negotiate(w);
  await w.seller.command({ type: 'review.prepare', action: 'fund', tradeId: id });
  const backup = (await w.seller.command({ type: 'backup.export' })).backupBytes, before = { ...w.chain.counts };
  w.seller.close(); const owner = await w.party(0);
  await owner.command({ type: 'backup.restore', bytes: backup, sourcePassphrase: PASS, destinationPassphrase: RESTORED_PASS });
  await owner.command({ type: 'wallet.connect' });
  const held = await owner.command({ type: 'trade.resume', tradeId: id }, false);
  assert.equal(held.code, 'RECOVERY_SELECTION_REQUIRED'); assert.equal(owner.snapshot.trades[0].canFund, false);
  assert.equal(w.chain.counts.signatures, before.signatures); assert.equal(w.chain.counts.sends, before.sends);
});

test('locking during a resumption read prevents a late restored session or private projection', async t => {
  const w = await world(t), id = await negotiate(w); await reopen(w.seller);
  let release, began = false; const gate = new Promise(resolve => { release = resolve; });
  w.chain.hold = async () => { began = true; await gate; };
  const pending = w.seller.controller.dispatch({ type: 'trade.resume', tradeId: id });
  try {
    await until(() => began); await w.seller.controller.dispatch({ type: 'profile.lock' });
    release(); const result = await pending;
    assert.equal(result.ok, false); assert.equal(w.seller.snapshot.phase, 'locked'); assert.deepEqual(w.seller.snapshot.trades, []);
    assert.equal(w.chain.counts.sends, 0);
  } finally { release(); w.chain.hold = null; }
});

test('fresh-key restore retires a pending release review and never restores its consent', async t => {
  const w = await world(t), id = await negotiate(w), { seller, chain } = w;
  const original = seller.snapshot.trades[0], sourceId = seller.snapshot.profileId;
  const word = value => BigInt(value).toString(16).padStart(64, '0');
  chain.escrows.set(id, `0x${[original.seller, original.escrowExpirySeconds, 1, original.buyer, 0, original.amountBaseUnits].map(word).join('')}`);
  await seller.command({ type: 'refresh' });
  assert.equal(seller.snapshot.trades[0].chainState, 'funded');
  assert.equal(seller.snapshot.trades[0].canRelease, true);

  const before = { ...chain.counts };
  await seller.command({ type: 'review.prepare', action: 'release', tradeId: id, fiatReceiptConfirmed: true });
  const pending = seller.snapshot.review;
  assert.ok(pending);
  assert.equal(pending.action, 'release');
  assert.deepEqual(chain.counts, before, 'preparation must not sign, connect or send');

  const backup = (await seller.command({ type: 'backup.export' })).backupBytes;
  assert.equal(seller.snapshot.review?.id, pending.id, 'the source must still hold the pending review at export');
  const retained = backup.slice(), sourceRow = structuredClone(seller.store.rows.get(sourceId));
  assert.ok(sourceRow);
  const restored = await seller.command({ type: 'backup.restore', bytes: backup,
    sourcePassphrase: PASS, destinationPassphrase: RESTORED_PASS });
  const destinationId = restored.snapshot.profileId;
  assert.ok(destinationId);
  assert.notEqual(destinationId, sourceId);
  assert.equal(restored.restoredProfileId, destinationId);
  assert.equal(restored.snapshot.review, null);
  assert.equal(restored.snapshot.wallet, null);
  assert.equal(seller.store.rows.size, 2);
  assert.deepEqual(seller.store.rows.get(sourceId), sourceRow);
  assert.deepEqual(backup, retained);
  assert.deepEqual(chain.counts, before, 'restore must not sign, connect or send');

  // Use the controller boundary directly: the fixture helper requires a current
  // review to grant the synthetic bridge permission before issuing confirmation.
  const refuseRetiredReview = async () => {
    // Restore/reconnect can leave signed relay history draining. Wait for the
    // normal ready phase, just as the fixture command helper does, so BUSY
    // cannot mask the exact retired-review refusal being tested.
    await until(() => seller.snapshot.phase === 'ready', 'restored controller ready for stale-review refusal');
    assert.equal(seller.snapshot.profileId, destinationId);
    assert.equal(seller.snapshot.review, null);
    const count = seller.external.calls.length, effects = { ...chain.counts };
    const refused = await seller.controller.dispatch({ type: 'review.confirm', reviewId: pending.id });
    assert.equal(refused.ok, false);
    assert.equal(refused.code, 'REVIEW_EXPIRED');
    assert.equal(refused.snapshot.review, null);
    assert.equal(seller.external.calls.length, count, 'stale consent must not reach the provider');
    assert.deepEqual(chain.counts, effects);
  };
  await refuseRetiredReview();
  await seller.command({ type: 'wallet.connect' });
  assert.equal(seller.snapshot.profileId, destinationId);
  await refuseRetiredReview();
  assert.equal(chain.counts.signatures, before.signatures);
  assert.equal(chain.counts.sends, before.sends);
  assert.deepEqual(seller.store.rows.get(sourceId), sourceRow);
  assert.deepEqual(backup, retained);
});
