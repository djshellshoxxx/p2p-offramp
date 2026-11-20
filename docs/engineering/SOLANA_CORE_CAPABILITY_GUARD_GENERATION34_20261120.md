# Generation 34 — core-only Solana funding policy

## Result and exact source

The shared Solana `planFund` boundary now enforces accepted D4 Option C. New
native SOL and original-SPL funding requires the hash of the maintained
count-zero capability encoding. Every other commitment returns
`UNSUPPORTED_PROVIDER` before intent preparation, blockhash acquisition, wallet
signing or sending. Direct funding, prepared funding and confirmation's
replanning all use this boundary.

| Checkpoint | Identity |
| --- | --- |
| Final generation 33 parent | `448cdcc2a9d13109421f21eaa1107936da0ac5c8` |
| Parent tree | `93412d5a9c5badae03ab3a239fc5b44d7042a21d` |
| Frozen generation 34 source | `2c21958684e8943a3058b0195fd310bfeba68866` |
| Source tree | `e37f179bf8af392d884840fb083bc10a5ebff9f9` |
| Full whitespace baseline | `8e836baa877b676a863c877003e277b638fc5061` |

Exactly three source paths change: `packages/chain-solana/src/plan.ts`, the new
`packages/chain-solana/test/core-capability-funding.test.mjs`, and the package
README. The source contains **1,033 entries outside `docs/`**, including the
existing two Gitlinks. Every other parent entry remains exact. This report and
its execution evidence are committed separately from the frozen source.

## Policy and compatibility boundary

[Accepted D4](../adr/proposed/D4-capability-to-terms-commitments.md) requires the
core-only count-zero hash and refusal of other commitments before new funding.
`planFund` derives that value with `sha256(encodeCapabilities([]))`, using the
maintained domain encoder, the installed Noble SHA-256 implementation, and the
existing lowercase hex encoder. It introduces neither a new hash format nor a
literal replacement hash. The encoding is one count byte, `0x00`; its SHA-256 is
not the all-zero 32-byte value.

The guard follows the existing branded trade/snapshot, margin parsing, seller
role and occupied-escrow checks. Their earlier refusals retain their ordering.
For an otherwise eligible seller with an absent escrow, the policy check precedes
the funding-window and message construction steps. Confirmation's existing
replanning before and after a wallet response therefore shares the same policy.
No change is made to the generation 32 prepared-capability API or ownership rules.

The guard belongs at new funding planning. Binding, unsigned instruction
encoding, exact-message verification and historical journal decoding continue
to represent opaque commitments. Existing release, refund, payout and recovery
can still inspect and reconcile historical trades. A historical decoded record
does not become a private confirmation capability, and recovery never acquires
permission to fund or automatically resend.

Generation 33's pure display helper retains its data-consistency semantics.
Its projection does not authenticate an active prepared capability or current
eligibility. No application command, browser admission, facade, native program,
ABI, registry, trust root, margin choice, optional-module mapping or deployment
changes in this generation. The corrected funding-policy omission predates
generation 32.

## Controlled regression coverage

The 33 added cases use the actual client, maintained scripted cluster, CAS
journal and synthetic Wallet Standard ports. Both native SOL and original SPL
exercise the same policy.

- The maintained G16 Python fixture, independent Node crypto and installed Noble
  SHA-256 agree with `encodeCapabilities([])`. The maintained nonempty capability
  vector is also recomputed; no positive commitment is invented.
- Three invalid commitments are checked at the planner, direct-funding and
  prepared-funding entries for each asset: the maintained nonempty vector, an
  all-zero hash and a one-byte mutation of the core hash. These are 18 refusal
  cases. Each requires zero journal writes, wallet signatures, sends and
  blockhash acquisition calls.
- Valid count-zero trades still produce plans, fund directly, or prepare and
  explicitly confirm. Preparation performs no signature or send. Confirmation
  creates the existing ordered journal transitions and exactly one signature
  and send; duplicate confirmation retains `CONFLICT`.
