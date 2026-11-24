# S07 native journey: D9 approval-restart matrix recovery — 2026-11-24 UTC

## Source-bound finding

Main `8cff44909752f5e8b99eecec44ebaa44360c7b5d`, complete tree `7acfe2f7c7f1ebf0b13169cc2b50f4d2b946ab79`. Original open PR43 head `bc549f477f86e27516f554c7f1923a7147b82ea4`, stage parent `58b3c876ae6036114a195af6b2dcc4c9cc2a09ad`: five commits, 24 stage-local paths. Both recursive Git tree reads were complete (not truncated). 21 paths are absent at their old names; three retained paths differ. Zero exact path/blob matches in this stage comparison. This is **not** evidence that all 21 capabilities are missing: the former private journey uses superseded interfaces, and the D9 migration changes durable authority. No historical production implementation should be transplanted wholesale. PR43 retains its owner, Tier C scope, and V status.

| Stage-local path | Historical blob | Current main blob |
| --- | --- | --- |
| .github/workflows/evm-escrow.yml | `53aef3e663c8ea39bf01315e5844ee59d9cd9f22` | `26c317db158bec40a12b9ca2234b3b617780959d` |
| .github/workflows/vault-foundation.yml | `091a89b3de9369e484a258915ae0228ac9318ea8` | `c539e5e80c6f534429c942894031336d6db9938f` |
| apps/web/src/journey/README.md | `eabd9c43264894d90ea0483450eec2c55a3468a1` | Absent at same path |
| apps/web/src/journey/native-contracts.ts | `48d5c608d76f60377857a20a1fdadf18a86e88ca` | Absent at same path |
| apps/web/src/journey/presentation.ts | `12319f3731304d53457c271d93fdae572b104682` | Absent at same path |
| apps/web/src/journey/private-trade.ts | `a010d917c652aecae1e77a2e2549ca4b658bfc0e` | Absent at same path |
| apps/web/src/journey/screen.ts | `5b17a440b25c66a52e1bb0911ee0bea92790b19c` | Absent at same path |
| apps/web/src/journey/vault-composition.ts | `21bee9b8bf8225e28f527670277316b30bde6b0b` | Absent at same path |
| apps/web/src/retention/native-retention.ts | `e17a1d20c80fd2d5f65e0a1aab90d96d0ad1dfd0` | Absent at same path |
| apps/web/test/journey-private-trade-recovery.test.mjs | `3d0cfceda86b4706cb68e80b8d0010d8814b81f0` | Absent at same path |
| apps/web/test/journey-private-trade.test.mjs | `8870260be4901676d34b284a57c11b360b54da0d` | Absent at same path |
| apps/web/test/journey-vault-composition.test.mjs | `89145daf0f39dd6d66006132244c2b0d355c6ca8` | Absent at same path |
| apps/web/test/retention-native.test.mjs | `f08181cf68da9852a4cd2509d80d1bdca6476acc` | Absent at same path |
| apps/web/test/transport-selection-runtime.test.mjs | `3a7651f09eb4bb870302fb02505cfd8a163deff6` | Absent at same path |
| package.json | `4b08894c0f108c14f486caca082ba2d443b10b5b` | `9bb6a80bcea23db82555085914b96eb02dbd3487` |
| scripts/fixtures/journey-origin-screen.mjs | `d92df9cefad9bf07f1561ce829f1e55dcab7f21f` | Absent at same path |
| scripts/fixtures/journey-origin-worker.mjs | `c364697786f4af314441520eee992a906f065570` | Absent at same path |
| scripts/fixtures/journey-screen.mjs | `b0c8432d796b46d2eacbd5e692582c16074ad231` | Absent at same path |
| scripts/fixtures/journey-worker.mjs | `d02d3933f3573b559e66a75d901020524aaa9039` | Absent at same path |
| scripts/fixtures/retention-browser.tsx | `db7d56465ae2655cdcffea20b6d92c86c6dc3326` | Absent at same path |
| scripts/fixtures/retention-worker.mjs | `f157e17de845a7eb1e6a782a071a8d91cbce1516` | Absent at same path |
| scripts/test-journey-browser.mjs | `541c4e73feba912efff21d721aebc17c8f810be4` | Absent at same path |
| scripts/test-journey-origin-browser.mjs | `263e7b0f6569f5c695306e32dbd42e4de14c1c6f` | Absent at same path |
| scripts/test-retention-browser.mjs | `f91ca9fba47385000a8145ec29fee46736f6dee0` | Absent at same path |

## Maintained test-intent comparison

