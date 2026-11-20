# Generation 12: required independent calldata oracle

## Source and change

Base: `d30152336bb687b31ae547ab3fcecb8835a02ef4`, tree
`fa0d662c991cb03729ca0a4ea53ef60960b81842`.

The hosted [schemas-and-crypto log](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44677307789/job/136092100209)
records **2,311 tests, 2,310 passes, zero failures and one skip**. Foundry is absent
from that job, so the independent `cast calldata` comparison in
`packages/wallet/test/evm-escrow.test.mjs` skips. Another test in that file
conditionally compares pending-withdrawal and receiver-toggle calldata.

Inspection of the existing EVM workflow and invoked scripts confirmed that the
Foundry-enabled job did not execute this test file. It now runs the existing file
immediately after `npm ci`, using the job's already-pinned Foundry v1.5.1. A required
`cast --version` command precedes the test, preventing a missing tool from silently
skipping the oracle. Runtime source and the portable general suite are unchanged.

## Executed verification

- Parsed and structurally compared original and changed YAML after removing the
  single added step: every original setting and step matched.
- The exact new run block under `bash -e -o pipefail` failed with exit 127 when
  Cast was absent.
- Downloaded the existing pinned Foundry release through normal HTTPS and checked
  its SHA-256 against GitHub's release digest before extraction:
  `73640b01bd9ed29fdb4965085099371f8cf0dbbec3e2086cf54564efc4dcfe88`.
- The exact new run block then passed **14/14 tests**, zero failures and skips.
  Cast reported v1.5.1, commit `b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`.
- `git diff --check` passed.

Passing local log SHA-256:
`ee8cb8c642460ef9c870988fde2bc42488c24a6678e8f5e5df6ba73004a7fd36`.
This focused execution is distinct from the original hosted full-suite result.

## Source-bound hosted snapshot

Original completed d301 jobs checked out
`65f9739dfd1ea44cb2dc9aa93a884c35548aa888`. GitHub confirms its tree equals the
d301 tree above, with ordered parents `df10fe26a308407237f9ccbc636c8bb61f55b84f`
and `d30152336bb687b31ae547ab3fcecb8835a02ef4`.

The [foundation run](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44677307789)
passed all five jobs; [EVM](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44677307459)
passed Forge (92/92) and native/browser trade journeys;
[Nostr](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44677307450)
passed 3/3 native relay tests; inventory passed. The completed browser receipt
records measured warmth, one physical withheld-acknowledgment POST and zero
fixture errors. Actual encrypted-Worker restore, favorites and templates passed
within their recorded local/synthetic scope.

At final inspection, the original [Solana run](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44677307772)
had passed steps 1–13, including SBPF, Clippy, LiteSVM and IDL. Real-validator
acceptance/refund remained in progress from 05:39:11 UTC; actual browser refund
qualification remained pending. Both real 1,800-second minima are unchanged.

Twelve additional checks appeared queued at 06:05:28–06:05:33 UTC for the parent's
new main-targeting PR213, including two CodeQL checks. These are separate from
the original nine successful jobs and pending Solana job. The parent owns their
review; prior target results do not replace current-target qualification.

## Handoff

This worker made no remote write. Parent must independently review the workflow
change and qualify its integration. Hosted execution of the new oracle step is
pending publication. Full retrieved logs, snapshots and a SHA-256 manifest are
in the shared `evidence/ci-g12/qualification-report.json` checkpoint.
