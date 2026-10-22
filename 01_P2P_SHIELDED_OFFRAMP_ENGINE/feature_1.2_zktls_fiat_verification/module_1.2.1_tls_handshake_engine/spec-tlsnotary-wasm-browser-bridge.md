# TLSNotary WASM bridge

## 1. Metadata

- **Specification:** spec-tlsnotary-wasm-browser-bridge
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 4 (optional evidence)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Isolate consented prover work from the UI and custody controls using a bounded worker protocol.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
type ProofWorkerCommand =
 | {v:1;kind:"init";jobId:string;generation:number;profileId:string}
 | {v:1;kind:"prove";jobId:string;generation:number;input:Uint8Array}
 | {v:1;kind:"cancel";jobId:string;generation:number};
// Responses: ready/progress/result/failed with same identity; result <= 2 MiB.
// Inputs <=1 MiB; identifiers opaque 32-byte random base64url.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Create a dedicated bundled Worker only after disclosure consent. Verify WASM/prover artifact hashes against G06 manifest before use; no remote executable import. Structured-clone exact schemas, reject unknown keys and transferred buffers above cap. Worker has no wallet/journal handles and only approved transport capability. Authenticate job/generation on each response; progress integer 0..100 cannot cause UI settlement. Terminate on cancel, crash, timeout or protocol violation; release references and best-effort clear mutable buffers. Neither WASM nor JS guarantees all memory copies are erased.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Worker error returns fixed error code only; no raw transcript/stack. Unsupported cross-origin isolation/browser memory behavior means optional proof unavailable, while core trade controls remain operational. Late result after cancel is discarded and never persisted.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Malicious WASM/provider may exfiltrate credentials; network capabilities must be allowlisted and reviewed. A worker is availability separation, not a trusted hardware enclave. Do not pass login secrets to a remote notary by default.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Malformed structured messages, wrong generation/job, oversized result, crash on init, cancel mid-result, detached buffer, remote script fetch, forged progress and simultaneous custody UI action. Browser test confirms release/refund controls remain responsive.

Sources: [TLS 1.3 RFC 8446](https://www.rfc-editor.org/rfc/rfc8446), [TLSNotary source](https://github.com/tlsnotary/tlsn). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Pin actual TLSNotary commit, Rust/WASM toolchain, JS glue, compatible verifier format and artifact digests before bridge implementation is enabled.
