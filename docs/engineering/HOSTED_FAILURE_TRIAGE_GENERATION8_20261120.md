# Hosted failure triage — generation 8

November 20, 2026 UTC / November 19 America/Vancouver task date.

## Outcome and scope

Two completed hosted failures are now bound to their actual checkout, immutable fixture source and captured log. **PR207 failed the warmed-connection assertion in its early acknowledgment diagnostic. PR204 executed the older connection-destroying fixture, recorded a duplicate physical-send assertion, then timed out on a disabled restore button.** Neither job is a passing qualification result.

This is a report-only continuation from published PR200 `0b6533cd553e453a0a12aa0e089cf45db9e078c2`, tree `28de8d5b65659d79a0b3bc48d4a427b161053aca`. The worker adds only this report and `hosted-failure-triage-generation8.json`. It did not edit application/fixture code, run tests or builds, launch agents, change a remote ref, touch the blocked updater fixture, or modify either coordinator's canonical handoff/state. The dated branch inventory is unchanged. No new repair is counted by this triage.

## Exact completed logs and source identities

| Evidence | PR207 early browser diagnostic | PR204 full native-browser job |
| --- | --- | --- |
| Job | [136044687707](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44662758173/job/136044687707) | [136023880105](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44656491793/job/136023880105) |
| Published head | `df10fe26a308407237f9ccbc636c8bb61f55b84f` | `98d33db64622eab3f5f4ece6141d445d255245e7` |
| Actual checkout from completed log | `0aba9abd40c39920b8c1cfe9a94fd5870d01f1f9` | `c579e9a646855b5d821caf97249df9872b3e98e1` |
| Verified checkout tree | `4b694124197ae8ce271f14307d12abc43c719406` | `f5c5bb060732a892ba4eb91532e82ed79f64f2c4` |
| Ordered checkout parents | main`5c5a84ef6300330700c8b0ca54d074ac113f08be`, PR207 | Favorites`f5241c09f268a7a6841a5760ed0faa90b5b7f005`, PR204 |
| Log bytes |47,786 |178,156 |
| SHA-256 |`71accc6cfeecce06b070dadff5ea016adc314e9c3bd370e42370a12f48281337` |`d9001af7306c83a44d86201f1cf6bbad44a6353ca66843bc05b233f879c4f566` |

Both files were read and independently rehashed from `verification/generation8-hosted-triage/`. Their hashes match the coordinator's captured evidence. The checkout SHA comes from each job's actual `git log -1 --format=%H` output. Fetched GitHub commit objects supplied the trees and ordered parents above. The JSON retains exact failure timestamps and local evidence filenames.

## PR207: established failure and assertion boundary

At 03:03:18 UTC, step 6, **Verify one actual browser POST for a withheld Solana acknowledgment**, failed in `scripts/test-solana-withheld-send-browser.mjs` at line 101. The assertion requires the one send's server-side socket to match a socket used by one of the eight preceding RPC reads. It evaluated false. The process exited1 under Node 24.22.3; the installed Chromium reported 158.0.8127.36.

The diagnostic Git blob is **`302a60d61c17055a33a6353a6f281629934592a5`**, independently verified identical at PR202 `d753c0af…`, PR205 `cd7d54ba…` and PR207 `df10fe26…`. This establishes that the diagnostic source itself did not change between those heads. It does not establish identical scheduling or connection reuse across executions.

The ordering of the immutable script matters:

| Assertion position | What the completed failure establishes |
| --- | --- |
| Line99, before the failure | The asserted observation matched **one application call, one fetch, zero fetch failures, HTTP status503 and `RPC_UNAVAILABLE`**. |
| Line100, before the failure | The asserted counts matched **nine read records** including the follow-up read, and **one physical send POST**. |
| Line101 | The required previously warmed socket identity **did not match**. |
| Line102, after the failure | The assertions on `completed:[503]`, empty server errors, empty page errors and empty unexpected requests **were not executed**. |
| Lines103–106, after the failure | The success JSON receipt **was not emitted**. |

The pre-failure values are inferred from execution reaching line 101 after the synchronous assertions at 99–100 completed. They are not a printed successful receipt. In particular, **do not report completed-response accounting, zero fixture/page errors or zero unexpected requests as passing for this run**. Receiving status503 and passing the earlier fetch assertion do not substitute for the later server-completion assertion.

The warmed-socket mismatch is demonstrated. Its precise connection-pool cause remains unproven. This log does not establish a new application resend regression: the preceding assertion accepted one physical POST. It also does not qualify arbitrary transport resets, general Chromium retransmission behavior or native financial execution.

### Current correction ownership

