# Continuation — generations 35–37 (2026-11-20 UTC)

## Completed local candidate and exact checkpoint

**The local Solana browser profile now composes public proposal decoding,
explicit encrypted admission, original seller-wallet preparation and one-shot
confirmation, uncertainty reconciliation, and finalized-only recovery
promotion.** Corrected combined source
`88bd126bace2b88886017b0ff4eb5daffcdc060e`, tree
`5ecf56b74e82f04b4fed8961179a46bcbd330def`, passed **2,915/2,915 tests**
with zero failed, cancelled, skipped or todo outcomes, plus all six additional
qualification commands. Independent source and composition reviews accept the
corrected source within their recorded scopes. The original passing 2,914-case
run predates a real snapshot-expiry finding and remains separately retained.

This handoff starts from packaged checkpoint
`d77b17e33382a8968b3a71144266d12eb7421085`, tree
`d0512d15929e1e10c66e947b58bc1c904dfcfcb3`. Its **1,043 non-documentation
entries**, including the two Gitlinks, equal the corrected reviewed source.
Against actual published PR241, the complete G35–G37 source delta contains
**21 paths: 11 modified, 10 added and none deleted**; 1,022 parent entries are
preserved. G37 alone changes 16 paths over G36.

The integration plan is **one complete G35+G36+G37 draft candidate above frozen
PR241**, preserving its actual PR240 ancestry. No standalone G35 or G36 PR is
planned. This checkpoint assigns no new PR number or published head. Actual
current-source/current-target hosted acceptance of the new funding/promotion
journey and matching explicit owner authorization recorded in that PR remain
required under Tier C. **`ReleaseEnabled=0`.**

The [corrected qualification](qualification-generation37.json),
[retained-log index](retained-logs-generation37.json),
[independent source review](SOLANA_BROWSER_FUNDING_FLOW_INDEPENDENT_REVIEW_GENERATION37_20261120.md)
and [composition review](SOLANA_BROWSER_FUNDING_FLOW_COMPOSITION_REVIEW_GENERATION37_20261120.md)
bind the claims below to exact sources, commands, times and retained artifacts.

## Source lineage and evidence mappings

| Slice | Original source | Integrated qualified source or preserved identity |
| --- | --- | --- |
| Published G32–G34 parent, PR241 | `29491c2842e0aedcb00a674cbfffb9edc2424013` | Actual ancestor; tree `484aed89e4839dd914e430f77b474e3c4c1549db` |
| G35 proposal codec | `4228040248963389d7dae28881f1db2927ca54ec` | `ea3ee7f5b5d36456616bd9fef893257327560a10`; final G35 package `98f75c23fe0db47f28fa5d7221048b631bc68b96` |
| G36 application admission | `3283940bae1a2d4e7baabed66878ecb5d977bfb1` | `54fb841a5d182da2929d71cbde087adea55e115f` |
| G36 native admission companion | `d36be3c5348b94d39836b73a3e0b9e864ff0a669` | `b785a01ffc54a75d497641d0e758d077adff41d0`; final G36 package `b94066283fe33bc8174ab72e5539a2fa98da92c5` |
| Actual main-merge evidence | Earlier PR236 acceptance and branch reconciliation | Documentation-only `1dd6a00cb24547ffe80cf0b33ff9b9beec035be4` above the G36 package |
| G37 initial application | `107ce93d030298f2668285067e156979c883184d` | `157524b6209f32338f60760bff4d1e8c012e0d97` |
| G37 native companion | `d8dbf9e82743fd670c7d3af80a024720cbfb0538` | Initial combined `dcdb86d19b8d1e1b09cd12a0f5cbf9626eff0fd3` |
| G37 snapshot correction | `3ccf809e01e729980b3ab5fbe12ba3993fbe9982` | Corrected combined `88bd126bace2b88886017b0ff4eb5daffcdc060e` |
| Independent corrected source | `28fa8516d2e1f26740a5370077f9b2fdbaa2c086` | All 1,043 non-documentation entries equal the corrected root source |

