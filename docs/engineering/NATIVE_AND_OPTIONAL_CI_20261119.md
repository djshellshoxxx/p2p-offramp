# Native and optional CI progress — November 19, 2026

## Observation and scope

Status snapshot: November 19 at approximately 16:31 Pacific
(`2026-11-20T00:31Z`). The worker first reread the current consolidation handoff
and resolved the live PR heads. All supplied #188–#197 heads were unchanged.
Earlier completed browser analysis remains in the two preceding hosted reports.

This follow-up records the newly completed #189 real-validator stage and completed
optional-PR contexts. Remaining queued/running checks are unfinished qualification;
no failed current-head job was observed on #189–#197. The failed #188 browser job
is the previously diagnosed fixture failure already corrected and qualified on
#189/#190.

## Newly completed native stage

At PR #189 head `9611d6a5cb404fed5d41eeb176dafb31c01de640`,
[program job 135971622812](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44640971208/job/135971622812)
now reports **success** for real validator client acceptance including refund and
recovery (step 14), and for Chromium installation (step 15). Actual encrypted
Worker/browser recovery and real-time refund (step 16) is running.

The exact head tree remains `938b76f923df166717ef522666575e37a0623825`; its
identity with hosted merge checkout `0b4567e88048d52a8ae4bd0c7d8ca4b23006f079`
was independently verified in `HOSTED_QUALIFICATION_20261119.md`.

For coordination:

- [#188 program job 135965138780](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44639090596/job/135965138780)
  is also running step 16 after successful real-validator acceptance, at unchanged
  head `a728ce290eb2fcbe9b4a9e857cc84ced401da70f`.
- [#190 program job 135982126950](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44644082116/job/135982126950)
  is still running step 14 at unchanged head
  `2b23ee614ff2dd05bd3a6e79f1278658c30a3909`.
  Its nine other listed contexts remain successful, as recorded in
  `GENERATION2_HOSTED_QUALIFICATION_20261119.md`.

No overall Solana pass is claimed. Preserve the actual refund timelocks and
current heads until those jobs finish; no source edit is indicated by these stages.

## Completed optional contexts

These are the completed successful contexts observed at the pinned heads below.
Every listed optional PR still has unfinished required checks.

| PR | Successful contexts at observation |
|---|---|
| #191 | `local-trade`, `native-nostr-relay`, `docs-tooling`, `forge`, `inventory`, `local-evm` |
| #192 | `local-trade`, `native-nostr-relay`, `local-evm`, `docs-tooling`, `forge`, `inventory` |
| #193 | `forge`, `native-nostr-relay`, `local-trade`, `inventory`, `docs-tooling` |
| #194 | `native-nostr-relay`, `forge`, `local-trade` |
| #196 | `native-nostr-relay` |
| #197 | `native-nostr-relay`, `inventory` |

PR #195 had no completed context at this snapshot and is excluded from the
completed-result table. Queued work is not a source failure or evidence of a
repository-wide outage.

## Optional source and tested merge identity

The optional source heads have parent
`ac9a4b0ffc3ca50a299398e72554e7964a634cd4`, while their PR target is the newer
generation 2 head `2b23ee614ff2dd05bd3a6e79f1278658c30a3909`.
GitHub therefore tests a merge tree containing the newer base. The following
head trees and merge trees were read directly from GitHub's Git-commit API.
Each cited completed job's checkout log independently identifies the listed merge.

| PR | Source head | Source-head tree |
|---|---|---|
| #191 | `61f0c6c05d245c4cc7524852224d00693929df3c` | `be88b287938122c319b62ee7462bf3a5003dfd9a` |
| #192 | `0fb8452cb38c835e9dccb660f63f6af3156c9f91` | `3ab9817bec3b4e62cab92b9ce0d9ef2f53435a02` |
| #193 | `f7bd867bc1ee15854b36ba268cedc275c2429c28` | `66d18800ca406996513eaa1eec97567d95d226b3` |
| #194 | `a419b420dcee58ce99391a0f73289aa28dc6413b` | `946ad1109e5a586439f43983de10e9fa8cd1e43d` |
| #196 | `4bc4c7e2833b6b8540b8586624fb1697817e02e2` | `9feb9bdbe77edbd6f11e486bf1785ab76c43a5ca` |
| #197 | `86952b1ccc8eb9c25a3be05d6a32d3c556df8c84` | `22d7b4e2ab6756a33eed3598115dab7ca1a9c24f` |

| PR | Actual merge checkout | Merge tree | Confirming completed job |
|---|---|---|---|
| #191 | `61b29d6cc1af5099ec8d3dd8ea1157d458bfd7ff` | `d63269ee36ea625fb0450a2311135a46a0ede425` | [local-trade: 135983838780](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44644591809/job/135983838780) |
| #192 | `53e54d620c9f4f562c4bf3299dc57921347ca154` | `9be9e40e5cfa6257ea2d1fd2995a3edbaae4688b` | [forge: 135983874777](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44644603569/job/135983874777) |
| #193 | `9c48a74075603a9f9832b5ad67868600c2bd680d` | `37984ce7f1cbb698f76fd36248b68e3ca86813a8` | [forge: 135983936139](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44644622081/job/135983936139) |
| #194 | `6324f116e6969c2cdf0c45305d905ee9d4ca82cc` | `fb9c37c1bf24aec0a8f860f31be795547c542329` | [forge: 135987637690](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44645716690/job/135987637690) |
| #196 | `864477c124a6f064270ffcdb08e5bf9391f22946` | `1fae0bcf2f2263b6164930a4a56ebd5803764185` | [native-nostr-relay: 135987783552](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44645760014/job/135987783552) |
| #197 | `3847e6f49337317a2c402e2f4eb94730959fcf12` | `97712823a475470b48564f48745b4ab5852db8c9` | [native-nostr-relay: 135987836250](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44645775844/job/135987836250) |

Each merge's ordered parents were checked: first the generation 2 target
`2b23ee614ff2dd05bd3a6e79f1278658c30a3909`, then the corresponding source head.
These results do not establish the final combined tree of multiple optional
packages; that later integration needs its own checks.

## Next actionable gate

There is no newly failed job to reproduce or repair. Continue the independent
source queue while the outstanding native and optional checks execute. If a
current-head check fails, inspect its actual failed step/log before changing code;
do not retry or alter timeouts merely because work is queued.

The newly published proof-jobs PR #199 has a dedicated
[proof-jobs qualification job 135990906144](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44646673275/job/135990906144)
for head `e7e1aa90072f4b0376820f0e9b28e609707de74f`. It had not completed when
first discovered, so no proof-jobs browser or Worker-drain result is included here.
PR #198 likewise had no completed check at first discovery.

This worker performed read-only hosted inspection and added only this local
report. No source repair, remote write, retry, cancellation, merge, timeout
reduction, deployment, release or settings change was performed.