- Branded-input, wrong-role and occupied-escrow refusals retain their existing
  results for historical non-core terms.
- Historical non-core terms retain release/refund/payout planning. A controlled
  release reconciles to finalized without retransmission. A historical unsigned
  funding record built with the maintained codec parses and verifies, restores
  through the journal and cancels during recovery; attempting to confirm that
  decoded record returns `UNAUTHORIZED` without a signature or send.

## Actual executions and retained failures

The [machine-readable receipt](../execution/solana-core-capability-generation34-20261120/receipt.json)
records eight original command executions, exact Git source, source-file hashes,
dirty-source patches, timestamps, exit codes and full output. Every execution
snapshot was reconstructed in a private Git index from its recorded source plus
retained patch. All recorded source-file hashes matched. The final focused patch
reconstructs exactly the frozen source tree. The subsequent package, typecheck
and boundary executions ran on that clean frozen source.

| Execution | Actual result |
| --- | --- |
| `01-baseline` | 33 tests: **11 pass / 22 fail** |
| `02-corrected-baseline` | 33 tests: **15 pass / 18 fail** |
| `03-guard-focused` | 38 tests: **36 pass / 2 fail** |
| `04-final-fixture-baseline` | 33 tests: **15 pass / 18 fail** |
| `05-final-focused` | **38/38 pass**, zero other outcomes |
| `06-frozen-solana-package` | **448/448 pass**, zero other outcomes |
| `07-frozen-package-typecheck` | Existing project compiler `tsc --noEmit`: exit 0 |
| `08-frozen-boundaries` | Exit 0: **243 production files / 155 core modules** |

The first baseline includes the 18 missing-policy failures and four fixture
assumptions: two duplicate-confirmation expectations incorrectly named
`UNAUTHORIZED` instead of the existing `CONFLICT`, and two expectations for
preparation after cancelling a historical record incorrectly assumed the new
policy refusal already existed. Correcting those expectations produced the
second baseline's 18 policy failures.

The first guarded selection exposed two remaining fixture assumptions. With
the policy guard in place, new preparation of historical non-core terms returns
`UNSUPPORTED_PROVIDER` earlier than the later `CONFLICT` admission check used by
the unguarded parent. That historical test was refocused on its recovery purpose:
the decoded historical record has no confirmation authority. The separate 18
new-funding refusal assertions remain intact. No production change was made to
satisfy the fixture corrections.

The final baseline temporarily restored only the parent's `plan.ts`, while
retaining the final test and README bytes. It again passed 15 controls and
failed the same 18 intended refusal cases. Restoring the guard yielded 38/38
with the five maintained package boundary cases. The full Solana package then
passed 448/448 on the frozen source. These overlapping selections are not counts
to add together or to a later combined suite.

All original outputs and patches, including failed assertions, are retained
unchanged. Every gzip has `mtime=0` and both raw and compressed SHA-256 identities
in the receipt. The npm boundary log retains its existing unknown `http-proxy`
configuration warning. That command still exited successfully.

The separate [source-and-evidence whitespace receipt](../execution/solana-core-capability-generation34-20261120/09-source-and-evidence-whitespace.json)
records the complete staged snapshot before that receipt's own registration,
using the full main baseline without exclusions. The final documentation commit
is checked against the same baseline. All 1,033 entries outside `docs/` remain
exact to the frozen source across evidence packaging.

## Qualification limits and next gate

Dependencies are existing immutable physical hardlinks from the generation 32
worktree. No dependency installation or mutation occurred. The author ran no
full repository suite, artifact build, browser, validator, physical wallet,
external target or native financial acceptance. Controlled tests establish the
client's refusal and compatibility behavior; they do not establish a native
execution outcome, browser funding acceptance or release readiness.

Independent source/evidence review, combined-source qualification, applicable
hosted gates and Tier C owner approval remain coordinator-owned. This defensive
fix does not itself authorize merge, new funding UI or deployment.
