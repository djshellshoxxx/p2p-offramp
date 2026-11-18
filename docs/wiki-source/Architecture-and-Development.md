# Architecture and development

[Developer Guide](Developer-Guide.md) · [Home](Home.md)

Current main has a static React/Vite/TypeScript shell, encrypted IndexedDB-backed local profiles and worker boundary, EVM read-only terms review, and test-only local chain/escrow modules. The design remains **client-first and noncustodial** with external wallets; no mandatory app-owned backend or production trading authority is enabled. Presence of relay or escrow source does not mean the production UI exposes it.

Start with the [developer setup and command reference](Developer-Guide.md) and [operator guide](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/OPERATOR.md). Implementation boundaries live in [`packages`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/packages), the web shell in [`apps/web`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/apps/web), and contract verification in [`contracts/evm`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/contracts/evm).

Normative references: [client-side ADR](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/adr/ADR-CLIENT-SIDE-2026-10-24.md), [roadmap](https://github.com/djshellshoxxx/p2p-offramp/blob/main/DEVELOPMENT_ROADMAP.md), [product completion specifications](https://github.com/djshellshoxxx/p2p-offramp/tree/main/00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion), [task ledger](https://github.com/djshellshoxxx/p2p-offramp/blob/main/tasks/todo.md). Keep transport, wallet signing, EVM receipt verification, trust registry and encrypted local recovery separate and independently tested. The [integration draft #61](https://github.com/djshellshoxxx/p2p-offramp/pull/61) is **not merged**. Independent security review and owner/peer acceptance remain release blockers.
