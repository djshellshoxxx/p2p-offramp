# Blockchain escrow and payment processor attack verification matrix

## 1. Metadata

- **Specification ID:** ATTACK01
- **Version:** 1.0
- **Status:** Expanded design baseline — implementation and independent review pending
- **Owner:** p2p-offramp maintainers
- **Delivery phase:** 0
- **Normative precedence:** G01–G15 and the development roadmap govern core v1; candidate research profiles do not override them.

## 2. Objective

Turn the listed attacks into traceable fixtures and enabled-capability release gates. This is a defensive validation plan for the noncustodial off-ramp, not proof that any example contract/provider has been implemented or audited. Core basic escrow has no payment oracle, upgrade authority, juror or automatic fiat-finality claim; optional variants require separate opted-in deployments.

## 3. Assets, authority and architecture

Assets: escrowed token balances, correct buyer/seller identity, release authorization, dispute state, trade commitments, client-side credentials, private messages and payment confidentiality. Trust boundaries: caller to contract, contract to ERC20, oracle to contract, RPC to UI, injected wallet to app, relay to peer, proof attestor to verifier, and fiat institution to settlement statement.

Security invariants:
- `escrowBalance >= sum(outstanding liabilities)` for tracked tokens under supported token semantics, with clear handling of unsolicited transfers.
- For each trade, `releasedAmount + refundedAmount <= depositedAmount`; only one terminal disposition, including dispute paths.
- Funds leave escrow only after authorized, fresh settlement conditions or a separately defined timelock/dispute transition.
- Signature message is domain-separated by chain, verifying contract, action, trade ID, amount, token, payer, recipient, nonce and deadline. Each authorization can be consumed at most once.
- A contested fiat payment is not final merely because a browser screenshot or TLS proof says a transfer was initiated. Settlement semantics must be separately defined.
- Transaction ordering, gas price, block timestamps and third-party token behavior may be adversarial.

## 4. Verification and settlement algorithms

Unsafe (demonstration only):
```solidity
function refund(uint256 id) external {
    Trade storage t = trades[id];
    require(msg.sender == t.buyer && t.state == State.Funded);
    token.transfer(msg.sender, t.amount); // interaction before effects: unsafe
    t.state = State.Refunded;
}
```
Safer foundation, assuming the contract has precisely defined token and trade accounting; import audited library versions and tailor permissions:
```solidity
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
contract Escrow is ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum State { Unfunded, Funded, Released, Refunded }
    struct Trade { address buyer; IERC20 token; uint256 amount; State state; }
    mapping(uint256 => Trade) internal trades;
    function refund(uint256 id) external nonReentrant {
        Trade storage t = trades[id];
        require(t.buyer == msg.sender && t.state == State.Funded, "forbidden");
        t.state = State.Refunded; // effects before interaction
        t.token.safeTransfer(msg.sender, t.amount);
    }
}
```
**Required beyond example:** safe deposit flow, role/dispute authorization, all cross-function locks, fee-token policy, state invariant checks and event design. Library import path depends on pinned OpenZeppelin major version.

### Signing and ECDSA
EIP-712 domain `D=(name,version,chainId,verifyingContract)`; digest `H=keccak256(0x1901 || domainSeparator(D) || hashStruct(action))`. Struct fields must include `tradeId,token,amount,buyer,seller,recipient,nonce,deadline,action`. Verify `ecrecover(H,signature)` via audited ECDSA recovery enforcing `0 < s <= n/2`, valid `r`, supported recovery id, nonzero signatory and exact intended signer. EIP-712 provides structural binding, not automatic replay protection. Use `usedNonces[signer][nonce]` or action-scoped bitmaps; atomically consume nonce before any external call; expiration must be checked on-chain.

### Price and oracle policy
Preferred for manually negotiated P2P exchange: immutable signed quote with explicit base units and expiry; do not fetch a DEX spot price to determine contractual entitlement. For automated conversion, require feed allowlists, maximum age `block.timestamp - updatedAt <= maxAge`, circuit breakers, deviation `abs(P_new-P_reference)/P_reference <= delta`, appropriate decimals and a protocol-defined fallback that never silently releases at an attacker-selected rate. TWAP resists instantaneous price manipulation but does not eliminate long-window manipulation or broken markets. Simulate flash-loan adversaries manipulating liquidity and collateral.

### Transaction ordering / MEV
If there is **no swap**, a sandwich-style swap attack is not directly applicable to an escrow transfer, but order-dependent release, offer fills, and cancellation races remain. Bind `recipient`, `maxAmount`, `minReceived` (where relevant), `deadline`, `nonce` and escrow ID to consent. Build a terminal state machine so `release` and `refund` cannot both succeed. Private transaction submission may reduce public mempool exposure but entails relayer trust and offers no absolute MEV protection.

