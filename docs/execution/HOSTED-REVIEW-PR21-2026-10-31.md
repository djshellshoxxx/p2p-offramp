# Hosted review and follow-up verification — PR #21

This is a source checkpoint, not a passing claim for future CI or its own merge.
Final exact-head checks and guarded main readback are recorded in
[PR #21](https://github.com/djshellshoxxx/p2p-offramp/pull/21).

## Functional CI and deterministic compiler inputs

Initial `5a6dfac` passed browser, schemas/crypto, specs, inventory, isolated EVM,
Foundry and CodeQL. Native local-trade jobs failed the new strict recipe guard:
local recursive vendor checkouts added inferred remappings absent in fresh CI.
The committed recipe disables inference and requires exactly two explicit maps.
Independent layout/global-config/bytecode probes and native checks passed.
Corrected published `aa108b5` then passed every functional job, both CodeQL
language jobs and aggregate CodeQL. Later source is checked separately.

Changing compiler metadata changes raw artifact hashes. The executable runtime
without CBOR metadata is identical; original archived pins remain unchanged and
old raw digests never qualify new deployments. No check or recipe guard was
relaxed to manufacture this result.

## Qodo

[Finding 4434563935](https://github.com/djshellshoxxx/p2p-offramp/pull/21#discussion_r4434563935)
identified geth's non-null derived address for failed CREATE receipts. Official
geth v1.16.5 receipt derivation and RPC serialization confirm this representation.
Pinned Anvil 1.5.1 actually returns null; that distinction was verified rather
than substituting the report's initial client generalization for evidence.

T16 now accepts null or the exact authenticated sender/nonce-derived address.
Requested CREATE identity, canonical inclusion, empty code and repeated anchors
remain mandatory; foreign/undefined values cannot clear a guard. Six proof tests,
nine hygiene tests and eleven native-kit checks pass. Native evidence includes a
real failed CREATE and a clearly labelled geth-shaped adapter over that same
transaction, not an actual geth deployment qualification.

Closed automated [PR #22](https://github.com/djshellshoxxx/p2p-offramp/pull/22)
contains one two-file proposal at `9f5201d` for the same behavior. Its entire patch
is covered by the stronger negative/native-tested implementation. Commit
`db1b14f` preserves the proposal's ancestry using the already-tested source;
the before/after tree identity was verified. No unique proposal behavior or
original branch was discarded. The [published-head snapshot](CONTINUATION-ANCESTRY-2026-10-31.json)
includes all 26 compatible heads; only the archival custodial head stays separate.

## CodeRabbit

The completed initial review covered all 58 files at `5a6dfac`. Four findings were
reproduced against applicable source and fixed under their existing task owners:

| Finding | Final disposition |
| --- | --- |
| [4434572168](https://github.com/djshellshoxxx/p2p-offramp/pull/21#discussion_r4434572168), eval imports execute the CLI | T18 shares a tiny Node-only entry detector across all identified guarded tools. Eval/print imports stay inert, ordinary/symlink entries run, and query/fragment preload aliases cannot cause double execution. |
| [4434572170](https://github.com/djshellshoxxx/p2p-offramp/pull/21#discussion_r4434572170), falsy accepted state bypasses rollback validation | T17 treats only initial filesystem ENOENT as absence. Present null/false/zero/empty strings, malformed records and bad sequence/digest values fail with RELEASE_ROLLBACK. Actual G15 tests retain rollback and exact-resume checks; default KEY_UNPINNED stays closed. |
| [4434572180](https://github.com/djshellshoxxx/p2p-offramp/pull/21#discussion_r4434572180), intended offline settings are dropped | T15 passes offline mode explicitly through trusted compiler call sites, including prerequisite production-tool builds. The ambient Foundry option filter remains closed. |
| [4434572187](https://github.com/djshellshoxxx/p2p-offramp/pull/21#discussion_r4434572187), early Node 24 warning breaks test expectations | Child tests suppress only ExperimentalWarning and prove unrelated warnings/errors remain visible. The declared Node range is unchanged; no older binary execution is claimed. |

The valid test-sensitivity nit was also fixed: an in-bounds genuine byte carrier
with a shadowed byteLength getter must parse with zero getter evaluations. Extra
drift-key diagnostics remain optional; fixed error codes and strict recipe
validation already hold, and raw configuration values are not exposed.

Independent follow-up found two further defects before source delivery. The
accepted-state reader could follow a symlink, allocate a whole oversized file or
block on a FIFO. It now validates a regular bounded file before allocation,
checks descriptor identity/size, reads at most 8,193 bytes, wipes/closes and refuses
replacement. Entry-detector extraction also initially stripped query/fragment
identity; actual preload probes reproduced duplicate invocation. URL suffixes
are now rejected before path comparison, while literal encoded filenames work.
These changes passed different reviewers; they were not silently accepted as nits.

Final focused counts: recovery 12, schema references 6, CLI entry 11, G24 21,
hygiene 9, deployment proof 6. Some overlap the full package suite; do not sum
them as unique coverage. Shared-entry review also passes all 26 fuzz and 22 policy
tests and actual ordinary/eval/preload/literal-path probes.

## Sonar

Initial check `124764593849` and corrected `aa108b5` check `124765362979` both
**fail**: 14.3% new-code duplication, C security and D reliability. Required values
are at most 3% duplication and A ratings. The three exposed annotations are:

| Issue | Reviewed context |
| --- | --- |
| `AaGVpOAjvhmA8F2DzPjW`, builder key sorting | Exact ASCII two-key membership validation requires deterministic key ordering, not human-language collation. |
| `AaGVpOAlvhmA8F2DzPjX`, recovery CLI file read | Bounded readonly explicit operator reference paths and fixed embedded sidecars; imported fields cannot choose a destination or grant authority. |
| `AaGVpN5VvhmA8F2DzPjV`, pending-guard reread | Fixed pending-deploy.json under the operator-selected directory, reread to preserve a guard replaced during native proof; imported receipt fields cannot redirect it. |

The reports were reviewed with readonly/redaction/canary/replacement probes and
focused tests, including an isolated exact-`aa108b5` snapshot. No concrete defect
was reproduced in those three reports. Detailed duplication blocks and the full
underlying Sonar inventory are unavailable through the exposed check. This is
not a claim that the failed gate is clean. No issue was dismissed and no scanner,
exclusion or quality-gate setting was changed. Final-head status remains separate.
