# Solana transaction lifecycle, submission and recovery (B1b)

Status: **native adapter, encrypted vault journal, and offline recovery projection implemented**.
The native modules live in `packages/chain-solana/src/{message,auxiliary,plan,wallet,intent,journal,vaultjournal,
submit,adapter,recovery,compose}.ts`. Independent core and vault reviews, with reproduced defects and repairs,
are recorded in `docs/execution/INDEPENDENT-CORE-REVIEW-2026-11-18.md` and
`docs/execution/INDEPENDENT-NATIVE-VAULT-REVIEW-2026-11-18.md`. A real-validator driver exists at
`contracts/solana/localnet/client-run.mjs`; the current consolidated run was blocked before startup by the host's
io_uring restrictions. Earlier source-PR validator results below are historical, not current combined qualification.
Native wallet and transaction actions are **not wired** into apps/web and have not been qualified in a browser or
on a public cluster. The offline browser build includes only the pure recovery-hint parser, not this native package.
Release approval remains outstanding.

## 1. Pieces and ports

| Module | Role |
| --- | --- |
| `message.ts` | Legacy message compile/serialize/parse, wire transaction, compact-u16, base64 encode |
| `auxiliary.ts` | ATA `CreateIdempotent` and System `Transfer` (rent top-up) builders |
| `plan.ts` | C-L2 plans: the only constructor of escrow messages; trusted finalized snapshots; byte-exact verifier |
| `wallet.ts` | Wallet Standard permission port: explicit connect, role-key check, sign-only, output validation |
| `intent.ts` | `SolanaIntentRecord`, strict restore validation, transition table |
| `journal.ts` | Injected CAS journal port, load/store helpers, admission rule |
| `vaultjournal.ts` | Native journal records through the real encrypted vault's session authority and CAS |
| `submit.ts` | Blockhash anchoring, durable marker, one `sendTransaction`, native reconciliation |
| `adapter.ts` | Mapping to and from Lane A's shared `IntentV2` (validated with Lane A's own `parseIntent`) |
| `recovery.ts` | Portable recovery document, exits and unsigned exit messages (see `contracts/solana/RECOVERY.md`) |
| `compose.ts` | `createSolanaEscrowClient` composition entry point |

All I/O is injected: `rpc.request({ method, params, signal })` (the reader's port), the Wallet Standard
`wallet`, the vault-backed `journal`, `clock.now()`, and `random(n)` (defaults to `crypto.getRandomValues`).

## 2. State machine

```
prepared ──sign──▶ signed ──mark (CAS, durable)──▶ sendMarked ──sendTransaction once──▶ sent | unknown
   │                 │                                │                                   │
   │ local cancel    │ local cancel                   └──────────── observe ──────────────┤
   ▼                 ▼                                                                    ▼
cancelled        cancelled                                       finalized | failed | dropped
prepared ──(restored, expired)──▶ dropped          signed ──(restored, observed)──▶ finalized | failed | dropped
```

| From | To |
| --- | --- |
| `prepared` | `signed`, `cancelled`, `dropped` |
| `signed` | `sendMarked`, `cancelled`, `finalized`, `failed`, `dropped` |
| `sendMarked` | `sent`, `unknown`, `finalized`, `failed`, `dropped` |
| `sent`, `unknown` | `finalized`, `failed`, `dropped` |
| `finalized`, `failed`, `dropped`, `cancelled` | none (terminal) |

Record invariants (checked on every parse, including restore): `prepared` has no signature and no marker;
`signed` has a signature and no marker; `sendMarked`/`sent`/`unknown` have both; `finalized` has an outcome with
`err: null`; `failed` has an outcome with an error label; `cancelled` never has a marker. `sendMarkedAt` is written
once (signed → sendMarked) and never cleared; `signature` is written once (prepared → signed). Every write is one
CAS against the trade's journal revision.

- **sign-only.** The wallet's `solana:signTransaction` returns signed bytes; the signature (= transaction id) is
  journaled (`signed`), then the marker (`sendMarked`), and only then does this client call `sendTransaction`.
  `solana:signAndSendTransaction` is not used.
- **send configuration.** `{ encoding: 'base64', skipPreflight: true, maxRetries: 0 }`. A preflight answer is the
  RPC's claim and cannot change "uncertain until reconciled" after the marker; without preflight a doomed
  transaction lands with its error in the ledger, giving a chain-evidenced `failed` at finalization rather than an
  evidence-free `dropped` after expiry. Cost: the fee of a failing transaction. `maxRetries: 0` stops the RPC node
  re-forwarding on its own; the client never resends.
- **blockhash.** `getLatestBlockhash(finalized)` must agree with `getBlock` at its context slot (same blockhash,
  `lastValidBlockHeight = blockHeight + 150`; Agave v4.1.2 `get_blockhash_last_valid_block_height`,
  MAX_PROCESSING_AGE 150; reproduced on the local validator), must not be older than the plan's snapshot, and the
  genesis hash is re-checked.
- **dropped.** Only when the finalized block height (`getBlockHeight`, finalized) is **greater than**
  `lastValidBlockHeight`, `isBlockhashValid` agrees it is invalid, the node's ledger reaches back to the blockhash
  slot (`getFirstAvailableBlock`), and `getSignatureStatuses([sig], { searchTransactionHistory: true })` is still
  empty when read after the height. Height == lastValid is still open. Otherwise the outcome stays open.
- **finalized / failed.** A status with `confirmationStatus: 'finalized'` (and `confirmations: null`) at a slot after
  the blockhash slot and not above the response's context slot. `err` becomes a compact label
  (`InstructionError:1:Custom:6016`, `BlockhashNotFound`, or `Unrecognized`). A "finalized, no error" status is
  recorded only if a fresh finalized escrow read shows the effect (fund: escrow exists; release: `Released`;
  refund: `Refunded`; payout: paid out); if the read is older than the status slot it waits, if the effect is
  missing it is `INTEGRITY_FAILURE` and nothing is written.
- **possibly sent.** A record is the profile's own never-sent preparation only if it is `prepared`/`signed`, has no
  marker and `originProfileId` equals the journal's `profileId`. Anything restored (a restore yields another
  profile id), imported (`UNKNOWN_ORIGIN`) or marked is possibly sent: it is never cancelled, only reconciled by
  signature or settled by expiry. `recover()` at startup cancels the own never-sent ones and reconciles the rest.
