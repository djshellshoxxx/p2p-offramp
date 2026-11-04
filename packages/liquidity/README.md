# Local liquidity reference

This optional package is a deterministic accounting/reservation reference for
the two liquidity specifications. It creates no native vault, quote signature,
provider, wallet permission or custody authority. Every result is diagnostic;
the default application does not import it and trading remains disabled.

## Frozen local interface

`inspectVaultAccounting(ledger, custodyBalance)` validates the exact
`VaultAccountingV1` fields and canonical unsigned decimal strings, then reports
conservation, custody coverage, surplus and the mathematical available withdrawal
ceiling. Actual custody is separate from the maker ledger. The ceiling is not
proof that a real withdrawal is available.

`createLiquidityReference(options, ports)` returns a local model with
`apply(command)`, `observeQuote(quote)`, `view()` and `close()`.

Options are exactly `{ domainId, maker, assetId, networkId, deploymentId }`.
`domainId` is an opaque local simulation namespace, not an EIP-712 domain or a
native deployment identifier. Accounts use lowercase EVM address syntax for
these local examples; this is not a Solana or contract-wallet profile.

The sole port is `readContext(): { active, chainTimeSeconds }`. This synchronous
trusted fixture supplies one context/time snapshot; no RPC is performed.
`chainTimeSeconds` is a canonical uint64 decimal string. Inactive scope, malformed
context or clock rollback retires the model. A mutation owns admission before
parsing or callbacks, rechecks context after parsing and computes its transition
without further callbacks. A snapshot is cached local model data, not freshness
or native chain evidence. No asynchronous operation or retry exists.

A local quote has exactly `quoteId, maker, taker, binding, termsHash, assetId,
principal, fee, nonce, expiresAtSeconds`. `binding` is the existing CTX01 shape.
`fee` is exactly `"0"`, principal is a positive uint256 decimal string, and expiry
is uint64. IDs/nonces are bounded opaque ASCII model identifiers, not an invented
wire encoding. There is deliberately no production `QuoteV1` signature parser.
`observeQuote` always reports simulated `unreserved` and cannot change accounting.

Commands are a closed union:

| kind | Other exact fields | Local effect |
| --- | --- | --- |
| deposit | actor, amount, received | Maker only; exact transfer increases deposited/available/custody |
| donation | amount | Increases custody only, never the maker ledger |
| reserve | actor, quote, outcome | Exact taker/asset/domain/terms and <=120-second expiry; available to reserved |
| consume | actor, quoteId, termsHash, amount, outcome | Exact bound taker/terms/principal strictly before expiry; reserved to inEscrow |
| cancel | actor, quoteId | Explicit maker action on an unconsumed reservation; reserved to available |
| expire | quoteId | At/after expiry only; reserved to available |
| refund | quoteId, returned | Consumed reservation only; exact custody return moves inEscrow to available |
| release | quoteId | Consumed reservation only; inEscrow to releasedToBuyers |
| withdraw | actor, amount, outcome | Maker only; available and proven-free mathematical custody only |
| observe-custody | balance | Changes only the separate claimed custody observation |
| reorg | none | Latches reconciliation-required without releasing/reusing anything |

`outcome` is a simulation input: `applied`, `reverted` or `unknown`. A reverted
reserve/consume/withdraw changes nothing. Unknown outcomes retain last-known
accounting and latch reconciliation-required; an unknown reserve also retains its
quote/nonce. No timeout, expiry, imported balance or reset can clear that latch.
A future native reconciliation profile must define recovery. This package does
not create or replace G12 transaction intents.

At most256 identifiers (128 quote/nonce pairs) can be retained during one model lifetime; terminal
entries are never evicted or reused. Reservations are exact single fills. All
mutations are checked and publish one complete new revision, or leave the prior
revision unchanged. Inconsistent/undercollateralized observations block new
deposit/reserve/consume. Cancellation, expiry and terminal accounting remain
explicit; withdrawal can use only `min(available, max(custody-reserved, 0))`.
No action can transfer reserved or escrow principal to a maker.

## Specification anchors and limits

- [Vault accounting §§3–7](../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.5_liquidity_provision/module_1.5.1_market_maker_vaults/spec-liquidity-vault-accounting.md): exact integer conservation, segregated maker funds, separate donations, terminal return/release and available-only withdrawal.
- [Quote reservations §§3–7](../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.5_liquidity_provision/module_1.5.1_market_maker_vaults/spec-quote-reservation-interface.md): <=120-second exact fill, nonce/ID uniqueness, expiry boundaries, inclusion ordering, atomic failed consume and unknown/reorg refusal.

The native scope is blocked by the exact missing contracts listed in
[DECISIONS.json](DECISIONS.json), rather than by release approval alone. In
particular, current BasicEscrow requires `terms.seller == msg.sender`, has no
vault quote/consume entry point and keeps buyer acceptance off chain. A local
reference cannot supply a new signature domain, a same-transaction funding ABI,
native refund authentication, token authority or a reorg policy. Native basic
trade exits remain independent and unchanged. There are no LP shares, pooled
NAV, lending, price oracle, fees, partial fills or operator drains.

Run the focused checks with
`node --import ./scripts/test-support/register-tsx.mjs --test packages/liquidity/test/*.test.mjs`.
The public conservation fixture is reproducible with
`python packages/liquidity/test/fixtures/generate_conservation.py`; its independent
Python bucket/custody oracle imports no production implementation.

Test results and exact source hashes belong to the separate execution review
receipt. This contract does not assert professional review or activation.
