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
- `nextSettlementStep(snapshot, { role, chainTime, releaseMargin, sellerDecision? })` names the one next instruction
  a caller may submit (see below); a seller's `release` needs the seller's explicit fiat-receipt decision.
- `buildFundNative`, `buildFundSpl(trade, sellerTokenAccount)`, `buildRelease`, `buildRefund`,
  `buildPayout(trade, 'released' | 'refunded')` return `{ programId, accounts, data }`. They make no message,
  blockhash, fee payer or System instruction.
- `fundingWindow(acceptBefore, expiry, chainTime, submitMargin)` and `settlementWindow(deadline, chainTime,
  releaseMargin)` take u64 decimal strings and a required margin: `submitMargin` 0..3600, `releaseMargin`
  0..604800 (a larger canonical value is INVALID_INPUT). `chainTime` is `live.timestampSeconds`.
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
  signal that is not a usable `AbortSignal` gives INVALID_INPUT and never leaks a slot. So does a request that
  cannot be read (null, or a throwing `signal`, `generation` or `requestSequence` getter): `read()` still returns a
  promise of a result. The slot is reserved before the caller's `addEventListener` runs, so caller code that
  re-enters the reader still counts against the limit. The listener is removed on every settle path, including an
  `addEventListener` that registers it and then throws.
- Native amounts above 2^53-1 give LIMIT_EXCEEDED. Network ids must not contain `:`.

## Settlement planner (`src/settlement.ts`)

`nextSettlementStep(snapshot, { role: 'seller' | 'buyer' | 'third-party', chainTime, releaseMargin, sellerDecision?
})` is pure (no RPC, clock or memory) and returns a frozen `{ action, reason, outcome? }` inside a `CoreResult`.
`action` is `release`, `refund`, `payout`, `wait` or `none`; `reason` is one of the fixed `SETTLEMENT_REASONS`;
`outcome` (`released` | `refunded`) is present only for `payout` and feeds `buildPayout` unchanged. Each context
field is read once.

`release` is the seller's irreversible decision. Finalized funding alone never shows fiat receipt, so a seller
must pass `sellerDecision: 'release'` (only after explicitly confirming fiat receipt, G18/G22) or `'hold'`; it is
required for `seller` and must be absent for other roles. A holding seller waits like everyone else and is planned
`refund` once refund opens. A `release` step permits that decision; it is never auto-submitted from the step.

| Finalized snapshot | Step |
| --- | --- |
| absent (incl. a System pre-init donation) | `none` / `escrow-absent` |
| payout complete | `none` / `payout-complete` |
| released or refunded, unpaid, custody blocker | `wait` / `rent-shortfall`, `rent-unknown`, `vault-frozen` (below) |
| released or refunded, unpaid, no blocker | `payout` / `payout-pending`, outcome = the state (any role) |
| funded, `refundOpen` | `refund` / `refund-open` (any role) |
| funded, `releaseOpen` | seller with `release`: `release` / `release-open`; else `wait` / `awaiting-seller-release` |
| funded, neither (margin gap) | `wait` / `release-margin` |

- One instruction per transaction. A transaction holding `release` and `payout_*` rolls back the release when the
  payout fails (`contracts/solana/README.md`, Rules), so the planner never bundles them: payout is planned only
  from a later finalized snapshot that already shows the terminal state. Payout blockers never hold back release
  or refund.
- It consumes only snapshots that `read()` returned (branded, finality `finalized`); copies, observations and
  hand-built objects give INVALID_INPUT, as do an unknown role, a non-canonical `chainTime`, a non-canonical or
  out-of-range `releaseMargin` (0..604800), a missing or unknown seller `sellerDecision` (or one from another
  role), a context that cannot be read, and a `chainTime` different from the snapshot's own
  `live.timestampSeconds`. Inputs are checked in every state.
  Escrow state and time must come from one finalized slot: pairing an old snapshot with a later `validateLive`
  time could plan a refund for an escrow the seller released in between. A later time needs a fresh `read()`,
  which costs the same 5 calls as `validateLive`.
- Waiting alone never clears a payout blocker. `rent-shortfall` clears only after anyone sends the escrow PDA at
  least `rentExemptMinimum - (lamports - principalHeld)` lamports (`contracts/solana/README.md`, Deployment
  prerequisites). `rent-unknown` depends only on the cluster's Rent sysvar threshold (not 1.0 or 2.0): no transfer
  or authority action clears it, and it lasts until the cluster threshold changes or this adapter learns it (a code
  or owner decision), although `payout_native` itself stays permissionless. `vault-frozen` needs the mint freeze
  authority to thaw the vault; if `custody.mintFreezeAuthority` is null, nothing can thaw it (SPL `ThawAccount`
  fails with `MintCannotFreeze`), so the payout is permanently blocked and needs an owner decision, not a wait.
  Only a fresh finalized `read()` after that plans the payout.
- A step describes one snapshot; it never says a send is safe. After any uncertain outcome (timeout, dropped or
  unknown signature), G12 (the journal) must reconcile the transaction and re-observe finalized state before any
  retry. The planner cannot tell "not sent" from "sent, not yet finalized" and must not be used as that check.
