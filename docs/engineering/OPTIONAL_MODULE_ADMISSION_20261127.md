# Optional package build admission — November 27, 2026

## Continuation decision

This work resumes the unimplemented **Needs Lane A #6** item in the
[merged Lane B handoff](../consolidation/LANE-B-PROGRESS.md). The baseline is
[`main@fdf346ab8e6aacc60b501007ec10ec7ee840a701`](https://github.com/djshellshoxxx/p2p-offramp/commit/fdf346ab8e6aacc60b501007ec10ec7ee840a701).
That main already contains #274, #276 and #277. The current
[coordinator checkpoint](https://github.com/djshellshoxxx/p2p-offramp/blob/7501b1eeb5d4957787d2582362f195779919924b/docs/engineering/CONSOLIDATION_HANDOFF.md)
still identifies this guard as a prerequisite for optional intake PRs #224–232.
Source comparison and open-PR inspection found no competing implementation.
Other workers' unpublished changes cannot be inferred from that observation.

The AST import-boundary checker already excludes statically reachable optional
packages. The missing protection is an explicit refusal in the bundler's
resolved-module admission check, which previously reached profile-specific
returns without identifying those packages. This finding does not establish
that optional code is present in a shipped core artifact.

## Implementation and scope

- `scripts/lib/optional-packages.mjs` defines one frozen inventory of the nine
  accepted reference packages: proof-inputs, liquidity, courier, arbitration,
  privacy-policy, privacy-controls, stealth, proof-jobs and meetup.
- The resolved-module check rejects complete optional package components at
  any path depth, including case variants, before offline/EVM-localnet/
  Solana-localnet admission can succeed. Refusal precedes reading that module
  or emitting a graph/policy artifact.
- The source-import checker consumes the same inventory while retaining its
  previous advanced/server exclusions.
- Existing QR decoder role separation, personalization Worker restrictions,
  permitted core privacy helpers and reviewed localnet exceptions are retained.

No optional package is imported or activated. No application, transaction,
journal, registry, contract or release-authority behavior changes. The original
optional and Lane B branches remain separate; `ReleaseEnabled=0` is preserved.

## Regression and independent review

The tests pin the nine-package set independently of the implementation list.
There are **240 refusal assertions** across 12 combinations of build profile,
document/private Worker and meta/header delivery, including root/nested copies
and two case variants. Deliberately absent optional files must produce exactly
`NON_CORE_MODULE`, rather than a source-read error, and emit nothing. Twelve
positive graph combinations preserve allowed modules and similarly named
non-package components. The existing AST fixture now covers all nine names;
prior assertions and QR tests remain present.

Against unchanged production at the baseline, the focused suite reported
53 tests: 40 passed and 13 failed (the 12 new refusal subtests and their parent).
Those expected failures attempted a file read and produced `ENOENT` instead of
the required admission refusal. On the corrected source, an independent
AI-assisted reviewer executed the artifact/import/QR selection: **53/53 passed**,
zero failures/skips/cancellations/todos. The reviewer found no actionable High,
Medium or Low issue in this bounded five-file implementation/test scope.

Reviewed Git blob identities:

| Path | Blob |
| --- | --- |
| `apps/web/scripts/static-build-plugin.mjs` | `21793f26c07187c4be8ca81c8d38bdd6663dcfc2` |
| `scripts/check-import-boundaries.mjs` | `bc7c836927b0fac0fad361cd164eab9335bd6e97` |
| `scripts/lib/optional-packages.mjs` | `38ef20d062a56d36c78619a217bffa369a9c400c` |
| `apps/web/scripts/artifact-policy.test.mjs` | `162db68530ddcce70096c1141cb46c16f9b351e1` |
| `scripts/tests/import-boundaries.test.mjs` | `56f7423c875e83511fda347ddc7386654a7d5f9c` |

Independent test log SHA-256:
`863eb2e67487bc0369a77fb99819ad653e31ceadb6f96667e3ed1294749fdc04`.

## Local qualification

Environment: Node 24.22.3, Python 3.12.14, lockfile-installed npm dependencies,
and the hash-pinned `scripts/tests/requirements-crypto.txt` oracle.

| Command / check | Result |
| --- | --- |
| `npm run typecheck` | All four configurations pass |
| `npm run check:boundaries` | Pass; 241 production files, 148 graph modules |
| `npm run test:build-policy` | 72/72 pass, no skips |
| `npm test` | 2,507 tests: 2,506 pass, one existing Foundry-dependent calldata comparison skip, zero failures |
| Python specification unit tests | 32/32 pass |
| `check:specs` | 173 documents; zero broken or unindexed references |
| `npm run test:tooling` | 57/57 pass, no skips |
| `npm run build` / `npm run build:demo` | Both pass |
| `npm run check:docs` | Engineering consistency passes; semantic approval remains false |
| `npm run check:governance` | Pass; historical/stale evidence stays explicit and economic preparation remains disabled |
| Chromium web browser suite | Not executed: the system launcher has no browser binary; the pinned Playwright browser download is blocked by HTTP 403 |
| `git diff --check` | Pass |

The initial browser environment failure is retained as a failed attempt, not
counted as execution of browser scenarios. The suite completed its artifact
builds before browser launch failed. Hosted browser qualification is required;
the blocked download is not worked around by changing dependency pins or tests.
No Foundry, Solana validator,
physical-wallet, public-cluster or release qualification is claimed locally.

## Integration gates and next work

This is **D8 Tier B tooling**. The independent review above does not replace
the accepted [CodeRabbit-or-Qodo review requirement](../adr/proposed/D8-merge-policy-and-branch-protection.md).
The published source needs its own hosted checks and that named-service review
before integration. Land this shared guard before the individual optional
intakes; this patch does not qualify their implementations or resolve their
separate findings.

The [same current handoff](../consolidation/LANE-B-PROGRESS.md) identifies the
next payment-safety issue: B1b F1, cancelled native Solana intents exhausting
the per-trade journal. It requires a bounded-retention design preserving
durable send evidence and successor relationships. #278 and #279 already own
separate Solana regression work and remain subject to their current-target
and Tier C approval gates. Freeze-authority metadata needs an explicit registry
version or signed-sidecar decision. D3 is accepted; D2 owner trust material
remains outstanding in the [accepted-decision index](../adr/ACCEPTED-DECISIONS-2026-11-04.md).
