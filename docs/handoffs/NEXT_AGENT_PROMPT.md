# Next agent prompt (paste as-is)

## Current pointer (2026-10-25 ~11:30 UTC) — read first

P2P owner session 01BAvLvx. Branch `claude/adoring-wozniak-850ue6` (PR #5). Read `SESSION_STATUS.md`: the "v29 review-queue reconciliation" table and the "Handoff checkpoint" section.

Done on PR #5 — do not redo:
- cap 16 and inventory;
- create/restore/inventory UI;
- G09 core, durable result and stale empty-plan freshness;
- typed quota (Worker);
- G03 resealer, with two-tab and page-close evidence;
- saturated-origin recovery evidence;
- G03 R1 uncertain-restore reconciliation;
- typed quota through to the UI;
- persisted G09 readback;
- reseal SIGKILL evidence.

Next (reseal SIGKILL evidence is done):
1. Real-browser quota failure, if a reliable method exists (the DevTools quota override did not work in Chromium 153).

G11/G15 waits on the owner's trust-root decision. The v29 packet archive is private and not in the repo; ask the owner for it.


## Scope override — 2026-10-24 UTC

The owner-approved [lean scope](LEAN_RELEASE_SCOPE.md) and [restart instructions](RESTART.md) supersede the historical baseline and priority list below. Read them first. Preserve [SESSION_STATUS](SESSION_STATUS.md) as historical test/provenance evidence, not a current rerun.

Next after GhostPay: verify PR #5's continuation branch and preserve the PR #4/#5 stack; establish G09/G03 recovery acceptance, then G11/G15 trust, G16 terms and one two-party local/test EVM trade. A profile-only shell is not an off-ramp. Keep cap 16 and trading/network disabled.

Detailed reproductions require the owner-supplied private review packet via supported access; no automatic Library access is assumed. This documentation grants no runtime, merge, release, deployment or production-funds authority. Keep all existing acceptance/security gates and preserve deferred work.

## Historical prompt — retained, subordinate to the override


You are the integration owner for `djshellshoxxx/p2p-offramp`. A sibling session owns `djshellshoxxx/GhostPay`; do not touch it.

Start by reading `docs/handoffs/SESSION_STATUS.md`, `docs/HANDOFF-2026-10-24-CLIENT-SHELL.md`, `docs/WORK-PLAN-2026-10-24.md` and `docs/adr/ADR-CLIENT-SIDE-2026-10-24.md`.

Branch state at handoff:
- Work branch: `claude/adoring-wozniak-850ue6`, PR #5 (draft, stacked on PR #4 `work/p2p-client-shell-2026-10-24` @ `8a88d11`).
- Verify the head with `git ls-remote origin refs/heads/claude/adoring-wozniak-850ue6`. Code checkpoint `0b8caa0` comes before the final docs commit.
- `main` = `28bc32f`. PRs #1–#3 are ancestors of #4.

Do NOT redo:
- Profile capacity bound (`MAX_VAULT_PROFILES=16`, atomic count+add in one IDB transaction).
- Profile inventory.
- Worker/runtime `create`/`restore`/`listProfiles`.
- Create/restore/inventory UI.
- The G09 in-place migration core (`migration-service.ts`).
All of these are implemented and tested on PR #5. The old `fc146bb` capacity fix is unavailable; do not try to recover it.

Do NOT:
- Merge `feat/custodial-ledger-foundation`.
- Force-push, deploy, or release.
- Enable trading, wallets or network (`ReleaseEnabled=0`, `connectOrigins: []`).
- Use real funds.

First validation commands:
```sh
git fetch origin && git checkout claude/adoring-wozniak-850ue6 && git pull origin claude/adoring-wozniak-850ue6
npm ci && npm test && npm run typecheck && npm run check:boundaries && npm run test:build-policy
npm run build && npm run test:browser && npm run test:web:browser && npm run check:specs && npm run test:specs
```

Then:
1. Check CI on PRs #4 and #5. Fix any red, and get them reviewed and merged on the exact head.
2. Continue in this order: G09 resealer remainder → G11 signed registry + G15 manifest → H1 signed trade terms → H2 EVM escrow (local anvil) / H4 adapters → M5/H5 transport.
3. Update `docs/handoffs/SESSION_STATUS.md` at each milestone. Record exact commands and results. Keep historical results separate from results you rerun.

Active workers: none for p2p-offramp at handoff.
