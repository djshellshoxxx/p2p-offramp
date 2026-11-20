# Developer Guide

[Home](Home.md) · [User Guide](User-Guide.md)

**Status: active development.** Documentation here describes **main**, not an automatic combination of unmerged draft branches. Node `>=24`; Python 3.12 is used in CI for the spec inventory; a local Chromium installation is needed for browser checks. Foundry is needed for native EVM contract verification.

## Current development checkpoint — November 18, 2026 (Pacific; November 19 UTC)

Merged `main@bf71ca1e5e8dbdd8c1f83d5fde3c9f4f8ad8ba1e` incorporates documentation #169, EVM core #166, Solana client/recovery #167, browser trading/ERC-20 recovery #170, audit ledger #138, and same-terms unfunded resumption #175. PR #168 was closed after its complete changes were verified as incorporated through #170. #175 passed all seven D8 checks, 92 Foundry tests, and actual Chromium with isolated buyer/seller contexts, encrypted restoration, explicit same-terms resumption, and a fresh wallet review ([qualification record](https://github.com/djshellshoxxx/p2p-offramp/pull/175#issuecomment-7003052261)). ERC-20 recovery/browser #173, funded native-Solana recovery/browser #179, and consolidation documentation #176 remain **unmerged candidates**, each subject to its own checks and review.

Historical integration #61 is merged; proposed continuation spec #63 is closed without merging and remains historical guidance. The merged native and browser fixtures establish scoped original-deployment, journal, and two-party evidence. They do not cover every physical wallet/browser, native-Solana application flow, or public-network scenario. Independent security approval, SonarCloud A, and public-release qualification remain open. The live Wiki is not verified as published.

## Historical recorded development checkpoint — November 18, 2026

This guide is scoped to merged `main@6c38e641e24abcfdcf645f864bd64c9645836d75`. The
[documentation reconciliation](../consolidation/2026-11-18-documentation-reconciliation.md)
separates merged D1, QR/release-trust, Solana consent, canonical EVM reader and formal
tooling from draft wallet/localnet/native-recovery/browser stack #166–#168. Read those
exact heads before duplicating their work. Older PR-specific examples below retain
their historical source scope and do not describe the current open/merged inventory.

The merged development-only formal classifier suite is `npm run test:formal:unit`.
Its [runner documentation](../../scripts/formal/README.md) explains tool pins, bounded
native/solver evidence, `PROOF_UNKNOWN` and the retained model gap. Passing its tests
is not a formal proof or a release approval.

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

