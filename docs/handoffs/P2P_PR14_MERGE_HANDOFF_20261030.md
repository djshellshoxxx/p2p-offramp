# PR #14 merge handoff — 2026-10-30 11:02 UTC

**Fixes published; merge pending hosted CI. No merge attempt has been made.** The owner authorized finishing PR #14, making it merge-ready and merging it, then creating this handoff and a prompt to finish the project. No further routine merge permission is needed once the existing acceptance gates pass. Do not submit a PR approval review.

## Exact checkpoint

- PR #14: https://github.com/djshellshoxxx/p2p-offramp/pull/14 — open, no longer draft. GitHub reports mergeable=true, mergeable_state=unstable; this is not acceptance.
- Source/head `2d3135b646bf99f63935287a082856ea7fe6b74d`; tree `634a2ec9e910c31844f9ea7de7e5f4b1cde96ef6`.
- Runtime/test commit `f379dc243cd9164da076c69702c2b5c21898f520`; runtime blob `888a199d6ec7ab5843c6e57f0e371949de3f33eb`, SHA-256 `263aaf875c457e444aae904fc3f7d53c440e6e2fccc6888a234d932b9af7ae2a`.
- Target integration `claude/sweet-noether-arf6ne` remains `47f9bbee455e7affbc39539489227228eb346a0f`. Main remains `c8547859f603f04d3df92e68925b99162594c39d`. PR #14 targets integration, not main.
- Testnet remains `7165626c17d8afb7ad7fce461ae7df9cbfcdba07`.
- This documentation is published separately on `work/p2p-pr14-finish-handoff-20261030`, based exactly on source `2d3135b`. Its containing Git commit is the documentation SHA; the publication result and PR #14 body record that exact SHA. It does not advance PR #14's tested source or any other writer branch.

Read `P2P_FINISH_PROJECT_PROMPT_20261030.md` for the complete continuation prompt. The earlier `P2P_EXCHANGE_FINISH_20261030.md` describes the source milestones; this handoff supersedes its pending-review and old-Sonar status.

## Completed changes and preservation

`packages/exchange/src/exchange.ts` now rejects late results after close, stale/replaced sessions, expired advertisements/terms/messages, superseded takes, and replay-capacity overbooking before synchronous mutation. Accepted sessions cannot restart and consume the existing session capacity until advertisement expiry; cancelled/rejected sessions remain restartable. Offers are size-checked before allocating a defensive copy.

`packages/exchange/test/exchange.test.mjs` retains PR #17's repaired wrapper for the frozen provider, with its original assertions. `packages/exchange/test/async-boundaries.test.mjs` adds twelve real-provider schedules for expiry, same/different-address replacement generations, outgoing/incoming replay races, late takes against newer terminal sessions, and pre-copy size rejection. Each new test has a ten-second deadline.

The old close evidence harness now uses native imports and fixed synthetic fixtures instead of evaluating transformed source. The two new reviewer harnesses share setup, preserving the exact RED/GREEN observations. No scanner suppression, exclusions, workflow or security-setting changes were made.

The runtime commit retains PR #17 `adfbec52f964d9b07c571b8924d31fa03d54e03a` and PR #16 `9f80c9b27b943b30409710dea76a53d97a761832` as parents. Original branches and red evidence remain. Remote recursive-tree comparisons verified all 1,411 original PR #17 blobs retained, with only the explicit source/evidence allowlist changed; no deletion or unrelated source drift. The subsequent evidence-only tree changed six named files and left the runtime/test blobs unchanged.

## Review and executed evidence

Two separate read-only reviews covered specification behavior and bounded-resource/fixed-error/client authority standards. They found a late take replacing a newer accepted/cancelled session and a 1 MiB allocation before the offer cap. Both were reproduced before repair. Both focused re-reviews found no remaining source blocker.

Local executions against actual exchange/messages/machine with explicitly mocked crypto/review:
- Two close schedules return CLOSED with sessionCount=0.
- Four original async contracts pass: ad expiry, acceptance deadline, replacement identity, outgoing replay bound.
- Both late-take schedules return OUT_OF_ORDER and preserve the newer terminal session/address.
- A 1 MiB oversized offer returns LIMIT_EXCEEDED with zero copies and unchanged taken state.
- The specification reviewer ran seven additional lifecycle assertions covering restart, failed/superseded-token cleanup, pending capacity, accepted retention/exact-expiry reclamation, and close; all passed.
- The shared-harness refactor reproduces all four preserved red/green observation logs exactly. The new normal test file passes syntax checking.

