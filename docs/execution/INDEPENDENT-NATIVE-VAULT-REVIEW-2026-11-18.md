# Independent native vault and offline recovery review — 2026-11-18

## Result and exact scope

This review covers the native Solana encrypted vault journal introduced by `ac8b566c` and the offline
recovery projection introduced by `7a56d6c21b7dd10690f3d222cf30760722a5e17c`. Both were inspected in an
isolated worktree at the latter commit, including their tests, the vault CAS/lease implementation,
submission/signing boundaries, and the schema/Worker projection path.

The initial 26 targeted tests passed, but independent adversarial regressions exposed two medium
dispatch-guard gaps and two low-priority structural parser omissions. All are repaired in these
separate commits:

| Commit | Repair |
| --- | --- |
| `6e45c2930bb60d90fd66b2ad8a760d5cc1a4216e` | Reject duplicate message account keys and a fee payer used as an instruction program in pure offline recovery parsing. |
| `d4f7a661f2f1d7dd3f1ab73dcd22b61fc36d4906` | Recheck the live vault capability after injected RPC method and wallet feature lookup, immediately before physical invocation. |

The repaired source passed **54 focused tests with zero skips**, full repository typecheck, and the
static import-boundary check. No unresolved medium/high finding remains in this review's scope.
These are local source/unit/controller results. They do not claim hosted CI, a real Solana validator
run, or real browser qualification for these follow-up commits.

## Dispatch findings: invalidation during injected method lookup

The RPC path already checked `assertActive` in the physical Promise continuation. It then evaluated
`context.rpc.request`. A malicious or reentrant injected object's `request` getter could lock the
real vault, return the original callable, and still cause one `sendTransaction` call after the lease
had been revoked. The durable `sendMarked` record was retained, but the physical-call authorization
check had preceded the operation that invalidated it.

The analogous signing path rejected ordinary accessors by reading own data-property descriptors.
However, a Proxy's `getOwnPropertyDescriptor` trap could revoke the vault while returning a valid
data-property `signTransaction` descriptor. The signing method then ran after that revocation.
The later vault write correctly failed, and no chain send occurred, but the unwanted wallet prompt
had already begun.

The RPC repair captures the callable and its receiver, then rechecks the capability before
`Reflect.apply`. The signing repair passes the composition's optional `assertActive` callback into
`signWithWallet`, checks before lookup, and checks again after feature/input capture immediately
before invoking the captured wrapper. Existing direct callers remain compatible. Neither repair
introduces a cancellation race that returns before an already-started physical signing operation
settles.

The new regression file is
`packages/chain-solana/test/independent-vault-dispatch.test.mjs`. It uses the actual
`EncryptedVaultService` and `SolanaVaultJournal`, with a deterministic transactional backing store
and synthetic wallet/RPC fixtures. It proves:

- RPC getter revocation prevents physical submission while retaining the durable marker, signature,
  and original profile provenance.
- Wallet descriptor-trap revocation prevents the physical prompt, retaining the unsigned prepared
  record with a null signature and null marker.
- Revocation during an already-pending wallet operation does not release the same-trade serialized
  operation early. A queued second action cannot prompt while the first physical promise is held;
  both fail safely after it drains, without a chain send.

The third test passed before the repair and guards against changing that existing behavior. The
first two failed before the repair. This is a same-trade serialization assertion, not a claim that
the native wallet module supplies a global prompt scheduler for all callers or trades.

## Offline parser findings: malformed legacy messages shown as hints

The new pure schema parser checked message layout, counts, ranges, payer/blockhash consistency, and
stored-state invariants. It omitted two structural rules already enforced by the native parser:
account keys must be unique, and an instruction's program index cannot be zero (the fee payer).

The independent tests mutate an actual **unsigned prepared** message, separately duplicating its
first account key and assigning program index zero. `parseSolanaIntent` rejects each structurally;
the original offline projection nevertheless displayed each as an item with `unsupported: 0`.
Using an unsigned preparation makes the comparison independent of signature validation.

