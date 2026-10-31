import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { createLifecycleJournal } from '../src/intent-journal.ts';
import { createReadRetrier } from '../src/read-retry.ts';
import { createEvmTxLifecycle, evmFinalityPolicy } from '../src/tx-lifecycle.ts';

// ---------- simulated durable store (same shape as the G02 IndexedDB adapter) ----------
const clone = value => structuredClone(value), pass = 'lifecycle fixture passphrase';
class Store {
  rows = new Map(); listeners = new Set(); writes = 0; failure;
  async get(id) { return clone(this.rows.get(id)); }
  async add(row) { this.rows.set(row.profileId, clone(row)); this.writes++; }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) { const { VaultStorageError } = await import('../../storage/src/idb-vault-store.ts'); throw new VaultStorageError('CONFLICT'); }
    if (this.failure) { const { VaultStorageError } = await import('../../storage/src/idb-vault-store.ts'); throw new VaultStorageError(this.failure); }
    this.rows.set(next.profileId, clone(next)); this.writes++;
  }
  subscribeInvalidation(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}

// ---------- fake chain ----------
const h = label => `0x${createHash('sha256').update(String(label)).digest('hex')}`;
const ESCROW = `0x${'ee'.repeat(20)}`, ACCOUNT = `0x${'a1'.repeat(20)}`, OTHER = `0x${'b2'.repeat(20)}`;
const FUND = '0xf00d', REVERTS = '0xdead', NOOP = '0x00';
const binding = { chain: 'evm', networkId: 'local-evm', deploymentId: 'escrow-local-v1', tradeId: 'ab'.repeat(32) };
const ok = value => ({ ok: true, value });
class FakeChain {
  chainId = '31337'; blocks = [{ number: 0, hash: h('b0') }]; escrow = ['absent']; finalized = 0; nonces = new Map(); txs = new Map(); pool = []; fork = 0; seq = 0; fail = new Map(); reads = 0;
  latest() { return this.blocks.at(-1); }
  nonce(account) { return this.nonces.get(account) ?? 0; }
  broadcast(tx) { const hash = h(`tx-${++this.seq}`); this.txs.set(hash, { gas: 1, ...tx, hash, block: null, status: null }); this.pool.push(hash); return hash; }
  mine(count = 1) {
    for (let i = 0; i < count; i++) {
      const number = this.blocks.length; let state = this.escrow.at(-1);
      const ordered = this.pool.map(hash => this.txs.get(hash)).sort((a, b) => a.nonce - b.nonce || b.gas - a.gas);
      for (const tx of ordered) {
        if (tx.block !== null || tx.nonce !== this.nonce(tx.from)) continue;
        tx.block = number; this.nonces.set(tx.from, tx.nonce + 1);
        if (tx.input === REVERTS || (tx.input === FUND && state !== 'absent')) tx.status = 'reverted';
        else { tx.status = 'success'; if (tx.input === FUND && tx.to === ESCROW) state = 'funded'; }
      }
      for (const hash of [...this.pool]) {
        const tx = this.txs.get(hash);
        if (tx.block !== null) this.pool.splice(this.pool.indexOf(hash), 1);
        else if (tx.nonce < this.nonce(tx.from)) { this.pool.splice(this.pool.indexOf(hash), 1); this.txs.delete(hash); } // same-nonce loser is gone
      }
      this.blocks.push({ number, hash: h(`b${number}-${this.fork}`) }); this.escrow.push(state);
    }
  }
  /** Removes the last `depth` blocks; their transactions return to the pool and the nonces roll back. */
  reorg(depth) {
    this.fork++;
    const cut = this.blocks.length - depth;
    for (const tx of this.txs.values()) if (tx.block !== null && tx.block >= cut) { tx.block = null; tx.status = null; this.pool.push(tx.hash); this.nonces.set(tx.from, Math.min(this.nonce(tx.from), tx.nonce)); }
    this.blocks.length = cut; this.escrow.length = cut; this.finalized = Math.min(this.finalized, cut - 1);
  }
  drop(hash) { this.pool = this.pool.filter(entry => entry !== hash); this.txs.delete(hash); }
  #call(method, value) {
    this.reads++;
    const remaining = this.fail.get(method) ?? 0;
    if (remaining > 0) { this.fail.set(method, remaining - 1); return { ok: false, error: { code: 'UNAVAILABLE' } }; }
    return ok(value());
  }
  reader() {
    const view = tx => tx && Object.freeze({ hash: tx.hash, from: tx.from, to: tx.to, nonce: String(tx.nonce), input: tx.input, value: tx.value, blockNumber: tx.block === null ? null : String(tx.block) });
    return {
      chainId: async () => this.#call('chainId', () => this.chainId),
      head: async tag => this.#call('head', () => { const block = tag === 'latest' ? this.latest() : this.blocks[this.finalized]; return block ? { number: String(block.number), hash: block.hash } : null; }),
      blockHashAt: async number => this.#call('blockHashAt', () => this.blocks[Number(number)]?.hash ?? null),
      transactionCount: async (account, tag) => this.#call('transactionCount', () => {
        let count = this.nonce(account);
        if (tag === 'pending') while ([...this.txs.values()].some(tx => tx.block === null && tx.from === account && tx.nonce === count)) count++;
        return String(count);
      }),
      transaction: async hash => this.#call('transaction', () => view(this.txs.get(hash)) ?? null),
      receipt: async hash => this.#call('receipt', () => { const tx = this.txs.get(hash); return tx?.block == null ? null : { transactionHash: hash, blockNumber: String(tx.block), blockHash: this.staleReceiptHash ?? this.blocks[tx.block].hash, status: tx.status }; }),
      escrowState: async (_binding, number) => this.#call('escrowState', () => this.escrow[Number(number)]),
      escrowObservation: async (target, request) => this.#call('escrowObservation', () => ({ binding: target, generation: request.generation, requestSequence: request.requestSequence,
        anchor: { height: String(this.latest().number), hash: this.latest().hash }, state: this.escrow.at(-1), finality: 'pending', observedAt: 1000 })),
    };
  }
}
/** EIP-1193 fake wallet that broadcasts into the fake chain. `onSend` overrides the send behavior per test. */
function fakeWallet(chain) {
  const wallet = {
    account: ACCOUNT, chainHex: '0x7a69', sends: 0, params: [], onSend: undefined,
    request: async ({ method, params }) => {
      if (method === 'eth_accounts') return [wallet.account];
      if (method === 'eth_chainId') return wallet.chainHex;
      if (method === 'eth_sendTransaction') {
        wallet.sends++; wallet.params.push(params[0]);
        const p = params[0], tx = { from: p.from, to: p.to, input: p.data, value: BigInt(p.value).toString(), nonce: Number(BigInt(p.nonce)) };
        return wallet.onSend ? wallet.onSend(tx) : chain.broadcast(tx);
      }
      throw Object.assign(new Error('unsupported'), { code: 4200 });
    },
  };
  return wallet;
}