These are scheduling/state probes, not cryptographic qualification, an independent project audit, funded-value proof or release acceptance. **The twelve new real-provider tests and full pinned typecheck/build suite have not yet executed in this session's environment or hosted CI.** Prior PR #17 evidence (782 passes, one cast-calldata/Foundry skip) belongs to its old source and does not qualify this repair.

## Exact-head hosted status and blocker

At the checkpoint source `2d3135b`:
- SonarCloud check **124025066415 passed**, with 0% new-code duplication, zero security hotspots, and two non-gate issues reported. Earlier source `f379dc2` failed duplication 15.9% against maximum 3%; the follow-up shared evidence setup and passed. Original PR #14's security failure is no longer the current failed gate. This does not resolve PR #10/#12 parent gates.
- CodeRabbit check **124024327323 skipped**. Do not count it as substantive review; the separate source reviews above are the review evidence.
- Snyk previously reported success with no manifest changes; recheck current status before merge.
- All twelve Actions jobs remain **queued**, with no logs/results: schemas-and-crypto, browser, specs, inventory, forge and local-trade, each triggered by push and pull request.

PR workflows: Vault foundation **41044252146**, EVM escrow **41044252121**, Specification inventory **41044252066**. Push counterparts: **41044244479**, **41044244485**, **41044244570**. Exact IDs/status summaries are in `docs/evidence/P2P_EXCHANGE_FINISH_20261030/hosted-checkpoint.json`. Required schemas/typecheck/build, normal Node tests, browser, build-policy/fuzz/spec and EVM qualification remain pending. No test pass is inferred from queueing, and no merge is attempted until these gates pass.

Local dependency access was **denied**: `npm view @noble/curves@2.4.0 version --fetch-retries=0 --fetch-timeout=10000` failed EPERM connecting to the managed proxy at 172.31.14.13:8080. No alternate download/credential/route was used; no usable offline dependency cache exists here. The GitHub connector publishes and reads successfully. Prior unsupported annotations access was not retried. The CI queue cause is unknown; no runner, billing or security settings were changed.

## Exact next merge action

1. Refresh PR #14's current head/base, checks, statuses and reviews; inspect new worker commits before writing. Do not blindly reuse this checkpoint if either ref moved.
2. Wait for the current-head required jobs. Fetch logs, preserve original failures/skips, fix demonstrated failures in the owned exchange scope, and rerun only appropriate affected checks. Do not weaken tests/compiler options or assume the Foundry-dependent Node skip disappeared.
3. When exact-head CI, security gates and substantive review pass, merge PR #14 into its existing integration base with a normal merge and expected head `2d3135b646bf99f63935287a082856ea7fe6b74d` (or the freshly reviewed successor). The merge is authorized; no PR approval review is authorized. If denied, stop the action and report exact reason. Recheck uncertain outcomes before any retry.
4. Verify PR merged status and remote integration merge SHA. Preserve branches. Record source/check/documentation SHAs, actual test counts and any skips in a follow-up checkpoint. Parent integration/main acceptance remains separate.
5. Reconcile the repaired history with PR #18 and review PR #15 with their owners, then follow the project-completion prompt.

## Other branches and ownership

PR #15 relay `e0961edc8cb64b466a2a3193aa37158bfc8c3487` remains separately owned and unmodified. App/trade/runtime/Worker/schemas ownership remains reserved; this task did not edit those files. PR #18 `31bbab0db07163c61b31dab75733e711440372b7` contains the old exchange runtime plus compatible relay/validation/screenshots; do not let consolidation overwrite this repair. Coordinate incorporation into that candidate and requalify the combined source.

Validation `cc9a0a4baa2ad11b9efe4ada639a809542a7c5c9` now preserves local checkpoint `9eed65d`. The unique G16 branch at `beb9866ed39452b603554d364c98fe025372da3a` remains inaccessible/unincorporated here; preserve it and coordinate extraction with schemas/runtime owner, keeping `saved-review.ts` exported. The local workspace used here is a partial materialized snapshot, not the original full checkout or another executor's unpublished work.

ReleaseEnabled=0, connectOrigins=[], client-only/noncustodial and profile/data-loss boundaries remain intact. No deployment, live funds, new credentials, security settings, custodial-ledger merge, paid infrastructure or paid Claude call occurred. No configurable/measured prompt caching was exposed.
