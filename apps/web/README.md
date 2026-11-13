# Static web client

The client starts with the local vault locked. The default build supports encrypted profiles, backups and fresh-key recovery on the current browser origin. Trading is disabled (`ReleaseEnabled: 0`).

## User guide

| Task | Where | What to do |
|---|---|---|
| Create a profile | Home (`#/home`) | Choose **Create new profile**, enter and confirm a passphrase, accept the notice, then choose **Create encrypted profile**. Success opens the empty profile and displays its ID. Keep the ID and passphrase for later. |
| Open a profile | Home (`#/home`) | Choose **Unlock existing profile**. Select an ID from the local list or enter its 32 lowercase hexadecimal characters, then enter the passphrase. Choosing an ID fills the field. Unlocking requires the passphrase. |
| Back up a profile | Recovery (`#/recovery`) | Under **Export an encrypted file**, select or enter the profile ID, acknowledge the notice and choose **Download unchecked encrypted backup**. The download works while locked. Check that the browser saved the file and keep the passphrase separately. |
| Restore a backup | Recovery (`#/recovery`) | Under **Restore an encrypted file**, select the encrypted JSON, supply its original passphrase, enter and confirm the destination passphrase and choose **Restore as new profile** after accepting the notice. The Worker authenticates the backup and writes a separate profile with fresh keys. A successful restore reports a new, locked profile ID and the record count. |

Every backup download is labelled **Authentication not checked**, including exports made while a profile is unlocked. Export copies the stored ciphertext. To verify a backup, restore it and unlock the new profile with the destination passphrase. **Open restored profile** takes you to Home with the confirmed ID selected. If another profile is open, use **Lock vault** before unlocking the restored one.

**If creation or restore is interrupted**, a profile may have been written before the page received the result. After an interrupted creation, reopen **Unlock existing profile** on the same origin and inspect its list before creating again. After an interrupted restore, choose **Check local profiles**. The form keeps retry disabled while the inventory is unavailable, busy or incomplete. A fresh list shows which IDs exist. It cannot establish which operation created an unfamiliar ID.

Profiles live in this browser's IndexedDB. A different origin can show an empty list even when the source profile still exists. With a profile unlocked, the **Offline transaction recovery references** section lets you inspect and export selected journal references. Keep the full encrypted backup for profile recovery. For historical chain inspection using those references, see the [canonical EVM recovery guide](../../docs/recovery/CANONICAL-EVM.md).

## Developer guide

`src/app-services.ts` starts `AppRuntime` with `{ version: 1, ReleaseEnabled: 0, connectOrigins: [] }` and a same-origin dedicated module Worker. The Worker owns IndexedDB access and the authenticated vault session. The React UI uses the services interface for profile inventory, creation, unlock, encrypted export and restore. Profile IDs are public selection metadata. The UI keeps them out of route URLs.

The document revokes its current handle on lock or `pagehide`. The Worker also enforces a five-minute idle deadline. Status polling does not extend it. Requests and replies carry a generation and request ID so the document can ignore a late result after cancellation or lock. That revocation can occur after a durable profile write, which is why an interrupted operation needs a fresh inventory check.

Run from the repository root with Node 24 or newer. The browser fixtures use Chromium on loopback. Set `P2P_CHROMIUM` to the executable path if automatic discovery cannot find it.

```sh
npm ci --ignore-scripts
npm run build
node scripts/test-runtime-browser.mjs
node scripts/test-web-build-browser.mjs
```

The build type-checks the project and emits the default static app in `apps/web/dist/`. The runtime fixture exercises native Worker and IndexedDB operations. The web fixture drives the emitted UI through profile creation, export, restore, explicit unlock and interrupted-restore reconciliation. Both run locally. Hosted Pages checks and the two-party trading workflow require separate qualification.

[Developer guide and broader test commands](../../docs/wiki-source/Developer-Guide.md)
