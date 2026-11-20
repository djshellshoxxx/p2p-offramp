# Generation 9: current-backup verification prerequisite

November 19 Pacific / November 20 UTC, 2026.

## Outcome and source

F24's recovered signed-asset updater cannot use its historical browser composition
against the current runtime: that fixture calls `verifyBackup` and
`checkBackupVerification`, but current AppServices, runtime protocol and Worker
endpoint did not expose them. The maintained VaultService and scalar receipt
parser already implement the underlying read-only authentication.

This slice completes those two runtime capabilities. It is a prerequisite for the
updater's current-backup gate, not a completed update UI or production origin
transition. No network operation, trust key, endpoint, gateway, wallet owner,
navigation adapter or update route is added.

| Identity | Commit / tree |
| --- | --- |
| Current-core base | `7e8f93a02d6ffb98164ed3b09ba3db5b44bd9390`, tree `b330e1ca3a8a22598197bdd5de9532a0c56a917b` |
| Historical source | `a45e932a37153590bc329c1e9012cf18e37fe12c`, PR81 |
| Recovered contract tests | `8067b025e6f9ef329370a4606311a39baf3c274a` |
| Five-file implementation | `74d414312dacbceb35d554aa791be319a326c504`, tree `c999c8e9bfeff71a4eeaf0cc23ea9cd2bf783f5e` |
| Type/build source, including README | `dc734adc2ec11381325fcd916d87d5f8c2b40588`, tree `cfd09155dac6be95aa24a16492316a7b490eac0c` |

The historical runtime and schema test files were recovered exactly from PR81.
Production changes were selected into five maintained files; no historical App,
runtime, Worker or UI file was replaced wholesale. Current favorites, templates,
recovery and restore behavior remains intact. Source implementation is unchanged
after the stable commit given to both independent reviewers.

## Behavior and ownership

`AppServices.verifyBackup(bytes, passphrase, signal?)` requires the open profile.
The Worker invokes the unchanged `EncryptedVaultService.verifyBackup`, which
authenticates the complete supplied file with the passphrase, binds it to the
current envelope and snapshot, and checks the persisted row before and after
authentication. It returns only the existing scalar profile/revision/scope and
file/envelope digest receipt. Verification does not write or restore a vault.

The Worker retains the fact against its exact selected handle, generation,
profile and revision. `checkBackupVerification(signal?)` accepts no imported
receipt or readiness flag and freshly calls `assertFresh` before returning the
fact or `null`. Opening or exporting does not establish a fact. Fresh-key restore
does not transfer it; an unchanged source selection can retain only its own fact.

A typed selected-profile verification command clears the old fact before its
attempt. Saved-review save/delete, favorite changes and template commit commands
also clear it before their attempts, including failed, uncertain and no-op writes.
Read-only template load/preview/cancel need not retire a current fact. Lock,
replacement selection, request expiry and disposal clear it. Cancellation follows
the maintained lock/generation retirement path; late work cannot restore authority.

The document validates each returned receipt's profile against pending metadata
and rechecks the exact handle before async publication. Pending metadata remains
primitive-only. Scalar validation precedes the bounded, intrinsic-size file copy.
The document clears its owned copy after synchronous `postMessage` cloning,
including immediate post failure and late abort. The Worker clears its parsed
copy in an outer dispatch `finally`, including early BUSY and stale-generation
refusal. Caller bytes remain intact. This is owned-copy cleanup, not universal
erasure of browser memory or JavaScript strings.

The Worker preserves the existing storage `BUSY` result when the underlying
shared recovery slot is occupied. No hidden retry or additional admission is added.

## Executed verification

| Execution | Actual result |
| --- | --- |
| Finite missing-capability selection before implementation | 0 passed / 3 failed; zero skips/cancellations |
| Recovered author protocol/runtime tests | 10/10 passed; zero skips/cancellations |
| Current runtime/schema/Worker/storage affected selection | **111/111 passed**, zero skips/cancellations, 36.191 seconds |
| Four existing TypeScript projects | Passed |
| Import boundaries | Passed; 238 production files, 142 core entry modules |
| Maintained build-policy suite | **57/57 passed**, zero skips/cancellations |
| Default and demo builds | Both passed |
| Actual document/Worker/QR emitted graphs | No updater or nine optional-package references in either mode |
| Release evidence | `ReleaseEnabled=0`, `signedRelease=false`, `releaseAcceptance=false` |
| Preserved source | Package manifests/lockfile, six workflows, contracts, storage, App entry and updater implementation unchanged |

