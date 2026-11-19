#!/usr/bin/env node
/** ERC-20 localnet application acceptance against real Anvil, independent encrypted profiles and current D1.
 * Disposable published fixture keys stay in Node; this command does not claim browser or public testnet acceptance. */
import assert from 'node:assert/strict';
import { LocalnetController } from '../apps/web/src/localnet/controller.ts';
import { createLocalnetWalletBridge } from '../apps/web/src/localnet/wallet-bridge.ts';
import { VaultStorageError } from '../packages/storage/src/idb-vault-store.ts';
import { openEnvelope, disposeMaterial } from '../packages/storage/src/vault-crypto.ts';
import { decodeIntentPayload, decodeBase64url } from '../packages/schemas/index.ts';
import { buildErc20Approve, buildErc20BalanceOf, buildGetTrade, decodeTrade } from '../packages/wallet/localnet.ts';
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
        if (expected !== null) assert.equal(result.ok, expected, `${command.type}: ${JSON.stringify(result)}`); return result;
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
  await acceptTrade(seller, buyer, '2500');
  await until(() => seller.snapshot.phase === 'ready', 'first token observation');
  await acceptTrade(seller, buyer, '1100');
  await until(() => seller.snapshot.phase === 'ready', 'second token observation');
  // The vault sorts records by their random IDs. Choose the last stored trade for funding so the earlier
  // absent trade is deterministically observed first on unlock, without changing persisted records.
  const stored = await openEnvelope(seller.store.rows.get(seller.snapshot.profileId), PASS, crypto);
  let amounts;
  try { amounts = stored.snapshot.records.filter(record => record.kind === 'trade').map(record => {
    const body = JSON.parse(new TextDecoder().decode(decodeBase64url(record.payload, 1, 100000)));
    return JSON.parse(new TextDecoder().decode(decodeBase64url(body.terms, 1, 65536))).terms.amountBaseUnits;
  }); } finally { disposeMaterial(stored.material); }
  assert.equal(amounts.length, 2);
  const first = seller.snapshot.trades.find(trade => trade.amountBaseUnits === amounts[0]).id;
  const second = seller.snapshot.trades.find(trade => trade.amountBaseUnits === amounts[1]).id;
  await confirm(seller, await review(seller, { action: 'approve', tradeId: second })); await refreshBoth(seller, buyer);
  await confirm(seller, await review(seller, { action: 'fund', tradeId: second })); await refreshBoth(seller, buyer);
  assert.equal(findTrade(seller, first).chainState, 'absent');
  assert.equal(findTrade(seller, second).chainState, 'funded');
  assert.equal(findTrade(seller, second).canRelease, true);
  const profile = seller.snapshot.profileId;
  await seller.command({ type: 'profile.lock' });
  await seller.command({ type: 'profile.unlock', profileId: profile, passphrase: PASS });
  const originalRequest = seller.external.request;
  seller.external.request = async function (request) {
    if (request.method === 'eth_call' && request.params?.[0]?.to === fixture.token) throw new Error('Synthetic token allowance read unavailable.');
    return originalRequest.call(this, request);
  };
  const connection = await seller.command({ type: 'wallet.connect' }, null);
  const funded = findTrade(seller, second), absent = findTrade(seller, first);
  console.log(JSON.stringify({ observation: 'funded exit after unrelated allowance read failure',
    connectionOk: connection.ok, connectionCode: connection.code, walletConnected: seller.snapshot.wallet !== null, first: { state: absent.chainState, canFund: absent.canFund },
    second: { state: funded.chainState, canRelease: funded.canRelease, canRefund: funded.canRefund }, sends: counts.sends }, null, 2));
  assert.equal(funded.canRelease, true, 'an earlier unfunded trade token read must not hide an independently funded trade exit after unlock');
  assert.equal(connection.ok, true, 'a token-guidance failure is scoped to its unfunded trade');
  assert.equal(absent.tokenReadError, true); assert.equal(absent.approval, null);
  assert.equal(absent.canApprove, false); assert.equal(absent.canFund, false);
  pass('an unavailable unfunded token observation preserves the later independently verified funded exit');

  const buyerBefore = await balance(addresses[1]), beforeExitSends = counts.sends;
  await confirm(seller, await review(seller, { action: 'release', tradeId: second, fiatReceiptConfirmed: true }));
  await mine(); await seller.command({ type: 'refresh' });
  assert.equal(findTrade(seller, second).chainState, 'released');
  assert.equal(await balance(addresses[1]), buyerBefore + BigInt(funded.amountBaseUnits));
  assert.equal(counts.sends, beforeExitSends + 1);
  pass('the visible funded exit actually transfers its exact principal despite the unrelated allowance-read outage');

  let readingToken = false;
  seller.external.request = async function (request) {
    if (request.method === 'eth_getCode' && request.params?.[0] === fixture.token) readingToken = true;
    if (readingToken && request.method === 'eth_chainId') return '0x1';
    return originalRequest.call(this, request);
  };
  const wrongChain = await seller.command({ type: 'refresh' }, false);
  assert.equal(wrongChain.code, 'WRONG_CHAIN');
  assert.equal(findTrade(seller, first).tokenReadError, false);
  assert.equal(counts.sends, beforeExitSends + 1);
  pass('a chain identity change during token observation remains fatal rather than being downgraded to unavailable guidance');

  let tokenReads = 0;
  seller.external.request = async function (request) {
    if (request.method === 'eth_getCode' && request.params?.[0] === fixture.token) {
      tokenReads++;
      await seller.controller.dispatch({ type: 'profile.lock' });
    }
    return originalRequest.call(this, request);
  };
  const locked = await seller.command({ type: 'refresh' }, false);
  assert.ok(['LOCKED', 'CANCELLED'].includes(locked.code), locked.code);
  assert.equal(tokenReads, 1); assert.equal(seller.snapshot.phase, 'locked');
  assert.deepEqual(seller.snapshot.trades, []); assert.equal(counts.sends, beforeExitSends + 1);
  pass('profile lock during the token query revokes the whole operation and emits no private trade projection');
  assert.equal(markers, counts.sends);
  console.log(JSON.stringify({ ok: true, kind: 'INDEPENDENT_ERC20_RECOVERY_PROOF', checks: results.length,
    signatures: counts.signatures, sends: counts.sends, durableExactMarkers: markers, ReleaseEnabled: config.ReleaseEnabled }, null, 2));
} finally {
  for (const party of [...clients]) await party.close();
  await fixture?.close();
}
