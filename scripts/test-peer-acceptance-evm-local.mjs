#!/usr/bin/env node
/** D1 peer acceptance on a real EVM (loopback Anvil, pinned toolchain): the D1 exchange with the wallet ports verifies a
 * contract-wallet (ERC-1271, real ABI eth_call) seller statement and an EOA buyer statement, then point-in-time rechecks
 * observe a revoked contract policy, an EIP-7702 delegation designator and an undeployed (counterfactual) signer.
 * Published Anvil development keys and temporary messaging keys only; no relay, wallet prompt, funding or external network. */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { RegistryService, TERMS_REVIEW_FORMAT, encodePrivateAgreement, encodeCapabilities } from '../packages/domain/index.ts';
import { createLocalNobleNostrProvider } from '../packages/nostr-crypto/index.ts';
import { createAdEvent, createOrderBook } from '../packages/relay/index.ts';
import { createRelayEventCrypto, createTermsExchange, adBookKey, BOTH_VERIFIED_LABEL } from '../packages/exchange/index.ts';
import { EncryptedVaultService } from '../packages/storage/index.ts';
import { VaultStorageError } from '../packages/storage/src/idb-vault-store.ts';
import { evmTermsHash, keccak256 } from '../packages/wallet/src/evm-terms.ts';
import { peerAcceptanceHash, resolvePeerDomain } from '../packages/wallet/src/evm-peer-acceptance.ts';
import { createEvmPeerAcceptancePorts, evmTermsFromReviewed } from '../packages/wallet/src/evm-peer-port.ts';
import { rpcClient, checkToolchain, forgeEnv, TOOLCHAIN } from './sepolia/lib.mjs';

