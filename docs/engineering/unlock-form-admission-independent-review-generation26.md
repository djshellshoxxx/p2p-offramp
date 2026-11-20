# G26 independent review: UnlockForm request admission

## Decision

**Accept the frozen change for scoped integration.** No correctness, scope, or standards finding was identified in the assigned diff. The independent regression run reproduced four failures on the test-only commit and passed all eight cases on the fix. The four affected suites passed 52/52, and the UI typecheck passed.

This decision covers the maintained UnlockForm handler composed with the real AppServices facade and AppRuntime under controlled hook scheduling and a held Worker port. It does not establish that a native browser can dispatch the duplicate event sequence, and it does not qualify a native Worker, cryptographic unlock, or a later composed commit. `ReleaseEnabled=0` remains unchanged.

## Frozen source identity

| Role | Commit | Tree |
| --- | --- | --- |
| Assigned G24/G25 source base | `1a52c1c4f53a97cbbd0937f14a4379b88fd249b8` | `26938456c4924e4792a5671183a0879e86f8b7a2` |
| Test-only RED | `6df5a34a7c00f8a6fa489a53ca8f783616e285f5` | `4526273027691552d891ebce9d0d66bec19fb828` |
| Reviewed GREEN | `a2a854a285563d4560610577a0df099b041643bf` | `d6eea6d8e46d9612b59768801daa28ee9544e3a3` |

The reviewer used the isolated branch `codex/unlock-form-admission-independent-review-g26-20261120` in `/workspace/scratch/dcf03ef9bee8/p2p-unlock-admission-review-g26`. RED and GREEN were checked out exactly before execution; their before/after status was clean. Node was `v24.22.3`; npm was `11.19.1`. Dependencies were physically copied from the author checkout without changing the lockfile or dependency definitions.

Independent complete-tree comparison confirmed:

- RED preserves all 2,728 entries in the base and adds only `apps/web/test/unlock-form-admission.test.mjs`.
- GREEN changes only `apps/web/src/ui/VaultForms.tsx` from RED. Its production diff adds the comment and changes `if (busy) return` to `if (busy || request.current !== null) return`.
- The regression test is byte-identical in RED and GREEN: Git blob `61718845f6246e4df6dbb5dc51eed033c18b888e`, SHA-256 `55d038f4005bdd8f9c800477cec790a317e1f9342d931f51f7910bfd6d5924e7`.
- GREEN preserves all 2,727 other baseline entries, including the facade, runtime, Worker implementation, schemas, dependencies, workflows, trust inputs, and configuration. The unchanged facade starts AppRuntime with `ReleaseEnabled: 0` and an empty connection-origin list.

The exact identity check, source hashes, commands, UTC timestamps, pre/post checkout identities, and raw-output hashes are retained in the companion JSON and compressed evidence.

## Standards

**Findings: 0.** The change uses the component's existing `useRef` ownership state instead of adding another state variable, clock, policy, or abstraction. Its comment explains the gap before the `busy` render updates. The surrounding validation, cancellation, notice mapping, secret clearing, and identity-checked cleanup remain unchanged. The regression fixture follows the repository's existing maintained-TSX/controlled-hook test pattern in `vault-forms-locale.test.mjs`.

The assignment supplied the review baseline and behavioral scope. No separate repository coding-standard file or issue-tracker procedure was found in the scoped lookup. The standards and behavioral axes were reviewed by this independent reviewer; no additional workers were started.

## Behavioral scope

**Findings: 0.** In `UnlockForm`, the admitted controller is stored synchronously before awaiting `services.unlock`. The new guard reads that existing ref before reading inputs, replacing the controller, changing busy/notices, or invoking the facade again. Consequently a second call through the same render's handler leaves the first controller owned by Cancel and effect cleanup.

The original failure is consistent with the unchanged runtime admission behavior: a second UI call could replace `request.current`, then AppRuntime could return `BUSY` before posting another Worker unlock. The duplicate handler's completion could clear the replacement ref and busy state while the first runtime request remained pending. The independent RED run directly observed the missing abort on immediate Cancel and premature busy clearing in the other three duplicate cases. The late-publication mechanism follows from the inspected unchanged runtime: an uncancelled pending request can accept its correctly correlated response. The RED regression assertions stop at their first failing ownership/busy check, so this review does not describe an additional RED late-publication observation that its log does not contain.

With ownership retained, the existing abort listener invalidates pending output, resets runtime status, advances generation, and initiates the runtime lock. A delayed old-generation reply reaches the registered EventTarget listener but cannot publish unlocked state. The fixed handler also checks its controller's abort status before changing its notice or calling `onCancel`. GREEN checks the public state and observed publications after delivery, rather than relying only on an abort flag or a single Worker-post count.

