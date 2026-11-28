# Independent final source composition review — generation 15

## Conclusion and scope

**No actionable composition or verification-evidence finding.** The final source
preserves the reviewed components, their existing tests and required CI additions.
The author ran a fresh complete suite on this exact source; the reviewer verified
the actual logs and emitted artifacts without duplicating that suite.

Reviewed source: `430fbcaa6eff20dcd869d30a73e6a2ca6add0f0c`.
Complete tree: `768be48cf8b349b3d124f580c59a73c3a0db93e3`.
Starting qualified generation 14 checkpoint:
`c625f6d473a62c7ab2a5d048f9eaffdda86e5b8e`.
Original reviewed core: `d30152336bb687b31ae547ab3fcecb8835a02ef4`.

This review supports publishing the complete candidate for its applicable CI.
It does not establish current-target hosted, native Solana, browser, physical
device, configured updater or release acceptance. The final candidate must remain
unmerged until its actual current-source and current-target gates are complete.

## Source and history preservation

All reviewed local components are ancestors of the final source, including the
core, required Cast workflow, backup UI, Firefox/WebKit coverage, compatible Cargo
lock, signed-update UI, qualified generation 14 checkpoint, public Solana export
author branch and independent export review.

Both merges were independently recomputed using Git's normal merge algorithm:

| Merge | Parents | Recomputed complete tree |
| --- | --- | --- |
| Export author into generation 14 | c625f6d + 3b5a3ce | 3aa6177e079da2282a23da1c2d08d38dcf82328f |
| Independent export review | 7a86111 + f4fb125 | 768be48cf8b349b3d124f580c59a73c3a0db93e3 |

Both trees match the committed merge trees exactly, with no conflict output.
There is no manual runtime merge edit.

Against d301, exactly **42 paths** change. Every changed path except the combined
web README matches a complete blob from its responsible reviewed component.
All **2,476 unchanged original entries** retain their mode, type and blob; no
original entry is deleted. The README's entire generation 14 content remains;
its only later change is the exact 17-line public-export section from the author.

Against the generation 14 checkpoint, exactly 13 paths change. Twelve match
export author or independent-review blobs; the thirteenth is that additive README
merge. Existing signed-update, backup, browser, dependency and CI changes remain.
The Cargo lock hash remains
`b9596088f7a28dccf465f5165eade7a9c02ea73a5734e38005be5e3b1b830039`.

## Independent remote correspondence

At 06:53:36 UTC, live main remained
`5c5a84ef6300330700c8b0ca54d074ac113f08be`, an ancestor of the final source.
The reviewer independently read each live component head and immutable Git commit
from GitHub. The first six remote trees equal the corresponding reviewed local
trees; the export tree equals the separately qualified focused publication.

| Component | Remote source | Complete remote tree |
| --- | --- | --- |
| Core, PR213 | d30152336bb687b31ae547ab3fcecb8835a02ef4 | fa0d662c991cb03729ca0a4ea53ef60960b81842 |
| Required oracle, PR214 | 24378d91682f7ee2957e1237aefcdb2ed062962b | ff58a8823649c43ba74356cc78084703ffaeedb6 |
| Backup UI, PR215 | e77a2d3e758ee3b416d8d96ecd979526c7ae78ce | af568d385edf9792f6e602d864e4c6d3d9a2d64a |
| Dependency repair, PR216 | 9dd01b199a3448a7654c4719d226ec01eb93eecc | 5ab1f4ddc56742645c60ac43ac2184e194867e0a |
| Browser matrix, PR217 | 973d7b046df54856e0f71688db7a3efd879e7c2d | 9c5e9d8cc8d3c6996a646b43d39b581fe325484f |
| Signed-update view, PR218 | 7d40620c8320945750bd51bf865226dadde998ca | b97e184459d9bca9303230edfb4791507a870dac |
| Public Solana export branch | 09c3d94aedab3c78a4397e3cb80786fb5eb4fd4a | ddd3f4b29c5690c240c092ae8915d80342d503a1 |

