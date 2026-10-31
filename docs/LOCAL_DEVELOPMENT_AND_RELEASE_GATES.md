# Local development, recovery and release gates

The default artifact is an offline foundation preview. The synthetic demo and
isolated local EVM evidence are local test tools. None is an approved funds-enabled
release. Keep `ReleaseEnabled=0` and the default empty network allowlist.

## Reproduce local evidence

Use Node 24+, Python 3.12+ and an installed Chromium. From the repository root:

```sh
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix packages/escrow-evm
npm test
npm run typecheck
npm run check:boundaries
npm run test:build-policy
npm run test:specs
npm run check:specs
npm run build
npm run build:demo
npm run test:browser
npm run test:web:browser
npm run test:escrow
npm run test:local-evm
```

The escrow tool package is deliberately isolated: compiler, local EVM and signing
utilities are development dependencies there, never app dependencies. Its tests
use deterministic public test keys and an loopback-only chain, with a dynamically allocated loopback-only RPC
server and no external-chain connection. Never transfer assets to those accounts.

## Deployment preparation and rollback

1. Record the exact source revision, dependency locks, build mode and asset hashes.
   Preserve emitted third-party attribution and policy files.
2. Confirm default build exclusion checks pass. Never publish `dist-demo` as a
   trading product. Local evidence files are not signed manifests or approval.
3. An enabled release requires the missing common G15 manifest schema, selected
   signing policy, independently reviewed cryptography/contracts, approved registry,
   native deployments/endpoints, host-header smoke tests and supported-device
   evidence. The local test registry is not a substitute.
4. When deployment is explicitly authorized, first retain the prior immutable
   artifact and its policy/asset digests. Deploy the exact reviewed artifact and
   check the final host, cache behavior, CSP, MIME types and framing headers.
5. Roll back only to a client compatible with the current encrypted schemas. Never
   delete, overwrite or downgrade a vault to make an older build start. If schemas
   differ, keep the current recoverable client available and use a fresh-key copy
   through its supported migration/recovery path.
6. A new origin or content-addressed CID may have a separate IndexedDB vault.
   Verify encrypted export and fresh-origin restore before an origin transition;
   retain the source until the destination is authenticated and usable.

## Incidents and redacted diagnostics

Stop economic actions on wrong-chain/code identity, conflicting observations,
unknown broadcasts, suspected compromised origin or unavailable custody/recovery.
Lock the local vault and preserve its encrypted source and relevant immutable
artifacts. Export is explicitly unchecked; it does not establish successful
recovery. An unknown transaction must be reconciled with native chain evidence;
never resend automatically or clear a reservation based on a wall clock.

For a local bug report record source/build digest, browser/OS version, operation
name, fixed error code, whether the operation may have committed, and sanitized
steps. Do not include passphrases, keys, vault plaintext, payment instructions,
private chat, full RPC URLs with credentials/query strings, raw provider errors or
unnecessary identifying addresses. Use public synthetic fixtures to reproduce.
An encrypted backup can still disclose its public metadata and is sensitive;
keep it under the user's control rather than attaching it to support messages.

Restoration writes a separate fresh-key profile. A completed copy is retained
until the user verifies it; interruption may require checking profile inventory
before retrying. Revoke or rotate compromised external credentials through their
owners. The application does not hold wallet spending keys or an administrative
escrow recovery/sweep key.
