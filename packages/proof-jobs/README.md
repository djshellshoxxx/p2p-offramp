# T58 local resource contract

Contract frozen before implementation, 2026-11-02. This package implements the
provider-independent resource portion of G29. It does not implement TLS, a bank
proof, a verifier, `VerifiedReceipt`, G30 evidence states, or settlement authority.

Sources under
`01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/` are:

- G29 `module_1.2.3_proof_jobs/spec-proof-job-resource-budget.md`, hard budgets,
  per-tab admission, cancellation and heartbeat/deadline sections.
- `module_1.2.1_tls_handshake_engine/spec-tlsnotary-wasm-browser-bridge.md`,
  exact version-1 command/reply shapes and byte limits.
- `module_1.2.1_tls_handshake_engine/spec-wasm-session-lifecycle.md`, scope loss,
  fresh attempt consent and no blind resume.

G07/G14 keep this optional package outside the default app and custody Worker.
T50's `docs/execution/profiles/01-proof.md` leaves every real provider unselected.

## Public and internal types

The public `createProofJobs()` factory has no configuration or registration API.
It returns a frozen empty `providers` array and
`request(request: unknown, consent: unknown, collectWitness: unknown,
signal?: AbortSignal): Promise<CoreResult<never>>`. Every request returns
`UNSUPPORTED_PROVIDER` before inspecting consent or invoking a collector,
constructing a Worker, or collecting private input. Imported status cannot admit
a provider.

The internal `createPublicResourceRunner(options)` is a constructor-authorized
conformance tool for public bytes only. It is not exported by the public package
facade. Its actual Worker uses the fixed profile `local-public-resource-v1`.

```ts
interface ResourceScope {
  binding: TradeBinding;
  termsHash: string; // 32-byte lowercase hex, public fixture commitment only
  policyHash: string; // 32-byte lowercase hex
  generation: number;
}
interface ResourceOwner {
  current(scope: Readonly<ResourceScope>): boolean;
  subscribeRevocation(listener: () => void): () => void;
}
interface WorkerPort {
  postMessage(command: ProofWorkerCommand, transfer: readonly ArrayBuffer[]): void;
  subscribe(handlers: {
    message(value: unknown): void; error(): void; messageError(): void;
  }): () => void;
  terminate(): void | Promise<void>;
}
interface ResourceRunner {
  consent(scope: unknown): CoreResult<object>; // opaque identity, not JSON
  run(consent: unknown, collectPublicInput: (signal: AbortSignal) =>
    Promise<Uint8Array>, signal?: AbortSignal): Promise<CoreResult<ResourceOutput>>;
  cancel(): void;
  resume(): void; // cancels pending work when elapsed/suspension is uncertain
  dispose(): Promise<void>;
}
interface ResourceOutput {
  kind: 'unverified-resource-output'; jobId: string; generation: number;
  bytes: Uint8Array; // detached owned public output; caller owns disposal
  proofVerified: false; receiptAuthority: false;
  economicPreparationAllowed: false;
}
```

Trusted options supply a synchronous bundled Worker factory, owner capability,
and optional monotonic clock/timer/entropy ports for deterministic tests. They are
not protocol data. Native defaults use `performance.now`, timers and Web Crypto.
Consent captures a detached scope, fresh random 32-byte base64url job ID and
challenge, and a single-use opaque identity. Only one outstanding consent per
runner is retained. A new consent invalidates the previous one. Reentrant consent
and job creation fail closed. An issuance identity is reserved before parsing or
calling owner/entropy ports; cancel, resume or disposal invalidates that identity
before any issuing callback can return a usable consent.

Commands are exact v1 `init(jobId,generation,profileId)`,
`prove(jobId,generation,input)` and `cancel(jobId,generation)`. Replies are exact v1
`ready`, `progress(progress: integer 0..100)`, `result(result: Uint8Array)` and
`failed(code: fixed G13 code)`, always with the same job ID/generation. A result is
resource completion only. Invalid fields, identity/order, duplicate results,
oversized buffers, crash or clone failure retire the job.

## Resource and lifetime limits

G29 ceilings are input 1,048,576 bytes, output 2,097,152 bytes, WASM linear memory
268,435,456 bytes, wall time 120,000 ms, heartbeat 15,000 ms, one active job per tab,
zero queued jobs and 8,388,608 network bytes. Constructor fixture limits may only
be tighter. Total received messages are additionally bounded to 256 per job.
Output is a single bounded result, not an accumulated stream.

