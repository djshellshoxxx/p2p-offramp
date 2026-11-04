# Nostr, relay, messaging and private transport: upstream reuse dossier

Research snapshot: 2026-11-04 UTC / 2026-11-03 America/Vancouver. Repository: `djshellshoxxx/p2p-offramp`. This is source research and integration guidance, not implementation, a completed security review or evidence of passing tests. No production feature, dependency, network endpoint, wallet connection or release flag was changed during this work.

## 1. Decisions that help finish the actual unfinished work

**The immediate problem is a production peer acceptance carrier, not a missing Nostr encryption library.** The project already implements NIP-44, NIP-59, a restricted NIP-17 profile, a bounded relay pool, explicit publication outcomes, encrypted durable chat history and session transport policy. PR26 also has a private EVM agreement input/parser/verifier. Its success is explicitly `testOnly: true` and `economicPreparationAllowed: false`. The interoperable peer message carrying the two native wallet acceptances remains unselected. The existing `terms-accept` body is exactly `{revision}`; treating it as financial authorization would skip the missing contract. [T1], [T2], [T3], [T4], [T5], [T6], [T7], [T8]

Recommended near-term reuse:

1. Keep the existing implementation and use **`nostr-tools` plus Rust Nostr as pinned interoperability oracles** for the application's selected NIP subset. Add missing independent fixtures to the existing test locations. They do not decide the application's acceptance semantics.
2. Reuse **the existing real-socket relay harness and `ws` receiver intake**. Despite its name, `fake-relay.mjs` already uses HTTP upgrade and actual TCP sockets, and `pool.test.mjs` already tests missing acknowledgment without replay. The separate `ws` 8.22.1 intake records 6/6 passing finite Node cases. Extend these artifacts only for a demonstrated missing case; do not create a parallel harness or repeat intake. Node receive limits still do not bound allocation in a browser's native `WebSocket` implementation. [T22], [T23], [T24], [T25]
3. Reuse **the existing NIP-44 vector corpus**. It is already present with provenance. Do not create a duplicate corpus or silently change its intentionally restricted length profile.
4. Use **NDK as a reference for relay-selection and message-copy behaviors**, not a drop-in runtime pool. Its fallback behavior needs different policy from this project.
5. Keep **Waku, XMTP, Helia/IPFS, Webtor and I2P optional**. Preserve existing Waku codec intake (13/14 with a retained signed-minimum failure) and XMTP passive artifact comparison (source/published mismatch; no coherent runtime candidate). Those are completed research artifacts, not missing generic intake or provider qualification. Each runtime integration still needs a selected profile and broker/lifecycle evidence. None resolves the peer-signature carrier by itself. [T26], [T27]

The proposal in PR27 asks the project to stop expanding optional reference implementations until the core journey leaves LOCALPROOF. This research can inform that decision without adding optional packages. PR27 is a draft proposal, not an already merged implementation directive. [T9]

## 2. Target baseline and what is already implemented

