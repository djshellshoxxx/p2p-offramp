#!/usr/bin/env node
/** Actual built ERC-20 application/Worker/IndexedDB gate. Requires Chromium; source/build checks cannot substitute. */
import assert from 'node:assert/strict';
import { buildErc20Approve, buildErc20BalanceOf, buildGetTrade, decodeTrade } from '../packages/wallet/localnet.ts';
import { idleLocalnetBrowser as idle, startLocalnetBrowserFixture, waitLocalnetBrowser as until } from './lib/localnet-browser-fixture.mjs';

const PASS = 'public synthetic ERC20 browser profile passphrase';
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
  await buyer.page.locator('[data-ad-key]').filter({ hasText: `${amount} base units` }).getByRole('button', { name: 'Request private terms', exact: true }).click();
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

  const second = await negotiate(seller, buyer, '1100', 'Review exact token allowance'), beforeRefund = await balance(chain.accounts[0]);
  await prepare(seller, second, 'Review exact token allowance'); await confirm(seller); await chain.mine(); await refresh(seller);
  await prepare(seller, second, 'Review funding'); await confirm(seller); await settled(seller, second, 'funded');
  const deadline = await trade(seller, second).locator('dt').filter({ hasText: /^Refund deadline$/ }).evaluate(element => element.nextElementSibling.textContent.split(' ')[0]);
  await chain.rpc('evm_setNextBlockTimestamp', [Number(deadline) + 1]); await chain.mine(); await refresh(seller);
  await prepare(seller, second, 'Review refund'); await confirm(seller); await settled(seller, second, 'refunded');
  assert.equal(await balance(chain.accounts[0]), beforeRefund);
  assert.equal(decodeTrade(await chain.rpc('eth_call', [{ to: chain.escrow, data: buildGetTrade(chain.escrow, second).data }, 'latest'])).state, 'refunded');
  assert.equal(chain.counts.sends, 7); assert.equal(fixture.markers, 7);
  const approvals = seller.provider.calls.filter(request => request.method === 'eth_sendTransaction' && request.params[0].to === chain.token);
  assert.deepEqual(approvals.map(request => request.params[0].data), ['0', '2500', '1100'].map(amount => buildErc20Approve(chain.token, chain.escrow, amount).data));
  await seller.page.getByRole('button', { name: 'Lock profile', exact: true }).click(); await seller.page.locator('[data-private]').waitFor({ state: 'hidden' });
  assert.equal((await seller.page.locator('body').textContent()).includes(PAYMENT), false); assert.deepEqual(fixture.unexpected, []);
  pass('chain-time refund returns only the bound seller principal; all seven sends have full IndexedDB markers and lock removes private views');
  console.log(JSON.stringify({ ok: true, kind: 'ERC20_LOCAL_BROWSER_PROOF', engine: fixture.browser.version(), checks: checks.length,
    ...chain.counts, durableMarkers: fixture.markers, ReleaseEnabled: 0, physicalWalletQualification: false, publicTestnetQualification: false }, null, 2));
} finally { await fixture?.close(); }
