# T38-B transport and messaging static audit

Read all 20 scoped production files (2727 lines, 188657 bytes). Start/end HEAD: `7ff6e9faaf0ec4c1ffbc2fb28b3003396b485f4b` / `7ff6e9faaf0ec4c1ffbc2fb28b3003396b485f4b`.

No Critical/High economic-authority or direct strict-fallback defect was found. Findings below are local correctness/availability boundaries, not third-party exploit reproductions. No source/ledger edits, commits, functional tests, browsers or network actions were performed.

## Findings

### T38-B-01 — P2 / medium: Durable chat listener registration/cleanup can reject after admission and strand its slot

Location: `packages/messaging/src/durable-chat.ts:98`. Confidence: high-static.

run validates instanceof, copies the secret and assigns active at line96, then calls external.addEventListener outside a protected admission/finally boundary at98. A throw precedes installation of physical cleanup. At109 a throwing external.removeEventListener runs before native listener removal and active release, so physical.finally can reject and skip release.

The documented fixed CoreResult boundary can reject with a foreign diagnostic, and the admitted job/key buffer can remain held until the service is closed/recreated. A late committed write may exist even while this cleanup rejection prevents normal list reconciliation in the same service.

Caller/scope limit: Inspected identity-service retention uses a genuine internal AbortController.signal, so the demonstrated default caller does not supply overridden methods. The public durable-chat methods accept signals and promise fixed-result/physical-drain semantics.

Suggested disposition: Use captured EventTarget/AbortSignal intrinsics and a protected registration/cleanup boundary; independently wipe buffers, remove native listeners and release active even when foreign cleanup fails. Add scoped regression coverage before repair.

Verification: Fresh static control-flow proof only. No reproduction, test mutation or network execution performed.

### T38-B-02 — P3 / low: Canonical relay object input can escape parser/fixed-result rejection through reflection or accessors

Location: `packages/relay/src/nip01.ts:49`. Confidence: high-static.

parseEvent accepts unknown but calls Object.keys and destructures fields without a catch/own-data snapshot. createOrderBook.ingest and pool.publish call it outside their guarded verifier sections. subscribe calls normalize outside a guard.

These methods can throw/reject a private foreign diagnostic rather than returning null/invalid/fixed PoolResult. No remote JSON-to-accessor path is established: WebSocket frames are parsed JSON and frozen event snapshots.

Caller/scope limit: Inspected production observation/journey callers use native verifiers and native event data; default app excludes these relay packages. This is lower-priority local API hardening, not a demonstrated third-party intrusion or economic authority defect.

Suggested disposition: Make unknown-object event parsing an own-data guarded rejection and guard normalization/public entry points, preserving fixed codes and bounded snapshots.

Verification: Fresh static read. Existing tests around signer-output own-data snapshots do not by themselves cover these other object entry points; no fresh functional test run claimed.

### T38-B-03 — P3 / low: Restricted local relay stops notifying later subscribers when a reentrant listener removes one cohort member

Location: `packages/relay/src/local-pool.ts:138`. Confidence: high-static.

The loop tests disposed OR missing subscription together and breaks. Encountering the removed cohort member therefore stops iteration instead of only skipping that member.

A live later subscriber misses the current bounded order snapshot until another event, although its subscription was not removed. No trade authority, private transport claim or publication is created.

Caller/scope limit: README and facade confirm this is a preserved local compatibility/evidence implementation, not exported through the canonical relay facade or in the default app graph.

Suggested disposition: Break only for pool disposal and continue for a missing subscription; cover reentrant removal with the preserved module focused tests.

Verification: Fresh static control-flow read only; no new fixture or exploitation reproduction.

## Contracts checked

- G05: empty default authority, exact owner/request/destination grants, strict refusal without direct fallback, generation invalidation, bounded permit/native-work/observer sets, inspect-only expiry isolated from permit authority, bounded reentrant observer catch-up.
- Canonical G19/G21: native signature/filter checks, maker binding, ad expiry/equivocation/deletion, WSS registry destination binding, shared physical close slots, bounded parser/rate/retry/subscription/dedup state, explicit publication only and truthful per-relay ACK uncertainty.
- G16 exchange: exact review bytes/hash/order/buyer/amount/revision, original `terms-accept` body exactly `{revision}`, replay/expiry rechecked after awaits and communication-only terminal state. The actual local journey requires a separate wallet-acceptance capability.
- G20: text-only exact envelope, UTF8/duplicate/depth/allocation bounds, authenticated native wrap before every append/read, sender+messageId durable dedup, contiguous local receipt order, encrypted G02/CAS, fresh-key restore-compatible proofs, cancellation drain and post-commit reconciliation limits.
- Optional policy: inert proposals, WeakMap-issued native runtime, bounded graph/mandatory/atomic schema checks, explicit strict relaxation, actual broker invalidation before fresh registry initialization, no automatic downgrade or economic approval.

