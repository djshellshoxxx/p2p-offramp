# Optional courier source qualification — November 19, 2026

## Provenance and scope

- Integration base: `ac9a4b0ffc3ca50a299398e72554e7964a634cd4`.
- Retained candidate: [PR #146](https://github.com/djshellshoxxx/p2p-offramp/pull/146), source `636a3372cfe1a2306578b5a70ab9eb42858a83ac`.
- Recovered source with failing regression checkpoint: `6cff236e0768d39b09b26a793b630a9ea0a2f2d3`.
- Repaired source checkpoint: `b987113452d644aa1f0ed72ba709ddaa1767c3e2`.

The canonical accepted-decision index records D7's November 18 acceptance of isolated optional source, one package per PR. The earlier parking decision does not block this extraction. Default application wiring remains separately gated.

The original candidate supplies 22 package files. Nineteen remain byte-identical; the changes are the native-error normalization in `src/secrets.ts`, its additional regression cases in `test/secrets.test.mjs`, and a README correction acknowledging the recovered governance packet's historical source binding. That packet does not confer fresh courier verification or application authority. No old branch merge, dependency change, root script alias, workflow change or default application/Worker wiring was imported.

Root `npm test` already discovers this package's tests, and root TypeScript configuration already includes its sources. The recovered optional-boundary and authority tests remain in place.

## Semantics and source review

The package contains bounded local records and evidence, challenge/receipt, container commitment, custody/recovery, integer fee/stake accounting and locker/inspection diagnostic models. Its only concrete storage consumer uses the public G02 encrypted-vault boundary. Container secrets are committed before publication and authorized reveal is recorded before returning owned bytes. Lock, current-owner and generation checks remain enforced; retained secret buffers are cleared on closure or revocation.

Verification requires explicit trusted signing/hash, current-owner and terms-bound policy ports. Evidence is an opaque in-process capability scoped to one verifier; imported JSON cannot mint it. Hash/signature operations retain their finite five-second local resource bound. Existing unsupported-record-kind and incomplete-route-consent regressions from the original candidate are preserved.

These local models establish no cash authenticity, delivery, physical presence or financial finality. They expose no network, wallet, locker-command or basic-principal executor. Diagnostic deductions retain `nativeExecutionAllowed: false`; access windows retain `nativeUnlockAllowed: false`. Missing signing, encrypted transport, publication, generation recovery, financial vault and device profiles remain explicit README blockers.

## Reproduced diagnostic issue and repair

The container-secret consumer directly read `value.error.code` from failed adapter results. A malformed caller-supplied diagnostic could invoke an accessor or inherit an apparent storage code. Native G02 failures are fixed plain data, so this is defensive handling of an adapter result; no peer-payload exploit or financial-authority route was demonstrated.

Nine cases exercise the public constructor: own data, nested and wrapper accessors, inherited code and wrapper, unknown and non-string codes, and throwing descriptor traps. Before the repair, the focused run reported 3 passing and 7 failing test entries, including the enclosing failed test. Six adverse cases failed. The repair reads only own data descriptors of the failure wrapper and code, preserves the fixed `LOCKED`, `CONFLICT` and `CANCELLED` codes, and maps other diagnostics to `UNAVAILABLE`. It invokes no diagnostic getter or string coercion. The successful-result path, lease capture and storage operations are unchanged.

The same focused run now passes 10/10 entries, including its enclosing test, with zero getter/coercion observations and no vault read or commit on refusal. The full package suite passes 61/61, with no failures, skips or cancellations.

## Executed verification

Node 24.22.3; npm 11.19.1; Python 3.12.14. Dependencies were physically copied from the verified in-checkout installation; no symlink layout or dependency version change was used.

| Check | Result |
| --- | --- |
| Original recovered package suite | 51/51 passed |
| Focused diagnostic regression before repair | 3 passed / 7 failed; six adverse cases plus the enclosing test failed |
| Focused diagnostic regression after repair | 10/10 passed |
| `node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=4 packages/courier/test/*.test.mjs` | 61/61 passed |
| `npm run typecheck` | All four TypeScript projects passed |
| `npm run check:boundaries` | Passed: 244 production files, 140 core modules |
| `npm run build` | Default static artifact passed |
| Default artifact comparison | All 13 emitted files byte-identical to the arbitration build, already matched against the coordinator's generation 2 artifact |
| `git diff --check` and staged diff check | Passed |

The independent container fixture was recalculated using Python standard-library sorted compact JSON for the fixture's ASCII strings and safe integer, followed by SHA-256 of `p2p-offramp/container/v1\0` plus the canonical UTF-8 bytes. Its canonical text, all 278 preimage bytes and digest matched. Opening digest: `efac3704c9b3115180a0688c1d821a77657d47924ec9e4c62caf2e1e3aa3b97f`; unchanged fixture SHA-256: `60eef009c1e431ec3317f512674ba3fa279e5a375a2ddd991964c6239cb919f1`.

## Prior hosted state and remaining qualification

The original PR's required checks passed except `local-trade`, whose failure was the inherited restored-profile wallet-connect timeout at `scripts/test-localnet-browser.mjs:203`. The maintained base includes the staged #181 readiness repair. No obsolete browser runtime was recovered from the old branch. This diagnosis does not substitute for fresh CI on this branch.

The original PR description records its earlier independent source review and repairs; no GitHub review object was present when inspected. Fresh hosted checks and independent cross-review remain integration gates. This extraction did not execute a browser, hardware device, financial contract, deployment or release, and it does not establish production eligibility.

## Execution log digests

Logs are transient execution evidence; the commands, result counts and digests below are preserved for the checkpoints above.

| Log | SHA-256 |
| --- | --- |
| `optional-courier-diagnostics-red.tap` | `23f9bb90c58b4b2cf2811014707c44c12a9c04df4f517ae99cb6e5ba61e567a4` |
| `optional-courier-diagnostics-green.tap` | `fdd38339bc91e09175166d9bd883b8e98de59d9d636534028a98944b3e1496be` |
| `optional-courier-repaired-tests.tap` | `05e8305890467d1e8e9949b2f6bc59a99d9ba112632d90478f5a3e12b4808c16` |
| `optional-courier-repaired-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `optional-courier-repaired-boundaries.log` | `84fca8270174923a811bf13e300c6097ee8bc6a990241e17165e23cbe53703cf` |
| `optional-courier-build.log` | `1574c4d19aee3e0fefc9c85e81496e34f1456d4a07e6793c1b134aba9d6f6e16` |
| `optional-courier-independent-vector.json` | `a50379dd22ab6b1c8bce6f4a409abb1d73a268181889c4dc1c7b28f7424ecdf7` |
