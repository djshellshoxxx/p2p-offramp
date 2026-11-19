# Independent integration review — 2026-11-18

## Result and scope

This report records the completed core review snapshot, before the later browser and encrypted-vault journal
implementation work. It does not claim qualification of those later changes.

The reviewed artifact-verifier change, extracted EVM signer, and combined Solana client have concrete regression
evidence. Five defects were independently reproduced across the signer and Solana code, and each now has a
repair. The original artifact-verifier defect was also reproduced before and after PR #141. No confirmed
High/Medium finding remains in the reviewed source after the commits listed below. This is a bounded source
and integration review, not an external audit or a release approval.

The root agent owns remote merges and the final combined-tree/hosted-CI gate. This reviewer performed no remote
mutation. A local green test is not a claim that pending hosted CI passed. The actual Solana validator run is
not qualified by this review: the Solana owner reports an io_uring EPERM sandbox failure at validator startup.

| Component | Reviewed/repaired source |
| --- | --- |
| Starting main | `97ce6a41805ab4d8fc6fccbcfb9dd79463deebd7` |
| Artifact verifier, PR #141 | PR head `87af4088a2fde86ed7485fdc7d229b7c04a2be87`; independently tested merge `7116de5a853ae4b1fef1ba6968ba3f7320d226f6` |
| Extracted EVM signer before final repair | `8f6a015706ab1c198ef83856ce7ca08aaf784d87` |
| EVM signer final-continuation repair | `75972eef7cfa28d05170b88cad07e15fffdc8ccd` |
| Solana initial independent review head | `8446b0efc084c2b8ec7d202666b0e17b1b61f5a0` |
| Solana physical-dispatch repair | `a1fd42f6af0f5542563621c5751ea18e6749b4e6` |
| Solana reconciliation identity/floor repair | `9b5b01ba02bfe25bb8a5348574a39e7051a6a5ec` |
| Solana recovery-ID repair | `93b4bf20068b1c39bb779683539cf73ecc1f195c` |
| Solana source after line-limit correction | `b1dbd00d800c0f6b8706826c59b6ae629d2c86ce` |
| Solana recovery display binding repair | `0898d9e8e9d4103d46f9500d44ed42c3ae9cb194` |

The Solana owner's `233124513ce2f33a7a430df42abf9686152dd082` is reported as evidence-documentation only above
`b1dbd00`; its source behavior is unchanged. Root subsequently incorporated the recovery fix as `f22b74f` and the signer fix as `ab884ea`. The original
reviewer commits remain recorded above to preserve the exact test provenance. The signer fix edits only the
wallet adapter and its signing tests.

## Independently reproduced findings

### SOL-R1 — a disposed client could still start the queued broadcast

**Severity: Medium. Fixed.** The original `submit.ts` checked disposal before scheduling an RPC promise, while
the physical `rpc.request` was deferred into a later microtask. Disposal could run in between. A regression
hooks the durable `sendMarked` write, schedules disposal, and observes `sendTransaction` being called after
disposal at `8446b0e`. The original run sends once and returns `sent`.

The fix invokes `context.assertActive` inside the physical promise continuation immediately before the RPC
request. The same reproduction now sends zero transactions. The durable marker remains available for
reconciliation; cancellation does not erase uncertainty. Sources: `packages/chain-solana/src/submit.ts`,
`packages/chain-solana/test/independent-review-regressions.test.mjs`; repair `a1fd42f`.

### SOL-R2 — reconciliation accepted terminal evidence from another network

**Severity: Medium. Fixed.** The original `observeIntent` consumed signature status, finalized height,
blockhash validity and ledger-history evidence without checking genesis. Successful landed transactions got
a later escrow read, but dropped and failed outcomes did not. After a simulated unknown send, switching the
RPC to another genesis and advancing its height could mark the original intent `dropped`; a normal read of
the same trade correctly returned `WRONG_CHAIN`. The false terminal record could permit a rebuild.

The fix checks the expected genesis before and after every observation, including failure and absence.
Evidence collection no longer raises the network height floor. It applies the floor only after the second
identity check succeeds, so rejected wrong-network data cannot poison later correct reads. Regressions cover
switches before observation, during height lookup, during failed-status lookup, and a rejected high height.
Sources: `submit.ts` and the same independent regression file; repair `9b5b01b`.

### SOL-R3 — recovery export rejected valid registry identifiers

**Severity: Low compatibility/availability. Fixed.** The registry accepts IDs with uppercase letters and dots,
subject to its length, separator and `..` restrictions. Recovery used a narrower lowercase-only regex. A
successfully bound trade with `Solana.Localnet`, `Escrow.V1` or `Sol.Native` failed recovery export.

The repair uses the registry grammar, preserving the traversal and length restrictions. Independent
network/deployment/asset round-trip cases were all red before the change and green afterward. Sources:
`packages/schemas/src/registry.ts`, `packages/chain-solana/src/recovery.ts`,
`packages/chain-solana/test/independent-recovery-compatibility.test.mjs`; repair `93b4bf2`.

