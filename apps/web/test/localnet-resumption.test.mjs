import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalnetCommand } from '../src/localnet/validation.ts';
import { PASS, RESTORED_PASS, world, negotiate } from './support/localnet-resumption-fixture.mjs';

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
