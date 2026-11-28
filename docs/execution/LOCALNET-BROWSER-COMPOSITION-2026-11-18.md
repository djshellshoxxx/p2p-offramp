# Localnet browser composition and recovery evidence — 2026-11-18

## Result and exact scope

The localnet-only browser composition now implements one encrypted party per browser profile. It connects an external EIP-1193 wallet, publishes public discovery advertisements, exchanges private offers and acceptances through the current D1 version 2 protocol, carries durable encrypted chat, and prepares explicit native-asset funding, seller release, or timeout refund reviews against the canonical EVM escrow. It also exports encrypted backups, restores to fresh vault keys, and reconciles unknown broadcasts without resending.

The final frozen source used for the combined local gates was:

- Commit: `4eebf5cfac02cc577a3dcd58b4f4d5b65424fd44`.
- Tree: `5e87020e1fabeca2c374f4297c497aca290be4aa`.
- Local branch: `integration/browser-journey-20261118`.
- Parent integration base: `8b266e2`.

The earlier production candidate `b74cf599c93a9dd7c2c332eae7404d190a1a07d5` (tree `a04a0dc9194ca44f2fb944778fc89e9a0b65c665`) received an independent source review and a separate-worktree repeat of its 42 focused tests and 11 native checks. The final candidate adds the actual built-browser harness, independently reviewed display-selection repair, independently reproduced and repaired asynchronous backup-file cancellation, and explicit harness operation-completion waits. The combined final gates below were then run on that exact final source.

This is **local native/controller proof and static artifact qualification**, not a completed browser qualification or release approval. Browser launch was unavailable in this execution environment: AF_UNIX socket creation returned EPERM, Chromium could not establish its profile singleton, and the requested execution escalation was automatically rejected by the configured sandbox approval policy. No workaround was used. The hosted two-browser-context gate remains required before claiming browser execution success.

`ReleaseEnabled` remains the literal `0`. The build is library-only, accepts exactly the independently supplied registry digest and escrow-layout policy, admits only chain `31337` labelled `local`, and limits its network policy to the explicitly configured loopback relay. No deployment, release publication, public testnet transaction, mainnet transaction, or real funds were used.

## Composition and ownership

| Component | Responsibility and authority |
| --- | --- |
| `apps/web/src/localnet/protocol.ts` | Bounded, purpose-specific commands and public/purpose-specific projections; no generic vault read, secret export, or wallet request command. |
| `localnet.worker.ts` | Same-origin module Worker and finite wallet-response bridge. |
| `controller.ts` | Owns the canonical encrypted vault session and lease, one messaging identity, current D1 exchange and replay ledger, private trade bytes, durable chat, canonical intent journal, and transaction lifecycle. |
| `client.ts` | Page-side request lifecycle and profile epochs; immediately clears private projections on lock or profile replacement and discards prior work. |
| `wallet-bridge.ts` | Holds the external provider. Connect and confirmed review are the only prompt grants. Each reviewed request must match exactly, in order, and is consumed before invocation. |
| `review-requests.ts` | Derives exact review expectations from canonical EIP-712 types and prepared transactions. The canonical adapter independently rebuilds and verifies signed payloads. |
| `relay-route.ts` | One fixed logical pool endpoint maps to the build-validated loopback WebSocket through the existing relay connector. The mapping accepts no arbitrary destination or fallback. |
| `LocalnetRoot.tsx` | User forms, exact reviews, explicit fiat-receipt confirmation, profile controls, and text-only display. |
| `ui-command.ts` | Captures the UI operation before asynchronous backup-file reading, rechecks the same operation/client/profile before dispatch, and clears the file buffer. |
| `scripts/lib/localnet-fixture.mjs` | Test-only pinned Anvil, canonical contract, Nostr relay, and external wallet fixture, shared with the browser harness. Published Anvil development keys remain in Node. |
| `scripts/test-localnet-browser.mjs` | Hosted qualification of the built artifact through two independent browser contexts, actual Workers and IndexedDB, real local escrow/relay, and external Node-hosted fixture wallets. |

