/** Owned loopback Anvil/relay fixture, shared by native-controller and browser qualification. TEST ONLY. */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256 } from 'viem';
import { localnetConfigDocument, parseLocalnetConfig } from '../../apps/web/src/localnet/config.ts';
import { matchesFilters } from '../../packages/relay/index.ts';
import { startFakeRelay } from '../../packages/relay/test/support/fake-relay.mjs';
import { rpcClient, checkToolchain, forgeEnv, TOOLCHAIN } from '../sepolia/lib.mjs';

const run = promisify(execFile), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
// Published Anvil development keys. They never enter the app artifact, document, Worker or profile.
const KEYS = ['0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'];
const READS = new Set(['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call', 'eth_getLogs',
  'eth_getTransactionCount', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getBalance', 'eth_estimateGas', 'eth_gasPrice']);
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); });
});
function typedData(data) {
  const message = { ...data.message };
  for (const field of data.types[data.primaryType]) if (field.type.startsWith('uint')) message[field.name] = BigInt(message[field.name]);
  return { ...data, domain: { ...data.domain, chainId: BigInt(data.domain.chainId) }, message };
}

export async function startLocalnetFixture() {
  const foundry = process.env.FOUNDRY_BIN ?? `${homedir()}/.foundry/bin`;
  const env = { ...process.env, PATH: `${foundry}:${process.env.PATH ?? ''}` };
  const anvilPath = existsSync(`${foundry}/anvil`) ? `${foundry}/anvil` : 'anvil';
  const contracts = fileURLToPath(new URL('../../contracts/evm/', import.meta.url));
  const signingAccounts = KEYS.map(privateKeyToAccount), accounts = signingAccounts.map(account => account.address.toLowerCase());
  const counts = { signatures: 0, sends: 0, connects: 0 };
  let anvil, relay, closed = false;
  const close = async () => {
    if (closed) return; closed = true;
    await relay?.stop();
    if (anvil && anvil.exitCode === null) {
      anvil.kill('SIGTERM');
      await Promise.race([new Promise(resolve => anvil.once('exit', resolve)), pause(1500)]);
      if (anvil.exitCode === null) anvil.kill('SIGKILL');
    }
  };
  try {
    await checkToolchain(env);
    const version = (await run(anvilPath, ['--version'], { env: forgeEnv(env) })).stdout;
    assert.equal(/Commit SHA: ([0-9a-f]{40})/.exec(version)?.[1], TOOLCHAIN.forgeCommit);
    await run('forge', ['build'], { cwd: contracts, env: forgeEnv(env, { FOUNDRY_OFFLINE: 'true' }), timeout: 120_000, maxBuffer: 2 << 20 });
    const url = `http://127.0.0.1:${await freePort()}`, rpc = rpcClient(url, { timeoutMs: 5000 });
    anvil = spawn(anvilPath, ['--host', '127.0.0.1', '--port', new URL(url).port, '--silent', '--chain-id', '31337', '--slots-in-an-epoch', '1'], { env: forgeEnv(env), stdio: 'ignore' });
    let spawnError; anvil.once('error', error => { spawnError = error; });
    for (let attempt = 0; ; attempt++) {
      if (spawnError || anvil.exitCode !== null || attempt >= 200) throw new Error('Local Anvil startup failed.');
      try { if (await rpc('eth_chainId') === '0x7a69') break; } catch { /* Bounded startup retry. */ }
      await pause(25);
    }
    const deployed = await run('forge', ['create', 'src/BasicEscrow.sol:BasicEscrow', '--rpc-url', url, '--private-key', KEYS[0], '--broadcast', '--json', '--constructor-args', '[]'],
      { cwd: contracts, env: forgeEnv(env, { FOUNDRY_OFFLINE: 'true' }), timeout: 30_000, maxBuffer: 1 << 20 });
    const escrow = JSON.parse(deployed.stdout.slice(deployed.stdout.indexOf('{'))).deployedTo.toLowerCase();
    const mine = async (count = 6) => { await rpc('anvil_mine', [`0x${count.toString(16)}`]); return Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp)); };
    await mine();
    const registry = JSON.parse(await readFile(new URL('../../packages/domain/test/fixtures/local-evm-scenario/registry.json', import.meta.url)));
    const artifact = JSON.parse(await readFile(new URL('../../contracts/evm/out/BasicEscrow.sol/BasicEscrow.json', import.meta.url)));
    const runtime = keccak256(artifact.deployedBytecode.object).slice(2), network = registry.networks[0];
    assert.equal(keccak256(await rpc('eth_getCode', [escrow, 'latest'])).slice(2), runtime, 'escrow runtime matches the independent compiled artifact');
    network.genesisHash = (await rpc('eth_getBlockByNumber', ['0x0', false])).hash; network.endpoints = [{ id: 'local-node', url: `${url}/` }];
    network.assets = network.assets.filter(asset => asset.kind === 'native');
    network.deployments = [{ ...network.deployments[0], address: escrow, artifactSha256: sha(Buffer.from(artifact.bytecode.object.replace(/^0x/, ''), 'hex')),
      runtime: { kind: 'evm-code', keccak256: runtime, upgradeable: false }, supportedAssetIds: ['native'] }];
    relay = await startFakeRelay({ onMessage(connection, message, fixture) {
      if (message[0] === 'REQ') {
        connection.subs.set(message[1], message.slice(2));
        for (const event of fixture.events) if (matchesFilters(event, message.slice(2))) connection.send(JSON.stringify(['EVENT', message[1], event]));
        connection.send(JSON.stringify(['EOSE', message[1]])); return true;
      }
      if (message[0] === 'EVENT') {
        fixture.events.push(message[1]); connection.send(JSON.stringify(['OK', message[1].id, true, '']));
        for (const peer of fixture.conns) for (const [id, filters] of peer.subs) if (matchesFilters(message[1], filters)) peer.send(JSON.stringify(['EVENT', id, message[1]]));
        return true;
      }
      return false;
    } });
    const registryJson = JSON.stringify(registry);
    const buildOption = { registryJson, registrySha256: sha(registryJson), escrowLayouts: { [runtime]: 'canonical-get-trade-v1' }, relayUrl: `${relay.wsUrl}/` };
    const config = await parseLocalnetConfig(localnetConfigDocument(buildOption));
    const provider = (index, { beforeSend } = {}) => {
      assert.ok(index === 0 || index === 1);
      const listeners = new Map(), calls = [], state = { loseNextSend: false, chainId: '0x7a69', account: accounts[index] };
      return { state, calls,
        on(event, listener) { const group = listeners.get(event) ?? new Set(); group.add(listener); listeners.set(event, group); },
        removeListener(event, listener) { listeners.get(event)?.delete(listener); },
        emit(event, value) { for (const listener of listeners.get(event) ?? []) listener(value); },
        async request(input) {
          const { method, params = [] } = structuredClone(input); calls.push({ method, params });
          if (method === 'eth_requestAccounts') { counts.connects++; return [state.account]; }
          if (method === 'eth_accounts') return [state.account];
          if (method === 'eth_chainId') return state.chainId;
          if (method === 'eth_signTypedData_v4') {
            assert.equal(params[0], accounts[index]); counts.signatures++;
            return signingAccounts[index].signTypedData(typedData(JSON.parse(params[1])));
          }
          if (method === 'eth_sendTransaction') {
            assert.equal(params[0].from.toLowerCase(), accounts[index]); assert.equal(params[0].to.toLowerCase(), escrow);
            await beforeSend?.(params[0]); counts.sends++;
            const hash = await rpc(method, params);
            if (state.loseNextSend) { state.loseNextSend = false; throw new Error('Synthetic lost response after broadcast.'); }
            return hash;
          }
          assert.ok(READS.has(method), `Unexpected fixture wallet method: ${method}`);
          return rpc(method, params);
        },
      };
    };
    return { config, buildOption, rpc, escrow, accounts, provider, mine, relay, counts, close };
  } catch (error) { await close(); throw error; }
}
