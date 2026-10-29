/** Secret hygiene of the Sepolia kit that needs no Foundry or chain: Forge child environments and RPC URL transport. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { forgeEnv, isLoopbackUrl, rpcClient } from '../sepolia/lib.mjs';

const KEY = `0x${'11'.repeat(32)}`;
const parent = {
  PATH: '/bin', HOME: '/home/op', FOUNDRY_SOLC: '/opt/solc', SEPOLIA_RPC_URL: 'https://rpc.example/KEY',
  SEPOLIA_DEPLOYER_PRIVATE_KEY: KEY, SEPOLIA_SELLER_PRIVATE_KEY: KEY, SEPOLIA_BUYER_PRIVATE_KEY: KEY,
  SEPOLIA_CROSSCHECK_RPC_URL: 'https://other.example/KEY2', GITHUB_TOKEN: 'x', AWS_SECRET_ACCESS_KEY: 'y',
};

test('forgeEnv passes OS basics, FOUNDRY_* and the RPC URL, and no private key unless given explicitly', () => {
  assert.deepEqual(forgeEnv(parent), { PATH: '/bin', HOME: '/home/op', FOUNDRY_SOLC: '/opt/solc', SEPOLIA_RPC_URL: 'https://rpc.example/KEY' });
  const seller = forgeEnv(parent, { SEPOLIA_SELLER_PRIVATE_KEY: KEY, CALL_TO: '0x01' });
  assert.equal(seller.SEPOLIA_SELLER_PRIVATE_KEY, KEY);
  for (const name of ['SEPOLIA_DEPLOYER_PRIVATE_KEY', 'SEPOLIA_BUYER_PRIVATE_KEY', 'SEPOLIA_CROSSCHECK_RPC_URL', 'GITHUB_TOKEN', 'AWS_SECRET_ACCESS_KEY']) {
    assert.equal(name in seller, false, name);
  }
  assert.equal(forgeEnv({ PATH: undefined }).PATH, undefined);
});

test('rpcClient refuses plain HTTP except to loopback', () => {
  for (const url of ['http://rpc.example/KEY', 'http://10.0.0.1:8545', 'http://127.0.0.1.example/']) {
    assert.throws(() => rpcClient(url), error => error?.code === 'RPC_URL_INSECURE', url);
  }
  for (const url of ['http://127.0.0.1:8545', 'http://localhost:8545/', 'http://[::1]:8545', 'https://rpc.example/KEY']) {
    assert.equal(typeof rpcClient(url), 'function', url);
  }
  assert.equal(isLoopbackUrl('not a url'), false);
  assert.throws(() => rpcClient('ftp://rpc.example'), error => error?.code === 'RPC_URL_MISSING');
});
