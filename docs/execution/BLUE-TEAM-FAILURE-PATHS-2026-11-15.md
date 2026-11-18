# Blue-team third pass — failure paths and security-boundary interactions — 2026-11-15

## Scope and disposition

Repository: `djshellshoxxx/p2p-offramp`  
Branch: `integration/p2p-consolidated-20261109`

This pass inspected vault encryption/session and IndexedDB commit behavior, recovery-slot coordination, NIP-44/NIP-59/NIP-17 messaging, NIP-01 event parsing, relay event delivery and socket ownership, escrow funding/settlement/withdrawal, static build policy and artifact scanning.

**Disposition remains: do not enable real-funds release.** Existing default release controls remain disabled and the static build deliberately excludes sensitive execution/relay modules from the core artifact. No code was changed. No tests, fuzzers, browser automation, local EVM or live network checks were run.

## New finding

### BT-14 — P2: NIP-17 replay deduplication is scoped to one in-memory TradeChat instance

**Evidence**
- `packages/nostr-crypto/src/nip17.ts` creates `const seen = new Set<string>()` inside `createTradeChat`.
- `remember(id)` rejects duplicates only while the same instance remains alive; the set has a configurable maximum and no eviction.
- `close()` explicitly clears the set.
- The file comment says callers persist history and open a new session, but `TradeChatOptions` has no persisted-seen-ID input or durable replay-store interface.
- `receive()` returns `duplicate: false` for an old, otherwise valid rumor when received by a newly constructed chat instance, unless the application independently checks persisted message history.
- `packages/nostr-crypto/src/nip59.ts` checks future timestamp skew but does not reject old wraps by age. This is consistent with randomized NIP-59 timestamps, so durable application-level replay handling is important.

**Impact**
A relay or counterparty can replay a previously valid encrypted chat message after reload, lock/unlock, service recreation or a new chat instance. The new instance may report it as fresh. This can create duplicate chat entries, repeated user notifications or repeated downstream processing if a consumer mistakenly treats `duplicate: false` as durable novelty. Message content is explicitly untrusted and must never be payment, escrow or authorization evidence; this finding does not establish a path to move funds.

**Remediation**
1. Persist accepted rumor IDs (or a collision-resistant monotonic message-history index) per conversation and trade binding.
2. On session creation, hydrate replay state from authenticated persisted history, or make the receive consumer perform an atomic durable dedupe before presenting/processing a message.
3. Do not rely on sender timestamps or relay event IDs alone as the application’s durable replay database.
4. Define behavior at `maxSeenMessages`: fail closed as now, then compact only against durable authenticated history. Never silently evict IDs and treat old messages as new.
5. Add tests: replay in same instance, after close/recreate, after lock/unlock, across two tabs, concurrent duplicate receive, after history restore, and after the seen-set limit is reached.
6. Ensure all downstream handlers are idempotent and never grant transaction authority based on a chat message.

**Classification:** confirmed lifecycle limitation in the library's in-memory dedupe design; severity P2 because chat is discovery/communication only and should not authorize value movement. Whether the current application consumer independently performs durable dedupe was not established in this pass.

## High-value controls inspected

### Vault encryption and commit path
- Vault envelopes bind profile/key/revision through AES-GCM additional authenticated data.
- PBKDF2-HMAC-SHA256 is configured for 600,000 iterations; raw DEK/password copies and plaintext buffers are wiped where owned by the implementation. This is best-effort JavaScript memory hygiene, not a guarantee that engine copies are erased.
- Encryption attempts are counted even when an IndexedDB compare-and-swap loses, reducing the chance of nonce/key usage limits being bypassed through failed commits.
- Per-session commit work is serialized; the service checks the expected revision, reads back the persisted row and uses an IndexedDB readwrite transaction for exact-envelope CAS.
- The IndexedDB store requests strict durability for writes, with a comment explaining why the default durability mode is insufficient for a pre-send transaction marker.
- Cross-tab/versionchange/close invalidation is handled by revoking sessions and aborting in-flight transactions where possible.
- Recovery jobs share a module-level single-flight slot, and the slot remains held while native WebCrypto work actually settles after cancellation.