- **missing marker.** A record of this format must carry `sendMarkedAt` (number or null); one without the field is
  corrupt and the trade's journal fails closed (no new intent; the recovery document still reaches the exits). A
  shared-schema V1 record, which has no marker field, is imported as possibly sent (`fromLaneAIntent`).
- **admission.** A new intent joins a trade only when every stored record is terminal. A rebuild after `dropped` is
  a new user-triggered intent with a new blockhash that must name the dropped intent (`rebuildOf`), once.
- **durable nonces** are not expressible (plans never build System `AdvanceNonceAccount`); a restored message that
  carries one fails the byte-exact shape check.

## 3. C-L2 (release/refund never bundled with payout)

`plan.ts` builds every message from a trusted finalized snapshot (`readTrustedSnapshot`, which calls the genuine
`SolanaChainReader.prototype.read`; structural copies are refused). Allowed messages:

| Action | Role (fee payer) | Precondition (finalized snapshot) | Instructions |
| --- | --- | --- | --- |
| fund | seller | escrow absent; funding window open at `t` and `t + submitMargin` | `fund_native` or `fund_spl` |
| release | seller | `Funded`; `t + releaseMargin < deadline` | `release` |
| refund | seller | `Funded`; `t >= deadline` | `refund` |
| payout | seller or buyer | `Released`/`Refunded`, unpaid, native rent known, vault not frozen | `[CreateIdempotent]? [Transfer top-up]? payout_*` |

The SPL payout prepends `CreateIdempotent` for the recipient's canonical ATA (payer funds it). A native payout
prepends a System transfer of exactly the reader-reported rent shortfall when one exists, only up to the caller's
`maxRentTopUpLamports` (default 0: refused with `LIMIT_EXCEEDED`). Unknown native rent is refused with `CONFLICT`,
even if the escrow has surplus lamports or the caller supplies a large top-up limit. No intent is prepared and no
wallet signature or send is requested. Prepared reviews recheck the same condition before signing and before
physical send. Release and refund remain state-only actions and do not depend on payout rent readiness.

`recoveryExits` reports `rent-shortfall` and `rent-unknown` as closed payout exits; a completed payout still reports
`paid-out`. A known shortfall can be addressed by an explicit `buildRecoveryMessage` top-up within the caller's
limit. The localnet controller therefore keeps the known-shortfall **review** reachable for a fresh snapshot,
the connected trade wallet and an allowed role, with no pending intent. Its prepare operation still enforces the
actual top-up limit; `canPayout` grants no signature or send authority. Unknown rent cannot enter payout review.

