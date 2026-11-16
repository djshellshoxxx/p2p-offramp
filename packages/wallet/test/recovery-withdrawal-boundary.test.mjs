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

const SELLER = '0x' + '31'.repeat(20);
const BUYER = '0x' + '32'.repeat(20);
const THIRD_PARTY = '0x' + '33'.repeat(20);
const ZERO = '0x' + '0'.repeat(40);
const TRADE_ID = 'ab'.repeat(32);
const word = value => BigInt(value).toString(16).padStart(64, '0');

test('G12 recovery withdraws deferred credit only to the native bound buyer or seller, never the caller', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'g12-withdraw-boundary-'));
  try {
    const abiPath = 'contracts/evm/abi/BasicEscrow.json';
    const abiBytes = new Uint8Array(await readFile(new URL('../../../contracts/evm/abi/BasicEscrow.json', import.meta.url)));
    const fixture = registryFixture({
      editManifest: manifest => {
        manifest.assets.push({ path: abiPath, bytes: abiBytes.length, sha256: sha(abiBytes) });
        manifest.assets.sort((a, b) => a.path < b.path ? -1 : 1);
      }
    });
    fixture.assets.push({ path: abiPath, bytes: abiBytes });
    const proof = await verifyRelease(fixture.bytes, fixture.envelope, [fixture.key], 0, fixture.options);
    assert.equal(proof.ok, true, JSON.stringify(proof));
    const built = await buildEvmRecoveryPackage({
      verifiedRelease: proof.value,
      registryPath: fixture.registryPath, registryBytes: fixture.registryBytes,
      abiPath, abiBytes, networkId: 'local-evm', deploymentId: 'escrow-fixture',
      outDir: resolve(temporary, 'bundle')
    });
    const profile = structuredClone(built.profile);
    const registry = JSON.parse(Buffer.from(profile.registry.bytes, 'base64url'));
    registry.networks[0].deployments[0].runtime.keccak256 =
      Buffer.from(keccak256(Buffer.from('6000', 'hex'))).toString('hex');
    const registryBytes = Buffer.from(JSON.stringify(registry));
    profile.registry.bytes = registryBytes.toString('base64url');
    profile.registry.sha256 = sha(registryBytes);
    const network = registry.networks[0], escrow = network.deployments[0].address;
    const binding = { chain: 'evm', networkId: 'local-evm', deploymentId: 'escrow-fixture', tradeId: TRADE_ID };
    const calls = [];
    let phase = 2, credit = 777n;
    const request = async ({ method, params = [] }) => {
      calls.push({ method, params });
      if (method === 'eth_chainId') return '0x7a69';
      if (method === 'eth_getBlockByNumber') {
        if (params[0] === '0x0') return { number: '0x0', hash: network.genesisHash, timestamp: '0x0' };
        if (params[0] === 'latest' || params[0] === '0x11') return { number: '0x11', hash: '0x' + '13'.repeat(32), timestamp: '0x5dc' };
        return { number: '0x10', hash: '0x' + '12'.repeat(32), timestamp: '0x500' };
      }
      if (method === 'eth_getCode') return '0x6000';
      if (method === 'eth_call') {
        const recipient = phase === 2 ? BUYER : SELLER;
        const pending = buildPendingWithdrawals(escrow, recipient, ZERO);
        if (params[0].data === pending.data) return '0x' + word(credit);
        return '0x' + [SELLER, 2000, phase, BUYER, ZERO, 1000].map(word).join('');
      }
      throw Error('Unexpected private fixture RPC call');
    };
    const options = { profile, binding, endpointId: 'loopback-fixture', request, action: 'withdraw', from: THIRD_PARTY };

    // A third party can submit an unsigned withdrawal plan, but the contract's
    // destination is determined by the native released trade and pending credit.
    const released = await prepareEvmRecovery(options);
    assert.deepEqual(released.pendingWithdrawal, { recipient: BUYER, token: ZERO, amount: '777' });
    assert.equal(released.transaction.from, THIRD_PARTY);
    assert.equal(released.transaction.to, escrow);
    assert.equal(released.transaction.data, buildWithdraw(escrow, BUYER, ZERO).data);
    assert.equal(released.transaction.value, '0x0');
    assert.equal(released.historicalOnly, true);
    assert.equal(released.releaseEnabled, false);

    // A refunded trade instead credits the original seller, regardless of
    // who prepares the transaction. An unrelated buyer is never substituted.
    phase = 3;
    const refunded = await prepareEvmRecovery(options);
    assert.deepEqual(refunded.pendingWithdrawal, { recipient: SELLER, token: ZERO, amount: '777' });
    assert.equal(refunded.transaction.data, buildWithdraw(escrow, SELLER, ZERO).data);
    assert.equal(refunded.transaction.from, THIRD_PARTY);
    assert.notEqual(refunded.transaction.data, released.transaction.data);

    credit = 0n;
    await assert.rejects(prepareEvmRecovery(options), error => error.code === 'CONFLICT');
    phase = 1;
    credit = 777n;
    await assert.rejects(prepareEvmRecovery(options), error => error.code === 'CONFLICT');

    assert.ok(calls.length > 0, 'every plan requires fresh native reads');
    assert.ok(calls.every(call => ['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call'].includes(call.method)),
      'offline recovery must never send, sign or fund');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
