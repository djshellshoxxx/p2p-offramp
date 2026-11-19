# Portable recovery for a funded Solana escrow

How a seller or buyer can reach the escrow's exits without the app's registry, journal or relays. Implemented in
`packages/chain-solana/src/recovery.ts` (pure functions; tests in `packages/chain-solana/test/recovery.test.mjs`).
Status: **adapter**, tested on fakes; the same planner and serializer are exercised on a local validator by
`localnet/client-run.mjs`. No public deployment exists; the only profile is the synthetic `localnet` one.

## The recovery document (`p2p-offramp/solana-escrow-recovery/v1`)

Created from a bound trade with `createRecoveryDocument(trade)` and kept with the user's own backup. It contains
public data only:

| Field | Content |
| --- | --- |
| `network` | network and deployment ids, environment, genesis hash, program id, ProgramData address, ProgramData SHA-256 pin, artifact SHA-256 |
| `terms` | the 15 G16 Solana terms fields (keys, mint, hashes, amounts, times, seller nonce) |
| `termsBytesBase64`, `termsHash` | `encodeSolanaTerms(terms)` and its SHA-256 (the trade id the program stores) |
| `escrow`, `vault` | the escrow PDA and (SPL) vault PDA with their canonical bumps |
| `roles` | seller and buyer public keys |
| `asset` | asset id, kind, mint (or null) and decimals |

It holds **no** private key, seed, mnemonic, signature, wallet data, journal record or private agreement content
(only the agreement hash, which is part of the terms). `parseRecoveryDocument` requires exactly these fields and
recomputes everything derived: the terms bytes and hash, both PDAs and bumps, the ProgramData address, the genesis
and program inside the terms, the roles and the asset. A document that disagrees with itself is refused.

## Steps

1. `parseRecoveryDocument(json)`; then `bindRecoveryTrade(document)` binds the terms to a one-network registry
   view built from the document alone (`recoveryRegistry`): finalized commitment, immutable program
   (`upgradeAuthority: null`), the pinned ProgramData hash, the single asset.
2. Read with the ordinary finalized reader over any RPC the user chooses:
   `readTrustedSnapshot(new SolanaChainReader({ rpc, registry: recoveryRegistry(document) }), trade, request)`.
   The reader checks the genesis hash twice, the loader-v3 program and its ProgramData (authority None, pinned
   hash), the Clock at the read slot, and the escrow bytes against every term. A wrong chain, a different program
   image or a foreign escrow is refused.
3. `recoveryExits(document, trade, snapshot, margins)` lists the exits that finalized snapshot allows:
   - **release** (seller), while `Funded` and `chainTime + releaseMargin < deadline`;
   - **refund** (seller), while `Funded` and the finalized Clock has reached the deadline;
   - **payout** (seller or buyer pays the fee), after `Released`/`Refunded` with the principal unpaid and the vault
     not frozen. The program pays the buyer after release and the seller after refund, whoever submits.
4. `buildRecoveryMessage(document, trade, snapshot, exit, role, margins, recentBlockhash, options)` plans that exit
   with the client's own C-L2 rules and returns the unsigned legacy message and wire transaction. Use a blockhash
   from `getLatestBlockhash` at `finalized` commitment. The message has exactly one escrow instruction; a payout
   message may add `CreateIdempotent` for the recipient's canonical ATA (SPL) or a bounded rent top-up (native).
   A `[release, payout]` or `[refund, payout]` bundle cannot be built: a failed payout leg would roll the release
   or refund back.
5. Sign with any wallet that signs a legacy message for the role key, broadcast once, then read the signature
   status at finalized commitment and re-read the escrow before the next exit (release or refund first, payout
   only after a finalized `Released`/`Refunded`). Never resend the same intent automatically; after the blockhash
   expires (finalized block height above `lastValidBlockHeight`) with no status, build a new message.

## Limits

The document proves nothing about the chain: it only fixes what to look for. The reader trusts one RPC (no light
client); a dishonest RPC can hide or fake state consistently. The finalized Clock lags the tip, so the release
margin must cover landing time. Rent and fees come from the fee payer. Token-2022, wrapped SOL and any program
other than the pinned immutable one are refused. This file does not replace the release-owner recovery material
under `docs/recovery/`.
