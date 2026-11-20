# Independent review — local SOL proposal codec, generation 35

## Result and source

**No blocking issue found within the inactive proposal-data codec scope.** The
implementation matches the frozen public/private record contract and preserves
existing recovery and funding authority boundaries. The independent selection
passed **96/96 cases**, with zero failures, cancellations, skips or todos.

| Checkpoint | Identity |
| --- | --- |
| Reviewed source | `4228040248963389d7dae28881f1db2927ca54ec` |
| Complete source tree | `cbdc2f8d4335d356fa70a21edbcd37ec916cf2f2` |
| Source parent | `0b7832d1c5b348a0755d59152442d0318d4a620c` |
| Author evidence | `adbdffdc95654a4a0bb4a642e41d7343aad4ff39` |
| Author evidence tree | `8ee56cacbd9f6aa3191f605a529af6eb9c02526a` |
| Full whitespace baseline, main | `8e836baa877b676a863c877003e277b638fc5061` |

The change adds only `apps/web/src/solana-localnet/funding-proposal.ts` and its
focused test. Every parent entry remains exact; there are **1,035 entries outside
documentation**, including the existing two Gitlinks. The source adds no
consumer, command, controller branch, facade export, persistence operation or
wallet capability.

## Contract and implementation review

The public document is exactly `format` and the fifteen immutable native G16
terms. Strict UTF-8/JSON parsing applies the 4,096-byte view bound before the
maintained G16 encoder validates and encodes the captured terms. The frozen
canonical representation uses explicit term ordering; its identity comes from
the binary G16 message, not JSON layout. Unknown claims and extra terms reject.

The creator captures the input and all retained installed configuration values
before hashing yields. It matches genesis/program and derives network/deployment
IDs from the supplied installed configuration. The result retains the nonzero
original profile, seller role and validated configuration provenance. Returned
objects are detached and frozen through their nested terms, binding and margins.

A private record uses the existing `trade`/schema-1 container. Its decoded body
is bounded to 8,192 bytes. The domain-separated identity includes the record
format and every binding field. Decode validates the exact wrapper/body shape,
full binding, recomputed terms hash and record ID. It reads historical provenance
as data; it does not install an endpoint, authenticate a registry or manufacture
a branded bound trade. The caller precondition remains the independently
installed `parseSolanaLocalnetConfig` result.

The codec performs no encryption itself: it produces data for the existing
vault encryption boundary. Own accessors are refused without invocation.
Arbitrary caller Proxy reflection traps are outside that inertness claim.
Canonical non-core commitments, past deadlines and G16-valid large amounts remain
readable data; shared G34 `planFund` continues to decide new-funding eligibility.

## Independent execution

| Check | Result |
| --- | --- |
| Maintained proposal tests | 82 passed |
| Maintained G16 tests | 10 passed |
| Original independent probes | 4 passed |
| Combined independent selection | **96/96**, zero other outcomes |
| App UI TypeScript project | Passed; includes the inactive module |
| Static import boundaries | Passed: **244 production files / 155 core modules** |
| Source and author execution snapshots | Passed |
| Frozen author artifact verification | Passed |
| Complete main-baseline whitespace | Passed without exclusions |

The four original probes exercise delayed hashes while caller bytes, nested
configuration and wrapper fields change; domain-separated IDs across otherwise
identical network/deployment bindings and transplanted wrappers; canonical
historical/non-core/max-u64 data under forbidden clock/random/network counters;
and accessor-bearing wrappers plus altered nested provenance. No source repair
was requested by the reviewer.

The 96-case command ran on the clean reviewed commit from **20:17:17.490052 to
20:17:19.876975 UTC on 2026-11-20**. Its complete 6,359-byte output has SHA-256
`8903ce50591f6f4648514bd4d8d53c744241ba2b44e2b44c8ddb0b2f23b0686c`.
The original capture script recognized TAP `#` counters, but Node emitted the
spec reporter's `ℹ` counters. A separate retained derivative parses those
original lines and verifies all 96 pass records. The original receipt is kept
unchanged; no additional test execution was needed.

The maintained compatibility case uses the real encrypted vault/backup services
and existing controller with an in-memory store and scripted native ports. It
shows that the legacy reader ignores a bounded proposal while reading an
ordinary funded recovery record, and that fresh-key restore retains the proposal
payload and original profile. It performs no wallet connect, sign or send. This
is controlled compatibility evidence, not native/browser acceptance.

## Author evidence verification

All **16 retained author artifacts** match their compressed and raw hashes,
lengths, deterministic gzip bytes and zero timestamps. Every one of the **seven
execution snapshots** matches its complete saved binary patch and recorded Git
tree. The author evidence commit adds 19 documentation paths and preserves all
1,035 non-documentation entries.

The initial 78-case baseline contains one passing G16 fixture control and 77
missing-feature failures. The first implementation passed 77/78: an invalid
retained endpoint was refused with the config helper's generic error instead of
the codec's normalized failure. The final source changes only that narrow error
wrapper in production, and adds four focused cases. Its separate final result is
82/82. The first-tree UI typecheck and final-source four-project TypeScript checks
retain their distinct attribution. No earlier failure, test assumption or output
was replaced.

The final focused/boundary commands executed on an uncommitted tree identical to
the later frozen source; the final four-project TypeScript and whitespace checks
executed after commit. Independent verification confirmed those exact identities
rather than treating the uncommitted runs as executions of a nonexistent commit.

A separate packaging-script creation attempt failed because nested triple quotes
ended its outer Python string. It failed before creating repository files. The
complete original tool diagnostic is retained and labeled recovered; the
corrected writer separates the report template. This did not change source or
require another test execution.

## Limits and continuation

Later explicit admission still owns duplicate provenance, full-binding and
escrow collisions, shared quota, installed-configuration comparison and session,
epoch and vault CAS guards. Later preparation/confirmation must retain the
original bound trade and prepared handle with their actual wallet/session owner.
Only finalized escrow observation may add an ordinary funded recovery record.
Existing recovery import and native journal/restore semantics are unchanged.

This reviewer ran no full repository suite, build, browser, validator, financial
flow, external target, dependency installation, remote publication, deployment or
release. `ReleaseEnabled=0`. Local source review does not establish hosted
acceptance or merge authorization. Coordinator composition/current-source gates
remain separate.

[Machine-readable review and retained evidence](funding-proposal-codec-independent-review-generation35.json)
