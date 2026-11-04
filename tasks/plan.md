# Autonomous completion plan — 2026-10-31

Baseline: `eaa1fe5`; execution contract:
[single prompt](../docs/execution/AUTONOMOUS-NEXT-PROMPT-2026-10-31.md).
Tasks are tracked only in [todo.md](todo.md).

| Task | Single writer | Owned area | Dependencies |
| --- | --- | --- | --- |
| T1 | inventory_release | security release-locator source/tests/new browser fixture | existing G15 branded verifier |
| T2 | inventory_core | new messaging envelope/history/composition package and tests | existing G02 + NIP chat |
| T3 | extension_lifecycle | new extension registry package/tests | schemas/domain types only |
| T4 | native_preflight | canonical read-only preflight adapter/tests/native fixture | existing canonical ABI + G18 |
| T5 | inventory_ui | diagnostics model/store/Settings/tests | trusted release-context seam; default unconfigured |
| T6 | inventory_tools | acceptance-evidence evaluator/tests/report CLI | trusted review-policy seam; default blocked |
| T7 | inventory_ui, second slice | offline recovery-reference capability/UI | T5 + agreed bounded Worker protocol |
| T8 | root | shared facades/manifests/CI, current status/prompt/report | all frozen interfaces |
| T9 | extension_lifecycle | transport permit capture, canonical relay pool, matching fixtures/tests | discovered by final intake reassessment; exact existing G05/G21 URL contract |

Root owns `packages/security/index.ts`, `package.json`, CI and continuation docs.
Other new packages own their own facades. No agent edits another owner's files
without coordination. Review assignments rotate after implementations freeze.

T9 was admitted after final reassessment: canonical pool explicitly documented
that a broker permit bound only endpoint ID while its independently supplied URL
was not cross-checked. Complete that existing boundary before final integration;
do not fabricate a production routing issuer. Register fixture destinations
explicitly and retain physical socket drain/limits and unknown publication rules.

The larger delivery milestones remain separate: actual trust and deployment
qualification, professional review, live/device/routing evidence, Solana parity,
unspecified key rotation/deployment/archive profiles, and opt-in later protocols.
The current feature inventory and final report must distinguish these from local
implementation. Existing signed-manifest/identity/network defaults stay closed.

Checkpoints: focused owner tests and independent review per slice; final combined
tests/build/browser/native checks; exact-head hosted review; guarded merge and
post-merge tree/ancestry verification. User's explicit autonomous execution and
merge instruction authorizes these steps; no routine human checkpoint is needed.

## Continued review from merged PR #20

The user's continuation resumes the same execution contract at clean merged
`b700085`. T1–T9 remain complete. The next intake reproduced two chain-read bugs
and found a missing cross-package acceptance journey; admit only these bounded
slices before implementation. Branch: `autonomous/continuation-20261031`.

| Task | Single writer | Owned area | Dependencies |
| --- | --- | --- | --- |
| T10 | continue_chain | canonical payment-preflight/chain-reader source and tests; native payment fixture | finalized evidence stays positive proof; latest state only vetoes; numbered observations recheck anchor |
| T11 | continue_chat | existing encrypted-exchange/native escrow harness; messaging README and G20 implementation status | existing chat, relay, vault and native settlement APIs; no new protocol |
| T12 | root | integration, prompt/status/evidence; coordinated whole-source audit and guarded merge | T10/T11 freeze, different reviewers, integrated checks |
| T13 | continue_foundations | app-local English catalog/typed variables/metadata, UI message migration, locale tests | existing localization spec; no reviewed translations/funds locale or accessibility approval |
| T14 | root | Sepolia operator-tool observation and focused state tests | reproduced same numbered-header consistency defect as T10 in the separate CLI path |
| T15 | audit_runtime_build | Sepolia tool Forge environment/provenance guard and hygiene tests | reproduced optimizer/EVM-version overrides contradict the recorded committed build recipe |
| T16 | audit_evm | Sepolia deployment-record canonical inclusion/guard proof; deployment regression/native kit tests | independently reproduced wrong/orphan receipt and unproved known-hash guard clearing; T15 library interface freezes first |
| T17 | continue_chain | standalone canonical-EVM recovery package/tool, strict existing reference-export parser and tests/docs | existing opaque G15 proof, exact authenticated canonical ABI, archived G11 deployment; T10/T15/T16 and separate independent review |
| T18 | continue_foundations | acceptance report CLI main detection and subprocess regression | reproduced symlink invocation silently exits 0 without running the evaluator |

