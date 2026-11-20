# Independent review — Solana core capability guard, generation 34

## Result and identities

**No blocking issue found within the defensive new-funding scope.** The narrow
`planFund` guard implements the accepted D4 count-zero policy without changing
historical decoding, recovery or funded exits. The author source, its separate
evidence history and the independent checks are pinned below.

| Checkpoint | Identity |
| --- | --- |
| Final G33 parent | `448cdcc2a9d13109421f21eaa1107936da0ac5c8` |
| Frozen G34 source | `2c21958684e8943a3058b0195fd310bfeba68866` |
| Source tree | `e37f179bf8af392d884840fb083bc10a5ebff9f9` |
| Author evidence | `853c0b45607eb30f5e438483450c7ab763e6bcfb` |
| Author evidence tree | `1eaffbb7ad676f66b2734639f7235497cd2898c5` |
| Full whitespace baseline | `8e836baa877b676a863c877003e277b638fc5061` |

The source changes exactly `packages/chain-solana/src/plan.ts`, the new
`packages/chain-solana/test/core-capability-funding.test.mjs` and the package
README. It preserves all 3,099 other parent entries, adds one test and contains
1,033 entries outside `docs/`, including two unchanged Gitlinks. The independent
review commit adds documentation only and is separate from the source and author
evidence commits.

The [machine-readable receipt](solana-core-capability-guard-independent-review-generation34.json)
contains exact commands, sources, trees, timings, full-output hashes, scripts and
the author evidence verification. All retained gzip headers have timestamp zero,
and each compressed artifact also records its uncompressed identity.

## Policy and placement

[Accepted D4 Option C](../adr/proposed/D4-capability-to-terms-commitments.md)
requires the SHA-256 commitment of the maintained count-zero capability encoding.
The maintained `encodeCapabilities([])` produces the single byte `0x00`. The
unchanged G16 Python vector, independent Node crypto, installed Noble SHA-256 and
this review's Python `hashlib` calculation agree on
`6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d`.
It is not an all-zero hash. Both frozen Solana terms vectors retain this value.

The implementation derives the value from the maintained encoder and existing
Noble primitive. It refuses another commitment with `UNSUPPORTED_PROVIDER` after
the existing brand, trusted-snapshot, margin, seller-role and occupied-escrow
checks, before the funding-window and message construction steps. Those earlier
refusals retain their ordering. Valid count-zero native SOL and original-SPL
trades retain their existing window, state, role, message and journal contracts.

The placement is limited to new funding. Generic binding, instruction codecs,
`verifyPlanMessage`, intent parsing and recovery must remain able to represent
historical non-core commitments. Moving this policy into those shared functions
would also affect historical records and exits. Those files are byte-identical
to the G33 parent. The omission corrected here predates prepared funding; this
review does not attribute it to G32.

## Actual call graph and signing surfaces

The inspected production call graph has these admission points:

| Entry | Funding policy and authority |
| --- | --- |
| Direct `fund` | `act` reads a trusted snapshot, calls `planFund`, checks payer/role, then prepares the intent and submits. |
| `prepareFunding` | `prepareReview` retains a planner closure using `planFund`; refusal occurs before preparation and journal writes. |
| `confirm` | The original private handle is consumed once. Its retained planner is re-run before physical signing and after the wallet returns, with original message/blockhash equality and authority checks. |
| Recovery | Existing local pre-marker cancellation and foreign-profile reconciliation apply without new funding or automatic retransmission. |

The internal `signWithWallet` helper has only `submit.signIntent` as a production
caller. `signIntent` and `markAndSend` have only the composed client as a
production caller and are not exported by the localnet facade. This review did
not turn those low-level implementation helpers into a new admitted API.

The distinct `solanaTermsConsentRequest` and `solanaPeerAcceptanceRequest`
constructors describe off-chain signing data. The tracked production TypeScript
inventory finds only their declarations, no caller and no localnet facade
export. Their acceptance module is explicitly candidate-only, with economic
preparation disabled. No second admitted signing/funding surface was found that
would justify speculative guard expansion. This is a source inventory plus
manual call-graph review, not a dynamic reachability proof.

## Independent checks and original probes

