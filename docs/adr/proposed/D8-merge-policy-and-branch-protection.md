# D8 - Merge policy and branch protection on main (decision packet)

Status: ACCEPTED by the owner on 2026-11-04: **Option 2 (tiered)**. The owner confirmed it in the coordinating Claude session, and the M-0 stack is merged under it. No repository setting has changed: the click path at the end is still the owner's to apply.

Paths marked "main" exist on `main` (e9b9db3). Paths marked "PR #26 only" exist only on the PR #26 branch (94554ec). GitHub facts below were read from the hosted API while drafting (2026-11-04) and can change.

## The question

What must be true before a change lands on `main`, who can override that, and which kinds of change need the owner's explicit approval?

## Current state (observed)

- `main` is not protected (branch API reports `protected: false`), and the repository has no rulesets (empty list). The repository is public. Merge commits, squash and rebase are all allowed; auto-merge and delete-branch-on-merge are off.
- Three workflows exist (`.github/workflows/`, all on `main`), each triggered on every `push` and every `pull_request`, so each check runs twice per PR update:
  - `evm-escrow.yml`, workflow "EVM escrow": jobs `forge`, `local-trade`.
  - `vault-foundation.yml`, workflow "Vault foundation": jobs `local-evm`, `schemas-and-crypto`, `browser`, `specs`.
  - `specifications.yml`, workflow "Specification inventory": job `inventory`.
  None of the jobs sets a display name, so the check name is the job id. PR #26 adds steps to these files but renames no job.
- Checks reported on the PR #26 head: the seven jobs above (github-actions); CodeQL ("CodeQL" plus "Analyze (javascript-typescript)" and "Analyze (python)"; this setup is not in the repository files, so it is likely the hosted default setup, unverified); "SonarCloud Code Analysis"; "CodeRabbit"; and a "security/snyk" commit status. Qodo posts review comments and also opens remediation PRs (#22, #25).
- At the time of reading, `browser` and "SonarCloud Code Analysis" were failing and "CodeRabbit" was skipped on the PR #26 head. I did not diagnose either. PR #26 changes 617 files, which exceeds CodeRabbit's limit of 300.
- All recent PRs on `main` are opened by the owner account, and 35 of 253 commits on `main` are merge commits. There is no CODEOWNERS file in the worktree.

## Options

**Option 1 - minimal gate.** Require a pull request and the seven Actions jobs, block force pushes and deletion, no required reviews, owner may bypass. Security: stops accidental direct pushes and red merges. Compatibility: matches how PRs are made today. Weakness: nothing distinguishes a docs change from a change to signing code, so the owner's attention is the only control.

**Option 2 - tiered policy on top of Option 1.** Same ruleset, plus a written rule that classifies each PR by the paths it touches:

- Tier A (CI, docs, tests only): required checks pass, any maintainer merges.
- Tier B (non-custody product code, such as UI, local storage convenience, tooling): required checks pass, plus one automated review pass (CodeRabbit or Qodo) with findings answered in the PR.
- Tier C (contracts, signing, EIP-712 and terms binding, vault crypto, recovery, registry trust, release verification): required checks pass and the owner's explicit written approval in the PR before merge. Proposed starting path list, not exhaustive: `contracts/evm/**`, `packages/escrow-evm/**`, `packages/wallet/src/evm-*.ts`, `packages/domain/src/trade-terms.ts`, `terms-review.ts`, `registry.ts`, `packages/exchange/src/messages.ts`, `packages/nostr-crypto/**`, `packages/identity/**`, `packages/storage/src/vault-crypto.ts`, `recovery-slot.ts`, `backup-service.ts`, `migration-service.ts`, `packages/security/**`, `security/**`, `docs/governance/**`.

A CODEOWNERS file for the Tier C paths would let GitHub enforce this, but only after a second reviewer account exists (see Option 3). Caveat for Tier A: a workflow edit can weaken the gate. Because required checks match by job name, renaming or deleting a required job makes the PR unmergeable, which is a useful accident, but a new workflow that does less is not caught.

**Option 3 - strict gate.** One required approving review, required review from code owners, linear history, branches must be up to date, nobody may bypass. Security: strongest. Compatibility: not workable now. GitHub does not let an author approve their own PR, and the owner account opens the PRs, so every merge would deadlock; bots cannot be the required approver. Linear history would also forbid merge commits, which this repository uses to preserve branch ancestry. "Up to date" forces a rebase and full re-run of the long browser jobs after each other merge.

## Recommendation

Option 2, proposed for owner decision, with these settings: required checks are exactly the seven Actions job names (`forge`, `local-trade`, `local-evm`, `schemas-and-crypto`, `browser`, `specs`, `inventory`); no required approving reviews while there is one human maintainer (raise to one, with code-owner review for Tier C, when a second account exists); linear history off; "up to date" off; force pushes and deletion blocked; bypass list empty (in an emergency the owner can set the ruleset to Disabled, which leaves an audit-log entry, then restore it). CodeQL's two "Analyze" checks are a good optional addition. "SonarCloud Code Analysis" should become required only after its failing gate on PR #26 is understood. CodeRabbit, Qodo and Snyk stay advisory: CodeRabbit skips large PRs, and whether a "skipped" third-party check satisfies a required check is unverified.

Expected effect on PR #26: with these settings it could not merge while `browser` fails.

## Click path for the owner (Settings in the GitHub repository)

1. Settings > Rules > Rulesets > New ruleset > New branch ruleset.
2. Name it (for example "main protection"). Set Enforcement status to Active. If an "Evaluate" mode is offered on this plan, run one PR cycle in it first (availability unverified).
3. Bypass list: leave empty.
4. Target branches: Add target > Include default branch.
5. Branch rules, tick: Restrict deletions; Block force pushes; Require a pull request before merging (Required approvals: 0; leave "Require review from Code Owners" off for now; allowed merge methods: Merge and Squash).
6. Tick Require status checks to pass. Leave "Require branches to be up to date before merging" off. Click Add checks and add, one at a time, with source GitHub Actions: `forge`, `local-trade`, `local-evm`, `schemas-and-crypto`, `browser`, `specs`, `inventory`. A check appears in the picker only if it ran recently, so open or update one PR first if a name is missing.
7. Leave "Require linear history" off. Click Create.
8. Optional: Settings > General > Pull Requests > "Automatically delete head branches".

## Test vectors

Not applicable. A manual check after enabling: a direct push to `main` is refused; a throwaway PR with a failing job cannot merge; a force push is refused.

## What this unblocks

Merging PR #26 under a recorded gate, a written Tier C approval rule for signing and custody code, and a place to attach CODEOWNERS later. It does not make any trust, custody or release decision.
