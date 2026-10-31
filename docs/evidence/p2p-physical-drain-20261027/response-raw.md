# P2P G16 physical-state observation: tests-first proposal

Nothing below has been compiled or executed; RED/GREEN, typecheck and browser results are all unclaimed. The integrator applies and runs everything.

## Source and read-dependency hashes

| Item | Value |
|---|---|
| Base source | `9ea7b6cd030e7315e96ba76883c305a9c94ee539` (tree `e70efbde7f5d0c56091e85f310e9310db3d4b52d`, docs `5aa9ebfc0dc495334c4d863a290c62c71e717851`) |
| `packages/wallet/test/lib/evm-agreement-host.ts` | 12993 bytes, sha256 `5a0c027aee93771c01492e1dd304760c53e5b69bf677852c94fe457036938b1f` |
| `packages/wallet/test/evm-agreement-host.test.mjs` | 25652 bytes, sha256 `8d3939c2fd3b9716fc244045cf4ecbfcf256a6d425c4466d8fce5457e08f3200` |
| Retained verifier `evm-agreement.ts` (read-only context) | sha256 `f7acb2d484db116c4cebac89d3c9d4e375af63bfe2f8aa3646e2117c19792991` |
| Packet | sha256 `5b22a0a5fafea3b5f426a67c39890091fa176b7bea99f6e9ff3090c44f66a405` |

## Assumptions

- Both diffs were written from the supplied bytes only. Hunk line counts and context were counted by hand, so `git apply --check` (or `patch --dry-run`) should be run before anything else. Both hunks anchor at end-of-file lines and the source ends with a trailing newline.
- Test file hunk: the current file has 457 lines (the final line is `});`, closing the last test), and the new hunk appends 171 lines. The anchor is the last 3 context lines. I did not independently re-count the full file, so the starting line number `455,3` is the main risk. If `git apply` complains, use `patch -F3` or regenerate the hunk header against the real file.
- Host file: the `physicalState` and `disposeAndDrain` additions are anchored on unique multi-line contexts.
- Scope-honest limitations are listed after the diffs.

## Diff 1: tests first (`packages/wallet/test/evm-agreement-host.test.mjs`)

All new tests call `host.physicalState()` / `host.disposeAndDrain()` through guarded helpers, so on the current host they fail with a clear "missing API" assertion. Existing tests, including the exact `Object.keys(host).sort()` assertion, are untouched. That assertion will fail on the new host and needs the integrator to update it, which is flagged under limitations.

