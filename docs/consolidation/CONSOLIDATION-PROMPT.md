# Autonomous consolidation prompt — p2p-offramp

Paste everything below the line into a fresh agent session (Claude Code, Codex
or similar) that has a clone of `djshellshoxxx/p2p-offramp` and GitHub access.
It is **rerunnable**: every run re-derives live state first and resumes at the
first unfinished phase. Background and evidence:
[`2026-11-18-branch-consolidation-gameplan.md`](2026-11-18-branch-consolidation-gameplan.md).

---

## ROLE AND GOAL

You are consolidating the `djshellshoxxx/p2p-offramp` repository. The goal is
**one trunk (`main`)**, about 5 or fewer live branches, and no open PRs whose
content is already on `main` or that are superseded, with no loss of work.
Find the first unfinished phase below, complete as much of it as your access
allows, verify it, and report. Do not stop after planning when execution is
possible.

## OWNER DECISIONS ALREADY GIVEN (2026-11-18, do not re-ask)

| Item | Decision |
| --- | --- |
| #130 stuck CI | Diagnosis and fix approved. Root cause: 15 runs from 2026-11-11 20:29–20:32 UTC were never dispatched and cannot be cancelled (API 409). The fix is to **delete** them; never re-run them. |
| D7 optional packages | **Accepted**: integrate them, one package per PR. |
| D8 merge policy | Tier A (CI/tests/docs) and Tier B (non-custody product code) merge after green CI plus an independent review with no open High or Medium finding. Tier C (contracts, signing/EIP-712, terms binding, vault crypto, recovery, registry trust, release verification) also needs **owner approval**. |
| Phase 2 (trunk) and Phase 3 (D9 tests) | Tier C approval granted, **conditional on** green exact-head CI, the full local check set passing, and an independent review with no open High or Medium finding. |
| `feat/custodial-ledger-foundation` | Approved: archive-tag it, then delete it (custodial; contradicts the noncustodial ADR). |
| PRs #63, #64 | Approved: close as superseded. |

## HARD RULES (never violate)

1. Never approve or merge a PR yourself unless the owner tells you to in this
   session. Prepare merge-ready PRs and report them.
2. Never delete a branch until an `archive/<branch>` tag is pushed **and
   verified** at the same SHA. Never delete a branch that is the **base** of an
   open PR (deleting it auto-closes that PR). Never delete a branch whose tip
   moved since it was inventoried.
3. Never force-push, rebase or rewrite someone else's branch. Resolve
   conflicts by merging and keeping both sides' functionality.
4. Never skip, disable, weaken or quarantine a test to get green. A failing
   ported test is a real bug: fix the code.
5. Never put secrets, tokens or personal data in commits, logs or PR text.
6. Branch new work from current `origin/main` only. Push only to branches you
   are allowed to push to. If pushes to other refs are refused, generate a
   SHA-pinned script for the owner (see `scripts/consolidation/`) instead of
   working around the restriction.
7. `ReleaseEnabled` stays 0. Make no real-funds readiness claims.
8. Every integration PR records its source PR(s), exact source commits, the
   commands it ran with results, and the blockers that remain.
9. End every GitHub comment, review and PR body with the footer your
   environment requires, and create PRs as drafts.

## ENVIRONMENT

- Use **Node 24+** (the documented requirement; Node 22 produces two known
  environment-only failures). If `/opt/node24/bin` exists, prepend it to `PATH`.
- Install: `npm ci --ignore-scripts`.
- Local gate set, all of which must pass on the branch you propose:
  ```sh
  npm run typecheck
  npm test
  npm run test:specs
  npm run check:specs
  npm run check:boundaries
  npm run test:build-policy
  npm run build
  ```
  Also run `npm run test:browser`, `npm run test:web:browser`, `npm run test:escrow` and
  `npm run test:local-evm` where the toolchain exists (Chromium, Foundry).
  If a toolchain is missing, say so and let hosted CI gate that part. Never
  claim a pass you did not observe.

## STEP 0 — DERIVE LIVE STATE (every run)

Run read-only queries and print a short state table before acting:

1. `git fetch --all --prune --tags`. If `git rev-parse --is-shallow-repository`
   prints `true`, run `git fetch --unshallow origin` first: on a shallow clone,
   ancestry and ahead/behind checks give wrong answers.
2. List open PRs with head and base (GitHub API/MCP). Record whether PRs #132
   and #133 are open, merged or closed, and their CI and review state.
3. For every remote branch, record its commits ahead of and behind
   `origin/main`, and `git cherry origin/main <branch>` unique patches.
4. Check whether these still exist on `origin`: the 65 branches listed in
   `scripts/consolidation/phase1-archive-and-prune.sh`, the `archive/*` tags,
   and the 15 orphaned run IDs listed in issue #130.
5. Use the phase completion checks below to choose the first incomplete
   phase. Resume there.

## PHASES

### Phase 0 — CI health
- **Done when:** none of the 15 run IDs in #130 exist, and a fresh PR run starts
  within minutes.
- **Action:** delete the runs (`gh run delete <id>` or the API). If you lack
  permission, list the IDs for the owner and continue, because this does not block
  the other phases. Then close #130 with evidence.

### Phase 1 — Prune merged and superseded branches
- **Done when:** none of the branches in
  `scripts/consolidation/phase1-archive-and-prune.sh` exist on `origin`, and
  each has an `archive/<branch>` tag.
- **Action:** `bash scripts/consolidation/phase1-archive-and-prune.sh --dry-run`,
  then run it without `--dry-run`. If ref pushes are refused, hand the script
  to the owner and continue.
- #78, #79 and #80 are already closed. Keep
  `chatgpt/zero-codex/g12-recovery-cli-file-identity-20261111` until #102
  closes, then archive and delete it as well.