`verifyPlanMessage` rebuilds the expected bytes
from (trade, action, expected state, fee payer, blockhash) and refuses anything else with `INVALID_INPUT`, so
`[release, payout]`, `[refund, payout]`, two escrow instructions, foreign programs, a nonce advance, another ATA owner
or a substituted program/escrow/vault/mint/destination never pass, on creation or on restore.

## 4. Composition entry point

```ts
const client = createSolanaEscrowClient({
  rpc, wallet, journal, registry, clock,
  margins: { submitMarginSeconds, releaseMarginSeconds },  // REQUIRED, u64 decimal strings; no default here
  walletChain: 'solana:localnet',                           // Wallet Standard chain id of the registry network
  random, timeoutMs,                                        // optional
});
client.bind(binding, terms) -> BoundSolanaTrade
client.connect(trade, 'seller' | 'buyer')       // explicit user-triggered standard:connect; account must be the role key
client.read(trade)                              // finalized snapshot
client.fund | release | refund(trade, session, { rebuildOf? })
client.payout(trade, session, { createAta?, maxRentTopUpLamports?, rebuildOf? })
client.reconcile(trade)                         // observe open intents, journal terminal outcomes
client.recover(trade)                           // startup: cancel own never-sent, reconcile the rest
client.intents(trade); client.dispose()
```

Actions resolve to `{ intentId, signature, state }` with `state` `sent` or `unknown`; the app polls `reconcile`.
Operations on one trade are serialized in the instance; other tabs are fenced by the journal CAS. The default
margin policy (B1a) is supplied by the caller.

### Encrypted vault composition

`new SolanaVaultJournal(vaultService, vaultSession)` implements the injected journal
port using the existing `VaultService.read/commit` and `VaultSessionAuthority`
capabilities. Import it from `src/vaultjournal.ts`, then pass the instance as
`journal` to `createSolanaEscrowClient`. Call `journal.dispose()` when discarding the
composition. Vault lock revokes the journal's captured session synchronously. The
client checks this capability at wallet and physical RPC boundaries, including the
microtask immediately before dispatch after a durable send marker.

One encrypted `kind: 'journal'`, `schemaVersion: 1` private record per trade holds
format `p2p-offramp/solana/vault-journal/v1`, the complete binding, a per-trade revision
and the complete native intent records. Its id is a domain-separated hash of the
binding; decoding also checks the full binding. Records are bounded to 32 intents
and the vault's 262,144-byte payload limit. History has no deletion or pruning API.
Strict decoding rejects duplicate, foreign, future, inconsistent or malformed
entries without overwriting them. `loadIntents` additionally verifies each intent
against the bound trade and exact message before lifecycle use.

Writes enforce native state transitions, immutable fields, per-trade revision,
original-profile cancellation rules and admission/replacement rules. The vault's
global revision and atomic persistent CAS fence other instances and sessions. An
empty commit checks persistent freshness even for a read. A conflicting or revoked
session must be reopened and reconciled; the adapter does not retry. A lock or
abort after an acknowledged CAS is reported as uncertain, preserving the stored
marker and preventing broadcast.

The encrypted backup service copies this native payload without converting through
`IntentV2`. A fresh-key restore changes the current profile id while preserving every
intent's `originProfileId`, pre-marker signature, marker, payout state and outcome.
Consequently a restored preparation can be reconciled but cannot be cancelled as
the fresh profile's own never-sent transaction. No carrier or journal format migration
is introduced here.

The offline recovery projector uses a separate pure schema parser to show one current
recovery hint per native trade journal. Its sole nonterminal intent takes precedence
over every stored terminal label, including a later label; if all intents are terminal,
the greatest `updatedAt` wins, with greatest `intentId` breaking ties. Multiple open
intents, duplicate IDs, foreign bindings, future versions or invalid structures make
the entire record unsupported. The record and its complete history remain unchanged.

The hint keeps the literal native action/state and the public transaction-signature ID,
including a signature saved before the marker and payout actions. It carries the existing
`unverified-offline-reference` authority. Stored terminal labels grant no chain or wallet
authority. The existing 64-record pagination and private export bounds remain unchanged;
the UI explains that the complete intent history stays in the encrypted backup. The
ordinary offline build imports no Solana RPC, wallet or cryptographic verification code.
Its parser checks bounded structural consistency, including message account/blockhash
metadata, and never substitutes for the native client's signature, terms, PDA, network
or live-state verification. No generic private-record read or transaction action is
added to the worker protocol.

