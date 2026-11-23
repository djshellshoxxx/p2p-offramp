# Independent publication and integration audit — generation 11

November 19 Pacific / November 20 UTC, 2026.

## Result and scope

**No publication, source-preservation or qualification-claim discrepancy was found in the audited scope.** The live PR #207 and PR #208 heads match the requested immutable identities. Their published trees exactly equal the local publication checkpoints, and every change after each frozen test source is an engineering report or coordination record. The five backup runtime/schema production files exactly match the implementation reviewed by generation 9.

This is an independent, read-only Git-object, report, existing-log and existing-artifact audit. It is not another execution of the unit, type, build, browser or financial suites, and it does not certify a release or whole-product security. No production source, remote ref, workflow, global handoff or state file was changed by this worker.

## Published identities and tested-source separation

| Candidate | Published head | Exact published/local tree | Matching local checkpoint |
| --- | --- | --- | --- |
| PR #207 corrected core | `df10fe26a308407237f9ccbc636c8bb61f55b84f` | `4b694124197ae8ce271f14307d12abc43c719406` | `d82d5282bfc78e46ccb34d9c700cf1b59dc8b23a` |
| PR #208 backup prerequisite | `0e148564743b1ee353abdbdf8931fec464f09870` | `6a4417741c0b399dde894773f29854f7a2d36228` | `0eee707a2b300b7075b217372781d584a2c72932` |

GitHub metadata at this audit showed both PRs open, draft and unmerged. PR #207 targets main `5c5a84ef6300330700c8b0ca54d074ac113f08be`; PR #208 targets PR #207's branch at the exact core head above. Immutable commit objects show PR #207's parent is PR #205 `cd7d54ba075118a7ec043788c17718be842ee405`, and PR #208's sole parent is PR #207. The PR #208 branch was fetched through the authenticated repository read path before comparing objects.

Core test freeze `7e8f93a02d6ffb98164ed3b09ba3db5b44bd9390`, tree `b330e1ca3a8a22598197bdd5de9532a0c56a917b`, differs from published PR #207 in exactly **10 paths**, all under `docs/engineering/`. They are the handoff, feature matrix, state, core/optional qualification and inventory evidence, successor/optional reports, and two ancestor hosted-review files. No runtime source, tests, build scripts or dependency/workflow file follows the core test freeze.

Backup test freeze `2e2cf4ddefa56ad1df1e4b41f8d6bd66080a52d0`, tree `e7f140d25550e29c9716a0f37c3a364ce2bb6604`, differs from published PR #208 in exactly **four documentation paths**:

- `BACKUP_VERIFICATION_COMPOSITION_GENERATION9_20261120.md`
- `backup-qualification-generation 9.json`
- `SECURITY_REVIEW_UPDATER_COMPOSITION_GENERATION10_20261120.md`
- `SECURITY_REVIEW_UPDATER_COMPOSITION_GENERATION10_20261120.json`

PR #208 changes 17 paths from PR #207. Its only five production paths are `app-services.ts`, `runtime/app-runtime.ts`, `runtime/pending-metadata.ts`, `runtime/worker-endpoint.ts`, and `packages/schemas/src/runtime.ts`. Every corresponding Git blob equals author implementation `74d414312dacbceb35d554aa791be319a326c504`; the remaining changes are tests, README and reports. The generation 9 author, security and bug reports and generation 10 incomplete-composition report were read in full. Their bounded descriptions are consistent with this publication.

## Preserved configuration and excluded incomplete work

Across PR #205, PR #207, PR #208 and the separately inspected relay composition, the complete `package.json`, lockfile, `.github/workflows` and `contracts` objects are identical. This preserves all **56 npm commands**, non-script package metadata/dependencies, **six workflows**, and **65 contract entries**, including the gitlink.

The entire scripts tree in PR #208 equals PR #207. Relative to PR #205, its only script changes are the independently reviewed portal repair and regression (`scripts/portal/build.mjs` and `scripts/portal/build.test.mjs`). All other scripts, including native financial harnesses and their waits/assertions, remain byte-identical. This distinction prevents an inaccurate claim that the whole scripts tree was unchanged by the core repair.

None of the unfinished historical updater browser files is present in PR #208:

- `scripts/fixtures/release-update-browser.ts`
- `scripts/test-release-update-browser.mjs`
- `scripts/tsconfig.release-update-fixture.json`

There is no `test:updates:browser` command or new updater workflow gate. The source-only recovery checkpoint `01f40b3` and its incomplete own-lock/result-oracle adaptation were not silently included. The report documenting those gaps does not revoke or enlarge the separately reviewed backup-verification scope. No takeover of the screened implementation was attempted by this audit.

