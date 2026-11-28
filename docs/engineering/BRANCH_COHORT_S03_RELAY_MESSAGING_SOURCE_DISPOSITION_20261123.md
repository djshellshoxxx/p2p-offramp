# S03 relay/messaging stage-local source disposition — 2026-11-23 UTC

Current main: `01f6f4feca051d68de24a04299cd3bb444bce40c`. Coordinator prepublication head: `8663bf1f8135efb132421344cc3e0f746245900e`. This is a bounded historical stage-local reconciliation, NOT feature release qualification, full history patch-id equality, or a new runtime pass.

## Scope and provenance

* Original S03 `5a747ded358ee9fcca393bb4a0616fd4e8632296`, compared to original S02 `01344cbd6655f509f3e2e3903333cdb579228d37`: one stage-local commit, eight changed files.
* Corrected M0 S03 / [PR39](https://github.com/djshellshoxxx/p2p-offramp/pull/39) `404dc3daa8b19904c7da29d71d49d8df0f5e03ba`, compared to M0 S02 `71a56d10405bacc7ab39f29d1b63b4bde8a82504`: 11 changed paths. PR39 is closed, not merged; original refs preserved. The preceding S02 changes are not qualified by this report.
* Full authenticated REST branch pages 100+100+62, PR pages 100+100+47: 262 branches, 247 PRs (65 open, 124 merged, 58 closed unmerged). Every recorded branch ref matched except the coordinator's expected self-reference advance to the prepublication head. AGENTS.md and docs/ai/WORKFLOW.md and docs/ai/HANDOFF.md reads returned 404; current engineering handoff and inventory were read instead.

## Exact immutable blob mapping

| Stage-local file | Original S03 blob | M0 S03 blob | Main blob |
|---|---|---|---|
| packages/messaging/src/durable-chat.ts | d88d16302da47594f1c563d988fa65f55f978237 | same | same |
| packages/messaging/test/durable-chat.test.mjs | 8bd3fbcbf91514d543e89df9825b5102668a5868 | same | same |
| packages/relay/src/local-pool.ts | 9d626999c3ab9e01880b3fcdcfaa881dc6f38a54 | same | same |
| packages/relay/src/nip01.ts | 8c34172bdab11bb376bb1b2b0fcc3de4b035580e | 977f91b14411c9ed6046e1fb18a86ee748a7b104 | same as M0 |
| packages/relay/src/pool.ts | f9183b5ddfcce5a80d22f0ffe3fd84aab5324451 | f157c515776ab2a249f5d2974bd9d655967f3925 | 4ec25347479229d8f59da55be595bbddcd50e016 |
| packages/relay/src/snapshot.ts | not stage-local | d1223ddd1e64fa573929534c45300fedfb11a63e | same as M0 |
| packages/relay/test/ad.test.mjs | 73def02a8cd4bd59313eb024c6644a4ad961b7a6 | same | 877475059123b2ed84e187a9374c90749182c060 |
| packages/relay/test/local-pool.test.mjs | cd581a808d2915d8c6b628379d0e1b018eec8682 | same | same |
| packages/relay/test/pool.test.mjs | cc3aec08e022d6d6052b78b0a725de9cc7c7c34b | same | 640847c9e834336e0ccd471734b2de4bfec55754 |
| packages/relay/test/pool-subscriptions.test.mjs | not stage-local | 315b74cdbedb42c60308e9437d0a9e9a041ad966 | bc999e2e98732b1f18b7c363e37babeeb2f329a8 |
| packages/exchange/test/exchange.test.mjs | not stage-local | 5ba7549b0fe5497e2ac1978abaa6c0c5a4d1194c | bac8a5418b85cd6c50c0dac0dcf13665dc833dea |

Original S03: four of eight full blobs exact; M0: six of eleven full blobs exact. Every M0 patch-added line is present verbatim as a complete line in main except five: the direct handler descriptor lookup and four old exchange-fixture lines. This is an addition-line membership comparison, not patch-id or proof that arbitrary repeated lines occur in the same location.

## Deliberate replacement review

* The original duplicated indexedValues implementation moved to the internal shared snapshot.ts helper in M0. Main has the same M0 helper and nip01 blob, with identical array prototype, length descriptor, own-key count, enumerable data descriptor and bounded iteration checks. Both consumers import it. The old duplicate implementation should not be restored.
* Main's pool normalize and closeSub code match the inspected M0 section. The old direct own handler descriptor lookup is now a bounded prototype-chain descriptor lookup that still rejects accessor-valued handlers, does not invoke getters, and snapshots callable handlers. Later post-verification ownership/scope checks and per-subscription dedupe retirement remain in main; copying historical pool.ts would discard newer safety behavior.
* All 31 original ad-test additions and 104 original pool-test additions remain as exact lines; the 89-line M0 subscription test file is an exact contiguous prefix/content block within main, with a later fourth ownership regression appended. The original durable-chat tests and local-pool regression file are exact full blobs. No original S03 test declaration was missing from the corresponding main test files.
* The exchange helper's global pulled Set was replaced by a Map of delivered IDs keyed by recipient public key. It still waits for EOSE, closes the subscription, and returns only unseen wraps for that recipient. This preserves fresh-subscription history filtering while eliminating cross-recipient bookkeeping coupling in the test fixture; the old global helper is deliberately superseded.
* These observations account for the stage-local intended changes; mark both S03 variants F (content reconciled / deliberate supersession), not merged by ancestry, and leave upstream S02 and overall product qualification unresolved. No code transplant is warranted.

## Live integration gates

* PR237 `33232f62dc9cd250528ef3eb0313c0c319d99495`: 12 successful reported checks, no submitted reviews. D8 named review not met.
* PR247 `3f23c774b2464b04de6cfece9ab1721dd5130f86`: 14 successful reported checks including CodeQL; no submitted reviews; draft.
* PR248 `4fc269e4fe17b8aaa9f315c29f726071f3834f5e`: 11 successful reported checks; only owner COMMENT review; draft.
* PR250 `d75d2a00d4cfdd83fd681c361eefce69bc91c617`: 11 successful reported checks, no submitted reviews; draft. Prior failed browser job and later success remain separate in existing records.
* No independent Tier C acceptance/recorded owner approval inferred, no new tests executed locally, no merge, deployment, real funds, release or optional default change. ReleaseEnabled=0 configuration not modified. Current workspace/native execution and independent-worker qualification not established. Next: another disjoint historical stage, or qualifying source when its required review/approval and exact-target gates arrive.

## Classification

Previous A137/P64/F34/C5/E0/V21/B1/D0. After two stage-local V→F dispositions: A137/P64/F36/C5/E0/V19/B1/D0 = 262. No claim of overall 100% completion; these two stage-local source dispositions do not resolve their parent histories or pending integrations.
