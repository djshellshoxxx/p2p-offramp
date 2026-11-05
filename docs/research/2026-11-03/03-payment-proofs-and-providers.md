# Payment proofs and provider selection: decisions still required

**Research batch:** 2026-11-03, America/Vancouver. **Sources retrieved:** 2026-11-04 UTC. **Disposition:** research complete for the comparison below; provider selection and qualification remain open. No implementation, deployment, credential collection, live payment, paid provider job or exploit reproduction was performed.

## 1. Decision and existing work

**Keep payment evidence optional and advisory. Reuse the existing proof structures and job lifecycle. The next useful work is a source-specific qualification packet, followed by bounded experiments on the exact chosen artifacts.** No candidate is qualified by this review.

This assessment inspects **unmerged PR26 at `94554ecf9854e4604f9f56afe5bebedeee931994`**. Main remains a separate baseline at `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`; PR26 findings must not be described as shipped main behavior. The reviewed ledger records the following distinctions. [PP-R02]

| Existing evidence | What is already present | Remaining decision |
|---|---|---|
| `P-PROOF-PROFILE` | Locally evaluated contract and TLSNotary alpha.15 snapshot | Exact source/rail, provider mode, artifacts, trust policy and review disposition |
| `P-PROOF-JOBS` | Provider-independent bounded lifecycle | Measured feasibility of a real candidate within those bounds |
| `P-PROOF-IMPLEMENTATION` | Explicit exact-contract/tooling remainder | Actual selected proof production, verification and advisory integration |
| `proof-inputs` | Detached, explicitly **unverified** structural parsers; empty catalogs | Authenticated source bytes and a semantic receipt parser |
| `proof-jobs` public boundary | Empty provider list; `UNSUPPORTED_PROVIDER` | No registration or private witness intake is authorized by this research |

These facts are supported by the profile, package contract and actual refusal implementation, not just a roadmap. Another generic parser or Worker wrapper would duplicate completed work. The structural package also documents narrower comparison coverage: source-record shapes do not establish port/path or authenticated freshness, and the draft statement does not contain the request’s `disclosureHash`. A later adapter must resolve how the selected proof binds every required context field; it must not silently invent authenticated fields. [PP-R01] [PP-R03] [PP-R04]

### What this research adds

The existing TLSNotary evaluation remains useful. New decision evidence is the **vlayer v1/v2 maintenance and audit discontinuity**, **Reclaim’s distinction between client/attestor and managed TEE execution**, and **Vouch’s explicit evidence-mode and trusted-key rules**. These affect procurement and verification design; they do not justify enabling an optional module. [PP11] [PP12] [PP16] [PP19]

## 2. The claim must be narrower than “payment verified”

TLS supplies an authenticated, confidential channel with integrity. Protocols such as DECO extend this into statements about data obtained from a particular source. Neither property supplies the business meaning of “posted,” beneficiary identity, future reversibility or payment protection. These are distinct assertions requiring their own evidence. The DECO paper is protocol background, not a current implementation audit. [PP17] [PP18]

For this repository, the decision chain should remain:

1. Authenticate the selected server and exact response bytes under a pinned verifier/trust policy.
2. Parse a specified receipt representation, preserving the provenance of every amount, status, account and time field.
3. Bind it to the exact trade, deployment, terms, source policy and challenge.
4. Apply a defined freshness rule and display the limited advisory statement.

The existing `ReceiptStatementV1` and settlement policy already require these distinctions. An authentic observation of a posted transfer can later be contradicted by an authentic reversal. A valid proof must neither release escrow nor change the seller’s refund rights. A sender’s debit and a beneficiary’s credit are also different candidate statements; select which source actually establishes the claim required for this trade. [PP-R05] [PP-R06]

## 3. Candidate comparison

