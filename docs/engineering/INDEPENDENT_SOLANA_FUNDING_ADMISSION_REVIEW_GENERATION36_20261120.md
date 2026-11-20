# Independent generation 36 admission, inventory and evidence review

## Result

The frozen proposal-admission implementation and browser-driver companion pass independent source and evidence review. There are no unresolved material findings on either the accepted G36 contract or the existing controller/session/lease conventions. The reviewer made no production changes. **168/168 selected cases passed on the exact combined source**, including nine original probes; UI TypeScript and static import boundaries also passed.

| Identity | Exact value |
| --- | --- |
| Qualified G35 source / review baseline | `ea3ee7f5b5d36456616bd9fef893257327560a10` |
| Admission source | `3283940bae1a2d4e7baabed66878ecb5d977bfb1` |
| Admission tree | `df931285bd7e1818db6736ba968930375bd6cb68` |
| Reviewed combined source / actual independent execution source | `d36be3c5348b94d39836b73a3e0b9e864ff0a669` |
| Reviewed combined tree | `559034449fe590f42cbd11adaad8b4b850ec818b` |
| Admission evidence commit | `1d14b1a32f74869d1dae7b1e65e9ef9f0a62408c` |
| Companion evidence commit | `2e07fe01926275c4c5fe888bde2225791fe44163` |
| Full whitespace baseline, without exclusions | `8e836baa877b676a863c877003e277b638fc5061` |

The combined source changes twelve paths relative to G35: nine modified and three added. It contains 1,038 entries outside documentation, including the existing Gitlinks. The companion is a direct child of the unchanged admission commit. The independent selection ran once on that combined source; it is not reported as a separate test run of the admission commit.

## Contract and source review

The five production changes stay within the existing local-Solana controller, protocol, validation, document client and maintained TSX root. The single new exact command admits bounded public proposal text into a separate encrypted inventory. It retains the maintained G35 decoder and derives a new binding from independently installed configuration. The funded-recovery parser, exit-only recovery action union and existing authority-bearing review commands remain separate.

Duplicate admission compares the complete canonical document and full binding, returning the original private payload and profile provenance without a write. This still works at capacity, after restore and for a historical configuration. An unexpected prospective ID occupied by any record family is refused. Funded recovery for the same binding blocks new proposal admission; a conflicting unfunded proposal cannot veto a legitimate funded-recovery import when the existing quota permits it.

Escrow conflicts compare the actual address within its genesis scope and the canonical genesis/program/seller/nonce reservation. Historical registry or deployment aliases therefore cannot disguise a shared escrow. The eight-binding quota counts the union of funded and proposal families, treating a paired binding as one. Admission is limited, while authenticated mixed-version overflow remains readable and funded exits remain usable.

Activation decodes into staged maps, checks epoch ownership after asynchronous work and installs only a complete current inventory. Historical mismatches stay visible without installing retained endpoints, registries or margins. Proposal load/import performs no RPC, wallet connection, intent preparation, signing or sending. Existing funded-trade refresh remains its own path. Collision grouping uses linear map/set passes rather than nested pairwise scans; this preserves responsiveness within the existing 10,000-record / 8 MiB vault bounds without introducing speculative pagination.

The new command captures plain own data before asynchronous work and retains the existing session, abort, revision/CAS and atomic-write guards. Post-await checks reject retired requests. The document client immediately blanks proposal data and capacity during profile transitions. Wallet-only changes can retain saved data without retaining wallet or review authority. The actual maintained UI reserves the existing request slot, clears submitted/private input as ownership changes and suppresses stale results. Its proposal card displays all fifteen fixed terms and saved/provenance/configuration/conflict status, without a funding or confirmation control.

Relevant source: [controller](../../apps/web/src/solana-localnet/controller.ts), [protocol](../../apps/web/src/solana-localnet/protocol.ts), [command validation](../../apps/web/src/solana-localnet/validation.ts), [document client](../../apps/web/src/solana-localnet/client.ts), [maintained UI](../../apps/web/src/solana-localnet/SolanaLocalnetRoot.tsx), and [vault limits](../../packages/schemas/src/vault.ts). The machine index records the exact Git entries and SHA-256 hashes for all twelve changed paths.

## Independent executions and original probes

| Execution on exact combined source | Result |
| --- | --- |
| Adjacent maintained selection plus original probes | **168/168**: 159 maintained cases and nine original probes; zero failures, cancellations, skips or todos |
| Maintained UI TypeScript project | Pass |
| Static import-boundary check | Pass: **244 production source files / 157 core graph modules** |
| Full main-baseline whitespace | Pass, no exclusions |

The single test execution ran from **2026-11-20 20:39:50.929598 to 20:40:14.099328 UTC**. Its complete 13,611-byte output has SHA-256 `92e9f5639a16dc415d00d3412e171de2933fbb1a462bc713d2dfe5dff0eeadad`. Every command started and ended on the same clean committed source/tree. The external original-probe file is retained separately for each command, with its exact hash. The earlier source-inspection metadata names the then-checked-out admission source; it is not a test execution receipt.

The nine new probes independently exercise:

1. Eight real encrypted CAS admissions, unchanged duplicate at full capacity, ninth-binding refusal and zero proposal-side RPC/wallet/sign/send effects.
2. Restored historical-configuration duplicates preserving the exact padded original payload and origin without a write.
3. Historical network/deployment/registry aliases reserving the same canonical escrow seed tuple.
4. Funded-recovery precedence over an unfunded conflicting proposal, accurate conflict inventory, working recovery export and refusal to connect a wallet through the proposal hash.
5. Nine proposal bindings plus one paired funded recovery loading at capacity nine, refusing new admission while an existing controlled seller release review can be prepared and canceled.
6. A non-trade preference occupying the prospective proposal ID remaining unchanged.
7. A profile lock during held hashing retiring the import before storage.
8. A wallet change during held hashing retiring the import before storage.
9. A profile lock at the atomic CAS boundary preventing a late write.

These probes use the actual maintained controller, codecs, encryption and backup services with an in-memory store and scripted native fixtures. The controlled exit review in probe five is preparation/cancellation of an existing funded recovery; it does not sign or send a transaction. Maintained tests supply the broader request-shape, staged activation, stale lease, immediate document-client redaction and UI request-ownership coverage. Counts overlap author selections and are not added to them.

## Native companion review

The [proposal-aware evidence wrapper](../../scripts/lib/solana-localnet-send-evidence.mjs) recognizes only the exact G35 proposal format and validates it using the maintained decoder. All remaining records reach the unchanged strict recovery/journal reader. Unknown or malformed records still refuse. Both original `readSolanaVaultRecords` and `assertSolanaSendMarked` bodies are byte-identical; the fixture changes only its imported reader name and awaited call.

The [native browser driver](../../scripts/test-solana-localnet-browser.mjs) uses the actual proposal textarea, save button and inventory card for its already-defined absent escrow. It checks full canonical terms and binding, installed configuration, original provenance, encrypted-row contents, one revision increment and no additional wallet connection, signing prompt or send. Existing restore and real idle-lock journeys retain the exact private proposal and input/redaction assertions. All 190 original driver lines remain in order, with 34 additions. Existing financial assertions, chain-time waits, fixtures and send proof remain unchanged.

The companion's eight controlled oracle/send-evidence cases are included in the independent 168-case selection. Its build-only compilation follows 70 repository modules and emits three chunks totaling 417,221 raw bytes with zero warnings. Every input hash matches the frozen Git source, and all output hashes and compressed bytes verify. The driver was not executed. Its connect/prompt/send counters do not assert a browser-side RPC counter; proposal zero-RPC behavior is separately established by controlled controller probes.

## Evidence integrity and retained failure history

Independent inspection verified **all 63 compressed component artifacts** against their raw/compressed lengths and hashes, zero gzip timestamps and existing original files. All **16 captured execution trees** reconstruct exactly from their recorded base commits and retained binary patches using isolated temporary Git indexes. Original execution receipts are unchanged, including the early uncommitted snapshots. The author evidence commit adds only 27 documentation paths and retains all 1,037 non-documentation entries; the driver evidence commit adds only 42 documentation paths and retains all 1,038 entries.

The admission baseline contains all 26 intended missing-command/inventory failures. The driver's first baseline reports 4/7 passes and three failures because three negative assertions also accepted a missing helper; that full output remains preserved. Its corrected helper-presence guards produce one legacy pass and six intended missing-helper failures. Final passing assertions were not weakened. These baselines are distinct executions and are not claimed to reach later behavioral assertions.

The two external driver source-verifier versions differ only by five later additive selector-check lines. The earlier version is explicitly reconstructed by reversing that edit, and its execution mapping hashes verify. This establishes consistency of the retained versions; it does not manufacture a contemporaneous external-script capture. Recovered setup path/glob diagnostics stay labeled as summaries, not original validation logs.

All author and companion report claims were checked against their actual source and evidence scopes. The review retains its own full logs, original receipts, probe snapshots, source patches, evidence-verifier source/result, packaging source and copies of both component manifests. Python-produced retained files have reproducible gzip bytes with `mtime=0` and dual hashes. The three original Node compilation gzip files retain their exact original compression bytes.

## Limits and next composition boundary

This review establishes the local admission/inventory contract and the integrity of retained controlled evidence. It does not establish physical-wallet acceptance, DOM/IndexedDB behavior, actual native browser execution or chain finality. No reviewer full-repository suite, build, browser, validator, financial journey, external target, dependency install or production change occurred.

Root owns the combined seven-command qualification and a separate review of its completed receipt. Current-source/current-target hosted native acceptance and later seller wallet/funding/confirmation work remain separate gates. No automatic promotion, peer acceptance, release or merge authorization follows from saving a proposal. No standalone G36 PR is asserted. **`ReleaseEnabled=0`.**

- [Machine-readable independent review and retained artifacts](funding-admission-independent-review-generation36.json)
- [Admission source/evidence report](SOLANA_FUNDING_ADMISSION_GENERATION36_20261120.md)
- [Native companion source/evidence report](SOLANA_FUNDING_ADMISSION_BROWSER_DRIVER_GENERATION36_20261120.md)
