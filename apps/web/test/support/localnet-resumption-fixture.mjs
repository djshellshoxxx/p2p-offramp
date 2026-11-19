/** Real encrypted controllers and signed NIP-17 messages; in-memory relay/RPC only. No browser or chain claim. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256 } from 'viem';
import { LocalnetController } from '../../src/localnet/controller.ts';
import { createLocalnetWalletBridge } from '../../src/localnet/wallet-bridge.ts';
import { localnetConfigDocument, parseLocalnetConfig } from '../../src/localnet/config.ts';
import { matchesFilters } from '../../../../packages/relay/index.ts';
import { VaultStorageError } from '../../../../packages/storage/src/idb-vault-store.ts';

export const PASS = 'public synthetic same terms recovery passphrase';
export const RESTORED_PASS = 'public synthetic fresh destination passphrase';
const KEYS = ['0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'];
export const until = async (predicate, label = 'controller state') => {
  const started = Date.now();
  while (!await predicate()) {
    if (Date.now() - started > 15_000) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};
export function memoryStore() {
  const rows = new Map();
  return { rows, async get(id) { return structuredClone(rows.get(id)); },
    async add(row, options) { options?.assertCurrent?.(); if (rows.has(row.profileId)) throw new VaultStorageError('ALREADY_EXISTS'); rows.set(row.profileId, structuredClone(row)); },
    async compareAndSwap(before, after, options) {
      options?.assertCurrent?.(); if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
      if (JSON.stringify(rows.get(before.profileId)) !== JSON.stringify(before)) throw new VaultStorageError('CONFLICT');
      rows.set(after.profileId, structuredClone(after));
    },
    async listProfileIds() { return { profileIds: [...rows.keys()], truncated: false }; }, subscribeInvalidation: () => () => {},
  };
}
function relay() {
  const sockets = new Set(), events = [];
  const deliver = (socket, message) => queueMicrotask(() => { if (!socket.closed) socket.onmessage?.({ data: JSON.stringify(message) }); });
  return { events, connect() {
    const socket = { closed: false, onopen: null, onmessage: null, onclose: null, onerror: null, subscriptions: new Map(),
      send(text) {
        const message = JSON.parse(text);
        if (message[0] === 'REQ') {
          socket.subscriptions.set(message[1], message.slice(2));
          for (const event of events) if (matchesFilters(event, message.slice(2))) deliver(socket, ['EVENT', message[1], event]);
          deliver(socket, ['EOSE', message[1]]);
        } else if (message[0] === 'EVENT') {
          events.push(message[1]); deliver(socket, ['OK', message[1].id, true, '']);
          for (const peer of sockets) for (const [id, filters] of peer.subscriptions) if (matchesFilters(message[1], filters)) deliver(peer, ['EVENT', id, message[1]]);
        } else if (message[0] === 'CLOSE') socket.subscriptions.delete(message[1]);
      },
      close() { socket.closed = true; sockets.delete(socket); queueMicrotask(() => socket.onclose?.({})); },
    };
    sockets.add(socket); queueMicrotask(() => socket.onopen?.({})); return socket;
  } };
}
export async function world(t) {
  const raw = JSON.parse(await readFile(new URL('../../../../packages/domain/test/fixtures/local-evm-scenario/registry.json', import.meta.url)));
  const code = '0x6000', runtime = keccak256(code).slice(2), network = raw.networks[0];
  network.deployments[0].runtime.keccak256 = runtime;
  const registryJson = JSON.stringify(raw), config = await parseLocalnetConfig(localnetConfigDocument({ registryJson,
    registrySha256: createHash('sha256').update(registryJson).digest('hex'), escrowLayouts: { [runtime]: 'canonical-get-trade-v1' }, relayUrl: 'ws://127.0.0.1:18501/' }));
  const chain = { now: 1_800_000_000, chainId: '0x7a69', code, counts: { signatures: 0, sends: 0, connects: 0 }, hold: null };
  const accounts = KEYS.map(privateKeyToAccount), addresses = accounts.map(account => account.address.toLowerCase()), hub = relay(), parties = [];
  async function party(index, store = memoryStore()) {
    const listeners = new Map(), state = { account: addresses[index] }, calls = [];
    const external = { state, calls,
      on(event, listener) { const group = listeners.get(event) ?? new Set(); group.add(listener); listeners.set(event, group); },
      removeListener(event, listener) { listeners.get(event)?.delete(listener); },
      emit(event, value) { for (const listener of [...(listeners.get(event) ?? [])]) listener(value); },
      async request(request) {
        calls.push(structuredClone(request)); const { method, params = [] } = request;
        if (chain.hold) await chain.hold(request);
        if (method === 'eth_requestAccounts') { chain.counts.connects++; return [state.account]; }
        if (method === 'eth_accounts') return [state.account];
        if (method === 'eth_chainId') return chain.chainId;
        if (method === 'eth_getBlockByNumber') return params[0] === '0x0'
          ? { number: '0x0', hash: network.genesisHash, timestamp: '0x1' }
          : { number: '0x10', hash: `0x${'12'.repeat(32)}`, timestamp: `0x${chain.now.toString(16)}`, transactions: [] };
        if (method === 'eth_getCode') return params[0] === network.deployments[0].address ? chain.code : '0x';
        if (method === 'eth_call') return `0x${'0'.repeat(384)}`;
        if (method === 'eth_blockNumber') return '0x10';
        if (method === 'eth_getTransactionCount') return '0x0';
        if (method === 'eth_getTransactionReceipt' || method === 'eth_getTransactionByHash') return null;
        if (method === 'eth_getBalance') return '0xffffffffffffffff';
        if (method === 'eth_estimateGas') return '0x186a0';
        if (method === 'eth_gasPrice') return '0x1';
        if (method === 'eth_signTypedData_v4') {
          assert.equal(params[0], addresses[index]); chain.counts.signatures++;
          const typed = JSON.parse(params[1]), message = { ...typed.message };
          for (const field of typed.types[typed.primaryType]) if (field.type.startsWith('uint')) message[field.name] = BigInt(message[field.name]);
          return accounts[index].signTypedData({ ...typed, message, domain: { ...typed.domain, chainId: BigInt(typed.domain.chainId) } });
        }
        if (method === 'eth_sendTransaction') { chain.counts.sends++; return `0x${'34'.repeat(32)}`; }
        assert.fail(`Unexpected fixture RPC: ${method}`);
      },
    };
    const bridge = createLocalnetWalletBridge(external, () => chain.now * 1000);
    const controller = new LocalnetController(config, { request: request => bridge.request(request), on: external.on, removeListener: external.removeListener },
      { store, now: () => chain.now * 1000, connectRelay: hub.connect });
    const result = { controller, external, store, get snapshot() { return controller.snapshot(); },
      async command(command, expected = true) {
        await until(() => controller.snapshot().phase !== 'working');
        let end = () => {};
        if (command.type === 'wallet.connect') end = bridge.beginConnect();
        if (command.type === 'review.confirm') end = bridge.beginReview(controller.snapshot().review);
        if (command.type === 'profile.lock' || command.type === 'review.cancel') bridge.revoke();
        try { const value = await controller.dispatch(structuredClone(command)); if (expected !== null) assert.equal(value.ok, expected, JSON.stringify(value)); return value; }
        finally { end(); }
      },
      close() { bridge.dispose(); controller.dispose(); },
    };
    parties.push(result); return result;
  }
  t.after(() => parties.forEach(p => p.close()));
  const seller = await party(0), buyer = await party(1);
  for (const owner of [seller, buyer]) { await owner.command({ type: 'profile.create', passphrase: PASS }); await owner.command({ type: 'wallet.connect' }); }
  return { chain, addresses, seller, buyer, party, hub, config };
}
export async function negotiate(w, { complete = true } = {}) {
  const { seller, buyer } = w;
  await seller.command({ type: 'ad.publish', assetId: 'native', amountBaseUnits: '1000', currency: 'USD' });
  await until(() => buyer.snapshot.ads.length === 1);
  await buyer.command({ type: 'ad.take', adKey: buyer.snapshot.ads[0].key });
  await until(() => seller.snapshot.sessions.length === 1);
  const sessionId = seller.snapshot.sessions[0].id;
  await seller.command({ type: 'session.select', sessionId });
  await seller.command({ type: 'review.prepare', action: 'offer', sessionId, fiatMinorUnits: '1000', fiatScale: 2, paymentInstructions: 'Synthetic confidential payment instructions' });
  await seller.command({ type: 'review.confirm', reviewId: seller.snapshot.review.id });
  const id = seller.snapshot.trades[0].id;
  await until(() => buyer.snapshot.trades[0]?.peerAcceptance === 'seller-verified');
  if (complete) {
    await buyer.command({ type: 'review.prepare', action: 'accept', sessionId });
    await buyer.command({ type: 'review.confirm', reviewId: buyer.snapshot.review.id });
    await until(() => seller.snapshot.trades[0]?.peerAcceptance === 'both-verified');
  }
  return id;
}