T10 requires regressions for finalized funded/latest terminal or mismatched state
and a reorg between header capture and state observation. T11 must demonstrate
authenticated durable chat, reopen/dedup and fresh-key recovery in the existing
canonical exchange journey without additional app/network/wallet authority.
Independent reviewers must inspect the final slices, and whole-source audit
assignments must use disjoint subsystem scopes. Any newly reproduced defect
enters this ledger before its owner edits it. No duplicate reader, outbox, cursor,
trust-root decision or production enablement is authorized by this plan.

T13 was admitted by the final foundation intake: the localization specification
requires one typed catalog, while current UI strings are split across unrelated
plain objects and inline labels. Implement the English source foundation and
draft-only test pseudolocale without adding a dependency or claiming completed
multilingual/tooltip/accessibility acceptance. The owner must enumerate migrated
UI paths and preserve visible copy and canonical data; no alternate locale is
approved or selectable for funds actions. Root does not edit the owner's UI files.

T14 entered during whole-source tooling review: a changed/missing numbered block
after logs/state reads still reached the CLI's pre-funding hook. Four controlled
regressions fail on the original source. Recheck height/hash/time before creating
the observation, use a fixed refusal, and retain a stable-snapshot positive test.
Runtime/build auditor independently reviews this root-owned change.

T15 entered after the tooling auditor reproduced inherited `FOUNDRY_*` settings
changing compiler output while the DeploymentRecord still claims the committed
recipe. Restrict inherited build overrides and verify the actual canonical recipe
with the pinned toolchain; preserve explicit controlled output-directory and
compiler-path seams. A different reviewer checks this auditor-authored fix.

Hosted PR #21 at `5a6dfac` reopened T15: the strict recipe guard assumed extra
auto-detected vendor-test remappings present locally but absent in the fresh CI
checkout. The same owner now also owns `contracts/evm/foundry.toml` for an explicit
deterministic remapping policy. Require the exact committed mappings rather than
ignoring drift. A different reviewer checks configuration/bytecode equivalence;
root commits the clean recipe before native provenance checks can run.

T16 entered after both tooling and EVM reviewers independently reproduced a
deployment receipt mismatch accepted as finalized by height. Bind the requested
CREATE transaction, receipt and canonical numbered block; pin code/allowlist reads
and recheck their anchor. Neither known-hash nor unknown-attempt guard clearing
may use imported metadata alone as proof. Preserve unknown outcomes and fixed
errors; native loopback verification must remain reproducible under T15.

Hosted review reopened T16 at PR #21: geth derives a CREATE address in failed
receipts, while the initial proof accepted only null for failure. Reproduce the
actual native client and support null or the exact authenticated nonce-derived
address, never a substitute; canonical inclusion, empty code and all guard proofs
remain mandatory. The same owner fixes it after the reproduction, with a different
reviewer and an actual reverted-CREATE fixture.

T17 is a bounded G25 implementation, not another generic chain reader. Build a
portable Node recovery bundle only from a live verified release and its exact
authenticated registry/ABI bytes. Pin one original canonical deployment inside
the independently authenticated executable. Reuse existing generic identity
validation without the incompatible isolated-profile decoder, and use canonical
state/calldata builders. Explicit reads/unsigned release/refund/fixed-beneficiary
withdrawal never send, sign, fund or replay a journal request. Archived original
escrow exits remain available after the originating manifest expires; no current
release/new-funding authority is granted. Root owns shared facades, commands and
CI after the interface freezes. New package distribution authenticity, witnesses,
qualified live deployment and Solana remain separate gates.

