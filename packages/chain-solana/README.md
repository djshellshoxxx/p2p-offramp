# Read-only Solana adapter for the D5 basic escrow (local qualification)

Finalized-only reader and unsigned instruction builders for `contracts/solana/programs/basic-escrow`. It has no
endpoint, connection, wallet, key, signer, sender or simulator. The caller injects `rpc.request` (it resolves to the
JSON-RPC `result`) and a registry view that is already loaded. The app build excludes this package. These tests do
not approve any network, deployment or registry entry.

## API

- `bindSolanaTrade(registry, binding, terms)` binds G16 terms to one registry deployment and returns a branded,
  frozen `BoundSolanaTrade`. It checks that `binding.tradeId` is sha256 of `encodeSolanaTerms(terms)`, that the
  network is finalized-only and that the program is immutable. The terms genesis and program must match the registry.
  It also checks the Tokenkeg asset policy and derives the escrow, vault and ProgramData PDAs.
- `SolanaChainReader`: `validateLive(networkId, deploymentId, signal?)`, `read(binding, request, terms)` (a snapshot
  with escrow, custody and payout), `readValidated(binding, request, terms)` (only the `ChainObservation`, for G08:
  `(b, r) => reader.readValidated(b, r, terms)`), and `dispose()`. `payoutRegressed(previous, next)`.
- `buildFundNative`, `buildFundSpl(trade, sellerTokenAccount)`, `buildRelease`, `buildRefund`,
  `buildPayout(trade, 'released' | 'refunded')` return `{ programId, accounts, data }`. They make no message,
  blockhash, fee payer or System instruction.
- `fundingWindow(acceptBefore, expiry, chainTime, submitMargin)` and `settlementWindow(deadline, chainTime,
  releaseMargin)` take u64 decimal strings and a required margin. `chainTime` is `live.timestampSeconds`.
- `programDataSha256(accountData)` / `programDataSha256FromElf(elf, programDataLength)`, the address helpers,
  and the layout decoders.

## Guarantees

- One read makes 5 calls, all at `finalized`: `getGenesisHash`, then one `getMultipleAccounts` (at most 6 keys) at
  slot S. S must be at least the per-network floor (`minContextSlot`). Then `getBlock(S)` twice and
  `getGenesisHash` again. There is no fallback, no `confirmed` read and no wall-clock threshold.
- Identity is checked at S: a loader-v3 Program whose pointer is the derived ProgramData. The ProgramData must have
  authority option None, deploy slot at most S, and the region hash `loader-v3-programdata-region/v1`, which is
  SHA-256 of bytes `[45..end)`, untrimmed. The method is **PROPOSED, pending release-owner confirmation**. The Clock
  slot must equal S.
- The escrow at the PDA must be absent, a System pre-init donation, or a 222-byte EscrowV1 that matches every term.
  A foreign `terms_hash` gives CONFLICT. Native custody is rent-aware, and a threshold other than 1.0 or 2.0 gives
  `rent-unknown`. The SPL vault must have no delegate and no close authority, must not be native, and must hold at
  least the principal. `readValidated` returns CONFLICT for a funded trade whose vault is frozen.
- Responses are read only through own data descriptors, and base64 is capped before decoding. Provider
  rejections give UNAVAILABLE, and no provider detail is kept. At most 4 jobs run at once. The timeout is 1..60,000
  ms (default 10,000). Abort, timeout and dispose free a slot only when the physical request settles.
- Native amounts above 2^53-1 give LIMIT_EXCEEDED. Network ids must not contain `:`.

## What it does NOT prove

A dishonest RPC can lie consistently, because there is no light client and no corroboration. A finalized Clock lags
the tip, so an open window is necessary but not sufficient. The committed fixture hash (`eed3a490…`, unpadded, L =
45 + len(so)) belongs to a localnet capture with a synthetic program id, so it is a test vector, not a pin. A
registry pin must still come from `programDataSha256FromElf(verifiable .so, deployed length from the runbook)`.
Transaction lifecycle (G12: signatures, blockhash expiry, durable nonce), Token-2022 and ATA creation are not
implemented. The `@noble/hashes` 2.4.0 inventory review is still pending.

## Acceptance

```sh
node --import ./scripts/test-support/register-tsx.mjs --test packages/chain-solana/test/*.test.mjs
npm run typecheck && npm run check:boundaries && npm test
```
