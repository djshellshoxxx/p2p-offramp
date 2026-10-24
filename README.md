# P2P Off-ramp

A noncustodial peer-to-peer off-ramp under active development. The intended core is a static
React/TypeScript/Vite client using external wallets, immutable versioned escrow, relay discovery,
encrypted messaging and encrypted local recovery. Basic manual fiat settlement requires seller
confirmation; the application cannot guarantee that fiat is received or irreversible.

## Current state

The catalog contains 173 documents: 171 expanded technical design baselines, a navigation catalog
and supplemental plan. Provider/artifact pins, implementations and security/interoperability evidence
are tracked separately. Optional proof, location, courier and arbitration capabilities remain gated.

Implemented foundation work includes strict G02 schema/canonical encoding and native Web Crypto
helpers with Python-produced interoperability fixtures. The application UI, IndexedDB service,
wallet/trading loop and production release are not complete. No real-funds readiness is claimed.

## Local checks

Requires Node 24+ and Python 3.12+ for the spec tool; the schema/crypto tests have no runtime npm dependencies.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run test:specs
npm run check:specs
```

Optional independent fixture verification requires Python `cryptography`:

```sh
python packages/storage/test/fixtures/verify_vault_fixture.py
```

Start with [development status](docs/DEVELOPMENT_STATUS.md), [roadmap](DEVELOPMENT_ROADMAP.md),
[spec readiness inventory](docs/SPEC_READINESS.md) and [vault implementation plan](docs/superpowers/plans/2026-10-22-vault-foundation.md).
