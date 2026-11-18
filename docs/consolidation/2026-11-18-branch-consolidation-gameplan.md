# Branch consolidation gameplan — 2026-11-18

Status: PROPOSED. Nothing has been merged, closed or deleted by this document.
It is a read-only analysis of `origin` taken on 2026-11-18 at `main@6ef9a26`.
Owner decision D8 (tiered merge policy) still governs every merge below.

## 1. Snapshot

| Metric | Count |
| --- | ---: |
| Remote branches (excluding `main`) | 142 |
| Fully merged into `main` (0 commits ahead) | 51 |
| Unmerged branches | 91 |
| Unmerged branch *tips* (not an ancestor of another unmerged branch) | 26 |
| Open PRs | 52 (40 draft) |

Method (reproducible): `git rev-list --left-right --count`, `git cherry` (patch
equivalence), `git merge-base --is-ancestor` (stack containment), per-file blob
comparison against the cumulative tip, and `git merge-tree --write-tree`
(conflict prediction). Squash-integrated work shows as "not contained" in
ancestry checks, so blob comparison was used to confirm what is really absent.

## 2. The real structure: four lineages plus loose ends

### L1 — Cumulative development trunk (the consolidation target)

```
main ─ #61 integration/p2p-consolidated-20261109
         └─ #128 claude/confident-fermi-g6wjp3      (254 ahead, 14 behind main, 398 files)
               └─ #127 codex/review-consolidate-20261116   (+1 commit)
```

