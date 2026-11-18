# EVM anchored-read consolidation and remediation — 2026-11-18

## Source and scope

This report records local integration and verification, not release approval or a complete independent security audit.

- Baseline: `97ce6a41805ab4d8fc6fccbcfb9dd79463deebd7` (`main` at the start of this work).
- [PR #143](https://github.com/djshellshoxxx/p2p-offramp/pull/143) source: `579b02f3775323ba273dfe2bc624b5860897431e`; integrated with ancestry preserved at `e0c55d0`.
- [PR #149](https://github.com/djshellshoxxx/p2p-offramp/pull/149) source: `90b9b85715f1e04522b828ecdbc4858e92a1b88e`; integrated with ancestry preserved at `0b0e75c`.
- Follow-up implementation: `9e7a9b4b980d8c69dc664b6d6367d3e33a87e9b2` on `integration/evm-core-20261118`.
- No EVM contract source, deployment manifest, release pin, release-enablement setting, or private-key custody policy changed.

PR #143 adds canonical block-hash binding to the chain observation reader. Its original hosted head had nine successful checks and a queued `local-evm` job when inspected; those historical checks do not qualify the combined integration. The merge onto the stated baseline was conflict-free locally despite the earlier GitHub mergeability field reporting false.

PR #149 adds a characterization test for an existing encrypted recovery behavior. It is not a production bug fix: a fresh-key restore preserves an unknown-broadcast nonce as an unverified offline reference, prevents the prior profile from supplying that reference, and performs no projection writes. Its original hosted head had ten successful checks when inspected.

## Confirmed defects and repairs

### EVM-ANCHOR-01 — State from another fork could be attributed to the recorded anchor

**Priority/severity:** P1 / Medium for the native adapters under review. The default static application does not expose these transaction adapters, so this is not evidence of an exploitable deployed trading application.

The wallet payment preflight, older explicit EIP-1271 verifier, lifecycle reader, and historical recovery tool read a block header and then requested state by its number. An RPC service balancing requests between honest nodes on different forks could return state from a different block at that height. The final header recheck could return to the original node and pass.

Reproductions on `0b0e75c` demonstrated:

- Payment guidance accepted a funded state from another fork while the recorded finalized or latest anchor had an absent trade.
- The explicit EIP-1271 verifier accepted a signature using wallet policy from another fork while reporting the majority anchor.
- The lifecycle reader published another fork's released escrow state under the majority block hash.
- Historical recovery returned another fork's settlement state or withdrawal credit under the majority header.

The repair sends `{"blockHash": "<recorded hash>", "requireCanonical": true}` for every relevant `eth_call` and `eth_getCode`. Parameters are frozen. Unsupported object parameters, unavailable hashes, and off-canonical blocks fail closed. No block-number fallback or automatic resend was introduced. Existing canonical header rechecks remain.

### EVM-FINALITY-02 — Unknown-broadcast reconciliation discarded a known finalized hash

**Priority/severity:** P1 / Medium for transaction-state integrity.

The lifecycle retained a finalized header but passed only its number to `escrowState`. A later height lookup could therefore select another block. The regression demonstrated an unknown-broadcast intent becoming `finalized` even though the originally observed finalized block preceded funding and supported only a `confirmed` outcome.

The reader port now accepts an optional expected block hash. The lifecycle supplies its finalized hash; the native reader rejects a different header before state access and reads the state with canonical hash binding. Older test adapters remain structurally compatible with the optional argument.

### Test reliability repair

The viem local oracle previously called `getTransactionReceipt` immediately after sending a refund, so delayed mining could yield a missing receipt. It now uses `waitForTransactionReceipt` with a 10-second timeout and a 50-millisecond polling interval. The complete native oracle passed after the change. This report does not count the previously reported intermittent failure as a separately reproduced security vulnerability.

## Regression evidence

Before editing production code, six new tests were run against `0b0e75c`; all six failed for the expected security/correctness reason. After the repairs, all six passed. The targeted command was:

```bash
node --import ./scripts/test-support/register-tsx.mjs --test \
  --test-name-pattern='fork|expected finalized|unknown-broadcast reconciliation' \
  packages/wallet/test/evm-payment-preflight.test.mjs \
  packages/wallet/test/evm-contract-acceptance.test.mjs \
  packages/wallet/test/evm-submit.test.mjs \
  packages/domain/test/tx-lifecycle.test.mjs \
  scripts/tests/evm-recovery.test.mjs
```

The focused post-fix suite used the same five files without the name filter, plus `packages/chain-evm/test/reader.test.mjs` and `apps/web/test/recovery-references-worker.test.mjs`. It passed **107/107**, with no failures, cancellations, skips, or TODOs. `npm run typecheck` and `git diff --check` also passed.

## Native verification

Environment: Linux x86-64, Node `24.22.1`, Foundry/Anvil `1.5.1`, solc `0.8.30`, viem `2.57.10`. The coordinator verified the downloaded Foundry archive and compiler against their official published SHA-256 values. Contract submodules were initialized at the repository's pinned commits.

These commands ran against the source subsequently committed as `9e7a9b4b980d8c69dc664b6d6367d3e33a87e9b2`, with `FOUNDRY_BIN`, `FOUNDRY_SOLC`, and `PATH` pointed to that local toolchain:

| Command | Outcome |
| --- | --- |
| `npm run test:evm:viem` | 9 adapter tests and 32 native oracle comparisons passed |
| `npm run test:payment:preflight` | 6 receipt tests and 7 native payment-guidance checks passed |
| `npm run test:evm:reconcile` | 5 native reconciliation checks passed, including process death after unknown broadcast |
| `npm run test:recovery:evm` | 18 unit tests, 6 portable recovery checks, and 6 cross-release/key-rotation checks passed |
| `npm run test:exchange:evm` | 12 canonical exchange checks and 6 D1 peer-verification checks passed |
| `npm run test:evm` | 92 Foundry tests passed across 7 suites, including fuzz and invariant tests; no failures or skips |

The canonical exchange harness exercised real Nostr cryptography, encrypted chat recovery, the durable journal, native escrow, and exact reviewed transaction bytes on loopback. It reported five negotiated orders, two settled orders, four submissions, and four durable send markers. Those harness results are not proof of an integrated two-user browser application or a public-testnet workflow.

Foundry coverage includes native/ERC-20 conservation, no double payout, terminal-state monotonicity, seller authorization, nonce reuse, fee-on-transfer refusal, false/no-return token behavior, payout deferral, refund boundaries, and reentrancy scenarios. No new contract-level vulnerability was confirmed in this scoped review. Slither was unavailable and was not run.

## Remaining limits

- EIP-1898 binding relies on an honest, compliant RPC. No state proofs or light client authenticate its answers.
- Receipt finality below the chosen anchor and ancestry between independently read heights remain subject to the documented RPC trust model. This change does not implement parent-hash walks.
- Public RPC compatibility, physical external wallets, and public-testnet transactions were not tested.
- At the stated baseline, browser services still exposed offline profile/review/recovery features; the native exchange harness did not constitute browser trading integration. Subsequent browser work must receive separate qualification.
- The repairs need independent review and current integrated-head CI before merge qualification. Original-PR CI and these local results do not replace those gates.
- All native execution used disposable loopback Anvil chains and public development accounts. No real funds, public deployment, release publication, or release-enablement change occurred.