```diff
--- a/packages/wallet/test/evm-agreement-host.test.mjs
+++ b/packages/wallet/test/evm-agreement-host.test.mjs
@@ -455,3 +455,174 @@
   } finally { host.dispose(); }
 });
+
+// ---- Physical settlement observation (qualification-only) ----
+const phys = host => {
+  assert.equal(typeof host.physicalState, 'function', 'missing physicalState');
+  const state = host.physicalState();
+  assert.equal(Object.isFrozen(state), true, 'physicalState snapshot is frozen');
+  assert.deepEqual(Object.keys(state).sort(), ['generation', 'held', 'terminal']);
+  return state;
+};
+const drain = host => {
+  assert.equal(typeof host.disposeAndDrain, 'function', 'missing disposeAndDrain');
+  return host.disposeAndDrain();
+};
+// Resolves 'settled' only when the promise actually settles; 'pending' after several real event-loop turns.
+const turns = async promise => Promise.race([promise.then(() => 'settled', () => 'settled'), tick(4).then(() => 'pending')]);
+
+test('physical-state: idle snapshot is not held, reads are pure and stable', async () => {
+  const time = fakeTime(), host = make({ now: time.now, timer: time.timer });
+  const readsBefore = time.state.reads, timersBefore = time.state.timers.length;
+  const first = phys(host), second = phys(host);
+  assert.deepEqual(first, { generation: 0, held: false, terminal: false });
+  assert.deepEqual(second, first);
+  assert.notEqual(first, second, 'fresh frozen snapshot per read');
+  assert.equal(host.generation, 0);
+  assert.equal(time.state.reads, readsBefore, 'observation never invokes the clock');
+  assert.equal(time.state.timers.length, timersBefore, 'observation never arms timers');
+  assert.doesNotMatch(JSON.stringify(first), PRIVATE);
+  host.dispose();
+});
+
+test('physical-state: logical invalidate keeps held true at both SHA gates; stale A cleanup never releases B', async () => {
+  for (const at of [0, 1]) {
+    const held = heldSha(), host = make({ sha256: held.sha256 }), pendingA = host.dispatch(request(await fixture(), 1));
+    for (let i = 0; i < at; i++) (await waitCall(held.calls, i)).gate.resolve();
+    await waitCall(held.calls, at);
+    assert.deepEqual(phys(host), { generation: 0, held: true, terminal: false });
+    host.invalidate();
+    assert.equal(await pendingA, undefined);
+    assert.deepEqual(phys(host), { generation: 1, held: true, terminal: false }, 'logical suppression is not physical release');
+    const before = held.calls.length;
+    assert.equal(code(await host.dispatch(request(await fixture(), 2, 1))), 'BUSY');
+    assert.equal(held.calls.length, before);
+    assert.equal(phys(host).held, true, 'B refusal does not release A');
+    for (const call of held.calls) call.gate.resolve();
+    for (const call of held.calls) await call.native.catch(() => {});
+    // Poll actual physical release without fixed tick guesses.
+    while (phys(host).held) await tick(1);
+    assert.deepEqual(phys(host), { generation: 1, held: false, terminal: false });
+    const c = host.dispatch(request(await fixture(), 3, 1));
+    await pump(held.calls);
+    assert.equal((await c).result.ok, true);
+    host.dispose();
+  }
+});
+
+test('physical-state: dispose while held is terminal+held; disposeAndDrain stays pending until the real SHA settles', async () => {
+  for (const at of [0, 1]) {
+    const held = heldSha(), host = make({ sha256: held.sha256 }), pending = host.dispatch(request(await fixture(), 1));
+    for (let i = 0; i < at; i++) (await waitCall(held.calls, i)).gate.resolve();
+    await waitCall(held.calls, at);
+    const drained = drain(host);
+    assert.ok(drained instanceof Promise, 'disposeAndDrain returns a Promise');
+    assert.deepEqual(phys(host), { generation: host.generation, held: true, terminal: true }, 'dispose is synchronous; physical work still held');
+    assert.equal(await pending, undefined, 'logical reply suppressed promptly');
+    assert.equal(await turns(drained), 'pending', 'terminal drain unresolved across real event-loop turns');
+    assert.equal(phys(host).held, true);
+    const before = held.calls.length;
+    assert.equal(await host.dispatch(request(await fixture(), 2)), undefined);
+    assert.equal(held.calls.length, before, 'no dispatch admitted after dispose');
+    for (const call of held.calls) call.gate.resolve();
+    await drained;
+    assert.equal(phys(host).held, false, 'drain resolves only after the slot was physically released');
+    assert.equal(phys(host).terminal, true);
+  }
+});
+
+test('physical-state: repeated dispose/drain share completion semantics and idle drain resolves without waiting', async () => {
+  const idle = make();
+  await drain(idle); await drain(idle);
+  assert.deepEqual(phys(idle), { generation: 0, held: false, terminal: true });
+  const held = heldSha(), host = make({ sha256: held.sha256 }), pending = host.dispatch(request(await fixture(), 1));
+  await waitCall(held.calls, 0);
+  const d1 = drain(host), d2 = drain(host); host.dispose();
+  const d3 = drain(host);
+  assert.equal(await pending, undefined);
+  assert.equal(await turns(Promise.all([d1, d2, d3])), 'pending');
+  for (const call of held.calls) call.gate.resolve();
+  await Promise.all([d1, d2, d3]);
+  assert.equal(phys(host).held, false);
+  await drain(host);
+});
+
+test('physical-state: normal completion and native digest rejection release the slot with unchanged outcomes', async () => {
+  const held = heldSha(), host = make({ sha256: held.sha256 }), pending = host.dispatch(request(await fixture(), 1));
+  await waitCall(held.calls, 0);
+  assert.equal(phys(host).held, true);
+  await pump(held.calls);
+  assert.equal((await pending).result.ok, true);
+  while (phys(host).held) await tick(1);
+  assert.deepEqual(phys(host), { generation: 0, held: false, terminal: false });
+  await drain(host);
+
+  const calls = [], host2 = make({ sha256: bytes => { const gate = deferred(); calls.push(gate); return gate.promise.then(() => { throw Error('PRIVATE-FIXTURE native https://private.invalid'); }); } });
+  const pending2 = host2.dispatch(request(await fixture(), 1));
+  while (!calls.length) await tick(1);
+  assert.equal(phys(host2).held, true);
+  calls[0].resolve();
+  assert.equal(code(await pending2), 'UNAVAILABLE');
+  while (phys(host2).held) await tick(1);
+  assert.equal(phys(host2).held, false);
+  await drain(host2);
+});
+
+test('physical-state: timeout closes logically while held; drain is not resolved until the native Promise settles', async () => {
+  const time = fakeTime(), held = heldSha(), host = make({ sha256: held.sha256, now: time.now, timer: time.timer });
+  const pending = host.dispatch(request(await fixture(), 1)); await waitCall(held.calls, 0);
+  time.advance(30000); time.fire();
+  assert.equal(code(await pending), 'TIMEOUT');
+  assert.deepEqual(phys(host), { generation: 0, held: true, terminal: true }, 'timeout closes the host but the slot is still physically held');
+  const drained = drain(host);
+  assert.equal(await turns(drained), 'pending', 'no drain success while underlying native Promise pending');
+  assert.equal(held.calls.length, 1, 'no further hashing started');
+  for (const call of held.calls) call.gate.resolve();
+  await drained;
+  assert.equal(phys(host).held, false);
+});
+
+test('physical-state: generation exhaustion closes the host terminal without false quiescence', async () => {
+  // Exhaustion needs generation >= MAX_RUNTIME_SEQUENCE; no trusted seam exists to reach it without ~2^53 invalidations.
+  // Not exercised here (see stated limitation). Verify only that an idle host reports an unchanged non-terminal state.
+  const host = make();
+  assert.equal(phys(host).terminal, false);
+  host.dispose();
+  assert.equal(phys(host).terminal, true);
+  await drain(host);
+});
+
+test('physical-state: timer setup failure leaves no phantom held slot or waiter and starts no verifier', async () => {
+  let hashes = 0;
+  const timer = { setTimeout() { throw Error('PRIVATE-FIXTURE timer'); }, clearTimeout() {} };
+  const host = make({ timer, sha256: bytes => { hashes++; return crypto.subtle.digest('SHA-256', bytes); } });
+  assert.equal(code(await host.dispatch(request(await fixture(), 1))), 'UNAVAILABLE');
+  assert.equal(hashes, 0);
+  assert.deepEqual(phys(host), { generation: 0, held: false, terminal: false });
+  await drain(host);
+  assert.equal(phys(host).terminal, true);
+});
+
+test('physical-state: timer-seam reentrant dispose/invalidate before verifier start releases without verifier or phantom waiter', async () => {
+  for (const action of ['dispose', 'invalidate']) {
+    let hashes = 0, host;
+    const timer = { setTimeout() { host[action](); return {}; }, clearTimeout() {} };
+    host = make({ timer, sha256: bytes => { hashes++; return crypto.subtle.digest('SHA-256', bytes); } });
+    assert.equal(await host.dispatch(request(await fixture(), 1)), undefined);
+    assert.equal(hashes, 0, 'no verifier started');
+    assert.equal(phys(host).held, false, 'slot released early with nothing physically running');
+    assert.equal(phys(host).terminal, action === 'dispose');
+    const settled = await turns(drain(host));
+    assert.equal(settled, 'settled', 'drain does not wait on a phantom physical job');
+  }
+});
+
+test('physical-state: wipe oracle intact and observation exposes no private material', async () => {
+  const held = heldSha(), host = make({ sha256: held.sha256 }), pending = host.dispatch(request(await fixture(), 1));
+  await waitCall(held.calls, 0);
+  const state = phys(host);
+  assert.doesNotMatch(JSON.stringify(state), PRIVATE);
+  assert.deepEqual(Object.keys(state).sort(), ['generation', 'held', 'terminal']);
+  const drained = drain(host);
+  assert.equal(zero(held.calls[0].bytes), true, 'abort wipes verifier-owned bytes before underlying settle');
+  assert.equal(await pending, undefined);
+  for (const call of held.calls) call.gate.resolve();
+  await drained;
+});
```

