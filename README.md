# P2P Off-ramp

Experimental **software artwork** exploring client-side, noncustodial peer-to-peer exchange. The functional descriptions, development status, risks, licensing and acceptance gates below remain applicable.

A noncustodial peer-to-peer off-ramp under active development. The intended core is a static
React/TypeScript/Vite client using external wallets, immutable versioned escrow, relay discovery,
encrypted messaging and encrypted local recovery. Basic manual fiat settlement requires seller
confirmation; the application cannot guarantee that fiat is received or irreversible.

## Current state

The catalog contains 173 documents: 171 expanded technical design baselines, a navigation catalog
and supplemental plan. Provider/artifact pins, implementations and security/interoperability evidence
are tracked separately. Optional proof, location, courier and arbitration capabilities remain gated.

Implemented foundations include bounded encrypted IndexedDB/CAS persistence, fresh-key backup recovery, local messaging-identity lifecycle, authority/error/retry policies, a conservative encrypted intent journal and discovery-only wallet boundary. A static React/Vite shell now exposes locked startup, known-profile unlock/lock/status and explicit unchecked ciphertext export through a native Worker. No mandatory app-owned backend exists; the [client-side requirement](docs/adr/ADR-CLIENT-SIDE-2026-10-24.md) is normative. Create/restore UI, signed registry/release trust, wallet signing/submission, native escrow/relay integration and the trading loop remain incomplete. ReleaseEnabled stays zero. No real-funds readiness is claimed.

## Local checks

Requires Node 24+ and Python 3.12+ for the spec tool. Dependencies are pinned in package-lock.json; emitted runtime assets retain third-party MIT attribution. Chromium is required for local browser checks, not as an app-owned server.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run test:specs
npm run check:specs
npm run check:boundaries
npm run test:build-policy
npm run build
npm run test:browser
npm run test:web:browser
```

Optional independent fixture verification requires Python `cryptography`:

```sh
python packages/storage/test/fixtures/verify_vault_fixture.py
```

Start with [development status](docs/DEVELOPMENT_STATUS.md), [roadmap](DEVELOPMENT_ROADMAP.md),
[spec readiness inventory](docs/SPEC_READINESS.md) and [vault implementation plan](docs/superpowers/plans/2026-10-22-vault-foundation.md).
