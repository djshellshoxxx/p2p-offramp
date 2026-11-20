# Generation 20 — user workflow documentation

Recorded November 20, 2026 at 16:09:59 UTC. This is an author report for a bounded
F25 documentation slice, not independent review, semantic approval or publication.

## Immutable source

| Identity | Value |
| --- | --- |
| Base main | `388526a474aea0e08f9c04178c2b7f9e1d4bee3f` |
| Documentation source commit | `70372a0cd65a70e162a451cacc2b5f2d9547a578` |
| Complete source tree | `b038e6954e5740234e58a643aa9d85ea379e7221` |
| Source branch | `codex/user-workflows-docs-g20-20261120` |
| Base-to-source binary diff SHA-256 | `3763e0f823e5cca36d96da8aa65001201caf1debcb6a5edbf50fddf9794f51a4` |

The frozen source changes exactly four files: `User-Guide.md`,
`Privacy-and-Recovery.md`, `Developer-Guide.md` and `docs-manifest.json` under
`docs/wiki-source`. This report is a separate follow-up commit.

## Documented behavior

The [user guide](../wiki-source/User-Guide.md) now distinguishes default, demo,
EVM localnet and Solana localnet scope. It explains the actual Recovery controls
for unchecked export, authentication of a selected file with its passphrase,
fresh revision recheck and separate fresh-key restore. The restored profile
requires its own exported file and verification. It also identifies the explicit
localnet EVM resumption action and its separate subsequent wallet review.

[Privacy and Recovery](../wiki-source/Privacy-and-Recovery.md) explains receipt
scope, selection/runtime invalidation, checksum limits and old-backup uncertainty.
It separates public Solana recovery JSON from the encrypted private profile and
journal backup. The public export neither refreshes chain state nor invokes a
wallet or send. Both pages describe the optional signed-update view as
unconfigured by default.

The [developer guide](../wiki-source/Developer-Guide.md) maps these workflows to
immutable implementation links, preserves historical D9 receipts as historical,
and separates authorized source consolidation from release qualification. No
production trust configuration, physical-device acceptance or signed-update
composition completion is asserted.

## Selective use of retained PR178

Inspected [PR178 head `4eead2af05e3e301b9e05cc9023a63047ef6dcdf`](https://github.com/djshellshoxxx/p2p-offramp/commit/4eead2af05e3e301b9e05cc9023a63047ef6dcdf),
including its merge-base delta and final documentary commit. Its branch remains
preserved. No merge or whole-branch incorporation is claimed.

| Donor content | Treatment in this source |
| --- | --- |
| User Guide: current versus historical source checkpoint | Rewritten for the explicitly observed merged main base; older reconciliation remains linked with its historical scope |
| User Guide: explicit same-terms unfunded resumption, fresh wallet review and limits of post-backup peer knowledge | Retained as a scoped EVM localnet paragraph after checking the current `LocalnetRoot.tsx` label and controller |
| Developer Guide: CI qualifies only exercised marker/provenance scenarios | Reused as the scope of existing checks; historical D9 source and workflow URLs remain intact |
| Developer Guide: source integration and release use separate gates | Retained with the existing D8 policy link and applicable current-head checks; no new owner approval or release authority |
| Old `bf71ca1` checkpoint, PR173/175/176/179 status census and historical test tallies | Not copied as current status; the existing generation 17 consolidation report supplies its own immutable qualification record |
| Home and the two handoff pages changed by PR178 | Not imported in this three-page slice; their unique historical work remains on the retained branch |

## Integrity bookkeeping

The manifest change updates only the Privacy-and-Recovery document SHA-256 and
`linkReportDigest`. The latter also accounts for local links to the edited User
and Developer guides. Every source commit, reviewer, approval, capability,
`lastVerifiedRelease`, draft flag and other manifest field remains identical to
the base. `claims-register.json` is byte-for-byte unchanged.

The preserved claim/evidence source is
`84814328f5534d6fceb2bbe74509fe37c5b48689`. Referencing current implementation in
prose does not repin that evidence or approve a newer source. The existing
`en.ts` drift and six stale claim rows remain visible. Digest refresh is document
integrity bookkeeping, not semantic or current-source claim approval.

## Executed focused checks

Commands ran against the documentation bytes frozen in the source commit above.
Environment: Node 24.22.3, Python 3.12.14, physical copied pinned dependencies.

| Check | Actual result |
| --- | --- |
| `npm run check:docs` | Passed; seven manifested documents, 182 links; engineering consistency true, semantic approval false, published false, approved release null |
| `npm run check:specs` | Passed; 173 indexed documents, zero broken links or unindexed documents |
| `git diff --check` | Passed |
| Focused local/source-link inspection | 28 local page links resolve; 17 unique immutable source URLs resolve to blobs in the named commit |
| UI-label inspection | 22 described controls match current English/localnet source labels |
| Manifest/claim comparison | Only the permitted document/link hashes changed; claim register unchanged |

The documentation validator still reports six stale claims: `location-scope`,
`logical-removal`, `message-content`, `selected-route`, `stealth-local` and
`vault-at-rest`. Source/link inspection is not browser execution or semantic
review. No native, wallet, browser or financial journey was rerun for this prose.

| Retained author log | SHA-256 |
| --- | --- |
| `/tmp/p2p-user-docs-g20-check-docs.log` | `54e9711358b58e04fb8c79a4fc32fbdcea71cacbd36bc03c8ee4ea059e580526` |
| `/tmp/p2p-user-docs-g20-check-specs.log` | `b305f0a204383fe73916bbac32780e5535a13a68c69d054961c190672fed098f` |

## Remaining scope

F25 is not declared complete. Other wiki pages, external Wiki publication and
semantic/translation acceptance remain separately scoped. Existing source,
fixture, failed-run and claim-evidence records retain their original identities.
No runtime, workflow, dependency, policy, trust root, release flag or remote ref
changed in this worker's task. Independent source review and any publication or
source integration belong to the coordinator.
