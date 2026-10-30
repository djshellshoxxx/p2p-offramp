# PR 14 runtime repair checkpoint — 2026-10-30

Status: local reproduced defects repaired; publication and exact-head hosted qualification pending at this source checkpoint. This is not merge/release acceptance.

## Ownership and ancestry

The owner explicitly requested finishing PR #14 fixes, making it merge-ready, merging it, then creating a project-completion handoff/prompt. This coordinator owns this bounded exchange runtime repair and integration. PR #17 owns only the test-wrapper repair/evidence and is incorporated intact through parent `adfbec52f964d9b07c571b8924d31fa03d54e03a` (source repair `08d83a5dd07054b0dfecdf1581eca17101fa35a8`). PR #14 original runtime is `0054543f81f48e928a46bd58c1dab14f91d0edeb`. The independent PR #16 review and all seven artifacts are retained through parent `9f80c9b27b943b30409710dea76a53d97a761832`.

PR #14 targets integration `claude/sweet-noether-arf6ne` at `47f9bbee455e7affbc39539489227228eb346a0f`, not main (`c8547859f603f04d3df92e68925b99162594c39d`). Testnet remains `7165626c17d8afb7ad7fce461ae7df9cbfcdba07`. Recheck all refs before merging. PR #15 relay is separately owned at `e0961edc8cb64b466a2a3193aa37158bfc8c3487`; app/runtime/schemas ownership remains reserved/unresolved. None of those files is edited here.

## Behavior and changed files

- `packages/exchange/src/exchange.ts`: retain the close guards; revalidate captured session identity/state, fresh clock, advertisement and terms/message expiry, and replay capacity immediately before committing a result. New takes carry bounded latest-operation tokens, so delayed takes cannot replace a newer terminal session. Accepted sessions remain nonrestartable and are retained until advertisement expiry within the existing session cap. Offer size is checked before defensive copying.
- `packages/exchange/test/exchange.test.mjs`: exact PR #17 provider-wrapper repair is inherited, not recreated.
- `packages/exchange/test/async-boundaries.test.mjs`: twelve deterministic schedules using the real repository providers (pending execution at this checkpoint); each has a ten-second failure deadline.
- Existing close evidence harness now uses native source imports and fixed fixture modules instead of source-text evaluation. This does not assert a cause for Sonar's original finding and adds no exclusions/suppression.
- `docs/evidence/P2P_EXCHANGE_FINISH_20261030/`: exact source hashes, original failure observations, repaired observations, and reviewer reproductions. PR #16 and #17 original failure artifacts remain unchanged.

## Validation and review

Local executed against the modified runtime: close take/receive both return CLOSED with zero sessions; four original async contracts pass; delayed takes preserve newer cancelled/accepted sessions and return OUT_OF_ORDER; a 1 MiB offer returns LIMIT_EXCEEDED with zero copying and retains taken state. These probes import actual exchange/messages/machine and use explicitly synthetic crypto/review fixtures. New real-provider test file passes syntax checking only locally.

Separate specification and standards reviewers identified the additional delayed-take and pre-copy-cap defects. They were reproduced before fixing. Standards re-review found no remaining blocker; specification re-review must be checked before publication/merge. Neither review is a whole-project independent security audit.

Local npm registry access was denied by the managed proxy (EPERM connecting to 172.31.14.13:8080). No bypass or alternate package download was attempted. The existing GitHub hosted workflows must run pinned typecheck, Node tests, browser, specification, build-policy, fuzz, forge and local-trade checks on the new exact head. Prior PR #17 source evidence was 782 passing, one cast-calldata/Foundry skip, zero failures; it does not qualify these new runtime changes. Preserve that skip unless the actual new run executes it.

Original PR #14 Sonar security grade D and PR #10/#12 parent security/reliability failures remain unresolved until new exact-head results say otherwise. Sonar detail host is not permitted in this environment; an earlier GitHub annotation request was rejected as unsupported. Do not bypass either restriction. A green incremental PR #17 does not clear the parent gate.

## Restart

1. Resolve any remaining source-review finding; publish only the explicit exchange/evidence allowlist on the current PR #14 branch with an expected-head lease, preserving PR #17 and PR #16 histories and their branches.
2. Record resulting source SHA and exact-head hosted results, including skipped tests and failed gates. Recheck concurrent refs/ownership. Merge PR #14 into its existing integration target only after all required checks and substantive review pass. Do not submit a GitHub approval review.
3. Record remote merge SHA or precise blocker; create the final completion prompt with current branch/ownership map and acceptance sequence. Parent PR #10/#12 cannot merge to main until their own gates pass.
4. Preserve inaccessible local-only branches `work/p2p-restore-commit-reconciliation-test-2026-10-26` at `beb9866ed39452b603554d364c98fe025372da3a` and `work/p2p-validation-20261030` at `9eed65dabb2437b87270dab3f676133a063b5bef`; this snapshot is not their executor and does not consolidate them. Coordinate G16 with schemas/runtime owner and retain the saved-review.ts facade export.

Client-only and noncustodial boundaries, ReleaseEnabled=0 and connectOrigins=[] remain unchanged. No deployment, funds, credentials, security setting, paid infrastructure, custodial-ledger merge or release authority is implied. No paid Claude invocation or measured prompt-cache usage occurred.
