# S02 storage, recovery and transport divergent-path disposition — 2026-11-23

Immutable main: `01f6f4feca051d68de24a04299cd3bb444bce40c`. Original S02: `01344cbd6655f509f3e2e3903333cdb579228d37`, stage parent `4e319013ea61ead31ae00ea9a44fa9c431cc84ce`. Corrected [PR38](https://github.com/djshellshoxxx/p2p-offramp/pull/38): `71a56d10405bacc7ab39f29d1b63b4bde8a82504` against recorded PR base `81a295d5cd3936b88eded7e52b6f2a78989f6ea7`. PR38 is closed. The corrected branch tip has a three-file last-parent delta that is NOT the 42-path stage delta; use the PR file collection for the corrected stage. Original stage parent tree difference is 40 paths, 29 exact main blobs and 11 changed. Corrected PR file collection is 42 paths, 32 exact and 10 changed. No missing paths in either scope.

## Differing source dispositions

| Path | Historical to current blob prefixes | Observed disposition |
|---|---|---|
| packages/identity/test/history-retention.test.mjs | bf08c771 → ff915469 | Corrected PR38 blob exactly main; two key-set comparisons changed from sorted arrays to Sets, privacy assertion preserved. |
| packages/schemas/src/core.ts | bee036af → d33644a5 | Corrected PR38 blob exactly main; explicit UTF-16 code-unit order replaces default sort. |
| packages/schemas/index.ts | 0083246e → 47e3ba87 | Every historical line present; adds parseRecoveryReferenceExportBytes. |
| packages/schemas/src/recovery-reference.ts | e5f7d1f7 → 76eca904 | Historical EVM action/reference mapping retained in expanded recovery parser; new Solana payout/recovery states and signed-reference guards. Do not revert. |
| packages/storage/index.ts | 2abf68e3 → 54f11ddf | Same retention classes/constants/types, consolidated exports; dated comment omitted. |
| packages/storage/src/retention-service.ts | c8d7b32e → ec3b31ca | Current code uses descriptor-based bounded length, preserves group all-or-none refusal, adds opaque sibling and sequence completeness proof, uses current Intent type. |
| packages/storage/test/backup-verification.test.mjs | ce9f2291 → 1d9a23c2 | Every historical line present; adds persisted-row race and intrinsic byte-size tests. |
| packages/storage/test/idb-vault-store.test.mjs | d3b6721f → 613e6c14 | Every historical line present; adds terminal close/subscriber regression. |
| packages/storage/test/retention-service.test.mjs | 6c8d06cb / corrected 1df95b9c → 5e5939b2 | Corrected historical lines all present; adds malformed sibling, sequence gap/duplicate and bounded descriptor tests. |
| packages/transport/index.ts | ec18bd0d → 67e490f5 | **Open question:** historical type-only HttpFetchPort barrel export missing; current driver still exports the underlying type. Do not restore until actual caller/boundary contract is verified. |
| packages/transport/src/http-driver.ts | corrected eeb37ae3 → bfef9101 | Exactly two old-only and two new-only lines observed; preflight cancellation/capacity failures now wipe detached payload before returning, matching PR212 correction. Corrected encoding-test blob 6b21b0af is exact in main. |
| packages/transport/test/policy.test.mjs | 5a31b3a6 → 2845f117 | All 30 historical test declarations retained; three reentrant test lines changed to assert captured authorization result outside callback; adds canonical path/query refusal test. |

Original and corrected scopes overlap; do not sum the two as separate features. Line inclusion checks are not a full ordered patch-ID proof. No production defect reproduced. Do not mark the S02 branches complete while the barrel contract and independent integration evidence remain unresolved. No runtime tests executed during this review; no prior CI transferred.

## Census and gates

Authenticated REST pages 100+100+62 branches, 100+100+47 PRs; 65 open, 124 merged, 58 closed unmerged. Compared with stored inventory only the coordinator self-ref changed. Classification totals unchanged A137/P64/F36/C5/E0/V19/B1/D0. AGENTS.md, docs/ai/WORKFLOW.md, docs/ai/HANDOFF.md returned 404 on exact main; current canonical master/handoff read from coordinator. No changes to main, funds, deployment, release, trust or feature defaults. Next: confirm the private type boundary and historical caller requirements; examine remaining independent S05/S06/S07 cohort. No claim of current-head CI, independent Tier C review or owner acceptance.

## Resolution of the public type question

The maintainer explicitly excluded the `HttpFetchPort` re-export when closing PR #38. The rationale and intended replacement appear in the [PR disposition](https://github.com/djshellshoxxx/p2p-offramp/pull/38#issuecomment-6978067799) and the [November 18 consolidation result](../execution/CONSOLIDATION-RESULT-2026-11-18.md).

At main `01f6f4feca051d68de24a04299cd3bb444bce40c`, the transport driver uses its own local type. The release update consumer imports a structurally defined port from its sibling `release-update-http.ts`. A search through the tracked app, package and test sources found no consumer importing this name from the transport package root. Both historical S02 stages are therefore accounted for. Their inherited S01 work keeps its separate assessment.
