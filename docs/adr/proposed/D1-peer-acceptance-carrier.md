# D1 - Peer acceptance carrier (decision packet)

Status: ACCEPTED by the owner on 2026-11-04: **Option B**. The owner confirmed it in the coordinating Claude session. Nothing is implemented yet, and the version identifier, exact field names and independent review this packet requires still come first. Until that work lands, no wire format, signing rule or trust transition changes.

Paths marked "main" exist on `main` (e9b9db3). Paths marked "PR #26 only" exist only on the PR #26 branch (94554ec).

## The question

How should one party prove to the other, over the encrypted messaging channel, that their wallet accepted exactly these terms, so that a client can honestly show "accepted"?

Today it cannot. The journey stays labeled `LOCALPROOF` with trading disabled until this is chosen.

## Current source behavior

- `terms-accept` carries only `{revision}`. It is a buyer-only message with no signature. The parser is in `packages/exchange/src/messages.ts` (case `terms-accept`, main). The state machine accepts it only from the buyer while the session is `offered` (`packages/exchange/src/machine.ts:18`, main). The file header says an accept is "a negotiation statement, never funding".
- The envelope is already versioned (`v: 1`). It has exact keys, `ad`, `orderId`, a random `nonce`, `expiresAtSeconds`, the `termsHash`, and the `sender` and `recipient` Nostr keys. The 3600-second lifetime limit (`MAX_MESSAGE_LIFETIME_SECONDS`) is enforced relative to receipt time in `packages/exchange/src/exchange.ts:327` (main), not in the parser. The envelope travels as a NIP-17 kind-14 rumor, sealed with NIP-44 and gift-wrapped with NIP-59. The exchange calls `createSeal` and `createGiftWrap` from `packages/nostr-crypto/src/nip59.ts` directly (`exchange.ts:13`). It uses only the kind constant from `nip17.ts`, not its send and receive helpers (main). The whole envelope is capped at 24,576 bytes.
- The signed object is the EIP-712 `TradeTerms` struct under the domain name `P2POfframp`, version `1`, with `chainId` and `verifyingContract` (`packages/wallet/src/evm-terms.ts`, `TRADE_TERMS_TYPE` and `domainSeparator`, main). The struct starts with a `uint8 v` struct-version field. It then covers order id, revision, network id, deployment id, seller, buyer, asset kind and address, amount in base units, the private agreement hash, the capabilities hash, a seller nonce, `acceptBeforeSeconds` (the deadline), `escrowExpirySeconds` and mode. The "termsHash" is the EIP-712 digest itself. It contains neither the role nor any Nostr key.
- EOA verification is strict: exactly 65 bytes, v of 27 or 28, and `0 < s <= n/2` (low-s). The role selects the stored seller or buyer account (`verifyEoaSignature` and `verifyEoaAcceptance`, same file). The private bundle verifier `verifyEvmAgreementBundle` takes `{privateAgreement, domain, terms, acceptances}`, with exactly two acceptance items, each a 65-byte EOA signature (`packages/wallet/src/evm-agreement.ts:23`, `:38` and `:63`, main). It is a private worker input, not a peer protocol.
- The escrow contract never sees acceptance signatures. `_bind` checks only that `terms.seller == msg.sender` (`contracts/evm/src/BasicEscrow.sol:292`). It enforces `acceptBeforeSeconds` (`:298`) and derives the trade id from the terms with `tradeIdOf` (`:304`, defined at `:266-267`, main). **So the seller can fund an escrow without any buyer acceptance, and no peer acceptance carrier changes that.** `docs/governance/PENDING-DECISIONS.md` (PR #26 only) records that this must be reconciled and that the old ABI must not gain signature arguments.
- The exchange state machine treats `accepted` as terminal, and `cancel` is valid only from `taken` or `offered` (`packages/exchange/src/machine.ts:18-20`, main). Today no message withdraws an acceptance.
- Contract-wallet (ERC-1271) checking is a read-only `eth_call` of `isValidSignature` that expects `0x1626ba7e` (`packages/wallet/src/evm-contract-acceptance.ts`, PR #26 only). `npm run test:eip1271:local` exercises it against a controllable fixture (`scripts/test-eip1271-local.mjs` and `contracts/evm/test/mocks/Eip1271RecoveryFixture.sol`, both PR #26 only).
- The journey snapshot says `label: 'LOCALPROOF'`, `tradingEnabled: false`, and productionBlocker "Peer wallet-acceptance carrier and maintained signing trust root remain undefined." (`apps/web/src/journey/private-trade.ts:43`, PR #26 only).
- The take-request body already says `buyerAddress` and `buyerMessagingKey`, and requires the key to equal the sender, but nothing proves the wallet owns that key.

## Options

All three keep the escrow ABI and the `TradeTerms` struct unchanged.

**Option A - signatures inside version 2 of the existing messages, no wallet commitment to the messaging key.** `terms-offer` carries the seller's signature and `terms-accept` carries the buyer's. Each item holds role, account, scheme (`eoa` or `erc1271`) and signature. Identity binding comes only from the authenticated NIP-17 seal. This is small and fits the current state machine. Weakness: a valid signature can be re-carried under a different Nostr key, so "this account is this chat partner" rests on an unsigned claim.

**Option B - Option A plus a second wallet-signed binding.** Each party also signs a small EIP-712 `PeerAcceptance` struct in the same domain with `termsHash`, role, account, own Nostr key, counterparty Nostr key and `notAfterSeconds`. This ties account, messaging key and expiry together without touching `TradeTerms`. Cost: a second wallet prompt, more vectors, and a new struct that needs independent review.

**Option C - no peer carrier now.** Keep `{revision}` as communication only. Remote acceptance stays unavailable and funding remains the only binding event. There is no new attack surface and no compatibility work, but `LOCALPROOF` cannot be left for remote trades.

## Recommendation

Option B, proposed for owner decision. It is the only option that lets a client prove account, role, messaging key, terms and expiry together. Before any use it needs a version identifier, exact field names and independent review.

The owner would also be choosing these sub-rules (all proposed):

- Order: the seller signs first and attaches the signature to the offer; the buyer verifies, then signs. Neither signature covers the other. The digest has no role, and `seller` must differ from `buyer`, so one account cannot fill both roles.
- Expiry: the effective deadline is the earliest of `acceptBeforeSeconds`, `notAfterSeconds` and the envelope expiry. A message that arrives after it is refused.
- Revocation: before acceptance, a `cancel` withdraws an offer. The current state machine has no transition out of `accepted` (`machine.ts:18-20`), so withdrawing after acceptance would need a separately reviewed state-machine change. Until then an acceptance cannot be withdrawn off-chain before `acceptBeforeSeconds`. There is no on-chain revocation either way, because the contract never sees the signatures. After funding, signatures give no new authority and exits are unchanged.
- Replay across sessions: a `cancel` or `terms-reject` durably tombstones the `termsHash`. Any later signature or binding for a tombstoned `termsHash` is refused, even inside a new `(ad, buyer key)` session.
- Replay and conflicts within a session: the account for each role is already fixed by the terms, so record bindings by `(termsHash, role)`. An identical resend is a no-op. A second binding for the same `(termsHash, role)` that names different Nostr keys is a conflict and fails closed. A second valid signature over the same binding (some signers are not deterministic) is a duplicate. Deduplication never compares signature bytes. The current in-memory window of recently seen rumor ids is not enough, so this record needs durable storage.
- Cross-chain and cross-contract replay: the domain already holds `chainId` and `verifyingContract`, and the terms hold `networkId` and `deploymentId`. The client must rebuild the domain from its own registry, never from the message.
- No downgrade: a `TradeTerms` signature that arrives without its `PeerAcceptance` binding is refused. It is never accepted as Option A.
- Scheme choice: the verifier derives the scheme (EOA or ERC-1271) from the account's code at the pinned block, never from a field the sender chose. Accounts that hold both a private key and code (for example EIP-7702 delegated EOAs) need an explicit policy decision before they are supported.
- ERC-1271: verification is a point-in-time `eth_call` at a recorded block, not a permanent fact, and the recorded block is not finalized. Show "accepted by contract wallet at block N (unfinalized)" and recheck before display. A buyer's contract-wallet validity at funding time has no on-chain effect, because the contract never checks it. Counterfactual (not yet deployed) wallets stay unsupported until separately decided. The low-s rule applies to EOA signatures only; contract wallets may accept high-s twins, which is another reason deduplication never uses signature bytes.
- Size budget: an offer may carry up to 16,384 bytes of terms plus two hex-encoded ERC-1271 signatures of up to 4,096 bytes each, which can exceed the 24,576-byte envelope cap. Version 2 needs an explicit per-message byte budget.
- Deadlines: the contract compares against `block.timestamp`. The client shows expiry with a safety margin rather than at the exact second.
- Second wallet prompt: `PeerAcceptance` already covers the `termsHash`. The owner should confirm whether the separate `TradeTerms` signature is still needed, for example for compatibility with the existing G16 bundle verifier.
- Compatibility: a version 1 reader must fail closed on version 2 (the parser already rejects unknown versions and keys). Open question: whether the capabilities hash needs the pending G14/G16 mapping settled first.

## What a receiving client must check before showing "accepted"

1. The gift wrap, seal and rumor authenticate, and the seal key equals the rumor key equals the expected counterparty key.
2. The envelope is version 2 with exact keys, within the size cap, not expired, and not a replay.
3. The `termsHash` recomputed locally from the reviewed terms and the local registry domain equals the carried one.
4. The role matches the sender, and the account equals the seller or buyer in the terms.
5. The signature is valid for its scheme (EOA: strict low-s recovery; ERC-1271: the magic value at a pinned block with a live session).
6. The binding signature covers both Nostr keys and its deadline has not passed.
7. Both roles pass, the seller's first, and the `termsHash` is not tombstoned. Only then show "signatures verified for both wallets". Funding status comes from chain observation only, because the seller can fund without any acceptance. The display implies no obligation, payment or fiat receipt.

## Test vector requirements

Do not invent hex values. Vectors must come from at least two independent implementations (for example ethers, which produced `packages/wallet/test/fixtures/g16-independent.json` on main, plus a second library or Foundry) and be frozen with generator, versions and a hash, as that fixture's README describes.

- Positive: EOA seller and buyer on a native trade and an ERC-20 trade; the binding signature for both roles; a NIP-44 and NIP-59 round trip using the official NIP vectors; an ERC-1271 positive from the local fixture.
- Negative: high-s twin; v not 27 or 28; wrong length; wrong role; swapped accounts; changed chain id, contract, asset, amount, deadline, revision or nonce; wrong or swapped Nostr key; expired; duplicate; a version 1 reader given version 2; oversize envelope; ERC-1271 wrong magic, revert, gas exhaustion, short return and oversize return (fixture modes 1 to 5 in `Eip1271RecoveryFixture.sol`), revoked approval (the fixture's `setApproval`) and reorg (driven by `scripts/test-eip1271-local.mjs:45` and `:48-50`, not by a fixture mode); a tombstoned `termsHash` re-offered in a new session; a bare `TradeTerms` signature without its binding; a conflicting second binding; and an offer over the per-message byte budget.

## Requirements still open before Option B can be specified

A comparison with the companion security research in PR #30 (`docs/research/security-2026-11-03/`, sections on escrow and wallet authority and on messaging identity) found these gaps. They are listed for the owner, not decided here:

- **Exact format:** the version identifier and exact field names of `PeerAcceptance` are still deferred.
- **Key lifecycle:** what happens to a binding when a party's messaging key changes, after an identity restore, and across reconnects and restarts.
- **Session mapping:** the receiving client must map the authenticated peer and session to the binding before any economic preparation, not only before display.
- **What the user sees:** the user should see the actual statement their wallet is asked to sign.
- **EIP-7702 accounts:** a rule is still needed, not only a flag.
- **ERC-1271 timing:** recheck before each new economic action (approval, funding, release), not only before display.
- **Policy changes mid-trade:** what happens if the signer's contract-wallet policy changes after the off-chain payment has begun.
- **Identity layers:** keep the relay-authenticated (NIP-42) identity, the seal author and the wallet account separate, and never let a relay publish status promote agreement state.
- **Inbox and AUTH policy:** kind-10050 inbox discovery and the relay AUTH policy need to be decided together with the carrier.
- **Existing messages:** confirm that existing `{revision}` acknowledgements keep their current meaning.

## What this unblocks

Leaving `LOCALPROOF` for remote acceptance, a real "accepted" state in the journey, and turning the two-wallet T43 composition into a peer protocol. It does not unblock funding, a signing trust root, or the G16 versus ABI question, which remain separate decisions.
