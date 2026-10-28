# G16 browser review disposition and native-provider attribution

Documentation reconciliation recorded 2026-10-27 UTC. This records an existing review and historical execution; it adds no implementation, test run, provider-policy change, app inclusion or approval.

## Exact review and execution pins

Fresh-context reviewer: **Codex GPT-6 Astra**, `/root/p2p_g16_browser_boundary_review`, 2026-10-26. One read-only review; the reviewer reported no edits, tests, builds, network operations or child workers. The coordinator records the recommendation as engineering input, not unconditional acceptance or owner approval.

- Reviewed HEAD: `673006c1a9cb1e8a1e6eb1a665738b5312f3edc2`; tree `8bea687ecee68c8680000269cb266a98b0eb3b36`.
- Browser source/evidence commit: `626d82e084c306c29e54cc33e4f59a5cd7e3104d`; tree `bc73d306f7d7ff014169977a7fe6aeb1fac8abb2`. The following commit was receipt/status documentation only.
- Retained evidence: `../evidence/P2P_G16_BROWSER_20261026.json` and seven terminal/log records under `../evidence/p2p-g16-browser-20261026/`. The reviewer reported matching all twelve source/fixture hashes and raw/compressed log hashes; this reconciliation did not rerun them.
- Recorded execution: Node24.19.0, headless Chromium154.0.8037.57 on Linux, document and dedicated module Worker;153assertions each,28focused/379aggregate/5build-policy passes and strict types/build/boundaries. These remain recorded evidence, not new execution or assurance totals.
- Previous private delivery: `libfile_b5734354657c81919d25ed4930348dc9`, version8,498472bytes, SHA-256 `44b883a8b8095f79bc34eeb07cb59fa5d39530e2c643ac75ac62fedb5e5d988f`. A later documentation checkpoint must retain those exact bytes.

## Conditional recommendation

The reviewer **conditionally recommends** the exact pinned public-data Keccak-256 and bounded secp256k1 EOA-recovery configuration for a **test-only offline agreement-consistency preview**. No critical defect was established in the evaluated private verifier. App exclusion stays in place until the ordinary implementation/validation conditions below are met. This does not accept identity/private-key signing, key generation, custody, chain authority, spending or other Noble algorithms.

Pre-inclusion findings and conditions, not claims of current app exposure:

1. **Typed protocol:** add a discriminated command/result and fixed error handling. Existing runtime success falls through to `RuntimeStatus`; verifier outcomes must neither mutate vault status nor be misreported as storage failure.
2. **Intake bounds:** bound exact fields, lengths, arrays and aggregate input before encoding/posting/structured cloning, then revalidate in Worker. Existing domain text is encoded before its byte limit; the separate Claude assignment below owns that narrow correction. Existing decimal regexes are already length-bounded; no integer defect is inferred.
3. **Lifecycle/privacy:** Worker owns abort/generation/job identity, one-job/timeout rules and final-reply guards. Cover actual transport cancellation, replaced inputs, route exit, pagehide, lock/disposal and stale responses. Avoid retaining full private payloads in pending metadata. Imported callbacks or approval flags cannot supply authority.
4. **Package/UI boundary:** use a narrow package facade imported by Worker composition; document code gets explicit commands/public view models. A user-triggered local consistency result is not payment, current terms, approved deployment, funding eligibility, physical identity, capability-policy activation or EIP-1271 support. No new file/QR format, transport or financial default is implied.
5. **Actual enabled artifact:** add exact request/result/error, malformed/oversized, privacy-sentinel and stale-response tests plus emitted document/Worker graph and UI acceptance. The existing fixture is a separate Vite ES2023 library, not qualification of a future app artifact.
6. **Attribution:** record native uses and evaluated browser scope without inheriting unrelated vault/identity reviews or promoting inventory states. Firefox/WebKit/mobile/physical devices remain unassessed.

G16's authenticated-encrypted-negotiation rule governs sharing; a transient local check does not introduce a sharing channel. The missing reviewed funding ABI does not block this narrow mathematical recommendation. ABI/native-profile, registry/deployment/trust, nonce/time/finality and custody gates remain mandatory for protocol/funding claims. No waiver or G16/G22 completion follows.

## Provider and primitive attribution

