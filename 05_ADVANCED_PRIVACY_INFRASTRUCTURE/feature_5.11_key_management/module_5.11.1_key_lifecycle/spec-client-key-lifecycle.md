# Client key lifecycle and purpose separation

## 1. Metadata

- **Specification ID:** G01
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Keep spending authority in external wallets and isolate storage, messaging, and recovery lifecycles. Prevent reuse of wallet signatures, storage passphrases, or identity keys as interchangeable secrets. This contract creates no custom signature scheme and does not promise forensic memory erasure.

## 3. Architecture and data flow

| Material | Owner | Persistence | Authority |
|---|---|---|---|
| Wallet spending key | External wallet | Never in app vault, logs, QR, or backups | Chain transactions only |
| Random vault DEK | G02 storage service | Wrapped by passphrase-derived KEK | Authenticated local snapshot |
| KEK | G02 unlock operation | No persistence | Unwrap DEK only |
| Messaging identity key | Reviewed Nostr signer adapter | Encrypted G02 identity record only if app-managed; otherwise signer-held | Message signing/decryption only |
| Per-message ephemeral key | Messaging adapter | In memory for its specified operation | Protocol-defined message role |
| Session token | Vault service | Memory only | Local vault handle, no external identity |

The app MUST NOT derive messaging keys from DEKs, passphrases, EVM signatures, Solana signatures, or wallet seed material. G02 generates a random DEK; this spec does not replace it with a deterministic hierarchy. App-managed messaging identity backup is opt-in private recovery material, not a spending-wallet backup.

## 4. Algorithms and state transitions

Identity state is `absent -> locked -> unlocked -> locked`, with `retired` available only after explicit rotation. Generate a messaging identity through the selected reviewed protocol library using Web Crypto randomness; reject invalid scalars according to that library. No handwritten secp256k1 or scalar-reduction implementation is allowed. The specific library/version and vector fixture hashes must enter G06 before messaging is enabled.

Each unlock creates a fresh 32-random-byte opaque session token and a nonnegative generation. Lock marks the session invalid synchronously, increments generation, drops key/plaintext references, and invalidates all pending outputs. Async crypto may finish but MUST not publish results under an invalid generation. G02 lock and in-flight-commit outcome rules remain authoritative.

Page hide locks all sessions; five minutes without trusted pointer/keyboard input locks idle sessions. Untrusted synthetic events, read polling, timers, and background RPC do not refresh idle activity. Reopening requires unlock, not automatic decryption using a cached passphrase. Wallet account/network changes also cancel identity-bound preparations; they do not silently rotate the messaging identity.

Rotation generates an independent identity and records retirement locally. Old messages remain recoverable only if the old identity is retained in encrypted backup. Do not promise that rotation erases historical public associations. No circuit or on-chain contract applies.

## 5. Interfaces and error semantics

```typescript
type KeyPurpose = "messaging"; // spending is intentionally absent
interface IdentityHandle { id: string; generation: number; purpose: KeyPurpose; }
interface IdentityService {
  create(vaultSession: VaultSession, signal?: AbortSignal): Promise<IdentityHandle>;
  unlock(vaultSession: VaultSession, identityRecordId: string,
    signal?: AbortSignal): Promise<IdentityHandle>;
  publicIdentity(handle: IdentityHandle): Promise<string>;
  retire(handle: IdentityHandle): Promise<void>;
  lockAll(): void;
}
```

The caller first unlocks G02 using its VaultService; these identity methods require that live authenticated VaultSession, never an implicit profile or cached passphrase. The service verifies the session/profile binding on every call and keeps it in each internal handle. Two concurrently unlocked profiles cannot share an identity handle. The identityRecordId is a G02 record ID in that exact profile. These methods wrap G02 and a protocol signer; no API returns raw keys to UI components. `create` requires an unlocked vault and atomically persists its encrypted identity before reporting success. Errors are fixed `LOCKED`, `CANCELLED`, `UNSUPPORTED_PROVIDER`, `INVALID_IDENTITY`, `STORAGE_UNAVAILABLE`, `CONFLICT`, or `LIMIT_EXCEEDED`. Cancellation after durable creation returns a discoverable identity reference, not a false claim that no key was stored. Private signing/decryption operations belong to the messaging adapter and require a valid purpose-bound handle. At most one active identity is selected per profile; imported retired keys remain read-only unless explicitly reselected.

## 6. Threat assessment

A signature-request phishing attack must not gain a general signer API from the UI; approved protocol operations validate the complete message schema and recipient. Memory compromise/XSS can read app-managed unlocked keys; nonextractable key handles do not protect against arbitrary same-origin code using them. Buffers may be overwritten best effort, but JS strings, browser heaps, swap, crash dumps, and copied buffers cannot be reliably erased. Never persist passphrases in localStorage, IndexedDB, service worker caches, analytics, error reports, or form autofill controlled by app code. Lost unbacked-up messaging keys mean lost local decryptability; external-wallet recovery is independent.

## 7. Verification and references

Test creating/unlocking identities in two simultaneously unlocked profiles, swapped vault sessions/record IDs, revoked vault-session handles, purpose confusion, wrong-profile handles, forged handles, retired handles, and overlapping unlock/lock/rotation. Inject lock at every async boundary and assert no plaintext result or signature escapes. Test page hide, idle threshold just below/at five minutes, synthetic activity, polling, and wallet changes. Inspect exported bundles for wallet secret material; inspect logs/storage after operations for passphrase and plaintext key fixtures. Run protocol known-answer/invalid-scalar vectors through the selected provider before enabling messaging.

Sources: [Web Crypto Recommendation](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/), [G02 vault](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md), [Nostr NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md). Nostr revision and library versions require G06 pinning at implementation time.