The cleanup releases the ref after a completed authentication refusal, and the existing `busy` update allows the next explicit retry. The positive retry case submits another passphrase, observes a second facade call and Worker unlock, and completes successfully. A single normal success still clears the input and closes once. No cooldown, attempt counter, interval, persistence, or rate-policy change was introduced.

## Test composition inspected

| Layer | Executed boundary | Qualification limit |
| --- | --- | --- |
| Form handler | The test reads the maintained `VaultForms.tsx`, transpiles the body beginning at `type Notice`, and executes its real handler, cleanup, and notice code. Actual route/message functions and constants are supplied. | Imports are supplied to a VM context; this is not a native React mount. |
| Hook and form scheduling | Controlled state/ref/effect storage retains one render's handler so it can be invoked twice before a rerender. The form fields, reset, focus, and JSX tree are fixtures. | Native DOM dispatch, React scheduling, and event reachability are not established. |
| Facade | `startAppServices` creates the actual facade. A wrapper records unlock signals/promises and forwards every call to the real facade. | The wrapper observes calls; it does not replace their results. |
| Runtime | The real AppRuntime performs startup, input/protocol parsing, `BUSY` admission, cancellation, generation checks, public state, and subscriber notification. | Document lifecycle is disabled for this fixture. |
| Worker boundary | A controlled EventTarget port holds unlock commands and dispatches well-formed, correlated success or refusal messages through the real runtime message handler. Delivery is recorded and asserted. | The vault Worker endpoint, storage, crypto, and native Worker transport are not executed by the new regression. |

The late success replies are valid correlated fixture responses, not evidence of cryptographic authentication. Single-success and fresh-retry controls demonstrate that this fixture can publish unlocked state when the request remains authorized; the cancellation cases then demonstrate suppression after teardown on the same composed path.

## Independent execution evidence

All rows below were executed on 2026-11-20 UTC. No check timed out; every test run had zero cancelled, skipped, or todo cases.

| Check | Source | Start–end UTC | Result |
| --- | --- | --- | --- |
| Eight-case regression, RED | `6df5a34a7c00f8a6fa489a53ca8f783616e285f5` | 17:56:00.368–17:56:01.116 | Expected exit 1: 4 pass / 4 fail |
| Identical regression, GREEN | `a2a854a285563d4560610577a0df099b041643bf` | 17:56:05.384–17:56:06.114 | Exit 0: 8/8 |
| Four affected suites | `a2a854a285563d4560610577a0df099b041643bf` | 17:56:13.710–17:56:18.095 | Exit 0: 52/52 |
| UI typecheck | `a2a854a285563d4560610577a0df099b041643bf` | 17:56:13.720–17:56:15.278 | Exit 0 |
| Assigned-range whitespace check | `a2a854a285563d4560610577a0df099b041643bf` | 17:56:13.737–17:56:13.761 | Exit 0 |
| Tree/blob identity verification | `a2a854a285563d4560610577a0df099b041643bf` | 17:56:46.246–17:56:46.384 | Exit 0; all nine identity assertions true |

Exact regression command, used without modification in both checkouts:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test apps/web/test/unlock-form-admission.test.mjs
```

Affected suites and UI typecheck:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test apps/web/test/vault-forms-locale.test.mjs apps/web/test/app-services.test.mjs apps/web/test/app-runtime.test.mjs apps/web/test/pending-metadata.test.mjs
./node_modules/.bin/tsc -p apps/web/tsconfig.ui.json --noEmit
git diff --check 1a52c1c4f53a97cbbd0937f14a4379b88fd249b8...a2a854a285563d4560610577a0df099b041643bf
```

The eight regression cases cover single cancellation with a delivered late valid reply; same-render duplicate followed by immediate Cancel/unmount; a settled duplicate followed by Cancel; a settled duplicate followed by unmount; pending-state and original authentication-notice preservation; rerender-separated duplicate handling; ordinary success; and explicit retry after a completed authentication refusal.

## Evidence retention and limits

The companion `unlock-form-admission-independent-review-generation26.json` records each exact command, timestamps, expected/actual exit status, test counts where applicable, full commit/tree identities, raw log byte count and SHA-256, and compressed log byte count and SHA-256. Raw combined stdout/stderr is retained losslessly in deterministic gzip files under `evidence/unlock-form-admission-independent-review-generation26/`. The capture and identity-check scripts are retained as text for inspection. All gzip files were decompressed and compared with their recorded raw byte count and hash before handoff.

This review commit contains only review documentation and evidence. It does not change the frozen source. No local browser was launched; no broad suite, financial run, remote operation, publication, deployment, release activation, trust change, or broader ownership audit was performed. The coordinator must bind any later composed-source qualification to its own exact commit and tree. This result does not describe remote main or extend the previous generations' qualifications.

Standards findings: **0**; behavioral-scope findings: **0**. The material remaining limit is native browser event reachability, which was outside this assignment.
