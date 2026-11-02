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
