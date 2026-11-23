# Historical PR116 task-ownership and PR64 M2A/wiki documentation disposition — 2026-11-23 UTC

**Repository:** [djshellshoxxx/p2p-offramp](https://github.com/djshellshoxxx/p2p-offramp); fixed live main `01f6f4feca051d68de24a04299cd3bb444bce40c`. This is a source-bound, read-only comparison of two **closed, unmerged, divergent** historical PRs. Original branches are preserved. No code, native/browser test, financial operation, CI gate, review approval, branch merge, deployment, or release was performed.

## PR116 — T41–T47 owner-assignment history

[Historical PR116](https://github.com/djshellshoxxx/p2p-offramp/pull/116), branch `claude/compassionate-gauss-uyhfih`, exact tip `970ac80f08c04e8d340ee57d901e48e26a667a18`. GitHub compare with main: merge base `cdde998cf1d0e54c6cfb6fe9cdde0fc22a80e10e`; 1 ahead / 614 behind. Exactly **two changed documentation paths**, no executable source.

- `tasks/todo.md` old PR added 13 nonblank lines in its task-status/ownership tranche. **13/13 exact original added lines appear in current main** (Git blob `064aa0383f264644aa2a5d73f0bd90f8e2f60b5f`, lines 191–207). Current main also preserves an explicit dated note at lines 188–190 distinguishing later implementation from old task assignment.
- `tasks/plan.md` old PR added 12 nonblank lines; 1 is an exact current-main line. The other **11 are dated section headings, the old single-writer matrix (T41–T47), frozen interface pointers and review rota**, not executable features (current-main blob `6cc699663ed17b627c8fda2976e2fafdebb996f5`). The task scopes and recorded historical statuses are in current `tasks/todo.md`. Reintroducing the 2026-11-11 owner assignments as live ownership would conflict with later workers and main's evolved plan.

**Disposition:** F — complete unique intended *documentation/history* accounted for by exact task-text preservation and explicit supersession of obsolete assignments. Original branch remains the authoritative archival byte source. **T41–T47 are NOT certified completed**; no missing EVM/Solana/QR features are waived by this branch-local accounting.

## PR64 — dated M2A orchestration and wiki status

[Historical PR64](https://github.com/djshellshoxxx/p2p-offramp/pull/64), branch `claude/p2p-offramp-prompt-lqcgno`, exact tip `25a01987385b49e9c28199fdfb4a874b29a6ad89`. GitHub compare with main: merge base `300287dcde818a9d10ae301265d00bc7c0877bbb`; 3 ahead / 615 behind. All **11 PR-local changed paths** inspected: **nine historically modified pages and two newly added dated documents**; zero application/contract/test code.

| Original changed path | Current-main disposition |
| --- | --- |
| `README.md` | Newer project status and Node 24+ requirements; old Node 22 transient relay-test failure note is not current acceptance |
| `docs/DEVELOPMENT_STATUS.md` | Newer development status; removed stale pointer to November 10 orchestration prompt |
| `docs/execution/MILESTONE-M2A-ORCHESTRATION-PROMPT-2026-11-10.md` | **Absent deliberately**; 142-line historical task/agent instruction, requiring explicit future execution and referencing then-current branch/head; retain only on PR64 |
| `docs/wiki-source/Architecture-and-Development.md` | Newer page with current noncustodial architecture and Developer Guide, rather than old incomplete page |
| `docs/wiki-source/Codespaces-Test-Lab.md` | Later maintained page; old environment-specific assumptions are historical |
| `docs/wiki-source/Getting-Started.md` | Later maintained instructions; original November 10 planned settlement flow not a runtime guarantee |
| `docs/wiki-source/Home.md` | Later maintained wiki index and source-status notes with `ReleaseEnabled=0` |
| `docs/wiki-source/Milestone-Status.md` | **Absent deliberately**; dated November 10 milestone table, replaced as current status authority by roadmap, README, task ledger and wiki Home; no M2A/M2B/M2C completion asserted |
| `docs/wiki-source/Privacy-and-Recovery.md` | Later maintained privacy/recovery notes rather than old two-paragraph baseline |
| `docs/wiki-source/Security-and-Release.md` | Later maintained safety/release notes, not the historical old implementation snapshot |
| `docs/wiki-source/Wallet-and-QR-Safety.md` | Later maintained wallet/QR guidance; old synthetic-only test scope remains historical |

This is **deliberate document supersession**, not a claim that all 2026-11-10 prose is byte-identical in main. PR64 remains available as an immutable history source. It does not authorize agents, live funds, alternative release policy, or deployment. No current product work is dismissed merely because its old draft describes it.

## Ledger and verification

Reclassified PR116 and PR64 branches **V→F** only. Prior classifications A137 / P62 / F32 / C5 / E0 / V23 / B1 / D0 =260; updated **A137 / P62 / F34 / C5 / E0 / V21 / B1 / D0 =260**. GitHub branch inventory and all 245 PRs were paginated earlier in the same execution; main was freshly checked at `01f6f4feca051d68de24a04299cd3bb444bce40c`. No Git commit ancestry, complete-tree or patch-ID equivalence is claimed for the two historical branches. No new source tests executed.

**Priority still outstanding:** review-gated PR237–239, stacked financial PR241–244 and security PR246–248; optional PR224–232; 21 V branches including active owner stacks; custodial prototype remains blocked by separate explicit product decision. Keep `ReleaseEnabled=0`, all source/target native/browser/financial gates, and expected-head-SHA merge policy intact.
