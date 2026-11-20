# Generation 21: live locale selection in the app shell

## Result and source

The app shell now keeps command state and fixed error codes independently of
display text. Pending and completed notices resolve through the selected catalog
at render time. Navigation labels also read the catalog at render time, and the
Lock control uses the pending command kind when deciding whether to disable.

| Checkpoint | Exact identity |
| --- | --- |
| Base main | `388526a474aea0e08f9c04178c2b7f9e1d4bee3f` |
| Regression-only commit | `798d2f0b5ab24564e4da2f1811843d9f3a5778db` |
| Frozen implementation | `6be8acc9f45f5b9036989b380ca537084094faa4` |
| Implementation tree | `3aabb59c3d4cd8b73f2ff253555c068997a4bb20` |

Exactly two paths differ from the base: `apps/web/src/ui/App.tsx` and the new
`apps/web/test/app-shell-locale.test.mjs`. All 2,575 other base tree entries retain
their modes, types and object IDs. This report and its JSON receipt are separate
documentation after the frozen implementation.

## Reproduced behavior and correction

The previous shell resolved its four navigation labels at module evaluation,
stored the rendered pending/error strings, and compared pending text with the
currently translated `locking` string. An explicit language selection could
leave the navigation and notices in the previous language while making the Lock
button appear available during an existing lock operation. The existing lock
ref still prevented a second service call; no duplicate operation is claimed.

The source change stores `lock` or `status` as a typed command kind and stores
only a `RuntimeErrorCode` for a completed refusal. Render-time catalog reads
produce the visible text. The command sequence, lock ref, request ordering,
mounted checks, route transitions, focus behavior and service calls remain as
before. The four navigation route keys supply both their existing hash targets
and their render-time message keys.

The regression fixture uses the maintained locale runtime, message views and
fixed error mapper with an explicitly compiled draft RTL catalog. Its text is
English with a marker, not a translation. It executes the maintained App TSX
handlers with dependency-aware hooks and controlled ordinary service replies;
child screens are inert render nodes. This is focused shell qualification,
not DOM, native Worker or browser qualification.

## Actual verification

On the regression-only commit, the ten cases produced **3 passes and 7 failures**,
with zero skips or cancellations. Failures directly showed old navigation
labels, old pending/error text and the Lock disabled-state mismatch after
selection. The preserved passing cases covered a completion after selection,
route focus and unmount/duplicate-event behavior.

On the frozen implementation:

| Executed check | Result |
| --- | --- |
| Nine focused shell, locale, routing and navigation suites | 62 passed, 0 failed, 0 skipped, 0 cancelled |
| New shell cases included in that selection | All 10 passed |
| Four TypeScript projects | Passed |
| Build-policy suite | 58 passed, 0 failed, 0 skipped, 0 cancelled |
| Import boundaries | 241 production sources; 148 core entry modules |
| Default static build | 12 files; 794,260 bytes |
| Whitespace check | Passed |

The tests verify that explicit locale selection does not issue another command,
that an existing Lock remains disabled, that Lock can still preempt a status
refresh, and that the older completion cannot replace the newer pending state.
They also cover fixed error mapping, returning to English, unchanged route
targets, route-driven focus, no focus movement from locale selection, unmount
cleanup and one service call for duplicate lock events.

The default emitted graphs contain 95 document modules, 30 vault Worker modules
and 4 QR Worker modules. The built content policy retains `ReleaseEnabled=0`,
`releaseAcceptance=false`, empty external origins and `connect-src 'none'`.
No asset-update implementation module appears in those graphs; the existing
release-context and release-proof modules remain in the document graph.

The [machine-readable receipt](app-shell-locale-generation21.json) records the
exact commands, source identities, results and SHA-256 digests of all six
execution logs. The local logs are in
`/workspace/scratch/dcf03ef9bee8/app-shell-locale-g21-evidence`.

## Composition and limits

The backup-notice fix remains a separate reviewed source and is not incorporated
in this branch. Catalogs, locale approvals, services, contracts, dependencies,
workflows, trust settings and default feature activation are unchanged.
Production still bundles only the draft English source.

No local browser was attempted, no full workspace or long native Solana suite
was repeated, and no hosted-browser, physical-device, semantic translation or
release acceptance is claimed. The coordinator owns the fresh independent review
and applicable checks on the final combined source before publication/merge.
Other forms' locale state remains separate follow-on scope.
