# Generation 29 — explicit offline retention preview

## Result and active integration plan

**The staged application now exposes the existing DATA01 offline retention
preview through its real Worker/runtime boundary and an explicit Settings
panel.** It returns validated scalar counts and a snapshot revision. Archive
review suggestions remain protected and confer no deletion authority. The
storage implementation, 30-day review rule and existing saved-review deletion
behavior are unchanged.

The combined source is frozen at
`fa7c1a11ff990be4646053731f1030d09eb8f9b6`, tree
`dc34c0065a6bc4d66b4195b16d573ef1ec7463a5`, on
`codex/retention-preview-continuation-g29-20261120`.
It passed **2,555/2,555 tests**, with zero failures, skips, cancellations or
todos, plus all six additional qualification commands.
The independent review accepted the bounded integration with **no actionable
Standards or Specification findings** on that exact combined source.

**This is a separate follow-up above the frozen published PR236.** It does not
replace that aggregate or change its head. PR236 remains the one main-target
aggregate containing the exact published PR233, PR234 and PR235 ancestry. Keep
those heads and their branches intact while PR236 qualifies; require its guarded
merge and main/ancestry readback before reconciling the contained PRs. Earlier
sequential merge/retarget instructions remain superseded by that aggregate plan.

## Exact source and publication identities

