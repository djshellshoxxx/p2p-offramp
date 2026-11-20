# Generation 33 independent native funding display review

## Result and exact source

No actionable source finding was identified. The frozen final source is
`448cdcc2a9d13109421f21eaa1107936da0ac5c8`, tree
`93412d5a9c5badae03ab3a239fc5b44d7042a21d`. It adds an inactive, native-SOL-only
projection of supplied prepared-funding data into a complete immutable display.
It creates no application route, command, grant or confirmation authority.

Independent validation passed **107/107 cases** on the format-corrected source
`31ae6627a6b14a4ef40f7d81c98b04470a30aa1a`, tree
`44d8e88b8880f2f971aeafa8e64d3887463db4be`. The final commit strengthens one
JavaScript purity test with an observed-operation counter and a zero assertion.
All production and every other tracked entry are byte-identical. That tightened
case passed independently as a separate **1/1 targeted command** on the final
source. These overlapping results are not a claim of one 108-case run or a
107-case run on the later source. The package TypeScript project passed on
`31ae662`; its TypeScript inputs remain exact on the final source.

The initial feature commit is `b8792ac4088f75603be8e0b40ba1506f2fb137f2`, directly
above combined G32 source `5f9fd0a0f2f6d5bf16bcc21fb38a5e2ae0559031`. The complete
G33 delta adds `src/funding-review.ts` and `test/funding-review.test.mjs`, updates
the package README and adds exactly the new filename to the existing boundary
inventory. All **3,097 other baseline entries** retain their mode, type and Git
object identity; no entry is removed. The final source contains **1,032 entries
outside `docs/`**. Full whitespace against main
`8e836baa877b676a863c877003e277b638fc5061` passed without exclusions.

## Review findings and contract

The helper checks the existing `isBoundSolanaTrade` identity before reading
trade fields. It requires native SOL with nine decimals, snapshots the complete
prepared view, binding and shape through the maintained own-data-descriptor
helper, and rejects inconsistent action, role, expected absent escrow, fee payer,
program, escrow, binding and funding source. Own accessor fields are refused
without calling those getters. The documentation accurately avoids promising
that arbitrary caller-created Proxy traps are inert.

Canonical base64 decoding and the existing legacy parser and `verifyPlanMessage`
check the exact native funding message. The verifier rebuilds the maintained
single funding instruction, including the bound fixed terms, and requires exact
bytes; this change adds no encoder or alternative transaction policy. The
supplied blockhash must match the encoded blockhash. Invalid inputs produce one
fixed `INVALID_INPUT` error without a generated operation identifier.

The result consists of fresh frozen records and scalar values. It includes
network/genesis, program/deployment identity, ProgramData and artifact pins, the
complete fixed terms and commitments, exact principal and native asset, both
deadlines, escrow, seller source, fee payer, exact message, blockhash and supplied
last-valid height. Fees, escrow rent and total debit remain unknown rather than
being inferred from principal. No RPC, wallet, journal, clock or randomness is
part of the helper.

The most significant review boundary is visible in the exported type, runtime
values, README and maintained tests, rather than only in this report:

- `validation: 'data-consistency-only'` and `confirmationAuthority: false` state
  that the display is not a native client's private prepared capability.
- Deployment pins are labeled `supplied-bound-trade`. The G32 prepared view has
  no original registry-pin snapshot. A separately bound trade with the same
  terms, binding and program but different registry pins can supply different
  pin metadata; message consistency cannot prove original or live chain pins.
- Last-valid height is labeled `supplied-metadata`. It is format-checked and
  copied exactly, but is not encoded in the transaction message. No blockhash
  freshness, RPC provenance or remaining eligibility is asserted.
- Consistently copied or rebound display inputs and cancelled handles can remain
  data. They do not acquire the original per-client WeakMap capability. The
  maintained real-client tests reject the projection, serialized projection and
  copied prepared input for confirmation or cancellation, while preserving the
  original handle's separate lifecycle.
- Counterparty acceptance and funding outcome remain `not-established`. The
  effect describes funding fixed escrow terms without claiming peer acceptance,
  finalized funding or settlement.

These limits match [accepted D5 and D1](../adr/ACCEPTED-DECISIONS-2026-11-04.md).
The [funded recovery browser contract](../consolidation/SOLANA_BROWSER_RECOVERY.md)
continues to require an already funded escrow. Its protocol, import/restore
rules, controller, wallet bridge and physical prompt handling are unchanged.
The localnet facade, signing/confirmation algorithms, registry configuration,
programs and native driver also retain their baseline entries. Actual browser
funding admission remains separate work with its own provenance contract.

## Independent verification

