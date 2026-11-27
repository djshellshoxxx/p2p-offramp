# Privacy and Recovery

[Home](Home.md) · [User Guide](User-Guide.md) · [Developer Guide](Developer-Guide.md) · [Wallet and QR Safety](Wallet-and-QR-Safety.md)

**Implementation status: development/test-only, with funds disabled.** This page describes merged `main@388526a474aea0e08f9c04178c2b7f9e1d4bee3f`. The default static client and synthetic demo support local encrypted profiles, unchecked encrypted export, explicit authentication of a selected backup, a fresh revision recheck and fresh-key restore. The separate Solana localnet client can export a retained public recovery document. These capabilities do not approve a live payments service; `ReleaseEnabled=0` and the default build has no approved live registry. The [source-consolidation record](../engineering/CONTINUATION_GENERATION17_20261120.md) preserves the exact implementation and qualification scope.

## What is private, and what is not

Profile content and saved reviews are encrypted locally with user-controlled keys. A profile can also hold private journal, messaging and opaque records supplied by the corresponding isolated workflows. A complete encrypted backup preserves that profile's records; it does not contain external-wallet spending keys or necessarily complete relay history.

Encryption at rest does not prove anonymity, conceal public blockchain transfers, authenticate counterparties, establish fiat settlement or protect a compromised browser/device. Extensions, OS access, payment services, relay operators, chain analysis and network metadata can expose information. Browser storage may be evicted; deleting an entry does not guarantee physical erasure, and a cached display does not prove that stored data still exists.

Keep passphrases and complete encrypted backup files separately. Do not put decrypted records, seed phrases, private keys, counterparty evidence or backup passphrases in issue reports, support messages, public logs or unrestricted links. Public recovery documents also contain linkable trade and wallet identifiers.

## Export and authenticate the selected encrypted backup

In the default client or synthetic demo, open **Recovery** and select the intended profile under **Export an encrypted file**. Read the notice and choose **Download unchecked encrypted backup**. Export reads committed ciphertext; its **Authentication not checked** label remains accurate even if the profile is unlocked or an earlier file was authenticated. The browser, not the export receipt, determines whether the complete file is saved.

To check the actual saved file:

1. Unlock the matching local profile.
2. Under **Authenticate a backup file against this profile**, choose **Backup file to authenticate** and enter **Passphrase for this backup file**.
3. Choose **Verify this backup file**. The operation authenticates the file with its passphrase and compares its complete contents and encrypted envelope with the selected profile's committed revision. It reads stored state again before returning and does not restore or write a profile.
4. Inspect the returned profile ID, revision, **Authenticated encrypted envelope SHA-256** and **Verified file SHA-256**. The two digests identify different byte sequences: the canonical encrypted envelope and the complete selected file.

The result covers all encrypted local records in that one profile, including opaque records. It does not establish external-wallet recovery, current chain truth, a counterparty's behavior, file retention on another device or future recovery under changed software. Source: [verification form and labels](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/ui/BackupVerificationForm.tsx), [English source copy](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/ui/locale/en.ts) and [vault authentication](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/packages/storage/src/vault-service.ts).

### Recheck before relying on a revision

Choose **Recheck verified revision** to check the Worker-held verification against fresh persisted profile state. This does not select or read a file again: it rechecks the previously authenticated file's relationship to the selected revision. If there is no held verification, the page says so. If the stored profile changed or the file is for another profile/revision, export the current profile and authenticate the new file.

Verification is local to the current profile selection. Locking, switching profiles or restarting the runtime invalidates it. Changes to profile records can also make a previous result stale. A visible result alone cannot establish continuous freshness or act as an imported approval receipt. Source: [Worker verification ownership and fresh check](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/runtime/worker-endpoint.ts).

## Restore into a new profile with fresh keys

Use **Restore an encrypted file** with the complete file, its original **Backup passphrase** and the destination **New passphrase**, repeated in **Confirm new passphrase**. Read the notice, then choose **Restore as new profile**. The local Worker authenticates and decrypts the file, creates a distinct profile ID and seals the recovered records with fresh keys. The destination starts locked. Existing profiles are neither overwritten nor deleted.

**Open restored profile** selects the new ID for unlock on Home; it does not silently switch an active session. If a different profile is unlocked, choose **Lock vault** first, then unlock the new profile with its new passphrase. Check expected saved records with test data before relying on recovery. A saved EVM terms document is revalidated against the running build's loaded registry when opened; an old review is not new payment or signature authority.

A restored profile needs its own export and explicit file authentication. The original backup belongs to the old profile and cannot verify the new profile's fresh encrypted envelope. Keep the original file and old passphrase until the independent recovery check is complete. Source: [restore form](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/ui/VaultForms.tsx) and [fresh-key backup service](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/packages/storage/src/backup-service.ts).

