# Peer acceptance and relay interoperability: remaining research

**Review date:** 2026-11-03, America/Vancouver; source retrieval 2026-11-04 UTC.  
**Status:** research and proposed decisions; no protocol approval, runtime changes, relay probing, or test execution.  
**Repository:** `djshellshoxxx/p2p-offramp`; main `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`; inspected unmerged PR26 `94554ecf9854e4604f9f56afe5bebedeee931994`. All repository references below pin that PR26 snapshot. Several implementation files are identical on main; “present” does not mean newly introduced by PR26 or approved for production.

## Decision summary

**Concurrent proposal:** PR #29 now supplies concrete proposed D1 carrier and D4 capability packets. Continue their review using this report's evidence. The [coordination note](CONCURRENT-WORK.md) distinguishes the stronger wallet/channel binding and competing nonempty commitment constructions; neither is approved by this report.

**The next research should freeze a small production acceptance profile, then establish independent interoperability evidence.** Rewriting the existing encryption or exchange state machine is not the first missing step. The repository already distinguishes the old negotiation acknowledgment from wallet acceptance, and its carrier proposal still says `pending-selection`, with no compatible readers/writers or approved next artifact. [R01] [R02] [R13] [R14]

Recommended scope for the first profile: EVM EOA acceptance of existing G16 terms, empty capabilities, an explicitly versioned application payload carried through the existing private transport, and a selected inbox/authentication/discovery contract. Contract wallets and nonempty extensions remain separate qualification tracks. This is a recommendation, not permission to change the current custody ABI.

Two concrete interoperability questions deserve priority alongside the carrier:

- Current NIP-17 routes private messages through recipients’ kind `10050` inbox lists and recommends recipient-authenticated relay access. The inspected relay parser explicitly ignores `AUTH`; encryption support therefore does not establish support for that relay behavior. [S02] [S05] [R05]
- The public-advertisement profile uses kind `30078`. Current NIP-78 describes that kind as private application storage, discourages public cross-application interchange, and recommends serving it only to its authenticated author. This creates a compatibility conflict with public discovery on relays following that recommendation. It does not prove a failure on every relay. [R07] [S09]

## 1. What exists, and what remains unresolved

| Area | Evidence in the inspected snapshot | Remaining research or decision |
|---|---|---|
| Negotiation | Strict version-1 envelope, exact fields and tags, bounded content; `terms-accept` contains only `{revision}`. Exchange reception authenticates the sender and checks counterparty, state, terms hash, revision and time. [R02] [R03] | Select the separate economic acceptance carrier. Do not reinterpret the old acknowledgment as a wallet signature. |
| Wallet acceptance | G16 defines account signatures over the same terms digest. The pending packet describes a private Worker verification bundle, not a peer wire contract. [R01] [R11] | Exact external schema, provider profile, identity interpretation, serialization, bounds, replay/conflict rules, compatibility and recovery evidence. |
| Custody interpretation | The pending packet identifies an unresolved mismatch between G16’s signature-bearing funding description and canonical `BasicEscrow` off-chain consent semantics. [R01] | Owner and contract review must choose the intended model. This report does not propose modifying a deployed ABI. |
| Messaging | NIP-17 helper uses recipient/self gift wraps, authenticates seal/rumor author agreement, checks trade tags, and deduplicates rumor IDs. [R04] | Prove two-client economic-payload interoperability and durable acceptance reconciliation; those are stronger requirements than chat deduplication. |
| Relays | Pool reports per-relay `accepted`, `rejected`, or `unknown`; each publication is explicit with no automatic retry. Read reconnects have bounded backoff. [R06] | Document delivery policy, inbox discovery, AUTH consent, cross-relay reconciliation, retention and outage limits. |
| Extensions | G14 produces module manifests/negotiations; G16 accepts a different capability shape. [R10] [R11] [R12] | Freeze the mapping for nonempty sets. Preserve the already-defined empty core commitment meanwhile. |

Repository governance explicitly says T43 local two-wallet composition is not production peer-profile approval. These gaps should remain open until their selected artifacts and independent evidence exist. [R01]

## 2. Minimal carrier: options and recommendation

### Carrier options

