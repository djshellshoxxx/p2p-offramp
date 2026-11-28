# Generation 25: selected-catalog privacy observations

November 20, 2026 UTC.

## Result and exact source

The Settings privacy-status panel now resolves its text through the selected
compiled locale. State, reason, source and channel mappings retain semantic
message keys, so their values update with the surrounding interface. The default
configuration still contains only draft English; no translation or release
approval is added.

| Identity | Exact value |
| --- | --- |
| Published PR234 base | `477777dc152cd3148ba7f25a75ce8f00dc1b03b5` |
| Frozen test-only baseline | `cc395f47cd4db5f5e15eba54fd1cce00b95c65af` |
| Frozen implementation source | `ad7d5bb1487f6ce612a8ac2a69058e21b27aec1b` |
| Frozen implementation tree | `a47ce1cb2d5803d799e82c8d54e71621a38559ce` |
| Source frozen at UTC | `2026-11-20T17:43:30Z` |
| Local branch | `codex/privacy-status-locale-g25-20261120` |

The source scope contains exactly two paths:

- `apps/web/src/ui/PrivacyStatusPanel.tsx`
- `apps/web/test/privacy-status-locale.test.mjs`

The implementation was committed before the final focused qualification. This
report and its retained evidence form a separate documentation commit.
Independent review and combined-source qualification belong to their own
receipts; this author report does not establish either.

## Reproduced gap and correction

The [localization specification](../../00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.3_localization/spec-natural-language-localization-tooltips-and-accessibility.md)
requires catalog-backed interface text and coherent explicit locale selection.
The current `App` already subscribes to the maintained locale store and rerenders
its screens when that selection changes.

The panel still imported the English source-only compatibility functions. Its
four module-level display maps also captured resolved strings. A selected
compiled development locale therefore changed the surrounding application while
the privacy panel retained English headings, observations, reasons and notices.

Eight ordinary cases fail against the frozen test-only baseline with unchanged
production source: absent observations; locked and unlocked vault observations;
live broker coverage and strict-policy refusal; mismatched scope; unavailable
local observations; failed reattachment to the same broker; and clock reversal.
All eight failures concern selected-catalog copy after the English assertions
have passed. They are variants of one display defect, not eight security causes.

The correction imports `message` and `messageGroup` from the maintained runtime.
Mappings now contain message keys and resolve their values during rendering.
The existing App locale subscription remains the owner of locale rerenders.
Reader construction, memoization, coherent inspection, broker registration,
deadline scheduling, visibility/pageshow handling, error suppression and private
capability checks are unchanged. Locale changes grant no routing or economic
authority.

## Focused regression scope

The new test builds the actual panel and its actual imports, including the
maintained privacy reader, into an in-memory bundle with `write: false`. It
replaces only React hooks/browser ports and the compiled locale configuration.
The complete synthetic catalog wraps English source text in `[DRAFT ...]` and
uses an Arabic locale tag. It is layout/test data, not an Arabic translation.

Each case renders English, the fixture and English again while retaining the
same mounted component state. Tests check channel/state/source/reason values,
disclosures, unavailable notices and canonical observation-time values. They
also preserve a live broker subscription, unchanged timers/listeners, fixed
scope/error refusals, ignored retired callbacks and the reader's latched clock
reversal. Controlled ports expose inspection only; no network, wallet or write
operation is composed.

The initial harness required two corrections before the authoritative baseline:
its first run bundled the native React runtime instead of the controlled hook
module and failed because the VM had no `process`; the second had six locale
assertion failures and two cross-realm expected-message argument errors. Those
development logs are retained separately and do not establish additional product
defects. The third run uses the final unchanged test file and supplies the clean
eight-failure baseline.

## Executed qualification

| Command scope | Result |
| --- | --- |
| Final new tests against unchanged production panel | 0 passed / 8 expected locale failures |
| Identical new tests with the working-tree correction | 8/8 passed |
| Frozen-source privacy panel/domain, locale runtime/selector and App locale selection | 51/51 passed |
| `npm run typecheck` | All four TypeScript projects passed |
| `npm run check:boundaries` | 241 production sources / 148 core modules passed |
| Source whitespace against PR234 base | Passed |

Successful test runs have zero failures, skips, cancellations and todos. The
eight new cases are included in 51; their counts are not added. The intermediate
eight-pass run predates the implementation commit and is bound by file hashes;
the final 51-test run and other source checks execute on exact `ad7d5bb`.

The [evidence record](privacy-status-locale-generation25.json) retains every
executed test/qualification command, source identities, timestamps, exact raw
output hashes and compressed-log hashes. Logs are losslessly retained in
`docs/execution/privacy-status-locale-generation25-20261120/`. The isolated
worktree used a physical copy of the existing dependencies; both source and
destination lockfiles have SHA-256
`9099553922da18ffb1847f2af0780add27c422ecdcbb00b1050503ffb2e4dd72`.

## Remaining qualification and preserved scope

No browser, full repository suite, financial journey, deployment or remote
mutation ran for this slice. Combined-source build/hosted qualification and the
independent review remain separate. Native locale interactions, assistive
technology, physical devices and human translation approval are not established
by the controlled Node fixture.

Only the panel and its focused test change before the separate evidence commit.
The source catalog, production locale configuration, domain/privacy policy,
transport, vault/updater implementations, package/workflow configuration and
optional packages retain their base blobs. Existing `ReleaseEnabled=0`, unset
production trust and default updater/optional exclusions remain unchanged.
This report does not claim freshly emitted production artifact identity.
