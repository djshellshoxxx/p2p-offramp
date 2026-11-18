#!/usr/bin/env node
/** Real localnet controller/bridge qualification: independent encrypted profiles, Anvil escrow and Nostr relay.
 * No browser UI claim: native browser qualification is a separate hosted gate. Wallet keys stay in the shared public Anvil fixture. */
import assert from 'node:assert/strict';
import { LocalnetController } from '../apps/web/src/localnet/controller.ts';
import { createLocalnetWalletBridge } from '../apps/web/src/localnet/wallet-bridge.ts';
import { VaultStorageError } from '../packages/storage/src/idb-vault-store.ts';
import { openEnvelope, disposeMaterial } from '../packages/storage/src/vault-crypto.ts';
import { decodeIntentPayload } from '../packages/schemas/index.ts';
import { buildGetTrade, decodeTrade } from '../packages/wallet/localnet.ts';
import { startLocalnetFixture } from './lib/localnet-fixture.mjs';
import { assertLocalnetSendMarked } from './lib/localnet-send-evidence.mjs';

const PASS = 'public synthetic independent browser profile passphrase';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [], clients = new Set();
const pass = label => { results.push(label); console.log(`ok - ${label}`); };
let fixture, rpc, relay, config, clock, counts, addresses, markers = 0;
async function until(check, label, timeout = 15_000) {
  const start = Date.now();
  while (!await check()) { if (Date.now() - start > timeout) throw new Error(`Timed out: ${label}`); await delay(20); }
}
function memoryStore() {
  const rows = new Map();
  return { rows,
    async get(id) { return structuredClone(rows.get(id)); },
    async add(row, options) { options?.assertCurrent?.(); if (rows.has(row.profileId)) throw new VaultStorageError('ALREADY_EXISTS'); rows.set(row.profileId, structuredClone(row)); },
    async compareAndSwap(before, after, options) { options?.assertCurrent?.(); if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
      if (JSON.stringify(rows.get(before.profileId)) !== JSON.stringify(before)) throw new VaultStorageError('CONFLICT'); rows.set(after.profileId, structuredClone(after)); },
    async listProfileIds() { return { profileIds: [...rows.keys()], truncated: false }; }, subscribeInvalidation: () => () => {},
  };
}
async function createParty(index, store = memoryStore(), restoredPassphrase = PASS, wallClockOffsetMs = 0) {
  let controller;
  const external = fixture.provider(index, { beforeSend: async transaction => {
    // Observe encrypted storage from the fixture before allowing the external wallet to broadcast.
    const profile = controller.snapshot().profileId, opened = await openEnvelope(store.rows.get(profile), restoredPassphrase, crypto);
    try {
      const recorded = opened.snapshot.records.filter(record => record.kind === 'journal').map(record => decodeIntentPayload(record.payload));
      assertLocalnetSendMarked(recorded, transaction, profile); markers++;
    } finally { disposeMaterial(opened.material); }
  } });
  const now = () => clock * 1000 + wallClockOffsetMs;
  const bridge = createLocalnetWalletBridge(external, now);
  const forwarded = { request: request => bridge.request(request), on: external.on, removeListener: external.removeListener };
  controller = new LocalnetController(config, forwarded, { store, now });
  const party = {
    controller, store, get snapshot() { return controller.snapshot(); },
    loseSendResponse() { external.state.loseNextSend = true; },
    async command(command, expected = true) {
      await until(() => controller.snapshot().phase !== 'working', `party ${index} idle`);
      let finish = () => {};
      if (command.type === 'wallet.connect') finish = bridge.beginConnect();
      else if (command.type === 'review.confirm') finish = bridge.beginReview(controller.snapshot().review);
      else if (command.type === 'profile.lock' || command.type === 'review.cancel') bridge.revoke();
      try {
        const result = await controller.dispatch(command);
        assert.equal(result.ok, expected, `${command.type}: ${JSON.stringify(result)}`); return result;
      } finally { finish(); }
    },
    async close() { bridge.dispose(); controller.dispose(); clients.delete(party); },
  };
  clients.add(party); return party;
}
async function waitTrade(party, id, predicate) { await until(() => predicate(party.snapshot.trades.find(trade => trade.id === id)), `trade ${id} update for ${party.snapshot.publicKey}`); }
async function review(party, command) {
  const before = counts.signatures + counts.sends; await party.command({ type: 'review.prepare', ...command });
  assert.equal(counts.signatures + counts.sends, before, 'preparation never prompts or sends'); const candidate = party.snapshot.review; assert.ok(candidate);
  return candidate;
}
async function acceptTrade(seller, buyer) {
  const previousAds = new Set(seller.snapshot.ads.map(ad => ad.key));
  await seller.command({ type: 'ad.publish', assetId: 'native', amountBaseUnits: '1000000000000000', currency: 'USD' });
  const advertised = seller.snapshot.ads.find(ad => ad.own && !previousAds.has(ad.key)); assert.ok(advertised);
  await until(() => buyer.snapshot.ads.some(ad => ad.key === advertised.key), 'buyer sees seller advertisement');
  const ad = buyer.snapshot.ads.find(ad => ad.key === advertised.key);
  // One active advertisement per call: the newest seller revision/order is the one absent from seller session metadata.
  const known = new Set(seller.snapshot.sessions.map(session => session.id));
  await buyer.command({ type: 'ad.take', adKey: ad.key });
  await until(() => seller.snapshot.sessions.some(session => !known.has(session.id)), 'seller receives encrypted take');
  const session = seller.snapshot.sessions.find(session => !known.has(session.id));
  await seller.command({ type: 'session.select', sessionId: session.id });
  assert.deepEqual(seller.snapshot.sessions.filter(item => item.selected).map(item => item.id), [session.id], 'one display selection even with several canonically pinned seller sessions');
  const offered = await review(seller, { action: 'offer', sessionId: session.id, fiatMinorUnits: '2500', fiatScale: 2,
    paymentInstructions: 'SYNTHETIC private bank instructions only for local test funds.' });
  assert.equal(offered.walletRequests.length, 2);
  await seller.command({ type: 'review.confirm', reviewId: offered.id });
  const id = seller.snapshot.trades.find(trade => trade.sessionId === session.id).id;
  await waitTrade(buyer, id, trade => trade?.peerAcceptance === 'seller-verified');
  const buyerSession = buyer.snapshot.trades.find(trade => trade.id === id).sessionId;
  await buyer.command({ type: 'session.select', sessionId: buyerSession });
  assert.deepEqual(buyer.snapshot.sessions.filter(item => item.selected).map(item => item.id), [buyerSession], 'buyer can select received terms for the UI acceptance review');
  const accepted = await review(buyer, { action: 'accept', sessionId: buyerSession });
  await buyer.command({ type: 'review.confirm', reviewId: accepted.id });
  await waitTrade(seller, id, trade => trade?.peerAcceptance === 'both-verified');
  assert.equal(seller.snapshot.trades.find(trade => trade.id === id).chainState, 'absent');
  return id;
}
async function mine(count = 5) { clock = await fixture.mine(count); }

