# Lane B progress

Owner of this file: the Lane B session. Lane A folds it into `LEDGER.md`. Brief: `docs/consolidation/LANE-B-PROMPT.md`
(the original note placed it on Lane A's branch until #135; #135 is now merged).

## Cancellation retention implementation — November 28, 2026

The owner accepted the two tradeoffs in [#281](https://github.com/djshellshoxxx/p2p-offramp/pull/281):
narrowly eligible local cancellation-history retirement and upgraded native
readers after explicit v2 migration. The reply "go wit recommendations" followed
the recommendation describing both consequences. The existing #281 branch now
owns the native journal, reservation identity and client-lifecycle implementation.
Migration stays explicit; unlock, restore and ordinary preparation do not
silently migrate. Independent review, acceptance evidence and D8 integration
remain required. See the [design and acceptance gates](../engineering/SOLANA_CANCELLATION_RETENTION_PROPOSAL_20261127.md).

The #290 seller-funding implementation and #291 Settings integration remain
separately owned. Native composition changes must preserve #290's funding review
and full-identity rebuild options when that source reaches main. Application
migration controls are a Lane A integration boundary; no application files are
claimed here. #278/#279 remain separate. No public deployment or real funds.

Native v2 persistence, explicit migration, immutable reservation identities,
bounded local retirement and the pure recovery-summary reader are implemented
on the #281 branch. Focused encrypted-vault, client-lifecycle and summary-reader
tests pass. Independent source review found no open High, Medium or Low after
repairing migration capability detection for partial journal ports. Final
exact-commit review and repository/hosted qualification remain pending; this
entry does not promote focused tests into application or validator evidence.

### Needs Lane A — #281 application integration

The exact file/function handoff is in
[`packages/chain-solana/docs/retention.md`](../../packages/chain-solana/docs/retention.md#application-integration-handoff).
Proposed protocol additions are separate `journal.migration.prepare`,
`journal.migration.confirm` and `journal.migration.cancel` commands. The Worker
retains the opaque native review; the document receives only its bounded display
and one-shot ID. No migration command creates a wallet grant or automatic RPC
refresh. `controller.ts` clears authority on lifecycle changes; `validation.ts`
admits exact command/display fields; `client.ts` fences stale replies;
`SolanaLocalnetRoot.tsx` supplies explicit warning and confirmation controls while
retaining encrypted-backup export. The private rebuild path must preserve a full
v2 identity instead of collapsing it to the random intent ID.

The existing browser journal oracle accepts v1 only and must be extended with
strict version-specific validation when those controls are integrated. Existing
browser passes therefore remain v1 regression evidence. A frozen pre-upgrade
reader binary has not been executed; its refusal follows from the prior source's
schema-version check at the unchanged locator. Neither limitation is recorded as
a passing v2 integration test.

## Semaphore archival decision — November 28, 2026

The owner accepted archival-only retention. Exact #287 `ba81f6b47d819387553a3836466dfffff165dfe6`
is preserved in `archive/semaphore-v4-research-20261128`, including the corrected test.
[PR #288](https://github.com/djshellshoxxx/p2p-offramp/pull/288) separates the executable research
from #155's remaining intake. The historical isolation issue remains unresolved in the archive;
the optional reputation roadmap remains intact. See the
[decision and preserved blob inventory](../reputation/SEMAPHORE-V4-ARCHIVAL-DECISION-20261128.md).

Completed on November 28: #288 merged into the intake branch at
`39119ae41446ca299dd00165e9496d1084c75718` after all five workflows passed. Its
tree exactly matches reviewed `01c8344775b47a33fc219341cf562f910a70b2e9`.
#155 remains draft; this does not qualify its other intake work or authorize a
main merge. The archive remains pinned to the original research head above.

## Reconciled track status — November 18, 2026

Pinned main: `6c38e641e24abcfdcf645f864bd64c9645836d75`. This table supplements the original progress record;
it does not transfer source ownership or count draft code as integrated. See the
[reconciliation record](2026-11-18-documentation-reconciliation.md) for exact stack heads.

| Track | PRs and observed disposition | Remaining boundary |
| --- | --- | --- |
| B1 Solana client | #151 merged; #152/#153/#157/#158 remain drafts and are consolidated in draft #167 | Qualify the combined native-validator path and compose native browser actions before claiming parity |
| B2 optional packages | #144 proof-inputs, #145 liquidity, #146 courier, #147 arbitration, #148 privacy-policy, #160 privacy-controls, #161 stealth, #162 proof-jobs and #163 meetup remain drafts | Separate modular review; no core completion or D7 deferral change |
| B3 formal harness | #137 merged at `6c38e641`; development-only tooling | Retain unknown proofs/model gap; no release certification |
| B4 tooling/intake/governance | #154/#155/#156 remain drafts | Review each exact source and its claims before integration |
| B5 canonical EVM reads | #143 merged at `f9bc66e7`; downstream wallet/payment/recovery work is in #166 | Current-head qualification for #166 and the dependent stack |
| B6 artifact verifier | #141 merged at `d6344b66` | Explicit build-mode verification does not approve release keys, artifacts or deployments |

Original progress PR #136 is preserved as a merge ancestor of this documentation
candidate. Its initial table below remains historical. No optional-package or audit
source branch was changed by this reconciliation.

## Status update — November 26, 2026 (Lane B session)

Observed on GitHub at `main@8cff449`:

- Merged: #141 (B6), #143 (B5), #137 (B3), #151, #152, #153 and #158 (B1), #154 (B4 tooling), #136 (this file).
- Open:
  - #155 (B4 intake, draft) and #156 (B4 governance, draft).
  - The B2 optional packages are being integrated by #191–#199 and #224–#232. The Lane B PRs #144–#148 and #160–#163 (open, marked ready for review on 2026-11-19) are their source. Their disposition is Lane A's to record in `LEDGER.md`.

Update 2026-11-27 (Lane B session, `main@a5a432bd`):

- Merged (Tier A, exact-head CI green, AI-assisted independent review with no open High or Medium):
  - #277 (governance F2) as `bdbccfc8`;
  - #276 (GOV-1) as `a5a432bd`.
- Tier C drafts ready for owner approval, CI green at their heads:
  - #278 (B1b F3), at `36b7e83c`;
  - #279 (B1c F1), at `3cd44d50`.
  - Both are cut from `8cff449`; merge main into them before merging.
- B1b F1 is reproduced (see its row); it needs an owner design decision.

The Lane B session's container ran out of its disk allowance after the 2026-11-18 run, so no further local work was possible then. Everything Lane B produced up to that point was pushed. Disk space returned on 2026-11-27, and the later entries below come from that session. The findings below were not consolidated anywhere else.

### Feature matrix (implementation versus qualification)

| Track | Implemented | Local evidence | Not yet qualified |
| --- | --- | --- | --- |
| B1a Solana reader policy | C-L3 frozen vault reads as funded; per-read identity checks plus a deploy-slot pin; freeze-authority permits; payout plans; proposed margins; solana-escrow.yml cache scope | 129/129 chain-solana tests, LiteSVM 48, real Agave 4.1.2 localnet run with 186/186 checks | Real cluster, wallets, browser; owner margin and permit decisions; rotated-permit payout matrix for funded/released/refunded escrows |
| B1b Solana lifecycle | Legacy message serializer; sign-only wallet port; C-L2 sequencing; durable send marker; dropped-versus-uncertain rule; portable recovery; `createSolanaEscrowClient` | 150/150 tests, 8 mutants caught, localnet client run 62/62 twice | `apps/web` wiring (Lane A); browser; public cluster; open Mediums F1–F3 |
| B1c Solana acceptance | Off-chain message v1 envelope; strict Ed25519; acceptance statement; bounded replay and tombstone ledger | TS and Python vectors byte-identical. The envelope layout was compared with `@solana/offchain-messages` 8.6.0 by reading its source only: it was not imported or executed (`acceptance.md` §10) | No physical or browser wallet; no runtime cross-check against `@solana/offchain-messages`; exchange carrier (Lane A); open Mediums M1 and F1 |
| B3 formal harness | Fail-closed SMTChecker classification and the evidence pipeline | 22/22 unit tests, forge 89; evidence rerun: NativeConstructor is PROOF_UNKNOWN | Lane B's own second skeptic review of fix commits `05b9d22..59d091f` did not run (usage limit). #137's description records a separate independent review of the merged head `39096586`, which contains those commits, with no new High or Medium finding |
| B4 tooling | Lab, docs validator, claims, tool-path; evidence bound to `sourceCommit` | `check:docs` ok at bind time | B4 tooling F2 (below) |
| B5 chain-evm | EIP-1898 hash-pinned `eth_getCode`/`eth_call`; receipt check at the anchored height | 25/25 tests; real anvil load-balancer probe | Behaviour of arbitrary public RPC providers |
| B6 verifier | Scan mode from the CLI only; one file handle; exit codes | 7 tests, none passing on the pre-fix code (#141) | Release approval remains separate |

### Findings already mitigated on main (verified at source, `main@8cff449`)

These came from the 2026-11-18 reviews, and source read shows they are mitigated on current `main`. No local or runtime execution was done in this pass.

| ID | Mitigation on main | Still to verify |
| --- | --- | --- |
| B1A-T1 | `packages/chain-solana/src/reader.ts` (blob `07b2e85c`): `splMint` refuses a freeze-authority mint without a permit only when `existing === null`. `#observe` passes `classified.escrow`, and `readValidated` and `readPayout` both go through it. `test/policy.test.mjs` covers funded reads without a permit and pre-funding refusal. | A full rotated-permit payout matrix (funded, released, refunded) and a fresh run at the exact target. A frozen vault still cannot be paid out until it is thawed. |
| viem oracle receipt race (unowned) | `scripts/test-evm-viem-oracle-local.mjs` (blob `920f9290`): the refund uses a bounded `waitForTransactionReceipt`, and `finalizeThrough` polls for the receipt. | None. |
| B4 tooling F1 | `scripts/docs/validate.test.mjs` (blob `0fc95f19`): `maintainedDocumentPaths` derives link targets dynamically, and stale assertions are relative to a baseline report. | Not every docs-drift scenario is proven to pass. |
| C-L1 remainder (was Needs Lane A #1) | Per the [coordinator reconciliation](https://github.com/djshellshoxxx/p2p-offramp/pull/274#issuecomment-7206584115), these all pin state reads to the anchored block hash with `requireCanonical: true`:<br>- `scripts/recovery/evm-recovery.mjs` (blob `a0505f98`): `getTrade` and the pending-credit call, plus repeated header checks; spot-checked here.<br>- `packages/wallet/src/evm-payment-preflight.ts` (`ae5c2cff`).<br>- `evm-submit.ts` (`92d46c3b`).<br>- `evm-contract-acceptance.ts` (`c3fa7500`).<br>Fork-refusal tests exist in `evm-payment-preflight.test.mjs:265`, `evm-submit.test.mjs:103`, `evm-contract-acceptance.test.mjs:122` and `scripts/tests/evm-recovery.test.mjs:48`. | Source and test presence were checked, not freshly executed. This is not a claim about every RPC provider's behaviour. |

### Open findings from the 2026-11-18 independent reviews

These are AI-assisted reviews, not a professional audit. "Verified" means at least one of two independent skeptics reproduced the finding. "Unverified" means skeptic verification was cut short by a usage limit. Treat unverified findings as leads to reproduce first, not as established defects.

| Unit (PR) | ID | Sev | Status | Finding | Suggested direction |
| --- | --- | --- | --- | --- | --- |
| B1b (#158, merged) | F1 | Medium | **reproduced 2026-11-27** (scratch test on `main@8cff449`, reproduced below; script sha256 `da4bf90c…b636`, log `db953bcc…6175`) | `journal.ts:79,119` bounds all records to 32 (`MAX_INTENTS_PER_TRADE`), and `submit.ts:194-215` admits before the CAS for every prepared action. Reproduction: 32 wallet rejections of a native release each leave a `cancelled` record (`USER_REJECTED` x32, then `LIMIT_EXCEEDED`). With a wallet that signs, `release` and, after the deadline, `refund` of the funded trade both return `LIMIT_EXCEEDED`. `recover` lists the 32 cancelled records, and nothing is sent. This client profile's exits for that trade are locked by local history alone; on-chain funds are not affected. | Tier C owner decision, not a cap removal. A candidate design: a cancelled record whose transaction was never signed, or whose blockhash has expired at finalized height, carries no broadcast uncertainty and could be compacted to a bounded tombstone count. Marked, sent, unknown and successor-linked records are kept. Add the reproduction as a regression with the fix. |
| B1b | F2 | Medium | unverified; source still asymmetric on main | `adapter.ts` maps cancelled/dropped records to Lane A `failed`/`expired`, but `importedState` refuses a non-prepared record with a null signature. | Preserve deliberate terminal re-observation. Settle which unmarked terminal cases are valid under the shared schema (owner/Lane A decision) before any change. |
| B1b | F3 | Medium | covered on main for two properties (mutants run 2026-11-27); third fixed in draft #278 (Tier C, owner approval) | Three D9/expiry properties had no regression test at #158; mutants survived 150/150. The properties: the status re-read after the height check; treating any `confirmationStatus` as landed; sending after a `CONFLICT` on the `sendMarked` CAS. The lines are `submit.ts` 236-238, 276 and 296-300 at #158 head blob `3ece585a`; on main (blob `f8800065`) they are 282-284, 325-326 and 361-365. On main, `test/independent-expiry-context.test.mjs:35-54` appears to cover the re-read and the finalized-only landing rule. Confirmed by mutation on 2026-11-27. | Fix proposed in draft #278 (not merged): the two existing tests fail on their mutants (3 and 1 failures, run 2026-11-27). The new CONFLICT test kills every send-after-a-refused-CAS mutant tried, including deferred sends. |
| B1b | L1–L3, F4–F6 | Low | unverified | A comment off by one on `lastValidBlockHeight`; `planPayout` ignores `rent-unknown`; `recoveryExits` shows payout open when rent-blocked; a hostile-RPC test passes for the wrong reason; unmarked signed intents are cancellable while the transaction stays valid; `sendTransaction` goes through a read port that may retry. | Address with F1–F3. |
| B1c (#151, merged) | M1 | Medium | conditional | `replay.ts` refuses out-of-horizon or full-capacity tombstones (`LIMIT_EXCEEDED`). `test/replay.test.mjs:85-111,127-135` already asserts the refusal and a later explicit tombstone. The open question is whether the product can then admit a peer acceptance for a cancelled `termsHash`. | Prove it through the accepted carrier before calling it a product defect. In any case, a cancel UI must not claim durable cancellation when the tombstone is refused. |
| B1c | F1 | Medium | reproduced 2026-11-27; fix in draft #279 (Tier C, owner approval) | `acceptance.ts:268-270`, `acceptance.py:411-414`: no vector isolates the verifier's role check or its counterparty-key check; every wrong-role and swapped-key negative is caught earlier, so mutants of those checks survive in both implementations. The review of the fix found the same gap for the terms-hash check and the small-order R rule. | Fix proposed in draft #279 (not merged): four single-field negatives (role, counterparty key, terms hash, identity R). Their mutants fail in TS and Python; the fixture change is insertion-only. |
| B4 tooling (#154, merged) | F2 | Medium→Low | verified | `packages/claims/src/claims.ts` (blob `4889befe` on main) lines 87-89, 97 and 111 (lines 80-82, 90 and 103 at #154 head): the claims API ignores staleness when only `en.ts` changed, and the stale list defaults to `[]`. | Take the validator's `staleClaims` (required argument) and refuse listed ids. |
| B4 tooling | F1 (extraction) | Medium | unverified | `dist-lab/` is not ignored (the s08 `.gitignore` line was not extracted), so every lab run after the first records `sourceDirty: true`. | Appears to be addressed by #259. |
| B4 intake (#155, draft) | F1 | Medium | repaired by #287; preserved in archive | The original changed-lock test failed at an earlier check. #287 verifies valid inputs, changes only the lock, requires the exact digest error, restores the lock and verifies acceptance. | Preserve exact #287 `ba81f6b4` in `archive/semaphore-v4-research-20261128`; no execution or application qualification follows. |
| B4 intake | Qodo (#45 thread) | Medium | archival-only accepted 2026-11-28; historical defect unresolved | The archived evaluator verifies inputs, mounts the caller-controlled dependencies/artifacts and checks again after execution. | Exclude the seven research files and npm hook through #288. [Accepted disposition](../reputation/SEMAPHORE-V4-ARCHIVAL-DECISION-20261128.md). Reactivation requires verified input isolation and fresh review. |
| B4 governance (#156, draft; same blob on main) | GOV-1 | Medium | **reproduced 2026-11-26** (coordinator, real isolated Git fixtures; [#156 comment](https://github.com/djshellshoxxx/p2p-offramp/pull/156#issuecomment-7201664492)). **Fixed by #276**, merged 2026-11-27 as `a5a432bd` | `scripts/governance/evidence.mjs` (blob `ae171065`, identical on main `8cff449`) `checkEvidenceBinding`: an unmerged commit with identical bound file hashes is accepted, and a missing `origin/main` is accepted (baseline 2 pass / 2 fail). `check-all.mjs` calls it with no reachability guard, and `refresh-evidence-manifest.mjs --check` without `--commit` uses `manifest.sourceCommit` directly. Main's real manifest points to `8649b7a`, which is an ancestor of main, so there is no evidence the current packet is invalid. | Make both production entry points (`check-all.mjs` and `refresh-evidence-manifest.mjs --check`) run `git merge-base --is-ancestor <sourceCommit> refs/remotes/origin/main` before row checks. They must refuse a nonzero result or a missing or shallow ref, never silently accept it. Keep injected fixtures behind an explicit test-only scope, and keep every existing stale/hash/path/size/refusal check. Add CLI-level regressions (the four reproduction cases) and test the exact target. A local proof of concept (helper blob `e185ae9e`) passed 4/4. #276 does this against exact `refs/remotes/origin/main`, with CLI-level regressions that all fail on the original scripts (0/7 pass) and pass 7/7 with the fix, and an independent review with no High (findings fixed). |
| B4 governance | F2 | Medium | reproduced 2026-11-27; **fixed by #277**, merged as `bdbccfc8` | `scripts/tests/tool-path.test.mjs:23-24`: the relative-PATH rejection is never exercised. | Fixed by #277: relative entries outside and inside the working directory now reach real fixtures. Five guard mutants fail the test. |
| B2 (#144–#148, #160–#163; integration via #191–#199/#224–#232) | several | Medium | unverified | Boundary tests miss Worker URLs, Vite references and regex evasions; the only resolved-graph guard is `assertModuleAdmitted` (`NON_CORE_MODULE`) in `apps/web/scripts/static-build-plugin.mjs:34` (Lane A). Authority tests check names, not behaviour. The liquidity trap test never runs its traps. The courier locker accepts any non-null profile. The arbitration regex misses `crypto.subtle`. In privacy-policy, `retire()` invalidates every G05 broker permit, including core (PP-A2; still present at #227 head `7740f4d6` `mode.ts:52`; #273 changes only drain and disposal ordering and does not address it). | Reviewers of #191–#199/#224–#232 should check each against the integrated source. |

#### B1b F1 reproduction script (2026-11-27)

A scratch test, kept here so the reproduction survives the session. It is not committed as a test, because it demonstrates a defect that has no fix yet. Put it in `packages/chain-solana/test/` and run it with `node --import ./scripts/test-support/register-tsx.mjs --test <file>` on `main@8cff449`. The printed outcome was `USER_REJECTED` x32, then `LIMIT_EXCEEDED` x8; 32 records, all `cancelled`; release `LIMIT_EXCEEDED`; refund `LIMIT_EXCEEDED`; recover ok (32); sends 0.

```js
// SCRATCH reproduction of B1b F1 (not committed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { connected, setupClient } from './lifecycle-support.mjs';
import { ok } from './support.mjs';

const codeOf = result => (result.ok ? 'ok' : result.error.code);
const sendCount = env => env.cluster.calls.filter(call => call.method === 'sendTransaction').length;

test('B1b F1: wallet rejections fill the per-trade journal and lock the funded trade exits', async () => {
  const env = setupClient('native', { wallet: { rejectSign: true } });
  const seller = await connected(env, 'seller');
  const codes = [];
  for (let i = 0; i < 40; i++) codes.push(codeOf(await env.client.release(env.trade, seller)));
  const records = env.journalFake.records(env.binding);
  console.log('REJECTION CODES', JSON.stringify(codes.reduce((m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }), {})));
  console.log('RECORDS', records.length, JSON.stringify([...new Set(records.map(r => r.state))]));
  // The seller now uses a wallet that signs. Same journal, same cluster.
  const fresh = setupClient('native', { terms: env.terms, cluster: env.cluster, journalFake: env.journalFake, seed: 'r2' });
  const signer = await connected(fresh, 'seller');
  const release = await fresh.client.release(fresh.trade, signer);
  console.log('RELEASE AFTER REJECTIONS', codeOf(release));
  fresh.cluster.advance(1, 3600);
  const refund = await fresh.client.refund(fresh.trade, await connected(fresh, 'seller'));
  console.log('REFUND AFTER REJECTIONS', codeOf(refund));
  const recovered = await fresh.client.recover(fresh.trade);
  console.log('RECOVER', codeOf(recovered), recovered.ok ? recovered.value.length : '');
  console.log('SENDS', sendCount(fresh));
  assert.ok(true);
});
```

### Needs Lane A (consolidated)

1. ~~C-L1 remainder (`scripts/recovery/evm-recovery.mjs` and the three wallet readers pinned by block number)~~: already done on `main`; see "Findings already mitigated".
2. Unowned, and an owner design decision rather than a field addition: freeze-authority permits from a signed source ([coordinator reconciliation](https://github.com/djshellshoxxx/p2p-offramp/pull/274#issuecomment-7207433264), checked at source).
   - The strict parser in `packages/schemas/src/registry.ts` (blob `c6774ec9`) accepts exact v1 asset keys only (`exact()`, lines 102-105). The D5 packet (`docs/adr/proposed/D5-solana-spl-custody-design.md`, line 43) keeps the registry schema unchanged. A silent `AssetV1.freezeAuthority` field would break strict clients or alter that accepted contract.
   - Options for the owner: an explicit RegistryV2, or a separately specified G15-signed permit sidecar that preserves V1. No invented permits.
   - Constraints either way:
     - legacy absence grants no non-null authority;
     - existing recovery keeps historical metadata and is never gated by a changed permit;
     - the registry service, the Solana binding and the G15 release-registry tests migrate together;
     - the no-authority, exact-permit, wrong-mint/authority, changed-authority, tampered-manifest and already-funded release/refund/payout cases stay separate.
   - Needs the D5 schema/permit choice and D8 Tier C authorization.
3. Future consolidation only, not required by the current native `SolanaVaultJournal`: `packages/schemas/src/intent.ts` and `packages/domain/src/intent-journal.ts`: Solana `payout`, `released|refunded`, the signature written in the `markSending` CAS, Solana observe/reconcile branches and successor reservation. The historical proposals are in `packages/chain-solana/docs/lifecycle.md` §6, which main marks as not current.
4. `packages/exchange`: a v2 carrier for `{statement, termsSignature, acceptanceSignature}`.
5. `apps/web`: `signOffchainMessage` with an exact-bytes check; replay-ledger wiring; `createSolanaEscrowClient` with explicit margins beyond the localnet profile. The `solana-localnet` controller already wires it at `controller.ts:72-73`.
6. `apps/web/scripts/static-build-plugin.mjs`: the resolved-module admission layer does not refuse the optional packages.
   - **Reproduced 2026-11-26** ([#274 comment](https://github.com/djshellshoxxx/p2p-offramp/pull/274#issuecomment-7205566130)). The plugin blob `423671c2` is byte-identical on `main` and on all nine intake heads #224–#232.
   - The extracted `assertModuleAdmitted` admitted all 108 optional-package cases across offline, EVM-localnet and Solana-localnet, document and Worker. These were the nine package roots plus nested look-alikes; all 24 controls passed.
   - A prototype that refuses the exact package roots before profile branching passed 132/132.
   - Not a shipped exposure: the AST gate `scripts/check-import-boundaries.mjs` still rejects statically reachable optional packages.
   - Scope:
     - share one explicit optional-name inventory across the graph guards;
     - refuse all nine roots and their nested look-alikes before every profile branch, keeping QR role separation, permitted core paths and the localnet exceptions;
     - extend the `generateBundle` fixture to assert refusal before any file is read or emitted, for each profile and Worker, with positive controls.
   - **Ordering: land this shared guard before the individual optional intake merges.**
7. `scripts/sepolia/lib.mjs` (blob `e1c701da`, lines 81–95): pin the forge binary SHA-256. Today it checks forge's self-reported version and commit, and the solc SHA-256, but not the forge binary itself.
8. Unowned: the stale comment at `packages/domain/src/trade-terms.ts:167` is being fixed in draft #275 (one JSDoc line). The viem receipt race is already fixed; see above.

### Owner decisions and external materials

- D5 client deadline margins: proposed 300 s for funding and release (`packages/chain-solana/src/policy.ts`).
- Freeze-authority permits per allowlisted SPL mint, and their signed source: RegistryV2 or a G15-signed permit sidecar (Needs Lane A #2).
- D1 open item: whether a separate Solana terms consent is wanted in addition to the peer acceptance.
- Solana acceptance ledger bounds (64 entries per space, 7-day horizon).
- B1b journal retention policy: accepted for #281 on 2026-11-28; native implementation and qualification are in progress. Shared-schema terminal states (F2 above) remain a separate decision.
- #155 Semaphore evaluator: **settled 2026-11-28 — archival-only**. Preserve #287 at `ba81f6b4`; #288 separates the evaluator from active intake. See the [accepted disposition](../reputation/SEMAPHORE-V4-ARCHIVAL-DECISION-20261128.md).
- External materials, none of which an agent can supply:
  - physical and browser Solana wallets for signing and interoperability tests;
  - a public Solana cluster profile (genesis, program id, mint list);
  - proving artifacts and providers for the optional packages.

## Handoff prompt (for a fresh Lane B session)

```text
You are continuing Lane B of djshellshoxxx/p2p-offramp. Read agents.md, docs/adr/ACCEPTED-DECISIONS-2026-11-04.md,
docs/consolidation/LANE-B-PROMPT.md and this file first. Lane ownership, invariants and D8 tiers are unchanged.
Your own push branch prefix is nodata/youthful-maxwell-uwy8hx-<unit>. Many PRs from other agents are open (#191-#279):
check each before starting so you do not duplicate it. Do not reimplement anything under "Findings already mitigated".

1. #278 (B1b F3) and #279 (B1c F1) are Tier C drafts with green CI: merge main into each (no rebase), keep CI green
   at the exact head, answer reviews, and wait for the owner's approval; do not merge them yourself. GOV-1 (#276)
   and governance F2 (#277) are merged. A small B4 tooling follow-up: the short-name origin/main lookup in
   scripts/docs/generate.py (its --allow-local check). It only runs locally, so no CI gate depends on it.
2. Check the current source and ownership for each other "Open findings" row before changing anything. B1b F1's
   bounded-retention design is owner-approved and implemented on #281; finish its current-head qualification,
   exact-commit review and the Needs Lane A handoff above. Final Tier C integration remains gated. F3 is done in
   #278 and B1c F1 in #279 (both awaiting owner approval). M1 is blocked on
   Needs Lane A #4: do not build a carrier in packages/exchange; until #4 lands, only re-confirm the replay.ts refusal.
3. Optional: an extra review of the B3 fix commits 05b9d22..59d091f (scripts/formal/evm.mjs). #137's description already
   records an independent review of head 39096586 with no new High/Medium. The first-review finding is in
   scripts/formal/README.md ("Deviation from the extracted source"); check for no new fail-open path.
4. For #155: the owner accepted archival-only Semaphore retention on 2026-11-28. Preserve exact #287
   `ba81f6b47d819387553a3836466dfffff165dfe6` in `archive/semaphore-v4-research-20261128`; #288 refreshes
   current main and excludes the seven research files and npm hook. #288 completed its D8 gates and merged into
   #155 at `39119ae41446ca299dd00165e9496d1084c75718`. #155 remains draft. Review the four remaining intake packets separately; keep their existing execution restrictions.
   Preserve the accepted archival disposition during historical consolidation. No assurance-manifest refresh
   is needed solely for this disposition. Governance F2 is merged (#277).
5. Post one review comment per B2 finding on the matching codex integration PR (#224-#232) if it is still open there.
   Needs Lane A #6 (the resolved-module guard in apps/web/scripts/static-build-plugin.mjs) is Lane A's file and should
   land before those intake merges; do not edit it, only point to it.
Gates per PR: npm ci --ignore-scripts; typecheck, test, test:specs, check:specs, check:boundaries, test:build-policy,
build, plus affected workflow suites; Foundry 1.5.1 and solc 0.8.30 hash-checked; Agave 4.1.2/Anchor 1.2.2 for Solana.
Keep the disk allowance in mind: remove worktree node_modules, cargo target dirs and review scratch copies when done.
```

## Historical start state (2026-11-18)

- Gate: `git merge-base --is-ancestor 7be1dbe origin/main` is true. PR #134 merged as `eef9a80`.
- Verified source SHAs: N37F `faf245e7766861a036725d76efc1015ffe321f81`, `2cb0817` (#28 branch), m0-s08 `f8a9aa1430`,
  m0-s09 `5a9997485b`, m0-s10 `0baa3c1ae5`, m0-s11 `14d7c5e267`, N42 `75d88460`.
- Local toolchain (all hashes checked against the repository pins): Node 24.22.3 (nodejs.org SHASUMS256), Foundry
  `1.5.1-v1.5.1` commit `b0a9dd9c`, solc 0.8.30 SHA-256 `f3e987dc…28f7` (matches `scripts/sepolia/lib.mjs`), Agave
  4.1.2 `182084b8` tarball SHA-256 `5991d027…f770`, Anchor CLI 1.2.2 SHA-256 `e2c35a97…e741`, Python 3.12 oracle venv
  (`cryptography` 50.0.0, hash-pinned).
- Baseline on `main@eef9a80` under Node 24: `typecheck` pass; `npm test` 1568 tests, 1567 pass, 1 skip (forge-gated
  calldata test), 0 fail, 0 todo; `check:boundaries`, `test:build-policy` and `build` pass.

## Historical initial branches and PRs

Branch names use the session prefix `nodata/youthful-maxwell-uwy8hx-<track>` (owner-approved in the session). One PR per
coherent unit, draft, targeting `main`.

| Track | Unit | Tier | Branch | PR | State |
| --- | --- | --- | --- | --- | --- |
| B1 | Solana client parity | C | `-b1-solana` | - | in progress |
| B2 | proof-inputs, liquidity, courier, arbitration, privacy-policy, privacy-controls, stealth, proof-jobs, meetup | B | `-b2-<package>` | - | in progress |
| B3 | Formal harness | C (by path) | `-b3-formal` | - | in progress |
| B4 | Lab/docs tooling + claims; intake + reputation; governance | A | `-b4-tooling`, `-b4-intake`, `-b4-governance` | - | in progress |
| B5 | Block-hash-bound EVM reads (C-L1) | B | `-b5-evm-blockhash` | - | in progress |
| B6 | Artifact verifier mode (D-L4) | C (release verification) | `-b6-verifier-mode` | - | in progress |

## Needs Lane A recorded at the initial checkpoint

None recorded yet.

## Owner decisions and external materials recorded at the initial checkpoint

None recorded yet.
