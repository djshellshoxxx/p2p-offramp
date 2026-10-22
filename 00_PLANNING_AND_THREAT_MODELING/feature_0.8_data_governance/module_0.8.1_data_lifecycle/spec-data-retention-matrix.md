# Data collection, retention and disposal policy

## 1. Metadata

- **Specification ID:** DATA01
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Minimize local and remote data while preserving pending-trade recovery. Separate locking, logical deletion, backup retention and external-chain/relay copies. The app cannot promise erasure of published chain data, counterparty copies or browser/OS artifacts.

## 3. Data matrix and contracts

| Data class | Collection/persistence | Default retention | Disposal/limits |
|---|---|---|---|
| Wallet seeds/private spending keys | Never collected | None | No import API |
| Passphrase/KEK/transient plaintext | Memory only per G01/G02 | Current explicit operation/session | Best-effort reference/buffer cleanup; no forensic claim |
| Pending journal/trade references | G02 encrypted vault | Until reconciled terminal plus explicit archive policy | Never auto-delete unresolved intents |
| Terminal trade/journal history | G02 encrypted vault | Retained until user reviews/exports/deletes | Suggested local archive review after 30 days; not automatic erasure |
| Chat/payment instructions | Approved encrypted chat + optional local G02 records | Local user-selected history, review after 30 days | Relay/counterparty deletion not guaranteed |
| Exact location/photos/proof witnesses | Not in core; explicit future purpose-specific consent | Module-specific bounded transient job | Never generic diagnostics/backups by default |
| Public orders/chain transactions | Published only after explicit action | External immutable/replicated retention | App expiry hides ads but cannot erase copies |
| Diagnostics | Local fixed codes; off-device opt-in only | Last 100 events in memory; explicit export | No stable identity, payloads, addresses, coordinates or full URLs |
| Encrypted backup files | Explicit local export | Controlled by user/device outside app | App cannot revoke or delete existing copies |

```typescript
interface RetentionDecisionV1 {
  version: 1; dataClass: string; purpose: string;
  scope: "session" | "vault" | "external";
  action: "retain" | "archive-review" | "logical-delete";
  unresolvedTradeIds: readonly string[]; // local encrypted record only
  consentRevision: number;
}
```

## 4. Retention and disposal algorithm

Collection requires a defined purpose and minimal fields; optional module consent is separate from wallet connect. Lock/page hide removes transient plaintext but leaves encrypted recovery records. Automatic TTL cleanup is prohibited for unresolved journal/trades/identity recovery. Terminal records are flagged for archive review after 30 days as a project UX default, not a legal retention period; the user can retain/export them. Optional legal preservation requirements are separately assessed under LEGAL01 and disclosed; they do not silently upload a local vault.

Logical record deletion requires an explicit preview of affected local records, unresolved references and backup/remote limits. G02 commit deletes records atomically with current expectedRevision; deletion fails on conflict rather than dropping references in another tab. Whole-vault deletion has no routine G02 API and requires a separately specified explicit destructive workflow. Identity deletion must explain loss of old-message decryptability. Delete no public or remote copies by assertion; sending a relay deletion request is a request only. Restoring an older backup may restore previously deleted records and must be labeled accordingly.

## 5. Interfaces and lifecycle

`planRetention(sessionId, now)` returns local eligible archive-review IDs without network calls. `deleteReviewedRecords(sessionId, expectedRevision, ids, consent)` validates G02 bounds, checks unresolved dependencies, applies one <=256-mutation atomic commit and returns actual revision. Larger user-selected deletions are separate confirmed batches, each preserving invariants, never an implicit partial success. Only fixed counts/codes leave the storage service; raw retention records remain encrypted. User can export encrypted backup before changes. Error paths do not reset vaults or infer that remote data was removed.

## 6. Threat assessment

Over-retention increases exposure while premature deletion destroys recovery and dispute context. Minimize unneeded data and keep explicit local control; no indefinite collection because a later feature might use it. Logical deletion and cryptographic key loss do not guarantee physical sanitization or deletion of other copies. A compromised unlocked origin can read retained private data. Retention choices do not transform a local app into an evidence archive or resolve statutory requirements without assessment.

## 7. Verification and sources

Test unresolved intents protected from cleanup, terminal archive-review at exact 30-day threshold, lock preserving encrypted records, duplicate/delete-noexistent operations, multi-tab conflicts and cancellation before/after commit. Test old-backup restoration reintroducing records with explicit labels. Inspect persistent storage/diagnostics for prohibited seeds/passphrases/plaintext/coordinates. Validate purpose/consent changes before new collection. Primary context: [OPC fair information principles](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/), [meaningful consent guidance](https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/collecting-personal-information-and-consent/consent/gl_omc_201805/), [G02 vault](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md). Project defaults are not assertions of applicable legal retention periods.
