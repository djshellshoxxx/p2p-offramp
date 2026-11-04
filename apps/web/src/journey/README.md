# Isolated native journey LOCALPROOF

This is an optional product controller/screen and private Worker composition, compiled by
`scripts/test-journey-browser.mjs`. The default App, entry points, facades, build policy and trust
pins do not import or enable it. Every snapshot says `LOCALPROOF` and `tradingEnabled: false`.
It is engineering evidence with public development wallets and owned loopback services, not
production activation, a wallet security certification or a fiat-payment oracle.

`private-trade.ts` and its explicit `native-contracts.ts` constructor/service/snapshot contracts are checked by the existing strict UI TypeScript configuration (including unchecked-index and exact-optional checks). No config, `any`, or unchecked source bypass is used.

`private-trade.ts` constructs the actual public registry, Nostr crypto, order book, encrypted
terms exchange and existing journey projection. Its constructor receives trusted concrete
native factories, never imported acceptance/receipt/status flags. The compiled fixture root
supplies the existing EVM wallet, EOA bundle verifier, canonical escrow builders, native reader,
G08 authority, G18 payment preflight, G12 encrypted journal/coordinator and G01 identity service.
The fixture's transport broker grants only its exact logical relay endpoint and maps it to an
owned loopback WebSocket. This proves authorized connector arguments, not TLS/private routing.
The fixture is not a production peer-wallet-acceptance carrier: v1 exchange acceptance remains
communication only, and the missing carrier plus maintained signing trust root still block
production composition.

`vault-composition.ts` privately hosts the SAME existing runtime endpoint and owns its sole
runtime sequence. Only sessions actually opened by that endpoint become private capabilities.
Creation commits the actual messaging identity before the user exports/verifies a backup.
Before a new start, `requireVerifiedBackup()` invokes the endpoint's actual T34 current-row
verification fact. No receipt supplied by the document can create this fact. Later identity,
review and journal writes make that exact backup stale; recovery uses the actual current
session/row, not an obsolete backup snapshot. The screen labels the verified revision.
`requireCurrent()` also checks the endpoint's monotonic idle deadline. Lock, timeout, revoked
lease, cross-tab conflict, profile switch and disposal clear private contexts and owned buffers.
This is owned-buffer cleanup, not a claim that JavaScript strings/native crypto memory are erased.

The explicit action sequence is profile/backup verification → native wallet selection → signed
advertisement and NIP-17 encrypted take/offer → exact-byte review/communication acceptance → own
native EIP-712 signature plus the fixture peer's native signature → actual G16 canonical bundle
verification → canonical prepare/reserve/durable send marker → one send → explicit native
reconciliation → finalized exact G08/G18 manual coordination → seller fiat attestation/release or
expired fixed-seller refund → canonical native fee receipt and encrypted backup/watch export.
No automatic wallet prompt, send retry, relay publish retry or chain-time advancement exists.
The primary review uses the existing typed English trade catalog, canonical amount/address formatters, full exact-copy controls, deadlines and seller-withholding disclosure. Signing requires an explicit risk acknowledgement. Canonical native receipts label outcome, original seller/buyer, gas quantities and the actual native-unit fee. Diagnostic JSON is secondary and omits bank instructions; agreed text is separately marked non-actionable during exact-byte review. Only fresh native payment coordination presents actionable instructions. These are draft LOCALPROOF controls, not an approved production locale.

The UI conservatively expires displayed payment guidance after twenty seconds and requires an
explicit reconciliation; release itself always rereads the actual native gate.

The journal's native callback checks the original binding/account/action and exact native
transaction hash/from/to/calldata/value/nonce, canonical receipt block and finalized anchor,
plus fresh chain/genesis/runtime identity and immutable trade terms. Unknown hash recovery
scans at most 65 blocks (preparation through preparation+64), with at most 128 transactions per
block. Missing, excessive, changed or unavailable evidence stays unresolved. A finalized escrow
effect or stored terminal label alone cannot release the reservation. Original-trade recovery
selects authenticated saved terms from the selected profile, rechecks native state and reconnects
the original seller wallet; it never creates a new funding acceptance or resends an old intent.

The exchange clock advances using native monotonic elapsed time and refreshes observed chain time before offer/accept and around both signatures. Known native wallet events invalidate G18 and clear the private view; the fixture-only event seam can supply negative provider events and cannot grant any acceptance or receipt. Worker bootstrap and runtime initialization use shared promises. A lock/dispose retires earlier commands before awaiting bootstrap, while physical busy admission lasts until old native calls drain. Every native attachment captures its actual selected lease and epoch; every RPC checks before and after I/O, and the controller retains/drains actual in-flight RPC promises even when G08/G18 return an early cancellation/timeout winner. Retired unknown recovery cannot issue a new block scan or acquire a later profile's context. A failed refresh clears cached actionable guidance.