Mapped commits retain the exact original source patches; their commit IDs and
complete trees differ because their parents and documentation differ. The
initial native-author combination `b695834c35e458ef36dd711ab82938d2eaf3f248`
and initial review combination `cbda12a11c24014e2a791d058460e642bad9f995`
share complete tree `1549b5ba9077244e43720edbb1072eceeb6abb60`. Their initial
source entries equal root `dcdb86d`; the later three-path correction has its
own source and qualification. Current main is recorded separately and is not
misrepresented as the immediate parent of this frozen stack.

| G37 evidence | Original commit | Root mapping |
| --- | --- | --- |
| Initial application report and receipt | `cc144c69b7ee190880aff7f51a86d74fde863522` | `0413b336780f4b6f90b429272f7e9fd865182c11` |
| Native companion report and receipt | `3be8f3e439ab8101bfd0545774dfb4461a924cdd` | `1104afcdc2c1605e5dfdb5947dd7303d028547ff` |
| Corrective report and receipt | `12f7d98ba7f133da77d18c62df790c957df93b1c` | `3ce32d67bccc1e917fc52e8a726ccd07726148f8` |
| Independent source review | `62e9e5147e0bfd31f5d2e95e14001672256ca766` | `9fe97a05759980f445d63231ede47edef9038261` |
| Independent composition supplement | `9e3b3c81a382020ab69cef616e4f89ea2cf852e7` | `b1ea14be9ec1831f90aceca530e348d07a55a016` |

Earlier author/reviewer mappings remain in the
[G35 qualification](qualification-generation35.json),
[G35 composition index](solana-funding-proposal-composition-review-generation35.json),
[G36 qualification](qualification-generation36.json) and
[G36 composition index](solana-funding-admission-composition-review-generation36.json).
The G37 index retains separate immutable source, correction and evidence
mapping records. No original source identity or failed execution was replaced.

## Proposal data and encrypted admission

G35 adds the exact **4 KiB public proposal** and **8 KiB private record** codecs.
The public format is `p2p-offramp/solana-local-funding-proposal/v1`; it carries
all 15 immutable G16 terms. The private format is
`p2p-offramp/solana-local-funding-proposal-record/v1`. Binding and deterministic
record identity are derived and revalidated, including the full registry and
deployment identity. Own-data snapshots precede asynchronous hashing; nested
returned data is immutable. Private records retain their original nonzero
profile/configuration provenance. Stored endpoints and margins are historical
data and never install configuration. Canonical expired, historical and
non-core terms remain readable; the existing G34 planner decides funding
eligibility. See the [codec report](SOLANA_FUNDING_PROPOSAL_CODEC_GENERATION35_20261120.md)
and [independent codec review](INDEPENDENT_FUNDING_PROPOSAL_CODEC_REVIEW_GENERATION35_20261120.md).

G36 adds explicit `funding.proposal.import`, separate private proposal
inventory and maintained UI admission. Exact command parsing bounds the text;
the codec also enforces the UTF-8 byte limit. Admission performs **one encrypted
CAS and no proposal RPC, wallet connection or preparation**. An unpaired canonical exact
duplicate returns the saved record without rewriting its bytes or original
provenance, including after restore, configuration change or capacity changes.
A retained funded recovery blocks proposal import for that binding, including
reimport of identical public terms: the command returns `CONFLICT` without
rewriting the existing proposal or its original provenance.

The quota is **eight distinct full bindings** across proposals and funded
recoveries; a paired proposal/recovery counts once. Existing overflow remains
loadable, readable and recoverable. Maintained binding checks and actual escrow
reservations prevent registry aliases from admitting conflicting trades.
Unknown occupied deterministic record IDs refuse overwrite regardless of record
kind. A valid funded-recovery import can prevail over a conflicting unfunded
proposal when the existing capacity rules permit it. Staged activation and
post-await epoch/session/lease/revision guards keep stale writes out. Historical
configuration mismatch remains readable without installing saved settings.
The [admission report](SOLANA_FUNDING_ADMISSION_GENERATION36_20261120.md),
[driver report](SOLANA_FUNDING_ADMISSION_BROWSER_DRIVER_GENERATION36_20261120.md)
and [independent admission review](INDEPENDENT_SOLANA_FUNDING_ADMISSION_REVIEW_GENERATION36_20261120.md)
record those exact contracts.

## Original funding authority, observation and promotion

