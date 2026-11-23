# 2026-11-22 — Historical process, wallet-worker and autonomous-workflow branch reconciliation

**Evidence boundary.** Authenticated live GitHub read with immutable default branch `main@01f6f4feca051d68de24a04299cd3bb444bce40c`; starting canonical PR #245 head `0fdd504a202971ed339ae8ecec863dfdb2bfd91b`. Repository instructions: lowercase `agents.md` exists and prohibits direct main pushes, forced overwrites and unqualified merges; uppercase `AGENTS.md` and `docs/ai/{WORKFLOW,HANDOFF}.md` returned 404. GitHub compare was performed for all 16 then-D-labeled branches, and the ten below received additional path/blob/line-level inspection. This work does **not** claim shell Git patch-ID equivalence, runnable Node tests, native financial/browser execution, review approvals or integration.

## Prioritized safety result — legacy autonomous agent workflow must not be remerged

`codex/setup-autonomous-agent-20261104@54e632f8f472a4d26b2fdda4ebdd3f2e02a5dba0` (historical PR #51):
- The only added policy file, `.github/agent-prompts/repository-scope.md`, has identical historical/current blob `6b39b5d50b1f336f4b00833092015604e699802d`.
- Historical workflow `.github/workflows/openai-agents.yml` blob `12bb438e78108c01ad024467889a088c5e161617` grants `contents: write` and `pull-requests: write` to the agent job, persists checkout credentials, installs an unpinned CLI and runs the agent in the same job that publishes the PR.
- **Current main** workflow blob `44ef3fc6758738888f3e6c656c1531d8121fb211` uses read-only credentials in the agent job, nonpersisted git checkout, a bounded/pinned CLI, a separate clean verify step and a privileged publication job after output-policy validation.
- **Decision:** intentionally supersede historical workflow. Reusing the older patch would weaken the credential boundary; no merge. This is a static source-policy comparison, not proof that hosted agent execution is safe or complete.

## Documentary inclusion and deliberately obsolete run guidance

| Historical branch (immutable tip) | Git compare to main | Source-bound proof | Decision |
| --- | --- | --- | --- |
| `docs/offramp-research-tools-execution-plan-20261106@0f1792f589a20efab1f629f38d2a0068d4f44193` | 2 ahead / 615 behind | Sole historical research doc `docs/research/2026-11-06-tooling-execution-plan.md` is **exact same blob** `90d0132423ffdbd6ce76da45147bc194fa25bc51` in main | Already-content-in-main, not ancestry merged |
| `chatgpt/zero-codex/qualify-pr61-20261110@a1930a3596f76eff4c29a1ee2991d6acd7f35895` | 30 ahead / 615 behind | Sole changed handoff `docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md`: old blob `29ddac084c39f54dd9496eef9f3e9055e8181075`; main `3e8f39bb46f279e6627961ee03c3952c8e01161c`, **all 595 historical nonblank lines appear verbatim in newer main**. Not whole-file byte identity or patch ID. | Document text preserved, no merge |
| `chatgpt/zero-codex-continuation-spec-20261109@62c6c14539ccc2ac2e56658a81602f6d1ba50d73` | 1 ahead / 615 behind | Sole file `docs/CHATGPT_ZERO_CODEX_CONTINUATION.md` is absent main; it explicitly labels itself a proposed advisory workstream, not scheduling or merge authority | Dated process guidance deliberately not imported; source preserved on historical ref |
| `claude/quirky-knuth-3s6ysy@2f839b12768700ac6c3b674f75a144c6ec19fa93` | 1 ahead / 627 behind | Only file `docs/execution/NEXT-RUN-PROMPT-2026-11-04.md` is absent main and embeds dated runner/agent-budget/merge-policy parameters | Historical execution script not applicable to newer explicit authorization; preserved, not merged |

## Partially reconciled source branches — still unqualified

| Branch | Git ahead/behind | Verified path-level content | Remaining |
| --- | --- | --- | --- |
| `claude/compassionate-gauss-uyhfih@970ac80f08c04e8d340ee57d901e48e26a667a18` | 1/614 | Two task files; all **88/88** old nonblank `tasks/todo.md` lines in main, **152/163** old nonblank `tasks/plan.md` lines in main; remaining 11 are old T41–T47 assignment/ownership rows | No product code on this branch, but historic task completion not inferred |
| `claude/friendly-dijkstra-nsi310@bd26833555e13408825942e9696157ed68e9980e` | 6/615 | Ten changed paths; three exact current-main blobs: `saved-reviews-worker.test.mjs` `9a4504e2`, `worker-endpoint.test.mjs` `260bef2b`, `test-evm-local-trade.mjs` `1c31ac25`. Historical endpoint `81fddec7` differs from current `3de5bd37`, which adds `BUSY`, backup verification and favorites/templates guards. Historical M2B gap record is not in main. | Seven other path changes/uniqueness and executable saved-review behaviors require separate review; never overwrite current endpoint |
| `claude/p2p-offramp-prompt-lqcgno@25a01987385b49e9c28199fdfb4a874b29a6ad89` | 3/615 | Of 11 mainly docs paths, isolated M2A orchestration prompt `a1fb2e5f` absent from main; old Sepolia/worker plan is not integration evidence | Other 10 paths not fully audited; classify partial rather than complete |
| `codex/optional-complete-evidence-g10-20261120@cf827ee5a86b28b11d6f2bba7c21f60f3d2153e3` | 19/93 | Divergent 177-path option stack; prior independent branch cohort established 153 missing-main optional package files preserved among PRs #224–232 (152 exact / one corrected regression blob) | Remaining docs, workflow/package wiring, full patch IDs, current-target tests and Tier B review |
| `codex/optional-composition-evidence-g8-20261120@db9eb94356b4a2efd2b82bc2a0b67ab2e56795b2` | 10/106 | Older 174-path option stack; nine source packages also represented in PRs #224–232 | Source snapshot only, not merged nor native/independent qualification |

The other **six** former D branches remain explicitly semantically unreviewed: M0 S02/S03, two S05 web/locale variants, and independent S11/S12 stage versions. Existing PR #38/#39/#41 and #47/#48 ownership and their corrected source cannot be bypassed. In addition, **59 open-PR-associated heads** and 14 other partially reconciled historic heads from previous checkpoints remain separately open for qualification.

## Immutable classification result and next cohort

Before: `A137/P59/U0/C4/E12/V14/F14/B1/D16=257`. After this bounded source review: **`A137/P59/U0/C5/E12/V19/F18/B1/D6=257`**. `U0` means ancestry screening completed, not all branches merged or tested. The records distinguish exact Git ancestry, identical blob, line coverage, source supersession and incomplete semantics. No historical source ref was deleted/changed; the only intended write is to the existing owned documentation coordinator.

Next: resolve the six remaining D stage variants by per-stage compare against PRs #38/#39/#41/#47/#48 and current main; separately execute/adapt archived wallet/Worker cancellation and M2B/Solana recovery regressions in an authorized isolated runner. PR #237–#244 and #224–#232 retain their actual current-source CI, named Tier B/Tier C reviews, owner approvals and native Solana gates. Never merge a child into a feature branch as a substitute for qualified main integration.

**Execution limits:** No workspace checkout in this runtime; no local Node/Foundry/Agave/Chromium test, native send, runtime replay, patch-id binary run or expected-head guarded main merge. All content overlap based on GitHub authenticated immutable path/blob reads; older PR results do not transfer. `ReleaseEnabled=0`, no live funds, no deployment, no optional activation.
