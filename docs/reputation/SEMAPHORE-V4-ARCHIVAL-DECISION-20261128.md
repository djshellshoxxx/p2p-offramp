# Semaphore V4 evaluator: archival-only retention

## Accepted disposition

The owner approved archival-only retention on November 28, 2026 (America/Vancouver).
This settles the isolation-versus-archival choice for B4 intake / PR #155.
Optional reputation remains on the roadmap.

The research, including #287's repaired test and evidence, is preserved in
[archive/semaphore-v4-research-20261128](https://github.com/djshellshoxxx/p2p-offramp/tree/archive/semaphore-v4-research-20261128).
The immutable source revision is `ba81f6b47d819387553a3836466dfffff165dfe6`.
The archive ref is fixed to that revision. Its code and pinned inputs remain historical research.

Main at `fdf346ab8e6aacc60b501007ec10ec7ee840a701` has no Semaphore evaluator.
The archive is a historical repository snapshot preserving context and ancestry.

## Active intake separation

[PR #288](https://github.com/djshellshoxxx/p2p-offramp/pull/288) targets #155's branch.
It merges current main first, then removes the five files under `scripts/reputation/`,
the two original `docs/reputation/SEMAPHORE-V4-*` files, and `test:reputation:intake`.

The 19 files in `security/intake/{mobile-wallet,relay-transport,waku,xmtp}/` and
`.sonarcloud.properties` retain their exact #155 blob IDs. Root `package.json`
matches current main. Those other probes retain their existing execution restrictions
and need separate review; archival approval does not qualify them.

Current-main merge: `43e710c5cf9f28b0c23ad413da8e2ae5a41618f3`.
Exclusion commit: `32251834b7e878ce1f93f61d5562a46c24e9261b`.
The focused exclusion diff is seven file removals and one npm-script line removal.
The final candidate differs from main only by the 20 unrelated intake/configuration additions.

Historical PRs and original evidence remain preserved. Historical consolidation must not
restore this excluded evaluator as an active tool without a new reactivation decision.

## Findings and evidence limits

#287 repairs a false-positive lock test: accepted inputs pass, a lock-only change reaches
the exact digest rejection, and restoring the lock restores acceptance. The repaired test
and its reported mutation evidence remain in the archive.

The inherited input-isolation issue remains unresolved in the archived executable:
the runner verifies caller-controlled input paths, later mounts them for execution,
and verifies them again afterward. Removal retires the tool from active intake scope;
it does not fix the historical implementation.

The retained experiment covers a public four-member, depth-two Node/Linux fixture.
It does not qualify browser performance/memory, identity recovery, issuer policy,
score proofs, application nullifier consumption, or production adoption.
Historical installation/run instructions remain evidence, not current authorization.
This archival work performed no evaluator, Docker proof, nested dependency installation,
or provider selection.

## Preserved artifacts

These Git blob IDs belong to the immutable source revision above:

| Path | Git blob SHA |
| --- | --- |
| `docs/development/semaphore-lock-regression-20261127.md` | `274d8fd822e028cdea3bd21c281939f900e1946b` |
| `docs/reputation/SEMAPHORE-V4-EVALUATION.md` | `8b7bfa704f1e1139b0d5693aa711c1291cd3db66` |
| `docs/reputation/SEMAPHORE-V4-ORIGINAL-OBSERVATION.json` | `d4a46c50272eced5a119d858984d40e38cdfbd33` |
| `scripts/reputation/evaluation-remediated/package-lock.json` | `a8dfb96ff5f8ab2edbc13aefa1fe8c93d3c6b56b` |
| `scripts/reputation/evaluation-remediated/package.json` | `d2d819dd27e62b870ca6c2934715b5f348c6d558` |
| `scripts/reputation/semaphore-v4-evaluation.mjs` | `19ca4cb668e4d029f9aca828d391bea6ed09e1e4` |
| `scripts/reputation/semaphore-v4-evaluation.test.mjs` | `44fce4632eee82ae333530ed5d2bfe328f4ecf9c` |
| `scripts/reputation/semaphore-v4.pins.json` | `a39806c99e69d303c2cc6e9356fdf7ea7f90cec4` |

Archive comparison with #287 is identical: zero changed files. The eight artifact identities
establish preservation, not current dependency safety or application qualification.

## Reactivation conditions

Reactivation needs an explicit owner decision for a concrete optional-reputation milestone:

1. Define the host-writer threat model and execute only evaluator-owned verified inputs
   or an equivalently isolated immutable snapshot.
2. Verify input binding, cancellation and cleanup with deterministic synthetic tests.
3. Reassess exact dependencies, overrides, artifact provenance and toolchain at that date.
4. State the research question and remaining browser/application qualification gaps.
5. Obtain independent review and the applicable D8 CI and integration evidence.

Optional reputation specifications remain unchanged. Reputation evaluation gains no
authority over an existing trade's release, refund or recovery. Immediate development
priority remains core payment, payout and fund-recovery completion.
