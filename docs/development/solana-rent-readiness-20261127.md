# Native Solana payout rent readiness

Baseline: `main` at `fdf346ab8e6aacc60b501007ec10ec7ee840a701`. This is a client planning and recovery correction;
it changes no native program, deployment, release flag, global schema or owner policy.

## Incomplete behavior and plan

The genuine finalized reader already reports unsupported Rent sysvar thresholds as `rent-unknown`, and the
settlement planner already waits on that blocker. The payout message planner ignored it, however. A full-client
reproduction reached one wallet signature and one `sendTransaction`. Recovery exit guidance also described both
unknown rent and a known shortfall as an open payout, while the default zero top-up limit refused the latter.

The completed implementation steps are:

1. Refuse native payout planning with `CONFLICT` when the trusted snapshot reports `rent-unknown`, before an
   intent, signature or send can be created. The same planner governs review preparation and confirmation rechecks.
2. Report closed recovery payout exits with the reader's `rent-shortfall` or `rent-unknown` reason. Retain
   `not-terminal` and `paid-out` precedence and preserve state-only release and refund.
3. Preserve the existing localnet known-shortfall review route. It still requires a fresh read, the matching
   connected trade wallet, an allowed role and no pending intent. Preparation enforces the explicit top-up limit,
   including zero by default; confirmation remains separate.
4. Cover the real reader, portable recovery builder, full client and encrypted controller, then run the repository
   gates and review the change for signing, submission and recovery regressions.

The candidate overlap check found that [PR #244](https://github.com/djshellshoxxx/p2p-offramp/pull/244), relative to
its #242 parent, adds browser diagnostics only. [PR #246](https://github.com/djshellshoxxx/p2p-offramp/pull/246)
adds EVM native acceptance/recovery coverage. Neither modifies the source changed here.

## Acceptance and evidence

Before the source correction, the focused regressions produced **15 passes and 5 failures**. The failures covered
unknown-rent planning, inaccurate recovery exit guidance, full-client signing/sending, prepared-review rechecks,
and direct controller review preparation. The full-client failure returned a `sent` submission.

The regressions exercise both terminal outcomes and both payers. Generated cases vary escrow balance, caller
limit and known shortfall size. They check:

- Unknown rent permits zero new wallet signatures, sends or intent writes on a new payout action.
- A review prepared under known rent cancels without signing if rent becomes unknown before confirmation; if it
  changes during the wallet call, the existing signature is never sent and the intent has no send marker.
- Recovery guidance reports the actual rent blocker; paid-out precedence and clean recovery stay intact.
- Known shortfalls require an explicit sufficient limit and encode exactly the required transfer.
- Controller review eligibility retains wallet, freshness and pending-intent guards, and preparation still rejects
  omitted or insufficient limits.
- Funded release and refund stay available through the portable builder and full client under either rent blocker.

## Validation results

| Gate | Result |
| --- | --- |
| Real-reader/full-client/controller baseline regressions | 15 passed, 5 failed before the source fix |
| `packages/chain-solana/test/*.test.mjs` and the controller suite | 337 passed |
| `npm test` | 2,514 passed, 0 failed, 1 existing Foundry-dependent skip |
| `npm run typecheck` | All four TypeScript projects passed |
| `npm run test:specs` | 32 passed |
| `npm run check:specs` | 173 specifications, 0 broken links, 0 unindexed files |
| `npm run check:boundaries` | Passed: 241 production source files, 148 core modules visited |
| `npm run test:build-policy` | 58 passed |
| `npm run test:tooling` | 57 passed |
| `npm run build` | Static release-disabled build passed |
| Final package boundary check after documentation edits | 5 passed |

The skipped full-suite test compares calldata with `cast calldata`; Foundry is not installed in this environment.
Security and bug self-review checked snapshot branding, paid-out precedence, payout-only guard placement, exact
top-up amounts, role and wallet checks, freshness, pending intent exclusion, and prepare/confirm revalidation.
The source change introduces no new execution capability or signature authority.

These are deterministic source/integration tests with synthetic RPC and wallet fixtures, not a new
local-validator or physical-wallet qualification. D8 Tier C written owner approval remains required before merge
because the change touches signing and recovery behavior.