## Inventory and per-file semantic checks

| File | Lines | SHA-256 |
|---|---:|---|
| `packages/transport/index.ts` | 5 | `79ea79c49b2d035a4b21bc2dffb2ebe69bba7de555acf2f4ef6aca4f9643750e` |
| `packages/transport/src/http-driver.ts` | 90 | `5b279fdff6ba77574c28e94628519df386e5bab459d4bd57ad79418bba3ecb42` |
| `packages/transport/src/policy.ts` | 342 | `76afd8050a7e32d9a70713c0c42ef3df8c2ea775e562cfd9ab88a11e8d429eb6` |
| `packages/relay/index.ts` | 4 | `1148cf0a82239f59a86d250a490d1a989f7eacbef8ccbec8ebe46f22c632c928` |
| `packages/relay/src/ad.ts` | 247 | `7675a2eb48b4ea977a7fa48b424a5c02f5453cf7c711c23ef62cdf0b31912581` |
| `packages/relay/src/advertisement.ts` | 110 | `718a130271cbce06099bd8ed25f447ff6c1a38ecf6a14d30412c85922b587d78` |
| `packages/relay/src/local-pool.ts` | 201 | `279a8cbd10feea0ed66200635f4f1c02927c837b72eaea8d88ff5ca7f5f1ce7e` |
| `packages/relay/src/nip01.ts` | 112 | `f15611ec153dd614536e4a620183ea5830fff11d6e2b629ab9c1ffa128bb24a7` |
| `packages/relay/src/pool.ts` | 438 | `b94d203aa9858cc215659933ef1dc717296528882bbdd6ef639730ec79ddbb24` |
| `packages/exchange/index.ts` | 5 | `c8363ff04c91d4bb05d3270966cafcd486b00ba6192706f88b5749bd0755555a` |
| `packages/exchange/src/exchange.ts` | 398 | `263aaf875c457e444aae904fc3f7d53c440e6e2fccc6888a234d932b9af7ae2a` |
| `packages/exchange/src/machine.ts` | 23 | `9b895887b53ff79e675702a024afaf62d3a8a5ad561de9ffb2a9ca6b21faa2b2` |
| `packages/exchange/src/messages.ts` | 96 | `035f0f6f7c84245f19efba85d6f256372b042af1a6167a4c8a22617cccf64fc1` |
| `packages/messaging/index.ts` | 5 | `33ad97305b743bff8e5172e0ed92c35b6b5b12be1bade28213f28685a266f8a5` |
| `packages/messaging/src/durable-chat.ts` | 234 | `bde2e8cf79930d33dfd0d548c23c17691374aee77b3e02ddcf1f3d0e6def223e` |
| `packages/messaging/src/envelope.ts` | 69 | `84082a8ad1645a4fd3b5205de866639a2e763298bf33ad52160412d67eddd952` |
| `packages/privacy-policy/index.ts` | 7 | `4795c26212e5e18d7343ad6335bbe05095a5378b854ecdb413dafbb12f731ce0` |
| `packages/privacy-policy/src/mode.ts` | 137 | `d143283db5ca10052b0ca74e447ecb9809e4d5ed2f4999c798d9bebf5bfd0090` |
| `packages/privacy-policy/src/plan.ts` | 136 | `81beca860929e16d6578c0527da21117ce4490e6320326efcfe343388a08b974` |
| `packages/privacy-policy/src/policy.ts` | 68 | `9c31011ac0abcc23cc61b2007e80ab30ef73d33271ca87281233a50933431ea6` |

### packages/transport/index.ts

- Public facade exports policy broker and schema types; HTTP native class is not exported.
- No endpoint, consent, evidence issuer, key or network activation is created by the facade.

### packages/transport/src/http-driver.ts

