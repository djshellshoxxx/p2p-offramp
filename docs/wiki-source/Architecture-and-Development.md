# Architecture and developer setup
**Partly implemented; not production software.** The project is a static, client-side React/TypeScript/Vite app using external wallets, immutable versioned escrow, relay discovery, encrypted messaging and encrypted local recovery. No app-owned backend is allowed; see the [client-side ADR](../adr/ADR-CLIENT-SIDE-2026-10-24.md).

Keep wallet signing, transport, escrow, evidence and storage behind independently tested interfaces. Pin dependencies, run contract fuzz and invariant tests, avoid vendored cryptographic snippets, and retain architecture decisions and license provenance.

## Local checks
Requires Node 24+ and Python 3.12+ for the spec tool. Chromium is needed for browser checks only.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm run build:demo   # synthetic, test-only; never deploy
npm run test:browser
```

The EVM escrow package is excluded from the shipped app. On Linux x64: `npm ci --ignore-scripts --prefix packages/escrow-evm`, then `npm run test:escrow` and `npm run test:local-evm`. Its README lists what is not yet claimed (for example, no Forge fuzz suite, Slither result or external audit).

## Status and references
[README](../../README.md) · [development status](../DEVELOPMENT_STATUS.md) · [roadmap](../../DEVELOPMENT_ROADMAP.md) · [operator guide](../OPERATOR.md) · [Milestone Status](Milestone-Status.md)

Product specs: [completion roadmap](../../00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.1_master_plan/spec-completion-roadmap-and-dependencies.md). Adapter staging: [reusable adapter guide](../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_reusable_code/module_0.3.1_vendor_adapters/README.md).
