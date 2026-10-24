# P2P Offramp restart — one EVM trade

**2026-10-24 UTC.** Start here before the historical [next-agent prompt](NEXT_AGENT_PROMPT.md). Work follows the GhostPay core milestone. This handoff grants no implementation, push, merge, trading-enable, release or deployment authority; follow the active owner task and supported access.

## Read and verify

1. Confirm `djshellshoxxx/p2p-offramp`, current refs, concurrent authors/work and applicable repository instructions. The owner continuation branch was PR #5 `claude/adoring-wozniak-850ue6` at application checkpoint `a606743d4f417ee37158e69292ea0395b55b5675`.
2. Preserve the stack: PR #5 targets PR #4's `work/p2p-client-shell-2026-10-24` (`8a88d11d8e419cd402b28428947e8fe4fbcfe893`); PR #4 targets `main` (`28bc32f1c8ea98d6216b2e1509b1fb5e3374bcfa`). Neither app PR was merged at this checkpoint. The lean-docs PR targets PR #5's continuation branch, not main. Review application changes separately; do not merge them just to expose documentation.
3. Read [lean scope](LEAN_RELEASE_SCOPE.md), [SESSION_STATUS](SESSION_STATUS.md), [client-shell handoff](../HANDOFF-2026-10-24-CLIENT-SHELL.md), [work plan](../WORK-PLAN-2026-10-24.md) and [client-side ADR](../adr/ADR-CLIENT-SIDE-2026-10-24.md). Historical tests do not qualify a later source or close new cases.
4. Obtain the owner-supplied private review packet through the executor's supported channel before detailed reproductions. Do not assume automatic Claude access to private Library items, chats or local preparation paths; do not publish detailed unverified findings.

## First milestone and dependencies

Establish G09 durable-result/no-op-preflight acceptance, then source-bound G03 recovery/resealer reconciliation and typed quota behavior. Reproduce assigned cases on the exact source before the smallest authorized fix. The recent identity review did not establish a new key-isolation defect; optional exception-normalization robustness must not displace the core milestone.

Preserve cap 16, exact persisted-envelope comparison, fresh-key recovery with the source retained, interrupted-resume and cross-tab cases. Never use source deletion/overwrite or a capacity increase as a shortcut.

Then complete approved G11/G15 registry/manifest trust → G16 signed terms → wallet/escrow/offer exchange/trade UI → a two-party local/test EVM trade and recovery proof. Keep `ReleaseEnabled=0` and `connectOrigins: []` until the applicable prerequisites and authority exist. The shell remains an offline foundation preview, not a working off-ramp.

Use existing validation commands/gates in SESSION_STATUS and repository instructions. Distinguish historical evidence, focused checks, full reruns and skipped/blocked gates; documentation checks are not full application tests. Record SHA, changed files/functions, exact commands/results, independent review, unresolved cases and next unreviewed area at each authorized milestone.

Do not merge the custodial-ledger branch, force-push, release, deploy or use production funds. Inspect workflow side effects and read back remote hashes before claiming any authorized publication succeeded.
