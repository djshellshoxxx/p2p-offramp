# B1a: Solana reader and client policies

Status: implementation with unit tests and a local-validator run. This is not a public-testnet result, not an
independent review and not a release approval. Every default below is **PROPOSED, pending owner confirmation**.

## Composition entry (for apps/web, wired by Lane A)

```ts
import { SolanaChainReader } from 'packages/chain-solana/src/reader.ts';
import {
  DEFAULT_FUNDING_SUBMIT_MARGIN_SECONDS, DEFAULT_RELEASE_MARGIN_SECONDS, settlementActions,
} from 'packages/chain-solana/src/policy.ts';
import { fundingWindow } from 'packages/chain-solana/src/window.ts';

const reader = new SolanaChainReader({ rpc, registry, freezeAuthorityPermits: [] }); // owner choices, default none
const authority = createTradeAuthority({ binding, generation, walletGeneration,
  readValidated: (b, r) => reader.readValidated(b, r, terms) });                  // G08: state only
const snapshot = await reader.read(binding, request, terms);                       // custody, mint, live clock
const actions = settlementActions(snapshot.value, DEFAULT_RELEASE_MARGIN_SECONDS); // release / refund offers
const funding = fundingWindow(terms.acceptBeforeSeconds, terms.escrowExpirySeconds,
  snapshot.value.live.timestampSeconds, DEFAULT_FUNDING_SUBMIT_MARGIN_SECONDS);
const payout = await reader.readPayout(binding, request, terms);                   // after a finalized Released
```

The composition passes every margin explicitly. No helper applies a default.

## Frozen vault (review C-L3)

`release` and `refund` only change state, so a frozen vault never blocks them. `readValidated` now returns the same
`ChainObservation` as for any funded trade (before this change it returned `CONFLICT`). The flag is in the snapshot:
`custody.vaultFrozen` and `custody.payoutBlockedBy: ['vault-frozen']` while a payout is still to happen. Every
payout plan is then `blocked('vault-frozen')` until the mint's freeze authority thaws the vault. `ChainObservation`
has no field for it, and `parseChainObservation` refuses extra keys, so G08 alone cannot show it (see "Needs").

## Program identity, re-checked on every read

At slot S each read requires all of the following:

- the Program account is owned by loader v3 and executable, 36 bytes, tag 2;
- its pointer equals the derived ProgramData address;
- ProgramData is owned by loader v3, not executable, tag 3, authority option exactly None (0);
- the deploy slot is at most S, and the region hash `[45..end)` equals the registry pin;
- the Clock slot equals S.

Nothing is cached that could let a later read skip a check. One check was added: the first deploy slot that a fully
confirmed read sees is pinned per reader, network and program. With no upgrade authority the ProgramData can never
be rewritten, so a different deploy slot later (a redeploy indicator) fails closed. A failed read pins nothing. A
fresh reader, for example after a provider change, starts without the pin. Tests cover a present authority, loaders
v1, v2 and v4 or a fake loader, a pointer to another valid ProgramData, single-bit hash flips, a deploy slot above S
or at u64 max, and identity that changes after an earlier good read.

## Permitted mints and freeze authority

| Rule | Where | Failure |
| --- | --- | --- |
| Mint is a registry `spl` asset that the deployment supports | `bindTrade`, before any RPC | `UNSUPPORTED_PROVIDER` |
| `tokenProgram` is Tokenkeg; Token-2022 and both wrapped-SOL mints are refused | `bindTrade` | `UNSUPPORTED_PROVIDER` |
| The live mint is owned by Tokenkeg, initialized, 82 bytes, with the registry decimals | reader, at S | `INTEGRITY_FAILURE` |
| A freeze authority is allowed only if `freezeAuthorityPermits` names that exact key | reader, at S | `UNSUPPORTED_PROVIDER` |

A mint whose freeze authority is None is always acceptable, because None can never be set again. A rotated freeze
authority no longer matches its permit, so it needs a new owner choice. `snapshot.mint` reports the address, the
decimals and the freeze authority even before funding, so the UI can warn.

## Payout plans (review C-L2)

The client sends `release` or `refund` alone and waits for a finalized `Released` or `Refunded`. Only then does it
prepare the payout from `readPayout(…).pending`. The program enforces every rule; a plan is advice.