The Worker directly owns its vault, rather than exporting the default worker endpoint's session capability. Its revocable lease, operation epoch, idle deadline, exact command parser, and purpose-specific outputs provide the private composition boundary. The page never receives the vault session token, messaging private key, generic signer, or record-read capability. Decrypted bank instructions and chat appear only as the selected unlocked profile's explicitly defined view.

Lock closes relay and exchange services, revokes the lease, aborts in-flight work, disposes the journal/native reader and the relay cryptography key copy, wipes owned messaging-key and terms buffers, and clears private projections. JavaScript strings and engine copies cannot be promised forensic erasure; the qualified property is revocation of capabilities and removal of current or queued private views.

## Qualified transaction and communication flow

1. Seller and buyer create separate encrypted profiles and explicitly connect different external wallets. They own different messaging identities.
2. The seller publishes only public discovery metadata. The buyer's wallet address and private negotiation travel in authenticated encrypted messages.
3. The seller selects a taken session and reviews exact private terms. Confirmation allows two EIP-712 prompts: TradeTerms and the role/account/both-messaging-keys acceptance binding. The displayed session is private, mutually exclusive profile state; canonical seller intake pinning remains a separate exchange operation.
4. The buyer selects an existing received session, independently reviews its exact bytes, and confirms the corresponding two prompts. Current D1 verification and durable replay admission produce communication evidence for both wallet statements. Buyer display selection conveys no seller intake authority.
5. Funding still requires a separate exact transaction review, fresh runtime/genesis checks, the native funding window, fresh D1 funding acceptance, and the canonical lifecycle. A durable `broadcast-unknown` marker precedes the sole `eth_sendTransaction` call.
6. Chat and payment claims never establish bank receipt or funded chain state. Seller release requires an explicit bank-receipt confirmation and a new wallet review. Native expiry disables release and enables refund; each economic exit is checked again against current chain time before admission.
7. A lost wallet response retains the null-hash unknown-broadcast journal record. Reopen or fresh-key restore reconciles its native effect without a new send. Funded release/refund does not require renewed D1 acceptance.

The canonical reader returns the same already rechecked `LiveAnchor` with the decoded escrow snapshot. Refund/release guidance uses that anchor's timestamp, not the page clock. Current transaction admission also checks the latest native timestamp, so a finalized display anchor cannot authorize a release which has already expired at the current head.

Prepared transactions remain journal reservations. A canceled live review cannot send. After restart, an abandoned value-moving preparation keeps the canonical block lease and nonce hold; native reconciliation classifies it. If an exit needs a successor, a new explicit review identifies the superseded intent and the canonical lifecycle uses the safe successor nonce. Nothing reconstructs an old in-memory prepare object and resubmits it.

## Defects found and repaired before integration

These findings concern the unpublished localnet candidate, not an assertion that the prior default browser exposed these flows.

