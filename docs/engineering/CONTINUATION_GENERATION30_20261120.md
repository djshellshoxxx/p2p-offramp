# Generation 30 — generic app address sharing

## Result and source boundary

**The ordinary offline application now exposes its generic hosting address in
Settings through the existing sharing panel.** The actual main entry captures
its own `import.meta.url` once and passes it through a stable lazy wrapper.
`OfflineRoot` derives the address with the maintained helper; `App` forwards
the display-only value to Settings. Callers without this composition retain
the fixed unavailable state.

The combined source passed **2,581/2,581 tests**, with zero failures, skips,
cancellations or todos, and all six additional qualification commands.
Independent source and combined-source provenance reviews found no actionable
findings. Generation 30 remains a separate unpublished follow-up above the
published retention-preview PR237 at this checkpoint.

| Checkpoint | Exact identity |
| --- | --- |
| Published parent, [PR237](https://github.com/djshellshoxxx/p2p-offramp/pull/237) | `33232f62dc9cd250528ef3eb0313c0c319d99495` |
| Published parent tree | `452b08d0c279a82ea3076371723a2dbd12ef9596` |
| Combined tested source / tree | `3bfb7761b6ec430c8e437d117ec31007503f0d12` / `b46873509b64467338978820a6469de7fffdc619` |
| Intended continuation branch | `codex/generic-share-continuation-g30-20261120` |
| Author source / tree | `a2d69851430971ce51588c22c571e48b30b4ca01` / `c484a9c5da4617667d9486d8c3bd4131db1ca8d6` |
| Author evidence | `3338964189a00f7181ba8e52166c594b61a48fe7` |
| Independent source-review evidence | `6a8d0ae0d3ac01379642a8b7111d58ec23388316` |
| Independent combined-source supplement | `79da79d74504627d421dd3a54888995f4d0f299b` |
| Root qualification packaging | `6a96c1333f1153f9ff49c1c6bb234b970e57ad35` |

Exactly four production paths change: `main.tsx`, `OfflineRoot.tsx`,
`ui/App.tsx` and `ui/Pages.tsx`. Two focused test files are added. Of PR237's
1,026 non-documentation entries, 1,022 remain exact; none are removed. All
1,028 resulting entries match the reviewed author source. The combined tree
is the exact published parent plus those six entries, preserving every other
parent entry. Evidence commits are separate from the tested source; its
entries must remain exact through publication.

## Behavior and scope

The unchanged helper accepts supported main-entry shapes, preserves nested
deployment and IPFS gateway prefixes, and fails closed for unsupported shapes.
The address is never derived from the current document route, query or fragment
and contains no profile, invitation, trade, payment or counterparty identifier.
It identifies a hosting location without authenticating that host or release.

The existing `GenericAppShare` leaf remains unchanged. Users can select the
address manually or explicitly request a clipboard copy. Rendering does not
copy, navigate, invoke native sharing, probe permissions or contact a network.
Shared clipboard admission stays held until the original physical write
promise settles, including across unmount and replacement mounts; stale owners
cannot publish a completion. Locale changes resolve the current catalog without
repeating a copy. These properties use controlled hooks and promises in tests.

The helper, sharing leaf, locale catalog, styles, configuration, workflows and
native EVM/Solana dispatch branches retain their exact source. This implements
the generic ID-free sharing slice of the
[documentation-growth specification](../../00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.7_docs_growth/spec-github-wiki-documentation-and-marketability.md).
Referrals, incentives, recipient selection and the wider growth roadmap remain
separate scope.

## Evidence and qualification

The [author report](GENERIC_APP_SHARE_GENERATION30_20261120.md) and
[receipt](../execution/generic-app-share-generation30-20261120/receipt.json)
retain ten original command outputs, source snapshots and artifact records.
Initial composition had **2 pass / 7 fail** for the missing integration; both
native-dispatch controls passed. Existing helper and leaf/lifecycle tests passed
**23/23** on unchanged baseline production. The final 33-case fixture corpus
produced **26 pass / the same 7 fail** on the baseline, then **33/33** after
wiring. These are missing-composition assertions, not a fixture import failure.
The adjacent sharing, locale and retention UI selection passed **74/74**.

The [independent source review](INDEPENDENT_GENERIC_APP_SHARE_REVIEW_GENERATION30_20261120.md)
passed **48/48**: 33 maintained cases and 15 original reviewer probes, plus UI
TypeScript. It checked actual maintained entry/App/Settings forwarding,
unchanged native dispatch, private document-URL accessors, shared clipboard
admission, stale completion, cleanup/replay, locale changes and fixed fallbacks.
It verified 39 author manifest artifacts and the separate whitespace receipt.
These selections overlap the full suite and each other; do not sum their counts.

The coordinator's seven commands covered the clean frozen combined source from
**2026-11-20 18:55:40.778786 UTC** to **18:57:33.593769 UTC**.

| Qualification | Actual result |
| --- | --- |
| Full Node suite | **2,581/2,581**, zero other outcomes |
| TypeScript | All four configured projects passed |
| Build policy | **58/58** |
| Import boundaries | 242 production files / 151 core modules |
| Ordinary build | 12 files / 812,179 bytes; document/vault-Worker/QR graphs **98/30/4** |
| Demo build | 13 files / 824,278 bytes; graphs **100/30/4** |
| Native updater fixture preparation | Strict 37-module compilation reported; **build only**, `nativeExecuted=false` |

The full-suite raw output is 261,868 bytes, SHA-256
`d96d9ca33073f1ab7a249ad14da964954635f2171eb0200b57b4034053a53433`.
The [combined qualification](qualification-generation30.json) and
[retained-log index](retained-logs-generation30.json) bind exact commands,
source, times and complete outputs. Compressed evidence uses deterministic gzip
with both raw and compressed hashes.

The [independent composition supplement](GENERIC_APP_SHARE_COMPOSITION_REVIEW_GENERATION30_20261120.md)
and [receipt](generic-app-share-composition-review-generation30.json) verified
the finalized root receipt, seven logs, 25 emitted assets, six graphs and 266
source module references without repeating the suite or builds. The ordinary
artifact matches the author's inspected artifact. Its actual entry
`assets/index-Bn32YCpH.js` captures its own module URL and forwards that binding;
SHA-256 is `4a54d4f63b019c44859b29f4d3d9ec2113d69ebad641a0fb40431b280d72ac9c`.

Both builds retain the generation 29 vault Worker
`assets/vault.worker-yOnLqpF_.js`, SHA-256
`d3bc5bf253cf1e30914a932e126d2d41bedc19d217d9baa94748975243c04165`.
Only the existing sharing helper and leaf join the document graph. The native
preparation command removed its temporary fixture modules; its logged
37-module compilation digest is not an independent rehash of retained module
contents. No native scenario, browser, physical-device or operating-system
clipboard acceptance is claimed. Immutable hardlinked dependencies were reused
without package installation or dependency mutation.

## Integration and remaining gates

**PR236 remains the frozen main-target aggregate**, head
`d9ddcf53d82100f05de7346143a0ad00d43c2c1a`, containing published PR233–235.
That plan supersedes their older sequential merge/retarget plan. Preserve those
heads and branches, qualify the actual current main target, perform the
expected-head guarded merge, then read main/tree/ordered parents and prove
each original head is an ancestor before reconciling contained PRs. Generation
30 does not amend or supersede that aggregate.

PR237 is the separately published retention child targeting PR236's branch.
Its verified proposed merge is `b7fb1df14ee20c17516b776627d27fb8b8b39fe0`,
with PR237's complete tree and ordered parents PR236 head then PR237 head.
The coordinator's last recorded readbacks had all 14 PR236 checks queued and
Snyk successful at 18:52 UTC, and PR237 hosted checks pending, Snyk successful
and no named review at 18:56 UTC. These dated observations establish neither
merge qualification nor a later live status.

Publish generation 30 as its own follow-up with a source/evidence mapping and
actual head/base/proposed-merge readback. After each parent merge, retarget or
reconcile against actual main and refresh applicable qualification. Parent,
older-source and previous-target checks do not qualify the child.

This standalone product integration is **D8 Tier B**. The
[accepted index](../adr/ACCEPTED-DECISIONS-2026-11-04.md) keeps the
[detailed D8 packet](../adr/proposed/D8-merge-policy-and-branch-protection.md)
authoritative where its table is shorter. A **CodeRabbit or Qodo pass with
findings answered** remains required alongside applicable green checks and
the completed independent review. The named review and hosted acceptance
remain unclaimed here.

G31 startup compatibility wiring has fresh author/reviewer ownership and no
completion claim. Optional PR224–232 and audits184–186 retain their owners.
The default updater remains unconfigured, production trust remains unset,
connection origins remain empty and `ReleaseEnabled=0`. No deployment or
release acceptance follows from this work.

## Historical handoff preservation

New dated overlays preserve the prior files byte-for-byte as suffixes. At
documentation base `bc1d86a222b191a2edd487c2078e79e27949fa63`:

| File | Preserved bytes | SHA-256 |
| --- | ---: | --- |
| `CONSOLIDATION_HANDOFF.md` | 84,793 | `3a1ef4e28bbb17895d22653bd1ef72a79999f9832b3a6061ff546c9f8c9ec6a5` |
| `FEATURE_MATRIX.md` | 51,495 | `05d59fb32cbdc1fb87d0689123cbeca8678b97b48284ad0b4b459c81c64ecc4b` |

Older present-tense statements remain historical assessments. This dated
checkpoint and later exact-source receipts govern current coordination.
