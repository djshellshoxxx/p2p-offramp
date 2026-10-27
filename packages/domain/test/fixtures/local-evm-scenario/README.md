# Local EVM scenario fixture (synthetic, test-only)

- Synthetic and test-only. Not a production registry; it is no trust root and approves nothing.
- Not an independent golden vector: expected values were produced once by running the code under test (same authorship), then frozen. They catch drift, not shared mistakes.
- `registry.json`: one `local` network (chainId 31337, loopback endpoint), placeholder addresses and hashes, `releaseId` "test-local-only".
- `scenario.json`: registry SHA-256, two term sets (native, ERC-20), deterministic test-only keys (`keccak256("p2p-offramp-test-only-local-scenario-<role>")`), recorded hashes.
- Never deploy to, fund, or reuse these addresses or keys on any real network. No RPC, anvil or deployment is involved.
- Used by `packages/domain/test/local-evm-scenario.test.mjs` and `packages/wallet/test/local-evm-scenario.test.mjs`.
