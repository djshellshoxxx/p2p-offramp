#!/usr/bin/env node
/** Actual built ERC-20 application/Worker/IndexedDB gate. Requires Chromium; source/build checks cannot substitute. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildErc20Approve, buildErc20BalanceOf, buildGetTrade, decodeTrade } from '../packages/wallet/localnet.ts';
import { idleLocalnetBrowser as idle, startLocalnetBrowserFixture, waitLocalnetBrowser as until } from './lib/localnet-browser-fixture.mjs';

const PASS = 'public synthetic ERC20 browser profile passphrase';
const RESTORED_PASS = 'public synthetic restored ERC20 browser passphrase';
const PAYMENT = 'SYNTHETIC ERC20 local fixture bank instructions';
const checks = [], pass = label => { checks.push(label); console.log(`ok - ${label}`); };
const trade = (owner, id) => owner.page.locator(`[data-trade-id="${id}"]`);
const region = owner => owner.page.getByRole('region', { name: 'Wallet action review' });
let fixture;
async function create(owner) {
  await owner.page.getByLabel('New profile passphrase', { exact: true }).fill(PASS);
  await owner.page.getByRole('button', { name: 'Create profile', exact: true }).click();
  await owner.page.locator('[data-private="localnet-profile"]').waitFor();
  await idle(owner);
}
async function connect(owner) {
  await owner.page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await until(async () => await owner.page.getByTestId('wallet-account').textContent() === owner.provider.state.account, 'external wallet connected'); await idle(owner);
}
async function refresh(owner) { await owner.page.getByRole('button', { name: 'Refresh chain and messages', exact: true }).click(); await idle(owner); }
async function confirm(owner) { await owner.page.getByTestId('review-confirm').click(); await region(owner).waitFor({ state: 'hidden' }); await idle(owner); }
async function prepare(owner, id, button) {
  const before = fixture.chain.counts.sends;
  await trade(owner, id).getByRole('button', { name: button, exact: true }).click(); await region(owner).waitFor();
  assert.equal(fixture.chain.counts.sends, before, 'a review does not submit a transaction');
}
async function field(owner, label) {
  return region(owner).locator('dt').filter({ hasText: new RegExp(`^${label}$`) }).evaluate(element => element.nextElementSibling.textContent);
}
async function negotiate(seller, buyer, amount, allowanceButton) {
  const known = new Set(await seller.page.locator('[data-session-key]').evaluateAll(items => items.map(item => item.getAttribute('data-session-key'))));
  const signatures = fixture.chain.counts.signatures;
  await seller.page.getByLabel('Asset', { exact: true }).selectOption('test-token');
  await seller.page.getByLabel('Amount in base units', { exact: true }).fill(amount);
  await seller.page.getByRole('button', { name: 'Publish sell offer', exact: true }).click(); await idle(seller);
  await buyer.page.locator('[data-ad-key]').filter({ has: buyer.page.getByRole('heading', {
    name: `${amount} base units · test-token / USD`, exact: true,
  }) }).getByRole('button', { name: 'Request private terms', exact: true }).click();
  await until(async () => (await seller.page.locator('[data-session-key]').evaluateAll(items => items.map(item => item.getAttribute('data-session-key')))).some(id => !known.has(id)), 'seller receives token negotiation');
  const session = (await seller.page.locator('[data-session-key]').evaluateAll(items => items.map(item => item.getAttribute('data-session-key')))).find(id => !known.has(id));
  await seller.page.locator(`[data-session-key="${session}"]`).click(); await idle(seller);
  await seller.page.getByLabel('Private payment instructions', { exact: true }).fill(PAYMENT);
  await seller.page.getByRole('button', { name: 'Review terms to offer', exact: true }).click(); await region(seller).waitFor();
  assert.equal(await field(seller, 'Token contract'), fixture.chain.token); assert.equal(fixture.chain.counts.signatures, signatures); await confirm(seller);
  const id = await fieldFromTradeSession(seller, session);
  await trade(buyer, id).waitFor(); await idle(buyer);
  const buyerSession = await buyer.page.locator('[data-session-key]').last().getAttribute('data-session-key');
  await buyer.page.locator(`[data-session-key="${buyerSession}"]`).click(); await idle(buyer);
  await buyer.page.getByRole('button', { name: 'Review terms to accept', exact: true }).click(); await region(buyer).waitFor(); await confirm(buyer);
  await until(() => trade(seller, id).getByRole('button', { name: allowanceButton, exact: true }).isEnabled(), 'both acceptances and canonical token state');
  assert.equal(fixture.chain.counts.signatures, signatures + 4); return id;
}
async function fieldFromTradeSession(owner, session) {
  // The newly offered terms are the final saved trade in this fresh session; verify a complete canonical id.
  await owner.page.locator(`[data-session-id="${session}"]`).waitFor();
  const id = await owner.page.locator('[data-trade-id]').last().getAttribute('data-trade-id'); assert.match(id, /^[0-9a-f]{64}$/); return id;
}
async function balance(account) {
  const call = buildErc20BalanceOf(fixture.chain.token, account);
  return BigInt(await fixture.chain.rpc('eth_call', [{ to: call.to, data: call.data }, 'latest']));
}
async function settled(owner, id, expected) {
  await fixture.chain.mine(); await refresh(owner);
  await until(async () => await trade(owner, id).getByTestId('chain-state').textContent() === expected, `canonical ${expected} state`);
}
async function revokedReview(owner, id, event, value) {
  const before = { ...fixture.chain.counts };
  await trade(owner, id).getByRole('checkbox').check();
  await prepare(owner, id, 'Review release');
  if (event === 'accountsChanged') owner.provider.state.account = value[0];
  if (event === 'chainChanged') owner.provider.state.chainId = value;
  await owner.emit(event, value);
  await region(owner).waitFor({ state: 'hidden' });
  await until(async () => await owner.page.getByTestId('wallet-account').textContent() === 'not connected', `${event} revokes wallet authority`);
  for (const action of ['Review funding', 'Review release', 'Review refund']) {
    assert.equal(await trade(owner, id).getByRole('button', { name: action, exact: true }).isEnabled(), false);
  }
  assert.deepEqual(fixture.chain.counts, before, 'wallet events cannot send, sign or reconnect automatically');
}
async function restore(owner) {
  const oldId = await owner.profileId(), before = { ...fixture.chain.counts };
  await owner.page.evaluate(() => localStorage.setItem('erc20-source-profile', 'source'));
  const [download] = await Promise.all([owner.page.waitForEvent('download'),
    owner.page.getByRole('button', { name: 'Download encrypted backup', exact: true }).click()]);
  const backup = await readFile(await download.path());
  assert.equal(backup.toString().includes(PAYMENT), false, 'payment instructions remain encrypted in exported backup');
  await owner.close(); await fixture.chain.mine();
  const restored = await fixture.party(0, RESTORED_PASS);
  assert.equal(await restored.page.evaluate(() => localStorage.getItem('erc20-source-profile')), null, 'restore uses an independent browser profile');
  await restored.page.getByText('Restore an encrypted backup', { exact: true }).click();
  await restored.page.getByLabel('Encrypted backup file', { exact: true }).setInputFiles({ name: 'erc20.backup.json', mimeType: 'application/json', buffer: backup });
  await restored.page.getByLabel('Backup source passphrase', { exact: true }).fill(owner.passphrase);
  await restored.page.getByLabel('Restored profile passphrase', { exact: true }).fill(RESTORED_PASS);
  await restored.page.getByRole('button', { name: 'Restore to a fresh profile', exact: true }).click();
  await restored.page.locator('[data-private="localnet-profile"]').waitFor(); await idle(restored);
  assert.notEqual(await restored.profileId(), oldId);
  assert.deepEqual(fixture.chain.counts, before, 'restoration cannot send, sign or connect a wallet');
  await connect(restored);
  assert.equal(fixture.chain.counts.sends, before.sends); assert.equal(fixture.chain.counts.signatures, before.signatures);
  return restored;
}

try {
  fixture = await startLocalnetBrowserFixture({ erc20: true });
  const { chain } = fixture, seed = buildErc20Approve(chain.token, chain.escrow, '1');
  await chain.rpc('eth_sendTransaction', [{ from: chain.accounts[0], to: seed.to, data: seed.data, value: '0x0' }]); await chain.mine();
  const seller = await fixture.party(0, PASS), buyer = await fixture.party(1, PASS);
  await create(seller); await create(buyer); assert.notEqual(await seller.profileId(), await buyer.profileId());
  assert.deepEqual(chain.counts, { signatures: 0, sends: 0, connects: 0 }); await connect(seller); await connect(buyer);
  const first = await negotiate(seller, buyer, '2500', 'Review allowance reset');
  assert.equal(await trade(seller, first).getByRole('button', { name: 'Review funding', exact: true }).isEnabled(), false);
  await prepare(seller, first, 'Review allowance reset');
  assert.equal(await field(seller, 'New allowance in base units'), '0'); assert.equal(await field(seller, 'Allowance spender'), chain.escrow);
  await seller.page.getByRole('button', { name: 'Cancel review', exact: true }).click(); await region(seller).waitFor({ state: 'hidden' }); await idle(seller);
  assert.equal(chain.counts.sends, 0);
  await prepare(seller, first, 'Review allowance reset'); await confirm(seller); await chain.mine(); await refresh(seller);
  await prepare(seller, first, 'Review exact token allowance'); assert.equal(await field(seller, 'New allowance in base units'), '2500');
  assert.equal(await field(seller, 'Token contract'), chain.token); await confirm(seller); await chain.mine(); await refresh(seller);
  assert.equal(chain.counts.sends, 2);
  pass('asset selection and bilateral terms reach separate zero-reset/exact-principal wallet reviews; cancellation sends nothing');

  const buyerBefore = await balance(chain.accounts[1]);
  await prepare(seller, first, 'Review funding'); await confirm(seller); await settled(seller, first, 'funded');
  assert.equal(chain.counts.sends, 3); assert.equal(await balance(chain.escrow), 2500n);
  assert.equal(await trade(seller, first).getByRole('button', { name: 'Review release', exact: true }).isEnabled(), false);
  await trade(seller, first).getByRole('checkbox').check(); await prepare(seller, first, 'Review release'); await confirm(seller); await settled(seller, first, 'released');
  assert.equal(await balance(chain.accounts[1]), buyerBefore + 2500n); assert.equal(await balance(chain.escrow), 0n);
  pass('a separate funding review and explicit bank-receipt release pay the exact token principal to the bound buyer');

  const second = await negotiate(seller, buyer, '1100', 'Review exact token allowance');
  await prepare(seller, second, 'Review exact token allowance'); await confirm(seller); await chain.mine(); await refresh(seller);
  await prepare(seller, second, 'Review funding'); await confirm(seller); await settled(seller, second, 'funded');

  await revokedReview(seller, second, 'accountsChanged', [chain.accounts[1]]);
  await connect(seller);
  assert.equal(await trade(seller, second).getByRole('button', { name: 'Review release', exact: true }).isEnabled(), false, 'a different account cannot release the seller escrow');
  seller.provider.state.account = chain.accounts[0]; await seller.emit('accountsChanged', [chain.accounts[0]]); await connect(seller);
  await revokedReview(seller, second, 'chainChanged', '0x1');
  await seller.page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await seller.page.getByRole('alert').filter({ hasText: 'WRONG_CHAIN' }).waitFor(); await idle(seller);
  assert.equal(await seller.page.getByTestId('wallet-account').textContent(), 'not connected');
  seller.provider.state.chainId = '0x7a69'; await seller.emit('chainChanged', '0x7a69'); await connect(seller);
  await revokedReview(seller, second, 'disconnect', { code: 4900, message: 'Synthetic wallet disconnect' });
  await connect(seller);
  assert.equal(chain.counts.sends, 6, 'three invalidated release reviews cannot submit a transaction');
  pass('account changes, wrong-chain changes and disconnect revoke open token release reviews; explicit correct-wallet reconnection preserves the funded exit');

  const third = await negotiate(seller, buyer, '700', 'Review exact token allowance');
  await prepare(seller, third, 'Review exact token allowance'); await confirm(seller); await chain.mine(); await refresh(seller);
  await prepare(seller, third, 'Review funding'); await confirm(seller); await settled(seller, third, 'funded');
  const fourth = await negotiate(seller, buyer, '500', 'Review exact token allowance');
  await prepare(seller, fourth, 'Review exact token allowance'); seller.provider.state.loseNextSend = true; await confirm(seller);
  await seller.page.getByRole('alert').filter({ hasText: 'BROADCAST_UNKNOWN' }).waitFor();
  assert.match(await trade(seller, fourth).textContent(), /approve · broadcast-unknown/);
  assert.equal(chain.counts.sends, 9);
  const approvals = seller.provider.calls.filter(request => request.method === 'eth_sendTransaction' && request.params[0].to === chain.token);
  assert.deepEqual(approvals.map(request => request.params[0].data), ['0', '2500', '1100', '700', '500'].map(amount => buildErc20Approve(chain.token, chain.escrow, amount).data));
  const restored = await restore(seller);
  for (const id of [second, third]) {
    assert.equal(await trade(restored, id).getByTestId('chain-state').textContent(), 'funded');
    assert.match(await trade(restored, id).textContent(), /Restored profile/);
    assert.equal(await trade(restored, id).getByRole('button', { name: 'Review funding', exact: true }).isEnabled(), false);
  }
  const held = trade(restored, fourth);
  assert.match(await held.textContent(), /approve · (broadcast-unknown|pending)/);
  assert.equal(await held.locator('details code').count(), 0, 'lost approval response has no invented transaction hash');
  assert.match(await held.getByRole('region', { name: 'Token allowance' }).textContent(), /Finalized allowance: 500 base units/);
  assert.equal(await held.getByRole('button', { name: 'Review exact token allowance', exact: true }).isEnabled(), false);
  assert.equal(await held.getByRole('button', { name: 'Review funding', exact: true }).isEnabled(), false);
  assert.equal(chain.counts.sends, 9);
  pass('fresh-key browser restore retains funded token trades and holds a lost approval response despite the exact allowance being visible on chain');

  const restoredBuyerBefore = await balance(chain.accounts[1]);
  await trade(restored, second).getByRole('checkbox').check(); await prepare(restored, second, 'Review release'); await confirm(restored); await settled(restored, second, 'released');
  assert.equal(await balance(chain.accounts[1]), restoredBuyerBefore + 1100n);
  const sellerBeforeRefund = await balance(chain.accounts[0]);
  const deadline = await trade(restored, third).locator('dt').filter({ hasText: /^Refund deadline$/ }).evaluate(element => element.nextElementSibling.textContent.split(' ')[0]);
  await chain.rpc('evm_setNextBlockTimestamp', [Number(deadline) + 1]); await chain.mine(); await refresh(restored);
  await prepare(restored, third, 'Review refund'); await confirm(restored); await settled(restored, third, 'refunded');
  assert.equal(await balance(chain.accounts[0]), sellerBeforeRefund + 700n); assert.equal(await balance(chain.escrow), 0n);
  assert.equal(decodeTrade(await chain.rpc('eth_call', [{ to: chain.escrow, data: buildGetTrade(chain.escrow, third).data }, 'latest'])).state, 'refunded');
  assert.equal(chain.counts.sends, 11); assert.equal(fixture.markers, 11);
  assert.equal(await held.getByRole('button', { name: 'Review funding', exact: true }).isEnabled(), false);
  await restored.page.getByRole('button', { name: 'Lock profile', exact: true }).click(); await restored.page.locator('[data-private]').waitFor({ state: 'hidden' });
  assert.equal((await restored.page.locator('body').textContent()).includes(PAYMENT), false); assert.deepEqual(fixture.unexpected, []);
  pass('restored token release and chain-time refund pay their bound recipients despite an unrelated unknown approval; all eleven sends have IndexedDB markers and lock removes private views');
  console.log(JSON.stringify({ ok: true, kind: 'ERC20_LOCAL_BROWSER_PROOF', engine: fixture.browser.version(), checks: checks.length,
    ...chain.counts, durableMarkers: fixture.markers, ReleaseEnabled: 0, physicalWalletQualification: false, publicTestnetQualification: false }, null, 2));
} finally { await fixture?.close(); }
