# EVM MVP architecture and adapter boundaries

Date: 2026-11-11. Describes the components the M1 trade uses and where upstream code sits.

```
 seller/buyer wallet (EIP-1193)
        │  eth_accounts / eth_chainId / eth_sendTransaction
        ▼
 packages/wallet/src/evm-adapter.ts   ── session {account, chainId, generation}; invalidates on change
 packages/wallet/src/evm-execution.ts ── ONLY send path: canonical validation → journal.reserve →
        │                                 markSending (durable) → one eth_sendTransaction → recordBroadcast
        ▼
 contracts/evm/src/BasicEscrow.sol    ── custody; OZ 5.4.0 SafeERC20 + ReentrancyGuard
        ▲
        │  read-only: eth_chainId, genesis, finalized block, eth_getCode keccak, eth_call, receipts
 packages/chain-evm/src/reader.ts     ── EvmReadRpc (request) ◄── [dev-only] viem PublicClient via
                                                                     scripts/test-support/viem-read-rpc.mjs
 packages/relay/src/pool.ts           ── broker-authorized WSS relays, NIP-01 verify, dedupe, backoff
 packages/relay/src/nip01.ts          ◄── [dev-only differential] nostr-tools/pure, nostr-tools/filter
 packages/exchange/*                  ── NIP-17/44/59 encrypted negotiation
 packages/domain/src/intent-journal.ts, tx-lifecycle.ts ── durable intents, reconcile, recovery
 apps/web                             ── vault + trade review only; none of the above is bundled
```

## Authority rules preserved

- One send authority: `createEvmExecution`. No upstream library is given a wallet or signer.
- One account/session authority: `EvmWalletAdapter` (wagmi rejected for this reason).
- One persistence system: the existing intent journal and vault.
- Relay endpoints only through the transport broker allowlist (NDK rejected: relay discovery).
- `ReleaseEnabled=0`; no network allowlist, registry trust or release configuration changes.

## New code on this branch

| File | Kind | Purpose |
|---|---|---|
| `packages/relay/test/pool.test.mjs` | regression tests | Pin that a socket slot is held until `close` under spec-order `error`→`close` and under `error` without `close` |
| `scripts/test-support/viem-read-rpc.mjs` | dev-only adapter | viem `PublicClient` → `EvmReadRpc`; 7-method read allowlist; fixed-text errors; abort raced |
| `scripts/test-evm-viem-oracle-local.mjs` | dev-only Anvil oracle | 17 differential checks reader vs viem |
| `scripts/tests/viem-read-rpc.test.mjs` | unit tests | adapter + reader fail-closed on malformed results |
| `packages/relay/test/nostr-tools-differential.test.mjs` | unit tests | NIP-01 interoperability and strictness |

No production source or interface was modified (a relay change was made and reverted after independent review; see the test results). `package.json` gains two exact devDependencies and the
`test:evm:viem` script.
