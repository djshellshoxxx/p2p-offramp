# Final six divergent historical stage variants — November 22, 2026

Source-bound comparison on main `01f6f4feca051d68de24a04299cd3bb444bce40c`. Starting coordinator #245 head `01e41e65cd078b30cc70fcb34af614e2838bb105`. Method: GitHub compare exact historical parent→tip for stage-local file paths, then recursive Git tree/blob SHA comparison to the existing owner PR and current main. These are partial source reconciliations, NOT full patch-ID equivalence, executable tests or qualified merges.

| Stage | Tip SHA | Changed paths | Exact owner blobs | Main exact / changed / missing | Owner |
| --- | --- | ---: | ---: | --- | --- |
| S02 | `71a56d10405bacc7ab39f29d1b63b4bde8a82504` | 42 | 42/42 | 32 / 10 / 0 | #38 closed unmerged |
| S03 | `404dc3daa8b19904c7da29d71d49d8df0f5e03ba` | 11 | 11/11 | 6 / 5 / 0 | #39 closed unmerged |
| S05 merged | `dd2a648140e79b0c0148ffb2a6be87fdf1b3c330` | 40 | 40/40 | 34 / 6 / 0 | #41 closed unmerged |
| S05 split | `72bdf9f521db5ed99acc7e19ae13fe3f65ab5bce` | 40 | 38/40 | 32 / 8 / 0 | #41 corrected source |
| S11 | `789b2b2c2644af741daa5328adf76ac2ec88599c` | 33 | 30/33 | 9 / 24 / 0 | #47 open |
| S12 | `001c31cc868b683080e79a025b6621d900acb96a` | 190 | 190/190 | 0 / 5 / 185 | #48 open |

**All stage-local files are preserved on the named owner PRs.** The stage-local comparison deliberately does not conflate a stacked PR's ancestor files with its own changes. All S02, S03, S05 and S11 stage-local file paths exist on main; S12 has 185 archival documentation paths absent main but preserved in open #48.

## Source safety findings

- S02: main `packages/storage/src/retention-service.ts` additionally enforces contiguous received-sequence and opaque chat-history proofs before selected conversation deletion. Main `packages/transport/src/http-driver.ts` zeroizes copied POST payload bytes on cancellation/capacity rejection; historical source returned without this cleanup. Do not restore the old files.
- S03: main `packages/relay/src/pool.ts` adds bounded accessor-free prototype descriptor lookup and rechecks subscription generation/ownership after asynchronous event verification. The historical relay source lacks these guards.
- S05: merged-stage owner #41 preserves all 40 historical blobs. The split-stage variant differs on `apps/web/src/compatibility/model.ts` and `apps/web/src/context-adapters/observations.ts`, corrected in #41 to explicit locale-independent UTF-16 sorting. Current main's locale runtime additionally enumerates only compiled bundles.
- S11: the three owner corrections to historical stage files are the assurance evidence-manifest digest, package metadata and a deterministic sort in `scripts/governance/check-all.mjs`. Current main governance records add `historical` and `supersededBy` checks and classify historical proposals as inactive. Never promote the old release-governance snapshot over active authority.
- S12: all 190 historical stage-local files are identical in owner PR #48, including 185 documentation/evidence files absent main. These November 2 historical execution receipts do not validate current-source financial/browser behavior. #48 is not merged.

## Remaining gates and explicit limits

Six formerly D-unreviewed stage branches are now **V-partially reconciled**: `A137/P59/U0/C5/E12/V25/F18/B1/D0 = 257`. D0 does NOT mean full consolidation. In particular 59 open-PR-associated branches, 25 partial source records, financial/native acceptance, patch-ID/range-diff, Tier B/Tier C review and owner decisions remain. PR #237–239 named reviews, #241/#242 native SOL/SPL approval and finalized payout, #244 diagnostics, and optional #224–232 one-package reviews remain open.

The expected workspace `/workspace/scratch/dcf03ef9bee8` was not mounted. Direct shell GitHub DNS failed. Only authenticated source/API reads were performed: no shell Git patch-ID, runnable Node, Foundry, Agave or Chromium, no financial actions, no deployment, release, optional activation or main merge. The prior #245 head's 14/14 hosted checks and Snyk status succeeded, but that proof does not transfer to the new doc SHA. `ReleaseEnabled=0` retained.
