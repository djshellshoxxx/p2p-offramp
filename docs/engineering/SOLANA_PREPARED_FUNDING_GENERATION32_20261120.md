# Generation 32: explicit native Solana funding preparation

The native escrow client now exposes a separate `prepareFunding` method. It returns a frozen, privately held funding review after persisting the exact unsigned message. A caller can show that review and request explicit confirmation later. Confirmation reuses the existing one-shot capability, finalized-state revalidation, encrypted journal and single-send lifecycle. Preparation itself never asks the wallet to sign or broadcasts a transaction.

This is an intentional feature extension. The existing `prepare(..., 'fund')` refusal remains `INVALID_INPUT`, and `PreparedSolanaActionKind` still contains only release, refund and payout. The browser recovery protocol and controller remain exit-only. The change adds no default activation, mint policy, deployment, endpoint or trust authority. Existing direct `fund()` semantics remain intact.

## Exact source and scope

| Item | Identity |
| --- | --- |
| G31 baseline | `8d566f0e46ee76ee35a957cab0a4358a3da4aeb3` |
| Baseline tree | `99047cf4675fbc299d700eec51d9b388da6707fe` |
| Initial source | `800e633dc47c3bd24065093b50bdc78fa709d3ab` |
| Initial source tree | `1ed7fc7a7181e0ee964183642e01319468316fce` |
| Final source | `252dd1603f12eab69313ef25b538be1b040bc508` |
| Final source tree | `65667d0089b986250b5f8697518863069368d855` |
| Final source parent | `800e633dc47c3bd24065093b50bdc78fa709d3ab` |

The entire source change is three paths: [`compose.ts`](../../packages/chain-solana/src/compose.ts), the new [`prepared-funding.test.mjs`](../../packages/chain-solana/test/prepared-funding.test.mjs), and the [package README](../../packages/chain-solana/README.md). The final commit wraps five fixture statements to meet the existing package line-length gate. It changes no assertions, string literals or production bytes. All other **2,993** baseline entries retain exact Git mode, object type and identity; no file is deleted. The baseline has 2,995 entries and the final source has 2,996. The [receipt](../execution/solana-prepared-funding-generation32-20261120/receipt.json) binds the complete patch, individual changed-file hashes and the source tree.

## API and ownership

```ts
prepareFunding(
  trade: BoundSolanaTrade,
  session: SolanaWalletSession,
  options?: FundOptions & RebuildOption,
): Promise<CoreResult<PreparedSolanaFunding>>;
```

`PreparedSolanaFunding` retains the original private brand and immutable display fields while fixing `action` to `'fund'`, `role` to `'seller'`, `expectedEscrowState` to `'absent'`, and `shape` to the funding member of `PlanShape`. The existing exit view remains unchanged. `confirm` and `cancel` accept the union of the two views; their implementation bodies are unchanged. Both views refer to the same private per-client capability map, so copied, serialized or foreign-client objects grant no authority.

The new entry captures its options synchronously before entering the serialized queue. It accepts only the plain own data properties `sellerTokenAccount` and `rebuildOf`, including a null-prototype object. Unknown names, symbols, accessors and non-plain objects are refused. A supplied source account must pass existing canonical address validation with `INVALID_INPUT`, and a replacement identity must pass existing `parseIntentId` validation. The captured object is frozen. Later caller mutation cannot redirect the source account or replacement identity, even while the request waits behind an outstanding wallet call.

`prepareReview` selects existing `planFund` for the distinct funding entry and stores the same captured planner closure used by both pre-sign and post-wallet revalidation. Those checks compile with the original blockhash and compare exact reviewed message bytes. The underlying reader and planner continue to enforce the original seller, deployment, profile, absent-escrow, deadline, finalized freshness, SOL/original-SPL and freeze-authority rules. Source-account ownership, balance and execution remain program checks; preparation creates no new proof of them.

The lifecycle preserves immediate single-use consumption, durable journal persistence before signing and sending, original-message checks after delayed wallet responses, physical wallet serialization until settlement, and compare-and-swap ownership across tabs. Cancellation cannot retract a marked intent or release the pending physical wallet operation early. Uncertain sends are observed without resending. A definitively dropped intent requires an explicit replacement identity before another funding preparation; other terminal-outcome rules are unchanged.

## Verification and retained failures

The [author receipt](../execution/solana-prepared-funding-generation32-20261120/receipt.json) retains all nine original command receipts, complete outputs and pre-command patches. Every compressed output and patch uses deterministic gzip with `mtime=0`; both original and compressed SHA-256 hashes are recorded. Commands include their actual arguments, UTC times, source identity, file hashes and before/after worktree status. The baseline and failed package run remain separate from successful later runs.

