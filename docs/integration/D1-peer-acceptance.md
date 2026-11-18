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
that block. The anchor's timestamp must be at most 900 s older than the local clock and at most 300 s ahead of it
(`stale-block` / `future-block`, UNAVAILABLE). Every code read and `eth_call` names the anchor by EIP-1898
`{blockHash, requireCanonical: true}`, and a provider that does not support that fails closed:

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

Lifetime and capacity, replacing the candidate's permanent 64-term bound (schema version 2; version 1 records migrate).
An independent review found that the first version of this patch held quota for a day past each deadline while
exchange slots recycle in about 17 minutes, so 16 ghosted offers could block an advert for over a day. Now:

- A live entry (a recorded statement) retires at `acceptBeforeSeconds + 300`. A high-water mark
  `retiredThroughSeconds` then refuses (`EXPIRED`) any admission for terms at or below it. `status` also reports
  them as withdrawn, so removing an entry (tombstone or not) never resurrects it after a clock jump and rollback.
  The mark only rises to the deadline of an entry actually retired, never to the clock.
- A statement that was never accepted (no buyer binding) is compacted into a tombstone once its session ended
  (advert expiry), because it can no longer progress. It then stops counting against live quotas.
- `cancel`/`terms-reject` tombstones are compact (no bindings, no scope) and never count against live quotas. Every
  entry with a deadline, live or tombstoned, counts against a budget of 192. A live entry is admitted only while it can
  reserve its own tombstone slot, so a cancel, a reject or an advert-expiry compaction of an existing entry never fails
  on capacity; at the bound, a new offer or acceptance is refused instead.
- New live entries are refused (never evicted) beyond 64 in total. Non-priority entries (an unselected seller-side
  session) are also bounded at 8 per counterparty and 16 per advertisement, and cannot use the last 16 live slots.
  Those stay for priority sessions: selected seller-side sessions and buyer-side sessions.
- Version 1 entries and the unscoped `tombstone(termsHash)` carry no deadline. They never retire and count against
  the live total.

A full ledger still refuses the statement being sent or received (`LIMIT_EXCEEDED`), including for a selected
session. It never displaces another session.

Verifier capacity. The exchange runs at most one verification per session. Another one, including a genuine
peer accept that arrives during a local display recheck, is refused `BUSY`. Copies of a rumor already being
processed are `DUPLICATE`. Neither result is remembered, so the caller or relay layer must redeliver the wrap, and it
then succeeds. A tombstone read and the binding and deadline checks run before any chain read. Residual, bounded:
the verifier allows 16 concurrent verifications in total, so 16 sessions each holding a slow verification could
delay others. Each such slot needs a session in which the local seller already sent an offer (or the local buyer
took the advert), so an anonymous flood cannot claim them.

Cancellation races. If the tombstone lands first, the acceptance is refused before any chain read. If a local
cancel or reject starts while an acceptance is being verified, the cancel wins: the acceptance is refused
`TOMBSTONED` and nothing is labelled. If the acceptance had already committed, the cancel returns `OUT_OF_ORDER`
(the state machine still has no transition out of `accepted`), but the durable tombstone stays. From then on nothing
is shown as accepted (`withdrawn`, no label) and funding rechecks refuse.

## Rechecks, and no veto after funding

`acceptanceStatus(sessionId, purpose)` re-verifies every stored statement at a fresh block and reads the tombstone
before and again after the (slow) re-verification, so a cancel that lands meanwhile is reported as `withdrawn`:
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
| Carrier, downgrade, ports, races, budget, single-flight and rumor dedupe, status re-read, no wallet import | `packages/exchange/test/peer-acceptance.test.mjs` (13) |
| Registry-checked EOA primitive (Low) | `packages/wallet/test/evm-peer-acceptance.test.mjs` (8, one new) |
| Classification, ERC-1271, 7702, counterfactual, deadlines, cancel/timeout, EIP-1898 pinning, block age | `packages/wallet/test/evm-peer-verifier.test.mjs` (12) |
| Quotas, priority reserve, ghost-session release, retirement, high-water mark after jump and rollback, tombstone budget, migration, rotation, backups | `packages/wallet/test/evm-peer-replay-lifetime.test.mjs` (10) |
| Existing ledger and EOA envelope tests, kept | `evm-peer-replay.test.mjs` (11), `evm-peer-envelope.test.mjs` (9, one new) |
| End-to-end composition, lock, reload, restore, adverts, 16 ghosted offers then an honest buyer, no veto after funding | `packages/wallet/test/evm-peer-session.test.mjs` (10) |
| Frozen v2 carrier vectors (generator, versions, SHA-256) recomputed with repository code | `packages/wallet/test/evm-peer-v2-vectors.test.mjs` (3), `packages/wallet/test/fixtures/peer-acceptance-v2-README.md` |
| Solidity struct hashes, digests and `ecrecover` for the v2 vectors | `contracts/evm/test/PeerAcceptanceV2Vector.t.sol` (3) |
| Real IndexedDB: two-tab cancel-vs-accept CAS race, reload, retirement persistence | `npm run test:peer:browser` (Chromium) |
| Real EVM: ERC-1271 contract wallet (`contracts/evm/test/mocks/PeerAcceptanceWallet.sol`), EOA, revoked policy, 7702 designator, counterfactual | `scripts/test-peer-acceptance-evm-local.mjs`, run by `npm run test:exchange:evm` (6 checks) |

## Not covered

- Independent protocol and cryptographic review of the fields and flows. The vectors are self-generated with viem;
  Solidity `abi.encode` and `ecrecover` recompute the original four and the frozen v2 carrier vectors.
- Interoperability with any other implementation; real wallets, real devices, testnets or funds.
- An external-wallet prompt for the `PeerAcceptance` statement: the adapter still signs only TradeTerms, and only for
  EOAs. The UI does not show the statement yet.
- Finalized-block verification: ERC-1271 answers come from the latest, unfinalized block, and reorgs are detected
  only within one verification.
- Inbox discovery (kind 10050) and relay AUTH policy; post-acceptance withdrawal (state-machine change).