A module-owned tab lease covers every runner instance. Ownership is installed
before collector, clock, owner, Worker-factory or listener callbacks can reenter.
Cancellation resolves a fixed failure, aborts collection, terminates the Worker,
clears owned mutable bytes, removes listeners/timers and retains the lease until
collection and termination actually drain. No retry or hidden queue exists. Late
messages cannot attach to another consent or generation. Each attempt checks the
captured owner before/after asynchronous boundaries and immediately before I/O.
Scope loss, explicit resume uncertainty and disposal cancel rather than resume.
Every job guard checks elapsed heartbeat and wall time before work, heartbeat
renewal or result publication; delayed timer dispatch cannot revive expired work.
This is tab/document-local; no cross-tab or cross-origin exclusivity is claimed.
If a trusted termination port throws or rejects, physical completion is unknown
and the slot remains unavailable until document teardown. A pending collector
which ignores cancellation similarly retains admission until it actually exits.

The fixture has no provider/network driver. Its Worker runs under the exact
existing policy: `script-src 'self'; connect-src 'none'; worker-src 'self'`.
Runtime/provider egress is denied; public bundled Worker asset loading is
separately measured by the native harness. No Worker-reported count establishes
accurate production provider traffic accounting.

Browser WASM execution is explicitly unsupported under this unchanged CSP.
Independent Chromium154 evidence in `/workspace/work/t58-csp-wasm-probe.log`
shows a real Worker runs while an empty valid WASM module gets `CompileError`.
There is no automatic fallback or CSP relaxation. A separate Node-only public
WASM memory probe tests a declared maximum 4096 pages (256 MiB), exact-boundary
growth and growth failure beyond it. It is not browser/provider feasibility.

Browser message validation cannot prevent platform allocation before structured
clone, and Worker termination does not prove erasure of all runtime copies. No
exact JS heap/CPU, RSS, hardware or remote-provider cancellation claim is made.

## Acceptance and remaining gates

Focused tests cover empty-provider refusal before input/factory calls, exact
messages, input/output/message bounds, one shared lease, opaque/single-use consent,
reentry, immutable scope, malformed/stale replies, deadline/heartbeat, ignored
cancellation, actual drain, cleanup and redacted errors. Native Chromium tests
use real Workers and the actual App/vault recovery controls, not a mock custody
button. The Node WASM probe is separate. A distinct reviewer verifies frozen
source hashes and commands before integration.

Actual TLS/circuit/key/artifact/public-signal ABI, evaluated toolchains, source and
rail semantics, notary governance, G05/G11/G15 provider transport, accurate
network/decompression accounting, real verifier provenance, mobile measurements
and independent crypto/security review remain unimplemented separate gates.
Default provider registry stays empty and all outputs remain unverified.

## Reproducible local checks

From the repository root, using the ordinary Node runner with its required
managed loopback/IPC capability:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test packages/proof-jobs/test/protocol.test.mjs packages/proof-jobs/test/supervisor.test.mjs
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/tsc --noEmit -p packages/proof-jobs/tsconfig.worker.json
./node_modules/.bin/tsc --noEmit -p packages/proof-jobs/tsconfig.fixture.json
node packages/proof-jobs/test/node-wasm-memory.mjs
P2P_CHROMIUM=/usr/bin/chromium node --import ./scripts/test-support/register-tsx.mjs packages/proof-jobs/test/browser.mjs
```

The native browser harness compiles the actual App, custody Worker and separate
public resource Worker under the existing content-policy builder. It creates an
actual encrypted profile, exports and authenticates its revision-0 backup during
finite CPU work, then locks the vault and observes native Worker closure. Other
bounded cases exercise malformed output/identity/message flood, crash,
heartbeat/wall expiry, shared admission, callback reentry, ignored cooperative
cancellation, resume cancellation and late replies. It checks all submitted
bytes are fixture-generated public data. No profile, passphrase, backup or vault
session enters the resource Worker.

Public fixture opcodes 0–9 mean checksum, finite CPU work, missing heartbeat,
oversized output, wrong generation, message flood, crash, CSP-denied WASM,
unrecognized authority field and heartbeats until deadline. They are compiled
test cases, not provider registrations. The separate Node WASM module has only
one exported memory, no imports and no executable proof code. Its 4096-page
maximum constrains that module's linear memory, not Node or device peak memory.
