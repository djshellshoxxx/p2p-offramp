# Escrow contract interface — implementation and security specification

## 1. Metadata

- **Specification:** spec-escrow-contract-interface
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Specify immutable basic custody: seller deposits, seller alone releases to buyer before deadline, and anyone may execute a refund to the seller at/after deadline. There is no buyer payment claim, juror, oracle or admin exit.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
struct Trade { bytes32 termsHash; address seller; address buyer;
 address token; uint256 amount; uint64 expiry; State state; }
// State: UNINITIALIZED, FUNDED, RELEASED, REFUNDED
fund(TradeTerms publicTerms, bytes sellerAcceptance, bytes buyerAcceptance) payable
release(bytes32 tradeId)
refund(bytes32 tradeId)
getTrade(bytes32 tradeId) view returns (Trade)
// Native asset uses G16 assetKind=0 and zero address sentinel; never address guessing.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Funding validates both G16 public-term acceptances (private agreement is only a salted digest), caller seller, registry-bound immutable deployment, nonzero distinct participants, amount >0, unused seller nonce and funding time strictly before acceptBeforeSeconds; require expiry duration 1800..604800 seconds. Use checked arithmetic, pinned Solidity 0.8 compiler, reviewed SafeERC20 and reentrancy guard. Native msg.value equals principal; ERC-20 msg.value is zero and received delta equals principal. Store terms/nonce and transfer atomically: any failure reverts all effects. Release requires FUNDED, caller seller and block.timestamp < expiry; refund requires FUNDED and block.timestamp >= expiry and pays only stored seller regardless of caller. Set terminal state before external payout under guard; revert restores FUNDED if payout fails. Zero protocol fee in basic v1: principal out equals funded principal exactly. No proxy upgrade, sweep, destination override or privileged drain.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Contract errors: InvalidState, Unauthorized, InvalidTerms, Expired, NotExpired, UnsupportedAsset, IncorrectDeposit, DuplicateTrade, InvalidSignature, UnsafeToken. Repeated settlement reverts InvalidState; UI rereads terminal state. Failed recipient transfer leaves recoverable funded principal but cannot redirect to a caller-selected address. G12 reconciles ambiguous broadcasts.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Seller can withhold after fiat arrives; explicit G17 acknowledgement is required. A malicious token or callback cannot access another trade or settle twice. Forced native donations create surplus without ownership rights. Contract signatures use EIP-1271; invalid/malleable/domain-replayed signatures fail. Solana uses a distinct program contract in its adapter spec, not Solidity signatures.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Foundry/property tests: random sequences conserve principal and permit at most one terminal transfer; deadline -1/exact/+1; unauthorized buyer/caller; EIP-1271 revocation; duplicate seller nonce across orders; chain/deployment replay; false/no-return/reentrant/fee/rebase tokens; receiver revert; forced ETH; maximum uint overflow. Slither and independent review are evidence gates, not completed claims.

Sources: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271), [Solidity security](https://docs.soliditylang.org/en/latest/security-considerations.html), [SafeERC20](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/utils/SafeERC20.sol). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Freeze ABI, compiler/library lock and deployed runtime identity after review; no live deployment approved.
