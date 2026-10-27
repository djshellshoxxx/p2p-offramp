# Offline client-side shell and runtime — partial G07/MEM01

The app now has a static React/TypeScript/Vite shell plus a native Worker runtime boundary. It remains an offline development build, not a complete trading application. `AppRuntime.start` validates the exact public configuration `{version:1,ReleaseEnabled:0,connectOrigins:[]}` before creating one same-origin dedicated module Worker. Startup remains locked. There is no network, wallet, signing, create, restore, private-record read/list or mutation command.

An explicit command can unlock a known existing G02 profile using its passphrase. The Worker retains the authenticated vault session; the document receives a purpose-bound opaque handle and public profile ID. `isCurrent(handle)` checks the exact live document handle. Status polling does not refresh idle time. Encrypted G03 export is available while locked and is always labelled `authentication: 'not-checked'`; an unlocked session does not authenticate the exact row exported by that separate read.

Both sides validate strict bounded messages, monotonic request IDs, generations and fixed errors. One native job remains occupied until its actual work settles, including after cancellation. Document lock/pagehide synchronously revokes document handles and sends Worker lock control. Worker-owned deadlines check five minutes of idle time independently of document timers. Only the private handler of trusted pointer/keyboard events can send activity control; expired state cannot be revived by a delayed activity message. The document also checks its monotonic deadline before publishing results. Revocation across separate threads is delivered through messages; it does not promise simultaneous memory erasure.

Disposal first requests managed key/cache/IDB cleanup, then terminates the owned Worker after acknowledgement or a one-second fallback deadline. Other requests have a 30-second deadline and fail closed. Native Web Crypto cannot be cancelled or rolled back; disposal/termination and buffer wiping provide no forensic erasure guarantee. A hard stop can prevent managed finalizers from running. No durable write is exposed here, so this tranche cannot create an ambiguous new-profile commit. Future create/restore bridging requires an explicit discoverable outcome contract before random destination IDs can be lost between commit and reply.

Public application imports use `packages/schemas/index.ts` and `packages/storage/index.ts`; private storage/crypto paths do not appear in application imports. The native Worker URL points to the emitted `vault.worker.js`; no blob/data Worker is created. There is no service worker. The main entry and Worker have separate strict TypeScript configurations, with `DOM` and `WebWorker` libraries respectively and `skipLibCheck: false` inherited.

Focused checks:

```sh
node --test packages/schemas/test/runtime.test.mjs apps/web/test/*.test.mjs
./node_modules/.bin/tsc -p apps/web/tsconfig.runtime.json --noEmit
./node_modules/.bin/tsc -p apps/web/tsconfig.worker.json --noEmit
```

Node event/lifetime tests use controlled EventTargets, clocks and trusted-event fixtures; they are not browser/device acceptance. The integrator owns actual Chromium Worker/IndexedDB/CSP checks. G07 remains partial: framework/version review, full application composition, deployed header/meta profiles, complete accessibility/mobile/multi-browser acceptance, signed-release trust, wallet/transport adapters, private view models and independent review remain open. Hash routes, package-boundary enforcement and local header/meta build/browser fixtures are now implemented; local fixtures are not deployed-host acceptance. `ReleaseEnabled` remains zero.
