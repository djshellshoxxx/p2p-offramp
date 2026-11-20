# Generation 36 — proposal admission in the native browser journey

## Result and exact source

The existing hosted Solana browser driver now exercises explicit saving of a
seller proposal for its already-defined absent escrow. It checks the complete
encrypted private record and retains that exact proposal through the existing
fresh-key restore and real idle-lock journey. The local companion checks pass;
**the native browser driver has not been executed locally**.

| Checkpoint | Identity |
| --- | --- |
| Reviewed admission implementation, direct parent | `3283940bae1a2d4e7baabed66878ecb5d977bfb1` |
| Admission parent tree | `df931285bd7e1818db6736ba968930375bd6cb68` |
| Companion source | `d36be3c5348b94d39836b73a3e0b9e864ff0a669` |
| Companion source tree | `559034449fe590f42cbd11adaad8b4b850ec818b` |
| Earlier G35 source and preservation baseline | `ea3ee7f5b5d36456616bd9fef893257327560a10` |
| Full whitespace baseline, main | `8e836baa877b676a863c877003e277b638fc5061` |

The author commit was fast-forwarded through `git cherry-pick --ff` from its
exact parent before final companion verification. Its original commit identity
is retained. The companion changes exactly four paths: the native browser
driver, its browser fixture, the private-record evidence helper, and one new
focused helper test. The combined source has **1,038 entries outside
documentation**. No application, controller, protocol, registry, program or
wallet implementation is changed by this companion.

## Hosted journey additions

The driver constructs the public proposal from `chain.documents.absent.terms`
and the fixed G35 public format. It uses the actual `Funding proposal JSON`
textarea, `Save seller funding proposal` button and `data-proposal-id` inventory
entry. The existing absent-escrow recovery import attempt remains before this
step and must still refuse admission as funded recovery.

After the proposal card appears and the command completes, the fixture opens
the actual encrypted IndexedDB row. The new assertions check:

- Every canonical term, the entire binding, seller role and original profile.
- Registry, program-data and artifact digests, native asset ID, RPC URL and
  margins against the fixture's independently installed configuration.
- Exactly one revision increment, an unchanged native intent inventory, and
  no wallet connection, signing prompt or physical transaction send.
- The terms hash and encoded private payload are absent from the encrypted
  envelope's plaintext representation.
- The saved proposal has its own inventory card and has not become a funded
  recovery card.

The existing backup and restore sequence additionally checks immediate proposal
redaction on lock, clearing of submitted proposal text, exact wrapper/payload
and original-provenance preservation under the new profile, and the absence of
automatic promotion to funded recovery. The later real idle lock and explicit
unlock check the same retained proposal again. These assertions will execute
only when the hosted native journey runs on the combined source.

All **190 original driver lines remain in their original order**, with 34 lines
added. The original financial assertions, amounts, signature/send counts,
timeouts, release/rebuild/refund/payout sequence and actual chain-time waits
remain intact. Both the chain setup fixture and native financial driver are
byte-identical to the baseline. No new funding, validator setup or financial
wait is introduced.

## Strict proposal-aware evidence reader

The existing synchronous `readSolanaVaultRecords` oracle only recognizes native
intent journals and funded recovery documents. Using it unchanged on the new
mixed record inventory would reject a valid saved proposal.

The new asynchronous `readSolanaBrowserVaultRecords` wrapper recognizes only the
exact G35 proposal-record format and validates each such record through the
maintained `decodeSolanaFundingProposalRecord`. Its detached wrapper preserves
the original payload. Only fully validated proposal records leave the input
passed to the original oracle. All remaining records reach the same strict
journal/recovery path; unknown formats and malformed records still refuse.

The bodies of both `readSolanaVaultRecords` and `assertSolanaSendMarked` are
**byte-identical** to the baseline. Existing callers keep their synchronous
behavior. The browser fixture changes only its helper import and the awaited
reader call. Its wallet and pre-send proof remain unchanged, including the
assertion that browser transactions are release, refund or payout actions.

## Local verification and retained failures

| Execution | Actual result |
| --- | --- |
| Initial helper baseline | 4/7 reported passing, 3 failures; three negative cases incorrectly caught the missing-helper assertion. |
| Corrected explicit missing-helper baseline | 1 legacy control passed; 6 intended missing-helper failures. |
| First helper implementation on G35 | 8/8: seven new helper cases plus the maintained physical-send proof. |
| Final selection on the combined admission/companion tree | **8/8**, zero failures, skips, cancellations or todos. |
| Node syntax checks | All four changed JavaScript files passed; no module evaluation. |
| Original-source and UI-selector checks | Passed; old financial code retained and selectors present in the actual frozen admission source. |
| Full main-baseline whitespace | Passed before and after source commit, without exclusions. |

The initial negative tests treated any rejection as expected, so an absent
helper assertion could satisfy them. The corrected tests require the helper to
exist before entering their rejection assertions. Both full baseline outputs
and exact source snapshots remain retained. This strengthens the fixture and
does not relax production validation.

The new helper cases cover mixed proposal/recovery/journal records, full
proposal ID and binding validation, malformed wrapper and provenance refusal,
strict JSON and byte limits, preservation of original profile data, and unchanged
wallet/send/network/clock/random counters during inspection. The adjacent
physical-send test uses actual message/signature parsing with controlled native
ports. These are Node checks, not physical-wallet or chain-finality evidence.

The final eight-case command ran from **2026-11-20 20:36:53.358361 to
20:36:54.278359 UTC** on an uncommitted tree identical to the later frozen source
tree. The complete 1,000-byte output has SHA-256
`4b3e2a1c31d9191277571f78307dfe9504a021e9c28f421e9d1249da45757c5a`.
The earlier eight-case command retains its separate G35-base attribution.

## Compilation scope

Build-only Rolldown **1.2.15** compilation of the complete Node driver followed
**70 repository modules** and emitted **three chunks totaling 417,221 raw
bytes**, with zero warnings. Node builtins and bare package imports remain
external. Input module hashes match the frozen Git source and actual files.
All three generated chunks are retained with raw/compressed hashes and zero
gzip timestamps.

**Generated output was never evaluated.** This compilation verifies internal
module linkage and syntax; it is not a configured browser artifact build,
browser launch, validator run or financial execution. The coordinator owns
combined repository qualification and actual current-source/current-target
hosted acceptance.

## Evidence and limits

The [receipt](../execution/solana-funding-admission-browser-generation36-20261120/receipt.json)
retains all nine execution receipts, complete logs, binary patches, compilation
outputs and helper sources. The
[snapshot verification](../execution/solana-funding-admission-browser-generation36-20261120/execution-snapshot-verification.json)
reconstructs all nine exact execution trees. All **39 retained artifacts** have
separate raw/compressed SHA-256 identities and zero gzip timestamps.

The earlier source verifier is reconstructed exactly by reversing the later
additive UI-selector check; both versions and their execution mapping are
retained without rerunning either check. Read-only setup path/glob diagnostics
are separately labeled recovered summaries, not original validation logs. They
did not alter source or test outcomes.

No browser, validator, native financial flow, remote action, dependency install,
production trust, deployment, release or optional activation was performed.
`ReleaseEnabled=0`. This companion does not establish seller funding authority,
peer acceptance, native execution or merge authorization.
