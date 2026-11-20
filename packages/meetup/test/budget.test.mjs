import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { createDisclosureBudget, createLocationConsentController, LEDGER_RECORD_ID, MARKER_RECORD_ID, BUDGET_LOCK_NAME } from '../index.ts';
const PASS = 'Synthetic local meetup privacy fixture passphrase';
const val = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const fail = (result, code) => { assert.equal(result.ok, false, JSON.stringify(result)); if (code) assert.equal(result.error.code, code); assert.doesNotMatch(JSON.stringify(result), /private error|SECRET|https:\/\//); };
const H = 'ab'.repeat(32), K = 'cd'.repeat(32), challenge = i => i.toString(16).padStart(64, '0');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(done => setImmediate(done));
class Store {
  rows = new Map(); writes = 0; beforeGet; beforeWrite; afterWrite;
  async get(id) { await this.beforeGet?.(); return structuredClone(this.rows.get(id)); }
  async add(row, options) { options?.assertCurrent?.(); if (this.rows.has(row.profileId)) throw new VaultStorageError('ALREADY_EXISTS'); this.rows.set(row.profileId, structuredClone(row)); this.writes++; }
  async compareAndSwap(expected, next, options) {
    await this.beforeWrite?.(); options?.assertCurrent?.(); if (options?.signal?.aborted) throw new VaultStorageError('CANCELLED');
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw new VaultStorageError('CONFLICT');
    this.rows.set(next.profileId, structuredClone(next)); this.writes++; this.afterWrite?.();
  }
  subscribeInvalidation() { return () => {}; }
}
function coordinator(profileId) {
  let tail = Promise.resolve();
  const port = {
    available: true, owner: true, fresh: true, beforeWork: undefined, afterWork: undefined,
    isLedgerProfile(id) { return port.owner && id === profileId; },
    mayProvisionFresh(id) { return port.fresh && id === profileId; },
    async withExclusive(name, signal, work) {
      assert.equal(name, BUDGET_LOCK_NAME); if (!port.available) throw Error('private error missing native lock');
      const prior = tail; let release; tail = new Promise(done => { release = done; }); await prior;
      let held = true;
      try {
        if (signal.aborted) throw Error('private error aborted coordination');
        await port.beforeWork?.(); const result = await work({ isCurrent: () => held && port.available && port.owner });
        await port.afterWork?.(); return result;
      } finally { held = false; release(); }
    },
  };
  return port;
}
async function setup(t, { provision = true } = {}) {
  const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false }), session = val(await vault.create(PASS));
  const clock = { wall: 1_700_000_000_000, mono: 1000, owner: true, gesture: true }, port = coordinator(session.profileId);
  const budgets = [], vaults = [vault], consents = []; let nonce = 0;
  const fill = bytes => { bytes.fill(0); const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); view.setUint32(0, ++nonce); };
  function budget(v = vault, s = session, over = {}) {
    const b = val(createDisclosureBudget({ vault: v, session: s, coordinator: port, isOwnerCurrent: () => clock.owner,
      isUserGesture: () => clock.gesture, wallNowMs: () => clock.wall, monotonicNowMs: () => clock.mono, randomFill: fill, ...over })); budgets.push(b); return b;
  }
  function consent(tradeHash = H, radiusM = 500, over = {}) {
    const controller = val(createLocationConsentController({ isUserGesture: () => clock.gesture, isForeground: () => true,
      isOwnerCurrent: () => clock.owner, wallNowMs: () => clock.wall, monotonicNowMs: () => clock.mono,
      setTimer: () => 1, clearTimer() {}, randomFill: fill })); consents.push(controller);
    const explain = val(controller.explain({ tradeHash, recipientKey: K, radiusM, collect: true, shareCoarse: true, mapFetch: false, directNetwork: false, ...over }));
    const cap = val(controller.grant(explain)); if (cap.collect) val(controller.permissionResult(cap, 'granted'));
    return { controller, cap };
  }
  const claim = cap => ({ v: 1, lat: 42.6, lon: -5.6, accuracyM: 10, sampledAtMs: clock.wall, receivedMonotonicMs: clock.mono,
    provenance: 'browser-reported', consentGeneration: cap.generation });
  async function reopen(over = {}) {
    const v = new EncryptedVaultService(store, crypto, { lifecycle: false }); vaults.push(v);
    const s = val(await v.unlock(session.profileId, PASS)); return { vault: v, session: s, budget: budget(v, s, over) };
  }
  const service = budget(); t.after(() => { budgets.forEach(b => b.close()); consents.forEach(c => c.dispose()); vaults.forEach(v => v.dispose()); });
  if (provision) val(await service.provisionFreshLedger());
  return { store, vault, session, clock, port, budget: service, makeBudget: budget, consent, claim, reopen, fill };
}
const decode = payload => JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
async function ledgerOf(s, vault = s.vault, session = s.session) { return decode(val(await vault.read(session.sessionId, LEDGER_RECORD_ID)).payload); }
async function overwriteLedger(s, transform) {
  const current = val(await s.vault.read(s.session.sessionId, LEDGER_RECORD_ID)), parsed = decode(current.payload);
  const changed = transform(parsed), payload = Buffer.from(JSON.stringify(changed)).toString('base64url');
  val(await s.vault.commit(s.session.sessionId, s.store.rows.get(s.session.profileId).revision, [{ op: 'put', record: { ...current, payload } }]));
}