const retry = createReadRetrier({ now: () => performance.now(), random: () => 0, schedule(callback, delay) { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); } });
const policy = evmFinalityPolicy({ chain: 'evm', finality: { kind: 'evm-finalized-tag' } }, 2, 5);
const val = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const err = (result, code) => { assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.error.code, code); return result.error; };
const fund = (over = {}) => ({ binding, action: 'fund', expectedEscrowState: 'absent', call: { to: ESCROW, data: FUND, value: '1000' }, ...over });

async function setup() {
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false }), session = val(await vault.create(pass));
  const chain = new FakeChain(), wallet = fakeWallet(chain), env = { store, vault, session, chain, wallet };
  await start(env);
  return env;
}
/** A fresh process: new journal and lifecycle over the same durable store; nothing in memory survives. */
async function start(env) {
  env.life?.dispose(); env.journal?.dispose();
  env.journal = createLifecycleJournal({ vault: env.vault, session: env.session, validateCanonical: () => ({ ok: true, value: undefined }) });
  env.life = createEvmTxLifecycle({ journal: env.journal, reader: env.chain.reader(), wallet: env.wallet.request, policy, retry });
  await env.life.walletChanged({ account: ACCOUNT, chainId: '31337', generation: 1 });
}
const stored = async (env, intentId) => val(await env.journal.list()).find(intent => intent.intentId === intentId);
const outcome = async (env, intentId) => val(await env.life.reconcile(intentId));
const close = env => { env.life.dispose(); env.journal.dispose(); env.vault.dispose(); };
const never = () => new Promise(() => {});

