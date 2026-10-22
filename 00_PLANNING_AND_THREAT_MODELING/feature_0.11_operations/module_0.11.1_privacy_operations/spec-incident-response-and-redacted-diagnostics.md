# G26 incident response and redacted diagnostics

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M2C.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Triage failures while keeping private trade content local by default and preserving existing escrow exits. No analytics backend, automatic report upload or remote kill switch is required. Maintainers cannot reverse basic escrow or repair fiat loss.

## 3. Architecture and data contracts

IncidentRecord: `{incidentId,severity,reportedAt,affectedManifestDigests,affectedDeploymentIds,impact,hypothesis,containment,recovery,reviewer,status,advisoryDigest}`. Lifecycle: detected → triaged → contained → recovering → reviewed → closed. Local DiagnosticEvent allowlist is `{v,timeBucket,releaseId,module,errorCode,operation,routeState,chainNamespace,storageSchema}`. No arbitrary error strings/stack dumps by default. Exclude wallet/trade identifiers, RPC query parameters, endpoint credentials, balances, bank details, chat/evidence, key material, exact location and clipboard content. Keep at most 500 events or 1 MiB for 7 days locally; locked users can erase diagnostics without unlocking secrets.

## 4. Algorithms and lifecycle

Classify loss-of-funds/key compromise as critical, broad data disclosure as high, availability-only failure according to impact; never wait for perfect attribution to publish a scoped advisory. Preserve minimal evidence with user consent. Contain by disabling new funding in a newly signed advisory release and removing unsafe endpoints/dependencies from future releases; immutable on-chain exits remain. Provide independent recovery bundle and verified deployment identities. Signing-key compromise requires out-of-band trust re-bootstrap, not same-origin unsigned replacement keys. User diagnostic export is previewed field-by-field, explicitly selected, capped at 1 MiB and downloaded locally; sharing is a separate user action. Never auto-send content or claim redaction is mathematically complete.

## 5. Interfaces and integration

`collectDiagnostics()` returns only allowlisted structured fields; `previewExport()` shows final bytes and warnings; `clearDiagnostics()` erases the local ring. Error mapping drops provider message bodies and strips URL query/fragment. Security contact instructions must identify a real maintained channel before release; absent channel is a release blocker rather than an invented address. Advisories contain affected hashes, observed facts, uncertainty, safe recovery steps and signed publication sequence.

## 6. Errors, abuse and residual threats

REDACTION_FAILED prevents export, not escrow recovery. REPORT_TOO_LARGE requires reduction, not remote upload. Browser storage may be evicted; diagnostics are not a durable audit ledger. Timing/module/error combinations can still fingerprint users. Malware or same-origin XSS may bypass diagnostics controls entirely. Do not request seeds or private keys during support.

## 7. Verification and primary references

Inject secrets into every raw error field and assert none appear in allowed export. Test locked-vault erase, capacity/age expiry, corrupt event storage, clock rollback and offline advisory/recovery. Drill bad release, compromised endpoint, signing-key incident and lost origin separately on test networks. Record recovery evidence and postmortem changes without personal data. Operational ownership, implementation and independent rehearsal remain pending.

Primary references (exact implementation revisions must be pinned in the evidence record): [OWASP logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html); [NIST incident response](https://csrc.nist.gov/pubs/sp/800/61/r3/final).