| Candidate and evaluated evidence | Architecture and trust that must be accepted | Browser and operational fit | Decision |
|---|---|---|---|
| **TLSNotary**, existing alpha.15 pin `47aee45b…` | Direct verifier participation or a delegated notary signing transcript commitments. Later recipients must trust the chosen notary and application verifier. [PP04] [PP05] | Rust/WASM plus an extension route. Current extension documentation describes Chromium request interception and a WebSocket/TCP bridge. Exact core/extension versions need correspondence. [PP02] [PP06] | **First candidate for a narrowly scoped comparison experiment**, because the repo has already evaluated its boundary. This is a reuse recommendation, not approval. |
| **Reclaim attestor-core**, `dd43dc882…` | Client runs TLS through an attestor; selective transcript disclosure and ZK support attestor-signed claims. Provider logic supplies request and receipt conditions. Managed TEE execution adds a different hardware/build/attestation chain. [PP07] [PP08] [PP09] [PP11] | Upstream describes browser/Node compatibility. Exact app SDK, artifacts and mobile path remain unresolved. Core’s linked browser-RPC guide returned 404 in this review. [PP07] | **Retain as an alternative** if it can produce the same receipt statement with an independently specified signer policy and acceptable credential handling. |
| **vlayer v1**, `25197319…` | Historical zkVM stack using TLSNotary transcripts and privileged key/image registries. [PP14] | Repository README declares v1 no longer maintained. [PP12] | **Do not make it the default new integration target.** Reconsider only with an explicit maintenance and licensing case. |
| **Current vlayer/Vouch** | Hosted result workflow with a separately verifiable presentation route; trusted notary identity remains an independent requirement. Product distinguishes web proofs and video. [PP15] [PP16] [PP19] | Documented integration expects a webhook and API credentials. Fit with the repository’s intended application architecture has not been established. [PP16] | **Separate new candidate**, not a continuation automatically covered by v1’s audit or source license. |

### TLSNotary: useful starting point, incomplete qualification

The evaluated commit’s README expressly warns against production use and licenses crates under MIT or Apache-2.0. Its WASM README identifies `wasm-pack` 0.14.0+ and extension consumption. The current FAQ consistently states TLS1.2 support, but contains conflicting TLS1.3 planning language: one answer calls it roadmap work, while another says there are no immediate plans. No TLS1.3 delivery date or support claim is established. A source requiring an unsupported protocol can be ruled out before expensive integration; the actual protocol support must be checked against the frozen artifact. [PP01] [PP02] [PP03]

The separate historical browser package **`tlsn-js` is deprecated** at inspected upstream `ff6b14a7777fbc28639dbbaa0f1f76d35c584db8`: its README says maintenance/npm updates have ended and directs browser work to `tlsn-extension`. This confirms the maintenance lead in the concurrent security research. The candidate above means a coherent core/extension/transport evaluation, not adoption of that deprecated package; the successor still needs independent version, artifact and deployment-model qualification. [PP22]

Choose **MPC versus proxy protocol mode**, **direct verification versus delegated notarization**, and **who operates the transport bridge** separately. A WebSocket-to-TCP bridge is not itself the protocol’s proxy mode. Protocol confidentiality claims do not erase hostname or traffic metadata visible to a co-located bridge operator. Browser authentication interception is a privileged boundary: verify extension permissions, plugin isolation, session scope and data export against the exact selected build. [PP03] [PP04] [PP06]

No independent assessment covering the exact alpha.15 build, extension and proposed receipt parser was established here. That is an evidence gap, not a claim that no TLSNotary assessment exists.

### Reclaim: bind the application statement, not just a generic claim

Pinned claim documentation describes an identifier over provider, parameters and context, with owner, timestamp and epoch included in signing. It documents a ten-minute timestamp allowance. The repository’s 300-second current-status policy therefore needs its own enforcement and an explicit relationship between claim time and authenticated source observation time. An attestor’s accepted timestamp is not automatically the bank’s transaction timestamp. [PP08] [PP-R05] [PP-R06]

The provider interface permits selectors and generic response matching. These are capabilities, not evidence that a “contains posted” condition or regex accurately represents a bank transfer. Qualification requires exact field locations, normalized money/time rules and a mapping of source statuses to the repository’s enum. [PP09]

