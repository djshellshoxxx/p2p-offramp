# Independent relay input review — generation 10

## Result and exact scope

PR206's clock and capacity repairs pass independent source review and maintained package execution. **No open High or Medium issue was identified in the reviewed six added production lines.** No additional production repair was required. The two original issues are reproduced API/configuration correctness defects, assessed Low in the demonstrated scope: the maintained application call sites already use guarded clocks and capacity 32, and no default financial impact is established.

| Identity | Value |
| --- | --- |
| Original base | PR205 `cd7d54ba075118a7ec043788c17718be842ee405` |
| Original ad module blob | `1a62b726ee8c1883dcaaa10c0be72bdeed619ecd` |
| PR206 reviewed head | `e848ae19574e8b7f4cb040082df5255ee5a63f1e` |
| PR206 reviewed tree | `8420b5614b717e4d705cd676b4cf999b049dc51a` |
| Product repair | `3a7d1b2e3cee26f5c9300b89d5502048b37280e4` |
| Corrected ad module blob | `514578ee28454f368157ba22eaccadbb1c61cfe4` |
| Independent final test commit | `6a6030cd3df9b770f0db3adcf90997dccbedaa96` |
| Final test tree | `60b77ceb25d268f43434287d8f97421d50d50674` |

The review compares `git diff cd7d54ba075118a7ec043788c17718be842ee405...e848ae19574e8b7f4cb040082df5255ee5a63f1e`. It covers canonical `packages/relay/src/ad.ts`, its maintained tests, the PR206 report and current call sites. It does not substitute the distinct restricted-local `advertisement.ts` API for the canonical API. Default application/import/release settings, contracts, dependencies and workflows are unchanged. This worker made no production or remote edits.

## Standards axis

The guards follow the module's existing safe-integer/nonnegative clock discipline and fixed diagnostic style. `Number.isSafeInteger` rejects nonnumeric values without coercion, so the subsequent comparison cannot execute an injected numeric conversion. Capacity is captured once during construction and checked before retention is created. No new abstraction, import, dependency, protocol field or authority is added. The fixed `RangeError` identifies a configuration failure without embedding its rejected value.

Current production call sites in `apps/web/src/context-adapters/observations.ts` and `apps/web/src/localnet/controller.ts` use `maxOrders:32`; their clock paths guard unknown time. The existing order-book wrapper independently rejects invalid clock readings before invoking advertisement validation. The standalone exported validator is the newly repaired boundary, not evidence of a demonstrated financial bypass.

No documented-standard breach or material code-smell finding remains in this diff. Existing tool-enforced concerns were not duplicated as subjective findings. The independently assigned reviewer assessed both axes; no additional independent sub-reviewer is claimed.

## Specification axis

The normative source is `01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.4_order_discovery/module_1.4.2_discovery_policy/spec-orderbook-visibility-and-expiry.md`, sections 4–5: injected integer Unix time, refusal when freshness is unknown, at most 1000 retained orders, fixed validation outcomes and discovery-only authority.

The original standalone validator returned discovery-valid for NaN because its future/expiry comparisons did not establish freshness. The original constructor accepted invalid capacity values; nonfinite/over-cap configuration could defeat its documented retention bound. The two maintained regressions fail on the actual original module. The fix maps invalid clock values to existing `INVALID`, and invalid explicit capacity to a fixed construction error. Valid clocks and capacities retain their prior behavior. A nullish capacity continues to select the bounded default; the patch does not claim to reject every out-of-TypeScript-contract configuration shape.

Independent positive controls preserve Unix epoch 0, the 120-second future-skew boundary and exact signed expiry. The actual default book retains 1000 of 1001 distinct fixture events, evicts the soonest-expiring entry and preserves duplicate/discovery-only behavior. A smaller configured book captures its capacity despite later option mutation and frees expired capacity before evicting live entries. No missing requirement or scope expansion was found in the reviewed repair.

## Executed evidence

Environment: Node 24.22.3 with a physical copy of the repository-pinned dependency directory; no package or runtime version was changed. No heavy full-repository, TypeScript or build run was performed during the coordinator's separate qualification.

| Execution | Actual result |
| --- | --- |
| Original module plus PR206 maintained advertisement tests | 15/17 passed; exactly the two new regression tests failed |
| Repaired module with the same maintained tests | 17/17 passed,0 skips/cancellations |
| All 11 relay test files, including four independent cases | **98/98 passed**,0 failures/skips/cancellations; 37949.727948ms |
| Final independent file after a test-title-only shortening | 4/4 passed,0 failures/skips/cancellations |
| Production comparison and `git diff --check` | Passed; no production change from PR206 |

The original test run temporarily substituted the exact base `ad.ts` blob within this isolated review worktree and restored the corrected bytes in a `finally` block. Other source and maintained test bytes were unchanged. The failures were `standalone ad validation fails closed on unavailable or malformed time` and `book refuses invalid capacity options rather than silently defeating the 1000-order bound`. No failure was suppressed or converted to a skip.

The 98-test run used staged tree `850f45ffeeaad5d99b7095d553bc42ca2979a491`, independent-file blob `76a09d07cdabbde0165dd67cb3154386a9498345`. The only subsequent test change shortened a 121-character test title; the final four tests were rerun on tree 60b77ceb. The broader 98-run is not described as a fresh rerun of that formatting-only tree. Production bytes are identical throughout.

Commands:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 packages/relay/test/ad.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 packages/relay/test/*.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 packages/relay/test/ad-input-boundaries-independent.test.mjs
```

Logs reside at `/workspace/scratch/6eace968c0df/verification-code-audit-g10/`:

| Log | SHA-256 |
| --- | --- |
| `original-ad.log` | `b0e0e9962e9ef950bf08787192d99786777a56659095388176a631c09915e0c6` |
| `repaired-ad.log` | `b480fdec8627eec9220530d552870ff04b4d8ffe86be7825bee00073fe2d91a0` |
| `relay-independent.log` | `a878ee46cd68abacf410cac8fe18753a41726a47b5daae5dd77ce02457e58f04` |
| `independent-final.log` | `89410b11ecf1e4ab2c201063ea19c9cfc560d5cac0dc8ec174315ab7765f35f3` |

## Native and integration limits

The relay package tests include their maintained owned-loopback fixtures. They are **not** the separately pinned nak/Khatru native Nostr acceptance harness. `P2P_NAK` is unset, no pinned executable was found in the recorded local toolchain/cache search, and the coordinator confirmed that prerequisite is unavailable. No speculative download, native-run claim, public relay traffic or browser execution was made.

PR207's corrected core does not yet contain PR206. Preserve PR206's three source/test/report commits, integrate these independent test/report commits on an appropriate descendant, and run the actual combined full/type/build/native/hosted gates. Do not transfer either ancestor's CI to a new tree. Source integration remains separate from deployment or release; keep ReleaseEnabled=0.

Fresh successor target: qualify the corrected combined source against the pinned native relay and hosted contexts, inspect exact checkout parents/tree, and review any integration conflicts without repeating unchanged predicate-only smoke tests. Standards findings: 0 open; worst: none. Spec findings: 0 open; worst: none. The two original Low API/configuration findings are independently reproduced and closed in this scope.