## Diff 2: implementation second (`packages/wallet/test/lib/evm-agreement-host.ts`)

The mechanism is a single `physicalWaiters` array holding at most the resolvers of drain calls made while a job is held. It is flushed and emptied exactly once at physical release, so it is bounded by the number of calls made during that one job. To avoid even that, the array can be replaced by a single shared `drainPromise`, which is what is done here. `drainPromise` is created lazily only when work is held, and it is shared by repeated calls. Every slot release goes through `releaseSlot`, so every early-release path settles it.

```diff
--- a/packages/wallet/test/lib/evm-agreement-host.ts
+++ b/packages/wallet/test/lib/evm-agreement-host.ts
@@ -28,10 +28,20 @@
   readonly timer?: EvmAgreementHostTimer;
 }
+/** Qualification-only snapshot of existing host state. terminal never means physically idle. */
+export interface EvmAgreementHostPhysicalState {
+  readonly generation: number;
+  readonly held: boolean;
+  readonly terminal: boolean;
+}
 export interface EvmAgreementHost {
   dispatch(input: unknown): Promise<Readonly<EvmAgreementCheckReply> | undefined>;
   invalidate(): void;
   dispose(): void;
+  /** Pure frozen primitives from existing state; invokes no clock, timer or RNG. */
+  physicalState(): Readonly<EvmAgreementHostPhysicalState>;
+  /** Synchronously disposes; resolves only after the actual verifier work released its slot. */
+  disposeAndDrain(): Promise<void>;
   readonly generation: number;
 }
 
@@ -74,5 +84,25 @@
   let active: Job | undefined;
+  /** Shared completion for terminal drain; created only while a slot is held, cleared on release. */
+  let drainPromise: Promise<void> | undefined;
+  let drainResolve: (() => void) | undefined;
+  const releaseSlot = (job: Job): void => {
+    if (active !== job) return;
+    active = undefined;
+    const resolve = drainResolve;
+    drainPromise = undefined; drainResolve = undefined;
+    if (resolve) resolve();
+  };
   /** Parse reservation: set synchronously before the strict parser so a reentrant dispatch cannot parse concurrently. */
   let parsing = false;
@@ -128,4 +158,17 @@
     // `active` is retained until the underlying promise actually settles (identity-bound release below).
   };
+  const physicalState = (): Readonly<EvmAgreementHostPhysicalState> =>
+    Object.freeze({ generation, held: active !== undefined, terminal: disposed || closed });
+  const disposeAndDrain = (): Promise<void> => {
+    dispose();
+    if (!active) return Promise.resolve();
+    if (!drainPromise) drainPromise = new Promise<void>(resolve => { drainResolve = resolve; });
+    return drainPromise;
+  };
 
   async function dispatch(input: unknown): Promise<Readonly<EvmAgreementCheckReply> | undefined> {
@@ -196,5 +239,5 @@
-    } catch { terminate(job); active = undefined; return refuse('UNAVAILABLE'); }
+    } catch { terminate(job); releaseSlot(job); return refuse('UNAVAILABLE'); }
 
     // Timer seam may have reentered invalidate/dispose during setup: stop before starting the verifier.
     if (job.logicallyDone || disposed || closed || job.generation !== generation) {
       terminate(job);
-      if (active === job) active = undefined;
+      releaseSlot(job);
       return undefined;
     }
@@ -247,5 +290,5 @@
       wipe(job.signatures);
-      if (active === job) active = undefined;
+      releaseSlot(job);
     });
 
@@ -298,5 +341,7 @@
     dispatch,
     invalidate,
     dispose,
+    physicalState,
+    disposeAndDrain,
     get generation(): number { return generation; },
   });
 }
```

