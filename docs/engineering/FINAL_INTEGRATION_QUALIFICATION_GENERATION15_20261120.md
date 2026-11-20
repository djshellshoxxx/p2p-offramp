# Final feature integration qualification — generation 15

Recorded 2026-11-20 UTC. Scope: consolidate the completed reviewed feature
followups, including public Solana recovery export, and execute the required
local qualification on one frozen combined source. No remote mutation occurred.

## Result and exact source

**The final combined source passed 2,361/2,361 tests, with zero failures, skips,
cancellations or todos. All nine serialized qualification commands passed.**
Both default and demo builds preserve every artifact byte from the preceding
qualified feature stack. Native and actual browser qualification remain pending.

| Checkpoint | Commit | Complete tree |
| --- | --- | --- |
| Prior qualified stack, with separate reports | c625f6d473a62c7ab2a5d048f9eaffdda86e5b8e | 9b65c56dce4b5b46e41d8c37b05e7be5787e3013 |
| **Frozen final source actually tested** | **430fbcaa6eff20dcd869d30a73e6a2ca6add0f0c** | **768be48cf8b349b3d124f580c59a73c3a0db93e3** |

Branch: `codex/final-integration-g15-20261120`.

The previous generation14 full result was 2,351/2,351 on e7c2626. It excluded
the public recovery export. This report records a new complete invocation on
430fbc and does not derive its count by adding earlier test runs.

## Preserved source composition

The starting stack already contained reviewed backup verification UI and its
independent tests, the required Foundry calldata oracle, Firefox/WebKit backup
gates, the compatible Cargo lock update, and the optional signed-update view
with independent tests. Two ordinary Git merges added the export author and
independent review continuations:

| Added continuation | Exact head |
| --- | --- |
| Public Solana recovery export, author source and reports | 3b5a3ceea19078bb2dc014deba0148a64e25de2c |
| Independent round-trip test and export review | f4fb12557e2ba39caee232ca0f384c514c6c1d0f |

Both merges completed without conflict or manual source edits. The automatic
README merge retains the complete preceding README bytes plus the exact author
section describing public recovery export.

The final delta contains **13 paths**. Every other changed blob exactly matches
its responsible reviewed author or reviewer continuation. All **2,505 unchanged
starting-tree entries** retain their original mode, type and object identity.
Every component head is an ancestor of the final source. The JSON receipt records
the complete per-path correspondence and component identities.

All **56 original npm commands** retain their exact values. The sole added command
is the previously reviewed `test:backup:browser`. The Solana workflow, validator
scripts and program duration constant are byte-identical to d301. The actual
Solana browser fixture gains ten lines for its public-download check and removes
zero existing lines. Both real 1,800-second refund minima remain intact.

The compatible lockfile remains SHA-256
`b9596088f7a28dccf465f5165eade7a9c02ea73a5734e38005be5e3b1b830039`.

## Executed verification

The worktree used a physical dependency copy, Node24.22.3, npm11.19.1,
Python3.12.14 and the already verified pinned Foundry1.5.1 binaries. Submodules
were initialized at their exact committed pins. `FOUNDRY_BIN` selected that
Foundry installation for the complete npm suite.

| Command or scope | Observed result |
| --- | --- |
| One complete `npm test` invocation | **2,361/2,361**, zero failures, skips, cancellations or todos |
| `npm run check:boundaries` | **241 production files / 148 core modules** |
| `npm run test:build-policy` | **58/58**, zero failures or skips |
| `npm run build` | Passed, including all four TypeScript projects |
| `npm run build:demo` | Passed, including all four TypeScript projects |
| `npm run check:docs` | Engineering consistency true; semantic limitations below |
| `npm run check:governance` | Passed |
| `npm run check:specs` | **173 specifications**, zero broken links or unindexed documents |
| `git diff --check` | Passed |

The full command took **103.281 seconds**. Its log SHA-256 is
`74f612915a534d96a0a850496b4ad761f2e81fe868c04abd8e8e0eb3339ca404`.
The JSON receipt preserves every command, exit, timestamp, duration and log hash.
The source was checked unchanged before each command and after the complete run.

## Actual default and demo artifacts

| Profile | Actual files | Document modules | Vault Worker | QR Worker |
| --- | ---: | ---: | ---: | ---: |
| Default | 13 | 95 | 30 | 4 |
| Demo | 14 | 97 | 30 | 4 |

All **27 output files** match the generation14 artifact hashes byte-for-byte.
All six actual module graphs exclude executable updater modules, the erased
`update-view` facade, all nine optional packages, and Solana localnet/chain modules.
The signed-update panel occurs only in the document graphs. The public recovery
export remains confined to the separate Solana localnet composition.

Both profiles retain `ReleaseEnabled=0`, signed release false, release acceptance
false, empty connection-origin arrays and CSP `connect-src 'none'`. The JSON
contains the actual policy documents, graph hashes and every emitted file hash.

## Qualification limits

The documentation checker still reports the pre-existing stale `en.ts` reference
and six associated claims. `semanticApproval` and `published` remain false;
`approvedRelease` remains null. No claim evidence or approval was repinned.

This run adds no native browser, Solana SBPF or validator execution. Applicable
current-source hosted checks must exercise the compatible lockfile, real native
and browser refund journeys, actual Chromium/Firefox/WebKit backup verification,
and the new public-download assertion. Earlier target/source results do not
substitute for the final published checkout and complete execution logs.

The signed-update view remains partial: exact-own-lock backup adapter, trusted
controller composition, actual native origin transition and physical-device
qualification are separate. The export introduces no Solana negotiation/funding
authority. No deployment, release, funds operation, branch deletion or gate change
occurred here. Fresh independent final-composition review is owned by the parent.

## Evidence and handoff

The companion [structured receipt](final-integration-qualification-generation15.json)
includes source correspondence, environment and submodule pins, all nine command
receipts, actual test counts, retained documentation limitations, six graph
inventories and all27 artifact hashes. Raw execution logs and the intermediate
composition/artifact manifests are retained in
`/workspace/scratch/dcf03ef9bee8/evidence/final-integration-g15/`.

These two report files are committed separately after the frozen source. They
do not change the runtime, workflows, tests, dependency lock or tested source
identities. The parent may preserve them in the final consolidated candidate and
canonical continuation handoff while reviewing the applicable hosted gates.
