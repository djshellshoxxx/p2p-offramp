# Execute all remaining repository work

You are the lead engineering coordinator for `djshellshoxxx/p2p-offramp`. Execute this prompt when it is explicitly invoked. Complete as much remaining, specified engineering as can be completed autonomously, coordinate implementation and independent review, consolidate the results, and deliver a precise account of anything still blocked. Do not stop after writing a plan or completing the first tranche. Do not claim the entire product is finished while any implementation, protocol, acceptance, operational or release requirement remains open.

This prompt is being executed in the 2026-11-02 continuation. Its starting-point
discussion below preserves the original PR24 snapshot. Read the current task
ledger and scoped review receipts before choosing work: T33 onward now contains
implemented slices and active follow-on tasks through T73. Neither this historical
snapshot nor an old coverage status reopens accepted work. Current unmerged source,
pending reviews and final delivery remain the lead agent's responsibility.

## 1. Establish the actual starting point

Read applicable repository instruction files **if present**, managed runtime/network instructions, `DEVELOPMENT_ROADMAP.md`, `tasks/plan.md`, `tasks/todo.md`, and:

- `docs/execution/JOURNEY-AUDIT-2026-11-01.md` and its scoped review receipts;
- `docs/execution/GUIDANCE-REMAINING-2026-11-01.md`;
- earlier audit/inventory records where needed to establish existing behavior;
- `docs/DEVELOPMENT_STATUS.md`, `docs/SPEC_READINESS.md`, `docs/LOCAL_DEVELOPMENT_AND_RELEASE_GATES.md` and the actual specification catalog;
- all technical specifications in Sections 00–05, G01–G34, and the seven product-completion specifications under `feature_0.12_product_completion`.

