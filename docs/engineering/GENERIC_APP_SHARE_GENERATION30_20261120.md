# Generation 30: generic app address sharing in Settings

This change connects the existing generic app address helper and sharing panel to the ordinary offline application. The main entry captures its own `import.meta.url` once. Its stable offline lazy wrapper passes that value to `OfflineRoot`, which derives a display-only hosting address and passes it through `App` to `Settings`. Settings mounts one existing `GenericAppShare` panel. The default `appLink` remains `null` for callers that do not supply this composition.

The helper, sharing leaf, locale copy, styles, configuration, workflows and native EVM/Solana branches are unchanged. The address comes from the actual main entry; no document route, query, fragment, profile, invitation, trade, payment or counterparty is used to derive it. Existing helper rules preserve supported deployment and IPFS gateway prefixes and return the fixed unavailable state for unsupported entry shapes. Sharing identifies a hosting location and does not authenticate the host or release.

## Source identity and scope

| Item | Exact identity |
| --- | --- |
| Baseline | `fa7c1a11ff990be4646053731f1030d09eb8f9b6` |
| Baseline tree | `dc34c0065a6bc4d66b4195b16d573ef1ec7463a5` |
| Frozen source | `a2d69851430971ce51588c22c571e48b30b4ca01` |
| Frozen source tree | `c484a9c5da4617667d9486d8c3bd4131db1ca8d6` |
| Complete baseline-to-source patch SHA-256 | `ef30ff53829f2193c472506e90e63a121975da3a2a8f9d96f5ef3b60a4dbbfc2` |

Four production files change: `apps/web/src/main.tsx`, `apps/web/src/OfflineRoot.tsx`, `apps/web/src/ui/App.tsx` and `apps/web/src/ui/Pages.tsx`. Two new maintained tests cover composition and clipboard component lifecycle. All other **2,842** baseline entries retain their exact Git mode, object type and object identity; no baseline file is removed. The baseline has 2,846 tracked entries, and the source has 2,848.

## Verification and retained failures

The [author receipt](../execution/generic-app-share-generation30-20261120/receipt.json) binds all ten original command receipts, complete outputs, pre-command source patches and artifact records to their source. Logs and patches use deterministic gzip with `mtime=0`; the receipt lists both original and compressed SHA-256 hashes. Original receipts are copied unchanged, including actual UTC start/end times and command arguments.

The additional [source-and-evidence whitespace receipt](../execution/generic-app-share-generation30-20261120/11-source-and-evidence-whitespace.json) records both the complete staged diff and the complete diff from recorded main `8e836baa877b676a863c877003e277b638fc5061`, with no path exclusions. It identifies the staged tree checked before that receipt was added. The completed evidence commit also passes the same full-diff check.

| Check | Outcome and interpretation |
| --- | --- |
| Initial baseline composition | 9 tests: 2 pass, 7 fail because sharing is absent from the maintained entry-to-Settings composition. Both native dispatch controls pass. |
| Initial existing helper/leaf plus lifecycle | 23/23 pass on unchanged baseline production source. |
| Final fixture bytes on baseline source | 33 tests: 26 pass, the same 7 missing-composition assertions fail. This exact final fixture corpus is the later frozen sharing corpus. |
| Sharing, shell locale and retention UI after wiring | 74/74 pass. |
| UI TypeScript | Pass. |
| Complete source whitespace | Pass. |
| Frozen import boundaries | Pass: 242 production source files and 151 core graph modules. |
| Frozen build policy | 58/58 pass. |
| Frozen ordinary artifact build | Pass: 12 inspected files and 812,179 bytes. |
| Frozen sharing corpus | 33/33 pass, with zero skipped, cancelled or todo cases. |

The earlier fixture snapshots are retained independently. These are product-composition assertion failures, not a harness import failure. Commands 04–06 preceded the source commit, but their retained full patches are byte-identical to the complete frozen-source diff and their recorded source/test hashes match the frozen files. Commands 07–10 ran at the clean frozen source commit with empty patches. Recovery verified the existing outputs and hashes; it did not rerun these successful checks.

The composition tests execute the maintained main entry, offline root, application shell, Settings, sharing component and helper through controlled scheduling and ports. They verify canonical nested hosting, an IPFS gateway prefix, development entry shape, unsupported-entry fallback, and preservation of both native dispatch branches. Unrelated children and startup effects are controlled; this does not qualify startup lifecycle or actual browser event delivery.

The lifecycle tests execute one shared compiled sharing module across independent mounts. They cover explicit-copy admission, simultaneous mounts, duplicate handlers, a pending physical clipboard promise across unmount/remount, owner replacement, address changes away and back, live locale changes, fixed error fallbacks, manual selection and unavailable addresses. They preserve the existing rule that UI cancellation cannot release the shared clipboard admission before the original promise settles. These controlled ports do not establish physical clipboard permission or native browser behavior.

## Ordinary emitted artifact

All 12 listed asset hashes and all 132 entries across the document, vault Worker and QR Worker module graphs were rechecked against retained output and local source/dependency bytes. The graphs contain **98 / 30 / 4** modules respectively. The emitted main and offline chunks, complete graph JSON, local build evidence and content policy are retained under the receipt's `build/` paths.

The actual emitted main is `assets/index-Bn32YCpH.js`, SHA-256 `4a54d4f63b019c44859b29f4d3d9ec2113d69ebad641a0fb40431b280d72ac9c`. Its code captures the main module's `import.meta.url` and passes that captured value as `entryModuleUrl` into the offline wrapper. This observation binds the controlled composition to an ordinary artifact whose entry shape the unchanged helper accepts; it is static artifact evidence, not browser execution.

The vault Worker remains `assets/vault.worker-yOnLqpF_.js`, SHA-256 `d3bc5bf253cf1e30914a932e126d2d41bedc19d217d9baa94748975243c04165`, matching the generation 29 ordinary artifact. `ReleaseEnabled` remains **0**. No native browser, financial flow, network/share action or deployment ran in this author task. The existing physical `node_modules` directory uses immutable hardlinked package files; no package installation or dependency mutation was performed. The recorded runtime is Node 24.22.3, npm 11.19.1 and TypeScript 7.0.2.

## Integration limits

This closes the generic hosting-address composition gap. It does not implement referral identifiers, incentives, recipient selection, native share targets or the broader growth roadmap. Existing audit ownership and frozen consolidation pull requests remain separate. The independent review and root combined qualification have their own evidence and are not claimed by this author receipt.

This standalone non-custody product change follows the accepted D8 Tier B policy: current applicable hosted checks, an independent review with no open High/Medium findings, and the named CodeRabbit-or-Qodo automated review with findings addressed are required before merge. Local author checks do not waive those gates or establish release readiness.