Read [`packages/schemas/index.ts`](https://github.com/djshellshoxxx/p2p-offramp/blob/main/packages/schemas/index.ts) for exported interfaces; the schema parser itself can be structural-only and **must not be treated as signature or chain authorization**. Consult [`packages/domain`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/packages/domain) for trade/review and lifecycle contracts, and [`packages/chain-evm`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/packages/chain-evm) for read-only chain integration. Wallet send/reconciliation functions are privileged boundaries: unknown broadcast outcomes remain unknown until proven otherwise; passing CI establishes only its explicitly exercised persistent-marker and restoration/provenance scenarios. The acceptance-report CLI is read-only and cannot override owner review policy.

## Reproducing D9 recovery acceptance without live funds

From a Node 24+ checkout with the pinned dependencies, the **focused journal suite** is:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test packages/domain/test/intent-journal.test.mjs
```

The command is directly supported by the repository's `scripts/test-support/register-tsx.mjs` and `npm test` harness. Existing merged tests cover journal persistence, fresh-key recovery, CAS, and conservative broadcast-unknown handling. The **unmerged** [draft D9 recovery tests](Security-and-Release.md#d9-encrypted-recovery-state-evidence-draft-only), including [PR #92](https://github.com/djshellshoxxx/p2p-offramp/pull/92), extend synthetic account/network nonce isolation. [Draft PR #93](https://github.com/djshellshoxxx/p2p-offramp/pull/93) further proposes two *independently unlocked sessions racing after fresh-key restore* (test-only head `e8afa6af3db9ac9575f57beaef61886e3b79683a`); **its seven exact-head hosted Actions jobs now pass** ([Vault foundation #43060217241](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/43060217241), [EVM escrow #43060217559](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/43060217559), [Specification inventory #43060217508](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/43060217508)); the schemas-and-crypto logs record the named regression passing. This is synthetic draft test qualification, not native provenance or an approved release.

For this test class, confirm the original pending transaction keeps its hash and nonce, a conflicting same-account/network reservation fails without overwriting evidence, only one independent concurrent reservation can win CAS, and a restored journal supplies **no signing or send method**. Record the exact code SHA, test invocation, Node environment and hosted workflow links; compare failing and corrected heads when relevant. Tests with a fixture validator or simulated storage are **not** native-chain provenance, buyer/seller acceptance, a source-of-funds audit or permission to retry an ambiguous send. No locally executed test result is claimed by this documentation addition.

## Contribution and collaboration

Before changes, inspect [README](https://github.com/djshellshoxxx/p2p-offramp/blob/main/README.md), [development roadmap](https://github.com/djshellshoxxx/p2p-offramp/blob/main/DEVELOPMENT_ROADMAP.md), [task ledger](https://github.com/djshellshoxxx/p2p-offramp/blob/main/tasks/todo.md), open PRs and their exact head checks. Work on isolated branches and draft PRs; add failing tests for regressions, preserve a reproducible source SHA and verify changed-file ownership. Never rebase/overwrite another agent's branch or silently alter D1/D8/D9/financial policy. The [continuation spec in closed, unmerged PR #63](https://github.com/djshellshoxxx/p2p-offramp/pull/63) is historical advisory source; follow the owner's current, separately authorized zero-Codex instructions rather than treating that PR as awaiting merge. See [Architecture and Development](Architecture-and-Development.md).

## CI, debugging and security

GitHub Actions workflows are [specifications](https://github.com/djshellshoxxx/p2p-offramp/blob/main/.github/workflows/specifications.yml), [vault foundation](https://github.com/djshellshoxxx/p2p-offramp/blob/main/.github/workflows/vault-foundation.yml), and [EVM escrow](https://github.com/djshellshoxxx/p2p-offramp/blob/main/.github/workflows/evm-escrow.yml). Inspect **exact-head** check runs rather than assuming ancestor CI qualifies the new branch. A green functional suite is not proof that Sonar, Snyk, owner approvals, or independent audit passed. When debugging, record command, environment, SHA, red/green test, workflow run URL and any dependencies unavailable in your environment. Never commit secrets, private RPC credentials, recovery material, wallet keys, or unpatched vulnerability details to public issues.

## Releases, ADRs, specs and remaining engineering work

`ReleaseEnabled=0` and the empty default approved-registry set must remain unchanged. Source integration follows the accepted [D8 tiered merge policy](../adr/proposed/D8-merge-policy-and-branch-protection.md): all seven required checks, the applicable automated-review requirement for Tier B, and explicit owner approval for Tier C. The owner's current consolidation directive authorizes reviewed, qualified source merges subject to those gates. Public deployment, real funds, production trust changes, and release require separate authorization and release qualification.

Review [security/release](Security-and-Release.md), [operator build policy](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/OPERATOR.md), [product completion specs](https://github.com/djshellshoxxx/p2p-offramp/tree/main/00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion), [roadmap](https://github.com/djshellshoxxx/p2p-offramp/blob/main/DEVELOPMENT_ROADMAP.md) and [remaining tasks](https://github.com/djshellshoxxx/p2p-offramp/blob/main/tasks/todo.md). Existing two-party, D9, and native-chain proofs retain their exact source and fixture scope; broader wallet/chain compatibility and independent security approval remain outstanding. No release is claimed.
