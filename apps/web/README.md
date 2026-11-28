# Static web client

The client starts with the local vault locked. The default build supports encrypted profiles, backups and fresh-key recovery on the current browser origin. Trading is disabled (`ReleaseEnabled: 0`).

## User guide

| Task | Where | What to do |
|---|---|---|
| Create a profile | Home (`#/home`) | Choose **Create new profile**, enter and confirm a passphrase, accept the notice, then choose **Create encrypted profile**. Success opens the empty profile and displays its ID. Keep the ID and passphrase for later. |
| Open a profile | Home (`#/home`) | Choose **Unlock existing profile**. Select an ID from the local list or enter its 32 lowercase hexadecimal characters, then enter the passphrase. Choosing an ID fills the field. Unlocking requires the passphrase. |
| Back up a profile | Recovery (`#/recovery`) | Under **Export an encrypted file**, select or enter the profile ID, acknowledge the notice and choose **Download unchecked encrypted backup**. The download works while locked. Check that the browser saved the file and keep the passphrase separately. |
| Authenticate a saved backup | Recovery (`#/recovery`) | Unlock the matching source profile, then under **Authenticate a backup file against this profile**, select the saved file, enter its passphrase and choose **Verify this backup file**. **Recheck verified revision** asks the Worker to check its current stored verification fact. |
| Restore a backup | Recovery (`#/recovery`) | Under **Restore an encrypted file**, select the encrypted JSON, supply its original passphrase, enter and confirm the destination passphrase and choose **Restore as new profile** after accepting the notice. The Worker authenticates the backup and writes a separate profile with fresh keys. A successful restore reports a new, locked profile ID and the record count. |

Every backup download is labelled **Authentication not checked**, including exports made while a profile is unlocked. Export copies the stored ciphertext. Explicit backup verification authenticates the complete selected file against the open profile's committed revision without writing or restoring data. Its displayed file and envelope digests describe that point-in-time check. Recheck before relying on the revision; profile changes, lock, cancellation or a replacement selection retire the verification fact. A checksum or an exported file does not establish this fact.

Restoring and unlocking a separate profile exercises fresh-key recovery. **Open restored profile** takes you to Home with the confirmed ID selected. If another profile is open, use **Lock vault** before unlocking the restored one. The restored profile needs its own exported file and verification; the original file does not match its new key and profile identity. Neither verification nor restore covers external-wallet spending keys, complete relay history or on-chain truth.

**If creation or restore is interrupted**, a profile may have been written before the page received the result. After an interrupted creation, reopen **Unlock existing profile** on the same origin and inspect its list before creating again. After an interrupted restore, choose **Check local profiles**. The form keeps retry disabled while the inventory is unavailable, busy or incomplete. A fresh list shows which IDs exist. It cannot establish which operation created an unfamiliar ID.

Profiles live in this browser's IndexedDB. A different origin can show an empty list even when the source profile still exists. With a profile unlocked, the **Offline transaction recovery references** section lets you inspect and export selected journal references. Keep the full encrypted backup for profile recovery. For historical chain inspection using those references, see the [canonical EVM recovery guide](../../docs/recovery/CANONICAL-EVM.md).

## Public Solana recovery document in the local validator profile

In the separate Solana localnet recovery app, unlock the profile containing an
imported funded escrow and choose **Export public recovery JSON** on that escrow.
The file preserves its original validated recovery document: deployment and
genesis identity, public terms, seller and buyer addresses, and derived escrow
addresses. The filename includes the terms hash. The export reads the selected
profile and makes no additional RPC, wallet connection, signature or transaction.

This public document and the encrypted profile backup serve separate purposes.
Keep the encrypted backup for the private profile and transaction journal; the
public JSON can be used with the existing
[portable Solana recovery tooling](../../contracts/solana/RECOVERY.md). It fixes
which deployment and terms to inspect and does not establish current chain state.
The separate local-validator build also supports seller-directed native SOL funding.
Open an encrypted profile and paste the fixed proposal into **Funding proposal JSON**.
Choose **Save seller funding proposal**, then **Connect seller wallet** on the saved card.
Choose **Review funding**, check the seller, buyer, lamports, deadlines, escrow address and
fee information, then choose **Confirm and sign in wallet**. Use **Refresh finalized state**
to check the outcome. The recovery card appears once the validator reports the finalized escrow.
The [local-validator guide](../../docs/consolidation/SOLANA_BROWSER_RECOVERY.md) describes the proposal input.

## Developer guide

`src/app-services.ts` starts `AppRuntime` with `{ version: 1, ReleaseEnabled: 0, connectOrigins: [] }` and a same-origin dedicated module Worker. The Worker owns IndexedDB access and the authenticated vault session. The React UI uses the services interface for profile inventory, creation, unlock, encrypted export, explicit backup verification and restore. Profile IDs are public selection metadata. The UI keeps them out of route URLs.

The document revokes its current handle on lock or `pagehide`. The Worker also enforces a five-minute idle deadline. Status polling does not extend it. Requests and replies carry a generation and request ID so the document can ignore a late result after cancellation or lock. That revocation can occur after a durable profile write, which is why an interrupted operation needs a fresh inventory check.

Run from the repository root with Node 24 or newer. The browser fixtures use Chromium on loopback by default. Set `P2P_CHROMIUM` to the executable path if automatic discovery cannot find it.

```sh
npm ci --ignore-scripts
npm run build
node scripts/test-runtime-browser.mjs
node scripts/test-web-build-browser.mjs
npm run test:backup:browser
```

The backup verification journey also accepts `P2P_BACKUP_BROWSER=firefox` or
`P2P_BACKUP_BROWSER=webkit`. Install the matching engine with the locked Playwright
CLI, for example `node node_modules/playwright-core/cli.js install --with-deps firefox`,
then run `P2P_BACKUP_BROWSER=firefox npm run test:backup:browser`. The hosted matrix
is configured to run both engines with the same journey and assertions. This is scoped engine
qualification; it does not certify Safari, mobile devices, wallets or the full app.

The build type-checks the project and emits the default static app in `apps/web/dist/`. The runtime fixture exercises native Worker and IndexedDB operations. The web fixture drives the emitted UI through profile creation, export, restore, explicit unlock and interrupted-restore reconciliation. Both run locally. Hosted Pages checks and the two-party trading workflow require separate qualification.

[Developer guide and broader test commands](../../docs/wiki-source/Developer-Guide.md)
