# Sepolia test-network deployment (G25)

The test network is Ethereum Sepolia: chain id `11155111`, genesis `0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9`. Both values come from go-ethereum `params/chainspecs/sepolia.json` and `params/config.go`. The owner chose this network on 2026-10-28.

This is **testnet only**:
- no real funds are involved;
- `ReleaseEnabled` stays `0`;
- the escrow contract is not audited.

Nothing in this kit can target mainnet. The wrappers refuse any node other than Sepolia (chain id **and** genesis) and the Forge scripts refuse any other chain id. The genesis check has no command-line override.

The testnet trust root covers **Sepolia only**. Signing, `sepolia:verify`, the trade tool, the testnet build and the app at runtime all use one rule (`apps/web/src/testnet/sepolia-network.ts`): the signed registry must name exactly one network, `sepolia`, with chain id `11155111` and Sepolia's genesis. The registry's own `environment` label is not trusted, so a registry that lists another chain is refused, whatever it calls that chain.

## Who holds what

| Item | Holder | Where it lives |
|---|---|---|
| Deployer key: testnet-only, fresh, small Sepolia ETH balance | Owner creates it | Cloud environment secret `SEPOLIA_DEPLOYER_PRIVATE_KEY`, with or without `0x`. It is never in the repo, chat, argv or logs. |
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

   The `--public-endpoint` URL is written into the registry, signed and shipped inside the testnet build, so it must be a public, keyless endpoint. If it contains any credential of `SEPOLIA_RPC_URL` or `SEPOLIA_CROSSCHECK_RPC_URL` (user info, query, or a long key-like host label or path segment), the run stops with `PUBLIC_ENDPOINT_IS_PRIVATE_RPC` before anything is sent. Forge runs offline (`FOUNDRY_OFFLINE`), so trace decoding sends nothing to third-party signature services.
4. **Sign (owner, own machine, after pulling the registry).** Run:

   ```bash
   node scripts/sepolia/owner-release.mjs sign --key ~/p2p-sepolia-release-key/sepolia-release-key.private.jwk --sequence 1
   ```

   It refuses a registry that is not exactly Sepolia (`REGISTRY_NOT_SEPOLIA`). `--days` is 1 to 30 (default 30), the verifier's maximum. The output lists the networks, endpoints and deployments that were signed: check them before you commit `registry/testnet/sepolia.release.json` and `sepolia.release.sig.json`. Raise `--sequence` for every later registry.
5. **Verify (anyone).** Run `npm run sepolia:verify`. It uses the same verifier as the testnet build: G15 signature, the pinned `keyId` in the trusted-key file (the key and its announced id must match), the G11 registry asset, and the Sepolia-only rule.

## Two-party test trade

Run this after the registry is signed and verified:

```bash
npm run sepolia:trade -- --run <id>
```

It runs two native trades against the deployment named in the signed registry:

- **release** — offer → both parties sign the G16 terms → the seller funds → the seller releases → the buyer is paid;
- **refund** — offer → sign → fund → the chain clock passes the deadline → the refund goes to the seller.

**Keys and amounts.**
- `SEPOLIA_SELLER_PRIVATE_KEY` sends every transaction. If it is unset, `SEPOLIA_DEPLOYER_PRIVATE_KEY` is used.
- `SEPOLIA_BUYER_PRIVATE_KEY` only signs the off-chain acceptance and needs no ETH.
- The default amount is 0.0001 ETH per trade (`--amount-wei`).

**What each step checks.**
- Before anything is sent:
  - The terms pass the app's own terms review against the verified registry.
  - Both acceptances verify, and neither verifies across roles, chains or deployments.
  - The on-chain `tradeIdOf` equals the off-chain `termsHash`.
  - Each trade's terms are written as a `local-terms-review/v1` file next to the state.
- Amount, replay and expiry controls run as `eth_call`, so they cost nothing:
  - one wei short → `IncorrectDeposit`;
  - same terms → `TradeIdUsed`;
  - reused seller nonce → `SellerNonceUsed`;
  - refund before the deadline → `DeadlineNotReached`;
  - release after the deadline → `DeadlinePassed`;
  - repeat settlement → `InvalidState`.
- Settlement is verified from escrow events and from the balance change across the settlement block, with exact amounts and the right party.
- Every observation also goes through the domain trade authority.

**Resuming.**
- The state file is `docs/deployments/sepolia/trades/<id>.json`. The terms and signatures are written to it before any transaction.
- The state file is editable, so a resumed run trusts nothing in it. Before any transaction it re-checks each negotiated trade: the parties derived from the keys, network and deployment, the amount from this invocation (`--amount-wei`, default 1e14 wei; pass the same value when resuming), the app's terms review, the termsHash, and both acceptance signatures. Any difference stops the run with `STATE_MISMATCH`.
- A Forge failure that is not a simulated revert (for example a missing binary) stops the run as `FORGE_FAILED`. It is not treated as "not funded".
- Each run reconciles from chain state first. A transaction whose hash was lost in a crash is recovered from the escrow logs and never re-funded.
- The escrow's `MIN_DURATION` is 30 minutes, so the refund trade settles on a later run. Pass `--wait` to block until the deadline instead.
- An acceptance window that lapses before funding ends as `expired-unfunded`, and nothing is sent.
- `--wait-finalized` waits until every transaction is in a finalized block.

**Gas.** `BasicEscrow` only pays out when `gasleft() >= MIN_PAYOUT_GAS` (120k). Forge's default gas estimate is too low for release and refund, so those transactions revert on chain. The trade tool therefore takes the limit from the node's `eth_estimateGas` plus 20% and 10k gas. Wallets that estimate the same way are unaffected.

## Local proof

`npm run test:sepolia:kit` runs the whole kit against a private anvil started with chain id 11155111. `npm run test:sepolia:trade` does the same for the two-party trade tool. It covers:
- both trades;
- a resumed run;
- recovery of a lost transaction hash;
- an acceptance window that lapses before funding;
- refusals;
- edited state files (parties, amount, deadline, swapped signature, agreement) refused before any transaction;
- a Forge failure reported as `FORGE_FAILED`;
- a check that the evidence holds no key or RPC URL.

Both local proofs drop every inherited `SEPOLIA_*` variable, so a session that holds the real Sepolia secrets never signs or queries with them.

For the kit itself, `npm run test:sepolia:kit` covers:
- the refusals: wrong chain, non-Sepolia genesis, unfunded key, missing key, a keyed or private public endpoint, a command-line genesis override, foreign runtime code, non-https endpoint, a non-Sepolia registry or more than 30 days at signing, expired manifest, untrusted key, a key id that does not match the key, tampered registry;
- the record, the registry and a verified release;
- a check that no key appears in any written file or in the Forge broadcast log.

CI runs both in `evm-escrow.yml`.

## Not done yet

These are the next slices:
- **Running the two-party Sepolia trade.** The tool is ready and proven locally. Running it needs the deployment, the signed registry and `SEPOLIA_BUYER_PRIVATE_KEY`.
- **App testnet build.** The build exists: `npm run build:testnet` reviews Sepolia terms against the signed registry (`docs/OPERATOR.md`). Accepting, signing and funding from inside the app (wallet connection) are not built yet, and `connectOrigins: []` stays empty in every build.
- **ERC-20 assets.** The deployment is native-only.

Before any real-funds release, these are still required: independent audit, G06 crypto reviews and production trust-root decisions.
