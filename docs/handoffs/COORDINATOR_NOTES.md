# Coordinator notes (session sweet-noether)

Quick restart notes. Updated at every milestone. Newest entry first. Read this, then `git ls-remote origin`.

## 2026-10-27 — wave 2 started

- Draft PR #10 (escrow) open + subscribed. Worker (Sonnet) running on local branch `wave2/evm-local-trade`:
  `packages/wallet/src/evm-escrow.ts` calldata/event decoder + `scripts/test-evm-local-trade.mjs` anvil two-party trade.
  If interrupted: check that branch's commits in its worktree, resume or re-spawn with the same prompt.

## 2026-10-27 — EVM escrow merged into integration branch

- `claude/sweet-noether-arf6ne` = origin/main `c854785` + escrow merge `237305f`. Draft PR opened to main.
- `contracts/evm/BasicEscrow.sol`: no admin; tradeId computed on-chain = `evmTermsHash` (packages/wallet/src/evm-terms.ts);
  failed push payout credits recipient + `withdraw`. forge 82/82 (61 unit, 6 fixture vs local-evm-scenario, 10 fuzz, 5 invariant).
- Gates on merged tree: npm test 381/381, typecheck, check:specs, check:boundaries, test:browser, build all exit 0.
- Open: on-chain acceptance-signature check (EOA/EIP-1271) not done; no audit. Next candidates: escrow client calldata
  builder + G12 submit/reconcile (check other session's SESSION_STATUS first), anvil two-party local trade proof.

## 2026-10-27 ~22:10 UTC — resume after 3-day gap

- PR #3 (wave-1 CI + runbooks) merged. `main` now = `6d76590` (PR #4 shell + PR #5 profiles/G03/G09/G11/G16/test-only G10).
- Another session owns `claude/trade-review-integration` (draft PR #8, stacked on #7). Do NOT touch its files:
  `apps/web/src/trade/**`, `apps/web/src/ui/trade/**`, `packages/domain/src/terms-review.ts`, runtime/Worker files.
- That session is BLOCKED on the EVM escrow (Foundry permission). Foundry is installed here (`~/.foundry/bin`), so
  this session takes the **EVM escrow** (`contracts/evm/**`) — no file overlap.
- Wave-1 worker status:
  - E1 CI/runbooks: merged (PR #3).
  - H2 EVM escrow: local branch `wave1/h2-evm-escrow` @ `9c83634` (contract + mocks, no tests yet). **Resume this**,
    rebased on main, binding tradeId to main's G16 encoding (`packages/schemas` / `packages/wallet` evm-terms).
  - M1 G09, M2 G11, M4 G07 shell, H1 G16: **superseded by main**. Do not resume. Uncommitted WIP left in their worktrees only.
  - M3 G14 extensions: local branch `wave1/m3-g14-extensions` @ `f996b44` + uncommitted WIP. Not in lean scope; parked.
  - H3 Solana: uncommitted `programs/` WIP only. Lean scope marks Solana `later-preserved`; parked.
- Rule: only push `claude/sweet-noether-arf6ne`. Merge each worker as soon as it is green, push, update this file.

## Next steps

1. Resume H2 escrow worker → forge tests (unit/fuzz/invariant) green → merge here → push → draft PR.
2. Then: G12 submit path / escrow client bindings only if the other session has not started them (check its SESSION_STATUS.md).