| Finding | Reproduction and consequence | Repair |
| --- | --- | --- |
| Prepared funding recovery reapplied communication acceptance | On `cad242a`, prepare funding, lock before confirmation, reopen, and mine beyond the block lease. `wallet.connect`/refresh returned `UNAUTHORIZED` because cancellation validated the current prepared intent and required the lost ephemeral D1 session. | `4b4d35e8`: fresh D1/time admission runs only on journal reservation and the durable send marker. Canonical encoding/runtime checks remain active for every transition and reconciliation. |
| Page retained or republished private state after lock began | Independent tests showed a lock request left the client snapshot private until the worker reply and accepted a queued old private snapshot. Eight pending page requests could also prevent lock dispatch. | Independent repair `2bda06c5`, integrated as `37b2a17c`: immediate locked view, profile epochs, old-job settlement, bounded-queue cleanup for lock, and reopening only from a matching explicit open result. |
| Bridge prompt grant lacked runtime method checks and a final getter fence | A malformed review could grant `personal_sign`. A provider `request` getter could revoke authority but still leave one invocation possible. | `37b2a17c`: runtime method allowlist and a generation check after reading the provider method. The physical prompt slot stays held until the provider settles after cancellation. |
| Browser clock hid an available refund | A deliberately two-minute-slow controller clock showed `canRefund=false` after native expiry, although the native refund was valid. | `b74cf599`: action guidance derives from the rechecked native snapshot anchor. |
| Expired release remained offered | Before the same final patch, an expired funded trade still showed release as available and admitted a review that the contract would reject. | `b74cf599`: native-time display eligibility and `EXPIRED` refusal before reserving an expired release. |
| Full localnet worker artifact was incomplete | The first combined build emitted both default and localnet worker entries and omitted worker-only crypto licenses from the document license report. | Root repair `074d1ec0`, integrated as `82af41b0`: compile-time entry split, one correct worker requirement, and license attribution from the emitted worker graph and installed license texts. |
| Buyer could not select received terms; later seller selection could display the earlier session | The real UI uses `session.select` before showing an acceptance review. The controller forwarded buyer selection to the seller-only exchange method, which returned `NOT_SELLER`. Canonical seller pinning could also leave several sessions selected for display. | `ba4c1484`: a private single display selection, seller-only canonical pinning retained, buyer limited to existing sessions, and selection cleared on profile drop. The native fixture now follows both UI selection sequences through two negotiations in the same profiles. |
| A pending backup-file read could reopen a locked profile | The independent reviewer deferred the actual UI handler's `File.arrayBuffer`, locked explicitly or through the Worker, then completed the read. The old continuation started a new restore operation and unlocked a new profile in the real encrypted controller. | Independent repair `5557f80d`, integrated as `26ef28cb`: register UI epoch/busy state before reading; verify the same operation, client, and profile before dispatch; clear discarded or consumed bytes. Three tests execute the actual transpiled handlers with render-only hook stubs and the real encrypted controller. |
| Harness treated hidden review as submission completion | Static sequencing review found that review authority is consumed before awaited signing/submission, so relay snapshots can hide the review while the operation remains pending. Mining at that point could race the actual transaction. This was not reproduced under Chromium in this environment. | `4eebf5cf`: connection, confirmation, and refresh helpers also wait for the rendered UI operation to become idle before native assertions or mining. |

The first four boundary regressions and the cancellation/clock cases were observed failing before their fixes. The independent reviewer reran seven client/bridge regressions unchanged against `cad242a` and observed all seven fail, then observed the combined boundary suites pass after repair.

## Validation

The exact final source at `4eebf5cf` passed the following local gates. Independent repetition applies to the earlier `b74cf599` source as described above; the selection and UI-file-read deltas received their own independent review and regression evidence.

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS, including domain, default runtime, default worker, and UI/localnet sources. |
| Chain reader + localnet boundary + independent client + actual UI-handler tests | **45 passed, 0 failed, 0 skipped**: 25 chain reader tests, 10 localnet boundary tests, 7 independent client/bridge regressions, and 3 backup-file UI-handler regressions. |
| `npm run test:build-policy` | **50 passed, 0 failed, 0 skipped**, including artifact mode and source-boundary regressions. |
| `node scripts/check-import-boundaries.mjs` | PASS: 178 production files, 111 modules in the core entry graph. Static checks are not claimed as runtime isolation proof. |
| `npm run test:localnet:controller` with pinned Foundry/solc | **12 passed native checks**, 12 exact typed-data signature prompts, 4 transaction sends, and 4 independently observed prior durable send markers. |
| Real-fixture localnet `buildWeb` | PASS with one `localnet.worker` asset, complete crypto licenses, local-only CSP, and `ReleaseEnabled: 0`. |
| Browser harness syntax | `node --check scripts/test-localnet-browser.mjs` PASS. The dedicated controller and built-browser commands are wired into the hosted EVM workflow. |
| Browser execution | Not run successfully here; hosted browser gate required. |

Reproduce the focused test gate:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  packages/chain-evm/test/reader.test.mjs \
  apps/web/test/localnet-boundary.test.mjs \
  apps/web/test/independent-localnet-client.test.mjs \
  apps/web/test/localnet-ui-restore.test.mjs