G37 adds dedicated `funding.wallet.connect` and `funding.prepare` commands
keyed by the private proposal record ID. `RecoveryAction` and `review.prepare`
remain exit-only. Private ownership retains the original saved proposal,
original bound trade, actual wallet session, native client, profile/session and
epoch. The private review retains the original `PreparedSolanaFunding` handle.
Confirmation consumes the public review before awaiting and calls that same
client and original handle only after current ownership checks.

G33's immutable display projection now has real facade and application
consumers. The review shows full fixed terms, both deadlines, native principal,
seller source, installed binding metadata, original message/blockhash and
qualified height metadata. Fees, rent and total debit remain unknown. Display
copies and supplied metadata grant no confirmation authority or peer acceptance
and prove no funding outcome. The document client explicitly recognizes the
new command grants and redacts proposal wallet ownership while blocked. The
existing bridge retains one physical pending prompt and exact one-shot
account/chain/message consent even after logical revocation.

Activation, unlock and restore may load validated journal display without
proposal-side RPC. Explicit refresh uses reconciliation while a live review
owns the proposal; it does not cancel that original handle through recovery.
Without a live review, native recovery retains its same-profile orphan and
foreign-origin uncertainty distinctions. Existing 60-second freshness applies.
Pending intents block new preparation. Definitively dropped funding requires
an explicit predecessor-bound rebuild; observation never automatically resends
or replaces a transaction.

Recovery promotion requires a **trusted finalized matching native escrow
observation**, validated through the maintained recovery-exit boundary. A
signature, wallet approval or prepared/signed/sent/unknown journal state is
insufficient. Existing recovery role and origin are preserved. Otherwise the
controller captures the revision before checking the ordinary deterministic
recovery ID, refuses unknown occupied records and uses that same revision for
one guarded CAS. Storage, revision and lock failures reach revocation rather
than being swallowed as observation failures.

The new recovery record uses seller role and the original proposal provenance;
a newly prepared intent after restore may correctly use the current profile.
The proposal bytes remain intact. Validated pending intents accompany promotion
and continue gating settlement. Quota counts a pair once even in legacy
overflow. Existing explicit public recovery-import provenance stays unchanged.
The [initial application report](SOLANA_BROWSER_FUNDING_FLOW_GENERATION37_20261120.md)
and independent source review retain the complete ownership and storage proof.

### Real finding G37-R1 and corrected qualification

Independent review found a **P2 snapshot-expiry exception** after the initial
2,914-case suite had passed. Snapshot admitted an open session, then its
proposal ownership projection performed another authority-bearing currentness
check. Crossing the idle deadline during that second check revoked the session
while the outer snapshot still expected it to exist, causing a `TypeError`.

The correction separates pure retained-reference comparison from action-side
currentness validation. Snapshot uses the pure comparison after admission;
preparation, confirmation and all other authority-bearing paths still perform
the original currentness check. A view sampled immediately before expiry may
be coherently ready; the next expiry-observing view must be fully locked and
redacted. The maintained regression verifies the subsequent funding command
returns `LOCKED` with no extra RPC, preparation, signature or send.

The original independent 0/1 reproduction and maintained pre-fix 0/1 regression
remain preserved. The author then passed **100/100** selected cases on the exact
corrective tree, and independent review passed **38/38** on its corrected
composition: 27 maintained controller cases and 11 independent probes. Root
then ran the new full **2,915/2,915** qualification. The
[correction report](SOLANA_BROWSER_FUNDING_SNAPSHOT_CORRECTION_GENERATION37_20261120.md)
records the narrow three-path change and unchanged action-side guards; the
initial passing suite is historical evidence, not corrected-source acceptance.

## Separate native funding proof and unchanged financial assertions

The native companion adds a fixed `assertSolanaFundingSendMarked` oracle. It
re-decodes the actual saved proposal, requires a unique durable funding marker,
checks current-profile intent provenance and the proposal's separately retained
original provenance against the full installed binding, verifies native seller funding from absence,
and checks the canonical signed transaction against the maintained message
recipe. An independent OpenSSL Ed25519 verification also runs for accepted
proofs. Physical signatures are consumed only after successful verification.
No arbitrary action allowlist is added to the existing exit oracle.

