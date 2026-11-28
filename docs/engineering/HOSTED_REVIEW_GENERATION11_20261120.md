# Hosted qualification review — generation 11

Snapshot: **November 19, 2026, 6:53–6:55 p.m. Pacific** / November 20,
02:53:45–02:55:39 UTC. This is a bounded read-only inspection, not a live monitor.

## Result

**PR202 has now completed both native Solana gates successfully.** The completed
job log establishes the actual checked-out source and contains successful client
and browser receipts. This is new evidence since generation 9, when the second
gate was still running.

**Corrected core PR207 and backup prerequisite PR208 remain unqualified by hosted
execution in this snapshot:** all five observed workflows are queued. Their
foundation and native jobs are also queued. PR203 and PR205 have completed the
first native validator/refund gate and are running the second actual-Worker/refund
gate. Their running archives still return HTTP404 `BlobNotFound`.

No new failing gate was observed in the inspected set. No rerun, cancellation,
source/workflow change, gate relaxation, reduced refund wait, merge, deployment,
release or funds operation occurred. PR205 remains draft; its ancestor successes
cannot resolve the repairs absent from its source.

## Current workflow snapshot

| PR | Vault foundation | Solana escrow | EVM escrow | Specification inventory | Nostr relay |
| --- | --- | --- | --- | --- | --- |
| [202](https://github.com/djshellshoxxx/p2p-offramp/pull/202) | Success | **Success** | Success | Success | Success |
| [203](https://github.com/djshellshoxxx/p2p-offramp/pull/203) | Success | In progress, second native gate | Success | Success | Success |
| [205](https://github.com/djshellshoxxx/p2p-offramp/pull/205) | Success | In progress, second native gate | Success | Success | Success |
| [207](https://github.com/djshellshoxxx/p2p-offramp/pull/207) | Queued | Queued | Queued | Queued | Queued |
| [208](https://github.com/djshellshoxxx/p2p-offramp/pull/208) | Queued | Queued | Queued | Queued | Queued |

The [JSON companion](HOSTED_REVIEW_GENERATION11_20261120.json) records exact run
and job IDs, step conclusions, source identities, log digest and scope limits.
The connected wrappers return pull-request-triggered runs on the first page and
latest-attempt jobs on the first page; this is not an exhaustive historical run
inventory. PR206 is being integrated separately by the coordinator and was not
requalified in this report.

## Exact source binding

| PR | Head | Inspected merge object | Tree |
| --- | --- | --- | --- |
| 202 | `d753c0af23ff43743e34679e6b778b9ac0370da2` | `32f7353551660a6c1e3e9302eecf3647b482c0c3` | `25d637fa5d6596e44cdae060ccc407f0c23186ee` |
| 207 | `df10fe26a308407237f9ccbc636c8bb61f55b84f` | `0aba9abd40c39920b8c1cfe9a94fd5870d01f1f9` | `4b694124197ae8ce271f14307d12abc43c719406` |
| 208 | `0e148564743b1ee353abdbdf8931fec464f09870` | `300c33b9dcfae050e5a4c816513176c5eac65a5d` | `6a4417741c0b399dde894773f29854f7a2d36228` |

PR202's checkout is taken from its completed native job's actual
`git log -1 --format=%H` output. The fetched Git object has ordered parents
`2b23ee614ff2dd05bd3a6e79f1278658c30a3909` and its live head, and its tree equals
the head tree.

PR207/208 identities are **proposed merge objects, not observed execution
checkouts**. Their jobs have not produced an executed checkout log. Each fetched
object has the expected ordered base/head parents and a tree equal to its PR
head. PR207's base is main `5c5a84ef6300330700c8b0ca54d074ac113f08be`; PR208's
base is PR207's head. The inspected objects match the observed live heads.

## Completed PR202 native evidence

The [program job 136009253374](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44652103777/job/136009253374)
completed successfully. Both step 14, **Real validator client acceptance including
refund and recovery**, and step 16, **Actual Worker encrypted Solana recovery and
real-time refund**, passed. The dependency-cache save was skipped by its existing
push-to-main condition; neither native gate was skipped.

The client receipt contains **62 successful checks**, zero failed checks and
13 `sendTransaction` calls. Its refund waited **1,851 real seconds**; the complete
client run lasted 1,908 seconds, ending at 02:05:28 UTC. It used pinned Agave 4.1.2.
Its declared localnet deviation remains explicit: `getGenesisHash` was answered
with the compiled synthetic genesis constant. This receipt does not establish an
unmodified public-network client flow.

The separate browser receipt, logged at 02:39:42 UTC, reports five successful
journeys over 2,045 seconds, with:

- Actual module Worker and encrypted IndexedDB.
- Actual genesis RPC and real clock; no genesis rewrite or clock warp.
- Eight wallet prompts and seven distinct application-send signatures, each with
  a durable `sendMarked` record; one deliberately withheld send and one explicit
  replacement record.
- Fresh-profile recovery preserving the unknown marker and no physical send
  during the export/lock/restore sequence.
- Separate explicit release/payout and refund/payout operations, exact original
  buyer principal, and original seller principal minus actual transaction fees.
- Zero fixture errors, `ReleaseEnabled=0`, and public-network/fresh-negotiation
  qualification explicitly false.

The seven-signature count was independently computed from the recorded sends.
The maintained harness's exact send, marker, principal, fee, unexpected-request
and fixture-error assertions remain present, as do both real 1,800-second refund
minima. No success was inferred merely from the receipt's `ok` field: step
conclusions, the actual checkout, receipt counts and source assertions agree.

Saved decoded-log copy SHA-256:
`50782a16cac9dd9a79c17151364e23714f9fa867b24bc0718aca84a0f41abdf7`.
Local inspection copy:
`/workspace/scratch/6eace968c0df/verification-hosted-g11/native-pr202.log`.

## Remaining qualification

PR203 job 136022950914 and PR205 job 136027174510 have passed steps 1–15 and are
running step 16. Both running log requests returned 404 at 02:55:39 UTC; no final
financial receipt or completed native qualification is claimed for them.

All five observed PR207 foundation jobs and native job 136044687282 are
queued; the JSON stores their complete IDs. PR208's observed
foundation jobs and native job 136048284590 are also queued. This inspection
does not approve either current candidate, nor qualify the new expiry-context
anchor or backup-verification APIs through hosted execution.

The next useful follow-up is the actual completed PR207/208 source-bound CI and
native/browser receipts. Preserve current heads while their long native gates
run; if code changes, qualify the new source explicitly. PR202's success closes
its own prior native question only. Older failed ancestors remain failed, and
the current draft holds remain justified.

This worker changes only this report and its JSON. Review base:
`df10fe26a308407237f9ccbc636c8bb61f55b84f`. No local broad test, native validator,
browser, dependency installation or runtime code change was performed.
