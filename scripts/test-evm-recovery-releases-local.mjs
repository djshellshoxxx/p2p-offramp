#!/usr/bin/env node
/**
 * D3 (PROPOSED) acceptance check 5, locally: a recovery package built from Sepolia testnet release N, copied outside the
 * checkout, still runs `inspect` and `prepare-refund` for an escrow funded under N after release N+1 (which adds a second
 * deployment) is accepted, after N's manifest has expired in real time, and after the release key is rotated, with no
 * app, origin, relay or registry lease. Each release is one G15 manifest over the registry and the canonical ABI (D3
 * Option A), verified by the same verifyTestnetTrust that sepolia:verify, the trade tool and the testnet build use, and
 * packaged by buildEvmRecoveryPackage from that live proof. Also check 6: a reference naming another deployment id is
 * WRONG_CHAIN, and an edited profile, registry, ABI or README is refused before any RPC.
 *
 * Private loopback Anvil started with Sepolia's chain id, public development accounts and ephemeral synthetic release
 * keys only. The genesis override is the existing local-proof seam; the source pin stays null (fixture pins are passed
 * explicitly to library calls, as the other local proofs do). The copied executable's RPC proxy permits reads only.
 *
 *   npm run test:recovery:evm   (needs Foundry: FOUNDRY_BIN, ~/.foundry/bin or PATH, and openssl)
 */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer as createHttpsServer } from 'node:https';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildFundNative, buildGetTrade, decodeTrade } from '../packages/wallet/src/evm-escrow.ts';
import { evmTermsHash, keccak256 } from '../packages/wallet/src/evm-terms.ts';
import { buildEvmRecoveryPackage } from './recovery/build-evm.mjs';
import { ABI_ASSET, buildManifest, keygen, REGISTRY_ASSET, signManifest, writeSignedRelease } from './sepolia/owner-release.mjs';
import { acceptSepoliaRelease, TRUSTED_KEY_PATH, verifySepoliaRelease } from './sepolia/verify-release.mjs';
import { checkToolchain, escrowArtifact, forgeEnv, rpcClient, SEPOLIA } from './sepolia/lib.mjs';
import { TESTNET_ACCEPTED_FILE, verifyTestnetTrust } from '../apps/web/scripts/testnet-trust.mjs';
import { SEPOLIA_RELEASE_KEY_ID } from '../apps/web/src/testnet/sepolia-network.ts';
import { copySigningInputs } from './lib/testnet-fixture.mjs';

const run = promisify(execFile), ROOT = fileURLToPath(new URL('../', import.meta.url));
const FOUNDRY = process.env.FOUNDRY_BIN ?? `${homedir()}/.foundry/bin`;
const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('SEPOLIA_')));
const ENV = { ...inherited, PATH: `${FOUNDRY}:${inherited.PATH ?? ''}` };
const ANVIL = existsSync(`${FOUNDRY}/anvil`) ? `${FOUNDRY}/anvil` : 'anvil';
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Published Anvil development key.
const ZERO = `0x${'0'.repeat(40)}`, AMOUNT = 1_000_000_000_000_000n, DAY = 86_400;
const V1 = 'escrow-sepolia-v1', V2 = 'escrow-sepolia-v2';
const quantity = value => `0x${BigInt(value).toString(16)}`;
const hex = value => Buffer.from(value).toString('hex');
const sha = value => createHash('sha256').update(value).digest('hex');
const methods = [], checks = [], allowed = new Set(['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call']);
const pass = label => { checks.push(label); console.log(`ok - ${label}`); };
const temporary = await mkdtemp(resolve(tmpdir(), 'p2p-evm-recovery-releases-'));
const certificatePath = resolve(temporary, 'loopback-cert.pem');
let anvil, proxy, rpc, accounts;