test('happy path: reserve, send-started before the wallet, one send, hash recorded, confirmations then finalized', async () => {
  const env = await setup(), prepared = val(await env.life.prepare(fund()));
  assert.equal((await stored(env, prepared.intentId)).state, 'prepared');
  assert.deepEqual(prepared.request, { v: 1, chainId: '31337', from: ACCOUNT, to: ESCROW, data: FUND, value: '1000', nonce: '0', preparedAtBlock: '0' });
  let stateAtSend;
  env.wallet.onSend = async tx => { stateAtSend = (await stored(env, prepared.intentId)).state; return env.chain.broadcast(tx); };
  const sent = val(await env.life.submit(prepared));
  assert.equal(stateAtSend, 'broadcast-unknown', 'send-started is durable before the wallet is invoked');
  assert.equal(env.wallet.sends, 1);
  assert.deepEqual(env.wallet.params[0], { from: ACCOUNT, to: ESCROW, data: FUND, value: '0x3e8', nonce: '0x0', chainId: '0x7a69' });
  assert.equal(sent.intent.state, 'pending'); assert.equal((await stored(env, prepared.intentId)).submission.hash, sent.hash);
  let result = await outcome(env, prepared.intentId);
  assert.equal(result.outcome, 'pending'); assert.equal(result.intent.state, 'pending');
  env.chain.mine();
  result = await outcome(env, prepared.intentId);
  assert.deepEqual([result.outcome, result.evidence, result.intent.state], ['pending', 'receipt', 'pending'], 'one block is below the two-confirmation policy');
  env.chain.mine();
  result = await outcome(env, prepared.intentId);
  assert.deepEqual([result.outcome, result.intent.state, result.escrowState], ['confirmed', 'confirmed', 'funded']);
  env.chain.finalized = 1;
  result = await outcome(env, prepared.intentId);
  assert.deepEqual([result.outcome, result.intent.state], ['finalized', 'finalized']);
  assert.equal(env.wallet.sends, 1, 'reconciliation never resends');
  close(env);
});

test('duplicate submit: concurrent, sequential and after restart make exactly one wallet send', async () => {
  const env = await setup(), prepared = val(await env.life.prepare(fund()));
  const results = await Promise.all([env.life.submit(prepared), env.life.submit(prepared)]);
  assert.equal(results.filter(result => result.ok).length, 1);
  err(results.find(result => !result.ok), 'CONFLICT');
  err(await env.life.submit(prepared), 'CONFLICT');
  err(await env.journal.markSending(prepared.intentId), 'CONFLICT');
  await start(env);
  err(await env.life.submit(prepared), 'CONFLICT');
  err(await env.life.submit({ ...prepared, generation: 1 }), 'CONFLICT');
  err(await env.life.prepare(fund()), 'CONFLICT', 'the unresolved intent blocks a fresh reservation');
  assert.equal(env.wallet.sends, 1);
  close(env);
});

test('crash after reservation (before send-started): restart cancels the prepared intent; nothing was sent', async () => {
  const env = await setup(), prepared = val(await env.life.prepare(fund()));
  await start(env);
  const recovered = val(await env.life.recover());
  assert.deepEqual(recovered, []);
  assert.equal((await stored(env, prepared.intentId)).state, 'failed');
  assert.equal((await outcome(env, prepared.intentId)).outcome, 'reverted');
  const fresh = val(await env.life.prepare(fund()));
  assert.equal(fresh.request.nonce, '0');
  val(await env.life.submit(fresh)); assert.equal(env.wallet.sends, 1);
  close(env);
});