Current security pages describe server-side Node work in TEEs, with hardware attestation and build-chain assumptions. These remain vendor claims here: no current deployment attestation or reproducible measurement was verified. Their AI scan summary does not replace an independent assessment; an IACR ePrint listing alone does not establish peer review. The historical Zellic scope was identifiable in an auditor search excerpt, but the full page returned 403, so no current remediation or commit coverage is claimed. [PP11] [PP-X01]

The inspected core license is AGPLv3. Assess the exact SDK, dependencies, circuits, distribution and service arrangement before adoption; do not generalize this license to every Reclaim artifact. [PP10]

### vlayer: preserve version and evidence-type distinctions

The pinned README declares the repository’s v1 code no longer maintained and directs users to rebuilt v2. Its GitHub API archival flag was false; the concrete finding is the maintainer’s README declaration. The inspected v1 license is BSL1.1, with no Additional Use Grant and a version-specific three-year change to MIT. Neither old audit coverage nor old licensing establishes v2’s position. [PP12] [PP13]

Veridise’s May 2025 report identifies the assessed commit as `a763614`, with fieldwork in February–March 2025. It describes v1’s zkVM and trusted notary/key registries. Its trust model assumes privileged roles behave as intended. Obtain an artifact-to-assessment and remediation mapping for whichever current product is proposed. [PP14]

Vouch’s webhook authenticates delivery from a service; the documented `verificationMethod` distinguishes `web-proof` from `video`. This repo should admit only its explicitly selected evidence type and independently validate receipt outputs. A screen recording reviewed by AI must never inherit a cryptographic receipt label. [PP15] [PP16]

The current notary policy checks the matching fingerprint and `validFrom <= tlsTimestamp < validUntil`, with `validUntil: null` meaning no upper bound; overlapping and retired keys can remain relevant. Metadata URLs are not trust inputs, and expired key-list caches require refresh. Separate historical signature validity from application freshness: an old valid signature is still too old for a current-status assertion. [PP16] [PP19] [PP-R06]

## 4. Exact qualification packet to complete before implementation

The following is a **proposed evidence checklist**, reusing existing contracts. Acceptance requires a concrete entry for every applicable row; “vendor supports banking” is insufficient.

| Decision packet | Required artifact and acceptance condition |
|---|---|
| **Receipt source** | One named bank/payment service, jurisdiction and rail; exact HTTPS origin/port/path, method and response format; sender/beneficiary perspective; authenticated amount, currency, beneficiary, reference, status and time fields. Include source-owner definitions of statuses and reversal cases. |
| **Statement coverage** | Map every `ReceiptStatementV1` field to authenticated bytes, verifier-derived data or separately trusted local context. Identify where trade/deployment/terms/challenge and disclosure policy enter the signed or proven statement. Missing authenticated fields mean unsupported, not guessed. |
| **Freshness** | Define transaction time, source observation time and attestor/session time separately; trustworthy clock source and skew; challenge lifecycle; expiration and duplicate receipt policy. Explain how a fresh proof of an old transaction is classified. |
| **Artifacts** | Exact provider mode and package/source commits; dependency/toolchain locks; WASM/circuit/proving/verifying parameters and hashes; statement/public-input ordering; byte encodings and commitment domains; build provenance. |
| **Verifier authority** | Exact signer set or threshold, root certificates and validation policy; key lifecycle, compromise and revocation policy; endpoint and transport owners. If an on-chain verifier is proposed later, supply chain/address/code hash, upgrade authority and registry/image/key pins. Do not add one merely for this advisory feature. |
| **Privacy and session handling** | Credential and cookie path; process/extension/worker boundaries; consent and redaction policy; all network recipients and retained fields; logging/crash telemetry; account switching, cancellation and session teardown. Include residual metadata and outsourced-prover exposure. |
| **Audit applicability** | Auditor, report, assessed commit, excluded dependencies, remediation commits and exact remaining deployment delta. Separately review the receipt parser, source policy and app integration. |
| **Feasibility and license** | Reproducible device/browser matrix and resource measurements; versions and network conditions; source availability and operational costs; artifact-specific licensing assessment. No provider account, key or paid work is authorized by this note. |