These are meaningful safeguards. They need cross-browser fault-injection evidence before release.

### NIP-44 / NIP-59 / NIP-01
- NIP-44 authenticates the MAC before decrypting, checks bounds/padding/UTF-8, and wipes derived key material and temporary buffers.
- NIP-59 verifies the outer gift-wrap event before decrypting the seal, verifies the seal before decrypting the rumor, and checks author/recipient binding.
- NIP-01 parsing uses strict own-data-property checks, bounded arrays/strings, canonical event ID recomputation and signature verification.
- NIP-17 binds messages to trade ID, conversation ID and the two configured messaging participants. Its documentation correctly says message content is not delivery, payment or escrow evidence.

Do not loosen these checks for compatibility. Durable replay state remains the new gap above.

### Relay transport
- Relay endpoints are constrained to WSS, URL credentials/fragments/control characters are rejected, and the route broker authorizes/captures the endpoint before socket creation.
- The pool bounds candidates, active sockets, subscriptions, event counts and publication work; socket closure and asynchronous ownership are tracked.
- Incoming events are filter checked and signature verified before delivery. Relay ACK is explicitly not treated as delivery or transaction evidence.
- Verification callbacks are followed by ownership/generation checks to avoid mutating retired subscription state.

The relay remains an untrusted message transport. It must never be treated as a source of transaction truth.

### Escrow settlement
- Funding binds EIP-712 terms to chain ID and contract address, seller identity, buyer, asset, amount, nonce and deadline.
- Seller nonces and trade IDs are single-use.
- Release is seller-only and strictly before deadline; refund is permissionless at/after deadline but pays only the stored seller.
- State is made terminal before payout; reentrancy protection and checks-effects-interactions are present.
- Failed push payouts become fixed-beneficiary deferred credits; withdrawal clears the credit before transfer and reverts atomically if transfer fails.

The previously recorded token-allowlist and off-chain buyer-acceptance trust assumptions remain. This pass did not constitute an independent Solidity audit.

### Build and artifact controls
- The Vite configuration restricts build profiles and keeps runtime release permissions disabled.
- The static build plugin rejects external modules, unreviewed dependencies, test/fixture paths and sensitive wallet execution modules from the core graph.
- Build scanning rejects symlinks, unsafe paths, source maps, private-key markers and several risky HTML/JS patterns, and emits module graphs with hashes.
- The generated content policy is intended to supply CSP meta/header policy; static build evidence explicitly labels itself unsigned and not a release attestation.

These are defense-in-depth checks, not a complete XSS proof, signed provenance chain or guarantee about deployment-host headers. Verify the deployed hosting layer actually serves the generated security headers; do not infer that from a local artifact alone.

## Regression and qualification work recommended

1. Add durable cross-session and cross-tab NIP-17 replay tests; ensure duplicate delivery cannot trigger repeated application side effects.
2. Fault-inject vault writes at every boundary: before encryption, after encryption, during IDB CAS, after transaction complete, during tab close, and after process restart. Confirm the send marker cannot be reported durable before strict commit.
3. Exercise simultaneous unlock/commit/lock/recovery operations across multiple VaultService instances sharing one store.
4. Fuzz NIP-44/NIP-59 event and payload parsers with oversized, malformed, replayed and cross-recipient inputs; preserve uniform integrity failures.
5. Exercise relay broker revocation during DNS/connect/open, socket close races, duplicate frames, invalid signatures, subscription retirement and callback reentrancy.
6. Run escrow invariant tests for failed/reverting recipients, hostile ERC-20 return/revert behavior, reentrancy, forced ETH, timestamp boundaries, duplicate nonce and deferred-withdrawal retry.
7. Verify generated CSP headers on the actual deployment host and test hostile text, URL, SVG, CSS and navigation inputs in every supported browser.
8. Re-run the complete hosted CI/security suite against the exact candidate commit and obtain independent review for crypto and Solidity.

## Limits

Targeted source review only. No runtime verification or live deployment testing was performed. No finding here is a claim that the repository has been penetrated. The audit does not certify cryptographic implementations, browser/OS security, wallet providers, RPC truth, relay availability, token behavior or deployment infrastructure.