This prompt was prepared against merged main `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa` (PR #24), whose tested source was `3947074c95fa1e0facd65a8947a2c7e70363c708`. Verify live main, open/closed PRs, branch heads, reviews and checks before relying on that snapshot. Preserve local user work and use an isolated branch/worktree when necessary.

T1–T32 contain completed implementation. T12/T22/T30 source labels such as INTEGRATING are historical pre-merge checkpoints; live PR metadata records actual delivery. Do not redo them because an old roadmap checkbox or development-status paragraph says implementation is pending. Reconcile those documents with source and evidence instead. Start new task IDs after the latest actual ledger ID; T33 is only the expected next ID at this snapshot.

Reuse the vault, migrations, fresh-key recovery, typed English catalog/help, canonical terms/review, Nostr crypto/exchange/durable chat, bounded relay, G08/G12 authority/reconciliation, native G18 gate, extension registry, release verification, diagnostics, acceptance evaluator, recovery builder and native/browser harnesses. G22 already projects terminal receipts and native-gated read-only payment coordination. G23 already has independent indicators, optional real-broker subscriptions, bounded expiry/catch-up and subscription-lease protection. These are partial product integrations, not missing primitives.

Historical verification: 1,091 package/UI tests with zero failures/skips/cancellations, six receipt regressions, 82 Foundry tests, six emitted browser groups, and 12 native exchange/journey checks. These are historical evidence, not automatic results for your new head.

## 2. Non-negotiable boundaries

- Keep trading disabled and real-funds configuration unpromoted until genuine release gates are satisfied. Do not select production trust roots, fabricate approval, use real funds, deploy live custody, provision paid resources, or message external people without separate explicit authorization. Prepare concrete local artifacts and review evidence before requesting any necessary human decision.
- Preserve the client-side architecture: browser-controlled local keys/private records, static distribution, external wallets for spending, and no app-owned runtime server or centralized user-account database. Do not introduce a server merely to simplify a feature.
- Basic manual escrow remains seller-funded; only seller release before expiry pays the bound buyer; timeout refund pays the seller. Preserve dishonest-seller/chargeback warnings. Chat, proofs, local state and receipt-looking JSON never establish fiat irreversibility or new spending authority.
- Preserve encrypted private persistence and fresh-key restore; never add a plaintext-secret convenience mode. Keep NIP-04 disabled for new conversations. Unknown routing remains unknown; strict mode has no silent direct fallback.
- Keep canonical and isolated EVM profiles/ABIs separate. Implement Solana/SPL natively, not through EVM behavior. Optional capabilities must never become dependencies of basic exits or gain authority over existing funded positions.
- Do not invent interoperability, crypto, custody, signature or trust-transition contracts. Resolve internal implementation choices autonomously from applicable contracts; distinguish these from genuinely absent protocol definitions and external approvals.
- Never weaken tests, scanners, boundaries, resource limits, CSP, pins or branch rules to obtain a green result. No skipped/spoofed native checks, automatic economic resubmission or imported reviewer-name approval.

Execution authorizes ordinary local implementation/testing/documentation and normal source branch/PR publication and guarded merge, subject to repository rules. It does not authorize funds enablement, production deployment or the separately restricted actions above.

## 3. Create a complete coverage ledger and coordinated work graph

Inventory **every** technical spec and roadmap milestone, including later optional features. The last audit indexed 173 documents, including 171 technical designs; discover current counts rather than hardcoding them. Add a requirement-level mapping when a spec contains several independently deliverable requirements.

For each requirement record source path/section, current implementation/evidence, remaining acceptance, dependencies, task ID, one accountable owner, exclusive files, reviewer and status. Use READY, IN_PROGRESS, IN_REVIEW, INTEGRATING, DONE or BLOCKED. For BLOCKED, identify the exact missing contract, tooling, predecessor or human/external evidence, the affected scope, resumable next action, and what independent work can proceed. Distinguish implemented engineering from qualified/activated capability. A design document, an empty registry or a fixture is not completion evidence.

Keep `tasks/todo.md` authoritative and interfaces/ownership in `tasks/plan.md`. Use as many coordinated agents as available capacity usefully supports. Give independent slices to different implementers and different reviewers; one active writer per file. Root owns shared facades, schemas/manifests, CI, integration and ledger changes unless explicitly transferred. Freeze dependent interfaces before parallel edits. Do not assign duplicate investigations or whole suites to several agents. Preserve incompatible custodial proposals separately; inspect compatible unmerged proposals and retain or document their unique behavior/history.

Reassess after every tranche, admit further justified unblocked tasks, and continue. Avoid generic wrappers, placeholder UIs, duplicate runners and speculative protocol code that inflate completion without advancing a real integration.

## 4. First priority: late reports and current correctness

Refresh PR #24 and subsequent review reports. At prompt preparation, final CodeRabbit check `124851436905` was **cancelled**, not approved. An outside-diff comment in review `5728043752` reports that `SessionTransportPolicy.inspect()` replaces a channel's earlier inspection deadline with a later observer's deadline, potentially delaying the earlier observer's expiry hint.

Reproduce that report with two observations of the same channel and different valid expiries. Establish the intended evidence-renewal semantics before fixing it; do not accept the suggested patch blindly. If valid, retain the necessary earliest outstanding deadline until expiry/invalidation. Verify display-only expiry does not change permission generations or abort unrelated longer-lived permits. Retain bounded observer catch-up, malformed-read loop protection, disposal, same-object reacquisition and real permit expiry. Independently review and test the repair.

T31 already fixed display-expiry revocation and missed reentrant notifications; T32 already fixed immediate-null fixture receipts with bounded read-only polling. Do not reimplement those fixes or resend transactions. Other suspected fixture timing windows are hypotheses until reproduced. Inspect all current new findings, fix real defects, and retain evidence for false positives or optional dispositions.

## 5. Finish core foundations and the complete MVP

Prioritize M0/M1 and M2A–M2C in roadmap order, while independent safe work can proceed in parallel.

### A. Foundation, authority, recovery and distribution — G01–G15

Reconcile remaining threat-model, dependency/provenance/vector, browser storage/crypto and rendering/transport acceptance against actual source. Preserve existing implementations. Close concrete gaps in key purpose/lifecycle, origin isolation, migrations/downgrade refusal, account/network invalidation, bounded errors/retries, journal reconciliation and recovery. Reconcile stale development/readiness documentation without upgrading unapproved designs to approved status.

Complete real static build/distribution/update integration and its origin-change recovery tests where specified. Preserve old release/deployment/ABI recovery paths. The maintained recovery pin is unset: the approved manifest must authenticate both registry and canonical ABI; a registry-only proof or an arbitrary public-key override is insufficient. Original archived escrow exits must remain possible independently of expiry of a newer release lease.

For G14/G15, distinguish implemented local extension/manifest/locator services from missing capability-to-terms commitments, key rotation/trust-transition, nonempty deployment and archive extraction profiles. Draft precise decision artifacts and missing schemas where definitions are absent; do not silently choose an interoperable wire format or bootstrap authority.

### B. Full browser journey — G10–G12, G16–G23

Complete the actual UI/composition from onboarding and backup through explicit wallet selection, offer browse/create, encrypted negotiation, risk/terms review, funding, uncertain-broadcast reconciliation, finalized matching funding, manual payment coordination, seller release or seller refund, and native receipts.

First define trusted ownership, invalidation, step precedence and allowed actions using existing services. In particular:

- Define a genuine backup/recovery verification fact bound to the appropriate profile, revision and scope. Export/download, profile unlock and restore into another fresh-key destination do not by themselves prove the current backup is verified or current.
- Bind previewed exact terms to the actual authenticated negotiation/acceptance and native trade identity. Offline terms review does not authenticate signatures. Preserve public-chain identities, exact base units, fees separately, deadlines and seller-withholding risk.
- Inspect the actual peer acceptance carrier. Existing `terms-accept` is exactly `{revision}` and is communication-only; it does not deliver the two EOA wallet signatures required by the native agreement verifier. Preserve that wire contract until a separately versioned carrier, role/account/message-key binding, replay/expiry policy and cross-client vectors are defined. A compiled two-wallet native fixture can advance local composition but cannot qualify production peer interoperability.
- Compose explicit wallet permissions, account/network changes, selected approved registry/deployment/asset, visibility-scoped signed offers, native transaction preparation and durable reservations. Do not pull excluded signing/secret-bearing code into the read-only preview by accident.
- Wire fresh native G18 guidance and real G08/G12 unresolved facts. A raw lifecycle journal without its native reader intentionally keeps terminal labels unresolved. Use existing fresh native reconciliation, never drop IDs by persisted labels. Keep uncertain actions in reconciliation, not retry.
- Complete receipt detail, failure/rejection/outage/expiry/reorg branches, original-trade watch/export/recovery, app-switch/reload behavior and privacy-preserving local UI state. No timed wallet prompts or optimistic settlement claims.

Existing Home/Recovery guidance and read-only projection are not reasons to build another redundant preparation panel. Implement substantive integrations. Keep completed actions inert until their release gates genuinely qualify activation.

For G23, integrate actual transport, messaging and proof observations only from real trusted services with scope, source, time, expiry and revocation. The broker path exists; default App supplies none. Provider configuration, a socket, method presence or fixture data cannot establish encrypted-message readiness or protected routing. Preserve independent public-chain/manual-fiat disclosures and no global shield. Signing-time disclosure requires the actual signing composition.

For G19–G21, preserve canonical discovery, reconnect and authenticated durable history. Browser WebSocket callbacks receive already allocated whole messages; the parse cap is not an inbound memory cap. Only a concrete maintained incremental transport/profile can close that gap. Do not invent outbound delivery/cursor/automatic republish semantics that contradict the current explicit-publication contract.

### C. Solana/native and SPL parity — M2B

Inventory missing exact PDA seed bytes, layouts, instruction discriminators, program/IDL/SDK revisions, token programs, mint/authority/extension rules and finality profiles. Resolve through authoritative contracts and recorded design decisions; missing definitions are not permission to emulate another chain.

Once the profile is sufficiently defined, implement separate native program/adapter/wallet/journal/recovery paths and actual local-validator tests for native SOL and supported SPL assets. Evaluate Token-2022 extensions individually; unsupported assets remain unavailable. Pin toolchains/artifacts, generate independent vectors, and test signer/owner/account substitution, conservation, deadlines, rent/token-account behavior, interruptions and exit liveness. Toolchain installation may be local work; it does not itself supply a custody contract or qualify parity. Label EVM-only results M2A, never M2C.

### D. Product completion and release — G24–G26 and feature 0.12

Cover all seven completion specs, not merely localization:

- Responsive/mobile and wallet compatibility: real handoff/resume, permissions, account changes, storage eviction/private browsing, file/share/clipboard/camera fallbacks, safe-area/keyboard layout and exact tested browser/OS/wallet matrix. Unmeasured targets remain untested.
- Locale/help/accessibility: complete engineering coverage and selection/fallback rules without inventing approved translations; test dynamic messages, plural/numeral/date display, RTL/bidi, canonical copy, overflow/overlap, keyboard/status/focus, contrast and reduced motion. Real 200/400% zoom and physical assistive/device evidence stay distinct from simulations. Keep safety strings fail-closed and canonical signing independent of locale.
- QR: freeze type-specific payload/signature/codec profiles before complete scan/share/import/export integration. Bound input, verify binding/expiry/conflicts, keep sensitive connection URIs private, and provide manual/file fallbacks. Envelope parsing alone is not completion.
- Mandatory private encryption, data classification and local abuse/resource controls: preserve existing protection, cancellation and recovery availability. Local limits/CAPTCHAs are not Sybil protection; no external fingerprinting or CAPTCHA service.
- Scriptless static read-only security/recovery portal: actual restrictive served CSP, public fingerprints/ABI/IDL references and printable instructions; no claim of JavaScript-free wallet signing, vault decryption, camera or proof generation.
- Reproducible developer lab/devcontainer and static Pages/distribution workflow: pinned tools/images, isolated fake funds, safe ports and secret hygiene. Mark unsupported validators honestly; prepare release artifacts without starting paid resources or publishing an unapproved release.
- Versioned wiki/source docs, release documentation manifest, claims register, onboarding/fee/risk/recovery education, licensed visual provenance and any specified local templates/favorites/referral behavior. No hidden tracking, unsupported marketing claims or unauthorized external wiki publication.

Execute the complete G24 acceptance matrix with two fresh clients, native/token release and timeout, unknown broadcasts, failed permissions, stale endpoints, core-only builds, deleted-frontend recovery and fault injection. Complete G25 reproducible deploy/verify/rollback/runbook artifacts and G26 incident/diagnostic/recovery operations. Reuse existing diagnostics and acceptance tools; do not build another evaluator. Operational ownership/contact, live distribution witnesses and independent acceptance remain real evidence requirements.

## 6. Finish later milestones without making them core dependencies

Keep every remaining spec represented in the ledger, even when its predecessor or exact protocol blocks implementation. Advance bounded independently specified engineering where allowed; activate in roadmap order only after the corresponding gates.

| Scope | Remaining work and acceptance |
| --- | --- |
| M3, G27: stealth | Evaluated EIP-5564 generation, announcement scanning/reorg handling and spending; authenticated trade-bound recipient, viewing/spending separation, scheme/chain isolation and gas/linkability disclosure. New opt-in terms only. |
| M3, G28: reputation | Evaluated membership/score proof providers, authenticated issuer/root/score semantics, revocation, expiry, nullifiers and eligibility rules. Membership is not verified trustworthiness. |
| M4, G29–G30: fiat evidence | Select a concrete evaluated TLSNotary/Reclaim/provider profile; bounded/cancellable WASM workers, credential/witness isolation, source/trade/amount/currency/recipient/freshness binding and replay protection. Advisory first; autonomous settlement requires a separately reviewed new policy/contract and rail evidence. |
| M5, G31: geographic coordination | Consent/revocation, coarse geohashes, query/disclosure budgets, private maps and moderated signed directories, safe zones, explicit WebRTC/ICE policy and proximity/presence features. Coordinates do not prove GPS truth or human presence. |
| M5, G32: couriers/lockers | Three-party custody, assignment, seed/seal/container commitments, locker access, collateral and handoff receipts; precommitted timeout/recovery for lost/swapped parcels, unavailable couriers, power loss and jams. No cash-value/authenticity claims from acknowledgments; adversarial slashing stays disabled without adjudication. |
| M6, G33–G34: disputes | Threat/economic models; juror selection/acceptance/replacement, incentives, scoped evidence, commit/reveal, tally/certificates, appeals/penalties, bounded rounds and outage/VRF/quorum fallback. Independently reviewed opt-in escrow version; no authority over existing basic trades. |
| Deferred liquidity/custody | Inventory partial fills, quote reservations, market-maker/liquidity-vault accounting, pools and other deferred Section 01 requirements. Separate custody/version/conservation/cancel/recovery contracts; no silent inclusion in single-fill basic escrow. |
| Other advanced privacy/security | Inventory shielded pools, CoinJoin, evaluated Tor/I2P/browser routing, optional messaging providers, duress/decoy profiles, encrypted compartments, data remanence/memory limits, emergency sweep authorization/timelocks, key management and cross-feature mode validation. Require each module's exact threat, authority, lifecycle and failure/recovery contract. Do not promise browser secure erasure or anonymity that cannot be demonstrated. |

The table is a coverage guide, not a replacement for every underlying specification. Newly enabled capabilities need their own artifact/version/provider provenance and acceptance matrix. Test each with advanced services absent, disabled and failing; original basic exits must remain usable.

## 7. Human/external and undefined-contract work

Record exact missing evidence and prepare the concrete review packet rather than repeatedly asking for approval or stopping independent work. Genuine boundaries include production release/registry fingerprints and authenticated bootstrap; live deployment/asset/endpoint qualification; professional crypto/security/provider review; reviewed translations; physical wallet/hardware/assistive-device trials; operational/security contacts, jurisdiction/role assessment, distribution/deployment witnesses and enabled publication destinations.

Undefined contract rows must name exact absent fields/encodings/policy decisions and their affected modules, including Solana/SPL, QR, G15 transitions/deployments/archives and G14–G16 commitments where still absent. Propose documented options and reusable local evidence, but do not fabricate approval, interoperability or custody semantics. Missing approval can block activation while local implementation/testing remains READY. Missing an exact wire contract may block that implementation, not every other workstream.

## 8. Verification, audit and delivery

For each meaningful change, reproduce the gap, implement a coherent slice, run focused checks and obtain a different agent's correctness/authority/privacy/bounds/cancellation/recovery/accessibility/simplicity review. Investigate findings, repair real defects, and re-review changed paths. Keep RED/GREEN and false-positive/optional dispositions. Do not treat a bot report, a cancelled check or an agent name as release approval.

After each consolidated tranche, run final package/UI tests, all four TypeScript configurations, import boundaries, build policy, specification/link checks and default/demo builds. Run affected emitted-browser/native-chain journeys, the enrolled receipt regressions and current CI-required checks with actual pinned tools. Managed IPC/loopback tests need the environment's network capability. Record unavailable tooling as BLOCKED, never skipped or spoofed. Preserve one-send semantics; repeated bounded reads are not transaction retries.

Perform a whole-repository audit before delivery, divided among nonoverlapping subsystem reviewers: schemas/domain/authority/journal; crypto/vault/identity/storage/recovery; wallets/native contracts/assets/ABI boundaries; transport/relay/exchange/messaging; UI/accessibility/localization; build/distribution/CLI/diagnostics/operations; and each implemented optional subsystem. State fresh-review scope versus reused unchanged-source evidence; a file-hash inventory is not semantic or professional certification. Fix reproduced defects and re-audit affected paths.

Refresh exact-head functional CI, CodeQL, Snyk, Sonar and all review submissions, including outside-diff comments. A passing scanner is not a substitute for code review. Do not inherit old results, suppress findings, change quality gates or rerun flaky failures without diagnosing them. Respect live branch rules; publish a standalone reviewable PR, consolidate compatible contributions, and merge using an expected-head guard. Verify remote/local main, equality with the tested tree, current audit hashes, compatible ancestry and clean checkout. Record actual hosting/merge readback in live PR metadata rather than pretending source certifies its future merge.

Clean only owned processes/temp assets; do not stop unrelated resources or delete archived proposals. Finish with delivered behavior, prompt/ledger/audit/PR links, exact revisions, actual verification, deployment/resource status, remaining local work and precise contract/human blockers. Every requirement must end either evidenced DONE or explicitly resumable with owner/dependencies—never silently omitted. Continue until all safely executable, defined work is complete or honestly blocked; never call the entire product or funds-enabled release complete while an acceptance gate remains open.
