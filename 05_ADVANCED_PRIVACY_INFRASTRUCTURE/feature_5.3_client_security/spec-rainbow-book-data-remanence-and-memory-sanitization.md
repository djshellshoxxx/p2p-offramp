# Client memory lifetime and data remanence controls

## 1. Metadata

- **Specification ID:** MEM01
- **Version:** 1.0
- **Status:** Expanded design baseline — implementation and independent review pending
- **Owner:** p2p-offramp maintainers
- **Delivery phase:** 0
- **Normative precedence:** G01–G15 and the development roadmap govern core v1; candidate research profiles do not override them.

### Historical provenance

NCSC-TG-025 is *A Guide to Understanding Data Remanence in Automated Information Systems* (Green Book); NCSC-TG-018 is *A Guide to Understanding Object Reuse in Trusted Systems* (Light Blue Book); NCSC-TG-005 is *Trusted Network Interpretation* and NCSC-TG-011 is the Trusted Network Interpretation Environments Guideline (Red Books). Historical design principles motivate this specification; these documents do **not** prescribe WASM wipe instructions, Argon2id parameters, Nostr padding, IndexedDB APIs, or modern JavaScript-engine guarantees. See [Rainbow Series index](https://irp.fas.org/nsa/rainbow.htm) and [TG-005 full text](https://irp.fas.org/nsa/rainbow/tg005.htm). Password/key-derivation settings below are contemporary engineering decisions, not mandates of CSC-STD-002-85.

## 2. Objective and attacker model

Assets: escrow secret scalars, wallet signatures, decrypted trade details, verification credentials, session keys, relay correlation identifiers and bank/payment metadata.
Attackers: malicious extensions; injected scripts/XSS; shared-device next user; post-close process memory inspection; hostile service workers; stolen disk/browser profile; swap/hibernation snapshots; DevTools/memory dump access; compromised OS, cold-boot or physical memory forensics; malicious relay traffic observers.
Priority: limit secret lifetime and plaintext copies; make durable records encrypted and authenticated; isolate operations; prevent reuse of stale object data; reduce observable metadata. **Not guaranteed:** JavaScript `String` immutability, GC copying, JIT compiler copies, wallet extension internals, browser caches, OS swap, backups, filesystem wear leveling or hardware RAM cold-boot recovery. A browser app cannot securely erase all traces or stop a fully compromised endpoint.

## 3. Architecture and lifecycle

State machine: `UNINITIALIZED -> GENERATED -> IN_USE -> ZEROIZE_REQUESTED -> RELEASED`; emergency interruption -> `ABORTED`. Prevent use after released or aborted. High-value chain signing occurs in a user-confirmed hardware/external wallet whenever possible; never import wallet seed into site JS.

On initialize, create dedicated worker and, optionally, WASM with fixed/private linear memory. Use `crypto.getRandomValues` for entropy; derive ephemeral keys, do key use in same isolated scope, return public results only and never log intermediate secrets. No worker-to-page secret copy via structured cloning. For reusable unlock vault, derive a non-extractable WebCrypto AES key when feasible, but understand that non-extractable means API restriction, not hardware-backed guarantee.

Key generation and derivation MUST use the selected reviewed protocol implementation and its exact domain encoding. No generic concatenation-based KDF or handwritten scalar routine is authorized by this memory-control spec. G01 forbids deriving messaging keys from wallet signatures, vault DEKs or passphrases. G02 generates a random DEK and wraps it with its fixed passphrase KDF; protocol messaging and stealth derivations remain separate.

## 4. Managed sanitization algorithms

### WASM explicit sanitization algorithm
Allocate an owned arena `[offset,offset+length)` that contains secret bytes, never raw pointers to memory owned by another subsystem. Use a reliable zeroization primitive that the selected toolchain documents as resistant to dead-store elimination (e.g., Rust `zeroize` crate, or C `explicit_bzero`/platform-supported equivalent). Do not rely on an ordinary optimized `memset` being preserved. Rust pseudo-implementation:

```rust
use zeroize::Zeroize;
pub fn with_secret<F, R>(secret: &mut [u8], f: F) -> R
where F: FnOnce(&[u8]) -> R {
    struct Guard<'a>(&'a mut [u8]);
    impl Drop for Guard<'_> { fn drop(&mut self) { self.0.zeroize(); } }
    let guard = Guard(secret);
    f(guard.0)
}
```

This illustration requires a build/test review for panic and toolchain behavior; `Drop` cannot run after termination, abort or process crash. Compilers can still make intermediate copies/register spills; wiping a WASM linear memory region is a best-effort control, not definitive secret removal. For JS-owned buffers, request `Uint8Array.fill(0)` in a `finally` block; isolate use and avoid ever converting secrets to `String`, serializing, logging or displaying. Audit WASM allocator behavior, `memory.grow`, JS `ArrayBuffer` views, worker messages and stack temporaries. Terminate per-operation workers when done, never as the sole zeroization primitive. A vault/identity session worker may persist only for the G01/G02 session lifetime; locking revokes its handles and discards keys.

### Verification tests for key lifetime
- Wasm unit test: capture arena after success, error and panic/unwind paths; assert zero bytes in known secret range before arena reuse. Instrument worker boundary and ensure secrets never appear in `postMessage`, JSON, logs, analytics or DOM.
- Native binary inspection: compile production optimization settings, disassemble memory-erasure function and verify preserved stores/instructions in target binaries; regression gate upon compiler upgrades.
- Browser integration: trade cancel, settlement, inactivity, tab closure and reload; verify UI, caches and IndexedDB expected deletion; failures on hard kill are documented.
- Browser threat exercise: injected-content CSP tests, untrusted extension scenario and fake wallet/provider substitution; record residual risk rather than report guaranteed protection.

## 5. Persistence and revocation interfaces

The only core v1 persistent format is G02's bounded encrypted snapshot in `p2p-offramp-vault` / `vaults`. It uses a fresh random 32-byte DEK, PBKDF2-HMAC-SHA256 with exactly 600000 iterations and a 32-byte salt for the KEK, AES-256-GCM with independent 12-byte random nonces and 128-bit tags, and G02's exact AAD and revision/write budget. Private record kinds/IDs/payloads are inside the encrypted snapshot; do not add plaintext trade indexes or per-record alternative envelopes. G03 restore always generates fresh keys and profile metadata. Argon2id/per-record candidate examples from the earlier draft are superseded; they are not an accepted v1 profile.

Lock clears in-memory key references and sensitive view state; it does not delete recoverable journal/history records. Deletion is a separate explicit user action with scope and unresolved-trade recovery disclosure, never automatic settlement/timeout/logout behavior. G02 offers no routine whole-vault deletion API; future deletion requires an explicit independently specified migration/export/recovery workflow. Browser logical deletion cannot erase journal, backup, swap or filesystem copies. Cryptographic erasure cannot be guaranteed in a hostile browser/OS. No secure sanitization claim is permitted.

Memory APIs use purpose-bound opaque handles, not raw-key getters:

```typescript
interface SecretOperation {
  state: "generated" | "in-use" | "revoked" | "released";
  generation: number;
  revoke(): void;
  dispose(): void;
}
```

All async completions recheck generation before returning sensitive results. Revocation is synchronous; managed cleanup runs best effort. G02 rules govern the durable outcome of a commit already in flight, even if cleanup is requested. DOM Strings for user-entered passphrases cannot be zeroed; encode the exact input per G02, minimize lifetime/copies and do not promise erasure.

## 6. Threat boundaries and leakage

- Avoid rendering secrets where possible. Mask sensitive fields, use `autocomplete="off"` or more specific compatible tokens as *hints*; browser/password-manager behavior varies. Never rely on autofill suppression for security.
- Use `Cache-Control: no-store` on responses that could carry sensitive material (if applicable); static bundles can be cached, **never** cache personalized plaintext HTML/JSON. Do not place secrets in URL paths, query strings, fragment state, localStorage, cookies, Service Worker Cache Storage, analytics or browser history.
- SPA route teardown explicitly clears forms, visible DOM/text nodes and in-memory application state; clipboard contents, screenshots, session restore, accessibility services, browser history and extensions remain outside reliable site control.
- CSP with strict `script-src`, Trusted Types where supported, no third-party analytics on trade views, cross-origin isolation when justified, and dependency integrity checks. Test hostile service worker update and storage permissions.
- Never silently upload local vault secrets to backup services. Provide user-facing scope of retention and possible browser-managed persistence.

### Network metadata

Red Book inspiration: treat event length, topic, send interval, peer count, relay selection, IP address and response latency as observable. Threat matrix: ciphertext size leaks trade/proof class; fixed rendezvous topics link repeated trades; periodic retries fingerprint clients; network errors reveal topology; visible on-chain settlement correlates events. Payload padding addresses length **only**.

Messaging wire format, padding and replay policy are owned by the selected NIP-44/NIP-17 or other approved adapter. Do not add a generic `keyId|nonce|ciphertext|padLength` wrapper that silently changes an established protocol. Test measured wire sizes with the actual framing/overhead. G02 snapshot padding remains its exact 4096-byte length bucket; that storage format is not a network message format. Oversized data is rejected unless the particular adapter specifies authenticated bounded chunking.

Timing defenses: randomized bounded batching/delays and optional cover traffic **only when opted in** and a privacy budget permits; expensive cover traffic and mobile background throttling limit protection. Do not assert constant-rate guarantees. Rotate trade-specific discovery identifiers, cap node peer linkage, pin authenticated protocol identity, and prevent cross-trade encryption key reuse. Anonymity may still be broken by IP addresses, network traffic timing, relay observation, wallet activity or fiat rails.

## 7. Verification and references

R-01 wallet seed never enters page JS. R-02 each worker retains keys only for its explicit operation/session lifetime and honors G01/G02 lock/revocation. R-03 recognized secret arenas are explicitly cleared on all managed return/error paths. R-04 cache and database contain no plaintext trade metadata beyond documented nonsecret indices. R-05 explicit logical deletion is never labeled forensic erasure or used as routine error recovery; restoring a user-held older backup remains possible. R-06 each encryption obeys its selected protocol nonce/AAD rules; G02 preserves its exact envelope AAD and write budget. R-07 relay payload length remains equal for compatible padded envelope classes. R-08 inspector finds no secrets in app logs, URLs or outbound payloads. R-09 hard-kill/OS compromise/cold-boot limitations documented. R-10 sensitive key activities fail closed if random source, key validation, worker isolation or approved library initialization fails.

Test suite: browser unit/integration tests with malicious extensions modeled where practical; WASM memzero tests; randomized storage/nonce property tests; network captures comparing envelope lengths and event frequencies; IndexedDB recovery versus deletion; wallet-provider mutation; CSP regression; fuzz truncated ciphertexts, invalid tags, stale AAD and corrupted kdf parameters.

### Historical and modern references

[NCSC Rainbow Series](https://irp.fas.org/nsa/rainbow.htm), [NCSC-TG-005](https://irp.fas.org/nsa/rainbow/tg005.htm), [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [MDN WebCrypto](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API), [Rust zeroize](https://github.com/RustCrypto/utils/tree/master/zeroize), [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html).

### NCSC secure communications controls

The [seven secure communications principles](https://www.ncsc.gov.uk/sites/default/files/pdfs/publication/secure-communication-principles.pdf) are applied as testable requirements: SC-1 encrypt/authenticate message payload and verify peer keys with trade-specific context; SC-2 never grant relays plaintext or signing-key access; SC-3 require fresh wallet/account binding and reject unauthenticated counterpart impersonation; SC-4 record privacy-preserving audit evidence without trade plaintext; SC-5 secure key rotation, wallet disconnect and device reset paths; SC-6 inventory, minimize and document IP/topic/timing/size metadata; SC-7 permit relay/provider substitution without silent downgrade. Test malicious relay, key substitution, stale signature, forged sender, leaked topic and device theft.

The [NCSC Common Cyber Attacks white paper](https://www.ncsc.gov.uk/guidance/white-papers/common-cyber-attacks-reducing-impact) emphasizes patching, malware defenses, secure configuration, allowlisting, least privilege, monitoring and incident response. A browser-only app cannot enforce host patching or extension hygiene; document device trust as a residual risk and provide a secure-use checklist. Add dependency patch SLA, CSP regression checks, opt-in minimal diagnostics and a compromised-device recovery runbook. The [CPA Build Standard](https://www.ncsc.gov.uk/files/CPA-Build_Standard_1-4.pdf) requires engineering evidence rather than declarations: retain zeroization tests, CSP results, vault persistence tests, compiler outputs, security review signoffs and documented exceptions. **No browser sanitization mechanism provides forensic secure deletion guarantees.**

Packet Storm [security research archive](https://www.packetstatic.com/) is an additional source for browser/XSS, extension, memory-corruption, WebAssembly and supply-chain case studies. Track advisories against pinned browser engines and packages; verify each report against original vendor disclosures before adding a test. Never download or execute unreviewed PoCs on a user's device. See [Packet Storm archive guidance](https://rss.packetstormsecurity.org/help/view/4).
