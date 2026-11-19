#!/usr/bin/env node
/** ERC-20 localnet application acceptance against real Anvil, independent encrypted profiles and current D1.
 * Disposable published fixture keys stay in Node; this command does not claim browser or public testnet acceptance. */
import assert from 'node:assert/strict';
import { LocalnetController } from '../apps/web/src/localnet/controller.ts';
import { createLocalnetWalletBridge } from '../apps/web/src/localnet/wallet-bridge.ts';
import { VaultStorageError } from '../packages/storage/src/idb-vault-store.ts';
import { openEnvelope, disposeMaterial } from '../packages/storage/src/vault-crypto.ts';
import { decodeIntentPayload } from '../packages/schemas/index.ts';
import { buildErc20Approve, buildErc20BalanceOf } from '../packages/wallet/localnet.ts';
import { assertLocalnetSendMarked } from './lib/localnet-send-evidence.mjs';
import { startLocalnetFixture } from './lib/localnet-fixture.mjs';

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
    external,
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
async function acceptTrade(seller, buyer, amount = '2500') {
  const previousAds = new Set(seller.snapshot.ads.map(ad => ad.key));
  await seller.command({ type: 'ad.publish', assetId: 'test-token', amountBaseUnits: amount, currency: 'USD' });
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
  await until(() => seller.snapshot.phase === 'ready' && buyer.snapshot.phase === 'ready', 'both peers finish canonical token-state observation');
  assert.equal(seller.snapshot.trades.find(trade => trade.id === id).chainState, 'absent');
  return id;
}
async function mine(count = 5) { clock = await fixture.mine(count); }

async function confirm(party, review) { return party.command({ type: 'review.confirm', reviewId: review.id }); }
const findTrade = (party, id) => party.snapshot.trades.find(trade => trade.id === id);
async function refreshBoth(seller, buyer) { await mine(); await seller.command({ type: 'refresh' }); await buyer.command({ type: 'refresh' }); }
async function balance(account) {
  const call = buildErc20BalanceOf(fixture.token, account);
  return BigInt(await rpc('eth_call', [{ to: call.to, data: call.data }, 'latest']));
}
async function seedAllowance(amount) {
  const call = buildErc20Approve(fixture.token, fixture.escrow, amount);
  await rpc('eth_sendTransaction', [{ from: addresses[0], to: call.to, data: call.data, value: '0x0' }]); await mine();
}

