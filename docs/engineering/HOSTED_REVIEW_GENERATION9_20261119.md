# Hosted qualification review — generation 9

Recorded November 20, 2026 UTC / November 19 Pacific. Live inspection ran from
02:28 to 02:32 UTC; the workflow summary was refreshed at **02:30:30 UTC**.

## Disposition

**No new failing hosted gate was observed on the four inspected heads.**
PR205's Vault foundation workflow completed successfully during this inspection,
including all sixteen browser command groups. PR204's favorites/templates browser
and docs-tooling jobs also passed. All four Solana workflows were still running.

**PR205 remains an unqualified ancestor and must remain unmerged.** Its head
does not contain the independently reproduced stale Solana absence correction or
the newer portal, navigation and IndexedDB cancellation repairs. Passing
ancestor checks cannot qualify those changes. PR205 was observed open, unmerged,
and draft; this worker made no remote change.

The next useful action is to qualify the coordinator's corrected descendant on
its exact source, then inspect its actual native/browser receipts. There is no
new failure in this snapshot that justifies a speculative patch, successful-job
rerun, weakened assertion, or reduced refund wait.

## Scope and local review identity

The worker used an isolated worktree from coordinator checkpoint
`b67bd81e74b0f58338dc15bc694cd3a22b724cd4`,
tree `f2476312544b27fc5d8c44dcc16a30857e4e7381`, and read the current handoff/state,
generation 6 portal/navigation reports, generation 7 independent reviews,
the coordinator's Solana reconciliation report, and generation 8's independent
Solana expiry report. The generation 8 report was read from its frozen branch,
because it was not yet in this review base.

Work comprised connected GitHub reads, completed job-log inspection, local Git
object verification, and this report/evidence file. No dependency installation,
local native validator/browser execution, workflow edit, remote mutation,
coordinator file edit, merge, deployment, release, or funds operation occurred.
No applicable repository/ancestor `AGENTS.md` was found in this worktree.

The companion [machine-readable snapshot](HOSTED_REVIEW_GENERATION9_20261119.json)
retains exact run IDs, heads, trees, sampled checkout log lines, observed native
steps, and the principal PR205 browser receipts. The GitHub commit-run wrapper
returns pull-request-triggered runs on its first page; the five returned workflows
per head are the scope of the workflow table, not an exhaustive historical search.

## Exact source binding

The checkout SHA below comes from each completed job's
`git log -1 --format=%H` line, not from a branch-name assumption. The worker
fetched the four PR merge refs and inspected the **logged immutable objects**.
Each object's parents match the current PR base/head in that order, and each
checkout tree equals its PR head's tree. The corresponding native workflow API
metadata independently identifies the same head and source tree, attempt 1.

