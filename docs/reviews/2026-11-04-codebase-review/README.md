# Independent security and correctness review — 2026-11-04

## Decision and scope

**Eight new confirmed findings warrant repair: one P1, five P2 and two P3.** The most urgent is an application gate that prevents a willing seller from releasing escrow during the final 15 minutes before expiry, contrary to the repository's explicit settlement rule. The other findings concern transaction rejection recovery, deferred-payout visibility, relay delivery, ordinary compressed HTTP responses, negotiation retry, optional update-store retry and a dormant courier consent helper.

These are **repair priorities within the code's actual reachability**, not CVSS scores or claims of deployed exploitation. Four findings affect the explicitly gated LOCALPROOF journey; two concern reusable transport/relay components; the two P3 findings concern optional components. No new direct escrow-custody bypass, vault decryption bypass, key disclosure or unauthorized retention deletion was confirmed. That bounded finding does not establish production safety.

**Recommendation:** keep production economic activation gated. Repair the confirmed integration defects, finish the already-owned fixes, obtain passing evidence on the resulting exact commit, and demonstrate the missing independent-client acceptance flow before release qualification. Existing component models and local test success do not establish a complete production product.

Reviewed repository: [djshellshoxxx/p2p-offramp](https://github.com/djshellshoxxx/p2p-offramp).

| Source | Identity |
|---|---|
| Main comparison | e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa |
| Candidate implementation | PR #26, autonomous/completion-20261102 |
| Reviewed candidate commit | 94554ecf9854e4604f9f56afe5bebedeee931994 |
| Source identity | 653 initially available repository files matched the candidate Git blob hashes; no differing blob and no missing app/package/contract/script source |
| Method | Four parallel review scopes, root synthesis and independent cross-review of settlement/recovery findings |
| Local execution | 585 existing dependency-free tests passed across 50 files; a reviewer separately ran one existing lifecycle rejection test |
| Review artifacts | [findings.json](findings.json), [verification.json](verification.json), [remaining-work.json](remaining-work.json), [local-tests.log](local-tests.log) |

The local snapshot's import commit is different from the remote source identity; all findings and links above use the remote candidate commit. Main and PR #26 were refreshed and remained at these commits at 2026-11-04 02:18:55 UTC. The local snapshot initially omitted many documentation/evidence files. Those omissions are **not** missing implementation in the remote repository; relevant additional specifications and ledgers were fetched at the reviewed commit.

The review concentrated on complete first-party runtime source inventory plus targeted deep caller tracing, relevant tests/specifications and current CI evidence. It does not claim every historical document, third-party primitive, device or deployed artifact was audited. No exploit demonstration, live transaction or deployment was performed.

## Findings at a glance

| ID | Priority | Finding | Present reachability |
|---|---|---|---|
| F01 | P1 | Payment-guidance cutoff prevents otherwise valid seller release | LOCALPROOF journey |
| F02 | P2 | Transaction-send denial leaves the journey reconciling an unsent transaction | LOCALPROOF journey |
| F03 | P2 | Receipt omits deferred payout credit and recovery | LOCALPROOF; conditional recipient/asset payout behavior |
| F04 | P2 | Pool-wide relay deduplication suppresses other valid subscribers | Exported relay/shared-observer composition; inherited behavior |
| F05 | P2 | HTTP readers compare decoded bytes with encoded Content-Length | Generic transport and explicitly enabled updater |
| F06 | P2 | Relay failure leaves negotiation without a useful retry path | LOCALPROOF negotiation |
| F07 | P3 | Failed update-store opening remains cached | Optional update-store instance |
| F08 | P3 | Route-field helper accepts incomplete required consent | Dormant courier reference model |

P1 means repair before economic activation; P2 means meaningful correctness, availability or recovery work; P3 reflects limited present reachability or lower impact. All eight are confirmed through static control flow and source/specification comparison. Existing test execution is supporting evidence, not a reproduction of these bugs.

## F01 — Payment-instruction cutoff prevents valid seller release

**Priority: P1. Confidence: high. Scope: LOCALPROOF application flow.**

The canonical escrow permits the seller to release while chain time is strictly before its immutable deadline. The application's payment guidance deliberately stops when 900 seconds or less remain. However, release signing readiness, the screen controls and the controller all depend on that same guidance decision.

This joins two different decisions: whether it is prudent to show instructions for initiating a fiat payment, and whether a seller who has already received payment can finish a still-valid on-chain release. The result is a deterministic 15-minute interval in which this journey prevents a cooperative seller from completing settlement.

Evidence:

- [packages/wallet/src/evm-payment-preflight.ts:188–194](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-payment-preflight.ts#L188-L194) applies the 900-second guidance cutoff.
- [apps/web/src/journey/private-trade.ts:76–78](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/journey/private-trade.ts#L76-L78) restricts release review readiness to payment coordination.
- [apps/web/src/journey/private-trade.ts:343–345](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/journey/private-trade.ts#L343-L345) requires a fresh allow-guidance result to release.
- [apps/web/src/journey/screen.ts:44–63](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/journey/screen.ts#L44-L63) repeats the guidance requirement in controls and confirmation.
- [contracts/evm/src/BasicEscrow.sol:221–231](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/contracts/evm/src/BasicEscrow.sol#L221-L231) permits seller release until actual expiry.
- [G18 section 4](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.3_basic_settlement/spec-escrow-deadline-preflight.md) explicitly preserves seller release before expiry through independent fresh preflight while payment instructions are hidden.

**Repair:** separate the two eligibility decisions across all three application layers. A seller's explicit release must still verify the original trade binding, live account/network, deployed code, funded state and current deadline. Preserve fiat-receipt attestation and signing review. Keep payment instructions hidden in the buffer.

**Acceptance:** distinguish 901 seconds, 900 seconds, 899 seconds and actual expiry. Before expiry, explicit release should remain available after independent fresh preflight; at expiry it must be refused and the original refund rules preserved. Cover screen, confirmation and Worker/controller together. A controller-only change leaves other gates broken.

This is a release-readiness defect in a gated flow, not evidence of an already exploited deployed escrow.

## F02 — Transaction-send rejection strands the current journey

**Priority: P2. Confidence: high. Scope: LOCALPROOF approval, funding, release and refund.**

The lower transaction lifecycle recognizes a normal provider rejection, records the attempt as failed with no transaction hash, and retains live proof of local cancellation. The application nevertheless moves to an approval-reconcile, reconcile or settling phase. Reconciliation then requests native observation before honoring that local result. There is no transaction to observe.

Evidence:

- [packages/domain/src/tx-lifecycle.ts:306–310](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/domain/src/tx-lifecycle.ts#L306-L310) handles provider code 4001.
- [packages/domain/src/tx-lifecycle.ts:335–336](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/domain/src/tx-lifecycle.ts#L335-L336) has the live-cancellation recognition.
- [apps/web/src/journey/private-trade.ts:326–345](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/journey/private-trade.ts#L326-L345) leaves the corresponding application phases on reconciliation paths.
- [packages/domain/src/intent-journal.ts:286–294](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/domain/src/intent-journal.ts#L286-L294) invokes native observation without a live-terminal shortcut.
- [apps/web/src/journey/private-trade.ts:191–198](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/journey/private-trade.ts#L191-L198) attempts to locate the hashless transaction.

[EIP-1193](https://eips.ethereum.org/EIPS/eip-1193#provider-errors) defines 4001 as a user-rejected request. The project's live lifecycle supplies the cancellation qualification; arbitrary restored error labels are not evidence that submission never happened.

**Impact:** an ordinary denial blocks normal preparation in the current journey. Repeating observation cannot manufacture the missing transaction. For release/refund, this interrupts an exit from an already funded trade. This is not a claim that every signing rejection permanently locks funds: initial terms-signing rejection has a different recoverable path, and reopening/recovery may offer another route.

**Repair:** add an explicit controller transition for locally proven transaction-send cancellation, returning to the appropriate explicit review state. Calling lifecycle reconciliation first alone is insufficient: its non-finalized failed outcome currently would still leave the journey phase unchanged. Preserve separate handling for unknown broadcasts, timeouts, lost responses, lock races and imported labels. Never automatically resend.

**Acceptance:** ordinary denial of each of the four sends returns to a useful explicit review; uncertain submission stays conservative; no persisted failed string can authorize a new send. One unchanged lower-layer test passed and confirms the cancellation capability exists. It does not demonstrate that the whole application path is repaired.

## F03 — Escrow outcome omits deferred payout and recovery

**Priority: P2. Confidence: high for missing integration. Scope: conditional LOCALPROOF payout behavior.**

The canonical escrow uses push-then-credit payments. A release/refund can reach its terminal escrow disposition while a failed transfer leaves pending credit owed to the original recipient. The application projects terminal disposition straight into its receipt without showing that credit or a withdrawal route.

Evidence:

- [contracts/evm/src/BasicEscrow.sol:346–360](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/contracts/evm/src/BasicEscrow.sol#L346-L360) records pending credit after unsuccessful push payment.
- [contracts/evm/SECURITY-NOTES.md:38](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/contracts/evm/SECURITY-NOTES.md#L38) explicitly requires clients to surface deferred payout and pending balance.
- [packages/domain/src/journey-view.ts:90–91](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/domain/src/journey-view.ts#L90-L91) projects terminal state to receipt.
- [apps/web/src/journey/private-trade.ts:337–341](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/journey/private-trade.ts#L337-L341) constructs the receipt without payout-credit status.
- Existing seams include [packages/wallet/src/evm-escrow.ts:135–155](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-escrow.ts#L135-L155) and [scripts/recovery/evm-recovery.mjs:111–147](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/recovery/evm-recovery.mjs#L111-L147).
- [apps/web/src/retention/native-retention.ts:103–117](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/retention/native-retention.ts#L103-L117) already protects evidence while credit remains unpaid.

The receipt accurately labels its field “Escrow outcome”; it does not explicitly claim delivery completed. The defect is missing delivery status and recovery integration. The normal fixture uses development accounts and a plain test token, so a deferred payout is conditional on recipient/asset behavior and was not induced during this review.

**Repair:** display escrow disposition separately from actual payment/credit status, read it at the same verified canonical anchor, and offer explicit withdrawal to the fixed original recipient. Anyone may submit the withdrawal transaction, but cannot redirect its destination. Credit aggregates by recipient and asset; do not attribute an entire aggregate to one trade. A permanently rejecting recipient cannot be promised successful recovery.

**Acceptance:** distinguish a completed push from existing deferred-credit fixtures, show the correct amount/recipient and recovery route, update only after fresh withdrawal evidence, and retain the existing payout-closure deletion guard.

## F04 — Global relay deduplication drops another subscriber's event

**Priority: P2. Confidence: high. Scope: shared RelayPool consumers; inherited from main.**

The pool maintains an event-ID cache shared by all subscriptions, but a valid incoming event is delivered only to the subscription identified in its frame. Once the first subscription records the ID, another legitimate matching subscription is dropped before delivery.

This matters in the actual native-context composition: two different order observers for the same maker both subscribe to that maker's deletion events and then discard unrelated orders locally. The observer for one order can consume the cache entry for the other order's deletion.

Evidence: [packages/relay/src/pool.ts:212–225](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/relay/src/pool.ts#L212-L225) and [apps/web/src/context-adapters/observations.ts:74–82](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/context-adapters/observations.ts#L74-L82). The same global-dedup behavior is present on the reviewed main branch.

**Impact:** stale discovery hints or missed history for an otherwise legitimate subscriber. These events do not grant settlement authority. No default application constructor for this shared pool was found, which narrows current reachability without making the exported behavior correct.

**Repair:** separate bounded signature-validation caching from per-subscription delivery tracking, or distribute a validated event to every matching subscription. Maintain signature checks, filter checks and memory limits.

**Acceptance:** two different orders from one maker both receive their relevant deletion events; duplicates for the same subscriber across relays remain suppressed; new/reopened consumers receive requested history. A test with only one subscriber cannot cover this composition.

## F05 — Encoded Content-Length is compared with decoded body bytes

**Priority: P2. Confidence: high, supported by the Fetch standard. Scope: two reusable readers.**

Both HTTP readers count the bytes yielded by Response.body and require exact equality to the response's Content-Length header:

- [packages/transport/src/http-driver.ts:60–74](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/transport/src/http-driver.ts#L60-L74).
- [packages/security/src/release-update-http.ts:44–60](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/security/src/release-update-http.ts#L44-L60).

The [WHATWG Fetch standard](https://fetch.spec.whatwg.org/#http-network-fetch) specifies content decoding before bytes reach the consumer and explicitly notes that Content-Length becomes unreliable for decoded progress accounting. A normal compressed response can therefore fail these checks despite valid authenticated content within its decoded size cap.

**Impact:** honest compressed gateways/endpoints can fail. The generic reader's behavior is inherited from main; the update reader adds the same assumption in the candidate. Update authority remains unconfigured in the default build, and no default generic-driver consumer was established. This is availability/compatibility failure, not signature bypass.

**Repair:** cap the actual decoded stream, retain read-error and cancellation handling, and validate artifacts using authenticated manifest size/digest and signatures. Treat encoded transport length as a separate fact. Do not remove resource bounds. A header-only Content-Encoding conditional may be insufficient when cross-origin exposure hides that header.

**Acceptance:** ordinary compressed fixtures with correct decoded content succeed; oversized decoded bodies, failed streams and invalid digests/signatures remain refused. Existing tests that invent a header/body mismatch exercise the current assumption rather than browser decoding.

## F06 — Negotiation cannot recover cleanly from ordinary relay failure

**Priority: P2. Confidence: high. Scope: LOCALPROOF offer/take/accept before native funding.**

The controller ingests a local advertisement and advances exchange state before publication finishes. Its delivery helper does not retain the exact outgoing signed message as a resumable checkpoint. After failure, the visible phase still invites an earlier operation, but repeating that operation may conflict with the already ingested advertisement or hit an out-of-order exchange transition.

Evidence: [apps/web/src/journey/private-trade.ts:150](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/journey/private-trade.ts#L150), [apps/web/src/journey/private-trade.ts:301–316](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/journey/private-trade.ts#L301-L316) and [packages/exchange/src/exchange.ts:214–271](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/exchange/src/exchange.ts#L214-L271).

**Impact:** an ordinary transport interruption can stop the negotiation's useful retry path. This is separate from transaction-send cancellation and the already-owned prepared-approval recovery patch.

**Repair:** store the exact prepared advertisement/message and model delivery status separately from exchange state. Provide explicit resend/resume of the same signed event. Unknown publication is not proof that no peer received it, so rolling back communication state or silently regenerating content is inappropriate.

**Acceptance:** after an ordinary failed publication, a later explicit retry resumes the same session and exact event without reapplying the transition. Handle uncertain delivery conservatively. Never extend this communication retry into automatic economic resubmission.

## F07 — A failed update-store open is cached permanently for the instance

**Priority: P3. Confidence: high. Scope: optional update store.**

[packages/security/src/release-update-store.ts:21–27](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/security/src/release-update-store.ts#L21-L27) caches its database-opening promise. Failure rejects the promise but never clears the field, so all later calls on the same store reuse the rejection even after the underlying storage condition clears.

**Impact:** a transient initial IndexedDB problem becomes an instance-lifetime availability failure. A fresh store instance recovers; recreating only the controller while retaining the same store does not. The default UI does not construct this store. No rollback-floor loss, rollback bypass or vault compromise was established.

**Repair:** clear the cached field on rejection only if it still identifies that opening attempt. Preserve late-result close behavior and explicit terminal close. The encrypted vault store's [packages/storage/src/idb-vault-store.ts:103–107](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/storage/src/idb-vault-store.ts#L103-L107) already illustrates the guarded reset.

**Acceptance:** first-open failure followed by a successful retry on the same store; old late results cannot replace/clear a new attempt; explicit close remains terminal. Native IndexedDB browser fixtures already exist in [scripts/fixtures/release-update-browser.ts:44–60](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/fixtures/release-update-browser.ts#L44-L60); the missing coverage is specifically failure followed by retry.

## F08 — Courier field authorization drops required consent completeness

**Priority: P3 at present exposure. Confidence: high. Scope: dormant optional reference helper.**

The courier verifier accepts attributed one-sided claims when at least one but not every signer required by the selected policy is confirmed. Preserving such claims is useful. However, route-field authorization subsequently accepts the opaque evidence without checking that the disclosure policy's entire required signer set is satisfied.

Evidence:

- [packages/courier/src/verification.ts:256–264](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/courier/src/verification.ts#L256-L264) obtains the required signer policy.
- [packages/courier/src/verification.ts:303–322](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/courier/src/verification.ts#L303-L322) preserves incomplete evidence as a one-sided claim.
- [packages/courier/src/custody.ts:498–517](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/courier/src/custody.ts#L498-L517) returns permitted field names without checking completeness.
- [CIT-06 section 4](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.2_courier_assignment/module_3.2.1_route_segmentation/spec-route-information-access-control.md) requires endpoint consent.
- [packages/courier/test/custody.test.mjs:291–327](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/courier/test/custody.test.mjs#L291-L327) covers a single required signer rather than incomplete multi-endpoint consent.

**Impact:** a selected multi-endpoint policy can yield an over-permissive advisory field-name projection. The helper returns no coordinates, contact values, secrets, send permit or monetary authority. Caller search found declaration/export/tests only. No live route disclosure was demonstrated.

**Repair:** retain authenticated signer completeness in the private proof and require the selected policy at the disclosure boundary. Preserve one-sided evidence for attributed-claim recording. If policies become per-field, explicitly bind each field to its required endpoint consent.

**Acceptance:** complete consent permits only matching fields; incomplete required consent returns unauthorized/consent-required; attributed one-sided evidence remains retainable; revoked, expired and wrong-verifier grants remain refused.

## Existing issues kept separate from new findings

Two defects already have review comments and an active repair owner. A third item is a failing test gate. They are not included in the eight new findings.

| Item | Evidence and disposition |
|---|---|
| K01 — prepared, never-sent approval recovery | PR #26 [review comment](https://github.com/djshellshoxxx/p2p-offramp/pull/26#discussion_r4446732417). Watch/recovery selection preserves prepared funding but misses the analogous approval, potentially ending at RECOVERY_SELECTION_REQUIRED. Pending repair addresses selection near the watch path, not F02's transaction rejection phase. |
| K02 — draft cancellation signal dropped | PR #26 [review comment](https://github.com/djshellshoxxx/p2p-offramp/pull/26#discussion_r4446732429); [apps/web/src/app-services.ts:137–138](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/app-services.ts#L137-L138). The adapter accepts but does not forward AbortSignal to commitTradeDraftChange, allowing work to commit after the caller cancels. Pending repair is owned elsewhere. |
| K03 — browser listener assertion assumes no legitimate application listeners | [scripts/test-locale-layout-browser.mjs:176–226](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/test-locale-layout-browser.mjs#L176-L226). The fixture counts all visibility/pageshow listeners and assumes absolute totals [1,1]/[0,0]. The current application legitimately has listeners in main, screen counts and PrivacyStatusPanel. CI sees [2,3] versus [1,1]. This evidence does not establish a listener leak. Validate Settings-owned listener identities/deltas against the application baseline and preserve leak-detection controls. |

No production source was changed by this review. These pending fixes still require exact-commit verification; inspecting a working diff is not proof of a merged or passing result.

## Missing implementation and release qualification

The candidate [CURRENT-REMAINDER ledger](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json) records 103 canonical work records: 76 LOCAL_SCOPE_COMPLETE, 25 EXACT_CONTRACT_OR_TOOLING_REMAINDER and 2 EXTERNAL_OR_TOOLING_QUALIFICATION. It references 173 specifications and 8,281 original clauses. These are organizational records, not a product-completion percentage. “Local complete” retains qualifications and does not override the new caller-level findings.

[remaining-work.json](remaining-work.json) preserves the 27 non-local-complete records and their stated next actions. The principal gaps are:

| Area | What exists | What is still required |
|---|---|---|
| Independent peer acceptance | Reviewed terms, signing primitives and a local test journey | Versioned non-text wallet-signature carrier binding account/role, messaging key, trade, expiry and replay rules; actual independent two-client acceptance |
| Extension terms | Empty/core capability negotiation and registry structures | Exact G14-to-G16 nonempty mapping, canonical commitment preimage, version and mixed-client profile |
| Production release trust | Signature/manifest/locator validators and optional update controller | Real bootstrap trust, predecessor/recovery/rotation/revocation/threshold rules, deployment/asset schemas and archive extraction/retention profile |
| Solana/SPL | Planning and profile work | Native program/PDA/account/IDL/instruction/finality and token/wallet/recovery semantics |
| Mobile wallet return and QR | Recovery references/manual import and adapters | Real return URI/session checkpoint/fresh authority; authenticated type-specific QR encoding, segmentation, expiry/replay and scan/import composition |
| Proof and reputation | Structural proof parsers, Worker resource boundaries and evaluation models | Reviewed provider/circuit/verifier/witness/rail semantics; issuer/root/revocation/scoring/nullifier identity and actual application integration |
| Meetup | Local policy/venue/RTC/consent models | Native location/transport truth, distance-proof binding, exact DTO/hash profile, map storage/publisher/license/renderer composition |
| Courier | Accounting, custody/recovery, secret and locker reference models | Device transport/authentication/clock/vendor profiles, durable command/replay/reconciliation, separate native fee/stake custody and withdrawals |
| Arbitration | Clock, draw, vote, tally, appeal and accounting models | Separately opted-in custody ABI, case/certificate authority, exact VRF/coordinator and native enforcement |
| Liquidity | Reservation/accounting models | Signed quote/domain/native trade binding, atomic reserve consumption plus escrow funding, native refund/credit/finality/reorg integration |
| Stealth/privacy transports | Math/viewing or passive intake components | External-wallet spend-key/import/signing and funding binding; coherent reviewed XMTP SDK/WASM/source profile, selected Tor/shielded/CoinJoin providers |
| Full-profile deletion and sweep | Record retention and reminder models | Whole-profile export/recovery semantics; independent wallet-transfer intent/execution |
| Release evidence | Extensive local tests, ledgers and some formal artifacts | Independent review, actual browser/device qualification, translated safety-copy review and exact production artifacts/trust/deployment evidence |

The LOCALPROOF acceptance helper can use development wallets locally; it does not establish a real remote peer signature protocol. Optional packages are expressly non-authoritative and do not enable base-escrow spending. Their missing native profiles should remain activation gates instead of being filled with invented assumptions.

Formal evidence also needs careful labels: constructor-specific proof results do not prove the whole contract. Recorded partition and whole-target outcomes include UNKNOWN/timeouts. These remain unqualified targets, not passing results.

## Verification and current CI

### Work executed for this review

The root executed 50 unchanged, dependency-free test files using Node 24.22.1 native TypeScript stripping:

**585 passed; 0 failed; 0 cancelled; 0 skipped; 0 todo.**

The exact command/file list and the test-log digest are in [verification.json](verification.json), with full output in [local-tests.log](local-tests.log). The log records 18,962.259029 ms. Covered suites include schemas, security primitives, storage/backup/migration/retention, personalization, claims/extensions/governance records, meetup data/RTC, courier, liquidity and privacy controls.

A reviewer separately ran one unchanged transaction-lifecycle rejection test: **1 passed, 0 failed, 0 skipped**. It validates the lower lifecycle's intended cancellation behavior. It was not a whole-journey defect reproduction.

The exact dependency install could not complete from the available cache: npm ci with offline, ignore-scripts, no-audit and no-fund returned ENOTCACHED for Vite 8.3.5. Consequently this review did not independently rerun the full npm suite/build, browser journeys, Foundry, fuzzing, formal proof targets or a fresh registry dependency audit. No substitute package versions were used to claim exact-build evidence.

### Remote checks at the reviewed candidate SHA

| Check | Observed result | Meaning |
|---|---|---|
| Foundry/forge | Success | Remote exact-SHA contract job passed |
| local-evm and local-trade | Success | Remote native/local journey jobs passed |
| schemas-and-crypto; specs/inventory | Success | Their configured suites passed |
| CodeQL | Success | Current configured scan reports no new alerts |
| Snyk commit status | Success; one security test passed | Status-level evidence only; no fresh local dependency audit |
| Browser | Failure in locale layout fixture | Later browser steps were skipped |
| SonarCloud | Failure; Security D and Reliability D against required A | A failed gate; detailed findings were unavailable to this review |
| CodeRabbit | Skipped due to the change's file-count limit | No review approval can be inferred |

The [browser job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/41509786546/job/125498335961) fails on “one resume listener per event” at the locale fixture: actual [2,3], expected [1,1]. Earlier browser/private/locator/chat/diagnostics/recovery steps pass. **Eight subsequent steps are skipped:** portal, journey origins, distribution, proof browser, proof memory, privacy controls, meetup and updates. A preceding pass or an older summary cannot replace those missing current-job results.

Sonar's grade is a reason to inspect and resolve the actual diagnostics, not evidence for an invented exploit count. Its check-run annotations endpoint was unavailable through the connector, so this review does not claim to have adjudicated those individual findings.

Repository configuration read at review time reports main as unprotected and an empty ruleset list. This is a separate integration-control concern: required passing checks and approval should be enforced before economic releases. No repository setting was changed.

## Dependencies, compiler and positive security observations

The root [lockfile](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/package-lock.json) contains 72 package entries excluding the root, all with integrity metadata and registry.npmjs.org resolution. Production entries are React/React DOM 19.3.1, scheduler 0.28.0 and noble ciphers/curves/hashes 2.4.0. Vite is pinned to 8.3.5. CI actions are commit-pinned and the reviewed workflow uses restricted content permissions and ignore-scripts installation. These are useful controls, not a substitute for build provenance.

Current primary-source advisory checks did not establish an affected dependency finding from those pins:

- The inspected October Vite advisories [GHSA-rq7h-c2jc-7f22](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22), [GHSA-9jrq-w75r-8gcw](https://github.com/vitejs/vite/security/advisories/GHSA-9jrq-w75r-8gcw) and [GHSA-vfpm-58rq-9qcg](https://github.com/vitejs/vite/security/advisories/GHSA-vfpm-58rq-9qcg) list fixes in 8.3.3; 8.3.5 lies beyond those affected ranges.
- The official [React Server Components advisory](https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components) concerns server-component packages absent from this client-side lockfile. Merely using React does not establish that vulnerability.
- Noble support/changelog references were checked for the pinned 2.4.0 line. No independent audit of those primitive implementations was performed.

Canonical Foundry uses Solidity 0.8.30, optimizer enabled, via_ir false and Cancun. The isolated npm escrow harness uses 0.8.38, IR and Shanghai. These artifacts have different ABI/authorization/payout behavior; their evidence is not interchangeable. The [official Solidity known-bugs list](https://docs.soliditylang.org/en/latest/bugs.html) contains later fixes. No contract-specific miscompilation was established; some advisories are IR-specific while others require exact generated-code disposition. Any compiler change must regenerate bytecode identities and requalify relevant tests/proofs.

Static tracing found meaningful safeguards in the inspected first-party code:

- Canonical [contracts/evm/src/BasicEscrow.sol](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/contracts/evm/src/BasicEscrow.sol) has seller-bound funding/release, fixed-recipient refund/withdraw, checked state transitions, reuse guards and reentrancy protection.
- [packages/storage/src/vault-crypto.ts](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/storage/src/vault-crypto.ts) binds profile, key identity and revision through authenticated data; [packages/storage/src/idb-vault-store.ts](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/storage/src/idb-vault-store.ts) performs compare-and-swap/reseal checks in the write transaction.
- [packages/identity/src/identity-service.ts](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/identity/src/identity-service.ts) requires explicit restored-identity adoption and original-key verification; retaining original metadata in a byte-preserving backup is not an identity bypass.
- [packages/storage/src/retention-service.ts](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/storage/src/retention-service.ts) uses fresh exact-scope native proof, payout closure, revision-bound consent and guarded commit; imported terminal labels and timestamps alone do not authorize deletion.
- [apps/web/src/runtime/app-runtime.ts](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/runtime/app-runtime.ts) and its Worker endpoint bind work to generations and lifecycle ownership; cancellation after completed persistence does not pretend the durable write was rolled back.
- Unsupported proof providers, missing update trust and optional model authority remain disabled instead of being inferred from untrusted input.

No new critical custody or key-extraction finding emerged in those inspected paths. Remaining limitations include browser-engine behavior, real wallet/device integrations, complete deployment provenance, third-party internals and production network/chain conditions.

## Remediation sequence

1. **Repair the active core journey.** Fix F01 across readiness/controller/UI, then F02, F03 and F06. Integrate the existing K01/K02 repairs through their owner. Keep explicit review and no-automatic-economic-resend semantics.
2. **Repair reusable component behavior.** Fix F04's subscription delivery and F05's content-decoding accounting. Add focused ordinary regression coverage for their actual compositions.
3. **Restore trustworthy current CI.** Correct the listener fixture's ownership assertion, rerun all skipped browser steps on the resulting commit, inspect Sonar diagnostics and obtain independent review within tooling limits.
4. **Finish the real two-client contract.** Specify and implement the exact peer acceptance carrier and test the full path with two independent clients/wallets, recovery, denial and interrupted transport under the selected testnet profile.
5. **Close production qualification.** Pin trust/deployment/token/compiler artifacts and required evidence, enforce branch review/checks and obtain independent security review before economic activation.
6. **Repair and then qualify optional paths.** Fix F07/F08 and close each optional module's own native/provider/device contracts before enabling it. Keep those additions from obscuring core settlement recovery.

Each fix should close its stated acceptance criteria and preserve existing safety boundaries. A passing component suite alone should not mark a caller-level integration defect resolved.

