# Proof providers and optional activation: additional security research

## Scope and disposition

This is defensive static research against **PR #26, `94554ecf9854e4604f9f56afe5bebedeee931994`**, compared with main `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`. The parent review verified the selected local source blobs against that candidate. Research date: **2026-11-03, America/Vancouver**. This report does not assess the subsequently opened repair PR #28.

**Conclusion:** keep the optional providers unselected. The useful next work is a precise admission dossier for a future candidate, while the core release remains the priority. Priorities below describe prerequisites **before optional activation**, not newly confirmed exploitable vulnerabilities or requirements to add optional features to the core release. Confidence is high for inspected code/specification facts; production feasibility remains unmeasured.

The [existing schemas/proof audit][R1], [optional audit][R2], and [current remainder][R3] already document the principal boundaries. `proof-inputs` returns detached data with source authentication, semantic coverage, proof verification, receipt authority, and economic preparation all false. Provider catalogs remain empty; public `createProofJobs()` refuses requests. G30 already requires advisory evidence and `autoRelease:false`. These are existing controls, not fixes proposed by this report.[R4] [R5] [R6]

## 1. P1 — Convert claim-coverage requirements into an admission matrix

TLSNotary's verification documentation separates notary/session verification, commitment openings and server identity from application-specific HTTP/JSON interpretation. That separation supports the repository's existing G30 model: authentic source bytes alone do not establish the meaning or finality of a payment.[S1] [R6]

The candidate's structural parsers validate bounds, context comparisons and witness-span properties. They deliberately do not establish that a parsed amount, beneficiary, status or timestamp is covered by an approved source proof. The receipt-statement specification already demands that coverage. The additional deliverable should be an auditable **field-to-authenticated-byte-to-verifier-constraint matrix**, attached to the selected provider profile.[R4] [R7]

| Admission question | Required profile decision and acceptance evidence |
| --- | --- |
| Which transaction is described? | Identify the authenticated transaction record and its enclosing object/array relationship. Demonstrate that amount, beneficiary, currency, status and reference come from that record. A set of individually authentic strings is insufficient. |
| Which parser interpretation is authoritative? | Freeze HTTP/body representation, character encoding, extraction paths and status/decimal/time-zone mappings. Record refusal behavior for ambiguous, missing or duplicate application fields. Show independently reviewed synthetic fixtures and expected statements. |
| What makes the observation fresh? | Identify the authenticated observation-time source and distinguish it from transaction time and the verifier's challenge. A fresh session must not upgrade an old receipt into a current bank-status assertion. |
| Which context is actually proven? | Map each terms/trade/action/source-policy field to an authenticated claim or constrained proof input, and every remaining field to an explicit verifier-side comparison. A caller-supplied context string must not acquire authority through inclusion in an otherwise valid envelope. |
| What does a successful result permit? | Expose only the selected evidence state. Unsupported or reversible status must not become an escrow-state transition or wallet intent. Preserve the existing manual release/refund paths. |

**Implementation locations:** the future adapter must integrate through `packages/proof-inputs/src/types.ts`, `src/parsers.ts`, the provider boundary in `packages/proof-jobs/src/provider-boundary.ts`, and the existing receipt/source/G30 specifications. Do not turn the current parsing result into a verified object merely by renaming it.[R4] [R5] [R6] [R7]

**Acceptance:** publish the matrix, independent expected outputs and provenance of the selected verifier. Show that absent coverage stays unverified and that contradictory later observations change only advisory evidence. This is qualification evidence still needed for an actual provider; the design requirements themselves already exist.

### Receipt uniqueness is a separate policy

The existing replay specification explicitly acknowledges that new challenges, different browsers and changed commitment salts defeat global receipt deduplication. It requires a separately reviewed, provider-proven deterministic rail-reference nullifier and authoritative consumer before any global uniqueness claim.[R8]

The profile dossier should therefore state whether the bank reference is stable, unique in an authenticated account/rail scope, and preserved across pending/posted/reversed representations. Where that cannot be established, retain local advisory deduplication and label it accordingly. Document the privacy consequences of the chosen scope before exposing any deterministic identifier. No global consumer is proposed for the core product.

## 2. P1 — Resolve provider-specific assumptions before selecting a library

### TLSNotary: record the deprecated browser package and successor boundary

At pinned upstream commit `ff6b14a7777fbc28639dbbaa0f1f76d35c584db8`, **`tlsnotary/tlsn-js` explicitly declares itself deprecated**, says it receives no maintenance or npm updates, and directs browser work to `tlsnotary/tlsn-extension`.[S2]

This is a confirmed upstream maintenance fact; no vulnerability in this repository was demonstrated. Record the deprecated package as unsuitable for a new unqualified integration. If TLSNotary is evaluated later, begin with the upstream's indicated successor architecture and establish whether its extension, transport and isolation requirements fit this application's actual deployment model. The successor has **not** been qualified here; its existence alone does not establish application compatibility.

