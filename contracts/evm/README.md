# contracts/evm — BasicEscrow (basic v1, test networks only)

Immutable seller-release / timeout-refund escrow for native ETH and an allowlist of plain ERC-20 tokens
fixed at deployment. No owner, admin, proxy, pause, upgrade, sweep, operator, juror or oracle path
(roadmap decision 2). No deployment is approved; `RELEASE_ENABLED` stays 0.

| State | Call | Authority | Result |
|---|---|---|---|
| None | `fundNative(terms)` / `fundToken(terms)` | `msg.sender == terms.seller` | Funded; participants, asset, amount, deadline immutable |
| Funded, `block.timestamp < deadline` | `release(tradeId)` | bound seller | Pays bound buyer; terminal `Released` |
| Funded, `block.timestamp >= deadline` | `refund(tradeId)` | anyone | Pays bound seller only; terminal `Refunded` |
| Released / Refunded | any settlement | none | `InvalidState`; trade id and seller nonce never reusable |
| — | `withdraw(recipient, asset)` | anyone | Pays a deferred credit to its recipient only |

## tradeId = G16 EVM termsHash

The contract does not accept an opaque id. `fundNative`/`fundToken` take the G16 public terms and
compute `tradeId = tradeIdOf(terms)` on-chain, which is exactly `evmTermsHash(domain, terms)` from
[`packages/wallet/src/evm-terms.ts`](../../packages/wallet/src/evm-terms.ts):

```
tradeId = keccak256(0x19 0x01 || domainSeparator || hashStruct(TradeTerms))
domainSeparator = EIP712Domain(name "P2POfframp", version "1", chainId = block.chainid,
                               verifyingContract = address(this))
TradeTerms(uint8 v,bytes32 orderId,uint64 revision,string networkId,string deploymentId,address seller,
           address buyer,uint8 assetKind,address asset,uint256 amountBaseUnits,bytes32 privateAgreementHash,
           bytes32 capabilitiesHash,bytes32 sellerNonce,uint64 acceptBeforeSeconds,uint64 escrowExpirySeconds,uint8 mode)
```

| `evm-terms.ts` input | Solidity `TradeTerms` field | Contract use |
|---|---|---|
| (constant `v = 1`) | not passed; hashed as `uint8(1)` | v1 only |
| `orderId` (64 lowercase hex) | `bytes32 orderId` | hashed |
| `revision` (decimal) | `uint64 revision` | must be ≥ 1 |
| `networkId`, `deploymentId` | `string` | hashed as `keccak256(utf8)`; registry binding is off-chain (G11) |
| `seller` | `address seller` | must equal `msg.sender` |
| `buyer` | `address buyer` | release recipient; ≠ 0, seller, escrow |
| `assetKind` `"native"` / `"erc20"` | `uint8 assetKind` 0 / 1 | selects `fundNative` / `fundToken` |
| `asset` | `address asset` | zero for native; allowlisted token for ERC-20 |
| `amountBaseUnits` | `uint256 amountBaseUnits` | exact `msg.value` / exact balance delta |
| `privateAgreementHash`, `capabilitiesHash` | `bytes32` | hashed only (SHA-256 values from `packages/domain/src/trade-terms.ts`) |
| `sellerNonce` | `bytes32 sellerNonce` | single use per seller (`SellerNonceUsed`) |
| `acceptBeforeSeconds` | `uint64` | funding requires `block.timestamp < acceptBefore` |
| `escrowExpirySeconds` | `uint64` | the escrow deadline; `1800 ≤ expiry − now ≤ 604800` (`checkFundingWindow`) |
| (constant `mode = 0`) | not passed; hashed as `uint8(0)` | basic manual mode only |

Because the domain contains `chainId` and the escrow address, the same terms produce different ids on
another chain or deployment (cross-deployment replay fails). `test/TermsVector.t.sol` reads
`packages/domain/test/fixtures/local-evm-scenario/scenario.json`, deploys the escrow and token at the
fixture's registry addresses on chain 31337, and asserts `tradeIdOf == expectedEvmTermsHash` for both the
native and ERC-20 sets before funding and settling them. That fixture is synthetic and shares authorship
with the TypeScript encoder, so the test catches drift, not shared mistakes.

Acceptance signatures are **not** verified on-chain: the seller's acceptance is its funding transaction;
the buyer's EIP-712 acceptance is checked off-chain (`verifyEoaAcceptance`) before funding. A buyer who
never accepted cannot lose anything through this contract.

## Build and test

```
npm run test:evm            # cd contracts/evm && forge test
FOUNDRY_PROFILE=ci forge test   # 4096 fuzz runs, 256x100 invariant runs (CI)
npm run abi:evm             # regenerate abi/BasicEscrow.json (CI fails on drift)
```

Toolchain: Foundry v1.5.1-stable (`b0a9dd9c`), solc 0.8.30 (`solc-static-linux`, sha256
`f3e987dc6ecebd4bd350c48edcbc320b46cf9e3109bd3fc3d88f1acaf4c428f7`), EVM target `cancun`. Where
`binaries.soliditylang.org` is blocked, place the static binary at `~/.svm/0.8.30/solc-0.8.30` or set
`FOUNDRY_SOLC`. Clone with `git submodule update --init contracts/evm/lib/forge-std
contracts/evm/lib/openzeppelin-contracts` (nested OpenZeppelin submodules are not needed).

## Vendored dependencies (git submodules, pinned)

| Path | Upstream | Pin | License |
|---|---|---|---|
| `lib/forge-std` | github.com/foundry-rs/forge-std | v1.11.0 `8e40513d` (tests only) | MIT OR Apache-2.0 (`LICENSE-MIT`, `LICENSE-APACHE`) |
| `lib/openzeppelin-contracts` | github.com/OpenZeppelin/openzeppelin-contracts | v5.4.0 `c64a1edb` | MIT (`LICENSE`), © Zeppelin Group Ltd |

Only `IERC20`, `SafeERC20` and `ReentrancyGuard` are compiled into `BasicEscrow`. Upstream license files
remain in the submodules. Review status of both is recorded in [SECURITY-NOTES.md](SECURITY-NOTES.md).
