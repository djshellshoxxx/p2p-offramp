# P2P Offramp — autonomous continuation to the approved specification

Continue development of `djshellshoxxx/p2p-offramp` autonomously. Implement and validate the owner-approved lean EVM trade scope until its acceptance criteria pass, available coding capacity is exhausted, or a genuine access/ownership/required-approval gate prevents further independent work. Produce working changes and verified GitHub checkpoints, not just inventories or plans.

## Authority and boundaries

The owner approves necessary changes, compatible consolidation, branch repair, and merging appropriate reviewed changes once their required exact-head checks pass. Do not ask again for routine reversible work already covered by this authorization.

The owner's latest direction is to disregard Sonar details. Do not investigate inaccessible Sonar rule/location data, repeatedly request access, or make that investigation a prerequisite for unrelated coding. Historical handoffs requesting that investigation are superseded. Record visible check status accurately; do not disable checks, change security settings, bypass a required merge restriction, or claim a failed check passed.

Preserve every existing branch, commit, dirty/untracked file, original failure and skip. No force-push, destructive reset, deletion of another worker's work, or advancing another worker's branch without coordinated ownership. Do not submit PR approvals. Never merge `feat/custodial-ledger-foundation` or make its balances/holds settlement authority.

Keep the application client-side and noncustodial. Preserve `ReleaseEnabled=0`, `connectOrigins: []`, profile bound 16, crypto/resource/trust gates, and unknown-outcome behavior. No deployment, live funds, credential creation, paid infrastructure, security-setting changes or production trading. Testnet preparation is not deployment authority. Later-preserved Solana/privacy/courier/arbitration/advanced features remain intact and outside the first EVM acceptance claim.

## Start by reconciling live state

The following is an observed checkpoint, not a claim that these refs are still current:

| Branch | Observed SHA / meaning |
|---|---|
| `work/p2p-consolidated-20261030` | New candidate. Latest source merge `eeb2a81323b9093864d6ec53b113949dbb710d25`; resolve its latest documentation head and PR before editing. |
| `main` | `c8547859f603f04d3df92e68925b99162594c39d` |
| `claude/sweet-noether-arf6ne` / PR #10 | `47f9bbee455e7affbc39539489227228eb346a0f` |
| `claude/sweet-shannon-grykla` / PR #12 | `7165626c17d8afb7ad7fce461ae7df9cbfcdba07`; already an ancestor of #10 |
| `work/p2p-relay-lifetime-20261030` / #15 | `e0961edc8cb64b466a2a3193aa37158bfc8c3487` |
| `work/p2p-exchange-close-20261030` / #14 | Latest observed head `2d3135b646bf99f63935287a082856ea7fe6b74d`; runtime repair `f379dc243cd9164da076c69702c2b5c21898f520` is included in candidate |
| `work/p2p-exchange-test-repair-20261030` / #17 | `adfbec52f964d9b07c571b8924d31fa03d54e03a`; already preserved in #14 and candidate ancestry |
| `work/p2p-independent-branch-review-20261030` / #16 | `9f80c9b27b943b30409710dea76a53d97a761832` |
| `work/p2p-validation-20261030` | `cc9a0a4baa2ad11b9efe4ada639a809542a7c5c9`; preserves `9eed65dabb2437b87270dab3f676133a063b5bef` in ancestry |
| `work/p2p-gate-reconciliation-20261030` | `e762e649600493221e3bd10f0c3525858722bc94` |
| `claude/docs-screenshots` / #13 | `c1e31918ed5e4e370e7217a6a654ea360c71f4b4` |

The exchange owner subsequently published evidence/harness-only commit `2d3135b646bf99f63935287a082856ea7fe6b74d`; its six changed documentation/evidence paths do not alter product source. That late evidence revision remains on its original branch and is not yet included in the candidate. Reconcile it with the owner before changing those artifacts; do not rerun or recreate the runtime repair merely because the branch head moved.

The candidate combines the six preserved work branches on integration 47f9, then the exchange owner's later f379dc2 repair, with original commits as parents. It is an unmerged development candidate, not an accepted release. The five earlier exchange failure schedules pass against the updated combined source; full exact-head qualification remains pending. This session did not advance main or original worker refs. The exchange owner independently advanced #14 during consolidation, which prompted the second intake. PR #11/recovery and older compatible branches are already ancestors of 47f9; do not re-import their content. Keep original PRs/history until the coordinator verifies final integration and closes superseded work deliberately.

