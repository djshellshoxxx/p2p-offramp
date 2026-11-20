# Generation 7 independent navigation review

Recorded November 19 Pacific / November 20 UTC, 2026.

## Outcome and exact source

The generation 6 navigation repair is independently reproduced and verified in its stated scope. The original production files fail seven of the fifteen maintained-handler cases. The repaired files pass all fifteen. Two additional integration probes use the real draft controller, review controller, registry loader and canonical draft builder to check the generation contract used by the new navigation guard. The combined focused execution passes **30/30**, with no failures, skips or cancellations.

No new blocking finding was established in the reviewed navigation scope. This does not qualify the whole repository, a browser, native persistence or a release.

| Identity | Commit or tree |
| --- | --- |
| Original PR205 source | `cd7d54ba075118a7ec043788c17718be842ee405` |
| Reviewed draft repair | `bdadb3876c82f7ca81d003e47b5fa449d1feb1e4` |
| Reviewed final four-entry-point implementation | `7517fe457ac8110e5e21b2944074f3c84317d554` |
| Author handoff used by this fresh worker | `db9a4b53fe8cadfacca1c25eae8446a81a6a4e1b` |
| Added independent integration probes | `b43f0e42f106b2854be392bda08f7e577d4c9911` |
| Tested source tree with those probes | `d022c84b5b20474c8d7a2f5373e05961d3ba0407` |

Branch: `codex/p2p-bug-hunt-g7-20261120`.
Worktree: `/workspace/scratch/6eace968c0df/p2p-bug-hunt-g7`.

The worker read the repository consolidation handoff/state and the generation 6 bug-hunt report. No applicable `AGENTS.md` was found in the inspected workspace/repository paths. Existing release, source qualification and default-import restrictions were preserved.

## Independent source assessment

The two changed production files are `apps/web/src/ui/trade/TradeDraftPanel.tsx` and `apps/web/src/ui/trade/TradePages.tsx`.

Fresh-draft review now retains the initiating route and requires the same route, a live form, an unlocked current draft and the submitted generation before navigating. The actual controller increments its generation when draft fields or profile ownership are retired, but does not increment it during a successful review. The new guard therefore preserves a valid completed review on its initiating page while refusing results whose private draft has been replaced.

File import, synthetic-sample review and saved-favorite review retain their existing mounted-result checks and add initiating-route equality. The favorite path also preserves its current saved-record identity check. The checks introduce no automatic persistence, signing, sending, retry or native authorization.

The review also inspected the neighboring `App` hash routing, `Home` selection handoff and `RestoreForm` navigation path. Opening a restored profile remains a separate explicit button action; the restore completion does not directly navigate. No additional reproducible route-ownership defect was established in those paths during this pass.

**G6-NAV-001 remains one Low-severity navigation defect with four entry points.** The independent probes and defensive generation cases are verification coverage, not newly counted vulnerabilities.

## Executed reproduction and verification

The independent reproduction temporarily supplied the exact PR205 versions of the two production TSX files to the maintained fifteen-case regression in this isolated checkout. The files were restored in a `finally` block before testing the repair. The final production bytes remain identical to the reviewed implementation.

| Execution | Result |
| --- | --- |
| Fifteen maintained-handler cases against original PR205 production files | **8 passed, 7 failed**, zero skips/cancellations; exit 1 |
| Same cases against repaired production files | **15/15 passed**, zero skips/cancellations; exit 0 |
| New actual-controller navigation-contract probes | **2/2 passed** in the combined focused run |
| Existing template-controller suite, new probes and maintained-handler suite together | **30/30 passed**, zero skips/cancellations; `4485.299588 ms` |
| `git diff --check` | Passed |

The new probes in `apps/web/test/trade-draft-navigation-contract.test.mjs` establish that a successful real draft review returns a valid session-only review without changing the submitted generation. A separate probe retires the actual profile selection after acceptance and checks generation invalidation, removal of the owned review and zeroing of its retained private bytes. The supplied port has no persistence or transaction methods; the successful review needs none.

Commands:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 \
  apps/web/test/trade-ui-navigation-lifecycle.test.mjs

node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 \
  apps/web/test/trade-draft-navigation-contract.test.mjs \
  apps/web/test/trade-templates-controller.test.mjs \
  apps/web/test/trade-ui-navigation-lifecycle.test.mjs
```

The first suite transforms maintained TSX and executes handlers with controlled rendering hooks. It is not a DOM/browser test. The added probes execute real controllers and registry validation, but do not open an IndexedDB database or run the native Worker. Existing pinned dependencies were copied physically into this checkout; no dependency or lockfile changed.

Logs are retained under `/workspace/scratch/6eace968c0df/verification-bug-g7`:

| Log | SHA-256 |
| --- | --- |
| `navigation-original.log` | `5af6b21d33a41158f9bd16dd75d3d468dded8084a49db56aaf2b3b60fb233cc6` |
| `navigation-repaired.log` | `caf3f1850bdb5a71b69c2691bbe7df6707365a1681173094c16d15991eed464d` |
| `navigation-controller-composition.log` | `7b59703ce94c05a1a4480733a40675182fc11ec9bd834182cdad0a4cc76684f5` |

## Integration and successor handoff

The root coordinator can integrate the generation 6 production repair and these two independent regression probes. This worker did not repeat broad TypeScript, build or full-suite checks while the root's combined suite was active. Final integrated typechecking/builds and actual hosted favorites/templates/browser journeys remain required for the final source.

A successor should start from the newest integrated tree and current handoff, preserve the four positive current-route cases and the explicit profile-selection retirement contract, and pursue a distinct reproducible issue. The coordinator owns the separate Solana reconciliation investigation; the code-audit worker owns portal and IndexedDB opening. No overlap with those production paths was introduced here.

No remote ref, coordinator handoff/state, workflow, dependency pin, release flag, deployment, credential or real-funds operation was changed. The only additions are the two regression probes and this review report.
