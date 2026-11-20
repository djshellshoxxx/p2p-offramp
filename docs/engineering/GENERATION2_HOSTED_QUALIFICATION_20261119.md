# Generation 2 hosted qualification — November 19, 2026

## Source identity and observation

This separate report records new hosted evidence for the generation 2 integration.
It does not change the earlier #189 report or transfer its conclusions to this
source. The worker read the current consolidation handoff and machine state before
checking the live jobs.

Observed at `2026-11-20T00:21:35Z`, November 19 at 16:21 Pacific:

- PR: [#190, historical recovery](https://github.com/djshellshoxxx/p2p-offramp/pull/190).
- Exact head: `2b23ee614ff2dd05bd3a6e79f1278658c30a3909`.
- Base head: `a728ce290eb2fcbe9b4a9e857cc84ced401da70f`.
- Actual hosted browser checkout:
  `966fa1bc6d0ec840dde5f529183763bbc8d4a1f5`.
- GitHub Git-commit responses confirm that the PR head and merge checkout share
  tree `a3701267756596e833247f50614c5ddc32f2cce0`. The merge's ordered parents are
  the stated base and PR head. Thus the tested checkout has the exact source tree
  published on #190.
- Hosted Chromium: `158.0.8127.36`.

## Exact-head check results

| Check | Job | Run | Observed result |
|---|---|---|---|
| `browser` | 135982130788 | 44644082347 | Success |
| `docs-tooling` | 135982130707 | 44644082347 | Success |
| `specs` | 135982130610 | 44644082347 | Success |
| `schemas-and-crypto` | 135982130600 | 44644082347 | Success |
| `local-evm` | 135982130309 | 44644082347 | Success |
| `local-trade` | 135982127906 | 44644082246 | Success |
| `forge` | 135982127437 | 44644082246 | Success |
| `inventory` | 135982126995 | 44644082168 | Success |
| `native-nostr-relay` | 135982126892 | 44644082113 | Success |
| Solana `program` | 135982126950 | 44644082116 | In progress; not a pass |

The seven original required Actions contexts and the documentation/native-Nostr
checks passed. The separate Solana qualification remains incomplete.

## New portal and distribution browser evidence

[Browser job 135982130788](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44644082347/job/135982130788)
completed all 12 command groups, including the new portal and distribution groups
before the emitted web/QR group. The existing foundational runtime, private
composition, locator, chat, diagnostics, recovery, peer, locale and signed-offer
discovery groups also completed successfully.

The `scriptless-local-portal` receipt records five completed checks:

1. JavaScript-disabled readability, navigation and responsive layout under served CSP.
2. Exact source-reference downloads without JavaScript or external requests.
3. A printable recovery checklist and actual generated PDF.
4. JS-enabled hostile probes refused by script, connection, frame and base-URI policy.
5. Actual `frame-ancestors` response-header enforcement against a framing page.

It reports `javaScriptDisabledReadability=true`, `localHeaderEnforcement=true`
and `externalRequests=0`. Deployed-host headers, bootstrap authentication,
accessibility acceptance, signed release and approved deployment remain false.

The `unsigned-distribution-nested-smoke` receipt records three completed journey
checks: the actual default client and Worker load/reload on a nested recovery
route; the scriptless portal reloads and downloads original references; and the
unpublished wiki/public dependency records remain exact downloadable bytes.
The run used 42 staged assets and two build passes. It reports
`unexpectedRequests=0`, `localHeaderFixture=true`, `published=false`,
`signedRelease=false` and `independentDistributionWitness=false`.

The QR browser receipt also completed its six maintained journeys at this head,
including real Worker PNG/JPEG decoding, synthetic-permission real-stream camera
capture/cleanup, and actual vault-lock clearing. It reports zero unexpected
requests and retains `physicalCamera=false`, `physicalDeviceQualification=false`,
`ReleaseEnabled=0` and `releaseAcceptance=false`.

## Tooling and EVM composition

[Documentation tooling job 135982130707](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44644082347/job/135982130707)
completed `test:tooling`, `check:docs` and the newly wired `check:governance`.
These are actual hosted step conclusions; historical assurance rows remain bound
to their documented original source rather than becoming fresh whole-project
assurance.

[Local trade job 135982127906](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44644082246/job/135982127906)
completed the native local EVM checks and both browser steps: separate buyer/seller
profiles and reviewed token allowances/ERC-20 exits. This remains local-fixture
qualification, not live-funds execution.

## Pending Solana gates

| PR / exact head | Run / job | Actual observed stage |
|---|---|---|
| #188 / `a728ce290eb2fcbe9b4a9e857cc84ced401da70f` | 44639090596 / 135965138780 | Real validator acceptance passed; actual encrypted Worker/browser refund step 16 running. |
| #189 / `9611d6a5cb404fed5d41eeb176dafb31c01de640` | 44640971208 / 135971622812 | Real validator acceptance step 14 running; browser step not started. |
| #190 / `2b23ee614ff2dd05bd3a6e79f1278658c30a3909` | 44644082116 / 135982126950 | Real validator acceptance step 14 running; browser step not started. |

All three jobs had completed their JavaScript vectors, pinned tools, format, SBPF
build, lint, LiteSVM and IDL-verification steps. No overall Solana pass follows
from these intermediate results. Preserve the two actual 1,800-second refund
waits and resolve the current exact-head status before integration.

## Optional child PR snapshot

The worker inspected the following supplied exact heads for concrete failures:

| PR | Exact head | Observed check state |
|---|---|---|
| #191 proof-inputs | `61f0c6c05d245c4cc7524852224d00693929df3c` | Inventory succeeded; remaining checks queued or running. No failed check observed. |
| #192 liquidity | `0fb8452cb38c835e9dccb660f63f6af3156c9f91` | Inventory and forge succeeded; remaining checks queued. No failed check observed. |
| #193 arbitration | `f7bd867bc1ee15854b36ba268cedc275c2429c28` | Inventory, docs-tooling and native Nostr succeeded; remaining checks queued or running. No failed check observed. |

These are timestamped incomplete observations, not child-PR qualification. No
source repair was indicated by the observed jobs. This worker performed no remote
mutation, retry, cancellation, merge, deployment, release, permission change or
timeout weakening. Only this new evidence document was added locally.
