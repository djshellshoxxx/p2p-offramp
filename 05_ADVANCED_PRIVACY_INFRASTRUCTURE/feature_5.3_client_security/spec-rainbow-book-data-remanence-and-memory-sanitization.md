# Rainbow-Series-Inspired Client Memory & Data Remanence Controls
Status: design specification / browser limitations explicitly scoped. 2026-10-21.

## Provenance and interpretation
NCSC-TG-025 is *A Guide to Understanding Data Remanence in Automated Information Systems* (Green Book); NCSC-TG-018 is *A Guide to Understanding Object Reuse in Trusted Systems* (Light Blue Book); NCSC-TG-005 is *Trusted Network Interpretation* and NCSC-TG-011 is the Trusted Network Interpretation Environments Guideline (Red Books). Historical design principles motivate this specification; these documents do **not** prescribe WASM wipe instructions, Argon2id parameters, Nostr padding, IndexedDB APIs, or modern JavaScript-engine guarantees. See [Rainbow Series index](https://irp.fas.org/nsa/rainbow.htm) and [TG-005 full text](https://irp.fas.org/nsa/rainbow/tg005.htm). Password/key-derivation settings below are contemporary engineering decisions, not mandates of CSC-STD-002-85.

## Security goals and attacker model
Assets: escrow secret scalars, wallet signatures, decrypted trade details, verification credentials, session keys, relay correlation identifiers and bank/payment metadata.
Attackers: malicious extensions; injected scripts/XSS; shared-device next user; post-close process memory inspection; hostile service workers; stolen disk/browser profile; swap/hibernation snapshots; DevTools/memory dump access; compromised OS, cold-boot or physical memory forensics; malicious relay traffic observers.
Priority: limit secret lifetime and plaintext copies; make durable records encrypted and authenticated; isolate operations; prevent reuse of stale object data; reduce observable metadata. **Not guaranteed:** JavaScript `String` immutability, GC copying, JIT compiler copies, wallet extension internals, browser caches, OS swap, backups, filesystem wear leveling or hardware RAM cold-boot recovery. A browser app cannot securely erase all traces or stop a fully compromised endpoint.

## Cryptographic secret lifecycle
State machine: `UNINITIALIZED -> GENERATED -> IN_USE -> ZEROIZE_REQUESTED -> RELEASED`; emergency interruption -> `ABORTED`. Prevent use after released or aborted. High-value chain signing occurs in a user-confirmed hardware/external wallet whenever possible; never import wallet seed into site JS.

On initialize, create dedicated worker and, optionally, WASM with fixed/private linear memory. Use `crypto.getRandomValues` for entropy; derive ephemeral keys, do key use in same isolated scope, return public results only and never log intermediate secrets. No worker-to-page secret copy via structured cloning. For reusable unlock vault, derive a non-extractable WebCrypto AES key when feasible, but understand that non-extractable means API restriction, not hardware-backed guarantee.

Key generation: sample uniformly until `1 <= d < n` for secp256k1, where `n=0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141`. Derive session encryption keys via `HKDF-SHA256(ikm,salt,info,32)` with distinct `info="p2p-offramp/v1/" || chainId || tradeId || purpose`; never reuse keys across functions.

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

This illustration requires a build/test review for panic and toolchain behavior; `Drop` cannot run after termination, abort or process crash. Compilers can still make intermediate copies/register spills; wiping a WASM linear memory region is a best-effort control, not definitive secret removal. For JS-owned buffers, immediately `Uint8Array.fill(0)` in a `finally` block; isolate use and avoid ever converting secrets to `String`, serializing, logging or displaying. Audit WASM allocator behavior, `memory.grow`, JS `ArrayBuffer` views, worker messages and stack temporaries. Terminate dedicated worker after trade, not as sole zeroization primitive.

### Verification tests for key lifetime
- Wasm unit test: capture arena after success, error and panic/unwind paths; assert zero bytes in known secret range before arena reuse. Instrument worker boundary and ensure secrets never appear in `postMessage`, JSON, logs, analytics or DOM.
- Native binary inspection: compile production optimization settings, disassemble memory-erasure function and verify preserved stores/instructions in target binaries; regression gate upon compiler upgrades.
- Browser integration: trade cancel, settlement, inactivity, tab closure and reload; verify UI, caches and IndexedDB expected deletion; failures on hard kill are documented.
- Browser threat exercise: injected-content CSP tests, untrusted extension scenario and fake wallet/provider substitution; record residual risk rather than report guaranteed protection.

## Persistent storage: authenticated encryption, retention and purge
Default: no persistence of raw key material, authorization signatures, bank credentials or plaintext payment proofs. Optional encrypted IndexedDB stores minimal recoverable trade drafts and public commitments.

Record format:
```json
{"v":1,"kdf":"argon2id","kdfSaltB64":"random-16-or-32-bytes","params":{"memoryKiB":65536,"iterations":3,"parallelism":1},"ivB64":"random-12-bytes","aad":{"app":"p2p-offramp","tradeId":"trade-specific-id","recordType":"draft","schema":1},"ciphertextB64":"base64-of-AES-GCM-ciphertext-and-tag","createdAt":"ISO8601","expiresAt":"ISO8601"}
```
Numbers are **initial candidate settings**, not universal secure defaults: calibrate Argon2id to a defensible device-specific latency and memory budget, follow OWASP guidance, and use fresh uniformly random salt for every password-protected vault. Retain salt and parameters with encrypted records so recovery works. The phrase "ephemeral salt" applies only to session-only secrets that will never be decrypted after session loss. AES-GCM requires a unique unpredictable 96-bit IV for each encryption under the same key; authenticated data binds `app, origin, chainId, tradeId, recordType, schema`; validate after successful decryption. Limit passphrase attempts by local UI cooldown; offline attackers can bypass UI, so passphrase strength and memory-hard KDF are essential.

Purge triggers: explicit "delete trade", settlement plus a configurable short retention window, expiry, lock/logout, idle deadline for ephemeral session caches, account/network switch and unrecoverable key destruction. For recoverable offline drafts, distinguish **lock** (erase in-memory key) from **delete** (delete IndexedDB records). Browser `indexedDB.deleteDatabase` and record deletion only remove logical accessibility, not forensic copies in journal, backups, SSD wear-leveling or browser sync. Cryptographic erasure is achieved only to the extent the encryption key really becomes inaccessible, which cannot be guaranteed in a hostile browser/OS. Do not claim secure storage sanitization.

## DOM, autofill, caching, service workers
- Avoid rendering secrets where possible. Mask sensitive fields, use `autocomplete="off"` or more specific compatible tokens as *hints*; browser/password-manager behavior varies. Never rely on autofill suppression for security.
- Use `Cache-Control: no-store` on responses that could carry sensitive material (if applicable); static bundles can be cached, **never** cache personalized plaintext HTML/JSON. Do not place secrets in URL paths, query strings, fragment state, localStorage, cookies, Service Worker Cache Storage, analytics or browser history.
- SPA route teardown explicitly clears forms, visible DOM/text nodes and in-memory application state; clipboard contents, screenshots, session restore, accessibility services, browser history and extensions remain outside reliable site control.
- CSP with strict `script-src`, Trusted Types where supported, no third-party analytics on trade views, cross-origin isolation when justified, and dependency integrity checks. Test hostile service worker update and storage permissions.
- Never silently upload local vault secrets to backup services. Provide user-facing scope of retention and possible browser-managed persistence.

## Network covert/storage and timing channels
Red Book inspiration: treat event length, topic, send interval, peer count, relay selection, IP address and response latency as observable. Threat matrix: ciphertext size leaks trade/proof class; fixed rendezvous topics link repeated trades; periodic retries fingerprint clients; network errors reveal topology; visible on-chain settlement correlates events. Payload padding addresses length **only**.

Envelope: `version | keyId | nonce | authenticatedCiphertext | padLength`; authenticate metadata and padding, forbid ambiguous decode. Select a fixed padded application payload size per protocol class, e.g. 4096 bytes, where `L = header + nonce + ciphertext + tag + padding <= 4096`; reject oversized messages or split into bounded numbered chunks with per-chunk AAD and a manifest commitment. Generate padding from CSPRNG if implementation requires indistinguishable bytes; check overhead limits and Nostr relay maximum event sizes/transport framing. Use length prefix inside encrypted plaintext to recover content without leaking the length. Keep outer encoding/framing and signature overhead in measured wire-size budget.

Timing defenses: randomized bounded batching/delays and optional cover traffic **only when opted in** and a privacy budget permits; expensive cover traffic and mobile background throttling limit protection. Do not assert constant-rate guarantees. Rotate trade-specific discovery identifiers, cap node peer linkage, pin authenticated protocol identity, and prevent cross-trade encryption key reuse. Anonymity may still be broken by IP addresses, network traffic timing, relay observation, wallet activity or fiat rails.

## Requirements and acceptance gates
R-01 wallet seed never enters page JS. R-02 worker retains a key only while trade operation is active. R-03 recognized secret arenas are explicitly cleared on all managed return/error paths. R-04 cache and database contain no plaintext trade metadata beyond documented nonsecret indices. R-05 post-delete UI refuses to restore trade. R-06 repeat transactions use independent IVs and trade-scoped associated data. R-07 relay payload length remains equal for compatible padded envelope classes. R-08 inspector finds no secrets in app logs, URLs or outbound payloads. R-09 hard-kill/OS compromise/cold-boot limitations documented. R-10 sensitive key activities fail closed if random source, key validation, worker isolation or approved library initialization fails.

Test suite: browser unit/integration tests with malicious extensions modeled where practical; WASM memzero tests; randomized storage/nonce property tests; network captures comparing envelope lengths and event frequencies; IndexedDB recovery versus deletion; wallet-provider mutation; CSP regression; fuzz truncated ciphertexts, invalid tags, stale AAD and corrupted kdf parameters.

## Historical and modern references
[NCSC Rainbow Series](https://irp.fas.org/nsa/rainbow.htm), [NCSC-TG-005](https://irp.fas.org/nsa/rainbow/tg005.htm), [MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [MDN WebCrypto](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API), [Rust zeroize](https://github.com/RustCrypto/utils/tree/master/zeroize), [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html).

## NCSC secure communications controls (2026-10-21 addendum)
The [seven secure communications principles](https://www.ncsc.gov.uk/sites/default/files/pdfs/publication/secure-communication-principles.pdf) are applied as testable requirements: SC-1 encrypt/authenticate message payload and verify peer keys with trade-specific context; SC-2 never grant relays plaintext or signing-key access; SC-3 require fresh wallet/account binding and reject unauthenticated counterpart impersonation; SC-4 record privacy-preserving audit evidence without trade plaintext; SC-5 secure key rotation, wallet disconnect and device reset paths; SC-6 inventory, minimize and document IP/topic/timing/size metadata; SC-7 permit relay/provider substitution without silent downgrade. Test malicious relay, key substitution, stale signature, forged sender, leaked topic and device theft.

The [NCSC Common Cyber Attacks white paper](https://www.ncsc.gov.uk/guidance/white-papers/common-cyber-attacks-reducing-impact) emphasizes patching, malware defenses, secure configuration, allowlisting, least privilege, monitoring and incident response. A browser-only app cannot enforce host patching or extension hygiene; document device trust as a residual risk and provide a secure-use checklist. Add dependency patch SLA, CSP regression checks, opt-in minimal diagnostics and a compromised-device recovery runbook. The [CPA Build Standard](https://www.ncsc.gov.uk/files/CPA-Build_Standard_1-4.pdf) requires engineering evidence rather than declarations: retain zeroization tests, CSP results, vault persistence tests, compiler outputs, security review signoffs and documented exceptions. **No browser sanitization mechanism provides forensic secure deletion guarantees.**

Packet Storm [security research archive](https://www.packetstatic.com/) is an additional source for browser/XSS, extension, memory-corruption, WebAssembly and supply-chain case studies. Track advisories against pinned browser engines and packages; verify each report against original vendor disclosures before adding a test. Never download or execute unreviewed PoCs on a user's device. See [Packet Storm archive guidance](https://rss.packetstormsecurity.org/help/view/4).
