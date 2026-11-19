import test from 'node:test';
import assert from 'node:assert/strict';
import { bindSolanaTrade } from '../src/bind.ts';
import { compileLegacyMessage, parseLegacyMessage } from '../src/message.ts';
import { compilePlan, planRelease, readTrustedSnapshot, verifyPlanMessage } from '../src/plan.ts';
import { SolanaChainReader } from '../src/reader.ts';
import {
  bindRecoveryTrade,
  buildRecoveryMessage,
  createRecoveryDocument,
  parseRecoveryDocument,
  recoveryExits,
  recoveryRegistry,
} from '../src/recovery.ts';
import { buildPayout, buildRelease } from '../src/instructions.ts';
import { BUYER, makeCluster, MARGINS, SELLER } from './lifecycle-support.mjs';
import {
  account,
  bindingOf,
  CHAIN_TIME,
  enc,
  error,
  key,
  LOADER,
  makeRegistry,
  makeTerms,
  ok,
  PROGRAM_DATA,
  programDataBytes,
  request,
} from './support.mjs';

const code = expected => thrown => thrown?.code === expected;
const BLOCKHASH = key('recovery-blockhash');
function world(kind = 'spl', o = {}) {
  const terms = makeTerms(kind, { seller: SELLER.address, buyer: BUYER.address, ...o.terms });
  const cluster = makeCluster(terms, o);
  const appTrade = ok(bindSolanaTrade(makeRegistry(), bindingOf(terms), terms));
  const document = ok(createRecoveryDocument(appTrade));
  // Recovery uses only the document: its own registry view, any RPC.
  const trade = ok(bindRecoveryTrade(document));
  const reader = new SolanaChainReader({ rpc: cluster.rpc, registry: recoveryRegistry(document), now: () => 1 });
  const read = async () => ok(await readTrustedSnapshot(reader, trade, request()));
  return { terms, cluster, appTrade, document, trade, read };
}

test('document-is-self-contained-and-public', async () => {
  const { document, appTrade, trade } = world('spl');
  const json = JSON.stringify(document);
  assert.deepEqual(parseRecoveryDocument(JSON.parse(json)), document);
  assert.equal(trade.binding.tradeId, appTrade.binding.tradeId);
  assert.equal(trade.escrow.address, appTrade.escrow.address);
  assert.equal(trade.vault.address, appTrade.vault.address);
  // Only public values: keys, hashes, amounts, times, labels. No secret-looking field anywhere.
  const fields = [];
  const walk = (value, path) => {
    if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    else fields.push(path);
  };
  walk(document, '');
  for (const field of fields)
    assert.doesNotMatch(field, /secret|seed|private(?!AgreementHash)|mnemonic|signature|keypair/i);
  assert.equal(document.terms.privateAgreementHash.length, 64);
  assert.ok(!json.includes(Buffer.from(SELLER.seed).toString('hex')));
});

test('document-tampering-refused', () => {
  const { document } = world('spl');
  const clone = () => JSON.parse(JSON.stringify(document));
  const cases = {
    escrow: d => (d.escrow.address = key('evil')),
    bump: d => (d.escrow.bump = (d.escrow.bump + 1) % 256),
    vault: d => (d.vault.address = key('evil-vault')),
    vaultMissing: d => (d.vault = null),
    termsHash: d => (d.termsHash = 'ab'.repeat(32)),
    termsBytes: d => (d.termsBytesBase64 = Buffer.from('x').toString('base64')),
    termsAmount: d => (d.terms.amountBaseUnits = '1'),
    genesis: d => (d.network.genesisHash = key('other-genesis')),
    program: d => (d.network.programId = key('other-program')),
    programData: d => (d.network.programDataAddress = key('other-programdata')),
    roles: d => (d.roles.buyer = SELLER.address),
    mint: d => (d.asset.mint = key('other-mint')),
    kind: d => (d.asset.kind = 'native'),
  };
  for (const [name, change] of Object.entries(cases)) {
    const doc = clone();
    change(doc);
    assert.throws(
      () => parseRecoveryDocument(doc),
      thrown => ['INTEGRITY_FAILURE', 'INVALID_INPUT'].includes(thrown?.code),
      name,
    );
  }
  assert.throws(() => parseRecoveryDocument({ ...clone(), extra: 1 }), code('INVALID_INPUT'));
  assert.throws(() => parseRecoveryDocument({ ...clone(), format: 'v2' }), code('UNSUPPORTED_VERSION'));
});

test('reader-checks-chain-against-the-document', async () => {
  const good = world('native');
  assert.equal((await good.read()).escrow.state, 'funded');
  const reread = async env =>
    readTrustedSnapshot(
      new SolanaChainReader({ rpc: env.cluster.rpc, registry: recoveryRegistry(env.document), now: () => 1 }),
      env.trade,
      request(),
    );
  // The document pins the ProgramData hash: another program image at the same address is refused.
  const image = world('native');
  image.cluster.world.accounts.set(
    PROGRAM_DATA,
    account(programDataBytes({ elf: enc.encode('\x7fELF other image') }), LOADER),
  );
  error(await reread(image), 'INTEGRITY_FAILURE');
  // And the genesis hash.
  const genesis = world('native');
  genesis.cluster.world.genesis = key('wrong-genesis');
  error(await reread(genesis), 'WRONG_CHAIN');
});