1. Read applicable AGENTS.md/environment instructions, then current handoffs, refs, PR bodies/reviews, exact-head CI and recent commits. Inspect local status, worktrees and unique commits before changing anything.
2. Read `docs/handoffs/P2P_CONSOLIDATION_20261030.md`, `COORDINATOR_NOTES.md`, `LEAN_RELEASE_SCOPE.md`, and the current exchange/relay/review/validation handoffs, including `P2P_EXCHANGE_FINISH_20261030.md`. Treat their older chronological entries as historical evidence, not proof of current implementation gaps.
3. Reuse the actual authorized checkout/executor if available. Previous full checkouts were reported at `/workspace/p2p-latest-validation-20261030` and `/workspace/p2p-relay-validation-20261030`; the consolidation executor had only verified materialized subsets, not full Git history. Do not claim one environment's state as another's.
4. Preserve local `work/p2p-restore-commit-reconciliation-test-2026-10-26` at `beb9866ed39452b603554d364c98fe025372da3a` wherever it exists. It has unique G16 result-only work not proven integrated. Compare it with current source and coordinate with the schemas/runtime owner before any extraction; preserve the schema facade's `saved-review.ts` export.
5. Use authorized GitHub access. Stop a denied operation; do not change routes to evade it. If an upload/merge is denied, record the exact action/error and continue independent local work where possible.

## Ownership before implementation

Use one integration coordinator and explicit file ownership. Current reservations must be reconciled, not silently assumed abandoned:

- Active exchange coordinator: `packages/exchange/src/exchange.ts`, its existing test file and `packages/exchange/test/async-boundaries.test.mjs`. The owner's f379dc2 handoff explicitly retains bounded exchange implementation/integration ownership. #17's test-wrapper repair and #16's review history are now included intact.
- Relay writer: `packages/relay/src/pool.ts` and `packages/relay/test/pool-lifetime.test.mjs`; the reviewed fixes are included.
- App/trade owner: `apps/web/src/trade/**`, `apps/web/src/ui/trade/**`, `packages/domain/src/terms-review.ts`, runtime/Worker and schemas.
- Consolidation owns only its new branch and uniquely named handoff/evidence files. Inclusion of existing commits did not transfer implementation ownership.

Confirm coordination or explicit transfer before editing reserved files. Avoid duplicate implementations on sibling branches. If the active task instructions permit parallel agents, assign disjoint source scopes or read-only review scopes; the coordinator integrates results. Do not create parallel agents merely to exhaust credits. If ownership cannot be established, finish useful nonoverlapping work and name the exact reserved paths blocking the next slice.

## Immediate priority: qualify the owner's repaired exchange

Read `docs/handoffs/P2P_EXCHANGE_FINISH_20261030.md`, `P2P_BRANCH_REVIEW_20261030.md` and `P2P_EXCHANGE_TEST_REPAIR_20261030.md`. The owner has implemented the repairs below at f379dc2. Do not duplicate that implementation. First reconcile its latest review and exact-head CI, then test any remaining gaps against the repaired source.

The candidate retains the original real-provider reproductions:

```sh
node --test --test-reporter=tap docs/evidence/P2P_EXCHANGE_TEST_REPAIR_20261030/open-findings.test.mjs
```

The preserved original logs have five intended failures at runtime 0054543. The same five cases now pass against f379dc2 combined with relay e0961ed. They live outside normal npm test globs; f379dc2 also adds twelve normal real-provider regression schedules in `packages/exchange/test/async-boundaries.test.mjs`. The combined run passed 134 tests, zero failures/skips/cancellations. Preserve both original RED and new GREEN evidence. Do not rewrite historical logs or duplicate already-covered tests; add coverage only for a concrete remaining acceptance gap.

Use this acceptance checklist to review the existing repairs. If a remaining defect is demonstrated, resolve ownership and fix it in one small tested slice:

1. **Session generation / identity binding (P1).** A terms review captures a session, pauses, then applies to a replacement session found by the same string ID. Cancel/re-take can attach buyer A's reviewed terms to buyer B's session. Both different-address and same-address/new-generation schedules reproduce. Require current session identity/generation after async boundaries, revalidate state/bindings before mutation, and refuse stale work without touching the replacement. Check outbound detached-session continuations as well.
2. **Fresh time at async completion (P2).** Take and accept reuse time captured before signer/review/wrap work. Re-read and validate the trusted clock at commit/return boundaries; enforce advert, envelope and relevant acceptance deadlines. Test exact equality, delayed review/seal/wrap/unwrap, invalid/throwing clocks and unchanged-state rejection. Preserve fixed public error semantics and unknown outcomes. Do not grant relay cancellation authority over funded trades.
3. **Replay capacity for all admissions (P2).** Outgoing `sent()` bypasses `maxSeenMessages`. Share bounded admission between inbound/outbound paths, account for concurrent pending results, and check capacity before committing state. Prune only expired IDs, never evict live replay evidence. Test maximum capacity, terminal/re-take cycles and concurrent sends; refuse with `LIMIT_EXCEEDED` without unrelated mutation.

The earlier close bug and frozen-provider test-wrapper issue are also already patched. Preserve the wrapper and assertions. The new owner repair additionally retains accepted sessions until advert expiry, rejects superseded in-flight takes and checks offer size before copying. Review those behaviors with their new tests; do not reimplement solved work.

## Continue to the specification after qualification

Use `DEVELOPMENT_ROADMAP.md`, the approved lean scope and the relevant normative specs. Build a concise traceability table: requirement → current implementation → executable acceptance evidence → remaining gap/owner. Verify current code before treating old status documents as a backlog.

