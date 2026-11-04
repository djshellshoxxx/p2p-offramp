# Messaging, identity and recovery: additional security research

## Snapshot and status

Research date: **2026-11-03, America/Vancouver**.

This addendum reviews PR #26 candidate `94554ecf9854e4604f9f56afe5bebedeee931994`, with main `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa` as the integration baseline. The 653 original files in the selected source snapshot were verified against the candidate; this is not a complete repository checkout. Nostr specifications are pinned separately to upstream `400d157c53264b8e58c7b3cdbd21ef546fb7a157`.

The findings below are **research conclusions and qualification requirements**, not reproduced vulnerabilities. No implementation, browser execution, relay connection, wallet action or fresh test run was performed. The earlier [crypto/storage audit][audit-crypto] and [transport/messaging audit][audit-transport] remain the record of their completed fixes and historical tests. Parallel browser/lifecycle repairs and release qualification are outside this note.

Priority **P1** means resolve before activating the affected production capability; **P2** means resolve before expanding the relevant compatibility or privacy claim. Confidence distinguishes directly inspected source/specification facts from architectural inference.

## Existing controls retained

The candidate already verifies gift-wrap and seal signatures, authenticates ciphertext before accepting plaintext, binds the rumor author to the seal author, checks the recipient, rejects legacy-encryption fallback, and limits message sizes. Durable chat reauthenticates stored native proofs and deduplicates authenticated messages. Vaults use authenticated encryption, strict schemas, purpose-bound associated data and revision-aware writes. Restore authenticates the source and complete destination before adding a fresh vault profile. These controls should remain intact. [Source: NIP-59 implementation][impl59], [durable chat contract][chat], [vault crypto][vault], [backup service][backup].

The additional work concerns how those controls compose with current protocol requirements, copied identities and browser guarantees.

## 1. Select a complete recipient inbox profile

**P1 · High confidence in the source/specification difference; interoperability remains unperformed.**

Current [NIP-17][nip17] requires publishing gift wraps only to the recipient's advertised kind `10050` inbox relays; an absent list means the recipient is not ready to receive. It recommends that relays restrict access to the recipient through [NIP-42][nip42]. The candidate's `packages/relay/src/nip01.ts` explicitly ignores `AUTH`; the canonical pool accepts constructor-configured endpoints. No kind-10050 inbox discovery implementation was identified in the selected application/package snapshot. This is an intentionally incomplete production profile, not evidence that signed messages or encryption are broken. [Parser][parser], [pool][pool].

**New conclusion:** approving the peer-message carrier alone cannot establish current NIP-17 inbox interoperability. Recipient discovery, relay authentication, permitted endpoints and privacy mode must be decided together. A relay requiring AUTH can be unavailable to this client while a permissive relay can expose more inbox metadata. Successful message decryption establishes neither recipient-only relay storage nor anonymous access.

NIP-59 leaves a recipient `p` tag on the outer wrap. Its ephemeral author and randomized timestamps do not remove connection metadata or make a chosen relay unable to associate an authenticated client with an inbox. NIP-42 authentication is a separate disclosure and authorization decision. [NIP-59][nip59], [NIP-42][nip42].

**Acceptance conditions:** record a decision table covering a valid, absent or unusable recipient list; AUTH-required and permissive relays; ordinary and strict modes; and connection loss. Preserve refusal when approved transport coverage is unavailable. If AUTH is adopted, expose only the reviewed relay-authentication operation, bound to the exact approved relay, current connection challenge, identity session and consent policy. Do not introduce a general signing interface. Qualify the selected profile using two independently implemented clients and controlled compatible relay fixtures, recording versions and expected outcomes before any production readiness claim.

**Integration:** `packages/relay/src/nip01.ts`, `packages/relay/src/pool.ts`, `packages/identity/src/identity-service.ts`, `packages/privacy-policy/src/plan.ts`, and `packages/exchange/src/exchange.ts`. The optional [privacy-policy contract][privacy] already prevents imported policy documents from selecting endpoints or granting runtime authority.

## 2. Keep authentication meanings separate in carrier research

**P1 · High confidence; production carrier remains an existing governance decision.**

The [pending carrier decision][decisions] already identifies revision-only `terms-accept` as communication, and already requires a separately reviewed signature/domain/account-binding profile. This note does not reopen that completed analysis.

**Additional conclusion:** future evidence should explicitly distinguish three identities: the relay-authenticated connection identity; the NIP-59 seal author; and the wallet authorized by the economic agreement. NIP-42 kind `22242` authenticates a relay session. A verified seal identifies the messaging author. Neither observation itself proves the economic wallet's consent. Relay `OK` is an acceptance response from that relay, not peer delivery or agreement validation. [NIP-42][nip42], [NIP-59][nip59], [NIP-01][nip01], [exchange message profile][exchange-messages].

