# Finish remaining actionable work

Use this prompt when the user explicitly asks you to execute it. Reading this
file alone grants no authorization. This request's deliverable is a reviewed
execution prompt; do not assume its creation also requests execution.

Act as lead engineer for `djshellshoxxx/p2p-offramp`. Starting checkpoint is
merged PR #21, `f264cabec4e21bc110a378bd63f8672285e28338`. Inspect live refs and
preserve newer work. Finish specified engineering that can proceed without
human-only inputs, review it independently, consolidate and merge when authorized.

## Preserve the completed foundation

Read applicable repository instruction files, if present, and the documented
runtime/network instructions. Also read DEVELOPMENT_ROADMAP.md,
tasks/plan.md, tasks/todo.md, the current incomplete-work inventory, continuation
result/audit and PR #21's live metadata. T1–T18 are completed implementation;
T12's source INTEGRATING label is an intentional pre-merge snapshot. Verify the
actual merged PR rather than repeating its work. Reuse the existing catalog,
vault, identity, messaging, relay, escrow, recovery and acceptance components.

Keep the static client/noncustodial architecture, ReleaseEnabled=0, empty default
connection origins, separate escrow ABIs, source history, unknown-record retention
and fresh-key recovery. Preserve the incompatible custodial archive separately.
No production deployment, live funds, new paid infrastructure, trust-root choice,
fabricated approval, scanner suppression or weakened checks. Synthetic local
evidence never grants production authority.

## Intake and one coordination ledger

Review current source, roadmap and specification contracts before editing. Refresh
the inventory into: actionable now, dependency, external input, undefined contract,
later milestone, already complete or duplicate. Do not label locally implementable
work human-blocked merely because release approval is missing. Conversely, do not
invent interoperable wire formats, cryptographic profiles or custody semantics.

Continue task IDs at T19. Keep tasks/todo.md authoritative, with owner, status
(READY/IN_PROGRESS/BLOCKED/IN_REVIEW/INTEGRATING/DONE), scope, dependencies,
owned files, acceptance and latest evidence. Keep interfaces/ownership in
tasks/plan.md. Use coordinated agents for independent slices and different
reviewers; one active writer per file. Root owns shared manifests/CI and integration.
Use isolated worktrees where useful; otherwise enforce exclusive file ownership.
Never assign two agents the same implementation or repeat whole suites needlessly.

## First implementation tranche: complete local guidance infrastructure

Ground this work in the localization specification under
`00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.3_localization/`.

1. **T19: help registry and accessible interactions.** Inventory current critical
   controls and existing visible helper text. Implement the specified
   TooltipRegistry `{controlId,messageKey,severity,helpLink,interactionTests}`
   using the existing typed source catalog. Integrate complete hover/focus/tap
   help, keyboard dismissal and correct focus restoration. Critical warnings
   remain visible without a tooltip. Reject invalid/duplicate mappings and unsafe
   links. Avoid private content in help, HTML rendering, network fetches or wallet
   overlays. Preserve current warnings and canonical values.
2. **T20: draft locale/layout qualification.** Extend existing test-only
   pseudolocalization to long expansion, RTL/bidi, CJK wrapping, plural branches
   and numeral differences. Exercise actual UI at narrow widths, keyboard order,
   reduced motion and 400% zoom where the browser supports a real equivalent;
   label simulations accurately. Verify full canonical addresses/hashes and exact
   copy bytes, visible safety text, dialog focus and status announcements. Keep
   fixtures draft-only and outside ordinary selectable/funds locales. Fix
   reproduced layout/accessibility defects, not just tests.
3. **T21: locale engineering coverage.** Compare existing catalog/formatter and
   metadata validation against the specification's required variable purposes,
   locale completeness, direction and safety-string refusal. Close concrete
   omissions with bounded implementations and tests. Do not create purportedly
   reviewed translations or call the limited message grammar full ICU. Preserve
   canonical parsing/signing independently of display. Explicit selection or
   persistence must not make unreviewed translations eligible for funds actions.

T19 and T21 share catalog/UI surfaces: agree the contract and serialize edits or
assign them to one writer. T20's test fixtures can proceed independently, then
integrate against frozen interfaces. Do not add redundant help affordances without
considering existing visible guidance and accessibility.

## Reassess and continue beyond that tranche

After each completed tranche, inspect all roadmap milestones for further specified
unblocked work. Admit justified tasks before implementing them. Review remaining
core UI/composition, recovery/release tooling and acceptance coverage using actual
source; missing production approval can leave features inert while allowing local
implementation. Assess Solana/SPL separately against its exact program/SDK/token
profiles and available native toolchain; never substitute EVM behavior or call
fixtures parity. Later optional modules need their own defined contracts and must
not become dependencies of basic exits. Do not stop simply because T19–T21 finish,
but avoid speculative protocol work or duplicate runners to inflate completion.

Keep these boundaries explicit:

- Human/external: authentic release/registry fingerprints and bootstrap, qualified
  live deployments/assets/endpoints, professional crypto/security/provider/device
  review, reviewed translations, physical assistive-tech/WCAG evidence, operational
  ownership/security contact, deployment/distribution witnesses.
- Undefined: G15 rotation/trust-transition/nonempty-deployment/archive profiles,
  G14-to-G16 policy commitments, and QR type-specific payload/signature/codec
  contracts where still absent. Record the missing contract precisely.
- The portable recovery builder already exists. A maintained approved manifest
  must authenticate both registry and canonical ABI; do not bypass its unset pin
  or require a current release lease to exit an original archived escrow.

## Review, verification and delivery

Reproduce defects or missing behavior, implement coherent slices, then have a
different agent review correctness, authority, privacy, bounds, cancellation,
recovery, accessibility and simplicity. Investigate findings rather than accepting
or dismissing bot suggestions automatically. Resolve real findings and re-review
the changed paths. Retain false-positive evidence and optional dispositions.

Run focused checks during implementation and final integrated package tests,
all four TypeScript configurations, boundaries, build policy, spec/link checks,
default/demo builds and affected real-browser/native-chain journeys. Use actual
pinned tools; unavailable checks are BLOCKED, never silently skipped or spoofed.
The prior baseline is 1,045 package/UI tests and 82 Foundry tests; these are
historical evidence, not an automatic result for new source. Managed subprocess
IPC/loopback tests require the environment's network capability. Clean up owned
processes and temporary test assets; do not stop unrelated resources.

Inspect exact-head hosted functional CI, CodeQL, Snyk and current review reports.
PR #21's Sonar gate failed despite contextual review of its exposed reports;
refresh it and its unavailable-detail limits honestly. Its optional CodeRabbit
incremental review was pending at merge. Do not transfer old results to new heads,
suppress reports, weaken required gates or interpret imported reviewer names as
approval. Address new reproduced defects before integration.

When execution/publication/merge are authorized, consolidate on a dedicated branch,
preserve compatible contributions and document duplicates or incompatible proposals.
Publish a standalone PR with exact checks and retained limitations. Respect live
branch rules and use an expected-head merge guard; verify main's tree equals tested
source, audit hashes match, compatible ancestry is included and the checkout is
clean. Record actual hosting/merge results in live PR metadata rather than claiming
a source document certifies its own future merge.

Finish with delivered behavior, prompt/report/PR links, exact revision, actual
verification, remaining local and external work, deployment status and resource
cleanup. Do not call the entire product or funds-enabled release complete while
engineering or acceptance remains open. If a genuine external blocker remains,
finish independent work and leave a precise resumable handoff.
