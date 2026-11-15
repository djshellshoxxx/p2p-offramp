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

## Inspect a trade

Run the examples from the copied package directory. Set the endpoint ID and
trade ID to the actual values first. The trade ID is 64 lowercase hex digits
without a `0x` prefix.

```sh
endpoint='registered-endpoint-id'
trade_id='your-64-digit-trade-id'
node recover.mjs inspect --endpoint "$endpoint" --trade-id "$trade_id"
```

`profile.json` identifies the original network/deployment and signed release.
`registry.json` lists its approved endpoint IDs. Choose one explicitly; the tool
never selects an alternate or accepts an arbitrary URL. Running a command exposes
the escrow address, trade ID and public chain reads to that endpoint. A provider
can correlate these with the connection's IP address. Local profile labels and
exported journal states do not authenticate a node or establish fiat receipt.

### Using a private reference from the app

If you already have the exported JSON, go straight to the command below. To
create the file from a profile that contains transaction journal records:

1. Unlock that profile, open **Recovery**, and choose **Inspect recovery references**
   under **Offline transaction recovery references**.
2. Select the records you need on the current page. Each page scans up to 64
   journal records. The app counts records it cannot interpret and omits them
   from the available selections.
3. Confirm the privacy notice and choose **Preview selected private references**.
   Check the network, deployment and trade ID against your records, then choose
   **Download previewed private recovery file**. Review a fresh selection if
   the journal changes before download. Download each page's selection before
   moving to another page.

The download is readable JSON. Pass its path to `--reference`. The example
assumes the file is in the current directory. `--item` takes a zero-based
position in the downloaded object's `items` array. If “Reference 65” was the
only record selected, it is item 0 in the file.

```sh
node recover.mjs inspect --endpoint "$endpoint" --reference ./p2p-private-recovery-references.json --item 0
```

The exact `p2p-offramp/offline-recovery-references/v1` envelope contains
`authority: "unverified-offline-reference"`, `localSnapshotRevision`, and selected
`items` with `recordId`, `intentId`, `binding`, `account`, `action`, `storedState`,
`chainReference` and `nonce`. It contains no calldata or acceptance signatures.
Only its binding locates the trade; all monetary fields, parties, state and
deadline are reread from the escrow. Keep this private file away from public
hosting. The G12 encrypted journal remains in its existing version-1 format;
the recovery tool never opens its vault or resubmits a stored prepared request.

### Reading the result

On success the CLI writes one JSON object to standard output with `ok: true`
and exits with status 0. In `value.binding`, match the trade ID, network ID and
deployment ID to your recovery records. Look up the numeric `chainIdentity` and
deployment `address` for those IDs in the authenticated `registry.json`. Compare
`value.trade` with the expected seller, buyer, token, base-unit amount and deadline.
`value.anchor` identifies the latest block used for the trade read.
`value.identityAnchor` identifies the finalized block used to check the runtime
code. An `absent` trade state means that the escrow reported no trade at that
ID at the observed block.

## Prepare an unsigned call

Choose the applicable command. For release, set `from` to the stored seller.
For refund or withdrawal, set it to the intended caller. Use a nonzero address
with a `0x` prefix and 40 lowercase hex digits.

```sh
from='your-lowercase-caller-address'
node recover.mjs prepare-release --endpoint "$endpoint" --trade-id "$trade_id" --from "$from"
node recover.mjs prepare-refund --endpoint "$endpoint" --trade-id "$trade_id" --from "$from"
node recover.mjs prepare-withdraw --endpoint "$endpoint" --trade-id "$trade_id" --from "$from"
```

Release requires the bound seller and latest chain time strictly before deadline.
At or after deadline anyone may trigger refund, which pays the bound seller.
The prepared result adds `value.transaction`, whose `chainId` is hexadecimal
and whose `to` is the escrow address. Check its network, sender, destination,
calldata and zero value before copying it into an external wallet. The wallet must choose its
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

## When a command refuses

A refusal writes `{"ok":false,"error":{"code":"…"}}` to standard output and
exits with status 1. Check the exit status before consuming `value`.

| Code | What to check |
|---|---|
| `TRUST_CONTEXT_REQUIRED` | Use the authenticated package's `recover.mjs`. The source entry point lacks the embedded historical profile. |
| `ASSET_MISMATCH` | Check the package files against independently authenticated originals. Even editing the bundled README changes its digest. |
| `WRONG_CHAIN` | Compare the reference network and deployment with the package profile, and check the selected endpoint's chain identity. |
| `CONFLICT` | Inspect the trade again. Release and refund depend on state and chain time. Withdrawal requires a positive pending balance. |
| `USER_REJECTED` | For `prepare-release`, compare `--from` with the stored seller. This code can occur before a wallet is involved. |

## Building the package

Maintainers build with the exported `buildEvmRecoveryPackage` API using the exact
live result of existing G15 `verifyRelease` over both registry and committed
canonical ABI assets. Copied approval JSON is rejected. The ordinary maintained
Sepolia builder is `node --import ./scripts/test-support/register-tsx.mjs
scripts/recovery/build-evm.mjs --out <new-directory>` from the checkout. It uses
the existing pinned release key and accepted-sequence policy without overrides;
an unset key pin returns `KEY_UNPINNED`, and a registry-only manifest cannot prove
the required ABI asset. Packaging requires a current proof; runtime recovery uses
only its original historical pins. This package implements no Solana recovery.