For core v1, G11 immutable deployment policy supersedes broad discussion of timelocked/proxy alternatives. A proof or payment-gateway response is evidence only, never core release authority. G12 durable reservation and chain-specific reconciliation supersede generic resubmit-on-error suggestions. Severity is a prioritization label, not a numeric probability or proof of exploitability.

## 5. Finding and test interfaces

Address rendering: contract address originates from signed deployment manifest, not payment-message text. On confirmation show checksummed complete address, chain, token, decimals, amount and chain explorer canonical origin. Disable submit on wallet chain mismatch; detect recent clipboard paste but do not silently replace it. Browser checksums detect mistakes, not malicious but correctly checksummed addresses.

RPC policy: query `eth_chainId`, `eth_getBlockByNumber` for agreed finalized height/hash, `eth_getCode` for deployed escrow, `eth_getLogs` with canonical block hashes, and `eth_getTransactionReceipt`. Compare two independently controlled provider endpoints (three if possible); transport diversity alone does not guarantee independence. If providers disagree on finalized block hash or required state, stop settlement UX and give manual chain-explorer verification. Verify receipt is on canonical chain and has required contract/address/topics, then wait chain-specific finality. Avoid trusting `eth_call` output alone; where supported use EIP-1186 state proofs and verify against trusted block headers, recognizing that full light-client consensus verification is a separate substantial subsystem. A two-RPC majority is **not** cryptographic consensus.

Wallet: EIP-1193 `accountsChanged` and `chainChanged` events invalidate cached simulation, signature requests and session assumptions. Confirm typed-data text and domain in independent UI; allow safe cancellation. A compromised wallet extension can defeat page checks; do not promise protection against malicious signing UI.

Payment evidence: an authenticated TLS transcript may establish what a server returned at a point in time, not that funds are irrevocably transferred. Trust assumptions include verifier implementation, certificate chain, attestor/notary honesty, freshness and provenance of the returned data. Release policy requires rail-specific finality, proof audience, amount/currency, destination/payee consistency and dispute controls.

```typescript
interface AttackCase {
  id: string; // stable C-xx or scoped addendum ID
  capability: string;
  preconditions: readonly string[];
  invariant: string;
  fixturePaths: readonly string[];
  evidencePaths: readonly string[];
  status: "specified" | "reproduced" | "mitigated" | "verified" | "not-applicable";
  rationale: string;
}
```

Every enabled-capability attack row maps to a test fixture and evidence before release. `not-applicable` requires a concrete scope reason (e.g. arbitration not installed), never a blanket waiver. Findings use sanitized local IDs and fixed descriptions, not secrets, bank data or private witnesses. An unresolved critical/high finding blocks the affected enabled capability. Failed/erroring tests are not mitigation evidence.

## 6. Attack and mitigation inventory

