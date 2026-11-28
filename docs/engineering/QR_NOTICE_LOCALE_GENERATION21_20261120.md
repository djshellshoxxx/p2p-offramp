# Generation 21 — QR notice locale completion

The QR panel now resolves its existing notice key or error code from the selected
catalog during rendering. A completed notice changes language with the rest of
the interface. Selection does not repeat the read, camera, clipboard, readiness
check or download that produced the notice.

This is an author qualification record for a bounded F19 presentation change.
Independent combined review and applicable hosted qualification remain with the
coordinator.

## Immutable source

| Checkpoint | Exact identity |
| --- | --- |
| Base main | `388526a474aea0e08f9c04178c2b7f9e1d4bee3f` |
| Regression-only source | `24bb5df89b06a136f7be53a8e9db2e7f9343bfaf` |
| Fixed source | `946c26a28822c4950cf69072d1d445042797c850` |
| Fixed complete tree | `45a085c7e1065b2bb53126f2e3cad9962c9f2621` |
| Branch | `codex/qr-notices-locale-g21-20261120` |

The complete base-to-source comparison has exactly two paths:
`apps/web/src/ui/QrPanel.tsx` and the new
`apps/web/test/qr-notices-locale.test.mjs`. All **2,575 other base entries**
retain their mode, type and object ID. This report and its receipt/logs are a
separate documentation-only follow-up after the implementation freeze.

## Reproduced behavior and correction

The old panel stored resolved `q.errors[code]`, `q.copied` and
`q.copyUnavailable` strings. A parent render following locale selection updated
labels, while those existing notices retained the earlier copy.

The correction stores a small union containing an existing `QrAppCode` or one
of the two existing copy-message keys. Reset paths clear that state with `null`.
The render resolves the selected catalog text and preserves the existing alert
role and priority over controller/camera fallback errors.

QR decoding, controller state, trusted-context checks, camera admission, expiry
thresholds, generation checks, cancellation, timer cleanup, canonical values and
public export operations are unchanged. No source catalog or translated copy is
added.

## Actual focused execution

Environment: Node **24.22.3** and physical copied dependencies from the unchanged
workspace lock.

| Execution | Actual result |
| --- | --- |
| New cases against unchanged base component | **17 tests: 5 passed, 12 failed**; zero skipped or cancelled |
| Same cases against repaired component | **17/17 passed**; zero failed, skipped or cancelled |
| Seven focused QR UI and locale suites | **54/54 passed**; zero failed, skipped or cancelled |
| Four TypeScript projects | Passed |
| Static import boundaries | Passed: 241 production sources / 148 core entry modules |
| Whitespace | Passed |

The 17 cases are included in the 54-case selection; these counts overlap.
The initial twelve failures are preserved. They demonstrate prior-language
notices after ordinary read, camera, clipboard, display, download or expiry
outcomes. Five companion cases already passed before the correction.

The new tests bundle the maintained locale runtime, QR message views and fixed
error mapper with an explicitly compiled synthetic draft catalog. They execute
the maintained panel handlers with dependency-aware hook state and controlled
ordinary controller/camera results. A real maintained public sample is encoded
and decoded for the displayed values and clipboard/download bytes.

The tests also check a locale change during a pending read, cancellation of a
late read, scope retirement of a pending clipboard response, unmount retirement
of a camera response, unchanged review focus, exact public values, existing
symbol visibility and current controller-error fallback. Selecting the draft
fixture retains `fundsLocaleEligible=false`.

## Evidence and limits

The [machine-readable receipt](qr-notice-locale-generation21.json) records exact
commands, source identities, results, retained log paths and SHA-256 digests.
All five logs are retained under
`docs/execution/qr-notices-locale-generation21-20261120/`, including the original
failure output. Logs are gzip-compressed without changing their decoded bytes;
both compressed and decoded hashes are recorded.

This is Node UI qualification with controlled service ports. It does not claim
native browser, actual camera, physical-device or translation acceptance. No
local browser, full native financial suite or default build was run in this
worker's scope. The final composition still requires its own applicable gates.

Production locale configuration remains English-only and draft. Catalogs,
semantic approvals, claim/evidence pins, dependencies, workflows, trust and
release settings remain byte-identical to the base. `ReleaseEnabled=0` remains
the existing configuration. No remote ref was changed.