T18 is a small tooling-audit regression: executing the acceptance-report CLI via
a symlink skips its literal-path main guard and silently exits successfully.
Resolve the entry path robustly and require the same fixed invalid/blocked result
as direct invocation. Keep imported-library use inert and evaluator policy closed.

Completed hosted CodeRabbit review at initial `5a6dfac` admitted follow-ups under
the same owners: T15 must deliberately pass offline runtime settings through the
trusted native harness seam; T17 must reject present falsy accepted-state files
instead of treating them as absent, and make the hostile-byteLength regression
sensitive to getter evaluation; T18 must exclude eval/print entry modes and allow
the known older-Node experimental warning in test setup. No review-policy/key
override or broad inherited Foundry option is introduced. Different reviewers
verify the final fixes; source tests are repeated only where the findings affect
behavior.

T18's entry defect also affected the shared Sepolia/recovery gate and the three
other already-guarded libraries (static build, fuzz and boundaries). Ownership
transferred sequentially to the same writer for imports/main conditions only;
one Node-only helper now holds the rule. A copied fuzz fixture adds that helper.
Independent preload-query/fragment probes then required URL-suffix rejection
before canonical path matching. Ordinary/direct/symlink and literal filename
behavior remain tested. No unconditional test executable was redesigned.

## Guidance continuation — 2026-11-01

User invoked the remaining-work execution prompt. Baseline merged PR21 f264cab;
T1–T18 remain complete. Root owns integration/manifests/CI and this ledger.
T19/T21 owner guidance_writer owns help/catalog/UI and focused tests; T20 owner
layout_qualification owns test-only layout/browser fixtures. Agree interfaces
before dependent edits; CSS ownership transfers explicitly. Different agents
review frozen slices. Preserve disabled trading, draft-only fixtures and all
trust/approval gates. Execute docs/execution/REMAINING-WORK-PROMPT-2026-11-01.md;
reassess source-derived unblocked work after this tranche, then audit/consolidate.

Reassessment admits T23: G23 independent display-only privacy indicators. Owner
remaining_inventory owns a new domain model/tests and its specification status;
root owns public facade and later app composition after T19/T21 catalog freeze.
Reuse actual G05/vault/core observation ports, exact bounds and stale/generation
refusal; no second transport authority, global anonymity badge, approval inference
or economic preparation. Agree the input trust seam before implementation.

T24: guidance_writer owns new domain journey-view source/test only. Reuse existing TradeView/journal facts, exact specified steps, unknown unsupported prerequisites; no signing/actions or economic authority. Root owns facade/integration. Independent review required.

T25: audit_evm exclusively owns wallet evm-submit reader and focused reader test. Guard hostile thrown error classification, retain fixed diagnostic surface, no economic behavior change. Independent review by another agent after freeze.

Final T23 ownership extension serialized after guidance freeze: remaining_inventory owns PrivacyStatusPanel, App/Pages wiring, privacy-only en catalog group and UI tests. Runtime/build reviewer independently approved final absent-service correction. T20 actual-shell RTL correction independently reviewed; T24 reviewed by storage auditor; T25 minimal wallet fix reviewed by a different auditor. Combined evidence and unchanged-source identities are retained under docs/execution.

T26 root owns help-registry exact-key membership simplification and source receipts; guidance reviewer independently checks strict shape preservation. Sonar failure on b8571ce was the exposed key-sort rule; no scanner settings/exclusions/gates changed.

T27 remaining_inventory owns PrivacyStatusPanel, privacy-only catalog text, UItest if needed and locale harness expiry regression. Root owns G23/prompt/review-receipt documentation corrections. audit_runtime_build independently reviews frozen timer/browser source. No transport/provider authority or network introduced.

## Journey/provider continuation — 2026-11-01

Baseline PR23 merged f421fdc, clean main. User invoked GUIDANCE-REMAINING handoff; disabled funds/no invented wire profiles persist. No redundant preparation panel: Home already presents local setup/loss guidance and there is no authenticated backup-complete fact.

