# Sepolia test-network deployment (G25)

The test network is Ethereum Sepolia: chain id `11155111`, genesis `0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9`. Both values come from go-ethereum `params/chainspecs/sepolia.json` and `params/config.go`. The owner chose this network on 2026-10-28.

This is **testnet only**:
- no real funds are involved;
- `ReleaseEnabled` stays `0`;
- the escrow contract is not audited.

Nothing in this kit can target mainnet. Both the wrapper and the Forge script refuse any chain other than Sepolia (chain id **and** genesis).

## Who holds what

| Item | Holder | Where it lives |
|---|---|---|
| Deployer key: testnet-only, fresh, small Sepolia ETH balance | Owner creates it | Cloud environment secret `SEPOLIA_DEPLOYER_PRIVATE_KEY`. It is never in the repo, chat, argv or logs. |
| Sepolia RPC URL (may embed a provider API key) | Owner | Environment secret `SEPOLIA_RPC_URL`. Optional second provider: `SEPOLIA_CROSSCHECK_RPC_URL`. |
| Release signing key: P-256, testnet-only trust root | Owner, on their own machine | The private JWK never leaves that machine. Only the public key is committed, at `security/testnet-trust/sepolia-release-key.pub.json`. |

## Steps

1. **Environment (owner).**
   - In the cloud environment settings, add the secrets above.
   - Allow the RPC provider's host under Network access.
   - Start a new session, because secrets load at session start.
2. **Trust root (owner, own machine).** Run:

   ```bash
   node scripts/sepolia/owner-release.mjs keygen --out ~/p2p-sepolia-release-key
   ```

   Commit the printed `{ keyId, publicKey }` as `security/testnet-trust/sepolia-release-key.pub.json`, or paste it to the agent. It is public data.
3. **Deploy (session).** Run:

   ```bash
   npm run sepolia:deploy -- --public-endpoint https://<public sepolia rpc>/
   ```

   It does the following:
   - checks the chain id and genesis;
   - checks that the deployer has at least 0.001 ETH;
   - broadcasts `contracts/evm/script/DeployBasicEscrow.s.sol` (native-only, empty ERC-20 allowlist);
   - waits for the receipt;
   - writes `docs/deployments/sepolia/BasicEscrow-<address>.json` and `registry/testnet/sepolia.registry.json`.

   It also verifies these values from chain state: runtime code keccak equal to the pinned artifact, empty allowlist, receipt status, deployer. `finalizedAtRecording` records whether the block was already finalized when recorded.
4. **Sign (owner, own machine, after pulling the registry).** Run:

   ```bash
   node scripts/sepolia/owner-release.mjs sign --key ~/p2p-sepolia-release-key/sepolia-release-key.private.jwk --sequence 1
   ```

   Commit `registry/testnet/sepolia.release.json` and `sepolia.release.sig.json`. Raise `--sequence` for every later registry.
5. **Verify (anyone).** Run `npm run sepolia:verify`. This uses the app's own G15 verifier and the G11 registry loader.

## Local proof

`npm run test:sepolia:kit` runs the whole kit against a private anvil started with chain id 11155111. It covers:
- the refusals: wrong chain, non-Sepolia genesis, unfunded key, missing key, foreign runtime code, non-https endpoint, expired manifest, untrusted key, tampered registry;
- the record, the registry and a verified release;
- a check that no key appears in any written file or in the Forge broadcast log.

CI runs it in `evm-escrow.yml`.

## Not done yet

These are the next slices:
- **Two-party Sepolia trade proof.** It needs a second testnet key for the buyer (`SEPOLIA_BUYER_PRIVATE_KEY`).
- **App testnet build.** It needs a trusted-key build profile, and wallet signing behind the G05 broker. Today `connectOrigins: []` stays empty in every build.
- **ERC-20 assets.** The deployment is native-only.

Before any real-funds release, these are still required: independent audit, G06 crypto reviews and production trust-root decisions.
