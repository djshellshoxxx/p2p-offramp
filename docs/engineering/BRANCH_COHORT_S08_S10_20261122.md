# Branch consolidation cohort — original S08, S09 and S10 (2026-11-22)

**Decision: preserve existing M-0 owner PRs; do not merge the historical stage refs.** This is an authenticated, exact Git-blob comparison against `main@01f6f4feca051d68de24a04299cd3bb444bce40c`, with staged parent trees, all recursively enumerated file blobs and current PR heads. It is *not* a patch-id/range-diff, executable test, complete feature-equivalence judgment, independent approval or current-target merge qualification.

## Live source identities and ancestry

| Original historical stage | Exact original head / tree | Exact stage parent | Against main (ahead / behind, merge base) | Existing owner |
| --- | --- | --- | --- | --- |
| S08 portal/lab/docs | `c950dad4b387cb4b33910789c454eb8f2ab0ae81` / `1a6408c82025d3b50dbbcca586b7f5e8da8bba46` | S07 `8f0e5e245ee8c63c749e8af97fdb9d309e95b8d7` | 8 / 626; `a88560741e60146a424cc18fcb2cc1043756ae3e` | [PR44](https://github.com/djshellshoxxx/p2p-offramp/pull/44) `f8a9aa1430129fd57fd9217402577106bebeca7a`, tree `774dbedf538a143c5a8d6d017575380c8e1807af` |
| S09 candidate intake | `389c0ea69e24615d0f1d7595942514300cd855f9` / `f5994d4d9e4aa8575869dd46e52f20c45e8a4ed3` | S08 exact original above | 9 / 626; same merge base | [PR45](https://github.com/djshellshoxxx/p2p-offramp/pull/45) `5a9997485b9dbdc1c9bf8a23c3b372728515c295`, tree `e2472c44df27fe2a30272f8353ae310bfedd6dd9` |
| S10 optional modules | `c696c02b94eb6b90da2ed76f93c383fcd8a7f703` / `f97fd338bd0b073e0036b5a5975c51bad58e8440` | S09 exact original above | 10 / 626; same merge base | [PR46](https://github.com/djshellshoxxx/p2p-offramp/pull/46) `0baa3c1ae5a71e766df95217f6ff4d3db5b1cd03`, tree `5b5cb0d588ea699e5b44de5dfe92cbf48e88c535` |

All six refs were read back unchanged from GitHub immediately before this checkpoint. The three original branches are divergent, **not ancestors of main**. The current `main` tree is `437323a382952b9623a875c818f8af005a5d4563`. Stage-local path counts compare each historical single-stage commit to its *original* immediate parent, not to the PR diff or an entire historical stack.

## S08: source retention is proved, not semantic equivalence

The original S08 stage adds or modifies **41 paths and removes zero**. Current main has **11 exact identical blob hashes and 30 different** on those same 41 paths, with **zero paths absent**. PR44 preserves all 41 paths: **37 historical blobs exact, four newer different, zero absent**. Those four owner-corrected paths are `scripts/distribution/stage.mjs`, `scripts/distribution/stage.test.mjs`, `scripts/docs/validate.mjs` and `scripts/lab/run.mjs`.

Authenticated source spot-check: the PR44 stage script uses an explicit ordered-name sort before iterating directory entries, whereas the original staged variant sorts and iterates inline. This is a narrowly observed control-flow difference, not proof of behavioral equivalence. The stage includes scriptless portal, local lab, claims/docs validation and unsigned distribution staging. Current main already has the portal and lab entrypoint paths, but newer differing bytes must **not** be replaced with stale historical code. PR44 remains the source-owning stack branch and requires its own reviewed qualification.

## S09: 26 candidate/evaluation files are absent from main

The original S09 stage adds or modifies **27 paths and removes zero**. Current main has **26 absent paths**, zero exact blobs and one different path (`package.json`). **All 27 original stage blobs are byte-identical in open PR45**. This preserves the whole stage-local file set without integrating it into main.

Source-reviewed examples: `scripts/reputation/semaphore-v4-evaluation.mjs` and `security/intake/mobile-wallet/README.md` document bounded, separate public evaluation inputs, not production provider authority. The mobile-wallet evaluation explicitly records **4/5 tests passing at its historical source**, with a fifth *stronger application roundtrip* expectation not met by the upstream WalletConnect URI helper; the old test is not a current-source failure or permission to normalize the URI or activate a connector. No real pairing, key, callback, wallet session, release or trading authority is evidenced. External-dependency pins/audit and licensing limitations remain source-bound.

## S10: nine separate optional packages are preserved, not activated

The original S10 stage changes **136 paths, removes zero**. Current main is missing **134 of those paths** and has two different config/workflow paths. Open PR46 contains all **136 paths**, of which **120 old blobs match exactly** and **16 differ due to subsequent changes**. By stage-local path group: arbitration 16, courier 19, liquidity 10, meetup 32, privacy-controls 11, privacy-policy 6, proof-inputs 7, proof-jobs 16, stealth 17, plus one workflow and one root package manifest.

The 16 corrected owner paths are:
`packages/arbitration/src/payment-assertions.ts`;
`packages/courier/src/accounting.ts`, `packages/courier/src/custody.ts`, `packages/courier/src/locker.ts`, `packages/courier/src/verification.ts`, `packages/courier/test/accounting.test.mjs`;
`packages/meetup/src/signaling-model.ts`, `packages/meetup/test/primitives.test.mjs`, `packages/meetup/test/rtc-policy.test.mjs`;
`packages/privacy-policy/src/mode.ts`, `packages/privacy-policy/src/policy.ts`;
`packages/proof-jobs/src/supervisor.ts`, `packages/proof-jobs/test/protocol.test.mjs`;
`packages/stealth/test/pages.test.mjs`, `packages/stealth/test/profiles.test.mjs` and `packages/stealth/test/service.test.mjs`.
Do not describe these 16 differences as audited fixes without independent verification.

The inspected PR46 courier custody model explicitly marks `localModelOnly: true`, `physicalContentsVerified: false`, `economicAuthority: false`. The PR46 stealth README identifies two offline diagnostic Keccak profiles with **different wire inputs** and explicitly rejects interchangeability with an approved ERC-5564 production integration. Its offline fixture cannot authorize payments. Current-main optional omission is intentional under D7; newer separate [PR224–232](https://github.com/djshellshoxxx/p2p-offramp/pulls) have their own owners and exact-source/named-review requirements. Do **not** bulk-merge PR46, wire optional packages into default imports, or inherit economic authority.

## Review and acceptance boundaries

PR44 and PR45 have only `COMMENTED` reviews from Qodo at the observed heads, **not a pass/approval**. PR46 has no recorded review submission. This run did not execute any Node tests, browser/Worker/IndexedDB, Solana validator or payment/refund journey. No Git patch-id, `range-diff` or local merge-tree was computed because the supplied worktree was absent and host GitHub DNS prevented direct clone. GitHub REST commit ancestry, stage-local tree files, exact blob hashes and PR metadata **were** executed/read. The historical mobile evaluation's 4/5 is not reclassified as passing. Nothing here substitutes for D8 Tier B/Tier C and owner approvals, current-target trees/checks, or financial native acceptance.

**Disposition:** Original S08, S09 and S10 become `V-divergent-partially-reconciled` rather than `U-needs-code-diff-review`. The unique *stage-local paths* are fully accounted for by owned PR44/45/46; **no original complete history, current-main source equivalence, integration acceptance, or release completion is claimed**. Preserve original refs, all historical failures and owners. `ReleaseEnabled=0` unchanged.

## Next bounded source cohort

1. Compare original S11 and S12 stages to open PR47/48 and current main, preserving historical evidence-only and governance changes without blindly importing stale workflows.
2. For S08/09/10, perform path-level semantic/range-diff review of the 4/0/16 newer owner variants, explicitly validating any corrected safety predicates and downstream dependencies before considering qualified integration.
3. Return to accepted current-main recovery/escrow and wallet-regression execution when a working Git/test runtime is available, without copying historical tests onto renamed APIs or manufacturing current-source green evidence.
