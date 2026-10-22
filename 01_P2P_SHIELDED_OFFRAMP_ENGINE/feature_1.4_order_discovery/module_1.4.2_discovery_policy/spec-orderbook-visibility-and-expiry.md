# Orderbook visibility and expiry

## 1. Metadata

- **Specification:** G19
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Give public, invite-only and draft modes explicit disclosure and freshness rules.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
type Visibility="local-draft"|"public-minimal"|"invite-only";
interface PublicAdV1 {app:"p2p-offramp";v:1;orderId:string;revision:number;
 networkId:string;assetId:string;amount:string;currency:string;
 railClass:string;maker:string;expiresAtSeconds:string;termsDigest:string;}
// Maximum ad lifetime 3600 s; max ad content 8 KiB; single exact fill only.
// Public ad is not final SignedTradeTerms and cannot authorize funding.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Creation chooses visibility before publishing; show exact public fields, including amount/timing/network/maker key. Local drafts produce zero relay requests. Invite-only sends authenticated encrypted terms to selected peer keys with no public decryption key or public ad. Public ad signed expiry and revision are checked on receipt and before negotiation; now estimates use trusted configured time observations and unknown freshness blocks acceptance. Funding revalidates on-chain deadline and original G16 terms. Send NIP-40 expiration and best-effort NIP-09 deletion request on cancellation, but do not promise removal from observers/backups.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Expired ads disappear from actionable list but remain available encrypted as evidence if retained by user. Stale/missing revision requires maker reconfirmation; it cannot trigger funding. Sorting uses base-unit integer/rational values, deterministic tie by event ID, no floating price authority.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Search/relay subscriptions can disclose market interest. Signed ad authenticates author only, not solvency/reputation/identity. Invite recipients can redistribute plaintext.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Public fields preview matches exact serialized event; draft zero network; invite leaked to wrong recipient fails; 3600/+1 lifetime; signed already expired offer; local clock skew; expired offline restore; deletion refusal and fake liquidity. Assert no public bank/reference/location fields.

Sources: [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md), [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md), [NIP-44 version 2](https://github.com/nostr-protocol/nips/blob/master/44.md), [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