The original exit-only verifier remains byte-identical: 2,272 bytes, SHA-256
`5d1c14b9d969498fec7cf3311eb1f2c3a5f825617cc78d9dc258244a52e78c5d`.
Both existing retained-record readers and the original per-trade financial
assertions remain unchanged. The driver places one new saved-proposal funding
journey early within the existing acceptance window. Its reviewed contract is
**eight sends: one fund plus seven original exits; nine prompts: one fund plus
eight original prompts**. It checks exact seller principal/rent/fee debit,
unchanged buyer balance, escrow ownership and decoded terms, finalized
promotion, public recovery export and unchanged proposal backup.

The existing withheld acknowledgment, unique physical attempts, revoked prompt,
refund/payout balances, chain-time margins, deadlines and long refund waits
remain intact. The new finalized fund is separate from the original release
intent used by the cancellation assertion. No new exit or long refund wait is
introduced. These are maintained driver assertions; this checkpoint does not
claim that the new native journey executed.

The [native companion report](SOLANA_BROWSER_FUNDING_NATIVE_COMPANION_GENERATION37_20261120.md)
records **19/19 selected cases: nine new and ten existing**. Its strict
build-only compilation ran on original combined source `b695834c`, with
**70 tracked inputs, three chunks, 429,784 decoded bytes and zero warnings**.
The output was never evaluated. Independent review verified all 70 input hashes
still match the corrected composition, including the actual command parser;
no second companion compilation is claimed. Root's separate updater
preparation compiles 37 modules and also has `nativeExecuted=false`.

## Qualification, overlapping selections and retained failures

| Full root qualification | Exact source | Result | UTC run window on 2026-11-20 |
| --- | --- | --- | --- |
| G35 codec | `ea3ee7f5b5d36456616bd9fef893257327560a10` | 2,817/2,817 plus six commands | 20:20:56.607376–20:22:47.602832 |
| G36 admission and native companion | `b785a01ffc54a75d497641d0e758d077adff41d0` | 2,864/2,864 plus six commands | 20:40:35.918385–20:42:30.030745 |
| G37 initial, superseded by G37-R1 | `dcdb86d19b8d1e1b09cd12a0f5cbf9626eff0fd3` | 2,914/2,914 plus six commands | 21:14:34.454707–21:16:32.867353 |
| G37 corrected, accepted locally | `88bd126bace2b88886017b0ff4eb5daffcdc060e` | **2,915/2,915 plus six commands** | **21:28:47.204447–21:30:43.229465** |

All four runs have zero failed, cancelled, skipped or todo cases. Each also
passes all four TypeScript projects, 58/58 build-policy cases, import boundaries,
default/demo builds and strict build-only updater preparation. Boundary counts
are 244 production files / 155 core modules for G35 and 244 / 157 for G36/G37.

Focused selections retain their own sources: G35 author **82/82** and reviewer
**96/96**; G36 author **153/153**, native helper **8/8** and reviewer **168/168**;
G37 initial app **208/208**, native companion **19/19**, corrective author
**100/100** and corrected independent review **38/38**. G37 adds 41 initial app
cases, one corrective maintained regression and nine new native cases. The
native selection's ten existing cases are not new coverage. These selections,
full suites and build-policy cases overlap and are never added together.

| Retained failure history | Resolution and attribution |
| --- | --- |
| G35 missing codec and first normalization result | Original 1/78 and 77/78 runs remain. Narrow error normalization and four additional cases precede the final 82/82. |
| G36 missing admission and helper baselines | Missing-command failures remain. A native 4/7 baseline had negative cases accepting an absent helper; corrected presence checks produced the genuine 1/7 baseline before the final helper selection. |
| G36 composition bookkeeping | An ephemeral P256 corpus fingerprint prevented whole-preparation equality, then a later coordinator-index append prevented whole-snapshot equality. Original verifier failures remain; stable fields, captured index entries and exact later documentation mappings are verified separately. |
| G37 application fixtures | Original seven missing-command failures, 6/7 same-slot finality failure, 0/1 diagnostic and 37/41 wallet-feature failures remain. Fixtures advance the synthetic slot and advertise required legacy transaction support; production guards remain unchanged. |
| G37 native helper baseline | The original 2/10 missing-helper baseline remains beside the later 17/17 and 19/19 selections. The final 19 include nine new cases and ten existing cases. |
| G37 independent probes and evidence tooling | Original 18/19 oracle assertion, 119/120 same-slot promotion selection, 0/1 diagnostic and two evidence-verifier failures remain. Maintained-parser refusal, later-slot promotion and original compressed artifact naming are attributed correctly; no initial selection is relabeled a single wholly passing run. |
| G37-R1 production defect | The original snapshot exception and maintained pre-fix failure remain beside the exact correction, independent 38/38 and fresh root 2,915/2,915 result. |