## Decisions

- `physicalState` is `{ generation, held, terminal }`. `held` is `active !== undefined`, which covers the reservation before the verifier starts. `terminal` is `disposed || closed`, so it is also true after timeout or exhaustion.
- `disposeAndDrain` uses one lazily created shared promise per held slot. Repeated calls return the same promise, and there are no listener lists. Idle calls resolve immediately.
- The three non-verifier release paths (timer-throw, timer or clock reentry before verifier start, normal `.finally`) all go through the identity-checked `releaseSlot`, so no phantom waiter is left behind. The clock-reentry-before-registration path never sets `active`, so it has nothing to release.
- Timeout, counter, replay and disposition ordering are unchanged. The only edits are the `active = undefined` sites, now routed through `releaseSlot`, plus the additive members.

## Honest limitations

1. **Existing key-set test:** the existing assertion `Object.keys(host).sort()` equals `['dispatch','dispose','generation','invalidate']` is unchanged and will fail once the two new members exist. I could not edit its meaning without violating "assertion meanings intact". The integrator must widen the expected list to include `disposeAndDrain` and `physicalState`, or tell me to include that one-line edit. This is the only existing-test impact.
2. **Generation-exhaustion branch:** reaching `MAX_RUNTIME_SEQUENCE` requires about 2^53 invalidations and no trusted seam exists. The exhaustion test is therefore a non-exhaustion smoke check only, and it makes no coverage claim for that branch. The guard itself is unchanged.
3. **Clock-reentry-before-registration:** this branch never holds a slot, so category 5's clock half is covered by the existing clock-reentry tests plus idle `physicalState` after them, not by a new test.
4. **Timeout test:** the timeout test relies on the existing `fire()` helper and assumes `closed` is set synchronously by the timer callback, as in the current source.
5. **Polling:** `while (phys(host).held) await tick(1)` has no timeout and relies on the test-runner's default timeout if a bug leaves a slot held.

## Unexecuted verification commands

```
git apply --check <tests.diff> && git apply --check <host.diff>
node --test packages/wallet/test/evm-agreement-host.test.mjs   # tests-only: expect RED on missing physicalState/disposeAndDrain
# then apply host diff, update the key-set assertion, and run the commands from the packet
```

## Stop

This proposal is complete. I am making no further edits, GhostPay/G15/protocol/adapter changes, or execution claims. The sole integrator applies, records RED and GREEN, and decides on limitation 1.