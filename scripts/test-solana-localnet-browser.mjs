#!/usr/bin/env node
/** Actual built Solana application/Worker/IndexedDB/Agave gate. No mock, genesis shim, clock warp or refund skip. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readClock, getBalance } from '../contracts/solana/localnet/driver.mjs';
import { waitSolana } from './lib/solana-localnet-fixture.mjs';
import { startSolanaBrowserFixture, waitSolanaBrowser as until } from './lib/solana-localnet-browser-fixture.mjs';

const PASS = 'synthetic local Solana browser profile passphrase', NEW_PASS = 'fresh synthetic Solana recovery profile passphrase';
const checks = [], began = Date.now();
const pass = name => { checks.push(name); console.log(`ok - ${name}`); };
let fixture;
const card = id => fixture.page.locator(`[data-trade-id="${id}"]`);
const proposalCard = id => fixture.page.locator(`[data-proposal-id="${id}"]`);
const review = () => fixture.page.locator('[data-review-id]');
const idle = () => until(async () => await fixture.page.locator('main').getAttribute('aria-busy') === 'false', 'acknowledged UI command completion');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function refresh() {
  await fixture.page.getByRole('button', { name: 'Refresh finalized state', exact: true }).click();
  // A real Worker/RPC turn may start after the click dispatch. The observed state is always checked below.
  await pause(200); await idle();
}
async function unlock(id, passphrase) {
  fixture.setPassphrase(passphrase);
  await fixture.page.getByLabel('Profile', { exact: true }).selectOption(id);
  await fixture.page.getByLabel('Profile passphrase', { exact: true }).fill(passphrase);
  await fixture.page.getByRole('button', { name: 'Unlock recovery profile', exact: true }).click();
  await until(async () => await fixture.profileId() === id, 'explicit profile unlock'); await idle();
  assert.equal(await fixture.page.getByLabel('Recovery JSON', { exact: true }).inputValue(), '', 'lock/switch clears prior profile recovery input');
  assert.equal(await fixture.page.getByLabel('Funding proposal JSON', { exact: true }).inputValue(), '', 'lock/switch clears prior profile proposal input');
}
async function connect(id) {
  await card(id).getByRole('button', { name: 'Connect seller wallet', exact: true }).click();
  await until(async () => await fixture.page.locator('main').getAttribute('data-wallet-trade') === id, 'explicit role wallet connection'); await idle();
}
async function prepare(id, action, rebuild = false) {
  if (action === 'release') await card(id).getByRole('checkbox').check();
  const name = rebuild ? `Review a new ${action} after this definitive drop` : action === 'payout' ? 'Review separate payout' : `Review ${action}`;
  const before = fixture.chain.summary.appSends.length, prompts = fixture.prompts.length;
  await card(id).getByRole('button', { name, exact: true }).click(); await review().waitFor(); await idle();
  assert.equal(fixture.chain.summary.appSends.length, before); assert.equal(fixture.prompts.length, prompts);
  const field = label => review().locator('dt').filter({ hasText: new RegExp(`^${label}$`) }).evaluate(node => node.nextElementSibling.textContent);
  assert.equal(await field('Network genesis'), fixture.chain.summary.genesisHash);
  assert.equal(await field('Immutable program'), fixture.chain.summary.programId);
  assert.equal(await field('ProgramData SHA-256'), fixture.chain.summary.programDataSha256);
  assert.equal(await field('Terms SHA-256'), id); assert.equal(await field('Fee payer'), fixture.chain.seller);
}
async function confirm() {
  await fixture.page.getByRole('button', { name: 'Confirm and sign in wallet', exact: true }).click();
  await review().waitFor({ state: 'hidden' }); await idle();
}
async function settled(id, state, paidOut) {
  await until(async () => {
    await refresh(); return await card(id).getAttribute('data-chain-state') === state && await card(id).getAttribute('data-paid-out') === String(paidOut);
  }, `finalized ${state} paidOut=${paidOut}`, 150000, 1000);
}
async function noAutomaticSend(beforeSends, beforePrompts) {
  await refresh(); assert.equal(fixture.chain.summary.appSends.length, beforeSends); assert.equal(fixture.prompts.length, beforePrompts);
}

try {
  fixture = await startSolanaBrowserFixture();
  const { page, chain } = fixture, ids = Object.fromEntries(Object.entries(chain.documents).map(([name, document]) => [name, document.termsHash]));
  fixture.setPassphrase(PASS);
  await page.getByLabel('Profile passphrase', { exact: true }).fill(PASS);
  await page.getByRole('button', { name: 'Create recovery profile', exact: true }).click();
  await until(async () => /^[0-9a-f]{32}$/.test(await fixture.profileId()), 'encrypted profile created'); await idle();
  const originalProfile = await fixture.profileId();
  for (const document of [chain.documents.absent, { ...chain.documents.release,
    network: { ...chain.documents.release.network, programDataSha256: 'ef'.repeat(32) } }]) {
    await page.getByLabel('Recovery JSON', { exact: true }).fill(JSON.stringify(document));
    await page.getByRole('button', { name: 'Verify and save recovery document', exact: true }).click();
    await page.getByRole('alert').waitFor(); await idle(); assert.equal(await page.locator('[data-trade-id]').count(), 0);
  }
  const beforeProposal = await fixture.vault();
  const publicProposal = { format: 'p2p-offramp/solana-local-funding-proposal/v1', terms: chain.documents.absent.terms };
  const proposalJson = JSON.stringify(publicProposal), connectsBeforeProposal = fixture.walletConnects;
  const promptsBeforeProposal = fixture.prompts.length, sendsBeforeProposal = chain.summary.appSends.length;
  await page.getByLabel('Funding proposal JSON', { exact: true }).fill(proposalJson);
  await page.getByRole('button', { name: 'Save seller funding proposal', exact: true }).click();
  await page.locator('[data-proposal-id]').waitFor(); await idle();
  const proposalVault = await fixture.vault(); assert.equal(proposalVault.proposals.length, 1);
  const savedProposal = proposalVault.proposals[0];
  assert.deepEqual(savedProposal.value.proposal, publicProposal);
  assert.deepEqual(savedProposal.value.binding, { chain: 'solana', networkId: chain.documents.absent.network.networkId,
    deploymentId: chain.documents.absent.network.deploymentId, tradeId: ids.absent });
  assert.equal(savedProposal.value.originProfileId, originalProfile); assert.equal(savedProposal.value.role, 'seller');
  assert.deepEqual(savedProposal.value.configuration, { registrySha256: chain.buildOption.registrySha256,
    programDataSha256: chain.summary.programDataSha256, artifactSha256: chain.summary.artifactSha256,
    assetId: chain.documents.absent.asset.id, rpcUrl: chain.buildOption.rpcUrl, margins: chain.buildOption.margins });
  assert.equal(proposalVault.snapshot.revision, beforeProposal.snapshot.revision + 1, 'one explicit proposal admission commits once');
  assert.deepEqual(proposalVault.intents, beforeProposal.intents, 'saving creates no prepared journal intent');
  assert.equal(JSON.stringify(proposalVault.row).includes(ids.absent), false);
  assert.equal(JSON.stringify(proposalVault.row).includes(savedProposal.record.payload), false, 'private proposal payload is encrypted at rest');
  await proposalCard(savedProposal.record.id).getByText('Saved proposal', { exact: true }).waitFor();
  assert.equal(await card(ids.absent).count(), 0, 'a saved proposal is not a funded recovery card');
  assert.equal(fixture.walletConnects, connectsBeforeProposal); assert.equal(fixture.prompts.length, promptsBeforeProposal);
  assert.equal(chain.summary.appSends.length, sendsBeforeProposal);
  pass('explicit seller proposal admission encrypts complete fixed terms without wallet, prepared intent or send');
  for (const name of ['release', 'rebuild', 'refund']) {
    await page.getByLabel('Recovery JSON', { exact: true }).fill(JSON.stringify(chain.documents[name]));
    await page.getByRole('button', { name: 'Verify and save recovery document', exact: true }).click();
    await card(ids[name]).waitFor(); await idle();
  }
  const stored = await fixture.vault(); assert.equal(stored.documents.length, 3);
  for (const name of ['release', 'rebuild', 'refund']) {
    assert.deepEqual(stored.documents.find(r => r.document.termsHash === ids[name]).document, chain.documents[name]);
    assert.equal(JSON.stringify(stored.row).includes(ids[name]), false);
  }
  assert.equal(chain.summary.appSends.length, 0); assert.equal(fixture.prompts.length, 0);
  pass('actual module Worker refuses absent or wrong-pinned escrows and encrypts three complete original funded receipts');

  const publicDownloadEvent = page.waitForEvent('download');
  await card(ids.release).getByRole('button', { name: 'Export public recovery JSON', exact: true }).click();
  const publicDownload = await publicDownloadEvent;
  assert.equal(publicDownload.suggestedFilename(), `solana-escrow-${ids.release}.recovery.json`);
  const publicBytes = await readFile(await publicDownload.path()); await idle();
  assert.ok(publicBytes.length <= 16384);
  assert.deepEqual(JSON.parse(publicBytes.toString('utf8')), chain.documents.release);
  assert.equal(fixture.walletConnects, 0); assert.equal(fixture.prompts.length, 0); assert.equal(chain.summary.appSends.length, 0);
  pass('explicit public recovery download preserves the original document without a wallet connection or transaction');

  await connect(ids.release);
  assert.equal(await card(ids.release).getByRole('button', { name: 'Review release', exact: true }).isEnabled(), false);
  await prepare(ids.release, 'release');
  await page.getByRole('button', { name: 'Cancel transaction review', exact: true }).click();
  await review().waitFor({ state: 'hidden' });
  await until(async () => (await fixture.vault()).intents.every(r => r.state === 'cancelled'), 'durable pre-sign cancellation'); await idle();
  assert.equal(chain.summary.appSends.length, 0); assert.equal(fixture.prompts.length, 0);
  await prepare(ids.release, 'release'); fixture.holdNextSign();
  await page.getByRole('button', { name: 'Confirm and sign in wallet', exact: true }).click();
  await until(() => fixture.signPending, 'external physical signer pending');
  await page.evaluate(() => window.__solanaFixtureWalletChange());
  await until(async () => await page.locator('main').getAttribute('data-wallet-account') === '', 'wallet event synchronously revokes document authority');
  assert.equal(await card(ids.release).getByRole('button', { name: 'Connect seller wallet', exact: true }).isEnabled(), false,
    'reconnection remains blocked while the original physical signer is pending');
  fixture.settleSign(); await until(() => !fixture.signPending, 'original physical signer settled'); await idle();
  assert.equal(chain.summary.appSends.length, 0, 'late signed result after the wallet event never broadcasts');
  if (!await fixture.profileId()) await unlock(originalProfile, PASS);
  await connect(ids.release);
  pass('explicit cancellation and a wallet change during an actual sign-only prompt both send zero transactions');

  const buyerBefore = await getBalance(chain.rpc, chain.buyer, 'finalized');
  await prepare(ids.release, 'release'); await confirm(); await settled(ids.release, 'released', false);
  assert.equal(await getBalance(chain.rpc, chain.buyer, 'finalized'), buyerBefore, 'release alone changes state without paying');
  await prepare(ids.release, 'payout'); await confirm(); await settled(ids.release, 'released', true);
  assert.equal(await getBalance(chain.rpc, chain.buyer, 'finalized'), buyerBefore + 100000000);
  assert.equal(chain.summary.appSends.length, 2);
  pass('reviewed release finalizes alone, then a separate reviewed payout transfers exact principal to the original buyer');

  await connect(ids.rebuild); await prepare(ids.rebuild, 'release'); chain.withholdNextSend(); await confirm();
  const uncertain = (await fixture.vault()).intents.find(r => r.binding.tradeId === ids.rebuild && r.state === 'unknown');
  assert.ok(uncertain?.signature); assert.notEqual(uncertain.sendMarkedAt, null); assert.equal(chain.summary.appSends.length, 3);
  const sendsBeforeRestore = chain.summary.appSends.length, promptsBeforeRestore = fixture.prompts.length, connectsBeforeRestore = fixture.walletConnects;
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export encrypted backup', exact: true }).click();
  const download = await downloadEvent, backup = await readFile(await download.path()); await idle();
  await page.getByLabel('Funding proposal JSON', { exact: true }).fill(proposalJson);
  await page.getByRole('button', { name: 'Lock profile', exact: true }).click();
  await until(async () => await fixture.profileId() === '', 'profile lock'); await idle();
  assert.equal(await page.locator('[data-trade-id]').count(), 0);
  assert.equal(await page.locator('[data-proposal-id]').count(), 0, 'lock redacts saved proposals');
  await page.getByLabel('Encrypted backup', { exact: true }).setInputFiles({ name: 'local-recovery.backup', mimeType: 'application/octet-stream', buffer: backup });
  await page.getByLabel('Backup passphrase', { exact: true }).fill(PASS);
  await page.getByLabel('New profile passphrase', { exact: true }).fill(NEW_PASS); fixture.setPassphrase(NEW_PASS);
  await page.getByRole('button', { name: 'Restore with a fresh key', exact: true }).click();
  await until(async () => /^[0-9a-f]{32}$/.test(await fixture.profileId()) && await fixture.profileId() !== originalProfile, 'fresh-key encrypted restore'); await idle();
  const freshProfile = await fixture.profileId();
  assert.equal(await page.getByLabel('Recovery JSON', { exact: true }).inputValue(), '', 'fresh restore does not retain the prior profile input');
  assert.equal(await page.getByLabel('Funding proposal JSON', { exact: true }).inputValue(), '', 'fresh restore clears the prior proposal input');
  assert.equal(chain.summary.appSends.length, sendsBeforeRestore, 'the entire export/lock/restore sequence performs no physical send');
  assert.equal(fixture.prompts.length, promptsBeforeRestore, 'restore opens no sign prompt');
  assert.equal(fixture.walletConnects, connectsBeforeRestore, 'restore never reconnects the external wallet');
  let restored = await fixture.vault(), old = restored.intents.find(r => r.intentId === uncertain.intentId);
  assert.equal(old.originProfileId, originalProfile); assert.equal(old.signature, uncertain.signature); assert.equal(old.sendMarkedAt, uncertain.sendMarkedAt);
  for (const receipt of restored.documents) assert.equal(receipt.originProfileId, originalProfile);
  assert.deepEqual(restored.proposals, [savedProposal], 'fresh-key restore preserves exact proposal payload, binding and original provenance');
  await proposalCard(savedProposal.record.id).getByText('Original provenance preserved after restore', { exact: true }).waitFor();
  assert.equal(await card(ids.absent).count(), 0, 'restore never promotes an unfunded proposal to recovery');
  await noAutomaticSend(sendsBeforeRestore, promptsBeforeRestore);
  await connect(ids.rebuild);
  await until(async () => { await refresh(); return (await fixture.vault()).intents.find(r => r.intentId === uncertain.intentId).state === 'dropped'; },
    'definitive original blockhash expiry from finalized ledger history', 240000, 1500);
  await noAutomaticSend(sendsBeforeRestore, promptsBeforeRestore);
  await prepare(ids.rebuild, 'release', true); await confirm(); await settled(ids.rebuild, 'released', false);
  restored = await fixture.vault(); const replacement = restored.intents.find(r => r.replacementOf === uncertain.intentId);
  assert.equal(replacement.originProfileId, freshProfile); assert.notEqual(replacement.signature, uncertain.signature);
  assert.notEqual(replacement.message, uncertain.message); assert.equal(restored.intents.find(r => r.intentId === uncertain.intentId).originProfileId, originalProfile);
  await prepare(ids.rebuild, 'payout'); await confirm(); await settled(ids.rebuild, 'released', true);
  assert.equal(chain.summary.appSends.length, 5);
  pass('fresh-key restore preserves the unknown marker without resending; only finalized expiry and a new explicit review permit replacement');

  const deadline = Number(chain.documents.refund.terms.escrowExpirySeconds);
  console.log(`Waiting for the real finalized Clock to reach refund deadline ${deadline}; no warp or skip is available.`);
  let reported = 0;
  await waitSolana(async () => {
    const now = (await readClock(chain.rpc, 'finalized')).unixTimestamp;
    if (Date.now() - reported > 60000) { reported = Date.now(); console.log(`refund: ${Math.max(0, deadline - now)} real chain seconds remaining`); }
    return now >= deadline;
  }, 'real minimum-duration refund deadline', 2100000, 15000);
  assert.equal(await fixture.profileId(), '', 'the real idle interval locks the profile while waiting for chain time');
  await unlock(freshProfile, NEW_PASS); await connect(ids.refund); await refresh();
  assert.deepEqual((await fixture.vault()).proposals, [savedProposal], 'real idle lock and explicit unlock retain the original proposal');
  const sellerBefore = await getBalance(chain.rpc, chain.seller, 'finalized');
  await prepare(ids.refund, 'refund'); await confirm(); await settled(ids.refund, 'refunded', false);
  await prepare(ids.refund, 'payout'); await confirm(); await settled(ids.refund, 'refunded', true);
  // Each native single-signer transaction pays the real validator's fee; read those exact transaction metadata.
  const refundSends = chain.summary.appSends.filter(r => r.tradeId === ids.refund); assert.equal(refundSends.length, 2);
  let fees = 0;
  for (const send of refundSends) {
    const transaction = await chain.rpc.call('getTransaction', [send.signature, { commitment: 'finalized', encoding: 'json', maxSupportedTransactionVersion: 0 }]);
    assert.equal(transaction.meta.err, null); fees += transaction.meta.fee;
  }
  assert.equal(await getBalance(chain.rpc, chain.seller, 'finalized'), sellerBefore + 100000000 - fees);
  assert.equal(chain.summary.appSends.length, 7); assert.equal(chain.summary.appSends.filter(r => r.withheld).length, 1);
  assert.equal(new Set(chain.summary.appSends.map(r => r.signature)).size, 7);
  assert.equal(fixture.prompts.length, 8, 'one revoked prompt plus seven separately confirmed transaction messages');
  assert.deepEqual(fixture.unexpected, []); assert.deepEqual(fixture.errors, []); assert.deepEqual(chain.summary.fixtureErrors, []);
  pass('real chain time opens refund; separate reviewed refund and payout return original seller principal minus actual fees');
  await page.getByRole('button', { name: 'Lock profile', exact: true }).click(); await until(async () => await fixture.profileId() === '', 'final profile lock');
  console.log(JSON.stringify({ ok: true, kind: 'SOLANA_LOCAL_BROWSER_PROOF', checks, durationSeconds: Math.round((Date.now() - began) / 1000),
    ReleaseEnabled: 0, actualModuleWorker: true, encryptedIndexedDB: true, genesisRpcRewritten: false, clockWarped: false,
    originalProfile, freshProfile, walletConnects: fixture.walletConnects, walletPrompts: fixture.prompts, ...chain.summary,
    publicNetworkQualification: false, freshNegotiationQualification: false }, null, 2));
} finally { await fixture?.close(); }
