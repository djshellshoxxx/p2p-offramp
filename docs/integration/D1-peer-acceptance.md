# D1 peer acceptance: Option B composition (Tier C patch)

Status: a reviewable Tier C patch implementing the owner-accepted D1 Option B
([decision packet](../adr/proposed/D1-peer-acceptance-carrier.md)). It must not merge without owner approval.
It has had no independent protocol, cryptography or security review, and no interoperability with any other
client is claimed. The default application graph does not use it: `LOCALPROOF`, `tradingEnabled: false`,
`ReleaseEnabled=0`, the escrow ABI and the `TradeTerms` struct are unchanged. The earlier
[EOA candidate](peer-acceptance-v1-candidate.md) describes the primitive this builds on.

## What a statement is

Each party's acceptance is two signatures by the wallet account the reviewed terms name for its role, in the
existing EIP-712 domain (`P2POfframp`, version `1`, chain id and escrow address):

1. the `TradeTerms` digest (the termsHash, which the escrow's `tradeIdOf` also uses), and
2. the `PeerAcceptance` binding `(v=1, termsHash, role, account, ownMessagingKey, counterpartyMessagingKey,
   notAfterSeconds)`, with the exact field order of the candidate.

Neither signature alone is accepted. A version 2 message without its binding or either signature is MALFORMED, and
a version 1 `{revision}` never produces any "accepted" label (see the tests named below).

## Version 2 carrier (packages/exchange)

`packages/exchange/src/peer-acceptance.ts` defines the wire format, the parser and two port types. The exchange
never imports a wallet module (a test scans its sources). Without the ports, every version 1 behavior, wire byte and
result is unchanged and a version 2 envelope is MALFORMED. With them (`createTermsExchange({ peerAcceptance })`) the
exchange runs in D1 mode:

| Message | D1 mode |
|---|---|
| take-request, terms-reject, cancel | version 1, unchanged on the wire |
| terms-offer | version 2 only: `{terms, acceptance}` with the seller statement |
| terms-accept | version 2 only: `{revision, acceptance}` with the buyer statement |
| version 1 terms-offer / terms-accept | refused `DOWNGRADE`, both directions; local `offer`/`accept` refused `ACCEPTANCE_REQUIRED` |

`acceptance` is exactly `{binding, termsSignature, bindingSignature}`; there is no scheme or authority field. The
binding must name the sender as signer, the recipient as counterparty, the envelope termsHash and the role implied by
the message type. Mixed v1/v2 sessions are not negotiated: both clients must run D1 mode, otherwise the v2 offer fails
closed at the v1 reader.

### Strict parsing and byte budget

Exact keys (no accessors, plain prototypes, duplicate JSON keys refused), canonical lowercase hex, nonzero lowercase
addresses, distinct messaging keys, canonical positive uint64 decimals, deep-frozen results.

| Bound | Value |
|---|---|
| Whole envelope (unchanged) | 24,576 UTF-8 bytes |
| Offer terms (unchanged) | 16,384 bytes |
| Each signature, decoded | 1 to 2,048 bytes (`MAX_PEER_SIGNATURE_BYTES`); EOA exactly 65 |
| acceptBefore ahead of now at admission | at most 604,800 s (`MAX_PEER_ACCEPT_HORIZON_SECONDS`) |
| Funding recheck margin | 120 s (`FUNDING_SAFETY_MARGIN_SECONDS`) |

All parts share the 24,576-byte cap: 16,384 bytes of terms plus two 2,048-byte signatures is refused. Reviewed
terms are smaller in practice (payment instructions are capped at 4 KiB), and a real offer with two maximal contract
signatures fits (tested).

## Trusted context only

| Input | Source |
|---|---|
| Sender and recipient keys | NIP-17 seal author (authenticated) and self, after `unwrapGiftWrap` |
| Role | the session (who sent it), never the message |
| Terms, account for the role | local review of the offered bytes against the local registry |
| EIP-712 domain, deployment | the locally loaded registry entry for `terms.networkId/deploymentId` (`resolvePeerDomain`) |
| Advertisement | the locally selected session (`ad` of the session) |
| Clock | trusted local clock, plus the pinned block's timestamp |

The reviewer Low is fixed: `verifyEoaPeerAcceptance(registry, domain, …)` refuses a caller domain that differs from
the registry entry (or when there is no EVM, protocol-1, non-upgradeable entry). The composed verifier takes no
caller domain at all. The wallet port additionally requires the exchange's reviewed chain id and escrow address, and
its termsHash, to equal what it recomputes from its own registry.

## Account classification (packages/wallet/src/evm-peer-verifier.ts)

One verification reads, through an injected EIP-1193 read port: chain id, genesis hash, the latest block (the
recorded anchor), the escrow code at that block (must match the registry runtime hash), then the signer's code at
that block:

| Code at the recorded block | Path |
|---|---|
| empty | EOA: both signatures exactly 65 bytes, low-s, v=27/28, recovering to the account. Otherwise (for example an ERC-6492 wrapper) refused `UNSUPPORTED` / `counterfactual-or-undeployed` |
| `0xef0100` + 20 bytes (EIP-7702 designator) | refused `UNSUPPORTED` / `eip7702-delegated` |
| other `0xef…` | refused `UNSUPPORTED` / `reserved-code-prefix` |
| other code | ERC-1271: `isValidSignature` must return `0x1626ba7e` for both digests via `eth_call` at the recorded block (100,000 gas each). No EOA fallback, no low-s rule |

Afterwards the account code must be unchanged, the recorded block still canonical (same hash and timestamp), the
chain and genesis unchanged, the registry objects unchanged and the block timestamp before the deadline. Evidence is
deep-frozen, carries no signature bytes, says `finality: 'unfinalized'` and `economicPreparationAllowed: false`, and
only evidence minted by this verifier (object identity) can be admitted to the replay ledger. Contract-wallet results
are labelled `accepted by contract wallet at block N (unfinalized)`.

## Durable replay and cancellation (packages/wallet/src/evm-peer-replay.ts)

The encrypted ledger sits behind the exchange's replay port (`packages/wallet/src/evm-peer-port.ts` serializes calls
per vault session). The exchange calls it only after authentication and every session check, and before the state
changes. Bindings are keyed by `(termsHash, role)`; an identical binding is a duplicate regardless of signature bytes;
a different binding is `CONFLICT`; a tombstoned termsHash is `TOMBSTONED` in every later session.