Restoration cannot recover changes made after the backup or prove what happened on-chain afterward. An interrupted restore may already have created its new profile; inspect the local profile list before repeating it. Restored transaction references and uncertain broadcasts require fresh native reconciliation in the applicable qualified test workflow. A successful restore does not mean an earlier transaction failed or can safely be sent again.

### What file-format and checksum checks establish

The G03 parser applies a **12 MiB input limit**, rejects duplicate JSON keys including escaped duplicates, refuses unexpected fields and validates the encrypted envelope structure. These are format/resource checks, not proof of identity, account ownership or recent chain state. Source: [backup parser](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/packages/schemas/src/backup.ts) and [existing parser tests](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/packages/schemas/test/backup.test.mjs).

The backup checksum detects accidental corruption; it is not a signature or password check. The explicit selected-file operation above separately authenticates the encrypted content against the current profile. Restore also authenticates the encrypted content, but creates a new profile and does not establish current-profile backup verification. A QR fingerprint or matching file hash performs neither operation. Source inspection and existing tests are not independent cryptographic review or proof of secure memory erasure.

## Public Solana recovery JSON and private backup are different files

This section applies only to the isolated **Solana localnet** client, whose recovery flow requires an already funded escrow on its configured local validator.

| File and control | Contents | What it can support |
| --- | --- | --- |
| **Export public recovery JSON** for a retained escrow | Canonical public deployment/genesis identities, public trade terms, role keys, derived escrow addresses and the agreement hash | Re-importing that original public document for separately checked escrow recovery |
| **Export encrypted backup** for the recovery profile | Encrypted private profile records, including its retained recovery documents and transaction journal | Restoring a separate profile with fresh keys through **Restore an encrypted backup** |

Choose **Export public recovery JSON** on the intended retained escrow. The download is named `solana-escrow-TERMS_HASH.recovery.json`, with the selected trade's terms hash in place of `TERMS_HASH`, and stays within the existing 16 KiB document limit. It contains no private profile wrapper, transaction journal, passphrase, signatures or private agreement text. Its public addresses and trade identifiers may still correlate activity; “public” is a content classification, not anonymity.

The export is a read of the already validated retained document. It performs no additional RPC, wallet connection, wallet prompt, signing, send or durable write, and does not refresh chain state. Fresh state and each explicit wallet review remain separate steps. The downloaded public document cannot restore private records or replace an encrypted backup. Source: [public-document schema](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/packages/chain-solana/src/recovery.ts), [export controller](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/solana-localnet/controller.ts) and [localnet UI](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/solana-localnet/SolanaLocalnetRoot.tsx).

The [canonical EVM recovery tool](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/docs/recovery/CANONICAL-EVM.md) has its own scope: it prepares bounded unsigned historical exits from authenticated release pins and fresh chain reads. It cannot restore a vault, sign, transmit, create a trade or enable real-funds features. Its output is also distinct from an encrypted profile backup.

## Browser origins and optional signed updates

A different origin has separate browser storage. An empty profile list at a new origin does not establish that the old profile or its referenced funds disappeared. Preserve the full encrypted file outside the browser and restore explicitly at the intended origin.

**Settings → Signed asset updates** is unconfigured by default. The optional view receives no controller, discovery source, distribution key or destination from this page. A separately trusted composition must perform its own current-backup and wallet checks before any explicit origin transition. The view does not transfer the profile, passphrase, session or backup to the destination, and a displayed backup receipt is insufficient for acceptance. See the [optional update interface](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/ui/SignedUpdatePanel.tsx) and [remaining composition requirements](../engineering/SIGNED_UPDATE_UI_GENERATION13_20261120.md).

## Common problems

- **Missing profile after browser reset:** local storage is not guaranteed durable. A relay or public recovery document cannot reconstruct the complete private vault.
- **Verification fails after a profile change:** export that profile's latest state and authenticate the new file; do not reuse a receipt from a different profile or revision.
- **Restore does not unlock the original profile:** expected. Recovery produces a separate locked profile with fresh keys.
- **Saved review no longer validates:** the running registry may reject it. Preserve its provenance and investigate; an old display is not approval.
- **Public Solana JSON rejected by the backup form:** use the public-document import in the Solana localnet client for that document. Private recovery requires the encrypted backup and its passphrase.
- **No trade-terms review or update check in the default build:** the required trusted configuration is absent. Source modules and test fixtures do not provision it.

See [User Guide](User-Guide.md), [Developer Guide](Developer-Guide.md) and [Security and Release](Security-and-Release.md). These repository sources do not publish a live Wiki or approve production use.
