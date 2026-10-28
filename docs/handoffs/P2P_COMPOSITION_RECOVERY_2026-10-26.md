# P2P diagnostic recovery/reservation verification — C05/C06

2026-10-26 UTC. Same selected executor recovered after an earlier tool response said no usable execution environment. A normal read then succeeded: clean base **4bc005bf3f1b7784e2e153a0d06a40ca08e89a00**, no matching test process, previous terminal exit files intact. No uncertain test was restarted, environment replaced or denied endpoint retried. No GhostPay files changed.

## Exact source and scope

Only `packages/domain/test/trade-composition.test.mjs` changed outside documentation/evidence. Runtime `packages/domain/src/trade-composition.ts` stayed byte-identical to the preserved implementation **fa4e1f4ddd1fef95befb7ab7b6bb72b3ad22ba6a**: SHA-256 **294fa9c249fc56cc68e7ff317a8c90ecf5d73b41e4cea3b1967052be21b75ddd**. New test SHA-256 **93336a62213bf6d0b71ee2c25a0ab7a1899c66d14ec47ec39fbd94ce01daff05**. Final test/source commit follows in the private delivery receipt. Detailed source hashes, timestamps, commands, terminal exits and exact compressed/raw log hashes are in `docs/evidence/P2P_COMPOSITION_RECOVERY_20261026.json` and `docs/evidence/p2p-composition-recovery-20261026/`.

**No new RED or runtime fix:** all five new invariant tests passed the existing implementation on their first run. This is executed evidence for previously untested cross-module behavior, not new runtime functionality, a discovered defect, provider approval or broader release acceptance. Earlier missing-factory/cancellation RED/GREEN evidence remains in its original files and private artifact versions.

## Five added cases and observed behavior

| Case | Setup with actual existing services | Observed invariant |
|---|---|---|
| Prepared intent across service restart | Persist through real encrypted vault/journal; dispose the old services; create a new vault service over the same retained Store; unlock the same profile; create fresh journal/authority/composition. | ID reappears while chain authority starts loading/null. Competing approve intent refuses CONFLICT. Encrypted envelope and write count unchanged by diagnostic/rejected operations. |
| Uncertain committed marker across restart | Commit broadcast-unknown, then separately inject lock+cancel or throw a lost-reply exception after durable CAS; reopen services. | Both report BROADCAST_UNKNOWN with reconcile action and retryable=false; recovered ID/state remain reserved. Repeated markSending and new fund intent refuse CONFLICT without another write. No rollback assertion. |
| Serialized terminal labels and wall-clock age | Seed explicitly untrusted confirmed/finalized/failed/expired/replaced/reorged labels through encrypted G02 records; use a large valid display clock. | Every ID remains unresolved; new reserve refuses. No imported status or age clears a reservation, no new plaintext writer, no store mutation during reads. These records are hostile/import fixtures, not successful native reconciliation. |
| Terminal native observation alongside unknown intent | Native-reader fixture returns released or refunded; journal still has an unreconciled broadcast-unknown intent. | Terminal chain view stays separate from unresolved intent IDs; new reserve refuses, encrypted bytes unchanged, economicPreparationAllowed=false. No fabricated association between terminal trade state and a transaction. |
| Reorg and subsequent agreeing observation | Funded observation, same-height conflicting anchor/absent observation, then another consistent observation using existing authority reconciliation. | G08 first returns INTEGRITY_FAILURE/reorged and retains prior observed chain; later agrees to fresh absent. Same intent ID remains reserved throughout, duplicate marker refuses, no journal rewrite or spending permission. |

The test-only Store adds an afterCommit hook to reproduce a durable write followed by lost reply/lock; it does not replace production storage. Service restart here retains the in-memory encrypted Store and uses the actual vault/journal; **it is not a browser-process kill, native IndexedDB persistence, two-tab or fresh-profile backup acceptance test**. Reader injection supplies synthetic observations only. No second state engine, new policy, terms hash/chain timestamp, trust root, dependency, clear/retry pathway or wallet/send code was added.

## Commands actually executed on frozen hashes

- `node --test packages/domain/test/trade-composition.test.mjs`: **13 passed, 0 failed/skipped**, first run including the five new cases.
- `npm test`: **354 passed, 0 failed/skipped**.
- `npm run check:boundaries`: exit0, 44 production source files, 18 core graph modules; static inspection only.
- `npm run test:build-policy`: **5 passed, 0 failed/skipped**.
- `npm run build`: exit0; includes all four existing strict typecheck commands and Vite static build. Helper remains outside emitted document/Worker graphs; ReleaseEnabled=0 and connectOrigins=[] verified.

Each command has its own durable log and atomically recorded terminal exit; source/test hashes stayed frozen during checks. Exact original logs are losslessly gzip-compressed, with raw hashes and decompression equality verified; no failure history or whitespace gate was discarded/relaxed. Node24.19.0/npm11.9.0 are the installed tools. No install, external compiler/Foundry execution/download, CI, source push, merge, deployment, paid call, credentials or security-setting change. Browser/Python/spec checks were not repeated for this test-only slice; earlier results are not relabelled current execution. No deadline, KDF/resource cost or safety threshold changed.

Follow-up C04 independent-session revision races are now exercised in [revision verification](P2P_COMPOSITION_REVISION_2026-10-26.md); that later report records its own source/counts and limits. The next-case wording below belongs to this earlier C05/C06 snapshot.

## Remaining work and smallest ready slice

This adds evidence for packet C05/C06, not complete acceptance of their browser/native requirements or the entire ten-family packet. Native anchor-bound time and terms→preparedRequest→trade association remain missing, as do trusted G12 hash/observe/reconcile lifecycle and actual wallet/escrow/offer/trade UI/two-party flow. Keep the app client-side/noncustodial, wallet/identity test-only and all preserved deferred modules intact. G11/G15 trust/deployment decisions, qualified custody tools, provider/independent review and wallet/device/live-funds acceptance remain separate gates.

Next independently ready bounded fixture slice: C04, hold a diagnostic journal read while a separately unlocked vault/session changes the persisted revision, then release it; assert error/late completion cannot publish empty-unresolved success, remove reservation IDs or enable retries. Use existing CAS/lease/generation contracts and actual services, no new reconciliation policy. First execute the new case; change runtime only for a demonstrated defect.

Coordinator alone owns this slice and handoffs; no workers launched. Existing GhostPay recovery/EVM files remain reserved at3bb55f683b1ba2a0a6a1da05e19ddf7b2d2c330a. Preserve exact local refs; current local commits are not assumed available in a remote clone. Guarded private update target is the same composition Library item **libfile_b5734354657c81919d25ed4930348dc9**, last confirmed version1; preserve prior0/1 versions and input-denial boundaries. Canonical queue libfile_6351165742388191b28bd157407cf0a6/V55 remains untouched. Producer success is not consumer retrieval proof; receipt follows only after actual successful update.
