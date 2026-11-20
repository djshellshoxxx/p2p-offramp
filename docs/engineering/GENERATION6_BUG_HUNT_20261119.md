# Generation 6 bug hunt: asynchronous review navigation

## Source and scope

- Parent: current core PR205, `cd7d54ba075118a7ec043788c17718be842ee405`.
- Draft repair: `bdadb3876c82f7ca81d003e47b5fa449d1feb1e4`.
- Final implementation and regression source: `7517fe457ac8110e5e21b2944074f3c84317d554`.
- Branch: `codex/p2p-bug-hunt-g6-20261120`.
- Author worktree: `/workspace/scratch/6eace968c0df/p2p-bug-hunt-g6`.
- Recorded November 19 Pacific / November 20 UTC, 2026.

This worker read the current consolidation handoff/state and inspected the template and favorites document controllers, their UI callbacks, and the Solana restore input lifecycle. The implemented change is limited to asynchronous navigation ownership in the maintained trade UI. The coordinator owns branch integration and complete current-source qualification.

## G6-NAV-001: a late review can override a newer user route

**Severity: Low. Reproduced and repaired in the scoped source.**

Start a review, choose another application route before the review completes, and then allow the old operation to finish. The fresh draft form unconditionally navigated to the returned trade ID, including after unmount. The file, synthetic-sample and saved-favorite callbacks already checked whether their component was mounted, but could still replace a newly selected hash before React's unmount cleanup ran.

The controlled maintained-handler regression observed `#/trade/AAAAAAAAAAAAAAAAAAAAAA` after the user had selected `#/settings` or `#/recovery`. This is one navigation-ownership defect with four entry points. It is not a demonstrated funds, persistence, or authorization bypass.

The repair captures the initiating hash and requires that the current hash still matches before navigation. The draft form also retains a mount guard and checks that the profile is unlocked and its draft generation has not changed. Existing favorite record identity, current-registry validation and mounted checks remain. No request is automatically retried, and no successful review is implicitly persisted or submitted.

Changed production files:

- `apps/web/src/ui/trade/TradeDraftPanel.tsx`
- `apps/web/src/ui/trade/TradePages.tsx`

Native stores, controller contracts, schema, Worker commands, wallet code, financial tests, dependency pins, release flags and network authority are unchanged.

## Reproduction and executed checks

The regression transforms the actual maintained TSX using the pinned Vite transform and executes its event handlers with render-only hooks and controlled asynchronous review responses. It explicitly selects the draft consent controls before invoking the form. It covers current positive navigation, unmount, route changes before cleanup, draft generation retirement, lock and rejected/cancelled outcomes.

This is a component lifecycle test, **not DOM, browser, native Worker or IndexedDB execution**. Draft generation and lock cases provide an additional UI guard; the existing controller already rejects many retired outcomes, so these are not counted as separate product findings.

| Execution | Actual result and scope |
| --- | --- |
| Initial five draft lifecycle cases against original source | RED: 2 passed, 3 failed |
| Added hash-change-before-cleanup case against mount-only repair | RED: 5 passed, 1 failed |
| Expanded file/sample/favorite cases before their repair | RED: 12 passed, 3 failed |
| Final maintained-handler navigation suite | **15/15 passed**, zero failures, skips or cancellations, on final source |
| Templates, favorites and review-controller affected suite at draft repair | **103/103 passed**, zero failures, skips or cancellations; before the final sibling callback change |
| Build-policy suite | **57/57 passed**; completed during the navigation-only repair sequence |
| Initial draft repair type/build checks | Four TypeScript projects, import boundaries (238 production files / 142 core modules), default build and demo build passed before the final hash/sibling additions |
| Final type/build retry | TypeScript was terminated with **SIGKILL / exit 137** under shared execution load; the chained builds did not run. This is not a typecheck or build pass for the final source. |
| Whitespace validation | `git diff --check` passed |

The final narrow regression command is:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  apps/web/test/trade-ui-navigation-lifecycle.test.mjs
```

The affected suite executed before the sibling callback addition used:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  apps/web/test/trade-templates-*.test.mjs \
  apps/web/test/saved-review-favorites-*.test.mjs \
  apps/web/test/review-controller.test.mjs \
  apps/web/test/saved-reviews-controller.test.mjs
```

The navigation test was subsequently renamed from `trade-templates-ui-lifecycle.test.mjs` to `trade-ui-navigation-lifecycle.test.mjs`. Include its current name explicitly in a focused rerun. The repository's normal `apps/web/test/*.test.mjs` full-suite glob includes it automatically.

### Local evidence digests

Logs are scratch evidence under `/workspace/scratch/6eace968c0df`; the source, tests and this report are committed. These hashes identify the author's actual observations, not a substitute for source-bound CI or independent review.

| Log | SHA-256 |
| --- | --- |
| `p2p-template-navigation-red.log` | `046a310f1df38b239830b317e41e309a0d7aac30ee0a4988dcb3296afbfd6da6` |
| `p2p-template-route-race-red.log` | `5b22637a541e23d782a2a0f98807f24c8ad3f59efe23d5f0cb624b8776d77959` |
| `p2p-review-entry-route-red.log` | `d295020cb2454924c61df2bdab9926e8a18a4e2d2efba98942aaecc42b4a2792` |
| `p2p-review-entry-route-green.log` | `ce09db60a1fce3410a739fac13a3cb662f59e5c11bb7f5f72e6b8b436ece2a16` |
| `p2p-bug-g6-focused-final.log` | `99e6685b821733d6692d133d8ee262b243fabd4c411c051c0cc161a505bcf780` |
| `p2p-bug-g6-policy-final.log` | `18972eaf7dcbb044ebac3fe67c297a54c4cb16b76d0a5b8900ab21051dffa3be` |

## Fresh successor handoff

1. Independently review final implementation `7517fe4` and the preserved controller checks. Verify the final regression suite, including current successful navigation and all three existing entry points.
2. Qualify the coordinator's actual composed tree with the four TypeScript projects, relevant builds, affected tests and hosted template/favorites/browser journeys. Serialize heavy checks while the coordinator's full optional-source suite is active; the author observed a shared-resource termination.
3. Keep the exact-source hosted browser/native gates. No local Chromium execution is claimed here, and prior component passes do not qualify a changed integration tree.
4. Continue bug hunting from the newest source and state. Additional independent scrutiny of asynchronous form navigation and current-route ownership is a useful next scope; do not count these four manifestations as four independent security vulnerabilities.

No additional reproduced High or Medium finding remains open in this narrow reviewed scope. This is not a claim of complete repository security or release readiness. No remote ref, coordinator handoff/state, deployment, release, credentials or real-funds operation was changed by this worker.
