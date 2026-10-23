# Open-Source Component Reuse Matrix
Status: architecture specification; candidate dependencies are **not security-approved**. Date: 2026-10-21. Scope: static, client-controlled noncustodial P2P off-ramp, chain escrow, encrypted messaging and optional fiat-proof adapters. This document is a procurement and design baseline, not an assertion that the packages have been integrated.

## Principles, boundaries and data flow
The browser loads an immutable, hash-verified static application. A dedicated cryptographic worker handles ephemeral application secrets; an external wallet signs high-value chain operations. Transactions are verified against locally encoded chain ID, escrow addresses/code hashes, token allowlists and ABI. Client-selected RPC endpoints are untrusted. Encrypted P2P envelopes traverse replaceable Nostr/Waku transports; relay metadata is not confidential. Optional proof systems expose only minimum necessary public statements. No operator backend possesses trading keys or escrow funds. Browser-delivered code and a compromised device remain critical trust assumptions.

Trust boundaries: static asset delivery -> application; application -> wallet provider; application -> worker/WASM; application -> IndexedDB; application -> untrusted RPC; application -> public messaging relays; application -> payment-proof attestor; chain contracts -> tokens/oracles. Avoid calling transport providers or attestors "serverless": those are third-party infrastructure.

## Repository and tooling table
License is the typical upstream repository license *as a selection hint only*; verify LICENSE at the exact chosen commit and transitive dependencies before adoption. "Review" means no current license claim or no approved implementation.

| Domain | Recommended library/repository | License candidate | Purpose / specific component reused | Source URL | Decision |
|---|---|---|---|---|---|
| EVM RPC | viem | MIT (verify) | Typed ABI encoders, chain client, typed-data utilities; no untrusted dynamic ABIs | https://github.com/wevm/viem | Preferred |
| EVM alternative | ethers.js | MIT (verify) | Wallet/RPC alternative; select one primary stack to avoid duplicates | https://github.com/ethers-io/ethers.js | Alternative |
| EVM contracts | OpenZeppelin Contracts | MIT (verify) | SafeERC20, ECDSA, EIP712, ReentrancyGuard, access policy | https://github.com/OpenZeppelin/openzeppelin-contracts | Preferred |
| Contract development | Foundry | Apache-2.0/MIT components (verify) | forge tests, fuzzing, invariants, anvil | https://github.com/foundry-rs/foundry | Preferred |
| Static analysis | Slither | AGPL-3.0 (verify) | CI source review and reentrancy detectors; tooling only | https://github.com/crytic/slither | CI |
| Property testing | Echidna | AGPL-3.0 (verify) | Solidity property-based fuzzing; tooling only | https://github.com/crytic/echidna | CI |
| Formal checks | Certora Prover | Proprietary/service terms | Supplemental rule verification; not a free library to embed | https://www.certora.com/ | Evaluate |
| Elliptic curves | @noble/curves | MIT (verify) | Browser secp256k1, ECDH and signature operations | https://github.com/paulmillr/noble-curves | Preferred |
| Minimal secp256k1 | @noble/secp256k1 | MIT (verify) | Lean ECDSA; exclude if curves already selected | https://github.com/paulmillr/noble-secp256k1 | Alternative |
| Hash functions | @noble/hashes | MIT (verify) | Keccak, SHA-256, HKDF/PBKDF2 helpers; WebCrypto preferred where suitable | https://github.com/paulmillr/noble-hashes | Preferred |
| Key derivation | Web Crypto API | Platform API | getRandomValues, AES-GCM, HKDF, PBKDF2 without npm crypto shim | https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto | Preferred |
| Password KDF | hash-wasm | MIT (verify) | Argon2id in isolated worker, memory-hard derivation | https://github.com/Daninet/hash-wasm | Evaluate |
| Mnemonics | @scure/bip39 | MIT (verify) | Optional local mnemonic imports with explicit user approval | https://github.com/paulmillr/scure-bip39 | Conditional |
| HD keys | @scure/bip32 | MIT (verify) | Optional BIP32 derivation; not an EIP-5564 implementation | https://github.com/paulmillr/scure-bip32 | Conditional |
| ZK circuits | circomlibjs | GPL-3.0 (verify) | Poseidon and circuit-related JS utilities, **not** a proving system alone | https://github.com/iden3/circomlibjs | Legal/security gate |
| ZK toolchain | snarkjs | GPL-3.0 (verify) | Browser proof generation/verification where performance acceptable | https://github.com/iden3/snarkjs | Conditional |
| ZK alternatives | Noir | Apache-2.0/MIT mixed (verify) | Circuit compilation / browser proving adapters | https://github.com/noir-lang/noir | Evaluate |
| Nostr messaging | nostr-tools | MIT (verify) | Signed event serialization and relay connections; add application-level encryption | https://github.com/nbd-wtf/nostr-tools | Candidate |
| Waku messaging | js-waku / @waku/sdk | Apache-2.0 (verify) | Browser light-node interfaces and pubsub relay; check modern package names | https://github.com/waku-org/js-waku | Candidate |
| XMTP | XMTP JS SDK (current generation) | Review | Optional identity-bound decentralized messaging; SDK generation has changed | https://github.com/xmtp/xmtp-js | Research only |
| TLS attestation | TLSNotary | Mixed; inspect components | TLS proof generation and verifier integration; browser/WASM feasibility is release-specific | https://github.com/tlsnotary/tlsn | Prototype gate |
| Payment attestation | Reclaim Protocol SDK | Review exact SDK | Optional zkTLS proof verification; requires checking notary/dependency trust and disclosures | https://github.com/reclaimprotocol | Prototype gate |
| Tor connectivity | Tor Browser / local Tor SOCKS | License varies | Privacy transport for users choosing a Tor-capable environment | https://www.torproject.org/ | External runtime |
| Tor browser JS clients | tor-wasm, js-tor-control | Unknown until exact maintained repo identified | **No approved client-Tor library**; browser cannot generally open SOCKS sockets or guarantee Tor | https://gitlab.torproject.org/tpo/core/tor | Do not integrate |
| Web security | DOMPurify | Apache-2.0 / MPL-2.0 (verify) | Sanitization of untrusted rendered markup; prefer textContent | https://github.com/cure53/DOMPurify | Conditional |
| Dependency review | OSV-Scanner | Apache-2.0 (verify) | SBOM/dependency vulnerability scans | https://github.com/google/osv-scanner | CI |
| Supply chain | Sigstore cosign | Apache-2.0 (verify) | Sign and verify build artifact attestations | https://github.com/sigstore/cosign | CI |
| Payment gateway research | Payment-Gateway-coinpayments | Review | Historical gateway patterns and anti-patterns, **not** a trusted payment adapter | https://github.com/blockchainhelp-eu/Payment-Gateway-coinpayments | Reference only |

