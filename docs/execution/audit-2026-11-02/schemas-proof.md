# T38-F schemas and proof resource audit

Status: FRESH_REVIEW_T88_REPAIR_PENDING_ROOT. Baseline `6f7bd07f77b2dabbc6871cdd68d7e5792121e86a`; current commit `6f7bd07f77b2dabbc6871cdd68d7e5792121e86a` plus inventoried working-tree files.

Fresh semantic review covers all 25 production files (2,649 lines), including every parser/public facade in schemas and proof-jobs. The complete package inventory has 49 files; hashes below and in JSON bind this review to exact source bytes. Root subsequently admitted the bounded T88 diagnostic repair in three sources and their three existing tests. No ledger or commit edits were made.

## Findings

**P3-SP1 — repaired locally; independent root review pending.** Pre-repair `backup.ts:95`, `runtime.ts:248/295/325` and direct `recovery-reference.ts:59` could let foreign reflection failures escape fixed diagnostics. Baseline copies/hashes and the original audit are preserved. The bounded T88 repair guards classification, accepts only recognized own data codes and creates fresh fixed errors without reading exception getters or diagnostics. Favorite/recovery array reflection now refuses fixed; nested recovery schema error families, public declarations, versions and caps are unchanged.

Impact is limited to direct JavaScript caller error handling in the reviewed evidence. JSON/structuredClone cannot carry Proxies; no authority, funds, accepted-data or persistence failure was established. No P0/P1/P2 finding was confirmed.

## Evidence and limits

All 15 schemas test sources, both proof unit sources, external registry/identity schema tests and three affected App runtime tests were freshly read. Governing CTX01/CTX02, G01/G02/G03/G05/G07/G11/G12/G13/G29, bridge/session and local encrypted template/favorite contracts were checked.

Fresh T88 verification: canonical default-isolated Node RED had **23 existing passes and 3 new expected failures**. Final focused GREEN had **64 passes, 0 failures/skips/cancellations**; strict main TypeScript and owned-path diff checks passed. That run covers malformed parser errors plus saved-review/draft/favorite/transport/backup/retention behavior through actual endpoint/AppServices/G02 code with in-process Worker/storage test ports. It does not qualify native browser Workers or IndexedDB. Exact commands/log hashes and the six-file delta are in `t88-parser-freeze.json`.

Reused exact-source root T87 evidence: **24 unit tests, 0 failures/skips/cancellations; Chromium 156.0.8078.79/Node 24.22.1, 14 real public Workers and 14 physical closures**. All reviewed proof source/harness/log hashes matched. No full suite, solver or native browser was rerun here. T58 is historical only. The CDP exit observer is a local research port; standard browser Worker.terminate returns void and does not qualify physical hard deadlines. Default providers remain empty; no proof/source/receipt/economic authority or production provider is qualified.

The internal runner retains shared admission through ignored collector/Worker drain, requires a real native completion Promise resolving undefined, enforces parent heartbeat/wall/message bounds and rejects stale outputs. The public facade refuses unsupported providers before touching consent/private input. Schemas bound and snapshot data; owner identity/currentness, cryptography, native chain time/replay and one-send authority remain consuming service duties.

Static review does not qualify professional security/crypto review, physical erasure, hard browser heap/CPU, bank/rail semantics or funds enablement. Trading stays disabled and the recovery pin stays null.

## Freeze and drift

T80 final freeze: `T80 frozen schema receipt plus admitted T88-P3-SP1 guard repair`. Changed schema paths were re-read against the baseline before this final snapshot.

Changes relative to start inventory: 6, all admitted T88 repair paths. The five unchanged frozen T80 schema paths still match; runtime.ts differs only by this explicit diagnostic guard delta. No unexpected schema/proof drift.