**Acceptance conditions:** the carrier review must specify which trusted component binds these identities and what survives a new relay connection, application restart or restored identity. Evidence should show that transport authentication and publication status alone cannot promote agreement state; that the exact reviewed agreement is what the peer accepts; and that duplicate/conflicting carriers have the same semantics across both independent clients. Include restored-session cases in the interoperability plan. These are qualification requirements; no such cross-client exercise was performed here.

**Integration:** `packages/exchange/src/messages.ts`, `packages/exchange/src/machine.ts`, `packages/exchange/test/exchange.test.mjs`, and the existing governance decision. Coordinate wallet-specific criteria with the settlement research instead of embedding wallet authority in arbitrary text messages.

## 3. Define recovery's key-compromise contract

**P1 · High confidence in documented guarantees; compromise scenarios are architectural reasoning.**

[NIP-44][nip44] expressly lacks forward secrecy and post-compromise security. Generating and wiping a fresh outer NIP-59 wrapper key does not change the security properties of the long term messaging keys used by the inner seal. A recovery workflow therefore needs a messaging-key lifecycle statement in addition to a fresh vault-encryption-key statement.

The candidate is explicit: `adoptRestored` changes profile binding under authenticated destination revision control while preserving the identity key material, public key and retired status. It does not unlock the identity; unlock is separate. The source remains untouched, and adoption is not wired into the browser Worker/UI. Durable chat needs the original messaging key to read retained proof/history. [Identity contract][identity], [chat contract][chat].

**New conclusion:** a successful restore or changed vault passphrase cannot be presented as recovery from messaging-key compromise. Restored and source copies can still represent the same network identity. Likewise, retiring one local record does not establish revocation of copies elsewhere. This is a consequence of the current recovery contract, not a newly discovered bypass.

**Acceptance conditions:** user-facing recovery status must distinguish authenticated backup, fresh vault wrapping key, preserved messaging identity, and any separately completed identity rotation. Before offering rotation, decide peer re-verification, active-trade continuity, old-history access and retained-copy behavior. Record what previous messages remain exposed following long term key compromise; do not claim remote erasure or forward secrecy. A genuine rotation design needs its own reviewed protocol and evidence rather than an automatic consequence of import.

**Integration:** `packages/storage/src/backup-service.ts`, `packages/identity/src/identity-service.ts`, `packages/identity/README.md`, and `packages/messaging/README.md`. Preserve recovery export and authenticated history access while a future rotation design is unresolved.

## 4. Separate authenticated state from global freshness and browser isolation

**P1 for recovery claims · High confidence in local controls; medium confidence in whole-device rollback inference.**

`backup-service.ts` labels ciphertext export `authentication: 'not-checked'`; a checksum alone is not authentication. Restore authenticates both source contents and destination. `idb-vault-store.ts` compares the expected current revision and requires the next revision, while cryptographic associated data binds snapshot revision, profile and key identity. These are meaningful local integrity and concurrency controls. [Backup][backup], [store][store], [vault][vault].

**Inference:** those local facts do not supply an independent witness that an entire restored origin/device image is the newest history. If all local state is restored together, local counters alone cannot establish freshness relative to a later state no longer present. No remote trusted monotonic witness was established by this review. This is a scope qualification, not a demonstrated replay route or a recommendation to add a tracking service.

**Acceptance conditions:** define “verified backup” as the exact authenticated artifact/revision checked, with global freshness unknown unless separately established. Any stronger rollback-detection design must state its trust, availability and privacy costs. Keep restore status independent of trading authority and require existing reconciliation before later economic action.

The browser boundary also needs precise language. Nonextractable WebCrypto keys restrict API export; the W3C specification does not guarantee hardware isolation, zeroization, or protection from other code running with the browser's privileges. The application itself handles decrypted plaintext. The project's byte-copy wiping and handle disposal are useful, and its chat documentation already excludes physical erasure of JavaScript strings/provider internals. [W3C Web Cryptography, security considerations][webcrypto], [vault][vault], [chat][chat].

**Acceptance conditions:** document the trusted application origin and authenticated code-delivery assumptions; avoid “hardware protected” or “securely erased” claims. Measure the fixed 600,000-iteration PBKDF2 profile and bounded recovery work on supported browsers/devices before defining unlock/recovery budgets. Keep KDF wire changes subject to migration review. Integration belongs in vault/identity recovery documentation and the release team's browser qualification evidence; it does not require duplicating the parallel listener repairs.

## 5. Publish the bounded interoperability profile