The published [PR219](https://github.com/djshellshoxxx/p2p-offramp/pull/219) is
independently verified at head8537d07bf0e67715b881065fa3d6a634a34a70d7, with the
exact tested tree768be48cf8b349b3d124f580c59a73c3a0db93e3. Its eight ordered
parents are main followed by the seven table entries in that order. The proposed
merge0dad3d1bab9b868ab7ee7e8a8565075bf6990452 has that same tree and ordered
parents main5c5a then candidate8537d07. The live PR is draft and mergeable;
mergeability alone is not qualification. Earlier green jobs on d301 or component
branches do not qualify this new combined candidate. Its actual current-target
hosted gates remain required.

## Workflow and assertion preservation

A separate read-only helper independently compared the workflow and fixture
union. Removing only the expected additions makes the changed EVM and foundation
YAML structures exactly equal to d301. All original settings, jobs, steps and
timeouts remain. All 56 original npm commands and other package values remain;
only the reviewed backup browser command is added.

The Foundry job still requires `cast --version` before its existing wallet
calldata test. The backup Chromium step and Firefox/WebKit matrix retain pinned
actions, the 15-minute matrix timeout and `fail-fast: false`. The backup fixture
retains all 18 existing assertions and exactly matches its reviewed component.

Removing only the six-assertion public-download block makes the Solana browser
script byte-identical to d301. The block checks filename, size, the full public
document, and zero wallet connections, prompts and sends. The Solana workflow,
validator runner, native runner and program duration constant are byte-identical
to baseline. Both real 1,800-second refund journeys and the unchanged 150/50/60
minute program/validator/browser timeouts remain.

## Independently verified execution and artifacts

The reviewer rehashed all nine author command logs and read their results:

| Observed execution on the frozen source | Result |
| --- | --- |
| One full npm suite | **2,361/2,361**, zero failures, skips, cancellations or todos |
| Build-policy suite | **58/58**, zero failures or skips |
| Four TypeScript configurations | Passed through the default and demo build commands |
| Source boundaries | Passed, 241 production files / 148 core modules |
| Default and demo builds | Passed |
| Docs, governance, specifications and whitespace | Commands exited 0 |

The full command took 103.281 seconds. Its complete log SHA-256 is
`74f612915a534d96a0a850496b4ad761f2e81fe868c04abd8e8e0eb3339ca404`.
These counts are directly observed from this invocation, not sums of older tests.

All **27 actual emitted files** were independently rehashed. Their complete maps
match both the author receipt and the prior generation 14 artifact maps exactly.
Actual graph inventories contain 95/30/4 modules for default and 97/30/4 for demo.
The reviewer independently verified all **260 recorded module source hashes**
across the six inventories against the frozen source or installed dependency bytes.

All six graphs exclude executable updater modules, the type-only update facade,
all nine optional packages, Solana localnet and chain-Solana runtime modules.
Only document graphs include the signed-update panel. Both actual build-evidence
and content-policy files retain ReleaseEnabled=0, signed release false, release
acceptance false, empty connection origins and CSP `connect-src 'none'`.

## Remaining qualification and durable evidence

Documentation engineering consistency is true, but the existing stale `en.ts`
reference and six associated claim rows remain. Semantic approval and publication
are false; approved release is null. This review does not repin that evidence.

Updated-lock SBPF/Clippy/LiteSVM/IDL/validator/browser qualification, all three
backup browser engines, and the new actual public download assertion remain with
the final candidate's required hosted checks. The exact-own-lock backup adapter,
trusted updater composition and native origin transition remain incomplete.

The companion [structured review](independent-final-composition-review-generation15.json)
contains complete source mappings, deterministic merge results, changed-blob
ownership, remote observations, helper findings, all log hashes, artifact maps
and source-graph checks. Raw review evidence is retained under
`evidence/final-composition-review-g15/` in the coordinator workspace.
This reviewer changed documentation only and performed no remote mutation,
application test rerun, native/browser operation, main merge, release or deployment.
