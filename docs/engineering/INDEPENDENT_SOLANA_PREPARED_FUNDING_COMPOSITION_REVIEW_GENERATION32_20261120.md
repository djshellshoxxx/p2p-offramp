# Generation 32 independent combined prepared-funding qualification review

## Result and frozen composition

The combined source preserves the independently reviewed client and native acceptance driver exactly. All seven root qualification commands passed on that frozen source. Independent provenance verification passed without rerunning the suite or builds: every complete command log, all 25 emitted assets, six module graphs and 274 module references matched the recorded source and retained evidence. No actionable composition or evidence finding was identified.

Reviewed combined source: `5f9fd0a0f2f6d5bf16bcc21fb38a5e2ae0559031`, tree `d3b738a378218927d86241a1db987a57af87eec8`. Its three-commit source chain starts from actual published generation 31 / PR 239 head `708a3a2bc167cbbc15eaa3d3c168e058499c7f8e`:

| Original frozen source | Combined source equivalent | Verification |
| --- | --- | --- |
| `800e633dc47c3bd24065093b50bdc78fa709d3ab` | `5124bbac57e7a45d51efc5b5d7d08d4edf1328d5` | Exact complete binary patch; ordered parent checked |
| `252dd1603f12eab69313ef25b538be1b040bc508` | `924109d3351bbe88bfbcbff9ed8e2e973f835e33` | Exact five-statement line-wrap correction patch; ordered parent checked |
| `e214f70f8bcbb9eb962fc147f2d318081daca2ce` | `5f9fd0a0f2f6d5bf16bcc21fb38a5e2ae0559031` | Exact native-driver patch; ordered parent checked |

The complete source delta changes only the client composition module, package README and native driver, and adds the prepared-funding fixture. Every other entry from the published parent is unchanged. All 1,030 entries outside `docs/` are exact reviewed `e214f70` entries, including their mode, type and Git object ID. The published parent's 1,029 entries outside `docs/` equal the original generation 31 source underlying the author branches. No documentation, tests, configuration or unrelated source was silently discarded during composition. The complete main-to-source whitespace check passes without exclusions.

The [client review](INDEPENDENT_SOLANA_PREPARED_FUNDING_REVIEW_GENERATION32_20261120.md) and [native-driver review](INDEPENDENT_SOLANA_PREPARED_FUNDING_NATIVE_REVIEW_GENERATION32_20261120.md) retain their separate scopes, exact source identities and original failure history. This supplement binds their source union to root's completed qualification. The independent 98-case client selection and two controlled driver-helper cases remain separate from root's full suite.

## Completed root qualification

Root ran the seven commands from **19:33:40.216887 through 19:35:29.992690 UTC on 2026-11-20**. The receipt records the same source and tree at completion, a clean tracked checkout, and no native execution.

| Command | Verified result |
| --- | --- |
| Full Node suite | **2,654 passed**, zero failed, cancelled, skipped or TODO |
| TypeScript | All four configured projects passed |
| Build policy | 58 passed, zero other outcomes |
| Import boundaries | 242 production source files; core entry graph visits 155 modules |
| Default artifact | 12 files, 817,257 bytes; document/core-worker/QR-worker graphs contain 102/30/4 modules |
| Demo artifact | 13 files, 829,355 bytes; graphs contain 104/30/4 modules |
| Native updater fixture preparation | 37 modules compiled strictly; build-only, `nativeExecuted=false` |

The complete full-suite output is 267,573 bytes with SHA-256 `94209a7cdcdbaf7773bce37da3745bb8659a848ae2e91afbc50029bf2c10427b`. The independent checker re-derived all reported test counts from the original complete outputs and checked their sizes and hashes before compression. All seven original outputs and the finalized root receipt are retained in deterministic gzip with zero timestamps and separate hashes for raw and compressed bytes. The increase from generation 31's 2,604 reported cases is exactly the new funding fixture's 50 reported cases; this arithmetic does not claim 50 wholly independent behaviors.

The maintained full-suite case `emitted native Worker artifact requires its own library profile, exact CSP and unchanged release refusal` passed and built the explicit Solana-localnet profile with its maintained fixture. That case checks the client composition's presence in the native Worker graph, local-only policy and refusal in ordinary build scanning. Its temporary build is removed by the maintained test. This is compilation/policy evidence, not native validator or browser acceptance, and no second native-profile build was performed by this reviewer.

## Artifact and isolation readback

Every file in both actual ordinary artifact directories is accounted for by the recorded manifest plus its evidence file. All asset byte counts and SHA-256 hashes match. All six graphs match their recorded JSON and hashes. Each of the 274 graph references matches the actual root source/dependency file and the review checkout; every repository module additionally matches its frozen Git blob. Dependency files are checked as immutable dependency bytes rather than misclassified as tracked repository source.

Both ordinary artifact manifests and all their graphs are exactly the previous generation 31 qualification outputs. The new native funding code remains absent from both ordinary module graphs. Startup guidance, generic sharing and retention preview stay in their existing document graph; retention service stays in the Worker graph. Executable update modules remain absent. The shared-entry URL capture is preserved in the emitted entry artifact.

Both content policies retain `ReleaseEnabled=0`, no connect origins and `connect-src 'none'`; signed-release, release-acceptance, testnet and framing-attestation claims remain false. The existing updater fixture's emitted Worker is still `assets/vault.worker-yOnLqpF_.js`, SHA-256 `d3bc5bf253cf1e30914a932e126d2d41bedc19d217d9baa94748975243c04165`. Its recorded default graphs and strict 37-module preparation agree with the current artifacts. The updater preparation is separate from the new Solana funding path and qualifies neither path for native execution.

## Handoff and remaining acceptance

The [machine receipt](solana-prepared-funding-composition-review-generation32.json) and [retained evidence](evidence/solana-prepared-funding-composition-independent-review-generation32/) provide the exact source mapping, completed root receipt, complete logs, readback script and independently checked artifact metadata. This reviewer made only documentation changes and did not rerun a full suite, build, browser, validator or financial flow.

The updated native SOL/SPL driver still requires actual hosted execution on the intended final source and target. Prior direct-funding results, the two controlled helper probes, the native-profile build and the updater's build-only fixture are not substitutes for that acceptance. Applicable Tier C hosted gates and recorded owner authorization remain required for the eventual merge decision. Nothing in this review authorizes release, deployment or real-funds operation.