try {
  fixture = await startLocalnetFixture({ erc20: true });
  ({ config, rpc, relay, counts, accounts: addresses } = fixture);
  clock = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
  const seller = await createParty(0), buyer = await createParty(1);
  await seller.command({ type: 'profile.create', passphrase: PASS }); await buyer.command({ type: 'profile.create', passphrase: PASS });
  await seller.command({ type: 'wallet.connect' }); await buyer.command({ type: 'wallet.connect' });
  const first = await acceptTrade(seller, buyer);
  assert.equal(findTrade(seller, first).canApprove, true); assert.equal(findTrade(seller, first).canFund, false);
  assert.equal((await seller.command({ type: 'review.prepare', action: 'fund', tradeId: first }, false)).code, 'TOKEN_ALLOWANCE_REQUIRED');
  assert.equal((await buyer.command({ type: 'review.prepare', action: 'approve', tradeId: first }, false)).code, 'UNAUTHORIZED');
  assert.equal(counts.sends, 0);
  pass('ERC20 terms use bilateral D1; neither unfunded allowance nor buyer authority can authorize a send');

  const cancelled = await review(seller, { action: 'approve', tradeId: first });
  assert.equal(cancelled.walletRequests.length, 1);
  assert.equal(cancelled.walletRequests[0].params[0].to, fixture.token);
  assert.equal(cancelled.walletRequests[0].params[0].value, '0x0');
  assert.equal(cancelled.walletRequests[0].params[0].data, buildErc20Approve(fixture.token, fixture.escrow, '2500').data);
  await seller.command({ type: 'review.cancel' });
  const reused = await seller.controller.dispatch({ type: 'review.confirm', reviewId: cancelled.id });
  assert.equal(reused.ok, false); assert.equal(counts.sends, 0);
  pass('the review contains exactly the bound token, escrow spender and principal; cancelling cannot submit it');

  const stale = await review(seller, { action: 'approve', tradeId: first });
  await seedAllowance('1');
  const refused = await seller.command({ type: 'review.confirm', reviewId: stale.id }, false);
  assert.equal(refused.code, 'UNAUTHORIZED'); assert.equal(counts.sends, 0);
  pass('an allowance change after review is rechecked before the durable send marker and physical wallet dispatch');

  const reset = await review(seller, { action: 'approve', tradeId: first });
  assert.equal(reset.fields.find(field => field.label === 'New allowance in base units').value, '0');
  assert.equal(reset.walletRequests[0].params[0].data, buildErc20Approve(fixture.token, fixture.escrow, '0').data);
  await confirm(seller, reset); await refreshBoth(seller, buyer);
  assert.equal(findTrade(seller, first).approval.allowanceBaseUnits, '0'); assert.equal(findTrade(seller, first).canFund, false);
  const exact = await review(seller, { action: 'approve', tradeId: first });
  assert.equal(exact.fields.find(field => field.label === 'New allowance in base units').value, '2500');
  await confirm(seller, exact); await refreshBoth(seller, buyer);
  assert.equal(findTrade(seller, first).approval.allowanceBaseUnits, '2500'); assert.equal(findTrade(seller, first).canApprove, false);
  assert.equal(findTrade(seller, first).canFund, true); assert.equal(counts.sends, 2);
  pass('non-exact allowance requires a separate zero reset followed by a separate exact-principal approval');

  const buyerBefore = await balance(addresses[1]), sellerBefore = await balance(addresses[0]);
  const fund = await review(seller, { action: 'fund', tradeId: first });
  assert.equal(fund.walletRequests.length, 1); assert.equal(fund.walletRequests[0].params[0].to, fixture.escrow); assert.equal(fund.walletRequests[0].params[0].value, '0x0');
  await confirm(seller, fund); await refreshBoth(seller, buyer);
  assert.equal(findTrade(seller, first).chainState, 'funded'); assert.equal(await balance(fixture.escrow), 2500n);
  assert.equal(await balance(addresses[0]), sellerBefore - 2500n);
  assert.equal((await seller.command({ type: 'review.prepare', action: 'release', tradeId: first }, false)).code, 'FIAT_RECEIPT_CONFIRMATION_REQUIRED');
  await confirm(seller, await review(seller, { action: 'release', tradeId: first, fiatReceiptConfirmed: true })); await refreshBoth(seller, buyer);
  assert.equal(findTrade(seller, first).chainState, 'released'); assert.equal(await balance(addresses[1]), buyerBefore + 2500n);
  assert.equal(await balance(fixture.escrow), 0n); assert.equal(counts.sends, 4);
  pass('independent funding and seller bank-receipt release transfer the exact ERC20 principal to the bound buyer');

  const second = await acceptTrade(seller, buyer, '1100');
  await confirm(seller, await review(seller, { action: 'approve', tradeId: second })); await refreshBoth(seller, buyer);
  const sellerBeforeRefundTrade = await balance(addresses[0]);
  await confirm(seller, await review(seller, { action: 'fund', tradeId: second })); await refreshBoth(seller, buyer);
  const backup = await seller.command({ type: 'backup.export' }), oldProfile = seller.snapshot.profileId, oldKey = seller.snapshot.publicKey, beforeRestore = counts.sends;
  await seller.close();
  const restoredPass = `${PASS} restored`, restored = await createParty(0, memoryStore(), restoredPass);
  await restored.command({ type: 'backup.restore', bytes: backup.backupBytes, sourcePassphrase: PASS, destinationPassphrase: restoredPass });
  await restored.command({ type: 'wallet.connect' });
  assert.notEqual(restored.snapshot.profileId, oldProfile); assert.equal(restored.snapshot.publicKey, oldKey); assert.equal(counts.sends, beforeRestore);
  assert.equal(findTrade(restored, second).restored, true); assert.equal(findTrade(restored, second).canFund, false); assert.equal(findTrade(restored, second).canRelease, true);
  const expiry = Number(findTrade(restored, second).escrowExpirySeconds);
  await rpc('evm_increaseTime', [expiry - clock + 1]); await mine(); await restored.command({ type: 'refresh' });
  assert.equal(findTrade(restored, second).canRefund, true);
  const originalRequest = restored.external.request;
  restored.external.request = async function (request) {
    if (request.method === 'eth_call' && request.params?.[0]?.to === fixture.token) throw new Error('Token allowance interface unavailable after funding.');
    return originalRequest.call(this, request);
  };
  await confirm(restored, await review(restored, { action: 'refund', tradeId: second })); await mine(); await restored.command({ type: 'refresh' });
  assert.equal(findTrade(restored, second).chainState, 'refunded'); assert.equal(await balance(addresses[0]), sellerBeforeRefundTrade);
  assert.equal(counts.sends, beforeRestore + 1); restored.external.request = originalRequest;
  pass('fresh-key restoration preserves ERC20 history and refund exits without renewed D1 or an allowance-query veto');

  const third = await acceptTrade(restored, buyer, '700');
  const unknownApproval = await review(restored, { action: 'approve', tradeId: third }); restored.loseSendResponse();
  const unknown = await restored.command({ type: 'review.confirm', reviewId: unknownApproval.id }, false); assert.equal(unknown.code, 'BROADCAST_UNKNOWN');
  const unknownIntent = findTrade(restored, third).intents.find(intent => intent.action === 'approve');
  assert.equal(unknownIntent.state, 'broadcast-unknown'); assert.equal(unknownIntent.hash, null);
  const unknownBackup = await restored.command({ type: 'backup.export' }), uncertainOrigin = restored.snapshot.profileId, unknownSendCount = counts.sends;
  await restored.close(); await mine();
  const finalPass = `${PASS} twice-restored`, held = await createParty(0, memoryStore(), finalPass);
  await held.command({ type: 'backup.restore', bytes: unknownBackup.backupBytes, sourcePassphrase: restoredPass, destinationPassphrase: finalPass });
  await held.command({ type: 'wallet.connect' });
  assert.notEqual(held.snapshot.profileId, uncertainOrigin); assert.equal(counts.sends, unknownSendCount);
  const recovered = findTrade(held, third);
  assert.equal(recovered.intents.find(intent => intent.action === 'approve').hash, null);
  assert.ok(['broadcast-unknown', 'pending'].includes(recovered.intents.find(intent => intent.action === 'approve').state));
  assert.equal(recovered.canApprove, false); assert.equal(recovered.canFund, false);
  await held.command({ type: 'review.prepare', action: 'fund', tradeId: third }, false); assert.equal(counts.sends, unknownSendCount);
  pass('an approval with a lost response stays held across fresh-key restore; observed allowance never authorizes retry or funding');
  assert.equal(markers, counts.sends);
  console.log(JSON.stringify({ ok: true, checks: results.length, signatures: counts.signatures, sends: counts.sends, durableExactMarkers: markers, ReleaseEnabled: config.ReleaseEnabled }, null, 2));
} finally {
  for (const party of [...clients]) await party.close();
  await fixture?.close();
}
