# Independent ERC-20 application review — 2026-11-18

## Scope and result

Reviewed the ERC-20 application candidate at `a339a921` independently of its implementation author, including finite allowance preparation, exact token/spender binding, separate approval and funding reviews, canonical token reads, journal recovery, funded exits, and the new browser harness source. Reproduced one availability defect in the candidate and independently verified the author's repair at **`56a499cf53b5f1b3fba835e575238b99bdd53685`**. The regression and additional observer tests are committed in **`873863a38154b5134057c1e4adb440d979b5f1ef`**.

**The repaired reviewed source passed the targeted native and observer tests below.** This is a scoped review, not an external audit, whole-repository certification, actual browser execution, physical-wallet qualification, or release approval. `ReleaseEnabled=0` remains in force.

## Confirmed finding: an unrelated allowance-read outage hid a funded exit

**Severity: Medium availability in the unpublished localnet ERC-20 candidate.** No unintended transfer or loss of encrypted recovery data was demonstrated.

After a wallet reopens a profile containing more than one trade, `#refresh` observes those trades in persisted vault-record order. On the original source, a token allowance-query failure for an earlier **unfunded** trade threw out of the entire loop. A later **funded** trade consequently kept its initial `chainState=null` projection and both exit controls disabled. The wallet could be connected and funds present in escrow while the normal application could not show the independently valid exit.

The independent test uses real Anvil escrow and the current encrypted D1 negotiation. It creates two accepted token trades, reads the actual encrypted vault's record order, and chooses the later trade to fund. It does not modify persisted records, replace the crypto provider, or depend on random record ordering. After lock/unlock it makes the external fixture wallet's token `eth_call` unavailable while leaving escrow reads and the token's transfer behavior intact.

On `a339a921`, the connection command returned `UNAVAILABLE`; both trades remained unobserved and the funded trade's `canRelease` was false. The unchanged regression assertion failed. See [RED evidence](evidence/erc20-independent-review-20261118/erc20-independent-red.log).

### Repair reviewed

The implementation author isolated token guidance errors inside the absent trade's observation. Its already validated escrow anchor is obtained outside the fallback and passed to the token observer. Unavailable or malformed token guidance leaves `tokenState=null` and sets an explicit per-trade error. That trade's approval and funding remain disabled, while the refresh can reach other independently valid escrow observations.

Wrong-chain, cancellation, lock and conflict signals are not downgraded to token guidance failures. The catch also rechecks the current vault epoch. Funded trades do not query allowance as a condition of release/refund. No peer-consent, journal or transaction authority rule was loosened.

## Independent validation

Run the new native regression with the project's pinned Foundry/solc environment:

```sh
node --import ./scripts/test-support/register-tsx.mjs scripts/test-localnet-erc20-independent.mjs
```

On repaired source `56a499cf53b5f1b3fba835e575238b99bdd53685`, all **four** native checks passed:

1. The earlier unfunded trade exposes unavailable token guidance with both approval and funding disabled; the later funded trade has a valid exit after unlock.
2. Explicit seller confirmation and a new reviewed release actually transfer the funded trade's exact token principal to its bound buyer despite the unrelated allowance outage.
3. A chain-ID change during the token observer's final identity check produces `WRONG_CHAIN`, rather than a harmless guidance-error label.
4. A profile lock during the token-code query stops the operation with `LOCKED`/`CANCELLED`, clears the private trade projection, and performs no extra send.

The native fixture recorded **8 typed signing requests, 3 transactions and 3 complete durable request markers**. The full [GREEN native log](evidence/erc20-independent-review-20261118/erc20-independent-green.log) includes the before/after application projection.

The additional independent observer tests cover exact canonical block-hash selectors, cancellation after each of **11 RPC completion boundaries**, owner revocation through a provider getter, revocation through a hostile header descriptor, and bounded timeout with no resumed RPC. Together with the author's six focused funding/parser cases, **11 tests passed with zero failures or skips**:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test   apps/web/test/independent-erc20-funding.test.mjs   apps/web/test/localnet-erc20-funding.test.mjs
```

See [observer test log](evidence/erc20-independent-review-20261118/erc20-independent-observer.log). The independent unit file is already covered by the existing `apps/web/test/*.test.mjs` package-test glob. The standalone native driver should remain part of the required localnet ERC-20 CI command.

## Other reviewed boundaries and limitations

The reviewed allowance path reconstructs only zero or the exact principal from the accepted terms, token contract and escrow spender. The page command cannot supply arbitrary token, spender, amount or calldata. Each allowance change has its own finite wallet review and durable journal entry; funding remains a separate explicit action. The token observer obtains bounded ABI results at exact canonical hashes and lets latest state veto, rather than replace, finalized evidence. A restored or unknown approval does not gain authority from an observed allowance.

Existing journal/CAS and wallet-generation mechanisms remain in use. This review did not independently execute every cross-tab or physical-wallet scenario. The author's broader native flow and root combined qualification remain separate evidence sources.

The new ERC-20 browser fixture and journey were inspected for emitted-artifact serving, separate browser profiles, exact pre-send IndexedDB markers, finite approval requests, explicit fiat confirmation and no unintended network destinations. No additional source-confirmed blocker was established in that bounded static review. **Chromium was not rerun:** the already documented host socket restriction prevents actual browser qualification, which remains a hosted gate on the final integrated source.
