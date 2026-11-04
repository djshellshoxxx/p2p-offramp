# D5 - Solana and SPL basic escrow custody design (decision packet)

Status: PROPOSED. This packet is for the owner. It does not decide anything. No program ID, seed, layout, token policy, toolchain pin or upgrade rule in it is approved, and nothing here changes running behavior. It contains no Solana code.

Paths marked "main" exist on `main` (e9b9db3). Paths marked "PR #26 only" exist only on the PR #26 branch (45630ba). The documentation websites could not be reached from this session. Upstream facts were therefore read on 2026-11-04 from the source repositories behind them, at the tags named below. Claims marked **unverified** were not confirmed from a primary source.

## The question

How should a native Solana program hold a seller's SOL or SPL tokens so that it keeps the EVM basic escrow's economic rules, without copying EVM mechanics that Solana does not have?

The rules that must carry over come from `contracts/evm/src/BasicEscrow.sol` and its README (main):

- The seller funds.
- Buyer, seller, asset, exact base-unit amount and deadline are fixed at funding.
- Only the seller, strictly before the deadline, can release, and a release pays only the bound buyer.
- At or after the deadline, anyone can trigger a refund that pays only the seller.
- Release and refund are terminal, nothing pays twice, and a trade id or seller nonce can be used only once.
- There is no owner, operator, arbitrator, pause, upgrade, sweep or deadline extension.
- The chain decides state and time.

## Current source behavior

