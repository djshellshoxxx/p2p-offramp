# Generation 32 — native Solana prepared funding

## Result and source boundary

**The native Solana client now supports an explicit funding review before
confirmation.** `prepareFunding()` persists the exact unsigned message and
returns immutable review data. The existing `confirm()` and `cancel()` paths
retain private per-client authority, durable intent handling and physical
wallet serialization. The native acceptance driver is configured to exercise
that review path for its existing SOL and original-SPL funding admissions.

The frozen combined source passed **2,654/2,654 tests**, with zero failures,
skips, cancellations or todos, plus all six additional qualification commands.
Independent client, driver and combined-provenance reviews found no actionable
findings. G32 remains a separate unpublished child above published PR239 at this
checkpoint. The configured driver, local tests and compiled artifacts do not
establish execution of the new path on a native validator or browser.

| Checkpoint | Exact identity |
| --- | --- |
| Published parent, [PR239](https://github.com/djshellshoxxx/p2p-offramp/pull/239) | `708a3a2bc167cbbc15eaa3d3c168e058499c7f8e` |
| Published parent tree | `6916074089257c759f2e9695b30e5bf955eb5258` |
| Combined tested source / tree | `5f9fd0a0f2f6d5bf16bcc21fb38a5e2ae0559031` / `d3b738a378218927d86241a1db987a57af87eec8` |
| Intended continuation branch | `codex/solana-prepared-funding-continuation-g32-20261120` |
| Initial client source | `800e633dc47c3bd24065093b50bdc78fa709d3ab` |
| Corrected client source / tree | `252dd1603f12eab69313ef25b538be1b040bc508` / `65667d0089b986250b5f8697518863069368d855` |
| Native driver source / tree | `e214f70f8bcbb9eb962fc147f2d318081daca2ce` / `9e7564a188b8b87f5498ac749eee62db7951317f` |
| Client author evidence | `2a5fb33568d5433749ffa2fd78786060b8d4ab07` |
| Native driver author evidence | `fcd74b9d577a59af55d942d85d472de9cebe2228` |
| Independent client / driver reviews | `fadd204e3616f7d262add42a7f72a55d27079158` / `1e17cb5d489969b3b52f6a9bc47d2729c836790d` |
| Independent composition supplement | `989b3f0e5132d5311ff26bc8ee371795b5ca380d` |
| Root qualification packaging / tree | `ba23030d7d82836eede828c5354387d2b887f58e` / `acc9ed33ffa77764e35b4c2ba81c3bff89e049a2` |

The complete source delta changes `packages/chain-solana/src/compose.ts`, its
package README and `contracts/solana/localnet/client-run.mjs`, and adds
`packages/chain-solana/test/prepared-funding.test.mjs`. Of PR239's 1,029
non-documentation entries, **1,026 remain exact**; three entries change and one
is added, with no deletion. All **1,030** resulting entries equal the reviewed
client-plus-driver source. Evidence is separate from the tested source.

The three source cherry-picks preserve complete patches and ordered parents:
`800e633` maps to `5124bbac57e7a45d51efc5b5d7d08d4edf1328d5`, `252dd160`
to `924109d3351bbe88bfbcbff9ed8e2e973f835e33`, and `e214f70` to the combined
source above. Root integrated the client, driver and composition review evidence
as `ba0d38fcedffcab838cb588fc2fdbc5a11dd8ccd`,
`c1c1977a0fd1c2f8f40ea1e54f6264c23ff4e78f` and
`3806186e06cc727cc96a717c9166450f4f81ac7a`, respectively.

## Client behavior and retained authority

The [client report](SOLANA_PREPARED_FUNDING_GENERATION32_20261120.md) describes
the dedicated `prepareFunding(trade, sellerSession, options?)` entry. Its view
fixes the action to funding, role to seller and expected escrow state to absent.
The existing exit-only `PreparedSolanaActionKind` and `prepare()` contract still
accept only release, refund and payout; `prepare(..., 'fund')` remains refused.
Existing direct `fund()` semantics remain intact.

Funding options are captured synchronously before queueing. Only the named
plain own data properties `sellerTokenAccount` and `rebuildOf` are accepted;
canonical address and intent-ID validation apply before asynchronous work.
The frozen captured values cannot change while waiting behind a wallet prompt.
The existing funding planner supplies the message and asset rules, and the
existing preparation path persists the exact message and original blockhash
before exposing the immutable review.

The private capability map remains the authority for confirmation and
cancellation. Copies, serialized views and other clients' objects confer none.
Confirmation consumes that capability before awaiting work, rechecks current
profile/session ownership, persisted identity, finalized eligibility and the
original blockhash, and compares exact message bytes before and after physical
signing. The durable signature and send marker precede the single RPC send.
Cancellation revokes immediately but does not release a pending physical wallet
prompt early or retract a marked intent. Uncertain results are reconciled
without automatic resend; explicit replacement rules remain unchanged.

The browser recovery protocol and controller still require an already funded
escrow and expose only exits. This change supplies no browser funding admission,
peer-acceptance carrier, mint permission, new deployment, endpoint or trust root.
The existing reader, planner, journal, submitter and wallet algorithms remain
unchanged. Preparation does not prove source-account execution or grant a new
asset-policy exception.

## Native acceptance companion

The [native driver report](SOLANA_PREPARED_FUNDING_NATIVE_GENERATION32_20261120.md)
binds the one-file companion. Its existing SOL and SPL funding admissions now
call `prepareFunding()` and then explicit `confirm()` through the maintained
`act()` finalized-reconciliation path. New assertions check unsigned and unsent
preparation, immutable review data, the exact funding source and original
blockhash, a durable prepared intent, and matching intent/message through one
physical sign and one broadcast. The SPL flow names its existing synthetic
seller ATA; the SOL flow supplies no token account.

The complete original driver remainder was independently reconstructed byte
for byte. Crash and refund still exercise direct funding. Existing post-funding
scenarios, transaction amounts, real-time refund waits, margins, programs and
workflows are preserved. The added sign log records synthetic public addresses
and public message bytes, without changing signing or transport behavior.

The native author compiled **42 repository inputs** to one **194,659-byte** ESM
output with installed Rolldown, with no warnings. The output was never evaluated.
Its SHA-256 is `4bf495a5bbe5b4b931472967a216bdfe15b1e38bfb4c39a1a64f1953a9f7b3e6`.
This build-only evidence and the configured driver require actual hosted
execution on the final source before native prepared-funding acceptance can be
claimed. Earlier direct-funding validator results do not cover this new path.

## Separate reviews and retained failures

| Evidence | Actual result and interpretation |
| --- | --- |
| Client baseline | 50 reported cases: one existing exit-only control passes, 46 absent-method assertions fail and three nested parent subtests report aggregate failure. This is not 49 distinct missing behaviors. |
| Initial client implementation | Focused 50/50 and all four TypeScript projects pass. The wider package check reports 366/367 because the new fixture exceeds the existing 120-column limit. |
| Corrected client implementation | Five exact statement wraps preserve assertions, string literals and production bytes. Boundary/funding selection 55/55 and final package selection 367/367 pass. |
| Independent client review | Corrected source passes 98/98 and all four TypeScript projects. Four original probes cover option capture, disposal, profile replacement and delayed-wallet deployment changes. Earlier 93/93 results remain overlapping evidence for the earlier source. |
| Independent driver review | A separate 2/2 controlled helper command executes all 13 added helper assertions per case with the actual corrected client and existing scripted ports. Exact whole-driver reconstruction, syntax and whitespace checks pass. |
| Independent composition review | All source cherry-picks, seven finalized logs, 25 actual emitted assets, six graphs and 274 module references are verified without rerunning suites or builds. |

The [independent client review](INDEPENDENT_SOLANA_PREPARED_FUNDING_REVIEW_GENERATION32_20261120.md)
and [receipt](solana-prepared-funding-independent-review-generation32.json)
verify all nine author execution snapshots, all 38 indexed artifacts and the
separate author whitespace receipt. Failed optional formatting diagnostics
remain explicitly labeled recovered transcripts. No assertion or timeout was
relaxed to repair the line-boundary failure.

The [independent driver review](INDEPENDENT_SOLANA_PREPARED_FUNDING_NATIVE_REVIEW_GENERATION32_20261120.md)
and [receipt](solana-prepared-funding-native-independent-review-generation32.json)
verify 17 indexed native-author artifacts, 42 compiled inputs, the output, six
protected regions, four supplemental receipts and three recovery artifacts.
The unavailable-esbuild attempt remains an original failed command. The later
packager's Git-submodule/file error remains a recovered traceback with its
original script; the corrected checker respects Git entry types. The original
source-preservation invocation script was not retained, and the independent
review reconstructs the entire unchanged driver remainder separately.

The controlled driver probes substitute a bounded `act()` boundary that returns
the actual **sent** journal record. They do not fabricate finalized state or
execute the native driver entry point. Author, reviewer, adjacent and full-suite
selections overlap and must not be summed or presented as one combined command.

## Combined qualification and artifacts

The seven-command coordinator batch ran on the clean frozen combined source
from **2026-11-20 19:33:40.216887 UTC** through **19:35:29.992690 UTC**.

| Qualification | Actual result |
| --- | --- |
| Full Node suite | **2,654/2,654**, zero failures, skips, cancellations or todos |
| TypeScript | All four configured projects passed |
| Build policy | **58/58** |
| Import boundaries | 242 production files / 155 core modules |
| Default build | 12 files / 817,257 bytes; document/vault-Worker/QR graphs **102/30/4** |
| Demo build | 13 files / 829,355 bytes; graphs **104/30/4** |
| Native updater fixture preparation | Strict 37-module compilation; **build only**, `nativeExecuted=false` |

The complete full-suite raw log is 267,573 bytes, SHA-256
`94209a7cdcdbaf7773bce37da3745bb8659a848ae2e91afbc50029bf2c10427b`.
The [combined qualification](qualification-generation32.json) and
[retained-log index](retained-logs-generation32.json) bind exact sources,
commands, timestamps and complete outputs. Retained gzip uses `mtime=0` with
separate raw and compressed hashes.

The [independent composition report](INDEPENDENT_SOLANA_PREPARED_FUNDING_COMPOSITION_REVIEW_GENERATION32_20261120.md)
and [receipt](solana-prepared-funding-composition-review-generation32.json)
confirm that both ordinary asset manifests and all six module graphs exactly
match G31. The new native funding code remains outside ordinary/default/demo
graphs. Both builds keep `assets/vault.worker-yOnLqpF_.js`, SHA-256
`d3bc5bf253cf1e30914a932e126d2d41bedc19d217d9baa94748975243c04165`,
empty connection origins and `connect-src 'none'`. `ReleaseEnabled=0` remains.

The full Node suite also builds the maintained explicit Solana-localnet fixture
and checks its native Worker graph, exact local CSP and release refusal. That
temporary artifact is removed by its test. The updater's separate 37-module
preparation also removes its temporary modules. Neither command executes a
browser or validator, and neither establishes native funding acceptance.
Immutable physical dependency hardlinks were reused without installation or
mutation.

## Integration and remaining gates

**PR236 remains the frozen main-target aggregate for PR233–235**, head
`d9ddcf53d82100f05de7346143a0ad00d43c2c1a`. Preserve those original heads and
branches. Its current-main qualification, expected-head guarded merge and
main/tree/ordered-parent/ancestry readback precede reconciliation of contained
PRs. This plan continues to supersede their older sequential merge instructions.

PR237 is the retention child, PR238 the sharing child, and PR239 the published
startup child. PR239's verified proposed merge is
`5aa48eece421e74b745791f3d93b271acd595b7f`, with complete tree
`6916074089257c759f2e9695b30e5bf955eb5258` and ordered parents PR238 head
`1c658181fb2bd04ffc4df0d0fbdf6735da3e7fce`, then PR239 head above.
Publish G32 separately above PR239 with exact source/evidence mapping and actual
head/base/proposed-merge readback. After each parent merge, retarget or reconcile
the child against actual main and refresh target-specific gates.

G32 is **D8 Tier C** because it adds preparation for signing and funding. Apply
the [accepted policy](../adr/ACCEPTED-DECISIONS-2026-11-04.md) and its
[authoritative detailed packet](../adr/proposed/D8-merge-policy-and-branch-protection.md)
to the actual final source and target: require applicable green hosted checks,
actual execution of the new native driver admissions, independent review and
qualifying owner authorization recorded in the PR before merge. Local authoring
and review do not establish that approval. Preserve each standalone G29/G30/G31
Tier B requirement for a **CodeRabbit or Qodo pass with findings answered**;
a later Tier C child does not waive a parent's gate.

The coordinator observed all 14 PR236 checks queued at 19:31 UTC. At 19:37 UTC,
its readback showed the original PR233 native-validator and browser steps
successful, PR234's native browser step running, and PR235's native-validator
step running. These dated observations neither qualify PR236 nor establish
G32 acceptance. Check actual source/target gates again before any merge; parent
results and identical assets do not transfer qualification.

G33 has separate author/reviewer ownership for an inactive pure funding-display
projection from G32 source. It remains in progress at this checkpoint, with no
completion or browser-funding claim. Actual unfunded browser admission still
needs its own provenance and restore contract; the funded recovery import and
candidate-only Solana peer acceptance remain unchanged. Optional PR224–232 and
audits184–186 retain their independent owners. No release, deployment, trust
provisioning, real-funds operation or optional-feature activation follows.

## Historical handoff preservation

The new sections in the handoff and feature matrix prepend the complete prior
files as unchanged byte suffixes. Their older present-tense and publication-
pending statements remain dated history.

| Historical suffix | Bytes | SHA-256 |
| --- | --- | --- |
| `CONSOLIDATION_HANDOFF.md` | 90,189 | `ccca9dd492e1f18926a0e0bec8c4442b3fd3e8c516f27e1be2d18598733ecfcb` |
| `FEATURE_MATRIX.md` | 59,014 | `a0ac505bdcd08e90d431fe9283e36d1468db5a82011842e1223d73e859bd631c` |