| Option | Advantage | Cost or limitation | Recommendation |
|---|---|---|---|
| New application-envelope version inside the existing kind-14 textual transport | Reuses the current encrypted delivery path and exchange integration. [R02] [R03] | Ordinary chat clients can display serialized text without implementing its economic meaning; kind-14 content is plain text. [S02] | Preferred first qualification candidate for explicitly compatible P2P Offramp clients. |
| Dedicated application rumor kind inside NIP-59 | Separates machine acceptance from conversational chat. NIP-59 supports encapsulation but is not a complete messaging protocol. [S03] | Requires a kind/profile decision and its own routing, compatibility and discovery evidence. | Viable alternative if independent client authors prefer it; do not invent an unreviewed numeric kind. |
| Signatures pasted into ordinary chat or added to old `terms-accept` | Appears easy to transport. | The old exact schema and governance boundary do not authorize that interpretation. [R01] [R02] | Do not use for automatic acceptance. |

**Proposed minimum decision packet:** one versioned discriminator, exact JSON members/types, exact tag schema, maximum decoded and transmitted sizes, canonical integer/hex encodings, unknown-field behavior, supported signature form, and explicit compatibility readers/writers. Retain separate concepts for application envelope version, G16 terms version, and encryption version. A transport representation must not silently replace G16’s existing hash preimages. [R11]

The proposed acceptance record should identify the selected network/deployment, order, revision, terms digest, role, wallet account and signature, with sufficient authenticated context to resolve the already-reviewed terms and private-agreement commitment. Whether it transmits complete terms or references a locally stored immutable terms object must be decided explicitly. Missing referenced terms should yield a recoverable incomplete state, never inferred consent. The final owner-selected schema, not this list, must determine field names and bytes.

**Account and messaging-key binding needs an explicit interpretation.** G16’s EVM type includes the wallet parties, while its acceptance checks role against those accounts; it does not include their Nostr messaging keys. [R11] The minimum candidate can treat authenticated messaging as delivery and derive wallet consent exclusively from the verified G16 signature. Its UI must not claim that delivery proves exclusive wallet ownership by that messaging key. If the product requires that stronger association, commission a separately domain-bound wallet/channel attestation profile covering the relevant keys, role and terms digest. Do not improvise it by changing the G16 digest.

EOA verification is the narrow initial candidate. EIP-1271 contract validation can depend on state, time and authorization, so a future contract-wallet profile must specify chain/block context, verification freshness, signature bounds and failure semantics rather than treating it as ordinary recovery. [S13] EIP-712 provides typed hashing/domain separation but explicitly leaves replay protection to the application. [S12]

### Acceptance, expiry and replay decisions

Proposed logical acceptance identity: selected chain/deployment + order + revision + terms digest + role + wallet account. Use it for idempotent reconciliation independently of randomized transport wrappers. Preserve the exact signed evidence and record a conflict when distinct valid evidence disagrees; do not choose a winner by relay arrival order. Define persistence and bounded retention through restart, history import and device recovery, including what happens when capacity is reached.

Current chat deduplication is an in-memory bounded set of rumor IDs, cleared on close. It is useful but not a durable ledger of economic acceptance. [R04] The existing negotiation path already checks expiry and replay; the new carrier must specify how its own durable identity relates to those checks. [R03]

G16 separates acceptance validity before funding from immutable funded obligations; its deadline and domain fields must remain authoritative. [R11] Randomized seal/wrap timestamps are a privacy mechanism and must not be used as the acceptance deadline or reliable sending time. [S02] [S03] Local clock uncertainty, delayed delivery and an already-funded trade need distinct outcomes. A newly delivered expired offer must not reopen funding; historical evidence may still be displayed as historical evidence.

## 3. G14 → G16: precise outstanding work

G14 negotiates `{id, protocolVersion, capabilities, schemaHashes}` module records, with up to 16 modules and numeric protocol versions. G16 uses up to eight sorted, unique `{id, version, policyHash}` capability entries with bounded textual versions. The shapes and maxima are different; neither specification establishes the missing mapping. [R10] [R11] [R12]

| Mapping candidate | What must be settled | Tradeoff |
|---|---|---|
| One G16 entry per negotiated module | Whether its ID is the module ID; integer-to-version encoding; exactly which manifest and selected-policy fields enter `policyHash`; maximum eight committed modules. | Compact and follows module boundaries, but every effective capability/schema choice must be included in that module’s commitment. |
| One G16 entry per enabled capability | Collision-free module/capability names, version meaning, schema references, and maximum eight total entries. | More explicit granularity, but can exhaust G16 capacity before reaching G14’s allowed manifest size. |
| Empty core set | Keep the existing zero-count G16 commitment and disallow nonempty negotiation for this profile. [R11] | Smallest qualification target; optional policies are deferred explicitly. |