The corrected full-suite log is **288,677 bytes**, SHA-256
`3982d7a24d64c9519c574761ca99ea24cc003153c59b214037e873bafe147420`.
The initial G37 full log is **288,552 bytes**, SHA-256
`5a60c32e58ea84ce6e24f74e898201f33cdaea165837def7a6904c62b62b70b2`.
G35's full log is 279,096 bytes, SHA-256
`98091a8713b228442f58982c8b4f0abc632a9c6c223a371472b272b39e1f4e59`;
G36's is 283,891 bytes, SHA-256
`d7848eb158610f183e7be22060490860ae940ff4d292b47c349b584e627244c1`.
The [G35 logs](retained-logs-generation35.json),
[G36 logs](retained-logs-generation36.json) and G37 log index retain complete
outputs with separate raw/compressed lengths, hashes and zero gzip timestamps.

Source review verifies **98 upstream artifact records and 27 execution
snapshots** across the initial application, native companion and correction.
The initial four evidence mappings contain **189 documentation paths and 181
artifact records**, including the independent source review; these counts refer
to their respective retained scopes. The separate composition supplement
checks both full runs and both 27-file ordinary output sets. Root subsequently
executed the reviewed packager, SHA-256
`af1911e6d316514cad328740b24aa1eb73fd39a3a582d7a08b67c79f2468c296`.
Its final 55-document package contains **53 gzip artifacts: seven corrected
logs, 36 initial-run artifacts, six mapping records and four separate
parent-gate artifacts**. The two JSON indexes complete that package. The
supplement's earlier read-only packager review is not misreported as execution.

Default ordinary assets remain **12 entries / 817,257 bytes**, with
102/30/4 document/vault-Worker/QR graph modules. Demo remains **13 entries /
829,355 bytes**, with 104/30/4 modules. Including their separate local build
receipts, there are 27 actual output files. Initial and corrected G37 outputs
are byte-identical; listed assets and graphs also match qualified G36 and G34.
Connection origins remain empty, `connect-src 'none'` remains, and release
acceptance stays false. The separately configured Solana profile remains
outside these ordinary graphs. Controlled tests and unchanged build outputs
do not establish native browser, validator, physical-device or peer acceptance.

## Actual main consolidation and remaining branch gates

