# P2P09 Fable review and private transport contract proposal

**RETURNED, STATIC REVIEW / UNEXECUTED CONTRACT / NO RUNTIME CHANGES.** Proposed document only: `docs/reviews/G16_PRIVATE_TRANSPORT_CONTRACT_2026-10-27.md`. Fixed P2P sourceff2d7622d8032be87a6074c1299a09050b0a2d9d/tree0949b76b911448c80e59cfc14d0e0136af9957e7, docs-only d759d0c53f7c274569cf410e17730521fadb6d37. Sole P2P integrator owns application, semantics and future verification. No P2P code was imported, compiled or tested in the GhostPay executor.

Input libfile_e3b70f50f2bc8191947db56eba32238bv0,39055bytes/SHA497160fe2d09266f4bff1453f2fe79808a6371c2f85619a125342f29e6c57288. Current full host and reconstructed tests/fixture plus retained protocol/parser/verifier were verified as inert data against all advertised primary target hashes before disclosure. Source proof manifest SHAcd568d3b40f96bac550714768311d799d366d95781d9c4884f96168a7555398b. Unseen full runtime/checker/index bytes remain unclaimed, explicitly partial references only. No whole prior packet was resent; relevant full files/excerpts were selected. No GhostPay/Luthier source included.

Fable found no concrete blocker in the current host (static opinion, not an audit). It lists four nonblocking observations and proposes a private wire contract and next qualification slice. The raw answer below is preserved unchanged. `end_turn` means generation ended; neither the contract sketch nor future test descriptions are implemented or accepted evidence.

## Broker cautions requiring integrator resolution before implementation

1. The draft's `held` acknowledgment reads physical `active` state, but that state is not exposed by the listed current public host API. Logical dispatch completion alone does not establish physical verifier settlement. A minimal reviewed internal observation/drain interface, or another explicit implementable contract, is needed; do not invent a getter that already exists.
2. A `closed`/disposed transport with `held:true` is not proof of physical quiescence. The draft's endpoint-replacement test “only after closed” must not authorize a new Worker while old native work is unresolved. Preserve the packet's stronger no-replacement/no-release-of-unknown-work invariant.
3. A throwing `send`/`postMessage` cannot guarantee delivery of a final `closed` frame through that same failed channel. Specify local terminal cleanup and bounded best-effort emission without recursive sends or false acknowledgment. Fake direct parser/accessor tests and native structured-clone behavior need distinct evidence.

These are concrete draft-contract integration cautions, not a demonstrated defect in the already qualified host and not new financial-policy gates. Ordinary interface/qualification engineering remains with the P2P integrator. No extra paid correction/review call was made merely to claim a cache hit. This one-shot Fable review had no justified same-model reuse forecast: actual cache creation0/read0. Cache plumbing is active and locally tested for future qualifying repeated prefixes; no live savings claimed.

## Request and accounting evidence

```json
{
  "assignment": "P2P-G16-PRIVATE-TRANSPORT-CONTRACT-09",
  "input_commit": "ff2d7622d8032be87a6074c1299a09050b0a2d9d",
  "model": "claude-fable-5-1",
  "timestamp_utc": "2026-10-27T05:24:19.588475+00:00",
  "completed_at_utc": "2026-10-27T05:27:31.379084+00:00",
  "http_status": 200,
  "request_id": "req_011CgSBeQ6wG4hXTf3MXEcKk",
  "usage": {
    "input_tokens": 41625,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0,
    "cache_creation": {
      "ephemeral_5m_input_tokens": 0,
      "ephemeral_1h_input_tokens": 0
    },
    "output_tokens": 13569,
    "service_tier": "standard",
    "inference_geo": "global",
    "speed": "standard",
    "output_tokens_details": {
      "thinking_tokens": 6948
    }
  },
  "stop_reason": "end_turn",
  "estimated_cost_usd": "1.0947",
  "elapsed_seconds": 191.766,
  "cache_metadata": {
    "enabled": false,
    "hit_verified": false
  },
  "implementation_accepted": false,
  "base_tree": "0949b76b911448c80e59cfc14d0e0136af9957e7",
  "proposed_output_only": "docs/reviews/G16_PRIVATE_TRANSPORT_CONTRACT_2026-10-27.md",
  "runtime_changes_applied": false,
  "p2p_tests_executed_by_broker": false,
  "source_proof_manifest_sha256": "cd568d3b40f96bac550714768311d799d366d95781d9c4884f96168a7555398b",
  "raw_response_sha256": "c8d4ebdb8e0b316daa8e31ad7fbf63c5395f1611cbb06e3695ae068122067f4f"
}
```