**Recommendation:** qualify the empty core path first. In parallel, prepare a candidate per-module profile for review, not immediate implementation. It must define hash algorithm and domain prefix; exact field order, lengths and byte encodings; sorting and duplicate rules; selected versus merely advertised capabilities; schema-hash encoding; protocol/core-API versions; and the behavior at both cardinality limits. Bind every policy choice that can affect interpretation. A module’s marketing version string is not an adequate policy commitment.

G16 already specifies a salted binary private-agreement preimage and a separate unsalted capabilities preimage. [R11] RFC 8785 is a possible reviewed canonical-JSON alternative for a *new* mapping, with its own number and property-order rules; it is not equivalent to arbitrary `JSON.stringify` or permission to change existing signed bytes. [S14] The decision must choose one canonical construction and publish independently generated golden bytes and hashes.

Required evidence: at least two implementations agreeing on every vector; empty/single/multiple entry cases; reordering equivalence where specified; duplicates; Unicode and invalid encoding rules; version boundaries; altered schema/policy choice producing a different commitment; unsupported required policy refusing pre-funding; and recovery of a funded core trade without extension availability. G14 already requires core exits to remain independent of extensions. [R10]

## 4. Relay and discovery contract

### Inbox, public discovery and provider selection

Use separate decision entries for public ad discovery and private-message delivery. NIP-65’s kind `10002` public read/write relay list and NIP-17’s kind `10050` DM inbox list have different purposes. Do not silently substitute one for the other. [S02] [S06] Qualification must cover absent inbox records, multiple records, relay-list changes and an approved endpoint policy refusing an advertised relay.

The NIP-78 conflict has two defensible research paths: select a dedicated public-ad kind/profile, or restrict a documented compatibility profile to relays explicitly supporting the existing public-ad use. The latter reduces generic interoperability and inherits provider-specific behavior. Any migration must preserve old-reader handling and funded trade lookup; replacing kind numbers opportunistically would conceal a compatibility break. [S09] [R07]

For recipient-protected inboxes, define NIP-42 support and user-visible key disclosure before qualification. AUTH is a relay-session signature, not trade acceptance. Its challenge, relay URL and freshness are scoped to the connection. [S05] The existing parser’s deliberate ignored-AUTH branch is evidence of a remaining integration requirement, not evidence that the entire cryptographic layer is absent. [R05]

NIP-07 makes encryption methods optional, even though public-key retrieval and event signing are its basic methods. Provider selection must therefore record actual NIP-44 capability instead of assuming all extensions support it. [S11] NIP-46 adds remote-signer permission and connection semantics, including unauthenticated display metadata; defer it unless a selected provider requires it. [S15]

### Delivery states and bounded retry

| Proposed user-visible state | What it establishes | What it cannot establish |
|---|---|---|
| Prepared locally | Locally constructed evidence exists. | Relay receipt or counterparty receipt. |
| Accepted by selected relay(s) | The matching NIP-01 `OK` accepted that event at those relays. [S01] [R06] | Counterparty delivery, reading, or trade consent. |
| Received and authenticated | Expected recipient/context and messaging authentication passed. [R03] [R04] | Wallet account consent unless the separate acceptance verification succeeds. |
| Wallet acceptance verified | Selected account accepted exact G16 terms under the selected profile. [R11] | Fiat payment, physical identity, or chain funding. |

An `unknown` publication result needs reconciliation and an explicit retry policy. Reuse the same immutable acceptance identity on redelivery; new wrappers must not create new economic actions. Keep current no-automatic-publication semantics until a reviewed policy deliberately changes them. [R06] NIP-01 `EOSE` marks the end of a relay’s stored response, not proof of global history completeness or recipient acknowledgment. [S01]

NIP-11 advertises capabilities and practical limits, including incoming JSON bytes and content characters; those units differ. Treat announcements as discovery evidence, then qualify the selected relay/version. [S10] Measure the complete nested encrypted event and WebSocket message, not only plaintext. The current application envelope, rumor, encryption and relay-frame limits apply at different layers. [R02] [R04] [R05] [R08] Valid boundary fixtures should establish which payload size is usable end to end; this review did not execute such a test or demonstrate a size failure.