`test/vaultjournal.test.mjs` exercises the actual `EncryptedVaultService` and
`EncryptedBackupService` with an in-memory backing-store implementation. It verifies
ciphertext-only persistence, release and payout outcomes through fresh-key restore,
pre-marker signature recovery, uncertain marker/send outcomes, explicit rebuild only
after expiry, 32-intent bounds, cross-session CAS, stale reads, malformed records,
and lock races before/after CAS and at physical dispatch. These tests do not claim
IndexedDB browser execution; the application's storage and browser suites cover
that backing store separately.

The dated [integration qualification](integration-qualification-20261118.md) records
the consolidated core's native build/LiteSVM/IDL evidence and the current container's
blocked real-validator startup. Earlier local-validator summaries below are source
PR evidence and do not qualify a later combined commit.

## 5. Tests and local evidence

Unit tests (no network): `message`, `plan`, `wallet`, `intent`, `lifecycle`, `adapter`, `recovery` (`test/*.test.mjs`,
fakes in `test/lifecycle-support.mjs`). They cover: crash after sign before marker, crash after marker before send
(commit-then-crash journal), send throw / timeout / odd answer / thenable → `unknown` with exactly one send,
restore from backup with the marker (no resend), restored pre-marker records (never cancelled), the expiry boundary
(height == lastValid open, +1 dropped), missing ledger history, hostile RPC (false finalized status, inconsistent
heights, height going backwards, duplicate/oversized status lists, status slot before the blockhash or above the
context, confirmations on a finalized status, accessors, bad `lastValidBlockHeight`, blockhash/block mismatch,
stale blockhash, genesis change), wallet fee-payer/instruction/blockhash substitution, a valid signature wrapped
around different message bytes, a signer that is not the role key, program/account/mint substitution, frozen
destination payout (release stays final, payout retryable), rent shortfall, durable-nonce restore.
Mutation checks (each run once by temporarily breaking `src`): sending before the marker, accepting a bundle,
an off-by-one expiry, cancelling restored records, skipping wallet byte equality, trusting a status without the
escrow effect, skipping signature verification on restore, and planning a payout from `Funded` are each caught.

Real validator (`client-run.mjs`, Agave 4.1.2, synthetic localnet program/mints/keys generated at runtime): see §8.

## 6. Historical shared-schema proposals (not the current recovery store)

The proposals below predate `SolanaVaultJournal`. The current encrypted native journal stores the complete
native lifecycle without a lossy `IntentV2` conversion, and the offline projection reads that native format.
These shared-schema proposals are retained for future consolidation; they are not implemented requirements
for using the current native journal. Browser wallet/exchange composition remains a separate integration task.

1. `packages/schemas/src/intent.ts` (`IntentV1.action`, `IntentV1.expectedEscrowState`, `parseIntent`): add
   `'payout'` and `'released' | 'refunded'` for Solana bindings only, with `payout ⇔ released|refunded`. Older
   builds refuse such records (`INVALID_INPUT`), the safe reading. Proposed hunk:
   ```diff
   - readonly action: 'approve' | 'fund' | 'release' | 'refund';
   + readonly action: 'approve' | 'fund' | 'release' | 'refund' | 'payout';
   - readonly expectedEscrowState: 'absent' | 'funded';
   + readonly expectedEscrowState: 'absent' | 'funded' | 'released' | 'refunded';
   - action: choice(raw.action, ['approve', 'fund', 'release', 'refund']),
   + action: choice(raw.action, binding.chain === 'solana' ? ['fund', 'release', 'refund', 'payout']
   +   : ['approve', 'fund', 'release', 'refund']),
   - expectedEscrowState: choice(raw.expectedEscrowState, ['absent', 'funded']),
   + expectedEscrowState: choice(raw.expectedEscrowState, binding.chain === 'solana'
   +   ? ['absent', 'funded', 'released', 'refunded'] : ['absent', 'funded']),
   + // after building `legacy`: (action === 'payout') === (expectedEscrowState is released|refunded), else fail()
   ```
2. `packages/domain/src/intent-journal.ts` `markSending`: for Solana the signature is known before broadcast but
   `prepared` forbids one and `markSending` cannot write it, so the marker and the transaction id are not atomic in
   the shared journal. Proposed: `markSending(intentId, signal?, solanaSignature?)` writes
   `submission.signature` (canonical base58, 64 bytes, required for Solana, refused for EVM) in the same CAS as
   `sendMarkedAt`. With it, this package's `signed` + `sendMarked` writes collapse into that one write.