| Check | Result and interpretation |
| --- | --- |
| Missing-capability baseline | 50 reported tests: 1 pass, 49 fail. The existing exit-only refusal control passes; 46 explicit absent-method assertions and three nested aggregate failures identify the intentionally missing dedicated API. |
| Initial focused funding selection | 50/50 pass. |
| TypeScript | All four repository projects pass: core, web runtime, Worker and UI. |
| Initial source whitespace | Full main-to-staged-source check passes, with no exclusions. |
| Initial frozen Solana package | 366/367 pass. Its sole failure is the existing 120-character line bound in the new fixture. |
| Import boundaries | Pass: 242 production source files and 155 core graph modules. |
| Corrected boundary and funding selection | 55/55 pass on the exact final source patch. |
| Corrected source whitespace | Full main-to-staged-source check passes, with no exclusions. |
| Final frozen Solana package | 367/367 pass at clean final source `252dd1603f12eab69313ef25b538be1b040bc508`; zero failed, skipped, cancelled or todo tests. |

The selections overlap, so their test counts are not additive. The package run includes existing exit-preparation, direct-funding, reader, planner, wallet, journal and recovery coverage. It is a bounded package selection, not the full repository suite.

The initial focused and typecheck receipts predate a README-only clarification. Their implementation bytes equal the final source, and the maintained fixture differs only by the five subsequent line wraps. The [formatting equivalence receipt](../execution/solana-prepared-funding-generation32-20261120/formatting-equivalence.json) exhaustively lists those exact replacements and verifies that applying only them produces the entire final fixture byte for byte. All earlier snapshots are retained. No assertion or timeout was relaxed.

Two optional attempts to automate a parser-based formatting comparison failed before comparison: the installed TypeScript 7 package does not expose the assumed `ScriptTarget` API, and `esbuild` is not installed as a direct dependency. Their recovered tool error transcripts are labeled as recovered diagnostics rather than original command-capture receipts. The exact replacement proof above supplies the completed formatting check without installing or modifying dependencies.

The focused funding cases cover native SOL, original SPL with default and explicit source accounts, exact immutable views, synchronous option capture, invalid options before asynchronous work, seller/session/profile/deployment binding, copied and foreign capabilities, single confirmation, delayed-response freshness, existing mint admission policy, cancellation, recovery CAS competition, modified records, uncertain durable markers, explicit dropped replacements and reconciliation without resend. One case uses the maintained `EncryptedVaultService` and `SolanaVaultJournal` over a controlled store: locking during a held wallet response retains physical serialization and prevents late signature persistence or sending.

## Environment and evidence separation

The isolated author worktree is `p2p-solana-prepared-funding-g32` on `codex/solana-prepared-funding-g32-20261120`. Its physical `node_modules` directory was copied with `cp -al` from `p2p-continuation-g31`; shared package files are immutable hardlinks, and the directory is not a symlink. The receipt verifies representative shared inode identities. No package installation, dependency update or lockfile change was performed. Runtime versions are Node `v24.22.3`, npm `11.19.1` and TypeScript `7.0.2`.

Source commits and this documentation-only evidence commit are separate. The [non-docs tree manifest](../execution/solana-prepared-funding-generation32-20261120/source/non-docs-tree.json) records all **1,030** non-docs entries at the final source. Evidence packaging preserves them exactly. The supplementary [source-and-evidence whitespace receipt](../execution/solana-prepared-funding-generation32-20261120/10-source-and-evidence-whitespace.json) identifies the staged tree checked before that receipt was added and records both the staged diff and complete diff from recorded main `8e836baa877b676a863c877003e277b638fc5061`, without exclusions.

## Integration limits

The [accepted D5 and D8 decisions](../adr/ACCEPTED-DECISIONS-2026-11-04.md) remain authoritative. This change follows the existing native SOL/original-SPL custody policy and touches preparation for signing, so it is Tier C. Local implementation approval does not establish merge approval. The coordinating worker must record applicable owner authority, current-source/current-target hosted gates, independent review and any required native acceptance before integration.

Controlled client, Wallet Standard, RPC and encrypted-journal fixtures demonstrate local behavior. They do not establish execution of the new preparation path in a native browser or validator. Previous direct-funding acceptance does not cover this new entry automatically. No artifact build, browser, validator, financial flow, remote write, default activation or real-fund operation ran in this author task. Browser funding composition remains separate work. Independent reviewer results and combined qualification are owned and recorded separately.
