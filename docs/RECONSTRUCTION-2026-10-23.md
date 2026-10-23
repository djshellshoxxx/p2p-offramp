# Noncustodial reconstruction plan and evidence

This checkout is local reconstruction in the existing shared GhostPay environment. No missing historical
checkpoint or historical test result has been restored or reused as current evidence. No publication is authorized.

## Verified remote intake

Read-only GitHub repository/branch/open-PR queries and `git ls-remote` on 2026-10-23 established:

| Reference | Verified head | Disposition |
|---|---|---|
| main | `28bc32f1c8ea98d6216b2e1509b1fb5e3374bcfa` | roadmap/spec scaffold; ancestor of PR2 |
| PR2, docs/spec-readiness-and-foundations | `6b6004bdf35b7aea14530f965756ca6d54336682` | open draft; selected noncustodial foundation, 61 commits ahead of main |
| PR1, docs/security-spec-expansion-20261021 | `0ea82ded188ed7392622616f28a1cf33c87c2ed8` | open; ancestor of PR2, three commits behind |
| feat/custodial-ledger-foundation | `52e6987e77d9ef6bc403c0129b3f52531986ade8` | incompatible custodial design; preserved, not merged |

Local directory `/workspace/p2p-offramp`; branch `integration/noncustodial-reconstruction-2026-10-23`.
The checkout was clean. No AGENTS.md was found. Read README, development status, roadmap, foundation plan,
G02 encrypted storage, G07 frontend, G08 state authority, G10 wallet boundary and G13 error contracts.

Remotely recoverable authored runtime foundation: `packages/schemas/src/vault.ts` and
`packages/storage/src/vault-crypto.ts`, with tests and interoperability fixture. Legacy reference adapters
elsewhere in the spec tree are not an integrated application. The unpublished `fb9d8c7...`/`5a732cf...`
checkpoints are not part of fetched branch history and are not claimed recovered. Assess any separately
recovered source before integrating it; do not blindly merge it.

## Fresh baseline evidence

Node 24.19.0 and Python 3.12 are available. Frozen npm install with writable `/workspace/.npm-cache` passed.
On unmodified `6b6004b`, the following passed freshly:

- `npm test`: 37 passed, zero failed/cancelled/skipped.
- `npm run typecheck`: strict TypeScript 7.0.2, exit 0.
- `npm run test:specs`: 11 passed.
- `npm run check:specs`: 173 documents, zero broken links or unindexed documents.

These establish the existing schema/crypto/spec-tool baseline only. They do not establish persistence,
identity/recovery, UI, wallet support, trading, browser/device interoperability or independent security review.

## Ordered execution plan

**Goal:** implement the next noncustodial foundations using current contracts and fresh tests.
**Architecture:** storage service reuses G02 schema/native crypto and adds exact-ciphertext IndexedDB CAS;
pure domain modules separate authenticated chain observations from local/relay/fiat claims. Error/retry
normalization never resubmits economic actions. ReleaseEnabled remains 0 and wallet signing/submission gated.
**Stack:** strict TypeScript, native Web Crypto/IndexedDB, Node built-in tests and local Chromium where needed.

Global constraints: same active environment; two implementation workers per repo plus one shared integrator.
No real funds, live submission, production actions, external target scans, credentials, paid infrastructure,
pushes, PR mutations, release publication or deployment. Preserve existing work and OSS notices.

Review focus: stale async unlock/commit after lock; same-revision ciphertext replacement; untrusted source
promoted to chain truth; old generation/out-of-order reconciliation; retries after possible economic submission.

1. [x] Verify access, live refs/PRs and ancestry; select PR2 instead of defaulting to main; run fresh baseline checks.
2. [ ] Storage worker (after safe GhostPay checkpoint): read full G02/G03/G09 contracts; implement
   `packages/storage/src/vault-service.ts` and `idb-vault-store.ts`, plus focused Node and real-browser tests.
   Consume existing `createEnvelope`, `openEnvelope`, `encryptRevision`, `disposeMaterial` and validators.
   Provide G02 create/unlock/read/list/commit/lock/lockAll/exportEncrypted; exact ciphertext precondition
   plus revision inside one readwrite transaction; cancellation/generation guards; fixed errors and copies.
   Do not add identity/UI/recovery bypasses or writable reuse of imported keys. Add G03 fresh-key recovery only
   after the storage slice passes and its exact specification is reconciled.
