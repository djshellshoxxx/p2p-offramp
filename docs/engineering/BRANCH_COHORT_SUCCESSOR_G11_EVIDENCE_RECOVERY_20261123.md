# Source-bound successor G11 evidence recovery and PR250 hosted readback — 2026-11-23 UTC

This is an **archival, documentation-only integration proposal** on [PR245](https://github.com/djshellshoxxx/p2p-offramp/pull/245), not a main merge or a qualification of historical financial code.

## Unique historical material recovered

Original immutable historical successor branch `codex/successor-handoff-20261120`, tip `3b538fd4586b6fc00846262d67956a2125b6c9f1`, parent-source lineages preserved. Against `main@01f6f4feca051d68de24a04299cd3bb444bce40c`, a GitHub compare showed 2 ahead / 104 behind, merge base `0e148564743b1ee353abdbdf8931fec464f09870`. Its generation-11 checkpoint changes 15 documentation paths: 6 exact main blobs, 4 later-revised main documents and **5 absent historical evidence files**. The five missing files below were added to this PR by **reusing their original Git blob SHAs**; no historical prose or JSON was rewritten.

| Source path under `docs/engineering/` | Immutable source blob |
|---|---|
| `HOSTED_REVIEW_GENERATION11_20261120.md` | `a94f1e753df123b1fb348289f07b3bd165370444` |
| `HOSTED_REVIEW_GENERATION11_20261120.json` | `cac39a02a3b7faaf30ce21d4acf5188aae4d8155` |
| `INDEPENDENT_PUBLICATION_AUDIT_GENERATION11_20261120.md` | `25354ea5df882c3ae5f82e4ec24880583531dbee` |
| `SUCCESSOR_HANDOFF_GENERATION11_20261120.md` | `d241d039cfa6685849a521500f83e64e9b2ea4eb` |
| `hosted-published-status-generation11.json` | `fa86b2bc0585265f82bb8ac14aeca24da92e7c0f` |

The two JSON source blobs were parsed successfully during preservation. Historical queued, cancelled, running and successful statuses must be read as dated snapshots, not current CI. The older 2026-11-20 G11 handoff is not present-tense task authority; current `CONSOLIDATION_HANDOFF.md` remains canonical. Original historical branch, legacy failure records and owner refs were not altered. Although all five missing file bytes are now staged on PR245, **this branch remains classified V (partially reconciled) pending PR245 qualification/integration and review of the four since-modified documents**; none is represented as merged into main.

## Current EIP-1271 negative-control CI readback

[PR250](https://github.com/djshellshoxxx/p2p-offramp/pull/250) frozen child head `d75d2a00d4cfdd83fd681c361eefce69bc91c617`, dependent on PR249 and PR246, now has **11/11 completed-success reported check runs** (forge, local-trade, specs, docs-tooling, Nostr, browser, Firefox, WebKit, local EVM, schema/crypto and inventory); Snyk status also **success**. Four associated pull-request-triggered workflow runs completed success.

Keep failed first `local-trade` job `137844763914` from [run 45218137585](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45218137585) as an actual **failure**: after successfully executing the 5 Anvil EIP-1271 cases (96 read-only verifier calls, 0 sends/signatures), separate localnet Chromium buyer/seller connection timed out. The **single targeted, same-SHA retry** [job 137847864848](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45218137585/job/137847864848), attempt 2, completed **success at 2026-11-23T16:45:21Z**; recorded steps include native EIP-1271 negative modes, localnet controller, ERC-20, Chromium profiles, reviewed allowances and browser exits, all success. This resolves this one transient CI failure **at unchanged source**, not the historical first failure.

PR250 is still **draft, open, unmerged**. No independent Tier C approval, PR-recorded owner authorization, complete CodeQL child result or current-target financial release acceptance was established by this read. Do not substitute the 11 check contexts for CodeQL/approval, transfer parent approvals or perform a guarded merge.

## Continuation, accounting and constraints

Fully paginated API observation in this run: **262 remote branches** (100+100+62), **247 PRs** (100+100+47; 65 open, 124 merged, 58 closed unmerged). Classification unchanged **A137/P64/F34/C5/E0/V21/B1/D0**. No source/contract/wallet modifications, main merge, native tests launched locally, release, funds, external network deployment, optional activation or settings changes. Keep `ReleaseEnabled=0` and both real 1800-second refund waits and all exact native financial gates.

Next: independent Tier C and owner-recorded authorization for the PR246→PR249→PR250 ordered stack; preserve PR237→238→239→241→242→244 review/native ordering and original failed receipts; analyze one unowned divergent feature rather than reproducing already-qualified branches. Review archival G11 documents before merging PR245, to ensure historical dates remain clearly distinguished from current status.
