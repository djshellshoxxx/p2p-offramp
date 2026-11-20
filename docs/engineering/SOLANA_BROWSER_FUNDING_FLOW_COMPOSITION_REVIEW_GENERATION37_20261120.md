# Generation 37 independent composition review — corrected qualification

## Verdict

**Accepted: the corrected consolidated source matches the independently reviewed source, and the completed local qualification is attributable to that exact source.** All **2,915/2,915** full-suite cases pass with zero failed, cancelled, skipped or todo outcomes. All six additional qualification commands pass. The earlier 2,914-case run remains separately retained against the original source, before the independently discovered snapshot-expiry defect was corrected.

This supplement verifies source composition, saved evidence and packaging assertions. It runs no tests, builds, browser, validator or financial journey. It supplements the [independent source review](SOLANA_BROWSER_FUNDING_FLOW_INDEPENDENT_REVIEW_GENERATION37_20261120.md), which records G37-R1, its original failure, the narrow author correction and the final independent 38/38 selection. **`ReleaseEnabled=0`.**

| Identity | Exact source | Complete tree |
| --- | --- | --- |
| Initial root qualification | `dcdb86d19b8d1e1b09cd12a0f5cbf9626eff0fd3` | `3e1f569f57fbc3ee01f6f4b32ea6bfd32abba65a` |
| Corrected root qualification | `88bd126bace2b88886017b0ff4eb5daffcdc060e` | `5ecf56b74e82f04b4fed8961179a46bcbd330def` |
| Independently reviewed corrected composition | `28fa8516d2e1f26740a5370077f9b2fdbaa2c086` | `5ddaff2733cc27bea00311f42e7bac577e00ab60` |
| Original independent source-review documentation | `62e9e5147e0bfd31f5d2e95e14001672256ca766` | `3855daab60244754e336d7389e3e87286ad342e1` |
| Root evidence head checked in this supplement | `9fe97a05759980f445d63231ede47edef9038261` | `2144603c307c6b40da0ae5b57220b8b34f18b879` |

The corrected root qualification, independent corrected composition and integrated root evidence head have the same **1,043 non-documentation entries**. Complete trees differ because documentation was composed separately. The initial root source matches the original reviewed union. The three-path corrective patch is byte-identical to original author correction `3ccf809e01e729980b3ab5fbe12ba3993fbe9982`.

## Exact source and evidence mappings

Both original component patches map unchanged: application `107ce93d030298f2668285067e156979c883184d` to root `157524b6209f32338f60760bff4d1e8c012e0d97`, and native `d8dbf9e82743fd670c7d3af80a024720cbfb0538` to root `dcdb86d19b8d1e1b09cd12a0f5cbf9626eff0fd3`. Original author identities are preserved as source provenance; mapped commits are checked independently rather than being described as the original commits themselves.

| Evidence | Original commit | Root mapping | Documentation paths |
| --- | --- | --- | ---: |
| Initial application | `cc144c69b7ee190880aff7f51a86d74fde863522` | `0413b336780f4b6f90b429272f7e9fd865182c11` | 35 |
| Native companion | `3be8f3e439ab8101bfd0545774dfb4461a924cdd` | `1104afcdc2c1605e5dfdb5947dd7303d028547ff` | 44 |
| Snapshot correction | `12f7d98ba7f133da77d18c62df790c957df93b1c` | `3ce32d67bccc1e917fc52e8a726ccd07726148f8` | 25 |
| Independent source review | `62e9e5147e0bfd31f5d2e95e14001672256ca766` | `9fe97a05759980f445d63231ede47edef9038261` | 85 |

All four documentation mappings have exact binary patches, documentation-only changes and unchanged source entries. Their **189 documentation paths** retain **181 artifact records**: 98 upstream artifact records and 83 independent review artifacts. Every mapped compressed artifact has independently verified compressed/decoded lengths, SHA-256 hashes and a zero gzip timestamp. The mapped receipts are byte-identical to their original receipts. The 27 upstream execution snapshots already reconstructed in source review remain preserved through those exact mappings.

The actual published PR241 source `29491c2842e0aedcb00a674cbfffb9edc2424013` remains an ancestor. Relative to its 1,033 non-documentation entries, the complete G35–G37 candidate modifies 11 paths, adds 10 and deletes none. G37 alone changes 16 paths over its frozen G36 baseline. Full whitespace checking passes against both the earlier main baseline `8e836baa877b676a863c877003e277b638fc5061` and observed main `01f6f4feca051d68de24a04299cd3bb444bce40c`; this does not change the candidate's actual stack ancestry.