| ID | Attack / entry point | Failure mode | Defenses and verification |
|---|---|---|---|
| C-01 Critical | Classic reentrancy in escrow refund/release | External token or callback reenters before liability changes | CEI + nonReentrant + zero terminal state before transfer; malicious callback fuzz |
| C-02 Critical | Cross-function reentrancy | Refund path reaches release/cancel under shared accounting | Shared lock and mutually exclusive state machine; invariant across all entrypoints |
| C-03 High | Read-only reentrancy | Callback sees transient price/balance state and triggers downstream decision | Snapshot finalized state, avoid price functions depending on temporarily inconsistent external balances |
| C-04 Critical | Signature replay/malleability | Reused or alternate signatures authorize unintended releases | EIP-712 domain; low-s ECDSA, strict v, reject zero signer, per-action nonce/bitmap and expiry |
| C-05 Critical | Chain/contract replay | Signature valid on fork, proxy or other deployment | `chainId`, verifyingContract, immutable domain version and deployment mapping |
| C-06 Critical | Arbitrary ERC20 callback / fee-on-transfer | Incorrect credited escrow amount or malicious token transfer hook | Whitelist known semantics; checked balance delta when supported; SafeERC20; reject unsupported rebasing/fee tokens |
| C-07 High | Oracle manipulation / flash loan | Single-block DEX price used as settlement rate or collateral threshold | Avoid oracle if fixed price; otherwise curated feeds, heartbeat, staleness/deviation checks, TWAP and economic circuit breakers |
| C-08 High | MEV/front-running/reorder | Release/refund parameters or offers copied/reordered | Full parameter binding in signatures, commit-reveal when appropriate, short expiries, nonce, slippage/minOut where swap exists |
| C-09 Critical | Arbitrary external calls | Attacker chooses target, delegatecall or calldata | No generic privileged `call`/delegatecall; explicit target allowlist, audit adapters |
| C-10 High | Role/upgrade compromise | Proxy/admin drains escrow or changes release logic | Prefer immutable contracts; timelocked limited upgrades, multisig, governance scope tests |
| C-11 High | Denial of service | Reverting receiver/gas grief stalls pooled settlements | Pull-payment accounting, isolate each trade, bounded iterations and retry paths |
| C-12 High | Arithmetic/rounding | Decimal truncation/overflow misallocates transfers | Solidity >=0.8 checked arithmetic, token decimal rules, no unchecked casts, dust invariants |
| C-13 High | Time and liveness | Timestamp drift permits premature action / frozen funds | Explicit bounded windows, monotonic state transitions, escape hatches and dispute liveness proof |
| C-14 High | Transaction simulation mismatch | Client simulates different pending/final state than execution | Simulate exact call at current block; revalidate allowance/account/chain just before send |
| C-15 Critical | UI/clipboard address replacement | Victim sends tokens to poisoned/clipboard-spoofed address | Address derived from verified escrow contract, prominent full-address confirmation, QR and checksum, wallet simulation |
| C-16 Critical | Provider injection or phishing | Malicious `window.ethereum` alters account, chain, signature presentation | Explicit wallet selection, EIP-1193 event monitoring, local typed-data preview; warn that compromised provider can still deceive |
| C-17 High | RPC tampering/equivocation | Fake deposit, malicious chain ID, falsified receipts/balances | Pin chain/genesis and contract code hash; compare independent providers at same finalized block; fail closed on split |
| C-18 High | Network MITM | RPC or app JS swapped | HTTPS authenticated transport, CSP/SRI/content manifest, signature verify; on-chain proofs when possible |
| C-19 Critical | Proof forged/replayed | Reuse of payment proof for unrelated trade or stale bank activity | Bind cryptographic proof to trade, amount, currency, payee, proof issuance/expiry, issuer and audience; nonce consumed once |
| C-20 High | Payment reversal/fraud | "Paid" bank page later reverses or account holder disputes | Explicit bank/rail settlement-finality policy, separate dispute window, human arbitration or approved reversible-risk model |
| C-21 High | Messaging replay/Sybil | Fake counterpart or replayed release confirmation | End-to-end peer authentication, signed trade context, expiration, replay database and rate controls |
| C-22 High | Privacy linkage | Public chain/relay/fiat metadata reveals identity | Per-trade keys, envelope padding, avoid shared address reuse, clear traffic correlation risk |
| C-23 High | Secret leakage via browser state | XSS/extension/storage exposes signer key | External wallet, memory confinement, encrypted local records, strict CSP, key lifecycle tests |
| C-24 High | Chain reorg/bridge risk | Receipt counted before finality, bridged asset depegs | Chain-specific finality threshold, canonical block tracking, bridge allowlist or exclusion |
| C-25 High | Batch partial execution | Successful payout mixed with failed transfer creates ambiguous liabilities | Atomic per-trade transitions or explicit recoverable partial state machine |
| C-26 High | Permit misuse | Unbounded approvals and forged permit domain | Token-scoped allowances, spender confirmation, permit nonce/chain binding, revocation UX |
| C-27 High | Fake token and decimal confusion | Impersonated stablecoin or incorrect units | Exact chain + token address + code/issuer identity allowlists; integer base units throughout |
| C-28 High | Relayer censorship or bribery | P2P/chain action never appears | Relay diversity, retransmission bounds, direct-chain emergency action and deterministic expiry |
| C-29 High | Frontend dependency supply chain | Compromised npm/CDN package exfiltrates wallet trade state | Lockfile, SRI/manifest, signed releases, SBOM, least privilege, no runtime dependencies |
| C-30 Medium | Side-channel metadata | Relay ciphertext length and timing reveal trade state | Class-based padding, trade-id rotation, optional delayed batching, quantified residual leakage |

## 7. Verification program and primary-source review

Foundry unit/fuzz/invariant tests: `sum liabilities <= verified balance`, `release+refund <= deposit`, no terminal-state transition backwards, consumed nonces cannot be reused, reentrancy adversarial tokens, invalid ECDSA s, zero addresses, stale deadlines, token decimal boundaries, all refund/dispute interleavings. Echidna on invariants, Slither on source, differential tests against reference implementations, independent audit before live funds. Model-check permissions and liveness if formal tooling is available.

