# Developer and operator guide

Status: development builds only. No release, deployment, signed artifact or real-funds readiness is claimed.
`ReleaseEnabled` is `0` and `connectOrigins` is empty in every build mode.

## Requirements

- Node 24 (CI) or Node 22.18+ (local runs used 22.22; the package `engines` field says `>=24`).
- Python 3.11+ for the spec tools (3.12 in CI).
- Chromium for browser checks. `scripts/lib/chromium-path.mjs` uses `P2P_CHROMIUM`, then `/usr/bin/chromium`,
  then the newest `/opt/pw-browsers/chromium-*`. Chromium is a test tool, not an app server.

## Install and check

```sh
npm ci --ignore-scripts      # exact versions from package-lock.json; no install scripts run
npm run typecheck            # four strict tsconfigs (core, runtime, worker, UI)
npm test                     # node:test; .tsx is loaded through scripts/test-support/register-tsx.mjs
npm run check:boundaries     # core packages: no browser globals/npm imports; app graph has no advanced modules
npm run test:build-policy
npm run build                # default artifact -> apps/web/dist
npm run build:demo           # synthetic demo artifact -> apps/web/dist-demo
npm run test:browser         # vault, runtime, content policy, reseal crash (Chromium)
npm run test:web:browser     # emitted shell journeys + synthetic trade-review journey (Chromium)
npm run test:specs && npm run check:specs
```

Both builds write `local-build-evidence.json` (asset SHA-256 list, `syntheticDemo` flag). It is local evidence, not
a signed manifest.

## Build modes

| Mode | Command | Registry | Trade-terms review |
|---|---|---|---|
| default | `npm run build` | none (G11/G15 trust root pending) | Shown as unavailable |
| demo | `npm run build:demo` | synthetic `test-local-only` registry, chain 31337, digest-pinned | Works on files and built-in samples |

- The demo flag is the compile-time constant `__P2P_SYNTHETIC_DEMO__` (`apps/web/vite.config.ts`). The synthetic
  module is reachable only through a dynamic import behind it.
- `scanBuild` (`apps/web/scripts/build.mjs`) fails the default build if a synthetic marker (registry release ID or
  digest) appears in any emitted file, and fails the demo build if the markers are missing.
- The demo build shows a "SYNTHETIC DEMO" badge on every page. Its samples still pass through the same validator
  as user files. Never deploy the demo build as a product, and never use its addresses, keys or amounts on a real network.

To view a build locally, serve the output folder over loopback HTTP, for example
`npx vite preview --config apps/web/vite.config.ts --mode demo --outDir dist-demo` (use `--outDir dist` without `--mode demo` for the default build; `outDir` is relative to `apps/web`), then open
`http://127.0.0.1:4173/#/offers`.

## Local terms-review file format

`p2p-offramp/local-terms-review/v1` is a local file container, not a relay protocol:

```json
{ "format": "p2p-offramp/local-terms-review/v1",
  "terms": { "orderId": "<64 hex>", "revision": "1", "networkId": "local-evm", "deploymentId": "escrow-local-v1",
             "seller": "0x<40 lowercase hex>", "buyer": "0x<40 lowercase hex>", "assetKind": "native" | "erc20",
             "asset": "0x<40 hex; zero address for native>", "amountBaseUnits": "<uint256 decimal>",
             "privateAgreementHash": "<sha256 hex>", "capabilitiesHash": "<sha256 hex>", "sellerNonce": "<64 hex>",
             "acceptBeforeSeconds": "<u64>", "escrowExpirySeconds": "<u64>" },
  "privateAgreement": { "v": 1, "orderId": "...", "revision": "1", "fiatCurrency": "USD", "fiatMinorUnits": "5000",
                        "fiatScale": 2, "paymentInstructions": "...", "capabilities": [], "agreementSalt": "<64 hex>" } }
```

The validator and the fixed rejection codes are documented in `packages/domain/src/terms-review.ts`. Worked
examples are the synthetic sets in `packages/domain/test/fixtures/local-evm-scenario/scenario.json`.

## What review does not do

Review never accepts, signs, computes the EIP-712 digest, connects a wallet, reads chain state or funds anything.
Remaining time uses the device clock for display only. Reviews are kept in memory (at most 8) and are cleared on
lock, profile switch and reload. In the demo build, unlock a profile, check terms and choose **Save encrypted
review** to retain the original document, including private payment instructions and agreement salt, in that
profile. Saving is explicit. **Remove from session** only clears the memory entry; it does not delete its saved copy.

After reloading, unlock the same profile and choose **Load saved reviews** on Offers. Every saved document goes
through the terms validator against the currently loaded registry before any loaded review is displayed. A failed
load preserves the existing session list and encrypted data. Default builds have no approved registry and cannot
display saved reviews. Saved documents do not gain signing, payment or settlement authority.

At most 8 reviews of at most 64 KiB each can be saved per profile. Saves use the vault's compare-and-swap revision
check; a conflicting tab requires a fresh unlock. Repeating a save from the same session entry is idempotent.
Saving the same file as a separate newly imported review can create another record. This preview has no saved-record
deletion control. Recognized review wrappers with invalid bytes are refused; unrecognized trade records are
preserved and ignored, so a wrapper corrupted beyond recognition may not appear in the saved list.

Locking, cancellation or a timeout can arrive after a save committed. Unlock and load before retrying an uncertain
save. Saved reviews travel inside the encrypted backup and fresh-key restore path. An unchecked export alone is
not proof of recovery; the emitted-app Chromium test exercises save → reload/unlock/load and export → fresh-key
restore/unlock/load. No other browser/device or deployed-host acceptance is implied.