const freePort = () => new Promise((done, fail) => {
  const server = createServer(); server.once('error', fail);
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(error => error ? fail(error) : done(port)); });
});
const mine = (count = 5) => rpc('anvil_mine', [quantity(count)]);
const block = tag => rpc('eth_getBlockByNumber', [tag, false]);
const chainTime = async () => BigInt((await block('latest')).timestamp);
async function send(from, call) {
  const hash = await rpc('eth_sendTransaction', [{ from, to: call.to, data: call.data, value: quantity(call.value ?? '0'), gas: '0x7a120' }]);
  let receipt;
  for (let attempt = 0; attempt < 100; attempt++) { receipt = await rpc('eth_getTransactionReceipt', [hash]); if (receipt) break; await new Promise(done => setTimeout(done, 20)); }
  assert.equal(receipt?.status, '0x1', 'separate fixture-wallet transaction succeeded'); return receipt;
}
async function deployEscrow() {
  const result = await run('forge', ['create', 'src/BasicEscrow.sol:BasicEscrow', '--rpc-url', rpc.url, '--private-key', KEY, '--broadcast', '--json', '--constructor-args', '[]'],
    { cwd: resolve(ROOT, 'contracts/evm'), env: forgeEnv(ENV, { FOUNDRY_OFFLINE: 'true' }), timeout: 60_000, maxBuffer: 1 << 20 });
  const address = JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))).deployedTo.toLowerCase(); await mine();
  const runtime = hex(keccak256(Buffer.from((await rpc('eth_getCode', [address, 'latest'])).slice(2), 'hex')));
  return { address, runtime };
}
function terms(label, now, escrowId) {
  return { orderId: sha(`releases-${label}`), revision: '1', networkId: 'sepolia', deploymentId: escrowId, seller: accounts[0], buyer: accounts[1],
    assetKind: 'native', asset: ZERO, amountBaseUnits: String(AMOUNT), privateAgreementHash: sha('synthetic release-survival proof'),
    capabilitiesHash: sha('core-only'), sellerNonce: sha(`nonce-${label}`), acceptBeforeSeconds: String(now + 600n), escrowExpirySeconds: String(now + 3600n) };
}
async function fund(label, escrowId, escrow) {
  const value = terms(label, await chainTime(), escrowId), domain = { chainId: SEPOLIA.chainId.toString(), verifyingContract: escrow };
  await send(accounts[0], buildFundNative(domain, value)); await mine();
  return { terms: value, tradeId: evmTermsHash(domain, value), escrow };
}
async function stored(escrow, tradeId) {
  const call = buildGetTrade(escrow, tradeId);
  return decodeTrade(await rpc('eth_call', [{ to: call.to, data: call.data }, 'latest']));
}
/** Runs a copied package with Node alone: no checkout, loader, app, origin, relay, key or registry lease. */
async function cli(executable, command, args, { succeeds = true } = {}) {
  let result;
  try {
    result = await run(process.execPath, [executable, command, '--endpoint', 'recovery-loopback', ...args],
      { cwd: resolve(temporary, 'consumer'), env: { PATH: inherited.PATH ?? '', TZ: 'UTC', NODE_EXTRA_CA_CERTS: certificatePath }, timeout: 15_000, maxBuffer: 128 * 1024 });
  } catch (error) { result = error; }
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, succeeds, `${command}: ${result.stdout}`);
  if (succeeds) return parsed.value;
  assert.doesNotMatch(result.stdout, /https?:|privateKey/); return parsed.error;
}

