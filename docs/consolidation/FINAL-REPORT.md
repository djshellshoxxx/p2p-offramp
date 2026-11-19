# Consolidation and continued-development report

## Current outcome

The latest main is [`80375193f16082c582a1faf2c6ba598f9eca532a`](https://github.com/djshellshoxxx/p2p-offramp/commit/80375193f16082c582a1faf2c6ba598f9eca532a), tree `6be72aa4282328654a9243e91f4d9259624e0196`, after the reviewed #138 audit ledger. The reviewed core, native Solana recovery, native EVM browser and ERC-20 browser stack was qualified at
[`91ee6991d4527bba0e76b048a76e65ed7693c5a1`](https://github.com/djshellshoxxx/p2p-offramp/commit/91ee6991d4527bba0e76b048a76e65ed7693c5a1),
tree `c494301afcf9577175d68f64dda924d6b8fe3c39`. This is source integration and
local/hosted development qualification. The full MVP and release gates remain
incomplete. `ReleaseEnabled=0`; no public-network deployment or production release
occurred.

The initial remote inventory covered **177 branches** and every PR page. The updated inventory contains **181 branches**, including three new development branches and the report branch, and 173 PR records. The machine-readable inventory is the authoritative timestamped count; its own next report commit necessarily appears only in a later refresh.

## Recorded counts at this checkpoint

| Measure | Result |
| --- | --- |
| Initial branches discovered | 177, including main |
| Current inventory | 181 branches: 120 D, 38 C, 18 B, 4 E, 1 F, 0 A; 173 PR records, 34 open |
| Direct PR merges executed | **5**: #169, #166, #167, #170, #138 |
| Additional source PRs GitHub recognized as merged | **8**: #136, #139, #164, #165, #152, #153, #157, #158 |
| Explicit superseded closure | **1**: repaired #168, proved incorporated through #170 |
| New development PRs so far | **3**: #173 expanded token-browser recovery; #174 repaired historical tooling; #175 explicit unfunded resumption |
| Original branch repair lanes | #168 browser parent and #154 tooling; expanded #173 acceptance also exposed and repaired a restored-exit lifecycle defect |
| Selective historical extractions | Two narrow units: #28 per-run lab evidence and #156 independent tool-path test, both in #174 |
| Textual merge conflicts resolved | One `package.json` conflict; all required scripts retained |
| Historical branches deleted / force pushes / direct main pushes | Zero |

Counts distinguish direct operations from ancestry-based source recognition and
content equivalence. No 100%-complete product percentage is invented.

## Functionality gained

#166 qualifies core wallet, chain, payment/recovery and bilateral acceptance
hardening. #167 integrates native Solana/SPL lifecycle and encrypted recovery,
with actual native validator evidence and separate encrypted storage tests. #170
incorporates the repaired native browser parent and adds explicit finite-allowance
ERC-20 funding, settlement, release/refund, locking and durable-send behavior.
The default static application remains funds-disabled; trading qualification uses
explicit disposable localnet fixtures.

Continued implementation adds fresh-profile token recovery and wallet revocation
coverage in #173, repairs current-main tooling and a newly reproduced array-bound
defect in #174, and implements bounded same-terms negotiation resumption in #175 (128 affected tests, typechecks/artifact checks and independent review passed). Each remains
separate until its own acceptance and review gates are met.

## Verification and security

At the merged main checkpoint, **1,942 package tests passed, none failed, and one
optional Foundry oracle was skipped**. All four TypeScript projects passed,
32 Python spec tests passed, 50 artifact/build-policy tests passed, spec inventory
and import boundaries passed, 92 Foundry tests passed, and default/demo assets
built and passed independent retained-inventory verification.
Exact-head hosted native/ERC-20 Chromium and native Solana validator checks passed
before the corresponding product merges. [TEST-RESULTS.md](TEST-RESULTS.md) links
the actual runs, source trees and scope limits.

The new #173 tests initially failed in actual Chromium because correct reconnect
did not immediately retire a prepared intent after wrong-chain cancellation.
The correction explicitly tests the configured block lease; no canonical check or
journal invariant was weakened. The corrected hosted run passed those assertions,
then exposed a confirmed restored-exit defect: multiple cancelled attempts still
blocked a fresh review after another finalized transaction consumed their nonce.
The narrow recovery repair is now published as `c7f462c…`, independently reviewed,
and passes 31 affected lifecycle tests plus a real native restore/release/refund
diagnostic. A fresh complete browser GREEN is still required. Local
Chromium is blocked before context creation by sandbox Unix sockets, so local
build success is never presented as browser acceptance.

Confirmed repairs include duplicate React keys, clone-safe wallet requests,
stale strict documentation records, lab evidence overwrite, a developer claims
array-bound bypass and finalized-nonce recovery for restored cancelled exits.
QR bounds/typed-error repairs are technically qualified but
remain unmerged because the required automated review has not appeared.

Fresh root full and production npm audits now return zero findings. The earlier
Picomatch finding was withdrawn upstream on November 18; package bytes were not
patched or replaced. The earlier bounded reproduction is preserved as historical
evidence. Full details and review limits: [SECURITY-FINDINGS.md](SECURITY-FINDINGS.md).

## Remaining work and external blockers

The unfinished required product work is same-terms unfunded resumption, Solana
browser composition, broader real-relay/physical-wallet/device acceptance, QR
camera/application handoff, and complete accessibility/localization coverage.
Current PR gates include exact-head #173/#175 browser checks and D8 automated review for
QR/tooling. Optional packages are accepted for isolated source intake under the
November 18 decision superseding D7's original parking option; their per-PR
qualification and separately gated default-build integration remain outstanding.
They are outside mandatory MVP dependencies. The custodial ledger branch is
architecturally rejected and retained.

Release qualification still needs independent professional security review,
approved trust/deployment records, supported-wallet/public-testnet recovery,
relevant SonarCloud evidence and explicit owner release authorization. This run
does not turn any of those into an implicit approval.

The immediate integration task is to obtain actual hosted browser GREEN for #173/#175. The next product implementation is the native-SOL funded recovery browser slice now in progress, with exact genesis, encrypted recovery documents and explicit external-wallet review. Full fresh Solana negotiation remains a distinct acceptance/composition gap. [REMAINING-WORK.md](REMAINING-WORK.md) gives
concrete acceptance criteria, dependencies and negative tests.

## Navigating the evidence

- [Complete branch inventory](BRANCH-INVENTORY.md) and [full machine-readable records](BRANCH-INVENTORY.json).
- [Dependency graph](DEPENDENCY-GRAPH.md), [merge decisions](MERGE-DECISIONS.md), [merge ledger](MERGE-LEDGER.md), and [conflict resolutions](CONFLICT-RESOLUTIONS.md).
- [Source-based feature matrix](FEATURE-COMPLETION.md), [test results](TEST-RESULTS.md), [security findings](SECURITY-FINDINGS.md), and [remaining work](REMAINING-WORK.md).
- [Independent historical comparisons](HISTORICAL-BRANCH-REVIEW.md), retained source pins and changed-path evidence.
- Existing trackers: [#82 consolidation](https://github.com/djshellshoxxx/p2p-offramp/issues/82), [#55 research/qualification](https://github.com/djshellshoxxx/p2p-offramp/issues/55), [#130 queued CI](https://github.com/djshellshoxxx/p2p-offramp/issues/130).