- Reviewed injected fetch only; HTTPS canonical URL, no credentials/fragments/redirects/cache/referrer or retry.
- 64KiB body/response, 8 operations and 1024 reads bound owned allocations; chunk copies are wiped.
- Native fetch/read/cancel continuation owns pending capacity after scope cancellation; caller must bind scope to exact URL. The class has no production caller/export in this snapshot.

### packages/transport/src/policy.ts

- Default EMPTY issuer gives unknown inspection/no positive permit authority; strict rejects every non-private grant and ordinary direct needs issuer-owned consent.
- Permit object identity, owner, request projection, generation, grant freshness, exact destination and single-shot capture/run are enforced.
- 64 permits/unsettled operations/observers bound state; native work retains unsettled token after wrapper cancellation/timeout.
- Inspection deadlines notify without revoking longer permits; earliest cached channel deadline is retained; actual permit expiry revokes authority.
- Reentrant notifications use a bounded fixed cohort and exclude mutators; cleanup isolates observer/grant faults and no direct fallback exists.

### packages/relay/index.ts

- Canonical facade exports nip01/ad/pool only.
- Restricted advertisement/local-pool profile is not exported or silently substituted.

### packages/relay/src/ad.ts

- Canonical three-tag ad profile: metadata only, maker-author binding, 2KiB content, fixed ranges and bounded lifetime/skew/expiry.
- Builder snapshots own data before signing and rejects changed signer output; deletion remains best effort/same-author.
- Order book bounds default 1000 orders, 1000 tombstones, 8 conflict IDs per order; higher revisions alone clear conflicts; clock unknown hides actionable views.
- Signature checking is optional at the book boundary because canonical pool already verifies; inspected actual production callers also pass native verifiers.
- Public unknown-object ingest inherits parseEvent exception gap (finding T38-B-02).

### packages/relay/src/advertisement.ts

- Separate restricted local-test wire profile, never canonical interoperable advertisement authority.
- Strict JSON, 64KiB event/8KiB content, bounded fields and lifetime precede native NIP01 hash/BIP340 verification.
- Local book bounds 1000 retained orders/4096 dedup IDs; equal-revision semantic conflict stays sticky until newer revision and expiry is rechecked.

### packages/relay/src/local-pool.ts

- Preserved test/evidence-only connector profile: 4 configured slots/4 subscriptions, 32 explicit publications, unknown ACK on cancel/loss, no republish or alternate relay.
- Connector abort and physical close/drain remain owned; uncertain close permanently blocks its slot. Retry budget is six and resets only after actual 60-second established uptime.
- Native frame parser/crypto work is capped/rate-limited; subscriptions enforce exact own-data filter and 24-hour history/100-result bounds.
- Reentrant removal currently breaks the whole listener dispatch cohort, skipping later active subscribers (finding T38-B-03).

### packages/relay/src/nip01.ts

- Frame text is capped before JSON parse and signature work; event/tag/filter sizes and numeric ranges are bounded.
- AUTH/COUNT are ignored, NOTICE/relay error text stays inert, filters must match actual requested subscriptions.
- parseEvent unknown-object reflection/destructuring is not guarded; malformed object traps can throw rather than return null (finding T38-B-02).
- WebSocket whole-message allocation occurs before this parser; 64KiB is a parse/crypto cap, not incremental receive memory qualification.

### packages/relay/src/pool.ts

- Canonical WSS URL is detached and bound through broker expectedURL for reads and publications; no unapproved destination or direct strict fallback.
- 4 shared physical read/publication socket slots remain occupied until native close event; 16 candidates/4 subscriptions/2 filters/100 requested results/4096 dedup IDs/1000 subscription events bound state.
- Token refill/burst, overload windows, signature verification and filter/subscription checks precede delivery. AUTH is unanswered and relay diagnostic text is not surfaced.
- Explicit publication has per-relay accepted/rejected/unknown ACK, max32 in flight, no queue or auto republish; retry applies only to reads and bounded approved candidates.
- Status-observer reentrancy is checked before read I/O; close and generation retirement suppress obsolete open continuations.
- Public object-input parse/normalize calls outside guarded rejection inherit diagnostic exceptions (finding T38-B-02).

### packages/exchange/index.ts

- Facade composes existing Nostr provider and communication state machine; no native chain custody/signing/funding authority is exported.

### packages/exchange/src/exchange.ts

