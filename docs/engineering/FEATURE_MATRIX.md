# Feature coverage — pinned main and retained candidates

## Current continuation overlay: generations 12 and 13

This overlay records published staging source. The pinned-main assessment and
older overlays below retain their historical scope. Main is still5c5a84e;
main-target [PR213](https://github.com/djshellshoxxx/p2p-offramp/pull/213) freezes
the reviewed d301 core. Applicable current-target CI remains incomplete. Read the
[current handoff](CONTINUATION_GENERATIONS12_13_20261120.md) for exact source trees
and distinct author, independent and hosted execution evidence.

| Capability | Current engineering result | Remaining qualification |
| --- | --- | --- |
| F01 / F24 backup prerequisite | PR215 adds selected-file authentication and fresh-recheck Settings UI over the reviewed current-runtime service. Final independent UI suite17/17. | New real app/Worker/IndexedDB Chromium fixture is queued; PR217 adds the same journey on Firefox/WebKit. No physical-device claim. |
| F24 signed-update view | Local source723b8d1 adds optional explicit check, complete verified identity review and trusted acceptance gesture; independent UI23/23. Default controller remains null and executable updater stays out of default build graphs. | Publication follows review evidence. Exact-own-lock backup adapter, trusted configuration and actual native origin transition remain incomplete. |
| F16 Solana funded exits | Existing funded exit/recovery slice remains the implemented scope. A worker is adding explicit export of its existing validated public recovery document. | Full discovery/negotiation/funding is not an implemented UI: accepted D1 currently specifies the EVM carrier and Solana prepared-review API excludes funding. No new protocol authority is inferred. |
| Dependency qualification | PR216 uses compatible Cargo updates to remove the remaining RustSec vulnerability match; independent lock replay and audit pass. Host compilation succeeds but defines zero tests. | SBPF attempts were SIGKILLed in unchanged anchor-lang-idl; exact updated-source native/hosted gates remain pending. Five maintenance warnings remain visible. |
| EVM verification | PR214 requires the existing independent Cast calldata test in the Foundry job. Exact step passed14/14 without skips locally. | Current-source hosted oracle execution is queued. |
| F22 optional packages / F27 release | Nine separate optional packages and previous exact-core evidence remain preserved. ReleaseEnabled remains0. | Standalone review, device/provider/trust and release authorization gates remain; no default optional activation. |

## Immutable pinned-main assessment

Baseline: `5c5a84ef6300330700c8b0ca54d074ac113f08be`. Classifications describe actual source scope on this commit. Tests listed below are verified test-source paths; this inventory does not claim fresh product execution. Coordinator test results belong in the consolidation handoff.

**Implemented** means the named source capability exists at the stated scope. Localnet implementations remain isolated test profiles. It does not mean the default static app is enabled for live trades, that physical wallets are qualified, or that a release is authorized.

| ID | Capability | Status on pinned main | Current source scope | Remaining work / candidate |
|---|---|---|---|---|
| F01 | Encrypted profiles, backup, fresh-key restore | Implemented | Encrypted vault, IndexedDB CAS persistence, profiles, migration, backup verification and restore are present in main. | Continue supported-browser/device acceptance; library completeness does not establish independent cryptographic certification.  |
| F02 | Private messaging identity and lock lifecycle | Implemented | Messaging secret is owned by identity/vault services; session disposal and retention are implemented. | Verify physical-device sleep/reload behavior and complete long-term key-rotation decisions separately.  |
| F03 | Canonical EVM terms and offline review | Implemented | Immutable trade terms, registry bindings, role/account checks and signing-domain validation are implemented. | Integrate #187 to bound actual file reads before retained input; retain explicit review and validation. #187 |
| F04 | Basic EVM escrow and financial invariants | Implemented | Native/ERC-20 fund, seller-authorized release to fixed buyer, timeout refund to fixed seller, terminal-state replay refusal and reentrancy guard exist. | Independent contract review and authorized deployed-runtime/public-testnet qualification remain separate. BasicEscrow has no dispute/arbitration function.  |
| F05 | Failed payout and deferred withdrawal recovery | Implemented | Failed push payouts retain a recipient/asset-bound pending withdrawal; retries pay the original recipient. | Retain canonical state validation and exact recipient/asset binding during future UI expansion.  |
| F06 | Offer creation, discovery, expiration and stale-event defense | Implemented | Signed Nostr advertisements and bounded orderbook ingest are composed into localnet trading; expiry/deletion filters and immutable ad identities exist. | Production relay/bootstrap configuration and physical-browser acceptance are separate; it is a bilateral trade workflow, not an automatic centralized matching engine.  |
| F07 | Bilateral negotiation, cancellation and replay resistance | Implemented | v2 offer/accept requires TradeTerms plus PeerAcceptance signatures; terms-bound cancellation/rejection tombstones and durable replay ledger exist. | Do not import the older alternate exchange from #159 over current v2. Wallet and public-network acceptance remain separate. #159 retains selected test/vector evidence only |
| F08 | Nostr event verification, relay transport and interop | Implemented | Signature-checked events, malformed-event refusal, bounded subscriptions, duplicate handling, reconnect/failover and independent native relay harness are on main. | Readiness publication during reconnect needs #181; independently tested relay fixture does not establish every public relay/provider. #181 |
| F09 | Encrypted trade messaging and durable history | Implemented | NIP-17 envelopes and authenticated encrypted history are composed into localnet bilateral trades. | Public metadata and network/device privacy remain external qualification concerns; ciphertext does not hide public chain settlement.  |
| F10 | Wallet connection, network identity and prompt/session safety | Partial | EVM provider/peer signer and Solana wallet boundaries exist, with explicit account/network checks and prompt invalidation. | Physical injected wallets, hardware devices, mobile handoff and full account/chain switch matrix remain; local fixtures cannot qualify those devices.  |
| F11 | Durable send marker, concurrency and unknown-broadcast recovery | Implemented | Version-2 sendMarkedAt/origin provenance, CAS journal writes, conservative unknown outcomes, nonce reservations and canonical reconciliation are on main. | Retain no-automatic-resend rule and source-bound device/browser verification. Do not reimport the duplicate D9 branch stack.  |
| F12 | Native EVM browser trade flow | Implemented | Isolated localnet app supports two-party offer/accept, explicit review, funding, release/refund, messaging and encrypted recovery. It is merged into main. | Localnet profile is restricted to synthetic endpoints/fixtures and ReleaseEnabled=0. Default static app is not a live production trading deployment. #181 readiness correction |
| F13 | ERC-20 browser approval, settlement and recovery | Implemented | Merged #170/#173 add exact-token allowance review, funding, release/refund and fresh-profile/cancelled-intent recovery. | Qualify each authorized production token/profile separately; local MockERC20 evidence is not arbitrary token compatibility.  |
| F14 | Interrupted unfunded trade resumption | Implemented | Merged #175 revalidates original bilateral proof and same immutable terms from encrypted checkpoints before funding admission. | Missing/expired/withdrawn original evidence still requires a new negotiation. Resumption does not refresh peer authorization or send a transaction.  |
| F15 | Solana native/SPL escrow client and durable recovery | Implemented | Merged #167 provides finalized native/SPL reads, settlement planning, wallet submission fences, durable native journal and encrypted recovery. | Public network/genesis/program and allowed-mint policies are not invented or activated; Token-2022/wrapped SOL are refused.  |
| F16 | Solana funded-exit browser composition | Partial | Core native client exists. Open #179 adds explicit prepared/confirm review and browser recovery of already funded trades, rather than full offer/fund parity. | Repair #179 qualification and validate actual browser plus native validator; full Solana discovery/negotiation/funding UI remains beyond that funded-exit slice. #179 |
| F17 | Public QR codec and renderer | Implemented | Main contains versioned bounded QR envelope, canonical JSON, base45, text codec, symbol encoder and SVG rendering primitives. | Integrate #171 positive-safe-integer grouping guard and #172 typed failure for hostile array descriptors. Trade invite signing/verifier policy remains unresolved. #171 #172 |
| F18 | Public QR image/camera capture and review UI | Missing | Absent from pinned main; #183 contains new bounded image/header admission, decoder Worker, camera capture and explicit public review UI. | Repair browser qualification, integrate candidate with explicit trust-context refusal, then complete real device matrix; no authenticated invite claim from unsigned data. #183 |
| F19 | Localization and accessibility | Partial | Locale catalogs, language/direction selector, keyboard focus handling and basic responsive UI tests exist. | Complete supported translations, native browser zoom/RTL/screen-reader/mobile device acceptance. Locale source presence alone is not translation qualification.  |
| F20 | Privacy controls, origin policy and private-data isolation | Partial | Encrypted storage, session lock, explicit transport grants, content policy, import boundaries and static artifact checks exist. | Deployment origin, RPC/relay metadata, physical device and extension assumptions require separate review; no comprehensive anonymity guarantee.  |
| F21 | Dispute/jury arbitration | Experimental | Basic escrow has no adjudication path. Optional #147 preserves diagnostic arbitration calculations; this is not enabled dispute settlement. | Review optional module independently and define authority/model before any user-facing financial integration. #147; historical #46 |
| F22 | Meetup/geofencing, courier and advanced privacy modules | Experimental | Nine accepted independent optional-package branches preserve reference implementations outside main/default application. | Qualify one package at a time and keep default-build import isolation. Do not count unwired reference modules as completed core features. #144–148 #160–163 |
| F23 | zkTLS/payment proof adapters and private reputation | Missing | Main has research/specification material; optional proof-inputs/proof-jobs and intake evaluation branches are not production proof verification or a reputation service. | Select explicit trust model, implement adapter and real fixtures, independently review. Preserve #155 evaluations as inert evidence. #144 #155 #162 |
| F24 | Signed asset-update controller and browser update UI | Missing | Main has signed release/registry primitives. Historical #40/#56/#81 still contain a distinct asset-update HTTP/store/controller feature not yet present on main. | Selective extraction needs later malformed-envelope fixes, failed-IDB-open retry repair, current transport types, tests and release-verification review. Do not restore older trust semantics. #40 #56 #81 |
| F25 | Lab/docs tooling, claims and historical evidence | Partial | Core spec/build checks exist. Repaired #174 preserves original #154 tooling, bounded claims and evidence-manifest fixes; #176 contains prior inventory/evidence. | Qualify repaired tooling against current docs; preserve historical test dates/source hashes and update stale present-tense claims. #174 #176; dependent #155 #156 |
| F26 | Duplicate historical regression stack | Duplicate | D9 #69–75/#91–93 tests, isolated #78–80 tests, and #168 effective browser delta are already represented on current main. | No reimplementation. Exact normalized whole-file preservation and merge-tree proof are in branch-inventory.json.  |
| F27 | Production release and live-funds qualification | Blocked | Release-disabled architecture, explicit build modes and signed trust primitives exist; no deployment/release is authorized in this task. | Owner-controlled trust roots/pins, physical wallets/public testnet, required independent reviews and explicit release authorization remain separate. Preserve ReleaseEnabled=0.  |

## Generation 11 current staging overlay

The 27 pinned-main rows above remain unchanged. Current combined core is
[PR210](https://github.com/djshellshoxxx/p2p-offramp/pull/210) at
d30152336bb687b31ae547ab3fcecb8835a02ef4, treefa0d662c991cb03729ca0a4ea53ef60960b81842. It preserves the prior reviewed
components and adds one Low transport temporary-copy cleanup cause. Exact source
passed **2,311/2,311**, with independent **44/44** maintained tests including the
two regressions. GitHub records212 merged into its stacked target; main is unchanged.

Current optional evidence isdb531cb03ad303821a3625f6858941de1ac07606, treee67004acf32a567dfd515e798c46992aca12163d,
on exact final core. The new full suite passed **2,711/2,711** and independent
boundaries **16/16**. All 2,492 protected core entries and 172 original nonshared blobs
remain exact. All 13 default / 14 demo outputs equal fresh final core builds and
optional graph imports are zero. Original191–199refs remain unchanged.

Current-source hosted/native/browser and standalone named review gates remain.
Full Solana discovery/funding parity, signed-update UI, trust/provider decisions,
physical devices and release qualification remain partial or externally gated.
The latest full census is 221 branches / 209 PRs at04:56UTC; the later evidence branch
is separately recorded. All three generation 11 workers completed and the fresh
delta found no additional unowned safely actionable source work. See the
[current handoff](CONSOLIDATION_HANDOFF.md),
[source mapping](generation11-published-checkpoints.json) and
[gate snapshot](hosted-snapshot-generation11.json).

## Historical generation 10 staging overlay

The 27 pinned-main rows above remain unchanged. Current combined staging is
[PR210](https://github.com/djshellshoxxx/p2p-offramp/pull/210), published at
701f3866e60978c945c5a0148dcda5b65f58fdbc, tree
976a729bc359d331214924abab617969aa066950. It now combines relay206,
backup-verification208, dependency209, transport-qualification210 and QR211 on
corrected207. Its exact tested source passed **2,309/2,309**; independent review
passed **54/54** focused tests. Four later core corrections, all strict financial
assertions, both real refund waits and release-disabled settings are preserved.
Current-head hosted browser/native checks remain queued in the dated observation.

Nine separate optional layers are qualified on this exact final core. Evidence
cf827ee5a86b28b11d6f2bba7c21f60f3d2153e3 has tree
08c42c12a1cdb1dc81fc0c8422ec58a923e05733 and adds only three reports after the
new **2,709/2,709** tested source. Independent boundaries passed **16/16**.
All 172 original nonshared blobs and 2,487 protected core entries remain exact;
13 default and 14 demo outputs equal fresh core builds, with zero optional imports.
Original PR191–199 refs remain unchanged. Applicable standalone named review and
source-bound hosted/native/browser checks remain separate.

Backup verification completes a prerequisite; signed-update UI remains partial.
Full Solana discovery/negotiation/funding parity, authenticated invite policy,
physical devices, owner trust inputs and production release remain incomplete or
externally gated. The default application gains no optional functionality.

A later transport-cleanup candidate, PR212, is assigned to fresh workers42/43.
Its scoped review passed44 maintained tests, including two reproduced regressions;
new full qualification is active. No new correction is added to the ledger before
accepted-source qualification. See the [current handoff](CONSOLIDATION_HANDOFF.md),
[source mapping](generation10-published-checkpoints.json) and machine matrix.

## Historical generation 9 updates: corrected optional source and QR review

The pinned-main table above remains unchanged. Nine reviewed optional packages
are now prepared as separate layers on exact210 and published as evidence at
`8af4dbc2b60b106ec80a2417ddf78d487c3f3586`. Tested source
`390e6685bdf2ba098bc2908183fe5e38442d18cc` passed 2,681 full tests, with 13 default
and 14 demo files identical to fresh210 and zero optional graph imports.
Independent review verified all 2,463 protected base entries at every layer,
original package subtrees,commands/workflows and actual artifacts. Existing
PR191–199 refs remain unchanged; named standalone review and exact-source
hosted/native/browser gates remain. This stack excludes206,208,209 and 211.

Separately, QR211's post-await expiry correction passed 112 affected tests,
including four regressions that previously produced1 pass/3 failures. It closes
one Low public-review timing cause and preserves authority:none. Actual new-source
browser and physical-device qualification remain separate. These source-specific
updates do not change the 27-capability assessment of main or claim a qualified
combined core. See the current [handoff](CONSOLIDATION_HANDOFF.md) and machine
matrix for exact trees,independent reports and remaining integration work.

## Historical generation 8 staging overlay


The table above remains the immutable 27-capability assessment of starting main.
Current corrected core is PR #207 at
`df10fe26a308407237f9ccbc636c8bb61f55b84f`, tree
`4b694124197ae8ce271f14307d12abc43c719406`. Its tested source
`7e8f93a02d6ffb98164ed3b09ba3db5b44bd9390` passed **2,259/2,259** full
tests; root independent review passed **97/97** affected tests after reproducing
the four original failures. Its actual hosted browser job subsequently failed
the transport diagnostic's mandatory warmed-socket precondition. The preceding
one-call/one-fetch/one-POST/503 assertions passed, but later error assertions were
not reached. This is incomplete qualification, not a browser pass.

PR #205's 2,217-test source and historical hosted results remain evidence for
that older source. It lacks the four core corrections and remains held. Relay
#206, backup #208 and dependency #209 are separately reviewed descendants of
#207; their individual results are not a qualification of their combined tree.
See [the handoff](CONSOLIDATION_HANDOFF.md),
[failure triage](HOSTED_FAILURE_TRIAGE_GENERATION8_20261120.md) and
[machine-readable state](consolidation-state.json) for exact source identities,
current ownership and the next execution gate.

| Capability | Current staging change | Remaining qualification or composition |
|---|---|---|
| F01 — backup verification | Separate #208 exposes complete-file verification through current Worker/VaultService ownership, bound to profile, generation and persisted revision. External author reports 2,277 full tests and independent reviews. | This coordinator did not execute that suite. Exact source gates remain; these APIs complete a prerequisite, without activating signed updates. |
| F03 / F08 | Pre-copy byte bounds and restored-profile/relay readiness corrections are integrated. | Preserve source-bound native and current hosted checks; historical provider evidence is scoped to its source. |
| F06 — relay validation | #206 now composes the reviewed clock/capacity guards onto #207. External combined suite passed 2,265; root's original-source independent selection passed 140. | Counts describe separate executions. Native Nostr and exact hosted/browser gates remain required. No new default financial effect is established. |
| F11 / F16 — funded Solana recovery | #207 contains acknowledged-send/restore repairs and the finalized expiry/status-context correction. #202 separately completed 62 validator and five actual Worker/browser checks with real refund waits. | #207's preliminary diagnostic failed and its own complete native proof remains required. Keep no automatic resend and durable unknown markers. Discovery/negotiation/funding UI parity remains incomplete. |
| F17 / F18 — public QR | Core guards and image/camera review are integrated. #189 completed six actual Chromium journeys. | Synthetic camera is not physical-device acceptance; unsigned review conveys no authority. Current core still needs its own hosted execution. |
| F24 — internal asset updater | Historical internal source and storage lifecycle corrections, including cancellation during pending IndexedDB open, are reviewed. #208 adds backup verification prerequisites. | Real trust/transport/update UI composition remains incomplete. The external successor's screened historical browser adaptation is excluded; no bypass, execution or activation is claimed. |
| F25 — tooling | Docs/lab tooling, immutable historical copy checks and output-directory ownership corrections are reviewed. | Historical receipts remain dated; current unsigned distribution still refuses stale immutable locale evidence. |
| F22 — nine optional packages | Separate #191–#199 retain independent source reviews and absent default imports. The older #205-based composition passed 2,617 tests, preserving 13 default and 14 demo artifacts. The external evidence branch has the identical tree. | It predates four core repairs. Recompose one package at a time on corrected core and satisfy the applicable standalone automated-review condition plus current-source gates. |
| F28 — favorites/templates | Current UI/Worker composition retains encrypted stores, explicit consent/CAS and fresh registry review. #205's actual hosted groups passed; #207 adds route ownership across four entry points. | The newer navigation source requires its own browser proof. Do not transfer older passes or count four entry points as four independent causes. |
| F29 — scriptless portal | Source-reference page and exact downloads retain #190's source-bound browser evidence. #207 adds reviewed replacement-directory cleanup ownership. | Current-source hosted qualification, deployed-host and physical print/device acceptance remain separate. |
| F30 — unsigned staging | Historical two-pass/nested-path evidence and current immutable-copy validation are preserved. | Current locale drift keeps staging refused. The historical-client/current-tooling positive fixture does not qualify the new client; signing/publication remain false. |
| F31 — inert governance | Historical validators and assurance tooling remain reviewed source. | Stale non-owned references stay explicit; records confer no legal, release or economic authority. |

The JSON companion preserves the baseline and records this overlay separately.
No staging-source result means a main merge, production activation or release.

## Source and regression evidence

### F01 — Encrypted profiles, backup, fresh-key restore

Source: `packages/storage/src/vault-service.ts`, `packages/storage/src/backup-service.ts`.

Regression source: `packages/storage/test/vault-service.test.mjs`, `packages/storage/test/backup-service.test.mjs`, `packages/storage/test/backup-verification.test.mjs`.

### F02 — Private messaging identity and lock lifecycle

Source: `packages/identity/src/identity-service.ts`.

Regression source: `packages/identity/test/identity.test.mjs`, `packages/identity/test/history-retention.test.mjs`.

### F03 — Canonical EVM terms and offline review

Source: `packages/wallet/src/evm-terms.ts`, `packages/wallet/src/evm-agreement.ts`.

Regression source: `packages/wallet/test/evm-terms.test.mjs`, `packages/wallet/test/evm-agreement.test.mjs`, `packages/wallet/test/g16-bilateral-replay.test.mjs`.

### F04 — Basic EVM escrow and financial invariants

Source: `contracts/evm/src/BasicEscrow.sol`.

Regression source: `contracts/evm/test/BasicEscrow.t.sol`, `contracts/evm/test/BasicEscrowFuzz.t.sol`, `contracts/evm/test/BasicEscrowInvariant.t.sol`.

### F05 — Failed payout and deferred withdrawal recovery

Source: `contracts/evm/src/BasicEscrow.sol`, `scripts/recovery/evm-recovery.mjs`.

Regression source: `packages/wallet/test/recovery-erc20-withdraw-boundary.test.mjs`, `packages/wallet/test/recovery-withdrawal-boundary.test.mjs`.

### F06 — Offer creation, discovery, expiration and stale-event defense

Source: `packages/relay/src/ad.ts`, `packages/relay/src/advertisement.ts`, `apps/web/src/localnet/controller.ts`.

Regression source: `packages/relay/test/ad.test.mjs`, `packages/relay/test/advertisement.test.mjs`, `packages/exchange/test/async-boundaries.test.mjs`.

### F07 — Bilateral negotiation, cancellation and replay resistance

Source: `packages/exchange/src/exchange.ts`, `packages/exchange/src/peer-acceptance.ts`.

Regression source: `packages/exchange/test/peer-acceptance.test.mjs`, `packages/exchange/test/redteam-exchange.test.mjs`, `packages/exchange/test/redteam-pass2-exchange.test.mjs`.

### F08 — Nostr event verification, relay transport and interop

Source: `packages/nostr-crypto/src/relay-event-crypto.ts`, `packages/relay/src/pool.ts`, `scripts/lib/nostr-relay-fixture.mjs`.

Regression source: `packages/relay/test/pool.test.mjs`, `packages/relay/test/pool-lifetime.test.mjs`, `scripts/tests/nostr-relay-native.test.mjs`.

### F09 — Encrypted trade messaging and durable history

Source: `packages/messaging/src/envelope.ts`, `apps/web/src/localnet/controller.ts`.

Regression source: `packages/messaging/test/envelope.test.mjs`, `packages/messaging/test/durable-chat.test.mjs`.

### F10 — Wallet connection, network identity and prompt/session safety

Source: `packages/wallet/src/evm-adapter.ts`, `packages/wallet/src/evm-peer-acceptance.ts`, `packages/chain-solana/src/wallet.ts`.

Regression source: `packages/wallet/test/evm-adapter.test.mjs`, `packages/wallet/test/evm-peer-session.test.mjs`, `packages/chain-solana/test/wallet.test.mjs`.

### F11 — Durable send marker, concurrency and unknown-broadcast recovery

Source: `packages/domain/src/intent-journal.ts`, `packages/domain/src/tx-lifecycle.ts`, `packages/wallet/src/evm-execution.ts`.

Regression source: `packages/domain/test/intent-journal.test.mjs`, `packages/domain/test/tx-lifecycle.test.mjs`, `packages/wallet/test/evm-execution.test.mjs`.

### F12 — Native EVM browser trade flow

Source: `apps/web/src/localnet/LocalnetRoot.tsx`, `apps/web/src/localnet/controller.ts`, `apps/web/src/localnet/wallet-bridge.ts`.

Regression source: `apps/web/test/localnet-boundary.test.mjs`, `apps/web/test/localnet-ui-restore.test.mjs`, `scripts/test-localnet-browser.mjs`.

### F13 — ERC-20 browser approval, settlement and recovery

Source: `apps/web/src/localnet/erc20-funding.ts`, `apps/web/src/localnet/controller.ts`.

Regression source: `apps/web/test/localnet-erc20-funding.test.mjs`, `scripts/test-localnet-erc20-independent.mjs`, `scripts/test-localnet-erc20-browser.mjs`.

### F14 — Interrupted unfunded trade resumption

Source: `packages/exchange/src/checkpoint.ts`, `apps/web/src/localnet/controller.ts`.

Regression source: `apps/web/test/localnet-resumption.test.mjs`, `apps/web/test/localnet-resumption-ui.test.mjs`.

### F15 — Solana native/SPL escrow client and durable recovery

Source: `packages/chain-solana/src/compose.ts`, `packages/chain-solana/src/vaultjournal.ts`, `contracts/solana/programs/basic-escrow/src/lib.rs`.

Regression source: `packages/chain-solana/test/settlement.test.mjs`, `packages/chain-solana/test/lifecycle.test.mjs`, `packages/chain-solana/test/vaultjournal.test.mjs`.

### F16 — Solana funded-exit browser composition

Source: `packages/chain-solana/src/compose.ts`.

Regression source: `packages/chain-solana/test/recovery.test.mjs`, `packages/chain-solana/test/independent-vault-dispatch.test.mjs`.

### F17 — Public QR codec and renderer

Source: `packages/qr/src/text-codec.ts`, `packages/qr/src/jcs.ts`, `packages/qr/src/qr-matrix.ts`.

Regression source: `packages/qr/test/codec.test.mjs`, `packages/qr/test/jcs.test.mjs`, `packages/qr/test/qr-matrix.test.mjs`.

### F18 — Public QR image/camera capture and review UI

Source: `packages/qr/index.ts`.

Regression source: `packages/qr/test/envelope.test.mjs`.

### F19 — Localization and accessibility

Source: `apps/web/src/ui/locale/runtime.ts`, `apps/web/src/ui/locale/catalog.ts`.

Regression source: `apps/web/test/locale-runtime.test.mjs`, `apps/web/test/locale-catalog.test.mjs`, `scripts/test-locale-layout-browser.mjs`.

### F20 — Privacy controls, origin policy and private-data isolation

Source: `packages/transport/src/http-driver.ts`, `packages/security/src/content-policy.ts`, `scripts/check-import-boundaries.mjs`.

Regression source: `packages/transport/test/http-driver.test.mjs`, `apps/web/test/content-policy.test.mjs`, `scripts/tests/import-boundaries.test.mjs`.

### F21 — Dispute/jury arbitration

Source: `contracts/evm/src/BasicEscrow.sol`.

Regression source: No core test source establishes this optional/missing capability.

### F22 — Meetup/geofencing, courier and advanced privacy modules

Source: `docs/adr/ACCEPTED-DECISIONS-2026-11-04.md`.

Regression source: No core test source establishes this optional/missing capability.

### F23 — zkTLS/payment proof adapters and private reputation

Source: `docs/adr/ACCEPTED-DECISIONS-2026-11-04.md`.

Regression source: No core test source establishes this optional/missing capability.

### F24 — Signed asset-update controller and browser update UI

Source: `packages/security/src/release-manifest.ts`, `packages/security/src/release-locator.ts`.

Regression source: `packages/security/test/release-manifest.test.mjs`, `packages/security/test/release-locator.test.mjs`.

### F25 — Lab/docs tooling, claims and historical evidence

Source: `scripts/spec_audit.py`, `docs/execution/CONSOLIDATION-RESULT-2026-11-18.md`.

Regression source: `scripts/tests/test_spec_audit.py`.

### F26 — Duplicate historical regression stack

Source: `packages/domain/test/intent-journal.test.mjs`, `packages/wallet/test/evm-execution.test.mjs`.

Regression source: `packages/domain/test/intent-journal.test.mjs`, `packages/wallet/test/evm-execution.test.mjs`.

### F27 — Production release and live-funds qualification

Source: `apps/web/scripts/build.mjs`, `docs/recovery/OWNER-TESTNET-RELEASE-RUNBOOK.md`.

Regression source: `apps/web/scripts/artifact-policy.test.mjs`, `scripts/tests/verify-web-artifact.test.mjs`.

## Original inventory integration order (historical)

1. Bound retained review reads (#187) and repair readiness publication (#181).
2. Integrate isolated QR core guards (#171/#172), then repair/qualify public QR capture (#183).
3. Qualify Solana funded-exit browser recovery (#179) without claiming full Solana trading UI.
4. Integrate repaired lab/docs tooling (#174), preserve old evidence (#176), and reconcile current status text.
5. Revisit remaining historical asset-update/personalization/journey deltas selectively; keep independent optional packages out of default runtime.

The integration order above is the inventory worker's original recommendation. Completed work and the current queue are in the staging overlay and consolidation handoff. No branch, release setting or deployment was changed by the inventory worker.
