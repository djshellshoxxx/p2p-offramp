# P2P Offramp accelerated completion and beta specification

Date: 2026-11-09 (owner-local date). Version: 1.
Status: implementation specification under the owner's instruction to turn the agreed acceleration plan into repository specifications and start work. Not authorization to merge Tier C changes, activate trading or publish a release.

## 1. Objective and chosen approach

Complete and independently qualify a restricted EVM testnet exchange before expanding the product's entire roadmap. Preserve the static, client-side, noncustodial architecture and external-wallet authority. Build on the implemented modules and accepted decisions rather than starting another cumulative rewrite.

Chosen approach: narrow core beta with isolated parallel follow-on lanes. Waiting for Solana, payment proofs, reputation, arbitration and liquidity together delays the core; merging every cumulative branch together obscures ownership and security evidence. Neither is the default.

Earlier conversational completion percentages and week estimates are provisional hypotheses, not a measured inventory or promised delivery date. Progress is counted against the requirements and exact source evidence below. Re-estimate after an integrated two-party journey, not from test count or lines of code.

## 2. Pinned starting point and concurrency

Start this lane at PR #59, `codex/rq00-evidence-20261109`, commit `a136909721046ec8a540ed98ecfdcbf4c4bcf8ad`, on PR #56 `07b1b9b043e2614d434fa6263db5ee423f20cfa6`. Source of detailed existing state: [CURRENT-STATE.md](../../development/CURRENT-STATE.md) and [2026-11-09 core review](../../development/2026-11-09-core-review.md).