| Snapshot | Exact revision | Meaning for this research |
|---|---|---|
| Main | [`e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`](https://github.com/djshellshoxxx/p2p-offramp/commit/e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa) | Merged reference state inspected. |
| PR26 | [`94554ecf9854e4604f9f56afe5bebedeee931994`](https://github.com/djshellshoxxx/p2p-offramp/commit/94554ecf9854e4604f9f56afe5bebedeee931994) | Large unmerged local-completion branch. Its changed transport, relay and durable-history work must be reconciled before implementation. |
| PR27 | [`2f839b12768700ac6c3b674f75a144c6ec19fa93`](https://github.com/djshellshoxxx/p2p-offramp/commit/2f839b12768700ac6c3b674f75a144c6ec19fa93) | Draft execution prompt; reviewed for prioritization context. |

`packages/exchange/src/messages.ts` and `exchange.ts` have the same blob contents across the main and PR26 tree snapshots. PR26 changes `packages/messaging/src/durable-chat.ts`, `packages/relay/src/pool.ts` and `packages/transport/src/policy.ts`. References below use PR26 for integration targets so that a future implementation does not overwrite that work with assumptions from main. Tree identities were used only for comparison; upstream source pins in this report were confirmed through branch commit records, not inferred from a Git tree object's SHA.

| Existing target and actual behavior | Remaining task | Appropriate upstream contribution |
|---|---|---|
| [`messages.ts`][T1]: `ExchangeEnvelopeV1`, `parseEnvelope`, `encodeEnvelope`; `EXCHANGE_TOPIC = p2p-offramp-terms-v1`; exact per-message body validation. [`exchange.ts`][T2]: `createTermsExchange`, revision, sender and state checks. | Select a new explicit peer wire profile for native wallet acceptances. Do not append signatures to the current body or smuggle them through arbitrary chat text. | Protocol design is local. Nostr libraries supply transport interoperability fixtures after the profile is selected. |
| [`evm-agreement-input.ts`][T4], [`evm-agreement-protocol.ts`][T5], [`evm-agreement.ts`][T6]: private, bounded structural snapshots and `verifyEvmAgreementBundle`. | Composition with authenticated remote peer input; peer wire definition, identity binding, compatibility and independently reproduced evidence. The private worker protocol is not the peer protocol. | Reuse existing verifier after a selected adapter translates authenticated peer data into its exact input. Do not replace it with an upstream chat success flag. |
| [`nip44.ts`][T10], NIP-17/59 source and tests under `packages/nostr-crypto`. | More independent interoperability evidence for the selected subset, error normalization and boundary behavior. | `nostr-tools`, Rust Nostr, the already vendored NIP-44 vectors. |
| [`pool.ts`][T11]: `createRelayPool`, `RelayConnector`, accepted/rejected/unknown publication results; session broker integration. Real HTTP-upgrade/TCP fixtures and the missing-ACK/no-replay case already exist. [T22], [T23] | Only a demonstrated gap in existing transport/interoperability evidence; browser preallocation and production companion qualification remain unresolved. | Reuse the existing harness and `ws` intake [T24], [T25]; selected behavior comparisons with `nostr-tools`/NDK. Preserve local lifecycle and explicit-send policy. |
| [`durable-chat.ts`][T12]: `createDurableTradeChat`, encrypted bounded history, duplicate and receipt handling. | Validate restart, duplicate receipt, cancellation and stale-session behavior in the actual app composition. | Cross-client incoming fixtures; do not introduce an unrelated SDK database merely to obtain chat persistence. |
| [`policy.ts`][T13]: `SessionTransportPolicy`; [`http-driver.ts`][T14]: `BoundedHttpDriver`. | Qualify each concrete optional route and every SDK-owned subconnection; route labels alone are insufficient. | Optional provider-specific adapters only after qualification; no unmanaged SDK default transport. |
| Waku, XMTP, Tor/I2P and IPFS specifications already exist. [T15], [T16], [T17], [T18] Waku codec and XMTP passive-artifact intake also exist. [T26], [T27] | Selected runtime/profile qualification, preserving the Waku conformance failure and XMTP artifact mismatch; ordered after core blockers. | Candidates in sections 5–6; all optional. Extend existing evidence only for a named unresolved case. |

Existing dependencies matter: the root package already pins `@noble/ciphers`, `@noble/curves` and `@noble/hashes` at 2.4.0. The local Nostr provider uses messaging-key operations; these should remain distinct from wallet spend authority and vault keys. Adding another library that ultimately calls the same primitives is not independent cryptographic assurance. [T19]

## 3. D1: the production peer acceptance carrier

### The missing decision is concrete

PR26's `peer-acceptance-carrier.proposal.json` has `proposedVersion: "pending-selection"`, empty compatible reader/writer sets and `status: "draft"`. Its decision record remains `status: "proposed"` with no reviewers. `PENDING-DECISIONS.md` explicitly distinguishes the kind-14 `{revision}` acknowledgment from the private verifier input containing two `{termsHash, role, walletAccount, signature}` entries. [T3], [T7], [T8]

That distinction should drive the next task. **Do not label the private schemas or native verification function as absent.** The unresolved work is selecting and implementing the remote carrier and proving its composition with those existing components.

### Suggested next implementation packet

**Priority P0, complexity medium/high:** write and select the exact carrier profile before choosing any new runtime package. Use the existing signed-terms specification as the authority for native bytes and the pending-decision packet for unresolved policy. [T3], [T20]

The packet should define:

- A version/discriminator and complete content/tag grammar, with old/new reader and writer behavior. The final name/version is a maintainer decision; this report does not select it.
- Which signed terms, domain and deployment profile are carried or referenced; exact native signature representation and permitted account verification paths. EOA and EIP-1271 are separate paths, not interchangeable encodings.
- How the authenticated Nostr sender, claimed seller/buyer role and native wallet account are bound. Authenticating the Nostr seal alone does not establish wallet consent.
- Binding to order, revision, counterparties, expiry and the exact terms digest, including the selected G14 capability commitment mapping. The current G14-to-G16 mapping itself remains a separate pending decision.
- Byte/count limits before decoding and cryptographic work; stable public error codes; duplicate, conflict, replay and unknown-send handling.
- Freshness and lifecycle after session generation change, lock, wallet change, transport disposal and cancellation. A successful local send does not prove remote acceptance; cancellation cannot retract already transmitted bytes.

The expected flow is an authenticated Nostr message, then the selected bounded peer parser, then native consent verification with the correct approved domain and terms, then an explicit communication receipt/state transition. Funding authority must remain governed by the separate native and release gates. PR26's pending-decision packet also identifies the existing escrow ABI's off-chain-consent model; this carrier task must not silently add signature arguments or claim that the deployed contract verifies them. [T3], [T6], [T20]

**Exact destinations:** `packages/exchange/src/messages.ts` and `exchange.ts` are the wire/state integration points; a distinct parser/module for the newly selected profile is preferable to loosening the existing parser. `packages/schemas/src/evm-agreement-input.ts` and `packages/wallet/src/evm-agreement.ts` are existing native-check boundaries. `packages/exchange/test/exchange.test.mjs` and `async-boundaries.test.mjs` should test the composition. Place the selected profile/decision next to the existing G16 specification and governance carrier records. Any new filename is a proposal, not a file created by this research.

**Required evidence:** two independently implemented clients exchange the same frozen fixtures; reject swapped roles/accounts, stale revisions, wrong domain/deployment, altered private/capability commitments, unrelated messaging identities and unsupported account types. Replaying an already accepted envelope must not produce a second acceptance or economic action. Unknown relay outcome remains unknown until explicit reconciliation. Verify that a kind-14 acknowledgment without the native signatures cannot advance the native-consent gate. These are acceptance criteria, not claims that tests were run.

## 4. Upstream inventory, source pins and license evidence

These are **evaluated default-branch snapshots**, not a claim that every pin is the latest release. Dates are the branch-head commit dates observed through GitHub; a recent commit is maintenance evidence, not a security certification. All listed repositories were unarchived in the inspected repository metadata.

| Candidate | Evaluated commit and date | Verified licensing scope | Decision / effort |
|---|---|---|---|
| `nbd-wtf/nostr-tools` | [`a59c053e820d58bfc85372612d1515b7cdd9fa5c`](https://github.com/nbd-wtf/nostr-tools/commit/a59c053e820d58bfc85372612d1515b7cdd9fa5c), 2026-11-02 | [`LICENSE`](https://github.com/nbd-wtf/nostr-tools/blob/a59c053e820d58bfc85372612d1515b7cdd9fa5c/LICENSE): Unlicense. Source package version 2.25.5. | Adopt as development oracle; selectively adapt helpers only if needed. Low/medium for fixtures, high for pool replacement. |
| `paulmillr/nip44` | [`671a1f04bcfacaf125b0db68adc45bc9ce0e763b`](https://github.com/paulmillr/nip44/commit/671a1f04bcfacaf125b0db68adc45bc9ce0e763b), 2024-12-04 | [`javascript/LICENSE`](https://github.com/paulmillr/nip44/blob/671a1f04bcfacaf125b0db68adc45bc9ce0e763b/javascript/LICENSE): Unlicense; [`javascript/package.json`](https://github.com/paulmillr/nip44/blob/671a1f04bcfacaf125b0db68adc45bc9ce0e763b/javascript/package.json) instead says MIT. [`rust/LICENSE.txt`](https://github.com/paulmillr/nip44/blob/671a1f04bcfacaf125b0db68adc45bc9ce0e763b/rust/LICENSE.txt): MIT. Root vector-license scope remains unresolved. | Retain existing corpus/provenance. Low; do not add its older runtime dependencies. |
| `nostrdevkit/nostr` | [`4219c62179a6c097226c0d9092c185a3beb45c32`](https://github.com/nostrdevkit/nostr/commit/4219c62179a6c097226c0d9092c185a3beb45c32), 2026-11-03 | [`LICENSE`](https://github.com/nostrdevkit/nostr/blob/4219c62179a6c097226c0d9092c185a3beb45c32/LICENSE): MIT. | Adopt independent Rust fixture generator outside app runtime. Medium. |
| `nostr-dev-kit/ndk` | [`4b86acd13fe3c1284fddcb81a7f0d63e491db64a`](https://github.com/nostr-dev-kit/ndk/commit/4b86acd13fe3c1284fddcb81a7f0d63e491db64a), 2026-04-05 | [`LICENSE`](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/LICENSE): MIT. Repository push activity was observed in April 2026. | Pattern/reference only. Medium/high if adapted; reject wholesale substitution. |
| `websockets/ws` | [`335a610c216c982174e746ecec1db448c1a6ec1b`](https://github.com/websockets/ws/commit/335a610c216c982174e746ecec1db448c1a6ec1b), 2026-11-03 | [`LICENSE`](https://github.com/websockets/ws/blob/335a610c216c982174e746ecec1db448c1a6ec1b/LICENSE): MIT. | Reuse existing `ws` 8.22.1 intake and socket tests [T22], [T23], [T24], [T25]; this later source snapshot does not replace their pins. No new harness/intake absent a demonstrated gap. |
| `logos-messaging/logos-delivery-js` | [`0ca94f3c8beda0fba2962c3daae17b3ec689ae49`](https://github.com/logos-messaging/logos-delivery-js/commit/0ca94f3c8beda0fba2962c3daae17b3ec689ae49), 2026-02-05 | [`LICENSE-MIT`](https://github.com/logos-messaging/logos-delivery-js/blob/0ca94f3c8beda0fba2962c3daae17b3ec689ae49/LICENSE-MIT), [`LICENSE-APACHE`](https://github.com/logos-messaging/logos-delivery-js/blob/0ca94f3c8beda0fba2962c3daae17b3ec689ae49/LICENSE-APACHE); README offers MIT or Apache-2.0. Repository push activity observed May 2026. | Optional Waku adapter, defer. Preserve existing 13/14 codec result and failure [T26]. High runtime qualification effort. |
| `xmtp/xmtp-js` | [`8993ef24144532e53fdfcfd04eddf27dce8a5a53`](https://github.com/xmtp/xmtp-js/commit/8993ef24144532e53fdfcfd04eddf27dce8a5a53), 2026-08-13 | [`sdks/browser-sdk/LICENSE`](https://github.com/xmtp/xmtp-js/blob/8993ef24144532e53fdfcfd04eddf27dce8a5a53/sdks/browser-sdk/LICENSE): MIT, scoped to that SDK. Push activity observed October 2026. | Optional provider, defer. Same source candidate already covered by passive T90 intake; source/published mismatch and incoherent comparison lock remain blockers [T27]. High. |
| `ipfs/helia` | [`cba1ed69b4369924790d9eccdb8c9089435f4f20`](https://github.com/ipfs/helia/commit/cba1ed69b4369924790d9eccdb8c9089435f4f20), 2026-09-29 | [`LICENSE-MIT`](https://github.com/ipfs/helia/blob/cba1ed69b4369924790d9eccdb8c9089435f4f20/LICENSE-MIT), [`LICENSE-APACHE`](https://github.com/ipfs/helia/blob/cba1ed69b4369924790d9eccdb8c9089435f4f20/LICENSE-APACHE); `@helia/http` declares `Apache-2.0 OR MIT`. | Distribution tooling / constrained HTTP pattern; defer runtime node. Medium/high. |
| `ethereum/webtor-rs` | [`16e6f6af01071a8bb46f4a8b60f387e35b17a9f9`](https://github.com/ethereum/webtor-rs/commit/16e6f6af01071a8bb46f4a8b60f387e35b17a9f9), 2026-11-03 | [`Cargo.toml`](https://github.com/ethereum/webtor-rs/blob/16e6f6af01071a8bb46f4a8b60f387e35b17a9f9/Cargo.toml) declares MIT; no root license file found in the inspected tree. Vendored Arti licenses do not resolve root coverage. | Research prototype only; license intake hold, defer activation. High/very high. |
| `i2p/i2p.i2p` | [`fa17f27fd3eb981621580f811b8a9de780a35af3`](https://github.com/i2p/i2p.i2p/commit/fa17f27fd3eb981621580f811b8a9de780a35af3), 2026-11-02 | [`LICENSE.txt`](https://github.com/i2p/i2p.i2p/blob/fa17f27fd3eb981621580f811b8a9de780a35af3/LICENSE.txt): composite public-domain and separately licensed components. HTTP tunnel file is GPL with an exception; SAM handler declares public domain. | External-router integration/reference, not browser code to vendor. Optional, high qualification effort. |

Licenses above were read at the exact pinned refs. Preserve required notices for any copied source and inspect transitive dependencies/artifacts separately. The target has no root LICENSE in the inspected main tree, and its escrow sources have their own licensing. This dossier therefore does **not** declare blanket project compatibility. It identifies plausible reusable scopes and the specific unresolved intake questions. An SPDX string in package metadata is useful evidence but is not equivalent to examining all relevant terms.

## 5. Near-term candidates in depth

### 5.1 `nostr-tools`: strongest TypeScript interoperability reference

Source locations: [`nip59.ts`](https://github.com/nbd-wtf/nostr-tools/blob/a59c053e820d58bfc85372612d1515b7cdd9fa5c/nip59.ts), [`nip17.ts`](https://github.com/nbd-wtf/nostr-tools/blob/a59c053e820d58bfc85372612d1515b7cdd9fa5c/nip17.ts), [`nip44.ts`](https://github.com/nbd-wtf/nostr-tools/blob/a59c053e820d58bfc85372612d1515b7cdd9fa5c/nip44.ts), [`abstract-pool.ts`](https://github.com/nbd-wtf/nostr-tools/blob/a59c053e820d58bfc85372612d1515b7cdd9fa5c/abstract-pool.ts), [`abstract-relay.ts`](https://github.com/nbd-wtf/nostr-tools/blob/a59c053e820d58bfc85372612d1515b7cdd9fa5c/abstract-relay.ts).

`createRumor`, `createSeal`, `createWrap`, `wrapEvent` and `unwrapEvent` provide concrete reference encodings. `unwrapEvent` checks the seal's signature and the rumor/seal public-key match. `wrapManyEvents` demonstrates generating recipient and sender copies from one rumor. These are useful comparisons for the project's own NIP-59/17 helpers and durable-history deduplication. They still require the project's stricter event/body limits and exact trade grammar.

**Adopt:** a pinned development-only fixture/oracle dependency or standalone generator. Write deterministic fixtures with synthetic keys/nonces and freeze their output. Feed the fixtures through `packages/nostr-crypto/test/nip17.test.mjs`, `nip59.test.mjs`, `relay-event-crypto.test.mjs`, `packages/messaging/test/envelope.test.mjs` and `durable-chat.test.mjs`. Do not ship test keys or generators in the application graph.

**Do not drop in the pool:** `AbstractSimplePool.publish` can retry publication after an authentication-required response. The relay implementation reconnects/resubscribes. Reconnecting reads may be appropriate, but resubmitting a publication is a separate authority decision. Its injectable WebSocket implementation does not by itself supply this project's permits, resource ownership, generation cancellation or redacted diagnostics. Preserve `createRelayPool`'s explicit accepted/rejected/unknown model and inspect any adapted code at those boundaries.

**Compatibility trap:** current `nostr-tools` supports NIP-44's extended length prefix for plaintexts of 65,536 bytes and above. The target explicitly supports only 1–65,535 bytes. Compare the common declared subset and retain negative fixtures for the unsupported extension. Do not mistake an intentional narrower profile for an implementation failure or import the upstream maximum allocation policy.

### 5.2 `paulmillr/nip44`: retain existing protocol vectors

The target already vendors the official original-v2 [`nip44.vectors.json`](https://github.com/paulmillr/nip44/blob/671a1f04bcfacaf125b0db68adc45bc9ce0e763b/nip44.vectors.json). Its local [`NIP44-VECTORS-PROVENANCE.md`][T21] records the same pin, byte count and checksum, and describes the selected 65,535-byte ceiling. Use that provenance record as the intake point rather than creating a second copy.

The repository's [`javascript/index.ts`](https://github.com/paulmillr/nip44/blob/671a1f04bcfacaf125b0db68adc45bc9ce0e763b/javascript/index.ts) and [`rust/src/lib.rs`](https://github.com/paulmillr/nip44/blob/671a1f04bcfacaf125b0db68adc45bc9ce0e763b/rust/src/lib.rs) are useful original-profile references. The JS package still pins older noble versions; adopting those runtime dependencies would not be a completion improvement. The older 2024 snapshot is useful as a stable protocol reference, not evidence of a recently maintained application SDK.

**License limitation:** the JS directory license text and package metadata disagree, and there is no root license covering the entire repository visible at this pin. The target already leaves a named vector-license review pending. Preserve that unresolved status; the mere existence of a permissive license in a subdirectory does not prove that all root test data shares it.

### 5.3 Rust Nostr: a second language for independent fixtures

The canonical repository observed is **`nostrdevkit/nostr`**, not the older `rust-nostr/nostr` locator. GitHub returned a move for the older path; repository ID 563266322 resolved to the current name. Avoid writing future intake records solely against the obsolete owner path.

Source: [`nostr/src/nips/nip59.rs`](https://github.com/nostrdevkit/nostr/blob/4219c62179a6c097226c0d9092c185a3beb45c32/nostr/src/nips/nip59.rs), [`nostr/src/nips/nip44/v2.rs`](https://github.com/nostrdevkit/nostr/blob/4219c62179a6c097226c0d9092c185a3beb45c32/nostr/src/nips/nip44/v2.rs), [`nostr/Cargo.toml`](https://github.com/nostrdevkit/nostr/blob/4219c62179a6c097226c0d9092c185a3beb45c32/nostr/Cargo.toml). The inspected crate metadata is version 0.45.6, with Rust secp256k1 and ChaCha dependencies. `ConversationKey`, `encrypt_to_bytes_with_nonce` and the decryption routines provide a distinct implementation path for reproducible fixtures.

**Adopt:** a small, isolated development fixture generator with a pinned Rust toolchain and Cargo lock; store its inputs, command, source commit and outputs with the existing Nostr test evidence. Cross-decrypt with the target and `nostr-tools`; compare envelope structure, public-key bindings and error disposition independently. This improves implementation diversity, but it is still not an external audit.

Its current implementation also supports extended NIP-44 lengths. Keep fixture generation within the target's declared subset, with explicit extension-rejection cases. Adding Rust/WASM to the browser runtime is unnecessary for this use and would add an artifact qualification task.

### 5.4 NDK: useful behavior reference, unsuitable default policy

Source: [`messages/src/protocols/nip17.ts`](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/messages/src/protocols/nip17.ts) and [`core/src/relay/pool/index.ts`](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/relay/pool/index.ts).

`NIP17Protocol.sendMessage` illustrates sender/recipient gift-wrap copies and DM relay discovery. The inspected path falls back from a user's kind-10050 DM relay list to kind-10002 relays, then to connected relays. That is a useful comparison for availability UX, but it cannot become implicit endpoint authorization in a strict G05 session. `unwrapMessage` also logs exceptions, so importing it unchanged would not preserve fixed redacted error handling. Its NIP-17 implementation imports `nostr-tools`; it should not be counted as a third independent primitive implementation.

**Pattern-only:** document relay-selection cases next to `packages/relay/src/pool.ts` and the NIP-17 spec/tests. Any candidate discovery result should remain untrusted until the local policy admits it. Do not confuse NDK's Nostr “outbox” relay-selection model with a durable financial command outbox or permission to resend unknown transactions.

### 5.5 `ws`: existing receiver intake and socket tests

Source: [`lib/receiver.js`](https://github.com/websockets/ws/blob/335a610c216c982174e746ecec1db448c1a6ec1b/lib/receiver.js) and [`README.md`](https://github.com/websockets/ws/blob/335a610c216c982174e746ecec1db448c1a6ec1b/README.md). The receiver applies `maxPayload` checks to aggregate message data, including decompressed message size. The README explicitly says the package does not work in browsers.

**Existing work to preserve:** [`fake-relay.mjs`][T22] already implements a local HTTP upgrade and minimal RFC 6455 frames over actual TCP sockets. [`pool.test.mjs`][T23] already contains the T100 missing-ACK/no-replay case: it observes one received EVENT, an `unknown` timeout outcome, no automatic resend and no restarted subscription. The separate [`security/intake/relay-transport/README.md`][T24] records 6/6 passing finite Node receiver cases using `ws` 8.22.1, including payload/fragment limits and owned socket/server cleanup. Its [`pins.json`][T25] records package, installed-tree, source, license and registry evidence. Those recorded results were inspected, not rerun for this dossier.

**Decision:** extend the existing tests/intake only after identifying a concrete uncovered behavior or evaluating a separately selected version/profile. Do not add a parallel relay harness, repeat the accepted missing-ACK case, redo intake without a reason, or silently replace the intake's package/source pins with this report's newer upstream snapshot. The existing intake grants no browser companion, G05 route or production adapter; those remain separate unselected work.

**Unresolved:** the browser can allocate a complete WebSocket message before application parsing. A parser cap after delivery is not a preallocation cap. MDN confirms the standard WebSocket API lacks backpressure; WebSocketStream has different support constraints and WebTransport requires a compatible server/protocol. None is a drop-in completion of the existing NIP-01 browser transport. [W1] A Node relay limit controls that relay, not every public relay the browser could contact. Preserve the documented residual limit unless a concrete incremental browser transport/profile is implemented and independently qualified.

## 6. Optional transport and distribution candidates

### 6.1 Waku / Logos delivery JS

The old `waku-org/js-waku` locator returned a repository move; stable repository ID 346526277 resolved to **`logos-messaging/logos-delivery-js`**. This is relevant to the existing [Waku order-relay adapter specification][T15].

Source: [`packages/sdk/src/index.ts`](https://github.com/logos-messaging/logos-delivery-js/blob/0ca94f3c8beda0fba2962c3daae17b3ec689ae49/packages/sdk/src/index.ts), [`create/create.ts`](https://github.com/logos-messaging/logos-delivery-js/blob/0ca94f3c8beda0fba2962c3daae17b3ec689ae49/packages/sdk/src/create/create.ts), [`create/libp2p.ts`](https://github.com/logos-messaging/logos-delivery-js/blob/0ca94f3c8beda0fba2962c3daae17b3ec689ae49/packages/sdk/src/create/libp2p.ts), [`reliable_channel/reliable_channel.ts`](https://github.com/logos-messaging/logos-delivery-js/blob/0ca94f3c8beda0fba2962c3daae17b3ec689ae49/packages/sdk/src/reliable_channel/reliable_channel.ts), [`retry_manager.ts`](https://github.com/logos-messaging/logos-delivery-js/blob/0ca94f3c8beda0fba2962c3daae17b3ec689ae49/packages/sdk/src/reliable_channel/retry_manager.ts).

`createLightNode`, Filter, LightPush and Store are real discovery/message facilities. `defaultLibp2p` configures multiple underlying services and WebSocket/Noise/multiplexing behavior. The reliable-channel implementation adds retry and retrieval policies; its inspected defaults include ten retries. These are not policy-neutral utilities and cannot inherit the application's explicit-send guarantee merely by being wrapped in one top-level function.

**Existing evidence:** [`security/intake/waku/README.md`][T26] already records an isolated evaluation of `@waku/proto` 0.0.15 with `protons-runtime` 5.6.0: 13/14 cases passed, with a retained conformance failure encoding the valid `sint64` minimum. The independent oracle's value decodes correctly, while this resolved encoding path produces the wrong value; the candidate is unsupported for complete `sint64` encoding. The packet also records exact codec/source/license provenance and no node/peer/gateway construction. Its full SDK 0.0.37/core 0.0.41 registry queries returned 404. Codec intake is completed research, not full SDK lifecycle or G05 qualification. Preserve the failing expectation and pinned graph; do not repeat generic codec intake, replace dependencies to hide the result or describe all cases as passing.

**Defer runtime integration.** If selected later, start with a dedicated adapter beneath the existing Waku spec and G05 transport interfaces. First prove that endpoint discovery, bootstrap, reconnect, filter/store requests and disposal are all accountable to session policy. An opaque internal dialer means strict mode is unsupported, not that the SDK is “private.” Select content-topic and application-envelope semantics separately; encrypted content does not establish anonymity or hide all routing metadata. Do not use the reliable-channel resend defaults for authoritative trade messages without an explicit application contract.

### 6.2 XMTP browser SDK

Source: [`sdks/browser-sdk/src/Client.ts`](https://github.com/xmtp/xmtp-js/blob/8993ef24144532e53fdfcfd04eddf27dce8a5a53/sdks/browser-sdk/src/Client.ts), [`sdks/browser-sdk/README.md`](https://github.com/xmtp/xmtp-js/blob/8993ef24144532e53fdfcfd04eddf27dce8a5a53/sdks/browser-sdk/README.md), [`package.json`](https://github.com/xmtp/xmtp-js/blob/8993ef24144532e53fdfcfd04eddf27dce8a5a53/sdks/browser-sdk/package.json). This is the same `8993ef2` source candidate already evaluated by the target's [passive T90 intake][T27]. It labels the browser SDK 7.0.0 but requires `@xmtp/wasm-bindings` `1.11.0-nightly.20260603.89c3fc3`. The official published browser SDK 7.0.0 instead requires WASM 1.10.0; the packet records that seven of its 46 packaged SDK source files differ from the candidate. Equal package-version text does not make these snapshots interchangeable.

**Existing evidence:** that intake already records all five archives' integrity/license evidence and static side-effect triggers. Its comparison-only lock deliberately retains the published SDK's real nested WASM 1.10.0 alongside the separate nightly; it is not a coherent candidate runtime or a bundler recommendation. Preserve this completed passive comparison and do not repeat it as a new task. Active evaluation remains blocked until a coherent selected build and the other absent profile contracts are established. No SDK import, constructor, Worker/WASM execution, routing or disposal PASS is supplied by the packet. [T27]

`Client.create/init/build/close` expose a real browser client, with a worker, identity-signing registration and persistent local storage. The README describes OPFS SQLite and closing clients to release worker/database resources. The target's static inspection further records that `close()` supplies no physical Worker-exit completion promise and does not explicitly reject pending actions. This is a new identity, network and persistence stack alongside the current Nostr/vault implementation, with an unresolved production lifecycle boundary. [T27]

**Defer under the existing [XMTP adapter specification][T16].** That spec's empty provider registry and exact generation/network/identity/recovery requirements should remain the gate. Resolve the recorded source/published artifact mismatch before selecting a coherent SDK/WASM build; then address the named missing endpoint, network, registration, multi-tab/recovery/lock and physical-disposal contracts. Existing archive hashes alone do not close those gaps. SDK availability must not silently switch the active trade's provider or redefine custody consent. The client creation path can auto-register unless disabled; an adapter must make that authority explicit rather than inheriting SDK defaults.

### 6.3 Helia / IPFS

Source: [`packages/http/src/index.ts`](https://github.com/ipfs/helia/blob/cba1ed69b4369924790d9eccdb8c9089435f4f20/packages/http/src/index.ts), [`packages/http/package.json`](https://github.com/ipfs/helia/blob/cba1ed69b4369924790d9eccdb8c9089435f4f20/packages/http/package.json), [`packages/trustless-gateway-client/src/index.ts`](https://github.com/ipfs/helia/blob/cba1ed69b4369924790d9eccdb8c9089435f4f20/packages/trustless-gateway-client/src/index.ts), [`broker.ts`](https://github.com/ipfs/helia/blob/cba1ed69b4369924790d9eccdb8c9089435f4f20/packages/trustless-gateway-client/src/broker.ts), [`trustless-gateway.ts`](https://github.com/ipfs/helia/blob/cba1ed69b4369924790d9eccdb8c9089435f4f20/packages/trustless-gateway-client/src/trustless-gateway.ts).

`withHTTP` and `trustlessGatewayBlockBroker` are more relevant to static-release retrieval than importing a full browser IPFS node. The HTTP composition supplies default delegated routers and gateways, including `delegated-ipfs.dev`; those must not become unreviewed endpoints. `TrustlessGateway.getRawBlock` uses bounded response reading and AbortSignal, and the broker calls an optional `validateFn`. A bare broker call without the intended validation composition is not sufficient to claim content integrity. `transformRequestInit` changes request options; it is not a replacement for the application's route authority.

**Adapt as a distribution-tooling/reference candidate; defer app runtime.** Place any future integration under the existing [G15 IPFS-origin/update policy][T18], with G05-controlled fetches and the project's signed-manifest verification. CID verification establishes bytes for a content identifier, not approval of the publisher, release sequence or executable. The target spec also requires origin isolation, backup/restore transitions and independently authenticated bootstrap trust. IPFS documentation explicitly describes public DHT/provider metadata; transport encryption does not make this a private publication channel. [W2] Do not publish private trade messages or recovery material through a public content-addressed graph merely because it is encrypted.

### 6.4 Browser Tor: Webtor as a research lead

Source: [`README.md`](https://github.com/ethereum/webtor-rs/blob/16e6f6af01071a8bb46f4a8b60f387e35b17a9f9/README.md), [`webtor-wasm/src/lib.rs`](https://github.com/ethereum/webtor-rs/blob/16e6f6af01071a8bb46f4a8b60f387e35b17a9f9/webtor-wasm/src/lib.rs), [`Cargo.toml`](https://github.com/ethereum/webtor-rs/blob/16e6f6af01071a8bb46f4a8b60f387e35b17a9f9/Cargo.toml). `TorClient`/`TorClientOptions` and WASM exports are a concrete lead for browser HTTP/HTTPS over Snowflake/WebTunnel, beyond an aspirational Tor toggle.

**Research-only, defer activation.** At the evaluated pin, the README says the implementation has not had a formal third-party security audit, does not implement `.onion` addresses, and does not protect against browser fingerprinting or application-layer leaks. A dependency on audited libraries is not an audit of this composed client. The root license-document gap and historical repository URLs in package metadata need resolution during intake.

The appropriate destination is the existing [browser-routing feasibility/private-transport specification][T17], followed by a separately qualified G05 driver if the project selects one. Required evidence includes exact WASM/build provenance, TLS and destination handling, DNS routing, endpoint permissions, total connection/worker/buffer ownership, abort/disposal and cross-browser behavior. Its HTTP example does not establish that this project's Nostr `wss` transport is supported through it. Tor selected in settings is not evidence of a verified route. Official Arti documentation describes reusable native proxy/onion support, but native Arti support must not be attributed to the browser wrapper without evidence. [W3]

### 6.5 I2P: external-router integration rather than Java source in a browser

Source: [`I2PTunnelHTTPClient.java`](https://github.com/i2p/i2p.i2p/blob/fa17f27fd3eb981621580f811b8a9de780a35af3/apps/i2ptunnel/java/src/net/i2p/i2ptunnel/I2PTunnelHTTPClient.java) and [`SAMv3Handler.java`](https://github.com/i2p/i2p.i2p/blob/fa17f27fd3eb981621580f811b8a9de780a35af3/apps/sam/java/src/net/i2p/sam/SAMv3Handler.java). These show concrete HTTP proxy and SAM facilities. They are host-side Java networking implementations, not code that can be copied into a static TypeScript page.

**Optional external integration/reference.** Keep the route-profile and feasibility notes beside [T17]. If a native companion or user-configured environment is selected, use the official SAM contract and actual supported router versions rather than inventing a browser API. The official SAM documentation recommends long-lived sessions and warns that Java I2P and i2pd have different feature/default behavior, so a complete qualification must cover the chosen implementation explicitly. [W4]

Licensing is component-specific: the HTTP tunnel file declares GPL with an exception, while `SAMv3Handler` declares public domain. The entire router is not uniformly public domain or MIT. Browser code cannot establish that the user's local router/proxy is actually in use just by observing a configured label. Any claimed strict route still needs independent evidence or must remain unsupported.

## 7. Compatibility, privacy and lifecycle limits to preserve

The normative reference used here is `nostr-protocol/nips` at [`400d157c53264b8e58c7b3cdbd21ef546fb7a157`](https://github.com/nostr-protocol/nips/commit/400d157c53264b8e58c7b3cdbd21ef546fb7a157), inspected through [`17.md`](https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/17.md), [`44.md`](https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/44.md) and [`59.md`](https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/59.md). Specifications and implementation pins serve different purposes; neither is a release approval.

- **NIP-44 profile:** retain the target's 1–65,535-byte plaintext range. Current upstreams' extended prefix is a deliberate version/profile review, not an automatic compatibility upgrade. Application envelopes are smaller still; crypto limits are not application message limits.
- **NIP-59 profile:** qualify the exact accepted wrap/event kinds and fields. A newer general-purpose implementation supporting additional kinds does not authorize the local parser to accept them.
- **Authentication scope:** Nostr signatures authenticate message keys; native wallet signatures authenticate the selected native statement. Neither establishes that fiat was received or that a human identity is genuine.
- **Privacy scope:** encrypted content does not hide all IP, endpoint, recipient, timing, size, storage or chain-linkage metadata. Signed public terms can link activity. Do not show complete anonymity as a consequence of NIP-44/59, Tor selection, Waku use or IPFS content addressing.
- **Reliability scope:** delivery acknowledgment, stored history, relay reconnection and native economic submission are separate states. An SDK's convenient retry policy cannot merge them.
- **Resource scope:** session cancellation must own work through actual completion, including workers, sockets, retries, timers and persistence. Native browser buffering remains a material residual limit even when application parsing is bounded.

## 8. Where to leave and use these notes

| Priority | Existing destination | Concrete follow-on | Exit evidence |
|---|---|---|---|
| P0 | `docs/governance/peer-acceptance-carrier.*`, `docs/governance/PENDING-DECISIONS.md`, G16 signed-terms spec | Freeze the peer carrier and resolve consent-model/profile decisions; attach this dossier as implementation research. | Selected exact profile, accountable review, compatible reader/writer examples and independent native/wire fixtures. |
| P0 | `packages/exchange/src/messages.ts`, `exchange.ts`; native input/verifier files [T4], [T5], [T6] | Add a separately selected peer parser and composition boundary after the decision; keep v1 readers exact. | Two-client interop, negative binding cases, replay/conflict behavior, no economic transition from chat-only acknowledgment. |
| P1 | `packages/nostr-crypto/test/*`, existing fixture provenance | Compare with pinned `nostr-tools` and Rust Nostr; retain known old vectors and explicit extension rejection. | Reproducible synthetic fixtures, generator/source/toolchain pins, byte-identical results, fixed target error classes. |
| Conditional P1 | `packages/relay/test/support/*`, `pool*.test.mjs`, `packages/transport/test/*`, `security/intake/relay-transport/*` | Reuse existing real-socket tests, T100 missing-ACK/no-replay coverage and pinned `ws` 8.22.1 intake; extend only for a demonstrated missing case or separately selected profile. | Cite existing results and their scope first; any new case closes the named gap without implying browser preallocation or production companion qualification. |
| P1 | `packages/messaging/test/durable-chat.test.mjs` and app composition | Import independent message fixtures into actual encrypted-history flow. | Restart/duplicate/generation/lock behavior and bounded persistence verified without an unrelated SDK database. |
| P2 optional | Waku/XMTP/Tor-I2P specs [T15], [T16], [T17]; existing intake [T26], [T27] | Preserve Waku 13/14 with its encoding failure and XMTP's completed passive mismatch comparison. Resolve exact missing runtime/profile contracts; no generic repeated intake or package merely to check a feature box. | Coherent selected artifacts, brokerable network/identity/storage lifecycle, unsupported strict routes rejected and explicit provider activation. |
| P2 optional | G15 IPFS-origin/update spec [T18] | Evaluate constrained HTTP/distribution tooling once trust policy is selected. | Signed release authority, CID/digest correctness, origin/backup behavior and exact endpoint policy independently verified. |

## 9. Research limits and recorded retrieval issues

The review read target code, target specifications/governance records, upstream source files, license texts, branch commit metadata and official platform documentation. It did not install packages, build upstream code, run target tests, contact live relays, send messages, publish releases or verify shipped binary provenance. Recommendations distinguish source fit from deployment readiness.

Recorded source issues:

- Old `rust-nostr/nostr` and `waku-org/js-waku` repository locators returned moves. Canonical repository identities above were resolved using their GitHub repository IDs; updated names should be retained in future provenance records.
- Opening `https://docs.waku.org/learn/concepts/content-topics` returned HTTP 403 during this review. Source conclusions about SDK behavior rely on inspected GitHub files; no inaccessible page is used as proof of a privacy guarantee.
- `paulmillr/nip44` has conflicting JS license metadata and directory license text, plus unresolved root-vector scope; the target's existing pending review should remain pending.
- Webtor's root license document was not present in the inspected tree despite an MIT Cargo declaration. That is an intake gap, not proof that the project has no license or cannot ever be reused.
- Version strings were observed in source manifests; this review did not independently verify that the corresponding package registry or WASM distribution matches the source pin.

No candidate can supply the project's missing protocol decisions through installation alone. The best immediate payoff is to settle D1, reuse the existing implementation boundaries, and add independent interoperability evidence where the code already exists.

## Target and official-document references

[T1]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/exchange/src/messages.ts
[T2]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/exchange/src/exchange.ts
[T3]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/PENDING-DECISIONS.md
[T4]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/schemas/src/evm-agreement-input.ts
[T5]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/schemas/src/evm-agreement-protocol.ts
[T6]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-agreement.ts
[T7]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/peer-acceptance-carrier.proposal.json
[T8]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/peer-acceptance-carrier.decision.json
[T9]: https://github.com/djshellshoxxx/p2p-offramp/blob/2f839b12768700ac6c3b674f75a144c6ec19fa93/docs/execution/NEXT-RUN-PROMPT-2026-11-04.md
[T10]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/nostr-crypto/src/nip44.ts
[T11]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/relay/src/pool.ts
[T12]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/messaging/src/durable-chat.ts
[T13]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/transport/src/policy.ts
[T14]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/transport/src/http-driver.ts
[T15]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.4_order_discovery/module_1.4.1_encrypted_relay_protocol/spec-waku-order-relay-adapter.md
[T16]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.3_encrypted_messaging/module_5.3.1_message_adapters/spec-xmtp-messaging-adapter.md
[T17]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.1_tor_i2p_routing/spec-browser-routing-feasibility.md
[T18]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.3_release_distribution/spec-ipfs-origin-and-update-policy.md
[T19]: https://github.com/djshellshoxxx/p2p-offramp/blob/e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa/package.json
[T20]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.8_trade_coordination/module_1.8.1_trade_terms/spec-signed-trade-terms.md
[T21]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/nostr-crypto/test/fixtures/NIP44-VECTORS-PROVENANCE.md
[T22]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/relay/test/support/fake-relay.mjs
[T23]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/relay/test/pool.test.mjs
[T24]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/security/intake/relay-transport/README.md
[T25]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/security/intake/relay-transport/pins.json
[T26]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/security/intake/waku/README.md
[T27]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/security/intake/xmtp/README.md
[W1]: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
[W2]: https://docs.ipfs.tech/concepts/privacy-and-encryption/
[W3]: https://arti.torproject.org/
[W4]: https://www.i2p.net/en/docs/api/samv3/
