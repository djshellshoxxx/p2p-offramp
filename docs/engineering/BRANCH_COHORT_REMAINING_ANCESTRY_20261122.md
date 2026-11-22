# Consolidation cohort — all 70 formerly ancestry-unassessed remote branches

**2026-11-22, live GitHub evidence.** Exact main `01f6f4feca051d68de24a04299cd3bb444bce40c` (no main merge); 257 remote branch refs (100+100+57) and 242 pull requests (100+100+42). Only one persistent coordinator, PR245. All original frozen/owner branches and historical failed tests are preserved.

## Screening results (not feature-completion results)

**46 exact ancestors** of current main, **21 divergent heads still requiring patch/semantic review**, **one tree-equivalent branch whose corresponding PR237 remains unmerged**, **one exact test blob already in main**, and **the self-indexing open coordinator PR245 branch**. 46+21+1+1+1=70. Updated full 257-ref classification: **A137/P59/U0/C3/E11/V11/F14/B1/D21**. `U0` means every branch got an ancestry screen, not that accepted work was merged or qualified. 21 D branches still lack semantic/code review, 59 open-PR-associated heads remain unintegrated, plus older partial/held categories.

### Exact ancestor proof (46)

Every entry was compared by authenticated GitHub compare to the fixed main: `ahead_by=0`, merge-base SHA exactly equals recorded branch tip, behind count below. These need **no extra merge**, without any claim of runtime feature acceptance.