Browser tests: address poisoning and clipboard replacement, malicious EIP-1193 provider, wrong chain and fork, RPC split/rollback, fake logs, malicious relay payloads and XSS, expired/replayed fiat proofs, dropped messages, failed network, multi-tab stale account state. Run scripted load/race tests for duplicate `release`, `refund`, `cancel`, `dispute` calls with varied transaction order.

Security release gate: each critical/high row has a test identifier, accountable owner, exact implementation code path, attack reproducibility test, verified mitigation and residual risk sign-off. Severity is indicative and must be revisited on design changes.

### Reference repositories

These repositories are **research leads, not a blanket security endorsement**. Review the exact files, license and maintenance history before copying code:
1. [chainflag/awesome-blockchain-security](https://github.com/chainflag/awesome-blockchain-security) — curated blockchain security resource index.
2. [Aloneposix/Awesome-Blockchain-Security](https://github.com/Aloneposix/Awesome-Blockchain-Security) — security references and tools.
3. [kadenzipfel/smart-contract-vulnerabilities](https://github.com/kadenzipfel/smart-contract-vulnerabilities) — explanatory vulnerability/mitigation catalog.
4. [im23pds/BlockChain-Security-List](https://github.com/im23pds/BlockChain-Security-List) — historic vulnerability/security references.
5. [TokenMarketNet/smart-contracts](https://github.com/TokenMarketNet/smart-contracts) — historic Solidity examples, **not** production escrow template.
6. [Quillhash/Web3-Security-Tools](https://github.com/Quillhash/Web3-Security-Tools) — tool inventory; validate current status.
7. [blockchainhelp-eu/Payment-Gateway-coinpayments](https://github.com/blockchainhelp-eu/Payment-Gateway-coinpayments) — gateway integration example, not a model for fiat proof finality.

Authoritative companion references: [Solidity Security Considerations](https://docs.soliditylang.org/en/latest/security-considerations.html), [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/), [OWASP SCVS](https://scs.owasp.org/SCVS/), [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271), [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193), [EIP-1186](https://eips.ethereum.org/EIPS/eip-1186), [Foundry](https://book.getfoundry.sh/), [Slither](https://github.com/crytic/slither), [Echidna](https://github.com/crytic/echidna).

### Additional defensive tests

Map [NCSC Common Cyber Attacks](https://www.ncsc.gov.uk/guidance/white-papers/common-cyber-attacks-reducing-impact) to this project: phishing -> fake wallet/escrow origin tests; malware -> compromised-browser/extension risk and hardware-wallet confirmations; missing patches -> lockfile/CI vulnerability gates; insecure configuration -> CSP/permission-policy tests; excessive privilege -> least-privileged CI and no contract admin superuser; missing monitoring -> privacy-preserving signed release and on-chain anomaly signals; poor incident response -> public vulnerability disclosure and emergency pause/recovery criteria. These controls reduce exposure but cannot eliminate malicious endpoint risks.

The [NCSC Secure communications principles](https://www.ncsc.gov.uk/sites/default/files/pdfs/publication/secure-communication-principles.pdf) add communication-layer cases: sender impersonation, unauthorized relay-node plaintext access, compromised key infrastructure, audit-data exfiltration, abusive admin roles, metadata aggregation and relay monoculture. Every case needs attacker capability, precondition, test harness, expected rejection and residual leakage assessment.

Apply [CPA Build Standard v1.4](https://www.ncsc.gov.uk/files/CPA-Build_Standard_1-4.pdf) as a build-assurance evidence checklist, **not a certification claim**: signed threat-model revision; independent review of contract release state machine; static-analysis report; property-test seeds; fuzz corpus; third-party dependency/compilation manifest; repeatable release artifact; vulnerability intake/triage; rollback and emergency recovery exercise.

[Packet Storm Security](https://www.packetstatic.com/) supplies a supplementary archive of advisories, papers, tools and exploits. Use its [documented archive metadata](https://rss.packetstormsecurity.org/help/view/4) to trace each finding to CVE, vendor advisory, affected version, source, patch and regression test. Prioritize browser wallet-provider compromise, malicious npm packages, DOM injection, dependency takeover, RPC protocol handling, signing confusion and authentication replay. Archive PoCs are untrusted and must be manually reviewed before isolated reproduction; never deploy them into escrow clients. [Packet Storm API guidance](https://www.packetstatic.com/help/view/1) indicates credentials and access conditions, so avoid embedding a feed key in a static client. No claim is made that individual Packet Storm advisories have been exhaustively reviewed.
