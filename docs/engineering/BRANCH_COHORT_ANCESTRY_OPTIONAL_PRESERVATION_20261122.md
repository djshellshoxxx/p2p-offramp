# P2P-Offramp consolidation — ancestry and optional source preservation, 2026-11-22

**Evidence basis:** Authenticated current GitHub `main@01f6f4feca051d68de24a04299cd3bb444bce40c`, coordinator `d841728c34c12b7225e351d87ab66c09b7eddcc0`, current GitHub compare endpoints, complete recursive Git trees (no truncation), and open PR source heads. No local Git checkout, patch-id computation, runtime/browser/native execution, financial operations, deployments or merges took place. All earlier reports and failed tests remain source-bound.

## 25 direct historical ancestors of main

Each branch below was compared from exact current main to its immutable tip. All returned `ahead_by=0` and `merge_base_commit.sha=branch tip`; the number is commits **behind main**. This proves commit ancestry, not functionality completion or a fresh test pass.

| Branch | Tip SHA | Behind |
|---|---|---:|
| `codex/canonical-handoff-postmerge-g17-20261120` | `2730d83154e54ef53e939965b1fa5f3d0de18bc9` | 74 |
| `codex/ci-oracle-g12-20261120` | `24378d91682f7ee2957e1237aefcdb2ed062962b` | 89 |
| `codex/dependency-g12-20261120` | `9dd01b199a3448a7654c4719d226ec01eb93eecc` | 89 |
| `codex/generation5-core-20261119` | `cd7d54ba075118a7ec043788c17718be842ee405` | 106 |
| `codex/generation8-core-20261120` | `df10fe26a308407237f9ccbc636c8bb61f55b84f` | 105 |
| `codex/generation9-backup-verification-20261120` | `0e148564743b1ee353abdbdf8931fec464f09870` | 104 |
| `codex/main-consolidation-g12-20261120` | `d30152336bb687b31ae547ab3fcecb8835a02ef4` | 90 |
| `codex/main-consolidation-g28-20261120` | `d9ddcf53d82100f05de7346143a0ad00d43c2c1a` | 1 |
| `codex/postmerge-state-reconciliation-g18-20261120` | `7f1c6d6b851926111accaaf3376320b44fcd138b` | 72 |
| `codex/reviewed-main-consolidation-g15-20261120` | `8537d07bf0e67715b881065fa3d6a634a34a70d7` | 82 |
| `codex/reviewed-main-consolidation-g17-20261120` | `24b67bb2db7c74654b9a5b9496279b4d44380d28` | 79 |
| `fix/signed-update-unconfigured-lifecycle-g16-20261120` | `eaa7914ad2f10e932afc877e9e742e0a3117d9c4` | 80 |
| `fix/transport-preflight-zeroization-20261120` | `540e1fe2660e0a6084600726d5f6f75fd5c1ee05` | 91 |
| `codex/consolidation-20261116` | `274d4fe533f47ffa15aed936bd095f82ad10d9ce` | 397 |
| `codex/completion-20261116` | `88f9e40bbf8ea086705edd554a2555865429b54a` | 401 |
| `codex/continue-completion-20261116` | `e7506c22e6b0bc405a9e51f1c809fa30c2fe5861` | 393 |
| `integration/docs-reconciliation-20261118` | `db3198379a0c9e12b3f1415ce09256cce18a01d7` | 217 |
| `integration/pages-beta-qualification-20261112` | `4dcddf2b4bcc9890e50647cea067f81b1b734cdd` | 442 |
| `parallel/cli-argument-regression-20261113` | `605bcd24ef3d239f6a080c129761132482029ef7` | 610 |
| `parallel/diagnostics-20261113` | `330fa1ede8b70e532a02230e4895b0711579491e` | 578 |
| `parallel/locale-20261113` | `c4b13ddccc5bd78406762c656df5af35958e83f9` | 579 |
| `parallel/spec-tool-20261113` | `6d48c9b0695cacd2a166a7386f24b61a6248bc10` | 577 |
| `parallel/tooling-source-correspondence-20261113` | `32a4052163553f7826d55f784ab9a6e96425e576` | 506 |
| `consolidation/qualified-regressions-20261116` | `f2375dba1b249912ac434ed9da3998e4cb0a40f0` | 590 |
| `consolidation/tooling154-20261119` | `030ba10169531dc9a6324d862bb4fad71fbb117b` | 174 |

