# Generation 36 — explicit local Solana proposal admission

## Result and exact source

The local Solana profile can now explicitly save a seller proposal and display its immutable terms from the encrypted private inventory. Saving performs one vault CAS and no chain read, wallet request, intent preparation or transaction. Existing funded-recovery import and exit-only review commands retain their authority boundaries.

| Checkpoint | Identity |
| --- | --- |
| Source | `3283940bae1a2d4e7baabed66878ecb5d977bfb1` |
| Complete source tree | `df931285bd7e1818db6736ba968930375bd6cb68` |
| Parent, qualified G35 component above actual PR241 | `ea3ee7f5b5d36456616bd9fef893257327560a10` |
| Complete whitespace baseline | `8e836baa877b676a863c877003e277b638fc5061` |

Eight paths change: five production files in the local-Solana profile, two new focused test files and one existing synthetic UI snapshot fixture. There are no new production modules or package exports. All 1,037 entries outside documentation are frozen, including the two existing Gitlinks. Six existing entries change, two are added and none is deleted.

## Admission and private inventory

The sole new command is `funding.proposal.import` with exactly one text field. The document-side transport bound is 4,096 characters; the maintained G35 codec enforces the authoritative 4,096-byte UTF-8/public-format bound and all canonical G16 terms. It derives the full binding from independently installed configuration. Parsing historical or non-core terms remains a data operation; G34's shared funding planner still owns later economic eligibility.

The controller retains proposal records separately from funded recovery trades, keyed by the private record ID. It compares full chain/network/deployment/trade binding tuples across both families. An exact duplicate compares the complete canonical document and returns the original record without a write, preserving its payload, original profile and historical configuration even after restore or a configuration change. A retained funded recovery blocks a new proposal for that binding. An unexpected occupied record ID of any kind or unknown family cannot be overwritten.

A new proposal must obtain a genuine bound trade from the installed native client. The controller compares actual escrow addresses within the genesis scope and canonical genesis/program/seller/nonce reservations, so changed terms or registry IDs cannot create an independent proposal at the same retained escrow. The eight-binding quota counts the union of both families; a paired proposal and recovery consume one slot. Quota applies to new bindings, not authenticated profile loading. Mixed-version overflow remains readable and existing funded recovery export, reconciliation and exits remain available.

A finalized recovery document can still be imported under the existing chain checks when capacity permits, even if an unfunded proposal conflicts with that escrow. The proposal remains visible with a conflict flag. A saved proposal never takes precedence over observed funded custody. Explicit recovery import keeps its original current-profile provenance semantics; automatic proposal promotion is outside this slice.

Activation decodes into staged maps with epoch checks after asynchronous work, then installs the complete inventory. Historical proposal configuration mismatches remain readable without installing their registry, endpoint or margins. A compatible but currently unsupported binding also remains readable. Collision groups and distinct-binding counts use linear passes, bounded by the existing vault record and snapshot limits. Proposal loading does not recover or reconcile native intents; the unchanged funded-trade refresh handles its own existing records.

## Ownership and presentation

New saves retain the existing session lease, epoch, abort and revision/CAS guards. Hashing, the occupied-ID read and durable commit are followed by ownership checks. Lock, wallet change, idle expiry and stale storage prevent a pending admission from committing late; a later lock cannot undo a write already completed atomically. Import does not call the funded-trade refresh.

The document client's blank snapshot immediately redacts proposals and capacity when the profile changes. A wallet-only change retains visible proposal data without wallet or review authority. The maintained form reserves the existing single request slot, clears submitted input, clears unsent private input on profile change and suppresses late results. Existing recovery controls and selectors are preserved.

The page is titled **Local Solana proposals and recovery**. The explicit **Funding proposal JSON** input and **Save seller funding proposal** button produce a separate list keyed by `data-proposal-id`. Each card displays all fifteen fixed terms, binding identity, derived escrow when available, and accurate restore/configuration/conflict/recovery-reference status. It says that peer acceptance has not been established and saving does not prepare or send a transaction. There is no proposal wallet-connect, funding, export, edit, delete or confirmation control.

## Verification and retained baseline

| Check | Actual result |
| --- | --- |
| Missing-admission baseline | 26/26 fail at the missing command or missing proposal-inventory assertion; later behavioral assertions are not claimed to execute on this baseline |
| First controller implementation | 26/26 pass |
| Maintained TSX, actual document-client and adjacent recovery UI selection | 20/20 pass |
| Final scoped controller/codec/wallet/restore/withheld-send/UI regression selection | **153/153**, zero failures, cancellations, skips or todos |
| Maintained TypeScript projects | All four pass |
| Static import boundaries | **244 production source files / 157 core graph modules**; static reachability is not runtime bundle activation |
| Full main-baseline whitespace | Passes without exclusions |

The final scope adds five further controller cases beyond the baseline, yielding 31 new controller cases and nine new UI/client cases. The 153-case selection also includes existing G35 codec, funded recovery, withheld-send, wallet, public export and restore-lifecycle tests. Earlier selections overlap and are not added to that total. There was no implementation failure or weakened assertion after the expected missing-feature baseline.

The tests exercise actual encrypted vault/backup services with an in-memory CAS store and scripted native ports. They cover one-write/zero-RPC saves; restore and original payload preservation; duplicate admission at capacity; full-binding/escrow conflicts and occupied IDs; paired-record quota and mixed-version overflow; historical mismatch/unsupported records; malformed byte-bounded input; and held hashing/write interruptions. A controlled hash-collision probe checks that matching identity alone never bypasses the full canonical-document comparison.

The UI tests execute the maintained TSX with controlled render hooks and a client fixture. Separate tests execute the actual document client with controlled Worker delivery. They establish local ownership and redaction behavior, not DOM, IndexedDB, physical-wallet or browser acceptance. No native validator or financial flow was executed.

All seven commands ran on exact captured uncommitted execution trees. The final regression, TypeScript, boundary and whitespace execution tree is identical to the subsequently frozen source tree; those runs are not described as executions of a commit that did not yet exist. Every full original output, original receipt and complete binary source patch is retained. Seven execution snapshots are independently reconstructed through temporary Git indexes. Compressed artifacts use deterministic gzip timestamps and both raw and compressed hashes. Original npm configuration warnings remain in the logs.

## Next composition boundary

The independent reviewer and native browser-driver companion receive the frozen source separately. The companion owns the existing absent-escrow UI admission and encrypted-record/restore acceptance additions; none of its source or execution is claimed here. Root owns the combined seven-command qualification and eventual browser-funding candidate above frozen PR241. No standalone inactive G35 PR or completed hosted acceptance is implied.

Future explicit seller wallet connection, original bound/prepared-handle/session/epoch ownership, funding preparation/confirmation and finalized-only recovery materialization remain separate. Historical journal/restore authority, native programs, trust configuration and release settings are unchanged. There is no deployment, optional activation or bilateral-acceptance claim. `ReleaseEnabled=0`.

- [Machine-readable source and execution receipt](../execution/solana-funding-admission-generation36-20261120/receipt.json)
- [Exact execution snapshot reconstruction](../execution/solana-funding-admission-generation36-20261120/execution-snapshot-verification.json)