The existing profile’s limits—one job, 120-second deadline, 15-second heartbeat, 1MiB witness, 2MiB proof, 256MiB WASM maximum and 8MiB cumulative network—are **local constraints**, not measured provider performance. Record CPU, peak memory, proof bytes, network, success/failure and cancellation behavior against them; justify any proposed contract change separately. [PP-R01]

## 5. Bounded acceptance experiments

These are proposed **non-exploit acceptance tests** using synthetic receipts and controlled public fixtures. They are not reported as executed. Existing parser/lifecycle cases should be referenced, not rewritten; add only tests of the selected provider/receipt boundary.

| Test | Expected decision/evidence |
|---|---|
| Correct supported receipt | Independently verify source proof and exact semantic statement; produce advisory status only. |
| Wrong trade/deployment/terms/challenge | Refuse contextual mismatch despite an otherwise valid proof. |
| Old receipt, fresh proof; old proof, fresh local clock | Distinguish receipt time from observation time; reject stale current-status claims and challenge reuse. |
| Wrong currency/scale, amount, recipient or reference; partial payment | Exact bounded parsing and comparison; no floats, fuzzy recipient equivalence, implicit FX or summing multiple transfers. |
| Pending/unknown/reversed; later authenticated reversal | Never promote an unsupported status to posted; record contradiction without implying the earlier cryptography failed. |
| Required field redacted, ambiguous or outside authenticated bytes | Refuse missing semantics; distinguish structural parse success from verified provenance. |
| Supported-origin redirect, changed source layout or locale | Apply the frozen source/parser policy; ambiguous changes require requalification. |
| Unknown/retired signer, stale trust list, changed artifact | Evaluate exact signer/time/artifact rules; no silent latest-key or latest-package fallback. |
| Account switch, cancel, timeout, background tab, disconnect | Stop owned work and refuse stale results; observe declared resource bounds and session separation. |
| Data-flow observation with synthetic secrets | Verify permitted recipients and absence from logs, analytics, callbacks and crash reports; document unavoidable metadata. |
| Provider unavailable or unsupported browser | Explicit unavailable result; preserve ordinary manual-trade and recovery paths. |
| Evidence-mode or integration mismatch | Reject video/nonselected evidence; no verifier result obtains wallet authority, changes escrow state or blocks refund recovery. |

The test oracle should include an independently specified expected receipt statement and verifier result, not merely the same SDK parsing its own output. Performance success on desktop does not establish mobile success. Login challenges, browser permissions and unavailable bank responses need separate measured outcomes.

## 6. Arbitration implications and selective-chat proof remainder

The arbitration package already contains bounded diagnostic calculations with `economicAuthority:false`. Its decisions file keeps evidence-root encoding and native certificate/custody interfaces unresolved. Repeating those reference calculations would not close the gap. [PP-R07] [PP-R08]

A future evidence profile must distinguish authenticated content, its receipt interpretation, an opposing observation, and a party’s assertion. Define evidence admissibility, private disclosure access, reproducible verification, collection time, source-policy version and contradiction handling. A commitment can bind submitted bytes without proving their source, completeness or interpretation. Freeze a manifest’s exact encoding before claiming reproducible evidence roots. [PP-R08]

Automatic settlement or tribunal-controlled release remains deferred to separately negotiated custody and reversal policy. Payment proof cannot retrospectively change an existing trade’s refund authority. This report selects no arbiter, rail finality rule, certificate ABI or automatic outcome. [PP-R06] [PP-R08]

### `L-ARB-ZK-PROFILE`: bounded conclusion, still open

The ledger expressly leaves the circuit/provider/setup/verifier and Nostr signature/hash compatibility unselected. **This note researches the authentication boundary; it does not close circuit feasibility or anonymous eligibility.** See **report 07, optional identity**, for Semaphore and issuer/uniqueness semantics. A case/round/predicate nullifier is replay control for a claim, not evidence of a unique human. The existing baseline uses a permissioned issuer registry. [PP-R02] [PP-R09]