[PR236](https://github.com/djshellshoxxx/p2p-offramp/pull/236) **actually merged
at 2026-11-20T21:02:46Z**, producing main
`01f6f4feca051d68de24a04299cd3bb444bce40c`. Its qualified synthetic proposal
was `af2750c21f47f59898e3a7d8670509095e2dcf94`; merged and qualified tree
`437323a382952b9623a875c818f8af005a5d4563` matches exactly. Ordered parents
are previous main `8e836baa877b676a863c877003e277b638fc5061` and frozen PR236
source `d9ddcf53d82100f05de7346143a0ad00d43c2c1a`. Actual source ancestry,
API readback and fetched Git objects are retained in the
[main-merge report](CONSOLIDATION_MAIN_MERGE_GENERATION28_20261120.md) and
[machine-readable proof](generation28-main-merge.json).

All 15 hosted checks plus Snyk passed on that earlier candidate. Its actual
Solana program job `136482560338`, run `44792219517`, retains the native client
62 checks / 13 sends / 1,907-second journey including the real 1,852-second
refund wait. The client used its documented localnet-only synthetic-genesis
response shim. The separate actual browser receipt has six journeys,
2,051 seconds, eight prompts, seven sends including withheld acknowledgment,
and an empty fixture-error array. It used the actual module Worker, encrypted
IndexedDB, real genesis RPC and real clock without warp. These receipts have
their own older source; they establish neither G37 acceptance nor public-network
or fresh-negotiation qualification.

PR233 was automatically marked merged through containment. PR234 and PR235
were closed as superseded, not separately merged. Their original source
branches and exact heads remain preserved: PR233 `92663e46508b06645111d9c713beb82d3a6d1a0f`,
PR234 `477777dc152cd3148ba7f25a75ce8f00dc1b03b5`, and PR235
`bca96b796db18d69563ae5f0395452494a0dacd5`.

| Remaining published branch | Frozen head and target | Required continuation |
| --- | --- | --- |
| PR237 retention | `33232f62dc9cd250528ef3eb0313c0c319d99495`, now targeting main `01f6f4feca051d68de24a04299cd3bb444bce40c` | Verify the actual current-main proposal and applicable source/target gates; obtain the standalone named review. |
| PR238 sharing | `1c658181fb2bd04ffc4df0d0fbdf6735da3e7fce`, targeting PR237's branch | Keep separate Tier B named review; reconcile target after its parent merges. |
| PR239 startup | `708a3a2bc167cbbc15eaa3d3c168e058499c7f8e`, targeting PR238's branch | Keep separate Tier B named review; reconcile target after its parent merges. |
| PR240 original native funding | `7bd5cf595bddadaa204e51e418d0060a1d43a1bc` | Draft, held and unmerged under the complete PR241 candidate; preserve its branch and ancestry. |
| PR241 G32–G34 funding | `29491c2842e0aedcb00a674cbfffb9edc2424013`, targeting frozen PR239 | Preserve the published candidate and its own Tier C checks, actual SOL/SPL prepare-and-confirm acceptance and matching recorded owner authorization. |

The coordinator's **21:33:07 UTC** readback is retained among the
[G37 parent-gate artifacts](../execution/continuation-generation37-20261120/parent-gates/g37-parent-gate-readback.json.gz).
It records all **12 PR237 checks successful**, including the program job that
completed at 21:32:54. However, proposal
`b7fb1df14ee20c17516b776627d27fb8b8b39fe0` still has PR236's old source
`d9ddcf53` as first parent, so an actual current-main-target proposal remains
unverified. The owner-account coordination comment `7051081814` is not a
qualifying review. The required standalone **CodeRabbit or Qodo pass with
findings answered** remains absent for PR237–239. PR238/239 comments and
reviews were empty at the recorded observations. These dated facts are not a
fresh remote readback by this handoff worker.

The same snapshot records PR241 with two successful checks, two running and
eight queued; its head/target/proposal identities remain unchanged and no
matching owner approval is recorded. PR241's actual proposal is
`2cf3091e9e7470e93b031ffe50e46bef18c06416`, with ordered parents
`[708a3a2b, 29491c28]`. Keep the new complete G35–G37 candidate above PR241 and
qualify its own actual source and target. Parent acceptance never substitutes
for the new browser funding/promotion journey. The
[accepted detailed D8 packet](../adr/proposed/D8-merge-policy-and-branch-protection.md)
retains those separate Tier B and Tier C gates.

G38 portable-proposal work has a separate active author and is absent from this
package; no G38 completion is claimed. Bilateral acceptance, public-network
qualification, production trust, release/deployment, optional PR224–232 and
audits184–186 retain their existing scope and owners. Continue from the frozen
corrected source while preserving these independent acceptance boundaries.

## Historical suffix preservation and handoff checks

Only this continuation and prepended current sections in the two documents
below belong to this handoff change. Their entire prior byte streams from
packaged checkpoint `d77b17e33382a8968b3a71144266d12eb7421085` remain exact
historical suffixes, including superseded status and ownership statements.

| Historical suffix | Bytes | SHA-256 |
| --- | ---: | --- |
| [CONSOLIDATION_HANDOFF.md](CONSOLIDATION_HANDOFF.md) | 97,509 | `08dffed3501b2c7ff640fb9763a844166cb8f013acf7c53795cee5c5d6f21c36` |
| [FEATURE_MATRIX.md](FEATURE_MATRIX.md) | 68,067 | `462b64d171beeab9cd77c807446c063ea9dafaa97f3b4e8c019b6c8aeb1aee62` |

Handoff verification is limited to exact three-document scope, local link
resolution, suffix byte/hash equality, preservation of all 1,043 source entries
and full whitespace checking against actual main `01f6f4feca051d68de24a04299cd3bb444bce40c`
without exclusions. This documentation work runs no tests, builds, browser,
validator, financial journey, dependency installation or remote action.
