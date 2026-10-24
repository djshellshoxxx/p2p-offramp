# Reusable security components — staged integration

The TypeScript files in src/ are original minimal project-owned adapters, **not** copies of audited upstream cryptographic code. They are intentionally limited to validation and deployment selection. They must not be treated as complete encryption, RPC consensus, signing or escrow integrations.

## Direct reuse candidates and exact upstream locations
| Capability | Upstream | Integration | License/review gate |
|---|---|---|---|
| Safe token transfers | [OpenZeppelin SafeERC20.sol](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/utils/SafeERC20.sol) | Install pinned @openzeppelin/contracts; import, do not paste source | MIT; audit version/allowlisted tokens |
| Reentrancy protection | [OpenZeppelin ReentrancyGuard.sol](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/ReentrancyGuard.sol) | Import pinned package; current upstream marks storage variant deprecated for v6 | MIT; chain EIP-1153 support before transient guard |
| ECDSA / typed-data | [OpenZeppelin ECDSA.sol](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/ECDSA.sol), [EIP712.sol](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/EIP712.sol) | Import pinned version; add nonce/deadline/trade binding | MIT; contract-wallet EIP-1271 support |
| EVM client | [viem](https://github.com/wevm/viem), [typed-data verification](https://viem.sh/docs/actions/public/verifyTypedData) | npm package with exact lock; use publicClient for contract-wallet verification | MIT; provider cannot be trusted blindly |
| secp256k1 | [noble-curves](https://github.com/paulmillr/noble-curves/blob/main/src/secp256k1.ts) | import @noble/curves/secp256k1.js, never copy its transitive implementation | MIT; verify exact release and test vectors |
| Nostr encryption | [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md), [nostr-tools](https://github.com/nbd-wtf/nostr-tools) | import pinned nostr-tools NIP-44 implementation; NIP-44 does not give forward secrecy | verify repo license/version; independent trade-level context |
| Waku | [js-waku](https://github.com/waku-org/js-waku) | isolate behind transport interface | verify exact SDK and relay metadata leakage |
| ZK | [snarkjs](https://github.com/iden3/snarkjs), [circomlibjs](https://github.com/iden3/circomlibjs) | separate optional worker and verifier adapter | GPL and proof trust/setup review before embedding |
| Memory wiping | [Rust zeroize](https://github.com/RustCrypto/utils/tree/master/zeroize) | pinned Cargo dependency in isolated WASM crypto worker | verify release and toolchain wipe semantics |
| Vulnerability testing | [Foundry](https://github.com/foundry-rs/foundry), [Slither](https://github.com/crytic/slither), [Echidna](https://github.com/crytic/echidna) | CI/dev tooling only | review respective licenses and exact versions |
| Alternative source | [OpenZeppelin npm](https://www.npmjs.com/package/@openzeppelin/contracts), [crates.io zeroize](https://crates.io/crates/zeroize), [npm viem](https://www.npmjs.com/package/viem) | consume package registries rather than vendoring crypto | pin artifact integrity and lockfile |

## Migration checklist
1. Choose package versions, verify upstream LICENSE and dependency tree, record immutable commit and tarball SHA-512 in dependency inventory.
2. Add locked dependency installation and license notices. Do not copy upstream code without complete license/attribution and transitive dependencies.
3. Replace the stub adapters with implementations; require signed manifest and runtime code hash, verify chain genesis, authenticate envelopes, bind trade ID in AAD, and verify finality.
4. Add negative tests for poisoned contract address, chain switch, nonce replay, malicious relays, tampered ciphertext, wrong wallet, and RPC equivocation.
5. Run Foundry invariant/fuzz tests and browser security suite. Obtain independent review before real funds.

**Status:** research/staging only; no upstream code has been copied or cryptographic adapters deployed. The dependency approach is safer and more maintainable than pasting isolated Solidity or cryptographic source files with missing imports. See [component matrix](../../spec-open-source-component-matrix.md) and [attack matrix](../../../feature_0.1_threat_modeling/spec-blockchain-and-payment-processor-attack-matrix.md).
