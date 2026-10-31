# Third-party attribution and retained notices

Recorded against source `b2ebd641785b9ca87633865b77a492d249653cb3`, 2026-10-26. This records actual reuse and preserves credit; it does not change the project's license, qualify a crypto provider, or approve live trading. No third-party algorithms or source headers were rewritten.

## Actual libraries

| Work / copyright holder | Exact version/source | Use and retained full notice |
|---|---|---|
| @noble/curves; **Copyright (c) 2022 Paul Miller (https://paulmillr.com)** | 2.4.0; `paulmillr/noble-curves` commit `656c4364dffa44c64aa0c49914b8000b278b67a9` | Imported test-only identity/EOA recovery in `packages/identity/src/noble-provider.ts` and `packages/wallet/src/evm-terms.ts`. Full MIT: `licenses/noble-2.4.0-MIT.txt`. Existing `packages/identity/test/fixtures/noble-MIT-LICENSE.txt` is preserved and byte-identical. |
| @noble/hashes; **same Paul Miller copyright** | 2.4.0; `paulmillr/noble-hashes` commit `663c2aeeffc308ac0cded59bd32f7c212adacfc2` | Imported Keccak in test-only wallet terms; SHA-256 curve dependency. Its full MIT bytes are identical to the retained Noble notice. Prior G06 source/license correspondence is retained. |
| @noble/ciphers; **Copyright (c) 2022 Paul Miller (https://paulmillr.com); Copyright (c) 2016 Thomas Pornin** | 2.4.0; `paulmillr/noble-ciphers` commit `d9e8a6a599e7ed729d9be03854c46a3c73bd9a79` (npm `gitHead`); lockfile SHA-512 `AnjFn0Jv…xtiw==` | Imported ChaCha20 for test-only NIP-44 v2 in `packages/nostr-crypto/src/chacha20.ts`; owner-approved 2026-10-28; no transitive dependencies. Full MIT including both copyright lines: `licenses/noble-ciphers-2.4.0-MIT.txt` (byte copy of the installed package LICENSE, sha256 `f36671a5…1e2d`). |
| React / React DOM; **Copyright (c) Meta Platforms, Inc. and affiliates.** | react19.3.1, react-dom19.3.1; package repository `https://github.com/react/react`; immutable source commit not recorded | Browser shell/UI imports in `apps/web/src/`. Full MIT `licenses/react-19.3.1-MIT.txt`. Exact installed license bytes verified against each matching-version, lock-SRI-verified cached package; no guessed source SHA. |
| React scheduler; **same Meta copyright** | scheduler0.28.0, transitive dependency | Same full MIT bytes as React. Existing build emits full package-specific notices in `third-party-licenses.json`; `build.mjs` requires the React/DOM/scheduler notices. This source notice does not replace artifact-level license inclusion. |

Verification evidence: `docs/evidence/ATTRIBUTION_LICENSES_20261026.json`. No install/download/build was performed. Cache integrity proves correspondence to selected locked bytes, not standalone publisher-authenticity or safety; earlier G06 evidence records additional Noble upstream checks.

## Copied and derived test material

- **BIP340:** `packages/identity/test/fixtures/bip340-test-vectors.csv`, upstream bitcoin/bips commit `93f161194fbaed12c44f5e2a0c1d4f2b1b317cb0`. Preserve `BIP340-LICENSE-NOTICE.md`, which names **Pieter Wuille, Jonas Nick and Tim Ruffing**, states BSD-2-Clause document terms and the upstream code-license alternatives. No vector bytes changed.
- **EIP-712:** digest/signature values in `packages/wallet/test/fixtures/eip712-keccak-vectors.json` are derived from the official Example.js at ethereum/EIPs commit `7372d10a457b29eceb02cd052345af165de1fb60`, source SHA-256 `c6bdb395cdfd0cf8408328156960203d5b984f2fe0087ca74c74c99e266c0e3b`. That pinned EIP names **Remco Bloemen (@Recmo), Leonid Logvinov (@LogvinovLeon), Jacob Evans (@dekz)** and waives rights via CC0. Full unchanged upstream `LICENSE.md` is retained at `licenses/eip712-CC0-1.0.txt`; adjacent fixture attribution is in `EIP712-LICENSE-NOTICE.md`. No fixture fields/hash changed.
- **Independent G16 vectors:** `g16-evm-independent.json` was generated locally from test-only installed **emn178/js-sha30.8.0** and **indutny/elliptic6.6.1**, both MIT, with their exact source/integrity recorded in the fixture. Python cryptography/OpenSSL separately checked signatures. These are test-tool use and derived numeric results, not copied cryptographic implementations or bundled app providers. Do not describe the oracle as an externally audited or production-qualified provider.

## Original project work and research-only candidates

The application/domain/Worker/storage adapters are project implementation against the canonical specifications; dependencies and derived fixtures above are credited separately. Earlier own-repository branches are not unrelated upstream products. The reusable-code matrix's Nostr/Waku/XMTP, TLSNotary/Reclaim, Tor, HD-wallet, OpenZeppelin/viem and other candidates are research/staging references, not installed implementations. Browser WebCrypto is a native platform dependency, not project-written AES/PBKDF2 code. No imported Bisq/Haveno/RoboSats/Peach runtime source was established by the bounded inventory.

## Release-readiness gates and limits

Retain upstream copyright/license headers and full applicable notices in every chosen distribution; inspect emitted source/binary bundles rather than assuming source notices suffice. Do not strip dependency notices during minification/packaging. New copied/adapted material needs the source path, exact version/commit or explicitly unknown pin, author/copyright, modifications and license evidence before admission. Current build/dev transitives are not exhaustively inventoried by this bounded correction. React's immutable source mapping remains unknown; its exact package/integrity/license correspondence is established. No legal compatibility clearance, project relicensing, external audit, wallet/identity enablement or funds authorization is inferred.
