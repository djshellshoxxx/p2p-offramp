# Storage schema migration and downgrade protection

## 1. Metadata

- **Specification ID:** G09
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 1
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Evolve record schemas without corrupting existing vaults or changing the authority of funded trades. G02 encryption envelope v1 remains fixed. Different encryption/KDF formats require a separately versioned recovery implementation, never opportunistic reinterpretation.

## 3. Architecture and migration data

```typescript
interface RecordMigration {
  kind: RecordKind; // G02
  fromVersion: number; // exact integer 1..65535
  toVersion: number; // fromVersion + 1
  migrate(payload: Uint8Array): Uint8Array; // pure, deterministic, no I/O
}
interface MigrationPlan {
  sourceProfileId: string;
  sourceKeyId: string;
  sourceRevision: number;
  changes: readonly { recordId: string; fromVersion: number; toVersion: number }[];
}
```

Migration registry is reviewed bundled code, keyed by kind/fromVersion. Every produced payload is validated by the destination schema. Unknown record kinds are rejected by G02; known kinds with future consumer schemas remain opaque/read-only and exportable. No migration may invoke wallet/RPC/relay, infer a new deployment, alter token decimals, drop a pending intent or retire an identity as a side effect.

## 4. Migration algorithm

1. Unlock/authenticate G02 and read a consistent snapshot at `(profileId,keyId,revision)`. Reject mutation if any record's schema is newer than this client supports; preserve original vault for encrypted export.
2. Build the full sequential migration plan before changes. Require contiguous version steps, acyclic registry, no skipped versions and schema validation before/after every step. Cap at 64 steps per record and G02's existing record/payload/snapshot limits. A missing path returns UNSUPPORTED_VERSION.
3. Execute transformations on defensive copies outside IDB transactions. Preserve record IDs, kind and semantic chain/account/deployment/amount/terms bindings. Payload length may change only within G02 limits. If any record fails validation, discard the complete candidate snapshot; never partially migrate.
4. For at most 256 changed records, use one G02 commit with the original expectedRevision. G02 CAS prevents another tab from overwriting the source concurrently. After success verify count and authenticated readback; errors keep the source snapshot or the complete new revision.
5. Larger migrations or changes requiring fresh keys use a new-profile staged migration through G03's authenticated import pipeline, with fresh profile/key/DEK and revision zero. Invoke G03 InternalMigrationResealer.migrateAndReseal with the live source session, expected key/revision and reviewed bundled migrationId. That separate internal interface resolves the transform; ordinary public BackupService.restore remains byte-preserving and has no transform parameter. Retain the old profile and select the new profile only after durable success. No persistent active-profile pointer is added by this spec.
6. On interruption restart from persisted state and the same deterministic registry; never replay already-applied steps. Downgrade clients may export ciphertext but MUST refuse writes to unknown/future records. No automatic destructive reset, deleteDatabase or same-profile envelope-format overwrite is allowed.

## 5. Interfaces and failure behavior

```typescript
interface MigrationService {
  plan(sessionId: string): Promise<CoreResult<MigrationPlan>>;
  apply(sessionId: string, plan: MigrationPlan,
    destinationPassphrase?: string, signal?: AbortSignal): Promise<CoreResult<{profileId: string; revision: number}>>;
}
```

Apply rechecks source identity/revision and recomputes the plan rather than trusting supplied plan contents. `CONFLICT` requires fresh unlock/replan, `UNSUPPORTED_VERSION` offers encrypted export, `INVALID_INPUT` identifies a fixed schema code without record contents, and `LIMIT_EXCEEDED` requests archive/export. Cancellation follows G02/G03 durable-outcome rules. The destination passphrase is required only for a new-profile migration and never persisted. G03 remains callable without transforms for ordinary backup restore.

## 6. Threat assessment

Malicious imported data can exploit migration parsers or trigger data loss. Bound every step, reject unknown fields/prototype keys in consumer schemas and run pure transformations without network authority. A valid encrypted backup can still contain hostile user payloads; authenticated does not mean semantically trusted. Same-version incompatible schema changes are prohibited. Two-tab upgrade races must conflict, not lose pending intent history. In-place broad overwrite or backup deletion can destroy recovery; source profiles are retained.

## 7. Verification and references

Test each adjacent migration with fixed before/after fixtures, already-upgraded idempotence, missing/cyclic steps, future versions, malformed payloads and all size bounds. Inject failure on every record and verify no partial write. Test 256 and 257 changed records, concurrent source revision changes during transform, app crash/cancel/quota before and after commit, and older-client write refusal. Assert all trade bindings, unresolved journal IDs and messaging identity bytes survive. Sources: [G02 vault](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md), [G03 recovery](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-encrypted-backup-recovery.md), [IndexedDB](https://www.w3.org/TR/IndexedDB/).
