# D1 EOA peer-acceptance candidate

This implements the offline EOA cryptographic portion of the accepted D1 Option B.
It is a candidate for review, not an approved peer protocol or a completed trading
feature. No exchange envelope, state machine, wallet prompt, release policy, escrow
ABI or default application graph is changed. The implementation is private to
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

`verifyEoaPeerAcceptance(domain, terms, context, proof)` snapshots exact own data
fields. Trusted context supplies the expected signer role, authenticated sender
and recipient messaging keys, current time and authenticated envelope deadline.
The untrusted proof supplies only the binding and two signatures. It cannot supply
a domain, expected peer identity, clock or authority flag.

Malformed input throws fixed `INVALID_INPUT`; valid-shaped expired, mismatched or
wrong-signer proofs return null. A valid result is frozen and explicitly carries
`candidateOnly:true` and `economicPreparationAllowed:false`. It includes the two
digests and effective expiry, never signatures. It is not a funding authorization.
The strict deadline is `now < min(terms.acceptBeforeSeconds, binding.notAfterSeconds,
envelope.expiresAtSeconds)`. No time fallback or automatic wallet/RPC call occurs.
Caller signature buffers remain untouched; internal copies are cleared on every
exit. This is ordinary owned-buffer cleanup, not a physical memory-erasure claim.

## Vectors and verification

`packages/wallet/test/fixtures/peer-acceptance-v1.json` contains four deterministic
synthetic vectors: seller/buyer crossed with native/ERC-20 terms. They use existing
public scenario keys and viem 2.57.10's EIP-712 encoder/signing implementation.
Tests recompute the viem digest and signatures, compare the fixed vectors, and
verify them using the repository's existing ABI-word, domain and EOA helpers.
This is cross-implementation encoding evidence, not an independent protocol or
cryptographic review; the libraries share lower-level cryptographic dependencies.

Negative cases cover role/account/key mismatches, invalid x-only points, cross-chain
and cross-contract replay, changed terms and revisions, omitted/corrupt/high-s
signatures, all three deadline boundaries, malformed integers, hostile getters,
revoked proxies, exact field sets and caller-buffer preservation.

Focused command:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test packages/wallet/test/evm-peer-acceptance.test.mjs
```

## Remaining D1 integration

1. Independently review the exact candidate fields and vectors before adopting a
   version 2 exchange carrier. Existing version 1 `{revision}` remains negotiation
   only; no downgrade from missing binding to terms-only proof is allowed.
2. Derive account scheme from pinned native code. This offline EOA primitive does
   not classify accounts or support ERC-1271, EIP-7702/delegated or counterfactual
   accounts. Add separate point-in-time contract-wallet verification and rechecks.
3. Persist replay identities by terms/role and bind the keys to the authenticated
   session before economic preparation. Duplicate identity must ignore signature
   byte differences; conflicting keys fail closed. Cancel/reject tombstones must
   survive new sessions, reconnects, vault reopen and restore.
4. Finish key-rotation/restore policy, inbox/AUTH policy and the bounded version 2
   carrier, including contract-signature budgets. Signature bytes never become
   public offer metadata.
5. Compose the approved localnet-only browser journey, test two wallets and failure
   paths, and retain the existing release and independent-review gates.

Funding is still possible at the contract layer without these off-chain signatures;
this candidate does not change that existing contract behavior or prove fiat payment.