## Unedited Fable response

# G16 private transport contract review — host ff2d762 / docs head d759d0c

**Status:** read-only adversarial review plus minimal internal control/ack contract. Nothing here was executed by the reviewer; no runtime file is changed; no provider, facade, app feature, financial policy or release is approved. P2P's sole integrator owns application and testing. GhostPay/Luthier are out of scope.

**Evidence classes used below:** *code* = the inline full host (packet lines 207-467), the byte-verified test/schema/verifier files; *owner-executed* = the integrator's reported 60 focused / 454 aggregate / 5 policy Node runs and 238 Chromium assertions per document/Worker (direct host calls, trusted Node clock/timer for 30 s); *static inference* = reviewer reasoning on the text; *proposed* = unwritten tests. Partial `core.ts`, `runtime.ts`, `worker-endpoint.ts`, `app-runtime.ts` and the disposition excerpt are reference-only; nothing is certified about their unseen bytes.

## 1. Findings

Traced invariants (static, against the current host): one physical verifier Promise per host (`active` is set synchronously before any await and only cleared by the identity-checked `.finally`); logical settlement decoupled from physical release (`terminate` resolves the idempotent deferred, `finally` releases the slot); precedence disposal → invalidation/stale → timeout → verdict (checked twice: inside the `.then` projection while the job still owns the slot, and again after `await logical`); `elapsed` is finite-and-nondecreasing per job; timer callback is a no-op after `settled || logicallyDone || timedOut`; both buffer families (host-owned parsed signature copies via `wipe(job.signatures)`, verifier-owned encodings via `signal.abort` listener and verifier `finally`) are wiped on every exit; refusals (`BUSY`, `CONFLICT`, replay, future generation) wipe before any verifier starts.

Microtask ordering (static): `job.resolve(outcome)` inside the `.then` handler queues the `await logical` continuation before the handler returns, so the chained `.finally` runs after the dispatch continuation. The reply is therefore projected while `active === job`; a clock-seam reentry during `e2` sees `BUSY`, never a second job. This is the behavior the three added regressions assert and the owner reports green.

The three owner-reproduced clock fixes are present in code: (i) post-`started` re-check of `disposed/closed/generation/active` before job creation; (ii) `Number.isNaN(started)` → `UNAVAILABLE` only after those re-checks, so a synchronous `invalidate` inside the clock seam wins; (iii) generation/disposed re-check *after* the final `elapsed` sample in the projection. Each matches a current test.

| # | Class | Location / trigger | Evidence | Smallest proposed regression |
|---|---|---|---|---|
| F1 | **Non-blocking** (code-semantics, fail-closed) | Host `isCurrent` → `elapsed` returns `undefined` on a *transient* clock fault sampled by the verifier's `current()` after SHA1; verifier returns `CANCELLED`; clock heals before the `.then` projection, so `liveOwned` is true and the caller receives `result.error.code === 'CANCELLED'` for a request nobody cancelled. No success, no leak, host reusable. | Static inference; current test `clock faults…` keeps the fault armed through projection and sees `UNAVAILABLE`, so this path is untested. | Add to the existing clock-fault test: fault only while `held.calls[1]` is pending, clear it before `pump`; assert a fixed code. Decision for the owner: either accept `CANCELLED` as "guard failed" or map verifier `CANCELLED` seen by a live, non-terminated job to `UNAVAILABLE` (one-line projection change). |
| F2 | Non-blocking (comment drift) | Timer callback comment "its 'suppressed' resolve is overridden below only if still undecided" and the two `job.resolve('timeout')` after `terminate(job)` never win (first resolve decides). Behavior is still correct because the `suppressed && timedOut → TIMEOUT` branch exists. | Static; owner tests `fixed 30s deadline` / `final reply projection` cover the behavior. | Doc-comment correction only; optionally assert `outcome === 'suppressed'` is never required to reach TIMEOUT by removing the dead resolves — not required. |
| F3 | Non-blocking (spec ambiguity) | Request-ID exhaustion: once `lastRequest === MAX_RUNTIME_SEQUENCE`, every further request throws `INVALID_INPUT` (counter cap), but `closed` is not set; header says counter exhaustion closes terminally. Generation exhaustion does set `closed`. | Static; not exercised (test bound is `requestId 0 / replay`). | Proposed test with `lastRequest` seeded near MAX via a trusted seam is intrusive; alternative is to document "request counter exhaustion is implicitly terminal via INVALID_INPUT". Owner choice. |
| F4 | Non-blocking (observable but harmless) | `invalidate()` on a timeout-closed host still increments `generation` (no `closed` check), visible through `host.generation`. No job can start, so no safety effect. | Static. | Optional assertion in `after timeout the host is terminal`: `host.invalidate(); assert generation unchanged` only if the owner wants closed to freeze the counter. |

