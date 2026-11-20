# Independent generation 36 combined qualification review

## Result and exact composition

The completed root qualification and combined-source provenance pass independent review. All **2,864/2,864** full Node cases passed, as did the six remaining qualification commands. Both component patches landed unchanged, and all 1,038 non-documentation entries match the independently reviewed combined source. There are no unresolved material findings. This review inspected completed evidence and existing output files; it reran no tests or builds.

| Checkpoint | Exact identity |
| --- | --- |
| Recorded frozen published PR 241 ancestor | `29491c2842e0aedcb00a674cbfffb9edc2424013` |
| Qualified G35 source | `ea3ee7f5b5d36456616bd9fef893257327560a10` |
| Packaged G35 component parent | `98f75c23fe0db47f28fa5d7221048b631bc68b96` |
| Original admission → combined admission | `3283940bae1a2d4e7baabed66878ecb5d977bfb1` → `54fb841a5d182da2929d71cbde087adea55e115f` |
| Original companion → qualified combined source | `d36be3c5348b94d39836b73a3e0b9e864ff0a669` → `b785a01ffc54a75d497641d0e758d077adff41d0` |
| Complete qualified combined tree | `f6cad0ba726fc8a077a54cb5610f2032e3cd0242` |
| Independent review parent of this supplement | `97a9112848f6f1365392f252a39084a591ac36ff` |

Complete binary patches match byte for byte for both source mappings. The packaged G35 parent has the same non-documentation entries as its qualified source. G36 changes exactly twelve source/test paths: nine modified, three added and none deleted. All 1,038 non-documentation Git entries, including both Gitlinks, match `d36be3c`; prior published documentation entries remain unchanged. Local Git ancestry confirms the recorded frozen PR 241 head is an ancestor. No live remote state was refreshed or inferred.

Both reviewed component evidence patches also map unchanged into root: author `1d14b1a` to `15bb293c` adds 27 documentation paths, and companion `2e07fe01` to `a1c9c182` adds 42. Their complete binary documentation patches match and leave source intact. Full whitespace comparisons against both the recorded PR 241 ancestor and main `8e836baa877b676a863c877003e277b638fc5061` pass without exclusions.

## Completed root commands

The root batch ran from **2026-11-20 20:40:35.918385 to 20:42:30.030745 UTC**. Its finalized original receipt identifies the exact source/tree throughout, a clean tracked source at completion and `nativeExecuted=false`. Each full log's length, SHA-256, exit code and counters verify; command timestamps are sequential and bounded by the batch.

| Root command | Verified result |
| --- | --- |
| `npm test` | **2,864/2,864**; zero failures, cancellations, skips or todos |
| `npm run typecheck` | All four maintained TypeScript projects pass |
| `npm run test:build-policy` | **58/58**; zero other outcomes |
| `npm run check:boundaries` | **244 production source files / 157 core graph modules** |
| Default static build | 12 listed assets, **817,257 bytes** |
| Synthetic-demo static build | 13 listed assets, **829,355 bytes** |
| Existing update-runtime fixture `--build-only` | Strict compilation of 37 fixture modules; no native/browser execution |

The complete Node log is 283,891 bytes with SHA-256 `d7848eb158610f183e7be22060490860ae940ff4d292b47c349b584e627244c1`. Its 2,864 cases exceed G35's 2,817 by 47; overlapping component selections are not added to either total. Original npm configuration warnings remain retained.

The full Node log includes the successful maintained case building and inspecting the separate local-Solana Worker/profile, its exact policy and release refusal. This is configured artifact coverage, not execution of the companion native Solana browser driver.

## Actual artifact and module verification

Every actual file in both output directories is accounted for. Each listed asset matches its length/hash; each graph matches its bytes and structure; both build-evidence manifests match the original receipt. All **27 actual files**, including those two manifests, are byte-identical to the prior generation's retained outputs.

| Profile | Listed assets | Files with evidence manifest | Document graph | Vault Worker graph | QR Worker graph |
| --- | ---: | ---: | ---: | ---: | ---: |
| Default | 12 | 13 | 102 | 30 | 4 |
| Synthetic demo | 13 | 14 | 104 | 30 | 4 |

