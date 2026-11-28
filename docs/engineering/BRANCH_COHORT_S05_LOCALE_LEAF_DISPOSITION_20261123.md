# S05 locale and leaf-module source reconciliation — 2026-11-23

Main: `01f6f4feca051d68de24a04299cd3bb444bce40c`. Original S05: `72bdf9f521db5ed99acc7e19ae13fe3f65ab5bce`, stage parent `4ebe660f0514cc8e9ed580bf0cc23bc5a80dfad2`. Corrected closed-unmerged PR #41: `dd2a648140e79b0c0148ffb2a6be87fdf1b3c330`, base `7706859d2385cae0f8e49615392de08dfee83f84`. Corrected tip's three-file last-parent diff is NOT the stage scope. Original commit file collection and corrected PR41 file collection each have 40 paths. Recursive Git trees were not truncated. Original: 32 exact main blobs, 8 divergent; corrected: 34 exact, 6 divergent; no missing paths.

| Divergent path under apps/web/src | Original blob | Main blob | Disposition |
|---|---|---|---|
| compatibility/model.ts | c42031fc | e927d9da | Corrected blob exact main; explicit UTF-16 code-unit ordering replaces default string sort, frozen values preserved. |
| context-adapters/observations.ts | 2bc4ef1a | d950b42c | Corrected blob exact main; explicit equivalent ordering, frozen IDs retained. |
| content-policy/local-policy.ts | c8ec7245 | 8121d364 | Only comment updated to describe actual document-scoped QR review admission. |
| ui/PrivacyStatusDetails.tsx | 6a86497a | 1c39d693 | Historical imported type replaced with structurally equivalent local readonly interfaces. Current domain privacy-view.ts blob 76f5ad03 and barrel 0bcf9430 confirm the type is now exported and the channel/type shapes match. The comment claiming missing export is stale; maintenance debt, not lost runtime behavior. |
| ui/locale/catalog.ts | 5ea4266e | 3c20736b | Stronger own-visible-text, count-branch visibility and critical-warning letter/number guards. Preserve the newer code and PR100 regression. |
| ui/locale/en.ts | ddde479f | 7b90d918 | Two old-only lines: updated trust help correctly describes default unconfigured controller; recovery help adds Solana journal hints and encrypted backup history. 218 new-only lines include later feature vocabulary. No translation approval inferred. |
| ui/locale/runtime.ts | 5da9b42a | 16695a37 | No old-only lines; immutable compiled-bundle options and available() added. |
| ui/trade/trade-messages.ts | 25ee7a9c | 1a20a645 | No old-only lines; adds favoriteItem display message. |

All historical stage tests are exact in main (locale, compatibility, screen counts, sharing, content policy, context adapters and privacy). F for both historical branches: intended stage-local content retained or superseded by later maintained source. No full patch-ID or whole-history equivalence, feature completeness, or runtime acceptance claimed. S06/S07 and active feature PRs remain independently gated.

## S02 transport type boundary remains unresolved

PR38 adds a type-only HttpFetchPort re-export to the policy barrel. Current main barrel 67e490f5f8bf7937c04e46a6ba3838ca21b07459 expressly excludes private transport implementation; the type remains in the driver. Current boundary checker 4455ec624a97724c4c04fd3801b5bcbfc642ad12 forbids cross-package private imports. Existing HTTP driver tests import within the same package. Release-update HTTP independently defines its own HttpFetchPort (5d6bb399774a7cdeb86d61e34f914c6b1e38b534). No public caller requirement demonstrated in this bounded scope; GitHub code search was incomplete, so no exhaustive no-caller claim. Keep S02 V pending complete caller and public contract review.

## Live qualification and limits

Fully enumerated REST census 262 branches, 247 PRs (65 open, 124 merged, 58 closed unmerged). Prior coordinator head bf5e5a493397101c743ed0ce11c1f716c7012f0b: 14/14 reported check runs successful including CodeQL, not transferred to this new documentation head. PR237 exact head 33232f62 has 12/12 reported checks, named/current-target review gates not established here. Main unchanged. AGENTS.md/docs/ai instructions returned 404 on coordinator; canonical ledger and handoff read. Original scratch workspace absent; direct git ls-remote failed DNS resolution; authenticated GitHub API reads available. No new local tests, independent worker, production source edit, main merge, deployment, release, or funds. Next: S06/S07, transport contract and separately owned integration gates.