### Phase 2 — Land the trunk (PR #132, completed by PR #133)
- **Done when:** PR #133 is merged into #132's branch and PR #132 is merged into
  `main`. #132 alone is incomplete: it lacks the `claude/confident-fermi-g6wjp3`
  tip (Solana D5 and the red-team fixes). #133 adds it (see gameplan §3a).
  Before the owner merges #132, confirm `git merge-base --is-ancestor
  origin/claude/confident-fermi-g6wjp3 origin/nodata/affectionate-ritchie-xq4bon`.
- **While open:** keep it mergeable. Merge `origin/main` into it on conflict,
  rerun the local gate set, and fix CI failures at the root cause. Ensure an
  independent review exists (another agent or person, not the author of the
  merge) and address High and Medium findings. Then report "#132 ready for owner
  merge". Do not merge it.
- **After merge:**
  1. Close as contained in `main` (comment first, citing the merge commit):
     #50, #53, #54, #57, #60, #61, #68, #84, #102, #127 and #128.
  2. Close the D9 stack (Phase 3), then archive and delete the contained
     branches with
     `bash scripts/consolidation/phase2-3-retire-contained-branches.sh --dry-run`
     followed by a real run. The script is SHA-pinned and checks containment,
     open PRs and archive tags itself. If ref pushes are refused, hand it to the
     owner. Delete `nodata/affectionate-ritchie-xq4bon` and
     `nodata/epic-goldberg-sg8n96` with GitHub's Delete branch button.

### Phase 3 — D9 regression tests
- **Status:** already satisfied by Phase 2. All 264 added test lines from
  `chatgpt/zero-codex/d9-restored-race-20261111` are in the trunk, and its 9
  D9 tests pass.
- **After Phase 2 merges:** re-confirm with
  `git cherry` and a line check against `origin/main`. Then close #69–#75 and
  #91–#93 with that evidence, and archive and delete the 10 `chatgpt/zero-codex/d9-*`
  branches. The base-branch rule means you close the top PR (#93) first and
  work down the stack.

### Phase 4 — Salvage PR #26 and its split stacks (source quarry; never merge them whole)
Source branches: `claude/loving-einstein-xgzvdy-m0-s01…m0-s12` (the reviewed
split), `claude/vibrant-cray-ny4gum` (#81, partial extraction onto a
modern base), `claude/loving-einstein-xgzvdy-journey`, and
`autonomous/completion-20261102`.

Make one focused PR per item from fresh `origin/main`, in this order:

| # | Item | Source paths | Tier |
| --- | --- | --- | --- |
| 4.1 | EVM formal/SMT refinement harness (N37F) and `contracts/evm` extras | `scripts/formal/`, `contracts/evm/` (from #81, else m0-s01) | C |
| 4.2 | Personalization and web runtime UI | `packages/personalization/`, absent `apps/web/` files (#42 stage via #81) | B |
| 4.3 | Dependency intake and governance records | `security/intake/`, `docs/governance/` (m0-s09, m0-s11) | A |
| 4.4 | Locale blank-warning regression (#100) | keep only assertions that commit `096b3a1` in `main` does not already cover | A |
| 4.5–4.12 | Optional packages (D7 accepted), one PR each: `meetup`, `courier`, `stealth`, `proof-jobs`, `proof-inputs`, `arbitration`, `privacy-controls`, `liquidity` | `packages/<name>/` (m0-s10) | B, or C if it touches signing, custody or recovery |

Per-item acceptance:
- Copy the latest version of each file from the source. Adapt it to current
  `main` APIs. Delete unused code, and add or keep tests.
- `npm run check:boundaries` passes. An optional package must **not** be
  imported by the default build's entry graph unless a gated, documented
  build flag enables it.
- Record third-party code in `THIRD_PARTY_NOTICES.md`.
- The full local gate set passes. The PR body lists the source branch and commit
  for every file.
- Before extracting a file, `git log origin/main -- <path>` confirms `main`
  does not already have it in a newer form.

Then re-verify review findings F01, F03 and F06 from #31 and #35 against
current `main`. Open one issue per finding that still reproduces.

- **Done when:** items 4.1–4.12 are merged or explicitly rejected by the owner.
  Then close #26, #28, #35, #37–#48, #56, #81 and #100 with references. After
  that, archive and delete the `claude/loving-einstein-*` branches, the `m0-*`
  stack and `autonomous/completion-20261102`, deleting from the top of each
  stack down.
- Do **not** import the ~195 historical `docs/execution` files. Link the
  archive tag from `docs/consolidation/` instead.

### Phase 5 — Docs and process loose ends
| PR / branch | Action |
| --- | --- |
| #129, #131 | Merge `origin/main` in. They are Tier A, so they become ready after green CI and review. |
| #31 | Keep as review evidence (Tier A). |
| `docs/offramp-research-tools-execution-plan-20261106` | Open a Tier A PR. |
| #66, #67 | Fold into one docs PR. Each is 30 commits changing one file. Then close both. |
| #65 | Cherry-pick the two fixes (malformed saved-review wrapper; unquoted meta refresh in build policy) onto `main` only if they are still absent, with tests. Then close. |
| `claude/compassionate-gauss-uyhfih` | Fold its T41–T47 admission into `tasks/` on `main`. |
| `codex/setup-autonomous-agent-20261104` | Diff it against `main`'s `.github/workflows/openai-agents.yml`. Take only a verified fix; otherwise archive it. |
| #27, #29, #63, #64 | Close as superseded (owner approved #63 and #64; #29's packets are in `main` after Phase 2). |

### Phase 6 — Prevent re-sprawl
1. Ask the owner to enable "Automatically delete head branches" (a repository
   setting change; do not change settings yourself).
2. Add a short "Branching" section to `agents.md`: branch from `main` only,
   one PR per lane, no stacks deeper than 2 without owner approval, and
   delete branches that are 0 commits ahead.
3. Keep **one** living ledger: append to
   `docs/consolidation/2026-11-18-branch-consolidation-gameplan.md` §3a
   instead of creating new dated files.

## PER-RUN OUTPUT

End each run with:
1. A state table: branches, open PRs, current phase.
2. What you completed this run, with PR, commit and run links.
3. Verification you actually observed, including commands and pass/fail counts.
4. Blockers, with the exact owner action each one needs, as a numbered list.
5. An appended progress entry in the gameplan's §3a.

## STOP CONDITIONS

Stop and report, without guessing, when any of these happens:
- The next action needs an owner merge, approval or settings change.
- A test fails and the root cause is outside the current item's scope.
- Live state contradicts this prompt. Examples: a branch moved, or a PR was
  reopened or retargeted.
- A security-relevant finding appears. It is a blocker until the owner
  decides.
