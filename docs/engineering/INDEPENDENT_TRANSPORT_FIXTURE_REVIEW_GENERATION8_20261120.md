# Independent transport fixture review — generation 8

Date: 2026-11-20 UTC. Reviewer: root-owned independent review worker.

## Decision and exact source

The three-file repair has no open High or Medium findings in this bounded review.
It preserves the send oracle and requires an actual measured warmed socket. Only
a trial that satisfies every behavioral and physical assertion may be followed
by another trial when its send socket is cold. Execution, assertion, and teardown
failures abort qualification. Actual Chromium qualification remains a hosted gate.

| Item | Exact identity |
| --- | --- |
| Base PR207 source | `df10fe26a308407237f9ccbc636c8bb61f55b84f` |
| Base tree | `4b694124197ae8ce271f14307d12abc43c719406` |
| Reviewed implementation | `ec7ea30a098f8b46de4a13dbe9c5eacd307447a5` |
| Reviewed implementation tree | `fa36ed6fb1e6f3c72fe10d014c4919c0b9f75ee4` |
| Implementation parent | Exact base PR207 source above |
| Review branch | `codex/generation8-transport-independent-20261120` |
| Review worktree | `/workspace/scratch/6bd6e00af1c0/p2p-offramp-generation8-transport-independent` |

The implementation changes exactly these paths:

- `scripts/test-solana-withheld-send-browser.mjs`
- `scripts/lib/solana-withheld-transport-qualification.mjs`
- `apps/web/test/solana-withheld-transport-qualification.test.mjs`

This review adds this report and one independent test file. It changes no
implementation source and uses no dependencies beyond Node's built-in modules.
The author's checkout and the canonical handoff were not modified. No new agents,
browser launches, remote writes, or attempts to bypass local Chromium restrictions
were made for this review.

## Why the fixture correction is justified

The base diagnostic completes eight actual RPC reads before sending. Its original
warmth assertion compares the send's server-observed socket with the sockets of
those preliminary reads. Completing the reads does not itself constrain the
socket of the later native fetch. The reported PR207 job
`136044687707` / run `44662758173` failed that precondition after its observed
application-call, fetch, status/refusal, read-count, and physical-send checks.
The precise browser connection-pool cause was not established by this review.

The original diagnostic blob, `302a60d61c17055a33a6353a6f281629934592a5`, is identical
in PR202 `d753c0af23ff43743e34679e6b778b9ac0370da2`, PR205
`cd7d54ba075118a7ec043788c17718be842ee405`, and the base PR207 source. That failure
does not demonstrate a newly introduced application retry or a duplicate send.
The original completed-response and error-array assertions followed the warmth
assertion, so their success cannot be inferred from that failing run.

## Independent source assessment

### Every failure check precedes the sampling decision

The maintained `qualifyWarmedSolanaTransport` function awaits one completed trial
and then checks the exact observed object: one application call, one native fetch,
zero fetch failures, status `[503]`, and refusal `RPC_UNAVAILABLE`. It separately
requires nine reads, one physical send, completed `[503]`, empty fixture/page/
unexpected-request collections, and valid positive socket identifiers.

Only after those checks does it compare the send socket with the first eight read
sockets. The follow-up read is excluded. There is no catch around trial execution
or these assertions. A failure rejects the operation instead of entering another
iteration. Eight invariant-clean cold trials also reject; the last allowed trial
can qualify only through a measured prior-read socket match.

### Request and teardown ownership remain within each trial

Each trial owns a new browser context, local HTTP server, socket map, counters,
error collections, and pending-handler set. The actual production RPC browser
module, public diagnostic parameters, native fetch observation, preliminary
reads, and follow-up read are retained. The server still records a send before
checking its single-POST limit, validates the exact parameters, and completes the
same 503 response. A duplicate or malformed request cannot become an acceptable
cold result: it creates excess evidence or a fixture error.

The trial closes its context in `finally`, closes server connections, awaits the
server close callback, and drains pending request-handler promises before returning
its records. Handler failures are retained in the trial's error collection. There
is no counter reset that can attribute an earlier trial's recorded request to a
later trial. Context, server-close, and pending-handler rejection paths prevent a
record from reaching the qualifier. The outer routine also awaits browser closure
before printing success. A cleanup error may supersede an earlier diagnostic error
under JavaScript `finally` semantics, but it still fails the run and cannot permit
resampling or a success receipt.

