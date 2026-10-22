# Foundation dependency evidence

Status: local test evidence only; no production capability or independent security acceptance.

| Component | Evaluated profile | Source and evidence | Scope |
|---|---|---|---|
| Vault primitives | Native Web Crypto AES-256-GCM, PBKDF2-HMAC-SHA256/600000 | G02 exact AAD/format; Node v24.19.0 tests; Python fixture interoperability | Test-enabled crypto helper; browser matrix still pending |
| TypeScript | 7.0.2, exact development-only pin | npm package `typescript`; Apache-2.0 metadata/license in installed package; SHA-512 integrity and platform packages in package-lock.json | Compiler only; not browser runtime code |
| Test runner | Node v24.19.0 built-in `node:test` | Runtime built-ins; no test framework dependency | Portable logic, not real-browser storage/session evidence |
| Fixture producer | Python 3.12 / cryptography 50.0.2 | `packages/storage/test/fixtures/verify_vault_fixture.py`; PBKDF2HMAC/AESGCM API | Independent fixture harness; related native backends may be shared |

There are no third-party runtime package dependencies in the schema or crypto helpers. Cipher operations
are platform APIs, not project-owned primitive implementations. Exact compiler artifacts are locked,
but the compiler/dependency inventory has not received independent release review. Web Crypto support
and security depend on the actual browser/OS; Node success does not approve browser/device support.

The committed Python fixture is deterministic test data with no real keys or user records. CI never
regenerates expected results using the implementation under test. Source references for the protocol:
[Web Crypto Recommendation](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/),
[RFC 8018](https://www.rfc-editor.org/rfc/rfc8018),
[cryptography AESGCM](https://cryptography.io/en/latest/hazmat/primitives/aead/).

Before production enablement, G06 still requires the accepted structured inventory, fixture hashes,
named review, browser compatibility/negative tests and release artifact provenance. This document
records progress without substituting for those gates.
