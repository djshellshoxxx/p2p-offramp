# Hosted qualification observation — November 19, 2026

## Identity and evidence boundary

Observed at `2026-11-19T23:55:09Z` (November 19, 15:55 Pacific).
The worker read the consolidation handoff, machine state and the three generation
2 extraction reports before checking the hosted jobs. This report records actual
GitHub job/step conclusions and the completed browser log. It does not promote
pending steps or carry those results to a different source head.

- PR: [#189, QR browser fixture qualification](https://github.com/djshellshoxxx/p2p-offramp/pull/189).
- PR head: `9611d6a5cb404fed5d41eeb176dafb31c01de640`.
- Base head: `a728ce290eb2fcbe9b4a9e857cc84ced401da70f`.
- Actual browser checkout: GitHub merge
  `0b4567e88048d52a8ae4bd0c7d8ca4b23006f079`, merging the head into that base.
- GitHub Git-commit responses independently confirm that the merge checkout and
  PR head both have tree `938b76f923df166717ef522666575e37a0623825`.
  The merge's ordered parents are the stated base and PR head. Its checked-out
  source is byte-identical to the PR head despite their different commit identities.
- Browser: Chromium `158.0.8127.36` on the hosted Linux runner.
- This report's worktree started at combined local source
  `4689ee4e15950f3c50084c74ec5509eb909607bb`; that larger generation 2 extraction
  still requires its own hosted checks. In particular, #189 did not contain the
  newly recovered portal/distribution browser commands.

## Exact-head check conclusions

| Check | Job | Run | Observed result |
|---|---|---|---|
| `forge` | 135971621653 | 44640970907 | Success |
| `local-trade` | 135971621433 | 44640970907 | Success |
| `local-evm` | 135971620725 | 44640970749 | Success |
| `schemas-and-crypto` | 135971620169 | 44640970749 | Success |
| `browser` | 135971620360 | 44640970749 | Success |
| `specs` | 135971620767 | 44640970749 | Success |
| `inventory` | 135971622605 | 44640971102 | Success |
| `docs-tooling` | 135971620496 | 44640970749 | Success |
| `native-nostr-relay` | 135971622454 | 44640971048 | Success |
| Solana `program` | 135971622812 | 44640971208 | In progress; not a pass |

All seven original required Actions contexts passed at the observed PR head.
The separate Solana gate remains incomplete. No assertion about an automated
CodeRabbit/Qodo review or any absent check follows from this table.

## Actual browser evidence

[Browser job 135971620360](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44640970749/job/135971620360)
completed successfully. Its ten maintained browser command groups all completed
successfully: foundational runtime, emitted web/QR, private composition, locator,
chat, diagnostics, recovery references, peer replay, locale layout and isolated
signed-offer discovery.

The emitted QR receipt at `2026-11-19T23:52:33.1041652Z` records these six completed
journeys:

1. Generate, display and download an exact public fingerprint; compare exact bytes.
2. Read a PNG through the real decoder Worker and reject local replay.
3. Read a native JPEG through the real decoder Worker.
4. Refuse bounded/exact text and file failures and hostile image input.
5. Exercise synthetic camera permission, a real media stream, late cancellation,
   remount, frame capture and hidden-page cleanup.
6. Review an offline-reference fingerprint and clear memory on a real vault lock.

The receipt records `actualModuleWorker=true`, `actualBitmapDecode=true`,
`actualPrivateVaultLock=true` and `unexpectedRequests=0`. It identifies decoder
version `1.4.0`, dependency SHA-256
`bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859`, and emitted
Worker `assets/decode.worker-DGcSBxfL.js`.

The camera producer supplied frames after attachment and all native track/cleanup
assertions completed. During explicit unlock/lock, the runtime emitted five
`activity` controls alongside inventory/lifecycle controls. The repaired oracle
accepted only the exact empty versioned commands associated synchronously with
trusted input; the private-domain operation, storage-preservation, network and
CSP assertions remained active.

This is hosted synthetic-camera browser qualification. The actual receipt retains
`physicalCamera=false`, `physicalDeviceQualification=false`, `tradingEnabled=false`,
`ReleaseEnabled=0` and `releaseAcceptance=false`.

## Actual EVM browser steps

[Local trade job 135971621433](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44640970907/job/135971621433)
completed successfully. Its native local EVM, exchange, independent read oracle,
payment preflight, reconciliation, recovery, local Sepolia fixtures, controller and
ERC-20 checks all completed. Step 17, separate buyer/seller browser profiles, and
step 18, reviewed token allowances and ERC-20 browser exits, both completed
successfully. These are the repository's local fixtures, not live-funds execution.

## Solana remains pending

The original [PR #188 program job 135965138780](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44639090596/job/135965138780),
bound to head `a728ce290eb2fcbe9b4a9e857cc84ced401da70f`, had completed JavaScript
vectors, pinned tool installation, format, SBPF build, lint, LiteSVM tests and
committed-IDL verification. Step 14, real validator client acceptance including
refund/recovery, was still running. Chromium installation and the actual Worker
encrypted Solana recovery/refund step had not started.

The [PR #189 program job 135971622812](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44640971208/job/135971622812)
had reached the same stage at the observation time. The `apps/web/**` path filter
also covers the newly added QR oracle regression, so this head has its own Solana
run. Both independent validator gates retain their actual 1,800-second refund
minimum. Do not cancel them with documentation-only ref changes or report the
native/browser acceptance as passed before its actual completion.

No downstream browser failure remains to repair at this observed head. No source
change, workflow retry, cancellation, remote write, merge, deployment, release or
repository-setting change was performed by this qualification worker.
