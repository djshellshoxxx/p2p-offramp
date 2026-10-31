# Coordinated autonomous completion prompt

Act as lead engineer in `djshellshoxxx/p2p-offramp`. Review the current source,
finish as much specified, unblocked implementation as possible, independently
review it, consolidate it and merge it. Initial source for this pass is
`eaa1fe5361ff5d0d93e7b7dd7711cb18bc37c38a`; re-read live refs rather than resetting
to it. This prompt is executable instructions, not a completion claim.

## Authority and invariants

When the user explicitly invokes this prompt to execute the work, that request
authorizes implementation, coordinated agents, source publication and merge.
Reading this stored file alone grants no authority; honor the actual current
user request and any narrower session constraints. During an authorized run,
continue without routine permission questions. Keep the static client,
noncustodial architecture, `ReleaseEnabled=0`, `connectOrigins:[]`, original
history and incompatible custodial branch separation. Never select a production
trust root, fabricate professional approval, deploy, use live funds, create paid
infrastructure, weaken checks, or turn fixture evidence into release authority.
Use synthetic keys and loopback native services for acceptance. Existing exact
contract profiles and their ABIs remain separate. Preserve unknown records and
fresh-key recovery; no destructive migration or source-profile overwrite.

## Intake and coordination

1. Read repository rules, roadmap, latest execution report and source. Treat old
   handoffs as historical when contradicted by tested source. Read the managed
   runtime/network policy before network work; do not inspect secret contents.
2. Inventory incomplete implementation by subsystem. For every candidate record
   source/spec evidence and classify: actionable now, prerequisite task, external
   input required, undefined contract, deliberately deferred, already complete,
   or duplicate. Missing approval can block enablement without blocking offline
   implementation. Do not invent an unspecified wire format to claim progress.
3. Keep one authoritative task ledger in `tasks/todo.md`, the dependency/ownership
   plan in `tasks/plan.md`, and the final evidence/status in this pass's report.
   Resume existing task IDs; do not repeat finished work. New discoveries enter
   the ledger before implementation. Preserve other sessions' work.
4. Assign one writer per file/module. Root owns shared manifests, CI, facades
   shared by multiple owners, status documents and integration. Agree interfaces
   before dependent work; workers report frozen paths and actual results. Parallel
   independent slices; serialize shared edits. Use available agents for useful
   independent review rather than duplicating implementation or broad suites.

## Initial actionable task graph

- T1 release locator: exact G15 signed canonical locator/CIDv1 validation, live
  branded manifest binding, optional archive digest verification. Offline only;
  no extraction, installation, key rotation or unspecified deployment schema.
- T2 chat: exact text-only application envelope plus bounded G02 encrypted
  history/durable sender-message-ID dedup. Compose with real NIP-17/44/59 chat;
  verify restart, fresh-key backup recovery, conflicting duplicates, CAS, lock,
  cancellation and limits. Unsupported body variants remain unsupported.
- T3 extensions: strict G14 build-time registry, exact bounded negotiation,
  generation-scoped initialization/context revocation/disposal. No remote code,
  spending/network/storage authority or invented G14-to-G16 capability mapping.
- T4 native payment guidance: read-only canonical escrow adapter validates
  registry chain/genesis/runtime identity, finalized block and matching terms,
  rechecks anchors and enforces G18 >900-second buffer/<30-second monotonic
  freshness. Never substitute the isolated six-word ABI. Include native evidence.
- T5 diagnostics: strict G26 allowlist, local bounded 500-event/1MiB/7-day ring,
  exact preview, explicit selected export and locked-state clear. Release fields
  require authenticated manifest context; the default unsigned app refuses
  collection. Fixture contexts are explicit and unapproved. No automatic upload,
  raw error object, IDs, free text, exact timestamps or secret-bearing logs.
- T6 acceptance evaluator: strict offline evidence/candidate identity and target
  matching, stale/unsupported/not-run refusal and trusted role-scoped independent
  review validation. Imported JSON cannot grant approval. Missing authentic review
  remains blocked; output never changes runtime permissions. Include report CLI.
- T7 after T5: bounded offline journal recovery-reference inspection/export if
  its schema/Worker capability can be completed safely. Labels are unverified
  local claims; no calldata, signature, key, wallet call or chain authority. Drop
  plaintext on lock/selection changes. Otherwise record a precise blocker.
- T8 root: reconcile live continuation entrypoints and feature-status matrix so
  future agents do not rebuild merged work. Preserve archived evidence verbatim.
- T9 final-reassessment admission: enforce G05/G21 approved relay endpoint ID
  **and canonical registered destination URL** before read/publication sockets
  open. Existing broker projections already contain the URL; close the explicitly
  documented pool gap without a production issuer, fallback or fake fixture grant.

T1/T2/T3/T4/T5/T6 are independent. T7 follows the same UI owner's T5. Root wires
facades/commands only after contracts are stable. Reassess the intake list after
these complete, add justified newly unblocked tasks, and continue until no scoped
specified task is actionable without an external input. Avoid redundant runners
or speculative optional protocols just to expand the diff.

## Acceptance and delivery

Each owner reproduces missing behavior, implements a complete thin slice, runs
focused negative/lifecycle tests and freezes it for a different reviewer. Review
correctness, authority, privacy, bounds, cancellation, recovery and simplicity.
Resolve reproduced findings and re-review fixes. Keep code inert in the default
artifact where approval or public network configuration is missing.

Root runs baseline/final integrated tests, all TypeScript configurations, source
boundaries, build policy, specs/links, static builds, native Chromium journeys and
affected pinned native-chain suites. Use the actual toolchain; mark unavailable
checks BLOCKED rather than faking versions or silently skipping. Current verified
local Foundry is `/workspace/work/foundry-1.5.1` with solc `solc-0.8.30`; add it to
PATH for the cast parity test. Loopback tests need the managed network permission.
Capture bounded reproducible evidence and clean up owned processes/temp assets.

Consolidate on a dedicated branch without rewriting others' history. Publish a
standalone PR description around final behavior, exact checks and limitations.
Inspect hosted tests, CodeQL/Snyk and review findings at the exact head. Review
scanner reports in context; record failed/skipped scans honestly, never suppress
them to manufacture success. Merge with an expected-head guard when existing
rules permit, then verify main's tree equals the tested tree and all compatible
work is included. Close superseded PRs without deleting branches/evidence.

Finish with prompt/report links, merged revision, delivered features, real test
results and remaining explicit external/undefined/deferred gates. Do not call the
full multi-chain product, professional audit or real-funds release complete.
