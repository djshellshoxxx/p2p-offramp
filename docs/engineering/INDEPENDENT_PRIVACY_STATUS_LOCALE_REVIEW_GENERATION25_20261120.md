# Independent privacy status locale review — generation 25

## Result and exact scope

**No actionable finding remains in the reviewed change.** Independent execution
reproduced all eight expected locale failures on the unchanged panel, then passed
**51/51 focused tests** on the frozen repair. The UI TypeScript project passed.
These results qualify the assigned display repair; they do not qualify a release.

| Checkpoint | Exact identity |
| --- | --- |
| PR234 source base | `477777dc152cd3148ba7f25a75ce8f00dc1b03b5` |
| Base complete tree | `7a474d82db7668b0ebbff26ae7a9d75d5030db7a` |
| Test-only RED commit | `cc395f47cd4db5f5e15eba54fd1cce00b95c65af` |
| RED complete tree | `3a414901d2b324e6f32dee61d759d65a706cdf14` |
| Independently reviewed and tested source | `ad7d5bb1487f6ce612a8ac2a69058e21b27aec1b` |
| Tested complete tree | `a47ce1cb2d5803d799e82c8d54e71621a38559ce` |

The reviewer used isolated worktrees at the exact RED and repaired commits,
with separate physical copies of the pinned dependencies. The repair changes
only [PrivacyStatusPanel.tsx](../../apps/web/src/ui/PrivacyStatusPanel.tsx) and
adds [privacy-status-locale.test.mjs](../../apps/web/test/privacy-status-locale.test.mjs).
All **2,703 other existing tree entries** retain their base modes, types and
object IDs. The test-only commit is a direct child of the base, its panel equals
the base byte for byte, and its test file equals the repaired commit byte for byte.

The [machine-readable receipt](privacy-status-locale-independent-generation25.json)
retains commands, timestamps, exact source identities, source hashes, result
counts, and both decoded and compressed log hashes. This evidence-only review
adds no production or test changes.

## Standards

**Findings: 0.** No repository or parent `AGENTS.md`, separate coding-standard
file, or contribution-standard file was found. The implementation follows the
surrounding compact TypeScript and existing message-view pattern.

The module retains semantic message keys in its state, reason, source and
channel maps. `PrivacyMessage` constrains state and reason targets to existing
static privacy messages; literal source and channel keys remain statically
checked at their use sites. The module-level `messageGroup('privacy')` is a live
getter view, so retaining that view is appropriate. Resolving its properties
inside the maps during module initialization would have preserved the defect.
No additional provider, hook, mutable notice state or abstraction is introduced.
No baseline code-smell judgment warranted a change.

## Spec

**Findings: 0.** The relevant requirement is the
[module 0.12.3 localization contract](../../00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.3_localization/spec-natural-language-localization-tooltips-and-accessibility.md):
interface text and errors use the selected locale catalog while canonical data
and authority remain independent. The
[privacy-indicator contract](../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.10_security_modes/module_5.10.2_privacy_indicators/spec-ui-privacy-status-indicators.md)
requires explicit unknown states, independent disclosures, scope and clock
invalidation, and fixed error presentation without private exception text.

The repair replaces direct English-catalog reads with the maintained
[runtime message views](../../apps/web/src/ui/locale/runtime.ts). Headings,
labels, states, evidence sources, reasons, selected policy, fixed errors and the
unconditional chain/fiat/authority disclosures resolve during rendering. The
timestamp uses the existing typed `privacy.time` message and the same exact
`String(item.observedAt)` value; the monotonic-clock explanation remains in the
unchanged catalog. Existing English output is retained through that source
catalog. No locale metadata becomes an observation or economic capability.

The [App](../../apps/web/src/ui/App.tsx) already subscribes to `localeStore` with
`useSyncExternalStore` and renders the Settings subtree again on selection.
[Settings](../../apps/web/src/ui/Pages.tsx) already renders the panel directly.
Those files and the compiled catalog composition are unchanged. No new
subscription is needed in this component.

The complete 4,149-byte block from the transport type through the code preceding
`indicator()` is byte-identical to the base. It contains the readers, broker
subscription ownership, active-registration check, generation/policy coherence,
scope handling, redacted exception handling, timers, visibility listeners and
cleanup. Changing catalog access therefore introduces no service command,
transport policy change, reader recreation or resource dependency.

This conclusion preserves the existing per-render inspection behavior. The
new lifecycle assertions switch locales at a fixed monotonic timestamp; they
demonstrate that those switches retain the active subscription, timer and event
listeners. The panel already samples observations on every render, and a later
fresh observation can produce a new deadline when time advances. This review
does not claim that locale changes prevent all observation reads or all deadline
renewal under advancing time. That behavior predates this repair.

