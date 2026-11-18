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

### Block-hash-bound state reads (EIP-1898)

Each job resolves the `finalized` header once (number `N`, hash `H`). Every state read names that block by hash with the [EIP-1898](https://eips.ethereum.org/EIPS/eip-1898) object, never by number or tag:

```json
{"method":"eth_getCode","params":["<deployment address>",{"blockHash":"H","requireCanonical":true}]}
{"method":"eth_call","params":[{"to":"<deployment address>","data":"0x<selector><tradeId>"},{"blockHash":"H","requireCanonical":true}]}
```

`requireCanonical` is always `true`, and the object is frozen per job. These are the only block-parameter state reads the reader makes; it does not call `eth_getBalance`, `eth_getStorageAt`, `eth_getTransactionCount` or `eth_getProof`. Header reads are unchanged: the final recheck still asks `eth_getBlockByNumber(N)` and requires the same hash and timestamp, and receipts are still compared with the block at their own height.

What this establishes, within one result:

- The runtime code and the escrow state come from the single block `H` that the observation reports, even when one RPC URL fronts several honest backends that disagree (a load balancer over a node on a short fork, or nodes at different heights). With number pinning, such a backend could answer `N` from a different block while the recheck landed on a node that agreed with the anchor, so the old reader could report a state that block `H` does not hold.
- A backend that does not have `H`, or has it only off its canonical chain, must refuse the read (EIP-1898 recommends -32001 for not found and -32000 for not canonical). The reader then fails closed with `UNAVAILABLE`. A finalized anchor that is reorged out before a state read fails the same way.
- A node or proxy that rejects the object form (for example -32602 invalid params) fails closed with `UNAVAILABLE`. A non-hex or malformed answer fails with `INTEGRITY_FAILURE`. There is no retry and no fallback to block-number pinning.

What it does not establish:

- That `H` is really finalized or canonical on the actual chain, or that the returned bytes are the state at `H`. The reader checks no state proof (`eth_getProof` against the header's `stateRoot`) and runs no light client. A dishonest RPC, or a non-compliant node that ignores the object and answers from another block, can still lie consistently.
- Liveness. Behind a load balancer with lagging or forked backends, more reads fail closed than before. A caller may retry the whole read later; each job takes a new anchor.
- Receipt finality below the anchor. `receipt()` compares the receipt's block with the header at the receipt's own
  height. At the anchored height `N` that header must equal `H`, otherwise the read fails with `INTEGRITY_FAILURE`.
  Below `N` the header is still matched by height only, so a backend on a short fork can answer the receipt, the
  transaction and the header at that height consistently with each other but not with `H`'s chain. Binding older
  receipts to `H` needs a parent-hash walk or a state proof, and is not implemented.
- Other readers. The wallet's payment preflight, submit and contract-acceptance reads and the recovery tool still pin
  state by block number (tracked as a Lane A follow-up). This section covers `packages/chain-evm` only.

Evidence for the node behaviour: the success path with the object form runs against real Anvil in CI through
`npm run test:evm:viem` (Anvil 1.5.1) and `npm run test:evm:local` (Anvil 1.7.1). The refusal codes (-32001 for an
unknown hash or one dropped by `evm_revert`, -32602 for a malformed object) were checked by hand on 2026-11-18 against
both versions and are not reproduced by a committed test. Public RPC providers have not been tested.

The reader has at most four physically outstanding jobs, each with a 10-second default deadline (configurable up to 60 seconds). Abort, timeout and dispose reject promptly, but an RPC which ignores abort retains its slot until the actual request settles. Late responses cannot issue another RPC or publish observations. Runtime code is capped at EIP-170's 24,576 bytes; ABI output must be exactly six words. Fixed error metadata excludes provider exception details.

Keccak uses the repository's pinned `@noble/hashes` 2.4.0. Its inventory review remains pending; this local adapter is not release qualification or an independent crypto audit.

```sh
node packages/chain-evm/test/reader.test.mjs
npm run typecheck
```

Tests cover native finalized-state validation, immutable mismatches, bad chain/genesis/code/anchors, malformed ABI/quantities, hostile response accessors, exact receipt bindings, pending/failure/reorg/unknown outcomes, cancellation, physical drain bounds and timeouts. The C-L1 tests use injected round-robin RPCs over honest EIP-1898 fake nodes (forked, ahead, behind). They check the exact block parameter, rejection of the object form, a reorged-out anchor, and that no result pairs the anchor with state from another block. The load-balancer regression test fails on the earlier number-pinned reader. Real local-EVM integration is owned by the coordinator/escrow harness.