- `packages/schemas/src/backup.ts`: `d59f5ae03d8b8463cb9f2f875f6ec10a914dd3c28db549987930eadf14631fc2` → `703ed5c8083ba97a05d8c4131e267833420d867fbafc837f3e467c6bb9f9c399`
- `packages/schemas/src/recovery-reference.ts`: `56a9646c2dbbb26647398ac10e3217f8507c34773825d2d145f19d411b3bf30a` → `1135dc4d709919a69614e9dc1fad6a70f97cfb915e86df32b3fe7db5566505c7`
- `packages/schemas/src/runtime.ts`: `6e4c85bc6657da12f9b6702982f6bbe39b684abc6acddf8f20e3a92c08c8d66c` → `f84d8a56c7c5a85ab74c0d2a92adf58ed119a649363b5b0d624be4e13e0b052c`
- `packages/schemas/test/backup.test.mjs`: `129284dc546fb9f53a900093fc43a6a3fa5a688aa1710faaa6d2fb31e584d617` → `4cda0cb55bc5ed29a120043a7ff0b5713eb556bd48b9965e84284f0ccddbf475`
- `packages/schemas/test/recovery-reference.test.mjs`: `3b83755df228051da7be586feccaedebdd6584daf05148fa7415d35a552b24ec` → `22890938ca21ef787b65302825a0421b9dfdf866bbb6f7b5e634a24f11d1bf7d`
- `packages/schemas/test/runtime.test.mjs`: `7b20a76b86addf1159e98f9343c795f27a4f6c54f661aa90dcc119688973f831` → `1a96a186b2b95095686bbcaea447d4fae0df2f24fcf055c61097bb6920083b52`

## Per-file semantic checks

### packages/schemas/index.ts

SHA-256 `77cabdb421bd923b54746f61bac1e4a1ac8dc2c84bc99f79850d6646c8e7bc55`; 19 lines.

- Public facade reviewed: validated contracts/encoders and type declarations only; no provider or service instance is created. Private EVM agreement input/control/check protocols are absent from this facade.
- Parsing an imported capability-shaped record remains structural validation; consumers must authenticate owned session/permit/consent identity.

### packages/schemas/src/backup-verification.ts

SHA-256 `37341acb6b0d61c63856039af8eda24d8586621cf9c0274009a1a983b57519ca`; 28 lines.

- Exact scalar receipt fixes complete-profile-v1 scope, lowercase profile/digest encodings and bounded current snapshot revision; output is a frozen copy.
- Runtime receipt is a wire description. Imported JSON cannot manufacture the Worker-owned current-backup verification fact.

### packages/schemas/src/backup.ts

SHA-256 `703ed5c8083ba97a05d8c4131e267833420d867fbafc837f3e467c6bb9f9c399`; 114 lines.

- G03 byte import caps intrinsic view length at 12 MiB before UTF-8 decode; native copy covers the logical view rather than its backing buffer. Fatal UTF-8 preserves BOM rejection.
- Bounded custom JSON grammar rejects duplicate decoded/prototype keys, extra objects, invalid numbers and excessive nesting before exact G02 envelope validation. Checksum is corruption detection, with authentication/freshness deliberately outside this parser.
- P3-SP1 repaired under T88: catch classification is itself guarded, recognizes only own data codes and creates a fresh fixed ValidationError. Exception getters, revoked/thrown Proxies and raw diagnostics cannot replace the fixed refusal; existing limit/version behavior remains. Independent root repair review pending.

### packages/schemas/src/core.ts

SHA-256 `4b23d4a3486dde235c98eede3c618f44b5499606a59e199334dc2539c0865d26`; 152 lines.

- Exact own data snapshots reject unknown keys/accessors/custom prototypes without following arbitrary extra graphs. TradeBinding and all four source/kind-specific observation bodies detach and freeze nested records.
- Canonical event IDs, nonnegative safe counters, complete body/header binding equality and 64 KiB serialized envelope bound are enforced. Ordinary JSON.parse accepts duplicate-key last-wins data, but CTX02 does not define canonical/duplicate-free local serialization and imported observation labels never authenticate a bundled adapter.
- No signature/hash/provenance verification is implied by a parsed source label or informational observedAt. Reducer admission, deduplication and authority are consuming-service responsibilities.

### packages/schemas/src/evm-agreement-control.ts

SHA-256 `f847624e30aa27539808c57bcf30082ccc31d36c32bcaaf5283e78bd1b93e4fb`; 110 lines.

