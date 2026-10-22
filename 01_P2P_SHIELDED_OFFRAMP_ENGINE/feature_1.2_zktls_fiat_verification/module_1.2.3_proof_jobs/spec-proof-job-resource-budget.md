# Proof job resource and cancellation budget

## 1. Metadata

- **Specification:** G29
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 4 (optional evidence)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Bound browser work so optional proof generation cannot disable custody recovery.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface ProofBudgetV1 {maxWitnessBytes:1048576;maxProofBytes:2097152;
 maxWorkerLinearMemoryBytes:268435456;wallTimeMs:120000;
 maxActiveJobsPerTab:1;maxQueuedJobs:0;maxNetworkBytes:8388608;}
// Progress watchdog: no heartbeat for 15 s => terminate; no auto retry.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Validate input caps before worker creation. Enforce WASM linear memory maximum at build/runtime, parent monotonic 120-second wall deadline, cumulative 8 MiB network bytes and result cap. JS heap, CPU and device heat cannot be strictly bounded by a browser; unsupported profiles fail closed rather than claim exact enforcement. UI event loop is separate; cancellation aborts owned network and terminates worker. Reject second job with LIMIT_EXCEEDED; never queue bank sessions. Hidden tab suspension consumes wall budget; unknown elapsed implies cancellation on resume.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Budget exit is failed/CANCELLED with no automatic retry. User may start a fresh job after cleanup and new challenge/consent. Low-memory browsers get unsupported guidance; basic release/refund and G12 reconciliation remain available without importing proof runtime.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

CPU exhaustion, unbounded decompression, provider streams and worker allocation before validation can exhaust device. Profile testing records measured mobile peak memory and worst-case wall time; resource constants are limits, not evidence of feasibility.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

1 MiB/2 MiB/8 MiB boundaries; WASM memory.grow failure; worker ignores cancel; missing heartbeat; suspend/resume; repeated start; malformed compressed payload; low-memory device. Assert worker termination and no proof import/network in core-only build.

Sources: [TLS 1.3 RFC 8446](https://www.rfc-editor.org/rfc/rfc8446), [TLSNotary source](https://github.com/tlsnotary/tlsn). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Browser/device feasibility and accurate network byte accounting must be measured before enabling a profile; no claimed CPU hard cap.