## Regression and cleanup review

The new test compiles the actual panel, maintained privacy reader, locale runtime
and message view. Controlled React hooks, browser ports and a complete synthetic
draft catalog make the selection deterministic. Its explicit rerender after
selection models the existing parent App subscription, which is also covered by
the adjacent App-shell selection in this review.

The eight cases exercise `en → fixture-rtl → en` for unknown indicators and
disclosures, locked and unlocked vault observations with time copy, route
coverage and selected policy, scope mismatch, unavailable observations,
subscription refusal after broker replacement, retired callbacks, and persistent
clock-reversal invalidation. Every selection remains
`fundsLocaleEligible=false`. Refusal cases verify fixed visible errors and
exclude private exception text. Scope mismatch prevents route inspection.

Every mounted fixture registers teardown. The vault cases explicitly verify
that unmount removes the timer and event listeners; the transport case verifies
one unsubscription and no surviving listener. Locale changes retain the original
broker registration. The test-only RED execution failed through eight ordinary
assertion mismatches against the current catalog, rather than an import,
compilation or harness failure.

The maintained [panel rendering tests](../../apps/web/test/privacy-status-panel.render.test.mjs)
and [transport rendering test](../../apps/web/test/privacy-status-transport.render.test.mjs)
also passed, preserving English disclosures, independent unknown observations,
redaction and refusal to inspect an unmounted server-rendered broker.

## Independently executed checks

Execution used Node `24.22.3`, React/React DOM `19.3.1`, Vite `8.3.5` and
TypeScript `7.0.2`. Package and lock files are unchanged.

| Check | UTC execution window on 2026-11-20 | Actual result |
| --- | --- | --- |
| New locale test on exact RED commit | 17:46:12.385518–17:46:13.907221 | 8 tests; 0 pass, 8 fail; expected exit 1 |
| Focused selection on exact repaired source | 17:46:12.391726–17:46:15.094805 | 51 pass; zero failures, skips, cancellations or todos |
| UI TypeScript project | 17:46:18.510910–17:46:20.075991 | Exit 0 |
| Immutable source, ancestry and scope verification | 17:47:52.144176–17:47:52.317658 | Exit 0 |
| Complete base-to-source whitespace check | 17:47:52.145976–17:47:52.163853 | Exit 0 |

The focused command used `node --import ./scripts/test-support/register-tsx.mjs
--test --test-concurrency=2` with these files:

| Test file | Cases in the 51-test execution |
| --- | ---: |
| `apps/web/test/privacy-status-locale.test.mjs` | 8 |
| `apps/web/test/privacy-status-panel.render.test.mjs` | 4 |
| `apps/web/test/privacy-status-transport.render.test.mjs` | 1 |
| `apps/web/test/locale-runtime.test.mjs` | 7 |
| `apps/web/test/locale-selector.render.test.mjs` | 5 |
| `apps/web/test/app-shell-locale.test.mjs` | 10 |
| `packages/domain/test/privacy-view.test.mjs` | 16 |

The eight new passing cases are included in 51, not a separate additional
execution. This selection overlaps the author's and coordinator's checks.
Only the UI TypeScript project was independently run here; the author's four
project result is separate evidence.

Exact raw bytes are retained in the compressed
[RED log](../execution/privacy-status-locale-independent-generation25-20261120/red.log.gz),
[focused log](../execution/privacy-status-locale-independent-generation25-20261120/focused.log.gz),
[UI typecheck log](../execution/privacy-status-locale-independent-generation25-20261120/ui-typecheck.log.gz),
[source-scope log](../execution/privacy-status-locale-independent-generation25-20261120/source-scope.log.gz)
and [source-whitespace log](../execution/privacy-status-locale-independent-generation25-20261120/source-whitespace.log.gz).
The receipt also retains the source-scope checker and execution wrapper as
compressed audit inputs. Log packaging preserves the decoded bytes and avoids
introducing raw-log whitespace failures.

## Limits and integration handoff

The [generation 21](CONTINUATION_GENERATION21_20261120.md) and
[generations 22–23](CONTINUATION_GENERATIONS22_23_20261120.md) handoffs informed
the locale, ownership and evidence boundaries. Production still bundles only
draft English. Synthetic RTL-labeled text establishes catalog selection behavior,
not human translation quality, rendered RTL layout or accessibility acceptance.

No native browser, complete suite, build, hosted check, remote mutation or long
financial journey was run by this reviewer. The coordinator owns qualification
of the combined G24/G25 source. The separate UI rate-limit idea is outside this
review. This work supplies no production trust, deployment or release approval;
`ReleaseEnabled=0` remains unchanged.

**Standards: 0 findings, worst issue none. Spec: 0 findings, worst issue none.**