- [#54](https://github.com/djshellshoxxx/p2p-offramp/pull/54) and [#56](https://github.com/djshellshoxxx/p2p-offramp/pull/56) hold core continuation/review work; #56 records a separate Sonar gate blocker.
- [#58](https://github.com/djshellshoxxx/p2p-offramp/pull/58) fixes post-send wallet-error uncertainty. It is a sibling of #59, not included merely by selecting #59; it does not implement the complete persisted D9 protocol.
- [#59](https://github.com/djshellshoxxx/p2p-offramp/pull/59) adds research receipt admission, not execution verification or release authorization. Reuse it and the existing acceptance evaluator; do not invent a second approval mechanism.
- #37-#48 are cumulative split work; compare/extract unique reviewed changes in dependency order. #40 does not constitute implemented contract-wallet execution.
- #29/#49 contain decision records. Refresh their current approved wording before implementing D1/D9 or choosing a reserved persisted schema version.
- #50/#57 are the separate Solana program/documentation lane. Preserve them; do not fold them into an EVM beta claim.

Refresh refs, comments and ownership before each task. New unpublished handoffs are not assumed present in these GitHub commits. Never rewrite another contributor's branch or treat documentation saying “merged” as ancestry proof.

## 3. Beta boundary and roles

The seller owns cryptocurrency and wants fiat; the buyer owns fiat and wants cryptocurrency. Both use local encrypted profiles, signed trade terms, qualified relays and their own wallets. Fiat travels through the agreed external payment method, not through the escrow contract.

Initial beta: one owner-approved EVM testnet, a small qualified asset list, signed offer discovery/acceptance, encrypted text communication, escrow funding, manual fiat reporting/confirmation, release/refund/payout observation and recoverable transaction state. Sepolia is the existing candidate; the actual profile, deployment and assets must be approved and verified, not invented here.

Basic escrow does NOT make a bank payment and a crypto transfer atomic. A buyer's screenshot, “sent” message or reference is a claim, not verified fiat settlement. A funded escrow does NOT guarantee that a dishonest seller releases after receiving fiat. Refund deadlines can disadvantage a buyer who already paid. The interface and beta guide MUST explain these limits without implying a payment-proof or arbitration service exists.

Default `ReleaseEnabled=0`, current network restrictions and production/funds-disabled paths remain unchanged during implementation. An approved testnet qualification configuration is a separate operational action, not permission to enable mainnet or accept customer funds.

## 4. Required acceptance contracts

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| PO-B01 | Maintain one source-pinned integration candidate and accurate dependency/ownership ledger. | Unique-diff/ancestry map; review disposition; full required checks on the candidate itself; Sonar blocker resolved or explicitly still blocked. |
| PO-B02 | Complete accepted D9 durable send intent semantics before enabling browser sends. | Persist/CAS the marker before the send-capable boundary; crash before/after send, reload, two tabs, migration and restored-record provenance tests; uncertainty never becomes “never sent” merely after error 4001. Reserved schema/version decisions remain with their coordinator. |
| PO-B03 | Implement accepted D1 peer acceptance and identity binding. | Source-pinned vectors for approved terms/digest/domain/chain/profile; participant binding, downgrade/replay refusal and tombstones. No signature or wallet-identity assertion from an unrelated message key. |
| PO-B04 | Seller creates/reviews an offer; buyer discovers and accepts precisely those terms. | Two independent profiles, actual relay publication/reception, authenticated acceptance and stale/duplicate/malformed offer tests. No remote code execution through offers/extensions. |
| PO-B05 | Both users can exchange bounded encrypted text and recover durable history. | Actual browser storage plus relay journey; deduplication, wrong recipient, relay outage, key lifecycle, retention and restart evidence. Memory-store tests alone do not qualify IndexedDB. |
| PO-B06 | Funding consent binds the exact immutable trade terms and qualified contract/asset. | Exact network/address/bytecode/terms validation; wallet cancellation, chain switch, wrong asset, stale balance/observation and concurrent funding negatives. Unsupported contract-wallet execution is refused rather than represented as supported. |
| PO-B07 | Buyer receives “pay fiat” guidance only after the required canonical funding/finality checks. | Unconfirmed hash, stale head, conflicting RPC, reorg and already-settled escrow vetoes; UI explains verified versus unverified observations. |
| PO-B08 | Fiat reporting and seller release retain their distinct authority. | Buyer reports payment without changing contract state; seller separately confirms their actual external receipt and authorizes release. No automatic release based on screenshots or a buyer claim. |
| PO-B09 | Release, refund eligibility and payout completion use the selected contract's actual state machine. | Before/at/after deadline vectors; mutually exclusive terminal decisions; pending/failed payout distinguished from release decision where applicable; rejecting recipients and retries tested. Never change immutable beneficiaries to “fix” liveness. |
| PO-B10 | A shared trade view presents both roles' next actions and recovery choices. | Explicit offer/agreement/funding/fiat-claim/release/refund/payout states, verified evidence and uncertainty; keyboard/focus/touch help; no misleading generic “complete” state while payout remains unverified. |
| PO-B11 | Backup, journal and portable recovery survive interrupted sessions without manufacturing authority. | Real browser restart/restore, fresh-key reseal, pending intent provenance, read-only inspection and supported unsigned recovery exports. Imported records do not grant signing/reviewer authority. |
| PO-B12 | Release, registry, deployment and dependency evidence fails closed on incomplete or ambiguous inputs. | Authenticated original trust pins, exact deployment and archive identities, signed-update negatives, complete unique provider evidence and valid key-expiry metadata; no runtime trust-root change. |
| PO-B13 | GUI and supported CLI operations share validation and documented formats. | Command-line setup, diagnostics, acceptance/recovery and testnet tooling documented and exercised; GUI-to-CLI exchange fixtures; unavailable operations explicitly refused. Do not build a second wallet or custody implementation. |
| PO-B14 | Complete the real two-sided EVM testnet journey. | Two wallets/profiles, actual relays, approved testnet escrow and chain receipts; happy path plus unpaid timeout/refund and interrupted-send recovery; source/environment/transactions recorded without secrets. |
| PO-B15 | Independently qualify release and operation. | Named reviewer for custody/signing/recovery boundaries, no unresolved beta-blocking critical/high findings, owner/key provisioning, security contact, reproducible distribution and explicit publication approval. |

All mandatory requirements are conjunctive. High aggregate “completion” cannot compensate for missing D9, participant binding, contract qualification or release trust.

## 5. User journey acceptance scenarios

J1 seller: unlock/create profile -> compose and review offer -> publish -> authenticate buyer acceptance -> confirm immutable terms -> fund via own wallet -> observe required finality -> inspect actual fiat receipt -> explicitly authorize release -> observe payout/finality.

J1 buyer: unlock/create profile -> discover/validate offer -> accept exact terms and destination -> wait for verified funded state -> send fiat through the agreed external method -> report payment -> observe seller release and actual crypto receipt. The app must not recommend paying while funding is merely asserted.

J2 no fiat payment: execute the approved profile's deadline/refund procedure; check both users' displays and final on-chain state. Do not invent a dispute/reputation outcome.

J3 uncertain transaction: error after a possible broadcast, crash/reload, stale RPC or reorg -> recover the durable intent -> reconcile before any new send. Include the #58 regression and the complete D9 browser path.

J4 payment dispute: seller does not release after buyer reports paying -> show the actual contract rights and external-payment limitations. No claim of guaranteed compensation, automatic arbitration or zkTLS resolution.

J5 recovery/distribution: restore encrypted local state and inspect pending transactions; use the documented CLI/recovery package; validate downloaded release/dependency evidence independently. Missing, duplicated, malformed or unauthenticated evidence must not create a qualified result.

## 6. Execution lanes and critical path

| Lane | Owned deliverable | Dependencies / boundary |
| --- | --- | --- |
| W0 Integration | Branch map, requirement ledger, small dependency-ordered PRs and final candidate. | One owner for shared exports, schemas, package metadata and workflows; no self-merge of Tier C work. |
| W1 Durable lifecycle | D9, reviewed #58 integration, migration/import provenance and reconciliation. | Coordinate reserved schema before editing; independent review; no escrow-right changes. |
| W2 Acceptance/transport | D1 identity/terms binding, relay and durable chat journeys. | Depends on approved decisions; reuses existing Nostr/crypto primitives. |
| W3 EVM/wallet | Qualified funding, finality, settlement/payout and local native tests. | Reuse canonical escrow; test actual enabled wallet classes only. |
| W4 Product/CLI/recovery | Extract unique #41-#44 work; two-role trade screen, tooltip/locale foundation and supported CLI parity. | Follow stable W1/W2 interfaces; do not wire sends before their gates pass. |
| W5 Security/evidence/release | Adversarial review, dependency/release verification, testnet preparation and source-pinned records. | No fabricated execution attestations; real keys and release authority stay external. |

Capacity ceiling: up to twelve workers only with disjoint ownership and independent reviewers. No workers are implied to be running by this document. Start with the files that can be tested independently; scale down when interfaces overlap.

Critical path: refresh #54/#56/#58/#59 and decisions -> reviewed D9 + D1 -> extract qualified execution/UI/journey work -> native two-party qualification -> owner-provisioned deployment/trust inputs -> real testnet journey -> independent release review -> explicit publication. Supply-chain checks, release preparation and UI read-only work can proceed in parallel.

## 7. Remaining full-product milestones

| Milestone | Definition of completion |
| --- | --- |
| Solana/SPL | Review #50/#57, pinned native toolchain/provenance, client adapter, native/SPL lifecycle, rollback semantics and real wallet/network qualification. |
| Payment proofs/fiat evidence | Select and pin provider/profile; authenticate field semantics and attestor trust; time/replay/redaction/budget negatives; live provider evidence. Proof does not imply payment irreversibility. |
| Reputation/privacy | Explicit identity/privacy model, source-pinned implementations, interoperability and independent security review. No reputation badge from local-only assertions. |
| Arbitration | Approved dispute protocol, authority/custody boundaries, evidence and executable resolution tests; not a retroactive change to funded basic escrows. |
| Liquidity/partial fills | Selected accounting/custody model, matching and partial-fill invariants, recovery and review. |
| Physical coordination | Opt-in meetup/location/courier/locker profiles with explicit permissions, privacy and fulfillment limitations. |
| Language/device breadth | Reviewed translations, RTL/CJK/long-text, wallet/browser/device and assistive-technology acceptance. |
| Formal/governance/recovery | Extract unique #37/#44/#45/#47/#48 work with pinned tools and scope-correct evidence; UNKNOWN remains UNKNOWN. |

These remain on the completion roadmap but are not dependencies of the restricted EVM beta unless explicitly promoted through a reviewed scope change.

## 8. Verification and promotion rules

For each requirement record source SHA, toolchain/environment, exact command, result, failures/skips, bounded redacted artifact identity, reviewer and external blockers. Distinguish mock, local-native, browser, public-testnet and physical-device evidence. Imported signatures/hashes prove attribution/correspondence only, not truthful execution or permission to release.

Required verification includes the repository's Node >=24 environment, typecheck, boundaries/spec checks, package tests, pinned Python oracle, Foundry/native EVM, browser suites, release/acceptance checks and the actual two-role testnet journey. Read the current package scripts before execution; do not silently change compiler/provider pins or weaken mandatory gates.

Unavailable tooling or owner inputs block promotion of the affected requirement, not useful independent work. Keep `ReleaseEnabled=0`, real-funds restrictions, trust roots and other contributors' branches intact. No paid autonomous-agent workflow dispatch is authorized here.

## 9. First implementation increment

Own this specification, its implementation plan, `scripts/check-npm-registry-signatures.mjs` and a focused offline regression suite. The retained registry check must require exactly one record for each required provider, reject malformed key-expiry metadata, and bind signed evidence to the lockfile's exact version/integrity. Test with locally generated synthetic ECDSA fixtures; do not change retained authoritative keys or claim those fixtures are npm attestations.

This advances PO-B12 without touching D1/D9, wallet execution, custody, Solana or reserved schemas. Reuse the existing verifier rather than create a competing release/approval mechanism. See [the first-increment implementation plan](../plans/2026-11-09-beta-first-increment.md). The remainder stays open until individually evidenced.