**No concrete blocking finding.** The reviewer does not claim an independent full audit; owner execution evidence is direct host invocation, not message-driven cancellation.

Explicitly checked and *not* findings: nested dispatch admitted during the `started` clock seam retains its slot and the outer request gets `BUSY` (test present); a timer seam that reenters `invalidate` before `job.timer` is assigned leaves one un-cleared timer whose callback is a guaranteed no-op (`logicallyDone`), then the post-`setTimer` check calls `terminate` again and clears it; `refuse` after `closed` returns `undefined` after wiping; verifier codes outside `FAILURE_CODES` cannot escape (reply parser fails → `UNAVAILABLE`).

## 2. Minimal internal control/ack contract (UNIMPLEMENTED, UNEXECUTED)

Design decisions and rationale:

- **Do not reuse `RuntimeCommand`.** It carries vault semantics (`lock`, `dispose` acked with `locked()` status); a keyless host must not emit anything resembling a vault-lock acknowledgment.
- **Reuse the existing counter constraints.** `requestId ∈ [1, MAX_RUNTIME_SEQUENCE]` strictly increasing per host across *all* frame kinds (check + control share one counter so replay rules stay single-engine); `generation ∈ [0, MAX]`.
- **Host stays the only state engine.** The adapter translates frames to the three existing host calls and projects results; it holds no job state beyond the pending-correlation set.
- **Exact arity, header-first parsing, codes only** — same style as `evm-agreement-protocol.ts`.

```ts
// Sketch only. Would live beside evm-agreement-protocol.ts (private, not exported by any facade).
type ControlOperation = 'invalidateEvmAgreement' | 'disposeEvmAgreementHost';
interface EvmAgreementControlRequest {            // exact 5 fields
  readonly version: 1; readonly requestId: number; readonly generation: number;
  readonly operation: ControlOperation; readonly kind: 'control';
}
interface EvmAgreementControlAck {                 // exact 6 fields
  readonly version: 1; readonly requestId: number; readonly generation: number; // generation AFTER the control applied
  readonly operation: ControlOperation; readonly kind: 'ack';
  readonly result: Readonly<{ ok: true; value: Readonly<{ held: boolean }> }>   // held = physical slot still occupied
                 | Readonly<{ ok: false; error: Readonly<{ code: 'CONFLICT' | 'INVALID_INPUT' }> }>;
}
/** Sent at most once, then the adapter stops emitting forever. */
interface EvmAgreementHostClosed {                 // exact 4 fields
  readonly version: 1; readonly generation: number; readonly kind: 'closed';
  readonly reason: 'TIMEOUT' | 'LIMIT_EXCEEDED' | 'INVALID_INPUT' | 'DISPOSED';
}
type EvmAgreementWireIn  = EvmAgreementCheckRequest | EvmAgreementControlRequest;
type EvmAgreementWireOut = EvmAgreementCheckReply  | EvmAgreementControlAck | EvmAgreementHostClosed;
```

Semantics:

- **Ownership.** Sender (document adapter) owns the next `requestId` and its *belief* of `generation`; the Worker host owns the authoritative `generation`, the single job and all verdicts. `invalidate` is requested with the sender's current generation; the ack returns `generation + 1`. `held` reports `active !== undefined` after the call so the sender knows the slot is physically occupied; it must not retry or spawn a Worker on `held: true`.
- **Replay / past / future.** `requestId <= lastRequest` → `INVALID_INPUT`, no ack, adapter closes (`closed`/`INVALID_INPUT`) — mirrors the host's throw. Control `generation < host.generation` → ack `CONFLICT` without applying. Control `generation > host.generation` → protocol fault → closed. Duplicate invalidate with the already-incremented generation is simply a second valid invalidate (idempotent at the caller's cost of one generation).
- **Bad source / unknown kind.** Frames are parsed only from the adapter's bound port `message` events; any `messageerror`, non-exact-arity frame, unknown `kind`/`operation`, accessor or proxy input → fresh fixed `INVALID_INPUT`, nothing of the body read, adapter closed. `check` body parsing stays delegated unchanged to `parseEvmAgreementCheckRequest`.
- **Suppressed stale result.** A `dispatch` that resolves `undefined` emits nothing; the adapter additionally drops any reply whose `requestId` is not in its pending set or whose `generation` ≠ the generation it was sent with. No "cancelled" reply is synthesized for suppressed work.
- **Dispose.** One ack (`held` reflects a possibly still-pending native hash), then `closed`/`DISPOSED`, then the port is closed. No further frames ever.
- **Timeout.** Host-emitted `TIMEOUT` reply (existing) followed by `closed`/`TIMEOUT`. No automatic new Worker.

Transition table (host states; `g` = host generation, slot = physical verifier Promise):

| State | `check(g)` | `check(<g)` | `check(>g)` / replay | `invalidate` | `dispose` | underlying settles | 30 s |
|---|---|---|---|---|---|---|---|
| Idle(g) | → Active(g) | CONFLICT reply | fault → Closed | → Idle(g+1), ack held=false | → Disposed | — | — |
| Active(g, job) | BUSY reply | CONFLICT | fault → Closed | reply(job)=undefined; → Held(g+1, job), ack held=true | reply=undefined → Disposed(held) | reply projected while slot owned → Idle(g) | TIMEOUT reply → Closed(held) |
| Held(g, stale job) | BUSY reply | CONFLICT | fault → Closed | → Held(g+1), ack held=true | → Disposed(held) | slot released → Idle(g) | no-op (stale timer) |
| Closed(any) | undefined (no reply) | undefined | undefined | ack CONFLICT or nothing (owner choice; see F4) | → Disposed | releases slot only | no-op |
| Disposed | undefined | undefined | undefined | ignored | idempotent | releases slot only | no-op |

`MAX_RUNTIME_SEQUENCE` reached on generation → Closed(`LIMIT_EXCEEDED`). Stale `finally` releases only its own identity (unchanged).

## 3. Next smallest qualification-only transport slice (proposal)

Scope: message-driven cancel/replacement/dispose through a real `MessagePort` and a real dedicated Chromium Worker, using the qualified host **unchanged**; app runtime, facades and checker untouched.

Proposed file ownership (all new, all private, all under test/fixture paths that already may import `schemas/src` protocol):

| File | Role |
|---|---|
| `packages/schemas/src/evm-agreement-control.ts` | Strict parsers for the three frames above; stateless, synchronous, codes only. |
| `packages/wallet/test/lib/evm-agreement-port-adapter.ts` | `createEvmAgreementPortAdapter(host, send)`: single `receive(frame)` entry, pending-correlation set (bounded to 1 public + up to 2 internal, mirroring existing accounting), closed-once emission, no timers of its own (30 s/1 s/5 min stay where they are). |
| `packages/wallet/test/lib/evm-agreement-worker-entry.mjs` | Dedicated-Worker/`worker_threads` entry: constructs host + adapter, binds `onmessage`/`onmessageerror`, uses `postMessage` only. |
| `packages/wallet/test/evm-agreement-port-adapter.test.mjs` | Node tests: `MessageChannel` from `node:worker_threads` (real structured clone) plus a trusted in-process fake port for seam-driven cases. |
| `scripts/fixtures/g16-browser-worker.mjs` + one new group in `g16-browser.mjs` | Native Chromium dedicated Worker over the same entry; existing 238 assertions untouched. |

Accepted existing APIs: `createEvmAgreementHost` (sha256/now/timer seams), `parseEvmAgreementCheckRequest/Reply`, `MAX_RUNTIME_SEQUENCE`, `RUNTIME_REQUEST_TIMEOUT_MS`, `CoreSchemaError`.

