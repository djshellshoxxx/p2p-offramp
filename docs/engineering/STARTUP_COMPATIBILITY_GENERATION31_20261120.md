# Generation 31 — connect offline startup compatibility

## Result and source

The ordinary offline application now connects the maintained startup capability
probe, initialization guard and compatibility notice. Missing or unavailable
required APIs stop service initialization and produce read-only recovery
guidance. Optional camera, sharing and clipboard availability does not block
startup. API presence remains distinct from actual runtime success, storage
durability and measured device support.

| Checkpoint | Exact identity |
| --- | --- |
| Parent G30 coordinator source | `3bfb7761b6ec430c8e437d117ec31007503f0d12` |
| Parent complete tree | `b46873509b64467338978820a6469de7fffdc619` |
| Frozen author source | `9c9b16b7e96737115f5fc61bddf8c31e277dd6f4` |
| Frozen complete tree | `9eb643f1871e2e257cfdb37e3cfe6c95e46e86bd` |
| Author branch | `codex/startup-compatibility-g31-20261120` |

Exactly two production files change: `apps/web/src/OfflineRoot.tsx` and
`apps/web/src/ui/App.tsx`. One new maintained-source composition test is added.
The existing sharing composition fixture receives only the three-line,
explicitly labeled inert probe substitution approved by the coordinator; every
existing sharing assertion remains intact.

Of the parent's 2,911 Git entries, 2,908 remain exact. Three existing entries
change and one is added, yielding 2,912 entries and 1,029 non-documentation
entries. No entry is removed. The probe, guard, compatibility model, notice,
locale catalogs, generic sharing helper and leaf, native entry branches,
runtime/storage implementations, configuration and workflows are unchanged.

The [cross-device specification](../../00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.2_cross_device/spec-responsive-mobile-wallet-and-browser-compatibility.md)
requires a local startup probe and unsupported/read-only mode when required APIs
are absent. The existing helper and notice had isolated coverage but no ordinary
application consumer. This slice adds that missing composition. It does not
claim completion of the broader cross-device or wallet-handoff specification.

## Composition and lifecycle

`OfflineRoot` captures the maintained `probeStartupCapabilities()` result in
lazy state. Subsequent renders and effect replays reuse that snapshot. Service
startup passes through `startWithRequiredApis(snapshot, () => startAppServices())`.
The existing initializer still owns actual Worker construction, persistence and
runtime checks; the presence probe cannot grant service or wallet authority.

The probe checks secure context, WebCrypto, the bounded Worker interface,
IndexedDB, encrypted file import and encrypted file export. A missing or
throwing observation makes the snapshot read-only. Optional camera/share/
clipboard absence or unavailability keeps a runtime candidate. All observations
retain `compatibilityStatus: 'untested'`, `certified: false`,
`economicActionsAllowed: false` and unverified storage access.

App receives the snapshot through an optional `startupCapabilities` prop. After
startup finishes it renders the existing notice. Missing APIs receive the
read-only explanation and named capability guidance. An actual service refusal
or thrown initializer keeps the existing fixed error mapping and receives the
distinct recovery explanation. Successful ordinary startup shows no
compatibility notice. Existing compositions that provide no snapshot retain
their prior behavior.

The original service ownership, pagehide and unmount cleanup code is preserved.
Late success from a retired startup is disposed without publishing its service.
A persisted pagehide leaves admitted startup active. The controlled effect
replay case retains one snapshot while disposing the earlier result and
accepting only the current startup result. This is not a claim of native React
or browser event execution, physical quiescence or a new exactly-once disposal
guarantee.

The selected catalog resolves notice text during rendering. Locale changes do
not re-probe APIs or restart services. G30's generic app address continues through
the offline root and App unchanged. The production main module and its native
EVM/Solana selection branches are unchanged.

## Author verification and retained failures

| Captured check | Actual result |
| --- | --- |
| Initial new composition on original production | 23 cases: 4 lifecycle controls pass / 19 missing-integration assertions fail |
| First wired composition and sharing | 32 cases: 21 pass / 11 fixture failures, attributed below |
| First fixture correction | 32 cases: 26 pass / 6 remaining VM getter-classification failures |
| Minimal VM diagnostic | Normal/self context globals report a throwing host getter as missing; a separate descriptor-preserving object reports unavailable |
| Corrected wired composition and sharing | 32/32 pass |
| Final fixture against original production | 23 cases: the same 4 controls pass / 19 missing-integration assertions fail |
| Frozen focused and adjacent selection | 77/77 pass, including all 23 new cases; zero fail/skip/cancel/todo |
| Frozen UI TypeScript | Pass |
| Frozen import boundaries | Pass: 242 production files / 155 core modules |
| Frozen build policy | 58/58 pass |
| Frozen ordinary build | Pass: 12 files / 817,257 bytes |

