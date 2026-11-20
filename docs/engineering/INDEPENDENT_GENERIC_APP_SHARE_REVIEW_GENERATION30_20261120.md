# Generation 30 independent generic app sharing review

## Result and source

No High, Medium or Low finding was identified. Independent validation passed **48/48 cases**, with zero failures, cancellations, skips or TODOs, and the UI TypeScript check passed. Source/composition acceptance is separate from hosted qualification and the standalone D8 Tier B named automated review.

Reviewed source: `a2d69851430971ce51588c22c571e48b30b4ca01`, tree `c484a9c5da4617667d9486d8c3bd4131db1ca8d6`. Baseline: generation 29 source `fa7c1a11ff990be4646053731f1030d09eb8f9b6`, tree `dc34c0065a6bc4d66b4195b16d573ef1ec7463a5`. The checkout stayed clean at that source before and after all six captured checks, which ran on 2026-11-20 from 18:51:14 through 18:55:11 UTC. The receipt records individual commands and timestamps.

## Implementation review

Exactly four existing files changed: `main.tsx`, `OfflineRoot.tsx`, `ui/App.tsx` and `ui/Pages.tsx` under `apps/web/src`. The only additions are two sharing tests. All **2,842 other baseline entries** retain their mode, type and Git object ID; no entry was deleted. The URL helper, sharing leaf, locale catalogs, CSS, storage/Worker implementation, actual native EVM/Solana roots, configuration, workflows and audit ledgers are unchanged.

The real main module captures its own `import.meta.url` once. Its offline lazy loader supplies that captured value through a stable wrapper to `OfflineRoot`. The unchanged strict helper derives a nullable display-only hosting address, which App forwards into one Settings sharing leaf. Native root imports and their props are preserved. No private document URL, query, profile, invite, trade, payment or counterparty input enters the new address path. Supported deployment/gateway prefixes remain intact; unsupported entries retain the fixed unavailable state.

Clipboard access requires an explicit copy handler. Manual selection remains available. The unchanged module-level physical-write gate spans simultaneous mounts and route replacement until the promise settles. Owner and sequence checks suppress retired completions, including replacement away and back and cleanup/effect replay. Notices follow the current locale without another physical write. Missing, noncallable, throwing and rejected clipboard APIs use fixed fallback text without leaking exception details or probing permissions, native sharing or network capabilities.

This is the narrow generic address sharing permitted by [docs-growth section 5](../../00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.7_docs_growth/spec-github-wiki-documentation-and-marketability.md). It adds no referral program, tracking, fees, release authentication or optional module activation, and does not complete the broader docs-growth feature.

## Verification

| Check | Result |
| --- | --- |
| Source identity | Four existing composition files changed; two tests added; 2,842 entries preserved; no deletion |
| Maintained cases plus independent probes | 48 passed: 33 maintained cases and 15 independent probes; zero other outcomes |
| UI TypeScript | Exit 0 |
| Original author evidence and emitted artifact | Ten log/patch receipts, 12 assets, three graphs and 132 module hashes verified |
| Committed author evidence package | All 39 manifest artifacts and separate whitespace receipt verified; 43 documentation/evidence paths only |
| Full source whitespace | Exit 0 for `8e836baa877b676a863c877003e277b638fc5061..a2d69851430971ce51588c22c571e48b30b4ca01`; no exclusions |

Independent probes cover actual App/Settings forwarding with hostile private-URL accessors; simultaneous/replacement mounts sharing one physical gate; pending owner replacement/restoration and null suppression; cleanup/effect replay; live locale notices; API failures; and strict main-versus-lazy-chunk URL handling. The maintained composition cases include both native dispatch controls. React scheduling and external ports are controlled: these results do not certify DOM event delivery, physical clipboard permissions, startup effects or native financial flows.

The original composition baseline recorded **2 passed / 7 failed**. The final frozen-test-byte baseline recorded **26 passed / 7 failed** out of 33. Failures were missing Settings sharing/entry propagation assertions; both native dispatch controls passed. The unchanged helper and initial lifecycle tests passed 23/23 before integration. Readback matched final baseline production hashes to the original generation 29 commit and its test hashes to the frozen generation 30 files. The author then recorded 33/33 focused passes at the frozen source. Baseline HEAD, hashes and binary patches are retained; no separate immutable RED commit is claimed.

Author evidence commit `3338964189a00f7181ba8e52166c594b61a48fe7`, tree `9c3618532ed4712b8933e5a571c0a249be872515`, has the reviewed source as its sole parent. Its 39 manifest artifacts were independently rehashed and byte-compared with their original scratch outputs. Every gzip has `mtime=0`; compressed and uncompressed digests match. The 04–06 pre-freeze patches exactly equal the full baseline-to-source diff. The additional author whitespace receipt was checked separately.

The author-produced ordinary artifact has **12 files / 812,179 bytes**, with document/native-Worker/QR graphs **98/30/4**. Every listed asset and module hash matches the review checkout. The emitted main `assets/index-Bn32YCpH.js` has SHA-256 `4a54d4f63b019c44859b29f4d3d9ec2113d69ebad641a0fb40431b280d72ac9c`; its captured `import.meta.url` binding reaches the lazy offline root's `entryModuleUrl` prop. The complete relevant emitted-entry suffix is retained in the readback log. The vault Worker remains `assets/vault.worker-yOnLqpF_.js`, SHA-256 `d3bc5bf253cf1e30914a932e126d2d41bedc19d217d9baa94748975243c04165`. `ReleaseEnabled=0`, empty `connectOrigins`, and CSP `connect-src 'none'` were verified. This was artifact readback, not an independent rebuild or browser execution.

Dependencies resolve in the review checkout's separate physical directory with immutable hardlinked package files. No dependency install/mutation or cross-checkout import symlink was used. Directory and sampled package provenance is recorded.

## Evidence and remaining gates

The [machine receipt](generic-app-share-independent-review-generation30.json) records identities, outcomes, paths, raw/compressed hashes, dependency provenance and limitations. The [evidence directory](evidence/generic-app-share-independent-review-generation30/) retains complete deterministic gzip logs, independent probes and verification scripts. This independent run had no failed check.

Root integration and qualification need a separate provenance supplement when supplied. Applicable hosted checks must pass for the actual current source and intended target. The accepted [D8 packet](../adr/proposed/D8-merge-policy-and-branch-protection.md) classifies this standalone non-custody UI change as Tier B, requiring a passing **CodeRabbit or Qodo** review with findings answered. This independent review does not replace that named gate. No merge, deployment, release, real-funds action, browser launch, physical clipboard action or external share was performed by this reviewer.
