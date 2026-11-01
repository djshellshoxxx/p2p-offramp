# Canonical EVM recovery package

This package prepares unsigned calls to one original `contracts/evm` BasicEscrow.
It requires Node 24 or newer; no frontend, browser storage, wallet plugin,
package installation or running app is needed. It cannot sign, send, fund,
approve a token allowance or replay a journal request. Trading stays disabled.

Authenticate the executable and `checksums.json` through an independently
trusted distribution source. Compare the package digest, original addresses,
chain identities and runtime hashes from two independent locations. A checker
and checksum delivered by the same hostile source cannot authenticate themselves.
Keep the whole directory: the executable checks the profile, registry, ABI and
these instructions against its embedded hashes before contacting an endpoint.

Run commands from the copied package directory:

```sh
node recover.mjs inspect --endpoint <registered-id> --trade-id <64-lowercase-hex>
node recover.mjs prepare-release --endpoint <registered-id> --trade-id <id> --from <seller-address>
node recover.mjs prepare-refund --endpoint <registered-id> --trade-id <id> --from <caller-address>
node recover.mjs prepare-withdraw --endpoint <registered-id> --trade-id <id> --from <caller-address>
```

`profile.json` identifies the original network/deployment and signed release.
`registry.json` lists its approved endpoint IDs. Choose one explicitly; the tool
never selects an alternate or accepts an arbitrary URL. Running a command exposes
the escrow address, trade ID and public chain reads to that endpoint. A provider
can correlate these with the connection's IP address. Local profile labels and
exported journal states do not authenticate a node or establish fiat receipt.

To use the app's private recovery-reference export, replace `--trade-id` with
`--reference /path/to/private-export.json --item 0`. Item indexes start at zero.
The exact `p2p-offramp/offline-recovery-references/v1` envelope contains
`authority: "unverified-offline-reference"`, `localSnapshotRevision`, and selected
`items` with `recordId`, `intentId`, `binding`, `account`, `action`, `storedState`,
`chainReference` and `nonce`. It contains no calldata or acceptance signatures.
Only its binding locates the trade; all monetary fields, parties, state and
deadline are reread from the escrow. Keep this private file away from public
hosting. The G12 encrypted journal remains in its existing version-1 format;
the recovery tool never opens its vault or resubmits a stored prepared request.

Compare the output's stored seller, buyer, token, exact base-unit amount, deadline,
chain ID and escrow with your independently authenticated recovery records.
Release requires the bound seller and latest chain time strictly before deadline.
At or after deadline anyone may trigger refund, which pays the bound seller.
Copy the generated `transaction` into an external wallet only after checking its
network, sender, destination, calldata and zero value. The wallet must choose its
current nonce, fees and adequate gas and perform its own fresh simulation.
These observations can change after reading; construction does not authorize or
guarantee inclusion. A request is unsigned and contains no private key.

A terminal trade can have a deferred payout. `pendingWithdrawal` names only its
immutable beneficiary and asset; its amount is aggregate credit for that pair,
not a new per-trade claim. `prepare-withdraw` always names that beneficiary,
regardless of the caller. A permanently rejecting recipient can still prevent
delivery. There is no alternate recipient, sweep, retry or automated send.

After manually sending through an external wallet, retain its transaction hash,
wait for the original registry's finalized policy, and independently reread the
receipt, canonical inclusion and escrow state. Rerun inspection before deciding
whether another action is needed. An uncertain broadcast is not proof that no
transaction was sent. Do not replay a journal or automatically submit again.

The package preserves an authenticated historical deployment snapshot. Its
release's later expiry does not disable original on-chain exits. It grants no
current-release, new-funding, deployment, wallet or fiat authority. Fresh reads
still require matching chain/genesis/runtime and stable block anchors. One RPC's
answers are not independent consensus verification. Wrong identity, malformed
state, unavailable RPC or changing anchors stops transaction construction.

Maintainers build with the exported `buildEvmRecoveryPackage` API using the exact
live result of existing G15 `verifyRelease` over both registry and committed
canonical ABI assets. Copied approval JSON is rejected. The ordinary maintained
Sepolia builder is `node --import ./scripts/test-support/register-tsx.mjs
scripts/recovery/build-evm.mjs --out <new-directory>` from the checkout. It uses
the existing pinned release key and accepted-sequence policy without overrides;
an unset key pin returns `KEY_UNPINNED`, and a registry-only manifest cannot prove
the required ABI asset. Packaging requires a current proof; runtime recovery uses
only its original historical pins. This package implements no Solana recovery.