test('crash after send-started, before the wallet broadcast: pending until expiry, then dropped; re-prepare needs an explicit same-nonce successor', async () => {
  const env = await setup(), prepared = val(await env.life.prepare(fund()));
  env.wallet.onSend = never; // process dies inside the wallet call; nothing reached the chain
  void env.life.submit(prepared);
  await new Promise(resolve => setTimeout(resolve, 50));
  await start(env);
  const recovered = val(await env.life.recover());
  assert.deepEqual(recovered.map(intent => intent.state), ['broadcast-unknown']);
  let result = await outcome(env, prepared.intentId);
  assert.deepEqual([result.outcome, result.intent.state], ['pending', 'broadcast-unknown'], 'a null receipt and an unused nonce are not yet proof of dropping');
  env.chain.mine(4);
  assert.equal((await outcome(env, prepared.intentId)).outcome, 'pending');
  env.chain.mine(1);
  result = await outcome(env, prepared.intentId);
  assert.deepEqual([result.outcome, result.intent.state], ['dropped', 'expired']);
  err(await env.life.prepare(fund()), 'CONFLICT', 'a dropped intent is not silently replaced');
  err(await env.life.prepare(fund({ binding: {...binding,tradeId:'cd'.repeat(32)} })), 'CONFLICT', 'a dropped nonce cannot be silently reused by a different trade');
  env.wallet.onSend = undefined;
  const successor = val(await env.life.prepare(fund({ supersedes: prepared.intentId })));
  assert.equal(successor.request.nonce, prepared.request.nonce, 'successor reuses the dropped nonce');
  assert.equal((await stored(env, successor.intentId)).replacementOf, prepared.intentId);
  err(await env.life.prepare(fund({ supersedes: prepared.intentId })), 'CONFLICT', 'only one successor');
  val(await env.life.submit(successor)); env.chain.mine(2);
  assert.equal((await outcome(env, successor.intentId)).outcome, 'confirmed');
  assert.equal(env.wallet.sends, 2);
  close(env);
});

test('crash during the wallet call after broadcast (hash never returned): reconcile resolves confirmed from nonce and escrow effect', async () => {
  const env = await setup(), prepared = val(await env.life.prepare(fund()));
  env.wallet.onSend = tx => { env.chain.broadcast(tx); return never(); };
  void env.life.submit(prepared);
  await new Promise(resolve => setTimeout(resolve, 50));
  await start(env);
  assert.equal((await outcome(env, prepared.intentId)).outcome, 'pending');
  env.chain.mine();
  let result = await outcome(env, prepared.intentId);
  assert.deepEqual([result.outcome, result.intent.state], ['pending', 'broadcast-unknown'], 'effect visible but below confirmation depth');
  env.chain.mine();
  result = await outcome(env, prepared.intentId);
  assert.deepEqual([result.outcome, result.evidence, result.intent.state, result.intent.submission.hash], ['confirmed', 'escrow-effect', 'confirmed', null]);
  env.chain.finalized = 2;
  assert.equal((await outcome(env, prepared.intentId)).intent.state, 'finalized');
  env.chain.reorg(2);
  result = await outcome(env, prepared.intentId);
  assert.deepEqual([result.outcome, result.intent.state], ['reorged', 'reorged'], 'an effect-only confirmation also unlatches when the nonce becomes unused');
  assert.equal(env.wallet.sends, 1);
  close(env);
});

test('crash after the hash returned but before it was persisted: BROADCAST_UNKNOWN, then confirmed by reconciliation', async () => {
  const env = await setup(), prepared = val(await env.life.prepare(fund()));
  env.wallet.onSend = tx => { const hash = env.chain.broadcast(tx); env.store.failure = 'QUOTA_EXCEEDED'; return hash; };
  const failure = err(await env.life.submit(prepared), 'BROADCAST_UNKNOWN');
  assert.equal(failure.action, 'reconcile'); assert.equal(failure.retryable, false);
  env.store.failure = undefined;
  await start(env);
  assert.equal((await stored(env, prepared.intentId)).state, 'broadcast-unknown');
  env.chain.mine(2);
  assert.equal((await outcome(env, prepared.intentId)).outcome, 'confirmed');
  assert.equal(env.wallet.sends, 1);
  close(env);
});