| Actual use | Exact source/evidence | Disposition and limit |
| --- | --- | --- |
| Noble Keccak-256 for public terms/address derivation | `@noble/hashes`2.4.0; source pin `663c2aeeffc308ac0cded59bd32f7c212adacfc2`; `security/crypto-inventory.json`; `G06_UPSTREAM_REVIEW_2026-10-26.md`. | Existing named Node-scoped public-data engineering acceptance. This browser recommendation is conditional; no broader algorithms/provider/app approval. |
| Noble secp256k1 EOA public-key recovery | `@noble/curves`2.4.0; source pin `656c4364dffa44c64aa0c49914b8000b278b67a9`; same inventory/review. | Bounded65-byte low-s EOA recovery only. No browser private-key signing, ECDH, identity derivation or contract-wallet qualification. |
| Native SHA-256 of encoded private agreement/capabilities | `packages/domain/src/trade-terms.ts:194` defaults to browser `crypto.subtle.digest('SHA-256', bytes)`; used by `evm-agreement.ts`. Recorded Chromium document/Worker checks include two retained Python-implementation private/capability commitments and held native hash calls. | Browser built-in, not a Noble primitive or npm version. Actual use is attributed here; a dedicated G16 native-SHA inventory entry/profile is not added or accepted by this documentation change. No CAVP/full provider audit claim. |
| Native randomness for diagnostic correlation | `packages/domain/src/errors.ts:9`, `createOperationId`:16-byte `crypto.getRandomValues`, then clear; unavailable RNG falls back to a diagnostic sequence. Reached by the complete verifier. | IDs are explicitly not keys, nonces, intents, capabilities or authorization. The fallback is diagnostic only. Invocation is source-attributed; no entropy-quality, key RNG or secret-bearing provider qualification is claimed. |

The former sentence saying no randomness is invoked has been corrected. Native SHA-256 and diagnostic RNG are not silently covered by public Keccak/secp recovery acceptance. Security inventory/browser-support files remain unchanged; current `browser-support.json` describes G02, not formal G16 enablement.

## Fixture independence and privacy limits

- External published Keccak/EIP-712 Mail expected values and six separately implemented non-Noble js-sha3/elliptic public G16 digests/four signatures already exist, with retained source/version/hash provenance and recorded OpenSSL cross-checks. They are not missing; separate implementation is not an external audit claim.
- Two private encoding/SHA-256 expectation fixtures came from the recorded Python implementation: independent implementation with shared authorship.
- Three coherent complete bundles are prepared in Node using the existing Noble-family deterministic public synthetic test recipe. They are same-provider integration/parity fixtures, not independently qualified complete bundles.
- Golden hashes remain: EIP712/Keccak `88e7a0c0d7cc82c0e5a73026d1e8afff2b427b5240abc3ab2182e8a20dd9d828`; public G16 `e876b2f6ee1cb8a2088d64215749038b55ecfbfe66877860eb6f27561370db70`; private/Solana `c53e04a786c2d74b7aefe7e2ed03178c202f32beb6d51de0c437de508b29b5af`.
- Owned SHA input-array clearing is observed, including private bytes before the later capability hash. Caller strings, encoder/crypto temporaries, signature-copy internals and physical heap erasure are not proven. No side-channel/RNG/exhaustive primitive audit or representative-device acceptance.

## Reserved assignment and restart

Claude broker assignment **P2P-G16-PREALLOC-01** has returned an unexecuted/unvalidated proposal: `libfile_79762651b9248191825f75d46520a9b0` version0, SHA-256 `53b97a313f52a054eecfc81ef004c6cf53fe99c75f1474412bd6f1f417fcce46`, request `req_011CgRk5c4hn9ntunsGVB6dD`. Intake follows this documentation checkpoint; no proposal bytes were consumed or applied for this reconciliation. Packet `libfile_1505c877c3708191bcacc035dabece07` version0,34110bytes/452lines, SHA-256 `91a298757e45bc0ff77e7c365839e426a21ccd2a8679c7cdfae1c28931d675bc`; native text readback was byte-verified. Exact packet base is reviewed HEAD673006c above. A documentation-only descendant does not change that source base.

Reserved paths remain byte-unchanged from that base:

- `packages/domain/src/trade-terms.ts`: `7e29fa2011ca83a59dde45aed06afe814a5a0a280c9e88875c2c533276ba793d`.
- `packages/domain/test/trade-terms.test.mjs`: `8b748874fb626e680ffd2957a6ccb0f7564754a6307bfee2e98db97b74ed6c4c`.

The coordinator remains sole P2P integrator; no duplicate solution, tests/builds or source edits occur in this reconciliation. On proposal arrival, validate artifact/allowed paths, independently apply test hunks for the real RED, then the minimal implementation and actual affected checks. Do not transfer the old test counts to the proposed source. No separate paid calls or budget reset; broker owns the shared spend ledger. No GhostPay access/work, source publication/CI, deployment or app inclusion.
