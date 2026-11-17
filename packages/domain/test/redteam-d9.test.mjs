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
// ---------------------------------------------------------------------------------------------------------------
// RED TEAM pass 1 (Team D). Harness above copied verbatim from tx-lifecycle.test.mjs. Findings are
// { todo: 'REDTEAM-...' } tests asserting the SECURE behaviour (fail = reported TODO; suite stays green).
// Repro: node --import ./scripts/test-support/register-tsx.mjs --test packages/domain/test/redteam-d9.test.mjs
// REDTEAM-D9-1/2 were fixed by Team A and are now ordinary regression tests.
void never; void OTHER; void REVERTS; void outcome;
const release = (over = {}) => ({ binding, action: 'release', expectedEscrowState: 'funded', call: { to: ESCROW, data: '0x01', value: '0' }, ...over });
const binding2 = { ...binding, tradeId: 'cd'.repeat(32) };

// REDTEAM-D9-1: crash/close between reserve and the send marker of a VALUE-MOVING intent (fund/release/refund).
// Original finding: the intent stayed 'prepared' with no API path out. Resolved (Team A): recover() cancels it for
// native reconciliation; the cross-binding nonce hold is kept until chain evidence (dropped) and is then spent only by
// the explicit same-nonce successor. Unrelated trades are unblocked once that nonce is no longer theirs to share.
test('REDTEAM-D9-1 a never-marked value-moving intent can be resolved after restart (no permanent lock)', async () => {
  const env = await setup();
  try {
    env.chain.escrow = ['funded'];
    const stuck = val(await env.life.prepare(release()));
    await start(env);                                   // tab closed / crash before submit(): nothing was sent
    assert.equal(val(await env.life.recover())[0].intentId, stuck.intentId);
    // Team A resolution: the nonce hold is correct and stays until native evidence. A never-marked fund/release/refund
    // cannot be proven unsent from metadata (ADR D9: same-profile rollback), so another trade must not reuse its nonce
    // on an unknown outcome. Without evidence the unrelated trade is refused:
    err(await env.life.prepare(release({ binding: binding2 })), 'CONFLICT');
    env.chain.mine(50);                                 // 10x dropAfterBlocks, nonce still unused, mempool empty
    let r;
    for (let i = 0; i < 3 && r?.outcome !== 'dropped'; i++) r = val(await env.life.reconcile(stuck.intentId));
    assert.deepEqual([r.outcome, r.intent.state, r.evidence], ['dropped', 'expired', 'nonce'], 'native nonce evidence classifies the cancelled release');
    // A dropped transaction can still reappear, so its nonce goes only to the explicit same-nonce successor.
    err(await env.life.prepare(release({ binding: binding2 })), 'CONFLICT');
    const successor = val(await env.life.prepare(release({ supersedes: stuck.intentId })));
    assert.equal(successor.request.nonce, '0');
    val(await env.life.submit(successor));             // the release proceeds; the held nonce is now spent by it
    const otherTrade = await env.life.prepare(release({ binding: binding2 }));
    assert.equal(otherTrade.ok, true, `unrelated trade of the same account blocked: ${JSON.stringify(otherTrade.error?.code)}`);
    assert.equal(otherTrade.value.request.nonce, '1', 'the unrelated trade never shares the held nonce');
    assert.equal(env.wallet.sends, 1, 'nothing was resent; only the explicit successor was sent');
  } finally { close(env); }
});

// REDTEAM-D9-2: recover() cancels "provably unsent" approvals from a stale list() snapshot through observe(), which
// has no expected-current-state precondition. If another tab of the same profile writes the send marker between
// this tab's list() and observe(), LIFECYCLE_TRANSITIONS allows broadcast-unknown -> failed: a SENT transaction is
// relabelled 'failed' with hash null, the sender's hash write then CONFLICTs, and the hash is lost from the journal.
test('REDTEAM-D9-2 cross-tab recover() never relabels a marked (sent) intent as failed', async () => {
  const env = await setup();
  const journalB = createLifecycleJournal({ vault: env.vault, session: env.session, validateCanonical: () => ({ ok: true, value: undefined }) });
  let openGate, listed; const gate = new Promise(resolve => { openGate = resolve; }), didList = new Promise(resolve => { listed = resolve; });
  // Instrumented port: tab B's list() resolves, then B is descheduled (another tab runs) before observe().
  const portB = Object.freeze({ ...journalB, list: async signal => { const result = await journalB.list(signal); listed(); await gate; return result; } });
  const lifeB = createEvmTxLifecycle({ journal: portB, reader: env.chain.reader(), wallet: env.wallet.request, policy, retry });
  try {
    const prepared = val(await env.life.prepare(fund({ action: 'approve', call: { to: ESCROW, data: NOOP, value: '0' } })));
    const recoverB = lifeB.recover(); await didList;      // B saw the approval as 'prepared'
    env.wallet.onSend = async tx => { openGate(); await recoverB; return env.chain.broadcast(tx); }; // marker is durable here
    const sent = await env.life.submit(prepared);
    const record = await stored(env, prepared.intentId);
    assert.equal(env.wallet.sends, 1);
    assert.ok(record.sendMarkedAt !== null);
    assert.notEqual(record.state, 'failed', `sent intent relabelled: ${JSON.stringify({ state: record.state, hash: record.submission.hash, submit: sent.ok ? 'ok' : sent.error.code })}`);
  } finally { lifeB.dispose(); journalB.dispose(); close(env); }
});