test('crash after the hash was recorded: restart reconciles the receipt to confirmed', async () => {
  const env = await setup(), prepared = val(await env.life.prepare(fund())), sent = val(await env.life.submit(prepared));
  await start(env);
  assert.deepEqual(val(await env.life.recover()).map(intent => intent.submission.hash), [sent.hash]);
  env.chain.mine(3);
  const result = await outcome(env, prepared.intentId);
  assert.deepEqual([result.outcome, result.evidence], ['confirmed', 'receipt']);
  close(env);
});

test('replaced: the recorded nonce was used by a different transaction; a successor must name it', async () => {
  for (const speedUp of [false, true]) {
    const env = await setup(), prepared = val(await env.life.prepare(fund())), sent = val(await env.life.submit(prepared));
    env.chain.broadcast({ from: ACCOUNT, to: speedUp ? ESCROW : OTHER, input: speedUp ? FUND : NOOP, value: speedUp ? '1000' : '0', nonce: 0, gas: 10 });
    env.chain.mine(2);
    const result = await outcome(env, prepared.intentId);
    assert.deepEqual([result.outcome, result.intent.state, result.intent.submission.hash, result.escrowState], ['replaced', 'replaced', sent.hash, speedUp ? 'funded' : 'absent']);
    if (!speedUp) {
      err(await env.life.prepare(fund()), 'CONFLICT');
      const successor = val(await env.life.prepare(fund({ supersedes: prepared.intentId })));
      assert.equal(successor.request.nonce, '1');
    }
    assert.equal(env.wallet.sends, 1);
    close(env);
  }
});

test('dropped with a known hash, reverted, and still-pending classifications', async () => {
  const env = await setup(), prepared = val(await env.life.prepare(fund())), sent = val(await env.life.submit(prepared));
  env.chain.mine(10);
  assert.equal((await outcome(env, prepared.intentId)).outcome, 'confirmed');
  close(env);

  const pendingEnv = await setup(), p2 = val(await pendingEnv.life.prepare(fund())), s2 = val(await pendingEnv.life.submit(p2));
  pendingEnv.chain.blocks.push(...Array.from({ length: 6 }, (_, i) => ({ number: i + 1, hash: h(`empty-${i}`) }))); pendingEnv.chain.escrow.push(...Array(6).fill('absent'));
  assert.equal((await outcome(pendingEnv, p2.intentId)).outcome, 'pending', 'still in the pool past expiry: not dropped');
  pendingEnv.chain.drop(s2.hash);
  const dropped = await outcome(pendingEnv, p2.intentId);
  assert.deepEqual([dropped.outcome, dropped.intent.state], ['dropped', 'expired']);
  close(pendingEnv);

  const revertEnv = await setup(), p3 = val(await revertEnv.life.prepare(fund({ call: { to: ESCROW, data: REVERTS, value: '0' } })));
  val(await revertEnv.life.submit(p3)); revertEnv.chain.mine();
  assert.equal((await outcome(revertEnv, p3.intentId)).outcome, 'pending', 'shallow revert is not final');
  revertEnv.chain.mine();
  const reverted = await outcome(revertEnv, p3.intentId);
  assert.deepEqual([reverted.outcome, reverted.intent.state], ['reverted', 'failed']);
  err(await revertEnv.life.prepare(fund()), 'CONFLICT', 'a confirmed reverted label does not release before native finality');
  revertEnv.chain.finalized = 1;
  val(await revertEnv.life.prepare(fund()), 'a natively finalized failed intent releases the reservation');
  close(revertEnv);
  assert.ok(sent.hash);
});

