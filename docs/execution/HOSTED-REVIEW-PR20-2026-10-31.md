# PR #20 hosted review disposition

This ledger records the initial hosted analysis of
`9fdefd6031df3aba82d5ac1aa1ad9f2c0572a66e` in
[PR #20](https://github.com/djshellshoxxx/p2p-offramp/pull/20). Follow-up source
fixes and their focused evidence are distinguished below. Exact final-head hosted
results belong to the PR checks and final delivery record, not a self-referential
commit hash in this document.

These are AI-assisted review dispositions, not professional cryptographic review
or release acceptance. No scanner configuration, exclusion, quality gate or
external issue status was changed. Trading remains disabled.

## SonarCloud

[Check 124486819149](https://github.com/djshellshoxxx/p2p-offramp/runs/124486819149)
reports **failure: C security / D reliability**. All eight GitHub-visible
annotations were read against the source. No concrete actionable defect was
reproduced from these eight annotations. This does not claim to inventory every
issue in the underlying Sonar project or to adjudicate the failed gate.

| Issue ID | Exact initial location | Reviewed evidence |
| --- | --- | --- |
| `AaGRB_HZYJKVmQ5da4io` | [test-release-locator-browser.mjs:63](https://github.com/djshellshoxxx/p2p-offramp/blob/9fdefd6031df3aba82d5ac1aa1ad9f2c0572a66e/scripts/test-release-locator-browser.mjs#L63) | Sorted fixture module paths are intentional deterministic diagnostic output. They are strings, not numbers. |
| `AaGRB_DGYJKVmQ5da4im` | [manifest.ts:51](https://github.com/djshellshoxxx/p2p-offramp/blob/9fdefd6031df3aba82d5ac1aa1ad9f2c0572a66e/packages/extensions/src/manifest.ts#L51) | Capability names and schema hashes require stable string ordering. Locale-dependent ordering would change that contract. |
| `AaGRB_HcYJKVmQ5da4ip` | [acceptance-report.mjs:22](https://github.com/djshellshoxxx/p2p-offramp/blob/9fdefd6031df3aba82d5ac1aa1ad9f2c0572a66e/scripts/acceptance-report.mjs#L22) | The shared lexer cursor advances past the opening quote and escaped characters. Duplicate-key, escaped-key, malformed, depth and size cases cover the scanner; removing cursor advancement changes parsing. |
| `AaGRB_HcYJKVmQ5da4iq` | [acceptance-report.mjs:44](https://github.com/djshellshoxxx/p2p-offramp/blob/9fdefd6031df3aba82d5ac1aa1ad9f2c0572a66e/scripts/acceptance-report.mjs#L44) | `open` reads an explicit operator-selected candidate/evidence file. It creates no output and accepts no path from imported JSON. Regular-file, nonsymlink, identity, byte and JSON bounds remain enforced. |
| `AaGRB_HcYJKVmQ5da4ir` | [acceptance-report.mjs:41](https://github.com/djshellshoxxx/p2p-offramp/blob/9fdefd6031df3aba82d5ac1aa1ad9f2c0572a66e/scripts/acceptance-report.mjs#L41) | `lstat` checks that same explicitly selected local input. There is no server request or privilege boundary requiring directory confinement. |
| `AaGRB_C_YJKVmQ5da4il` | [release-locator.ts:62](https://github.com/djshellshoxxx/p2p-offramp/blob/9fdefd6031df3aba82d5ac1aa1ad9f2c0572a66e/packages/security/src/release-locator.ts#L62) | Canonical JSON keys use ECMAScript UTF-16 ordering. Locale-sensitive sorting would invalidate signature bytes. |
| `AaGRB-6aYJKVmQ5da4ik` | [evm-payment-preflight.ts:94](https://github.com/djshellshoxxx/p2p-offramp/blob/9fdefd6031df3aba82d5ac1aa1ad9f2c0572a66e/packages/wallet/src/evm-payment-preflight.ts#L94) | `parseInt(pair,16)` receives exactly two already validated hexadecimal characters. `Number.parseInt` is equivalent here. |
| `AaGRB_DIYJKVmQ5da4in` | [registry.ts:114](https://github.com/djshellshoxxx/p2p-offramp/blob/9fdefd6031df3aba82d5ac1aa1ad9f2c0572a66e/packages/extensions/src/registry.ts#L114) | The `try` handles synchronous cleanup throws; `Promise.allSettled` handles asynchronous cleanup rejection and initialization drain. A focused probe exercised synchronous throw, async throw and rejected Promise: all drained with zero unhandled rejections. |

## Qodo

[Review 5721963680](https://github.com/djshellshoxxx/p2p-offramp/pull/20#pullrequestreview-5721963680)
posted four inline comments and one additional low-severity summary item.

| Finding | Disposition and verification |
| --- | --- |
| [Expired releases leave diagnostics stored](https://github.com/djshellshoxxx/p2p-offramp/pull/20#discussion_r4431068475) | **Fixed.** The original bounded reproduction retained a 227-byte ring with zero clear calls after `record()` observed release expiry. Unavailable-context handling now purges the disposable ring and invalidates outstanding snapshots across operations, preserving unconfigured collection and fixed storage-failure behavior. Independent diagnostic tests: **14/14**; the same ring is purged to zero. Vault data is not touched. |
| [Future agents can merge on stale consent](https://github.com/djshellshoxxx/p2p-offramp/pull/20#discussion_r4431068477) | **Clarified.** The prompt now distinguishes the user's invocation from merely reading a repository document. A stored authorization claim cannot grant a later agent authority. This pass already has an explicit user instruction to implement, publish and merge; no new permission checkpoint is inferred. |
| [A hung RPC blocks payment re-checks](https://github.com/djshellshoxxx/p2p-offramp/pull/20#discussion_r4431068479) | **Retained availability limit.** The physical slot deliberately remains held until the injected EIP-1193 request drains. Clearing it when a logical timeout wins would permit accumulated noncooperative requests and defeat the resource bound. The caller receives a fixed refusal; late guidance cannot become current. Existing timeout/invalidation/drain tests cover this behavior. Provider/worker retirement requires trusted lifetime ownership, not fabricated cancellation acknowledgment. |
| [A stuck chat call blocks later chat actions](https://github.com/djshellshoxxx/p2p-offramp/pull/20#discussion_r4431068480) | **Retained availability limit.** The same physical-drain rule bounds noncooperative native crypto/storage work. Logical abort immediately returns refusal, wipes owned byte copies and suppresses late output. The slot is not released while the physical job remains active. Existing cancellation/revocation/drain tests cover that contract. |
| Sending into a full history wastes replay slots ([summary](https://github.com/djshellshoxxx/p2p-offramp/pull/20#issuecomment-6541055568)) | **Fixed low-severity inefficiency.** Two known-full rejected sends previously generated eight additional Schnorr signatures. Outbound preflight now reauthenticates history and refuses conflicting IDs or known-impossible new records before wrap generation. An explicit identical-ID retry still returns both usable delivery wraps. Post-crypto byte checks, fresh history and append CAS remain authoritative. Independent chat tests: **16/16**, including a concurrent winner after preflight. |

## CodeRabbit

The initial review completed on all 89 selected files, rather than being skipped
for file-count limits. It posted four inline comments plus an optional parser
refactoring suggestion.

| Finding | Disposition and verification |
| --- | --- |
| [Missing article in the T5 inventory row](https://github.com/djshellshoxxx/p2p-offramp/pull/20#discussion_r4431083563) | **Corrected.** The inventory now says “Collection requires an authenticated manifest.” No product behavior changes. |
| [Continuation-contract link points to inventory](https://github.com/djshellshoxxx/p2p-offramp/pull/20#discussion_r4431083566) | **Corrected.** The contract label links to the executable prompt, while the inventory remains a separate reference. |
| [Escaped envelope can exceed the NIP-17 rumor limit](https://github.com/djshellshoxxx/p2p-offramp/pull/20#discussion_r4431083569) | **Documented protocol-specific limit with regression.** The generic application profile permits 24,576 bytes; its specification explicitly allows smaller provider limits. A bounded 11,000-quote body encodes to 22,518 bytes but exceeds the escaped 40,960-byte NIP-17 rumor cap. Native sending returns `LIMIT_EXCEEDED` before conversation-key derivation, signing, ephemeral-key generation or persistence: all four counters remain zero. A focused independent regression **1/1** also confirms the subsequent list remains available and empty. The generic wire cap is not silently changed. |
| [Finalized time overstates remaining payment time](https://github.com/djshellshoxxx/p2p-offramp/pull/20#discussion_r4431083572) | **Fixed.** The bounded reproduction used finalized time 1500, available latest time 2400 and expiry 2401: guidance reported 901 seconds and allowed payment although latest-chain remaining time was one second. The correction uses the greater of validated latest and finalized timestamps only for conservative expiry timing; escrow-state evidence remains pinned to finalized state. Independent unit checks: **14/14**. Actual loopback proof: **6/6**, including finalized lag over 900 seconds with latest-chain 901 seconds allowing guidance and 900 seconds blocking it. The native proof made 115 reads and zero sends. Separate review cleared the frozen fix. |
| Share locator/manifest parsing helpers (review nit) | **Optional refactor deferred.** No correctness defect was reproduced. Both profiles deliberately preserve bounded exact parsing and profile-specific refusal mapping. A late cross-verifier refactor solely for a style suggestion would expand security-sensitive scope. |

## Evidence and limits

Raw hosted responses, check HTML, exact annotation/disposition JSON, bounded
reproductions and focused logs are retained under `/workspace/work/p2p-pr20-*`.
Public check/review/source links above identify the initial analyzed source.
Absence of a scanner annotation on a later head is not treated as an external
resolution or approval. Later-head review and CI status are recorded in PR #20.

The unqualified browser/device, production trust, deployment and professional
review gates remain external. No advisory review recommendation changes immutable
custody, grants spending authority or enables the shipped offline app.
