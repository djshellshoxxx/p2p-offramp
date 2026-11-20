# Generation 7 rediscovery and exact-source hosted snapshot

Recorded November 19, 2026, America/Vancouver task date / November 20 UTC.

## Result and source of this report

The fresh enumeration observed **212 remote branches and 203 pull requests: 60 open, 105 merged and 38 closed without merging**. All **192 original branch heads remain unchanged and present**. Comparison of all **184 original PRs** found no change in their recorded state, merged status, source head or base branch. The original classification ledger remains intact: A108, B20, C41, D5, E2, F11 and G5.

Application source has not changed in this worker's branch. This report starts from published coordination PR200 commit `9d1129f189c2b7e5661384ade94da5270227af2e`, tree `78ad45a546510659b8b4ed2c1ecc0b072e5d890a`, in isolated branch `codex/generation7-rediscovery-20261119`. The worker read that handoff/state, immutable original inventory and generation5 overlay before preparing this additive report.

The inventory API observation ran from **02:39:46 to 02:41:07 UTC**. Three branch pages contained 100/100/12 entries; three all-state PR pages contained 100/100/3. The final pages were below the requested page size. Independent `git ls-remote --heads --tags` returned exactly the same 212 branch heads and no tags. The releases endpoint returned an empty list. PR numbers 55, 82 and 130 are issues, not missing PRs.

Main remains `5c5a84ef6300330700c8b0ca54d074ac113f08be`. No main merge, remote mutation, source edit, build or application-test execution was performed by this rediscovery task.

## Additions since the generation5 209-branch / 201-PR observation