- Private strict control/ack/closed schemas check every discriminant, exact own enumerable fields, safe bounded counters and closed operation/reason/error-code sets; hostile reflection is normalized without inspecting foreign errors.
- held and closed remain structural claims. The parser neither waits for nor proves physical Worker shutdown, signature verification or economic authority.

### packages/schemas/src/evm-agreement-input.ts

SHA-256 `7b3e0a67bf70a53b1ebcc241097bd16a372197f0596f0868af448ce6e823af3d`; 232 lines.

- Private structural-only EVM input uses exact fixed-shape snapshots; capability count/order/uniqueness, UTF-8 instruction bounds, U64/U128/U256 canonical integers, lowercase accounts, seller/buyer separation and native/ERC20 address rules are enforced.
- Exactly two role-distinct acceptances obtain independently owned 65-byte signature copies using intrinsic native view facts. Shared/resizable/detached/proxy views fail; copy failures wipe observed allocations. No getter/species/iterator supplies ownership facts.
- No digest, signature, terms binding, expiry ordering/currentness or custody approval is established here. Cryptographic consumers must perform those separately.

### packages/schemas/src/evm-agreement-protocol.ts

SHA-256 `443cbf82644994864fc4374bd087b0835e868fdc8569811471b2f3bc9ccb014e`; 110 lines.

- Private request header validation precedes expensive/body copies; reply exactness checks safe IDs/generation, closed result/error variants, canonical hash and distinct nonzero seller/buyer accounts.
- Structural success always includes testOnly:true and economicPreparationAllowed:false. Detached signatures and changing result discriminants are handled without exposing foreign diagnostics.

### packages/schemas/src/identity.ts

SHA-256 `df9a3278760f9d8d6c8062cd9202e0f0710d8bb7e8153eb3729c328fa6be5a4e`; 64 lines.

- Exact G01 private record pins messaging purpose and noble-curves-bip340-2.4.0, active/retired state, IDs and canonical 32-byte secret/public representations. Secret decode scratch is cleared; private payload decode enforces exact generated JSON serialization and UTF-8.
- Opaque handle parser validates purpose/generation/32-byte ID but does not issue or authenticate service ownership, profile selection, key scalar validity or public/secret correspondence.

### packages/schemas/src/intent.ts

SHA-256 `20b2c987591b741f9d6407e1d13c75952c0b4f513a2cb1bceba9eae40fb7846f`; 89 lines.

- Exact private G12 payload binds the complete CTX binding, account family, fixed action/state/escrow-state sets and bounded timestamps/generation/IDs. EVM hash/nonce and Solana signature/blockhash/height shapes remain separate.
- Prepared request is UTF-8 bounded at 64 KiB with lone surrogates rejected, and total payload remains under G02 cap; canonical serialization rejects duplicates and ambiguous encodings. Foreign error classification is itself guarded.
- Persisted state is recovery data. One-send reservation, native calldata/currentness and replay transitions belong to the journal/coordinator rather than this parser.

### packages/schemas/src/recovery-reference.ts

SHA-256 `1135dc4d709919a69614e9dc1fad6a70f97cfb915e86df32b3fe7db5566505c7`; 97 lines.

- Offline projection keeps unverified-offline-reference authority, emits only bounded public chain-reference hints and never prepared requests/signing payloads. Future/invalid journal records are counted without rewriting/deleting them.
- 64-record raw cursor pagination, revision consistency, coherent counts/next cursor and unique detached items are enforced. Strict 128 KiB export input rejects malformed UTF-8/duplicates and ignores caller byteLength overrides.
- P3-SP1 repaired under T88: direct array metadata and item-descriptor reflection now discards foreign failures into fresh fixed generic Error refusals. Nested CoreSchemaError/IntentSchemaError validation remains outside those catches and retains its existing class/code family. Independent root repair review pending.

### packages/schemas/src/registry.ts

SHA-256 `dbc1245b39c87875481b8d872c66ea5bd4db962b5669493def4099463ded1183`; 248 lines.

