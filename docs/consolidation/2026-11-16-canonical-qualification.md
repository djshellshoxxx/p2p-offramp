# Canonical reader qualification and consolidation

Continuation baseline: `claude/confident-fermi-g6wjp3@7461c872a08a6af7045759bda8288c135171da63`.
Work branch: `codex/continue-completion-20261116`. This is a development checkpoint,
not a claim that all project features are complete.

## Changes

- Extended the direct canonical `getTrade(bytes32)` oracle against the actual local
  contract. Added ERC-20 absent/funded/refunded observations, every immutable-field
  mismatch, unlisted runtime refusal before `eth_call`, and pending-refund finalized
  lag. Principal returns only to the seller, with zero escrow, buyer and caller token
  balances. No legacy selector or response shim is used for these checks.
- Disabled viem client caching in this differential harness. The initial expanded
  run failed its anchor comparison because the oracle reused a cached finalized
  header after mining while the reader fetched the current header. Both decoded
  states agreed. The corrected oracle compares fresh chain state and passes.
- Merged documentation source `30efa0e` from
  `chatgpt/zero-codex/docs-static-offers-status-20261116` into the work branch.
  Its source-pinned static Offers clarification is retained. A newer development
  snapshot distinguishes it from the cumulative branch and preserves historical
  evidence rather than presenting old gaps as current code absence.
- Refreshed the G3/G4 status pointers: canonical reading and D9 migration already
  exist in the baseline; this pass qualifies them instead of duplicating them.
- Corrected the existing accepted-release FIFO regression deadline. An initial
  recovery run killed the child while it loaded the builder/Vite dependency graph.
  The child now signals readiness after import: startup has a separate bounded
  deadline and the FIFO operation still has its original one-second deadline.
  An actual blocking read remains killable in the isolated child process.

## Verification

Node 24.22.1, Foundry 1.5.1 (`b0a9dd9`), Solidity
0.8.30 (`73712a01`), and pinned repository submodules were used. Dependencies were
installed with `npm ci --ignore-scripts`; no dependency/lockfile changes.

- Baseline package/UI suite: 1,297 pass, zero failures, one cast-dependent skip.
- Four TypeScript projects: pass.
- Foundry contract suite: 82/82 pass, including fuzz/invariant suites.
- Direct EVM/viem oracle: 9/9 adapter unit tests and 32/32 real-chain checks.
- Encrypted two-party native exchange: 12 checks pass; four submissions have four
  durable markers, including fresh-key/lost-response recovery and no external egress.
- Specification audit: 173 documents, zero broken links.
- Import boundaries: pass, 126 production sources / 64 core-graph modules.
- Artifact/import build policy: 28/28 pass.
- Recovery: 15/15 unit tests and 6/6 real-chain checks after the test deadline fix.
- Agreement fuzz-tool self-tests: 26/26 pass.
- Default build and its TypeScript checks: pass.

A full package rerun overlapped several native/build processes and lost the
diagnostics test worker without an assertion diagnostic (1,285 pass, one failed
file). Diagnostics passes 15/15 in isolation. A complete rerun with four test-file
workers then passed **1,298/1,298**, zero failures, cancellations or skips, with
Foundry/cast available. No test was excluded or weakened for that rerun.

The Chromium recovery fixture built successfully but could not start its browser:
`process_singleton_posix.cc` reported `socket() failed: Operation not permitted`.
No browser pass or device/accessibility qualification is claimed. Exact-head hosted
CI and an independent reviewer remain necessary. Ordinary Git push had no HTTPS
credentials; publication uses the connected GitHub application instead.

## Publication checkpoint

[PR #123](https://github.com/djshellshoxxx/p2p-offramp/pull/123) targets the newest
cumulative development branch. Implementation tree
`cff9d7103bf9b23244899df22de9de65fb7f198d` was published as
`120e1ea2004c21cb06057a87d2ce8c06c83f5279`; Git fetch and a zero-diff comparison
confirmed the remote tree matches the locally tested source. The documentation
source `30efa0e` is its second parent. Local intermediate commits remain retained
on `codex/continue-completion-20261116`; the publication checkout tracks the
remote branch without force-pushing or discarding either history.

At that implementation head, EVM escrow and Vault foundation hosted workflows
were queued. They are not recorded as passing. The PR remains draft pending
hosted qualification and independent review; neither it nor the cumulative
development PR has been merged into main by this continuation.

## Remaining implementation and release work

1. D1 Option B: exact versioned peer-acceptance fields, independent vectors, two
   signatures, replay/tombstone persistence, account/key binding and reviewed
   exchange integration. Revision-only acknowledgements remain informational.
2. G1/D8/G5: approved localnet browser composition and a real emitted two-wallet
   journey with account/chain changes, rejected prompts, lock/reload/crash recovery
   and malicious peer cases. The static Offers review is not this feature.
3. Solana parity and remaining optional roadmap packages need feature-level intake
   and qualification. Their historical branch presence is not completion evidence.
4. Production runtime/trust-root approval, exact-head hosted security checks,
   independent cryptographic/contract review, real testnet acceptance, supported
   device/accessibility evidence, and release/signing gates remain open.

`ReleaseEnabled=0` remains unchanged. No deployment, real funds, security setting
change or production enablement was performed.
