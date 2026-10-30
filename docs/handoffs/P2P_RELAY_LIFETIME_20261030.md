# Relay lifetime repair — 2026-10-30

## Source, ownership and restart
- Verified integration source: 47f9bbee455e7affbc39539489227228eb346a0f.
- Source/test repair commit: b6245e50f7bc71ef5563c6bb830f23e47877bb00; tree 2947c1683082cde252fad78c152bbc64a9c8f550.
- Documentation SHA: the commit containing this file. Resolve the branch ref and verify its source files still have the hashes below.
- Branch: work/p2p-relay-lifetime-20261030; intended PR base claude/sweet-noether-arf6ne.
- This session owns only packages/relay/src/pool.ts, packages/relay/test/pool-lifetime.test.mjs, this handoff and its new evidence directory. It did not change another worker's branch.
- Historical reservations remain: apps/web/src/trade/**, apps/web/src/ui/trade/**, packages/domain/src/terms-review.ts, app runtime/Worker and schemas. Current owner availability/release is unverified. No G16 extraction was applied.
- A separate work/p2p-exchange-close-20261030 branch appeared at 47f9bbe during this run; treat exchange changes as another session's scope and recheck its current state before consolidation.

## Demonstrated defects and repair
The original 22 relay pool tests passed. A new seven-case deterministic suite failed six cases on the exact base: caller cancellation and pool shutdown during connection could send a late EVENT; shutdown and broker revocation after send did not immediately close/settle the publication; unsolicited CLOSED could poison a future subscription; EOSE could notify an already closed subscription.
The first repair passed 57 related tests, but three added boundary cases failed: an already-open socket could be lost when the broker discarded its result after cancellation, and pool/last-subscription closure left pending read connections alive until timeout.

The final implementation:
- binds each publication's entire lifetime to a cancellation controller passed to G05 capture;
- closes/settles as unknown on pool close or scope revocation, retaining unknown after a late ACK;
- retains ownership of provisional sockets across the asynchronous scope.run result;
- aborts pending read connections on teardown;
- accepts CLOSED only for an existing requested subscription and ignores EOSE after CLOSED.
No automatic publication retry, new settlement authority, or claim that already-sent bytes can be recalled.

## Changed product files
- packages/relay/src/pool.ts
  - Git blob: ad0556ae27407ee8b4da13d7eec0bdb875f004e7
  - SHA-256: 4d1bb6dc374cd152173cb53046a88a9f8e6cf84390d4bbb92f51fe01f64cbe2b
- packages/relay/test/pool-lifetime.test.mjs
  - Git blob: 5cefeaf2bbd83c64fff5bedf7aac5ecb35512edb
  - SHA-256: 2b90343f28635b80b9097f69787e380db0bc410aa20d6439068398f5bb22ecc2

## Verification and original evidence
Node v24.22.1. A 30-file, partial source snapshot was read via the authorized GitHub connector and each file matched its base Git blob SHA before the exact baseline/regression runs. This is not a full checkout or recovery of prior local Git history. Existing @noble/curves and @noble/hashes 2.4.0 packages were copied locally for the focused tests; no dependency manifest or lock changed.

- Exact baseline: node --test packages/relay/test/pool.test.mjs: 22 pass / 0 fail / 0 skip.
- Initial regression on 47f9bbe: 1 pass / 6 fail / 0 skip (original TAP retained).
- Boundary regression on the intermediate first repair: 7 pass / 3 fail / 0 skip (original TAP and intermediate source retained).
- Final: node --test --test-reporter=tap packages/relay/test/pool-lifetime.test.mjs packages/relay/test/pool.test.mjs packages/relay/test/ad.test.mjs packages/transport/test/*.test.mjs: 60 pass / 0 fail / 0 skip.
- Supplementary strict TypeScript check for packages/relay/src/pool.ts: exit 0 using available TypeScript 5.9.3 with --strict --noEmit --allowImportingTsExtensions --target ES2022 --module NodeNext --moduleResolution NodeNext --lib ES2022,DOM. This is not the repository-pinned 7.0.2 full typecheck.
- No full-project build, real relay test, browser suite, forge/Foundry proof or independent security review was rerun locally.
- The owner's historical 776 passes / one Foundry skip and seeded 4096 cases / 26 self-tests remain historical, source-specific results. No skips or thresholds were erased.

Evidence files under ../evidence/P2P_RELAY_LIFETIME_20261030/ retain the original output. The intermediate source is named first-fix-source.txt and is evidence only, not production code.
- relay-baseline-exact.log: SHA-256 80e006f3f7931a45b686e21e9236bc5ee772a7d28bd4630116f96f204f829e1c
- relay-lifetime-red.tap: SHA-256 d86b8487d69278d5be8fa1925b097c7d3f38946a2c750ea85d308f37d86c1ac6
- relay-lifetime-boundary-red.tap: SHA-256 1cb62031e8a4dd8cbdeeee34cce2ec83e36c11238cb7e91aa7c1bb8ea3ec6a23
- relay-lifetime-final-green.tap: SHA-256 9a889511f738fd21c5bc6fba8b83bb8de2e97d051f3aa63e886bc485d05e18ee
- first-fix-source.txt: SHA-256 efb306d56f5597a03a35c7479df8506c883c7c3144dd29c8890bf9a09d2e6cb2

## Gates and access
Read COORDINATOR_NOTES.md, LEAN_RELEASE_SCOPE.md and prior gate checkpoint e762e649600493221e3bd10f0c3525858722bc94. Main c8547859f603f04d3df92e68925b99162594c39d and testnet 7165626c17d8afb7ad7fce461ae7df9cbfcdba07 remain in the integration ancestry; original drafts #10–#13 remain open.

At integration/testnet exact heads, core GitHub Actions and CodeQL pass; SonarCloud fails E Security and E Reliability, required A. CodeRabbit skipped the integration draft. GitHub PR search is available. The GitHub connector rejected the Sonar check-run annotations URL with HTTP 400 INVALID_ARGUMENT (not an allowed endpoint); that action stopped. Detailed rule/location findings remain unavailable. Do not assume public anvil fixture keys explain the gate.

The prior dedicated executor and its local status/worktrees/unique commits are not accessible here. /workspace/p2p-offramp-pr5-validation is absent. No cloud environment_status tool is exposed and /etc/codex/network-policy.json is absent. No alternative Git transport, credential creation or network/security-setting change was attempted. Authorized GitHub source reads and commits are available. Preserve the unavailable local branches wherever they exist:
- work/p2p-restore-commit-reconciliation-test-2026-10-26 at beb9866ed39452b603554d364c98fe025372da3a.
- work/p2p-validation-20261030 at 9eed65dabb2437b87270dab3f676133a063b5bef.
The saved-review export remains byte-identical; the schema facade was read for test dependencies only.

## Remote status and next steps
The source ref update to b6245e50f7bc71ef5563c6bb830f23e47877bb00 succeeded with an expected-parent check and force=false. The documentation commit, remote file hashes, draft PR URL and exact-head hosted CI are verified/recorded in the following checkpoint or PR description. Pending hosted checks are not passes.

1. Inspect this draft's exact head, full CI and substantive review; fix concrete failures in this owned relay scope.
2. Reconcile the separate exchange branch and reserved app/runtime/schemas ownership without editing their branches.
3. Obtain authorized Sonar issue details for the affected analysis heads and resolve findings without weakening gates.
4. Once all required exact-head tests, security gates and substantive review pass, consolidate under the coordinator, with PR #12 before #10. Never merge the custodial-ledger branch.
5. Recover/inspect the original executor before claiming its unique local G16 or validation work is consolidated.

ReleaseEnabled=0 and connectOrigins: [] remain unchanged. Client-side/noncustodial boundary unchanged. No deployment, live funds, credentials, security changes, infrastructure spending or PR approvals. No paid Claude calls. The current model interface exposes no cache configuration or measured cache usage, so no cache claim is made.