NIP-01 requires the specified UTF-8 JSON event serialization, SHA-256 event ID and BIP340 Schnorr signature over secp256k1. NIP-59 adds a crucial distinction: the inner rumor is unsigned, the sender signs the encrypted seal, and the outer gift-wrap uses a separate one-time key. Therefore direct disclosed-message authentication must preserve the appropriate signed envelope and establish its connection to the decrypted, trade-bound content. A valid wrapper alone, a plaintext excerpt or a supplied message hash cannot establish that connection. This matches the repository’s explicit attribution requirement. [PP20] [PP21] [PP-R10]

The selective-proof packet must resolve the formal statement against that envelope design: exact signature and hash primitives, canonical bytes, authenticated decryption relation if used, evidence-root membership, case/trade/terms binding, public inputs, setup assumptions, circuit and verifier-key hashes. The draft phrase “signature over canonical message bytes” cannot silently assume an unsigned NIP-59 rumor carries such a signature. A generic membership proof or a proof of a trusted service’s assertion would have a different trust boundary. No circuit satisfying the complete statement was evaluated here. [PP-R09] [PP20] [PP21]

Next experiments should compare disclosed-message attribution against independently specified Nostr fixtures, then evaluate an audited candidate against the same statement. Include canonical-encoding differences, invalid signature, wrong sender/content association, wrong root and cross-case replay; measure the prospective 1MiB proof and 30-second cancellable-verification bounds. Until source-to-circuit correspondence, setup/key provenance, review and browser measurements exist, return unsupported for proof-required offers. Encrypted evidence storage must not be labeled a selective ZK proof. [PP-R09]

### Recommended next work, in order

1. **Choose one concrete receipt source and intended statement.** Obtain authoritative rail/status documentation and identify authenticated fields. No source was selected in the inspected packet; rail-specific conclusions remain open.
2. **Complete one TLSNotary artifact/mode packet and one Reclaim comparison packet.** Reuse the existing local kernels. Eliminate incompatible source, license, trust or deployment choices before implementation.
3. **Resolve current vlayer only if its architecture meets project needs.** Request the precise v2 code/service/audit mapping; do not port archived v1 assumptions.
4. **Run bounded feasibility and semantic verification only after an exact profile is approved for that stage.** Supply retained results and independent review before any activation proposal.

## 7. Evidence quality and retrieval limits

This note uses **22 primary external sources with relevant original text read**: pinned source documentation/licenses, official protocol/integration material, a standards document, a research paper and an independent audit. Ten pinned repository sources establish existing scope. These are not 22 independent corroborations: multiple pages share a publisher, and official product/security documentation remains vendor evidence. The historical Zellic result is listed separately as an **excerpt-only** source.

Reclaim’s legacy anatomy and JS usage URLs returned 404; its technology overview timed out; the linked `docs/browser-rpc.md` was unavailable; the Zellic landing page returned 403. No absent audit, unsupported platform or current vulnerability is inferred solely from those retrieval failures. Mutable docs need a captured, version-matched copy in the eventual provider packet. No deployed notary, bank account, current key roster or production verifier was qualified.

## Sources

### Repository evidence — unmerged PR26 pin

- **PP-R01** [PR26 evaluated proof profile](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/profiles/01-proof.md).
- **PP-R02** [PR26 canonical remaining-work ledger](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json).
- **PP-R03** [PR26 proof provider refusal implementation](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/proof-jobs/src/provider-boundary.ts).
- **PP-R04** [PR26 structural proof-input package contract](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/proof-inputs/README.md).
- **PP-R05** [PR26 ReceiptStatementV1 specification](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/module_1.2.2_bank_receipt_verifier/spec-bank-receipt-proof-statement.md).
- **PP-R06** [PR26 fiat-evidence settlement policy](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/module_1.2.4_evidence_policy/spec-fiat-proof-settlement-policy.md).
- **PP-R07** [PR26 arbitration reference-model scope](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/arbitration/README.md).
- **PP-R08** [PR26 arbitration unresolved exact contracts](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/arbitration/DECISIONS.json).
- **PP-R09** [PR26 selective-chat proof statement](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/04_WEB3_DISPUTE_ARBITERS/feature_4.3_evidence_access/module_4.3.1_chat_key_escrow/spec-selective-chat-proof-statement.md).
- **PP-R10** [PR26 chat evidence commitment format](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/04_WEB3_DISPUTE_ARBITERS/feature_4.3_evidence_access/module_4.3.1_chat_key_escrow/spec-chat-evidence-commitment-format.md).

