# Completion progress — 2026-11-16

This is a continuation checkpoint, not a release-completion claim.
Base: published `d43eb461` (PR #119); implementation initially published in PR #120.

## Implemented

1. **G3 canonical escrow reader:** choose the ABI by trusted bundled runtime-Keccak
   policy, after the registry runtime identity matches finalized bytecode. Supports
   canonical `getTrade(bytes32)` and explicit legacy layouts. Policy snapshots are
   immutable; unknown mappings, malformed ABI words and layout mismatch fail closed.
   Existing callers without policy remain legacy-only. No production hash approved.
2. **BT-15 output mitigation:** staged blobs and complete patch/context checked before
   artifact upload and in the clean publication job. Fixed errors avoid leaking
   content. Secret sentinels, common credential patterns, bounded UTF-8 output,
   protected paths, lockfiles and symlink rejection covered. Default-ref restriction
   and one-day artifact retention added. Credential isolation remains unfinished;
   scans are not a sandbox or arbitrary exfiltration prevention.
3. **D9 historical consolidation:** imported the cumulative test/fix chain
   `7008ef8` through `e8afa6a`, plus `c153a99` cross-deployment nonce coverage.
   The overlapping append-only journal test conflict was resolved by retaining both
   test sets. A persisted marker followed by a typed journal failure now reports
   `BROADCAST_UNKNOWN`, never a retry-safe `LOCKED`/`CANCELLED`/`CONFLICT` result.
   The regression was observed failing before the imported production fix.

## Evidence

- Canonical reader: 13 tests pass; four added tests failed before implementation.
  Uses pinned viem to encode the committed canonical contract ABI independently.
- Full suite after reader work: 1,281 pass, zero fail, one Foundry/cast skip.
- Output quarantine: eight tests pass, including workflow boundary order and a
  staged sentinel that remains detectable after the working copy is cleaned.
- After D9 intake: 48 targeted journal/executor tests pass.
- Final full suite at local implementation `09c8821`: 1,292 total, 1,291 pass,
  zero fail, one Foundry/cast skip. Earlier combined runs exposed two test timing
  assumptions; neither failure was hidden by a retry. Crash tests now await wallet
  entry/broadcast, and contract-acceptance timeout tests advance a mock timer only
  after reaching the held RPC. The focused suites passed 18/18 and 12/12 respectively.
- All three modified workflows parse as YAML; eight output-guard tests pass.
- Typecheck, boundaries and default production build pass for the reader change.
- Real-chain viem harness now tests direct canonical funded, pending-release and
  finalized-release observations and runs in EVM CI. Local Foundry is unavailable.
- Hosted qualification belongs to each exact published head; earlier PR #119
  checks cannot qualify PR #120 or its subsequent D9 update.

## Remaining completion gates

- Full D9 versioned `sendMarkedAt` migration and durable record-origin rules.
  Imported historical tests/fix above do not implement that schema migration.
- D1 cryptographic peer-acceptance carrier and two-implementation vectors.
- Actual browser trading composition and complete two-wallet journey.
- Runtime-hash policy approval and independent review for the canonical reader.
- BT-15 credential broker/isolation, independent crypto/Solidity review, token
  qualification and monitoring, device/browser qualification, testnet acceptance,
  release signing and deployment trust. Those must not be replaced by passing unit tests.
- Remaining historical runtime/native/Solana stacks need feature-level review;
  their existence is not evidence they are qualified to merge.

No paid autonomous job, live-funds transaction, production deployment or release
was triggered. `ReleaseEnabled=0` remains unchanged.
