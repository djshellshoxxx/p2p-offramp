# Generations 33–34 — consolidated native funding review and policy

## Result and active consolidation plan

**The frozen funding candidate combines G32 prepared funding, G33 immutable
display data and the G34 accepted-D4 funding guard.** Its exact combined source
passed **2,735/2,735 tests**, with zero failures, skips, cancellations or todos,
plus all six other qualification commands. Independent source, evidence and
composition reviews found no blocking issue within their recorded scopes.

The active plan is one later funding candidate above frozen
[PR239](https://github.com/djshellshoxxx/p2p-offramp/pull/239), preserving the
actual published [PR240](https://github.com/djshellshoxxx/p2p-offramp/pull/240)
head as an ancestor. **PR240 remains draft, held and unmerged. No separate G33
PR is planned.** This supersedes the earlier sequential funding-child plan in
the historical G32 handoff. The replacement candidate has no published head,
PR number or proposed-merge identity at this documentation checkpoint.

| Checkpoint | Exact identity |
| --- | --- |
| Intended target, frozen PR239 head / tree | `708a3a2bc167cbbc15eaa3d3c168e058499c7f8e` / `6916074089257c759f2e9695b30e5bf955eb5258` |
| Preserved actual PR240 head / tree | `7bd5cf595bddadaa204e51e418d0060a1d43a1bc` / `82c0aa18e572313727c880579596b0d6ee4d4834` |
| G33 combined tested source / tree | `a7d2a6699903b3791eda6b5f958b81e31adead6c` / `ac680be624aae21eac610f51157da49f1b3238cb` |
| G34 combined tested source / tree | `0b7832d1c5b348a0755d59152442d0318d4a620c` / `78de2de3db335147d8261ad5ab9b116976faf986` |
| Reviewed G33 author source / tree | `448cdcc2a9d13109421f21eaa1107936da0ac5c8` / `93412d5a9c5badae03ab3a239fc5b44d7042a21d` |
| Reviewed G34 author source / tree | `2c21958684e8943a3058b0195fd310bfeba68866` / `e37f179bf8af392d884840fb083bc10a5ebff9f9` |
| Packaged source and evidence before this handoff / tree | `f6c0a6e0c87249f041ab560cd9900472174b81d5` / `bd20a049b96ee17ec8df841f74ee92508801ffee` |
| Intended funding branch | `codex/native-funding-consolidation-g34-20261120` |
| Current-main observation and complete whitespace baseline | `8e836baa877b676a863c877003e277b638fc5061` |

Publication must map new local commits **from actual PR240 head `7bd5cf5`**,
while targeting PR239's branch
`codex/startup-compatibility-continuation-g31-20261120`. Mapping the existing
PR240 commits again from PR239 would lose the required exact published-head
ancestry. Preserve original branches and heads. After publication, read back
the actual complete source tree, ordered parents and proposed merge; the local
identities above do not predict those new commit IDs.

## Complete source boundary

The candidate changes exactly nine non-documentation paths against PR239:

- `contracts/solana/localnet/client-run.mjs`
- `packages/chain-solana/README.md`
- `packages/chain-solana/src/compose.ts`
- `packages/chain-solana/src/funding-review.ts`
- `packages/chain-solana/src/plan.ts`
- `packages/chain-solana/test/boundary.test.mjs`
- `packages/chain-solana/test/core-capability-funding.test.mjs`
- `packages/chain-solana/test/funding-review.test.mjs`
- `packages/chain-solana/test/prepared-funding.test.mjs`

Five existing entries change and four are added; none is removed. Of PR239's
1,029 non-documentation entries, **1,024 remain exact**. All resulting **1,033
entries outside `docs/`**, including two Gitlinks, equal the independently
reviewed G34 author source. G33 alone added two entries and modified two above
PR240, yielding 1,032 exact reviewed entries. G34 adds only its planner guard,
one test file and README section to that reviewed source.

The [G34 composition review](INDEPENDENT_SOLANA_CORE_CAPABILITY_COMPOSITION_REVIEW_GENERATION34_20261120.md)
verifies all seven G32/G33/G34 source mappings with identical complete binary
patches, expected parent order and preserved actual PR240 ancestry. Its
[receipt](solana-core-capability-composition-review-generation34.json) verifies
all 2,211 original PR240 documentation entries and all 2,297 immediate G33-parent
documentation entries in the tested source. This handoff only prepends the two
current narrative documents and adds this report; their old contents remain
exact historical suffixes.

## G33 display data and retained authority

The package-internal `projectNativeFundingReview(trade, prepared)` requires a
locally branded trade, snapshots the complete supplied view through own-data
descriptors, and validates the exact one-instruction native funding message with
the maintained decoder, parser and `verifyPlanMessage`. It returns fresh frozen
semantic records containing all fixed terms, network/program identity, principal,
asset, deadlines, escrow, seller source, fee payer, message and blockhash.
Fees, rent and total debit remain unknown. There is no facade export, application
consumer, browser command, wallet grant, journal mutation or runtime activation.

The [author report](SOLANA_FUNDING_REVIEW_PROJECTION_GENERATION33_20261120.md)
and [independent source review](INDEPENDENT_FUNDING_REVIEW_PROJECTION_REVIEW_GENERATION33_20261120.md)
state the limits in the code's actual output: `data-consistency-only` and
`confirmationAuthority: false`. Pin metadata belongs to the supplied bound trade;
it does not authenticate the original preparation's pins or live chain state.
Last-valid height is supplied metadata and is not encoded in the message.
Consistent copied or rebound data and cancelled handles may still display.
They never gain the client's private prepared capability, freshness or session
ownership. Counterparty acceptance and funding outcome remain unestablished.
Own accessor fields are refused without invoking their getters; arbitrary
caller-created Proxy traps are not claimed to be inert.

The original G32 handle and unchanged confirmation path retain economic
authority. Preparation persists the exact unsigned message; confirmation
consumes the private handle, checks current ownership and eligibility, replans
before and after the physical wallet response, and retains durable marker and
single-send behavior. The native driver configures its existing SOL and
original-SPL admissions through prepare-and-confirm. Crash and refund retain
direct funding and their original real-time waits. The
[G32 handoff](CONTINUATION_GENERATION32_20261120.md) and
[publication mapping](generation32-publication.json) retain that earlier source
and evidence, with their original dated status labels.

## G34 accepted-D4 guard and historical compatibility

The shared `planFund` boundary derives
`sha256(encodeCapabilities([]))` through the maintained encoder and existing
hash implementation. [Accepted D4 Option C](../adr/proposed/D4-capability-to-terms-commitments.md)
requires this count-zero commitment for new native SOL and original-SPL funding.
The encoded count byte is `0x00`; its SHA-256 is not the all-zero 32-byte value.
Other commitments return `UNSUPPORTED_PROVIDER` before intent preparation,
blockhash acquisition, signing or sending. Direct funding, prepared funding and
confirmation's existing replans all share that boundary.

The check follows existing brand, snapshot, margin, seller-role and occupied
escrow checks, retaining their earlier refusal order. Binding, unsigned codecs,
exact-message verification, journal decoding, recovery and funded release,
refund and payout remain unchanged. Historical non-core commitments remain
readable and recoverable without acquiring new funding authority. The guard
does not belong in those historical codecs. The omission corrected here
predates G32; it was not introduced by the prepared-funding API.

The [guard report](SOLANA_CORE_CAPABILITY_GUARD_GENERATION34_20261120.md) and
[independent source review](INDEPENDENT_SOLANA_CORE_CAPABILITY_GUARD_REVIEW_GENERATION34_20261120.md)
record the narrow three-path change and the actual production call graph.
No native program, ABI, trust, registry, endpoint, production-margin, optional
module or browser-admission change is included. G33 remains a data display for
consistent historical terms as well as current supplied data.

## Verification and preserved failures

| Evidence | Actual result and attribution |
| --- | --- |
| G33 missing-feature baseline | 48 reported cases: one maintained G32 control passes and 47 explicit missing-projection assertions fail. |
| G33 first wired selection | 52/53 pass; the existing 120-column boundary is the only failure. A later formatting pre-check's assertion and zero compound-shell exit remain correctly labeled recovered output. |
| G33 format-corrected author source `31ae662` | 103/103 plus package TypeScript and import boundaries pass. The final test-only strengthening preserves all production bytes. |
| G33 final author source `448cdcc` | 53/53 projection/boundary cases pass, including the explicit forbidden-operation counter. |
| G33 independent source review | 107/107 on `31ae662`, plus a separate 1/1 strengthened purity case on `448cdcc`; these are not one 108-case command or a 107-case rerun on final source. |
| G34 final-fixture baseline | 15 controls pass and 18 intended missing-policy refusals fail. |
| G34 author source | 38/38 focused/boundary cases, 448/448 package cases, package TypeScript and import boundaries pass. |
| G34 independent source review | 100/100 targeted cases, including four original probes, plus package TypeScript pass. |
| Composition reviews | Exact sources, finalized logs, actual assets, graphs and earlier evidence are verified without repeating unchanged suites or builds. |

The G33 [source receipt](funding-review-projection-independent-review-generation33.json)
retains the source-attributed selections, all seven author execution snapshots,
26 indexed author artifacts and the separate whitespace record. Its original
reviewer setup and artifact-checker failures remain preserved with the corrected
source-snapshot proof. The final operation counter prevents normalized refusal
errors from hiding an attempted forbidden operation; it relaxes no assertion.

The G34 [source receipt](solana-core-capability-guard-independent-review-generation34.json)
verifies eight author execution snapshots and 30 artifacts. The initial baseline
was 11/33 passing because four fixture error-code assumptions accompanied the
18 absent-policy failures. The first guarded selection was 36/38 because two
historical-repreparation expectations still assumed the old refusal order.
The final historical control checks decoded-record confirmation refusal while
all 18 new-funding policy assertions remain intact. No production adjustment
was made to satisfy those fixture corrections. All original failures, patches,
optional-tooling diagnostics, recovered transcripts and npm warnings remain
attributed and retained. Author, reviewer and full-suite selections overlap;
their counts are not added together.

The G33 coordinator batch ran **2026-11-20 19:50:36.647345–19:52:30.133476 UTC**.
The G34 batch ran **19:57:58.608276–19:59:53.706252 UTC** on the same date.

| Combined qualification | G33 | G34 |
| --- | --- | --- |
| Full Node suite | **2,702/2,702**, zero other outcomes | **2,735/2,735**, zero other outcomes |
| Configured TypeScript projects | All four pass | All four pass |
| Build policy | 58/58 | 58/58 |
| Import boundaries | 243 production files / 155 core modules | 243 production files / 155 core modules |
| Default assets; document/vault-Worker/QR graphs | 12 entries / 817,257 bytes; 102/30/4 | Identical |
| Demo assets; document/vault-Worker/QR graphs | 13 entries / 829,355 bytes; 104/30/4 | Identical |
| Native updater preparation | Strict 37-module compilation, build only | Same build-only scope |

The [G33 qualification](qualification-generation33.json),
[G33 log index](retained-logs-generation33.json),
[G34 qualification](qualification-generation34.json) and
[G34 log index](retained-logs-generation34.json) bind exact sources, commands,
times and complete outputs. The G33 full log is 271,351 bytes, SHA-256
`faa48d7c0fd6c1f83a28504ca8df02b225d3db3aa4ef3c12078112b32236efce`.
The G34 full log is 274,443 bytes, SHA-256
`5f5d9ed956851e64c842c960bfc933fa0eef53f343a42023eca61c9570ca0940`.
All compressed logs have `mtime=0` and separate raw/compressed hashes.

The [G33 composition review](INDEPENDENT_FUNDING_REVIEW_PROJECTION_COMPOSITION_REVIEW_GENERATION33_20261120.md)
and G34 composition review verify **25 emitted assets, six graphs and 274 module
references**. G34 also rehashes 176 artifacts across eight original G32/G33
manifests and retains all 27 actual default/demo output files, including build
evidence. Default/demo assets and graphs match retained G32/G33 exactly. The
native funding package and inactive display remain outside those ordinary
profiles. Both retain `ReleaseEnabled=0`, unsigned/non-release status, empty
connection origins and `connect-src 'none'`.

The full suite compiles the maintained explicit Solana-localnet profile. The
updater preparation separately compiles and removes 37 temporary modules with
`nativeExecuted=false`. The G32 driver was compiled but never evaluated locally;
its controlled helper probes return actual sent records through a substituted
reconciliation boundary. None of those results establishes native validator,
browser, physical-wallet, finality or prepared-funding acceptance.

## Merge sequence and next engineering work

Keep [PR236](https://github.com/djshellshoxxx/p2p-offramp/pull/236) frozen as the
main-target aggregate for PR233–235 at head
`d9ddcf53d82100f05de7346143a0ad00d43c2c1a`. Its qualified expected-head merge
and main/tree/ordered-parent/ancestry readback precede reconciliation of those
contained PRs. The coordinator's **2026-11-20 20:06 UTC observation** reported
14 of 15 checks successful, with the Solana program check still running, and
main unchanged at the baseline above. This is a dated coordinator observation,
not a new hosted readback or a completion claim by this handoff worker.

PR237 retention, PR238 sharing and PR239 startup remain separate published
parents. Under the [accepted detailed D8 packet](../adr/proposed/D8-merge-policy-and-branch-protection.md),
each standalone Tier B parent retains its **CodeRabbit or Qodo pass with findings
answered** requirement, applicable checks and independent review. Funding
consolidation does not waive those gates. After each parent merge, reconcile or
retarget the next candidate to actual main and refresh source/target acceptance.

The consolidated funding candidate is **Tier C**. Its eventual actual source
and target require applicable green hosted checks, execution of the new native
SOL/SPL prepare-and-confirm admissions, independent review and matching owner
authorization recorded before merge. Local source work, retained evidence,
unchanged artifacts and older-head checks establish neither that hosted
acceptance nor owner approval. Keep PR240 held until its replacement is
qualified and merged; do not delete its branch or original source history.

The next active implementation owner is
`/root/funding_proposal_codec_author_g35`, based on tested source `0b7832d`.
Its frozen G35 scope is an inactive **4 KiB public proposal parser and 8 KiB
private record codec** in the local-Solana app profile. The public document has
only format and all 15 immutable G16 terms; hash and binding are derived.
Private admission provenance is immutable, including original profile identity
across restore. No G35 completion, command, persistence, wallet grant, facade
export, signing path or browser activation is claimed here.

Later work still needs explicit seller-direct proposal admission, a quota across
distinct bindings, escrow-collision handling, immutable duplicate provenance,
current-configuration compatibility, original-handle/session/epoch ownership,
explicit funding review and confirmation, and finalized-only promotion into the
existing funded recovery format while retaining the proposal. The existing
funded-recovery import remains restricted to funded escrows. Parsing, saving,
preparation and sending must not be presented as peer acceptance or finalized
funding. Production trust, further assets/networks, bilateral acceptance and
release activation remain separate. Optional PR224–232 and audits184–186 retain
their existing owners.

## Historical-document preservation

Only this report and prefixes in the two current narrative documents are new.
All 1,033 non-documentation entries remain exact. Complete whitespace checks use
main `8e836baa877b676a863c877003e277b638fc5061` without exclusions. Every
earlier byte in each narrative document is preserved as the following suffix,
including older publication-pending and active-worker status labels:

| Preserved original document at `f6c0a6e` | Bytes | SHA-256 |
| --- | --- | --- |
| `CONSOLIDATION_HANDOFF.md` | 93,393 | `0c80e448993bf7afa36e5152417d3f15d4857a04c8c0b411e56e598e1bf6d8c3` |
| `FEATURE_MATRIX.md` | 63,395 | `1efd3f9dbb33db574ad402c8b0f6693412934ce4bbdf625da8520e7eef950449` |

This documentation worker performed no suite, build, dependency installation,
browser, validator, wallet, external-target or remote action. Its checks cover
the three-document scope, local references, unchanged source identities, full
whitespace and exact historical suffix preservation.