- Strict 1 MiB byte parser uses intrinsic view length/copy, fatal UTF-8, bounded JSON nodes/depth/object keys/lists and duplicate/prototype-key refusal. Registry size caps are 32 networks, 8 endpoints, 64 assets and 16 deployments per network.
- Chain-specific canonical addresses/identities/genesis/finality, exact-transfer policy, immutable deployment declarations, ID uniqueness and supported-asset references are validated. Canonical HTTPS or explicitly local loopback URLs reject credentials/query/fragment.
- Parsed registry is immutable data. Trust requires separately authenticated exact-byte G15 digest, and deployed runtime/source/finality checks remain native adapter responsibilities.

### packages/schemas/src/runtime.ts

SHA-256 `f84d8a56c7c5a85ab74c0d2a92adf58ed119a649363b5b0d624be4e13e0b052c`; 420 lines.

- Closed runtime union accepts exact offline config with ReleaseEnabled:0 and empty origins; bounded sequence/generation/profile/record fields, UTF-8 passphrases and intrinsic owned byte copies precede dispatch. No generic provider/signer/record-read/write command is added.
- Draft load/plan/commit variants carry only profile/revision plus exact bounded draft change or opaque preview ID and three true consent acknowledgements. Replies carry detached library or metadata-only bounded preview/receipt; parser does not issue the owned preview capability.
- Favorite operations expose at most eight unique record IDs plus bounded revision/scalar persisted/sessionCurrent receipt. Transport get/select/invalidation variants preserve compiled channel allowlist, explicit ordinary consent and broker generation without accepting route permits or evidence.
- Recovery/retention/back-up/status replies enforce purpose/scope/generation/count/error-key constraints; parsed JSON does not establish current native/Worker/session authority.
- P3-SP1 repaired under T88: private guarded catch normalization creates fresh fixed RuntimeBoundaryError from recognized own data codes, keeps encrypted-export ValidationError limit mapping and covers favorite array reflection. No Proxy crosses structuredClone. Independent root repair review pending.

### packages/schemas/src/saved-review.ts

SHA-256 `924c371c2c09f6282a99fd58009b8c171f05729fa2af59c930ff53a5820c344e`; 50 lines.

- Private saved-review format stores only original bounded 1..64 KiB terms bytes plus file/synthetic-sample/local-draft source label. Canonical base64url/generated JSON rejects alternative serialization; returned bytes are detached.
- Unknown format/schema/invalid payload returns null so other trade records can be counted/preserved rather than replaced or deleted. No stored validity/signature/native authority is accepted; every load needs fresh domain re-review.

### packages/schemas/src/trade-drafts.ts

SHA-256 `964ee6756b1ad68b2489a51147542f09c6d287c9dc5efbaa7ad3f02622d60838`; 119 lines.

- Eight sorted unique template slots contain only seven reusable defaults: approved-ID-shaped network/deployment/asset, positive canonical U256/U128 values, currency and scale. Repeat slot must be null or refer to an existing slot; changes have exactly three named variants.
- In-memory EVM draft input additionally bounds distinct nonzero parties, 4 KiB UTF-8 instructions without lone surrogates and U64 deadlines. Consumers must enforce actual registry, deadline ordering/currentness and fresh accepted identifiers/nonces.
- Canonical strict 8 KiB library payload contains no parties, instructions, accepted order ID, revision, nonce, salt, signature or cached authority. Array reflection/error classification returns fixed fresh diagnostics.

### packages/schemas/src/transport-selection.ts

SHA-256 `23298bcc145008000acffb1632a9be35729ae3e99d7db458a3fd762caabaae42`; 73 lines.

- Exact scalar selection validates ordinary/strict modes, bounded broker generation, known unique app-owned channels in canonical order and explicit boolean ordinary consent; arrays/results detach/freeze.
- Wallet is excluded from controlled channels. The schema cannot import coverage evidence, endpoint consent grants, route permits, physical drain acknowledgements or a production private route.

### packages/schemas/src/transport.ts

SHA-256 `084c0b5e16975340911f7e4f70eaf5d3823799b7cb19037db5012f6d3c892dc8`; 76 lines.

