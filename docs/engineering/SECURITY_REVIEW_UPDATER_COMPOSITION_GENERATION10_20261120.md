# Generation 10 updater composition security review

November 19 Pacific / November 20 UTC, 2026.

## Result: incomplete composition; no implementation signoff

This pass reviewed the historical updater browser composition against the newly
reviewed backup-verification runtime. It established a missing exact own-lock
retirement capability and identified an inherited acceptance-result oracle gap.
The author was stopped by automated cybersecurity screening before completing the
adaptation. The coordinator directed this reviewer to finish a report-only
checkpoint and not take over that blocked implementation. No correction, new
production source, native browser execution or current updater qualification is
claimed here.

The previously completed core and generation 9 backup prerequisite remain
separate source/qualification records. This report does not withdraw their scoped
results or silently include a new lifecycle capability in them.

## Exact reviewed source

| Source | Identity |
| --- | --- |
| Backup prerequisite reviewed by generation 9 | `637bedf9218176f933dac29039631ca56bcb42fd` |
| Its tree | `91ef7b11d8a1cf9378022f9c283136c8a1666f4f` |
| Five-file prerequisite implementation | `74d414312dacbceb35d554aa791be319a326c504` |
| Historical browser composition | PR81 `a45e932a37153590bc329c1e9012cf18e37fe12c` |
| Recovered source-only browser checkpoint | `01f40b3e009d77b520ba0b6d7881fa24fc6301f9` |
| Recovered tree | `c5895d592dc90af26691d815bdb663bfc821fb7e` |

Git comparison confirmed the two recovered files exactly match PR81:
`scripts/fixtures/release-update-browser.ts` and
`scripts/test-release-update-browser.mjs`. The recovered branch was clean at the
observed checkpoint. It contains no completed current adaptation. This review
branch starts at the prerequisite source and changes only this report and its
small evidence JSON.

## Confirmed capability mismatch

The historical backup adapter captures the unlocked profile and
`AppServices.selectionScope()`. After its own successful `services.lock()`, it
accepts a locked state only if the observed scope is the captured scope plus one.
Its later `current()` compares that locked scope, the locked public state and a
null profile. The maintained updater contract requires an additional
lock/switch/unlock to retire that exact owned transition.

The facade's selection scope is a lazy counter of observed runtime handle
identity. A locked state has a null handle. A second lock while already locked
advances the actual runtime protocol generation but does not change the facade's
observed handle. Its scope therefore cannot establish the exact locked generation
required by this adapter.

A finite probe used the actual `startAppServices` and `AppRuntime` implementations
with a controlled message port. It unlocked a synthetic profile, observed scope,
completed one lock, observed scope, completed a second lock, and inspected the
actual sent command generations. The result was:

```json
{"selected":1,"first":2,"second":2,"generations":[1,2],"exactLockedGenerationExposed":false}
```

The probe asserted both the first scope increase and the second command's actual
generation increase. It exited successfully. This is evidence of the capability
mismatch, not a passing test of exact own-lock retirement. It used no native
Worker, IndexedDB, wallet, network or financial operation. The profile and
passphrase were synthetic. No new product-defect or financial-exploit count is
assigned: this is an unmet requirement of the incomplete updater composition.

A correct future composition needs a runtime-owned lifecycle lease/token or an
equivalent exact retirement capability. Its own-lock transition must capture
ownership atomically, wait for the actual lock acknowledgment, and retire on an
additional lock before or after acknowledgment, another selection or runtime
closure. Existing selectionScope consumer semantics should remain intact. No such
implementation is supplied or approved by this checkpoint.

## Inherited browser result-oracle gap

The historical runner's `click()` waits only for `lastAccept !== undefined`.
After the first acceptance attempt, later clicks can satisfy that wait using the
previous result. The author independently identified this source-level issue and
proposed binding each completed result to a monotone attempt identity. That
adaptation was not completed in recovered commit01f40b3. No actual current browser
run or deterministic execution of this runner is claimed. A fresh result binding
is required before treating successive rejection assertions as current evidence.

## Boundaries inspected in existing source

- The fixture derives its gesture from a trusted DOM event and active browser
  user activation. Its owner consumes the local gesture flag. A programmatic
  activation rejection still needs actual current browser coverage.
- The actual updater controller retains module-wide physical admission until
  ignored operations drain. The fixture's actual EVM adapter uses a synthetic
  held provider; its wallet lease refuses while any provider promise physically
  waits, including after logical cancellation.
- Backup authorization comes from the current Worker-owned verification fact and
  fresh persisted revision checks. The controller calls it before the accepted
  floor write and again afterward. Imported receipt/readiness flags do not grant
  authorization.
- The accepted store is a separate origin-local namespace with strict-durability
  compare-and-swap. The controller awaits floor advancement before disconnect,
  lock and navigation. Failure after a durable write retains the floor.
- The verified destination is the signed CID's subdomain under the exact compiled
  HTTPS gateway, with root path and no credentials/query/hash. Strict transport
  mode refuses native direct navigation. There is no fallback gateway or route.
- The historical native harness asserts destination locked/disconnected state,
  empty destination profile inventory, wrong-pass refusal, explicit fresh-key
  restore, source-file refusal as destination backup proof, and unchanged source
  ciphertext. Those assertions remain source evidence only for this checkpoint.

These observations are source review, not new independent execution of each
existing updater or storage test. The generation 8 cancellation and generation 9
backup verification suites are not recounted as this worker's executions.

## Synthetic trust and remaining gates

The historical harness compiles an ephemeral synthetic release key, local HTTPS
certificate/SPKI, local source/gateway mapping and held synthetic provider. Those
are test-only capabilities. Default trust remains unset and the updater absent
from the default application graph. This source does not authorize production
keys, origin transitions, default network activation, deployments or real funds.
`ReleaseEnabled=0` remains.

No broad suite, typecheck, build, native browser/IndexedDB, actual origin transition
or physical wallet/device test was run by this reviewer. The local managed browser
restriction was not bypassed. The incomplete adapter, inherited stale-result
oracle and outstanding native execution prevent a completed F24 composition
signoff. Preserve the separately qualified prerequisite and this explicit gap;
do not relabel historical browser results as current evidence.