| Branch | Tip SHA | Behind main |
|---|---|---:|
| `parallel/browser-peer-offer-20261113` | `d6d65a47b99e68d00f82153d83fef366e532cf67` | 465 |
| `codex/d9-migration-20261116` | `c1f8e750beb7e22d5b9a7f0e47cca9f8cd8bdb65` | 398 |
| `fix/remediation-09f20d73-9524c0` | `9f5201dd44a85fa90841d9a2882752b41db9360e` | 645 |
| `fix/remediation-f84468d6-0a97ed` | `dba5072d7a67f67e223432c48aefabc07f31f005` | 631 |
| `codex/core-continuation-20261104` | `edc66f6a503176302bd17dd1ca073947273f7d9a` | 606 |
| `codex/review-consolidate-20261116` | `5eadddd54f6db6e755e658c1982c95f95b37a823` | 383 |
| `work/p2p-consolidated-20261030` | `68fb46920431e3311c78f931432bc4a21d066c17` | 683 |
| `work/p2p-independent-branch-review-20261030` | `9f80c9b27b943b30409710dea76a53d97a761832` | 702 |
| `claude/sweet-shannon-grykla` | `7165626c17d8afb7ad7fce461ae7df9cbfcdba07` | 710 |
| `nodata/youthful-maxwell-uwy8hx-b1-reader-test-flake` | `b7d06fed31fb7d2793da99c23f15bf6795a82b8a` | 275 |
| `nodata/youthful-maxwell-uwy8hx-b1c-acceptance` | `236f815e79a852643d8dfa61d6d4895c8a93f54a` | 272 |
| `autonomous/continuation-20261031` | `320fc4bcc90069cf1d8c869af78caf63efe5b9ea` | 638 |
| `autonomous/journey-20261101` | `3947074c95fa1e0facd65a8947a2c7e70363c708` | 628 |
| `chatgpt/zero-codex/acceptance-cli-input-bounds-20261110` | `2ba1a4e18f4673f006b195e822b5f984effb48e8` | 613 |
| `autonomous/guidance-20261101` | `c8494b05e36cda43ac3f73e0feab831cfa00647d` | 634 |
| `chatgpt/zero-codex/acceptance-review-boolean-20261110` | `08a9cf1e9abc0fb703b14964062a3da2234fdbb6` | 613 |
| `chatgpt/zero-codex/docs-status-20261118` | `708d937df7e4799e4ad212b3293bec923f619940` | 289 |
| `chatgpt/zero-codex/docs-static-offers-status-20261116` | `30efa0e158c6b50525c8e0dced494faa9f54eb08` | 613 |
| `chatgpt/zero-codex/docs-wiki-20261110` | `c14cfd07a440f03b5f57e35c8d39e63cdabfd5bf` | 546 |
| `claude/adoring-wozniak-850ue6` | `81c2dc889fa2a66eec2259ce3a911132386d1aa1` | 809 |
| `claude/confident-fermi-g6wjp3` | `64c7c1861779ea34632f2f800b80bdaecbaefa03` | 343 |
| `claude/docs-screenshots` | `c1e31918ed5e4e370e7217a6a654ea360c71f4b4` | 783 |
| `claude/gifted-faraday-73kydc` | `8fb081b492ccf9ecef4dc47525c753cac670dacb` | 614 |
| `claude/loving-einstein-xgzvdy-decisions` | `89d0a928e9e1127a4c8911f9437359260bd06ab6` | 616 |
| `claude/loving-einstein-xgzvdy-s00-ci-triggers` | `a88560741e60146a424cc18fcb2cc1043756ae3e` | 626 |
| `claude/post-merge-followups` | `ec65012dbb94189180d3da52de2619cc22fe0482` | 785 |
| `claude/sleepy-fermat-4s6ocx` | `f1d9dd63a2ac9d55912899f8c6233456ebf8a499` | 298 |
| `claude/sweet-noether-arf6ne` | `391653eaba946f77057b01fd03d3c234958bcf1d` | 696 |
| `claude/tender-goodall-db3cot` | `8783636e7a1739b5e884cec62fbecf9c77a0ceaf` | 611 |
| `codex/consolidation-ledger-20261104` | `d5b959b5ed732ab3e6f7adfd37e872a841470225` | 621 |
| `codex/foundation-gates-20261104` | `77fb7c52dcdde58cad17ceee45a0f43e7e22ad43` | 620 |
| `codex/rq00-evidence-20261109` | `a136909721046ec8a540ed98ecfdcbf4c4bcf8ad` | 590 |
| `docs/spec-readiness-and-foundations` | `6b6004bdf35b7aea14530f965756ca6d54336682` | 857 |
| `gpt/p2p-beta-spec-20261109` | `c4fb7b590639e2a1d0a3220cf6bf7936156cc8e4` | 583 |
| `nodata/affectionate-ritchie-xq4bon` | `86224cfb4abe19c266cf99d441bd64d52f5c57b4` | 363 |
| `nodata/doc-sweep-20261118` | `436b591a3a750bcca2327117e487336f6dd77470` | 276 |
| `nodata/epic-goldberg-sg8n96` | `1df700355e5199c69e84d5b41b12005677b5f5ee` | 317 |
| `nodata/epic-newton-7bowm4` | `1fe5ae00ed2105633081d71a67db2b5436da9c8d` | 263 |
| `nodata/youthful-maxwell-uwy8hx` | `014a10a148f8b3b69c9d650fbcb083c8142e7d28` | 302 |
| `nodata/youthful-maxwell-uwy8hx-b3-formal` | `39096586e1160c3c8434a2d081339bb70aeb4c1b` | 254 |
| `nodata/youthful-maxwell-uwy8hx-b4-tooling` | `3591dcbb84ff7280be3d93a27b5b160066074c06` | 272 |
| `research/code-reuse-2026-11-03` | `5fec2c6db018868a49c8ce40c21e186cdf702417` | 626 |
| `research/remaining-gaps-20261103` | `922a391e429d07b0840bbbe525b3a10c6d3c830c` | 626 |
| `research/upstream-reuse-20261103` | `977b36654bab2d00ca20c6139398b60c693bab73` | 626 |
| `work/p2p-client-shell-2026-10-24` | `8a88d11d8e419cd402b28428947e8fe4fbcfe893` | 834 |
| `work/p2p-pr14-finish-handoff-20261030` | `8c8911e2dd3c7af4d515e645a6501eedc6178111` | 694 |

### History-divergent branches (21) — do not merge without unique-patch review

The status establishes **only** Git-level ahead/behind and merge base, not patch-id equivalence, feature correctness, code ownership, or acceptance. Stacked ancestors may account for many changed files.