## Integration contracts
1. **crypto-adapter** exposes `generateEphemeralKey(): Uint8Array`, `deriveSharedSecret(peerPublicKey)`, `signTypedData(domain, types, message)` only from a dedicated worker; high-value signatures request external wallet confirmation. Generate randomness using OS-backed `crypto.getRandomValues` with error-as-fatal semantics. secp256k1 secret scalars satisfy `1 <= d < n`; public points are validated as on-curve, non-infinity and correctly encoded. Use protocol-specific KDF domain separation.
2. **wallet-adapter** applies EIP-1193 request semantics, EIP-712 domain separation with `chainId`, `verifyingContract`, version, action-specific nonce and deadline. Re-read wallet chain/account immediately before submission. Provider is not a data-integrity oracle.
3. **escrow-adapter** pins ABI, chain ID, deployment address and runtime bytecode/code hash per release manifest. Read via at least two independently operated RPCs for important finalized states and compare block hash/state; unresolved disagreement stops release, not majority-vote blind signing.
4. **message-adapter** implements `encodeEncryptedEnvelope -> pad -> transport.send` and reverse receive path; authentication, replay window, expiration and envelope version are independent of Nostr/Waku. Do not send keys, fiat credentials, raw bank information, or plaintext proofs to relays.
5. **proof-adapter** implements `verifyProof(proof, expectedPolicy, freshness, audience, tradeId)`. Bind statement to trade ID, amount, currency, payee commitment, proof expiry, issuer/attestor key and verifier version. An attestation about a webpage is **not** intrinsically irreversible bank settlement.
6. **storage-adapter** stores only authenticated encrypted records with explicit schema version, per-record random IV, KDF metadata, ciphertext and trade-scoped associated data. Never cache private keys unencrypted; default to memory-only for escrow signing.
7. **routing-adapter** checks whether a privacy transport is actually active. A normal browser fetch cannot be labeled "Tor" simply because a JS package exists. Failure should be clearly surfaced, with a no-network or explicitly consented fallback.

### Crypto constructions and formulas
AES-256-GCM encryption: `(C,T) = AEAD_Encrypt(K, IV, P, AAD)`, with independent unpredictable 96-bit nonce per encryption under a key. HKDF: `PRK=HMAC_SHA256(salt,IKM)`; `K=HKDF_Expand(PRK,"p2p-offramp/v1/" || purpose || context,32)`. Argon2id: `K=Argon2id(password, randomPersistentSalt, m,t,p,32)`, parameters calibrated on supported low-end devices and re-evaluated periodically. **A salt cannot be ephemeral if the encrypted vault needs later recovery**; store the salt alongside ciphertext. For transient-only records, use a random session key and erase it on session teardown.