Cold recovery scopes the actual lifecycle journal's list to the exact selected binding/account. A private generation-bound cancellation interval skips only new-spend phase/time checks during actual never-sent preparation cancellation; native identity and canonical encoding still apply. Expired reservations can be cancelled without a fabricated receipt, and unrelated prepared trade records remain untouched. Prepared request parsing requires exact canonical eight-field serialization before any native journal transition. Returned key/signature/crypto resources acquire cleanup immediately, including cancellation between asynchronous acquisition and scope validation.

The browser harness asserts actual source modules in the compiled Worker. It covers wrong backup
passphrase, missing backup, wrong genesis/runtime, real relay ciphertext, durable-before-send,
lost native response, Worker destruction, fresh-key unknown-journal restore without resend,
source ciphertext preservation, finalized payment coordination, explicit seller attestation,
early-refund refusal, deadline refund, canonical fee receipts, watch export, native wallet-event revocation, startup lock retirement, expired cold-preparation cancellation, and lock during a
held native code read with an ignored late reply and refusal of a new selection until physical drain. HTTP and WebSocket allowlists reject external
endpoints. Focused native-vault tests cover imported facts, selected mutations, cross-tab writes
and lock/drain races. These tests do not establish live trust, production deployment/rotation/
archive protocols, peer-wallet carrier interoperability, whole-WebSocket allocation safety,
hardware power-loss durability, remote-provider cancellation, independent cryptography review or physical-device acceptance.

Run locally with the repository's pinned Foundry/Solc and Chromium toolchain:

```sh
node --import ./scripts/test-support/register-tsx.mjs apps/web/test/journey-vault-composition.test.mjs
node --import ./scripts/test-support/register-tsx.mjs apps/web/test/journey-private-trade.test.mjs
FOUNDRY_BIN=/path/to/pinned-foundry FOUNDRY_SOLC=/path/to/solc-0.8.30 node --import ./scripts/test-support/register-tsx.mjs scripts/test-journey-browser.mjs
```

This slice supplies P-G22-BROWSER local composition evidence. P-G22 production and P-G15 signed
cross-origin migration remain open; the latter must reuse actual signed asset verification and
fresh-origin restore rather than declaring a same-origin reload to be an origin transition.

The screen also reuses T53 `content-policy/local-policy.ts`: document-wide bounded backup file imports with scope abort/pre-consumer checks, and an offer-only per-profile local UX budget derived from parsed Worker selection. Native result codes remain outside the import wrapper; exits, reconciliation, watch, restore and export have no cooldown. This dependency is owned/frozen independently; it grants no Worker, signing or spending authority.

## T65 frozen ERC20 action contract

The same constructor and Worker retain all private session, backup and acceptance capabilities. `act('connect', {assetId?: string, amountBaseUnits?: string})` selects only an exact-transfer asset from the current registry/deployment; omitted values preserve the native regression. `act('assets')` returns only display choices. Decimal principal is positive canonical uint256. Terms, advertisement, signatures and saved review bind the same exact selected token/principal. No asset metadata is accepted as authority from the screen.

For token terms the explicit sequence after acceptance is `token-check` → optional `reset-approval` → reconcile → `approve` → reconcile → `fund` → reconcile → existing manual coordination and release/refund. `token-check` reads chain/genesis/escrow runtime through the existing native observer, then code, actual escrow allowlist, token decimals, seller balance and escrow allowance at one finalized numeric anchor with hash recheck. The display includes the observed anchor and exact base units; it is not a permission setter. Exact uint/bool ABI words are required. Reset is never automatic: the existing canonical ERC20 builder/G12 action supports `approve(escrow,0)`. Both reset and principal approval are journal action `approve`, distinguished by their exact canonical prepared calldata, never a new wire/status field. Only zero or the exact agreed principal are valid. A nonzero insufficient allowance requires the explicit reset action before approval; sufficient allowance permits funding after fresh checks. Approval always has zero native value.