`cancel` and `terms-reject` of a session with reviewed terms write the tombstone durably before the state changes, on
the sending and the receiving side. If the write fails, the cancel or reject is refused and can be retried.

Lifetime, replacing the candidate's permanent 64-term bound (schema version 2; version 1 records migrate):

- New entries are refused (never evicted) beyond 8 per counterparty key, 16 per advertisement and 64 in total.
- An entry retires only once `now >= acceptBeforeSeconds + 86,400`. By then no statement for that termsHash can
  verify, since the deadline is inside the signed terms. A high-water mark `retiredThroughSeconds` refuses
  (`EXPIRED`) any later admission for terms at or below it, even after a clock rollback. A live tombstone is never
  removed.
- Version 1 entries and the unscoped `tombstone(termsHash)` carry no deadline. They never retire and count only
  against the total.

Cancellation races. If the tombstone lands first, the acceptance is refused. If the acceptance commits first, the cancel
returns `OUT_OF_ORDER` (the state machine still has no transition out of `accepted`), but the durable tombstone stays.
From then on nothing is shown as accepted (`withdrawn`, no label) and funding rechecks refuse.

## Rechecks, and no veto after funding

`acceptanceStatus(sessionId, purpose)` re-verifies every stored statement at a fresh block and re-reads the tombstone:
`'display'` (refusals become `invalid` / `expired` / `withdrawn` without a label), `'accept'` (done automatically
before a buyer acceptance) and `'fund'` (both statements valid for at least 120 s more). On rechecks the deadline is
`min(acceptBeforeSeconds, notAfterSeconds)`; on arrival the authenticated envelope expiry also applies. No result
authorizes funding: the escrow still lets the seller fund without acceptance.

After funding, acceptance state is never consulted. The G12 lifecycle, execution and escrow builders have no import
path to it, and a test prepares release and refund with an expired acceptance, a later tombstone and a delegated peer.