- Exact G05 request/endpoint/evidence/grant shapes use bounded IDs/method lists and known app channels excluding wallet, URL restrictions, positive-coverage expiry and matching adapter/channel/method/endpoint bindings.
- Unknown/unsupported coverage remains explicit and parsed directConsent is data only. Opaque broker ownership and freshness/current generation must be rechecked by the injected trusted transport service.

### packages/schemas/src/vault-service.ts

SHA-256 `d64f63d2223be386c89ca4537c439c58365cc0d47e776f69b1b0343820cad9d0`; 28 lines.

- Type-only G02 contract reviewed: session metadata, purpose-scoped live lease/authority interfaces and fixed Result/error union contain no implementation or raw key export.
- Trusted assertCurrent callback is constructor-local authority checked by storage before atomic add/write; it is not an executable imported JSON field or public generic IPC command.

### packages/schemas/src/vault.ts

SHA-256 `e9bd69ea8eeba487d8df4757d0db58dc656984b925624e009cd019cb96a0ebb8`; 202 lines.

- Exact G02 schemas enforce 600000-iteration PBKDF2-SHA256/AES-256-GCM declaration, salt/nonce/tag lengths, lowercase IDs, bounded revision, canonical base64url, all five record kinds and consumer schema bounds.
- Sorted unique <=10000 records, <=256 KiB decoded payloads and incrementally checked <=8 MiB padded snapshots prevent unbounded serialization. Prefix/padding/fatal UTF-8 and exact canonical private JSON serialization reject duplicates/ambiguity.
- Passphrase encoding preserves exact 12..1024 UTF-8 bytes and rejects lone surrogates without normalization. This module parses/encodes; actual encryption, nonce generation, authentication and physical persistence are storage duties, and no global zeroization/freshness guarantee follows.

### packages/proof-jobs/index.ts

SHA-256 `d0b3a41ecf4cc89dcc32426cedd8ce365ff8d22ef98e7b4367b19d1703513c8f`; 3 lines.

- Public facade exports only createProofJobs and fixed budget, not internal runner/Worker factory/protocol construction. Optional package has no custody provider/registration path.

### packages/proof-jobs/src/budget.ts

SHA-256 `02883261a2d0e7a5cfafe3f9b6cfcbe0900d9ab9315e2c7712508e41865cf373`; 22 lines.

- Literal ceilings are 1 MiB input, 2 MiB output, 256 MiB WASM linear memory, 120 s wall, 15 s heartbeat, one active job/tab, zero queue, 8 MiB network and 256 messages.
- Constructor fixtures may tighten only supported limits. Constants do not themselves enforce browser JS heap/CPU, production network byte accounting or provider feasibility; none is enabled.

### packages/proof-jobs/src/data.ts

SHA-256 `e5d8e0b06b17a79edab90ed59c048460c57887eb828ad578ad8a48f99a85b1e6`; 36 lines.

- Exact own enumerable data snapshots and bounded canonical opaque IDs/digests/counters are checked without getters; errors use local identity WeakMap classification rather than inspecting foreign error objects.
- Native byte copying validates nonshared, nonresizable, nondetached logical views, caps before copy and discards foreign reflection. Output ownership does not imply trusted proof semantics.

### packages/proof-jobs/src/protocol.ts

SHA-256 `54b7440fa0e3a2b106e2874791269c7cfc7393291b90736502745ec30da72c79`; 54 lines.

- Exact v1 init/prove/cancel and ready/progress/result/failed discriminated schemas bind opaque job ID and generation, fixed public profile, progress integer 0..100 and fixed errors.
- Input/output native buffers are copied within 1/2 MiB caps; arbitrary authority flags and extra fields are refused. Shape validation does not verify a proof or bank/fiat/source statement.

### packages/proof-jobs/src/provider-boundary.ts

SHA-256 `9860e65555dff47018cab4290a114cae9648a61723731393fb97ae14f07a683d`; 10 lines.

- Frozen empty providers registry and unconditional UNSUPPORTED_PROVIDER refusal occur before examining request/consent/signal or calling a collector. No Worker, provider selector, private witness or receipt can be admitted.

### packages/proof-jobs/src/supervisor.ts