The coordinator assigned **`/root/generation8_transport_fixture`**, recorded as its 35th actually launched native worker. The agent was directly observed running during this triage. The coordinator reports that an existing relay reviewer completed the independent design review. **Implementation and execution are still in progress; this report does not mark the correction complete.** Resuming this report worker adds no new worker.

The owned follow-up must establish the intended warmed-connection condition while retaining the one-call/one-fetch/one-physical-POST checks and all completion/error checks. The corrected source needs its own independent verification and hosted execution. No assertion or financial qualification gate was weakened here.

## PR204: inherited old-source failure evidence

PR204's actual checkout contains `scripts/lib/solana-localnet-fixture.mjs` blob **`59fb525d0e9b49baf117dc7792d585904d51e281`**. Its withheld-send branch still calls **`response.destroy()`** before completing an HTTP response. Source comparison against PR202 and PR207 confirms their replacement fixture blob **`44dcbfa3c204f782448cf113169d2c1f3652a13b`** instead calls `rejectWithheldSolanaSend(response, cors)`, the completed 503 helper. PR204 did not execute that corrected fixture.

The completed log records three earlier native-browser journeys as successful. At **02:55:17 UTC**, the unchanged physical-send oracle rejects a repeated signed transaction: `assertSolanaSendMarked` raises the one-physical-attempt assertion at `scripts/lib/solana-localnet-send-evidence.mjs:53`.

At **02:56:02 UTC**, Playwright then reports a 45,000ms timeout at the restore click. The target button **Restore with a fresh key** remained disabled. The process exits 1 at 02:56:02.916 UTC. There is no successful final browser receipt.

The duplicate-send assertion precedes the restore timeout; the log alone does not prove that one caused the other. These observations belong to the already recorded legacy withholding/restore failure family. They are **historical failed-source evidence, not a newly completed repair**, and they must not be attributed to the later completed 503 helper. Preserve the strict send/marker oracle and both real refund minima when qualifying the corrected descendant.

## External work already covered

### Relay composition is published

Fresh PR metadata at **03:15:51 UTC** confirms draft [PR206](https://github.com/djshellshoxxx/p2p-offramp/pull/206) at **`825a85a55a1e0a43d6f416696fabee94913a2f18`**, targeting PR207 `df10fe26…`. Its published tree **`243d178ac6a3822f71ddf3ad3073cc1d8020b864`** equals clean external report checkpoint `d4199d2c1ac4f3a6abaebd2571a031948fcfef8f`. Its ordered parents are the previous relay head `e848ae19574e8b7f4cb040082df5255ee5a63f1e` and corrected core PR207.

The committed [external relay composition report](https://github.com/djshellshoxxx/p2p-offramp/blob/825a85a55a1e0a43d6f416696fabee94913a2f18/docs/engineering/RELAY_CORE_COMPOSITION_GENERATION11_20261120.md) records frozen source **`46727d2a8ee1fd58cde15dcc252e1692408830f4`**, tree `6745c3b148aed3e13c092cc1d917541c24a9a482`, with **2,265/2,265 combined tests**, zero failures/skips/cancellations, four TypeScript projects, 57 policy tests, boundaries and default build passing. A separate publication audit checked the exact source union. These are attributed external executions and source checks; this triage worker did not rerun them. The author's report explicitly does not claim native Nostr, actual browser or hosted qualification for that composition.

**Do not duplicate this relay recomposition.** Its publication does not diagnose or clear the two failures discussed above.

### Separate successor handoff is verified

The live `codex/successor-handoff-20261120` ref resolves to **`3b538fd4586b6fc00846262d67956a2125b6c9f1`**, verified by `git ls-remote`. The fetched GitHub object has tree **`c7323a825a19aa8cff7b4b24ae5ebe7a129fafcf`**, matching local clean checkpoint `3393067e0e3de8aecda63acb139c248dac7afe39`. Its ordered parents are PR208 `0e148564743b1ee353abdbdf8931fec464f09870` and the earlier PR200 `9d1129f189c2b7e5661384ade94da5270227af2e`.

That handoff preserves the parallel coordinator's ownership of PR200. Its prior hosted snapshot is dated and does not override the newly read per-job failures. This report preserves both histories without editing either canonical handoff or external worktree.

## Continuation

Keep the PR207 diagnostic correction with its current owner until it is complete, independently reviewed and executed on its new exact source. Keep PR204's failed legacy run historical. Preserve the completed relay composition and current source-specific hosted gates. Read both current coordination records and resolve live heads before any later mutation. No product/security repair, additional test pass or main merge is claimed by this evidence-only commit.