## Freshness, key rotation and backups

- Status carries `freshness: 'local-history'`: the ledger is this profile's history only.
- Messaging-key rotation cannot rebind existing terms: the same `(termsHash, role)` under a new key is `CONFLICT`.
  New keys need new terms (a new seller nonce). Tombstones are keyed by termsHash and survive rotation.
- A fresh-key restore of the latest backup keeps every tombstone (conservative).
- An older backup cannot learn tombstones recorded after it was made. Such a profile can admit those terms again and
  never claims global freshness. A separate profile has separate history.
- A cross-tab commit makes the stale tab's vault session `CONFLICT` and locks it (existing vault semantics). The
  refused message was not remembered, so it is processed again on redelivery after unlock.

## Signatures stay private

Signatures live only in the in-memory session (for rechecks) and the encrypted wire message. They are never put in
`SessionView`, results, status, the replay ledger or adverts, and the advert encoder refuses signature fields or
signature-shaped values in any advert field.

## Candidate guards: what replaced them

| Guard | Now |
|---|---|
| `candidateOnly: true` on the offline EOA result | Kept: the primitive alone still has no classification or durable admission. The composed path emits scheme, pinned anchor and `finality: 'unfinalized'` instead. |
| `economicPreparationAllowed: false` | Kept everywhere, permanently: acceptance is not funding authority. |
| Exchange limited to v1 `{revision}` | Kept when no ports are injected (byte-identical). D1 mode needs both ports, which only this composition provides. |
| Candidate envelope: contract signatures unsupported | The exchange carrier has an explicit 2,048-byte budget and the ERC-1271 path. The wallet's EOA view keeps the 65-byte rule for the fixed vectors and delegates parsing to the exchange (one wire format). |
| Ledger: no pruning, permanent 64-term bound | Replaced by quotas plus deadline retirement with a high-water mark. There is still no clear or delete API. |
| Caller-supplied domain | Replaced by the registry check (reviewer Low). |
| `LOCALPROOF`, `tradingEnabled: false`, `ReleaseEnabled=0`, no app wiring | Kept, unchanged. |

## Evidence

| Area | Tests |
|---|---|
| Carrier, downgrade, ports, races, budget, no wallet import | `packages/exchange/test/peer-acceptance.test.mjs` (11) |
| Registry-checked EOA primitive (Low) | `packages/wallet/test/evm-peer-acceptance.test.mjs` (8, one new) |
| Classification, ERC-1271, 7702, counterfactual, deadlines, cancel/timeout | `packages/wallet/test/evm-peer-verifier.test.mjs` (11) |
| Quotas, retirement, high-water mark, migration, rotation, backups | `packages/wallet/test/evm-peer-replay-lifetime.test.mjs` (7) |
| Existing ledger and EOA envelope tests, kept | `evm-peer-replay.test.mjs` (11), `evm-peer-envelope.test.mjs` (9, one new) |
| End-to-end composition, lock, reload, restore, adverts, no veto after funding | `packages/wallet/test/evm-peer-session.test.mjs` (9) |
| Real IndexedDB: two-tab cancel-vs-accept CAS race, reload, retirement persistence | `npm run test:peer:browser` (Chromium) |
| Real EVM: ERC-1271 contract wallet (`contracts/evm/test/mocks/PeerAcceptanceWallet.sol`), EOA, revoked policy, 7702 designator, counterfactual | `scripts/test-peer-acceptance-evm-local.mjs`, run by `npm run test:exchange:evm` (6 checks) |

## Not covered

- Independent review of the fields, vectors and flows. The vectors are self-generated with viem and cross-checked
  with Foundry's `ecrecover` for the original four only.
- Interoperability with any other implementation; real wallets, real devices, testnets or funds.
- An external-wallet prompt for the `PeerAcceptance` statement: the adapter still signs only TradeTerms, and only for
  EOAs. The UI does not show the statement yet.
- Finalized-block verification: ERC-1271 answers come from the latest, unfinalized block, and reorgs are detected
  only within one verification.
- Inbox discovery (kind 10050) and relay AUTH policy; post-acceptance withdrawal (state-machine change).