## Dependency selection, licenses, reproducible builds
- Create `security/dependencies.json` with package name, exact version, upstream repo/commit/tag, SPDX assertion, transitive license assessment, approved use, cryptographic review, last audit, bundle location and maintainer. Empty cells block merge.
- Lock npm packages with committed lockfile; run `npm ci --ignore-scripts` where compatible, and explicitly allow only required audited build scripts. Pin GitHub Actions to full commit SHAs and audit CI permissions.
- CI produces SBOM (CycloneDX/SPDX), runs OSV scans and license checks, compares checksums to approved artifact digests and verifies signatures/attestations where published. Pin release bundles by SHA-256 in a signed manifest; sign build artifacts and retain reproducibility evidence.
- For externally hosted classic browser scripts, specify SRI hash and `crossorigin` with an appropriate CSP; SRI for ESM module *graphs* is not a complete transitive pinning guarantee. Prefer self-hosted, versioned bundles with exact-file hashes and a minimal CSP forbidding inline/script injection.
- Avoid unmaintained Tor wrapper packages, dynamic `eval`, CDN "latest", unrestricted wallet injection reliance and installing dependencies at runtime. Verify dependency ownership, package name, lookalikes, install scripts, release reproducibility, vulnerability advisories, and maintainer changes.
- CI gate: two review approvals for cryptographic dependency changes, independent license confirmation, cold-install deterministic bundle, CSP/SRI checks, chain-fork regression tests, browser compatibility tests and threat-model revision. Do not mark "audited" because upstream claims an audit.
- Compatibility gate: GPL/AGPL dependencies used at runtime may impose redistribution/source obligations inconsistent with intended distribution. Require legal review before vendoring or bundling.

## Execution plan and acceptance tests
P0: record exact current dependency versions and licenses; choose viem versus ethers and Noble versus WebCrypto as appropriate; forbid duplicate signers. P1: build interfaces + test vectors. P2: integrate wallet and escrow adapter against testnet fork. P3: encrypted messaging under malicious relay test. P4: opt-in zkTLS benchmark on constrained devices. P5: supply-chain reproducibility gate. All test vectors are deterministic except randomly generated keys and IVs; fuzz public-point parsing, signatures, relay envelopes and malicious JSON.

**Acceptance:** no production secret exported to the UI/relay; unknown chains/contracts rejected; mismatched RPC finality stops operations; fresh vault salts retained for decryptable records; lockfile/pins verifiable; licensing decisions recorded; browser Tor guarantee never implied.

### Reference catalog
[Noble suite](https://paulmillr.com/noble/), [EIP-5564](https://eips.ethereum.org/EIPS/eip-5564), [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193), [OWASP SCVS](https://scs.owasp.org/SCVS/), [MDN WebCrypto](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API), [OWASP dependency security](https://owasp.org/www-project-dependency-check/).

## NCSC CPA build assurance and Packet Storm research intake (2026-10-21 addendum)
NCSC [CPA Build Standard v1.4](https://www.ncsc.gov.uk/files/CPA-Build_Standard_1-4.pdf) separates *building the right security features* from *building the product correctly*. This project adopts the latter as an evidence-driven build process, **not** a claim of CPA certification. Maintain requirements-to-tests traceability, versioned threat assumptions, reviewable architecture, code-review records, compiler/dependency inventory, release provenance, secure defect handling and reproducible build evidence. For every library, record owner, pinned commit, license, vulnerability exposure, maintenance state, security-review status, transitive dependencies, trust boundary, fallback and removal plan.

[NCSC Secure communications principles](https://www.ncsc.gov.uk/sites/default/files/pdfs/publication/secure-communication-principles.pdf) provide seven vendor-neutral acceptance dimensions: authenticated encryption in transit, node/key protection, access control, secure audit, secure administration, metadata minimization and supply-chain resilience. Implement them as a seven-column scorecard for Nostr/Waku/XMTP/TLS attestors, distinguishing relay operators from cryptographic endpoints. Audit logs must not contain decrypted trades, account credentials or correlation identifiers unless essential.

[Packet Storm's archive](https://www.packetstatic.com/) contains tools, whitepapers, advisories and exploit research; its [archive methodology](https://rss.packetstormsecurity.org/help/view/4) describes attribution, CVE tags, release metadata and source-code review. Treat every entry as an **untrusted research lead**, never as automatically approved software. Intake: search affected dependency/CVE -> read original vendor advisory and linked source -> check exact affected versions -> classify reachable attack path -> reproduce in an isolated test -> add regression test -> record remediation/waiver -> recheck before release. Do not execute downloaded PoCs in CI or on production infrastructure. Its [API documentation](https://www.packetstatic.com/help/view/1) describes API-key access and licensing; do not embed an API secret in client-side JavaScript. For automated intelligence, use an offline build-time ingestion job under separately authorized credentials, or user-supplied keys that remain in their own environment. No live Packet Storm feed is integrated by this spec.
