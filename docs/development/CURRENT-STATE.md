# Current state — refreshed 2026-11-09

**Latest continuation:** [2026-11-09 source review, local checks and next actions](2026-11-09-core-review.md). Draft #57 corrects Solana payout guidance; draft #58 removes the post-send 4001 shortcut. RQ00 evidence admission is the current isolated tooling lane. Full D9 and contract-wallet execution remain unfinished. The detailed sections below retain the 2026-11-07 baseline except for explicitly corrected inventory statements.

Live GitHub state was refreshed with `git fetch` of every branch and `refs/pull/*/head`, plus the GitHub API, on 2026-11-07. This file replaces older handoffs only where it cites newer, commit-pinned evidence. Machine-readable ledger: [`task-ledger.json`](task-ledger.json). Running log: [`AUTONOMOUS-PROGRESS.md`](AUTONOMOUS-PROGRESS.md).

## 1. Branch and commit inventory

| Ref | SHA | Notes |
| --- | --- | --- |
| `main` | `300287d` | Last merges: #34, #30, #52 (all docs-only). Latest push CI on `300287d`: Specification inventory, EVM escrow, Vault foundation, CodeQL all **success**. |
| `codex/core-continuation-20261104` (PR #54) | `edc66f6` | 16 commits on `a7e3062`. Contains PR #53 (`77fb7c5`) as an ancestor. All 12 hosted checks green. 11 unresolved bot review threads (2 Major, 2 Medium, 7 Minor) at the time of this refresh. |
| `claude/vibrant-cray-ny4gum` (this work) | see PR | PR #54 head + merge of `main` + fixes for the PR #54 review threads + this inventory. |

**127 remote refs** exist (75 branches, 52 PR heads). Older `work/*`, `autonomous/*` and `fix/*` branches belong to merged or closed PRs (#15–#25) and are archival. None was deleted.

## 2. PR dependencies and ancestry

Computed with `git merge-base`, `rev-list --count` and tree comparison against `main@300287d`:

| PR | State | Ahead / behind main | Relationship |
| --- | --- | --- | --- |
| #26 | open | 68 / 12 | Original cumulative implementation candidate (`94554ec`). |
| #28 | open draft, base #26 | 86 / 12 | #26 plus browser/cancellation/relay/HTTP repairs. Tree is identical to #48 except 15 CI lines. |
| #35 | open draft, base #28 | 103 / 12 | Journey fixes F01/F03/F06, parked pending D9. Not part of the split stack. |
| #37→#48 | open, stacked | 3…53 / 11 | Split of #28 into 12 cumulative stages. Each PR's base is the previous stage. |
| #53 | open draft | 2 / 7 | Foundation subset of #37 (boundaries, signature oracle). **Ancestor of #54.** |
| #54 | open | 16 / 7 | Focused extraction of #37 Sepolia, #38 schemas/storage/transport/domain, #39 relay, #40 read-only EIP-1271. Superset of #53. |
| #50 | open draft | 6 / 12 | Solana D5 program. Independent of the EVM stack. |
| #29, #49 | open draft | 11, 13 / 12 | Decision packets D1–D9 and accepted D4/D6/D7. #49 is based on #29. |
| #31 | open draft | 2 / 12 | Independent review findings F01–F06 of #26. Docs only. |
| #32, #33 | open | 1 / 12 | Reuse research. Docs only. |
| #27 | open draft | 1 / 12 | Earlier next-run prompt. Docs only; superseded by this file. |

### Split-stack content not yet extracted into this branch

For each stage, these are the files changed relative to the previous stage that still differ from this branch. Later stages can modify the same files, so the counts overstate unique work.

| Stage | Remaining files | Content |
| --- | ---: | --- |
| #37 | 14 | Formal EVM/SMT harness (`contracts/evm/formal/*`, `scripts/formal/evm.mjs`, Z3 pin). Sepolia and boundary files are already extracted and have since diverged. |
| #38 | 13 | Identity history retention (`identity-service.ts`), domain `privacy-view.ts`, plus facade exports. |
| #39 | 3 | Exchange re-delivery test and pool tweaks, already covered by `edc66f6`. |
| #40 | 17 | Signed release-update fetch/store/verify (`packages/security/src/release-update*.ts`), generic EVM execution hardening and native read-only EIP-1271/reconcile scripts. No contract-wallet transaction adapter is implemented by #40. |
| #41–#48 | 40–190 each | Locale runtime, UI wiring, native journey, recovery portal, intake, optional packages (parked under D7), governance, evidence. |

## 3. Completed functionality on `main` (inherited, with tests)

Encrypted vault with CAS and migration, fresh-key backup/restore, restored identity adoption, profile UI, offline terms review/save/delete, Nostr primitives (NIP-01/17/44), bounded relay pool and signed terms exchange, EVM `BasicEscrow` (native + ERC-20, 82 Foundry tests including fuzz/invariant), durable transaction lifecycle, canonical encrypted exchange with native settlement and unknown-result recovery, release-locator verifier, durable chat history, diagnostics allowlist, acceptance-evidence evaluator, journal-reference export, English typed locale catalog. Sources: `docs/execution/INCOMPLETE-WORK-2026-10-31.md` §"Already complete" and the merged PRs #19–#24.

## 4. Added by PR #54 plus this branch (pending merge)

Strict trade-draft, transport-selection, backup-receipt and read-only-hint schemas; local unsigned trade-draft builder; read-only observation dispatcher; authenticated current-profile backup verification; hostile-input boundaries for vault, backup and migration; reviewed retention plans; bounded HTTP Fetch decoding; relay per-subscription dedupe and isolation; read-only EIP-1271 acceptance verification; Sepolia send-history and RPC-credential hygiene; boundary inventory that fails closed. This branch adds fixes for the review threads (§6).

## 5. Partially implemented or missing

| Area | State |
| --- | --- |
| D1 peer acceptance v2 (EIP-712 `PeerAcceptance`) | Accepted design; **not implemented**. |
| D9 durable `sendMarkedAt` marker | Accepted design on #29/#49; **not implemented in #35 or #56**. #58 repairs the post-send 4001 shortcut only; persisted version/migration/import provenance and browser qualification remain open. |
| Generic EVM execution hardening and signed asset updates | Remaining in #40. Read-only EIP-1271 already extracted; contract-wallet transaction execution remains unimplemented/unqualified. Tier C. |
| Locale/runtime/UI wiring, native journey, recovery portal | #41–#44 only. |
| Formal EVM harness | #37 only. Needs Z3 4.12.2 and the solc pin. |
| Solana D5 escrow | #50 (Anchor 1.2.2, LiteSVM). Not reviewed; no client adapter. |
| Payment proofs (zkTLS/TLSNotary/Reclaim) | Research only (#30, #32–#34). No adapter. |
| Optional packages (meetup, courier, arbitration, liquidity, stealth, proofs, privacy) | #46, parked under D7. |
| Testnet (Sepolia) qualification | Kit and scripts exist. D2 owner key generation is pending; no funded run. |
| Localization beyond English, tooltip registry, RTL/CJK stress | Not started. |
| Autonomous agent workflow (#51) | All 3 historical runs failed at startup (zero jobs). The current file is dispatch-only and has never run. Hardened in this branch; still unexercised. |

## 6. Confirmed defects (PR #54 review threads, fixed in this branch)

| # | Severity | Location | Fix |
| --- | --- | --- | --- |
| R1 | Major | `scripts/sepolia/trade.mjs` | Cross-process admission race. Exclusive state lockfile; per-process temp path. |
| R2 | Medium | `scripts/sepolia/trade.mjs` | A transient RPC read error locked a fresh trade permanently. Errors are now attributed to an action. |
| R3 | Minor (safety) | `scripts/sepolia/trade.mjs` | An unattributed uncertain error could be excused by a legacy record of a different action. |
| R4 | Minor | `scripts/sepolia/trade.mjs` | Finality check now includes hashes in `failedSends`. |
| R5 | Minor (security) | `scripts/sepolia/lib.mjs` | Lowercase double-encoded credentials were not detected. |
| R6 | Medium (data loss) | `packages/storage/src/retention-service.ts` | Partial-conversation deletion through an unclassifiable sibling record or a sequence gap. Fails closed. |
| R7 | Minor | `packages/relay/src/pool.ts` | Inherited handler methods were rejected. Bounded prototype walk; accessors are never invoked. |
| R8 | Minor | `packages/transport/test/policy.test.mjs` | An assertion inside a swallowed callback could not fail. |
| R9 | Major (docs) | `README.md` | Local setup for the G16 oracle dependency was undocumented. |
| R10–R11 | Minor (docs) | consolidation reports | Overstated PR-disposition claim; compressed metrics. |

The evidence for each fix is in `AUTONOMOUS-PROGRESS.md`.

## 7. Unverified claims

- Decision prose in #29/#49 says the M-0 stack is merged. Live state shows #37–#48 open, so do not use that prose as ancestry evidence.
- Evidence logs under `docs/evidence/*-20261104/` were produced in a sandbox without network access. They are consistent with the green hosted checks on `edc66f6`, but each log certifies only its own recorded commit.
- Formal-harness, Solana LiteSVM and browser/device qualification claims in #37, #50 and #42 were not re-run in this session.

## 8. Security and release blockers (owner-only or external)

- **D8 Tier C**: #54 and this branch touch vault/backup crypto, recovery, signing verification (EIP-1271) and release-trust tooling. Merging requires **owner approval**. Agents must not self-merge.
- D2 testnet signing key (owner-run), real registry/release trust fingerprints, named professional security/crypto/wallet review, security contact.
- `ReleaseEnabled=0`, the empty network allowlist and the disabled real-funds paths remain unchanged.

## 9. Active owners

No live agent assignment was found beyond the PR authors. Codex sessions authored #51–#54; Claude sessions authored #26–#50. This session owns `claude/vibrant-cray-ny4gum` only. Contributor branches were not rewritten.

## 10. Prioritized next tasks

| P | Task | Depends on | Acceptance |
| --- | --- | --- | --- |
| P0 | Owner review/merge of #54, then this branch (or merge this branch, which contains #54) | owner | Green CI; no open High/Medium threads |
| P0 | Extract #40 generic execution hardening, read-only native EIP-1271 harness and signed asset updates | #54 | RED/GREEN, local EVM + EIP-1271 fixture, Tier C review |
| P0 | Implement D9 `sendMarkedAt` CAS marker, then reconcile the #35/#31 F01–F06 journey fixes | #54 | No duplicate sends across crash/reload; browser journey |
| P1 | Implement D1 peer acceptance v2 | D9 | Vectors; downgrade refusal; tombstones |
| P1 | Extract the #38 remainder (identity history retention, privacy view) | #54 | Package tests, boundary check |
| P1 | Extract #41–#43 (locale, runtime UI, native journey) incrementally | above | Default/demo builds, browser suites |
| P1 | Formal harness (#37 remainder) | Z3 pin | `test:formal:unit`; UNKNOWN stays UNKNOWN |
| P2 | Review #50 (Solana) independently; client adapter | D5 | LiteSVM, vectors, attribution |
| P2 | #44/#45/#47/#48 recovery portal, intake, governance, evidence | P1 | Release trust stays disabled |
| P3 | D7-parked optional packages; payment-proof adapters | core leaves LOCALPROOF | Per-module gates |

## 11. Test evidence (this session, Node 24.22.2, Foundry 1.5.1, solc 0.8.30 sha256 `f3e987dc…f7`)

| Check | Result |
| --- | --- |
| `npm test` baseline on #54 + main (`dcee920`) | 1,207 pass, 0 fail, 1 skip (Foundry-gated) |
| `forge test --offline` (contracts/evm) | 82 / 82 pass, 4 suites |
| Post-fix results | see `AUTONOMOUS-PROGRESS.md` |

Not run here: browser suites (`test:browser`, `test:web:browser`) and the Solana toolchain. Python `test:specs` needs the CPython 3.12 oracle closure; this host has 3.13 (see README).

## 12. Remaining-work estimate

The PR #54 handoff gives engineering-effort ranges per stage: P0 foundation 1–4 days per stage, journey 3–6 days, P1 2–4 days each, Solana 3–6 days plus review. Summed over the stages not yet extracted (#38 remainder, #40 remainder, #41–#45, #47–#48, D1, D9) that is roughly **20–40 engineer-days, low confidence**, excluding owner reviews, external audits, D2 and testnet funding. Those external items are the critical path to any release. No completion percentage is claimed.
