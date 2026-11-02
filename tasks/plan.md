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

## All-remaining-work execution

Execute the uploaded continuation and ALL-REMAINING-WORK-PROMPT against merged
PR24, without reopening completed implementation from historical ledgers. Root
serializes shared manifests/CI and delivery. T37 inventories all173 specification
documents and requirement sections, including optional later phases; separate
engineering, qualification, exact-contract decisions and activation evidence.
Every READY item is reassessed for execution independently of release approval.

T33 reproduces earliest-expiry loss after later inspection of the same channel;
the transport owner owns only policy.ts/test. Independent review checks timer,
reentrancy, actual permits and malformed observation behavior.

T34 owns the agreed end-to-end backup-verification slice. Use the existing vault
session tail, recovery slot, parser, native KDF/AEAD and current store row. No
second recovery builder, imported evidence authority or plaintext Worker reply.
Receipt fields: profileId, revision, scope complete-profile-v1, envelopeSha256,
backupSha256. Exact file authentication and pre/post current-row checks precede
receipt creation. Worker-private proof binds the exact selection handle and
generation, clears before mutation attempts and on invalidation, and is freshly
checked asynchronously. Recovery UI describes revision-bound evidence accurately.
Source ownership of related backup/schema/runtime/services/UI files transfers to
chain_reader; unrelated shared edits remain with root.

T35 implements only apps/portal and scripts/portal after its recorded contract:
deterministic local artifact hashes, dedicated scriptless policy, safe paths and
actual served-header probes. The maintained signing pin remains unset; no
approved-release/deployment/executable claim is inferred. Existing canonical
recovery builder is reused, never reimplemented.

T36 combines DATA02 copy/evidence claims with the existing seven wiki sources and
strict manifest/checker design to avoid competing claim registries. Root assigns
exact ownership after intake. T38 integrates and audits only after each owner
freezes its source. Final checks and hosted reviews must identify the final head;
historical receipts stay historical. Normal source publication and guarded merge
are authorized, with main tree/ancestry/clean readback required.

