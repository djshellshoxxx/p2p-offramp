# Orchestration prompt — reach M2A (EVM vertical slice), prep M2B/M2C

Run only when user explicitly says execute. Reading file grants no authority.
Run at extra effort, ultracode on. Caveman style for all worker I/O; plain
language only where ambiguity risks safety (funds, keys, release gates, merge).
Use prompt caching: keep shared prefix (this file + repo-instruction files +
`tasks/todo.md`) first and identical in every worker prompt; put task-specific
text last. Never paste whole files into worker prompts — give paths + line
ranges. Workers return diffs/paths/verdicts, not transcripts.

## Goal

Next milestone = **M2A: complete EVM test-network trade and recovery paths**
(`DEVELOPMENT_ROADMAP.md` Phase 2, M2.1–M2.6 EVM side, then M2.7 EVM slice).
Exit: two fresh clients finish release AND no-payment timeout/refund on local
EVM + Sepolia-shaped kit; direct-contract recovery when frontend/relay gone;
all automated gates green; zero unresolved critical/high findings on enabled
custody paths. M2B (Solana) and M2C only prepared (contracts/gaps recorded),
never faked with EVM semantics.

Baseline: `origin/main` @ `300287d` (verify live; preserve newer work). T1–T32
DONE — do not redo. Continue task IDs at T33 in `tasks/todo.md` (authoritative;
interfaces in `tasks/plan.md`).

## Hard invariants (never break)

Client-side only, noncustodial, no app-owned server. `ReleaseEnabled=0`. Empty
default connection origins. Separate escrow ABIs. Unknown-record retention,
fresh-key recovery. No production deploy, live funds, paid infra, fabricated
approval, scanner suppression, weakened/skipped checks. Manual-settlement risk
text stays. Preserve custodial archive branch. Synthetic evidence never grants
production authority. Do not invent wire formats/crypto profiles/custody
semantics: record missing contract precisely instead.

## Phase 0 — intake (root, Opus, one pass)

1. `git fetch`; read live PR/branch state, roadmap Phase 2, `tasks/todo.md`,
   `docs/execution/GUIDANCE-REMAINING-2026-11-01.md`, `INCOMPLETE-WORK-*`.
2. Build M2A gap table: actionable-now / dependency / external / undefined /
   later / done-dup. Do not label local work human-blocked just because release
   approval absent. Admit tasks T33+ with owner, files, acceptance, deps.
3. Freeze interfaces in `tasks/plan.md`. One writer per file. Root owns shared
   manifests, CI, ledger, integration, merge.

## Phase 1 — parallel lanes (long-running agents)

Use isolated worktrees (`isolation: "worktree"`) for writers. Each writer:
RED test first, minimal GREEN, focused tests, hand off to a DIFFERENT reviewer.
Model guide: **Opus** = design/security-critical writers + final reviewers;
**Sonnet** = standard implementers, auditors, test authors; **Haiku** =
mechanical/docs/inventory/build/run-and-report work. Escalate model only on
evidence of failure, not by default.

| Lane | Scope (M2A-relevant, from live gap table) | Writer | Reviewer |
|---|---|---|---|
| L1 G22 journey composition | Remaining UI/composition: authenticated setup/backup completion, wallet/discovery lifecycle, immutable reviewed-terms matching, G18 funding/safety-buffer facts → step/action precedence. No inferred recovery from a download; no duplicate economic reducer; chat never chain authority | Opus, long-running | Sonnet (authority/UX) |
| L2 EVM trade slice e2e | Fund → verify finality → pay-coordination → seller release; timeout/refund; race boundaries; two-fresh-client journeys on local EVM and Sepolia kit | Sonnet, long-running | Opus (custody) |
| L3 Recovery & release tooling | Direct contract recovery w/o frontend/relay; portable recovery builder; reproducible bundle (G25), incident recovery (G26) runbooks as tooling+tests | Sonnet | Opus |
| L4 Relay/chat gaps | Reconnect, durable history, delivery semantics already defined only; record undefined profiles, no invention | Sonnet | Sonnet (different) |
| L5 Locale/a11y | Only specified items (T19–T21 follow-ups); no fake translations | Sonnet | Haiku checklist + Sonnet |
| L6 Solana/SPL prep | Assess exact program/SDK/token profiles + toolchain; output gap record + contract questions only. No EVM-shaped stubs | Sonnet (read-only research) | Opus |

Lanes with no actionable work after intake are closed with a written reason,
not padded. No two agents on same implementation.

## Phase 2 — independent audits (random-sample, parallel, read-only)

