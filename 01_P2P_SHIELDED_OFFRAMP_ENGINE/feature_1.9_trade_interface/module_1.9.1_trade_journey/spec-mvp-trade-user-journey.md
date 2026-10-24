# MVP trade user journey

## 1. Metadata

- **Specification:** G22
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Deliver a complete recoverable manual trade with optional proof/privacy/physical/dispute modules absent.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
type JourneyStep="setup"|"backup"|"wallet"|"discover"|"terms"|
 "funding"|"funding-uncertain"|"payment-coordination"|"release"|"refund"|"receipt";
interface JourneyView {binding:TradeBinding|null;step:JourneyStep;
 authority:"local"|"relay"|"chain-provisional"|"chain-finalized";
 actions:readonly string[];blockingReason:string|null;}
// Journey is derived from G08 state, G12 intents and immutable G16 terms;
// it never writes chain authority from a UI button.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Fresh user selects storage/backup and receives honest loss warning, explicitly connects approved wallet/network, browses or creates visibility-scoped offer, negotiates encrypted instructions and confirms both signatures/risk. Seller funds exact asset via approved allowance/native flow; uncertain wallet output shows reconciliation rather than retry. Buyer sees payment guidance only after G18 finalized matching funding and safety buffer. Private chat carries assertions only. Seller independently confirms receipt and explicitly signs release before expiry; at/after expiry any caller may trigger refund to seller. Receipt view shows native tx IDs, exact principal, fees separately, chain finality and no proof of fiat irreversibility. Refresh restores encrypted journal before allowing sends.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Account/network change disables new signing and preserves original trade watch/recovery. Rejection, RPC/relay outage, stale offer, locked vault and failed transfer each expose fixed G13 action. Keep export/direct ABI/IDL recovery reachable from every funded/uncertain step. No timed automatic wallet prompts or ambiguous success screens.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Role/amount/chain confusion and pressure near expiry cause harm. Display full recipient/account identity with safe copy/verification, explicit seller withholding/reversal risk and separate routing/finality/evidence indicators. Accessibility requires keyboard focus, live region status, reduced motion and no color-only authority indicators.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Two fresh clients complete EVM native/ERC-20 release and no-payment timeout; separately Solana native/SPL equivalents. Test refresh at every step, uncertain broadcast, rejected signature, wrong account/network, unavailable relays, deleted frontend recovery, near-expiry payment blocked and screen-reader/keyboard flow. Remove all advanced packages and repeat core flow.

Sources: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271), [Solidity security](https://docs.soliditylang.org/en/latest/security-considerations.html), [Solana transactions](https://solana.com/docs/core/transactions), [token accounts](https://solana.com/docs/tokens/basics/create-token-account), [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md), [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md), [NIP-44 version 2](https://github.com/nostr-protocol/nips/blob/master/44.md), [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Actual browser/mobile wallet matrix, test-network deployments and independent custody review precede any funds-enabled release. EVM-only preview is M2A, not Solana-complete M2C.