### Reclaim: pin the verification contract, not the provider name

Source inspected at `a483dda82e2a2437d93571351c2d7f608182fdd5` identifies SDK **5.8.3**. Its verification API returns a discriminated result containing `isVerified`, trusted `data`, and separate `publicData`. Its provider-validation configuration supports hash requirements; omitting a provider version permits latest-version resolution, and version-based selection can include permitted subsequent patches. The verification path normally fetches attestors; configuration can alter authentication/content-validation behavior.[S4]

A future adapter therefore needs a fixed reviewed configuration, explicit success discrimination, and a mapping of each consumed field to authenticated `data`. Caller options must not select weaker verification behavior. Pin the accepted provider-spec hashes and explain any permitted patch set, attestor trust source, rotation/revocation policy, and failure behavior when those services are unavailable. Do not assume an SDK version pins the remote provider definition or trust set.

The SDK also documents initialization with a secret kept on a trusted backend, including a signed initialization path for clients. **Browser-only compatibility remains a design question:** no application secret should be packaged into browser assets to make that integration work.[S4]

**Acceptance:** a reviewed provider adapter must demonstrate its exact trust/configuration path with public fixtures and no implicit “latest” fallback. This report recommends no library adoption, vendoring or copied implementation. License/dependency review remains required for whichever exact candidate is eventually considered; no license approval is inferred from these API observations.

## 3. P2 — Measure the complete proof job under the existing bounds

The current runner already limits one job per tab, no queue, witness/proof sizes, wall time, heartbeat and message counts; cancellation retains capacity until physical drain. Its README explicitly distinguishes the laboratory termination adapter from browser `Worker.terminate()`, whose native return value does not itself acknowledge completion. The browser fixture also denies WASM under its current CSP; the separate Node memory probe does not qualify browser proving.[R5]

TLSNotary documents substantially greater communication overhead for MPC than the underlying server payload and a different trust model for proxy mode.[S5] Thus the existing **1 MiB job input, 2 MiB result output, 256 MiB WASM memory, 120-second wall time and 8 MiB network** ceilings cannot be qualified by receipt size alone. Input and result caps cover their complete buffers; a completed resource job does not establish a verified proof. These are existing limits, not measurements of an admitted provider.[R5]

For a later candidate, account for handshake, transcripts, proving artifacts, retries, transport framing and output copying across the full owned job. Identify the component that can actually enforce each bound. WASM linear-memory enforcement is not evidence of a cap on browser heap, network buffers or prover CPU. Record cold/warm loading, background-tab behavior, cancellation and physical drain using synthetic public inputs before introducing credentials.

The general circuit-input specification permits a larger proof envelope, while job and reputation profiles impose tighter limits. Freeze the effective limit at each boundary, units and refusal precedence; do not raise the worker budget merely to accommodate a library default.[R5] [R9] [R10]

**Acceptance:** measured target-browser evidence fits all applicable limits, late results cannot publish, and mode changes carry an explicit revised trust/privacy analysis. If physical cancellation or resource confinement cannot be established, the provider remains unselected.

## 4. P2 — Concrete decisions for optional-feature activation

| Feature and existing position | Additional decision and acceptance criteria |
| --- | --- |
| **Solana:** governance has no selected program/mint profile.[R11] | Define an extension allowlist per approved mint. Official Token Extensions documentation says transfer fees reduce the received amount, permanent delegates can transfer/burn from token accounts, and transfer hooks execute custom logic on transfers.[S6] Require explicit gross-versus-net escrow accounting, authority/change policy and hook dependencies. Reject unsupported extensions. Demonstrate deposit/release/refund amount conservation for each admitted configuration; generic SPL decoding does not qualify a mint. |
| **QR:** envelope/signature/codec remain draft decisions.[R11] | Specify the reviewed interpretation shown before wallet interaction: payload type, destination, chain, token contract, raw units and rendered amount. ERC-681 distinguishes the native-payment beneficiary from an ERC-20 transaction's target contract and separately stresses URL authenticity.[S7] If such URIs are considered, prove that these roles stay distinct through decoding and review. Successful QR decoding authenticates neither the request nor its economic contents. No scanning package is selected. |
| **Stealth:** two named offline math profiles already expose a documented 64-byte versus 33-byte shared-point encoding difference; neither is wire-approved.[R12] | Preserve explicit profile IDs. ERC-5564's view tag is a filtering aid and its announcement carries sender-supplied metadata.[S8] Future admission must establish separate evidence for math compatibility, canonical event identity and actual asset deposit. Independent vectors and a matching announcement alone must not be labeled proof of payment. Existing live-profile and spending/recovery decisions remain pending. |
| **Reputation:** the existing Semaphore evaluation is experimental, with explicit artifact pins and dependency overrides.[R10] | Freeze what each nullifier scope means: one action per identity per purpose/epoch and one action per trade are different policies. Semaphore proves group membership and scope-linked nullifiers; it does not supply the application's issuer/admission or creditworthiness policy.[S9] Require issuer/root freshness and actual consumption rules before presenting reputation authority. Keep the separate score-circuit requirement; do not repeat the completed public feasibility exercise as evidence of an approved score provider. |