- Session/author/recipient/ad/order/review hash/exact bytes/amount/revision are bound before synchronous state commits.
- Original accept remains a messaging statement, not the two native wallet signatures. Current production journey explicitly requires a separate compiled localPeerAcceptance capability.
- Default 64 sessions/1024 replay IDs; live replay IDs are never evicted, capacity is rechecked after asynchronous cryptography/review and expired IDs alone free replay capacity.
- Pending-take tokens prevent late same-pair completions from overwriting newer negotiation; commit checks recheck role/state, expiry and accept deadline.
- Close suppresses publication results but this raw API has no signal/physical crypto admission gate; inspected actual journey act() serializes work through its busy/epoch boundary. No stronger generic cancellation qualification is claimed.
- Ad book is consulted at session start; sessions then retain ad expiry by explicit ExchangeOptions contract. This differs from the book generic immediate-rerevalidate guidance and is recorded as a contract limitation, not a proven economic defect.

### packages/exchange/src/machine.ts

- Explicit sender-role transition table makes accepted/rejected/cancelled terminal communication states.
- No transition claims funded/paid/settled or performs a provider action.

### packages/exchange/src/messages.ts

- Exact versioned decrypted rumor envelope; tags bind recipient/ad/topic/terms hash; sender differs from recipient and ad/order agree.
- terms-accept body is exactly revision, with no signatures, payment claims, alternate carrier or added approval semantics.
- 24KiB envelope, 16KiB offer terms and one-hour message lifetime/two-minute future skew constants are enforced by parser and exchange caller; duplicate-key JSON parsing is delegated to native parseEventJson.

### packages/messaging/index.ts

- Facade exposes text envelope and durable native-authenticated history only; no append-author, network publication or wallet capability.

### packages/messaging/src/durable-chat.ts

- Native NIP17 proof authentication precedes append AND every history read; inner author/recipient/trade are checked independently of imported wrapper labels.
- Stable authenticated sender+messageId defines durable dedup; changed body conflicts, contiguous local receipt sequence is distinct from sender time and economic authority stays false.
- Native G02 lease, persisted freshness no-op CAS, exact write CAS and rechecks prevent stale session writes; records are encrypted native wraps, not retained plaintext claims.
- 64 default/up to256 messages and 2MiB recognized payloads refuse growth without replay eviction; capacity is preflighted before crypto and rechecked after crypto. Foreign/future/damaged records remain preserved or fail closed.
- Normal close/lock/abort wipes owned keys, returns promptly while physical work drains, and committed proof remains recoverable rather than automatically resent.
- Accepted external signal listener methods are dispatched directly outside protected admission/cleanup and can strand the physical slot/key and reject with foreign diagnostics (finding T38-B-01).

### packages/messaging/src/envelope.ts

- Exact text-only application shape binds tradeId/termsHash/sender/recipient/messageId; unsupported terms/receipt-status profiles are refused.
- 16KiB UTF8 text and 24KiB whole-message bounds precede native wrapping; surrogate/duplicate/depth/UTF8 checks are explicit.
- Content stays inert text; sender time is an untrusted claim; error ownership uses WeakMap and fixed CoreResult errors.

### packages/privacy-policy/index.ts

- Optional inert proposal/evaluation/mode facade; exports no provider implementation, spending permission or positive protection badge.

### packages/privacy-policy/src/mode.ts

- Actual broker invalidate/setMode precede disposing old G14 instances and initializing fresh generation-owned registry.
- busy/physical transition ownership is claimed before hostile policy/consent reflection; cancel/dispose wait for ignored initialization/drain.
- Strict-to-ordinary requires explicit own-data consent; evidence failure blocks/degrades instead of downgrading; no route fallback or funded-term mutation.
- Active evaluation is rechecked against broker/registry generation and required/previously enabled nodes; the real broker invalidation subscription retires stale preparation.

### packages/privacy-policy/src/plan.ts

- WeakMap-issued native runtime prevents cloned/imported status from supplying authority; bounded compiled catalog is snapshotted and dependency/conflict cycles refused.
- Required/optional/disabled references and profiles bind module/protocol/schema; mandatory capability and atomic companion/schema requirements cannot be bypassed.
- Broker mode/generation and real route observations are checked; strict unbrokered static/RTC/SDK paths block; empty native providers never grant private coverage.
- Unavailable optional roots do not initialize incidental dependencies; canPrepare is only configuration prerequisite and economicAuthority is always false.

### packages/privacy-policy/src/policy.ts

