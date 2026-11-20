# Generation 20: independent user-workflow documentation review

## Result and exact source

**No actionable finding in the frozen four-file documentation change.** This
review checks implementation correspondence and documentary integrity. It does
not provide semantic claim approval, translation approval, a release decision or
Wiki publication.

| Identity | Value |
| --- | --- |
| Base main | `388526a474aea0e08f9c04178c2b7f9e1d4bee3f` |
| Reviewed documentation source | `70372a0cd65a70e162a451cacc2b5f2d9547a578` |
| Complete reviewed tree | `b038e6954e5740234e58a643aa9d85ea379e7221` |
| Independent review branch | `codex/user-workflows-independent-review-g20-20261120` |
| Preserved PR178 donor | `4eead2af05e3e301b9e05cc9023a63047ef6dcdf` |

The reviewer used a separate worktree fast-forwarded to the immutable source,
with Node 24.22.3, Python 3.12.14 and a physical dependency copy whose lockfile
matched the source. The source has the stated base as its sole parent. Its
complete tree changes only `User-Guide.md`, `Privacy-and-Recovery.md`,
`Developer-Guide.md` and `docs-manifest.json` under `docs/wiki-source`.
All **2,572 other entries**, including all **1,009 non-documentation entries**,
retain identical modes, types and object IDs. This review receipt is a separate
documentation-only follow-up.

## Correspondence with the implementation

The review read all three completed guides and traced their new descriptions to
the pinned implementation and English catalog.

| Documented workflow | Source checked and conclusion |
| --- | --- |
| Export and selected-file authentication | `Pages.tsx`, `VaultForms.tsx`, `BackupVerificationForm.tsx`, `locale/en.ts` and `vault-service.ts`: the controls are on Recovery. Export remains unchecked. Verification uses the selected unlocked profile, file and passphrase, compares the complete authenticated snapshot and encrypted envelope, and rechecks persisted state before returning. |
| Fresh revision recheck | `worker-endpoint.ts`: the command rechecks the held fact against fresh stored state for the current selection; it does not reread the selected file or accept an imported approval receipt. The guides distinguish a point-in-time display from a fresh check. |
| Separate fresh-key restore | `backup-service.ts`, `VaultForms.tsx`, `Pages.tsx` and `App.tsx`: restore creates a new locked profile and leaves existing profiles intact. The explicit Home handoff does not switch an unlocked selection. The new profile needs its own exported file for current-profile verification. |
| Public Solana recovery JSON | `SolanaLocalnetRoot.tsx`, its controller and `packages/chain-solana/src/recovery.ts`: export selects the retained canonical public document, uses the named JSON download and existing 16 KiB limit, and adds no private wrapper, journal, signature or private agreement text. It does not refresh chain state or invoke a wallet/send. The guide confines this to the isolated localnet funded-recovery client and distinguishes its encrypted private backup. |
| Optional signed-update view | `App.tsx`, `Pages.tsx` and `SignedUpdatePanel.tsx`: the panel is on Settings, defaults to a null controller and disables checking when unconfigured. Trusted composition and the own-lock lifecycle contract remain unfinished. Prose does not supply keys, endpoints or production configuration. |
| Explicit restored EVM resumption | `LocalnetRoot.tsx` and the retained donor: the guide names the explicit recheck/resume control, retains its localnet/unfunded scope and a separate subsequent wallet review, and preserves the limitation that an old backup cannot reveal later peer behavior. |

Default, demo and localnet scopes remain separate. The guides retain
`ReleaseEnabled=0`, physical-device and independent-security limits, and the
distinction between qualified source integration and release authorization.
Current source references name the dated base; historical PR and test receipts
remain explicitly historical. No previous failure or test scope is promoted to
new execution evidence.

## Manifest and evidence preservation

The reviewer independently compared the parsed manifests and the complete Git
trees. Exactly two manifest values change:

| Field | Before | After |
| --- | --- | --- |
| Privacy-and-Recovery document SHA-256 | `6d6f20ecaaac502f3e58ab89a4f49ebb6701289185ac1c56b744aa175d63a1d6` | `bc257f0882404e5527878223db91253fcb34a84c0d8d401c8ce2c4d7de9ab097` |
| Aggregate link-report digest | `799c688f5ab3f53eb44105e237777c51eb0162619b2b9ef3bf9a30b8371feb89` | `4b22f3d4bb2a50a83c82c5bf988a9a92cdf67d2472684f61b24d7e9477b9e7d6` |

The new document digest matches the reviewed file bytes. Restoring only those
two fields makes the parsed candidate manifest deeply equal to the base. The
aggregate digest also binds links to the edited User and Developer guides.
Every source commit, reviewer list, approval, capability, last-verified-release
value and draft flag is unchanged. `claims-register.json` is byte-identical.

The preserved evidence source remains
`84814328f5534d6fceb2bbe74509fe37c5b48689`; reviewers remain empty and
`approvedRelease` remains null. Actual documentation inspection still reports
the existing `apps/web/src/ui/locale/en.ts` drift and six stale claims:
`location-scope`, `logical-removal`, `message-content`, `selected-route`,
`stealth-local` and `vault-at-rest`. Hash refresh is integrity bookkeeping and
does not repin evidence or approve current-source claims.

## Independently executed checks

| Check on source 70372a0 | Actual result |
| --- | --- |
| `node --import ./scripts/test-support/register-tsx.mjs --test scripts/docs/validate.test.mjs` | 16 passed, 0 failed, 0 skipped, 0 cancelled, 0 todos |
| `npm run check:docs` and inspection of its result | Engineering consistency true; seven manifested documents; semantic approval false, published false, approved release null; existing stale evidence retained |
| `npm run check:specs` | 173 indexed documents, 0 broken links, no unindexed documents |
| `git diff --check 388526a474aea0e08f9c04178c2b7f9e1d4bee3f HEAD` | Passed |
| Independent local-link inspection of all three guides | 28 local link occurrences resolve, including their supplied anchors |
| Immutable implementation-link inspection | 17 distinct source URLs resolve to Git blobs at the named base commit |
| Complete-tree and structural manifest comparison | Exactly four intended changed paths and the two permitted digest values |

Source URL inspection proves the named local Git objects exist; it is not an
HTTP availability check. Existing validation cases were run as maintained;
no test was weakened or added for this prose change. No native/browser,
wallet or financial journey was rerun, and no new runtime qualification is
claimed.

## PR178 recovery and handoff

The reviewer inspected the retained donor's User and Developer guide contents
and the author report at `00e57c695824dae99fe8229e564ca691a3c74a73`.
The selective reuse preserves source-versus-release distinctions, explicit
restored resumption and dated checkpoint treatment. It does not copy the donor's
old branch-status census or historical test tallies as current results. The
donor's unique Home and handoff changes remain on its preserved branch; this
slice does not claim complete branch incorporation or justify closing PR178.

The coordinator owns composition, applicable current-head checks and any remote
publication or merge. This reviewer made no remote mutation, changed no source
under review and supplied no new production or semantic authority. Other wiki
pages and external Wiki publication remain outside this bounded review.