Every send uses the existing prepare/reserve/durable unknown marker, and a separate user action. Unknown reset/approval/fund blocks another send until explicit bounded native reconciliation. Final approval evidence requires exact original transaction/caller/token/spender/amount/nonce, canonical finalized receipt and a fresh coherent current allowance observation; it never means funded or fiat-ready. Historical allowance can be consumed by funding or changed by later reset/approval, so finalization never asserts that the historical requested amount remains current forever; the separately observed current allowance controls new funding readiness. Recovery selects the selected binding's pending approval before funding and retains source ciphertext. A restored review/approval is not a saved acceptance capability: explicit `accept-recovered` requires renewed risk confirmation and actual current seller/fixture-peer signatures over the exact restored terms plus canonical bundle verification before any new funding/approval. Never-sent prepared approvals are cancelled through existing recovery, never submitted from restored data. Existing current-profile/revision backup verification remains required at new-start connect; later review/journal writes only invalidate that fact, and no approval action refreshes it. Existing requireCurrent boundaries continue for the accepted transaction and exits; recovery does not require the obsolete pre-journal backup.

Token funding requires fresh sufficient balance/allowance and existing window/native identity checks, uses canonical fundToken with zero native value, then the unchanged G08/G18 gates. Reconciliation and exits do not require a new backup. All actual action fee receipts use native denomination separately from token principal. Wallet events, lock, profile switch and ignored late replies retain current retirement and physical-drain behavior. This remains LOCALPROOF, trading disabled, with the same missing production peer carrier/trust requirements.

The expanded single browser runner retains the native regressions and additionally executes actual allowlisted MockERC20 approval, fresh-key unknown approval and unknown token-funding recovery with source-row retention, fresh re-acceptance, exact token release and timeout refund, explicit zero reset, balances/allowance and per-action native fees. Hostile token-code/decimals/ABI-word responses and wrong native approval destination/spender/amount cannot promote recovery or reveal payment guidance. The mock is a plain 18-decimal exact-transfer token; this does not qualify proxy, fee-on-transfer, rebasing, callback or arbitrary deployed token behavior.

## T68 endpoint details and actual wallet-request review

Every terms signature, token approval/reset, funding, release and refund now has two explicit actions: `review-signing({signingAction})` and `confirm-signing`. The Worker derives one short-lived review from its actual current profile/session, epoch, selected native wallet sessions, exact bound terms and canonical request. Confirmation consumes that private review. There is no imported review identifier, persisted consent capability, provider setter or permission from a privacy observation. Ordinary direct economic actions cannot bypass this review. Actual native EIP-712 and transaction-send hooks check its binding, exact canonical body and current expiry/revocation immediately before asking the external wallet. The existing G16 verification, G12 journal, native custody and G18 guidance checks still decide their own authority.

The public review shows actual wallet/provider accounts, network/deployment, escrow/request destination, native value, token spender/principal, terms digest and extension set. Its 20-second maximum lifetime also respects an earlier endpoint observation expiry. A public clock origin translates the Worker's monotonic expiry to the document's separate performance clock; it is not saved or included in diagnostic JSON. Lock, wallet/profile change and disposal erase the pending review. Privacy invalidation retires that review while preserving accepted terms, native funding and recovery/exit rights. Missing or failed optional observations remain unknown and can still be explicitly reviewed for release/refund. Opening or discarding a review does not renew cached payment guidance. An already delivered exact encrypted communication acceptance may be reused after a cancelled wallet prompt; renewed consent and actual native signatures are still required, and relay acceptance never supplies their authority.

Endpoint metadata comes only from an explicitly injected bundled composition, independently of route protection. The isolated Worker uses the same validated registry/configuration and connection closures as its real requests: configured RPC origin versus the same-origin `/rpc` browser connection, and registered logical WSS relay versus its owned loopback WS connection. Only normalized scheme/host/port origins reach the public projection; userinfo, ambiguous URLs, paths, queries and fragments cannot appear there. No display calls G05 authorization/capture. Only the actual live relay broker supplies app-route observations; unbrokered channels and external wallet routing remain unknown. No production producer or protected route is introduced. Default App supplies no endpoint service.

`mountLocalJourney(root, worker, {vaultOnly:true})` is a constructor-owned compatibility option for the existing vault-only signed-origin restore fixture. It omits asset refresh and trading controls, and leaves actual profile/backup/runtime operations intact. It fabricates no asset response and adds no wallet to that Worker. The default native/token journey keeps its full controls.

Native browser evidence includes zero signatures/sends on review, explicit confirmation, real observation expiry and revocation while the final wallet chain check is physically held, synchronous inspection invalidation, and the original eleven native/token submissions, fresh-key recovery, exits and physical-drain/scan races. Fixture-only negative controls can shorten one observation or revoke/invalidate inspection; they cannot install a provider, extend a live review or enable protection. The separate privacy panel runner retains its subscription/expiry/late-callback/observer-exhaustion cases and exercises metadata-only origin redaction, scope change and cleanup. These remain owned local Chromium fixtures, not production wallet/private-routing or release qualification.