- Neither the native recipient nor the SPL destination account is read, so recipient-side failures show up only
  as a failed payout, while the planner still says `payout` / `payout-pending`. A native payout that would leave
  an empty recipient below the rent-exempt minimum (rent for 0 bytes) fails until the recipient is funded. A
  missing, frozen (`DestinationFrozen`) or re-owned (`WrongRecipient`, after SetAuthority) recipient ATA fails as
  well. Each failure leaves the escrow terminal and retryable.

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

## B1c off-chain acceptance

Verify-only D1 peer acceptance for Solana (candidate, not wired; details and byte layouts in
[docs/acceptance.md](docs/acceptance.md)). Each wallet signs two Solana off-chain messages, version 1 (`0xff`
prefix, never a transaction): the terms consent (both parties sign identical bytes binding `terms-sha256`, genesis,
program and registry ids) and its own peer acceptance (role, wallet, both Nostr keys, expiry). The program verifies
neither (D5); the seller can fund without them.

- `solanaTermsConsentRequest(trade)`, `solanaPeerAcceptanceRequest(trade, draft)`: what a wallet is asked to sign.
- `verifySolanaPeerAcceptance(trade, context, proof)`: strict Ed25519 (RFC 8032 output only, stricter than
  ZIP-215), local registry and session only; the result is `candidateOnly` with `economicPreparationAllowed: false`.
- `decodeSolanaPeerAcceptance`, `decodeSolanaTermsConsent`: strict decoders for signed bytes.
- `SolanaPeerReplayLedger(vault, session, clock)`: encrypted `(termsHash, role)` replay memory and tombstones,
  64 acceptance entries plus 64 tombstones, evicted only after `acceptBeforeSeconds`, 7-day horizon, watermark.

Vectors come from this package and an independent Python implementation (`contracts/solana/vectors/acceptance.py`).
No physical or browser wallet was tested: wallet interoperability is UNVERIFIED.

## B1a: reader and client policies

- `readValidated` reports a frozen-vault trade like any funded trade; `read(…).custody.vaultFrozen` and
  `payoutBlockedBy: ['vault-frozen']` carry the flag. `readPayout` reads both parties' payout destinations at the
  same slot (native 7 keys, SPL 9) and returns plans: `create-ata-idempotent`, `rent-top-up`, `ready` or
  `blocked(reason)`. It builds no instruction.
- Before funding, a mint with a freeze authority needs an exact `freezeAuthorityPermits` match. Existing validated
  escrows keep their original exits when that authority or admission policy changes. `snapshot.mint` surfaces the
  current authority; actual vault freezing still blocks payout. The ProgramData deploy slot stays pinned per reader.
- `src/policy.ts`: PROPOSED margins (300 s each, landing bound 182 s), never applied silently, and
  `settlementActions(snapshot, releaseMargin)`. Details: [docs/b1a-reader.md](docs/b1a-reader.md).

## Lifecycle, submission and recovery (B1b)

Adds signing and submission on top of the read-only modules above (which keep the guarantees stated there):
`message.ts` (legacy message serializer/parser), `plan.ts` (C-L2 plans: one escrow instruction per message, payout
only after a finalized `Released`/`Refunded` read), `wallet.ts` (Wallet Standard `standard:connect` +
`solana:signTransaction`, role-key bound, byte-exact and Ed25519-verified output), `intent.ts`/`journal.ts`
(encrypted-vault journal port with CAS), `submit.ts` (durable send marker before one `sendTransaction`,
`skipPreflight: true`, `maxRetries: 0`, no resend; reconciliation by signature status and finalized blockhash
expiry), `adapter.ts` (mapping to Lane A's `IntentV2`), `recovery.ts` and the entry point
`createSolanaEscrowClient({ rpc, wallet, journal, registry, clock, margins, walletChain })` in `compose.ts`. Margins
are required inputs. The opt-in apps/web Solana localnet recovery controller uses this client with
`ReleaseEnabled: 0`. Details, the state machine, local-validator evidence and the open shared-schema items:
[docs/lifecycle.md](docs/lifecycle.md); recovery:
[contracts/solana/RECOVERY.md](../../contracts/solana/RECOVERY.md).

Native payout planning refuses `rent-unknown` before preparing an intent, signing or sending. Recovery exit
guidance also closes payouts for `rent-unknown` and `rent-shortfall`. A known shortfall can still be reviewed and
paid with an exact top-up bounded by the caller's explicit limit; the limit defaults to zero. Rent blockers never
close funded release or refund. See the [C-L2 rules](docs/lifecycle.md#3-c-l2-releaserefund-never-bundled-with-payout)
for the distinction between a blocked exit and an explicitly bounded recovery review.

`SolanaVaultJournal` in `src/vaultjournal.ts` implements the port with the real encrypted vault's session lease
and persistent CAS. It keeps full native intents per trade, preserving pre-marker signatures, uncertain markers,
payouts and outcomes across fresh-key backup restore. The client rechecks the live journal capability immediately
before physical RPC dispatch. A pure schema parser lets the ordinary offline recovery view show one current,
unverified hint per native trade journal, preserving the full history in the encrypted backup. It imports no
Solana RPC or wallet implementation and grants no transaction authority. See the encrypted vault composition
section in [docs/lifecycle.md](docs/lifecycle.md) for selection rules, bounds and tested recovery behavior.