try {
  assert.equal(SEPOLIA_RELEASE_KEY_ID, null, 'the source pin stays unset: fixture pins are explicit library inputs');
  await checkToolchain(ENV);
  const port = await freePort(), url = `http://127.0.0.1:${port}/`;
  rpc = Object.assign(rpcClient(url, { timeoutMs: 5000 }), { url });
  anvil = spawn(ANVIL, ['--host', '127.0.0.1', '--port', String(port), '--silent', '--chain-id', SEPOLIA.chainId.toString(), '--slots-in-an-epoch', '1'],
    { env: forgeEnv(ENV), stdio: 'ignore' });
  let spawnError; anvil.once('error', error => { spawnError = error; });
  for (let attempt = 0; ; attempt++) {
    try { await rpc('eth_chainId'); break; }
    catch { if (spawnError || anvil.exitCode !== null || attempt >= 100) throw Error('Local Anvil startup failed'); await new Promise(done => setTimeout(done, 50)); }
  }
  accounts = (await rpc('eth_accounts')).map(value => value.toLowerCase());
  const genesisHash = (await block('0x0')).hash;
  assert.notEqual(genesisHash, SEPOLIA.genesisHash, 'a local node never passes as real Sepolia by default');
  const first = await deployEscrow(), second = await deployEscrow();
  const { creationSha256 } = await escrowArtifact();

  const certificateKeyPath = resolve(temporary, 'loopback-key.pem');
  await run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', certificateKeyPath, '-out', certificatePath,
    '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { timeout: 10_000, maxBuffer: 1 << 20 });
  proxy = createHttpsServer({ key: await readFile(certificateKeyPath), cert: await readFile(certificatePath) }, async (request, response) => {
    try {
      let text = ''; for await (const part of request) { text += part; assert.ok(text.length <= 65_536); }
      const call = JSON.parse(text); methods.push(call.method); assert.ok(allowed.has(call.method), `recovery attempted ${call.method}`);
      const result = await rpc(call.method, call.params);
      response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ jsonrpc: '2.0', id: call.id, result }));
    } catch { response.writeHead(500); response.end('{}'); }
  });
  await new Promise((done, fail) => { proxy.once('error', fail); proxy.listen(0, '127.0.0.1', done); });
  const proxyUrl = `https://127.0.0.1:${proxy.address().port}/`;

  // A temporary checkout-shaped trust root: the canonical ABI, the registry, the key file and each signed release.
  const root = resolve(temporary, 'root'); await copySigningInputs(root);
  await mkdir(resolve(root, 'registry/testnet'), { recursive: true }); await mkdir(resolve(root, TRUSTED_KEY_PATH, '..'), { recursive: true });
  const deployment = (id, { address, runtime }) => ({ id, address, protocolVersion: 1, artifactSha256: creationSha256,
    runtime: { kind: 'evm-code', keccak256: runtime, upgradeable: false }, supportedAssetIds: ['native'] });
  const registry = (...deployments) => ({ version: 1, releaseId: `sepolia-testnet-${deployments.at(-1).address.slice(2, 10)}`,
    networks: [{ id: 'sepolia', chain: 'evm', chainIdentity: SEPOLIA.chainId.toString(), genesisHash, endpoints: [{ id: 'recovery-loopback', url: proxyUrl }],
      finality: { kind: 'evm-finalized-tag' }, assets: [{ id: 'native', kind: 'native', address: null, decimals: 18, transferPolicy: 'exact-transfer' }],
      deployments, environment: 'testnet' }] });
  /** One owner release: the registry and the canonical ABI under one G15 manifest, signed with `key`. */
  async function release({ key, sequence, registryValue, now, days }) {
    await writeFile(resolve(root, REGISTRY_ASSET), JSON.stringify(registryValue, null, 2) + '\n');
    await writeFile(resolve(root, TRUSTED_KEY_PATH), JSON.stringify({ keyId: key.keyId, publicKey: key.publicKey }));
    const read = path => readFile(resolve(root, path));
    const manifest = await buildManifest({ registry: await read(REGISTRY_ASSET), abi: await read(ABI_ASSET), sequence, days, now, root, sourceCommit: 'f'.repeat(40) });
    assert.deepEqual(manifest.assets.map(asset => asset.path), [ABI_ASSET, REGISTRY_ASSET]);
    const signed = signManifest(key.privateJwk, manifest); await writeSignedRelease(root, signed);
    return { ...signed, manifest, key, registryBytes: await read(REGISTRY_ASSET) };
  }
  const verify = (key, nowSeconds) => verifyTestnetTrust(root, { pinnedKeyId: key.keyId, genesisHash, ...(nowSeconds ? { nowSeconds: () => nowSeconds } : {}) });
  /** Packages one deployment from the exact live proof of the shared testnet verifier, then copies it outside the checkout. */
  async function packageFor(name, checked, deploymentId) {
    assert.equal(checked.ok, true, JSON.stringify(checked.error));
    const built = await buildEvmRecoveryPackage({ verifiedRelease: checked.value.verified, registryPath: REGISTRY_ASSET, registryBytes: new Uint8Array(checked.value.registryBytes),
      abiPath: ABI_ASSET, abiBytes: new Uint8Array(checked.value.abiBytes), networkId: 'sepolia', deploymentId, outDir: resolve(temporary, `built-${name}`) });
    const target = resolve(temporary, 'consumer', name); await mkdir(resolve(temporary, 'consumer'), { recursive: true });
    await cp(built.directory, target, { recursive: true }); await rm(built.directory, { recursive: true });
    return { executable: resolve(target, basename(built.executable)), directory: target, profile: built.profile };
  }
  const accept = async (key, nowSeconds) => {
    const checked = await verifySepoliaRelease({ root, pinnedKeyId: key.keyId, expectGenesis: genesisHash, ...(nowSeconds ? { nowSeconds: () => nowSeconds } : {}) });
    assert.equal(checked.ok, true, JSON.stringify(checked.error)); await acceptSepoliaRelease(checked, { root });
  };

  // Release N: sequence 1, key K1, escrow-sepolia-v1 only. Its 2-day window ended 8 days ago in real time; the package is
  // built while the proof is current (an injected clock inside the window), as the owner must do before expiresAt.
  const k1 = keygen(), now = Math.floor(Date.now() / 1000), T0 = now - 10 * DAY;
  const n = await release({ key: k1, sequence: 1, registryValue: registry(deployment(V1, first)), now: T0, days: 2 });
  assert.ok(n.manifest.expiresAt < now, 'release N has expired in real time');
  const packageN = await packageFor('release-n', await verify(k1, T0 + 60), V1);
  assert.equal(packageN.profile.release.manifestSha256, n.envelope.manifestSha256); assert.equal(packageN.profile.deploymentId, V1);
  assert.ok(packageN.profile.release.expiresAt < now, 'package N records the (already expired) release it was built under');
  await accept(k1, T0 + 60);
  const tradeA = await fund('a', V1, first.address);
  pass('release N signs registry and ABI in one manifest; its v1 package is built from the shared verifier\'s live proof before expiresAt');

  // Release N+1: sequence 2, same key, v1 unchanged plus escrow-sepolia-v2. Accepted; N is now a rollback and expired.
  const n1 = await release({ key: k1, sequence: 2, registryValue: registry(deployment(V1, first), deployment(V2, second)), now: now - 60, days: 30 });
  await accept(k1);
  const packageN1v2 = await packageFor('release-n1-v2', await verify(k1), V2);
  const tradeB = await fund('b', V2, second.address);
  await writeSignedRelease(root, n);
  assert.deepEqual(await verify(k1, T0 + 60), { ok: false, error: { code: 'RELEASE_ROLLBACK' } }, 'after N+1 is accepted, N is a rollback');
  assert.deepEqual(await verify(k1), { ok: false, error: { code: 'MANIFEST_EXPIRED' } }, 'N has expired');
  await writeSignedRelease(root, n1);
  pass('release N+1 (adds v2, keeps v1) is accepted; release N is now refused as a rollback and as expired');

  // Rotation: key K2 replaces K1 (public file and pin together). N+1 signed by K1 is no longer trusted; N+2 by K2 is.
  const k2 = keygen();
  await writeFile(resolve(root, TRUSTED_KEY_PATH), JSON.stringify({ keyId: k2.keyId, publicKey: k2.publicKey }));
  assert.deepEqual(await verify(k2), { ok: false, error: { code: 'KEY_UNTRUSTED' } }, 'a release signed by the rotated-out key is refused');
  await release({ key: k2, sequence: 3, registryValue: registry(deployment(V1, first), deployment(V2, second)), now: now - 60, days: 30 });
  await accept(k2);
  const packageN2 = await packageFor('release-n2', await verify(k2), V1);
  assert.equal(JSON.parse(await readFile(resolve(root, TESTNET_ACCEPTED_FILE), 'utf8')).sequence, 3);
  await writeSignedRelease(root, n);
  assert.deepEqual(await verify(k2, T0 + 60), { ok: false, error: { code: 'RELEASE_ROLLBACK' } });
  pass('key rotation: the rotated-out key\'s release is KEY_UNTRUSTED, release N+2 by the new key is accepted and packaged');

  // Survival: after all of the above, package N still inspects and prepares a refund for the escrow funded under N.
  const methodsBefore = methods.length;
  const snapshot = await cli(packageN.executable, 'inspect', ['--trade-id', tradeA.tradeId]);
  assert.deepEqual(snapshot.trade, await stored(first.address, tradeA.tradeId)); assert.equal(snapshot.historicalOnly, true); assert.equal(snapshot.releaseEnabled, false);
  assert.equal(snapshot.binding.deploymentId, V1);
  await rpc('evm_setNextBlockTimestamp', [Number(tradeA.terms.escrowExpirySeconds)]); await mine(1);
  const refundPlan = await cli(packageN.executable, 'prepare-refund', ['--trade-id', tradeA.tradeId, '--from', accounts[2]]);
  assert.equal(refundPlan.transaction.to, first.address); assert.equal(refundPlan.transaction.value, '0x0');
  assert.equal(refundPlan.transaction.chainId, quantity(SEPOLIA.chainId));
  // A later package whose deployment id keeps the same signed identity reads the same escrow.
  assert.deepEqual((await cli(packageN2.executable, 'inspect', ['--trade-id', tradeA.tradeId])).trade, await stored(first.address, tradeA.tradeId));
  const sellerBefore = BigInt(await rpc('eth_getBalance', [accounts[0], 'latest']));
  await send(accounts[2], refundPlan.transaction); await mine();
  assert.equal((await stored(first.address, tradeA.tradeId)).state, 'refunded');
  assert.equal(BigInt(await rpc('eth_getBalance', [accounts[0], 'latest'])) - sellerBefore, AMOUNT);
  assert.ok(methods.slice(methodsBefore).every(method => allowed.has(method)));
  pass('package N, copied outside the checkout, inspects and prepares the refund for the escrow funded under N after N+1, N\'s expiry and key rotation; the refund pays the seller');

  // Each deployment keeps its own package: v2's trade is reached by the v2 package, never by package N (check 6).
  assert.deepEqual((await cli(packageN1v2.executable, 'inspect', ['--trade-id', tradeB.tradeId])).trade, await stored(second.address, tradeB.tradeId));
  assert.equal((await cli(packageN.executable, 'inspect', ['--trade-id', tradeB.tradeId])).trade.state, 'absent', 'package N reads only v1\'s address');
  const reference = resolve(temporary, 'consumer/v2-reference.json');
  await writeFile(reference, JSON.stringify({ format: 'p2p-offramp/offline-recovery-references/v1', authority: 'unverified-offline-reference', localSnapshotRevision: 1,
    items: [{ recordId: 'ab'.repeat(16), intentId: Buffer.alloc(32, 9).toString('base64url'), binding: { chain: 'evm', networkId: 'sepolia', deploymentId: V2, tradeId: tradeB.tradeId },
      account: accounts[0], action: 'refund', storedState: 'finalized', chainReference: `0x${'cd'.repeat(32)}`, nonce: '1' }] }));
  const beforeReference = methods.length;
  assert.equal((await cli(packageN.executable, 'inspect', ['--reference', reference, '--item', '0'], { succeeds: false })).code, 'WRONG_CHAIN');
  assert.equal(methods.length, beforeReference, 'a reference naming another deployment is refused before any RPC');
  pass('each deployment id keeps its own package: v2 is recovered by its package; a reference naming v2 given to package N is WRONG_CHAIN before any RPC');

  for (const name of ['profile.json', 'registry.json', 'BasicEscrow.json', 'README.md']) {
    const path = resolve(packageN.directory, name), original = await readFile(path), before = methods.length;
    await writeFile(path, Buffer.concat([original, Buffer.from(' ')]));
    assert.equal((await cli(packageN.executable, 'inspect', ['--trade-id', tradeA.tradeId], { succeeds: false })).code, 'ASSET_MISMATCH');
    assert.equal(methods.length, before, 'a tampered archive fails before RPC');
    await writeFile(path, original);
  }
  pass('an edited profile, registry, ABI or README in package N is refused against the executable pins before networking');

  console.log(JSON.stringify({ fixture: 'evm-recovery-across-releases', checks: checks.length, recoveryReads: methods.length, releases: 3, keyRotated: true,
    expiredReleaseStillExits: true, copiedOutsideCheckout: true, externalNetwork: false, sourcePinUnset: true, tradingEnabled: false, releaseAcceptance: false }));
} finally {
  if (proxy) { proxy.closeAllConnections(); await new Promise(done => proxy.close(done)); }
  if (anvil?.pid && anvil.exitCode === null && anvil.signalCode === null) {
    const stopped = new Promise(done => anvil.once('exit', done)); anvil.kill('SIGTERM');
    const timer = setTimeout(() => anvil.kill('SIGKILL'), 1000); timer.unref(); await stopped; clearTimeout(timer);
  }
  await rm(temporary, { recursive: true, force: true });
}