Objective oracles (RED = fails before the slice exists because the modules are absent/ERR_MODULE_NOT_FOUND guarded like the current host test; GREEN = exact assertions):

1. **Message cancel while held at SHA1 and SHA2:** send check, wait for `calls[at]`, send `invalidate(g)`; GREEN = ack `{generation:g+1, held:true}` arrives *before* the gate is released, no reply for the check ever arrives (await drain after backend completion), `calls[at].bytes` zero, a check at `g+1` sent before release yields `BUSY`, one sent after release succeeds with the real digest.
2. **Replacement:** check A, invalidate, check C after release: C ok; a late frame carrying A's id → adapter emits nothing (counted via a port spy that records every outbound frame).
3. **Dispose via message:** ack once, `closed/DISPOSED` once, then port `postMessage` of a valid check produces no frame within a backend-completion drain; `unhandledRejection` listener sees `[]`.
4. **Late replies / stale generation:** adapter receives a parse-valid reply whose generation ≠ pending generation (fake port injection) → dropped, pending remains settled only by its real reply.
5. **postMessage throw / messageerror:** `send` seam throws once → adapter emits `closed/INVALID_INPUT`, host disposed (`host.dispatch` → undefined), no second frame; `messageerror` event → same.
6. **Unknown/malformed/accessor/oversized frames:** reuse the host test's `forged`, revoked proxy, accessor-with-throwing-getter and 4097-byte `paymentInstructions`; GREEN = `getters === 0`, one `closed` or one `LIMIT_EXCEEDED`-coded reply exactly as the host already yields, and `PRIVATE` regex never matches any outbound frame.
7. **Endpoint replacement:** second Worker constructed only after `closed`; assert no two live Workers ever hold a pending check simultaneously (counter in fixture).
8. **No persistence / privacy:** Chromium group asserts `indexedDB.databases()` unchanged and zero network requests (existing policy checks), and `JSON.stringify` of every outbound frame fails the private regex.

Not in this slice: DOM/route/pagehide/lock bridging, idle timers, any facade or app import. Node fake-port evidence is labeled distinctly from native Chromium transport in diagnostics.

## 4. Remaining assurance and source limits

- **Owner execution vs independent audit.** All green counts are owner-executed; the reviewer executed nothing. The 30 s bound is exercised only with a trusted Node clock/timer, never native browser timing. Chromium calls are direct host invocations, not transport cancellation; section 3 is the first slice that would produce transport evidence.
- **Keyless host vs real vault authority.** This host holds no key lease, implements no DOM idle policy and must never ack with vault status. The real vault Worker (`worker-endpoint.ts`, reference-only) keeps its own 30 s/1 s/5 min and `lock/dispose` semantics; the two must not share a counter or generation until a later, separately reviewed bridge. Nothing here establishes registry/deployment/trust, funding, nonce/finality or custody.
- **Production facade / import routing.** Staging under `wallet/test/lib` exists because `wallet/src` cannot import the private schema protocol under the unchanged checker. The eventual route must be a reviewed narrow facade with exact emitted app-graph/UI acceptance — not a checker exemption, computed/dynamic import or unapproved package export. Partial `worker-endpoint.ts`/`app-runtime.ts` excerpts show the legacy fall-through to `RuntimeStatus` that the disposition's condition 1 forbids for verifier results; that remains an open inclusion condition.
- **Crypto/native primitives.** Synthetic bundles use Noble-family test signing; independent published/OpenSSL fixture evidence is unchanged in scope. `createOperationId` RNG runs inside the verifier; no "no-RNG" or new provider qualification is claimed. Physical erasure of caller strings, native SHA internals, engine copies and GC is outside proof; host-copy zeroization observed via the intrinsic spy (4 refusal / 2 completion samples) is reported as observed, not guaranteed.
- **Unseen bytes.** `core.ts`, `runtime.ts`, the earlier groups of `g16-browser.mjs`, `intentData`, `evm-terms.ts` and `domain/index.ts` were not reviewed; their behavior is assumed only as the current tests exercise it.
- **Browser scope.** Chromium only; Firefox/WebKit/mobile unassessed.

Stop. No further plan, execution or enablement is proposed by this document.