T39 root owns .devcontainer/**, scripts/lab/** and docs/lab/**. Pin the actual
linux-amd64 Node image digest, existing Foundry1.5.1 archive SHA and solc0.8.30
SHA. No curl-to-shell/install scripts or ambient credentials. Only frontend3000
may be forwarded privately; native harness RPC remains ephemeral loopback and
never forwarded. Reuse current native synthetic journeys and T15 toolchain
checking. LabRecipe/LabRun bind actual source+lockfile+fixture+config hashes and
tool output; no invented Codespace/Solana/publication qualification. Local Docker
build/test is ordinary authorized tooling, not a new paid hosted resource.

T40 completion_requirements owns new compatibility module/tests only. Preserve
specified exact browser/OS/device/wallet/connector/chain tuple and separate
tested/supported/unsupported/untested status. Trust actual immutable evidence
through a maintained seam, never imported result labels. Required local API
probing requests no network/wallet permission; camera/share/clipboard optional.
Root integrates the frozen module with App later, avoiding T34 UI/catalog writes.

T41 later_phase_requirements owns packages/meetup/** only. Implement exact
MEET01/02/03/08 and G31 local contracts: off-by-default expiring/revocable consent,
generation-bound async jobs, bounded sample freshness/provenance, standard coarse
geohash+neighbors, sticky WebCrypto radial markers and a CAS pre-disclosure budget
over the existing bounded G02 consumer port. Uncertain transmission consumes;
only known pre-send cancellation releases. No new record kind, sensor/provider
activation, GPS/presence proof, default core dependency or network permission.

T42 audit_domain_transport owns packages/governance/**, scripts/governance/** and
docs/governance/**. Inert exact GOV01/GOV02 records and local bounded file/hash
checking never grant runtime authority. Six decision packets cover G16 normative
alignment, G14 commitments, G15 profiles, Solana, QR and the absent peer carrier
for actual two-wallet EOA acceptance. Reproduced stat/read races require bounded
stable descriptor reads and independent re-review, not broader path trust.

T43 chain_reader owns new apps/web/src/journey/** and explicitly local-proof
journey fixture/harness paths only. Actual UI commands call current services
through a same-selected-vault Worker; keys and session handles stay private.
Default App/preview/build exclusions are unchanged. T34 async proof, actual EOA
signatures, exact negotiated terms, native G08/G12/G18 and one-send reconciliation
remain required. Existing peer terms-accept is exactly {revision}; it cannot carry
or imply the two account signatures required for funding. Local two-wallet proof
can advance defined composition while that production peer profile is pending.

T44 audit_storage owns new retention-service.ts/test plus a narrow storage index
export; vault-service.ts and the core Worker remain frozen. Opaque current-session
plans expose counts, not private identifiers. Unknown/future/identity records are
protected; persisted terminal labels never establish safe deletion. Recheck the
full revision and trusted current native dependency lease before one <=256 atomic
CAS. No automatic deletion, implicit batches or whole-vault workflow. Actual
native closure integration cannot be called done using only a fixture authority.

T45 audit_evm proposes then implements the specified separate bounded EIP1271
native acceptance path. Preserve EOA65-byte and default-preview contracts; verify
current chain/account/code/terms and exact native magic under bounded reads and
cancellation. Real-wallet/provider/production qualification remains separate.

T46 later_phase_requirements owns packages/arbitration/** only: bounded local
clock/draft/commit-reveal/tally/appeal/penalty/accounting reference models and exact
published Vote ABI vectors. Undefined draft/evidence/certificate/native formats
remain explicit decisions; no native tribunal or core authority is introduced.

T47 audit_domain_transport owns only storage vault/backup and identity service
error/signal cleanup plus two focused hostile-boundary test files. Preserve all
native cryptography, CAS, fresh-key restore and durable-result semantics. Guard
hostile classification and code descriptors; project fresh fixed diagnostics.
Native signal intrinsics and independently isolated cleanup must not leak global
recovery capacity, skip queued release, expose raw errors or mask durable writes.

T48 branch_inventory owns packages/courier/** only. Exact local canonical and
container commitments, opaque trusted-profile claims, revisioned custody/recovery,
locker uncertainty and checked accounting are separate from native/signature
provider qualification. No cash authenticity, unilateral slashing or live custody
is inferred. Missing domains/separators/key profiles stay port-owned or blocked.

T49 chain_reader owns only new journey-origin fixture/harness paths after T43
repairs. Two actual origins independently verify exact signed assets under a
compiled ephemeral fixture pin; migrate actual authenticated backup into a fresh
destination and export/reverify there while retaining source ciphertext. No
maintained pin or G15 rotation/nonempty deployment/archive contract is invented.

T50 audit_storage owns docs/execution/profiles/** only. Record finite pinned
primary-source provider decisions and exact reusable evidence. ERC5564 notebook
and ScopeLift SDK hashing differ; do not silently select an interoperable scheme.
Local named mathematical comparisons can be READY independently of production
interop, provider review, deployment and live-source evidence.

T51 is limited to explicit named offline mathematical comparison profiles from
T50's pinned reference/SDK artifacts. No default or inferred scheme, wallet
spending-secret collection, signing, funding or live announcer qualification.
Recipient viewing material must be separate from the spend public point.

T52 continue_chat owns locale/**, messages/App, pageTitle-only Pages changes,
diagnostic/recovery/trade message and display helpers, privacy label/help lookup,
demo label getters and locale test/fixture/harness paths. Pure source English
helpers remain; runtime uses a trusted compiled registry and atomic complete
fallback, with no runtime imported-bundle approval setter. App subscribes and
uses live message views. No private-form remount or canonical signing/copy change.
T53 owns file forms/controller integration; coordinate symbolic notices through
the same sole catalog writer. Regenerate T36 only after immutable catalog commit.

T53 audit_domain_transport owns new content-policy module/tests, import-only
VaultForms/BackupVerification edits and review-controller importer/tests. Fixed
consumer purposes classify actual persistence, never user-selected public tags.
Readonly transient review remains available without an unlocked vault. Acquire
one document import permit before getters/byte allocation, retain through actual
ignored work, wipe owned buffers and preserve durable results. Profile counters
are bounded local UX friction, not Sybil protection. Native Worker crypto gates
remain authoritative; recovery/exits get no cooldown. T43 owner alone integrates
its local screen/offer calls. The supposed missing App persistence binding was
withdrawn after finding the existing Bootstrap effect; pagehide changes require
a real emitted/BFCache reproduction and single-writer coordination.


T54 audit_evm owns new assurance validator/test, narrow governance index and
execution/assurance packets. Legal/operator facts remain unassessed; attack case
references bind actual sources/selectors without claiming every attack executed.
A different reviewer checks bounded descriptors and inert authority. New record
revisions invalidate prior assessments. No real incident/contact/drill is forged.

T55 audit_domain_transport owns new domain observation dispatcher, readonly hint
schema additions, app native observation adapters, isolated privacy-policy package
and minimal G05 invalidate() plus its tests. Never widen legacy imported authority
envelopes. Native RelayPool/OrderBook/journal observations retain real source,
scope and expiry; persisted terminal labels stay unresolved without native proof.
G14 compiled capability/hash sets are atomic; no partial module activation.
Transitions invalidate unsent permits before disposal/initialization, retain one
physical transition through ignored cancellation, require explicit strict-mode
relaxation consent, and cannot deny basic exits. Root owns the compound optional
package import guard. Branch_inventory independently reviews the frozen slice.

T56 branch_inventory owns five new meetup policy modules, tests/fixtures/support,
README supplement and narrow index export; existing T41 sources stay frozen.
Encrypted G02 CAS history/replay adapters preserve foreign preferences. RTC plans
cannot construct a connection without an actual enforcing route; local replay
cannot authenticate presence. Absent MEET09 binding/domain/map URL profiles remain
precise decisions. Audit_evm independently reviews the sixteen frozen paths.

T57 continue_chat owns only new scripts/distribution and docs/distribution paths.
Use existing build, policy scanner, portal and immutable wiki checker. Stage an
unsigned exact bounded public tree into a new directory, sanitize child builds,
compare two actual builds, bind source/lock/tool inputs and reject changed bytes.
No new release wire, key, signed archive, host publication or deployment. Real
positive/browser checks wait for T55 immutable-policy commit and root T36 regen;
refusal checks proceed independently. Root owns final package/CI integration.


T58 completion_requirements performs read-only G29/G30 Worker/WASM contract and
artifact intake after T54 review. Root admits exact code scope separately; no
unspecified bank/provider ABI, circuit or proof can be invented.

T59 remaining_privacy owns new packages/privacy-controls only, including one
finite native-browser proof script using existing tools. Actual independent G02
profiles and encrypted policies back decoy/duress transitions; no PIN/bootstrap
verifier, instant cross-tab lock, whole-profile deletion or forensic guarantee is
invented. Real profiles lock before decoy unlock; late replies remain owned and
cannot revive a retired app. Sweep plans/reminders are LOCAL, encrypted, explicitly
cancelled/reviewed and have no executor, standalone transfer intent or signature.
The five-attempt UX limit applies only to decoy credentials, never recovery/exits.
Root owns the compound advanced-package guard and command/CI enrollment.

T60 remaining_liquidity owns new packages/liquidity only. Exact integer zero-fee
local accounting and <=256 lifetime reservation/nonce identifiers preserve
conservation and all-or-nothing mutation. Unknown native outcomes require
reconciliation and never expire into automatic resend permission. Independent
Python vectors complement model tests. Signature domains, atomic vault/basic
escrow funding, token policy and native reorg/refund contracts remain exact
missing decisions; no custody, LP share or basic partial-fill behavior is added.

T61 chain_reader performs read-only executable formal/property intake after T51
review. Root must approve exact source/property/tool scope before new tests or
pipeline changes. Actual canonical escrow behavior, separate isolated profile and
professional qualification remain distinct.


T55 repair ownership transferred to root while the original author was inactive
at the concurrency limit. Branch_inventory remains the distinct reviewer. Root
repairs cover pre-reflection physical admission, retirement after clocks, finite
closed notifications and final native observer publication. The separate G05
primitive was independently reviewed by root and committed as 7f5c8c5, permitting
strict immutable documentation regeneration while the remaining slice is reviewed.

T61's admitted five paths are contracts/evm/formal/CanonicalRefinement.t.sol and
properties.json, scripts/formal/evm.mjs and README.md, and one focused script test.
Use unchanged actual BasicEscrow, a source-bound native deferred-credit trace and
split active/pending/paid/surplus liabilities. Pin and verify a local public Z3
artifact under workspace work; no global installation. Bound actual solc SMTLIB2
query/response and solver limits; prove/falsify trivial tool controls first.
UNKNOWN and the strict-terminal-paid model refinement gap remain explicit.
Root owns package/CI enrollment; no professional/custody approval is implied.

T62 continue_chat owns only three new documentation files:
execution/architecture/completion-decisions.md and execution/acceptance/README.md
plus g24-coverage.json. Reuse existing normative ADR/evaluator semantics. Map all
23 G24 requirements and ten specified decisions with exact source hashes,
evidence classes, remaining acceptance, owner and next action. No invented
candidate/report success, reviewer approval, production/provider or physical-device
facts. Final root source/check evidence is a later explicit dependency.

## T63–T72 continuation ownership

Root owns commits, package/CI enrollment, metadata integration and ledgers. T63
remaining_liquidity owns scripts/reputation and two reputation evidence docs;
remaining_privacy independently reviews. Original vulnerable SDK observations
stay passive; experimental overrides cannot inherit vendor support. T64
continue_chat owns six assurance/drill records; review_delivery_docs checks all
rows/anchors. Root refreshes strictly observed hashes after source freeze.
T65 chain_reader owns eight journey/fixture paths; remaining_liquidity reviews
the original 8+11 frozen graph and later actual shared composition.

T66 completion_requirements is read-only until exact G15 admission. Reuse actual
G05/manifest/locator services, preserve null-pin/no-fetch and monotonic accepted
sequence. No missing rotation/archive/deployment contract may be invented.

T67 retention_integration owns storage retention service/test; schema runtime
and index plus new retention test; app-services; runtime app-runtime, endpoint
and pending metadata; Pages, messages, source English and new RetentionPanel;
new native-retention module, retention Worker/native tests and browser fixtures;
narrow existing saved-review deletion tests, native reconcile fixture and
TradePages delete-to-Settings navigation. G01 transfer is limited to identity
service/index and new history-retention test. The purpose-specific Worker-private
port returns authenticated history metadata only; no key getter, generic decrypt
or callbacks with secrets. Offline planning never invokes native authority;
explicit review makes zero journal writes for already-terminal records. Native
closure protects unknown/nonzero canonical pending payout credits. Opaque
previews bind profile/revision/session/selection/age; deletion is one consented
<=256 CAS. Default absent authority stays offline. Old direct saved-review
removal cannot bypass review. No T65 journey edits are authorized.

T68 waits for T67 UI/catalog and T65 signing interfaces to freeze. T69 changes
only meetup tests/fixture and one README paragraph; runtime is unchanged. T70
owns one inert tooling JSON with no speculative engine selector. T71 preserves
its failed source snapshot; reruns need a new corrected frozen revision.

T72 audit_domain_transport owns NEW proof-inputs only: bounded structural
unverified parsers with strict JSON and detached bytes. Local safety conventions
are explicit; semantic catalogs remain empty. No provider/bank/rail/circuit,
commitment selection, VerifiedReceipt or economic authority is admitted. Root
enrolls commands after a different reviewer approves exact frozen bytes.

T73 remaining_privacy owns actual native page-zoom investigation and new verification-only runner if executable tooling works. Device scale/pinch/viewport changes cannot stand in for native browser zoom; no product/locale edits without a coordinated transfer. Root reviews independently.

T74 root owns CI history/literal-child repairs (independently approved); T68 owns vault-only screen option, root its origin-screen consumer. T75 remains read-only pending admission. T76 owns only new arbitration payment-assertions module/test, narrow index/README/shared ReferenceAction extension and new meetup signaling-model/test with narrow index/README-POLICIES. No actual source authentication or signaling execution/restart/durable-wire claim; private byte equality cannot trust an imported artifactHash. Root reviews separately.

T78 native process cleanup test repair is accepted; runner behavior is unchanged.
T79 pinned Foundry CI setup and immutable metadata bindings independently reviewed.
T80 draft_contract and T81 privacy_selector are read-only until explicit source
admission; no duplicate ownership of T82 runtime integration. T82 transfers
packages/schemas/src/runtime.ts; apps/web/src/runtime/{app-runtime.ts,
pending-metadata.ts,worker-endpoint.ts}; apps/web/src/app-services.ts;
apps/web/src/ui/trade/TradePages.tsx plus its NEW favorites package/component/
tests/native harness. Root retains schemas/index.ts, main.tsx, App.tsx, Pages.tsx,
messages.ts, English catalog, CI and task ledgers. T83 cleanup_debug owns NEW
sharing/generic-app-link.ts, GenericAppShare.tsx, generic-app-share test and native
runner only. Root enrolls trusted main entry URL through App to Settings.
T84 review_intakes owns no source: final source/spec gap intake only.

T85-T87 are reviewed committed fixes. T88 independent acceptance remains root.
T81 shared runtime/schema/AppServices paths are released to T80; T81 retains
journey-worker/screen fixtures and narrow native-contracts/vault-composition/
private-trade forwarding until actual selector proof freezes. T80 owns named
draft-library runtime operations, TradePages/review-controller/demo/testnet/
saved-review and existing saved-review browser/exchange-native harnesses.
Root owns main/App/Pages/copy/facades/CI/ledgers; live copy is source-draft only.
T89-T92 are finite T84 follow-ons; no duplicate kernel/evaluator, SDK init,
production authority or fabricated qualified result is admitted.

All T80–T83 implementations are frozen and in distinct final review.
T80/T81: audit_optional; T82: audit_build_ops; T83/T89: draft_contract.
Root owns the T83 clipboard route-remount repair and catalog revision3; no other
App writer is active. T38-G whole App review is frozen, with those deltas read.
T38-H review_intakes now owns read-only maintained helper/vector/tool review.
T90 passive intake and T91 finite partition evidence are integrated; all three
partition target attempts are spent and must not be repeated. T92 remains the
existing-runner outage check only. Root final native CLI run refused DIRTY_SOURCE
before deployment; retain that refusal and rerun only on a committed clean source.
Root added favorites/share browser aliases to the already CI-enrolled web suite;
no dependencies, scanner rules, pins or release authority changed.

T93 review_intakes exclusively owns scripts/check-import-boundaries.mjs,
scripts/tests/import-boundaries.test.mjs, scripts/vectors/check_g16_evm_openssl.py
and scripts/tests/test_g16_vectors.py. T88 canonical relay diagnostic follow-up
is exclusively audit_optional: packages/relay/src/{nip01,pool}.ts and existing
packages/relay/test/{ad,pool}.test.mjs; ad.ts remains unchanged and inherits the
bounded parser. Root independently accepts each repair. T93 is audit-tool work;
no speculative favorites/retention integration was admitted.

T93 source fixes passed distinct root8 boundary cases plus4 Python cases and
actual4-signature verification. Root rejected optional skip on a clean CI image.
T94 cleanup_debug exclusively owns NEW scripts/tests/requirements-crypto.txt,
.github/workflows/{specifications,vault-foundation}.yml, and the existing
scripts/tests/test_g16_vectors.py to make those tests unconditional under a
hash-pinned development dependency closure. Root retains other shared metadata.

T95 draft_contract exclusively owns the nine named ordinal-order files under
its admission; existing canonical byte order and all T91 limits/results remain.
T96 privacy_selector exclusively owns packages/stealth/test/service.test.mjs
and scripts/distribution/browser.test.mjs for explicit real test declarations.
T97 audit_optional is READ-ONLY on docs/formal regex candidates until T95 freeze
and explicit handoff. Root handles all source-path/CLI false-positive dispositions
from the complete50-annotation Sonar packet without weakening gates or scanners.

All T80–T97 source writers have frozen and returned ownership. Root independently
accepted T95/T96/T97; source through cf73208 is frozen. No solver target attempt
remains. Root now owns documentation/bindings, clean-source native/distribution
verification, new empty-clone T71 install/foundation/journey, exact-head hosted
CI/scanner/review dispositions and guarded merge/readback. The whole first-party
source audit covers282 current production/module/tool files and36220 lines;
configuration/selected-test evidence is additional. All30 compatible live branch
heads are ancestors; the separate custodial proposal is preserved.
