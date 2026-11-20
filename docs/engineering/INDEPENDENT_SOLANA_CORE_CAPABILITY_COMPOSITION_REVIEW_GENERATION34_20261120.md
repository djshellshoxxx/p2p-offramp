# Independent review — consolidated Solana funding, generation 34

## Result and exact scope

**No blocking composition or qualification issue found.** The combined source
contains the reviewed G32 prepared-funding capability and native driver, G33
detached native display prerequisite, and G34 count-zero capability guard. Its
completed coordinator qualification records **2,735/2,735 tests** and six other
successful commands. This supplement verifies the recorded source, full logs,
actual output files and graph modules; the reviewer did not rerun the suite or
builds.

| Checkpoint | Identity |
| --- | --- |
| Combined tested source | `0b7832d1c5b348a0755d59152442d0318d4a620c` |
| Combined tree | `78de2de3db335147d8261ad5ab9b116976faf986` |
| Immediate local parent, G33 plus evidence | `257d29b4421d7290dfff9b01074984133e37d4fb` |
| Independently reviewed G34 author source | `2c21958684e8943a3058b0195fd310bfeba68866` |
| Separate independent source/evidence review | `911f1ba5559789467f525f3262d114cd3c1565c9` |
| Original published PR240 head | `7bd5cf595bddadaa204e51e418d0060a1d43a1bc` |
| Intended aggregate target, frozen PR239 | `708a3a2bc167cbbc15eaa3d3c168e058499c7f8e` |
| Full whitespace baseline, main | `8e836baa877b676a863c877003e277b638fc5061` |

The intended candidate is an aggregate against PR239. Its complete
non-documentation delta is **nine paths**, covering G32, G33 and G34. Describing
that candidate as only the three-path G34 guard would omit its funding and
display prerequisites. The actual published PR240 head remains an ancestor;
the work preserves its history rather than substituting an equivalent tree.

## Source union and retained history

All **1,033 non-documentation entries**, including two Gitlinks, match the
independently reviewed G34 author source exactly. Seven source commit mappings
were checked with their complete binary patches and expected local parents:

| Original author commit | Combined equivalent |
| --- | --- |
| `800e633dc47c3bd24065093b50bdc78fa709d3ab` | `d6604540c76219e4ed089cff28909e563147b75a` |
| `252dd1603f12eab69313ef25b538be1b040bc508` | `dd36abf61a26b470ef0cd7b60d6bc64c72581e95` |
| `e214f70f8bcbb9eb962fc147f2d318081daca2ce` | `3c44c57693c5a76439d7b98dc6700a8072b7ce69` |
| `b8792ac4088f75603be8e0b40ba1506f2fb137f2` | `b995de61ca585ec37bd11201fc6c944aed9f5d7c` |
| `31ae6627a6b14a4ef40f7d81c98b04470a30aa1a` | `8e9ec0325570c2496e304400c3c8674c08708254` |
| `448cdcc2a9d13109421f21eaa1107936da0ac5c8` | `a7d2a6699903b3791eda6b5f958b81e31adead6c` |
| `2c21958684e8943a3058b0195fd310bfeba68866` | `0b7832d1c5b348a0755d59152442d0318d4a620c` |

The nine paths are the native driver, package README, `compose.ts`,
`funding-review.ts`, `plan.ts`, package boundary inventory and the three
prepared-funding, funding-review and capability-funding test files. The existing
`CONSOLIDATION_HANDOFF.md` and `FEATURE_MATRIX.md` narratives also differ from
PR239. Every other existing target entry remains exact. No old entry is deleted.

All **2,211 documentation entries from the original published PR240 head** and
all **2,297 documentation entries from the immediate G33 parent** are preserved.
The checker independently rehashed **176 artifact entries across eight G32/G33
author, native-driver, independent-review and composition manifests**, including
both raw and compressed identities and zero gzip timestamps. This includes the
original failure and correction evidence. The earlier Solana driver attempt
without optional esbuild, its corrected compilation using existing Rolldown,
and its explicit no-native-execution limits remain separate from the current
qualification. Earlier results keep their original source attribution.

