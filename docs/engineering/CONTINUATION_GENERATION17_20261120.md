# Generation 17 — guarded source merge and hosted receipts

**Recorded:** 2026-11-20T12:29:28Z. **Repository:** djshellshoxxx/p2p-offramp.

## Actual integration
- [PR221](https://github.com/djshellshoxxx/p2p-offramp/pull/221) was merged into `main` using GitHub's normal `merge` method with exact expected head `24b67bb2db7c74654b9a5b9496279b4d44380d28`.
- Previous main: `5c5a84ef6300330700c8b0ca54d074ac113f08be`.
- New main and merge commit: `1084a410676bc0658da97f33eba6a059493d74df`, with parents [previous main, PR221 head].
- Complete merge tree: `7ccc0514c8320314a04fab333d5ebf14294f69dc`, identical to PR221's source and its hosted target checkout `fba06f12afeaee93572cd09c3e0d643adfe6f5f5`. No separate source delta is introduced by the main merge.
- PR219 head `8537d07bf0e67715b881065fa3d6a634a34a70d7` retains its confirmed Chromium locale-listener failure. PR220 `eaa7914ad2f10e932afc877e9e742e0a3117d9c4` fixed it without weakening the listener oracle.

## Exact PR221 gates

All **15/15** current-head check runs completed **successfully**, including CodeQL, JavaScript/TypeScript and Python analysis, hosted Chromium, Firefox and WebKit backup verification, EVM/Foundry Cast assertions, Nostr, inventory, documentation, specifications and Solana. The Snyk commit status was separately successful. All five GitHub Actions workflows completed successfully.

The provisioned schemas-and-crypto job reported **2,362 passed, zero failed and one skipped** out of 2,363 tests. The skipped calldata/Cast parity case requires Foundry; the separate Foundry-enabled EVM job passed. This is not a zero-skip Node result.

[Native Solana job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44719712734/job/136232052992) checked out the exact PR221 merge checkout. It completed SBPF, Clippy, LiteSVM, IDL and real-validator/browser gates. The validator reported **62 successful assertions, 13 physical `sendTransaction` calls, 1,852 genuine refund-wait seconds, 1,907 seconds receipt duration**. The actual-browser workflow reported **five successful journeys, 2,047-second duration, an actual module Worker and encrypted IndexedDB**, actual genesis/Clock and `fixtureErrors: []`. Both enforce the original 1,800-second minimum without time warps. Signatures, durable markers, principal and fee calculations, and withholding/restore/no-resend assertions were preserved.

[Hosted Chromium job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44719712739/job/136232052700) passed the unchanged `test:locale:browser` assertion and backup/recovery/peer journeys. Firefox and WebKit ran as actual hosted engines. This does not establish real physical-wallet/camera/device testing.

## Scope boundaries and follow-up

The merge integrates reviewed source only. `ReleaseEnabled=0`; no release, deployment, real-funds operation, trust-root provisioning, security gate change, force push, branch deletion or default optional package activation occurred. Optional PR191–199 remain separate one-package review/CI work and are not production features by mere composition.

Outstanding product and owner-controlled work: signed asset-update trust/transport/own-lock lifecycle and signed configuration, full Solana negotiation/funding, physical devices, and current immutable locale/distribution acceptance. The older claim receipts do not approve newer source.

This documentation follow-up is isolated from runtime source. Preserve the historical canonical PR200 reports and all original failed-run records. Do not treat source merge as product release approval.
