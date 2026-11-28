# Independent relay guard review — generation 7

Recorded November 19, 2026, America/Vancouver task date / November 20 UTC.

## Result and exact source

The original maintained relay module independently fails both added guard regressions. The corrected module passes both, and the already-started affected execution passed **140/140 tests**, with zero failures, skips, cancellations or todo. No additional High or Medium defect was identified in this narrow correction. No production change or new test was needed.

| Identity | Exact value |
| --- | --- |
| Original source / PR205 | `cd7d54ba075118a7ec043788c17718be842ee405` |
| Reviewed source / PR206 | `e848ae19574e8b7f4cb040082df5255ee5a63f1e` |
| Reviewed tree | `8420b5614b717e4d705cd676b4cf999b049dc51a` |
| Original ad.ts blob | `1a62b726ee8c1883dcaaa10c0be72bdeed619ecd` |
| Corrected ad.ts blob | `514578ee28454f368157ba22eaccadbb1c61cfe4` |
| Review branch | `codex/generation7-relay-independent-20261119` |

The reviewer read the current coordination handoff/state, generation 7 rediscovery, the PR206 report and maintained specifications. This isolated worktree uses a physical copy of existing pinned dependencies. Node 24.22.3 and npm 11.19.1 were unchanged. The initial disk constraint was resolved by the coordinator's cleanup of its own completed dependency caches; this worker changed no loader or dependency configuration.

## Standards

No documented-standard violation or material maintainability finding was identified. The lowercase `agents.md` contains workflow instructions: run relevant checks, preserve other workers' changes and keep isolated reviewable commits. Its remote synchronization is assigned to the coordinator for this task. No separate applicable coding-standard or issue-tracker instruction file was found.

The two additions follow existing safe-integer checks, early refusal and fixed diagnostic conventions. Clock rejection returns the existing `INVALID` reason. The capacity exception occurs before retention maps are created and contains no rejected value. The small guards add no speculative abstraction or dependency. Names and comments explain their purpose.

A separately launched read-only reviewer, `generation7_relay_review/relay_source_semantics`, inspected the exact source, specification and call sites. It identified no standards or specification finding. This task used two actual native agents including that reviewer; no additional review execution is implied.

## Specification

The normative source is `01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.4_order_discovery/module_1.4.2_discovery_policy/spec-orderbook-visibility-and-expiry.md`. Section 3 limits retained orders to 1000. Section 4 requires a trusted integer Unix clock, refusal when freshness is unknown, expiry sweeping and bounded eviction.

The standalone validator previously accepted a structurally valid signed advertisement when the supplied clock was NaN because both timing comparisons were false. The correction rejects non-safe, negative or fractional clocks before evaluating freshness. It preserves valid lifetime, signed expiry and future-skew thresholds.

The constructor previously accepted invalid capacity configuration. The new guard requires an integer from 1 through 1000 before retaining entries. Omitted/nullish capacity still selects the bounded default. Valid smaller capacities and the existing sweeping/eviction algorithm remain.

Both actual application callers, `apps/web/src/localnet/controller.ts` and `apps/web/src/context-adapters/observations.ts`, configure 32. The order-book wrapper already rejects unknown or malformed time before standalone validation. The demonstrated defects are exported-API/caller-configuration correctness issues, assessed Low in this demonstrated scope; no peer-controlled capacity, clock control, default-client financial impact or custody authority was established. Signature verification, discovery-only labels and negotiation revalidation remain unchanged.

Standards: 0 open findings. Specification: 0 open findings. The two original boundary defects are independently reproduced and corrected; they are not newly established High/Medium vulnerabilities.

## Actual executions

For RED, only `packages/relay/src/ad.ts` was replaced with its exact original PR205 Git blob. The current maintained tests were unchanged. A Python finally block restored the corrected file, followed by a clean Git-status assertion. GREEN then ran the same cases against the actual repaired module.

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 \
  --test-name-pattern='standalone ad validation|book refuses invalid capacity' \
  packages/relay/test/ad.test.mjs
```

| Execution | Actual result |
| --- | --- |
| Original module, new maintained regression cases | **0 passed / 2 failed**, exit 1; 524.122061 ms |
| Corrected module, same cases | **2/2 passed**, exit 0; 668.993637 ms |
| Ten relay files plus four affected application/peer test files | **140/140 passed**, exit 0; 61084.728286 ms |
| Exact production delta, protected-source preservation, whitespace | Passed |

The affected command uses the same Node prefix and all ten `packages/relay/test/*.test.mjs` files, plus `apps/web/test/context-adapters.test.mjs`, `apps/web/test/localnet-readiness.test.mjs`, `packages/wallet/test/evm-peer-session.test.mjs` and `packages/exchange/test/peer-acceptance.test.mjs`. Its complete arguments, exact source, durations and log hashes are committed in `relay-independent-generation7.json`.

The 90-second affected-run timeout did not fire. Its maintained tests include owned loopback WebSocket fixtures, real pinned cryptographic verification and application/peer controller paths. They are not the separately pinned nak/Khatru native Nostr acceptance harness or browser qualification.

## Preservation and overlap handling

Removing exactly the two guard insertions reproduces the original production module byte-for-byte. The only original PR206 changed paths are ad.ts, its maintained test file and the author report. Contracts, package manifests/locks, six workflows, cryptographic implementation, wallet/exchange modules and both application callers remain unchanged.

After the affected suite had started, the coordinator identified a concurrent external generation 10 review of the same PR. This worker completed its running bounded command and did not expand into TypeScript, builds or native installation. Read-only inspection subsequently found external report commit `14ab05b57ff84160b8ada310c17fa53402338ac9` and test commit `6a6030cd3df9b770f0db3adcf90997dccbedaa96`. Their separate 98-test/four-probe results are not executions by this worker and are not included in the 140 count. No external file or branch was changed.

The new external cases cover actual default retention, epoch/skew/expiry controls and captured options. Preserve their ownership and exact-source evidence if the coordinator integrates them. This report adds no competing implementation.

## Remaining gates

This review does not qualify old PR205's separate known core defects. Integrate the relay delta only with the reviewed corrected core under coordinator ownership, and qualify the resulting exact tree with applicable full/type/build/native/hosted checks. Existing ancestor results cannot be transferred to that composition. Keep all release and financial controls intact.

No full-repository suite, TypeScript/build gate, pinned native Nostr harness, hosted workflow, browser, remote mutation, deployment, release, credential, settings or real-funds action was run by this worker. The unexecuted scopes remain explicit. The coordinator owns global handoff/state and publication.

| Captured log | SHA-256 |
| --- | --- |
| original-module-red.log | `f2897fc654de2b115e4763d77a7a3702d1291367dfad40f42f99ab9d825c9d74` |
| repaired-module-green.log | `bfea887618830902a32d2f186f2db92c36a32601ee2d092e53ce205bb8292c1c` |
| affected.log | `09ba1c5e3204b8b160dc069140303612749ad9ca55dd64338f7136aede095e2e` |