- The old `apps/web/test/journey-private-trade-recovery.test.mjs` (blob `3d0cfceda86b4706cb68e80b8d0010d8814b81f0`) includes a funded restart after cancellation with identical nonce and calldata. Some other cases explicitly preserve the historical pre-D9 fail-closed behavior; those expectations cannot be copied into the version-2 provenance model.
- Main's `docs/consolidation/2026-11-16-d9-migration.md` and accepted D9 packet establish version 2, atomic permanent marker, matching origin profile, no never-sent proof from legacy/imported metadata, and no automatic resend. The current `packages/domain/test/tx-lifecycle.test.mjs` blob `cf44aa10b7a1e81abb423b234bda88507bf881fa` tests later funding and restart after 100 simulated blocks with same/different nonce, **but always changes calldata to 0x01**. Read the actual test bodies, not just titles.
- The restored-profile test in `packages/domain/test/redteam-pass2-d9.test.mjs` blob `5d79fa7879549a548767f0947deb94911e038866` also changes calldata and separately exercises finalized nonce evidence. Its restore semantics are not replaced. Current domain tests cover marked wallet rejection, fresh-key and legacy holds, prepared value-moving action refusal, funded release/refund recovery, and no resends. `packages/domain/test/intent-journal.test.mjs` covers CAS and cross-trade nonce reservations; `packages/domain/test/trade-composition.test.mjs` covers stale authority; `packages/storage/test/retention-service.test.mjs` covers scoped retention/CAS; current backup runtime tests cover Worker-owned backup facts. These are source-level overlap observations, not a proof of equivalent native app integration. The historical journey, native retention and transport-selection test corpus still needs full intent-by-intent comparison.

## New isolated test-only candidate

[DRAFT PR254](https://github.com/djshellshoxxx/p2p-offramp/pull/254) head `d364642d09d04da864fe56db78245a4133db2c18`; tree `4e397ca9ec2ee088e4d965cf447950a7e9b3125a`; original and new file blobs `cf44aa10b7a1e81abb423b234bda88507bf881fa` and `d310c00b52365b74302a2f4eef6131ca20502c70`. GitHub compare: 1 commit ahead, 0 behind, only `packages/domain/test/tx-lifecycle.test.mjs`, +7/-2. Actual proposal `9553eccca2d3b0ba0db3d4d9f4d58837a15afb38` has ordered parents [current main, exact PR254 head] and identical tree.

Expand 2→4 nonce/calldata variants in the maintained test; assert distinct durable identity, actual nonce/data equality or inequality, failed cancelled row with null marker/hash, funded escrow after the existing restart, and exactly two sends. Prior assertions intact. Controlled fake chain with real encrypted journal, not physical wallet or browser acceptance. No production change or test failure reproduced: source readback verified, local runtime **not run** (direct Git DNS failure, historical checkout absent); 14 check records queued at initial read, independent review pending. No merge; S07 remains V. If any case fails, preserve the failure and diagnose against D9 policy before changing code, not the assertions.

## Live gate changes

- PR252 exact head `5de3606ed0c91d2795c3ca5964b92e41142ac9d1`: 15/15 check records successful; program job 138089478483 actually used old-main proposal `dcf8bcae55fbd77cd552ecd629a0efea156a6413` and completed with no fixture errors. Current main differs; named Tier B and independent review absent. No merge.
- PR243 exact head `9a321395d89389b51c8cfbe7f12330e3b6fc8b9f`: 12/12 reported successful; Chromium job 138094888039 and native job 138094902266 actually checked out `49990b45e7a13ca40ee29eb61a108ade0a1dd678`, parents PR239 and exact head, tree `7f9054735b1fae6facc37dc45654993a57fc17eb`. Browser log contains clipboard absence and denied manual copy/private-startup success, native log has no fixture errors. No review, parent chain, or CodeQL approval implied.
- PR253: 14/14 reported success, but actual proposal `77d1b85088ba350ef2e173c4729f62ba3f6e95a2` remains old-main target. Review 6031271905 is COMMENT. Keep exact-target qualification separate.
- PR237: CodeRabbit and Qodo were requested in comments 7061409983 and 7061730064; zero submitted reviews. No named pass.
- PR245 previous head `924166c61bd782a12fddebc3ac4a7ae58d9df716`: 13/14 successful, WebKit job 138123320328 cancelled after setup on actual new-main proposal `fcb9d887da785372d479b956fcbce58ed3a52566`. Retain cancellation, do not mark green. This new documentation checkpoint requires its own qualification.

Census after PR254 publication, before this documentation commit: 266 branch refs, 251 PRs (68 open/125 merged/58 closed unmerged); empty terminal pages. Full Git patch-equivalence snapshot still dated to earlier main, not recomputed here. The inventory overlay records deltas without rewriting the source-bound historical counts. Preserve D2 public trust material, D8 financial approvals, device acceptance, Tier B named review and optional one-package gates. ReleaseEnabled=0; no deployment or live funds.