### SOL-R4 — recovery exit display could use a different trade's snapshot

**Severity: Low display correctness. Fixed.** `recoveryExits` required a trusted snapshot and matching escrow
address, but the PDA is derived from seller and nonce rather than all signed terms. A snapshot for different
terms at that same PDA could report release open for the original recovery document. The signing planner
already refused the mismatch, so the reproduction did not enable an unauthorized message or spend.

The repair requires finalized commitment and a matching chain, network, deployment and trade ID before
deriving the available exits. The regression constructs two different orders sharing a PDA, confirms the
wrong snapshot is refused, and confirms the matching snapshot still works. Sources: `recovery.ts` and
`test/recovery.test.mjs`; repair `0898d9e`.

### EVM-R1 — nested async helpers could publish a stale signature result

**Severity: Medium session-safety issue. Fixed.** At `8f6a015`, both signing methods awaited
`#afterSignature` and then returned success. `#authorize` awaited that result without checking the session
again. Disposal or abort scheduled after the identity helper's check but before the adapter's final owned
continuation therefore produced a successful signature result.

Four regressions cover both methods and both cancellation modes. The repair rechecks successful results
after `await work()` in `#authorize`, preserving already-failed error codes. Public wrappers return the
authorization promise directly rather than introducing extra async adoption. The physical signing slot is
held until the provider finishes, even across cancellation, disconnect and reconnect. The new slot regression
holds the first provider request, reconnects, and proves neither signing method can start another prompt.

The boundary is the adapter's final continuation and settlement of its promise. A later consumer callback can
run after a subsequently scheduled disposal even though the promise settled earlier; that is consumer
scheduling, not a stale result published after the adapter observed invalidation. The diagnostic probe
records both sides of this boundary. An `async_hooks` promise-settlement probe directly confirms the remaining
success case settles the adapter promise before disposal, even when disposal precedes the consumer callback
([signer-promise-settlement-boundary.jsonl](independent-core-evidence-2026-11-18/signer-promise-settlement-boundary.jsonl)). Sources: `packages/wallet/src/evm-adapter.ts`,
`packages/wallet/test/evm-adapter-peer-acceptance.test.mjs`; repair `75972ee`.

## Preserved invariants reviewed in source

- **Wallet authority and transaction bytes:** Solana explicitly connects the exact stored role key, uses
  sign-only, requires exactly one signature over the exact rebuilt message, and verifies it offline with
  strict Ed25519 verification. EVM uses only typed-data signing, derives the acceptance domain from the
  registry, snapshots inputs before awaits, checks account/chain, verifies the strict EOA signature offline,
  and refuses signing-method downgrade. The peer proof remains candidate-only.
- **Durable send discipline:** the Solana sequence is prepare, sign, durable marker, one broadcast. CAS fences
  competing writes. Marker uncertainty blocks broadcast when the write outcome is unknown. After marking,
  throws, timeouts and unexpected replies preserve a possibly-sent outcome. Reconciliation does not send.
- **Chain and program identity:** the reader checks genesis, immutable loader/program identity, ProgramData
  hash, finalized Clock and coherent account/block observations. The reconciliation fix binds all terminal
  evidence to the same expected genesis.
- **Release and payout separation:** plans contain one escrow instruction. Release/refund are never bundled
  with payout. Payout is planned from finalized terminal state, and byte rebuilding refuses substituted
  programs, accounts, recipients, nonce instructions or arbitrary extra instructions.
- **Funded exits:** freeze-authority permits gate new funding. Removing a permit does not remove existing
  escrow release/refund exits. A frozen token vault can still block token movement, as represented by the
  custody/payout state rather than hidden by an admission-policy error.
- **Acceptance and replay:** off-chain acceptance is validated, bounded and candidate-only. Replay/tombstone
  records are separate from economic authority; message receipt does not authorize escrow movement.
- **Portable recovery:** documents contain public terms and identity data rather than private keys or private
  agreement content. Derived terms bytes/hash, PDAs and role bindings are checked; planning uses a trusted
  finalized snapshot. The two recovery repairs keep export and exit display aligned with those boundaries.

Relevant reviewed source modules are `wallet`, `submit`, `journal`, `compose`, `intent`, `adapter`, `plan`,
`policy`, `settlement`, `instructions`, `bind`, `message`, `reader`, `payout`, `acceptance`, `replay`, `offchain`,
`recovery` and `auxiliary` in `packages/chain-solana/src`, plus the localnet harness and workflow changes.

## Executed verification

All counts below are this reviewer's runs unless explicitly described as owner-reported. Logs are preserved under
`docs/execution/independent-core-evidence-2026-11-18/`.

