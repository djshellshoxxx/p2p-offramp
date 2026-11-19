import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolanaWalletBridge } from '../src/solana-localnet/wallet-bridge.ts';

const transaction = Buffer.from(new Uint8Array(100).fill(7)).toString('base64');
const account = { address: 'wallet-role', publicKey: new Uint8Array(32).fill(4), chains: ['solana:localnet'], features: ['solana:signTransaction'] };
function fixture() {
  let listener, signs = 0, settle;
  const wallet = { accounts: [account], features: {
    'standard:connect': { version: '1.0.0', async connect() { return { accounts: wallet.accounts }; } },
    'standard:events': { version: '1.0.0', on(_event, fn) { listener = fn; return () => { listener = undefined; }; } },
    'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy'], async signTransaction(input) {
      signs++; await new Promise(resolve => { settle = resolve; }); return [{ signedTransaction: input.transaction }];
    } },
    'solana:signAndSendTransaction': { signAndSendTransaction() { assert.fail('sign and send must never be reached'); } },
  } };
  let invalidations = 0;
  const bridge = createSolanaWalletBridge(wallet, () => { invalidations++; }, () => 1000);
  const request = { method: 'signTransaction', account: account.address, chain: 'solana:localnet', transaction };
  const review = { id: 'review', expiresAtMs: 1500, walletRequest: request };
  return { bridge, wallet, request, review, change() { listener?.({ accounts: [] }); }, settle() { settle(); }, get signs() { return signs; }, get invalidations() { return invalidations; } };
}
const connect = async f => { f.bridge.beginConnect(); return f.bridge.request({ method: 'connect' }); };
test('wallet connect and sign-only prompts require explicit one-shot document capabilities', async () => {
  const f = fixture();
  await assert.rejects(f.bridge.request({ method: 'connect' }));
  assert.equal((await connect(f)).accounts[0].address, account.address);
  await assert.rejects(f.bridge.request(f.request));
  f.bridge.beginReview(f.review);
  const result = f.bridge.request(f.request); await Promise.resolve();
  assert.equal(f.signs, 1); f.settle(); await result;
  await assert.rejects(f.bridge.request(f.request));
  f.bridge.dispose();
});
test('exact transaction, chain and account substitutions never prompt a wallet', async () => {
  for (const changes of [{ transaction: Buffer.from(new Uint8Array(100).fill(8)).toString('base64') }, { account: 'other' }, { chain: 'solana:devnet' }, { method: 'signAndSendTransaction' }]) {
    const f = fixture(); await connect(f); f.bridge.beginReview(f.review);
    await assert.rejects(f.bridge.request({ ...f.request, ...changes })); assert.equal(f.signs, 0); f.bridge.dispose();
  }
});
test('cancel and account changes retain the physical prompt slot until settlement and discard the result', async () => {
  const f = fixture(); await connect(f); f.bridge.beginReview(f.review);
  const result = f.bridge.request(f.request); await Promise.resolve();
  f.bridge.revoke();
  assert.throws(() => f.bridge.beginReview(f.review));
  assert.throws(() => f.bridge.beginConnect());
  f.change(); assert.equal(f.invalidations, 1);
  f.settle(); await assert.rejects(result); assert.equal(f.signs, 1); f.bridge.dispose();
});
test('changed account identity without an event is detected before prompt dispatch', async () => {
  const f = fixture(); await connect(f); f.bridge.beginReview(f.review);
  f.wallet.accounts = [{ ...account, publicKey: new Uint8Array(32).fill(9) }];
  await assert.rejects(f.bridge.request(f.request)); assert.equal(f.signs, 0); f.bridge.dispose();
});
test('expired reviews and wallets without change events fail closed', () => {
  const f = fixture(); assert.throws(() => f.bridge.beginReview({ ...f.review, expiresAtMs: 1000 })); f.bridge.dispose();
  const g = fixture(); g.bridge.dispose(); delete g.wallet.features['standard:events'];
  assert.throws(() => createSolanaWalletBridge(g.wallet, () => {}));
});
test('wallet byte views are bounded before copy and custom iterators never execute', async () => {
  const f = fixture(); let iterated = 0;
  const key = new Uint8Array(32).fill(4);
  Object.defineProperty(key, Symbol.iterator, { value() { iterated++; throw Error('external iterator'); } });
  f.wallet.accounts = [{ ...account, publicKey: key }];
  await connect(f); assert.equal(iterated, 0); f.bridge.dispose();
  const g = fixture(); const oversized = new Uint8Array(1233);
  Object.defineProperty(oversized, Symbol.iterator, { value() { iterated++; throw Error('external iterator'); } });
  g.wallet.accounts = [{ ...account, publicKey: oversized }];
  await assert.rejects(connect(g)); assert.equal(iterated, 0); g.bridge.dispose();
});