The [separate G34 source review](INDEPENDENT_SOLANA_CORE_CAPABILITY_GUARD_REVIEW_GENERATION34_20261120.md)
verifies the guard author evidence at `853c0b45607eb30f5e438483450c7ab763e6bcfb`,
including all eight execution snapshots and fixture corrections. Its original
100-case independent selection overlaps the coordinator suite and is not added
to the 2,735 total.

## Completed coordinator qualification

The recorded batch began at **2026-11-20 19:57:58.608276 UTC** and completed at
**19:59:53.706252 UTC**. This review required the final `completedAt` field before
accepting the receipt. Every command records the exact combined source/tree,
exit zero and complete log identity. The final receipt records unchanged source
and a clean tracked worktree.

| Command | Verified result |
| --- | --- |
| Full Node suite | **2,735/2,735**, zero failures, cancellations, skips or todos |
| TypeScript | All four configured projects passed |
| Build policy | **58/58**, zero other outcomes |
| Import boundaries | 243 production source files / 155 core graph modules |
| Default build | 12 asset entries / 817,257 bytes; document/vault-Worker/QR graph counts **102/30/4** |
| Demo build | 13 asset entries / 829,355 bytes; graph counts **104/30/4** |
| Native updater fixture preparation | Strict 37-module compilation reported; build only, `nativeExecuted=false` |

The complete Node output is **274,443 bytes**, SHA-256
`5f5d9ed956851e64c842c960bfc933fa0eef53f343a42023eca61c9570ca0940`.
Its retained deterministic gzip is 90,408 bytes, SHA-256
`6cadcee989a3dbd753ef73538f4dfd9447fa2fb773f82d2902a0fb6443982612`.
The test counters were parsed from the original full logs and agree with the
receipt. The current suite adds exactly the 33 guard cases to G33's 2,702; G32's
separate 2,654-case result retains its earlier attribution. Original npm
configuration warnings remain in the retained logs.

## Actual files and module graphs

The checker read and verified **25 emitted assets, six graphs and 274 graph
module references**. The directory inventories account for every actual output
file. Build evidence, graph JSON and asset bytes match the completed receipt.
Tracked module bytes match the frozen combined Git source and both coordinator
and reviewer worktrees; ignored immutable dependency modules match the actual
installed bytes. Each graph has bounded, unique module paths.

The full default and demo artifact/graph records are exactly equal to the
retained G32 and G33 qualifications. The chain-Solana package and inactive
funding display remain absent from those ordinary profiles. Startup
compatibility, retention preview and generic sharing remain in their expected
document or Worker graphs. The main entry retains its own module URL for
generic sharing, and the executable updater remains excluded.

Both profiles retain `ReleaseEnabled=0`, unsigned/non-release status, no testnet
trust, no connect origin and `connect-src 'none'`. The maintained full-suite
case for explicit Solana-profile emission and policy also passes; compilation
does not prove native execution or browser acceptance.

The native updater preparation's emitted Worker and graph hashes match the
current default output. Its reported 37 temporary fixture modules were removed
by the preparation script. This review retains the full log and verifies its
reported build-only result, but does not claim to rehash the removed temporary
modules or to execute that fixture. This updater fixture is not Solana prepared
funding acceptance.

The [composition receipt](solana-core-capability-composition-review-generation34.json)
retains the completed root receipt, all seven full logs, exact source mapping,
the verifier and its execution result. It additionally retains all **27 actual
default/demo output files**: the 25 listed assets plus both build-evidence JSON
files. Each retained compressed file records raw/compressed hashes and a zero
timestamp. Complete whitespace checks use the frozen target, original published
PR240 head and main without exclusions; the supplement itself is also checked
against main when committed.

## Meaning and remaining gates

The source conclusion remains narrow: new native/SPL funding accepts only the
accepted D4 count-zero commitment, while historical verification, recovery and
funded exits remain available. G33 display consistency grants no confirmation
authority, fresh pin claim, counterparty acceptance or funding outcome.

This review verifies local controlled qualification and preservation. It does
not transfer hosted checks from earlier heads, establish native/browser
acceptance, record a Tier C owner approval or authorize a merge. The eventual
candidate still needs its applicable hosted checks and matching owner approval
for its actual source/target. No browser, validator, real financial execution,
remote publication, deployment, release or optional activation was performed by
this reviewer.