test('exits-follow-finalized-state-and-clock', async () => {
  const env = world('native');
  const exits = async () =>
    Object.fromEntries(
      ok(recoveryExits(env.document, env.trade, await env.read(), MARGINS)).exits.map(exit => [exit.exit, exit.reason]),
    );
  assert.deepEqual(await exits(), { release: 'open', refund: 'before-deadline', payout: 'not-terminal' });
  env.cluster.time = CHAIN_TIME + 3600 - 300;
  env.cluster.sync();
  assert.deepEqual(await exits(), { release: 'deadline-margin', refund: 'before-deadline', payout: 'not-terminal' });
  env.cluster.time = CHAIN_TIME + 3600;
  env.cluster.sync();
  assert.deepEqual(await exits(), { release: 'deadline-margin', refund: 'open', payout: 'not-terminal' });
  env.cluster.setEscrow({ state: 2 });
  assert.deepEqual(await exits(), { release: 'not-funded', refund: 'not-funded', payout: 'open' });
  env.cluster.setEscrow({ state: 2, paid: 1 });
  assert.deepEqual(await exits(), { release: 'not-funded', refund: 'not-funded', payout: 'paid-out' });
  const snapshot = await env.read();
  error(recoveryExits(env.document, env.trade, structuredClone(snapshot), MARGINS), 'INVALID_INPUT');
  error(recoveryExits(env.document, env.trade, snapshot, { submitMarginSeconds: '1' }), 'INVALID_INPUT');
});

test('recovery exits reject a snapshot for different terms at the same escrow PDA', async () => {
  const target = world('native');
  const other = world('native', { terms: { orderId: 'ef'.repeat(32) } });
  assert.equal(other.trade.escrow.address, target.trade.escrow.address, 'PDA uses seller and nonce, not all terms');
  assert.notEqual(other.trade.binding.tradeId, target.trade.binding.tradeId);
  const snapshot = await other.read();
  error(recoveryExits(target.document, target.trade, snapshot, MARGINS), 'INVALID_INPUT');
  error(buildRecoveryMessage(target.document, target.trade, snapshot, 'release', 'seller', MARGINS, BLOCKHASH),
    'INVALID_INPUT');
  assert.equal(ok(recoveryExits(target.document, target.trade, await target.read(), MARGINS)).exits[0].open, true);
});

test('recovery-messages-follow-c-l2', async () => {
  const env = world('spl');
  const funded = await env.read();
  const release = ok(buildRecoveryMessage(env.document, env.trade, funded, 'release', 'seller', MARGINS, BLOCKHASH));
  // Same bytes as the client's own plan for the app-registry trade.
  const clientPlan = ok(planRelease(env.trade, funded, 'seller', MARGINS));
  assert.deepEqual(release.message, compilePlan(clientPlan, BLOCKHASH));
  assert.equal(parseLegacyMessage(release.message).instructions.length, 1);
  assert.equal(release.unsignedTransaction[0], 1);
  error(buildRecoveryMessage(env.document, env.trade, funded, 'payout', 'buyer', MARGINS, BLOCKHASH), 'CONFLICT');
  error(buildRecoveryMessage(env.document, env.trade, funded, 'refund', 'seller', MARGINS, BLOCKHASH), 'EXPIRED');
  error(buildRecoveryMessage(env.document, env.trade, funded, 'release', 'buyer', MARGINS, BLOCKHASH), 'UNAUTHORIZED');
  error(buildRecoveryMessage(env.document, env.trade, funded, 'sweep', 'seller', MARGINS, BLOCKHASH), 'INVALID_INPUT');
  env.cluster.setEscrow({ state: 1 });
  const payout = ok(
    buildRecoveryMessage(env.document, env.trade, await env.read(), 'payout', 'buyer', MARGINS, BLOCKHASH),
  );
  assert.deepEqual(payout.plan.shape, {
    action: 'payout',
    outcome: 'released',
    createAta: true,
    rentTopUpLamports: null,
  });
  assert.equal(verifyPlanMessage(env.trade, 'payout', 'released', BUYER.address, payout.message).createAta, true);
  // There is no recovery path to a bundled message either.
  const bundle = compileLegacyMessage(
    SELLER.address,
    [ok(buildRelease(env.trade)), ok(buildPayout(env.trade, 'released'))],
    BLOCKHASH,
  );
  assert.throws(
    () => verifyPlanMessage(env.trade, 'payout', 'released', SELLER.address, bundle),
    code('INVALID_INPUT'),
  );
  const other = world('spl', { terms: { sellerNonce: 'ef'.repeat(32) } });
  assert.notEqual(other.trade.escrow.address, env.trade.escrow.address);
  error(
    buildRecoveryMessage(env.document, other.trade, await other.read(), 'release', 'seller', MARGINS, BLOCKHASH),
    'INVALID_INPUT',
  );
});