3. `intent-journal.ts` `[TRANSITION]`/`observe`, `recordBroadcast`, `reconcileNative`, `authorizeTerminal`, `#native`
   are EVM-only (UNSUPPORTED_PROVIDER/CONFLICT for Solana). Proposed Solana branches: transitions keyed by
   `signature` instead of `hash`; `broadcast-unknown → pending | finalized | failed | expired`; `expired` only with the
   verified expiry evidence above; `NativeIntentObservation` gains `signature`, `slot` and an error label.
4. `intent-journal.ts` `lifecycleReservable`: a successor of an `expired` intent requires an EVM nonce match, so a
   Solana rebuild after a drop cannot be reserved. Proposed: for Solana, allow exactly one successor naming an
   `expired` intent whose expiry was verified in this session (no nonce concept).
5. Wiring (apps/web, packages/wallet, storage): a vault-backed implementation of `SolanaJournalPort` (one CAS
   revision per trade binding, `profileId` = vault profile), Wallet Standard discovery producing `SolanaWalletPort`,
   and the default margins (B1a) passed to `createSolanaEscrowClient`.

The adapter (`toLaneAIntent`/`fromLaneAIntent`) already carries genesis, program, ProgramData pin, escrow, role,
message and blockhash slot in `preparedRequest`; until items 1-4 land it refuses `payout`, maps `signed` to
`prepared` without the signature (lossy), and refuses a marked shared-schema Solana intent without a signature.

## 7. What this does not prove

A dishonest RPC can still lie consistently (no light client, no corroboration across providers): it can claim an
early expiry (then a rebuilt intent and the original could both land; the escrow program lets only one state
change or payout succeed, so the cost is fees), hide a landed transaction until expiry, or fake a consistent
finalized world. The finalized Clock lags the tip; margins absorb it. Wallet claims (rejection) are not evidence;
a malicious wallet holds the key anyway. Fees and the ATA rent of a failed payout are paid by the fee payer.
A same-profile storage rollback (the vault returned to an older state without a new profile id) can show a marked
intent as `signed` without its marker; `recover()` would then cancel it as never sent (the same residual as Lane A's
A-N4). The escrow program still lets only one state change and one payout succeed per escrow.

## 8. Local validator run record (2026-11-18)

`node --import ./scripts/test-support/register-tsx.mjs contracts/solana/localnet/client-run.mjs`, solana-core 4.1.2
(feature set 3345198602), SBPF v3 `basic_escrow.so` built in this worktree (SHA-256 `eed3a490…`, the same as the
committed fixture's), every feature active. Two complete runs, both exit 0 with 62/62 checks: one before the
ledger-history check was added (1925 s) and a final one on the committed source (1922 s, source hashes recorded
before the run and unchanged after). Final run:

| Flow | Result |
| --- | --- |
| native | fund, release alone (finalized `Released`, unpaid), payout_native: buyer credited exactly 0.4 SOL; one `sendTransaction` per intent |
| serializer | validator accepted every client-built message; `solana decode-transaction` of a signed fund: same keys and header, `sigverifyStatus: ["pass"]` |
| C-L2 (i) | manual `[release, payout_spl]` to a frozen buyer ATA: client refuses it (`INVALID_INPUT`); sent anyway it fails `InstructionError [1, Custom 6016]` and the escrow stays `Funded` |
| C-L2 (ii) | client release alone finalized; payout to the frozen ATA journaled `failed` (`InstructionError:1:Custom:6016`); escrow stays `Released`, unpaid; after thaw the retried payout finalizes and the buyer ATA holds 25 000 000 |
| crash | crash after the marker: no send; restart keeps `sendMarked`, refuses a new release; `dropped` once the finalized height passed lastValidBlockHeight 614; implicit rebuild refused, explicit `rebuildOf` rebuild finalized with a new blockhash; 0 sends for the crashed intent |
| restore | vault backup with a marked payout restored into another profile: not cancelled, reconciled `finalized`, no resend |
| refund | funded with deadline = clock + 1815 s; client refused an early refund (`EXPIRED`); after 1857 s of real time refund and payout finalized; escrow released exactly 0.3 SOL |

13 `sendTransaction` calls in total, one per sent intent. Localnet-only deviation: the harness answers
`getGenesisHash` with the compiled synthetic genesis constant. Single local validator: no forks, no fee market,
no real stake-weighted clock.