| Branch / PR | Observed head and tree | Classification and action |
| --- | --- | --- |
| `codex/generation5-core-20261119`, [PR205](https://github.com/djshellshoxxx/p2p-offramp/pull/205) | Head `cd7d54ba075118a7ec043788c17718be842ee405`; tree `ce3c69ddc36245f756005c540e521a26a3ce59b8` | C: owned cumulative core. Preserve its completed source-bound evidence and current reconciliation-context hold; qualify the corrected successor before main integration. |
| `codex/optional-composition-evidence-g8-20261120`, no PR observed | Head `db9eb94356b4a2efd2b82bc2a0b67ab2e56795b2`; tree `65d567546d93640358be842a71b31fcb445a3851` | B relative to the already prepared local composition: exact complete-tree duplicate of `d67e022f71f14d54419bcb6987227b957d80107e`. Retain as evidence; there is no additional functionality to integrate. |
| `codex/relay-freshness-capacity-20261120-auto2`, [draft PR206](https://github.com/djshellshoxxx/p2p-offramp/pull/206) | Head `e848ae19574e8b7f4cb040082df5255ee5a63f1e`; tree `8420b5614b717e4d705cd676b4cf999b049dc51a` | C: cumulative core plus a unique two-guard relay delta. Original-module execution and independent review remain required; source inspection is not qualification. |

The sole moved pre-existing coordination ref is PR200: `f0773c2c91ec271b86c84baf3745c9cd56d1cf36` to `9d1129f189c2b7e5661384ade94da5270227af2e`. No original head moved or disappeared. The three new heads have main as merge base and are respectively 40, 50 and 43 commits ahead with zero commits behind. The additive overlay preserves all twenty non-original refs and their known scope.

### Duplicate composition proof

The published optional evidence commit has core205 and all nine published optional heads as its ten ordered parents. Its full Git tree equals the coordinator's frozen nine-layer source, including source, tests, workflows and documentation. The actual comparison:

```sh
git diff --exit-code d67e022f71f14d54419bcb6987227b957d80107e db9eb94356b4a2efd2b82bc2a0b67ab2e56795b2
```

returned exit 0 with no difference. This establishes source equality, not a new test execution or main approval. The coordinator's actual 2,617-test run remains attached to its frozen local source. The combined evidence branch does not replace D7's separate one-package PR sequence, standalone review conditions or later corrected-core qualification.

### New relay intake

PR206 changes only `packages/relay/src/ad.ts`, its existing `ad.test.mjs`, and the new `RELAY_FRESHNESS_CAPACITY_20261120.md` report. Inspection of the exact diff found a safe-integer/nonnegative clock guard for the exported advertisement validator and a safe-integer 1–1000 capacity guard at order-book construction. Existing thresholds, event formats, cryptography, dependencies and workflows are unchanged.

Its test-first commit is `2994e6e8b0b3803e1b062e0915a17f4c8b652984`; the repair commit is `3a7d1b2e3cee26f5c9300b89d5502048b37280e4`. The author explicitly reports only sixteen standalone predicate assertions under Node22, not execution of the original repository module. This worker did not run those assertions or independently establish a RED/GREEN result. Do not count the two source-confirmed gaps as independently reproduced repairs until the original-module tests and affected integration gates run.

**PR206 is not the separate four-repair core successor.** It is a relay-only draft stacked on205. It does not contain the separately reviewed Solana reconciliation, portal cleanup, navigation ownership or accepted-release opening corrections.

## External ownership observation

Read-only inspection observed the separate coordinator at `/workspace/scratch/6eace968c0df/p2p-offramp`, branch `codex/p2p-successor-consolidation-20261120`. Its earlier local head `f5fb2e3f78c26b9aa9404cd6b96024bd6242f96a` had coordination/report edits in progress. A later observation found the clean committed head **`d82d5282bfc78e46ccb34d9c700cf1b59dc8b23a`**, tree **`4b694124197ae8ce271f14307d12abc43c719406`**, containing the already reviewed `b67bd81e74b0f58338dc15bc694cd3a22b724cd4` source as an ancestor. Its branch was not present in the dated remote enumeration above.

This is H ownership evidence for an active external continuation, not permission to overwrite or incorporate unfinished files. No external file was changed or copied into this report. The coordinator must resolve its newest completed source and publication before integration. The external continuation's workers are not counted as workers launched by this rediscovery task.

## Hosted observations, bound to their exact heads

A separately launched read-only worker, `generation7_rediscovery/hosted_snapshot`, retrieved current check/job metadata and finalized job logs from 02:39:16 through **02:42:41 UTC**. Its compact evidence is `hosted-snapshot-generation7.json`; every job/check URL and checkout identity remains available there. The check snapshot was taken at 02:40:57 UTC. Counts below are check records, so205 includes its aggregate CodeQL record as well as the two analysis jobs.

| PR | Current check records | Foundation browser execution | Native Solana state |
| --- | --- | --- | --- |
| [202](https://github.com/djshellshoxxx/p2p-offramp/pull/202) | **10 successful** | Prior13-group result preserved; this pass read its completed native log | **Completed successfully**, program job136009253374 |
| [203](https://github.com/djshellshoxxx/p2p-offramp/pull/203) | 9 successful, 1 in progress | **14 groups passed**,21 structured receipts; job136022950072 | Program136022950914 at real-validator acceptance step14 |
| [204](https://github.com/djshellshoxxx/p2p-offramp/pull/204) | 9 successful, 1 in progress | **14 groups passed**,21 structured receipts; job136023879924 | Program136023880105 at real-validator acceptance step14 |
| [205](https://github.com/djshellshoxxx/p2p-offramp/pull/205) | 12 successful, 1 in progress | **16 groups passed**,23 structured receipts; job136027175362 | Program136027174510 at real-validator acceptance step14 |
| [206](https://github.com/djshellshoxxx/p2p-offramp/pull/206) | 9 queued | No runtime/browser qualification observed | No applicable native result inferred |

The 203–205 completed browser logs and checkout metadata agree on these identities:

| PR | Actual checkout or merge candidate | Checkout tree |
| --- | --- | --- |
| 202 | `32f7353551660a6c1e3e9302eecf3647b482c0c3` | `25d637fa5d6596e44cdae060ccc407f0c23186ee` |
| 203 | `8e2cd7b6ed1c907127b2e35e8b8826f59c039d90` | `412efa7b9534cc182d05d2b97830d5f6ff09944e` |
| 204 | `c579e9a646855b5d821caf97249df9872b3e98e1` | `f5c5bb060732a892ba4eb91532e82ed79f64f2c4` |
| 205 | `3dbe6ac3994c56bf2e6424676c6dc034ecc9a9b4` | `ce3c69ddc36245f756005c540e521a26a3ce59b8` |
| 206, unexecuted merge candidate | `d022fd4901828fc41dd72238f3977a1b61e6df31` | `8420b5614b717e4d705cd676b4cf999b049dc51a` |

### Completed native PR202 evidence

[Run44652103777 / program136009253374](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44652103777/job/136009253374) completed its pinned toolchain/build/lint/LiteSVM/IDL, real-validator and actual encrypted Worker/browser steps. The finalized validator receipt contains **62 checks, all true**, thirteen `sendTransaction` calls and **1,851 seconds of actual refund waiting**, in1,908 seconds total. It explicitly records the localnet-only synthetic-genesis response shim; this is not a public-network receipt.

The separate emitted-app browser receipt is `SOLANA_LOCAL_BROWSER_PROOF`, `ok:true`: **five completed recovery/refund checks**, real module Worker and encrypted IndexedDB, five wallet connections, eight wallet prompts, seven recorded app sends and seven distinct recorded intents, with **zero fixture errors**. The log includes the single deliberately withheld send. Its2,045-second run used real chain time, no clock warp and no genesis RPC rewriting. Its asset digest is `456aa79a119cbfb685f265c682f3c2b12ba34ec942aebc91e9ced5f824aac086`.

The checks cover wrong/absent escrow refusal; cancellation and wallet-change retirement without sending; distinct release and payout with exact principal; fresh-key restoration of the unknown marker without resending followed by finalized expiry and a new explicit review; and real-time refund plus separate payout of original seller principal minus actual fees. This closes the observed native execution gate for that exact acknowledgment-fixture head. It does not repair the subsequently reproduced context issue in205 or qualify the corrected successor.

### New composition browser evidence

Core205's completed foundation run includes the maintained Favorites and Templates groups and acknowledged restore diagnostic. The actual acknowledgment receipt reports one application call, one fetch, one physical POST, a complete503 response, zero validator forwards and zero unexpected requests/fixture errors. Its explicit scope still excludes arbitrary raw-reset retransmission guarantees.

The actual restore diagnostic reports emitted App/module Worker/encrypted IndexedDB, two held real lock responses, fresh profile/key, discarded stale file and submitted document buffers, and zero wallet prompts, RPC requests or financial transactions. Its asset digest equals the recorded core artifact `ba257e8b5178c52014e4eb4c00a3047cb71cb63d33ed395add6dc7754497a7a4`. These browser receipts preserve their own limits and do not claim native-chain qualification.

## Integration actions and limits

1. Keep205 unmerged while the corrected core successor is qualified. Track the two Cargo advisory matches separately in the coordinator dependency report `42cf34ba9d98ae1fd651a2d7fb9ea8c847c2a5c7`; this rediscovery did not rerun that audit. The existing core check successes do not resolve the newly reproduced Medium reconciliation-context defect. The main coordinator owns source integration and exact-head policy gates.
2. Retain the complete202 native success as source-bound evidence. Preserve old failed188/189/190/191/196/197/199/201 jobs as historical failures. Keep both real refund minima, signature/send-marker and principal/fee assertions intact on the corrected descendant.
3. Intake206 through independent original-module reproduction/review and affected relay/native/type/build gates. Preserve its distinct ownership and do not mistake it for the four-fix core successor.
4. Retain the published optional composition as an exact duplicate evidence tree. Continue one-package source PRs only after their current baseline and applicable standalone review gates qualify. No new optional app wiring follows from this inventory.
5. Resolve current refs before any action. The API/CLI inventory, hosted checks and external local observations are dated, non-atomic snapshots; later publication may add refs or change statuses.

The only work added by this task is this report and two machine-readable evidence files. No application test suite, native process, browser, paid service, deployment, release, setting or credential operation was run by this rediscovery worker. The child read existing hosted results; it did not trigger or rerun jobs. Two actual native agents participated in this task: this rediscovery worker and its read-only hosted subreviewer.
