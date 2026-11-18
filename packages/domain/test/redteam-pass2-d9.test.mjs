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
// RED TEAM pass 2 (Team D) against e42a178/8796a9a + b7493ca. Harness above copied verbatim from tx-lifecycle.test.mjs.
// Repro: node --import ./scripts/test-support/register-tsx.mjs --test --test-reporter=tap packages/domain/test/redteam-pass2-d9.test.mjs
void never; void OTHER; void REVERTS; void outcome;
const release = (over = {}) => ({ binding, action: 'release', expectedEscrowState: 'funded', call: { to: ESCROW, data: '0x01', value: '0' }, ...over });

// REDTEAM-P2-D9-3: recover() now cancels EVERY prepared intent not live in *this* lifecycle instance. A second tab of
// the same profile (opening, reloading) runs recover() and cancels the first tab's LIVE release preparation. Tab A's
// submit then CONFLICTs, and the cancelled (unverified) release holds its binding and nonce until native evidence
// (>= dropAfterBlocks, two reconciles) plus an explicit same-nonce successor: the seller loses release time near deadline.
test('REDTEAM-P2-D9-3 another tab\'s recover() does not cancel a live preparation', async () => {
  const env = await setup();
  const journalB = createLifecycleJournal({ vault: env.vault, session: env.session, validateCanonical: () => ({ ok: true, value: undefined }) });
  const lifeB = createEvmTxLifecycle({ journal: journalB, reader: env.chain.reader(), wallet: env.wallet.request, policy, retry });
  try {
    env.chain.escrow = ['funded'];
    const prepared = val(await env.life.prepare(release()));  // tab A, live prepare result
    val(await lifeB.recover());                                // tab B opens
    const sent = await env.life.submit(prepared);
    const again = await env.life.prepare(release());
    assert.equal(sent.ok, true, `live release cancelled by other tab: submit=${sent.ok || sent.error.code}, re-prepare=${again.ok || again.error.code}, stored=${(await stored(env, prepared.intentId)).state}`);
  } finally { lifeB.dispose(); journalB.dispose(); close(env); }
});

// Integration review of PR #134 (area A, Medium): a never-marked approval cancelled locally, a fresh approval mined at
// the SAME nonce, then funding. After a backup restore (new profile id) the cancelled approval lost its never-sent proof,
// reconciled as 'pending' (hash null, no escrow effect) and was relabelled 'reorged' forever, so every release/refund of
// the funded trade returned CONFLICT. Native proof that the nonce was consumed by a different finalized transaction of
// the journal now settles it as never included.
test('restored profile: an approval whose nonce a different finalized transaction consumed cannot veto release or refund', async () => {
  const { EncryptedBackupService } = await import('../../storage/src/backup-service.ts');
  for (const restore of [false, true]) {
    const env = await setup(); let backup;
    try {
      const approval = fund({ action: 'approve', expectedEscrowState: 'absent', call: { to: ESCROW, data: NOOP, value: '0' } });
      const cancelled = val(await env.life.prepare(approval));
      await start(env); val(await env.life.recover()); // locally cancelled before any marker: never-sent proof (same profile)
      const fresh = val(await env.life.prepare({ ...approval, call: { ...approval.call, data: '0x01' } }));
      assert.equal(JSON.parse((await stored(env, cancelled.intentId)).preparedRequest).nonce, fresh.request.nonce, 'same nonce');
      val(await env.life.submit(fresh)); env.chain.mine(2); env.chain.finalized = env.chain.latest().number;
      assert.equal(val(await env.life.reconcile(fresh.intentId)).outcome, 'finalized');
      const funding = val(await env.life.prepare(fund())); val(await env.life.submit(funding));
      env.chain.mine(10); env.chain.finalized = env.chain.latest().number;
      assert.equal(val(await env.life.reconcile(funding.intentId)).outcome, 'finalized');
      if (restore) {
        backup = new EncryptedBackupService(env.store, crypto);
        const bytes = await backup.export(env.session.profileId);
        const restored = await backup.restore(bytes, pass, pass); bytes.fill(0);
        env.life.dispose(); env.journal.dispose();
        const restoredVault = new EncryptedVaultService(env.store, crypto, { lifecycle: false });
        const session = val(await restoredVault.unlock(restored.newProfileId, pass));
        env.vault.dispose(); env.vault = restoredVault; env.session = session;
      }
      await start(env);
      const sendsBefore = env.wallet.sends;
      const first = await env.life.prepare(release());
      const settled = first.ok ? first : (env.chain.mine(1), await env.life.prepare(release()));
      assert.equal(settled.ok, true, `${restore ? 'restored' : 'same profile'}: release blocked: ${JSON.stringify(first)}`);
      const c = await stored(env, cancelled.intentId);
      assert.equal(c.state, 'failed'); assert.equal(c.submission.hash, null);
      assert.equal(env.wallet.sends, sendsBefore, 'preparation never sends');
    } finally { backup?.dispose(); env.life.dispose(); env.journal.dispose(); env.vault.dispose(); }
  }
});

