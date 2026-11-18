# D1 EOA peer-acceptance candidate

Update (November 18): the [Option B composition](D1-peer-acceptance.md) builds on this candidate, as a Tier C patch
for owner review. It adds the exchange version 2 carrier with injected ports, account classification from pinned
code (ERC-1271, refusal of EIP-7702 and counterfactual accounts), and durable admission with quotas and
deadline retirement. The sections below describe the primitive. Where they differ from that document, that document
is current: the verifier now takes the local registry and refuses a caller domain that differs from it, and the
browser fixture ran in Chromium.

The candidate includes encrypted, session-scoped replay and cancellation history,
the cryptographic primitive, and a private bounded v2 EOA carrier. These remain
private modules, disconnected from the shipped exchange and economic authority.

This implements the offline EOA cryptographic portion of the accepted D1 Option B.
It is a candidate for review, not an approved peer protocol or a completed trading
feature. The live v1 exchange, state machine, wallet prompts, release policy,
escrow ABI and default application graph are unchanged. The verifier is private to
`packages/wallet/src/evm-peer-acceptance.ts` and has no public entry-point export.

## Exact candidate signing statement

Domain: existing EIP-712 `P2POfframp`, version `1`, with chain ID and verifying
contract rebuilt from the receiver's locally trusted registry. The `PeerAcceptance`
type has this exact field order:

| Field | EIP-712 type | Local representation and meaning |
|---|---|---|
| v | uint8 | Number `1`, struct version; separate from envelope version |
| termsHash | bytes32 | 64 lowercase hex without `0x`; recomputed TradeTerms digest |
| role | uint8 | Local `seller` maps to 0, `buyer` to 1 |
| account | address | Canonical nonzero lowercase address, equal to the role in terms |
| ownMessagingKey | bytes32 | Signer's BIP-340 x-only key, 64 lowercase hex without `0x` |
| counterpartyMessagingKey | bytes32 | Other party's distinct, valid BIP-340 x-only key |
| notAfterSeconds | uint64 | Positive canonical decimal string, seconds |

The field names and numeric role mapping above are proposed concrete choices for
the previously open format. Both messaging keys must lift to valid secp256k1
points. `ownMessagingKey` always means the signer, even when the local client is
the recipient. Do not swap it to mean the local client on receive.

Two signatures remain mandatory: the original `TradeTerms` signature and the
separate `PeerAcceptance` signature. Both use existing strict 65-byte EOA recovery,
low-s, v=27/28, and account matching. The binding signs the terms digest, so the
existing order, revision, network/deployment, asset, amount, private agreement,
capabilities, seller nonce and deadline commitments remain transitively bound.
No contract signature arguments or on-chain signature verification are added.

## Verification contract

`verifyEoaPeerAcceptance(registry, domain, terms, context, proof)` snapshots exact own data
fields, and returns null when `domain` differs from the local registry entry for the terms. Trusted context supplies the expected signer role, authenticated sender
and recipient messaging keys, current time and authenticated envelope deadline.
The untrusted proof supplies only the binding and two signatures. It cannot supply
a domain, expected peer identity, clock or authority flag.

Malformed input throws fixed `INVALID_INPUT`; valid-shaped expired, mismatched or
wrong-signer proofs return null. A valid result is frozen and explicitly carries
`candidateOnly:true` and `economicPreparationAllowed:false`. It includes the two
digests and effective expiry, never signatures. It is not a funding authorization.
The strict deadline is `now < min(terms.acceptBeforeSeconds, binding.notAfterSeconds,
envelope.expiresAtSeconds)`. No time fallback or automatic wallet/RPC call occurs.
Caller signature buffers remain untouched. The verifier clears its owned signature
copies on exit; a lower-level helper creates another temporary copy that is not
guaranteed cleared. Signatures are public data. No physical memory-erasure claim is
made.

## Vectors and verification

`packages/wallet/test/fixtures/peer-acceptance-v1.json` contains four deterministic
synthetic vectors: seller/buyer crossed with native/ERC-20 terms. They use existing
public scenario keys and viem 2.57.10's EIP-712 encoder/signing implementation.
Tests recompute the viem digest and signatures, compare the fixed vectors, and
verify them using the repository's existing ABI-word, domain and EOA helpers.
This is cross-implementation encoding evidence, not an independent protocol or
cryptographic review; the libraries share lower-level cryptographic dependencies.

The continuation adds `contracts/evm/test/PeerAcceptanceVector.t.sol`: four
additional vectors cross-check the same fixture using Solidity ABI encoding and
the EVM's `ecrecover`, independent of those JavaScript implementations. Each checks
both signatures and rejects role, key-direction, expiry and domain replay. The
fixture's terms digest/account are cross-checked against the existing canonical
scenario. This still does not replace independent protocol review.

Negative cases cover role/account/key mismatches, invalid x-only points, cross-chain
and cross-contract replay, changed terms and revisions, omitted/corrupt/high-s
signatures, all three deadline boundaries, malformed integers, hostile getters,
revoked proxies, exact field sets and caller-buffer preservation.