| Check | Actual result |
| --- | --- |
| Source and correction identity | Exact four-path baseline delta; exact one-line formatting correction; later change is only the explicit operation counter and assertion |
| Focused selection on `31ae662` | **107/107**, zero other outcomes: 48 projection/control cases, 50 maintained funding cases, five package boundaries and four original probes |
| Package TypeScript on `31ae662` | Passed the root package project; no claim that all four repository TypeScript projects were run here |
| Tightened purity case on final `448cdcc` | **1/1**, zero failures, skips, cancellations or TODOs |
| Complete main-to-source whitespace | Passed on both reviewed source checkpoints without exclusions |
| Author evidence | 26 indexed artifacts, four source hashes, all seven execution snapshots and the separate source/evidence whitespace receipt verified |

The four original probes verify that an original message cannot be rebound onto
a different private-agreement commitment; a structurally valid message carrying
a second funding instruction is rejected; nested descriptor reentrancy cannot
replace already captured message/blockhash values; and maximum supported native
principal plus both u64 height endpoints remain exact decimal metadata without
confirmation authority or a fabricated total-debit estimate. Each relevant probe
checks unchanged journal contents/writes, RPC-call counts, signatures and sends.
They use the actual G32 client with existing controlled ports, without executing
a validator, browser or physical wallet.

The 48-case projection selection includes one maintained G32 fixture control,
so it is not described as 48 independent new product behaviors. Author, reviewer
and later full-suite selections overlap and must not be added together.

## Author evidence and retained corrections

The author evidence commit is `29939815306494ca13a09741eb97c004b0dab781`, tree
`d0e50bc890d84f49972ee006f97358362900426d`, directly above final source
`448cdcc`. It adds 30 documentation paths and preserves all 1,032 non-documentation
entries. The verifier reads the committed artifacts, checks raw and compressed
hashes and deterministic gzip timestamps, then reconstructs every execution
snapshot in a private Git index from the recorded source and exact patch.
All recorded source-file hashes match those reconstructed snapshots. The
separate staged documentation tree preceding the whitespace receipt is also
reconstructed and verified against the final committed evidence.

The original missing-feature baseline reports 48 cases: one existing fixture
control passes and 47 explicit missing-projection assertions fail, with no
module-load error. The first wired command reports 52/53; the only failure is
the existing 120-character package bound, at `funding-review.ts:34` in that exact
uncommitted snapshot. The later feature commit contains two line wraps and more
accurate supplied-metadata wording compared with that snapshot. The independent
checker proves those exact transformations and unchanged remaining entries.
A subsequent recorded formatting pre-check still found a 121-character test
declaration; its compound shell command returned zero after continuing past the
Python assertion. The author correctly retains that transcript as recovered
output rather than an original file capture. The next commit wraps only the
remaining declaration, after which 103/103 and package TypeScript pass.

The final test-only commit improves the purity check: a throwing forbidden-call
stub could otherwise be normalized on an invalid-input path, so the test counts
attempts and explicitly asserts zero. It changes no production or existing
expectation. The author's final projection/boundary command passes 53/53; the
reviewer's targeted command independently executes the strengthened case.

Two reviewer setup/checker corrections remain fully recorded. Dependency
provenance initially sampled the absent legacy `typescript/lib/typescript.js`
path in the installed TypeScript 7 package after worktree/hardlink creation had
succeeded. Its exact original command and recovered tool-result output remain;
the corrected sample verifies the actual installed compiler entry and manifest.
The initial author-evidence checker incorrectly assumed that the first wired
uncommitted snapshot equaled the later feature commit. Its original script and
complete failed log remain. The corrected checker reconstructs the actual
snapshot, proves its exact formatting/wording differences and retains every
artifact and source-hash assertion. No product test failed independently.

The dependency directory is physically separate and reuses immutable hardlinks.
Matching sampled file inodes and SHA-256 values are recorded; no installation or
dependency mutation occurred.

## Evidence and remaining gates

The [machine receipt](funding-review-projection-independent-review-generation33.json)
and [evidence directory](evidence/funding-review-projection-independent-review-generation33/)
retain command/source identities, times, full logs, original probes and all
verification scripts. Compressed logs use `mtime=0` and both byte/hash forms.

This is a bounded independent source and evidence review. It includes no full
repository suite, artifact build, native/browser/validator execution, deployment,
release action or remote mutation. It does not establish runtime integration or
native acceptance for a future consumer. The financial terms-review prerequisite
remains Tier C under the accepted merge policy. Applicable owner authorization
and exact-source/current-target hosted gates belong to the coordinator; no such
approval follows from this review. `ReleaseEnabled=0` and all existing activation
boundaries remain unchanged.
