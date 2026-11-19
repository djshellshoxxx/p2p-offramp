# P2P Off-Ramp Wiki

**Experimental development project — not production-ready, no real funds.** This directory contains **version-controlled wiki source**, not a published live GitHub wiki. Trading authority is disabled (`ReleaseEnabled=0`), and default builds have no approved registry.

## Start here

- **[User Guide](User-Guide.md)** — current capabilities, getting started, local workflows, troubleshooting, FAQs and privacy/security limitations.
- **[Developer Guide](Developer-Guide.md)** — architecture, setup, CLI/test commands, code map, APIs, security rules, CI and release gates.

## Additional focused pages

[Getting Started](Getting-Started.md) · [Wallet and QR Safety](Wallet-and-QR-Safety.md) · [Privacy and Recovery](Privacy-and-Recovery.md) · [Architecture and Development](Architecture-and-Development.md) · [Codespaces Test Lab](Codespaces-Test-Lab.md) · [Security and Release](Security-and-Release.md)

## Current source checkpoint — November 19, 2026

At merged `main@80375193f16082c582a1faf2c6ba598f9eca532a`, documentation reconciliation [#169](https://github.com/djshellshoxxx/p2p-offramp/pull/169), EVM core [#166](https://github.com/djshellshoxxx/p2p-offramp/pull/166), Solana client/recovery [#167](https://github.com/djshellshoxxx/p2p-offramp/pull/167), browser trading/ERC-20 recovery [#170](https://github.com/djshellshoxxx/p2p-offramp/pull/170) and the audit ledger [#138](https://github.com/djshellshoxxx/p2p-offramp/pull/138) are **merged**; [#168](https://github.com/djshellshoxxx/p2p-offramp/pull/168) was **closed without merging**. Further ERC-20 browser acceptance [#173](https://github.com/djshellshoxxx/p2p-offramp/pull/173) and same-terms recovery [#175](https://github.com/djshellshoxxx/p2p-offramp/pull/175) remain **draft**, with exact-head qualification pending. Merged code is not a live deployment, acceptance certification or release; `ReleaseEnabled=0`. The [consolidation documentation candidate #176](https://github.com/djshellshoxxx/p2p-offramp/pull/176) remains draft. No live Wiki publication is verified.

## Historical recorded source checkpoint — November 18, 2026

This wiki source describes merged `main@6c38e641e24abcfdcf645f864bd64c9645836d75` unless a feature is
marked draft, future-only or blocked. The [reconciliation record](../consolidation/2026-11-18-documentation-reconciliation.md)
and [development status](../DEVELOPMENT_STATUS.md) identify the exact merged capabilities
and pending stack. D1, QR/release-trust primitives, Solana consent verification,
canonical EVM reader binding and development-only formal tooling are on this main.
Draft #166/#167/#168 wallet, native recovery and localnet browser work remains separate.
Neither their tests nor the formal harness establish release readiness. Production
still bundles English only, `ReleaseEnabled=0`, and live Wiki publication is unverified.

## Historical wiki checkpoint at `f3fb7392`

The following paragraph records the earlier inspected source and its then-current PR states.
This wiki source describes **merged main** unless a feature is clearly marked **draft**, **future-only**, or **blocked**. Merged source is **not** an authorized release: historical [integration PR #61](https://github.com/djshellshoxxx/p2p-offramp/pull/61) is now merged, and [consolidation PR #134](https://github.com/djshellshoxxx/p2p-offramp/pull/134) landed the integration trunk. [Locale PR #135](https://github.com/djshellshoxxx/p2p-offramp/pull/135) subsequently merged into `main@af4835b58146fc970af90790b635ea7c75a724af`; production still bundles English only, **not released translations**. [Release/QR PR #140](https://github.com/djshellshoxxx/p2p-offramp/pull/140), [D1 peer-acceptance library PR #150](https://github.com/djshellshoxxx/p2p-offramp/pull/150), and [test-only fresh-key recovery PR #149](https://github.com/djshellshoxxx/p2p-offramp/pull/149) subsequently merged; the latest verified `main` snapshot is `f3fb73921c75ec6aa1075ab2ca516e6c5fe3a3dc`. These commits do **not** enable real-funds trading, establish full browser buyer/seller acceptance, certify D9 historical send provenance, or verify SonarCloud Security Rating A. [Lane B PR #136](https://github.com/djshellshoxxx/p2p-offramp/pull/136) remains a separate draft. Live GitHub Wiki publication has not been verified. See [README](https://github.com/djshellshoxxx/p2p-offramp/blob/main/README.md), [operator guide](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/OPERATOR.md), and [task ledger](https://github.com/djshellshoxxx/p2p-offramp/blob/main/tasks/todo.md) for implementation evidence. Do not use test-only synthetic fixtures to transact.