All checks ran in a new reviewer worktree at the clean frozen source. Existing
dependencies were reused as physical hardlinks with distinct directories and
matching sampled file inodes/hashes; there was no installation or mutation.

| Check | Actual result |
| --- | --- |
| Policy, planner, prepared funding and package-boundary selection, plus four original probes | **100/100 pass**, zero failures, cancellations, skips or todos |
| Package-source TypeScript compiler | `node node_modules/typescript/bin/tsc --noEmit`, exit 0 |
| Exact source composition and full whitespace from parent and main | Exit 0; all expected entries and frozen vectors match |
| Production reference and confirmation-replanning audit | Exit 0; inspected call graph matches the retained inventory |
| Author artifact and execution-snapshot verification | Exit 0; all 30 artifacts and eight execution snapshots verified |

The four original probes add distinct compatibility checks:

- An unbranded trade and an untrusted snapshot are refused before their property
  getters are invoked. Adding the policy check does not weaken brand-first
  validation.
- Historical unsigned non-core native and SPL records, restored under a
  different profile while their blockhash remains valid, stay unchanged and
  uncertain. Recovery adds no write or send. New direct/prepared funding refuses
  the commitment, and a decoded record still cannot be confirmed. The setup
  journal insertion is excluded explicitly from the no-new-write assertion.
- A consistent historical non-core native display still reports
  `validation: data-consistency-only`, `confirmationAuthority: false`, supplied
  pin/height metadata and no established acceptance or outcome. A copied view
  remains unauthorized for confirmation, and actual new preparation is refused.

The historical fixtures use unchanged unsigned codecs and parsers only. They
never restore or synthesize the client's private prepared capability. G33's
detached display check therefore remains distinct from funding eligibility.

The maintained selection also covers all 18 new-policy refusals, valid native
and SPL direct/prepared flows, unchanged historical release/refund/payout
planning, release reconciliation, same-profile cancellation, single-use review
authority, exact message/blockhash retention, fresh state/time/trust checks,
profile/lock/cancellation races, uncertain send markers and no automatic resend.
The 100-case selection overlaps author and coordinator tests; the counts must
not be added together.

## Author history verified without rerunning baselines

The author evidence commit is a direct documentation-only child of the frozen
source. All 1,033 non-documentation entries and both Gitlinks are exact. Every
recorded source snapshot was reconstructed in a private Git index from its
recorded commit and retained patch. All source-file hashes and full log hashes
matched, and the final focused snapshot reconstructs the frozen source tree.

| Original execution | Preserved result |
| --- | --- |
| Initial baseline | 33 tests: 11 pass / 22 fail |
| Corrected baseline | 33 tests: 15 pass / 18 fail |
| First guarded selection | 38 tests: 36 pass / 2 fail |
| Final-fixture baseline | 33 tests: 15 pass / 18 fail |
| Final focused selection | 38/38 pass |
| Frozen Solana package | 448/448 pass |
| Frozen package TypeScript check | Exit 0 |
| Frozen import-boundary check | Exit 0 |

The initial failure history includes wrong duplicate-confirm and historical
reprepare expectations in the tests. The guarded intermediate selection exposed
two remaining historical reprepare error-precedence assumptions. The final
historical control instead checks that a decoded record cannot confirm. All 18
separate new-funding refusal cases remain. The guarded fixture correction changes
only the test file; it does not change production code. All original outputs and
patches remain in author evidence, including its existing npm configuration
warning. This review verified that history rather than relabeling the earlier
runs as passing or rerunning those baselines.

Full whitespace checks cover complete diffs from the frozen main baseline with
no exclusions, for the source and author evidence. The independent documentation
commit is checked against that same baseline when packaged.

## Limits and next gate

No full repository suite, artifact build, browser, native validator, physical
wallet, external target or real financial transaction was run by this reviewer.
These controlled tests establish client refusal and historical compatibility,
not native execution, browser funding acceptance or release readiness. No
contract, ABI, program, trust, configuration, margin or optional-feature change
is part of this review. `ReleaseEnabled` remains `0`.

Combined-source qualification, hosted checks and the matching recorded Tier C
owner approval remain coordinator-owned. This source review does not authorize
merge, deployment or a new funding UI. A later composition supplement must bind
its conclusion to the actual combined source and retained qualification.