3. [ ] Domain worker (after safe GhostPay checkpoint): read full G08/system-context/observation-envelope/G13
   contracts; implement `packages/domain/src/authority.ts`, `errors.ts`, `read-retry.ts` and disjoint schema
   files if needed, plus Node regressions. Enforce source authority, generation/latest-sequence and reorg
   blocking. Retry only idempotent reads under exact documented attempt/time/jitter budgets; all economic
   calls remain disabled. Do not implement network/registry/deployment trust by assertion.
4. [ ] Shared integrator inspects diffs and targeted red/green evidence; commits each verified tranche locally.
   Freeze each repo before broad tests. Run Node/Python/typecheck/spec checks and actual browser storage tests;
   inspect errors without reducing thresholds or skipping failures. Record gates G07/G10/G11/G12/G15 still open.
5. [ ] Continue feasible next slices only after their dependencies are verified. Store exact branch/HEAD,
   tests/failures/next task in handoff, and create verified full-history bundles with SHA-256 for parent-managed
   approved persistence. Local unuploaded files are not durable delivery.

## Current allocation

Four existing implementation workers plus one integrator total. Two finish their current GhostPay writes/tests
before transitioning here; two remain on GhostPay. No extra cloud environment or duplicate worker team created.
The parent continuation timer targets this same task and will cover both repositories.

## Verified domain tranche and first combined check

On frozen G02/G08/G13 working source, integrator `npm test` passed 89 Node tests with zero failed,
cancelled or skipped; strict typecheck, 11 Python spec-tool tests, the 173-document audit and real
Chromium storage checks also passed. Subsequent adapter review found retry/disposal/error-mapping bugs;
those fixes require another complete check before the storage tranche is promoted.

The domain/schema tranche itself passed 31 focused tests, including 10,000 deterministic malformed inputs,
latest-issued/generation/context authority, exact 30-second display freshness, source/fiat separation,
reorg conflict latching and bounded read retry. Cross-review reproduced a pending-controller collision across
generations; controller identity now retains a hard four-outstanding-reader bound even if adapters ignore abort.
Old completion cannot delete the newer job's cancellation handle. Fixed errors discard foreign messages/stacks;
read retries retain the documented three-attempt, 10-second attempt and 35-second operation ceilings.
Unsettled noncancellable reads do not overlap a retry.

This is a partial G08/G13 foundation, not completion of their product gates. Relay/journal payload schemas,
full CTX02 dispatch, durable G12 pending intents, native EVM/Solana adapters, network/registry validation,
frontend/runtime integration and manifest/release trust remain unimplemented. The Solana fixture checks only
structural binding/decimal heights. `RELEASE_ENABLED = 0`; economic preparation always returns false.
No signing/submission interface or enabled production adapter is present.

## Verified G02 persistence tranche

Final frozen source: integrator `npm test` passed 98/98 Node tests, with zero failed/cancelled/skipped;
strict typecheck passed. Real Chromium rerun passed encrypted persistence, same-revision two-tab conflict,
exact ciphertext CAS, stale-session transaction abort, lock/reopen, versionchange session revocation,
unsupported-future-version preservation and terminal disposal, with zero external egress.
The Python/spec checks and independent crypto fixture remain passing from the preceding frozen pass;
these tools did not change. No browser/device/UI or professional-audit acceptance is inferred.

Review fixed rejected-open caching (explicit retry after remediation now works), terminal owned-connection
close (shared injected stores remain caller-owned unless ownership is transferred), and synchronous quota/
storage errors wrongly labeled cancellation. Nine injected-IDB tests exercise these faults. Twenty-one service
tests cover bounded mutations, exact envelope preconditions, cancellation/lock at crypto/storage boundaries,
defensive copies, quota cache preservation and commit-winning outcomes. No automatic write retry or plaintext
fallback exists. All prior reviewed source is locally committed; G03/G09 and application integration stay open.