SHA-256 `6abeead914ea1947fe06d6e219a4c962708d39d01ed68acd18efbdb10582e5eb`; 238 lines.

- Internal public-resource runner issues only opaque, single-use, fresh-entropy consent over detached binding/terms/policy/generation. Issuance reservation and current checks cover reentry during reflection/owner/entropy callbacks; cancel/resume/dispose invalidate before callbacks return.
- One module-owned lease spans all runner instances and is acquired before clock/collector/factory callbacks. No queue/retry exists. Parent guards enforce wall/heartbeat even before delayed timer dispatch, message cap/order/identity, current ownership and late-result wiping.
- Logical retirement resolves fixed failure and aborts/clears resources promptly, while admission remains held until both collector execution and a real native Promise resolving undefined establish physical completion. Void/thenable/reject/nonvoid/unknown termination retains the slot until document teardown.
- Trusted physical-exit port can be supplied by Node or test-only CDP observer; standard browser Worker.terminate() returns void and cannot qualify it. Public ResourceOutput keeps proofVerified/receiptAuthority/economicPreparationAllowed false; no private persistence or provider is present.

### packages/proof-jobs/worker/public-resource.worker.ts

SHA-256 `324fc3ac7e400c1529b7ed4bdd5db49ea28acaad9973b7cfa529567298545a99`; 55 lines.

- Synthetic fixed public-resource Worker validates exact protocol/job/generation before processing bounded public input, clears input, transfers one owned result and closes on cancellation/error.
- Opcodes are local checksum/CPU/heartbeat/malformed/size/flood/crash/CSP-WASM conformance fixtures only. Worker has no network/storage/wallet/TLS/provider integration and cannot establish a verified receipt.

## Complete package hash inventory

