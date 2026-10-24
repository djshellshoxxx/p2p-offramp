# Encrypted backup and fresh-key recovery

## 1. Metadata

- **Specification ID:** G03
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Export portable encrypted local state and restore it without overwriting a healthy vault or reusing a prior DEK write budget. Preserve G02's exact authenticated envelope. A backup does not contain external-wallet spending keys and does not make relay history or chain observations authoritative.

## 3. Architecture and data contracts

```typescript
interface BackupV1 {
  format: "p2p-offramp-backup";
  version: 1;
  envelope: VaultEnvelopeV1; // exact G02 schema
  checksum: string; // 64 lowercase hex SHA-256 of canonical envelope bytes
}
interface RestoreReceipt {
  sourceProfileId: string;
  newProfileId: string;
  newKeyId: string;
  revision: 0;
  records: number;
}
```

The canonical envelope has exact G02 field order: format, version, profileId, keyId, revision, wrappedKey, snapshot. wrappedKey order is kdf, iterations, salt, cipher, nonce, ciphertext; snapshot order is nonce, ciphertext. Serialize without whitespace using UTF-8 JSON. Checksum detects accidental transport corruption only; AES-GCM authentication decides authenticity. Exports MUST state whether the current envelope was authenticated in this session. Exporting a locked envelope is permitted by G02 but is not a verified recovery test.

## 4. Algorithms and bounds

1. Export reads one complete committed G02 envelope, validates its public bounds, canonicalizes it, computes SHA-256, and emits one BackupV1 JSON file. Never include filenames, account addresses, private record summaries, or passphrases in the envelope header.
2. Import caps input at 12 MiB before parsing; G02 ciphertext's base64 expansion fits this bound. Reject duplicate JSON keys, unknown fields, noncanonical base64url, unsupported version/KDF/count, non-safe revision, wrong lengths, or checksum mismatch before any expensive KDF. Streaming input must stop at the limit.
3. Authenticate and decrypt the source using G02's exact PBKDF2-SHA256 600000-iteration, AES-256-GCM, padding, AAD, record count, and payload limits. Check all duplicated metadata. No partial records become visible on any failure.
4. Create independent random destination profile ID, key ID, 32-byte DEK, 32-byte salt, and 12-byte nonces. Derive a new KEK from the destination passphrase with G02's unchanged profile. Destination passphrase may equal source passphrase but salt and DEK MUST be fresh. Reset revision to 0 and re-encrypt the complete validated snapshot with destination metadata.
5. Preserve record IDs and payload bytes; record consumers MUST validate their own schemas after restore. Trade chain/deployment IDs remain original. Do not silently relabel a chain or rewrite an identity key. Old-profile-specific records require an explicit consumer migration before use.
6. Perform a final destination envelope round-trip authentication before storage. Use one IndexedDB `add` transaction; report success only after transaction completion. A profile collision fails without retrying a `put`. The old vault is never deleted or overwritten. Select the new profile in UI only after success; there is no persistent active-profile pointer in v1, so startup presents profile selection.
7. Restored source data is never opened as writable with its old DEK. Source decryption occurs in a temporary recovery context, which is discarded on completion/cancel. At most one recovery job per document runs. No Web Crypto await occurs inside an active IDB transaction.

The checksum is unkeyed and adds no protection against intentional modification. Source freshness/rollback cannot be proven from an offline backup.

## 5. Interfaces and failure recovery

```typescript
interface BackupService {
  export(profileId: string, signal?: AbortSignal): Promise<Uint8Array>;
  restore(bytes: Uint8Array, sourcePassphrase: string,
    destinationPassphrase: string, signal?: AbortSignal): Promise<RestoreReceipt>;
}
```

Public BackupService.restore is byte-preserving and accepts no transform or executable migration input. Bundled G09 migrations use a separate storage-internal interface:

```typescript
interface MigrationResealRequest {
  sourceSessionId: string; // live G02 session, already authenticated
  expectedKeyId: string;
  expectedRevision: number;
  migrationId: string; // exact reviewed bundled G09 registry ID; never imported code
}
interface InternalMigrationResealer {
  migrateAndReseal(request: MigrationResealRequest, destinationPassphrase: string,
    signal?: AbortSignal): Promise<CoreResult<RestoreReceipt>>;
}
```

This service revalidates the live source session/key/revision, resolves only a bundled registered deterministic transform, validates every source/destination record and G02 aggregate bounds, then generates fresh destination keys and uses the same authenticate-before-add atomic destination pipeline. Recheck source revision immediately before the destination transaction; include the source row in that read-write transaction and abort if it changed, so a concurrent commit cannot make the new profile silently omit work. The source profile is retained. This internal migration may change registered record payload schemas; it is not exposed to backup imports and does not weaken ordinary restore's byte-preservation rule.

Return typed G02 errors plus `CHECKSUM_MISMATCH` and `BUSY`. Wrong passphrase, failed GCM authentication, and malformed authenticated plaintext all become `AUTHENTICATION_FAILED` with no inner details. A syntactically invalid public envelope returns `INVALID_INPUT` or `UNSUPPORTED_VERSION` before derivation. User cancellation before storage starts has no durable effect; during transaction request abort and wait for terminal outcome. If commit wins, return the receipt. After an uncertain storage failure list/reconcile profile IDs before retry. Do not automatically delete apparently duplicate restored profiles. UI shows source age as untrusted information and reconciles every pending trade on-chain before permitting economic actions.

## 6. Threat assessment

A malicious backup can trigger excessive allocation/KDF work: enforce encoded and decoded bounds first and allow one worker/job. Reusing source keys can exceed nonce budgets: fresh-key restore is mandatory. Tampered metadata and ciphertext fail authenticated decryption. A checksum-recomputed malicious envelope still fails GCM unless attacker knows the passphrase; a malicious producer who does know it can forge contents, so backups are not third-party evidence. Downloads, clipboard, browser extensions, and unlocked memory expose data outside the vault's control. Cross-origin restore is explicit file import only; no hidden iframe/key sharing or automatic gateway migration. Device loss without a usable backup may permanently lose messaging/history data.

## 7. Verification and references

Test fresh-origin and same-origin restore; verify identical record bytes, fresh profile/key/salt/nonces, revision zero, and intact old vault. Test 12 MiB boundary, truncated JSON/ciphertext, duplicate keys, unknown nested fields, invalid canonical encoding, excessive KDF count, bad checksum, wrong password, swapped fields and wrong AAD. Spy KDF to ensure public-invalid files perform zero derivations. Inject crash/cancel/quota/collision before and during commit; reopening must reveal complete old and/or complete new profiles only. Verify restoring the same backup twice uses unrelated keys, and subsequent writes do not reuse the imported DEK. Run Web Crypto and independent implementation fixtures. Real-browser IndexedDB evidence is required before recovery is supported.

Sources: [G02 exact vault contract](spec-indexeddb-encrypted-records.md), [Web Crypto Recommendation](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/), [IndexedDB 3 Working Draft](https://www.w3.org/TR/2025/WD-IndexedDB-3-20250813/).
