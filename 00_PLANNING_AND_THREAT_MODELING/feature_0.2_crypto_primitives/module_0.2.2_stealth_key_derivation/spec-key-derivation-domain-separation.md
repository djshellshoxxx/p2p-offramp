# Key derivation and domain separation

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M0 design / M3 optional stealth.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Keep spending, messaging, vault, backup and optional stealth capabilities cryptographically separate. External wallets retain spending authority: the client MUST NOT derive wallet spending keys from a login signature, password, Nostr secret or recovery export. This specification defines derivation context and ownership, not a new stealth construction.

## 3. Architecture and data contracts

A KeyPurpose record is `{v:1,purpose:"messaging"|"vault"|"backup"|"stealth-view"|"stealth-spend",generationId,createdAt,implementationId}`. generationId is a fresh 128-bit random identifier, never a user identifier. The vault owns a fresh random 256-bit AES key; encrypted backup/recovery follows G02/G03. A messaging secret is independently generated and encrypted in the vault. Stealth capability owns separately generated scheme-valid scalars through its reviewed adapter. Purpose metadata is authenticated, not a way to convert one key into another. A nonextractable CryptoKey does not protect against hostile same-origin script invoking it.

## 4. Algorithms and lifecycle

Generate entropy using crypto.getRandomValues; abort on failure. Do not use Math.random, timestamps, wallet addresses or low-entropy phrases. Where an adapter explicitly requires derivation from an existing high-entropy root, use HKDF-SHA-256 with separately random 32-byte salt and UTF-8 info `p2p-offramp/key/v1/<purpose>/<adapterId>/<generationId>`; each purpose/adapter has its own allowlisted info and output size. This HKDF rule is NOT a replacement for G02's fixed password wrapping: PBKDF2-HMAC-SHA-256, 600,000 iterations, AES-256-GCM. Curve scalar conversion MUST use the selected protocol's specified rejection/reduction algorithm and test vectors, never an unreviewed modulo shortcut. G03 restoration decrypts the old archive, creates a fresh vault data key and generation, then re-encrypts records atomically; it does not reuse archive encryption keys for writes.

## 5. Interfaces and integration

`createPurposeKey(purpose, adapterId)` returns an opaque capability or typed unsupported result; raw bytes never reach UI reducers. `rotateMessagingKey()` creates a new identity and warns that existing conversations need explicit reauthentication. `destroySession()` drops all key references and worker state; best-effort buffer overwrite is not guaranteed browser memory erasure. Export includes only G03-authorized encrypted key records; no spending-wallet secrets.

## 6. Errors, abuse and residual threats

Reject unknown purpose, reused generation ID, missing secure context and unsupported primitive with KEY_PURPOSE_INVALID, KEY_GENERATION_FAILED or CRYPTO_UNSUPPORTED. Fail before persistent mutation. Domain separation does not provide forward secrecy, protect weak backup passwords, or undo root compromise. Cross-purpose substitution and accidental log/export disclosure are explicit threats. Rotation must preserve old encrypted records until migration and recovery checks succeed.

## 7. Verification and primary references

Known-answer HKDF vectors plus application info-byte vectors must verify differing purpose/adapter/generation changes output. Test entropy failure, locked-vault calls, wrong AAD, archive restore with fresh-key assertion and rotation interrupted before commit. Review key-flow diagrams for any path from app keys to wallet spending authority. Browser interoperability and independent cryptographic review remain release gates.

Primary references (exact implementation revisions must be pinned in the evidence record): [RFC 5869](https://www.rfc-editor.org/rfc/rfc5869); [Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/).
