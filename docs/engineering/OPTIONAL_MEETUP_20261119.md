# Optional meetup source qualification — November 19, 2026

## Provenance and scope

- Integration base: `ac9a4b0ffc3ca50a299398e72554e7964a634cd4`.
- Retained candidate: [PR #163](https://github.com/djshellshoxxx/p2p-offramp/pull/163), source `6a7e8d709fc3f5344daa86ccb8d6234e22bd931c`.
- Recovered source with failing regression checkpoint: `3bfe5d11c11f9f8cea1cc3fd3652a42d36564650`.
- Repaired source checkpoint: `c5808fa4b028b00681d6322a30782b7610dab0fb`.

The canonical accepted-decision index records D7's November 18 acceptance of isolated optional source, one package per PR. The earlier parking decision does not block this extraction. Default application wiring remains separately gated.

The original candidate supplies 34 package files. Thirty-one remain byte-identical; the changes are failure normalization in `src/shared.ts`, `src/disclosure-budget.ts` and `src/policy-data.ts`. The new `test/native-diagnostics.test.mjs` reproduces the adapter-error issue through both public consumers. No dependency, old branch merge or default application/Worker wiring was imported.

Root `npm test` already discovers the unit tests and root TypeScript configuration already includes the sources. The existing package-specific `test:meetup:browser` command and its `vault-foundation.yml` step were recovered because the native multi-document ledger gate is not covered by those generic checks. All current workflow steps remain in place; the three-line browser step is additive. The optional-boundary and authority-isolation tests remain in place.

## Semantics and source review

The package supplies local location consent, geohash/coarse regions, claim plausibility, bounded blur, encrypted disclosure budgeting, map manifests, RTC policy, venue records and signalling diagnostics. It does not request location, register sensors, fetch map tiles, open a signalling channel, or provide a TURN/STUN, camera, wallet or contract adapter.

Disclosure admission retains the current-owner and consent checks, explicit user gesture, encrypted write-before-disclose ledger and exclusive origin coordination. Native G02 leases, compare-and-swap, lock/revocation checks and bounded records remain in use. The policy owner keeps finite physical-operation admission and timeout rules; chunked policy persistence supports 5,000 records while refusing the 5,001st before signature work, and preserves unrelated preference records. Retention affects only owned diagnostic history.

Imported location, venue and signalling claims prove no GPS truth, safe venue or physical presence. The package grants no authority over signed terms, funding, release, refund or basic principal. Synthetic fixture clocks, claims and consent ports remain distinct from physical qualification.

## Reproduced diagnostic issue and repair

Both the disclosure ledger and chunked policy store directly read failed native-adapter `error.code` fields. Malformed caller-supplied diagnostics could invoke accessors or inherit an apparent storage code. Native G02 failures use fixed plain data; this is defensive handling of a returned adapter result, not a demonstrated peer-payload or financial-authority vulnerability.

The regression exercises nine cases through each public consumer: own data, nested and wrapper accessors, inherited code and wrapper, unknown and non-string codes, and throwing descriptor traps. Before the fix, the focused run reported 6 passing and 14 failing entries: twelve adverse cases plus the two enclosing tests. The common internal helper reads only own data descriptors, preserves the fixed `LOCKED`, `CANCELLED` and `CONFLICT` codes, and maps everything else to `LEDGER_UNAVAILABLE`. Reflection failure stays bounded; no diagnostic getter or string coercion executes. Successful results and storage/owner semantics are unchanged.

All 20 focused entries now pass, including the two enclosing tests. Refusal invokes no vault read, list, commit or origin lock. The full package suite passes 95/95, with no failures, skips or cancellations.

## Executed verification

Node 24.22.3; npm 11.19.1; Python 3.12.14. Dependencies were physically copied from the verified in-checkout installation. No external `node_modules` symlink or dependency version change was used.

| Check | Result |
| --- | --- |
| Original recovered package suite | 75/75 passed |
| Focused diagnostic regression before repair | 6 passed / 14 failed; twelve adverse cases plus two enclosing tests failed |
| Focused diagnostic regression after repair | 20/20 passed |
| `node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=4 packages/meetup/test/*.test.mjs` | 95/95 passed |
| `npm run typecheck` | All four TypeScript projects passed |
| `npm run check:boundaries` | Passed: 248 production files, 140 core modules |
| Build-policy regression suite | 54/54 passed using physical in-checkout dependencies |
| `npm run build` | Default static artifact passed |
| Default artifact comparison | All 13 emitted files byte-identical to the arbitration build, already matched against the coordinator's generation 2 artifact |
| `git diff --check` and staged diff check | Passed |

The two original Python generators were copied unchanged to a temporary directory and run independently of the TypeScript implementation. Both JSON outputs were byte-identical, including recorded Python version metadata; the committed fixtures were not rewritten.

| Independent oracle | Result | SHA-256 |
| --- | --- | --- |
| Exact rational grid geohash | 1,024 points / 4,096 comparisons | `eedf436f45fc651700ee6045973f458481a6bf58d2930823d5a70e242250e0c0` |
| Python log/tan XYZ display oracle | 92 vectors | `2284659699db0bb37a98d93572a1fc2973563e69e96e089e07d6153793532fed` |

The geohash generator SHA-256 is `79c47b1d17d0636fa50cfa7a4a7c57930180feaef04f442e31cb42eb732e2900`. Its integer grid quantization and bit interleaving remain independent of the TypeScript midpoint-bisection implementation. The XYZ oracle uses log/tan while TypeScript uses asinh/tan. These fixtures qualify local geometry, not real sensor observations or privacy guarantees.

## Prior hosted state and remaining qualification

The original PR's required checks passed except `local-trade`, whose failure was the inherited restored-profile wallet-connect timeout at `scripts/test-localnet-browser.mjs:203`. The maintained base contains the staged #181 readiness repair. No obsolete browser runtime was recovered. The old PR also recorded a temporary external dependency-symlink build-policy failure; the current physical layout passed all 54 policy regressions and the actual build.

The original package records a finite native Chromium two-document ledger qualification. That is historical evidence, not a browser pass on this integration head. Local Chromium was not run or bypassed; the preserved hosted browser gate must qualify this head. No GitHub review object was present on the original PR when inspected. Fresh hosted checks and independent cross-review remain integration gates, with no production, physical-device, deployment or release claim.

## Execution log digests

Logs are transient execution evidence; the commands, result counts and digests below are preserved for the checkpoints above.

| Log | SHA-256 |
| --- | --- |
| `optional-meetup-diagnostics-red.tap` | `f9f0cd9db27a1c78e697490d2d454f0b9d5d115469d7f38117d7e9b2a8fdddad` |
| `optional-meetup-diagnostics-green.tap` | `96292faf15d62854aa654ff008fc98da8542020655099e22621295e3cb20ca61` |
| `optional-meetup-repaired-tests.tap` | `5c005137c35ea00fd22d09f58f3c86dfdc3c46e8b7fc1b86dc55c0d36c2d8d06` |
| `optional-meetup-repaired-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `optional-meetup-repaired-boundaries.log` | `f16366c8715c89c0bb5ad42c0a35bb5ef0c1d5b414b2bfa1e84fae74e8851cc4` |
| `optional-meetup-policy.tap` | `8a931a3b2d082422471d9ed9f3df03fad25bb5220f319f7f915155bd418cb48c` |
| `optional-meetup-build.log` | `bc97a18335c107fe12933d398a00ba1aefb6d841cc2cf57c1fcbcfb31e5061b9` |
| `optional-meetup-independent-vectors.json` | `075d81fb892218baa3fea4c6bf34c5ecdf4ca9c5ab3268ad5cdaed161e23d03c` |
