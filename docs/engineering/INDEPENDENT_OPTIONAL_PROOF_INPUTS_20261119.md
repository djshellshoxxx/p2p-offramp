# Independent optional proof-inputs review

## Verdict and exact source

**Qualified for isolated source integration; no blocking finding identified.**
Reviewed head: `1eac87a0f604d8903daba6a26a761f005e87b89e`, based on
`ac9a4b0ffc3ca50a299398e72554e7964a634cd4`. Implementation checkpoint:
`1c27ac821e54bf782a6f1f5b1e1fee51c9792af5`.

The package subtree is exactly `8ce13a63a8df82b00cea3405d246babfe7f89746`,
matching original PR #144 head `0b681ed42330b9129502eb0097783cf5995e8382`.
The reviewer inspected and executed the pinned package worktree without changing
its source. This independently cherry-pickable commit adds this report only.

D7 permits separate optional-package source recovery with an import-boundary
check. This verdict does not authorize application composition or supply a proof
provider, circuit, source policy, settlement adapter or cryptographic verification.

## Semantics and input boundaries

The facade exposes structural parsers and local bounds. Its catalogs remain
empty, and every parsed result remains explicitly unverified: compatibility,
source authentication, semantic coverage, proof verification, receipt authority
and economic preparation are all false. Neither a successfully parsed statement
nor a `posted` string becomes a payment receipt or an authorization.

Exact own-data records and bounded dense arrays are detached before use.
Accessors, foreign prototypes, unknown keys and poisoned reflection produce fixed
errors. Error classification uses locally branded errors in a WeakMap and does
not inspect arbitrary foreign exception text or properties. Local options only
tighten their established bounds.

Witness input admits native same-realm Uint8Array views with ordinary ArrayBuffer
backing; shared, detached, proxy and subclass views are refused. Native accessors
determine actual lengths rather than hostile instance properties. Response, salt,
string and aggregate owned-byte limits are checked before owned copies. Field
spans are bounded, contained, nonoverlapping half-open ranges aligned to UTF-8
boundaries. Success returns separate owned byte buffers; partial owned buffers
are wiped after failed allocation, without wiping the caller's input.

Request comparisons bind the complete trade binding and supplied context.
Statement comparison includes all supplied expected predicate fields. These are
equality checks only: the package deliberately supplies no source authentication,
chronological freshness proof, commitment encoding or rail membership. Source
origins use canonical HTTPS spelling and reject credentials, paths, alternate
host spelling and IDN forms. They are parsed values; no URL is contacted.

## Composition and verification

Only the package and extraction report were restored, plus an additive root
`typecheck:proof-inputs` command and matching CI step. That own tsconfig checks
the facade as well as source; it does not add a runtime import. Existing commands,
dependencies and lockfiles remain unchanged. The maintained full-suite glob
already discovers the package tests.

The isolation tests check actual tracked external imports/configuration and probe
forbidden re-exports, dynamic imports and require calls. They also execute the
maintained AST boundary scanner against the actual repository and a deliberately
forbidden default-entry fixture. This is static isolation evidence, not browser
or complete emitted-bundle execution by this reviewer.

Independently executed on Node `24.22.3`, npm `11.19.1`:

| Check | Result |
| --- | --- |
| `node --import ./scripts/test-support/register-tsx.mjs --test packages/proof-inputs/test/*.test.mjs` | 21/21 passed; zero failures, cancellations or skips |
| `npm run typecheck:proof-inputs` | Passed |
| Original and extracted package subtree comparison | Exact identity |
| `git diff --check ac9a4b0..HEAD` and pinned worktree status | Passed; clean |

Evidence logs in the coordinating workspace:

| Log | SHA-256 |
| --- | --- |
| `independent-optional-proof-inputs.tap` | `4a1c64d4a554541386311c118f249215966bf2dd8aacb9e5afec06b581a39ffa` |
| `independent-optional-proof-inputs-types.log` | `1e305eb1bfb14f1b5f68a29cd70d3d9dd040f5dd119fbbc45d75ca92a7e97e00` |

The extraction author's default-build comparison and full TypeScript checks are
separate evidence and were not relabelled as this reviewer's execution. The new
PR still requires its own applicable exact-head gates. No runtime, dependency,
remote ref, deployment, release, credential or setting was changed by this review.
