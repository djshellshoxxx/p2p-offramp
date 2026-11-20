# Historical signed asset-update source extraction

## Scope and exact source

This successor read the consolidation handoff and continued from published source
`84814328f5534d6fceb2bbe74509fe37c5b48689`, without modifying the coordinator's
working tree or any remote ref.

The retained update implementation is distinct from the already-merged offline
release/registry verifier. It adds bounded discovery, complete asset verification,
an origin-local rollback floor and an explicit backup/wallet-gated transition to
the signed destination. It remains internal and unexported. No default App,
public runtime protocol, trust key, endpoint, gateway or production update UI is
changed. `ReleaseEnabled=0` remains unchanged.

Selected historical source:

- PR #81 branch `claude/vibrant-cray-ny4gum`, head
  `a45e932a37153590bc329c1e9012cf18e37fe12c`, supplies the internal HTTP/store/controller,
  parser-only helpers and update/encoding tests. Its transport port types already
  match the current facade; no obsolete transport export was restored.
- Historical fix `f5b12c6a4a6e59a28b5f522d868bc0c90a4e6532` classifies malformed detached
  envelope bytes as untrusted content instead of a retryable network outage.
- Source/regression checkpoint:
  `8f510855071515a0cbec42bb3b3619299c04acf5` preserves the extracted implementation
  and new lifecycle tests before the store repair.

The extraction does not merge the old branch wholesale. Historical EVM execution,
content-policy and acceptance-test differences were deliberately excluded because
the current integration already contains newer implementations. The native browser
composition remains in its historical branch and needs separate adaptation.

## Reproduced defects and correction

The original accepted-release store cached its opening Promise permanently. A
failed or blocked request therefore prevented a later explicit retry even after
the browser/storage problem was resolved. A synchronous `IDBFactory.open` failure
also exposed its raw exception, and terminal `close()` left the pending Promise
unsettled until a native event arrived. The latter could strand an update job.

Six focused lifecycle/rollback tests were added. Against original store blob
`7e015bbc6c3642018802a48914d76edaa5e8d99a`, two passed and four failed with the
expected retry, late-request, fixed-error and pending-close assertions. There were
no skips or cancellations. The correction:

1. Evicts only the failed opening attempt from its connection slot.
2. Normalizes synchronous failures to `STORAGE_UNAVAILABLE`.
3. Rejects pending open callers when the store is terminally closed.
4. Closes stale native success results without replacing a newer connection.

The rollback record is not deleted, reset or rewritten by these lifecycle paths.
The tests also preserve strict transaction durability, idempotence, monotonic
sequence, conflict handling, foreign-row refusal and stale-authority refusal.

Runtime correction commit:
`d73d6e09c68a482d56cd37b2c809869b473e656b`.
Tested source tree: `76fae887da972700056dc013ff2b4ec86f3d20eb`.

## Executed verification

Runtime: Node `24.22.3`, npm `11.19.1`. A fresh `npm ci --ignore-scripts` succeeded
in this worktree; dependencies were not symlinked from another repository.

| Check | Actual result |
|---|---|
| Existing update, encoding and release-verifier tests before the new store repair | 106/106 passed |
| New lifecycle tests on original store | 2 passed, 4 expected failures |
| Same lifecycle tests after repair | 6/6 passed |
| All security tests plus transport policy/HTTP suites | 215/215 passed |
| All four TypeScript projects | Passed |
| Import boundaries | Passed, 228 production source files / 140 visited core modules |
| Default static build | Passed |
| Build-policy tests | 54/54 passed |
| Actual emitted document, vault Worker and QR Worker graphs | No release-update module present |
| `git diff --check` | Passed |

Reproduce the combined focused suite:

```sh
npm ci --ignore-scripts
node --import ./scripts/test-support/register-tsx.mjs --test \
  packages/security/test/*.test.mjs \
  packages/transport/test/policy.test.mjs \
  packages/transport/test/http-*.test.mjs
npm run typecheck
npm run check:boundaries
npm run build
npm run test:build-policy
```

To reproduce the RED checkpoint, run only
`packages/security/test/release-update-store.test.mjs` at the regression checkpoint;
the subsequent repair is expected to turn those four failures green. Logs were
retained in the session scratch directory as `asset-update-store-red.log`,
`asset-update-store-green.log`, `asset-update-qualified.log`,
`asset-update-types-final.log`, `asset-update-boundaries.log`,
`asset-update-build.log` and `asset-update-build-policy.log`.

## Remaining gates

This report is an implementing-worker assessment, not an independent review.
The coordinator should obtain a fresh source review and test the combined branch.
Native browser/IndexedDB execution was not performed for this extraction; lifecycle
tests explicitly model native event order. No real IPFS gateway, physical wallet,
public release root, key rotation, nonempty deployment manifest or production
navigation policy is qualified. An internal source implementation does not complete
the user-facing asset-update feature or authorize enabling it.