These are source-level lifecycle conclusions. This review did not execute real
browser teardown or claim to observe network activity beyond the fixture's
server-side request records.

### Receipts retain every successful trial's evidence

Receipt version 2 reports aggregate application/fetch/physical-send counts and
statuses across every invariant-clean trial. It also includes individual trial
receipts, the qualified trial number, and the fixed bound. A result that used two
trials reports two sends at the top level. A cold trial is not silently discarded.
The aggregate `warmedConnection: true` is emitted only after an actual warm trial
qualified and browser closure succeeded.

The diagnostic continues to declare `rawResetQualified: false`,
`generalBrowserRetransmissionGuarantee: false`, `nativeChainQualified: false`, and
`ReleaseEnabled: 0`. It retains no validator-forwarding capability. The complete
503 helper is unchanged.

## Independent coverage added

The author's ten invalid-evidence cases introduce their violation on a warm
second trial after a clean cold first trial. They therefore did not directly
protect the original ordering risk: skipping a cold trial before inspecting its
error evidence.

`apps/web/test/solana-withheld-transport-independent.test.mjs` adds six tests:

- A cold first trial containing a fixture error must reject after one invocation.
- The same requirement for a page error.
- The same requirement for an unexpected request.
- The same requirement for a missing completed 503 response.
- The same requirement for a duplicate physical send.
- An asynchronous teardown rejection after a candidate cold return must preserve
  the rejection and stop after one invocation.

In the five invalid-record cases, a later invocation would return valid warm
evidence. The tests therefore detect an implementation that skips the invalid
cold result and later qualifies. The teardown case rejects from an awaited
`finally` after a return was selected, covering the callback's asynchronous
failure boundary. These tests exercise the actual maintained qualification module
with controlled records; they do not simulate or qualify Chromium itself.

## Executed verification

Runtime: Node `v24.22.3`. The implementation remained byte-identical to `ec7ea30`
throughout testing; the only test-source addition was the independent file above.

| Check | Actual result |
| --- | --- |
| Author's maintained pure qualification tests | 16 passed |
| Independent cold-failure/teardown tests | 6 passed |
| Combined exact two-file command | 22 passed; 0 failed, cancelled, skipped, or todo |
| `node --check` on the diagnostic, helper, and both test files | 4 passed |
| Exact changed-path and immutable-object preservation checks | Passed |

The combined test command was:

```sh
node --test apps/web/test/solana-withheld-transport-qualification.test.mjs apps/web/test/solana-withheld-transport-independent.test.mjs
```

Full evidence is retained at
`/workspace/scratch/6bd6e00af1c0/verification/generation8-transport-independent/`:

| Evidence | SHA-256 |
| --- | --- |
| `pure-controls.log` | `d0c0e6b4ead23175b619ba89fbefcb9262e19350f056ee28efb765ef38227896` |
| `syntax.json` | `88b4295afb2ce0379688ba2995b0d6281d1577eb1e30dbb87875f4e25acff1bb` |
| `preservation.json` | `72bceca0e84489072acbe85b33ed48c3819607c27ae3b3080f9d794a4fa157fe` |

The implementation changes no other tracked paths relative to the base. Explicit
object comparisons also confirmed unchanged production `rpc.ts`, `config.ts`, the
complete-503 helper, `package.json`, `package-lock.json`, and the entire workflows
tree. Contracts, production send behavior, native-chain harnesses, and release
policy consequently remain unchanged by this repair.

An initial preservation helper referenced a nonexistent `pnpm-lock.yaml` and
stopped. After enumerating the actual repository root, the corrected check above
verified the real `package-lock.json` and all declared paths. No source changed
during either check.

## Remaining gates and limits

The pure tests and syntax checks establish local control-flow behavior only. The
author's separate affected-RPC tests and artifact build were not rerun or counted
as independent results here. No broad suite, browser launch, validator, wallet,
transaction, or upstream operation was run.

The final published/composed source still requires actual hosted Chromium evidence
showing at least one measured warm trial, every per-trial invariant, and truthful
aggregate counts. Prior PR202 or PR205 browser successes do not qualify this exact
source. Eight cold trials remain a deliberate hard failure; this change does not
guarantee that Chromium will provide a qualifying socket in every run.

Existing exact-source native-chain and policy gates remain required before any
release or merge qualification. This report neither marks those gates complete
nor changes the release-disabled state. The no-open-High/Medium conclusion is
limited to the three-file fixture repair and the independent review scope above.
