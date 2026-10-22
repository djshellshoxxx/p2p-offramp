# Vault foundation implementation plan

> **For agentic workers:** Use superpowers:executing-plans for native implementation task-by-task. The user selected autonomous execution; do not add another approval gate for routine engineering choices.

**Goal:** Implement and validate the G02 vault boundary, then authenticated encryption, before adding persistence and recovery.

**Architecture:** Runtime validators form a pure schema package. Storage crypto depends on those validators and injected Web Crypto; IndexedDB and UI stay outside this first slice. No alternate encryption format or external crypto package is introduced.

**Tech stack:** TypeScript, browser Web Crypto, Node built-in test runner for portable logic; exact compiler version and lockfile recorded when installed. Real-browser IndexedDB and key-lifecycle tests are required by subsequent slices.

**Spec:** `05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md` (G02), with G01/G03/G06/G09 interactions.

## Global constraints

- Passphrase UTF-8 length 12..1024; exact input, no trimming/normalization; reject unpaired surrogates.
- PBKDF2-HMAC-SHA256 exactly 600000 iterations, salt 32 bytes, random DEK 32 bytes.
- AES-256-GCM with 12-byte random nonce and 128-bit tag; wrap ciphertext 48 bytes.
- Profile/key/record IDs exactly 32 lowercase hex characters; session tokens 32 random bytes in canonical unpadded base64url.
- Revision safe integer 0..1048575; schemaVersion 1..65535; records <=10000, payload <=262144 decoded bytes.
- Per-unlocked-handle attempted snapshot encryptions <=4096; count failures before encryption, with explicit no-global-budget guarantee. Snapshot JSON <=8388604 bytes; padded plaintext <=8388608 in multiples of 4096; ciphertext length 4112..8388624 with 16-byte tag.
- Exact schema keys and canonical encodings; no coercion, unknown fields, plaintext private logs, wallet spending keys or custom cryptographic primitives.
- Preserve G02 fixed AAD arrays and field order. Restores use G03 fresh keys; no writable reuse of imported DEKs.

## Review focus

1. Noncanonical base64 trailing bits must fail, even when the platform decoder accepts them.
2. Null/prototype-bearing objects, inherited fields and unexpected keys must not pass as exact wire schemas.
3. Large encoded strings must fail size checks before decoding, allocation growth or expensive KDF.
4. Serialization must preserve exact field order, sorted record IDs and defensive copies; it must not mutate caller data. Compute the bounded aggregate serialized size before allocating the full JSON snapshot; individual payload limits alone allow excessive aggregate allocation.
5. Wrong password, tag failure and invalid decrypted inner data share authentication failure behavior, and cancellation must suppress revoked outputs.

## Task 1: Pure envelope and snapshot validation

Files: `packages/schemas/src/vault.ts`, `packages/schemas/test/vault.test.mjs`, root package/TypeScript configuration and lockfile as needed.

Interfaces:
- `parseVaultEnvelope(input: unknown): VaultEnvelopeV1` returns a validated defensive copy or a fixed-code `ValidationError`.
- `parsePrivateSnapshot(input: unknown): PrivateSnapshotV1` validates exact schemas and bounds.
- `decodeBase64url(input: unknown, minBytes: number, maxBytes: number): Uint8Array` enforces canonical unpadded representation and bounds before decoding.
- `encodeBase64url(bytes: Uint8Array): string` outputs canonical unpadded encoding.
- `encodeSnapshot(snapshot: PrivateSnapshotV1): Uint8Array` emits G02 deterministic JSON and zero padding.
- `decodeSnapshot(bytes: Uint8Array): PrivateSnapshotV1` validates length prefix, padding, fatal UTF-8 and private schema.

- [ ] Write failing tests for canonical empty/nonempty base64, invalid characters/padding/trailing bits, exact byte limits and pre-decode rejection.
- [ ] Write failing envelope fixtures for unknown/nested fields, wrong versions/KDF/cipher/counts, ID/nonce/tag/ciphertext/revision limits and defensive copying.
- [ ] Write failing snapshot fixtures for kinds, record count, duplicates, payload/schema limits and lexical ordering.
- [ ] Write deterministic encoding tests for 4096-byte boundaries, bad prefix/zero padding/UTF-8, max snapshot bound, no caller mutation and inner metadata preservation.
- [ ] Implement bounded validators and serialization using standard browser APIs only.
- [ ] Run all tests and strict typecheck; record real results and commit this independent slice.

## Task 2: G02 primitive envelope creation and authentication

Files: `packages/storage/src/vault-crypto.ts`, `packages/storage/test/vault-crypto.test.mjs`; reviewed independent fixture bytes in `packages/storage/test/fixtures`.

Interfaces:
- `createEnvelope(snapshot, passphrase, cryptoProvider): Promise<{envelope: VaultEnvelopeV1; material: UnlockedMaterial}>` validates before KDF, generates fresh DEK/salt/nonces, and binds exact G02 AAD. UnlockedMaterial is storage-internal authenticated snapshot plus nonextractable AES key handle and unchanged wrapped-key metadata, never exported by VaultService.
- `openEnvelope(envelope, passphrase, cryptoProvider): Promise<UnlockedMaterial>` bounds-checks first, authenticates key and snapshot, checks duplicated metadata, and emits one authentication failure shape for all private failures. `encryptRevision(material, nextSnapshot)` retains the original key and wrapped-key metadata while generating a fresh snapshot nonce; it validates revision progression and write budget.
- Public service session/generation handling is added in Task 3, not bypassed by exposing raw keys to UI.

- [ ] Add failing independently generated PBKDF2/AES-GCM vectors, exact AAD tamper cases and wrong-passphrase tests.
- [ ] Test that invalid public bounds/KDF profile call zero KDF operations, and random-source failures are fatal.
- [ ] Implement native Web Crypto operations without a custom primitive library; zero owned byte buffers best effort.
- [ ] Verify independent fixture interoperability, negative cases and strict types; do not claim browser/session security from primitive tests.
- [ ] Record dependency/runtime evidence and commit.

## Task 3: IndexedDB sessions and atomic updates

Files: `packages/storage/src/vault-store.ts`, `packages/storage/src/vault-service.ts`, browser integration fixtures and tests.

- [ ] Implement exact `p2p-offramp-vault` database version 1 / `vaults` store, encrypted envelope rows and complete G02 VaultService API.
- [ ] Test two real tabs committing same revision: exactly one commits; the other conflicts. No Web Crypto await inside a write transaction.
- [ ] Test lock/cancel at each async boundary, transaction completion versus abort, quota/unavailable storage, versionchange, idle/page-hide and revoked output suppression.
- [ ] Enforce write budget and no destructive recovery. Unsupported environments return typed failure, never plaintext fallback.
- [ ] Run actual Chromium/Firefox/WebKit fixtures before claiming browser support; record missing browser/device evidence explicitly.

## Task 4: G03 fresh-key recovery

- [ ] Implement checksum/format validation, bounded duplicate-key JSON parsing, source authentication and destination resealing with independent keys at revision zero.
- [ ] Test wrong password/truncation/checksum/unknown fields/oversize and KDF-before-validation spies.
- [ ] Test same-origin and fresh-origin import, crash/cancel/quota/collision and preservation of source profile and exact record payloads.
- [ ] Verify restore never opens source DEK writable or silently promotes old chain observations.

## Completion contract

Run the specification audit and per-module implementation inventory before advancing milestones. Passing Task 1 is a parser boundary implementation, not a completed vault, application, anonymity guarantee or funds-ready release. Continue through the remaining tasks and core roadmap gates; never replace missing browser/security evidence with a status-label change.
