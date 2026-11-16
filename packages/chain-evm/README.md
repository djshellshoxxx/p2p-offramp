# Read-only EVM adapter (local qualification)

`src/reader.ts` provides `EvmChainReader` with an injected `rpc.request` and a previously loaded registry view. It creates no connection, provider, wallet or signing capability. The default app build excludes this package; no production endpoint or registry is approved by these tests.

- `validateLive(networkId, deploymentId, signal?)` checks `eth_chainId`, block-zero genesis hash, finalized block, deployment runtime Keccak and a repeated anchor.
- `read(binding, request, expectation)` returns both a `ChainObservation` and decoded immutable escrow fields. `readValidated` returns just the observation for the existing authority reducer. Without an explicit layout policy, the six-word `escrows(bytes32)` getter remains pinned to the legacy local basic escrow interface. `binding.tradeId` is the 64 lowercase hex EIP-712 terms digest without `0x`.
- `receipt(binding, expectedTransaction, signal?)` checks the exact expected transaction hash, sender, destination, optional nonce, calldata and principal against native transaction and receipt responses. The trusted preparation layer must bind that expected calldata to the requested action and accepted terms. A receipt alone does not establish escrow state; call `read` to check the actual stored trade.

Expectations use canonical lowercase EVM addresses, decimal base-unit strings and `expirySeconds`. Transactions use canonical even hex calldata and decimal `value`. Registry entries remain the source for permitted assets, genesis, runtime identity and finalized policy. Absent slots must be all zero. Existing slots must match every expected immutable field.

Canonical `contracts/evm` reads use a trusted constructor policy:

```ts
const reader = new EvmChainReader({ rpc, registry,
  escrowLayouts: { [reviewedRuntimeKeccak]: 'canonical-get-trade-v1' },
});
```

The policy keys are 64 lowercase hex runtime hashes (without `0x`), already
authenticated by the loaded registry and matched against finalized `eth_getCode`.
The canonical layout uses `getTrade(bytes32)` with seller/deadline/state/buyer/token/amount.
The other supported value is `legacy-escrows-v1`. Supplying a policy makes unlisted
runtime hashes fail closed before `eth_call`; omission retains legacy behavior.
The policy is copied and frozen at construction. No selector probing, RPC-suggested
layout, mutable caller mapping or registry format migration is involved. This is
trusted bundled configuration, never an imported UI setting. Production runtime
hash approval and independent review remain required; test fixture hashes grant
no production authority.

Reads always use the registry's `finalized` policy. Unsupported/null/malformed finalized headers fail closed; there is no fallback to `latest` and no wall-clock confirmation threshold. A receipt above the finalized height is pending. A canonical failed receipt has `succeeded:false`; a changed receipt anchor is reorged and its success is unknown. A missing receipt remains unknown, never expired or safe to resend. Independent RPC corroboration and chain light-client verification are not implemented: a dishonest RPC can consistently lie.

The reader has at most four physically outstanding jobs, each with a 10-second default deadline (configurable up to 60 seconds). Abort, timeout and dispose reject promptly, but an RPC which ignores abort retains its slot until the actual request settles. Late responses cannot issue another RPC or publish observations. Runtime code is capped at EIP-170's 24,576 bytes; ABI output must be exactly six words. Fixed error metadata excludes provider exception details.

Keccak uses the repository's pinned `@noble/hashes` 2.4.0. Its inventory review remains pending; this local adapter is not release qualification or an independent crypto audit.

```sh
node packages/chain-evm/test/reader.test.mjs
npm run typecheck
```

Tests cover native finalized-state validation, immutable mismatches, bad chain/genesis/code/anchors, malformed ABI/quantities, hostile response accessors, exact receipt bindings, pending/failure/reorg/unknown outcomes, cancellation, physical drain bounds and timeouts. Real local-EVM integration is owned by the coordinator/escrow harness.
