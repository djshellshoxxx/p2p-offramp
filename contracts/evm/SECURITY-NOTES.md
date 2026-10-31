# BasicEscrow — security self-review notes

Status: author self-review and automated evidence only. **Not** an independent audit; the roadmap M2C
gates (independent review, zero unresolved critical/high findings, verified deployment identity) remain
open. Test networks only.

## Trust model and authority

- No owner, admin, proxy, pause, upgrade, sweep, fee, operator, juror or oracle. No `receive`/`fallback`.
  The only constructor input is the ERC-20 allowlist, fixed forever (no setter exists).
- Authority per trade: seller (`msg.sender == terms.seller` at funding) alone may `release` before the
  deadline; anyone may `refund` at/after the deadline but the beneficiary is always the stored seller;
  anyone may `withdraw` a deferred credit but only to the credited recipient.
- Accepted economic risk (G17, manual settlement): a seller can withhold release after fiat arrives and
  simply wait for the refund. The contract cannot observe fiat payment and does not try.

## Payout failure handling (design choice)

Settlement is push-then-credit:

1. State becomes terminal and the event is emitted before any external call (checks-effects-interactions,
   plus OpenZeppelin `ReentrancyGuard` on every state-changing function).
2. Native: `call` with a fixed `NATIVE_PUSH_GAS = 50_000` stipend and zero return-data copy (no
   return-bomb). ERC-20: `SafeERC20.trySafeTransfer` (accepts bool and no-return tokens, never reverts).
3. On failure the principal is credited to `pendingWithdrawals[recipient][asset]` and `PayoutDeferred` is
   emitted. `withdraw(recipient, asset)` (anyone may call; forwards all gas) pays only `recipient`; on
   failure it reverts and the credit is preserved for retry.
4. `MIN_PAYOUT_GAS = 120_000` must remain when the payout starts; otherwise the whole settlement reverts
   (`InsufficientGas`). A third-party refund caller therefore cannot force a deferral by under-supplying
   gas (EIP-150 63/64 rule).

Why not revert-on-failure (the earlier spec wording): a buyer contract that rejects ETH, a gas-burning
receiver, or an issuer blacklist would make an honest seller's `release` impossible; after the deadline the
funds would go back to the seller while the buyer had already paid fiat. With revert-on-failure a seller
whose own address rejects payments (or is blacklisted) would also trap principal forever. Push-then-credit
keeps the seller's decision final, never redirects funds, and leaves recovery to the bound recipient.
Trade-off: a recipient that needs more than 50k gas to accept ETH (some smart wallets) needs a second
`withdraw` transaction; clients must surface `PayoutDeferred` and the pending balance.

## Token policy

- Allowlist only; at most 32 tokens; each must have code and be unique at construction.
- Funding checks the escrow's exact balance delta; any fee-on-transfer token reverts `IncorrectDeposit`.
- Excluded by policy (MUST NOT be allowlisted): rebasing / elastic-supply tokens (balance can shrink after
  funding, breaking conservation), ERC-777 / ERC-1363 / hook-calling tokens (callbacks; guarded, but out of
  scope), upgradeable tokens whose implementation can add fees/hooks without review, gas-griefing tokens
  (a token that burns all gas on `transfer` makes settlement revert rather than defer), tokens with
  transfer blocks that can freeze the escrow address itself (issuer risk; must be disclosed).
- Blacklist of a recipient only defers that recipient's payout; it cannot move funds elsewhere.

## Forced ETH and accounting

Forced ETH (selfdestruct / coinbase) creates surplus with no owner and no withdrawal path. Liabilities are
only `Funded` principals plus `pendingWithdrawals`; invariant tests assert balance == liabilities in a
closed system, and a unit test asserts surplus never becomes withdrawable.

## Self-review checklist (slither-style)

| Check | Result |
|---|---|
| Reentrancy (all external-call paths) | `nonReentrant` on fund/release/refund/withdraw; effects before calls; attacker tests for push, withdraw, token-callback during funding and payout |
| Unchecked low-level calls | Native push result recorded; withdraw reverts on failure; ERC-20 via SafeERC20 |
| Return-data bomb | Native calls copy 0 bytes; `trySafeTransfer` copies at most 32 bytes |
| Gas griefing | Fixed 50k stipend; `MIN_PAYOUT_GAS` prevents forced deferral |
| Authorization | Seller-only release; refund/withdraw beneficiaries fixed; fund requires `terms.seller == msg.sender` |
| Timestamp dependence | Intended: release `<` deadline, refund `>=` deadline (disjoint, exhaustive; fuzzed). Miner skew (seconds) is negligible against the 1800 s minimum duration |
| Replay | tradeId = EIP-712 digest bound to chainId + escrow address; trade id and seller nonce single use forever |
| Integer overflow | Solidity 0.8 checked arithmetic; uint256 amounts fuzzed up to `type(uint256).max`; deadline window computed in uint256 |
| Front-running | Release vs refund at the boundary: whichever is included first wins, the other reverts (`InvalidState` / `DeadlinePassed` / `DeadlineNotReached`); tested in both orders |
| Denial of service | No unbounded loops in settlement; allowlist loop bounded at construction |
| Locked ether | Only forced ETH, by design (no sweep) |
| Signature verification | None on-chain (see README); buyer acceptance verified off-chain |

### Tool output

- `slither 0.11.3` (`slither . --filter-paths "lib/|test/"`, run 2026-10-27 against solc 0.8.30):
  5 informational results, 0 low/medium/high. Dispositions:
  - `timestamp` (release, refund, `_bind`): intended deadline semantics; see table above.
  - `assembly` (native push and withdraw): deliberate, to bound gas and skip return-data copying; both
    blocks are `memory-safe` single `call`s.
- `forge lint`: three `asm-keccak256` gas notes on the EIP-712 hashing; kept in Solidity for readability.

## Open items (before any non-test deployment)

- Independent audit; formal review of the push-then-credit deviation from the original spec wording.
- On-chain EIP-712 / EIP-1271 acceptance verification is not implemented (accepted for basic v1; buyer
  acceptance is checked by the seller client).
- Registry binding of `networkId`/`deploymentId` strings is off-chain (G11); the contract only hashes them.
- Deployed runtime bytecode hash, compiler metadata and ABI must be frozen and recorded in the G11 registry.
- Per-token review record for every allowlisted token on each network.