Spawn ≥8 **Sonnet** auditors (Opus for the 2 custody ones). Each draws a random
slice (use `shuf` over `git ls-files 'packages/**/src/**' 'apps/web/src/**'
'contracts/**' 'scripts/**'`, chunks ~25 files, seed logged) plus a fixed focus:

1. Contract/escrow: reentrancy, auth, deadline math, token accounting, ABI drift
   (`packages/escrow-evm`, `contracts/evm`) — **Opus**
2. Wallet/tx journaling: replay, nonce, chain-id, simulation vs submit — **Opus**
3. Crypto/identity/nostr-crypto: nonce reuse, key handling, constant-time, vectors
4. Storage/vault/backup: bounds, rollback, tamper, quota, lock/clear
5. Relay/transport/messaging: parse caps, DoS, URL binding, dedupe, privacy leaks
6. Web app: XSS/HTML injection, CSP, permission prompts, clipboard/QR safety
7. Build/supply chain: lockfiles, scripts, CI permissions, workflows (`.github/`)
8. Missing-code sweep: spec-vs-source gaps, TODO/unimplemented, dead exports,
   untested branches, error paths swallowed

Auditor output (caveman, ≤40 lines): `severity | file:line | issue | repro | fix`.
Only reproducible/evidenced findings; mark unverified as PLAUSIBLE. Root
dedupes, triages into tasks (T-IDs), assigns fix writers + different reviewer.
Critical/high must be fixed before M2A claim. Do not auto-accept or auto-dismiss
bot/auditor suggestions; keep false-positive evidence.

## Phase 3 — Haiku fleet (docs, wiki, builds) — cheapest model, many workers

Run after each integrated tranche and once at end. All **Haiku**, one scoped task
each, parallel, report ≤15 lines. Root spot-checks 1 in 4 outputs against source.

- H-docs-N (one per area: README, DEVELOPMENT_STATUS, roadmap status column,
  each `packages/*/README.md`, `docs/execution/*` index, `tasks/todo.md` evidence
  rows): update to match merged source; no claims beyond evidence; keep
  ReleaseEnabled/no-real-funds language intact; fix stale links.
- H-wiki-N (one per `docs/wiki-source/*.md`, 7 pages + new
  `Milestone-Status.md`): sync with docs; then publish to the GitHub wiki
  (`<repo>.wiki.git`) ONLY if write access works through allowed tools;
  otherwise leave pages in `docs/wiki-source` and report BLOCKED. No secrets,
  no private data, no external publishing beyond that repo's wiki.
- H-links: run spec/link checks (`npm run check:specs`, `test:specs`), fix
  broken links/anchors in docs only.
- H-build-N: run `npm ci --ignore-scripts`, typecheck (all four configs), build,
  `build:demo`, `test:build-policy`, `check:boundaries`; report exact failures
  with first error lines. No source edits unless trivial lint/doc; else hand to
  owning lane.
- H-screens: regenerate `docs/screenshots` from demo build via Playwright
  (pre-installed Chromium; `deviceScaleFactor: 2`) only if UI changed.
- H-inventory: refresh `docs/SPEC_READINESS.md` counts via `scripts/spec_audit.py`.

## Phase 4 — verification & delivery (root)

Run focused checks per lane; then once, integrated: all package/UI tests, four
TS configs, boundaries, build policy, spec/link checks, default+demo builds,
Foundry suite, native-chain + emitted-browser journeys (`npm run test:browser`,
`test:web:browser`, `scripts/test-*-local.mjs`). Unavailable check = BLOCKED with
reason, never skipped/spoofed. Clean owned processes/temp assets.

Update `tasks/todo.md`, `tasks/plan.md`, roadmap M2A row (status only if every
exit item has recorded evidence; else list exact open items). Write final report
`docs/execution/M2A-RESULT-<date>.md`: delivered, evidence, findings + dispositions,
remaining local work, external/human work, undefined contracts, M2B gap record.

Branch: `claude/p2p-offramp-prompt-lqcgno` (rebase on latest main; keep any
unmerged commits). Push, open **draft** PR, subscribe to PR activity. Fix CI
reds by reproducing first; never skip tests, never rewrite others' history,
never approve/merge without user say-so. Check exact-head CI/CodeQL/Snyk/Sonar;
don't carry old results to new heads.

## Do-not-do list

No speculative Solana/privacy/courier/jury protocol work. No redundant runners to
inflate counts. No re-implementing T1–T32. No translations presented as reviewed.
No claim of funds-ready or M2C. If genuine external blocker remains, finish
independent work and leave precise resumable handoff.

## Completion report format (to user, caveman)

Delivered | exact revision | verification counts | audit findings (by severity,
fixed/open) | Haiku docs/wiki status | PR link | remaining local | external | cleanup.