No merge is needed for these 25 historical branches. Their original refs, failed runs and PR histories remain untouched.

## Four divergent branches with source-level checks

- **`codex/successor-handoff-20261120`** — ahead 2, behind 104, merge base `0e148564743b1ee353abdbdf8931fec464f09870`. 15 stage-local documentation files: six blob-identical to main, four modified in newer main and five absent main. No code changes; preserve archival documentation, do not overwrite newer state.
- **`codex/optional-current-core-evidence-g11-20261120`** — ahead 19, behind 90, merge base `d30152336bb687b31ae547ab3fcecb8835a02ef4`. Full 2667-file tree vs main: 2459 identical blobs, 172 absent paths and 36 differing. All 153 absent optional package paths are present in open PR224-232: 152 exact blobs, one corrected test blob in PR232 (stealth profiles test). No optional source is currently in main.
- **`codex/optional-corrected-evidence-g9-20261120`** — ahead 19, behind 104, merge base `cff9eb05d77c82c82a5d22a5395b0ce63b02b265`. Full 2639-file historical tree vs main: 2424 identical blobs, 172 absent paths (including 153 optional package paths) and 43 differing; predecessor evidence to G11, not a merge-ready target.
- **`parallel/localization-blank-warning-20261113`** — ahead 19, behind 626, merge base `a88560741e60146a424cc18fcb2cc1043756ae3e`. Full 1703-file old tree vs main: 1536 identical blobs, 165 different and 2 missing old EIP-1271 fixture/test paths; branch compare carries 132 changed paths. Needs semantic tests/current-main source inspection; do not overwrite current locale or financial code.

These four are *partially reconciled*, not patch-ID equivalent or merge-qualified. The source comparison checks net tree blobs; older and newer code may differ semantically even when filenames match.

## Nine isolated optional feature PRs — important preservation proof

Compared complete Git trees of G11 optional evidence `db531cb03ad303821a3625f6858941de1ac07606`, main, and **open PRs #224–232** at their own immutable heads. G11 contains **153 optional package paths absent from current main**. Every one is preserved by at least one of those existing PRs: **152 byte-identical Git blobs**, and **one corrected test file** in #232. No missing source requires a new implementation or duplicate bulk PR.

| Module | Missing from main | Exact historical blobs in open PR | Updated in PR |
|---|---:|---:|---:|
| Arbitration #226 | 18 | 18 | 0 |
| Courier #230 | 22 | 22 | 0 |
| Liquidity #225 | 12 | 12 | 0 |
| Meetup #231 | 35 | 35 | 0 |
| Privacy controls #229 | 12 | 12 | 0 |
| Privacy policy #227 | 9 | 9 | 0 |
| Proof inputs #224 | 8 | 8 | 0 |
| Proof jobs #228 | 18 | 18 | 0 |
| Stealth #232 | 19 | 18 | 1 |
| **Total** | **153** | **152** | **1** |

The lone non-identical file is `packages/stealth/test/profiles.test.mjs`, historical blob `3d46ab4cf1e45618ddd5c05b352d0ff61e71f1f6`, open PR #232 blob `5c1742ed9bd0afdbbacc3b4a4c0d99a237ac97b4`. The older file had a `//` comment absorbing the sparse-topic `fail(decode(...))` regression assertion; #232 moves that assertion to a real separate line. Preserve the corrected current-PR variant, not the older defective test.

**Do not merge automatically.** All nine are still open separate optional intakes and require the established D8 Tier B named review, exact-source/target CI and non-default feature gates. The prototype optional implementations are *not* present in main merely because they exist in PRs. Release remains disabled.

## Counts and next safe cohort

This checkpoint changes the inventory counters from A66/P58/U99/C3/E10/V6/F14/B1 to **A91 / P58 / U70 / C3 / E10 / V10 / F14 / B1 = 257**. A = proven ancestor; P = open PR, not claimed qualified; U = unassessed; C/E/V/F/B retain their prior conservative meanings. These categories do not constitute a product-completion percentage.

Next: inspect the remaining 70 unassessed historical branch tips with priority on funds, escrow and recovery. Reproduce the historical wallet cancellation/test gaps on exact current main when an authorized executable workspace is available. For the parent #237–#239 stack and financial #241–#244, obtain required approvals, target/source-matched checks, native/browser receipts and guarded merge verification rather than transferring old success. Keep `ReleaseEnabled=0`; no live funds, default optional activation or release.
