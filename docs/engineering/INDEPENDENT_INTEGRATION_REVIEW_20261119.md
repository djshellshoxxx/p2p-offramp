# Independent review of the combined consolidation source

## Source and conclusion

Reviewed source commit: `84814328f5534d6fceb2bbe74509fe37c5b48689`.

Reviewed tree: `0d6d70bb4465c2ce6e9395b602dc3e59a91869b2`.

Starting main: `5c5a84ef6300330700c8b0ca54d074ac113f08be`.

This fresh successor read the coordinator's handoff and machine state before
creating an isolated worktree at the published source commit. It inspected the
combined implementation and source deltas independently, rather than treating
earlier reviews or CI status as proof.

**No blocking defect was confirmed in the reviewed integration scope.** No
runtime repair was necessary. This review qualifies the combined source for
continued hosted verification; it is not a production release, a complete
cryptographic audit, or a replacement for applicable automated-review gates.

## Scope and findings

### Source preservation and build conflict resolution

The reviewed commit preserves main and all seven contributing source heads as
parents: PRs #171, #172, #174, #179, #181, #183 and #187. The source tree matches
the coordinator's recorded locally tested tree.

The resolution in `apps/web/scripts/build.mjs` retains QR artifact/graph and
license validation together with Solana profile validation and evidence. A scan
requires exactly one native Worker matching its requested profile. Mixed EVM,
Solana, demo and testnet profile requests remain rejected. Localnet output still
requires an explicit path outside ordinary output directories. All generated
evidence retains `ReleaseEnabled=0`, `signedRelease=false` and
`releaseAcceptance=false`.

The resolution in `apps/web/scripts/static-build-plugin.mjs` retains both source
policies. The QR decoder entry, implementation and jsQR dependency are rejected
from every ordinary document/private Worker graph. The dedicated QR Worker
continues to use its exact module allowlist and pinned dependency hash; it is
also rejected in both localnet profiles. Solana's fetch exception applies only
to its RPC module in its Worker profile. EVM's WebSocket exception remains
limited to the relay pool in the EVM localnet profile. Solana and EVM package
admission remain separate.

The existing build-policy suite and added cross-profile decoder regression
exercise these refusals. The executed suites also built actual EVM and Solana
artifacts and checked their module graphs and content policies. These are build
results, not browser execution results.

### UI labels

Compared the combined QR UI directly with PR #183 and the Solana UI directly
with PR #179. Six QR controls and four Solana controls now have sibling labels
with matching IDs. Select options and entered textarea values are no longer
descendants of label text. IDs are unique within each rendered component.
Solana's wrapper CSS preserves its column layout and spacing.

The label changes do not alter requests, wallet grants, signing, recovery
documents or transaction decisions. Existing exact-name browser assertions are
retained. The QR render regression passed; this review does not claim that a
physical browser or assistive technology ran locally.

### Authority and state transitions

The merged EVM readiness files byte-match the independently reviewed #181
source. Publishing a working snapshot before awaited relay work does not bypass
BUSY admission; reentrant locking remains fenced by the current epoch.
Completion publishes current controller state rather than an older captured
projection.

The reviewed Solana client retains explicit one-shot connect and review grants,
exact wallet request matching, prompt exclusivity, epoch revocation and private
projection fencing. Its tests cover late wallet results, changed accounts,
prepared-action cancellation, uncertain durable marker outcomes and encrypted
vault lock during signing. The QR review controller retains context/expiry
validation and cancellation, and provides no transaction, navigation or restore
authority.

### CI preservation

Compared the combined workflows and package scripts against starting main.
Existing required job names and test commands remain. Documentation tooling is
additive. The Solana workflow retains the native validator gate and adds its
actual browser gate; its larger timeout accommodates two independent
1800-second refund waits. The QR browser check remains part of the ordinary web
browser command. No deployment or release command was invoked by this reviewer.

## Independently executed verification

Environment: Node `v24.22.3`, npm `11.19.1`. Dependencies were installed into the
reviewer's own worktree with `npm ci --ignore-scripts`; no external dependency
symlink was used.

| Command or scope | Actual result |
|---|---|
| `npm ci --ignore-scripts` | Passed |
| `npm run test:build-policy` | 54 tests passed; zero failed, skipped or cancelled |
| Focused authority, QR, Solana and readiness command below | 106 tests passed; zero failed, skipped or cancelled |
| `npm run typecheck` | All four TypeScript projects passed |
| `npm run check:boundaries` | Passed: 225 production source files, 140 core modules |
| `git diff --check` | Passed |

Focused command:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=2 \
  apps/web/test/solana-localnet-*.test.mjs \
  apps/web/test/localnet-readiness.test.mjs \
  apps/web/test/localnet-boundary.test.mjs \
  apps/web/test/independent-localnet-client.test.mjs \
  apps/web/test/qr-ui.test.mjs \
  apps/web/test/qr-review.test.mjs \
  apps/web/test/qr-camera.test.mjs \
  apps/web/test/qr-image.test.mjs \
  packages/chain-solana/test/prepared-actions.test.mjs
```

The build-policy and focused commands ran separately. Their 54 and 106 passing
tests are not a new full-suite count and should not be added to the coordinator's
full-suite total as though all were distinct tests.

## Execution evidence

Raw logs were retained in the session's `verification/` directory. These hashes
identify the executed evidence; the commands above make the checks reproducible
after the transient worktree is gone.

| Log | Bytes | SHA-256 |
|---|---:|---|
| `audit-install.log` | 175 | `2a57e6bb4ac4c931ae5ba1ab6671be495896a9cea39bf3f70f66fb780956f113` |
| `audit-build-policy.log` | 7117 | `979d20534722e42340f3453bd2a7a369f5e7414b4d18e9fb50db24a1fbf3c747` |
| `audit-typecheck.log` | 341 | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `audit-boundaries.log` | 392 | `43747b12ab8aae1c3e36d66ac3da257eb85b1d2ea53ab547db2444495a70a37b` |
| `audit-authority.tap` | 11949 | `7218b77181e4ff3a55fa439979dc9ba86eb75002d22c71628f8c79af09620624` |

## Remaining qualification

- The exact combined hosted head still needs its own required checks. Earlier
  source-head results cannot be transferred to the integration automatically.
- Local Chromium's known Unix-socket restriction prevents actual browser
  qualification here. This reviewer did not repeat that blocked launch.
- This reviewer did not run the Solana CLI/validator, physical wallet/device
  tests, production network tests or a new full contract audit.
- The real Solana workflow must retain its real-time refund waits. A pending
  long-running gate must remain pending rather than being called a pass.
- D8's applicable automated-review requirement remains separate from this
  independent native-worker review.

No remote branch, PR, main merge, deployment, release or repository setting was
changed by this reviewer.