- **No Solana program, adapter, wallet path or journal path exists.** `docs/governance/PENDING-DECISIONS.md` ("Solana program and token profile", PR #26 only) lists seeds, layout, discriminators, IDL hash, token policy and finality as unselected. The `docs/governance/solana-profile.*.json` records (PR #26 only) are drafts with no reviewers. The three Solana G24 rows are `EXACT_CONTRACT_UNTESTED` (`docs/execution/acceptance/g24-current-local.md:17-18,25`, PR #26 only).
- **The terms bytes exist.** `encodeSolanaTerms` (`packages/domain/src/trade-terms.ts:11,168-185`, main) writes the prefix `p2p-offramp/solana/basic/v1`, a zero byte, then genesis hash, program ID, keys, mint, token program, hashes and little-endian integers. Asset kind is 0 for native and 2 for SPL. `termsHash` is the SHA-256 of these bytes. Vectors in `packages/domain/test/fixtures/g16-vectors.json` (main) come from `scripts/vectors/g16_vectors.py`, which shares authorship with the TypeScript encoder.
- **G16 asks more of Solana than the EVM contract does.** The program must check both Ed25519 acceptances through the Instructions sysvar, and must embed a genesis constant, because there is no genesis sysvar (`01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.8_trade_coordination/module_1.8.1_trade_terms/spec-signed-trade-terms.md:49`, main). The EVM contract never sees acceptance signatures (`contracts/evm/README.md`, main).
- **Token handling.** `.../module_1.1.2_token_handling/spec-spl-token-adapter.md:25,32,38` (main) allows the original SPL Token program only, requires `transfer_checked`, rejects delegated, frozen and uninitialized accounts, and leaves vault closure unsupported. `spec-native-asset-accounting.md:31` (main) keeps trade state and rent for replay protection. `docs/WORK-PLAN-2026-10-24.md:57` (main) mentions an "SPL/Token-2022" allowlist instead.
- **Registry and deployment.** The registry accepts a Solana deployment only with `upgradeAuthority: null`, a `programDataSha256` and `finalized` commitment (`packages/schemas/src/registry.ts:22,31,198`, main). The runbook lets test networks record an upgrade authority, and its step 5 initializes the mint allowlist after deployment (`00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.4_deployment_runbook/spec-mvp-deployment-and-rollback.md:60,96-103`, main).
- **Deadlines and the journal.** Funding requires `1800 <= expiry - chain time <= 604800`, read from the Clock `unix_timestamp` with a checked non-negative conversion (`spec-escrow-timeout-and-refunds.md:32`, main). The journal tracks blockhash and `lastValidBlockHeight` and refuses durable nonces (`spec-transaction-lifecycle-journal.md:84`, main). The roadmap says "Do not simulate Solana with EVM semantics" (`DEVELOPMENT_ROADMAP.md:117`, main).

## Native facts that shape the design

- **Atomic transactions.** If any instruction fails, the whole transaction reverts ([solana.com/docs/core/transactions](https://solana.com/docs/core/transactions)). So the EVM "try the push, else credit `pendingWithdrawals`" step cannot be written. It is **unverified** from a primary source that a program can never catch a failed cross-program call; the repository already assumes it (`spec-spl-token-adapter.md:38`).
- **Reentrancy and lamports.** The runtime refuses indirect reentrancy. Only the owning program can debit lamports, but anyone can credit a writable account, so unsolicited lamports can always arrive ([cpi-execution](https://solana.com/docs/core/cpi/cpi-execution), [modification-rules](https://solana.com/docs/core/accounts/modification-rules)).
- **Rent.** No account may enter the "rent-paying" state. A native payout below the rent-exempt minimum, sent to an empty wallet, fails with `InsufficientFundsForRent` (same page). The rent constants are changing (SIMD-0194 values in solana-sdk `rent/src/lib.rs`), so the program must read the Rent sysvar and never hard-code lamports.
- **PDAs.** A PDA takes at most 16 seeds of at most 32 bytes each. The canonical bump is the first one that gives an off-curve address ([solana.com/docs/core/pda](https://solana.com/docs/core/pda); [solana-sdk](https://github.com/anza-xyz/solana-sdk) `address/src/lib.rs`).
- **Clock.** `unix_timestamp` is "the approximate real world time of the current slot" (solana-sdk `clock/src/lib.rs`). In Agave v4.1.2 it is the stake-weighted median of validator-voted timestamps and never goes backwards. Its elapsed time within an epoch is clamped to 75 to 250 percent of what the slot count implies (constants 25 and 150 in [`runtime/src/stake_weighted_timestamp.rs`](https://github.com/anza-xyz/agave/blob/v4.1.2/runtime/src/stake_weighted_timestamp.rs), applied in `bank.rs` `update_clock`). Its real-world drift in practice is **unverified**.
- **Commitment.** `processed` can roll back. `confirmed` means more than two-thirds of stake voted on the block. `finalized` means maximum lockout ([solana.com/docs/rpc](https://solana.com/docs/rpc)).
- **Identifiers, read from source.** SPL Token `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`, native mint `So11111111111111111111111111111111111111112` ([solana-program/token](https://github.com/solana-program/token)). Token-2022 `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, native mint `9pan9bMn5HatX4EJdBwg9VgCa7Uz5HL8N1m5D3NdXejP` ([token-2022 `program@v12.0.0`](https://github.com/solana-program/token-2022/tree/program@v12.0.0)). Upgradeable loader `BPFLoaderUpgradeab1e11111111111111111111111`, Clock sysvar `SysvarC1ock11111111111111111111111111111111` (solana-sdk `sdk-ids`).
- **Local tools.** Agave v4.1.2 `solana-test-validator` and `solana-program-test` load `spl_p_token-1.0.0-rc.1.so` at the SPL Token ID and `spl_token_2022-10.0.0.so` at the Token-2022 ID (`program-binaries/src/lib.rs`, used at `test-validator/src/lib.rs:881`). So local runs do not test the original Token build by default. It is **unverified** which build mainnet and devnet run today.

## Options

All three keep the G16 Solana terms bytes and the registry schema unchanged.

**Option A - Anchor program, original SPL Token and native lamports only, immutable.**
- *What it gives:* declared constraints (signer, owner, `seeds` and `bump`, `has_one`, `init`), an IDL, which the recovery package needs (runbook line 69), and 8-byte discriminators. The account discriminator is the first 8 bytes of `sha256("account:<Name>")`, and the instruction discriminator comes from `sha256("global:<name>")`. All-zero account discriminators are refused ([anchor v1.2.2 docs](https://github.com/solana-foundation/anchor/tree/v1.2.2/docs/content/docs): `basics/program-structure.mdx`, `basics/idl.mdx`, `footguns.mdx`).
- *Security:* reviewers know the generated checks well. The macro output is large, and even patch releases can break things (the 1.2.2 `CHANGELOG.md` has a "Breaking" entry), so the pin matters.
- *Compatibility:* the terms already carry `tokenProgram`, so Token-2022 can be added later without changing the format.

**Option B - native or Pinocchio-style program, same token policy, or with a Token-2022 extension allowlist.**
- *What it gives:* the smallest code and compute cost, and no macro layer.
- *Security:* every owner, signer, discriminator, PDA and program-ID check is hand-written. That is exactly the account-substitution class that `spec-spl-token-adapter.md:44` names. Pinocchio is still 0.x (newest tag seen: `pinocchio@v0.12.0`, [anza-xyz/pinocchio](https://github.com/anza-xyz/pinocchio)).
- *Compatibility:* the IDL has to be produced separately. Any Token-2022 support means checking extensions at both funding and payout.

**Option C - Anchor program, upgrade authority held by a multisig, Token-2022 through `token_interface`.**
- *What it gives:* bug fixes after deployment and broad token coverage.
- *Security:* the upgrade key is a hidden operator. It could change release and refund rules for trades that are already funded, which contradicts roadmap decision 2. Transfer hooks, permanent delegates and transfer fees also come in.
- *Compatibility:* the registry rejects this (`registry.ts:22`), and the audit pipeline requires immutability to be shown by chain inspection (`spec-contract-audit-pipeline.md:27`, main).

## Recommendation

Option A, proposed for owner decision. It keeps the EVM rules with the fewest parts that cannot be reviewed, and it matches the SPL-only and immutable-registry choices already on main. The owner would also be choosing these sub-rules, all proposed.

**Instructions and payout**
- There are five instructions: `fund_native`, `fund_spl`, `release`, `refund` and `payout`.
- `release` must be signed by the stored seller and requires clock < deadline. `refund` can be sent by anyone and requires clock >= deadline. Both only move the state from `Funded` to `Released` or `Refunded`.
- `payout` can be sent by anyone. It pays the exact principal once, only to the bound recipient, and sets `paid_out`.
- Clients send `release` and `payout` in one transaction. If the payout leg fails (a frozen account, or an empty wallet below the rent minimum), the seller sends `release` alone and anyone retries `payout` later. This is the native counterpart of EVM `pendingWithdrawals`: the recipient can neither block the seller's decision nor redirect funds.

**Trade id and replay**
- The program rebuilds the G16 bytes from the instruction fields, its own program ID and its compiled genesis constant. It stores `termsHash` as the trade id.
- The escrow PDA seeds are `[b"p2p-offramp-escrow-v1", seller, sellerNonce]` with the canonical bump. The hash commits to the seller and the nonce, so this single account enforces both one fund per nonce and one fund per trade id.
- This differs from the seeds in `spec-spl-token-adapter.md:32` (seller, nonce and terms hash), which would need a second account to stop a nonce being reused under different terms.
- The account is created with `init` and is never closed in v1, so a settled trade can never be funded again.

**Accounts**
- `EscrowV1` holds the layout version, bumps, state, `paid_out`, asset kind, seller, buyer, mint, token program, amount (u64), deadline (u64), `termsHash` and `sellerNonce`. Its exact layout is frozen together with the IDL hash.
- The SPL vault is a token account at `[b"p2p-offramp-vault-v1", escrow]`, owned by the escrow PDA and created during `fund_spl`. Nobody can create it in advance with a delegate or a close authority.
- Native SOL (asset kind 0) stays as lamports in the program-owned escrow account, with principal recorded separately from rent. Payout debits exactly the principal; rent and any donated surplus stay behind, with no sweep. Both wrapped-SOL mints are refused in v1.

**Rent and closure**
- The seller pays the rent for both accounts. It is shown separately, never comes out of principal, and stays locked in v1. Closing the vault later needs its own decision: anyone can donate tokens to the vault, which could block a payout that also tries to close it.

**Funding checks**
- The seller signs and equals `terms.seller`.
- The buyer is not the seller, not all zero bytes, not the escrow and not the vault.
- Amount is at least 1, revision is at least 1, and clock < acceptBefore. The funding window check rejects a negative clock.
- The program reads time with `Clock::get()` and never from a passed-in account.
- The token program must equal both the SPL Token ID and `terms.tokenProgram`. The mint must be owned by that program and be on a compiled-in allowlist of at most 32 entries, with matching decimals. A compiled-in list replaces runbook step 5, because a first-caller initializer would be an operator.
- The source token account must be owned by the seller (no delegate), use the same mint and not be frozen.
- `transfer_checked` must leave the vault holding exactly the amount. Native funding is a System Program transfer of exactly the amount.
- An SPL payout goes only to the recipient's canonical associated token account. The caller creates it if missing and pays its rent.

**Token-2022**
- Refused in v1. A later policy would admit only listed extensions, re-checked at funding and at payout.
- Mint extensions to refuse at minimum: `TransferFeeConfig`, `TransferHook`, `ConfidentialTransferMint`, `ConfidentialTransferFeeConfig`, `ConfidentialMintBurn`, `PermanentDelegate`, `DefaultAccountState`, `InterestBearingConfig`, `ScaledUiAmount`, `NonTransferable`, `Pausable`, `PermissionedBurn` and `MintCloseAuthority`. A closed mint can be re-created at the same address.
- Destination-account extensions to refuse: `MemoTransfer` and `CpiGuard`.
- Names are from `ExtensionType` in token-2022 `program@v12.0.0`, `interface/src/extension/mod.rs`.

**Acceptance signatures**
- Recommended: no on-chain Ed25519 check, matching the EVM contract. The seller's funding transaction is the seller's acceptance, and the buyer funds nothing, so the buyer cannot lose through the program.
- This conflicts with `spec-signed-trade-terms.md:49`, which must be reconciled either way. Keeping the G16 rule means a separate review of how the program parses the Instructions sysvar.

**Upgrade authority**
- Before any registry entry, the program is made final with `solana program set-upgrade-authority <program-id> --final`, after which it "can never be updated or closed" ([deploying](https://solana.com/docs/programs/deploying)).
- Before signing, the client checks at `finalized` commitment that:
  - the genesis hash matches the registry;
  - the program is owned by the upgradeable loader and points to its ProgramData account;
  - ProgramData has no upgrade authority;
  - the ProgramData hash equals `programDataSha256`.
- Which bytes the verified-build tools hash is **unverified** ([verified builds](https://solana.com/docs/programs/verified-builds)), so the hash method must be fixed and covered by vectors.
- The client ignores any on-chain IDL or metadata account and uses the IDL pinned in the manifest. Anchor 1.2.2 marks legacy on-chain IDL accounts as deprecated (`references/cli.mdx`). Whether deploying creates such an account, and with what authority, is **unverified**.

**Finality and deadlines**
- The client shows "funded" only when the escrow read at `finalized` shows `Funded` and every field equals the accepted terms. A `confirmed` read is shown as "seen, not final" (`spec-chain-adapter-contract.md:37`).
- The browser clock only formats the display.
- The client stops offering release some margin before the deadline, and offers refund only after a recent Clock reading has passed it. The owner sets the margin, because the drift bound is wide.

**Toolchain to pin (proposed)**
- Anchor `v1.2.2` (commit `8d9d1488`, released 2026-10-22) with Agave `v4.1.2` (`182084b8`), the pair Anchor's own `installation.mdx` and `anchor-toml.mdx` show, and Rust `1.98.1` as in the token repositories' `rust-toolchain.toml`. Builds use `anchor build --verifiable`, and the pins are recorded in `Anchor.toml` and the G06 evidence record.
- Anchor 1.2.2 is under two weeks old, so `v1.2.1` (2026-10-05) is the fallback. The newest stable-looking Agave tag seen is `v4.4.0`. Which Agave release each cluster recommends is **unverified**; check [Agave releases](https://github.com/anza-xyz/agave/releases) before pinning.

## Acceptance requirements

**Test vectors.** Do not invent hex values. Every set needs two independent implementations and is frozen with its generator, versions and hash, as `packages/wallet/test/fixtures/g16-independent.json` (main) is for EVM. Required sets:
- terms bytes and `termsHash` from the Python and TypeScript encoders, plus the value the Rust program computes;
- escrow and vault PDAs and bumps from a JavaScript Solana library and from Rust `find_program_address`;
- discriminators, computed with two SHA-256 tools;
- the IDL hash and the ProgramData hash method;
- negatives: wrong genesis or program ID, asset kind 1, non-canonical base58, amount 0 or above u64, and seller equal to buyer.

**Local validator and harness.**
- Run the pinned `solana-test-validator` with the original SPL Token build loaded explicitly, hash-pinned, through `--bpf-program` or `--upgradeable-program`. Run one suite against the default p-token build to detect differences.
- Test exact-second boundaries in a program-test, LiteSVM or Mollusk harness with a controlled Clock.
- Run at least one real refund on the validator after the 1800-second minimum. The release build is never changed for tests.

Cases: native and SPL fund, release, payout and refund at the deadline and one second before it; duplicate nonce with the same and with changed terms; substituted mint, token program, vault, escrow, destination, System program or Clock account; delegated or frozen source, frozen destination, wrong decimals; a Token-2022 mint, wrapped SOL, or a buyer equal to the escrow or vault (all refused); release by a non-seller or at the deadline; double payout, payout before a terminal state, and payout to a frozen or empty recipient followed by a retry; donated lamports and tokens (principal unchanged) and a rent shortage; conservation (payouts never exceed funded principal); chain inspection showing no upgrade authority and the pinned hash; and a G12 crash between broadcast and finality, reconciled from the blockhash and `lastValidBlockHeight`.

## What this unblocks

This unblocks writing the Solana program and its IDL, freezing the `solana-profile` record, the G24 Solana rows, the Solana adapter, wallet and journal paths (M2B), and a Solana recovery package. It does not unblock deployment, a mainnet asset list, Token-2022, the G16 signature reconciliation, or D1. Those remain separate decisions.

## Open questions for the owner

1. Should the program verify acceptance signatures on chain, as the G16 text says, or match EVM, as recommended?
2. Should mints with a freeze authority be allowed? The issuer could freeze the vault and stall both exits, as an EVM blacklist can.
3. Is it acceptable that rent stays locked for every trade, or is a closure design wanted later?
4. What deadline safety margin should the client use?
5. Which final Anchor and Agave pins, once cluster release status is checked?