test('reorg: a confirmed receipt that disappears unlatches to reorged, then re-confirms on the new chain', async () => {
  const env = await setup(), prepared = val(await env.life.prepare(fund())), sent = val(await env.life.submit(prepared));
  env.chain.mine(2);
  assert.equal((await outcome(env, prepared.intentId)).intent.state, 'confirmed');
  env.chain.reorg(2);
  let result = await outcome(env, prepared.intentId);
  assert.deepEqual([result.outcome, result.intent.state], ['reorged', 'reorged']);
  err(await env.life.prepare(fund()), 'CONFLICT', 'a reorged intent stays reserved');
  env.chain.mine(1);
  result = await outcome(env, prepared.intentId);
  assert.deepEqual([result.outcome, result.intent.state], ['pending', 'pending']);
  env.chain.mine(2);
  result = await outcome(env, prepared.intentId);
  assert.deepEqual([result.outcome, result.intent.state, result.intent.submission.hash], ['confirmed', 'confirmed', sent.hash]);
  // Receipt still present but its block hash no longer canonical at that height: unlatched as well.
  env.chain.staleReceiptHash = h('forked');
  assert.equal((await outcome(env, prepared.intentId)).intent.state, 'reorged');
  env.chain.staleReceiptHash = undefined;
  assert.equal((await outcome(env, prepared.intentId)).intent.state, 'confirmed');
  assert.equal(env.wallet.sends, 1);
  close(env);
});

test('account or chain change cancels un-sent intents and invalidates prepare results', async () => {
  const env = await setup(), prepared = val(await env.life.prepare(fund()));
  await env.life.walletChanged({ account: OTHER, chainId: '31337', generation: 2 });
  assert.equal((await stored(env, prepared.intentId)).state, 'failed');
  err(await env.life.submit(prepared), 'CONFLICT');
  assert.equal(env.wallet.sends, 0);

  // A change while prepare is reading cancels its reservation too.
  await env.life.walletChanged({ account: ACCOUNT, chainId: '31337', generation: 3 });
  const reader = env.chain.reader(), slow = env.chain.reader;
  let release; const gate = new Promise(resolve => { release = resolve; });
  env.chain.reader = () => ({ ...reader, head: async (...args) => { await gate; return reader.head(...args); } });
  await start(env); await env.life.walletChanged({ account: ACCOUNT, chainId: '31337', generation: 3 });
  const pending = env.life.prepare(fund());
  await new Promise(resolve => setTimeout(resolve, 20));
  await env.life.walletChanged(null);
  release();
  err(await pending, 'CANCELLED');
  env.chain.reader = slow;
  await start(env);
  assert.equal(val(await env.journal.list()).filter(intent => intent.state === 'prepared').length, 0);

  // The wallet itself moved without an adapter event: preflight refuses before the marker.
  err(await env.life.prepare(fund()), 'CONFLICT', 'restored failed labels have no live never-sent proof');
  env.chain.mine(5);
  assert.equal((await outcome(env, prepared.intentId)).outcome, 'dropped');
  const second = val(await env.life.prepare(fund({ supersedes: prepared.intentId })));
  env.wallet.account = OTHER;
  err(await env.life.submit(second), 'LOCKED');
  assert.equal((await stored(env, second.intentId)).state, 'failed');
  env.wallet.account = ACCOUNT;
  await env.life.walletChanged({ account: ACCOUNT, chainId: '31337', generation: 4 });
  const third = val(await env.life.prepare(fund()));
  env.wallet.chainHex = '0x1';
  err(await env.life.submit(third), 'WRONG_CHAIN');
  assert.equal((await stored(env, third.intentId)).state, 'failed');
  assert.equal(env.wallet.sends, 0);
  env.chain.chainId = '1';
  await env.life.walletChanged({ account: ACCOUNT, chainId: '31337', generation: 5 });
  err(await env.life.prepare(fund()), 'WRONG_CHAIN');
  close(env);
});

