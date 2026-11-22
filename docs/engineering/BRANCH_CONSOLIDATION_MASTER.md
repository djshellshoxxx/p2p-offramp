# P2P-Offramp — branch consolidation master (live intake, 2026-11-22)

> **Execution status: PARTIAL.** This is a reproducible coordination baseline, not a claim that all branches are qualified, features finished, or any open PR merged. The complete branch-head/open-PR metadata capture is [BRANCH_INVENTORY.json](BRANCH_INVENTORY.json).

## Authoritative baseline

- Repository: `djshellshoxxx/p2p-offramp`.
- Starting/current observed `main`: `01f6f4feca051d68de24a04299cd3bb444bce40c`, tree `437323a382952b9623a875c818f8af005a5d4563`. This already includes PR #236; PR #233–235 are represented in its merge ancestry per the corresponding source handoff.
- Metadata capture: 256 branch refs, including the newly created diagnostic branch for #244, and 59 open PRs. The separate branch holding this inventory was created *after* the capture and is not included in that count.
- Treat source/merge ancestry, executable tests and current GitHub checks as primary evidence. Historical handoff/test totals apply only to their recorded SHAs.
- `agents.md` forbids direct pushes to main, forced overwrites and unqualified merges. D8's applicable Tier B/Tier C gates, privacy/financial safety, worker ownership and explicit recorded approvals remain binding.
- `ReleaseEnabled=0`, client-side/noncustodial architecture and no-production-deployment restrictions must remain unchanged.

## Active dependency graph

```text
main 01f6f4fe (#236 integrated)
 └─ #237 retention read-only preview, Tier B, CodeRabbit/Qodo and fresh target gates pending
      └─ #238 generic sharing UI integration
           └─ #239 offline startup/recovery guidance
                ├─ #243 Chromium sharing/startup acceptance (draft; hosted 12/12)
                ├─ #240 Solana preparation (draft; content retained by #241)
                └─ #241 prepared funding + core policy (Tier C, owner approval pending)
                     └─ #242 saved-proposal seller funding/recovery (draft; hosted program failure)
                          └─ #244 guarded payout readiness diagnostic test (draft; qualification pending)

Separate isolated optional intake, currently targeting main:
#224 proof-inputs, #225 liquidity, #226 arbitration, #227 privacy-policy,
#228 proof-jobs, #229 privacy-controls, #230 courier, #231 meetup, #232 stealth.
These supersede older-source intake PRs #191–199 for current-main integration,
but do not automatically authorize activation or production financial authority.
```

## Ranked immediate work

1. **Critical qualification:** Reproduce and determine exact guard causing #242's disabled separate-payout button in the actual encrypted-Worker/browser test. #244 adds guard-preserving wait and redacted diagnostic evidence; do not treat its proposed code as a proven fix until current-head native CI runs.
2. **Parent-chain merge eligibility:** Resolve #237's specified CodeRabbit-or-Qodo gate and target-specific merge-tree qualification, then requalify #238, #239, #243, #241 and #242 on their actual changing target heads. Do not bulk-merge the stack.
3. **Financial authority:** Obtain #241/#242 matching owner approval where D8 Tier C requires it, independent review and Solana native/validator/browser acceptance. Never infer successful funding from wallet request or broadcast.
4. **Optional intake:** Verify unique source, dependency checks and current-main conflicts one isolated optional package at a time; keep feature gates disabled and original source branches intact.
5. **Full 256-ref archaeology:** Compare commit ancestry and patches for each metadata-only branch. Classify as complete, integration/test-needed, incomplete, nonfunctional, superseded-unique, already-integrated, deferred or docs-only **after** examining the code and policy. This work remains open.

## Merge protocol

Before each proposed merge: fetch current source and main SHAs; inspect file ownership; check submitted reviews and unresolved threads; inspect full current-head actions, coverage and external statuses; read back the exact proposed merge tree/parents; run required combined tests; use an expected-head guard; then verify resulting main SHA, tree, and ancestry. No merge is authorized solely by this intake document.

## Evidence pointers

- [Feature tracker](FEATURE_COMPLETION_TRACKER.md)
- [Test/CI evidence and failures](CONSOLIDATION_TEST_RESULTS.md)
- [Current continuation handoff](CONSOLIDATION_HANDOFF.md)
- [PR #242 failed native browser job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44826827834/job/136601434309)
- [PR #244 isolated diagnostic follow-up](https://github.com/djshellshoxxx/p2p-offramp/pull/244)

## Optional-module current-main comparison (live verification)

At `main@01f6f4feca05`, authenticated GitHub comparisons for each optional PR #224–232 report **two ahead / 73 behind** with common merge base `388526a474ae`. Their original CI alone is not current-main integration qualification.

| PR | Source delta from merge base | Exact-head check-runs |
| --- | --- | --- |
| #224 proof-inputs | 10 added files; 2 modified workflow/package files | 15/15 success |
| #225 liquidity | 14 added | 14/14 success |
| #226 arbitration | 20 added | 13 success; 1 cancelled Firefox backup check |
| #227 privacy-policy | 11 added | 14/14 success |
| #228 proof-jobs | 21 added; package.json modified | 16/16 success |
| #229 privacy-controls | 14 added; workflow/package files modified | 15/15 success |
| #230 courier | 24 added | 14/14 success |
| #231 meetup | 37 added; workflow/package files modified | 15/15 success |
| #232 stealth | 21 added | 14/14 success |

All nine PR descriptions explicitly require a **D8 Tier B CodeRabbit-or-Qodo pass with findings answered**, in addition to independent human/source review and current-target CI. No submitted GitHub review and no unresolved inline threads were found for these nine PRs at inspection. The mostly additive per-package source is promising for isolated intake, but **three packages edit package/workflow wiring, conflicts may appear in a combined tree, and no final target-specific integration gate is satisfied**. No optional main merge was attempted.

## Historical source equivalence samples

Live comparison with `main@01f6f4fe` proves the following ten named historical branches have **zero ahead commits**, i.e., their entire respective histories are already ancestors of `main`: `feature/public-qr-capture-20261119`, `feature/same-terms-resumption-20261119`, `feature/erc20-browser-continuation-20261118`, `codex/max-consolidation-20261119`, `integration/solana-core-qualification-20261118`, `codex/solana-browser-send-repair-20261119`, `consolidation/solana-browser-recovery-20261119`, `codex/continuation-g21-20261120`, `codex/signed-update-ui-g13-20261120`, and `codex/relay-freshness-capacity-20261120-auto2`.

`integration/browser-mvp-20261118` is a special case: its commit `823f5d3b8a26e5be8d8a5a65fc5b74766cc04c10` remains one ahead / 206 behind, but its **three exact source changes** (separate React private/backup keys, RPC's exact `method`/`params` shape and a fixture assertion of permitted EIP-1193 keys) are already present in current main. This unique commit does **not** represent missing feature code requiring re-merge.

`validation/pr237-current-main-20261121` is ten commits ahead and zero behind `main`; it is a current-main-descended validation branch and its code has **not** been classified as uniquely missing or safe to merge from commit counts alone. Check its overlap with active PR #237 before considering any integration. Do not infer that the other unexamined branches are redundant.
