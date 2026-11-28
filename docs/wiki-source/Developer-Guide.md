# Developer Guide

[Home](Home.md) · [User Guide](User-Guide.md)

**Status: active development.** Documentation here describes **main**, not an automatic combination of unmerged draft branches. Node `>=24`; Python 3.12 is used in CI for the spec inventory; a local Chromium installation is needed for browser checks. Foundry is needed for native EVM contract verification.

## Source checkpoint — November 20, 2026 UTC

This guide describes merged `main@388526a474aea0e08f9c04178c2b7f9e1d4bee3f`. The
[generation 17 source-consolidation record](../engineering/CONTINUATION_GENERATION17_20261120.md)
identifies the corrected implementation merged through PR221, its exact source tree,
hosted check results and retained failed predecessor. PR222 then incorporated the
canonical engineering documentation. Those recorded checks qualify their named
source and fixtures; they are not new executions by this documentation update.

The merged source includes selected-file backup verification, its explicit revision
recheck, the optional signed-update view and public Solana recovery-document export.
The default static shell, synthetic demo, EVM localnet client and Solana localnet
client retain separate build and trust boundaries. Full Solana negotiation/funding,
trusted update composition, physical-device acceptance and independent security and
release approval remain unfinished. `ReleaseEnabled=0`.

The [November 18 reconciliation](../consolidation/2026-11-18-documentation-reconciliation.md)
describes its historical `main@6c38e641e24abcfdcf645f864bd64c9645836d75` checkpoint,
including the then-unmerged #166–#168 stack. Its dated inventory and the PR-specific
receipts below must not be read as today's open/merged branch list. The retained
[PR178 documentation head](https://github.com/djshellshoxxx/p2p-offramp/commit/4eead2af05e3e301b9e05cc9023a63047ef6dcdf)
informed the distinction between source integration, scoped test evidence and
release qualification; its older branch-status snapshot was not adopted.

The merged development-only formal classifier suite is `npm run test:formal:unit`.
Its [runner documentation](../../scripts/formal/README.md) explains tool pins, bounded
native/solver evidence, `PROOF_UNKNOWN` and the retained model gap. Passing its tests
is not a formal proof or a release approval.

## Architecture / module map

The application is a static React/TypeScript/Vite **client-first** shell under [`apps/web`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/apps/web). Local encrypted vault/session/storage and schema boundaries live in [`packages`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/packages): `schemas` (strict validation), `storage` (encrypted persistence), `identity`, `nostr-crypto`, `relay`, `messaging`, `domain` (review/state/intent journal), `exchange`, `chain-evm`, `security` and other isolated modules. EVM escrow proof/tests live in [`contracts/evm`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/contracts/evm) and [`packages/escrow-evm`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/packages/escrow-evm). **Presence of a module is not evidence that it is wired into a trusted production build.**

The client-side and local-key boundary is normative: [ADR on client-side architecture](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/adr/ADR-CLIENT-SIDE-2026-10-24.md). Optional relays are untrusted, messaging does not prove settlement, and wallet/send status must fail closed on ambiguous outcomes.

## Current recovery and update boundaries

| Workflow | Maintained source at this checkpoint | Integration boundary |
| --- | --- | --- |
| Selected-file backup authentication | [Recovery form](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/ui/BackupVerificationForm.tsx) and [vault service](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/packages/storage/src/vault-service.ts) | Requires the selected unlocked profile, complete bounded file and its passphrase; does not restore or write |
| Fresh verification recheck | [Worker endpoint](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/runtime/worker-endpoint.ts) | Uses the held receipt for the exact selection/generation and a fresh persisted-envelope check; imported receipts have no authority |
| Fresh-key restore | [Backup service](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/packages/storage/src/backup-service.ts) and [vault forms](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/ui/VaultForms.tsx) | Creates a distinct locked profile; does not replace an existing profile, attest chain state or verify the new profile's future backup |
| Public Solana recovery export | [Localnet UI](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/solana-localnet/SolanaLocalnetRoot.tsx) and [controller](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/solana-localnet/controller.ts) | Read-only export of the retained canonical public document for one escrow; isolated from the default/demo builds |
| Optional signed-update review | [App composition](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/ui/App.tsx) and [Settings panel](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/ui/SignedUpdatePanel.tsx) | Optional controller defaults to null; the default entry does not construct an updater |

The backup check compares the selected file's encrypted envelope with the live
session and persisted row, authenticates its complete snapshot with the supplied
passphrase, compares the snapshot and re-reads storage before returning. The receipt
binds the profile ID, revision, complete-profile scope, canonical-envelope hash and
whole-file hash. **Recheck verified revision** calls the maintained freshness check;
it does not re-read the user's file. Lock, selection changes and runtime restart
retire the held fact. A new profile produced by restore needs a new export and
verification. Export alone remains explicitly unchecked.

The Solana Worker command `recovery.export` returns only the retained public document
under the existing 16 KiB limit after confirming the open profile is current. It
adds no private journal, profile wrapper, signatures or private agreement text.
It makes no additional RPC or wallet call, writes no durable data and does not
refresh chain state or replace the encrypted private backup. The existing localnet
recovery client handles funded exits only; a document export adds no negotiation
or funding authority.

The signed-update panel is a view over an optional trusted controller. With no
controller, checking is disabled and opening Settings performs no update operation.
With an injected controller, the user explicitly checks, reviews release identities
and assets, gives consent and confirms an origin transition. The view does not
construct trust, transport, wallet, backup or navigation services. The
[recorded composition requirements](../engineering/SIGNED_UPDATE_UI_GENERATION13_20261120.md),
including a runtime-owned lease that recognizes the controller's own profile lock,
remain open. The default graph does not import the executable updater constructor,
HTTP adapter or accepted-state store. No production configuration is supplied here.

For exact user-facing labels and limitations, use [User Guide](User-Guide.md),
[Privacy and Recovery](Privacy-and-Recovery.md) and the
[English catalog at this checkpoint](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/ui/locale/en.ts).
The catalog is draft English source; these instructions do not certify translations.

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

Read [`packages/schemas/index.ts`](https://github.com/djshellshoxxx/p2p-offramp/blob/main/packages/schemas/index.ts) for exported interfaces; the schema parser itself can be structural-only and **must not be treated as signature or chain authorization**. Consult [`packages/domain`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/packages/domain) for trade/review and lifecycle contracts, and [`packages/chain-evm`](https://github.com/djshellshoxxx/p2p-offramp/tree/main/packages/chain-evm) for read-only chain integration. Wallet send/reconciliation functions are privileged boundaries: unknown broadcast outcomes remain unknown until proven otherwise; passing CI establishes only the explicitly exercised persistent-marker and restoration/provenance scenarios. The acceptance-report CLI is read-only and cannot override owner review policy.

## Focused journal checks and historical D9 receipts

The commands below remain useful for the local journal boundary. The PR92/PR93
descriptions and exact-head receipts are retained historical observations; their
draft/unmerged labels describe that recorded snapshot, not the current branch census.

From a Node 24+ checkout with the pinned dependencies, the **focused journal suite** is:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test packages/domain/test/intent-journal.test.mjs
```

The command is directly supported by the repository's `scripts/test-support/register-tsx.mjs` and `npm test` harness. Existing merged tests cover journal persistence, fresh-key recovery, CAS, and conservative broadcast-unknown handling. The **unmerged** [draft D9 recovery tests](Security-and-Release.md#d9-encrypted-recovery-state-evidence-draft-only), including [PR #92](https://github.com/djshellshoxxx/p2p-offramp/pull/92), extend synthetic account/network nonce isolation. [Draft PR #93](https://github.com/djshellshoxxx/p2p-offramp/pull/93) further proposes two *independently unlocked sessions racing after fresh-key restore* (test-only head `e8afa6af3db9ac9575f57beaef61886e3b79683a`); **its seven exact-head hosted Actions jobs now pass** ([Vault foundation #43060217241](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/43060217241), [EVM escrow #43060217559](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/43060217559), [Specification inventory #43060217508](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/43060217508)); the schemas-and-crypto logs record the named regression passing. This is synthetic draft test qualification, not native provenance or an approved release.

For this test class, confirm the original pending transaction keeps its hash and nonce, a conflicting same-account/network reservation fails without overwriting evidence, only one independent concurrent reservation can win CAS, and a restored journal supplies **no signing or send method**. Record the exact code SHA, test invocation, Node environment and hosted workflow links; compare failing and corrected heads when relevant. Tests with a fixture validator or simulated storage are **not** native-chain provenance, buyer/seller acceptance, a source-of-funds audit or permission to retry an ambiguous send. No locally executed test result is claimed by this documentation addition.

## Contribution and collaboration

Before changes, inspect [README](https://github.com/djshellshoxxx/p2p-offramp/blob/main/README.md), [development roadmap](https://github.com/djshellshoxxx/p2p-offramp/blob/main/DEVELOPMENT_ROADMAP.md), [task ledger](https://github.com/djshellshoxxx/p2p-offramp/blob/main/tasks/todo.md), open PRs and their exact head checks. Work on isolated branches and draft PRs; add failing tests for regressions, preserve a reproducible source SHA and verify changed-file ownership. Never rebase/overwrite another agent's branch or silently alter D1/D8/D9/financial policy. The [continuation proposal in PR #63](https://github.com/djshellshoxxx/p2p-offramp/pull/63) is historical guidance, not the current integration inventory. See [Architecture and Development](Architecture-and-Development.md) and the [source-consolidation record](../engineering/CONTINUATION_GENERATION17_20261120.md).

For a documentation-only change, check the actual UI labels and source at the named
commit, run `npm run check:docs`, `npm run check:specs` and `git diff --check`, and
record the changed-file scope. Document and local-link digests are integrity
bookkeeping. Keep claim evidence, its immutable source commit, reviewers and
approvals separate; a passing documentation check does not provide semantic
approval, current-source claim qualification or Wiki publication.

## CI, debugging and security

GitHub Actions workflows are [specifications](https://github.com/djshellshoxxx/p2p-offramp/blob/main/.github/workflows/specifications.yml), [vault foundation](https://github.com/djshellshoxxx/p2p-offramp/blob/main/.github/workflows/vault-foundation.yml), and [EVM escrow](https://github.com/djshellshoxxx/p2p-offramp/blob/main/.github/workflows/evm-escrow.yml). Inspect **exact-head** check runs rather than assuming ancestor CI qualifies the new branch. A green functional suite is not proof that Sonar, Snyk, owner approvals, or independent audit passed. When debugging, record command, environment, SHA, red/green test, workflow run URL and any dependencies unavailable in your environment. Never commit secrets, private RPC credentials, recovery material, wallet keys, or unpatched vulnerability details to public issues.

## Releases, ADRs, specs and remaining engineering work

`ReleaseEnabled=0` and the empty default approved-registry set remain unchanged.
Authorized source consolidation follows the applicable [D8 merge policy](../adr/proposed/D8-merge-policy-and-branch-protection.md)
and current-head review/check requirements. Source integration does not authorize
real funds, production trust changes, deployment or release. Those require their
separate owner decisions and release qualifications.

Review [security/release](Security-and-Release.md), [operator build policy](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/OPERATOR.md), [product completion specs](https://github.com/djshellshoxxx/p2p-offramp/tree/main/00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion), [roadmap](https://github.com/djshellshoxxx/p2p-offramp/blob/main/DEVELOPMENT_ROADMAP.md) and [remaining tasks](https://github.com/djshellshoxxx/p2p-offramp/blob/main/tasks/todo.md). Existing D1, D9, two-party and native-chain evidence retains its original source and fixture scope. Broader wallet/chain compatibility, physical devices, trusted update composition, full Solana negotiation/funding and independent security approval remain separate unfinished work. No release or live Wiki publication is claimed.