`claude/confident-fermi-g6wjp3` (CF) already contains **34 other branches**,
including: the Solana D5 program (#50 `claude/sleepy-fermat-4s6ocx`), EVM escrow
MVP (#84), Solana payout docs (#57, content-equivalent), wiki docs (#68), beta
spec (#60), foundation gates (#53), core continuation (#54), all
`parallel/*-20261113` browser/recovery/locale branches, `integration/pages-*`,
`integration/m2a-safe-fixes-20261114`, and every `codex/*-20261116` branch.
Its recorded local evidence: 1,298/1,298 package tests, Foundry 82/82, two
red-team remediation passes (D9, exchange binding, locale).

Merging `main` into CF conflicts in exactly two files:
`packages/domain/test/intent-journal.test.mjs` and
`scripts/test-recovery-references-browser.mjs`.

### L2 — D9 restored-nonce regression stack (#69–#75, #91–#93)

Ten stacked branches ending at `chatgpt/zero-codex/d9-restored-race-20261111`.
14 commits not in CF. The code fix in it ("treat failed durable marker attempts
as broadcast-unknown") was re-implemented differently in CF (CAS lifecycle,
red-team D9-1/2/3). What CF **lacks** is ~274 lines of regression tests in
`packages/domain/test/intent-journal.test.mjs` and
`packages/wallet/test/evm-execution.test.mjs` (account casing, cross-network
isolation, account-scoped holds, concurrent-session exclusivity, hash conflict,
prepared/pending/terminal holds after fresh-key restore). One conflict vs CF.

### L3 — PR #26 and its split stacks (2026-11-02 / 11-04)

```
#26 autonomous/completion-20261102 ─ #28 claude/loving-einstein-xgzvdy ─ #35 …-journey
#37…#48  claude/loving-einstein-xgzvdy-m0-s01 … m0-s12   (12-stage split, open PRs)
         claude/loving-einstein-xgzvdy-s01 … s12          (earlier split, NO PRs — superseded by m0-*)
#100     parallel/localization-blank-warning-20261113  (based on m0-s05)
#56/#81  claude/vibrant-cray-ny4gum  (extractions of #37/#38/#40–#43 onto #61 base)
```

None of #26's 68 commits are in CF by patch identity. Blob comparison shows
the absent material is mostly:

- **Optional packages** with no counterpart anywhere else: `packages/meetup`,
  `courier`, `stealth`, `proof-jobs`, `proof-inputs`, `arbitration`,
  `privacy-controls`, `liquidity`, `personalization` (~130 files). D7 ("park
  optional reference packages") is still *proposed*.
- `docs/execution` (≈195 historical evidence files), `docs/governance`,
  `security/intake` (dependency intake evaluations).
- Tooling: `scripts/formal` (EVM formal/SMT refinement harness, N37F),
  `contracts/evm` extras, `scripts/fixtures`, `packages/security` extras.
- `apps/web`: ~26–29 files absent in CF (personalization/runtime UI from #42).

`claude/vibrant-cray-ny4gum` (#81) is the only branch that already extracted
part of L3 onto the modern base; it has 11 commits not in CF and conflicts in
5 files. The `s*` (non-`m0`) stack differs from `m0-*` by 55 files and has no
PRs; `m0-*` is the reviewed one.

### L4 — Independent / loose ends

| Branch | PR | Content | Verdict |
| --- | --- | --- | --- |
| `chatgpt/zero-codex/docs-collaboration-20261117` | #131 | collaboration inventory, CI-queue issue #130 | Tier A: rebase on main, merge |
| `chatgpt/zero-codex/docs-python-baseline-20261116` | #129 | operator Python baseline | Tier A: merge |
| `chatgpt/zero-codex/g25-public-endpoint-regression-20261110` | #79 | test | already patch-equivalent in main → close |
| `chatgpt/zero-codex/http-buffer-lifecycle-20261110` | #80 | test | already patch-equivalent in main → close |
| `chatgpt/zero-codex/registry-concurrency-20261110` | #78 | test | already patch-equivalent in main → close |
| `chatgpt/zero-codex/audit-evm-schema-20261110` | #67 | 30 commits, one file: random-audit ledger | squash to 1 docs commit |
| `chatgpt/zero-codex/qualify-pr61-20261110` | #66 | 30 commits, one handoff file | squash or supersede by #131 |
| `claude/friendly-dijkstra-nsi310` | #65 | 2 small fixes (malformed saved-review wrapper; unquoted meta refresh in build policy) + M2A docs | cherry-pick the 2 fixes onto CF; verify not already present |
| `claude/p2p-offramp-prompt-lqcgno` | #64 | M2A prompt + wiki sync | docs, likely stale vs CF → review, then close |
| `chatgpt/zero-codex-continuation-spec-20261109` | #63 | process doc | docs: merge or close (owner) |
| `claude/compassionate-gauss-uyhfih` | — | T41–T47 task admission | fold into `tasks/` on CF |
| `review/codebase-security-20261104-94554ec` | #31 | review findings for #26 | keep as evidence, merge as docs |
| `claude/loving-einstein-xgzvdy-decisions` | #29 | D1–D9 packets | already contained in CF → close after CF merges |
| `claude/quirky-knuth-3s6ysy` | #27 | stale next-run prompt | close |
| `codex/setup-autonomous-agent-20261104` | — | workflow tweak (1 of 2 files differs) | diff vs main's `openai-agents.yml`; take or drop |
| `docs/offramp-research-tools-execution-plan-20261106` | — | research doc | merge as docs |
| `feat/custodial-ledger-foundation` | — | PostgreSQL **custodial** payments ledger (2026-10-21) | contradicts the client-side/noncustodial ADR → archive tag, delete |

## 3. Gameplan

Order matters: each phase shrinks the problem for the next. Every merge
records source PR, exact commits, tests run and remaining blockers (per the
2026-11-04 ledger guardrails).

### Phase 0 — Unblock CI (prerequisite, owner)

Hosted Actions on #66–#68 have been queued with zero jobs since 2026-11-11
(issue #130). D8 requires green CI for Tier A/B merges, so diagnose #130
first (runner availability / Actions settings / workflow `concurrency`). No
reruns or policy changes without owner approval.

### Phase 1 — Zero-risk cleanup (no code changes)

1. Tag every branch to be deleted as `archive/<name>` first so nothing is
   lost: `git tag archive/<name> origin/<name> && git push origin archive/<name>`.
2. Delete the 51 fully merged branches (list in Appendix A).
3. Close #78, #79, #80 as "already in main" (patch-equivalent).
4. Delete `claude/loving-einstein-xgzvdy-s01…s12` (12 branches, no PRs,
   superseded by the `m0-*` stack) after tagging.
5. Archive and delete `feat/custodial-ledger-foundation`.

Result: 142 → ~75 branches, 52 → 49 open PRs.

### Phase 2 — Land the trunk (L1) into `main`

1. On a new branch from CF, merge `codex/review-consolidate-20261116` (#127, +1
   commit).
2. Merge `origin/main` into it; resolve the two conflicts
   (`intent-journal.test.mjs`: keep both test sets; recovery-references browser
   test: take CF's runtime + main's assertions).
3. Run the full local gate set from README "Local checks" plus
   `test:escrow`, `test:local-evm`, Foundry, and Solana suite.
4. Retarget PR #128 to `main` (or open one integration PR), Tier C → owner
   approval required (contains contracts, EIP-712, vault/recovery).
5. After merge, close as superseded-and-contained: #50, #53, #54, #57, #60,
   #61, #68, #84, #102, #127, #128 and delete their 34 contained branches.

Result: ~41 more branches and ~11 PRs retired; `main` becomes the single trunk.

### Phase 3 — Port the D9 regression tests (L2)

1. New branch from updated `main`. Port the 14 test-only commits from
   `chatgpt/zero-codex/d9-restored-race-20261111` as one curated change into
   `intent-journal.test.mjs` / `evm-execution.test.mjs`, adapted to CF's CAS
   lifecycle API. Drop its superseded fix commit.
2. Any test that fails is a real regression in the new D9 implementation →
   fix in code, never weaken the test.
3. Merge (Tier C: D9 is recovery/signing-adjacent → owner approval).
4. Close #69–#75 and #91–#93; delete the 10 branches.

### Phase 4 — Salvage L3 (PR #26 and splits) selectively

L3 is too old (44 commits behind, pre-dates D1/D5/D8/D9) to merge. Treat it as
a source quarry:

1. **Owner decides D7** (optional packages). If parked: move
   `packages/{meetup,courier,stealth,proof-jobs,proof-inputs,arbitration,privacy-controls,liquidity}`
   onto a single `parked/optional-packages` branch (no PR), and stop.
   If accepted: extract one package per PR, each with its own boundary check.
2. Extract, in order, onto `main`, one PR each, starting from what
   `claude/vibrant-cray-ny4gum` (#81) already ported:
   a. `scripts/formal` EVM SMT harness (N37F) + `contracts/evm` extras — Tier C.
   b. `packages/personalization` + web runtime UI (#42 stage) — Tier B.
   c. `security/intake` + `docs/governance` (#45, #47) — Tier A.
   d. Locale blank-warning test (#100) — check against CF's `096b3a1`; keep
      only assertions not already covered.
3. Do **not** import the ~195 `docs/execution` historical files wholesale;
   keep them reachable via the archive tag and link to it from
   `docs/consolidation/`.
4. Re-verify #31/#35 review findings (F01/F03/F06) against current `main`;
   file fresh issues for any still reproducible.
5. Close #26, #28, #35, #37–#48, #56, #81, #100; archive-tag and delete the
   `m0-*` stack, `autonomous/completion-20261102`, `claude/loving-einstein-*`.

### Phase 5 — Docs/process loose ends (L4)

Merge #129, #131 (after rebase), #31 (as evidence), the research plan branch;
squash #66/#67 to one commit each or fold into #131; cherry-pick #65's two
fixes if absent; owner verdict on #63/#64; close #27, #29.

### Phase 6 — Prevent re-sprawl

1. Enable "Automatically delete head branches" in repo settings.
2. Agent lanes (Claude/Codex/ChatGPT) branch from `main` only, never from
   another agent's branch, and keep one PR per lane; stacks deeper than 2 need
   an owner exception.
3. Weekly: delete branches with 0 commits ahead; close PRs whose head is
   contained in `main`.
4. One living ledger (`docs/consolidation/`), not a new dated file per run.

## 4. Expected end state

| | Now | After Phase 5 |
| --- | ---: | ---: |
| Branches | 142 | ~5 (main, parked/optional-packages if D7 parks, active lanes) |
| Open PRs | 52 | ~0–5 |
| Lineages | 4 + loose ends | 1 trunk |

## 5. Decisions needed from the owner

1. **#130 CI queue** — APPROVED 2026-11-18. Diagnosed: 15 runs from a 3-minute
   window on 2026-11-11 were never dispatched by GitHub and cannot be cancelled
   (API 409). New runs start normally. The owner deletes the orphaned runs; see
   the diagnosis comment on #130. CI no longer blocks D8 merges.
2. **D7** — ACCEPTED 2026-11-18: optional reference packages are accepted.
   Phase 4.1 takes the "accept" path: one package per PR, each with an
   import-boundary check, and none wired into the default build without
   its own gate.
3. **Tier C approval** for Phase 2 (trunk) and Phase 3 (D9 tests).
4. Confirm deletion of `feat/custodial-ledger-foundation` (custodial design).
5. Confirm closing #63/#64 (agent-process docs).

## Appendix A — Fully merged branches (safe to delete after tagging)

`docs/security-spec-expansion-20261021`, `docs/spec-readiness-and-foundations`, `docs/lean-release-handoff-2026-10-24`, `work/p2p-client-shell-2026-10-24`, `work/noncustodial-reconstruction-2026-10-24`, `claude/adoring-wozniak-850ue6`, `claude/post-merge-followups`, `claude/trade-review-integration`, `claude/p2p-offramp-integration-aan57u`, `claude/docs-screenshots`, `claude/recovery-consolidation`, `work/p2p-consolidated-20261030`, `work/p2p-pr14-finish-handoff-20261030`, `claude/sweet-noether-arf6ne`, `work/p2p-exchange-close-20261030`, `work/p2p-relay-lifetime-20261030`, `work/p2p-exchange-test-repair-20261030`, `work/p2p-gate-reconciliation-20261030`, `work/p2p-independent-branch-review-20261030`, `claude/sweet-shannon-grykla`, `work/p2p-validation-20261030`, `autonomous/completion-20261031`, `integration/all-compatible-work`, `autonomous/journey-20261101`, `fix/remediation-f84468d6-0a97ed`, `autonomous/guidance-20261101`, `autonomous/continuation-20261031`, `fix/remediation-09f20d73-9524c0`, `research/security-addendum-20261103`, `research/code-reuse-2026-11-03`, `research/remaining-gaps-20261103`, `research/upstream-reuse-20261103`, `codex/consolidation-ledger-20261104`, `claude/loving-einstein-xgzvdy-s00-ci-triggers`, `chatgpt/zero-codex/acceptance-cli-input-bounds-20261110`, `chatgpt/zero-codex/acceptance-review-boolean-20261110`, `chatgpt/zero-codex/g12-recovery-cli-file-identity-20261111`, `claude/tender-goodall-db3cot`, `chatgpt/zero-codex/d9-cross-deployment-nonce-20261111`, `chatgpt/zero-codex/g05-transport-path-binding-20261111`, `chatgpt/zero-codex/g12-erc20-withdraw-binding-20261111`, `chatgpt/zero-codex/g12-native-withdraw-recipient-20261111`, `chatgpt/zero-codex/g16-bilateral-replay-20261111`, `chatgpt/zero-codex/g18-final-chain-recheck-20261111`, `chatgpt/zero-codex/g18-receipt-own-data-20261111`, `chatgpt/zero-codex/g20-chat-scope-regression-20261111`, `chatgpt/zero-codex/g26-clear-reentrancy-20261111`, `chatgpt/zero-codex/recovery-reference-identity-20261115`, `chatgpt/zero-codex/docs-static-offers-status-20261116`, `consolidation/qualified-regressions-20261116`

## Appendix B — Branches contained in `claude/confident-fermi-g6wjp3`

Retire after Phase 2: `claude/loving-einstein-xgzvdy-decisions`, `claude/gifted-faraday-73kydc`, `codex/foundation-gates-20261104`, `codex/core-continuation-20261104`, `codex/post-send-reconcile-20261109`, `codex/rq00-evidence-20261109`, `gpt/p2p-beta-spec-20261109`, `integration/privacy-endpoint-disclosures-20261109`, `claude/sleepy-fermat-4s6ocx`, `claude/p2p-offramp-evm-escrow-vc7stk`, `chatgpt/zero-codex/docs-wiki-20261110`, `parallel/cli-argument-regression-20261113`, `parallel/tooling-source-correspondence-20261113`, `integration/pages-offline-recovery-20261112`, `parallel/browser-runtime-engines-20261113`, `parallel/accessibility-recovery-panels-20261113`, `parallel/docs-web-profile-recovery-20261113`, `parallel/browser-cold-nonce-20261113`, `parallel/browser-cold-recovery-20261113`, `parallel/browser-peer-offer-20261113`, `parallel/portable-recovery-guide-20261113`, `parallel/recovery-builder-help-20261113`, `parallel/locale-20261113`, `parallel/diagnostics-20261113`, `parallel/spec-tool-20261113`, `integration/pages-beta-qualification-20261112`, `integration/m2a-safe-fixes-20261114`, `codex/completion-20261116`, `codex/d9-migration-20261116`, `codex/consolidation-20261116`, `codex/continue-completion-20261116`, `codex/peer-acceptance-20261116`, `integration/p2p-consolidated-20261109`, `codex/solana-payout-docs-20261109` (content-equivalent), plus CF and `codex/review-consolidate-20261116` themselves.

## Limits of this analysis

- Ancestry and blob comparisons, not semantic review. "Absent in CF" means the
  file content differs or is missing, not that behavior is missing.
- No tests were run for this document. Conflict predictions come from
  `git merge-tree`, not resolved merges.
- PR CI status was not re-queried beyond the #130 record on #131's branch.