| Source | Command/scope | Result | Evidence |
| --- | --- | --- | --- |
| PR #141 tested merge `7116de5` | artifact verifier focused tests | 7/7 pass | [artifact-verifier-tests.log](independent-core-evidence-2026-11-18/artifact-verifier-tests.log) |
| Same | build-policy suite | 36/36 pass, no skips | [build-policy-tests.log](independent-core-evidence-2026-11-18/build-policy-tests.log) |
| Original main vs PR #141 | demo and testnet implicit-mode reproduction | original accepted; repair refused | [artifact-verifier-before-after.json](independent-core-evidence-2026-11-18/artifact-verifier-before-after.json) |
| Solana `8446b0e` | 3 independent disposal/network tests | 3 failures reproduce defects | [solana-independent-review-red.log](independent-core-evidence-2026-11-18/solana-independent-review-red.log) |
| Solana `9b5b01b` | 5 asynchronous regressions + 5 recovery cases | 10/10 pass | [solana-independent-review-9b5b01b-green.log](independent-core-evidence-2026-11-18/solana-independent-review-9b5b01b-green.log) |
| Same | recovery identifier cases | 3 failures reproduce mismatch | [solana-recovery-id-red.log](independent-core-evidence-2026-11-18/solana-recovery-id-red.log) |
| Solana `93b4bf2` | all chain-solana tests, concurrency 4 | 249/250 pass; only source line-length failure | [solana-independent-review-93b4bf2-full.log](independent-core-evidence-2026-11-18/solana-independent-review-93b4bf2-full.log) |
| Solana `b1dbd00` | boundary + asynchronous + ID regressions | 14/14 pass, no skips | [solana-independent-review-b1dbd00-final.log](independent-core-evidence-2026-11-18/solana-independent-review-b1dbd00-final.log) |
| Solana `b1dbd00` + new display regression | recovery suite | 5 pass / 1 fail | [solana-recovery-binding-red.log](independent-core-evidence-2026-11-18/solana-recovery-binding-red.log) |
| Solana `0898d9e` | recovery, boundary and independent regressions | 20/20 pass, no skips | [solana-recovery-binding-green.log](independent-core-evidence-2026-11-18/solana-recovery-binding-green.log) |
| Same | `npm run typecheck` | pass | [solana-recovery-binding-typecheck.log](independent-core-evidence-2026-11-18/solana-recovery-binding-typecheck.log) |
| EVM signer `8f6a015` + new publication regressions | 2 signing test files | 27 pass / 4 fail | [signer-independent-review-red.log](independent-core-evidence-2026-11-18/signer-independent-review-red.log) |
| EVM signer `75972ee` | same files plus physical-slot test | 32/32 pass, no skips | [signer-independent-review-green.log](independent-core-evidence-2026-11-18/signer-independent-review-green.log) |
| Same | `npm run typecheck` | pass | [signer-independent-review-typecheck.log](independent-core-evidence-2026-11-18/signer-independent-review-typecheck.log) |

The only delta from `93b4bf2` to `b1dbd00` splits one source line without changing its expression. After that
formatting correction the Solana owner independently reports 250/250 full-chain tests, typecheck and import
boundaries passing. The owner also reports the SBF build, Clippy, 48 LiteSVM tests and IDL check passing. Those
native results were not re-executed by this reviewer and do not substitute for a successful actual-validator
run. The root must preserve that qualification distinction in the final handoff.

## Integration limits

1. The reviewed Solana client is not wired into the browser. This review does not establish an end-to-end
   browser trade flow or user-facing Solana wallet compatibility.
2. The reviewed core uses an injected CAS journal. A real encrypted-vault journal adapter is a separate
   follow-up being implemented by the Solana owner and is not covered by this source approval.
3. The shared `IntentV2` adapter cannot represent every native Solana lifecycle detail, including payout and
   the pre-marker signature in a lossless form. Native Solana records must remain the authority until that
   shared schema integration is completed and tested.
4. The pure settlement planner models manual fiat confirmation. A direct low-level `client.release()` call
   does not itself implement the complete browser confirmation workflow.
5. Reader and reconciliation evidence trust the injected RPC; they are not a cryptographic light client or
   independent RPC quorum. Genesis bracketing prevents the reproduced network-switch error, not a consistently
   dishonest RPC fabricating an entire chain view.
6. No mainnet action, external deployment, release publication, real-fund transfer or branch deletion was
   performed by this reviewer. Optional architectures remain preserved in the separate inventory.

## Other completed deliverables

`inventory.md` and `noncore-inventory.json` cover 37 noncore PRs from the initial 45-open-PR snapshot, with exact
base/head SHAs, changed files, dependency evidence, CI/security states and dispositions. `all-active-remote-refs.json`
accounts for all 170 initially active origin refs. Recommendations to close #38/#39/#41 are based on recorded
per-file semantic supersedence; preservation recommendations do not imply merge readiness. These are an
initial inventory snapshot, not a live assertion that later root-owned merges/closures have not occurred.