test('reads retry through read-retry; sends never retry; rejection and integrity failures', async () => {
  const env = await setup();
  env.chain.fail.set('chainId', 2);
  const prepared = val(await env.life.prepare(fund()));
  env.wallet.onSend = tx => { env.chain.broadcast(tx); throw Object.assign(new Error('SECRET node https://rpc.invalid'), { code: -32603 }); };
  const failure = err(await env.life.submit(prepared), 'BROADCAST_UNKNOWN');
  assert.doesNotMatch(JSON.stringify(failure), /SECRET|https/);
  assert.equal(env.wallet.sends, 1, 'an ambiguous send error is never retried');
  env.chain.fail.set('chainId', 3);
  err(await env.life.reconcile(prepared.intentId), 'UNAVAILABLE');
  env.chain.mine(2);
  assert.equal((await outcome(env, prepared.intentId)).outcome, 'confirmed');
  close(env);

  const rejectEnv = await setup(), p2 = val(await rejectEnv.life.prepare(fund()));
  rejectEnv.wallet.onSend = () => { throw Object.assign(new Error('rejected'), { code: 4001 }); };
  err(await rejectEnv.life.submit(p2), 'USER_REJECTED');
  assert.equal((await stored(rejectEnv, p2.intentId)).state, 'failed');
  rejectEnv.wallet.onSend = undefined;
  const p3 = val(await rejectEnv.life.prepare(fund()));
  const sent = val(await rejectEnv.life.submit(p3));
  rejectEnv.chain.txs.get(sent.hash).input = '0xbeef'; // provider reports a different body for the recorded hash
  rejectEnv.chain.mine(2);
  err(await rejectEnv.life.reconcile(p3.intentId), 'INTEGRITY_FAILURE');
  assert.equal((await stored(rejectEnv, p3.intentId)).state, 'pending', 'a contradiction is not written');
  close(rejectEnv);
});

test('lifecycle journal transitions are validated: no backwards, no hash rewrite, terminal is final', async () => {
  const env = await setup(), prepared = val(await env.life.prepare(fund())), sent = val(await env.life.submit(prepared));
  err(await env.journal.observe(prepared.intentId, { state: 'prepared', hash: null }), 'CONFLICT');
  err(await env.journal.observe(prepared.intentId, { state: 'confirmed', hash: h('other') }), 'CONFLICT');
  err(await env.journal.observe(prepared.intentId, { state: 'confirmed', hash: 'SECRET' }), 'INVALID_INPUT');
  err(await env.journal.observe(prepared.intentId, { state: 'nonsense', hash: sent.hash }), 'INVALID_INPUT');
  val(await env.journal.observe(prepared.intentId, { state: 'replaced', hash: sent.hash }));
  err(await env.journal.observe(prepared.intentId, { state: 'pending', hash: sent.hash }), 'CONFLICT');
  close(env);
});

test('restart never lets a restored finalized label authorize a new intent after native rollback', async () => {
  const env = await setup();
  try {
    const prepared = val(await env.life.prepare(fund()));
    val(await env.life.submit(prepared)); env.chain.mine(2); env.chain.finalized = 2;
    assert.equal((await outcome(env, prepared.intentId)).intent.state, 'finalized');
    await start(env); env.chain.reorg(2);
    err(await env.life.prepare(fund()), 'CONFLICT');
    assert.equal(env.wallet.sends, 1, 'a reappearing original must not be silently replaced');
    assert.equal((await stored(env, prepared.intentId)).state, 'reorged');
  } finally { close(env); }
});

test('restored stable finalized intent is re-read before a new explicit action, without resending it', async () => {
  const env = await setup();
  try {
    const prepared = val(await env.life.prepare(fund()));
    val(await env.life.submit(prepared)); env.chain.mine(2); env.chain.finalized = 2;
    assert.equal((await outcome(env, prepared.intentId)).intent.state, 'finalized');
    await start(env);
    assert.equal(env.journal.isTerminalVerified(prepared.intentId), false, 'verification capability is not restored');
    const recovered = val(await env.life.recover());
    assert.equal(recovered.some(record => record.intentId === prepared.intentId), true);
    const reads = env.chain.reads;
    const next = val(await env.life.prepare(fund({ action: 'release', expectedEscrowState: 'funded', call: {to:ESCROW,data:NOOP,value:'0'} })));
    assert.notEqual(next.intentId, prepared.intentId);
    assert.ok(env.chain.reads > reads, 'current native evidence was obtained');
    assert.equal(env.journal.isTerminalVerified(prepared.intentId), true);
    assert.equal(env.wallet.sends, 1, 'preparation never resends or spends');
  } finally { close(env); }
});