| Path | SHA-256 | Review |
| --- | --- | --- |
| `packages/schemas/index.ts` | `77cabdb421bd923b54746f61bac1e4a1ac8dc2c84bc99f79850d6646c8e7bc55` | fresh_complete_semantic_read |
| `packages/schemas/src/backup-verification.ts` | `37341acb6b0d61c63856039af8eda24d8586621cf9c0274009a1a983b57519ca` | fresh_complete_semantic_read |
| `packages/schemas/src/backup.ts` | `703ed5c8083ba97a05d8c4131e267833420d867fbafc837f3e467c6bb9f9c399` | fresh_complete_semantic_read |
| `packages/schemas/src/core.ts` | `4b23d4a3486dde235c98eede3c618f44b5499606a59e199334dc2539c0865d26` | fresh_complete_semantic_read |
| `packages/schemas/src/evm-agreement-control.ts` | `f847624e30aa27539808c57bcf30082ccc31d36c32bcaaf5283e78bd1b93e4fb` | fresh_complete_semantic_read |
| `packages/schemas/src/evm-agreement-input.ts` | `7b3e0a67bf70a53b1ebcc241097bd16a372197f0596f0868af448ce6e823af3d` | fresh_complete_semantic_read |
| `packages/schemas/src/evm-agreement-protocol.ts` | `443cbf82644994864fc4374bd087b0835e868fdc8569811471b2f3bc9ccb014e` | fresh_complete_semantic_read |
| `packages/schemas/src/identity.ts` | `df9a3278760f9d8d6c8062cd9202e0f0710d8bb7e8153eb3729c328fa6be5a4e` | fresh_complete_semantic_read |
| `packages/schemas/src/intent.ts` | `20b2c987591b741f9d6407e1d13c75952c0b4f513a2cb1bceba9eae40fb7846f` | fresh_complete_semantic_read |
| `packages/schemas/src/recovery-reference.ts` | `1135dc4d709919a69614e9dc1fad6a70f97cfb915e86df32b3fe7db5566505c7` | fresh_complete_semantic_read |
| `packages/schemas/src/registry.ts` | `dbc1245b39c87875481b8d872c66ea5bd4db962b5669493def4099463ded1183` | fresh_complete_semantic_read |
| `packages/schemas/src/runtime.ts` | `f84d8a56c7c5a85ab74c0d2a92adf58ed119a649363b5b0d624be4e13e0b052c` | fresh_complete_semantic_read |
| `packages/schemas/src/saved-review.ts` | `924c371c2c09f6282a99fd58009b8c171f05729fa2af59c930ff53a5820c344e` | fresh_complete_semantic_read |
| `packages/schemas/src/trade-drafts.ts` | `964ee6756b1ad68b2489a51147542f09c6d287c9dc5efbaa7ad3f02622d60838` | fresh_complete_semantic_read |
| `packages/schemas/src/transport-selection.ts` | `23298bcc145008000acffb1632a9be35729ae3e99d7db458a3fd762caabaae42` | fresh_complete_semantic_read |
| `packages/schemas/src/transport.ts` | `084c0b5e16975340911f7e4f70eaf5d3823799b7cb19037db5012f6d3c892dc8` | fresh_complete_semantic_read |
| `packages/schemas/src/vault-service.ts` | `d64f63d2223be386c89ca4537c439c58365cc0d47e776f69b1b0343820cad9d0` | fresh_complete_semantic_read |
| `packages/schemas/src/vault.ts` | `e9bd69ea8eeba487d8df4757d0db58dc656984b925624e009cd019cb96a0ebb8` | fresh_complete_semantic_read |
| `packages/schemas/test/backup-verification.test.mjs` | `3b0a13411bcdf31efabe07b674d512e008f0d96a6e60e34426612d3f9a5cc5cd` | fresh_complete_test_source_read_and_focused_run |
| `packages/schemas/test/backup.test.mjs` | `4cda0cb55bc5ed29a120043a7ff0b5713eb556bd48b9965e84284f0ccddbf475` | fresh_complete_test_source_read_and_focused_run |
| `packages/schemas/test/core.test.mjs` | `f29aeca03b45e12af07507adc1efdec356e02ddd4d080f80dd9d912ce18746c3` | fresh_complete_test_source_read_not_run |
| `packages/schemas/test/evm-agreement-control.test.mjs` | `dcce7a1427acc09e20c59c408f20ee72f8ea83e4cdbd5d568a7d1f5670848764` | fresh_complete_test_source_read_not_run |
| `packages/schemas/test/evm-agreement-input.test.mjs` | `f418b42ac3c234fce71a4d3faf9247e7c5bccd5d05b104e49efdda81fbf1ef5b` | fresh_complete_test_source_read_not_run |
| `packages/schemas/test/evm-agreement-protocol.test.mjs` | `55b2d227e6227c9860a68157b77fa40a59996343661938845ff535dd416b6688` | fresh_complete_test_source_read_not_run |
| `packages/schemas/test/intent.test.mjs` | `d4bfce94c7f3809d09be3679112bd9dc1a0627ab03ab183fdadf9d51bdac8fd8` | fresh_complete_test_source_read_not_run |
| `packages/schemas/test/recovery-reference.test.mjs` | `22890938ca21ef787b65302825a0421b9dfdf866bbb6f7b5e634a24f11d1bf7d` | fresh_complete_test_source_read_and_focused_run |
| `packages/schemas/test/retention-runtime.test.mjs` | `fd574d863b138f162ce381221c9046447f29d24709fc066ff9a539b6e062e63d` | fresh_complete_test_source_read_and_focused_run |
| `packages/schemas/test/runtime.test.mjs` | `1a96a186b2b95095686bbcaea447d4fae0df2f24fcf055c61097bb6920083b52` | fresh_complete_test_source_read_and_focused_run |
| `packages/schemas/test/saved-review.test.mjs` | `f7dba2e07c48b139dad7daf72ff3f0e2c476dae46f83560993ff6659a0c87e0d` | fresh_complete_test_source_read_and_focused_run |
| `packages/schemas/test/trade-drafts.test.mjs` | `8f9d509e1dbce729b046175d4e5e9142b93566c807483588fcb310bd27d28add` | fresh_complete_test_source_read_and_focused_run |
| `packages/schemas/test/transport-selection.test.mjs` | `38d5f45bb9743a6196ecad14edfe77c88a595a6a014c48c482b81fc4d66bb2bc` | fresh_complete_test_source_read_and_focused_run |
| `packages/schemas/test/transport.test.mjs` | `54fe4172ae24a780f2a283058c4e79c7f3025e408fb89e56b5743fbc341d4b11` | fresh_complete_test_source_read_not_run |
| `packages/schemas/test/vault.test.mjs` | `85ed4a887b3844a7d08ea1c4c59ea1414ae07ebf2f16ea74d2252412a72d4ea6` | fresh_complete_test_source_read_not_run |
| `packages/proof-jobs/README.md` | `dc8b0b99780078c050324c0dd94738848a4c6b89822186a5d9435157cd34b338` | fresh_complete_contract_read |
| `packages/proof-jobs/index.ts` | `d0b3a41ecf4cc89dcc32426cedd8ce365ff8d22ef98e7b4367b19d1703513c8f` | fresh_complete_semantic_read |
| `packages/proof-jobs/src/budget.ts` | `02883261a2d0e7a5cfafe3f9b6cfcbe0900d9ab9315e2c7712508e41865cf373` | fresh_complete_semantic_read |
| `packages/proof-jobs/src/data.ts` | `e5d8e0b06b17a79edab90ed59c048460c57887eb828ad578ad8a48f99a85b1e6` | fresh_complete_semantic_read |
| `packages/proof-jobs/src/protocol.ts` | `54b7440fa0e3a2b106e2874791269c7cfc7393291b90736502745ec30da72c79` | fresh_complete_semantic_read |
| `packages/proof-jobs/src/provider-boundary.ts` | `9860e65555dff47018cab4290a114cae9648a61723731393fb97ae14f07a683d` | fresh_complete_semantic_read |
| `packages/proof-jobs/src/supervisor.ts` | `6abeead914ea1947fe06d6e219a4c962708d39d01ed68acd18efbdb10582e5eb` | fresh_complete_semantic_read |
| `packages/proof-jobs/test/browser.mjs` | `49f94121da5ee6bf46c24c4deff73a8f4bdcbc3dd9fef466fab9e016aa276e5e` | hash_inventory_only_no_fresh_semantic_claim |
| `packages/proof-jobs/test/fixtures/real-app.tsx` | `e19e2f68523b19ebc1a14b533466ad3aa39be7e891c9fdc5303f8b086f1584fc` | hash_inventory_only_no_fresh_semantic_claim |
| `packages/proof-jobs/test/fixtures/wasm-memory.worker.mjs` | `617d7bd4060605219707fbd2ad4ed9056d80ad25347631f94294300d9b61fa23` | hash_inventory_only_no_fresh_semantic_claim |
| `packages/proof-jobs/test/node-wasm-memory.mjs` | `b7c7973b5d35d0ef9d7e073c40c0ec2aadf68d9489ef3357aec930544a607709` | hash_inventory_only_no_fresh_semantic_claim |
| `packages/proof-jobs/test/protocol.test.mjs` | `0eeb5945bb269a90b8bdb7823e4818c293fb79799a3e365aa818c8dede05419d` | fresh_complete_test_source_read_not_run |
| `packages/proof-jobs/test/supervisor.test.mjs` | `e10a47f7c5e4744a5f8d960adb1a6ebbdefe0ef4054122cd03cb7ba39327b4e8` | fresh_complete_test_source_read_not_run |
| `packages/proof-jobs/tsconfig.fixture.json` | `e8182f3afca6ab82982371558d6bf6a2cd47d2e2b9ae7cb0610fc6613ed52139` | hash_inventory_only_no_fresh_semantic_claim |
| `packages/proof-jobs/tsconfig.worker.json` | `3f3114f11380643967000e20aa4e2e3431ea84faeed64192955c8a046c08c1b2` | hash_inventory_only_no_fresh_semantic_claim |
| `packages/proof-jobs/worker/public-resource.worker.ts` | `324fc3ac7e400c1529b7ed4bdd5db49ea28acaad9973b7cfa529567298545a99` | fresh_complete_semantic_read |

The JSON artifact also records exact governing-contract/test-source hashes and current T87 receipt/log hash comparisons. T88 courier repair/evidence was left unchanged.