## 5. Privacy and lifecycle claims

NIP-44 explicitly lacks forward secrecy and post-compromise security and identifies residual metadata exposure. Encryption does not make relay operation anonymous. [S04] Gift wrapping hides the inner author from ordinary relay inspection, while routing still exposes recipient-related metadata; authenticated inbox access trades restricted serving for disclosure of an authenticated key to that relay. [S03] [S05] Document these tradeoffs in the selected threat model.

Expiry and deletion are separate from erasure. NIP-40 permits relays to retain expired events; NIP-09 cannot guarantee deletion of copies across relays or clients. [S07] [S08] Disappearing-message UI must not claim cryptographic forward secrecy or reliable deletion of counterparty evidence. Recovery retention should be selected deliberately, with private payment instructions excluded from routine diagnostics.

The repository intentionally implements the original bounded NIP-44 v2 plaintext profile, not the later extended-length variant, and its vector provenance explains that choice. [R08] [R09] [S04] Keep that explicit limit while obtaining compatibility evidence. Official vectors support algorithm compatibility, not certification of the surrounding application, provider lifecycle or source licensing. The provenance document separately leaves its named license review pending. [R09]

## 6. Research completion and safe acceptance matrix

| Priority / packet | Evidence still needed | Safe qualification outcome |
|---|---|---|
| P0 — carrier freeze | Reviewed version/tag/schema document, EOA signature profile, account/channel interpretation, exact error taxonomy, immutable decision artifact and two independent implementers. | Compatible clients exchange identical reviewed terms and independently verify both account acceptances; old acknowledgment remains communication-only. |
| P0 — discovery/inbox contract | Decision on kind `30078`, kind `10050` routing, AUTH support/consent, approved endpoints and relay/version compatibility. | Local controlled relays demonstrate both selected discovery and recipient delivery behavior; unsupported behavior is explicit. |
| P0 — delivery reconciliation | ACK loss, rejection, disconnect, duplicate wrapper/rumor, out-of-order delivery, restart and expiry fixtures using synthetic agreements. | No relay outcome becomes consent; duplicate acceptance is idempotent; missing evidence remains incomplete; conflicts are visible. |
| P1 — size/provider envelope | Complete legal-message size accounting, provider encryption/signing capability matrix, rejection at approved bounds. | Both clients agree on the largest supported legal payload and fail predictably above it without retaining private diagnostics. |
| P1 — G14 commitment | Owner-selected mapping, canonical preimages, independent vectors, cardinality/ordering and recovery cases. | Empty core is stable; nonempty profile stays unavailable until equivalent independent digests and core recovery are demonstrated. |
| Later — contract/remote wallets | Separate EIP-1271 freshness profile or NIP-46 provider lifecycle evidence when selected. [S13] [S15] | Unsupported providers are rejected explicitly instead of inheriting EOA or local-signer assumptions. |

For each completed packet, retain exact source commits, selected protocol revisions, fixture hashes, independent implementation identities, commands/results, unresolved disagreements and named reviewers. Update the existing proposed governance records only through the repository’s decision workflow. This report supplies research inputs; it does not fill absent reviewer identities or claim production approval. [R13] [R14]

## Sources and traceability

### External primary sources — 15 opened and inspected

All NIPs below were read at `nostr-protocol/nips@400d157c53264b8e58c7b3cdbd21ef546fb7a157` (commit authored 2026-10-27). These are evolving optional/draft profiles where marked, not proof that a particular relay implements them. EIPs and RFC were opened at their official publishers on the retrieval date.