### External primary sources

- **PP01** [TLSNotary alpha.15 README](https://github.com/tlsnotary/tlsn/blob/47aee45b53e06648c1b2ad3689b367b8c923fdec/README.md) — TLSNotary; pinned upstream source documentation.
- **PP02** [TLSNotary alpha.15 WASM README](https://github.com/tlsnotary/tlsn/blob/47aee45b53e06648c1b2ad3689b367b8c923fdec/crates/wasm/README.md) — TLSNotary; pinned upstream source documentation.
- **PP03** [TLSNotary FAQ](https://tlsnotary.org/docs/faq/) — TLSNotary; official protocol documentation.
- **PP04** [TLSNotary notarization](https://tlsnotary.org/docs/protocol/notarization/) — TLSNotary; official protocol documentation.
- **PP05** [TLSNotary verification](https://tlsnotary.org/docs/protocol/verification/) — TLSNotary; official protocol documentation.
- **PP06** [TLSNotary browser extension](https://tlsnotary.org/docs/extension/) — TLSNotary; official implementation documentation.
- **PP07** [Reclaim attestor-core README](https://github.com/reclaimprotocol/attestor-core/blob/dd43dc882b88dcfe75d27a1c1a991315574823ab/README.md) — Reclaim Protocol; pinned upstream source documentation.
- **PP08** [Reclaim claim-creation protocol](https://github.com/reclaimprotocol/attestor-core/blob/dd43dc882b88dcfe75d27a1c1a991315574823ab/docs/claim-creation.md) — Reclaim Protocol; pinned protocol documentation.
- **PP09** [Reclaim provider contract](https://github.com/reclaimprotocol/attestor-core/blob/dd43dc882b88dcfe75d27a1c1a991315574823ab/docs/provider.md) — Reclaim Protocol; pinned protocol documentation.
- **PP10** [Reclaim attestor-core LICENSE](https://github.com/reclaimprotocol/attestor-core/blob/dd43dc882b88dcfe75d27a1c1a991315574823ab/LICENSE) — Reclaim Protocol; pinned license.
- **PP11** [Reclaim security trust package](https://trust.reclaimprotocol.org/section/security) — Reclaim Protocol; vendor security claims.
- **PP12** [vlayer repository status at pinned main](https://github.com/vlayer-xyz/vlayer/blob/25197319a041935efbb09b8cbc57ba123702aaab/README.md) — vlayer; pinned upstream source documentation.
- **PP13** [vlayer v1 LICENSE](https://github.com/vlayer-xyz/vlayer/blob/25197319a041935efbb09b8cbc57ba123702aaab/LICENSE) — vlayer; pinned license.
- **PP14** [Veridise vlayer audit, May 12 2025 v3](https://veridise.com/wp-content/uploads/2025/05/VAR_VLayer250210-1.pdf) — Veridise; independent security assessment.
- **PP15** [Current vlayer introduction](https://docs.vlayer.xyz/introduction) — vlayer; official product documentation.
- **PP16** [Vouch receiving and verifying results](https://docs.getvouch.io/getting-started/verifying-webproofs) — vlayer / Vouch; official integration documentation.
- **PP17** [TLS 1.3 specification RFC8446](https://www.rfc-editor.org/rfc/rfc8446) — IETF / RFC Editor; technical standard.
- **PP18** [DECO: Liberating Web Data Using Decentralized Oracles for TLS, extended v6](https://arxiv.org/abs/1909.00938v6) — Zhang et al.; ACM CCS 2020 / arXiv; research paper.
- **PP19** [vlayer trusted notary keys](https://platform.vlayer.xyz/server-side/notary-keys) — vlayer; official verifier trust policy.
- **PP20** [NIP-01 events, hashing and signatures](https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/01.md) — Nostr Protocol contributors; pinned protocol specification.
- **PP22** [Deprecated tlsn-js browser package](https://github.com/tlsnotary/tlsn-js/blob/ff6b14a7777fbc28639dbbaa0f1f76d35c584db8/readme.md) — TLSNotary maintainers; pinned maintenance notice, not a finding about the core protocol.
- **PP21** [NIP-59 gift wrap, seal and rumor](https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/59.md) — Nostr Protocol contributors; pinned protocol specification.

### Retrieval-limited evidence

- **PP-X01** [Zellic Reclaim assessment landing-page excerpt](https://reports.zellic.io/publications/reclaim-protocol/) — auditor search excerpt only; full page inaccessible.

[PP-R01]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/profiles/01-proof.md
[PP-R02]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json
[PP-R03]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/proof-jobs/src/provider-boundary.ts
[PP-R04]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/proof-inputs/README.md
[PP-R05]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/module_1.2.2_bank_receipt_verifier/spec-bank-receipt-proof-statement.md
[PP-R06]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/module_1.2.4_evidence_policy/spec-fiat-proof-settlement-policy.md
[PP-R07]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/arbitration/README.md
[PP-R08]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/arbitration/DECISIONS.json
[PP01]: https://github.com/tlsnotary/tlsn/blob/47aee45b53e06648c1b2ad3689b367b8c923fdec/README.md
[PP02]: https://github.com/tlsnotary/tlsn/blob/47aee45b53e06648c1b2ad3689b367b8c923fdec/crates/wasm/README.md
[PP03]: https://tlsnotary.org/docs/faq/
[PP04]: https://tlsnotary.org/docs/protocol/notarization/
[PP05]: https://tlsnotary.org/docs/protocol/verification/
[PP06]: https://tlsnotary.org/docs/extension/
[PP07]: https://github.com/reclaimprotocol/attestor-core/blob/dd43dc882b88dcfe75d27a1c1a991315574823ab/README.md
[PP08]: https://github.com/reclaimprotocol/attestor-core/blob/dd43dc882b88dcfe75d27a1c1a991315574823ab/docs/claim-creation.md
[PP09]: https://github.com/reclaimprotocol/attestor-core/blob/dd43dc882b88dcfe75d27a1c1a991315574823ab/docs/provider.md
[PP10]: https://github.com/reclaimprotocol/attestor-core/blob/dd43dc882b88dcfe75d27a1c1a991315574823ab/LICENSE
[PP11]: https://trust.reclaimprotocol.org/section/security
[PP12]: https://github.com/vlayer-xyz/vlayer/blob/25197319a041935efbb09b8cbc57ba123702aaab/README.md
[PP13]: https://github.com/vlayer-xyz/vlayer/blob/25197319a041935efbb09b8cbc57ba123702aaab/LICENSE
[PP14]: https://veridise.com/wp-content/uploads/2025/05/VAR_VLayer250210-1.pdf
[PP15]: https://docs.vlayer.xyz/introduction
[PP16]: https://docs.getvouch.io/getting-started/verifying-webproofs
[PP17]: https://www.rfc-editor.org/rfc/rfc8446
[PP18]: https://arxiv.org/abs/1909.00938v6
[PP19]: https://platform.vlayer.xyz/server-side/notary-keys
[PP-X01]: https://reports.zellic.io/publications/reclaim-protocol/
[PP-R09]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/04_WEB3_DISPUTE_ARBITERS/feature_4.3_evidence_access/module_4.3.1_chat_key_escrow/spec-selective-chat-proof-statement.md
[PP-R10]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/04_WEB3_DISPUTE_ARBITERS/feature_4.3_evidence_access/module_4.3.1_chat_key_escrow/spec-chat-evidence-commitment-format.md
[PP20]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/01.md
[PP21]: https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/59.md
[PP22]: https://github.com/tlsnotary/tlsn-js/blob/ff6b14a7777fbc28639dbbaa0f1f76d35c584db8/readme.md