| PR | Live head | Sampled actual checkout | Exact tree |
| --- | --- | --- | --- |
| [202](https://github.com/djshellshoxxx/p2p-offramp/pull/202) | `d753c0af23ff43743e34679e6b778b9ac0370da2` | `32f7353551660a6c1e3e9302eecf3647b482c0c3` | `25d637fa5d6596e44cdae060ccc407f0c23186ee` |
| [203](https://github.com/djshellshoxxx/p2p-offramp/pull/203) | `2245b3bfb462eca468b4cf759fdc12fa49c5cd3a` | `8e2cd7b6ed1c907127b2e35e8b8826f59c039d90` | `412efa7b9534cc182d05d2b97830d5f6ff09944e` |
| [204](https://github.com/djshellshoxxx/p2p-offramp/pull/204) | `98d33db64622eab3f5f4ece6141d445d255245e7` | `c579e9a646855b5d821caf97249df9872b3e98e1` | `f5c5bb060732a892ba4eb91532e82ed79f64f2c4` |
| [205](https://github.com/djshellshoxxx/p2p-offramp/pull/205) | `cd7d54ba075118a7ec043788c17718be842ee405` | `3dbe6ac3994c56bf2e6424676c6dc034ecc9a9b4` | `ce3c69ddc36245f756005c540e521a26a3ce59b8` |

Base parents are respectively `2b23ee614ff2dd05bd3a6e79f1278658c30a3909`,
`d753c0af23ff43743e34679e6b778b9ac0370da2`,
`f5241c09f268a7a6841a5760ed0faa90b5b7f005`, and
`5c5a84ef6300330700c8b0ca54d074ac113f08be`.

The sampled completed logs are browser job
[136009252921](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44652103772/job/136009252921)
for PR202, schemas-and-crypto job
[136022950037](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44656212078/job/136022950037)
for PR203, browser
[136023879924](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44656491717/job/136023879924)
and docs-tooling
[136023879609](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44656491717/job/136023879609)
for PR204, and browser
[136027175362](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44657477341/job/136027175362)
and docs-tooling
[136027175464](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44657477341/job/136027175464)
for PR205.

Running native job archives returned `404 BlobNotFound` during this inspection.
Their metadata and step conclusions were readable; their complete native
receipts and actual checkout log lines were not yet available. This report
does not substitute another job's log for an inspected native receipt.

## Live workflow snapshot

| PR | Vault foundation | Solana escrow | EVM escrow | Specification inventory | Nostr relay |
| --- | --- | --- | --- | --- | --- |
| 202 | [Success](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44652103772) | [In progress](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44652103777) | [Success](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44652103985) | [Success](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44652103846) | [Success](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44652103806) |
| 203 | [Queued](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44656212078) | [In progress](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44656212245) | [Success](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44656212104) | [Success](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44656212063) | [Success](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44656212072) |
| 204 | [Success](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44656491717) | [In progress](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44656491793) | [Queued](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44656491879) | [Success](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44656491804) | [Success](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44656491835) |
| 205 | [Success](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44657477341) | [In progress](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44657477232) | [Queued](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44657477306) | [Success](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44657477515) | [Success](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44657477383) |

PR203's queued workflow has three completed successful jobs: specs,
schemas-and-crypto, and local-evm. Its browser and docs-tooling jobs remain queued.
A queued overall status is therefore not evidence that every job is unstarted.

For native Solana, PR202 job
[136009253374](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44652103777/job/136009253374)
reports successful steps 1–15, including **Real validator client acceptance
including refund and recovery**. Step 16, **Actual Worker encrypted Solana
recovery and real-time refund**, remains in progress. The corresponding jobs
for PR203 (`136022950914`), PR204 (`136023880105`) and PR205
(`136027174510`) report successful steps 1–13; step 14 is in progress and
steps 15–16 are pending. None is a completed native qualification in this
snapshot.

## Completed browser evidence and its practical limits

PR205 browser job completed at approximately **02:29:40 UTC**. All sixteen
command groups, from the two early Solana diagnostics through browser, portal,
distribution, web, favorites, templates, private, locator, chat, diagnostics,
recovery, peer, locale and isolated-peer discovery, succeeded.

The withheld-acknowledgment diagnostic uses actual application RPC and a warmed
Chromium connection. Its receipt reports one application call, one fetch, one
physical send POST, HTTP 503, zero validator forwarding, zero unexpected requests
and zero fixture errors. The receipt explicitly leaves raw-reset behavior,
general browser retransmission guarantees and native-chain qualification false.

The restore diagnostic reports the actual emitted app, actual module Worker and
encrypted IndexedDB, two held actual lock responses, a fresh profile and key,
and discarded stale-file/submitted-document buffers. Wallet prompts, RPC requests
and financial transactions are all zero. This verifies the controlled
acknowledgment/restore composition; its receipt also leaves native-chain
qualification false.

Both PR204 and PR205 provide completed favorites and templates receipts using
native Worker/IndexedDB with synthetic trade data. Favorites cover encrypted
persistence, reload, profile isolation, explicit removal, invalid terms and a
dangling reference retained until explicit removal. Templates cover preview and
consent, cancellation without a write, seven reusable defaults only, transient
field clearing, fresh order/nonce/agreement, profile isolation, repeat-default
changes, lock retirement and explicit blank draft. The native template probe
records revisions 0 → 1, stale two-Worker CAS refusal `CONFLICT`, cancellation
`NOT_FOUND`, ninth-slot and extra-field refusals `PROTOCOL_ERROR`, and final
revision 8 with exactly slots 0–7. Unexpected requests and template wallet
prompts are zero. These are meaningful feature receipts on the named heads;
they are not real trading or release acceptance.

### Distribution remains intentionally unqualified for current source

PR204 and PR205 distribution browser receipts report
`historical-bound-distribution-nested-smoke`, with fixture source commit
`2b23ee614ff2dd05bd3a6e79f1278658c30a3909` and tree
`a3701267756596e833247f50614c5ddc32f2cce0`. Both explicitly state
`currentSourceRefused: true` and
`currentSourceDistributionQualified: false`.
Their tooling jobs each pass **42/42** tests and similarly disclose
`historical-bound-client-current-tooling`.

This success verifies current tooling's handling of an explicitly bound
historical client and its refusal of stale evidence for current source.
It cannot be described as a qualified current-source distribution or as semantic
locale approval. Existing source, evidence, host-header and release gates remain.

## Gate preservation and successor handoff

A local Git comparison from PR205 to review base `b67bd81` shows no change to:

- `.github/workflows/solana-escrow.yml`
- `contracts/solana/localnet/client-run.mjs`
- `scripts/test-solana-localnet-browser.mjs`
- `scripts/lib/solana-localnet-fixture.mjs`
- `scripts/lib/solana-localnet-send-evidence.mjs`

The workflow still retains both independent real 1,800-second minimum refund
cases, with a 150-minute job limit, 50-minute validator step and 60-minute native
browser step. The browser harness still requires seven physical app sends with
seven distinct signatures, exactly one withheld send, eight separately observed
wallet prompts including the revoked one, retained durable marker/provenance,
explicit finalized-expiry replacement with a fresh signature/message, exact
buyer principal and seller principal minus actual transaction fees, and empty
unexpected-request/page-error/fixture-error arrays.

A fresh successor should:

1. Start from the coordinator's **published corrected descendant**, recording its
   head, tree, base and actual checkout identity. The corrected Solana collector
   must be present; a PR205 pass cannot satisfy that requirement.
2. Let the existing pending work finish and retrieve completed native receipts.
   Inspect both full refund gates, actual marker/physical-send evidence,
   encrypted fresh-key recovery and explicit replacement. Do not weaken or
   shorten any assertion/wait to obtain a green result.
3. Specifically bind the corrected finalized `isBlockhashValid` anchor and
   exact-slot `getBlock` path to the pinned real validator. Generation 8's
   deterministic serializer tests do not establish that runtime result.
4. Treat PR202's missing restore correction, PR204's missing Solana repair stack,
   and PR205's missing later repairs as ancestor scope boundaries if their runs
   subsequently fail. Reproduce a remaining failure on the corrected descendant
   before assigning a new code defect.
5. Keep the nine optional packages separate and `ReleaseEnabled=0`. Current-source
   distribution qualification remains a distinct evidence task.

No passing job was rerun and no loop waited for the native refunds in this review.
The report is a timestamped handoff for the coordinator and a later fresh worker,
not a claim that CI has finished or a new-source merge gate has passed.
