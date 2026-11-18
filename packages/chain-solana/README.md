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
  `isSolanaEscrowSnapshot(value)` is true only for a snapshot that `read()` returned.
- `nextSettlementStep(snapshot, { role, chainTime, releaseMargin })` plans the one next instruction (see below).
- `buildFundNative`, `buildFundSpl(trade, sellerTokenAccount)`, `buildRelease`, `buildRefund`,
  `buildPayout(trade, 'released' | 'refunded')` return `{ programId, accounts, data }`. They make no message,
  blockhash, fee payer or System instruction.
- `fundingWindow(acceptBefore, expiry, chainTime, submitMargin)` and `settlementWindow(deadline, chainTime,
  releaseMargin)` take u64 decimal strings and a required margin. `chainTime` is `live.timestampSeconds`.
- `programDataSha256(accountData)` / `programDataSha256FromElf(elf, programDataLength)`, the address helpers,
  and the layout decoders.
- Program ID constants (`src/address.ts`): `SYSTEM_PROGRAM_ID`, `SPL_PROGRAM_ID` (Tokenkeg…), `SPL_2022_PROGRAM_ID`
  (refusal only), `ATA_PROGRAM_ID`, `LOADER_V3_ID`, `SYSVAR_OWNER_ID`, `CLOCK_SYSVAR_ID`, `RENT_SYSVAR_ID` and
  `WRAPPED_SOL_MINTS`. The M2B-1 spec names the two token constants `TOKEN_PROGRAM_ID` and `TOKEN_2022_PROGRAM_ID`;
  they were deliberately renamed (SonarCloud S6418 flags `TOKEN_*` names as hard-coded secrets). Values and
  behaviour are unchanged, so import the `SPL_*` names.

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
  least the principal. A frozen vault is not a CONFLICT: the chain state is reported as it is, because release and
  refund change state only and stay possible. Only the payout is blocked, shown as `SplCustody.payoutBlockedBy:
  ['vault-frozen']` while a payout is still to happen (`vaultFrozen` stays as the raw flag).
- Responses are read only through own data descriptors, and base64 is capped before decoding. Provider
  rejections give UNAVAILABLE, and no provider detail is kept. At most 4 jobs run at once. The timeout is 1..60,000
  ms (default 10,000). Abort, timeout and dispose free a slot only when the physical request settles. A caller
  signal that is not a usable `AbortSignal` gives INVALID_INPUT before a slot is reserved, so it cannot leak one.
- Native amounts above 2^53-1 give LIMIT_EXCEEDED. Network ids must not contain `:`.

## Settlement planner (`src/settlement.ts`)

`nextSettlementStep(snapshot, { role: 'seller' | 'buyer' | 'third-party', chainTime, releaseMargin })` is pure
(no RPC, clock or memory) and returns a frozen `{ action, reason, outcome? }` inside a `CoreResult`. `action` is
`release`, `refund`, `payout`, `wait` or `none`; `reason` is one of the fixed `SETTLEMENT_REASONS`; `outcome`
(`released` | `refunded`) is present only for `payout` and feeds `buildPayout` unchanged.

| Finalized snapshot | Step |
| --- | --- |
| absent (incl. a System pre-init donation) | `none` / `escrow-absent` |
| payout complete | `none` / `payout-complete` |
| released or refunded, unpaid, custody blocker | `wait` / `rent-shortfall`, `rent-unknown` or `vault-frozen` |
| released or refunded, unpaid, no blocker | `payout` / `payout-pending`, outcome = the state (any role) |
| funded, `refundOpen` | `refund` / `refund-open` (any role) |
| funded, `releaseOpen` | seller: `release` / `release-open`; others: `wait` / `awaiting-seller-release` |
| funded, neither (margin gap) | `wait` / `release-margin` |

- One instruction per transaction. A transaction holding `release` and `payout_*` rolls back the release when the
  payout fails (`contracts/solana/README.md`, Rules), so the planner never bundles them: payout is planned only
  from a later finalized snapshot that already shows the terminal state. Payout blockers never hold back release
  or refund.
- It consumes only snapshots that `read()` returned (branded, finality `finalized`); copies, observations and
  hand-built objects give INVALID_INPUT, as do an unknown role, a non-canonical `chainTime` or `releaseMargin`,
  and a `chainTime` older than the snapshot's own `live.timestampSeconds`. Inputs are checked in every state.
- A step describes one snapshot; it never says a send is safe. After any uncertain outcome (timeout, dropped or
  unknown signature), G12 (the journal) must reconcile the transaction and re-observe finalized state before any
  retry. The planner cannot tell "not sent" from "sent, not yet finalized" and must not be used as that check.
- The destination token account is not read, so a missing or frozen recipient ATA (program error
  `DestinationFrozen`) shows up only as a failed payout, which leaves the escrow terminal and retryable.

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
