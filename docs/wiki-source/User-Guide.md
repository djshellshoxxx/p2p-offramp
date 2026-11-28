# User Guide

[Home](Home.md) · [Developer Guide](Developer-Guide.md) · [Privacy and Recovery](Privacy-and-Recovery.md)

**Status: development/test-only.** Real-funds trading is disabled: `ReleaseEnabled=0`. A source merge, demonstration or successful test does not approve a live exchange service.

The original November 20 sections describe merged `main@388526a474aea0e08f9c04178c2b7f9e1d4bee3f` on November 20, 2026 UTC. The [source-consolidation record](../engineering/CONTINUATION_GENERATION17_20261120.md) identifies the merged implementation and its scoped hosted checks. The [November 18 reconciliation](../consolidation/2026-11-18-documentation-reconciliation.md) and dated [development status](../DEVELOPMENT_STATUS.md) retain their historical source scope; their descriptions of then-unmerged localnet work are not the current capability list.

## Choose the appropriate build

The same repository contains several isolated clients. A feature in a localnet fixture does not become available in the normal static client.

| Build | Available workflow | Scope |
| --- | --- | --- |
| Default static client | Local encrypted profiles, encrypted export, explicit backup authentication, fresh-key restore and local inspection tools | No approved live registry, wallet connection or funds movement |
| Synthetic demo | The local profile workflows plus offline example offers and read-only EVM terms review | Synthetic examples; an unlocked profile can save up to eight original terms files and revalidate them on load |
| EVM localnet fixture | Isolated buyer/seller, wallet, journal and recovery exercises | Explicit loopback test configuration; not a public exchange endpoint |
| Solana localnet fixture | Import fixed native SOL terms, review and confirm seller funding, recover finalized escrows, export an encrypted backup or a public recovery document | Explicit local-validator configuration. The seller supplies the terms. Bilateral negotiation and browser SPL funding remain outside this workflow. |

The [Developer Guide](Developer-Guide.md) describes build and source boundaries. The existing [qualification record](../engineering/CONTINUATION_GENERATION17_20261120.md) covers its named browser and native fixtures. Physical-wallet/device acceptance, production trust configuration, independent security approval and real-funds release remain separate work.

## Installation and access

Developers and testers need Node 24 or newer and the pinned lockfile. From the repository root, run `npm ci --ignore-scripts`, then `npm run build:demo` for the synthetic demonstration. Its output is `apps/web/dist-demo`. The default static build is `npm run build`, with output in `apps/web/dist`.

These commands do not create an approved production endpoint. Localnet clients need their own explicit fixtures; a normal or demo build does not select a network or wallet for them. See [Getting Started](Getting-Started.md) and the [operator guide](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/docs/OPERATOR.md).

## Local profiles and saved terms

On **Home**, create a profile after reading the no-reset consent, or unlock an existing profile using its exact profile ID and passphrase. The profile belongs to the current browser origin. Use **Lock vault** when finished; browser storage is not a durable backup.

In the synthetic demo, review full addresses, chain, asset, amount, expiry and settlement warnings before saving a terms document. Saved terms remain encrypted within that profile and are checked again against the loaded registry when opened. A review does not authenticate fiat payment or authorize a wallet transfer. The [current shell and review composition](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/ui/App.tsx) keeps these profile and build scopes separate.

## Export, authenticate and recheck a backup

The default client and synthetic demo expose these controls on **Recovery**:

1. Under **Export an encrypted file**, select the intended profile, accept the export notice and choose **Download unchecked encrypted backup**. Preserve the complete downloaded file and its passphrase separately. The browser controls whether it is saved; exporting does not test the passphrase or verify recovery.
2. Unlock the matching local profile. Under **Authenticate a backup file against this profile**, choose the saved file in **Backup file to authenticate**, enter **Passphrase for this backup file**, then choose **Verify this backup file**.
3. A successful result identifies the profile and committed revision, plus the authenticated encrypted-envelope and selected-file SHA-256 values. It authenticates that file against the complete current encrypted profile, including opaque records, without restoring or changing the profile.
4. Use **Recheck verified revision** before relying on the result. This checks the held verification against the current stored profile revision. A displayed result is a point-in-time observation, not a continuous freshness guarantee. If the file no longer matches, export the latest profile and verify its new file. Locking or changing the selected profile retires that selection's verification.

A checksum, QR fingerprint, successful unlock or completed download does not substitute for step 2. The check does not establish external-wallet spending-key recovery, complete relay history, current chain state or retention of the file on another device. The [Recovery page](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/ui/Pages.tsx), [verification form](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/ui/BackupVerificationForm.tsx) and [current English labels](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/ui/locale/en.ts) define this workflow.

## Restore into a separate profile

