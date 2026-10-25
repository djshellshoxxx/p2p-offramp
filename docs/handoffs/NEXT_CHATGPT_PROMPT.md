# Next agent prompt (any assistant; paste as-is)

## Current pointer (2026-10-25 ~11:30 UTC) — read first

P2P owner session 01BAvLvx. Branch `claude/adoring-wozniak-850ue6` (PR #5). Read `SESSION_STATUS.md`: the "v29 review-queue reconciliation" table and the "Handoff checkpoint" section.

Done on PR #5 — do not redo:
- cap 16 and inventory;
- create/restore/inventory UI;
- G09 core, durable result and stale empty-plan freshness;
- typed quota (Worker);
- G03 resealer, with two-tab and page-close evidence;
- saturated-origin recovery evidence;
- G03 R1 uncertain-restore reconciliation.

Next:
1. Quota through to the emitted UI.
2. Fresh-unlock persisted migration readback.
3. Reseal under a process kill.

G11/G15 waits on the owner's trust-root decision. The v29 packet archive is private and not in the repo; ask the owner for it.


Owner-approved priority: `LEAN_RELEASE_SCOPE.md` and `RESTART.md` in this folder. They override older priority lists.

Repo `djshellshoxxx/p2p-offramp`. Sole p2p owner: session 01BAvLvx. Do not edit GhostPay or Replikrazy from here.

Branch `claude/adoring-wozniak-850ue6` = draft PR #5. It is stacked on PR #4 `work/p2p-client-shell-2026-10-24` (`8a88d11`), which is stacked on `main` (`28bc32f`). Verify the head with `git ls-remote origin refs/heads/claude/adoring-wozniak-850ue6`.

Already done on PR #5 — do NOT redo:
- 16-profile bound and inventory;
- Worker/UI create, restore and inventory;
- G09 in-place migration core, with its durable-result and no-op preflight fixes;
- typed `QUOTA_EXCEEDED`;
- G03 source-bound `InternalMigrationResealer` (fresh-key copy, source retained, source recheck inside the add transaction).

Validate first:
```sh
npm ci && npm test && npm run typecheck && npm run check:boundaries && npm run test:build-policy
npm run build && npm run test:browser && npm run test:web:browser && npm run check:specs && npm run test:specs
```

Next, in order:
1. (Reseal interruption evidence is done.) Ratify the cap and the order with the owner.
2. G11/G15 signed registry/manifest. This needs the owner's trust-root decision.
3. G16 signed trade terms.
4. Wallet, escrow, offer exchange and trade UI.
5. A two-party local/test EVM trade proof.

Rules:
- Keep `ReleaseEnabled=0` and `connectOrigins: []`. No real funds.
- No merge of PR #4/#5 or `main` without review.
- Never merge `feat/custodial-ledger-foundation`.
- No force-push, release or deploy.
- Reproduce findings from the owner's private review packet before fixing. That packet is not in the container.

Evidence and status: `SESSION_STATUS.md`. It holds historical results. Rerun before claiming anything.
