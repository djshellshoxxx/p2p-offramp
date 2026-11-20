# Generation 23 — current runtime and updater composition qualification

## Result and source

The maintained configured updater now has a focused Node qualification using
the actual generation22 runtime backup-selection lease. **The first execution
passed all 12 cases without changing production source.** The adjacent maintained
selection passed **68/68**. Both executions had zero failures, skips,
cancellations or todos. There is no fabricated RED run or new product-defect
claim.

| Checkpoint | Exact identity |
| --- | --- |
| Generation22 implementation base | `44b0caef274e52632b509a23c7f1b7c9410c0568` |
| Frozen test source | `2732f5b136987c27639db23f1c7943a278e3fa56` |
| Frozen complete tree | `5a1f2969c06db1dba47a1a55d1332a099466edef` |
| Branch | `codex/update-runtime-composition-g23-20261120` |

The source commit adds only
[update-runtime-composition.test.mjs](../../apps/web/test/update-runtime-composition.test.mjs).
All **2,652 existing base entries** retain their exact modes, types and object
IDs. This report, the [machine receipt](update-runtime-composition-generation23.json)
and compressed execution logs are a separate documentation follow-up.

## The integration gap qualified

The [G15 policy](../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.3_release_distribution/spec-ipfs-origin-and-update-policy.md)
requires current backup verification and an explicit locked/disconnected update
transition. The maintained controller performs two fresh checks on opposite
sides of the accepted-floor write, then disconnects and awaits its selection's
own lock before invoking the verified destination.

Earlier controller tests supplied a selected/backup flag and a lock stub. The
generation22 lease tests exercised the real runtime and vault separately. This
new selection composes those maintained implementations together. The facade's
existing return shape directly satisfies the controller contract:

```ts
backup: { capture: services.captureBackupSelection }
```

No production adapter is needed. The new file does not approximate ownership
with `selectionScope()`, accept an imported receipt or replace backup checking
with a boolean.

## Actual components and explicit fixture ports

The tests execute maintained `AppServices`, `AppRuntime`,
`createVaultWorkerEndpoint`, `EncryptedVaultService`, `EncryptedBackupService`,
`AssetUpdateController`, `SessionTransportPolicy`, and complete release/locator
signature verification. They reuse the existing synthetic encrypted-profile and
signed release fixtures. The port holds and later delivers actual endpoint
responses; it does not manufacture successful lock or verification results.

Vault persistence is a controlled in-memory store. Accepted-release state,
wallet ownership/disconnection, gesture ownership, source grants and HTTP bytes,
and the destination observer are also controlled fixture ports. A global fetch
guard asserts zero external fetch calls in every case. The injected fetch
supplies only exact local signed-fixture bytes.

The tests qualify composition in Node. They do **not** establish native Worker
delivery, native IndexedDB durability, trusted browser activation, physical
wallet quiescence, storage isolation across origins or actual navigation. Floor
retention means the record remains in the controlled accepted-store port; it is
not a new native durability result.

## Covered behavior

| Cases | Observed contract |
| --- | --- |
| Locked selection, export only, failed verification — 3 | Acceptance returns `BACKUP_REQUIRED` before a floor write, disconnect, owned lock or destination observation. Export does not establish proof. |
| Current verified backup — 1 | Exact event order includes two actual Worker checks, floor write, disconnect, matching lock acknowledgment and one destination observation. Vault ciphertext stays unchanged; the consumed candidate cannot repeat acceptance. |
| Normal persisted-vault mutation — 1 | A real saved-review operation advances the encrypted vault revision between checks. The second check refuses, the recorded accepted floor remains, and no disconnect, owned lock or destination follows. |
| Admitted pending unlock/create — 2 | An opening admitted after the first check retires the captured selection before its held reply. Releasing that reply cannot resume acceptance. |
| Held own-lock acknowledgment — 1 | Public locked state alone does not complete acceptance. Destination observation waits for the actual matching acknowledgment. |
| Competing lock — 1 | A second normal lock retires the first transition. The first acknowledgment delivered later cannot cause destination observation; the recorded floor remains. |
| Opening immediately after acknowledgment — 1 | The real lock acknowledgment is delivered before the next opening is admitted, and that opening retires the old continuation. An operation refused `BUSY` is not mislabeled as an admitted selection. |
| Cancellation during held own lock — 1 | The logical result is `CANCELLED`; the floor remains and new checks remain `BUSY` until actual lock-call drain. The controlled wallet lease releases after drain, with no destination observation. |
| Cancellation during first fresh check — 1 | Its later valid response cannot write a floor or invoke a destination. The existing runtime abort path sends its protective lock. |

The existing error mapping is retained: backup-check refusals become
`BACKUP_REQUIRED`; a runtime boundary rejection from `selection.lock()` becomes
the controller's fixed `UNAVAILABLE`. These tests do not assign a different
meaning or modify production classification.

## Executed checks and retained evidence

| Execution on exact frozen source | Result | Exact retained output |
| --- | --- | --- |
| New composition suite, first invocation | 12/12 | [baseline.log.gz](../execution/update-runtime-composition-generation23-20261120/baseline.log.gz) |
| New composition, runtime lease, backup runtime and maintained updater selections | 68/68 | [adjacent.log.gz](../execution/update-runtime-composition-generation23-20261120/adjacent.log.gz) |
| Complete base-to-source whitespace check | Passed | [whitespace.log.gz](../execution/update-runtime-composition-generation23-20261120/whitespace.log.gz) |

The 12 dedicated cases are included in the 68-case selection; the counts are
not added. The machine receipt records exact commands, source/tree, timestamps,
counts, log lengths and decoded/compressed SHA-256 hashes. Gzip decompression
was checked byte-for-byte against each original output.

Only an MJS test was added. No TypeScript project, production source or build
configuration changed, so this test-only slice did not repeat generation22's
type/build qualification. It ran no full repository suite, browser or native
financial journey. It changed no workflow, dependency, protocol, release setting
or default application composition. `ReleaseEnabled=0` remains the configured
scope, and no production trust, endpoint or updater was activated.

This is author qualification. Final composed-source review and applicable hosted
gates remain with the coordinator. Full configured updating still requires its
trusted owner/wallet/source composition and separate native/browser evidence.