const EVM_DIR = fileURLToPath(new URL('../contracts/evm/', import.meta.url));
const FOUNDRY = process.env.FOUNDRY_BIN ?? `${homedir()}/.foundry/bin`;
const ENV = { ...process.env, PATH: `${FOUNDRY}:${process.env.PATH ?? ''}` };
const ANVIL = existsSync(`${FOUNDRY}/anvil`) ? `${FOUNDRY}/anvil` : 'anvil';
const run = promisify(execFile), utf8 = new TextEncoder(), ZERO = `0x${'0'.repeat(40)}`, PASS = 'public synthetic D1 loopback passphrase';
const KEYS = [ // Anvil's documented public development keys, never credentials or real funds.
  'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
];
const hex = value => Buffer.from(value).toString('hex'), bytes = text => Uint8Array.from(Buffer.from(text, 'hex'));
const sha = value => createHash('sha256').update(value).digest('hex');
const val = (result, label) => { assert.equal(result.ok, true, `${label}: ${JSON.stringify(result)}`); return result.value; };
const refused = (result, code, label) => { assert.equal(result.ok, false, `${label}: expected ${code}`); assert.equal(result.code, code, label); return result; };
const addresses = KEYS.map(key => `0x${hex(keccak256(secp256k1.getPublicKey(bytes(key), false).subarray(1)).subarray(12))}`);
const sign = (key, digest) => { const s = secp256k1.sign(bytes(digest), bytes(key), { prehash: false, format: 'recovered', lowS: true }); return '0x' + hex(Uint8Array.from([...s.subarray(1), s[0] + 27])); };
const results = [], pass = name => { results.push(name); console.log(`ok - ${name}`); };
const freePort = () => new Promise((done, reject) => { const server = createServer(); server.once('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : done(port)); }); });
class Store {
  rows = new Map();
  subscribeInvalidation() { return () => {}; }
  async get(id) { return structuredClone(this.rows.get(id)); }
  async add(row) { this.rows.set(row.profileId, structuredClone(row)); }
  async compareAndSwap(expected, next, options) { options?.assertCurrent?.(); if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw new VaultStorageError('CONFLICT'); this.rows.set(next.profileId, structuredClone(next)); }
}
let anvil;
const closers = [];
try {
  await checkToolchain(ENV);
  const version = (await run(ANVIL, ['--version'], { env: forgeEnv(ENV), timeout: 5000, maxBuffer: 16384 })).stdout;
  assert.equal(/anvil Version: (\S+)/.exec(version)?.[1], TOOLCHAIN.forgeVersion);
  const port = await freePort(), url = `http://127.0.0.1:${port}`, rpc = rpcClient(url, { timeoutMs: 5000 });
  anvil = spawn(ANVIL, ['--host', '127.0.0.1', '--port', String(port), '--silent', '--chain-id', '31337'], { env: forgeEnv(ENV), stdio: 'ignore' });
  let spawnError; anvil.once('error', error => { spawnError = error; });
  for (let attempt = 0; ; attempt++) { try { await rpc('eth_chainId'); break; } catch { if (spawnError || anvil.exitCode !== null || attempt >= 100) throw new Error('Local Anvil startup failed'); await new Promise(done => setTimeout(done, 50)); } }
  const forgeCreate = async (target, args = []) => {
    const { stdout } = await run('forge', ['create', target, '--rpc-url', url, '--private-key', `0x${KEYS[0]}`, '--broadcast', '--json', '--constructor-args', ...args],
      { cwd: EVM_DIR, env: forgeEnv(ENV, { FOUNDRY_OFFLINE: 'true' }), maxBuffer: 1 << 20, timeout: 60000 });
    return JSON.parse(stdout.slice(stdout.indexOf('{'))).deployedTo.toLowerCase();
  };
  const escrow = await forgeCreate('src/BasicEscrow.sol:BasicEscrow', ['[]']); // empty ERC-20 allowlist
  const wallet = await forgeCreate('test/mocks/PeerAcceptanceWallet.sol:PeerAcceptanceWallet', [addresses[0]]);
  const registryInput = JSON.parse(await readFile(new URL('../packages/domain/test/fixtures/local-evm-scenario/registry.json', import.meta.url)));
  const network = registryInput.networks[0];
  network.genesisHash = (await rpc('eth_getBlockByNumber', ['0x0', false])).hash; network.assets = network.assets.filter(asset => asset.kind === 'native');
  network.deployments = [{ ...network.deployments[0], address: escrow, runtime: { kind: 'evm-code', keccak256: hex(keccak256(bytes((await rpc('eth_getCode', [escrow, 'latest'])).slice(2)))), upgradeable: false }, supportedAssetIds: ['native'] }];
  const registry = new RegistryService(), registryBytes = utf8.encode(JSON.stringify(registryInput));
  val(await registry.load(registryBytes, sha(registryBytes)), 'local registry');
  const request = ({ method, params }) => rpc(method, params ?? []);
  const reads = new Set(), observed = args => { reads.add(args.method); return request(args); };
  const chainNow = async () => Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
  let clock = await chainNow();
  const provider = createLocalNobleNostrProvider();
  const hashTerms = reviewed => { const terms = evmTermsFromReviewed(reviewed); return evmTermsHash(resolvePeerDomain(registry, terms), terms); };
  async function party() {
    const key = await provider.generate(), crypto2 = await createRelayEventCrypto(provider, key.secretKey), vault = new EncryptedVaultService(new Store(), crypto, { lifecycle: false });
    const session = val(await vault.create(PASS), 'vault'), ports = createEvmPeerAcceptancePorts({ registry, request: observed, vault, session });
    const book = createOrderBook({ nowSeconds: () => clock, verifier: crypto2 });
    const exchange = createTermsExchange({ provider, selfPublicKey: key.publicKey, ads: book, registry, hashTerms, now: () => clock, peerAcceptance: { verifier: ports.verifier, replay: ports.replay } });
    const self = { secret: key.secretKey, pub: key.publicKey, crypto: crypto2, book, exchange, ports, close() { exchange.close(); ports.dispose(); vault.dispose(); crypto2.dispose(); key.secretKey.fill(0); } };
    closers.push(self); return self;
  }
  const [seller, buyer] = [await party(), await party()];
  const domainFor = statement => resolvePeerDomain(registry, evmTermsFromReviewed(statement.reviewed));
  const statementFor = (key, statement) => ({ binding: { ...statement.binding }, termsSignature: sign(key, statement.termsHash), bindingSignature: sign(key, peerAcceptanceHash(domainFor(statement), statement.binding)) });
  async function negotiate(index, sellerAccount) {
    clock = await chainNow();
    const orderId = sha(`d1-loopback-order-${index}`), agreement = { v: 1, orderId, revision: '1', fiatCurrency: 'USD', fiatMinorUnits: '100', fiatScale: 2,
      paymentInstructions: 'SYNTHETIC private manual payment note. No fiat is sent.', capabilities: [], agreementSalt: sha(`d1-salt-${index}`) };
    const terms = { orderId, revision: '1', networkId: 'local-evm', deploymentId: 'escrow-local-v1', seller: sellerAccount, buyer: addresses[1], assetKind: 'native', asset: ZERO,
      amountBaseUnits: '1000000000000000', privateAgreementHash: sha(encodePrivateAgreement(agreement)), capabilitiesHash: sha(encodeCapabilities([])),
      sellerNonce: sha(`d1-nonce-${index}`), acceptBeforeSeconds: String(clock + 1200), escrowExpirySeconds: String(clock + 7200) };
    const document = utf8.encode(JSON.stringify({ format: TERMS_REVIEW_FORMAT, terms, privateAgreement: agreement }));
    const ad = await createAdEvent(seller.crypto, { app: 'p2p-offramp', v: 1, orderId, revision: 1, networkId: 'eip155:31337', assetId: 'native', amountMin: terms.amountBaseUnits,
      amountMax: terms.amountBaseUnits, currency: 'USD', railClass: 'bank-transfer', expiresAtSeconds: String(clock + 1800), maker: seller.pub }, clock);
    assert.equal(seller.book.ingest(ad), 'accepted'); assert.equal(buyer.book.ingest(ad), 'accepted');
    const take = val(await buyer.exchange.take(adBookKey(seller.pub, orderId), addresses[1], buyer.secret), 'take');
    val(await seller.exchange.receive(take.recipientWrap, seller.secret), 'take receipt');
    const statement = val(await seller.exchange.acceptanceStatement(take.sessionId, document, String(clock + 1200)), 'seller statement');
    return { id: take.sessionId, document, statement };
  }
  pass('pinned Anvil, deployed escrow and a test-only ERC-1271 wallet; registry is the only domain source');

  // 1. Contract-wallet seller (owner key 0 signs; the wallet validates by ecrecover) and EOA buyer (key 1).
  const one = await negotiate(1, wallet);
  const offer = val(await seller.exchange.offerWithAcceptance(one.id, one.document, statementFor(KEYS[0], one.statement), seller.secret), 'contract-wallet offer');
  const got = val(await buyer.exchange.receive(offer.recipientWrap, buyer.secret), 'offer receipt');
  assert.equal(got.acceptance.scheme, 'erc1271'); assert.match(got.acceptance.label, /^seller: accepted by contract wallet at block \d+ \(unfinalized\)$/);
  const buyerStatement = val(await buyer.exchange.acceptanceStatement(one.id, one.document, String(clock + 1200)), 'buyer statement');
  const accept = val(await buyer.exchange.acceptWithAcceptance(one.id, one.document, statementFor(KEYS[1], buyerStatement), buyer.secret), 'EOA accept');
  assert.equal(val(await seller.exchange.receive(accept.recipientWrap, seller.secret), 'accept receipt').acceptance.scheme, 'eoa');
  for (const party2 of [seller, buyer]) { const status = val(await party2.exchange.acceptanceStatus(one.id, 'fund'), 'fund recheck'); assert.equal(status.label, BOTH_VERIFIED_LABEL); }
  pass('ERC-1271 seller and EOA buyer: both statements verified by real eth_call ABI encoding and strict recovery');

  // 2. A statement signed by another key is refused by the contract wallet itself.
  const two = await negotiate(2, wallet);
  assert.equal(refused(await seller.exchange.offerWithAcceptance(two.id, two.document, statementFor(KEYS[1], two.statement), seller.secret), 'ACCEPTANCE_REFUSED', 'foreign signer').acceptance, 'UNAUTHORIZED');
  pass('the contract wallet refuses a statement its owner did not sign');

  // 3. The owner revokes the wallet policy: the next point-in-time recheck refuses funding and new acceptance.
  const disable = '0x' + hex(keccak256(utf8.encode('setEnabled(bool)')).subarray(0, 4)) + '0'.repeat(64);
  await rpc('eth_sendTransaction', [{ from: addresses[0], to: wallet, data: disable }]); await rpc('evm_mine', []);
  clock = await chainNow();
  assert.equal(refused(await buyer.exchange.acceptanceStatus(one.id, 'fund'), 'ACCEPTANCE_REFUSED', 'revoked policy').acceptance, 'UNAUTHORIZED');
  const shown = val(await buyer.exchange.acceptanceStatus(one.id, 'display'), 'display after revoke');
  assert.equal(shown.state, 'invalid'); assert.equal(shown.label, null);
  pass('a revoked contract-wallet policy is observed by the next recheck; nothing is displayed as accepted');

  // 4. The owner re-enables the policy (observed again), then the buyer EOA gains an EIP-7702 delegation designator:
  // refused as delegated (unsupported) on recheck.
  await rpc('eth_sendTransaction', [{ from: addresses[0], to: wallet, data: disable.slice(0, -1) + '1' }]); await rpc('evm_mine', []);
  clock = await chainNow();
  assert.equal(val(await seller.exchange.acceptanceStatus(one.id, 'fund'), 'policy re-enabled').state, 'both-verified');
  await rpc('anvil_setCode', [addresses[1], '0xef0100' + wallet.slice(2)]);
  assert.equal(await rpc('eth_getCode', [addresses[1], 'latest']), '0xef0100' + wallet.slice(2));
  const delegated = refused(await seller.exchange.acceptanceStatus(one.id, 'fund'), 'UNSUPPORTED_ACCOUNT', 'delegated buyer');
  assert.equal(delegated.reason, 'eip7702-delegated');
  await rpc('anvil_setCode', [addresses[1], '0x']);
  pass('an EIP-7702 delegated account is refused UNSUPPORTED, never verified as EOA or contract');

  // 5. An undeployed (counterfactual) contract-wallet seller: empty code, non-EOA signature.
  const undeployed = `0x${sha('d1-counterfactual').slice(0, 40)}`, five = await negotiate(5, undeployed);
  const counterfactual = { binding: { ...five.statement.binding }, termsSignature: '0x' + '07'.repeat(97), bindingSignature: '0x' + '09'.repeat(97) };
  assert.equal(refused(await seller.exchange.offerWithAcceptance(five.id, five.document, counterfactual, seller.secret), 'UNSUPPORTED_ACCOUNT', 'counterfactual').reason, 'counterfactual-or-undeployed');
  pass('an undeployed contract wallet is refused as counterfactual');

  assert.ok([...reads].every(method => ['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call'].includes(method)), 'verifier ports perform reads only');
  console.log(JSON.stringify({ fixture: 'd1-peer-acceptance-loopback', checks: results.length, verifierReadMethods: [...reads].sort(), walletPrompts: 0, funding: false,
    externalNetwork: false, tradingEnabled: false, releaseAcceptance: false }));
} finally {
  for (const closer of closers) closer.close();
  if (anvil?.pid && anvil.exitCode === null && anvil.signalCode === null) { const stopped = new Promise(done => anvil.once('exit', done)); anvil.kill('SIGTERM'); const timer = setTimeout(() => anvil.kill('SIGKILL'), 1000); timer.unref(); await stopped; clearTimeout(timer); }
}
