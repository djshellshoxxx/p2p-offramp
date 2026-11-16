import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { registryFixture } from '../../security/test/lib/release-registry-fixture.mjs';
import { sha } from '../../security/test/lib/release-fixture.mjs';
import { verifyRelease } from '../../security/src/release-manifest.ts';
import { buildEvmRecoveryPackage } from '../../../scripts/recovery/build-evm.mjs';
import { prepareEvmRecovery } from '../../../scripts/recovery/evm-recovery.mjs';
import { buildPendingWithdrawals, buildWithdraw } from '../src/evm-escrow.ts';
import { keccak256 } from '../src/evm-terms.ts';

// Synthetic signed local registry and mocked read-only RPC. These are not deployable
// tokens, fundable accounts or a substitute for local-chain/independent acceptance.
const SELLER = '0x' + '31'.repeat(20);
const BUYER = '0x' + '32'.repeat(20);
const PREPARER = '0x' + '33'.repeat(20);
const TOKEN = '0x' + '77'.repeat(20);
const UNLISTED_TOKEN = '0x' + '78'.repeat(20);
const ZERO = '0x' + '0'.repeat(40);
const TRADE_ID = 'ab'.repeat(32);
const word = value => BigInt(value).toString(16).padStart(64, '0');

test('G12 historical ERC-20 deferred withdrawal is bound to on-chain recipient and asset, not preparer or native credit', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'g12-erc20-withdraw-'));
  try {
    const abiPath = 'contracts/evm/abi/BasicEscrow.json';
    const abiBytes = new Uint8Array(await readFile(new URL('../../../contracts/evm/abi/BasicEscrow.json', import.meta.url)));
    const fixture = registryFixture({
      editRegistry: registry => {
        const network = registry.networks[0];
        network.assets.push({ id: 'synthetic-token', kind: 'erc20', address: TOKEN, decimals: 6, transferPolicy: 'exact-transfer' });
        network.deployments[0].supportedAssetIds.push('synthetic-token');
      },
      editManifest: manifest => {
        manifest.assets.push({ path: abiPath, bytes: abiBytes.length, sha256: sha(abiBytes) });
        manifest.assets.sort((a, b) => a.path < b.path ? -1 : 1);
      },
    });
    fixture.assets.push({ path: abiPath, bytes: abiBytes });
    const verified = await verifyRelease(fixture.bytes, fixture.envelope, [fixture.key], 0, fixture.options);
    assert.equal(verified.ok, true, JSON.stringify(verified));
    const packaged = await buildEvmRecoveryPackage({
      verifiedRelease: verified.value, registryPath: fixture.registryPath, registryBytes: fixture.registryBytes,
      abiPath, abiBytes, networkId: 'local-evm', deploymentId: 'escrow-fixture',
      outDir: resolve(temporary, 'bundle'),
    });
    const profile = structuredClone(packaged.profile);
    const registry = JSON.parse(Buffer.from(profile.registry.bytes, 'base64url'));
    registry.networks[0].deployments[0].runtime.keccak256 =
      Buffer.from(keccak256(Buffer.from('6000', 'hex'))).toString('hex');
    const registryBytes = Buffer.from(JSON.stringify(registry));
    profile.registry.bytes = registryBytes.toString('base64url');
    profile.registry.sha256 = sha(registryBytes);

    const network = registry.networks[0], escrow = network.deployments[0].address;
    const binding = { chain: 'evm', networkId: 'local-evm', deploymentId: 'escrow-fixture', tradeId: TRADE_ID };
    const calls = [];
    let state = 'released', tokenOnChain = TOKEN, erc20Credit = 6001n;
    const request = async ({ method, params = [] }) => {
      calls.push({ method, params });
      if (method === 'eth_chainId') return '0x7a69';
      if (method === 'eth_getBlockByNumber') {
        if (params[0] === '0x0') return { number: '0x0', hash: network.genesisHash, timestamp: '0x0' };
        if (params[0] === 'latest' || params[0] === '0x11')
          return { number: '0x11', hash: '0x' + '13'.repeat(32), timestamp: '0x5dc' };
        return { number: '0x10', hash: '0x' + '12'.repeat(32), timestamp: '0x500' };
      }
      if (method === 'eth_getCode') return '0x6000';
      if (method === 'eth_call') {
        const recipient = state === 'released' ? BUYER : SELLER;
        const pendingErc20 = buildPendingWithdrawals(escrow, recipient, tokenOnChain);
        if (params[0].data === pendingErc20.data) return '0x' + word(erc20Credit);
        // A credit in the native-asset bucket cannot authorize ERC-20 withdrawal.
        if (params[0].data === buildPendingWithdrawals(escrow, recipient, ZERO).data)
          return '0x' + word(999999n);
        const phase = state === 'released' ? 2 : state === 'refunded' ? 3 : 1;
        return '0x' + [SELLER, 2000, phase, BUYER, tokenOnChain, 6001].map(word).join('');
      }
      throw Error('Unexpected synthetic RPC method');
    };
    const options = { profile, binding, endpointId: 'loopback-fixture', request, action: 'withdraw', from: PREPARER };

    for (const [phase, recipient] of [['released', BUYER], ['refunded', SELLER]]) {
      state = phase;
      const start = calls.length;
      const recovered = await prepareEvmRecovery(options);
      assert.deepEqual(recovered.pendingWithdrawal, { recipient, token: TOKEN, amount: '6001' });
      assert.equal(recovered.transaction.from, PREPARER);
      assert.equal(recovered.transaction.to, escrow);
      assert.equal(recovered.transaction.data, buildWithdraw(escrow, recipient, TOKEN).data);
      assert.notEqual(recovered.transaction.data, buildWithdraw(escrow, recipient, ZERO).data);
      assert.equal(recovered.transaction.value, '0x0');
      assert.equal(recovered.historicalOnly, true);
      assert.equal(recovered.releaseEnabled, false);
      const reads = calls.slice(start).filter(call => call.method === 'eth_call');
      assert.ok(reads.some(call => call.params[0].data === buildPendingWithdrawals(escrow, recipient, TOKEN).data));
      assert.equal(reads.some(call => call.params[0].data === buildPendingWithdrawals(escrow, recipient, ZERO).data), false);
      assert.ok(reads.every(call => call.params[1] === '0x11'), 'trade and credit reads must share one pinned block');
    }

    // Changing the asset, removing the credit, or observing nonterminal state
    // cannot produce an unsigned withdrawal, even with unrelated native credit.
    tokenOnChain = UNLISTED_TOKEN;
    await assert.rejects(prepareEvmRecovery(options), error => error.code === 'UNSUPPORTED_PROVIDER');
    tokenOnChain = TOKEN;
    erc20Credit = 0n;
    await assert.rejects(prepareEvmRecovery(options), error => error.code === 'CONFLICT');
    state = 'funded';
    erc20Credit = 6001n;
    await assert.rejects(prepareEvmRecovery(options), error => error.code === 'CONFLICT');
    assert.ok(calls.length > 0);
    assert.ok(calls.every(call => ['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call'].includes(call.method)),
      'historical recovery must never sign, send, approve or fund');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
