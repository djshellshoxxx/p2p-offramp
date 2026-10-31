# Local EVM escrow evidence

This package implements and tests the basic manual EVM escrow from G16/G17/G18. It is an isolated development harness, excluded from the static client. It has no external RPC endpoint, production deployment script, production signing key or authority to enable trading. All balances exist only in a loopback-only Anvil subprocess, destroyed after each test. No fork endpoint is configured.

## Reproduce

Requires Node 24+ and Linux x64 for the pinned platform binary. The test process needs permission to bind/connect to loopback. From this directory:

```sh
npm ci --ignore-scripts --cache /workspace/work/npm-cache
npm test
node test/integration/escrow.test.mjs
node scripts/evidence.mjs
```

The direct test command shows individual cases where an outer test-runner environment otherwise reports file-level results. Anvil binds only `127.0.0.1` on an OS-selected port. The fixture launches it explicitly, waits at most 10 seconds, bounds local JSON-RPC replies, and terminates it on success or failure. Published deterministic development keys are never real credentials. No subprocess startup key listing is printed or persisted.

Development dependencies are exact-pinned in this package's own lockfile: Solidity solc-js 0.8.38 (`0.8.38+commit.1835d247`), ethers 6.17.0, official `@foundry-rs/anvil-linux-amd64` 1.7.1, and OpenZeppelin contracts 5.0.2. The JavaScript/Solidity dependencies are MIT; Foundry is MIT OR Apache-2.0. Sources and tarball integrity are recorded by `package-lock.json`. Anvil version and source commit `4072e48705af9d93e3c0f6e29e93b5e9a40caed8` are checked before starting it.

The initial Ganache 7.9.2/ethers 6.15.0/solc 0.8.30 evaluation passed its tests but its isolated dependency graph had 36 npm advisories, including 5 critical. It was replaced rather than treating development-only exposure as exemption. Ethers 6.17.0 updates `ws`; Solidity 0.8.38 incorporates Yul optimizer correctness fixes and updates temporary-file handling. Official release notes were reviewed at [Solidity 0.8.38 changelog](https://github.com/ethereum/solidity/blob/v0.8.38/Changelog.md) and [ethers 6.17.0 changelog](https://github.com/ethers-io/ethers.js/blob/v6.17.0/CHANGELOG.md). Explicit Shanghai code generation avoids relying on changing compiler defaults. OpenZeppelin 5.0.2 retains its Shanghai-compatible signature helpers; no custom cryptographic implementation or upstream-source patch is used.

Solc 0.8.38 pins `tmp` 0.2.6, which has GHSA-7c78-jf6q-g5cm. A narrowly scoped `solc` → `tmp` override pins 0.2.7. The official [0.2.7 source](https://github.com/raszi/node-tmp/blob/v0.2.7/lib/tmp.js) checks option types before traversal checks; API shape remains compatible. The complete local suite and explicit compiler invocation pass with this override. `npm audit` on the final isolated graph reports zero advisories, including development dependencies, at the time of this check. This does not certify the native Anvil binary or prove absence of undisclosed vulnerabilities. Registry metadata provides official Foundry repository/provenance links; no independent attestation verification is claimed.

## Contract and composition API

`contracts/BasicEscrow.sol` uses OpenZeppelin EIP712, SignatureChecker (EOA/EIP-1271), SafeERC20 and ReentrancyGuard. Constructor inputs are `(networkId, deploymentId, approvedTokens[])`; IDs and at most 32 exact token runtime code hashes are bound at creation. There is no mutation/admin/upgrade/sweep path. `termsHash(TradeTerms)` is the exact G16 EIP-712 digest, used here as `tradeId`. Empty core capabilities are bound to `SHA256(0x00)`. Acceptance signatures are bounded at 4096 bytes each; this is a local test profile, not a qualified wallet policy.

- `fund(TradeTerms, bytes sellerAcceptance, bytes buyerAcceptance)` — only seller; native value equals principal, ERC-20 value is zero and seller debit/escrow receipt each equal principal. Failed transfers or signatures revert trade creation, liability changes and nonce consumption together.
- `release(bytes32 termsHash)` — seller only, strictly before expiry; pays stored buyer exactly principal.
- `refund(bytes32 termsHash)` — anyone at/after expiry; pays stored seller exactly principal. Failed payouts leave the trade funded and retryable at the same destination.
- `escrows(bytes32)` — `(address seller,address buyer,address asset,uint256 amount,uint64 expiry,uint8 state)`, states absent 0, funded 1, released 2, refunded 3.
- `outstandingPrincipal(address)` tracks custody liabilities separately from unsolicited surplus. ERC-20 settlement checks escrow debit and recipient receipt, with state and liability rollback on any failure.

`compileEscrow()` / `compileContracts()` from `scripts/compile.mjs` compile on explicit call, returning ABI, creation bytecode, runtime template, compiler identity and source digest. Imports perform no compilation/deployment. Compiler settings: optimizer 200 runs, IR pipeline, Shanghai. The compiled runtime contains immutable placeholders; its template hash is not a deployed code identity. Read actual deployed code and genesis block from the provider when composing registry evidence.

`fixture()` from `test/helpers.mjs` starts the loopback-only chain and returns raw `rpc`, ethers provider/signers, synthetic offline signing keys, contracts, `terms()`, `signatures()`, `hash()`, `fund()`, time controls and `cleanup()`. It reads the real genesis from that instance through raw RPC; it does not hardcode a production genesis. `finalize()` mines two blocks under the synthetic one-slot epoch policy, retaining native finalized-tag behavior rather than rewriting finalized reads to latest. `compiled.BasicEscrow.abi` is the complete ABI for composition.

## Verification coverage and limitations

The suite compares terms digests across Solidity, ethers TypedDataEncoder and the project's `evmTermsHash`. It exercises native/ERC-20 release/refund, permissionless refund destination, seller/buyer signature and caller binding, EIP-1271 revocation, chain/contract/ID replay, reused seller nonce across orders, empty/oversized/high-s signatures, exact duration/deadline boundaries, rejected and reentrant recipients, false/no-return/revert/recipient-fee/sender-fee/rebase tokens, callback attempts, changed runtime code, forced ETH and deterministic randomized multi-trade conservation. Test actors are deliberately unsafe and never deployment candidates.

Exact balance deltas and runtime codehash matching do not prove token honesty, or detect proxy implementation changes whose proxy runtime remains identical. Only externally qualified assets could ever be enabled. Contract-wallet trust and liveness, token freezing, seller withholding after fiat payment, chain/provider failure and transaction inclusion uncertainty remain risks. Public events expose participants, amounts, asset, deadlines and terms digest; private payment instructions are never sent to the contract.

No Forge fuzz/property suite, Slither result, external security audit, real wallet/browser chain interaction, production registry approval or deployed-host acceptance is claimed. This package and its deterministic synthetic keys must never receive real funds. `ReleaseEnabled=0` and the app's empty connection allowlist are unchanged.