| Branch | Tip SHA | Ahead | Behind | Merge-base SHA |
|---|---|---:|---:|---|
| `claude/loving-einstein-xgzvdy-m0-s02-core-contracts-storage` | `71a56d10405bacc7ab39f29d1b63b4bde8a82504` | 7 | 626 | `a88560741e60146a424cc18fcb2cc1043756ae3e` |
| `claude/loving-einstein-xgzvdy-m0-s03-core-messaging` | `404dc3daa8b19904c7da29d71d49d8df0f5e03ba` | 11 | 626 | `a88560741e60146a424cc18fcb2cc1043756ae3e` |
| `claude/loving-einstein-xgzvdy-s02-core-contracts-storage` | `01344cbd6655f509f3e2e3903333cdb579228d37` | 2 | 626 | `a88560741e60146a424cc18fcb2cc1043756ae3e` |
| `claude/loving-einstein-xgzvdy-s03-core-messaging` | `5a747ded358ee9fcca393bb4a0616fd4e8632296` | 3 | 626 | `a88560741e60146a424cc18fcb2cc1043756ae3e` |
| `chatgpt/zero-codex-continuation-spec-20261109` | `62c6c14539ccc2ac2e56658a81602f6d1ba50d73` | 1 | 615 | `300287dcde818a9d10ae301265d00bc7c0877bbb` |
| `chatgpt/zero-codex/docs-python-baseline-20261116` | `75a5e35b56310a9660aa7c6a3855db3c64e759f4` | 1 | 585 | `2dfd09011611447306b7038483683d8bddcc46af` |
| `chatgpt/zero-codex/docs-collaboration-20261117` | `e21a58e6a4d09c099d3249660ddec770f2164a74` | 1 | 585 | `2dfd09011611447306b7038483683d8bddcc46af` |
| `chatgpt/zero-codex/qualify-pr61-20261110` | `a1930a3596f76eff4c29a1ee2991d6acd7f35895` | 30 | 615 | `300287dcde818a9d10ae301265d00bc7c0877bbb` |
| `claude/compassionate-gauss-uyhfih` | `970ac80f08c04e8d340ee57d901e48e26a667a18` | 1 | 614 | `cdde998cf1d0e54c6cfb6fe9cdde0fc22a80e10e` |
| `claude/friendly-dijkstra-nsi310` | `bd26833555e13408825942e9696157ed68e9980e` | 6 | 615 | `300287dcde818a9d10ae301265d00bc7c0877bbb` |
| `claude/loving-einstein-xgzvdy-m0-s05-web-locale-leaf` | `dd2a648140e79b0c0148ffb2a6be87fdf1b3c330` | 18 | 626 | `a88560741e60146a424cc18fcb2cc1043756ae3e` |
| `claude/loving-einstein-xgzvdy-s01-tooling` | `4e319013ea61ead31ae00ea9a44fa9c431cc84ce` | 1 | 626 | `a88560741e60146a424cc18fcb2cc1043756ae3e` |
| `claude/loving-einstein-xgzvdy-s05-web-locale-leaf` | `72bdf9f521db5ed99acc7e19ae13fe3f65ab5bce` | 5 | 626 | `a88560741e60146a424cc18fcb2cc1043756ae3e` |
| `claude/p2p-offramp-prompt-lqcgno` | `25a01987385b49e9c28199fdfb4a874b29a6ad89` | 3 | 615 | `300287dcde818a9d10ae301265d00bc7c0877bbb` |
| `claude/quirky-knuth-3s6ysy` | `2f839b12768700ac6c3b674f75a144c6ec19fa93` | 1 | 627 | `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa` |
| `claude/loving-einstein-xgzvdy-s11-governance-ci` | `789b2b2c2644af741daa5328adf76ac2ec88599c` | 11 | 626 | `a88560741e60146a424cc18fcb2cc1043756ae3e` |
| `claude/loving-einstein-xgzvdy-s12-evidence` | `001c31cc868b683080e79a025b6621d900acb96a` | 12 | 626 | `a88560741e60146a424cc18fcb2cc1043756ae3e` |
| `codex/setup-autonomous-agent-20261104` | `54e632f8f472a4d26b2fdda4ebdd3f2e02a5dba0` | 2 | 623 | `f87343287199b1c32c443daf2e4e901476729e6d` |
| `docs/offramp-research-tools-execution-plan-20261106` | `0f1792f589a20efab1f629f38d2a0068d4f44193` | 2 | 615 | `300287dcde818a9d10ae301265d00bc7c0877bbb` |
| `codex/optional-composition-evidence-g8-20261120` | `db9eb94356b4a2efd2b82bc2a0b67ab2e56795b2` | 10 | 106 | `cd7d54ba075118a7ec043788c17718be842ee405` |
| `codex/optional-complete-evidence-g10-20261120` | `cf827ee5a86b28b11d6f2bba7c21f60f3d2153e3` | 19 | 93 | `701f3866e60978c945c5a0148dcda5b65f58fdbc` |

