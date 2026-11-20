# Successor consolidation — generations 6–8

The independently reviewed core source passed **2,259/2,259 tests**, zero failures/skips/cancellations, all four TypeScript projects, 57 policy tests, 44 tooling tests, 32 specification tests, boundaries, docs/governance and default/demo builds. See `core-qualification-generation8.json` for exact commands, outputs and log digests.

Tested source: `7e8f93a02d6ffb98164ed3b09ba3db5b44bd9390`; tree: `b330e1ca3a8a22598197bdd5de9532a0c56a917b`. Only reports/coordination follow this source. Publication branch: `codex/generation8-core-20261120`. Resolve its live PR and PR200 for the published identity; verify full local/remote tree equality.

PR205 is draft because it lacks these repairs. Its successful ancestor browser checks do not qualify this successor. Main remains `5c5a84ef6300330700c8b0ca54d074ac113f08be`; no main merge, deployment or release occurred. `ReleaseEnabled=0` remains.

## Four independently reviewed causes

| Cause | Correction and evidence |
| --- | --- |
| Portal cleanup — Medium | Failed build no longer deletes a replacement directory: cleanup checks created device/inode. Original regression failed; corrected portal 4/4 and tooling 44/44 pass. Generation 7 independently closed it. Not atomic against continual local path substitution. |
| Review navigation — Low | Late draft/file/sample/favorite completion rechecks initiating route; draft also checks mounted/unlocked/current generation. One cause across four entry points. Original8 pass/7 fail; corrected15/15 plus two independent real-controller/registry cases pass. |
| IndexedDB opening cancellation — Medium | Cancel only the caller's wait; preserve shared open and forbid cancelled late transactions. No retained updater BUSY. Independent original store6/9 and controller1/2; corrected37/37 includes four new event-order cases. Physical HTTP drain unchanged. |
| Solana expiry context — Medium | Finalized exact-slot block height anchors expiry and final absence must cover that context. Preserve genesis/floors, markers and no automatic resend. Original0/2; corrected30/30 plus five independent cases pass. |

These add four causes to the previous 25, total 29. Five production paths change from PR205; all 56 commands, metadata/lockfile, six workflows, 65 contract entries and nine financial scripts are unchanged. Both actual 1,800-second refund waits and strict signature/send/marker/principal/fee assertions remain. Default trust stays unset; updater and optional packages remain unwired.

The earlier combined source b67bd81 passed 2,244/2,245: two overlong new test lines caused its only failure. Correction c7245d7 passed the unchanged boundary5/5. The final full-suite log SHA-256 is `19939270f35d1d8f6791310f3ea4ba643f0b9e93d035c2ecdefab65d18f936bd`.

## Limits and handoff

Generation 6–8 code/bug/security reports preserve original failures and independent closures. The initial broad security worker was blocked by automatic screening and its lead was unverified. The coordinator independently established the Solana issue; a fresh scoped reviewer closed it. A blocked worker is not clearance. New recovery-export coverage passed 45/45 without another defect. Reviews remain scoped, not whole-product/native-browser/physical-device certification.

HOSTED_REVIEW_GENERATION9_20261119.md and JSON bind actual ancestor checkouts. At02:30:30UTC November20, PR205's16 browser groups passed but native Solana was running. PR202's first native refund gate passed and second actual-Worker/refund gate was running. Running native logs were unavailable; no final financial receipt was inferred. These successes do not qualify the corrected descendant.

Optional composition evidence is in OPTIONAL_COMPOSITION_GENERATION8_20261120.md; it predates these repairs. Keep one package per PR. Fresh generation 9 feature/bug/security workers separately advance the current-runtime backup-verification prerequisite; it is excluded from this frozen core. Current-source distribution remains refused for stale immutable locale evidence; six claims remain unapproved. Owner trust/configuration and real-device qualification remain separate.

The existing hourly task continues bounded productive generations from durable refs. Remaining credits are unobservable; exhaustion cannot be certified. Completed workers do not remain running after the turn.
