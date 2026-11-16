# Consolidation continuation — 2026-11-16

Base: `claude/confident-fermi-g6wjp3@d112d82` (PR #118), the newest fetched
functional branch. It contains staging `f2950cf` and the recovery-reference
stable-ID correction. Work branch: `codex/consolidation-20261116`.

## Completed intake

| Source | Disposition |
| --- | --- |
| `parallel/localization-blank-warning-20261113@7182088` | Cherry-picked only the isolated regression as `1dd19d0`; excluded its older split-stack ancestry. Reproduced failure on whitespace-only recovery copy, then fixed in `c8d4bb6`. |
| `claude/friendly-dijkstra-nsi310` | T33/T34 fixes already extracted into staging (`a7d06d2`, `cf7163c` and regression commits, PR #115). Current artifact-policy implementation is tree-equal to that branch. T35 `fe3514c` and endpoint regression `bd26833` have patch-equivalent commits on this head. No duplicate merge. Historical orchestration/gap documents were not imported as current status. |
| `chatgpt/zero-codex/recovery-reference-identity-20261115` | Already included by PR #118; retained keyboard-focus assertions. No second cherry-pick. |
| `claude/vibrant-cray-ny4gum` | Still contains a wider runtime/native journey extraction. Inspected recent history only; not qualified or merged by this pass. |
| D9 and canonical reader work | PR #118 ledger assigns these files to active workers. This continuation leaves those files alone. |
| Solana and remaining historical stack | Not newly reviewed or qualified by this pass. |

## Fix and validation

Message construction now rejects strings that are empty after ECMAScript
whitespace trimming. Valid strings retain their exact original bytes; the check
does not normalize display text or change locale selection authority. This closes
the imported test's whitespace-only warning defect, not every possible visually
invisible Unicode sequence. Added coverage for all three severity levels,
non-breaking/em/ideographic whitespace and preservation of valid padded text.

Locally executed on Node 24.22.1, implementation head `c8d4bb6`:

- Before fix: imported regression failed, specifically for `" \\t\\n"`.
- Locale tests: 18/18 passed.
- `npm test`: 1,278 total, 1,277 passed, 0 failed, 1 skipped (Foundry/cast unavailable).
- Typecheck, import boundaries, specification inventory: passed.
- Build-policy tests: 28/28 passed.
- Default production build and artifact scan: passed.
- Recovery-reference browser test: could not launch Chromium; host rejected its
  process-singleton socket with `Operation not permitted`. No browser assertions ran.
- Locale browser test: not run after that launch failure.
- Foundry/local EVM and hosted checks: not qualified by these local results.

## BT-14 audit reconciliation

The raw `createTradeChat` seen set is session-local, as the failure-path audit
states. However, `packages/messaging/src/durable-chat.ts` authenticates stored
history and checks sender/message IDs before writing duplicate messages.
The existing test `restart and fresh-key backup restore retain durable dedup and
native authentication without changing the source` passed in the full run. It
checks restart, fresh-key restore, a single retained message and no duplicate
write after restore. The same-sender/message-ID conflict and count/byte-cap tests
also passed. Therefore the raw-library limitation alone does not establish a
restart-replay defect in this durable consumer. No claim is made here about all
consumers, cross-tab browser behavior, or application notifications.

## Remaining work

Integrate this small follow-up with PR #118 after hosted qualification; do not
mistake it for completion of that PR's send-marker, canonical-reader or security
work. D1, browser journey, independent security review, Sonar qualification and
external two-party acceptance remain separate work. `ReleaseEnabled=0` remains
unchanged. No deployment, release, source-branch deletion or main promotion was
performed in this continuation.