## Completed qualification and retained initial run

| Root command | Initial source | Corrected source |
| --- | --- | --- |
| `npm test` | 2,914/2,914 | **2,915/2,915** |
| `npm run typecheck` | Four projects pass | Four projects pass |
| `npm run test:build-policy` | 58/58 | 58/58 |
| `npm run check:boundaries` | 244 production files / 157 core modules | 244 production files / 157 core modules |
| Default application build | Pass | Pass |
| Demo application build | Pass | Pass |
| Native updater fixture preparation, `--build-only` | Strict compilation, 37 modules | Strict compilation, 37 modules |

Every command records the expected command arguments, exact qualification source/tree, zero exit status and ordered start/end timestamps. Complete raw outputs match their recorded lengths and hashes; parsed case counts match the receipts. The corrected full output includes the maintained idle-expiry regression, which is absent from the initial output. Overlapping full-suite, policy and focused counts are not added together.

The corrected seven-command run lasted **2026-11-20 21:28:47.204447–21:30:43.229465 UTC**. Its complete full-suite log is **288,677 bytes**, SHA-256 `3982d7a24d64c9519c574761ca99ea24cc003153c59b214037e873bafe147420`.

The initial seven-command run lasted **21:14:34.454707–21:16:32.867353 UTC**. Its complete full-suite log is **288,552 bytes**, SHA-256 `5a60c32e58ea84ce6e24f74e898201f33cdaea165837def7a6904c62b62b70b2`. That passing result predates the discovered defect and is retained as historical initial-source evidence. It is not the corrected-source verdict.

The initial receipt, seven original logs and all 27 ordinary build files were preserved before the corrected run. This supplement separately snapshots both complete receipts, all 14 logs, both sets of 27 build files and the six immutable mapping/preservation records. Every original file still matched its snapshot when verification completed; no mutable integration index was reused for later mappings.

## Build outputs, graphs and native limits

Both ordinary profiles have exact recorded output inventories: 13 default files and 14 demo files, including each profile's local build receipt. All asset bytes and hashes match the corresponding qualification receipt. The preserved initial 27 files and freshly qualified corrected 27 files are byte-identical. This is expected for unchanged ordinary profiles; it does not substitute for execution of the separate configured Solana browser journey.

The default graphs contain 102 document, 30 Worker and four QR modules. Demo contains 104 document, 30 Worker and four QR modules. Every listed tracked-module hash matches the corresponding qualified Git source; every listed dependency hash matches the installed dependency bytes. Graph membership remains unchanged from G36, with no local Solana profile or executable updater entering the ordinary graphs. Content policy retains empty connection origins and `connect-src 'none'`. QR remains without private runtime or network authority. Build receipts retain unsigned/unaccepted release status and do not claim a complete XSS proof.

The root native updater preparation log reports strict compilation of 37 modules, the matching ordinary Worker and graph fingerprints, `nativeExecuted=false` and `ReleaseEnabled=0`. It is build preparation. Separately, all 70 tracked input hashes for the native funding companion's prior build-only compilation still match the corrected source. Its three compiled output chunks remain retained and unexecuted. No second companion compilation or new native acceptance is inferred from the correction.

## Packaging review and retained supplement

The root packager was read and syntax-parsed at **21:37:46.243158 UTC**, without executing it. The reviewed 19,099-byte script has SHA-256 `af1911e6d316514cad328740b24aa1eb73fd39a3a582d7a08b67c79f2468c296`. Its assertions bind the corrected qualification to the reviewed source, preserve the initial run separately, validate saved log/output hashes, require both independent indexes, retain separate immutable mappings and keep release/native-execution claims disabled. Its dated parent-hosted observations keep their own source and target; they are not G37 acceptance. Root owns actual packager execution and final package verification after this supplement is integrated.

The read-only composition verifier completed successfully from the clean independent source-review commit at **21:36:50.043282–21:36:52.158527 UTC**. Its complete 670-byte output has SHA-256 `3f8bf736427e4f213af45808fa3bbfc5e811e561c01505630a8506e0e17a1c88`. The verifier, capture wrapper, exact executed script, source-tree manifests, original input snapshots and detailed result are retained with raw/compressed hashes and zero gzip timestamps in the [composition review index](browser-funding-flow-composition-review-generation37.json).

No blocker remains in the corrected source/evidence composition. Actual current-source/current-target hosted execution of the new funding/promotion journey and matching owner authorization remain separate. **`ReleaseEnabled=0`.**