| Checkpoint | Exact identity |
| --- | --- |
| Last coordinator-observed main | `8e836baa877b676a863c877003e277b638fc5061` |
| Published [PR236](https://github.com/djshellshoxxx/p2p-offramp/pull/236) | `d9ddcf53d82100f05de7346143a0ad00d43c2c1a` |
| PR236 complete tree | `437323a382952b9623a875c818f8af005a5d4563` |
| PR236 observed proposed merge | `af2750c21f47f59898e3a7d8670509095e2dcf94` |
| Backend author source | `5ad059fa8b77cfb8beffcf2f1889e5f19d727ea4` |
| Integrated backend source, identical complete tree | `fbf60f018631ff5ae6d66358d2a9413b560b822f`; tree `05ff7a561aea207d6d54dad08d08fadd5cd8cf45` |
| Backend author evidence / integrated evidence | `b57b5b38bc5bec61b9d1fef00d887a4f13db9452` / `5d6ae5a00c6834eb684c34c93f5a49bd9d9eee19` |
| UI author source | `0d1d929d8bfb97b9772f84eb5fa3425de6fd3602`; tree `a9010c02a383346ab7041d5549b9cb09eb7f2471` |
| Combined source containing the exact four UI path blobs | `fa7c1a11ff990be4646053731f1030d09eb8f9b6` |
| Combined complete tree | `dc34c0065a6bc4d66b4195b16d573ef1ec7463a5` |
| UI author evidence | `3fbad18399f57f559572f5ceb8a2dbb941df2be3` |
| Independent review evidence | `8c45b3d31b090093dc67c1bf665a308fdffee55a`; tree `84b840e2c3d1d033cb7a6a14dceafa12641d37dd` |

The observed proposed PR236 merge has PR236's complete tree and ordered parents
`8e836baa877b676a863c877003e277b638fc5061`, then
`d9ddcf53d82100f05de7346143a0ad00d43c2c1a`. It is a proposed merge, not evidence
that main changed. At 18:36:42 UTC on 2026-11-20, PR236 remained open and unmerged, with all
14 current checks queued and Snyk successful. It was not merge-qualified.
Generation 29 publication and current-target hosted acceptance remain pending at
this checkpoint; its local qualification does not qualify PR236 or a future
published child against a different target.

Compared with PR236, seven non-documentation paths change and four are added;
none are removed. Of PR236's 1,022 non-documentation entries, 1,015 remain exact,
producing 1,026 entries in the combined frozen source. All 1,026 tested entries
must remain exact through documentation/evidence packaging and publication.
Backend and UI author identities retain their own source scope; the UI author's
complete tree differs from the combined tree because the integration includes
backend evidence. Exact UI path preservation does not claim whole-tree identity.

## DATA01 behavior and read-only boundary

The [DATA01 specification](../../00_PLANNING_AND_THREAT_MODELING/feature_0.8_data_governance/module_0.8.1_data_lifecycle/spec-data-retention-matrix.md)
already specifies an offline archive-review suggestion after 30 days, continued
protection for unresolved recovery records, and separate explicit native review
and deletion. The existing `RetentionService.planRetention` implements the
conservative classification. Generation 29 adds the missing runtime operation
and UI composition rather than a new retention policy.

`AppServices.planRetention(nowMs, signal?)` uses the currently selected profile.
The caller's timestamp must be a nonnegative safe integer. The public response
contains exactly version 1, the local revision, archive-review and protected
counts, `reviewedDeleteCount: 0`, `logicalOnly: true`, and
`backupAndRemoteCopiesUnaffected: true`. The schema rejects extra fields,
accessors, malformed counts or revisions, counts above `MAX_RECORDS`, archive
counts greater than protected counts, and nonzero deletion eligibility.
No record ID, content, native proof or opaque retained plan is returned.

The Worker constructs the real retention service with its captured vault session
and no native authority. It calls only the offline planning method, copies the
validated scalar projection and disposes the service. After disposal, it calls
the real vault's persisted `assertFresh` again. The returned revision must agree
with the preview and captured session, and the same selection, session ID and
current revision must still hold. Runtime generation, selection, abort, idle and
request-deadline checks continue to guard publication. This final persisted
read also covers a concurrent write that produces no cross-tab notification;
cleanup cannot leave an opaque deletion capability in the UI.

The preview performs no vault writes, backup changes, network requests or native
proof calls. Local journal labels `finalized` or `failed` and stored chat
records can contribute age-based suggestions at the existing exact 30-day
threshold. Saved reviews have no stored collection timestamp and receive no
invented age. Future timestamps, unknown/future payloads, identity records,
preferences and unresolved history remain protected. Every suggested record is
also included in the protected count. These categories overlap and must not be
added to produce a total. The zero reviewed-delete count belongs to this preview;
it does not remove the existing explicit saved-review deletion operation.

## Settings panel, lifecycle and selected-catalog rendering

The new `RetentionPreviewPanel` is composed into Settings. Rendering, mounting,
rerendering and locale selection do not inspect records or read the clock.
An explicit **Preview local records offline** action captures the current time
and selected profile. Pending state disables that action and exposes Cancel.
Unavailable or locked services disable preview; the display explains that
locking clears the preview while preserving encrypted recovery data.

A synchronous request ref owns the admitted action before the disabled state
renders. Same-render duplicate calls cannot replace its cancellation target.
Cancellation, unmount, facade replacement, lock and profile/selection replacement
retire pending work and suppress late results. A same-profile reopen receives a
new selection scope even if the facade's stable public unlocked snapshot is
reused; old counts are not restored. A fresh request clears earlier counts
before it awaits a result, and a late cancelled request cannot clear a newer
pending request. These are controlled handler and runtime properties; native
browser event reachability remains a separate qualification.

The view retains semantic state, scalar values and fixed error codes. Rendering
resolves pending, cancellation, errors, counts and revision through the selected
catalog. Locale changes do not repeat the operation or replace its controller.
The UI explicitly says that suggestions are included in the protected count and
that the counts describe one local revision; the user runs another preview after
changes. This is a snapshot display, not continuous freshness monitoring.

Saved-review help now names the existing **Delete from profile** control on
Offers and distinguishes it from **Remove from session**. It tells the user to
unlock and load saved reviews after an interrupted save or deletion before
retrying. The existing limit of eight saved reviews and deletion implementation
are unchanged. Settings does not expose native eligibility review, retention
consent or retention deletion controls.

## Author and independent evidence

| Evidence scope | Actual result and interpretation |
| --- | --- |
| Backend protocol baseline | 3 pass / 2 fail on original production because the ordinary `planRetention` command and reply are not yet allowed. This is an absent-interface baseline. |
| Backend new protocol/composition selection | 19/19 passed; real encrypted vault, real retention service and real Worker endpoint with controlled persistence. Document delivery-order cases use a labeled synthetic transport. |
| Backend final focused and adjacent selection | 148/148 passed, including all 19 new cases; four-project TypeScript, import boundaries and complete staged whitespace checks passed. |
| UI focused selection | 31/31 passed on the frozen four-path source. |
| UI adjacent Settings/locale/routes selection | 22/22 passed; UI TypeScript, boundaries and complete source whitespace checks passed. |
| UI initial harness run | 13 pass / 18 fail because expected messages were formatted across host/VM realms. The correction keeps expected formatting in the fixture realm; the failed log and pre-correction source patch are retained as harness evidence, not product RED. |
| Independent review | 21/21 on the backend source and 33/33 on the combined source, sharing the same two reviewer cleanup probes; typechecking and complete whitespace checks passed. No actionable Standards or Specification findings. |

The independent reviewer ran 19 maintained backend cases plus two original
cleanup probes on the backend source, then 31 maintained UI cases plus the same
two probes on the combined source. These **21/21** and **33/33** runs share the
two probes and are not a sum of distinct cases. One probe queues a same-session
fixture commit from service disposal: the final persisted freshness check
returns `CONFLICT` and suppresses the old preview. Its sole write is the probe's
explicit fixture commit. The other throws after disposal and receives a fixed
`STORAGE_UNAVAILABLE` result without successful output, exception detail or a
vault write. The reviewer also passed four-project backend typechecking, the
combined UI TypeScript project and complete source-range whitespace checks.

The review independently verified the frozen source union, exact backend/UI
blobs, unchanged storage/deletion policy and complete baseline preservation
outside the stated delta. It checked all eight backend compressed logs and all
nine UI compressed artifacts, including the unsuccessful baseline/harness
outputs and the UI patch, against both raw and compressed hashes. Its direct
coordinator-evidence check verified all seven raw logs, 25 listed retained build
assets, six graph files and 262 graph module references. Local-build evidence
files were also accounted for. These are evidence checks, not additional product
tests or a second full-suite run.

The native preparation log and retained default Worker/graphs were verified.
The maintained command removed its temporary compiled fixture directory; the
review does not claim that those 37 reported fixture modules were retained or
independently rehashed. No native scenarios ran. The review commit has the exact
combined source as its parent and changes only documentation/evidence.

The backend selection covers exact-threshold and future timestamps, empty and
locked profiles, wrong-profile requests, durable cross-tab changes, same-session
revision changes, changes after the final persisted read, cleanup-triggered
revocation, request expiry, admitted abort, BUSY handling, replacement after
response settlement, malformed replies and fixed errors. Successful cases check
unchanged encrypted storage, zero writes, native calls or fetches, and disposal before
publication.

The UI selection executes maintained TSX and selected-catalog code with controlled
hook scheduling and service results. Its explicitly labeled actual facade/runtime
cases use synthetic Worker replies; they check actual protocol validation,
correlation and cancellation, without claiming native browser or persistence
execution. Synthetic catalog fixtures do not qualify supported translations;
production remains English-only/draft.

Read the [backend author report](RETENTION_PREVIEW_BACKEND_GENERATION29_20261120.md)
and [backend receipt](../execution/retention-preview-backend-generation29-20261120/receipt.json),
the [UI author report](../evidence/RETENTION-PREVIEW-UI-G29-20261120/README.md)
and [UI manifest](../evidence/RETENTION-PREVIEW-UI-G29-20261120/manifest.json),
and the [independent review](INDEPENDENT_RETENTION_PREVIEW_REVIEW_GENERATION29_20261120.md)
and [review receipt](retention-preview-independent-review-generation29.json).
Focused selections overlap the complete suite and each other; their counts are
not added to the full-suite total. Author, reviewer and coordinator runs remain
separately attributed, and unsuccessful output is retained with its actual cause.

## Combined-source qualification

The seven-command run began at **18:32:00 UTC on 2026-11-20**. The full suite
completed at 18:33:40 UTC and the entire batch at **18:33:52 UTC**. Its complete
full-suite raw log is 259,041 bytes, SHA-256
`79afae0244aea64cf116024c7bf36828ebff3f97804b035366ddfb52d66f4af6`.
All seven coordinator commands ran against the clean frozen combined source
`fa7c1a11ff990be4646053731f1030d09eb8f9b6`, tree
`dc34c0065a6bc4d66b4195b16d573ef1ec7463a5`.

| Command | Actual result |
| --- | --- |
| `npm test` | 2,555/2,555; zero failed, skipped, cancelled or todo |
| `npm run typecheck` | All four TypeScript projects passed |
| `npm run test:build-policy` | 58/58 passed |
| `npm run check:boundaries` | 242 production source files / 149 core entry modules |
| Default build | 12 files / 809,472 bytes |
| Demo build | 13 files / 821,570 bytes |
| Native updater fixture preparation, build only | 37 fixture modules reported; strict fixture compilation passed; `nativeExecuted: false` |

The [combined qualification receipt](qualification-generation29.json) and
[retained-log index](retained-logs-generation29.json) bind exact source,
commands, execution times, complete logs and artifact hashes.

Default document/vault-Worker/QR graph membership is **96/30/4** modules; demo
membership is **98/30/4**. The emitted vault Worker is
`assets/vault.worker-yOnLqpF_.js`, 102,355 bytes, SHA-256
`d3bc5bf253cf1e30914a932e126d2d41bedc19d217d9baa94748975243c04165`.
Both builds retain `ReleaseEnabled=0`, no signed release or release acceptance,
and no configured connection origin.

The native fixture remains build-only with `nativeExecuted: false`; no native
browser or financial journey is claimed from this local batch. Static import
boundaries and build graphs do not establish native reachability, complete
runtime isolation or deployment acceptance.

## Integration, remaining work and release boundary

This standalone follow-up is **D8 Tier B**: it exposes non-custody product UI
and read-only runtime counts while preserving storage algorithms and financial,
recovery and deletion authority. The [accepted decision index](../adr/ACCEPTED-DECISIONS-2026-11-04.md)
keeps the [detailed D8 packet](../adr/proposed/D8-merge-policy-and-branch-protection.md)
authoritative where its table is shorter. Require the standalone CodeRabbit or
Qodo review pass with findings answered, in addition to applicable green checks
and the independent review. This local review and parent PR236's combined-source
classification do not substitute for that named review. Its completion is not
claimed at this pre-publication checkpoint.

1. Preserve PR236's exact source and current main target while its applicable
   hosted browser, native financial and CodeQL checks complete. Do not amend,
   replace or supersede PR236 with generation 29. A change to main requires
   ordinary reconciliation and qualification of the actual proposed target.
2. Keep PR233 at `92663e46508b06645111d9c713beb82d3a6d1a0f`, PR234 at
   `477777dc152cd3148ba7f25a75ce8f00dc1b03b5`, and PR235 at
   `bca96b796db18d69563ae5f0395452494a0dacd5` frozen. After PR236's qualified,
   expected-head guarded merge, read back main/tree/ordered parents and prove
   each original head is an ancestor before reconciling those contained PRs.
   Retain all original branches and evidence.
3. Publish generation 29 as its separate follow-up with the tested
   non-documentation set unchanged and a source/evidence mapping. Read back its
   actual head, base and proposed merge. If stacked on PR236, requalify against
   main after the parent merge and any retarget; existing parent checks and
   earlier local results do not transfer to a changed source or target.
4. Keep native retention authority, closed dependency review, explicit deletion
   consent and the destructive workflow as separate unfinished application
   scope. The new Settings panel adds no such authority. Preserve the existing
   saved-review operation while reviewing broader retention behavior separately.

Trusted application/wallet/source configuration, native accepted-floor
durability, physical wallet quiescence, trusted activation, actual navigation,
destination startup and cross-origin storage/restore remain unfinished. The
default updater is unconfigured and production trust is unset. Supported-locale
semantics, assistive technology, physical-device acceptance, live Wiki
publication and full Solana negotiation/funding remain separate requirements.

Optional PR224–232 and audits 184–186 retain their independent owners and
histories. Default optional imports remain excluded. No deployment, release,
live-funds operation, trust provisioning or default activation follows from
this work; `ReleaseEnabled=0` remains fixed. Historical handoff and feature-matrix
suffixes remain byte-for-byte intact beneath the generation 29 overlays; their
older present-tense labels do not override this dated checkpoint or later
source-bound receipts.
