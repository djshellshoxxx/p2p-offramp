# D1 PeerAcceptance v1 frozen vectors

`peer-acceptance-v1.json` freezes the candidate D1 `PeerAcceptance` EIP-712 bindings for both roles (seller, buyer) and both asset kinds (native, erc20): the binding fields, the binding digest, the EOA signature over the exact TradeTerms digest (`termsSignature`) and the EOA EIP-712 signature over the binding (`bindingSignature`).

Primary type (must equal `PEER_ACCEPTANCE_TYPE` in `packages/wallet/src/evm-peer-acceptance.ts`):

```
PeerAcceptance(uint8 v,bytes32 termsHash,uint8 role,address account,bytes32 ownMessagingKey,bytes32 counterpartyMessagingKey,uint64 notAfterSeconds)
```

Domain: `{name: "P2POfframp", version: "1", chainId, verifyingContract}` from the scenario.

## Generator

`peer-acceptance-v1-generate.mjs` is standalone and deterministic. It reads only `packages/domain/test/fixtures/local-evm-scenario/scenario.json` and uses only viem (`hashTypedData`, `privateKeyToAccount`, `account.sign`, `account.signTypedData`). It never imports production digest helpers from `packages/wallet/src`: `termsHash` is viem's EIP-712 hash of `TradeTerms`, and the synthetic messaging keys are BIP-340 x-only public keys (x coordinate from viem's public key) of the private keys `0x01` x32 (own) and `0x02` x32 (counterparty). `notAfterSeconds` is fixed at `1699995000`. ECDSA signing is RFC 6979 deterministic, so the output is byte-stable.

- viem `2.57.10` (pinned repository dependency; the generator refuses any other installed version)
- Node `v24.22.1` (`/opt/node24/bin/node`), output is JSON with 2-space indentation and one trailing newline

Reproduce from repository root:

```sh
node packages/wallet/test/fixtures/peer-acceptance-v1-generate.mjs --check   # byte-for-byte comparison
node packages/wallet/test/fixtures/peer-acceptance-v1-generate.mjs --write   # rewrite (only for a deliberate vector change)
node --import ./scripts/test-support/register-tsx.mjs --test packages/wallet/test/evm-peer-acceptance.test.mjs
```

The test asserts that the fixture SHA-256 equals the value below and that running the generator in-process yields identical bytes.

Frozen JSON SHA-256: `295b6c0c2ab11414cdebe96596e4dfc0d9c95b32f3966b20b2cb83aec2a531e8`.

## Independent verifier

`contracts/evm/test/PeerAcceptanceVector.t.sol` re-derives the digests with Solidity ABI encoding and checks both signatures with EVM `ecrecover`:

```sh
cd contracts/evm && forge test --match-contract PeerAcceptanceVector
```

## Scope

Keys are the explicitly public synthetic scenario keys. Never fund these accounts. viem is a different implementation from the production noble-based verifier, but this checks agreement between implementations, not independence of all underlying cryptographic ancestry. This is not independent security review, protocol approval, trust-root approval, deployed-contract interoperability or release approval.