The repair adds those two checks using only bounded byte operations and a local set. No chain
adapter, wallet, storage implementation, signature verifier, or external package is imported by
the schema module. The new tests in
`packages/schemas/test/independent-solana-recovery-structure.test.mjs` require an unsupported count
and no projected item, while preserving the original record byte-for-byte.

These were low-priority presentation/strictness defects: the original projection was already
labeled `unverified-offline-reference`, never authorized a transaction, and never rewrote the
encrypted payload. The repaired projection remains an offline discovery aid. It does not verify
signatures, native status, escrow identity, payment, finality, or safe resubmission.

## Vault and recovery observations

`SolanaVaultJournal` derives a domain-separated record ID and checks the complete binding inside
the encrypted payload. It copies caller inputs before awaiting, validates each native record,
preserves immutable fields through the existing transition function, limits history to 32 records,
and permits at most one open intent. A stale per-trade revision cannot overwrite a newer history.

Every operation captures the live vault session and revision. Even reads perform an empty commit
to check persisted freshness. Actual mutations use the vault's envelope CAS and a guard checked
again at the backing-store transaction boundary. Conflicts are not silently retried. A successful
marker CAS followed by lock/cancellation remains uncertain; it is not reported as proof that no
marker was written. The composition now also checks the live journal lease at physical dispatch.

Fresh-key backup restore changes the active profile but preserves each intent's original
`originProfileId`, signature, marker, outcome, and payout state. An imported pre-marker signature
cannot be canceled as though it were a never-sent preparation from the new profile. An uncertain
send continues to block a new submission until native reconciliation establishes a terminal state;
a rebuild after a definitive drop remains an explicit new intent naming its predecessor.

The offline projection reads authenticated private records without writing them or contacting a
provider. It selects the sole open intent ahead of stored terminal labels, otherwise uses the latest
update and deterministic intent-ID tie-break. It exposes scalar discovery fields, not the full
message, marker, outcome, origin, or encrypted payload. Unsupported/future records stay opaque and
count toward the unchanged raw-record pagination. Worker tests cover real encrypted fresh-key
restore of pre-marker signatures and uncertain payout records without extra network calls or writes.

## Reproduction and evidence

Baseline: exact `7a56d6c21b7dd10690f3d222cf30760722a5e17c` production files plus the five new
independent regressions. Result: **four failed, one passed**, zero skips. See
[RED evidence](independent-native-vault-evidence-2026-11-18/native-followup-independent-red.log).

Repaired source: exact `d4f7a661f2f1d7dd3f1ab73dcd22b61fc36d4906` (including its parser-fix parent).

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  packages/schemas/test/independent-solana-recovery-structure.test.mjs \
  packages/chain-solana/test/independent-vault-dispatch.test.mjs \
  packages/schemas/test/solana-recovery-reference.test.mjs \
  packages/chain-solana/test/vaultjournal.test.mjs \
  packages/chain-solana/test/wallet.test.mjs \
  packages/chain-solana/test/lifecycle.test.mjs \
  apps/web/test/solana-recovery-references-worker.test.mjs \
  packages/chain-solana/test/boundary.test.mjs
npm run typecheck
node scripts/check-import-boundaries.mjs
```

All commands exited 0. The test run passed 54/54 with zero skips:
[GREEN evidence](independent-native-vault-evidence-2026-11-18/native-followup-independent-green.log).
The full TypeScript configurations passed:
[typecheck evidence](independent-native-vault-evidence-2026-11-18/native-followup-independent-typecheck.log).
Static boundaries passed across 186 production files with 112 modules in the core entry graph:
[boundary evidence](independent-native-vault-evidence-2026-11-18/native-followup-independent-boundaries.log).
The initial 26-test baseline and its boundary output are also retained in that evidence directory.
