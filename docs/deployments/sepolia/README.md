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

   Before anything is sent it checks:
   - the public endpoint (a keyless `https` URL, see below);
   - that no earlier broadcast is still unrecorded (`UNRECORDED_DEPLOYMENT_PENDING`, with that deployment's transaction and address);
   - the chain id and genesis;
   - that the deployer has at least 0.001 ETH;
   - that nothing under `contracts/evm` differs from the commit, untracked files and submodules included (`DIRTY_SOURCE`);
   - that `forge` and `solc` are the pinned toolchain (`TOOLCHAIN_MISMATCH`; pins in `contracts/evm/README.md`).

   It then broadcasts `contracts/evm/script/DeployBasicEscrow.s.sol` (native-only, empty ERC-20 allowlist; the script itself refuses any chain id other than Sepolia's), waits for the receipt and writes `docs/deployments/sepolia/BasicEscrow-<address>.json` and `registry/testnet/sepolia.registry.json`.

   Everything recorded is read from chain state and compared with a fresh build of the committed sources by the pinned toolchain: runtime code keccak, empty allowlist, receipt status, and the deployer (`deployerVerified`). The record states the `sourceCommit`, `sourceTreeClean` and the `toolchain` that were checked. `finalizedAtRecording` says whether the block was finalized when recorded.

   If anything fails after the broadcast, the output names the transaction and contract address, and `docs/deployments/sepolia/pending-deploy.json` blocks another deployment. Complete the recording with `record-deployment.mjs --tx <hash> --public-endpoint <url> --deployer <address>` (step 4) instead of deploying again.

   The `--public-endpoint` URL is written into the registry, signed and shipped inside the testnet build, so it must be a public, keyless endpoint. If it contains any credential of `SEPOLIA_RPC_URL` or `SEPOLIA_CROSSCHECK_RPC_URL` (user info, query, or a long key-like host label or path segment), the run stops with `PUBLIC_ENDPOINT_IS_PRIVATE_RPC` before anything is sent. Forge runs offline (`FOUNDRY_OFFLINE`), so trace decoding sends nothing to third-party signature services.
4. **Re-record after finality (session).** Sepolia finalizes a block about 13 to 15 minutes after inclusion. Then run:

   ```bash
   node --import ./scripts/test-support/register-tsx.mjs scripts/sepolia/record-deployment.mjs --tx <deploy tx hash> --public-endpoint https://<public sepolia rpc>/ --deployer <deployer address>
   ```

   This reads the code again after finality (G25 §4.2) and writes `finalizedAtRecording: true`. Owner signing refuses a deployment without that. Commit the record and the registry.
5. **Exercise before acceptance (session, recommended).** G25 asks for a full release and a full refund before a deployment is accepted. Run the two-party trade (below) against the recorded, not yet signed registry:

   ```bash
   npm run sepolia:trade -- --run exercise-1 --unsigned-registry --wait
   ```

   The state file records `registryTrust.verified: false`. Every on-chain identity check (chain, genesis, runtime code, deployment record) still applies.
6. **Sign (owner, own machine, after pulling the registry).** Run:

   ```bash
   node scripts/sepolia/owner-release.mjs sign --key ~/p2p-sepolia-release-key/sepolia-release-key.private.jwk --sequence 1
   ```

   It refuses a registry that is not exactly Sepolia (`REGISTRY_NOT_SEPOLIA`), and any deployment whose committed record is missing, does not match the registry entry or was not made from clean sources (`DEPLOYMENT_RECORD_MISSING`, `DEPLOYMENT_RECORD_MISMATCH`) or not after finality (`DEPLOYMENT_NOT_FINALIZED`). `--days` is 1 to 30 (default 30), the verifier's maximum. The output lists the networks, endpoints and deployments that were signed: check them before you commit `registry/testnet/sepolia.release.json` and `sepolia.release.sig.json`. Raise `--sequence` for every later registry.
7. **Verify and accept (anyone).** Run `npm run sepolia:verify -- --accept`. It uses the same verifier as the testnet build: G15 signature, the pinned `keyId` in the trusted-key file (the key and its announced id must match), the G11 registry asset, and the Sepolia-only rule. `--accept` records the verified release in `registry/testnet/sepolia.accepted.json`; commit it. From then on `sepolia:verify`, the trade tool and the testnet build refuse an older signed release, or a different manifest at the accepted sequence, as `RELEASE_ROLLBACK` (G25 §4.3).

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
- Each trade is processed on its own: a failure in one (recorded as its `lastError`) never stops the other, and the run then reports the first failure.
- A release trade that can no longer be released safely (less than 120 s before its deadline, or after it) is settled by refund after the deadline and ends as `refunded-after-release-deadline`.
- A transaction that was broadcast but failed (for example a release mined after the deadline) is recorded in `failedSends` with its hash and outcome (`TX_REVERTED`, `RECEIPT_TIMEOUT`). Only a revert in simulation, when nothing was sent, is treated as "nothing happened"; a nonce change without a readable Forge record is `BROADCAST_UNCERTAIN`.
- Replay controls run at the funding block, so they also work when a run resumes after the acceptance window.
- Logs are read from each trade's own first block in pages of 2,000 blocks, within hosted providers' `eth_getLogs` caps.
- Terminal outcomes are re-checked against the chain on every run. Finality is checked against each recorded block hash, and a re-included transaction is marked `reincluded`.
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
- a crash between the fund broadcast and its save, resumed after the acceptance window;
- a release trade resumed after its deadline, and a release mined after its deadline (recorded as `TX_REVERTED`, then refunded);
- terminal statuses that the chain contradicts, and a re-included transaction;
- paged log queries through a proxy that caps `eth_getLogs` at 3 blocks;
- edited state files (parties, amount, deadline, swapped signature, agreement) refused before any transaction;
- a Forge failure reported as `FORGE_FAILED`;
- a check that the evidence holds no key or RPC URL.

Both local proofs drop every inherited `SEPOLIA_*` variable, so a session that holds the real Sepolia secrets never signs or queries with them.

For the kit itself, `npm run test:sepolia:kit` covers:
- the toolchain pins (and that this README states them), a different `forge` or `solc`, dirty or untracked contract sources;
- the refusals before sending: an invalid, keyed or private public endpoint, wrong chain, non-Sepolia genesis, unfunded or missing key, a command-line genesis override;
- a failure after the broadcast: the pending marker, a refused second deployment, and completion with `record-deployment`;
- every recorder refusal from real chain state: foreign runtime code, wrong genesis, non-https endpoint, unexpected deployer, a non-deployment, a reverted deployment, a non-empty allowlist, a disagreeing cross-check;
- re-recording after finality, and owner signing (non-Sepolia registry, unfinalized or mismatched record, more than 30 days);
- verification (expired manifest, untrusted key, a key id that does not match the key, tampered registry) and acceptance with rollback refusal;
- the CLIs running from a checkout path with spaces reached through a symlink;
- a check that no key or RPC URL is in any Forge cache or broadcast file, and that the checkout's broadcast records are untouched (Forge writes them to a per-run directory).

CI runs both in `evm-escrow.yml`.

## Not done yet

These are the next slices:
- **Running the two-party Sepolia trade.** The tool is ready and proven locally. Running it needs the deployment, the signed registry and `SEPOLIA_BUYER_PRIVATE_KEY`.
- **App testnet build.** The build exists: `npm run build:testnet` reviews Sepolia terms against the signed registry (`docs/OPERATOR.md`). Accepting, signing and funding from inside the app (wallet connection) are not built yet, and `connectOrigins: []` stays empty in every build.
- **ERC-20 assets.** The deployment is native-only.

Recorded deviations from G25 for this testnet registry: the deployment record carries `reviewEvidence: null` (no independent review of the deployed code), and the trade tool reconciles from its own state file and chain state, not through the G12 transaction journal, so G25's crash-and-reconcile exercise through G12 is not performed.

Before any real-funds release, these are still required: independent audit, G06 crypto reviews and production trust-root decisions.