**P2 · High confidence; external-client compatibility is unverified.**

The repository already records that its original NIP-44 v2 profile accepts 1–65,535 plaintext bytes and rejects the later extended-length encoding. Current NIP-44 describes the extended prefix and recommends practical implementation limits. Maintaining the current smaller cap is a valid resource decision; raising it is not a research recommendation. [Implementation][impl44], [vector provenance][vectors], [current NIP-44][nip44].

**New conclusion:** original-vector conformance and “NIP-44 v2” alone do not identify the complete application interoperability contract. The application also has smaller JSON/body limits, escaping overhead, a strict gift-wrap recipient-tag shape, and trade/conversation tag requirements. The candidate requires the recipient `p` tag to have exactly two elements, whereas the NIP-17 example permits a relay hint. A deliberately narrower profile should say so. [NIP-59 implementation][impl59], [NIP-17][nip17], [chat][chat].

**Acceptance conditions:** publish one versioned profile identifying supported plaintext sizes, nested-envelope budgets, tag forms, timestamp treatment, message schema and unsupported extensions. Preserve the pinned original-vector checksum and provenance. Add independent profile-level interoperability evidence covering ordinary Unicode, JSON escaping, boundary lengths, supported tag variants and restart/restore semantics. Specify intentional refusals as well as successful exchanges. Do not label untested generic Nostr clients compatible.

**Integration:** `packages/nostr-crypto/test/fixtures/NIP44-VECTORS-PROVENANCE.md`, `packages/nostr-crypto/test/nip44.test.mjs`, `packages/nostr-crypto/test/nip59.test.mjs`, `packages/messaging/src/envelope.ts`, and the carrier specification. The [first-party original vector set][official-vectors] remains the appropriate primitive baseline, with the independent application-profile evidence kept separate.

## 6. Qualify resource and metadata claims at the actual transport boundary

**P2 · High confidence in API limitation; device impact unmeasured.**

The canonical pool already states that native WebSocket assembles a message before the application frame cap runs. Its bounds constrain parsing/cryptography and admitted work. MDN documents the API's lack of backpressure. These facts do not establish a fixed upper bound on native browser memory. [Pool][pool], [MDN WebSocket][websocket].

**Additional acceptance condition:** browser qualification should record supported devices, observed memory/responsiveness, cancellation and recovery behavior with bounded controlled fixtures. Label parser/frame budgets separately from native buffering. Keep privacy observations separate again: encrypted content, recipient tags, connection identity and public advertisement metadata have different visibility. A relay ACK, configured strict policy, or passing primitive vectors cannot establish anonymity or recipient-exclusive retrieval.

This requirement belongs with `packages/relay/src/pool.ts` and release/browser evidence. No relay probing, load generation or browser resource experiment was performed in this review.

## Handoff

The first implementation prerequisite is the reviewed inbox/authentication profile. Recovery claims can be clarified immediately from the existing contract. Compatibility and browser evidence should be attached to exact source and profile revisions. These notes authorize no provider activation or trading enablement; the current fail-closed policy and unresolved carrier decision remain in force.

## Sources

Primary protocol sources: [NIP-01][nip01], [NIP-17][nip17], [NIP-42][nip42], [NIP-44][nip44] and [NIP-59][nip59]. Browser guarantees: [W3C Web Cryptography][webcrypto] and [MDN WebSocket][websocket]. Primitive baseline: [official original NIP-44 vectors][official-vectors]. Repository citations throughout identify the immutable candidate.

[audit-crypto]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/audit-2026-11-02/crypto-storage.md
[audit-transport]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/audit-2026-11-02/transport-messaging.md
[nip01]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/01.md
[nip17]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/17.md
[nip42]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/42.md
[nip44]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/44.md
[nip59]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/59.md
[webcrypto]: https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/#security-considerations
[websocket]: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
[official-vectors]: https://github.com/paulmillr/nip44/blob/671a1f04bcfacaf125b0db68adc45bc9ce0e763b/nip44.vectors.json
[impl44]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/nostr-crypto/src/nip44.ts
[impl59]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/nostr-crypto/src/nip59.ts
[parser]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/relay/src/nip01.ts
[pool]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/relay/src/pool.ts
[privacy]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/privacy-policy/README.md
[decisions]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/PENDING-DECISIONS.md
[exchange-messages]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/exchange/src/messages.ts
[identity]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/identity/README.md
[chat]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/messaging/README.md
[vault]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/storage/src/vault-crypto.ts
[backup]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/storage/src/backup-service.ts
[store]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/storage/src/idb-vault-store.ts
[vectors]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/nostr-crypto/test/fixtures/NIP44-VECTORS-PROVENANCE.md