These decisions belong in the existing Solana/QR proposal records, stealth `DECISIONS.json`, and reputation profile/evaluation records. They do not justify creating new optional packages or blocking already-supported core recovery paths.[R10] [R11] [R12]

## Handoff and verification limits

Recommended sequence: finish core-release blockers; retain empty optional catalogs; select a candidate only through the existing governance process; then commission its field-coverage, trust, resource and interoperability dossier. Circuit identity must retain the existing immutable combination of statement, circuit, verification/proving artifacts and policy; package names or mutable URLs cannot substitute for that identity.[R13]

This pass inspected source and primary documentation only. It ran no provider, browser qualification, live bank session, chain transaction, attack reproduction or dependency installer. No new activation, approval, deployment or production-readiness claim follows from these notes.

## Source references

All repository references below identify the exact PR #26 candidate, including files that are absent from main.

[R1]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/audit-2026-11-02/schemas-proof.md
[R2]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/audit-2026-11-02/optional.md
[R3]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.md
[R4]: https://github.com/djshellshoxxx/p2p-offramp/tree/94554ecf9854e4604f9f56afe5bebedeee931994/packages/proof-inputs
[R5]: https://github.com/djshellshoxxx/p2p-offramp/tree/94554ecf9854e4604f9f56afe5bebedeee931994/packages/proof-jobs
[R6]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/module_1.2.4_evidence_policy/spec-fiat-proof-settlement-policy.md
[R7]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/module_1.2.2_bank_receipt_verifier/spec-bank-receipt-proof-statement.md
[R8]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.2_zktls_fiat_verification/module_1.2.2_bank_receipt_verifier/spec-payment-proof-replay-prevention.md
[R9]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/00_PLANNING_AND_THREAT_MODELING/feature_0.2_crypto_primitives/module_0.2.1_zk_circuits/spec-circuit-public-input-contract.md
[R10]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/reputation/SEMAPHORE-V4-EVALUATION.md
[R11]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/PENDING-DECISIONS.md
[R12]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/stealth/DECISIONS.json
[R13]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/00_PLANNING_AND_THREAT_MODELING/feature_0.2_crypto_primitives/module_0.2.1_zk_circuits/spec-proof-system-upgrade-policy.md
[S1]: https://tlsnotary.org/docs/protocol/verification/
[S2]: https://github.com/tlsnotary/tlsn-js/blob/ff6b14a7777fbc28639dbbaa0f1f76d35c584db8/readme.md
[S4]: https://github.com/reclaimprotocol/reclaim-js-sdk/tree/a483dda82e2a2437d93571351c2d7f608182fdd5
[S5]: https://tlsnotary.org/docs/faq/
[S6]: https://solana.com/docs/tokens/extensions
[S7]: https://eips.ethereum.org/EIPS/eip-681
[S8]: https://eips.ethereum.org/EIPS/eip-5564
[S9]: https://docs.semaphore.pse.dev/technical-reference/circuits

Pinpoint provider sources: Reclaim [API implementation](https://github.com/reclaimprotocol/reclaim-js-sdk/blob/a483dda82e2a2437d93571351c2d7f608182fdd5/src/Reclaim.ts), [result types](https://github.com/reclaimprotocol/reclaim-js-sdk/blob/a483dda82e2a2437d93571351c2d7f608182fdd5/src/utils/types.ts), [provider validation](https://github.com/reclaimprotocol/reclaim-js-sdk/blob/a483dda82e2a2437d93571351c2d7f608182fdd5/src/utils/proofValidationUtils.ts), [attestor verification](https://github.com/reclaimprotocol/reclaim-js-sdk/blob/a483dda82e2a2437d93571351c2d7f608182fdd5/src/utils/proofUtils.ts), [package version](https://github.com/reclaimprotocol/reclaim-js-sdk/blob/a483dda82e2a2437d93571351c2d7f608182fdd5/package.json). Solana: [fees](https://solana.com/docs/tokens/extensions/transfer-fees), [permanent delegates](https://solana.com/docs/tokens/extensions/permanent-delegate), [hooks](https://solana.com/docs/tokens/extensions/transfer-hook). Existing [reputation application profile](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/profiles/02-reputation.md) distinguishes SDK, depth-specific artifacts and application policy.