T28: remaining_inventory owns existing domain journey-view.ts/test only. Optional structural trusted G18 port matches native adapter read/view with native-rpc evidence, exact binding/termsHash/finalized anchor and fixed decision/reason, never fixture JSON authority. Existing G08/G12 health/unresolved/finality/terminal precedence remains; only fresh finalized EVM funded + exact native G18 allow-guidance can resolve payment-coordination. Re-read composition after async gate, check original binding/wallet/chain generations+anchor/state, final G18 view/freshness, final cancellation. No actions/signing/new reducer, no prerequisite negotiation or backup claims. Root owns facade types/native preflight harness/shared files. Independent reviewer owns no implementation files.

T29: contract proposal before mutation; reuse existing SessionTransportPolicy and privacy reader, bounded observer invalidation without weakened grants or default broker. Root owns final shared integration/manifest/CI and documentation. Different reviewer after freeze.

T29 frozen broker contract: subscribeInvalidation callback is a coalesced bounded hint after completed revocation, never an event/authority. Up to64 observers and6 inspection expiry/fault watches reuse existing broker timer. Last observer removes display-only watches, leaving actual permit expiry intact. Malformed inspection faults deduplicated; reentrant notification cannot create unbounded queue. guidance_writer owns optional PrivacyStatusPanel+SSRtest, no App/defaultbroker. layout_qualification owns existing locale browser harness+test-only fixture, no new runner or runtime injection. audit_storage independently reviews broker; audit_runtime_build independently reviews panel/browser.

Root T28 native integration owns scripts/test-exchange-evm-local.mjs. Actual canonical escrow, native G18, G08 decoded/identity-checked native fixture observations and encrypted G12 are joined. Existing lifecycle journal has no readNative injection and correctly keeps raw persisted terminal labels unresolved; fixture adapts the actual reconciling coordinator for fresh per-intent proof rather than filtering labels/clearing IDs. This native fixture is not a newly qualified production G08 adapter.

Final root review found T29 A→null→sameA readiness reuse after unsubscribe. Actual emitted RED showed6 premature inspections under64observer exhaustion; active ownership ref + state is now required, set after valid registration and cleared before off. Independent GREEN6/6 and source rereview supersede earlier approval. Final frozen scopes/identities and test results in JOURNEY-AUDIT; root owns source delivery only.

T31 current hosted review admission: policy owner exclusively changes policy.ts/test for display-only TTL notification without permit revocation, and finite catch-up hints so stable observers already visited see mid-pass changes. Independent storage reviewer rechecks superseding source, real permit timers and disposal/reentrancy. Root owns docs/manifest and final integration; prior scoped approvals/checks do not certify the repair.

T32 hosted failure admission: final7ded PUSHlocaltrade job124847036497 failed in existing payment preflight fixture immediate receipt lookup (null), while same-head PR native jobpassed. Owner guidance_writer only new test-support/fixture-receipt.mjs, regression scripts/tests/fixture-receipt.test.mjs and send helper in test-payment-preflight-local.mjs. Bounded reads for same hash, no transaction resend, exact success/hash and immediate malformed/reverted refusal. Root owns command enrollment/docs, independent runtime reviewer. This fixes test timing without changing native adapter or gates.

## 2026-11-04 constrained consolidation

C54 owns only scripts/sepolia/{lib,trade}.mjs and their two scripts/tests files. C55 owns only relay/messaging source/tests from the ten-file PR39 delta. C56 root owns transport HTTP driver and its encoding regressions. C57 read-only Solana inventory. Root owns status/ledger/evidence. Frozen changes receive a different reviewer; cached source refs are not live GitHub evidence. Publication is blocked by read-only Git metadata/network. ReleaseEnabled=0 and all existing trust/network restrictions persist.

C59 solana_inventory owns only packages/storage/src/idb-vault-store.ts and packages/storage/test/idb-vault-store.test.mjs. Root or foundation reviewer independently reviews after freeze.