Focused command:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test packages/wallet/test/evm-peer-acceptance.test.mjs packages/wallet/test/evm-peer-replay.test.mjs
```

## Encrypted replay and tombstone contract

`CandidatePeerReplayLedger` uses the existing vault lease, encrypted record and
compare-and-swap implementation. It stores one namespaced `preference` record
with schema version 1; the deterministic 128-bit record ID derives from
`p2p-offramp/peer-replay/v1`. Foreign kind, version, format or malformed content at
that ID is rejected without overwrite. No vault schema or shared facade changes.
No signatures, secrets, network endpoint or clock are persisted in this record.

Each terms digest has at most one binding per role. The exact same binding is a
duplicate even when its valid signature bytes differ. A change to account, keys
or signed expiry is a conflict; renewal requires new reviewed terms/nonce rather
than silently replacing an existing statement. Buyer/seller bindings must name
reciprocal keys and distinct accounts. Every admission re-verifies both signatures
and current context; persisted acceptance metadata never grants authority.

A trusted authenticated cancel/reject handler may add an irreversible local
tombstone, including before the first binding arrives. Tombstones deny every
later admission for that terms digest and survive reopen and fresh-key restore
of a backup containing them. There is no clear, delete, age pruning, automatic
retry or network-send operation. The candidate bound is 64 distinct terms digests
and 128 KiB decoded JSON bytes; reaching it refuses new entries without eviction.
These are implementation bounds for review, not protocol constants.

Writes use the captured vault revision and atomic CAS. Even an otherwise
idempotent duplicate runs the existing empty-commit persisted-freshness check:
returning early from cached state would miss a tombstone written by another
session. A stale session gets `CONFLICT` and must reopen. The regression was
mutation-checked: temporarily bypassing this check made the stale-duplicate test
fail; restoring the check made all focused tests pass. Concurrent first bindings
have exactly one CAS winner. Lock/disposal prevent admission; a write committed
just before lock remains recoverable and is never reported as absent.

Backups only contain history present at export. An older backup cannot reconstruct
later tombstones or establish globally current replay state without an external
freshness policy. Offline cross-profile rollback protection, key rotation/rebinding
and interoperability remain protocol decisions before live integration.

Tests use the real encrypted vault and backup services with an atomic in-memory
envelope store. They cover reopen/restore, altered-valid signatures, reciprocal
keys, concurrent CAS, stale duplicates, foreign records, capacity and lock timing.
This does not claim browser IndexedDB race or process-crash qualification for
this new service.

## Private version 2 EOA carrier

`evm-peer-envelope.ts` adds an exact-key `v:2` carrier for `terms-offer` and
`terms-accept`. The outer fields match the existing exchange envelope. An offer
body contains `{terms, acceptance}`; an accept contains `{revision, acceptance}`.
`acceptance` contains `{binding, termsSignature, bindingSignature}`. Each signature
is exactly 65 bytes encoded as lowercase `0x`-prefixed hex. No sender-selected
scheme or authority field is accepted. Contract signatures and cancel/reject
messages are unsupported by this private parser, not downgraded to v1.

The aggregate UTF-8 JSON ceiling remains 24,576 bytes. Decoded offer terms have a
separate 16,384-byte ceiling; JSON escaping counts toward the aggregate budget.
Duplicate keys, unknown fields/versions, malformed integers, mismatched key
directions and wrong advertisement ownership fail closed. Parsed objects are
deeply frozen scalar data. Parsing does not authenticate the messaging channel,
validate the opaque terms review-document contents, verify signatures, classify
accounts or persist replay history.

`verifyCandidatePeerEnvelope` additionally requires the locally authenticated
sender, recipient and selected advertisement, locally reviewed terms, local
registry domain and local clock. It verifies both signatures and refuses a message
whose expiry is more than 3,600 seconds ahead. The result remains candidate-only
with economic preparation false. The live session must still authenticate NIP-17,
classify accounts, enforce lifecycle/current-time checks and admit durable replay
history before any future approved integration.

`npm run test:peer:browser` adds actual browser fixtures for two-tab CAS, reload,
stale duplicates, portable tombstone restore and lock, and now also a two-tab D1
cancel-versus-accept race and deadline retirement. It passed in local Chromium 153
on November 18. It explicitly preserves the old-backup limitation instead of
claiming exported history is globally fresh.

## Remaining D1 integration

Items 2 and 3, the carrier and byte budget in item 4, and the two-wallet failure paths of item 5 (on a loopback
Anvil node, without a browser journey) are implemented in the [Option B composition](D1-peer-acceptance.md) and
await owner review. Independent review, wallet prompts, the inbox/AUTH policy and the browser journey remain open.
The original list:

1. Independently review the exact candidate fields and vectors before adopting a
   version 2 exchange carrier. Existing version 1 `{revision}` remains negotiation
   only; no downgrade from missing binding to terms-only proof is allowed.
2. Derive account scheme from pinned native code. This offline EOA primitive does
   not classify accounts or support ERC-1271, EIP-7702/delegated or counterfactual
   accounts. Add separate point-in-time contract-wallet verification and rechecks.
3. Wire the encrypted replay ledger to authenticated receive/cancel/reject paths
   and bind its admission to the actual live session before economic preparation.
   Review old-backup freshness and key restoration/rotation behavior; qualify the
   composition across browser reloads and IndexedDB races.
4. Finish key-rotation/restore policy and inbox/AUTH policy; review/adopt the
   private EOA carrier and separately define contract-signature budgets.
   Signature bytes never become public offer metadata.
5. Compose the approved localnet-only browser journey, test two wallets and failure
   paths, and retain the existing release and independent-review gates.

Funding is still possible at the contract layer without these off-chain signatures;
this candidate does not change that existing contract behavior or prove fiat payment.