An initial all-recovered-tests run against the missing capability was interrupted
with exit130 after two failures because a held case waited for the absent command.
The incomplete log is retained, not counted as a completed baseline. The finite
three-case selection then demonstrated the missing capability. This is feature
completion and is not added to the reproduced-product-defect count.

Author affected command:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 \
  packages/schemas/test/runtime.test.mjs \
  packages/schemas/test/runtime-templates.test.mjs \
  packages/schemas/test/backup-verification.test.mjs \
  apps/web/test/app-runtime.test.mjs \
  apps/web/test/worker-endpoint.test.mjs \
  apps/web/test/pending-metadata.test.mjs \
  apps/web/test/backup-verification-runtime.test.mjs \
  apps/web/test/saved-reviews-worker.test.mjs \
  apps/web/test/saved-review-favorites-worker.test.mjs \
  apps/web/test/trade-templates-runtime.test.mjs \
  apps/web/test/trade-templates-worker.test.mjs \
  apps/web/test/recovery-references-worker.test.mjs \
  packages/storage/test/backup-verification.test.mjs
npm run typecheck
npm run check:boundaries
npm run test:build-policy
npm run build
npm run build:demo
```

Complete default output contains13 files including evidence; demo14. The build
tool's printed output count excludes the evidence file. These are new prerequisite
artifacts, not an identity claim against the prior core artifact.

## Independent review and handoff

Fresh security_completion_g9 and bug_hunt_g9 received exact stable source74d4143.
Their separately committed tests/reports should be integrated and the final
composed source should receive its own full-suite/hosted qualification. This
report does not add their tests into an invented combined total.

This worker executed no native browser/IndexedDB, physical wallet/device, current
updater fixture, production trust or origin transition. The browser environment
restriction was not bypassed. Root owns publication, CI binding and final broad
qualification of the composed feature candidate.

The next bounded F24 slice is selective adaptation of historical
`scripts/fixtures/release-update-browser.ts` and
`scripts/test-release-update-browser.mjs`. Synthetic compiled keys, addresses and
provider must remain fixture-only. Bind its backup adapter to these real methods;
preserve exact own-lock selection semantics, physical wallet drain, rollback floor
before navigation, wrong-pass/fresh-origin restore assertions and actual current
source browser evidence. A separately reviewed UI and approved production trust
composition remain subsequent work.

## Evidence digests

Logs are in `/workspace/scratch/6eace968c0df/`; build/source logs are under
`verification-feature-g9/`. Hashes below identify actual local evidence and do not
claim hosted execution.

| Log | SHA-256 |
| --- | --- |
| `backup-verification-g9-red.log` | `d2c16f11d01dad95ceebc2cca25aa28c48f02510f9e50c0defc8989c773164f5` |
| `backup-verification-g9-red-focused.log` | `afdb04ad56aa7ac8d8bb94f8e5723bb3136f598a7487f70994b244736b240768` |
| `backup-verification-g9-green.log` | `2e22f0111e1826f4a6519cc58aa5e3935ffa21bab32ec7a8e6e1dfc041c02f2c` |
| `backup-verification-g9-affected.log` | `1145da33fc2f82bc933a77663865e1ab8e8232863dce3ac0a85cab78594d4545` |
| `types.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `boundaries.log` | `a2afff1ba06119367082cb0aec36223a649eae2fcc0580855c50a042cf9f7684` |
| `build-policy.log` | `2e9fad89bd1dc41bf5b2fc12df90379628f96bbfa5f1ae2c52fd4e53270c4fe2` |
| `build.log` | `dada77159ba9233600520f3cf61bc5d12433b35490423fe76489f728bc77681e` |
| `build-demo.log` | `a0e6642e2433517647e4c6deb97a3bd35f89b707e6e4dc6fb4a69aae8d428ba7` |
| `source-preservation.json` | `2d3d3653ea74c21fb81417249b0173af756c5fbac6a216a34ea4b6f03390d6d8` |