The maintained AppServices startup still supplies `ReleaseEnabled:0` and an empty `connectOrigins` list. `OfflineRoot` retains the default `noApprovedRegistry` source; the registry source itself remains unchanged. The backup APIs expose verification through the maintained runtime and do not add an updater route, trust root or destination.

## Existing qualification evidence checked

Every referenced local log exists and matches its published manifest's SHA-256: **11 core logs and six backup logs**, 17 matches in total. The actual full-suite log footers agree with the records:

| Existing execution | Source | Observed footer |
| --- | --- | --- |
| Core full | `7e8f93a` |2,259 tests; 2,259 passed; 0 failed/skipped/cancelled |
| Backup full | `2e2cf4d` |2,277 tests; 2,277 passed; 0 failed/skipped/cancelled |

The manifest source/tree fields resolve to the stated Git objects. The recorded type/policy/tooling/specification/boundary/docs/governance/build selections retain their own logs and exit records. This audit did not execute those commands or sum the separate author 111, security 40 and bug 39 selections into a new total. Existing log integrity and internal consistency are checked; the logs are not an independent execution witness or a substitute for current hosted gates.

## Existing default/demo artifact inspection

I inspected the already-produced files under the coordinator's backup-composition checkout, without rebuilding. Every asset listed in each local build-evidence file matches its recorded hash. Default contains 13 files including evidence; demo 14. Every repository-owned module hash in the document, vault Worker and QR Worker graphs matches published PR #208 source.

| Mode/graph | Listed modules | Repository-owned modules checked | Source mismatches | Updater/optional hits |
| --- | ---: | ---: | ---: | ---: |
| Default document |93|83|0|0|
| Demo document |95|85|0|0|
| Vault Worker, each mode |30|30|0|0|
| QR Worker, each mode |4|3|0|0|

The nine optional package names and all `release-update` source paths are absent from these six emitted-module lists. Both artifact evidence files retain `ReleaseEnabled:0`, `signedRelease:false`, and `releaseAcceptance:false`. Default `syntheticDemo` is false and demo is true. Dependency entries were not relabeled as repository-owned modules. Module-list inspection is not a proof of native isolation, every transformed-code behavior, XSS absence or physical-device support.

## Additional relay integration cross-check

At the relay integration worker's request, I independently compared frozen composition `46727d2a8ee1fd58cde15dcc252e1692408830f4`, tree `6745c3b148aed3e13c092cc1d917541c24a9a482`, against reviewed PR #206 `e848ae19574e8b7f4cb040082df5255ee5a63f1e` and PR #207.

From common base PR #205, PR #207 changes 34 paths and PR #206 changes 3, with **zero overlapping changed paths**. Applying both exact path sets plus the two independent relay test/report additions produces a complete tree map identical to the frozen composition, including modes and object identities. Its only production delta from PR #207 is `packages/relay/src/ad.ts`, byte-identical to the reviewed PR #206 blob. All 56 commands, metadata/lockfile, six workflows, 65 contract entries and the complete scripts tree match PR #207.

This checks the source union; it does not claim the relay worker's running full/native qualification is complete. Its later report-only changes need their usual publication check, and its future remote head must be resolved before assigning hosted results.

## Limits and handoff

No new product defect or new High/Medium finding was identified in this publication/integration scope. The underlying implementation assessments remain the scoped generation8–10 reviews. F24's native browser adapter/UI and exact own-lock lease remain incomplete, as explicitly documented; they are not treated as a demonstrated financial exploit in the completed backup prerequisite.

The coordinator should keep PR #207/208 draft until applicable current-source hosted/native checks and actual merge-checkout bindings are satisfied. Preserve the old failed runs and all native waits/assertions. Main integration, optional one-package intake, current-source distribution approval, owner trust and physical devices retain their separate gates. This report alone authorizes none of them.

Audit observation completed at `2026-11-20T02:57:37.341074+00:00`.

Local audit record `publication-audit-g11-git.json` SHA-256: `7f35316b8a6e5cedb6984a118730ec7b664350693c9504c190a0a8ab221936e1`.

Local audit record `publication-audit-g11-logs.json` SHA-256: `f6584cd4834b59d07cd83217c1e198c7af50c3145b0aad7d5d396ca370c5d9e4`.

Local audit record `publication-audit-g11-union-artifacts.json` SHA-256: `8f7d0fe5df2ad57a41a09685e5291d9b91582094b9a2fb227d9a6445d1b42fce`.
