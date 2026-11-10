# P2P-Offramp ChatGPT Zero-Codex Continuation Specification

Status: proposed, advisory workstream. Does not automatically activate a timer, detect exhausted credits, or grant approval to merge/deploy.

## Budget and ownership
Use only ChatGPT's direct GitHub connector and available execution tools. Never invoke Codex CLI/cloud, paid OpenAI API, or credit-consuming agents. ChatGPT and GitHub Actions have separate limits and possible costs. Use isolated `chatgpt/zero-codex/` branches and `docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md`. This lane is reserved for ChatGPT by convention, not technically enforced. Never edit, overwrite, rebase, close or merge another worker's active branch or PR.

## Starting evidence
Read README, repository instructions, roadmap, security docs, newest source-pinned handoffs, recent commits, current main, open PRs and CI before work. Latest consolidation context includes PR #61. Do not treat draft branches as merged or parent CI as proof that a new integration head passes.

## Sequential priorities
1. Qualify integration PR #61 and its exact-head CI; resolve Sonar/security findings without weakening gates.
2. Finish D9 persisted send-marker migration and restored-record provenance only within already approved semantics; preserve broadcast-unknown after send-capable errors.
3. Improve encrypted local recovery, relay/discovery and offline registry validation with bounded resource use.
4. Add independent buyer/seller acceptance tests and contract-wallet coverage in synthetic/test-only environments.
5. Harden CLI, browser flows, privacy disclosures, docs and CI reproducibility.
6. Document D1 peer acceptance, D8 Tier C approval, independent audit and external release gates.

## Every hourly run
1. Inspect previous automation handoff and pending CI/PRs. If previous work is still in progress, do not duplicate it; defer to the next hourly invocation.
2. Select the highest-priority unblocked task and work on one independently testable slice at a time. If external approvals block a task, document them and proceed to another independent task.
3. Write a failing regression test for bugs, implement minimal fixes, and run the available unit, typecheck, security, browser, contract and CI gates as appropriate. Never claim unexecuted tests passed.
4. Commit changes on a dedicated branch, create/update draft PR, preserve other workers' branches and document exact source identities.
5. Update `docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md` with base/head SHAs, changed paths, tests, CI links, open issues, blockers and next steps.
6. Continue on the next scheduled run until each workstream is complete or near-complete. Do not claim uninterrupted background execution.

## Safety and release constraints
Preserve existing security, privacy, noncustodial and fail-closed invariants. No real funds, mainnet enablement, deployment, release, or automatic main merge without separate explicit authorization. Do not weaken tests, security ratings, audit requirements or cryptographic guarantees to mark work complete. A code/AI review is not an independent security audit. Complete means tested, documented and qualified to the applicable acceptance criteria; near-complete requires an exact remaining-gates ledger, not invented percentages.
