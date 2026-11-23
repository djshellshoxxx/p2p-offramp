# PR246: actual current-tree EIP-1271 native acceptance — 2026-11-23 UTC

**Classification:** successful *bounded native EVM harness execution* on the exact PR246 source/target checkout, **not yet merge-authorized**. Original PR40 and frozen financial branches are unchanged.

## Immutable Git source and target

- Repository: [djshellshoxxx/p2p-offramp](https://github.com/djshellshoxxx/p2p-offramp); default main `01f6f4feca051d68de24a04299cd3bb444bce40c` at verification.
- [Draft PR246](https://github.com/djshellshoxxx/p2p-offramp/pull/246) head `233a66a7c2a465ac7b5504564c0e3b826afedcf5`; full tree `38fb1a712824435f2bcf9fd5225d27706472a979`; comparison to main: merge base `01f6f4feca051d68de24a04299cd3bb444bce40c`, ahead 2, behind 0.
- Actual hosted PR merge checkout `e26d135f8e8b3f8f3a1fc8cae57998721c21e747` has ordered parents `[01f6f4feca051d68de24a04299cd3bb444bce40c, 233a66a7c2a465ac7b5504564c0e3b826afedcf5]` and **exactly the same full tree** `38fb1a712824435f2bcf9fd5225d27706472a979`. This is source/target-specific verification, not a transfer from previous commits.
- Five changed paths: EVM workflow, original `Eip1271RecoveryFixture.sol`, original `test-eip1271-local.mjs`, `package.json` script, and its documentation. No production, custody, wallet signer, release flag or default import modification.
- The recovered fixture and harness remain original unchanged PR40 blobs `83ba7e42eeead97a6a99455b4a82b714dbcc8701` and `3f0ddfce4bb986b3423ecfffa40685614a16d28c`. Older PR40 HTTP reader is expressly **not** integrated.

## Observed hosted runtime — successful

The [exact-source EVM escrow workflow](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45112658538) ran the `local-trade` job [137488330411](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45112658538/job/137488330411). The step **"EIP-1271 contract-wallet native negative-mode acceptance (loopback Anvil)"** completed **SUCCESS**. The log actually executes `npm run test:eip1271:local` at 2026-11-23 04:35:35 UTC, not just `forge build` or a controlled RPC unit substitute.

At 04:35:36 UTC the actual harness emitted these five passing checks:
1. Deployed real test contract wallet returns native ABI magic for the exact terms digest at the pinned block, without allowing economic preparation.
2. Revocation and changed terms invalidate acceptance with no stale cached authorization.
3. Incorrect magic, revert, out-of-gas, raw four-byte and oversized return modes refuse.
4. A chain rollback during the validity read refuses acceptance.
5. Session loss and code-less EOA return refusal without fallback.

Machine receipt from the same hosted output: `{"fixture":"local-native-eip1271","checks":5,"adapterReads":90,"adapterSendsOrSigns":0,"externalNetwork":false,"tradingEnabled":false,"releaseAcceptance":false}`. The fixture uses private loopback Anvil chain 31337 and a published development-only deployment key. All verifier adapter RPC methods are asserted to be only `eth_chainId`, `eth_getBlockByNumber`, `eth_getCode`, and `eth_call`; its setup wallet separately performs fixture transactions. This receipt does **not** establish release readiness, real-network acceptance or a real-funds transaction.

The same PR target checkout also passed the EVM `forge` job [137488330221](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45112658538/job/137488330221) including compilation of the added Solidity fixture (Solc 0.8.30, Foundry v1.5.1). The `local-trade` job finished successfully with all its other required steps; new EIP-1271 step is not merely scheduled.

## CI/review status at readback

- On `233a66a7c2a465ac7b5504564c0e3b826afedcf5`, 15 check-run records: **14 completed SUCCESS**, including CodeQL, native local-trade, forge, EVM/browser/Firefox/WebKit, schemas, specs, Nostr, inventory and docs; **one Solana `program` job IN_PROGRESS**, not accepted or waived.
- The `local-trade` job checkout is `e26d135f8e8b3f8f3a1fc8cae57998721c21e747`, so the new native proof qualifies **the exact source and current main target** without inheriting a historical result. The pending Solana job must finish on its own checkout.
- GitHub PR246 review list was **empty** at readback. The coordinator's source/log audit is not an independent Tier C reviewer or owner acceptance. There is no qualifying owner authorization recorded in this checkpoint.
- Historical PR40's earlier test receipts do not substitute for the above hosted run. Historical failures and any new failure must remain preserved.

## Decision and next work

**Keep PR246 draft and unmerged** pending complete current-head CI, required independent Tier C reviewer, applicable owner authorization and fresh expected-head/current-main guard. Do not merge PR40's older product reader, rerun unchanged long financial waits merely for administrative states, alter signing/custody defaults, release, deploy or operate with real funds. Preserve `ReleaseEnabled=0`.

The separate parent PR237–239 named Tier B review/current-target checks and PR241–244 Tier C financial/owner gates remain independent blockers. No child inherits this PR246 EVM result. Resume on an independently unblocked branch if these gates remain externally held.
