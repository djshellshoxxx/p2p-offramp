# Generation 32 — native prepared-funding acceptance companion

## Result and boundary

The existing native Solana client driver now admits its SOL and SPL funding flows through
`prepareFunding()` followed by explicit `confirm()`. This companion is frozen at
`e214f70f8bcbb9eb962fc147f2d318081daca2ce`, tree `9e7564a188b8b87f5498ac749eee62db7951317f`, on corrected client source `252dd1603f12eab69313ef25b538be1b040bc508`.
It changes only `contracts/solana/localnet/client-run.mjs`: 51 additions and 3 removals.

This is a configured native acceptance path with local syntax, build and source-preservation evidence.
The driver, its compiled output, a validator and a browser were **not executed** for this companion.
Actual native acceptance remains pending hosted execution on the eventual combined source. Existing
validator results for earlier direct funding do not qualify these new prepare-and-confirm admissions.
No new native check count, send count or financial-run duration is claimed.

## Driver behavior

For each of the existing SOL and SPL funding admissions, the driver now checks that preparation:

- performs no physical wallet signing or client RPC send;
- returns frozen review, binding and shape objects tied to the seller and the expected absent escrow;
- encodes the exact funding source and original blockhash in the reviewed message;
- durably stores exactly one prepared intent with no signature, send marker or outcome; and
- retains that exact review identity and message until confirmation.

Confirmation continues through the existing `act()` and finalized reconciliation path. New assertions
compare the same intent and reviewed bytes to the durable result, the single physical wallet-sign call,
and the single broadcast transaction. The SPL flow passes its existing synthetic seller ATA explicitly;
the SOL flow passes no token account. Wallet instrumentation retains only the synthetic account address
and public message bytes, and changes no wallet signing algorithm or RPC adapter behavior.

The complete crash and refund flows still use direct funding and are byte-identical to the parent.
The existing transaction scenarios, refund waits, margins, programs, transfer amounts, post-funding
checks, deployment pins, synthetic localnet trust fixture and workflows are preserved. No browser
funding UI, mint permit, runtime policy, optional feature or release setting is activated.

## Retained verification

| Check | Exact result and scope |
| --- | --- |
| JavaScript syntax | `node --check contracts/solana/localnet/client-run.mjs`, exit 0; complete empty output retained. |
| Full whitespace | `git diff --check 8e836baa877b676a863c877003e277b638fc5061`, exit 0, no excluded paths. |
| Initial build-only attempt | Exit 1 because the optional `esbuild` package was unavailable. Original script, complete error and receipt retained. |
| Corrected build-only compilation | Installed Rolldown 1.2.15, Node v24.22.3; 42 repository inputs, no warnings, one 194,659-byte ESM output. Node builtins and bare package imports remain external. Output was never evaluated. |
| Source preservation | Exactly one changed tracked path; six original protected regions verified byte-for-byte, including complete crash/refund/main flows. All other tracked entries are exact parent entries. |
| Recovery evidence integrity | All 17 retained artifacts, 42 compiled source hashes, one compiled output and six protected byte regions verified against frozen Git objects. No completed syntax/build checks were rerun. |

The compiled output SHA-256 is
`4bf495a5bbe5b4b931472967a216bdfe15b1e38bfb4c39a1a64f1953a9f7b3e6`.
Its deterministic gzip SHA-256 is
`722ff0853158fa696c9d02ec29f7568740571dcfb0e8ddd4cfabdcf75ca9a445`.
The source file SHA-256 is `11242e040bed614cdfcc054fbd3ca002fc653be6b888b5087c87af708a75ed83`.
Every retained compressed artifact records both raw and gzip hashes and uses gzip mtime 0.

The successful syntax check ran at 19:24:41 UTC; the original full-whitespace check followed immediately.
The unavailable-esbuild attempt ran at 19:25:20 UTC, the successful Rolldown compilation at 19:25:47–48 UTC,
and source preservation was recorded at 19:26:07 UTC on 2026-11-20. Recovery packaged these existing results.
The original source-preservation invocation script was not retained; its complete result and hash receipt
are preserved, and the recovery checker independently verifies every reported unchanged byte region.

## Evidence and remaining qualification

- [Machine-readable receipt](../execution/solana-prepared-funding-native-generation32-20261120/receipt.json)
- [Original command and source artifacts](../execution/solana-prepared-funding-native-generation32-20261120/initial-artifacts.json)
- [Recovery evidence checker](../execution/solana-prepared-funding-native-generation32-20261120/verify-evidence.py.txt)
- [Recovery verification receipt](../execution/solana-prepared-funding-native-generation32-20261120/07-evidence-integrity.json)
- [Final source-and-evidence whitespace receipt](../execution/solana-prepared-funding-native-generation32-20261120/11-final-whitespace.json)

Root coordination must combine this driver with the reviewed client source, qualify the final combined
source, retain independent review, and obtain actual applicable hosted checks. This companion neither
establishes Tier C owner approval nor authorizes a merge, release, deployment or real-funds operation.

### Packaging recovery

After the successful evidence-integrity and initial source-and-evidence whitespace checks, an additional
packaging check treated the existing `forge-std` Git submodule pointer as a regular file and raised
`IsADirectoryError`. The original packager and exact recovered tool-result traceback are retained;
the traceback is explicitly distinguished from an original command-output capture. The corrected
packaging checker verifies all 1,028 non-documentation blobs by Git content hash and both existing
submodule entries by their exact tracked mode and commit pointer. All 1,030 entries remain exact frozen
source entries. No production code, test assertion or native-driver behavior changed during recovery.

- [Packaging failure and recovery metadata](../execution/solana-prepared-funding-native-generation32-20261120/09-packaging-recovery.json)
- [Git-entry-aware verification receipt](../execution/solana-prepared-funding-native-generation32-20261120/10-git-entry-type-check.json)
