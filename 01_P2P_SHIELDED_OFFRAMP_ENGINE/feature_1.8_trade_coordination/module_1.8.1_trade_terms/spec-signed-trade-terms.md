# Signed trade terms

## 1. Metadata

- **Specification:** G16
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Create one immutable agreement binding both counterparties and exact custody parameters before funding.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface PrivateAgreementV1 {v:1;orderId:string;revision:number;
 fiatCurrency:string;fiatMinorUnits:string;fiatScale:number;
 paymentInstructions:string;capabilities:readonly CapabilityV1[];
 agreementSalt:string;}
interface CapabilityV1 {id:string;version:string;policyHash:string;}
interface TradeTermsV1 {v:1;orderId:string;revision:number;networkId:string;
 deploymentId:string;chainIdentity:string;seller:string;buyer:string;
 assetKind:"native"|"erc20"|"spl";assetAddress:string|null;amountBaseUnits:string;
 privateAgreementHash:string;capabilitiesHash:string;sellerNonce:string;
 acceptBeforeSeconds:string;escrowExpirySeconds:string;mode:"basic-manual-v1";}
interface AcceptanceV1 {termsHash:string;role:"seller"|"buyer";
 walletAccount:string;signature:Uint8Array;}
// Private agreement <=16 KiB; instructions <=4 KiB; agreementSalt 32 random bytes.
// Capabilities <=8 sorted unique ASCII IDs (1..64 bytes), versions 1..32 bytes.
// Order ID and seller nonce each exactly 32 random bytes; revision uint64 >=1.
// Asset amount uint256 EVM/u64 Solana; fiat uint128 >0, scale 0..6; times uint64.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Registry IDs resolve approved native identities, but the contract/program MUST also bind actual native asset address/mint and kind rather than trusting an off-chain asset ID. Both parties sign the identical public terms digest before seller funding; role is checked by verifying against the stored seller/buyer account rather than changing the signed digest. Seller nonce is unique deployment-wide across orders. Fixed exact fill and zero protocol fee only. All signatures and terms expire for funding at `acceptBeforeSeconds`; require funding chain time < acceptance deadline and 1800 <= escrowExpiry - chain time <=604800. A funded trade ignores later acceptance expiry. Generation changes discard pending signatures.

Private agreement is shared only inside authenticated encrypted negotiation. Encode its exact field order using length-prefixed UTF-8 values (u32 big-endian byte length), unsigned integers in fixed-width big-endian (v u8, revision u64, fiatMinorUnits u128, fiatScale u8), capability count u8 followed by capability entries, and final raw 32-byte agreementSalt. Prefix raw ASCII `p2p-offramp/private-agreement/v1` followed by zero byte. Reject invalid UTF-8, unknown fields, duplicate capabilities and noncanonical integers. No Unicode normalization is applied after agreement; displays use the exact signed bytes. `privateAgreementHash` is SHA-256 of this salted byte encoding. Random salt prevents cheap dictionary guesses of low-entropy fiat terms. `capabilitiesHash` is SHA-256 of the exact same count+entry encoding without salt, and binds the enabled public capability policy; a core trade uses count zero. Hash algorithm identity is explicit and must not be confused with EVM Keccak.

EVM public terms are EIP-712 type `TradeTerms(uint8 v,bytes32 orderId,uint64 revision,string networkId,string deploymentId,address seller,address buyer,uint8 assetKind,address asset,uint256 amountBaseUnits,bytes32 privateAgreementHash,bytes32 capabilitiesHash,bytes32 sellerNonce,uint64 acceptBeforeSeconds,uint64 escrowExpirySeconds,uint8 mode)`. Native assetKind=0, asset=zero address; ERC-20 assetKind=1 with actual approved nonzero token; mode=0 means basic manual v1. Domain is name `P2POfframp`, version `1`, exact chainId and verifyingContract. chainIdentity/deployment native address are supplied through that domain and validated against registry IDs; arbitrary redundant identity strings are not independently signed substitutes. termsHash is the exact EIP-712 digest and both acceptance signatures cover it; EOA and EIP-1271 verification are separate approved paths. The funding ABI transmits these public fields and signatures only, never private agreement bytes or bank instructions.

Solana signs raw canonical bytes, not the EVM digest. Prefix ASCII `p2p-offramp/solana/basic/v1` and zero; then raw 32-byte genesis hash, program ID, order ID, seller key, buyer key, asset mint (all zero bytes for native), selected token-program ID (all zero for native), privateAgreementHash, capabilitiesHash and sellerNonce; followed by v u8=1, revision u64 LE, assetKind u8 (0 native, 2 SPL), principal u64 LE, acceptBefore u64 LE, expiry u64 LE, mode u8=0. Registry text IDs are off-chain lookup aids; native genesis/program/mint/program identity bytes are the authenticated authority. Solana does not expose a genesis-hash sysvar: approved immutable program build stores a network-domain constant matching the registry genesis bytes and rejects messages with any other value; client RPC genesis checks alone cannot supply this program-side binding. termsHash is SHA-256 of those exact bytes. Both Ed25519 signatures cover the raw message. Escrow program validates the actual Ed25519 verification instruction and Instructions sysvar, exact public keys/message bytes and offsets; cross-instruction offset references or arbitrary unverifiable success flags are rejected. Seller transaction signature alone is not buyer acceptance. PDA initialization and seller nonce replay guard are program-owned. This domain deliberately prevents EVM/Solana acceptance interchange.

Editing any private/public agreement field requires new hash and both signatures. Cancellation/revision changes invalidate local negotiations; on-chain seller nonce prevents a second funded fill even across different order IDs. Relay cancellation cannot alter funded terms. Acceptance signatures authenticate account consent, not fiat truth.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Reject unknown fields, noncanonical numbers, wrong role/account/domain, expired acceptance, unsupported capabilities, stale revision or missing risk consent before wallet. G10 generation changes invalidate pending signatures. Failed funding cannot be assumed nonce consumption: reconcile native state. Funded terms immutable even if advertisement cancelled.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Signatures authenticate account acceptance, not physical identity/fiat truth. A maker can equivocate signed revisions; UI flags conflict and native seller nonce limits funding. Public terms hashes can link encrypted conversations to chain.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Flip every bound field; EIP-712 chain/contract replay; EIP-1271 failure; seller/buyer swap; same nonce across order IDs and two buyers; sorted capabilities/duplicate IDs; unsafe integer/float and expired deadlines. Independent digest vectors required for each family.

Sources: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271), [Solidity security](https://docs.soliditylang.org/en/latest/security-considerations.html), [Solana transactions](https://solana.com/docs/core/transactions), [token accounts](https://solana.com/docs/tokens/basics/create-token-account). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

The explicit native profiles above require independent golden fixtures, reviewed EVM ABI/type hashes and Solana Ed25519 instruction parsing before enablement; no arbitrary JSON signing or unverified instruction references. Signature byte bounds and contract-wallet support must be recorded per evaluated provider under G10.
