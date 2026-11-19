# Documentation reconciliation — November 18, 2026

## Source checkpoint

This is a documentation-only consolidation based on merged
`main@6c38e641e24abcfdcf645f864bd64c9645836d75`, tree
`44bc5282c9bd59b49b128ed2028e940588fba053`. Later work must refresh the live refs;
the observations below do not assert that these remain the latest heads.

The candidate preserves each source head through an ordinary merge, rather than
copying its final files and discarding ancestry:

| Source PR | Preserved head | Material retained |
| --- | --- | --- |
| [#136](https://github.com/djshellshoxxx/p2p-offramp/pull/136) | `014a10a148f8b3b69c9d650fbcb083c8142e7d28` | Lane B's initial progress, toolchain and baseline record |
| [#139](https://github.com/djshellshoxxx/p2p-offramp/pull/139) | `708d937df7e4799e4ad212b3293bec923f619940` | Source-pinned development, wiki and ChatGPT handoff checkpoints |
| [#164](https://github.com/djshellshoxxx/p2p-offramp/pull/164) | `436b591a3a750bcca2327117e487336f6dd77470` | README navigation, vendor-link repairs and QR inventory |
| [#165](https://github.com/djshellshoxxx/p2p-offramp/pull/165) | `1fe5ae00ed2105633081d71a67db2b5436da9c8d` | Lane A's merge ledger and remaining-work handoff |

All four merges were conflict-free. Their shared `DEVELOPMENT_STATUS.md` edits
required a current-state correction: an earlier “latest” paragraph and a later
QR sweep both named superseded main commits. The dated records are retained and
marked historical. The source PRs remain separate until this candidate is
qualified and integrated; no closure or blanket supersedence is claimed here.

Audit PR [#138](https://github.com/djshellshoxxx/p2p-offramp/pull/138) is an active,
separate owner lane. Its ledger is neither imported nor edited in this candidate.
Ownership instructions, application code, dependencies and release policy are
unchanged.

## What is already on the pinned main

| Merged PR | Merge commit | Source capability and remaining boundary |
| --- | --- | --- |
| [#135](https://github.com/djshellshoxxx/p2p-offramp/pull/135) | `af4835b58146fc970af90790b635ea7c75a724af` | Document language/direction and locale selector wiring; production still bundles English only |
| [#140](https://github.com/djshellshoxxx/p2p-offramp/pull/140) | `8649b7a1994ec21fe5557179d44e861b746bcda8` | D3 release-trust primitives and D6 QR codec/symbol encoder; no approved live trust root or camera/import UI follows |
| [#150](https://github.com/djshellshoxxx/p2p-offramp/pull/150) | `97ce6a41805ab4d8fc6fccbcfb9dd79463deebd7` | D1 Option B acceptance carrier and exchange composition; complete browser buyer/seller acceptance remains separate |
| [#141](https://github.com/djshellshoxxx/p2p-offramp/pull/141) | `d6344b66b5537b146b6aad06b542a246c18cc497` | Artifact verification uses the explicitly requested build mode |
| [#149](https://github.com/djshellshoxxx/p2p-offramp/pull/149) | `f3fb73921c75ec6aa1075ab2ca516e6c5fe3a3dc` | Synthetic encrypted fresh-key recovery-reference regression; not live-chain send provenance |
| [#151](https://github.com/djshellshoxxx/p2p-offramp/pull/151) | `2c49117ea14f7f0cae062e955b55116bb5fd48a1` | Native Solana off-chain consent candidate, verification and replay support; economic preparation and browser wiring remain disabled |
| [#143](https://github.com/djshellshoxxx/p2p-offramp/pull/143) | `f9bc66e70003fe5550d9817c639d80d98a73d04a` | EVM reader state bound to canonical block hashes; downstream wallet/payment/recovery hardening is still in #166 |
| [#137](https://github.com/djshellshoxxx/p2p-offramp/pull/137) | `6c38e641e24abcfdcf645f864bd64c9645836d75` | Development-only formal/refinement harness; unknown proof results and the explicit model gap remain limitations |

PR #137's source head `39096586e1160c3c8434a2d081339bb70aeb4c1b`
had 10 successful hosted check runs plus Snyk. Its current-main integration tree
was independently checked: 22 formal regression tests, 32 Python/spec tests,
four TypeScript projects, specification links and import boundaries passed.
These results are scoped to that source and tree. No new native formal proof or
production approval was established. See [the formal harness](../../scripts/formal/README.md).

## Active product stack, still outside this main checkpoint

| PR | Observed head | Base | Work and remaining qualification |
| --- | --- | --- | --- |
| [#166](https://github.com/djshellshoxxx/p2p-offramp/pull/166) | `9bc9aa83d740891a01522b7398f5fd3e4049b3e8` | `main` | Canonical EVM wallet/payment/recovery reads, signing fences and isolated localnet build; its refreshed head needs its own hosted qualification |
| [#167](https://github.com/djshellshoxxx/p2p-offramp/pull/167) | `c277a9383f1712d70e94807a376dc8fc3f5c43e1` | #166 branch | Consolidated Solana settlement/lifecycle and encrypted native recovery; real-validator qualification and browser action composition remain separate |
| [#168](https://github.com/djshellshoxxx/p2p-offramp/pull/168) | `a0be1b656b977d0356768817d99d8aeb42c7bcba` | #167 branch | Native-EVM localnet browser composition, encrypted recovery and acceptance gates; actual combined browser execution and ERC-20 UI parity are not established by this checkpoint |

The stack's [source-pinned execution report](https://github.com/djshellshoxxx/p2p-offramp/blob/2a623d7248dcfd35d215b50738c01846143c704a/docs/execution/CONSOLIDATION-RESULT-2026-11-18.md)
records its own 1,922-test/controller result and its unexecuted Chromium/validator
gates. Those are historical, source-scoped results, not test evidence for this
documentation branch, current main, or later stack edits. Work in progress on
ERC-20 UI or browser fixtures is not counted as merged or qualified.

The newer [browser continuation report](https://github.com/djshellshoxxx/p2p-offramp/blob/a0be1b656b977d0356768817d99d8aeb42c7bcba/docs/execution/LOCALNET-BROWSER-CONTINUATION-2026-11-18.md)
records #168's refresh onto #167 at `c277a938` and a test-evidence repair that binds
the durable marker to the exact physical transaction and current-profile provenance.
Its ten marker regressions and twelve native-controller checks passed on their
reported source; Chromium was still blocked before any browser context or page
existed. These native/controller results do not qualify browser IndexedDB, Workers,
physical wallets or the separate ERC-20 implementation. ERC-20 source and native
checks remain unpublished work in progress pending final independent review.

The same report records selected extraction of #159's signer/localnet work and
consolidation of #152/#153/#157/#158 through #167. This does not make the original
PRs wholly superseded or authorize closing them. Preserve their unconsumed
changes and review their exact disposition before any closure.

## Next work and release boundaries

1. Qualify the refreshed #166 head, then the resulting #167 and #168 combinations
   in dependency order. Each new source/base combination needs relevant evidence.
2. Complete browser wallet/trade acceptance, ERC-20 UI parity, unfunded-negotiation
   resumption and native Solana action wiring without duplicating active owners.
3. Continue the QR import/device workflow, locale/accessibility qualification,
   reviewed trust/bootstrap and independent release/security work against their
   actual current implementation. The [Lane A handoff](LANE-A-HANDOFF.md) retains
   the original quarry recipes; [Lane B progress](LANE-B-PROGRESS.md) maps its PRs.
4. Reconcile optional packages separately. Their draft presence does not change
   the core scope or D7 deferral.

The stack's [Picomatch assessment](https://github.com/djshellshoxxx/p2p-offramp/blob/2a623d7248dcfd35d215b50738c01846143c704a/docs/execution/PICOMATCH-ADVISORY-ASSESSMENT-2026-11-18.md)
is a dated dependency finding, not a fresh audit or a claim of remediation here.
SonarCloud Security Rating A, independent release review, physical-wallet and
public-testnet acceptance, live trust pins and owner release authorization
remain unverified by this documentation work.

The application remains static, client-side and noncustodial, with external-wallet
authority. The seller's manual fiat confirmation precedes a separate release review
and external-wallet approval; confirmation alone is not a transaction or proof of
payment finality. `ReleaseEnabled=0`. No deployment, release, real funds, or live GitHub
Wiki publication was performed. [User Guide](../wiki-source/User-Guide.md) and
[Developer Guide](../wiki-source/Developer-Guide.md) remain distinct entry points.

## Validation scope

The combined changed Markdown files and all ten wiki-source pages were checked
with the repository specification parser's Markdown-link extraction. Across 20
Markdown files, 128 relative file links resolve and zero destinations are missing.
The 745 remote, absolute or fragment-only link instances were not independently
resolved; rendered headings/anchors and live Wiki publication were not tested.
`python scripts/spec_audit.py --check` passed with 173 specifications, zero broken
links and zero unindexed specifications. `git diff --check` passed.

All four source heads are retained as merge ancestors. A final remote re-read
confirmed #136/#139/#164/#165 still at the heads listed above, including #139 at
`708d937df7e4799e4ad212b3293bec923f619940`; check again if publication is delayed.
The active #167 head was refreshed to `c277a9383f1712d70e94807a376dc8fc3f5c43e1`
during this pass; #168 was then re-read at `a0be1b656b977d0356768817d99d8aeb42c7bcba`.
Both are recorded separately from historical source evidence.
No product/browser/native tests were rerun for these docs. The candidate's final
hosted checks must be inspected independently.