The first wired run contained five existing sharing-fixture failures because
the newly connected startup probe legitimately reads optional capability
properties. That fixture already controls startup services and does not execute
effects. Its approved inert probe replacement keeps the test focused on sharing
and preserves all sharing assertions. The new G31 fixture independently executes
the actual probe, guard, notice and effects; it does not use that replacement.

Six other failures came from Node's contextified global proxy converting a
throwing host global getter into an undefined property. Pointing `globalThis`
at the same context object did not resolve that behavior. The retained minimal
diagnostic establishes the distinction. The final fixture supplies a separate
browser object with preserved property descriptors, so the actual maintained
probe observes both missing and throwing/unavailable properties correctly.
Assertions and production helpers were unchanged during these fixture repairs.
Both unsuccessful wired outputs and their pre-correction patches are retained
as fixture evidence, not additional product defects.

The final 23-case fixture was also run against temporarily restored original
production bytes inside this isolated worktree. Its 4/19 result confirms the
missing integration with the corrected harness. Final production bytes were
restored before the source commit. The corrected 32-case run's complete patch
is byte-identical to the frozen source diff. Checks 07–11 ran at the clean frozen
source commit; their captured source-file hashes were verified against Git.

The new composition exercises all six required capabilities in both missing
and unavailable states, optional denials, stable snapshots, selected-catalog
updates, actual service refusals, fixed thrown errors, app-link propagation,
late completion after retirement, persisted/nonpersisted pagehide and controlled
effect replay. API operation traps assert no Worker construction, storage open,
file operation, clipboard write, native share, camera, permission query or
network call. Actual startup is a labeled controlled service port, not a native
Worker or storage execution. The draft catalog is test data, not a supported
translation.

The 77-case selection includes the new composition, existing probe/guard/notice
tests, sharing helper/composition/lifecycle tests and shell locale tests. It
overlaps the earlier 32-case selection; counts are not summed or presented as a
full-suite result. No full suite, browser journey or financial flow ran in this
author worktree.

## Ordinary artifact evidence

The default artifact has document/vault-Worker/QR graph counts **102/30/4**.
Every listed asset and all 136 graph module references were checked against
actual retained build/source bytes. The document graph includes the maintained
probe, startup guard, compatibility model and notice. The default artifact keeps
`ReleaseEnabled=0`, no configured connection origins and `connect-src 'none'`.

The emitted offline chunk is `assets/OfflineRoot-KpNTfNjc.js`, 312,712 bytes,
SHA-256 `4788669b1638bc7a7b8a93303999250708eb4a817f5cb943b10e922efc5d8f69`.
The emitted main is `assets/index-6AlRBUfF.js`, 220,890 bytes, SHA-256
`bea32e4a4ac7775b0e13e840e4b7e84fb394bb915f40ce1253f8d77ee0a23dc1`.
Both chunks, all three graphs and the build/policy evidence are retained.

The vault Worker remains the G29/G30 artifact
`assets/vault.worker-yOnLqpF_.js`, SHA-256
`d3bc5bf253cf1e30914a932e126d2d41bedc19d217d9baa94748975243c04165`.
Module graphs and emitted bytes establish this local artifact's composition;
they do not establish native reachability, durable storage or device support.

## Evidence and integration boundary

The [author receipt](../execution/startup-compatibility-generation31-20261120/receipt.json)
records exact source identities, command arguments/times, full output, complete
source patches, original command receipts, raw/compressed hashes, asset hashes
and graph membership. Compression uses deterministic gzip with `mtime=0`.
The capture runner and minimal VM diagnostic are retained as readable source.
Final source-and-evidence whitespace has a separate receipt in the same folder.

Dependencies are a physical immutable hardlink copy of the established G30
`node_modules` directory. There was no installation, dependency mutation or
cross-worktree import symlink. Author source and evidence are separate commits.

This standalone product integration is D8 Tier B. Applicable current-source/
current-target checks, independent review and the accepted **CodeRabbit or Qodo
pass with findings answered** remain required. The coordinator owns combined
qualification, publication and any eventual guarded merge. This author evidence
does not qualify a later combined source or substitute for named review.

Audit PRs184–186, optional PRs224–232 and their owners remain untouched. No
deployment, release, trust provisioning, wallet authority or default optional
feature activation follows from this change.