- Strict inert own-data proposal parser:32KiB,32 capability entries in total,32 profiles, exact version/reference/schema hash; getters/proxies fail fixed.
- WeakMap-owned errors avoid foreign diagnostic accessors; policy diff compares roles/hash/version/profiles/mode without granting status authority.

## Actual callers and contract excerpts

- `apps/web/src/context-adapters/observations.ts` (27-88), SHA-256 `23ef1962f87d6dd4d504c2d8456fd86f708fe662b74b4e9b0c37a21c921101d7`: Native verifier/book, fixed compiled discovery-to-context mapping and broker/session generations; relay data publishes a hint only.
- `apps/web/src/journey/private-trade.ts` (43-52,137-151,216-235,253-271,291-296), SHA-256 `c1989904d0dcf7cda516139f6d5a2cd997fc79c75a47465ee69bfb0856856437`: Busy/epoch-scoped explicit fixture negotiation calls; genuine peer wallet acceptance carrier remains separately required; exchange accepted alone is insufficient.
- `packages/identity/src/identity-service.ts` (239-258), SHA-256 `79ec4442afc353c34e575cb371e9f7e9a41c041438333a5e4e965ff77c2511ff`: Native history dependency read uses retained identity/G02 session and internal abort signal; secret and durable chat close in finally.
- `packages/nostr-crypto/src/nip17.ts` (66-134), SHA-256 `db78a289ed91201ff6d2194c9ab90bb02d03a9cd324c25c35e1233e3c938d786`: Actual native send/receive binds parties, author/seal/tags; signal guards around native wraps and bounded non-evicted rumor replay cache.
- `scripts/fixtures/journey-worker.mjs` (61), SHA-256 `dd2d0ac87f3c8eb6da3ad89e8bc18d746c0ef95b90a08f4ec899b73fca5b8951`: Test-only canonical relay construction supplies approved logical destination, independent broker and explicit fixture connector.
- `packages/relay/README.md` (full), SHA-256 `520d8d77a363119ff260c86008c3a9ba0f11908f2ab37623ecabee71c8e699f1`: Documents canonical versus restricted local profile split and missing whole-message/incremental/interoperability qualification.
- `packages/messaging/README.md` (full), SHA-256 `bfba8d4c4ca4bae171b021260d45470b71e49bb485a212d90cac0ab143ed03eb`: Documents fixed result/drain, late-write reconciliation, durable native proof and unsupported application wire profiles.
- `packages/privacy-policy/README.md` (full), SHA-256 `5eab39d2c3202b9f49efd47226e5c9ece8cdec0c8db883fd06d86754f525740a`: Documents inert proposal/native runtime/configuration-only prerequisite and strict unbrokered-path gate.

## Fresh versus reused verification

Fresh: complete numbered reads of all 20 production files, caller tracing, initial/end hashes, inventory completeness and JSON artifact checks. Functional tests executed: none. Whole suites executed: none. No runtime pass claim is made.

Reused context only: existing focused test source and task-ledger historical receipts identified intent and prior coverage. Those test names/assertions and old pass counts were not treated as a fresh exact-head result. Findings are static control-flow conclusions, not dynamically reproduced failures.

## Limits and drift

- Browser WebSocket has already allocated/assembled a complete message before the 64 KiB parser cap; no incremental inbound memory-cap qualification was found.
- Native crypto/provider correctness and independent BIP340/NIP interoperability review were not performed.
- The canonical and restricted local relay profiles are intentionally distinct and may not be mixed.
- Exchange replay/session state is memory-only; raw API close suppresses results rather than proving generic physical crypto cancellation. Actual inspected journey serialization is a narrower caller guarantee.
- Relay ACK is relay acceptance only. Chat persisted sequence/time is local metadata. Neither proves delivery, fiat receipt, funding or settlement.
- Ordinary/default App has no positive transport issuer; constructor-injected fixtures and inert feature policy cannot establish live privacy, wallet protection or release readiness.
- No dynamic reproduction was performed for static findings, including hostile local JS signal/objects; no third-party system was queried.

Scoped source drift during read: 0 files. HEAD changed: False. Final delta review required now: False. Root must compare final merged source/caller hashes and rerun only the portions affected by later changes.

The JSON artifact carries the complete structured inventory, exact read ranges, per-file checks, finding locations, caller hashes, verification provenance and delta flag.