Key contracts include:
- G03/G09 backup recovery, source-bound fresh-key resealing and migrations; preserve source profiles, quota/CAS/cross-tab/interrupted-resume controls.
- G11/G15 approved registry and release-manifest verification; retain trust-root/provider/release gates and rollback refusal.
- G16 canonical reviewed/signed terms, independent digest vectors and precise Worker/UI authority boundaries.
- G10/G12 wallet discovery/signing/submission and durable transaction reconciliation: explicit intent, no automatic economic resubmission, honest unknown outcome, chain-derived funding/terminal state.
- `01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.4_order_discovery/module_1.4.1_encrypted_relay_protocol/spec-encrypted-order-envelope.md`.
- The adjacent `spec-order-lifecycle-reconciliation.md`: package negotiation is implemented; app chain reconciliation, terms revision monotonicity, restoration/replay and end-to-end single-fill acceptance still need source-based assessment.
- Existing escrow interface/deadline/refund, signed-trade-terms, registry, transaction-journal and relay-abuse specs.

Next dependency-ready product work is composition of reviewed exchange/relay, wallet/escrow and G12 lifecycle into the app after ownership and prerequisites are clear. Do not expose test-only providers or promote private G16 helpers into the app solely because their unit tests pass. Retain unsupported paths as explicitly gated.

Prove the two-party local/test EVM flow: offer → local review → accept → fund → settle or deadline refund, including honest unknown broadcast, recovery/reconciliation, replay, amount and expiry controls. Acceptance must stay distinct from funding. Only verified chain observation changes custody state; relay messages never prove payment or fiat irreversibility.

Check the unimplemented cases explicitly listed by the current specs: two buyers sharing a seller nonce admit at most one funded trade; new-order nonce reuse; stale cancellation after funding; same-revision equivocation; offline expiry; relay gaps; reorg recovery; duplicate history and backup restoration. Implement only gaps demonstrated against current source. Real-relay interoperability, verified-private routes, provider reviews, device/browser matrix and independent audit remain separate evidence gates; do not label fixtures as those results.

## Verification and completion discipline

Reproduce defects before fixes. Preserve setup failures separately from intended RED assertions. Use real providers at integration boundaries, fixed independent vectors where required, deterministic scheduling and meaningful mutations/negative controls. Do not weaken limits, assertions, compiler options or release checks to make tests green.

Run appropriate focused tests for each slice. At a coherent combined-source milestone run applicable repository commands using pinned dependencies:
```sh
npm run typecheck
npm test
npm run check:boundaries
npm run test:build-policy
npm run check:specs
npm run test:specs
npm run build
npm run build:demo
npm run test:browser
npm run test:web:browser
npm run test:private:browser
npm run test:fuzz
npm run test:evm
npm run test:evm:local
npm run test:evm:reconcile
```
Run Sepolia kit/trade scripts only as their existing local/test fixtures require, with the pinned toolchain; no network deployment, new secrets or live-funded transaction is authorized. Inspect scripts before executing unfamiliar targets. Browser/Foundry/environment limitations must remain recorded. A missing Foundry skip is not a pass, and a different version label is not automatically a code defect.

The initial consolidation's 117 passes qualify its original 105-file package subset. The updated source eeb2a813 has 134 focused/evidence passes over 106 Git-blob-verified package files, including f379dc2's twelve new tests and the five formerly RED cases. Available TypeScript 5.9.3 passes the actual root configuration on this subset; it does not establish full pinned TypeScript 7.0.2 app qualification. Historical #17 source had 782 hosted Node passes and one Foundry-dependent skip; relay source had 787 and one skip. Historical 47f9 local 4096-case parser campaign followed 26 harness self-tests. These are different exact sources, not cumulative or transferred acceptance. Run new full-head checks when the combined source needs qualification; do not repeatedly rerun unchanged campaigns just to stay busy.

Before merging into an accepted integration/main branch, verify current head/base, substantive review, all required exact-head checks and clear ownership. A conflict-free tree or green subset alone is insufficient. Do not bypass actual repository rules. Keep the consolidation draft while known defects or required checks remain unresolved. Preserve source parents and original branches; verify remote SHAs after every publication.

## Checkpoints and stopping

Update GitHub at coherent verified milestones. Each restart-ready handoff must record source and documentation SHAs, changed files, ownership, commands/results/skips, preserved original failures, unresolved blockers, remote verification and the next dependency-ready action. Distinguish spec structure, package implementation, app integration, local fixtures, hosted CI and independent acceptance.

Use prompt caching only if the actual model/API interface supports it; report usage only when measured. Any paid Claude call must use the existing authorized shared broker and spending limits. Do not create another paid route.

Keep working without timers or optional permission pauses. Do not manufacture tasks. If blocked, complete useful independent work, commit a clear checkpoint and report the specific remaining gate. Do not declare project completion from a scaffold, green CI, package tests or testnet preparation; completion requires the approved scope's executable acceptance evidence and remaining independent release decisions.
