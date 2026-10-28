# Foundation dependency evidence

Status: local test evidence only; no production capability or independent security acceptance.

| Component | Evaluated profile | Source and evidence | Scope |
|---|---|---|---|
| Vault primitives | Native Web Crypto AES-256-GCM, PBKDF2-HMAC-SHA256/600000 | G02 exact AAD/format; Node v24.19.0 tests; Python fixture interoperability | Test-enabled crypto helper; browser matrix still pending |
| TypeScript | 7.0.2, exact development-only pin | npm package `typescript`; Apache-2.0 metadata/license in installed package; SHA-512 integrity and platform packages in package-lock.json | Compiler only; not browser runtime code |
| Test runner | Node v24.19.0 built-in `node:test` | Runtime built-ins; no test framework dependency | Portable logic, not real-browser storage/session evidence |
| Fixture producer | Python 3.12 / cryptography 50.0.2 | `packages/storage/test/fixtures/verify_vault_fixture.py`; PBKDF2HMAC/AESGCM API | Independent fixture harness; related native backends may be shared |

The schema/vault crypto helpers still use platform APIs. The later local identity test provider explicitly depends on pinned @noble/curves 2.4.0 and @noble/hashes 2.4.0 (MIT); it is unsupported by default and has no signing/network interface. See docs/IDENTITY-CRYPTO-EVIDENCE-2026-10-24.md, crypto-inventory.json and browser-support.json. Every review remains pending; local Chromium automation is recorded without claiming the wider browser/device matrix. The G20 package `packages/nostr-crypto` (not bundled or wired into the app) uses the same two pins for BIP340 signing/verification, NIP-44 ECDH, HKDF and HMAC, plus `@noble/ciphers` 2.4.0 (MIT, exact pin, SHA-512 lockfile integrity, no transitive dependencies, source tree `d9e8a6a5`) for ChaCha20. The owner approved that dependency on 2026-10-28, and it replaced the earlier project-owned implementation. It is checked against RFC 8439, OpenSSL and the official NIP-44 vectors, and its review is pending. Cipher operations
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
