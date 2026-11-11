# Payment-proof and provider-adapter code reuse dossier

Research date: **2026-11-03, America/Vancouver** (snapshot approximately 2026-11-04 02:12 UTC). Scope: fiat receipt evidence, zkTLS/TLSNotary/Reclaim/ZK Email, provider adapters, proof verification and advisory dispute evidence for `djshellshoxxx/p2p-offramp`. This is source research and an integration proposal; no upstream code was executed, no proof was generated, no paid service was called, and no bank account was accessed.

## Decision

**Preserve the existing local proof-job, proof-input and payment-assertion boundaries. Evaluate a tagged TLSNotary stack first when optional work resumes.** The repository already selected TLSNotary as its first researched profile, while deliberately leaving production providers unsupported. The useful unfinished work is an exact, independently testable source/statement/verification profile and a qualified implementation of that profile. Another generic JSON parser, worker wrapper or boolean “verified” response would duplicate completed work without closing the gap.

The strongest additional sources are:

1. TLSNotary core and its extension/verifier packages for the actual authenticated-transcript protocol and browser integration.
2. ZKP2P's current verifier and nullifier code for payment binding, signature-domain and replay invariants, translated into the target's existing contracts rather than copied as an entire settlement system.
3. Peer Link's explicitly unauthenticated observation-to-candidate mapper and value-free transcript artifacts as useful patterns for preserving provenance and minimizing evidence.
4. Reclaim JS SDK as an alternative provider adapter, with its MIT SDK and AGPL attestor separated in the license assessment.
5. ZK Email as a separate email-evidence source family, not a substitute for a TLS bank-response profile.

