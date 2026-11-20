# Generation 32 independent native prepared-funding driver review

## Result and exact scope

No actionable High, Medium or Low finding was identified in the native acceptance companion. The independent source checker verified its exact one-path delta, reconstructed the complete original driver byte-for-byte after removing the bounded additions, and passed syntax and full main-to-source whitespace checks. Two controlled probes passed **2/2**, exercising the actual new helper against the corrected native client. Those probes establish bounded helper compatibility; actual native validator acceptance remains pending.

The reviewed driver source is `e214f70f8bcbb9eb962fc147f2d318081daca2ce`, tree `9e7564a188b8b87f5498ac749eee62db7951317f`, directly above corrected client source `252dd1603f12eab69313ef25b538be1b040bc508`. Only `contracts/solana/localnet/client-run.mjs` changes. The complete source has 2,996 entries; the other 2,995 entries retain their exact mode, type and Git object ID. The source file contains 33,030 bytes with SHA-256 `11242e040bed614cdfcc054fbd3ca002fc653be6b888b5087c87af708a75ed83`.

This review follows the [separate client source review](INDEPENDENT_SOLANA_PREPARED_FUNDING_REVIEW_GENERATION32_20261120.md), committed as `fadd204e3616f7d262add42a7f72a55d27079158`. The client review's 98-case selection and this review's two helper probes are separate commands. They are not represented as one combined green suite.

## Driver behavior and preserved coverage

The existing native SOL and original-SPL funding admissions call `prepareFunding()` and then `confirm()` through the existing `act()` helper. The SPL admission supplies its existing synthetic seller ATA explicitly. Preparation must return immutable review, binding and shape objects with the seller role, current binding, program, escrow, funding source and absent-escrow expectation. The helper parses and verifies the reviewed message, checks its original blockhash and canonical base64, and reads the actual journal before confirmation. Exactly one prepared intent must exist, with no signature, send marker or outcome. Signing and client-send counts must remain unchanged throughout preparation and journal inspection.

Confirmation remains inside the existing finalized reconciliation path. The helper compares the durable result to every retained review field, checks a single physical wallet call using the reviewed seller and message, checks a single client broadcast for that signature, and verifies the actual wire's message bytes. The added sign log records only public synthetic account addresses and public message bytes. It does not change key lookup, signing, RPC behavior or transaction construction.

The independent reconstruction removes exactly the added import, sign-log declaration/instrumentation and helper, then restores the two funding call sites. The resulting bytes equal the entire parent driver. This proves preservation of all original post-funding checks, complete crash/refund flows, finality polling, transfer amounts, refund waits, timeouts, deployment setup, programs and workflow references. Crash and refund still exercise direct funding. There is no new browser funding command, trust setting, mint permission, default activation or release setting.

## Controlled helper probes and their limit

The two independent probes extract only the exact `reviewedFund` function from the frozen Git object. They import the actual corrected client, existing scripted cluster/CAS journal/Wallet Standard fixtures, and actual message parser and planner verifier. One probe exercises native SOL with no token source; the other exercises the explicit original-SPL source. Each executes all 13 assertions in the extracted helper and separately verifies the actual journal transition sequence `prepared → signed → sendMarked → sent`, one confirmation, one signing call and one client send.

The injected `act()` boundary confirms through the actual client and returns its actual **sent** journal record. It deliberately substitutes for the native driver's finalized polling. It does not fabricate finalized state or execute the driver entry point. No validator, browser, native financial flow, compiled driver output or long refund wait ran in this review. These two controlled cases cannot qualify native finality, program execution, transaction totals or wallet/device compatibility.

The recorded review checkout is `fadd204e3616f7d262add42a7f72a55d27079158`, whose source outside `docs/` is exactly corrected client `252dd160`. The extracted helper is bound separately to `e214f70`; the source checker establishes that every other driver-source entry is the same corrected client. This makes the execution composition explicit without claiming that the entire native driver executed.

## Author evidence verification

The native author's evidence commit is `fcd74b9d577a59af55d942d85d472de9cebe2228`, tree `a65f2ec718da2430f325dfcc9bfbcf0fa87ca1e8`, directly above the reviewed driver. Its 31 added documentation paths preserve all 1,030 source entries outside `docs/`.

The independent checker verified all 17 indexed artifacts, their raw/compressed hashes and zero gzip timestamps, all 42 compiled repository-input hashes, the sole 194,659-byte compiled output, all six reported protected byte regions, four supplemental verification/whitespace receipts and all three packaging-recovery artifacts. It also records a hash for every one of the 31 evidence files. The compiled output hash is `4bf495a5bbe5b4b931472967a216bdfe15b1e38bfb4c39a1a64f1953a9f7b3e6`; the output was not evaluated.

The unavailable-esbuild build attempt remains an original failed command, followed by the successful build-only Rolldown compilation without dependency installation. The later packager's existing-submodule `IsADirectoryError` remains an explicitly labeled recovered traceback with its original script. The corrected entry-aware check verifies 1,028 regular blobs and both tracked Git pointers. The original source-preservation invocation script was not retained by the author; its original result remains available, and this reviewer independently verifies the entire unchanged remainder as well as the six recorded byte regions. No failure or evidence limitation is omitted.

## Handoff

The [machine receipt](solana-prepared-funding-native-independent-review-generation32.json) and [retained evidence](evidence/solana-prepared-funding-native-independent-review-generation32/) bind the exact sources, commands, timestamps, complete logs, probe scripts and raw/compressed hashes. All three review commands passed. Root's final combined source and qualification require a separate composition supplement. Actual hosted native execution and the applicable Tier C source/target checks and owner authorization remain required before a merge decision. This review supplies no merge, release, deployment or real-funds authorization.
