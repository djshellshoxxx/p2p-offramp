# Physical coercion threat model

## 1. Metadata

- **Specification ID:** TH03
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Document the limits of software under compelled device unlock, wallet signing, or physical access. Core provides lock and data minimization. Decoy profiles, duress PINs, emergency sweeps and hidden transfers remain separate opt-in specifications and are not silently enabled.

## 3. Architecture and observation matrix

| Adversary condition | Core response | Limit |
|---|---|---|
| Brief access to locked device/browser | Encrypted local vault, no auto-unlock | Weak passphrase/offline copies remain vulnerable |
| Access while app unlocked | Page-hide and idle locking, minimized rendered data | Screen capture and plaintext memory may already be exposed |
| Compelled vault unlock | No false promise of coercion resistance | An attacker can demand further actions or backups |
| Compelled wallet signature | External wallet confirmation | App cannot prevent physical coercion |
| Copied backup/storage | G02/G03 authenticated encryption | Cannot retract copies or guarantee erasure |

Do not add covert outgoing payments, background panic transactions, destructive wipe, or silently falsified balances as part of routine locking.

## 4. Required algorithms and invariants

Lock invokes G01/G02 synchronously and removes sensitive UI state; asynchronous work checks session generation before returning plaintext. Page hide and five-minute idle lock follow G02 exactly. A crash/restart begins locked. Show only the information needed for the current flow; hide chat/payment details behind explicit reveal controls after unlock. User-controlled export includes an explicit local disclosure action. Locking does not delete vaults, change chain positions, or rotate counterpart identities. Refund/release deadlines continue on-chain while the app is locked.

No new cryptographic primitive or ZK circuit is defined in this threat model.

## 5. Interfaces and failure recovery

Use `lockAll()` from identity/vault services and a renderer-level `locked` state that clears sensitive component state and object URLs. Local diagnostics return `LOCKED` or `CANCELLED`, never the record title or last-open trade. Unlock is explicit for each document. Cross-tab lock notifications are advisory; each document enforces its own generation and idle rules. Recovery instructions distinguish vault passphrase, messaging identities and external-wallet recovery.

## 6. Threat assessment

A visible privacy control may itself attract attention; the product cannot guarantee plausible deniability. Browser/OS swap, crash dumps, extensions, screenshots and external backups can retain traces after lock. Do not market memory overwrite or IndexedDB deletion as forensic erasure. Duress mechanisms require a separate user safety/usability assessment and independent review before enablement, rather than assumptions that they make physical encounters safe.

## 7. Verification and references

Test page hide, browser restart, idle exactly at five minutes, lock during crypto and lock during storage commit. Verify no plaintext reappears from stale async completion. Confirm locking generates no chain transaction, deletion, network beacon or identity rotation. Test another tab remaining unlocked and document that boundary. Review all UI copy for coercion/erasure guarantees; none may exceed these assumptions.

Normative project dependency: [development roadmap](../../../DEVELOPMENT_ROADMAP.md). See G01–G06 for key, vault, backup, content, transport and dependency enforcement. Threat models define required properties; passing fixtures is not a whole-product security certification.