test('a restored hash-null approval stays held until the transaction that consumed its nonce is finalized', async () => {
  const { EncryptedBackupService } = await import('../../storage/src/backup-service.ts');
  const env = await setup(); let backup;
  try {
    const approval = fund({ action: 'approve', expectedEscrowState: 'absent', call: { to: ESCROW, data: NOOP, value: '0' } });
    const cancelled = val(await env.life.prepare(approval));
    await start(env); val(await env.life.recover());
    const fresh = val(await env.life.prepare({ ...approval, call: { ...approval.call, data: '0x01' } }));
    val(await env.life.submit(fresh)); env.chain.mine(2); // mined and confirmed, not finalized
    backup = new EncryptedBackupService(env.store, crypto);
    const bytes = await backup.export(env.session.profileId);
    const restored = await backup.restore(bytes, pass, pass); bytes.fill(0);
    env.life.dispose(); env.journal.dispose();
    const restoredVault = new EncryptedVaultService(env.store, crypto, { lifecycle: false });
    const session = val(await restoredVault.unlock(restored.newProfileId, pass));
    env.vault.dispose(); env.vault = restoredVault; env.session = session;
    await start(env);
    assert.notEqual(val(await env.life.reconcile(cancelled.intentId)).intent.state, 'failed', 'an unfinalized consumer is not proof');
    env.chain.finalized = env.chain.latest().number;
    val(await env.life.reconcile(fresh.intentId));
    const r = val(await env.life.reconcile(cancelled.intentId));
    assert.equal(r.intent.state, 'failed'); assert.equal(r.intent.submission.hash, null);
  } finally { backup?.dispose(); env.life.dispose(); env.journal.dispose(); env.vault.dispose(); }
});

// Integration review of PR #134 (area A, Low): markSending refused without writing (journal busy) left the intent in
// this instance's send set: submit could not retry, reconcile/recover ignored it and a new prepare got CONFLICT.
test('a refused send marker returns the preparation for an explicit retry and sends nothing by itself', async () => {
  const env = await setup();
  try {
    let armed = false, busy;
    const original = env.wallet.request;
    const wrapped = async args => { if (args.method === 'eth_chainId' && armed) { armed = false; busy = env.journal.list(); } return original(args); };
    env.life.dispose();
    env.life = createEvmTxLifecycle({ journal: env.journal, reader: env.chain.reader(), wallet: wrapped, policy, retry });
    await env.life.walletChanged({ account: ACCOUNT, chainId: '31337', generation: 1 });
    const p = val(await env.life.prepare(fund()));
    armed = true;
    err(await env.life.submit(p), 'CONFLICT');
    val(await busy);
    assert.equal(env.wallet.sends, 0);
    const rec = await stored(env, p.intentId);
    assert.equal(rec.state, 'prepared'); assert.equal(rec.sendMarkedAt, null);
    assert.equal(env.wallet.sends, 0, 'no automatic resend');
    val(await env.life.submit(p)); // explicit user retry of the same live preparation
    assert.equal(env.wallet.sends, 1);
    err(await env.life.submit(p), 'CONFLICT'); // and only once
  } finally { close(env); }
});