These are **deferred optional integrations**, not reasons to delay the core LOCALPROOF exit. [Draft PR27's next-run instructions](https://github.com/djshellshoxxx/p2p-offramp/blob/2f839b12768700ac6c3b674f75a144c6ec19fa93/docs/execution/NEXT-RUN-PROMPT-2026-11-04.md) propose freezing optional zkTLS and related features until the core journey qualifies. That proposal should be distinguished from an already merged release policy.

## 1. Repository baseline: completed boundaries versus missing authority

Two baselines matter:

- `main`: [`e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`](https://github.com/djshellshoxxx/p2p-offramp/commit/e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa).
- [PR26](https://github.com/djshellshoxxx/p2p-offramp/pull/26), branch `autonomous/completion-20261102`: [`94554ecf9854e4604f9f56afe5bebedeee931994`](https://github.com/djshellshoxxx/p2p-offramp/commit/94554ecf9854e4604f9f56afe5bebedeee931994). The implementation and target paths below are evaluated at this unmerged head. Do not report those packages as already present on main.

The PR26 [remainder ledger](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json) has 103 canonical records: 76 marked local scope complete, 25 exact contract/tooling remainders and 2 external/tooling qualification records. These are classifications, not a project-completion percentage. Its P-PROOF-IMPLEMENTATION entry expressly says another parser or worker wrapper is not the missing work.

| Surface at PR26 | What source already implements | What remains genuinely unresolved |
|---|---|---|
| [`packages/proof-jobs`](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/proof-jobs/README.md) | One job/tab, no queue; declared byte/WASM/network/time budgets; public-fixture consent, late-result suppression and parent-owned termination tests | A genuine provider and authenticated witness workflow; production host/CSP choice, browser physical-exit acknowledgment and provider traffic accounting; real artifact/resource and browser/mobile qualification |
| [`provider-boundary.ts`](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/proof-jobs/src/provider-boundary.ts) | `createProofJobs()` has an empty frozen provider registry and fails `UNSUPPORTED_PROVIDER` before witness collection | Only a separately approved, exact provider profile can justify populating it; constructor-authorized public resource fixtures are not providers |
| [`packages/proof-inputs`](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/proof-inputs/README.md) | Strict request/witness/source-policy/statement/advisory-policy structural parsing; positive uint128 amounts, uint64 times, bounded UTF-8 fields, scale 0–6 and disjoint spans | Source authenticity; field meaning; exact commitment/hash/challenge encoding; rail/currency/status/locale/timezone semantics; circuit, verifier, keys and public-signal order |
| [`proof-inputs/src/boundary.ts`](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/proof-inputs/src/boundary.ts) | Explicit `unverified-proof-input` results and false authority flags | A distinct verified evidence result with a specified consumer; do not turn structural parsing into economic authorization |
| [`packages/arbitration/src/payment-assertions.ts`](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/arbitration/src/payment-assertions.ts) | Local payment assertion/evidence-conflict model | Qualified evidence admission and the exact G30 consumer, not generic receipt truth or automatic release |
| [`docs/execution/profiles/01-proof.md`](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/profiles/01-proof.md) | Existing TLSNotary alpha.15 research, limits, unresolved decision list and explicit advisory scope | Exact source/statement/crypto/notary/egress policies, pinned artifacts and independent interoperability/measurement evidence |

No proof vendor is an existing dependency in the examined [main package manifest](https://github.com/djshellshoxxx/p2p-offramp/blob/e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa/package.json). Prefer the repository's existing schema, transport-policy, extension registry and Worker/vault lifecycle before bringing in vendor-specific equivalents.

### What a valid proof still cannot establish

A proof of authenticated bytes only establishes the selected statement about those bytes under the selected trust model. A bank status must be mapped using the bank's actual documented meaning. For example, [Wise's transfer-status documentation](https://docs.wise.com/guides/product/send-money/tracking/transfer-statuses) states that `outgoing_payment_sent` means Wise sent the payment; it does not guarantee the recipient bank credited the beneficiary. The documented flow can subsequently bounce back or refund. Thus “completed” text, an attested API field or a signed email cannot by itself establish irrevocability. The profile must state historical observation time, exact status meaning and the limits of that evidence. This supports the repository's existing advisory-only boundary.

## 2. Candidate assessment and license evidence

All candidate pins below were resolved through a commit endpoint, not inferred from a Git tree identifier. Dates are the latest examined commit's committer timestamp, not audit or release dates. Recent commits are maintenance signals, not proof of correctness.

| Candidate and examined commit | Maintenance signal | License evidence examined | Decision |
|---|---|---|---|
| [TLSNotary core `24b10ba`](https://github.com/tlsnotary/tlsn/commit/24b10ba21bf36c3fd3de709e7eccd8308bb64207) | 2026-10-30; prover scheduling/stall fix | README/Cargo declaration MIT OR Apache-2.0; no standalone license file found in recursive tree | First evaluation candidate, after artifact/license intake; alpha status is material |
| [TLSNotary extension `d446234`](https://github.com/tlsnotary/tlsn-extension/commit/d44623434d04ad00d7b1f8da9712cbc10cd0e99c) | 2026-06-26; plugin update | README declares MIT OR Apache-2.0; no standalone license file found in tree | Companion browser/verifier reference; qualify matching protocol version |
| [Reclaim JS SDK `a483dda`](https://github.com/reclaimprotocol/reclaim-js-sdk/commit/a483dda82e2a2437d93571351c2d7f608182fdd5) | 2026-10-12; dependency maintenance | Manifest points to organization [MIT LICENSE](https://github.com/reclaimprotocol/.github/blob/49cd1902963723716901d80212502842ea0107eb/LICENSE), Copyright 2024 CreatorOS Inc. | Credible alternative adapter; external service and attestor policy required |
| [Reclaim attestor-core `dd43dc8`](https://github.com/reclaimprotocol/attestor-core/commit/dd43dc882b88dcfe75d27a1c1a991315574823ab) | 2026-10-22; Docker update | Repository [AGPL-3.0 LICENSE](https://github.com/reclaimprotocol/attestor-core/blob/dd43dc882b88dcfe75d27a1c1a991315574823ab/LICENSE) | Conditional service/reference option; no permissive-license assumption |
| [ZK Email `066c874`](https://github.com/zkemail/zk-email-verify/commit/066c8742a5e60519597697e579333b703ffa6ad2) | 2026-09-09; maintenance | Repository [MIT LICENSE](https://github.com/zkemail/zk-email-verify/blob/066c8742a5e60519597697e579333b703ffa6ad2/LICENSE), Copyright 2023 zk-email | Best separately scoped email-evidence candidate |
| [ZKP2P contracts `2ee9839`](https://github.com/zkp2p/zkp2p-contracts/commit/2ee9839e0d942c59ec488de8a6b00c45b3517445) | 2026-11-02; FX updater change | [MIT LICENSE](https://github.com/zkp2p/zkp2p-contracts/blob/2ee9839e0d942c59ec488de8a6b00c45b3517445/LICENSE); examined verifier and registry also SPDX MIT | Strong semantic/invariant reference; settlement architecture differs |
| [Peer Link `aaff575`](https://github.com/zkp2p/peer-link/commit/aaff5757f9d2e96de6d2989334a1831d4c2890d7) | 2026-10-28; CI change | [MIT LICENSE](https://github.com/zkp2p/peer-link/blob/aaff5757f9d2e96de6d2989334a1831d4c2890d7/LICENSE), Copyright 2026 Sachin Kumar and contributors | Useful narrow mapping/minimization code; not a ready bank verification product |
| [vlayer `2519731`](https://github.com/vlayer-xyz/vlayer/commit/25197319a041935efbb09b8cbc57ba123702aaab) | 2026-10-02; CODEOWNERS change | [BSL 1.1 LICENSE](https://github.com/vlayer-xyz/vlayer/blob/25197319a041935efbb09b8cbc57ba123702aaab/LICENSE); no additional use grant, three-year change date to MIT | Architecture comparator; no blanket production reuse approval |
| [Primus SDK `0265962`](https://github.com/primus-labs/zktls-js-sdk/commit/0265962b1d4b8e9db56ff7b1e9120a0ad5235978) | 2026-10-14 | No LICENSE found; package has no license field | Withhold copied-code recommendation until permission/license established |
| [zkPass TransGate `53bff19`](https://github.com/zkPassOfficial/transgate-js-sdk/commit/53bff19c2fbdff3382ba6ecccb4799f2e7863a32) | 2026-10-18; scope/verification documentation | Package declares ISC, but no tracked LICENSE; README documents that gap | Lower-priority conditional candidate, not verified file-level license clearance |

The target repository has no root license in the examined baseline; its BasicEscrow source uses SPDX `UNLICENSED`. Consequently, “upstream MIT” is not the same as “all target licensing decisions are resolved.” Preserve upstream notices and record provenance for each adapted file. Apache, AGPL, BSL and vendor terms require their own intake decisions. A separate process or service is not automatic resolution of AGPL obligations.

## 3. Source-level recommendations

### A. TLSNotary core: genuine authenticated transcript protocol

**Use:** first future provider evaluation, extending the existing TLSNotary profile.

The existing target profile pins [tag `v0.1.0-alpha.15`, commit `47aee45`](https://github.com/tlsnotary/tlsn/commit/47aee45b53e06648c1b2ad3689b367b8c923fdec), confirmed via the commit API; committer date 2026-05-21. The newer inspected main [README](https://github.com/tlsnotary/tlsn/blob/24b10ba21bf36c3fd3de709e7eccd8308bb64207/README.md) explicitly cautions against production use and recommends tagged releases. Do not silently replace the profile pin with main.

Useful current source seams:

- [`crates/wasm/src/prover/mod.rs`](https://github.com/tlsnotary/tlsn/blob/24b10ba21bf36c3fd3de709e7eccd8308bb64207/crates/wasm/src/prover/mod.rs): `JsProver::new`, `setup`, `send_request`, `transcript`, `reveal`, `finish` and progress callbacks.
- [`crates/wasm/src/verifier/mod.rs`](https://github.com/tlsnotary/tlsn/blob/24b10ba21bf36c3fd3de709e7eccd8308bb64207/crates/wasm/src/verifier/mod.rs): `JsVerifier::new`, `connect`, `setup`, `set_server_socket`, `run`, `verify`, `finish`.
- [`crates/wasm/README.md`](https://github.com/tlsnotary/tlsn/blob/24b10ba21bf36c3fd3de709e7eccd8308bb64207/crates/wasm/README.md): wasm-pack 0.14+, browser test requirement, packaged-artifact checks, tagged CI artifacts. The README says Node-based wasm-pack tests fail on its web-spawn ESM snippet, so a successful Node-only test would not qualify browser integration.

**Destination:** update `docs/execution/profiles/01-proof.md`; then a proposed `packages/proof-tlsnotary/` package with adapter, source policy, statement mapping and provider worker. Those proposed files do not currently exist. Keep provider-independent lifecycle enforcement in `packages/proof-jobs`; reuse `packages/extensions/src/registry.ts` and `packages/transport/src/policy.ts` for opt-in loading and egress. Do not place the prover in the custody worker.

**Integration:** freeze one tagged protocol and compatible browser/server pair; establish WASM/toolchain/artifact hashes; specify authenticated request/response coverage; derive statement fields only from verified covered bytes; map the result to a distinct advisory evidence type. TLSNotary transcript commitments alone do not fill the still-unspecified application circuit/public-signal contract.

**Known browser prerequisites:** the [current content-policy source](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/security/src/content-policy.ts) sets `script-src 'self'` and `connect-src 'none'`. The [proof-jobs README](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/proof-jobs/README.md) explicitly records that browser WASM is unsupported under that unchanged policy. It also documents that physical Worker-exit acknowledgment uses a test-only CDP observer: standard browser `Worker.terminate()` cannot satisfy the required exit promise, and production provider traffic accounting remains unimplemented. These are architectural prerequisites, beyond measuring performance. A separately selected extension/native bridge needs its own qualified authority, transport and lifecycle boundary; any future in-page policy/host change is a distinct reviewed decision. This recommendation authorizes neither a silent CSP relaxation nor promotion of the test-only CDP port.

**Acceptance:** independent fixture producer and verifier agree on covered bytes and statement; altered/missing fields, wrong source, stale observation and unapproved verifier keys are rejected; real artifacts satisfy the selected, qualified host/profile and existing resource requirements. An in-page WASM provider remains unsupported under the unchanged app CSP. The current 256 MiB/120 s caps are requirements, not measured evidence that this provider fits them.

### B. TLSNotary extension and verifier: compatibility and disclosure bridge

**Use:** browser-facing integration and verifier transport reference, not an automatic permission to add a mandatory extension.

- [`packages/plugin-sdk/src/types.ts`](https://github.com/tlsnotary/tlsn-extension/blob/d44623434d04ad00d7b1f8da9712cbc10cd0e99c/packages/plugin-sdk/src/types.ts) contains `Handler`, `HandlerAction`, `canonicalizeHandler`, `canonicalizeHandlers`, `RequestPermission` and `PluginConfig`. These are disclosure-shape and shorthand-normalization references for SENT/RECV reveal/hash operations. `canonicalizeHandler` only expands a string action to an object and otherwise returns the original handler; `canonicalizeHandlers` maps that operation. Neither supplies exact-field validation, byte/count/range limits or canonical serialization for a cryptographic digest. The target still needs its own bounded parser and frozen canonical-byte/digest contract.
- [`servers/verifier/src/verifier.rs`](https://github.com/tlsnotary/tlsn-extension/blob/d44623434d04ad00d7b1f8da9712cbc10cd0e99c/servers/verifier/src/verifier.rs) supplies the async `verifier` protocol integration.
- The [README](https://github.com/tlsnotary/tlsn-extension/blob/d44623434d04ad00d7b1f8da9712cbc10cd0e99c/README.md) distinguishes Chrome/Chromium MV3 with WASM in an offscreen document from mobile native Rust/UniFFI, and requires protocol-version alignment. The [official verifier documentation](https://tlsnotary.org/docs/extension/verifier/) describes its HTTP/WebSocket role.

**Destination:** proposed provider-specific browser bridge under the future `packages/proof-tlsnotary/` integration. The verifier is optional external-provider software or local test tooling, not a mandatory application-owned backend; the core remains a static app. Public synthetic fixtures can extend `packages/proof-jobs/test/fixtures`. This does not justify changing the existing default build or custody lifecycle. The upstream `servers/swissbank` tree is a possible synthetic-test fixture, not evidence of a supported real bank.

**Acceptance:** verifier/client version mismatch fails explicitly; independently implemented target disclosure encoders produce the same frozen canonical bytes and digest after bounded validation; reveal scope is narrower than the raw session; consent cancellation terminates transport as well as UI; same statement results across supported clients. Upstream action-shorthand expansion alone does not satisfy the encoding criterion. Mobile architecture in upstream docs is not target mobile qualification.

### C. Reclaim JS SDK: the strongest alternative external provider

**Use:** a comparative adapter spike if TLSNotary feasibility is unsuitable or a specific required rail has a reviewed Reclaim provider.

- [`src/utils/proofUtils.ts`](https://github.com/reclaimprotocol/reclaim-js-sdk/blob/a483dda82e2a2437d93571351c2d7f608182fdd5/src/utils/proofUtils.ts): `recoverSignersOfSignedClaim` and `assertVerifiedProof`; signer membership must be related to an approved attestor set.
- [`src/witness.ts`](https://github.com/reclaimprotocol/reclaim-js-sdk/blob/a483dda82e2a2437d93571351c2d7f608182fdd5/src/witness.ts): `createSignDataForClaim`, `getIdentifierFromClaimInfo`, `hashProofClaimParams`, `getProviderParamsAsCanonicalizedString`.
- [`src/utils/proofValidationUtils.ts`](https://github.com/reclaimprotocol/reclaim-js-sdk/blob/a483dda82e2a2437d93571351c2d7f608182fdd5/src/utils/proofValidationUtils.ts): `assertValidProofsByHash`, `getHttpProviderClaimParamsFromProof`, `assertValidateProof`. Preserve content/hash validation; configuration that disables it cannot be accepted as a production shortcut.
- [`src/index.ts`](https://github.com/reclaimprotocol/reclaim-js-sdk/blob/a483dda82e2a2437d93571351c2d7f608182fdd5/src/index.ts) exports TEE verification and `generateAttestationNonce`; [`src/__tests__/verify_proof.test.ts`](https://github.com/reclaimprotocol/reclaim-js-sdk/blob/a483dda82e2a2437d93571351c2d7f608182fdd5/src/__tests__/verify_proof.test.ts) provides test-structure reference.

The [official proof anatomy](https://docs.reclaimprotocol.org/troubleshooting/anatomy) makes nonce/TEE verification configuration material. Signed claim identity, acceptable attestor configuration and a valid application payment statement are separate checks. The SDK's account/provider/session services also introduce externally operated endpoints and policy dependencies; they are not equivalent to the target's empty local registry.

**Destination:** proposed `packages/proof-reclaim/`; leave generic structural parsers and resource supervisor in their current packages. If the selected API requires an application secret, use it only through an explicitly selected optional external provider or local test tooling, or defer that API. Do not add an application-owned backend to satisfy the SDK: the core remains a static app, and secret material must not become a public browser config field.

**Acceptance:** bind proof to exact requested provider/source, trade, challenge and session; reject proof for another request despite valid signatures; verify current approved signer/TEE policy independently of a server's claimed verification boolean; test versioned provider parameter hashes and key rotation; measure all SDK-controlled network/resource consumption against target budgets. The MIT organization license was followed from the SDK manifest and pinned separately; this does not license attestor-core under MIT.

### D. Reclaim attestor-core: HTTP provider and verifier internals, conditional license fit

**Use:** source-level comparison or an explicitly chosen independently operated attestor deployment. This is not a small browser-library addition.

Concrete source:

- [`src/providers/http/index.ts`](https://github.com/reclaimprotocol/attestor-core/blob/dd43dc882b88dcfe75d27a1c1a991315574823ab/src/providers/http/index.ts): `HTTP_PROVIDER`, `substituteParamValues` and provider-specific HTTP processing.
- [`src/client/create-claim.ts`](https://github.com/reclaimprotocol/attestor-core/blob/dd43dc882b88dcfe75d27a1c1a991315574823ab/src/client/create-claim.ts): claim-creation orchestration.
- [`src/server/utils/assert-valid-claim-request.ts`](https://github.com/reclaimprotocol/attestor-core/blob/dd43dc882b88dcfe75d27a1c1a991315574823ab/src/server/utils/assert-valid-claim-request.ts) and [`src/server/handlers/claimTunnel.ts`](https://github.com/reclaimprotocol/attestor-core/blob/dd43dc882b88dcfe75d27a1c1a991315574823ab/src/server/handlers/claimTunnel.ts): server validation and claim handling.
- [`src/tests/claim-creation.test.ts`](https://github.com/reclaimprotocol/attestor-core/blob/dd43dc882b88dcfe75d27a1c1a991315574823ab/src/tests/claim-creation.test.ts): integration-test reference.

**Destination:** the Reclaim profile's source/claim verification adapter and a separately designed service boundary. Reuse ideas about request validation, response extraction and matching, not the entire service to “finish” proof-inputs. Record AGPL distribution/network-use assessment before adaptation.

**Acceptance:** no secret parameters retained in public evidence; exact HTTP/source policy and transformations are fixed; service claims are independently verified; governance, TLS coverage, workload identity, endpoint ownership and key rotation are documented. A self-hosted server does not by itself remove notary trust or establish payment semantics.

### E. ZK Email: authenticated email evidence with its own source contract

**Use:** optional receipts from a specifically supported signed-email source, with a separate profile. DKIM authenticates a domain-signed message under a key policy; it does not automatically certify bank finality, the sender's human identity or the economic meaning of the message.

- [`packages/circuits/email-verifier.circom`](https://github.com/zkemail/zk-email-verify/blob/066c8742a5e60519597697e579333b703ffa6ad2/packages/circuits/email-verifier.circom): `EmailVerifier` template; body hashing, optional header/body masking and soft-line-break behavior must be pinned.
- [`packages/helpers/src/input-generators.ts`](https://github.com/zkemail/zk-email-verify/blob/066c8742a5e60519597697e579333b703ffa6ad2/packages/helpers/src/input-generators.ts): `generateEmailVerifierInputs`, `generateEmailVerifierInputsFromDKIMResult`; SHA precomputation, padding, decoded-body mapping and masking are specific reusable components.
- [`packages/helpers/src/dkim/index.ts`](https://github.com/zkemail/zk-email-verify/blob/066c8742a5e60519597697e579333b703ffa6ad2/packages/helpers/src/dkim/index.ts), [`packages/contracts/DKIMRegistry.sol`](https://github.com/zkemail/zk-email-verify/blob/066c8742a5e60519597697e579333b703ffa6ad2/packages/contracts/DKIMRegistry.sol) and adjacent key registry implementations are follow-on integration surfaces identified from the source tree.

**Destination:** proposed `packages/proof-email/`, with private witness handling using the same proof-job resource owner and a separately typed email source policy. Do not force email bytes into the TLS-authenticated-response contract and pretend the source model is unchanged. Admit final evidence through the existing payment-assertions model only after the relevant evidence policy is defined.

**Acceptance:** test actual raw MIME/header/body canonicalization and disclosure bytes; bind sender domain, receipt ID, amount, currency, beneficiary/reference and time; make DKIM key history/revocation and replay scope explicit; pin circuit/compiler/zkey/verifier/public signals together. Keep body-hash checking for any amount/status claims carried in the body. Independent vectors must test decimal/exponent and timezone transformations. The [official audits page](https://docs.zk.email/audits) identifies historical audits and warns that assembling custom circuits from subcomponents can require extra validations. It does not establish that this new integration or the examined current commit was audited.

### F. Current ZKP2P contracts: payment semantics and replay invariants

**Use:** targeted adaptation of binding semantics and independent regression cases. Its complete orchestrator/FX/settlement design differs from BasicEscrow; copying that stack would enlarge scope rather than close the current local proof gap.

- [`contracts/unifiedVerifier/UnifiedPaymentVerifierV4.sol`](https://github.com/zkp2p/zkp2p-contracts/blob/2ee9839e0d942c59ec488de8a6b00c45b3517445/contracts/unifiedVerifier/UnifiedPaymentVerifierV4.sol) defines an EIP-712 `PaymentAttestation(bytes32 intentHash,uint256 releaseAmount,bytes32 dataHash)` and binds domain name/version/chain/verifying contract. Its encoded payment details, intent snapshot and settlement data illustrate why a signed blob needs exact encoding and domain separation. Its comments explicitly separate unsigned metadata from signed data.
- [`contracts/registries/NullifierRegistryV2.sol`](https://github.com/zkp2p/zkp2p-contracts/blob/2ee9839e0d942c59ec488de8a6b00c45b3517445/contracts/registries/NullifierRegistryV2.sol): `addNullifier`, `isNullified`, immutable predecessor, two-way payment/intent binding and controlled writer set. The cutover invariant prevents old/new registry authority from being treated as interchangeable.
- [`contracts/unifiedVerifier/MultiAttestationVerifier.sol`](https://github.com/zkp2p/zkp2p-contracts/blob/2ee9839e0d942c59ec488de8a6b00c45b3517445/contracts/unifiedVerifier/MultiAttestationVerifier.sol): `verify`, `setRequiredSignatures`, `addWitness`, `removeWitness`. Threshold one remains a one-witness trust policy; multiple configured witnesses do not inherently mean threshold consensus.
- Test locations: [`UnifiedPaymentVerifierV4.t.sol`](https://github.com/zkp2p/zkp2p-contracts/blob/2ee9839e0d942c59ec488de8a6b00c45b3517445/test-foundry/deterministic/verifiers/UnifiedPaymentVerifierV4.t.sol), [`AttestationVerifier.t.sol`](https://github.com/zkp2p/zkp2p-contracts/blob/2ee9839e0d942c59ec488de8a6b00c45b3517445/test-foundry/deterministic/verifiers/AttestationVerifier.t.sol). These were identified from the tree; the full test suites were not executed in this review.

**Destination:** exact trade/challenge/domain-binding contract in `docs/execution/profiles/01-proof.md`; selected independent cases in `packages/proof-inputs/test/parsers.test.mjs`, a future provider verification test suite and `packages/arbitration/test/payment-assertions.test.mjs`. Structural parser tests must continue asserting lack of verification authority. Any on-chain nullifier registry is a separate future contract decision; do not retrofit it into BasicEscrow as part of this research.

**Acceptance:** a verified receipt cannot be rebound across trades/deployments/chains or accepted twice under the policy; signed fields remain distinct from UI metadata; key/threshold changes have deterministic evidence semantics; accepted historical evidence is not invalidated or revived implicitly by migration. The target's own hash and commitment format must be specified before translating these patterns.

### G. Peer Link: concrete observation mapper and data-minimization reference

**Use:** small pieces closest to the target's current advisory evidence contract.

[`lib/attestation-candidate.ts`](https://github.com/zkp2p/peer-link/blob/aaff5757f9d2e96de6d2989334a1831d4c2890d7/lib/attestation-candidate.ts) is particularly relevant: `toAttestationCandidate` validates a supported observation and preserves `sourceAuthenticated: false`. It records the original minor amount and exponent, requires explicit UTC timestamp provenance, and refuses lossy rescaling. **Do not copy its fixed two-decimal settlement format or uint256 limit:** the target profile uses its own scale 0–6 and positive uint128 contract. Preserve the provenance/lossless-conversion principle while retaining target bounds.

[`transcripts/artifacts.py`](https://github.com/zkp2p/peer-link/blob/aaff5757f9d2e96de6d2989334a1831d4c2890d7/transcripts/artifacts.py) supplies `extract_artifact`, `validate_artifact`, field/type allowlists and explicit `schema_only`/`no_payment_authenticity_claim` limitations. It derives deterministic structural artifacts rather than retaining bank values or model prose. This is useful for fixture inventories and parser-version evidence, not authenticated payment evidence.

[`transcripts/providers.py`](https://github.com/zkp2p/peer-link/blob/aaff5757f9d2e96de6d2989334a1831d4c2890d7/transcripts/providers.py) shows provider routing and prompt-digest separation. Its agent/LLM acquisition pipeline is unnecessary for the target's first deterministic provider and may incur service costs; it was not run. The [README](https://github.com/zkp2p/peer-link/blob/aaff5757f9d2e96de6d2989334a1831d4c2890d7/README.md) describes transcript contributions feeding later provider work. Listed bank campaigns do not establish ready production bank adapters.

**Destination:** future provider-specific `statement.ts` and offline synthetic fixture manifests; reuse the existing `packages/proof-inputs/src/types.ts` false-authority boundary and `packages/arbitration/src/payment-assertions.ts` evidence labeling. Prefer typed deterministic mapping to introducing a model-based receipt parser.

**Acceptance:** source amount/exponent and normalized amount reconcile exactly; unsupported observation, invalid calendar time, ambiguous identity scheme and conversion remainder fail; structural fixtures retain no account values/secrets and claim no authenticity. Useful adjacent diagnostic tests in [`verification/tests/test_provider_diagnostic.py`](https://github.com/zkp2p/peer-link/blob/aaff5757f9d2e96de6d2989334a1831d4c2890d7/verification/tests/test_provider_diagnostic.py) distinguish attested nonce/key binding from a server's `verified` boolean. Their ACI/TDX inference attestation is not itself bank proof, so do not transplant that protocol.

### H. Other meaningful alternatives and why they are not first choices

**vlayer.** Its tree contains `rust/web_proof/src/verifier.rs`, web-proof examples including `examples/kraken-web-proof`, and `contracts/vlayer/src/proof_verifier/Groth16ProofVerifier.sol`. These are architecture comparators for proof verification and example wiring, but the examined [BSL license](https://github.com/vlayer-xyz/vlayer/blob/25197319a041935efbb09b8cbc57ba123702aaab/LICENSE) grants no additional production-use allowance and changes after three years. Do not label it a permissively licensed production drop-in. Its architecture would also introduce a different proving/execution stack. No code destination is recommended until a license and architecture decision justifies that cost.

**Primus.** [`src/index.ts`](https://github.com/primus-labs/zktls-js-sdk/blob/0265962b1d4b8e9db56ff7b1e9120a0ad5235978/src/index.ts) exposes `PrimusZKTLS`/`AttRequest`; `src/classes/AttRequest.ts` and `src/api/index.ts` are the request/API seams. The same entrypoint exports event-reporting helpers. The selected SDK requires its own application/template/signature model and service policy. No LICENSE was found, and [`package.json`](https://github.com/primus-labs/zktls-js-sdk/blob/0265962b1d4b8e9db56ff7b1e9120a0ad5235978/package.json) does not establish a license. Public visibility is insufficient permission to copy. A future profile could compare API capabilities, but no source-copy recommendation is made.

**zkPass TransGate.** [`src/index.ts`](https://github.com/zkPassOfficial/transgate-js-sdk/blob/53bff19c2fbdff3382ba6ecccb4799f2e7863a32/src/index.ts) implements `TransgateConnect`, schema/app launch, extension/mobile/QR result paths and EVM/Solana/TON variants. The inspected [README](https://github.com/zkPassOfficial/transgate-js-sdk/blob/53bff19c2fbdff3382ba6ecccb4799f2e7863a32/README.md) documents unequal verification behavior between mobile callbacks and the extension path, missing general cancellation/deadline handling, and absent tracked license/test/CI artifacts. Package metadata says ISC, which is weaker evidence than a verified license file. A target adapter would need one independently verified receipt contract across every supported platform and resource cancellation compatible with proof-jobs. Those gaps make it a lower-priority future comparator rather than a quick implementation shortcut.

## 4. Historical and rejected leads

- `zkp2p/zk-p2p` resolves to [archived `zkp2p-v1-monorepo`](https://github.com/zkp2p/zkp2p-v1-monorepo), examined commit [`fa4274d`](https://github.com/zkp2p/zkp2p-v1-monorepo/commit/fa4274dbca8547963f92364ceacb7f62aecc8fd4), 2025-06-18. MIT [LICENSE](https://github.com/zkp2p/zkp2p-v1-monorepo/blob/fa4274dbca8547963f92364ceacb7f62aecc8fd4/LICENSE). Its `circuits-circom/circuits/venmo/venmo_send.circom` and related regex/test tree are historical email-proof references. Do not choose archived receipt templates or proving artifacts as current maintained provider support.
- [Archived `zkp2p/witness-sdk`](https://github.com/zkp2p/witness-sdk), commit [`3f98197`](https://github.com/zkp2p/witness-sdk/commit/3f98197f54b235dd42a21e30cd68fad92b92ce19), 2025-08-05, has an [AGPL LICENSE](https://github.com/zkp2p/witness-sdk/blob/3f98197f54b235dd42a21e30cd68fad92b92ce19/LICENSE). Prefer current Reclaim core when comparing this protocol family.
- TLSNotary's old [`tlsn-js`](https://github.com/tlsnotary/tlsn-js) search result and commit [`ff6b14a`](https://github.com/tlsnotary/tlsn-js/commit/ff6b14a7777fbc28639dbbaa0f1f76d35c584db8) identify a deprecation notice dated 2026-02-04. Fetching `README.md` at that pin returned 404, so its exact current README text was not treated as verified file evidence. Current TLSN core explicitly points browser consumers to tlsn-extension.
- `zkp2p/zkp2p-v2` and `OpacityLabs/opacity-sdk` lookups returned 404. An organization search located other real Opacity repositories, but no pinned implementation/license review was completed for them. No recommendation is based on an invented SDK slug or on that incomplete discovery.
- Bank status labels, screenshots, JSON-shaped responses and unsigned callback booleans are not reusable authentication implementations. They can be fixture material only after their provenance and semantics are established.

## 5. Where the eventual code should go

The following is a destination map, not a declaration that all new modules exist or that their creation is approved for the current core release.

| Existing destination / explicitly proposed addition | Appropriate upstream contribution | Boundary to preserve |
|---|---|---|
| `docs/execution/profiles/01-proof.md` | TLSN exact release/artifact matrix; Reclaim and email alternatives; license/notary/source decisions | Research choice does not enable provider availability |
| `packages/proof-jobs/src/provider-boundary.ts` | Future registration only after a reviewed provider implementation/profile | Keep early `UNSUPPORTED_PROVIDER` for unselected providers |
| `packages/proof-jobs/src/supervisor.ts`, `budget.ts`, `protocol.ts` | Extend measurements/compatibility for real upstream worker artifacts | Do not replace existing limits, consent or parent-owned lifecycle with SDK defaults |
| `packages/proof-inputs/src/types.ts`, `parsers.ts` | Shared bounded structural contract; independent malformed-input fixtures | Parsed input remains unauthenticated; no automatic `proofVerified` promotion |
| **Proposed** `packages/proof-tlsnotary/src/{adapter,source-policy,statement,verify}.ts` and provider worker | TLSN bindings, exact disclosure/source mapping, independent verification | Separate bank session/prover from custody; all network governed by transport policy |
| **Alternative proposed** `packages/proof-reclaim/` or `packages/proof-email/` | Vendor-specific receipt verification or DKIM/circuit integration | Separate trust/source policy and typed evidence per protocol family |
| `packages/arbitration/src/payment-assertions.ts` plus its tests | Qualified advisory evidence with source/profile/statement version and historical observation | Evidence authenticity does not grant escrow release or claim fiat irreversibility |
| Existing proof-inputs/proof-jobs/arbitration test directories | ZKP2P domain/replay invariants, Peer Link lossless mapping, TLSN/Reclaim independent fixtures | Do not relabel public synthetic tests as real-bank or mobile qualification |

### Proposed sequence when this optional lane is selected

1. Reconcile PR26 and PR27 against the current head, then retain existing completed work. Freeze one rail, currency, source endpoint and statement; choose bank status semantics before choosing a convenient SDK demo.
2. Decide whether source authentication will use TLSNotary, Reclaim or signed email. Pick a single provider for the first qualification slice. Record trusted roots/notary keys, rotation, source coverage, challenge/commitment encoding, artifact hashes and licenses together.
3. Build the proposed provider adapter against public synthetic fixtures. Integrate through the existing extension/transport/resource boundaries. Preserve the ability to reject unsupported configuration without collecting a witness.
4. Obtain independent producer/verifier fixtures and provenance, not two tests sharing the same parser/hash helper. Validate field coverage, exact units/time, replay/domain binding and disclosed/private separation.
5. Resolve the host/CSP and production lifecycle prerequisites in section 3A, then qualify real artifacts under that selected execution profile and document measured memory/CPU/network/cancellation behavior. Failure of current budgets is a profile feasibility finding, not a reason to silently relax them.
6. Define the downstream advisory evidence consumer and its unsupported states. Any settlement-authority change requires its own contract scope and review; the first proof integration does not imply one.

## 6. Independent acceptance criteria for the missing feature

A future implementation should provide evidence for these criteria, rather than a checklist checked from code inspection:

- **Source:** exact approved origin/path, authenticated session/protocol identity and response/request coverage; unapproved redirects/sources rejected. No extra fields can acquire authority solely because they appeared beside a proof.
- **Statement:** all asserted amount/currency/status/time/beneficiary/reference fields are authenticated and correctly interpreted. Original units and normalized units reconcile exactly; no float, implicit timezone, undocumented locale or rounded amount acceptance.
- **Binding:** statement ties to exact accepted terms, trade, chain/deployment, policy version, disclosure digest and challenge. Replays have explicit policy-defined rejection and persistence semantics.
- **Crypto:** verifier, keys, circuit/setup/public signals where applicable, signature domain and canonical encodings are pinned. Independent golden vectors include accepted and rejected cases. No claim that a protocol's audit automatically covers the target adapter.
- **Privacy:** cookies, credentials, TLS/session secrets, private salts and unrelated account history never enter public evidence, generic backups, analytics or logging. Provenance/fixture artifacts have explicit “schema only” versus “authenticated evidence” labels.
- **Runtime:** all provider activity is accounted for by existing lifecycle/resource policy; cancellation, process termination, stale results and reconnects preserve generation ownership. Measured target browsers and mobile platforms are named; unsupported clients remain unavailable.
- **Consumer:** a qualified proof produces typed historical advisory evidence, and the existing assertions model accepts/rejects/conflicts it deterministically. The user-facing result never equates “cryptographically verified statement” with “fiat payment can never reverse.”

## 7. Research limits and reproducibility

Primary sources used were repository metadata, commit endpoints, recursive trees, selected source/manifests/licenses and official product/bank documentation. The selected source files were read; other paths explicitly identified as tree-only surfaces need a focused implementation review before reuse. No repositories were built, vendor SDKs installed, tests executed, smart contracts deployed or external services provisioned. Source inspection therefore supports architecture and intake decisions, not a new verification badge or production-readiness claim.

The retrieval failures above are retained to prevent invented references from entering an implementation plan. Upstream commit pins and license URLs should be rechecked when the work begins; newly added license files, release changes, archived status or endpoint policies could alter the recommendation. Preserve the examined pins in the eventual adoption record even if a newer approved release is selected.