| ID | Primary source | Use and evidence limit |
|---|---|---|
| [S01] | NIP-01 — Basic protocol flow | Event/ACK/subscription semantics; no delivery SLA. |
| [S02] | NIP-17 — Private Direct Messages | Inbox routing, message structure and timestamps; no app-specific economic protocol. |
| [S03] | NIP-59 — Gift Wrap | Encapsulation and author authentication; not a full messaging system. |
| [S04] | NIP-44 — Encrypted Payloads | Versions, bounds and cryptographic limits; not an audit of this repository. |
| [S05] | NIP-42 — Client authentication to relays | Session AUTH and access behavior; does not prove relay support. |
| [S06] | NIP-65 — Relay List Metadata | Public read/write relay lists; separate from DM inbox choice. |
| [S07] | NIP-40 — Expiration Timestamp | Recommended handling, not erasure assurance. |
| [S08] | NIP-09 — Event Deletion Request | Best-effort deletion semantics; cannot recover every copy. |
| [S09] | NIP-78 — Arbitrary custom app data | Current owner-private guidance for kind 30078; actual relay behavior varies. |
| [S10] | NIP-11 — Relay Information Document | Capability/limit advertisements; not certification. |
| [S11] | NIP-07 — Browser signing extension | Optional encryption capabilities; no individual provider qualification. |
| [S12] | EIP-712 — Typed structured data hashing and signing | Signature/domain definition; expressly excludes replay protection. |
| [S13] | ERC-1271 — Contract signature validation | State/context-dependent validation; not this app’s support policy. |
| [S14] | RFC 8785 — JSON Canonicalization Scheme | Alternative canonicalization rules; not an adopted G14 mapping. |
| [S15] | NIP-46 — Nostr Remote Signing | Optional future signer boundary; not required for minimal core. |

### Repository evidence anchors

| ID | Pinned file / inspected symbol or section |
|---|---|
| [R01] | `docs/governance/PENDING-DECISIONS.md` — ABI and production peer-carrier decisions |
| [R02] | `packages/exchange/src/messages.ts` — envelope schema, `terms-accept`, size/time constants |
| [R03] | `packages/exchange/src/exchange.ts` — `accept`, receive validation and replay/state handling |
| [R04] | `packages/nostr-crypto/src/nip17.ts` — trade-chat wrapping, binding tags and `seen` lifecycle |
| [R05] | `packages/relay/src/nip01.ts` — `parseRelayFrame`, ignored `AUTH`, frame limits |
| [R06] | `packages/relay/src/pool.ts` — `PublishResult`, `publishOne`, retry/backoff |
| [R07] | `packages/relay/src/ad.ts` — `AD_KIND`, public `PublicAdV1`, discovery-only authority |
| [R08] | `packages/nostr-crypto/src/nip44.ts` — original v2 size profile |
| [R09] | `packages/nostr-crypto/test/fixtures/NIP44-VECTORS-PROVENANCE.md` — pinned vectors and license-review limitation |
| [R10] | G14 `spec-optional-module-interface.md` — manifest/negotiation shape and core-exit requirements |
| [R11] | G16 `spec-signed-trade-terms.md` — exact commitment and acceptance rules |
| [R12] | `packages/extensions/src/registry.ts` — implemented manifest/negotiation shape |
| [R13] | `docs/governance/peer-acceptance-carrier.proposal.json` — draft, pending version, empty compatibility evidence |
| [R14] | `docs/governance/peer-acceptance-carrier.decision.json` — proposed, missing reviewers and next artifact |

[S01]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/01.md
[S02]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/17.md
[S03]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/59.md
[S04]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/44.md
[S05]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/42.md
[S06]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/65.md
[S07]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/40.md
[S08]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/09.md
[S09]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/78.md
[S10]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/11.md
[S11]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/07.md
[S12]: https://eips.ethereum.org/EIPS/eip-712
[S13]: https://eips.ethereum.org/EIPS/eip-1271
[S14]: https://www.rfc-editor.org/rfc/rfc8785
[S15]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/46.md
[R01]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/PENDING-DECISIONS.md
[R02]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/exchange/src/messages.ts
[R03]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/exchange/src/exchange.ts
[R04]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/nostr-crypto/src/nip17.ts
[R05]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/relay/src/nip01.ts
[R06]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/relay/src/pool.ts
[R07]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/relay/src/ad.ts
[R08]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/nostr-crypto/src/nip44.ts
[R09]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/nostr-crypto/test/fixtures/NIP44-VECTORS-PROVENANCE.md
[R10]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.6_extension_contract/spec-optional-module-interface.md
[R11]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.8_trade_coordination/module_1.8.1_trade_terms/spec-signed-trade-terms.md
[R12]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/extensions/src/registry.ts
[R13]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/peer-acceptance-carrier.proposal.json
[R14]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/peer-acceptance-carrier.decision.json