```

Reproduce the native integration gate after initializing the pinned contract submodules:

```sh
FOUNDRY_BIN=/path/to/verified/foundry \
FOUNDRY_SOLC=/path/to/solc-0.8.30 \
npm run test:localnet:controller
```

The fixture checks the pinned Foundry commit, compiles the canonical contract, obtains its expected runtime hash from `artifact.deployedBytecode.object`, and compares the actual native code with that independent artifact. It does not trust an RPC's runtime hash as its own expected value. Relay publication and reception use the existing pool and actual Nostr cryptography.

The 12 native checks cover independent profiles/wallets; current D1 offer/accept; durable private chat; canceled preparation and explicit bank confirmation; canonical release; buyer selection and a second negotiation in the same profiles; unknown-response fresh-key recovery without resend; abandoned funding reconciliation; abandoned release reconciliation and an explicit successor; native-time exit eligibility with a skewed page clock and expired-release refusal; canonical restored refund; and ciphertext-only relay content with cleared lock projections.

The final successful local artifact had 11 assets totaling 624,947 bytes before its evidence document, registry digest `db38010738e9f501c3ec56b56061ea8ecb5715be287c57aff00532960a4d641e`, expected runtime Keccak `c84cbd647a6f7056592761abcdebe16619dcc9f50ec1d99c524756f43a81e9df`, and localnet worker SHA-256 `42ddb9d5e2a92c98399b069ec6eab1f27e6f56b6367cf3c0a965edf0a46a9028`. These identify one disposable build. Fixture ports, genesis and registry bytes vary between runs; these hashes are not a release attestation.

The built-browser harness uses two separate browser contexts, serves the emitted assets with the local content policy, and blocks unexpected network destinations. Each wallet send checks the actual encrypted IndexedDB row, decrypts it outside the application in the Node fixture, and requires a matching durable send marker. It exercises private review, hostile text rendering, chat, canceled review, funding/release, a second trade, unknown-response backup into a fresh profile, and native expiry/refund. Its wallet signing keys remain in Node and are only published Anvil development keys. This describes committed test coverage; it does not claim those browser steps executed in this environment. Run `npm run test:localnet:browser` with a permitted Chromium environment and the same pinned native toolchain to obtain that separate evidence.

## Limits and remaining engineering work

- The new browser vertical slice handles the native asset only. Existing canonical ERC-20 contract, approval, and recovery tests are separate evidence; this UI does not claim ERC-20 completion.
- Live D1 negotiation sessions remain in memory. Restored terms/history are retained, but new funding is disabled until a fresh verified D1 session exists. There is no automatic UI rehydration of an unfunded negotiation. Resuming the exact unfunded terms after a prepared reservation expires needs an explicit same-terms acceptance and successor flow; the current fixture proves safe classification and no resend, not that resumed funding journey.
- The hosted browser harness must qualify two separate browser contexts, actual Worker execution, IndexedDB, lifecycle/visibility locking, forms and user review behavior. The local controller run is not a substitute.
- RPC observations retain the repository's honest-node trust model. Hash-bound EIP-1898 reads prevent inconsistent honest backends from silently substituting another block; they are not light-client proofs against a malicious provider.
- The release gate, physical-wallet qualification, public testnet qualification, and professional security audit remain separate requirements. No readiness language in this report enables deployment or release publication.

## Evidence locations in the working session

Local logs outside the repository include `localnet-controller-native.log` (first eight checks), `localnet-controller-red-admission.log`, `localnet-controller-red-clock.log`, `localnet-controller-red-release-expiry.log`, `localnet-controller-red-selection.log`, `localnet-combined-unit-green.log`, and `localnet-controller-combined-green.log`. The final frozen source recorded `localnet-final-typecheck.log`, `localnet-final-unit.log`, `localnet-final-build-policy.log`, `localnet-final-controller.log`, and `localnet-final-artifact.log`. The independent worktree recorded `browser-independent-units-b74cf599.log` and `browser-independent-native-b74cf599.log`. Source tests and the shared fixture are committed, so the evidence can be regenerated with the pinned tools.
