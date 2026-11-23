# EIP-1271 native acceptance coverage — current-main recovery candidate (2026-11-23 UTC)

**Status: DRAFT / unqualified until exact-source CI and independent Tier C review.** No product code, wallet signing authority, releases or defaults change here.

## Provenance and scope

Recovered two **unchanged original Git blobs** from the owner's still-open [PR #40](https://github.com/djshellshoxxx/p2p-offramp/pull/40), based on `7706859d2385cae0f8e49615392de08dfee83f84`:

- `contracts/evm/test/mocks/Eip1271RecoveryFixture.sol`, original blob `83ba7e42eeead97a6a99455b4a82b714dbcc8701`.
- `scripts/test-eip1271-local.mjs`, original blob `3f0ddfce4bb986b3423ecfffa40685614a16d28c`.

The prior [source-gap report](https://github.com/djshellshoxxx/p2p-offramp/blob/cd1354d6a669d5bd45c11d08e2c2b569302efff1/docs/engineering/BRANCH_COHORT_S04_WALLET_RELEASE_20261123.md) documented these exact two files as absent from `main@01f6f4feca051d68de24a04299cd3bb444bce40c`. They were intentionally NOT recovered by merging PR40's older product code. The main `packages/wallet/src/evm-contract-acceptance.ts` verifier, HTTP update reader, registry, financial harness and release controls remain untouched.

An isolated branch created from `01f6f4feca051d68de24a04299cd3bb444bce40c` adds the fixture and test harness plus precisely one `test:eip1271:local` npm script and one corresponding existing EVM workflow step. The current verifier interface and all imported paths were inspected. The script only starts Anvil on `127.0.0.1`, uses the public Anvil development key for fixture deployment, and sends no signing or funding transactions from the verifier.

## Expected executable oracles

The recovered harness should execute on the **actual** current-main `createContractAcceptanceVerifier` with Foundry 1.5.1 and solc 0.8.30:

1. Deploy `BasicEscrow` and an EIP-1271 fixture to private Anvil, and bind a signed local registry to their exact runtime/code and genesis.
2. Verify a positive contract signature using the exact terms digest and ABI magic at a canonical block, with `economicPreparationAllowed=false`.
3. Revoke an approved signature and mutate terms; each must refuse, with no cached permission.
4. Refuse wrong magic, reverts, bounded-gas exhaustion, 4-byte raw return and oversized return.
5. Refuse a chain reorganization mid-verification and an invalidated session; never switch to EOA recovery or fallback.
6. Keep verifier RPCs restricted to `eth_chainId`, `eth_getBlockByNumber`, `eth_getCode` and `eth_call`; only the separate fixture setup may send.

**Execution/acceptance distinction:** This document describes intended assertions, not a new successful run. The original pre-main historical PR40 test evidence cannot qualify this candidate. Current-source green native Anvil/Forge, unit/CI/security gates, independent Tier C review and applicable owner approvals must be evidenced on the actual branch/target before a guarded merge. Preserve any failures rather than weakening assertions. `ReleaseEnabled=0` stays unchanged.

## Ownership and integration boundaries

- PR40 and its original stage branch remain unchanged. Do not merge older `release-update-http.ts`, whose encoded `Content-Length` flaw was subsequently corrected.
- The current EVM workflow is extended, not replaced. Existing native reconcile, refund-wait, physical-send, browser, Solana, EVM and Nostr gates remain unchanged.
- Until hosted CI actually executes this exact candidate, classify its native acceptance as **pending**. No live network or real funds; no release or optional-feature enablement.