try {
  fixture = await startLocalnetFixture();
  ({ config, rpc, relay, counts, accounts: addresses } = fixture);
  const { escrow } = fixture; clock = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
  const seller = await createParty(0), buyer = await createParty(1);
  await seller.command({ type: 'profile.create', passphrase: PASS }); await buyer.command({ type: 'profile.create', passphrase: PASS });
  assert.notEqual(seller.snapshot.profileId, buyer.snapshot.profileId); assert.notEqual(seller.snapshot.publicKey, buyer.snapshot.publicKey);
  await seller.command({ type: 'wallet.connect' }); await buyer.command({ type: 'wallet.connect' });
  pass('independent encrypted profiles own distinct messaging identities and explicitly connect different external wallets');
  const first = await acceptTrade(seller, buyer);
  assert.equal(counts.signatures, 4); assert.equal(counts.sends, 0);
  pass('real encrypted take/offer/accept uses current D1 with four exact reviewed wallet signatures and no funding');
  await buyer.command({ type: 'chat.send', tradeId: first, text: 'SYNTHETIC durable private chat: payment claimed, not bank-confirmed.' });
  await waitTrade(seller, first, trade => trade?.chat.length === 1);
  assert.equal(counts.sends, 0); assert.equal(seller.snapshot.trades.find(trade => trade.id === first).chainState, 'absent');
  pass('durable encrypted chat reaches the independent peer without creating chain or fiat authority');
  const cancelled = await review(seller, { action: 'fund', tradeId: first }); await seller.command({ type: 'review.cancel' });
  assert.equal(counts.sends, 0); const expired = await seller.controller.dispatch({ type: 'review.confirm', reviewId: cancelled.id }); assert.equal(expired.ok, false);
  const funding = await review(seller, { action: 'fund', tradeId: first }); await seller.command({ type: 'review.confirm', reviewId: funding.id }); await mine();
  await seller.command({ type: 'refresh' }); await buyer.command({ type: 'refresh' });
  assert.equal(seller.snapshot.trades.find(trade => trade.id === first).chainState, 'funded'); assert.equal(counts.sends, 1);
  const refusedRelease = await seller.command({ type: 'review.prepare', action: 'release', tradeId: first }, false); assert.equal(refusedRelease.code, 'FIAT_RECEIPT_CONFIRMATION_REQUIRED');
  pass('cancelled preparation sends nothing; funding writes a durable marker and release requires explicit bank-receipt confirmation');
  const releasing = await review(seller, { action: 'release', tradeId: first, fiatReceiptConfirmed: true });
  await seller.command({ type: 'review.confirm', reviewId: releasing.id }); await mine(); await seller.command({ type: 'refresh' });
  assert.equal(seller.snapshot.trades.find(trade => trade.id === first).chainState, 'released');
  assert.equal(decodeTrade(await rpc('eth_call', [{ to: escrow, data: buildGetTrade(escrow, first).data }, 'latest'])).state, 'released');
  pass('seller release reaches canonical native escrow state after a new exact transaction review');

  // A second negotiation in the same two independent profiles exercises real UI session selection and full history backup.
  const recoverySeller = seller, recoveryBuyer = buyer;
  const second = await acceptTrade(recoverySeller, recoveryBuyer);
  assert.equal(recoverySeller.snapshot.trades.length, 2); assert.equal(recoveryBuyer.snapshot.trades.length, 2);
  pass('buyer display selection and a second seller negotiation remain independent of canonical seller intake pinning');
  await recoverySeller.command({ type: 'chat.send', tradeId: second, text: 'SYNTHETIC encrypted history survives unknown broadcast restore.' });
  const unknownReview = await review(recoverySeller, { action: 'fund', tradeId: second }); recoverySeller.loseSendResponse();
  const unknown = await recoverySeller.command({ type: 'review.confirm', reviewId: unknownReview.id }, false); assert.equal(unknown.code, 'BROADCAST_UNKNOWN');
  assert.ok(unknown.snapshot.trades.find(trade => trade.id === second).intents.some(intent => intent.state === 'broadcast-unknown' && intent.hash === null));
  const beforeRestoreSends = counts.sends, oldProfile = recoverySeller.snapshot.profileId, key = recoverySeller.snapshot.publicKey;
  const backup = await recoverySeller.command({ type: 'backup.export' }); await recoverySeller.close(); await mine();
  const restored = await createParty(0, memoryStore(), PASS + ' fresh-key', -120_000);
  const restoredResult = await restored.command({ type: 'backup.restore', bytes: backup.backupBytes, sourcePassphrase: PASS, destinationPassphrase: PASS + ' fresh-key' });
  assert.notEqual(restoredResult.restoredProfileId, oldProfile); assert.equal(restored.snapshot.publicKey, key); assert.equal(counts.sends, beforeRestoreSends);
  assert.equal(restored.snapshot.trades.find(trade => trade.id === second).restored, true); assert.equal(restored.snapshot.trades.find(trade => trade.id === second).canFund, false);
  await restored.command({ type: 'wallet.connect' }); assert.equal(counts.sends, beforeRestoreSends);
  assert.equal(restored.snapshot.trades.find(trade => trade.id === second).chainState, 'funded'); assert.equal(restored.snapshot.trades.find(trade => trade.id === second).intents[0].state, 'finalized');
  assert.equal(restored.snapshot.trades.find(trade => trade.id === second).chat.length, 1); assert.equal(restored.snapshot.trades.find(trade => trade.id === second).canRelease, true);
  pass('unknown broadcast retains its null hash and marker; fresh-key restore reconciles native effect without resending or requiring fresh D1 acceptance for exits');
  const abandonedSeller = await createParty(0), abandonedBuyer = await createParty(1);
  await abandonedSeller.command({ type: 'profile.create', passphrase: PASS }); await abandonedBuyer.command({ type: 'profile.create', passphrase: PASS });
  await abandonedSeller.command({ type: 'wallet.connect' }); await abandonedBuyer.command({ type: 'wallet.connect' });
  const abandonedTrade = await acceptTrade(abandonedSeller, abandonedBuyer);
  await review(abandonedSeller, { action: 'fund', tradeId: abandonedTrade });
  const abandonedProfileId = abandonedSeller.snapshot.profileId, beforeAbandon = counts.sends;
  await abandonedSeller.command({ type: 'profile.lock' }); await mine(15);
  await abandonedSeller.command({ type: 'profile.unlock', profileId: abandonedProfileId, passphrase: PASS });
  await abandonedSeller.command({ type: 'wallet.connect' });
  const abandoned = abandonedSeller.snapshot.trades.find(trade => trade.id === abandonedTrade);
  assert.equal(counts.sends, beforeAbandon); assert.equal(abandoned.chainState, 'absent'); assert.equal(abandoned.canFund, false);
  assert.equal(abandoned.intents[0].state, 'expired');
  pass('abandoned funding review reconciles after lock/reopen without demanding the lost ephemeral D1 session or authorizing resubmission');
  await review(restored, { action: 'release', tradeId: second, fiatReceiptConfirmed: true });
  const restoredProfileId = restored.snapshot.profileId;
  await restored.command({ type: 'profile.lock' }); await mine(15);
  await restored.command({ type: 'profile.unlock', profileId: restoredProfileId, passphrase: PASS + ' fresh-key' });
  await restored.command({ type: 'wallet.connect' });
  assert.equal(counts.sends, beforeRestoreSends); assert.equal(restored.snapshot.trades.find(trade => trade.id === second).chainState, 'funded');
  assert.equal(restored.snapshot.trades.find(trade => trade.id === second).canRelease, true, JSON.stringify(restored.snapshot.trades.find(trade => trade.id === second).intents));
  assert.ok(restored.snapshot.trades.find(trade => trade.id === second).intents.some(intent => intent.action === 'release' && intent.state === 'expired'));
  pass('abandoned release review expires through native reconciliation after lock/reopen and does not prevent a fresh funded exit');
  const refundAt = Number(restored.snapshot.trades.find(trade => trade.id === second).escrowExpirySeconds) + 1;
  await rpc('evm_setNextBlockTimestamp', [refundAt]); await mine();
  await restored.command({ type: 'refresh' });
  assert.equal(restored.snapshot.trades.find(trade => trade.id === second).canRefund, true, 'native expiry enables refund even while the browser clock is two minutes behind');
  assert.equal(restored.snapshot.trades.find(trade => trade.id === second).canRelease, false, 'native expiry disables the contract-forbidden release');
  const expiredRelease = await restored.command({ type: 'review.prepare', action: 'release', tradeId: second, fiatReceiptConfirmed: true }, false);
  assert.equal(expiredRelease.code, 'EXPIRED'); assert.equal(restored.snapshot.review, null);
  pass('refund eligibility uses the rechecked canonical block time despite a deliberately skewed browser clock');
  const refund = await review(restored, { action: 'refund', tradeId: second });
  assert.ok(refund.fields.some(field => field.label === 'Supersedes reconciled intent'), 'the user reviews the explicit successor of the abandoned nonce reservation');
  await restored.command({ type: 'review.confirm', reviewId: refund.id }); await mine(); await restored.command({ type: 'refresh' });
  assert.equal(restored.snapshot.trades.find(trade => trade.id === second).chainState, 'refunded'); assert.equal(counts.sends, beforeRestoreSends + 1);
  assert.equal(decodeTrade(await rpc('eth_call', [{ to: escrow, data: buildGetTrade(escrow, second).data }, 'latest'])).state, 'refunded');
  assert.equal(markers, counts.sends);
  pass('restored original seller refunds after native expiry through one new reviewed transaction and canonical journal');
  const wire = JSON.stringify(relay.events);
  for (const privateText of ['SYNTHETIC private bank', 'SYNTHETIC durable private chat', addresses[0], addresses[1], 'terms-accept', 'sellerNonce']) assert.equal(wire.includes(privateText), false);
  await restored.command({ type: 'profile.lock' }); assert.equal(restored.snapshot.publicKey, null); assert.deepEqual(restored.snapshot.trades, []);
  pass('relay contains only public ads/ciphertext and lock removes all decrypted trade/chat projections');
  console.log(JSON.stringify({ ok: true, kind: 'LOCAL_CONTROLLER_PROOF', checks: results.length, walletPrompts: counts.signatures, sends: counts.sends, durableMarkers: markers, ReleaseEnabled: 0, browserQualification: false }, null, 2));
} finally {
  for (const client of [...clients]) await client.close();
  await fixture?.close();
}
