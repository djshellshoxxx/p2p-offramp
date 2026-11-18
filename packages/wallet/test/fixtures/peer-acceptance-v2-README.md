# D1 version 2 carrier vectors

`peer-acceptance-v2-carrier.json` freezes one seller `terms-offer` and one buyer `terms-accept` version 2 envelope
for the native scenario, with their inputs and intermediate values: the EIP-712 domain separator, the TradeTerms struct
hash and termsHash, the PeerAcceptance type hash, each binding's struct hash and digest, and both wallet signatures.

`peer-acceptance-v2-generate.mjs` produced it with viem 2.57.10 (EIP-712 hashing and signing) and @noble/curves 2.4.0
(BIP-340 x-only messaging keys from the fill-1 and fill-2 test secrets). The generator checks both versions and never
calls this repository's digest, binding or envelope code. Inputs come from
`packages/domain/test/fixtures/local-evm-scenario/scenario.json`, including its public synthetic test keys; never
fund those accounts.

Consumers:

- `packages/wallet/test/evm-peer-v2-vectors.test.mjs` checks the file hash, recomputes every value with the
  repository's own code, verifies both statements and round-trips both envelopes byte-for-byte through the exchange
  parser and encoder.
- `contracts/evm/test/PeerAcceptanceV2Vector.t.sol` recomputes the domain separator, the TradeTerms and
  PeerAcceptance struct hashes and digests with Solidity `abi.encode`, and recovers both signatures with `ecrecover`.
  `contracts/evm/foundry.toml` grants read access to this one file.

Reproduce from the repository root (the signatures are deterministic, RFC 6979):

```sh
node packages/wallet/test/fixtures/peer-acceptance-v2-generate.mjs
```

Frozen JSON SHA-256: `8d94487aae2243eaca1b812306a6a2ba938ef833dec2fc62b3c14b70c544fe77`.

The JavaScript libraries share lower-level cryptographic ancestry, so this is cross-implementation encoding evidence,
not independent protocol or cryptographic review, interoperability with another client, or release approval.