All **274 module references** verify. The 252 repository references match actual files and immutable qualified Git blobs; the 22 dependency references match immutable installed files in both root and reviewer worktrees. No local-Solana profile or chain-Solana implementation enters either ordinary graph. Existing document/Worker separation remains visible: compatibility, retention preview and sharing stay in the document, while the retention service stays in the vault Worker. The executable release updater remains absent. The emitted default entry retains captured `import.meta.url` and lazy offline-root linkage.

Both policies retain empty connection origins and `connect-src 'none'`. Release, testnet, signing, release-acceptance and framing flags remain disabled. The static boundary count of 157 is distinct from emitted graph sizes. These are source/artifact observations, not runtime-isolation or complete XSS proofs. **`ReleaseEnabled=0`.**

## Build-only preparation and retained checker correction

The seventh command is existing controlled update-runtime fixture preparation. Its final JSON matches the original receipt. The emitted Worker hash and three default graph hashes/counts match the actual current build. Its strict compilation count and module digest match G35. Temporary preparation module bytes are not claimed to have been retained or independently recompiled, and no generated code was executed by this review.

One reviewer checker initially compared the entire preparation object with G35. That assertion failed because `publicCorpusSha256` is a per-run fixture identity. Source inspection follows `publicCorpus()` through `locatorFixture()` to the unchanged release fixture, which generates a fresh ephemeral P-256 keypair and signatures. Its public key and signatures enter the corpus. Current digest `162edf335b6934f537a68378298790b65616d7dcf73cf7bd05bdb708f3a38538` therefore differs from prior `262de3e285809f2efd7170de5e60d0db05ae1a519a26e48ff48126c42905c964`, while every stable preparation field matches.

The failed checker source, complete traceback and execution metadata remain unchanged. Its exact start time was not captured and is not invented. The corrected checker preserves both per-run identities, verifies the unchanged source chain and stable fields, and passes. This was a reviewer evidence-check assumption, not a failing source test or weakened product assertion. No source suite/build reran. Two read-only search misses are separately labeled recovered diagnostic summaries, not original validation logs.

Relevant unchanged source: [preparation driver](../../scripts/test-update-runtime-browser.mjs), [locator fixture](../../packages/security/test/lib/locator-fixture.mjs), and [ephemeral release fixture](../../packages/security/test/lib/release-fixture.mjs). Their frozen hashes and both actual corpus identities are recorded in the machine receipt.

## Concurrent documentation-index append

A final packaging check initially required every original scratch metadata file to remain unchanged after capture. Root had meanwhile appended the completed source-review mapping (`97a9112` to `cad6ba1`) to its coordinator index. The captured two component entries remain byte-for-byte intact as the prefix of the later three-entry index. The newly appended mapping's complete 23-path documentation patch also matches exactly. All original qualification logs, receipts and output files remain unchanged.

The initial packaging stdin script, complete output, exact staged tree/binary patch and failure metadata are retained, together with both index snapshots and the successful append-verification proof. The failed command's precise start time was not captured and is not invented. The captured index was not rewritten to describe a later moment. This is a concurrent documentation bookkeeping change; it does not alter qualified source or test attribution.

## Retention and scope

This supplement retains the completed original root receipt, seven full logs, complete source patches, root source/evidence mappings, prior G35 receipt, all 27 actual ordinary files, both checker versions/results, and capture/packaging sources. Every retained artifact has raw/compressed lengths and SHA-256 hashes with reproducible gzip `mtime=0`.

The independent 168-case selection remains attributed only to exact `d36be3c`; root's separate 2,864-case qualification belongs to `b785a01`. Documentation packaging is not another test execution. The companion's earlier 70-module Node-driver compilation remains separate from the 37-module update-runtime preparation.

G35/G36 remain local inputs to the next actual seller browser funding candidate above frozen PR 241. No standalone G36 PR, remote publication, native browser/validator execution, financial journey, activation, peer acceptance or merge authority follows from this review. Current-source/current-target hosted checks and later funding preparation/confirmation remain separate gates.

- [Machine-readable composition review](solana-funding-admission-composition-review-generation36.json)
- [Independent source review](INDEPENDENT_SOLANA_FUNDING_ADMISSION_REVIEW_GENERATION36_20261120.md)
- [Independent source/evidence index](funding-admission-independent-review-generation36.json)