On **Recovery**, use **Restore an encrypted file** with the complete backup, its **Backup passphrase** and the destination **New passphrase**, repeated in **Confirm new passphrase**. Read the restore notice and choose **Restore as new profile**. A successful restore creates a separate, locked profile with fresh keys and a new profile ID. It leaves existing profiles intact.

Choose **Open restored profile** to select it for unlock on Home; enter the new passphrase there. If another profile is unlocked, use **Lock vault** before unlocking the restored one. With test data, check that the expected records are present, then export and authenticate a backup of this new profile. The old file belongs to the original profile and cannot serve as current-profile verification for the fresh-key copy.

Keep the original file and old passphrase until independent recovery verification is complete. An older backup cannot contain later local changes or prove what a counterparty did afterward. Restored transaction references need fresh chain reconciliation before any economic action in a qualified test flow; an uncertain broadcast must not be retried as though it was unsent. See [Privacy and Recovery](Privacy-and-Recovery.md) and the [fresh-key backup service](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/packages/storage/src/backup-service.ts).

In the isolated EVM localnet client, **Recheck and resume saved trade** is an explicit
step for an eligible restored, unfunded agreement. It revalidates the original
acceptances and does not itself send a transaction. Any subsequent transaction
still requires its own fresh wallet review. An older backup cannot reveal a peer
withdrawal that happened afterward. Source: [localnet resumption UI](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/localnet/LocalnetRoot.tsx).

## Solana seller funding and public recovery documents

For an unfunded local proposal, follow the [seller funding and review steps](../consolidation/SOLANA_BROWSER_RECOVERY.md).

This workflow belongs only to the isolated **Solana localnet** client. For an already retained escrow, **Export public recovery JSON** downloads that escrow's canonical public recovery document. The file contains original trade terms, public wallet addresses and deployment identities, including the agreement hash. It can link public activity to the selected trade.

The action exports the retained document; it does not refresh finalized state, connect or prompt a wallet, sign, send, or create a new trade. It excludes the private profile wrapper, transaction journal, passphrases and signatures. Keep a separate **Export encrypted backup** file for private profile and journal recovery. A public recovery JSON file cannot be used in **Restore an encrypted backup**. See the [Solana localnet UI](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/solana-localnet/SolanaLocalnetRoot.tsx) and [export controller](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/solana-localnet/controller.ts).

## Signed asset updates in Settings

**Settings → Signed asset updates** is present, but update checking is unconfigured in the default build. **Check for a signed update** is disabled; **Open backup and recovery tools** remains available. Opening Settings does not select a distribution key, discovery service or destination.

The optional view can show a release candidate only when a build supplies a separately trusted controller. Its explicit check, review and confirmation are distinct steps. This guide supplies no production configuration, and a review does not approve a release. A move to another origin has separate local storage and requires an explicit restore there; no profile, passphrase, session or backup is transferred automatically. Source: [optional update view](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/ui/SignedUpdatePanel.tsx) and [composition limits](../engineering/SIGNED_UPDATE_UI_GENERATION13_20261120.md).

## Troubleshooting

- **Trade-terms review unavailable in the default build:** no approved registry is embedded. Use the explicitly labeled synthetic demo for offline sample review.
- **Testnet build reports `KEY_UNPINNED` or `TESTNET_TRUST_MISSING`:** the required approved release key or trust files are absent. This is not a request to choose an arbitrary key.
- **Backup verification reports a different revision:** unlock the intended profile, export its latest committed state and authenticate that new file. Recheck before relying on the receipt.
- **The old backup will not verify against a restored profile:** the restored profile has a new ID and fresh keys. Export and verify its own file.
- **A restore was interrupted:** inspect the local profile list before trying again; a destination profile may already have been created.
- **Browser data disappeared or a new origin is empty:** local storage can be removed or evicted, and different origins have separate storage. Preserve a complete encrypted backup independently.
- **Signed update checking is disabled:** this is the default unconfigured state, not evidence of a network outage.

## Frequently asked questions

**Can I send real funds?** No. The documented exchange and recovery exercises use synthetic or explicitly configured local test environments. `ReleaseEnabled=0`.

**Does the app guarantee fiat settlement?** No. Check actual payment records independently; screenshots and local trade state cannot establish finality or rule out reversals.

**Does encryption make me anonymous?** No. Public transactions, payment providers, relays, network metadata, extensions and device access can reveal information.

**Is the live Wiki published by this update?** No. These are repository documentation sources. Their integrity checks do not approve their meaning or publish them.

See [Privacy and Recovery](Privacy-and-Recovery.md), [Wallet and QR Safety](Wallet-and-QR-Safety.md), [Security and Release](Security-and-Release.md) and the [source-consolidation record](../engineering/CONTINUATION_GENERATION17_20261120.md) for the corresponding limits.