Priority: the M0/S02–S03 EVM contracts/storage and messaging changes; M0/S05 browser/locale and S11/S12 governance/evidence descendants; `claude/friendly-dijkstra-nsi310` saved-review Worker/artifact-policy files; optional G8/G10 evidence already under separately owned PR224–232; and the old automated-agent workflow. Compare with current PR42–48, do full changed-tree + patch-ID/range-diff when an executable checkout is available, then run red-green tests and independent review. No unique desirable missing implementation was yet established for these 21.

### Two exact-source comparisons that are not merges

- `validation/pr237-current-main-20261121` tip `92831704820a1f35867fd757bd952eea81412f0f` has exact full Git tree `452b08d0c279a82ea3076371723a2dbd12ef9596` equal to frozen/unmerged PR237 head `33232f62dc9cd250528ef3eb0313c0c319d99495`. The validation commit has ordered parents `[main@01f6f4f..., PR237@33232...]` and 0 changed files vs PR237 head, though Git history reports 10 commits ahead of main. It does **not** qualify Tier B named review, current-target CI or merge into main.
- `chatgpt/zero-codex/g25-public-endpoint-regression-20261110` tip `e0a9033158d1ae874c78de7f25d0be0aa3a13157` adds one historical test path, `scripts/tests/deployment-record.test.mjs`: both old tip and main have **identical blob** `e0f7962d3a48b48ff697de2d5c7aaae89a73a013`. No duplicate test integration necessary. Historic commits remain divergent and Git patch-ID unverified.

### Newly established current-source CI evidence (PR245)

Before this publication, PR245 source `5b7511d517070cb857ac2675a8fd724350771cc0` had an actual **Firefox backup-verification browser FAILED job** [original job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45073034325/job/137364045814): at `scripts/test-backup-verification-browser.mjs:68`, waiting 30 seconds for UI status `was created and unlocked` after successful build. A single targeted rerun [new job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45073034325/job/137378899488) passed on *the same SHA*, and GitHub workflow 45073034325 became completed/success (attempt 2). No assertion, timing threshold or source code was changed. The first failure remains real; repeat success does not establish its root cause. This newer documentation commit must pass its **own** exact-current-head CI.

### Safety, limitations, and exact next tasks

Local checkout `/workspace/scratch/dcf03ef9bee8` does not exist in this runtime and `git ls-remote` cannot resolve GitHub; therefore no local `git patch-id`, `git range-diff`, `merge-tree`, runnable regression, native browser or SOL/SPL financial acceptance was performed. GitHub compare + exact trees/blobs are the only new technical proof. Repository owner approval, named CodeRabbit/Qodo Tier B and Tier C reviews, hosted actual native/browser acceptance, current-base/head checks and expected-head guarded merges remain binding. Do not alter `ReleaseEnabled=0`, optional default activation, keys, live funds, deployment/release, or historical assertions.

Next: (1) recover and execute historical wallet reentrancy/account-accessor/abort tests from PR26/40 against current main without reverting `BROADCAST_UNKNOWN` or canonical EIP-1898 verification; (2) review 21 remaining D source patches, including PR42–48 ancestry and optional PR224–232 protected boundaries; (3) resolve PR237→238→239→241→242→244 gates in proper order, retaining #242's original failed native run; (4) investigate Firefox profile-creation timing only if independently reproducible. Do not claim completion or disable automation.

**Disposition:** exhaustive ancestry screening of previously U-labeled branches is complete for this snapshot. The much larger feature/branch/PR consolidation mission is explicitly **incomplete**.