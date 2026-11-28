# Optional arbitration source qualification — November 19, 2026

## Provenance and scope

- Integration base: `ac9a4b0ffc3ca50a299398e72554e7964a634cd4`.
- Retained candidate: [PR #147](https://github.com/djshellshoxxx/p2p-offramp/pull/147), source `f4840d46c3a58c182f7a0de1b7dda788b67cbace`.
- Recovered source checkpoint: `0e78e32b6a771b913e6e572436dee4d28e93931b`.
- All 18 package files are byte-identical to that candidate. No historical branch merge, shared configuration, dependency, default application, Worker, contract or trust input was imported.

The canonical accepted-decision index records D7's November 18 acceptance of isolated optional source, one package per PR. The earlier parking decision does not block this source extraction. Default application wiring remains separately gated.

This package contains bounded local arithmetic and diagnostic models: fixed-window clocks, panel drafting through explicit trusted words, vote ABI encoding, tally, one-appeal fallback, fee/bond accounting, non-reveal deductions and party-assertion conflict projections. The public facade exposes no transfer, settlement, slash, signing or network executor. Projections retain `diagnosticOnly=true` and `economicAuthority=false`.

The exact missing draft/evidence encoding, native certificate/custody ABI and provider profiles remain in `packages/arbitration/DECISIONS.json`. No new authority or implementation claim fills those gaps. Existing BasicEscrow trades gain no adjudication rights.

## Source review and prior hosted state

The current source review checked detached record/array admission, bounded native artifact bytes, actor/current-generation guards, monotonic chain-time behavior, rejection-sampling bounds, closed-round consistency, uint256 conservation and the absence of economic executors. No new blocking defect was identified within this diagnostic scope.

The original PR's seven required Actions contexts were all successful at source `f4840d4`. Its recorded independent source review reports 38 focused tests and no unresolved High/Medium source issue. Those are historical qualifications of that original head; they do not replace fresh qualification of this new integration head. No review or CI setting was changed.

## Executed verification

Node 24.22.3; npm 11.19.1. Dependencies were copied physically from the verified in-checkout installation; no dependency symlink or package change was used.

| Check | Result |
| --- | --- |
| `node --import ./scripts/test-support/register-tsx.mjs --test packages/arbitration/test/*.test.mjs` | 38/38 passed; no failures, skips or cancellations |
| `npm run typecheck` | All four TypeScript projects passed |
| `npm run check:boundaries` | Passed: 244 production files, 140 core modules |
| `npm run build` | Default static artifact passed |
| Comparison with coordinator's generation 2 default artifact | All 13 emitted files byte-identical |
| Candidate package comparison | All 18 files byte-identical to `f4840d4` |
| `git diff --check` and staged diff check | Passed |

The independent generator was copied unchanged into a temporary directory and run with:

```sh
python generate_vote_vectors.py /workspace/scratch/6bd6e00af1c0/toolchain/cast
```

Pinned official `cast` 1.5.1, commit `b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`, regenerated all three vote vectors, words, typehashes and 320-byte preimages exactly. Complete regenerated JSON SHA-256: `1dc6e11ff56358904d617afe98a5e224306ec838aaf4d8e4cc1b4675f2d4344c`. The committed fixture was not rewritten.

## Remaining qualification

Fresh hosted checks and independent cross-review remain integration gates. This work did not run a browser, chain provider, native arbitration contract or physical device. It does not establish production eligibility, VRF fairness, evidence authenticity or custody authority. There is no deployment or release action.

## Execution log digests

Logs are transient execution evidence; the commands, result counts and digests below are preserved for the source checkpoint above.

| Log | SHA-256 |
| --- | --- |
| `optional-arbitration-tests.tap` | `82edeb7f73c25550bf889c425bce0a0cb788bbdf51bc3c9d2fee390e7ae79799` |
| `optional-arbitration-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `optional-arbitration-boundaries.log` | `84fca8270174923a811bf13e300c6097ee8bc6a990241e17165e23cbe53703cf` |
| `optional-arbitration-build.log` | `404b0e42f0c051670e7b6e4fe3cb2408cd3e22b454559862a8e9df37f725935c` |
