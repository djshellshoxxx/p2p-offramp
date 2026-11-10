# Developer Guide

[Home](Home.md) · [User Guide](User-Guide.md)

**Status: active development.** Documentation here describes **main**, not an automatic combination of unmerged draft branches. Node `>=24`; Python 3.12 is used in CI for the spec inventory; a local Chromium installation is needed for browser checks. Foundry is needed for native EVM contract verification.

## Architecture / module map

The application is a static React/TypeScript/Vite **client-first** shell under [`apps/web`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/apps/web). Local encrypted vault/session/storage and schema boundaries live in [`packages`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/packages): `schemas` (strict validation), `storage` (encrypted persistence), `identity`, `nostr-crypto`, `relay`, `messaging`, `domain` (review/state/intent journal), `exchange`, `chain-evm`, `security` and other isolated modules. EVM escrow proof/tests live in [`contracts/evm`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/contracts/evm) and [`packages/escrow-evm`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/packages/escrow-evm). **Presence of a module is not evidence that it is wired into a trusted production build.**

The client-side and local-key boundary is normative: [ADR on client-side architecture](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/adr/ADR-CLIENT-SIDE-2026-10-24.md). Optional relays are untrusted, messaging does not prove settlement, and wallet/send status must fail closed on ambiguous outcomes.

## Prerequisites and local setup

```sh
node --version          # >= 24
npm ci --ignore-scripts
npm run typecheck
npm test
npm run test:specs
npm run check:specs
npm run check:boundaries
npm run test:build-policy
npm run build
npm run build:demo      # synthetic fixture, never deploy as a product
npm run test:browser
npm run test:web:browser
```

The [operator guide](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/OPERATOR.md) specifies Chromium discovery, build modes, trust-key pinning, artifacts and limitations. Additional targeted commands in [package.json](https://github.com/djshellshoxxx/p2p-offramp/blob/main/package.json) include `npm run test:evm`, `npm run test:local-evm`, `npm run test:evm:reconcile`, `npm run test:recovery:evm`, `npm run test:sepolia:trade` and `npm run acceptance:report -- candidate.json records.json`. Some require Foundry, local EVM fixtures, or explicit test-only trust inputs; never interpret success as production authorization.

## APIs, contracts and CLI

Read [`packages/schemas/index.ts`](https://github.com/djshellshoxxx/p2p-offramp/blob/main/packages/schemas/index.ts) for exported interfaces; the schema parser itself can be structural-only and **must not be treated as signature or chain authorization**. Consult [`packages/domain`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/packages/domain) for trade/review and lifecycle contracts, and [`packages/chain-evm`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/packages/chain-evm) for read-only chain integration. Wallet send/reconciliation functions are privileged boundaries: unknown broadcast outcomes remain unknown until proven otherwise; persistent send-marker and restoration/provenance work is not finished by passing CI. The acceptance-report CLI is read-only and cannot override owner review policy.

## Contribution and collaboration

Before changes, inspect [README](https://github.com/djshellshoxxx/p2p-offramp/blob/main/README.md), [development roadmap](https://github.com/djshellshoxxx/p2p-offramp/blob/main/DEVELOPMENT_ROADMAP.md), [task ledger](https://github.com/djshellshoxxx/p2p-offramp/blob/main/tasks/todo.md), open PRs and their exact head checks. Work on isolated branches and draft PRs; add failing tests for regressions, preserve a reproducible source SHA and verify changed-file ownership. Never rebase/overwrite another agent's branch or silently alter D1/D8/D9/financial policy. Use [continuation spec in PR #63](https://github.com/djshellshoxxx/p2p-offramp/pull/63) for the **proposed** ChatGPT-only lane until merged. See [Architecture and Development](Architecture-and-Development.md).

## CI, debugging and security

GitHub Actions workflows are [specifications](https://github.com/djshellshoxxx/p2p-offramp/blob/main/.github/workflows/specifications.yml), [vault foundation](https://github.com/djshellshoxxx/p2p-offramp/blob/main/.github/workflows/vault-foundation.yml), and [EVM escrow](https://github.com/djshellshoxxx/p2p-offramp/blob/main/.github/workflows/evm-escrow.yml). Inspect **exact-head** check runs rather than assuming ancestor CI qualifies the new branch. A green functional suite is not proof that Sonar, Snyk, owner approvals, or independent audit passed. When debugging, record command, environment, SHA, red/green test, workflow run URL and any dependencies unavailable in your environment. Never commit secrets, private RPC credentials, recovery material, wallet keys, or unpatched vulnerability details to public issues.

## Releases, ADRs, specs and remaining engineering work

`ReleaseEnabled=0` and the empty default approved-registry set must remain unchanged. **Do not enable real funds, merge, deploy or release** without explicit owner authorization, audited escrow/test proofs, trust pins, independent security review, D8 Tier C approval and buyer/seller acceptance. Review [security/release](Security-and-Release.md), [operator build policy](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/OPERATOR.md), [product completion specs](https://github.com/djshellshoxxx/p2p-offramp/tree/main/00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion), [roadmap](https://github.com/djshellshoxxx/p2p-offramp/blob/main/DEVELOPMENT_ROADMAP.md) and [remaining tasks](https://github.com/djshellshoxxx/p2p-offramp/blob/main/tasks/todo.md). Draft integration PR #61, D9 send-marker/provenance, D1 peer acceptance and chain/contract-wallet tests remain qualified separately. No release is claimed.