test('missing ledger never initializes through ordinary actions; provisioning requires an actual empty revision-zero profile and gesture', async t => {
  const s = await setup(t, { provision: false }), { cap } = s.consent();
  fail(await s.budget.inspect(), 'LEDGER_UNAVAILABLE'); fail(await s.budget.marker(cap, s.claim(cap)), 'LEDGER_UNAVAILABLE');
  assert.equal(s.store.writes, 1); s.clock.gesture = false; fail(await s.budget.provisionFreshLedger(), 'CONSENT_REVOKED');
  s.clock.gesture = true; val(await s.budget.provisionFreshLedger()); fail(await s.budget.provisionFreshLedger(), 'LEDGER_UNAVAILABLE');
  assert.equal(s.store.writes, 2); assert.equal(Object.isFrozen(s.budget), true);
  for (const method of ['send', 'publish', 'network', 'sign', 'reset', 'delete', 'list']) assert.equal(method in s.budget, false);
});
test('100 marker requests and separate live counterparties reuse exact encrypted sticky bytes; ledger has no coordinates', async t => {
  const s = await setup(t), a = s.consent(), first = val(await s.budget.marker(a.cap, s.claim(a.cap))), after = s.store.writes;
  assert.equal(after, 4); // create + provision + reserve + authenticated cached marker/consumed unit.
  for (let i = 0; i < 100; i++) assert.deepEqual(val(await s.budget.marker(a.cap, { ...s.claim(a.cap), lat: 10 + i / 100 })), first);
  const b = s.consent('ef'.repeat(32)); assert.deepEqual(val(await s.budget.marker(b.cap, s.claim(b.cap))), first);
  assert.equal(s.store.writes, after); assert.deepEqual(val(await s.budget.inspect()), { regionsHour: 1, regionsDay: 1, distanceDay: 0, trackedTrades: 0 });
  const ledger = await ledgerOf(s); assert.doesNotMatch(JSON.stringify(ledger), /lat|lon|accuracy|recipient|random|42\.6|-5\.6/);
  const cached = decode(val(await s.vault.read(s.session.sessionId, MARKER_RECORD_ID)).payload);
  assert.deepEqual(Object.keys(cached), ['format', 'version', 'consentGeneration', 'marker']);
  assert.deepEqual(Object.keys(cached.marker), ['v', 'latE6', 'lonE6', 'radiusM', 'uncertaintyM', 'epoch', 'expiresAtMs']);
  assert.doesNotMatch(JSON.stringify([...s.store.rows.values()]), /latE6|p2p-offramp-location-budget|private error/);
  fail(await s.budget.marker({ ...a.cap }, s.claim(a.cap)), 'CONSENT_REVOKED');
});
test('changed precision requires explicit new epoch and quota; clearing cache preserves counts and cannot resample the same epoch', async t => {
  const s = await setup(t), small = s.consent(), first = val(await s.budget.marker(small.cap, s.claim(small.cap))), large = s.consent(H, 2000);
  fail(await s.budget.marker(large.cap, s.claim(large.cap)), 'CONFLICT'); s.clock.gesture = false;
  fail(await s.budget.marker(large.cap, s.claim(large.cap), { newEpoch: true }), 'CONSENT_REVOKED'); s.clock.gesture = true;
  const second = val(await s.budget.marker(large.cap, s.claim(large.cap), { newEpoch: true })); assert.equal(second.radiusM, 2000); assert.notEqual(second.epoch, first.epoch);
  val(await s.budget.clearCachedMarker()); assert.equal(val(await s.budget.inspect()).regionsDay, 2);
  fail(await s.budget.marker(large.cap, s.claim(large.cap)), 'LEDGER_UNAVAILABLE');
  val(await s.budget.marker(large.cap, s.claim(large.cap), { newEpoch: true })); assert.equal(val(await s.budget.inspect()).regionsDay, 3);
});
test('region budget enforces4 per rolling hour and12 per rolling day and expires markers without restoring active consent', async t => {
  const s = await setup(t);
  for (let hour = 0; hour < 3; hour++) {
    const { cap } = s.consent();
    for (let i = 0; i < 4; i++) val(await s.budget.marker(cap, s.claim(cap), { newEpoch: true }));
    fail(await s.budget.marker(cap, s.claim(cap), { newEpoch: true }), 'EXHAUSTED');
    s.clock.wall += 3_600_000; s.clock.mono += 3_600_000;
  }
  const next = s.consent(); fail(await s.budget.marker(next.cap, s.claim(next.cap), { newEpoch: true }), 'EXHAUSTED');
  assert.equal(val(await s.budget.inspect()).regionsDay, 12);
  s.clock.wall += 86_400_001; s.clock.mono += 86_400_001;
  fail(await s.budget.marker(next.cap, s.claim(next.cap)), 'CONSENT_REVOKED');
  const fresh = s.consent(); val(await s.budget.marker(fresh.cap, s.claim(fresh.cap))); assert.equal(val(await s.budget.inspect()).regionsDay, 1);
});
test('distance reservation consumption/cancellation are idempotent and replay returns the cached claim without another unit', async t => {
  const s = await setup(t), { cap } = s.consent(), reserved = val(await s.budget.reserveDistance(cap, challenge(1)));
  fail(await s.budget.consume({ ...reserved }, true), 'CONFLICT');
  val(await s.budget.cancelBeforeSend(reserved)); val(await s.budget.cancelBeforeSend(reserved));
  assert.equal(val(await s.budget.inspect()).distanceDay, 0); fail(await s.budget.reserveDistance(cap, challenge(1)), 'CONFLICT');
  const second = val(await s.budget.reserveDistance(cap, challenge(2))), done = val(await s.budget.consume(second, false));
  assert.equal(done.cachedResult, false); val(await s.budget.consume(second, false)); fail(await s.budget.consume(second, true), 'CONFLICT');
  fail(await s.budget.cancelBeforeSend(second), 'CONFLICT');
  const replay = val(await s.budget.reserveDistance(cap, challenge(2))); assert.equal(replay.reused, true); assert.equal(replay.cachedResult, false);
  assert.equal(val(await s.budget.inspect()).distanceDay, 1);
});
test('unknown restart consumes a reservation conservatively and rejects imported/old cancellation and new answers', async t => {
  const s = await setup(t), a = s.consent(), reserved = val(await s.budget.reserveDistance(a.cap, challenge(3))); s.budget.close();
  const restored = await s.reopen(), b = s.consent();
  const pending = val(await restored.budget.reserveDistance(b.cap, challenge(3))); assert.equal(pending.state, 'consumed'); assert.equal(pending.cachedResult, null);
  fail(await restored.budget.cancelBeforeSend(pending), 'CONFLICT'); fail(await restored.budget.cancelBeforeSend(reserved), 'CONFLICT');
  fail(await restored.budget.consume(pending, true), 'LEDGER_UNAVAILABLE'); assert.equal(val(await restored.budget.inspect()).distanceDay, 1);
});
test('three-per-trade lifetime count survives detailed event pruning, close/reopen and unrelated trade deletion', async t => {
  const s = await setup(t), a = s.consent();
  for (let i = 0; i < 3; i++) val(await s.budget.consume(val(await s.budget.reserveDistance(a.cap, challenge(i))), true));
  fail(await s.budget.reserveDistance(a.cap, challenge(9)), 'EXHAUSTED');
  const id = '88'.repeat(16); val(await s.vault.commit(s.session.sessionId, s.store.rows.get(s.session.profileId).revision,
    [{ op: 'put', record: { id, kind: 'trade', schemaVersion: 1, payload: Buffer.from('local test only').toString('base64url') } }]));
  val(await s.vault.commit(s.session.sessionId, s.store.rows.get(s.session.profileId).revision, [{ op: 'delete', id }]));
  s.clock.wall += 87_300_001; s.clock.mono += 87_300_001; s.budget.close();
  const reopened = await s.reopen(), b = s.consent(); fail(await reopened.budget.reserveDistance(b.cap, challenge(10)), 'EXHAUSTED');
  assert.equal(val(await reopened.budget.inspect()).distanceDay, 0); assert.equal(val(await reopened.budget.inspect()).trackedTrades, 1);
});
test('global distance cap spans trade consent scopes and128 lifetime trade-map capacity refuses new trades', async t => {
  const s = await setup(t);
  for (let trade = 0; trade < 4; trade++) {
    const { cap } = s.consent(challenge(100 + trade));
    for (let answer = 0; answer < 3; answer++) val(await s.budget.consume(val(await s.budget.reserveDistance(cap, challenge(answer))), true));
  }
  const next = s.consent(challenge(200)); fail(await s.budget.reserveDistance(next.cap, challenge(1)), 'EXHAUSTED');
  assert.equal(val(await s.budget.inspect()).distanceDay, 12);
  await overwriteLedger(s, ledger => ({ ...ledger, entries: [], trades: Array.from({ length: 128 }, (_, i) => ({ tradeHash: challenge(i), count: 3 })) }));
  const untracked = s.consent(challenge(500)); fail(await s.budget.reserveDistance(untracked.cap, challenge(1)), 'CAPACITY_EXCEEDED');
});
test('20 competing requests across independently unlocked vault sessions consume exactly the last global unit once', async t => {
  const s = await setup(t);
  for (let trade = 0; trade < 4; trade++) {
    const { cap } = s.consent(challenge(100 + trade));
    for (let answer = 0; answer < (trade === 3 ? 2 : 3); answer++) val(await s.budget.consume(val(await s.budget.reserveDistance(cap, challenge(answer))), true));
  }
  const other = await s.reopen(), { cap } = s.consent(challenge(103));
  const competing = Array.from({ length: 20 }, (_, i) => i % 2 ? s.makeBudget(other.vault, other.session) : s.makeBudget());
  const results = await Promise.all(competing.map((budget, i) => budget.reserveDistance(cap, challenge(50 + i))));
  assert.equal(results.filter(r => r.ok).length, 1); const fresh = await s.reopen(); assert.equal(val(await fresh.budget.inspect()).distanceDay, 12);
});
test('clock rollback, corrupt/future/missing records and unavailable origin locks refuse without privacy-counter reset', async t => {
  const s = await setup(t), { cap } = s.consent(); val(await s.budget.reserveDistance(cap, challenge(1)));
  s.clock.wall--; fail(await s.budget.inspect(), 'CLOCK_ROLLBACK'); s.clock.wall++;
  s.port.available = false; fail(await s.budget.inspect()); s.port.available = true;
  s.port.owner = false; fail(await s.budget.inspect(), 'LEDGER_UNAVAILABLE'); s.port.owner = true;
  await overwriteLedger(s, ledger => ({ ...ledger, version: 2 })); fail(await s.budget.inspect(), 'UNSUPPORTED_VERSION'); fail(await s.budget.provisionFreshLedger(), 'LEDGER_UNAVAILABLE');
});
test('consent revoke/cancel while storage is pending suppresses outputs and retains the physical slot until drain', async t => {
  for (const mode of ['consent', 'abort']) {
    const s = await setup(t), a = s.consent(), entered = deferred(), release = deferred(), controller = new AbortController();
    s.store.beforeGet = async () => { entered.resolve(); await release.promise; };
    const pending = s.budget.marker(a.cap, s.claim(a.cap), undefined, controller.signal); await entered.promise;
    if (mode === 'consent') a.controller.revoke('lock'); else controller.abort();
    fail(await pending, mode === 'consent' ? 'CONSENT_REVOKED' : 'CANCELLED'); fail(await s.budget.inspect(), 'CONFLICT');
    s.store.beforeGet = undefined; release.resolve(); await tick(); await tick();
    assert.equal(s.store.writes, 2); assert.equal(val(await s.budget.inspect()).regionsDay, 0);
  }
});
test('lock after durable reservation and RNG failure after reservation retain units without returning a marker', async t => {
  const s = await setup(t), { cap } = s.consent(); s.store.afterWrite = () => s.vault.lockAll();
  fail(await s.budget.marker(cap, s.claim(cap)), 'LOCKED'); s.store.afterWrite = undefined;
  const reopened = await s.reopen(), a = s.consent(); assert.equal(val(await reopened.budget.inspect()).regionsDay, 1);
  fail(await reopened.budget.marker(a.cap, s.claim(a.cap)), 'LEDGER_UNAVAILABLE');
  let calls = 0;
  const failing = s.makeBudget(reopened.vault, reopened.session, { randomFill: bytes => { if (++calls === 2) throw Error('private error rng'); s.fill(bytes); } });
  fail(await failing.marker(a.cap, s.claim(a.cap), { newEpoch: true }), 'RNG_UNAVAILABLE');
  assert.equal(val(await failing.inspect()).regionsDay, 2); assert.equal(val(await reopened.vault.read(reopened.session.sessionId, MARKER_RECORD_ID)), null);
});
test('coordinator delayed completion cannot publish a marker after consent expiry and caller inputs are detached before await', async t => {
  const s = await setup(t), a = s.consent(), input = s.claim(a.cap), entered = deferred(), release = deferred();
  s.port.beforeWork = async () => { entered.resolve(); await release.promise; };
  const pending = s.budget.marker(a.cap, input); await entered.promise; input.lat = 80; input.consentGeneration = 999;
  s.port.beforeWork = undefined; release.resolve(); const marker = val(await pending); assert.ok(Math.abs(marker.latE6 / 1e6 - 42.6) < 0.01);
  s.port.afterWork = () => { s.clock.wall += 1_800_000; s.clock.mono += 1_800_000; };
  fail(await s.budget.marker(a.cap, s.claim(a.cap)), 'CONSENT_REVOKED');
});
test('live reservation binding mutations, lost ledger and deadline overrun fail closed with no reset', async t => {
  const s = await setup(t), { cap } = s.consent(), handle = val(await s.budget.reserveDistance(cap, challenge(1)));
  await overwriteLedger(s, ledger => ({ ...ledger, entries: ledger.entries.map(entry => ({ ...entry, challengeId: challenge(999) })) }));
  fail(await s.budget.consume(handle, true), 'INTEGRITY_FAILURE'); fail(await s.budget.cancelBeforeSend(handle), 'INTEGRITY_FAILURE');
  val(await s.vault.commit(s.session.sessionId, s.store.rows.get(s.session.profileId).revision, [{ op: 'delete', id: LEDGER_RECORD_ID }]));
  fail(await s.budget.inspect(), 'LEDGER_UNAVAILABLE'); fail(await s.budget.provisionFreshLedger(), 'LEDGER_UNAVAILABLE');
  const clean = await setup(t), a = clean.consent(); clean.port.beforeWork = () => { clean.clock.mono += 5000; };
  fail(await clean.budget.marker(a.cap, clean.claim(a.cap)), 'TIMEOUT'); assert.equal(clean.store.writes, 2);
});
test('admission is acquired before consent-owner, clock and vault-lease callbacks can reenter', async t => {
  for (const mode of ['consent-owner', 'wall-clock', 'monotonic-clock', 'vault-lease']) {
    const s = await setup(t), a = s.consent(); let armed = false, nested, budget;
    const reenter = () => { if (armed) { armed = false; nested = budget.inspect(); } };
    if (mode === 'consent-owner') {
      budget = s.budget;
      Object.defineProperty(s.clock, 'owner', { get() { reenter(); return true; } });
    } else if (mode === 'vault-lease') {
      const port = { read: s.vault.read.bind(s.vault), list: s.vault.list.bind(s.vault), commit: s.vault.commit.bind(s.vault),
        captureSession(session, revoked) {
          const lease = val(s.vault.captureSession(session, revoked));
          return { ok: true, value: { current() { reenter(); return lease.current(); }, dispose: lease.dispose.bind(lease) } };
        } };
      budget = s.makeBudget(port);
    } else budget = s.makeBudget(s.vault, s.session, mode === 'wall-clock'
      ? { wallNowMs: () => { reenter(); return s.clock.wall; } }
      : { monotonicNowMs: () => { reenter(); return s.clock.mono; } });
    armed = true; const outer = budget.marker(a.cap, s.claim(a.cap));
    fail(await nested, 'CONFLICT'); val(await outer); assert.equal(s.store.writes, 4);
  }
});
test('a preflight callback that locks the vault immediately wipes owned raw bytes and never enters coordination', async t => {
  for (const mode of ['consent-owner', 'wall-clock', 'monotonic-clock', 'vault-lease']) {
    const s = await setup(t), a = s.consent(), input = s.claim(a.cap); let armed = false, entered = 0, captured, budget;
    const originalFrom = Float64Array.from;
    const retire = () => { if (armed) { armed = false; s.vault.lockAll(); } };
    s.port.beforeWork = () => { entered++; };
    if (mode === 'consent-owner') { budget = s.budget; Object.defineProperty(s.clock, 'owner', { get() { retire(); return true; } }); }
    else if (mode === 'vault-lease') {
      const port = { read: s.vault.read.bind(s.vault), list: s.vault.list.bind(s.vault), commit: s.vault.commit.bind(s.vault),
        captureSession(session, revoked) {
          const lease = val(s.vault.captureSession(session, revoked));
          return { ok: true, value: { current() { retire(); return lease.current(); }, dispose: lease.dispose.bind(lease) } };
        } };
      budget = s.makeBudget(port);
    } else budget = s.makeBudget(s.vault, s.session, mode === 'wall-clock'
      ? { wallNowMs: () => { retire(); return s.clock.wall; } }
      : { monotonicNowMs: () => { retire(); return s.clock.mono; } });
    try {
      Float64Array.from = function (...args) { captured = Reflect.apply(originalFrom, Float64Array, args); return captured; };
      armed = true; const pending = budget.marker(a.cap, input); Float64Array.from = originalFrom;
      assert.deepEqual([...captured], Array(7).fill(0), mode); fail(await pending, 'LOCKED');
      assert.equal(entered, 0); assert.equal(s.store.writes, 2);
    } finally { Float64Array.from = originalFrom; }
  }
});
