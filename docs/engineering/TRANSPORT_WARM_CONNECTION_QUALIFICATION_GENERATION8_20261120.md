# Actual warmed-connection qualification — generation 8

## Source and observed failure

This is a **CI fixture qualification repair**, not an additional reproduced
product defect or a browser/native pass. Stable identifier:
`QUALIFY-WARMED-TRANSPORT-TRIALS`.

| Identity | Value |
| --- | --- |
| Base | PR207 `df10fe26a308407237f9ccbc636c8bb61f55b84f` |
| Base tree | `4b694124197ae8ce271f14307d12abc43c719406` |
| Tested source | `ec7ea30a098f8b46de4a13dbe9c5eacd307447a5` |
| Tested source tree | `fa36ed6fb1e6f3c72fe10d014c4919c0b9f75ee4` |
| Branch | `codex/generation8-transport-fixture-20261120` |

The coordinator read the completed
[PR207 browser job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44662758173/job/136044687707).
At 03:03:18 UTC on November 20, 2026, the diagnostic failed its assertion that
the send used a socket previously used by an actual RPC read. Its preceding
application-call, fetch, HTTP503 and physical-POST assertions had passed. The
later completed-response and error-array assertions had not yet run. This
failure establishes missing warmed-connection qualification; it does not
establish an application resend or prove that every fixture assertion passed.

The author independently compared the diagnostic in PR202, PR205 and PR207:
all three have blob `302a60d61c17055a33a6353a6f281629934592a5`. Earlier successful
browser executions remain source-bound history. They do not override the failed
PR207 job. Chromium's choice of a previously used connection was an assumed
fixture precondition; eight sequential reads alone did not establish it in the
failed execution.

## Narrow correction

The actual runtime RPC bundle is still built once from `rpc.ts` and `config.ts`.
The diagnostic still uses only a public string that is not a transaction. It
has no wallet, validator, signing key, funds or upstream-forwarding capability.

The diagnostic permits at most eight independent trials. Each owns a fresh
local HTTP server and browser context, and performs the original eight warm
reads, one application send and one follow-up read. It closes the context/server
and drains pending server handlers before returning evidence. Counters and
socket identities belong only to that trial; late requests cannot be counted
as a later trial's send.

Before a cold connection can cause another trial, the qualifier requires all
of the original behavior assertions:

- One application call, one fetch and one physical POST.
- Zero fetch rejections, HTTP503, `RPC_UNAVAILABLE` and one completed503 response.
- The exact public diagnostic parameters, all nine expected reads, and positive
  server-assigned socket identities.
- No fixture errors, page errors or unexpected HTTP/WebSocket requests.

Only then is warmth calculated from the send socket and the eight **preceding**
read sockets. The follow-up read cannot establish earlier warmth. An actual
warmed trial remains mandatory; eight clean cold trials fail with their records
attached to the error. Every execution, assertion or teardown error propagates
immediately and cannot be retried as another sampling trial. The browser closes
before a successful receipt is emitted.

The receipt retains its existing kind and adds `receiptVersion: 2`, every trial,
the qualifying trial number and the fixed bound. Top-level counts are totals
across **all** trials. A multi-trial run never reports globally one application
call, fetch or physical POST. Each individual trial must still prove one of each.

This does not guarantee that every host will provide a warmed case: a host that
never does remains failed. It does not qualify a raw connection reset, general
browser retransmission behavior, or a native-chain flow. Those explicit false
qualification flags and `ReleaseEnabled: 0` remain in the receipt.

## Actual local verification

On Node24.22.3, the following command passed **22/22**, with zero failures,
skips, cancellations or todo, in 1,022.721141 ms of reported test time:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  apps/web/test/solana-withheld-transport-qualification.test.mjs \
  apps/web/test/solana-localnet-rpc.test.mjs \
  apps/web/test/solana-localnet-withheld-send.test.mjs \
  apps/web/test/solana-localnet-send-evidence.test.mjs
```

Sixteen new control tests cover first/last permitted warmed trials, retained
cold-trial counts, exclusion of the follow-up read, bounded cold-only failure,
and immediate refusal without another trial after duplicate sends, extra
application/fetch calls, fetch rejection, wrong status, incomplete response,
missing warm read, fixture/page error or unexpected request. A thrown trial
error is preserved. These are qualifier-control tests with synthetic records;
they are not mocked-browser execution or new browser evidence. The other six
tests exercise the maintained RPC, command parser, withheld-response behavior
and physical-send evidence.

The actual runtime diagnostic artifact build passed, without launching Chromium:
4,812 bytes, SHA256
`8e1d06fb99e221589dfdd888a8b120ac45195dc63535a39de1f000f7b835cb0a`.
Syntax and whitespace checks passed. Source preservation checks found exactly
the three intended source/test paths changed; application source, all packages,
contracts, workflows, package manifests and lockfile were unchanged.

| Recorded log | SHA256 |
| --- | --- |
| Affected tests | `76e0465b7784894117a0c628b78ac508ee77fe8bbb0aedfa1946a79dc6856925` |
| Runtime artifact build | `7beeebe905fc4d988416a510464374fa7f48835b6123712e2172e85c5ea8a4f6` |

Logs and command receipts are under the author's
`verification/generation8-transport-fixture` directory. Dependencies were a
physical copy of the existing installed graph; no manifest or dependency changed.

## Remaining qualification and ownership

No browser was launched locally and no managed restriction was bypassed. The
full application suite, full builds, native validator and actual browser flows
were not rerun for this fixture-only change. The coordinator must independently
review this source and obtain the applicable exact-source hosted qualification.
Keep the original PR207 failure, both real Solana refund waits, and all native
send/marker/principal/fee assertions unchanged. An unchanged ancestor's success
does not qualify this descendant.

This work uses its own isolated worktree. No external successor tree, branch,
PR, workflow run, main ref, deployment, release, setting or fund was modified.
This report is appended after the tested source and changes no executable code.
## Coordinator composition verification

After adding independent test/report commit
`d4bf4b9d82fbbef70350dba5e7c737a6b9fcf238`, the coordinator executed the
combined affected selection on local source
`53bb347d830796998cb7e10781d0ab82df263fde`, tree
`688a2475a375a6caf2f847ce14c3573829b5f5ff`.
**All 28 tests passed**, with zero failures, cancellations, skips or todo.
This count comprises the 16 author controls, six independent cold-trial/teardown
controls and six maintained adjacent RPC/503/send-evidence tests; it is one
actual combined execution, not a sum substituted for execution.

Command: `node --import ./scripts/test-support/register-tsx.mjs --test`
with the author and independent transport-qualification files plus
`solana-localnet-rpc.test.mjs`, `solana-localnet-withheld-send.test.mjs` and
`solana-localnet-send-evidence.test.mjs`, all under `apps/web/test/`.
The run completed in 0.925 seconds; test-runner duration was 850.592911ms.
Saved log SHA-256:
`f77cc5e85573c90082a82af4048a214e67a6de4f5011d53d547868fd648608d3`.
Only this documentation addition follows that tested source. The actual hosted
Chromium/financial qualification remains required; no local browser was executed.