| Recipient's canonical ATA (SPL) | Plan |
| --- | --- |
| vault frozen (any destination) | `blocked('vault-frozen')` |
| absent, or a data-less System account (pre-funded lamports) | `create-ata-idempotent` (shows the ATA rent separately) |
| not owned by Tokenkeg, executable, or not 165 bytes (for example Token-2022) | `blocked('destination-not-spl-token')` |
| uninitialized / other mint / reassigned owner (SetAuthority) | `blocked('destination-uninitialized' / '-wrong-mint' / '-wrong-owner')` |
| frozen | `blocked('destination-frozen')`: the program refuses it (6016) |
| native-wrapped | `blocked('destination-native')` |
| delegate set, or a delegated amount | `blocked('destination-delegated')`: client policy, stricter than the program, because a delegate could move the payout as soon as it lands |
| initialized, correct owner and mint (a close authority is fine: it cannot close a non-zero account) | `ready` |

Native: the payout credits exactly the principal. Suppose the recipient would end between 0 and the rent-exempt
minimum for its size, `(128 + dataLength) × lamportsPerByteYear × threshold`. The transaction would then fail
(`InsufficientFundsForRent`). So the plan is `rent-top-up(lamports)`, an amount the payer adds in the payout
transaction. Other plans are `blocked('recipient-executable')`, or `blocked('rent-unknown' / 'rent-shortfall')`
from the escrow custody. A rent shortfall is fixed when anyone tops the escrow up. A recipient wallet is read by
metadata only. `space` is required and the base64 length must encode exactly that many bytes, so a large data
account is never decoded. A balance above 2^53-1 is capped, which is safe because it is far above any minimum.

## Deadline margins

Landing bound: a transaction built from a finalized Clock can execute up to (32 finalized-lag slots + 150 blockhash
blocks) × 400 ms × 250 % = **182 s** of chain time later. The 250 % factor is the Clock clamp in Agave 4.1.2
`stake_weighted_timestamp.rs`. Both defaults are **300 s**: the bound plus 118 s for finality stalls, slow slots and
wallet relay. A margin that is too small offers an action that the program refuses (6004/6005 for funding, 6012
for release), which costs only the fee. A margin that is too large refuses terms or a release that would still have
worked. Refund needs no margin. It is offered only when the same read's finalized Clock is at or past the stored
deadline, and the Clock never goes backwards.

## Local evidence (2026-11-18, this branch)

- `node --import ./scripts/test-support/register-tsx.mjs --test packages/chain-solana/test/*.test.mjs`: 129 tests
  pass (104 before).
- `cargo test --locked --features localnet`: 48 LiteSVM tests pass. They include
  `frozen_vault_blocks_only_the_payout_for_release_and_refund_until_thaw`. It runs against the original SPL Token
  3.5.0 and p-token builds and checks that release and refund land with a frozen vault, that payout fails with
  `AccountFrozen` (17), and that it succeeds after a thaw.
- `node contracts/solana/localnet/run.mjs` (Agave 4.1.2, SBPF v3 build, region hash `eed3a490…`): 186 of 186
  checks pass in 1878 s. The run now also drives this reader (`localnet/reader-check.mjs`) against the real
  validator, and `validateLive` matches the region hash. The flow freezes the vault and the buyer ATA of the freezable test mint. The reader then reports
  funded, `vaultFrozen` and `vault-frozen`. Release alone lands. The payout fails with 17 while the vault is frozen
  and with 6016 while the destination is frozen. It succeeds after the thaws, and the reader then reports
  `complete`. Caveat: the synthetic profile compiles a fake genesis constant into the program. The harness RPC
  adapter therefore maps exactly the validator genesis it recorded at startup to that constant, and translates
  nothing else.

## Needs (outside this package)

- Registry (`packages/schemas/src/registry.ts`): an SPL `AssetV1.freezeAuthority: string | null` would let the
  signed registry carry the owner's per-mint choice. The composition would then derive `freezeAuthorityPermits`
  from it. Until then the permits are composition configuration and default to none (fail closed).
- G08 (`ChainObservation`): only if the trade view itself must show a frozen vault would it need an optional
  custody facet. Otherwise the UI reads `read(…).custody`.

## Not proven

A dishonest RPC can still lie consistently. The margins are proposals, and the real Clock drift is unverified. The
ATA CreateIdempotent and rent top-up instruction builders belong to B1b.
