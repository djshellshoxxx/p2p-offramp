# P2P-RQ00 research evidence receipts, version 1

This development-only tool admits a bounded record of research claims against an
explicit local source checkout. It never runs commands from a receipt, contacts a
network, generates keys, changes release gates, or authorizes funding.

**Admission is not proof of execution.** Source and log hashes establish byte
correspondence. An independently trusted Ed25519 signature establishes attribution
of the complete record to that signer. Neither proves that the claimed commands
ran or that a signer reported honestly. Every successful admission therefore
returns `executionVerified: false` and `releaseAuthorized: false`. No production
trust root is shipped.

## Verify a record

From the repository root, with Node >=24 and Git installed:

```sh
node scripts/research/receipts/cli.mjs verify \
  --receipt /path/to/canonical-receipt.json \
  --root /path/to/clean-source-checkout \
  --repository https://github.com/djshellshoxxx/p2p-offramp \
  --commit EXACT_40_CHARACTER_COMMIT
```

The expected repository and commit must come from the reviewer's own source
selection. The checkout's `HEAD` must equal the expected commit. Every listed
source must be a regular, tracked file, with its SHA-256 matching both the local
bytes and the blob at that commit. Untracked files, dirty listed files, symlinks,
path traversal, replacement Git objects and mismatched source identities fail
closed. This is an explicitly listed source set, not a proof that every relevant
input was listed. Repository URL is a source identifier supplied by the reviewer;
this tool does not authenticate repository ownership or fetch that URL.

An unsigned record may retain `FAIL`, `BLOCKED` or `UNKNOWN`. It is returned as
`UNAUTHENTICATED_RECORD`. For an unsigned successful local run, record its actual
exit codes and test counts, retain receipt result `UNKNOWN`, and explain the
missing independent attestation in `limitations`. The unsigned record must not be
presented as a qualified pass.

`PASS` always requires a valid signature from a key in an independently supplied
policy. Pass `--policy /path/to/trusted-policy.json`. `requireSigner: true` also
requires a signer for non-PASS records. A signature attached to any record is
always checked; an unknown signer is never silently ignored.

The policy has this exact shape (canonical encoding is required):

```json
{
  "format": "p2p-offramp/research-trust/v1",
  "repository": "https://github.com/djshellshoxxx/p2p-offramp",
  "commit": "REVIEWER_SELECTED_40_CHARACTER_COMMIT",
  "requireSigner": true,
  "trustedSigners": [
    { "id": "REVIEWER_SELECTED_ID", "publicKeyPem": "REVIEWER_SELECTED_ED25519_SPKI_PUBLIC_KEY_PEM" }
  ]
}
```

The displayed example is explanatory, not an executable trust policy. Obtain an
existing authorized signer and public key through the review process. Do not copy
the receipt's own proposed key into the trusted policy. The verifier accepts only
Ed25519 public SPKI PEM, not private keys or receipt-embedded trust declarations.
Policy repository and commit must exactly match the separately selected source.

CLI exit 0 means **record admitted**, including admitted FAIL/BLOCKED/UNKNOWN. It
does not mean the experiment passed. Read `result` and `admission` from JSON
stdout. Exit 1 emits only a fixed `EVIDENCE_*` code to stderr. Rejected values,
paths, Git diagnostics and credential text are not echoed.

## Format and construction

[`schema.json`](./schema.json) is the versioned JSON Schema for structural
validation. `receipt.mjs` consumes that same file with a deliberately limited
validator; there is no second hand-maintained structural schema. Unsupported
keywords and constraints alongside `$ref`/`anyOf` are rejected by this validator.
Cross-field, source, canonical-wire, secret and signature checks are additional
requirements enforced by `admitReceipt`; JSON Schema alone is not admission.

Required fields are:

| Field | Meaning |
| --- | --- |
| `format`, `id`, `createdAt` | Exact v1 format identifier, bounded ID, UTC timestamp with milliseconds |
| `repository`, `commit`, `sources` | Expected HTTPS repository identifier, full Git SHA-1 commit, relative source paths and SHA-256 hashes |
| `commands` | Exact argv array and relative cwd; execution classification; exit code/signal; explicit test counts or null |
| `tools` | Name, exact version, origin, license, sourceCommit and binarySha256; unknown source/binary identity must be explicit null |
| `buildConfiguration` | Relevant named build settings; include profile, lockfile/config pins in sources, and limitations on unspecified inputs |
| `fixtures`, `fixtureNote` | Each fixture's listed source path/hash, origin, license, rights statement and synthetic boolean; explain an empty fixture list |
| `result` | PASS, FAIL, BLOCKED or UNKNOWN |
| `logs` | One retained bounded log per command, SHA-256 of retained redacted UTF-8 bytes, redacted/truncated flags |
| `limitations`, `reproducibility` | Nonempty lists of bounded explanations and reproduction instructions |
| `attestation` | Null, or Ed25519 signer ID and lowercase 64-byte signature hex |

Tool versions must be explicit dotted versions (optional `v`, prerelease/build
suffix), a full 40-character source commit, or a 64-character digest. Ranges,
`latest`, `unknown`, and aliases are rejected. `sourceCommit` and `binarySha256`
are claimed metadata: tool artifacts, licensing and rights are not downloaded or
independently authenticated by this tool. Null pins require a corresponding
limitation. Include the verifier, dependency lockfiles, build configuration and
fixtures in the reviewed source set when they affect the claimed experiment.

Use imports to construct a record from actual observations without executing its
contents:

```js
import { canonicalize, makeLog, admitReceipt } from './scripts/research/receipts/receipt.mjs';

// receipt is a complete object matching schema.json, populated from observed data.
receipt.logs = [makeLog(0, capturedOutput, { secrets: knownSecretLiterals })];
receipt.result = 'UNKNOWN'; // No independently trusted attestation was supplied.
receipt.attestation = null;
const wire = canonicalize(receipt); // Write exactly these UTF-8 bytes; no final LF.
const admission = admitReceipt(wire, { root, repository, commit, secrets: knownSecretLiterals });
```

No collection or signing command is supplied in v1. `signingBytes(receipt)` returns
the exact bytes an already authorized signer would attest: the ASCII domain
`p2p-offramp/research-evidence-attestation/v1\n` followed by canonical UTF-8 JSON of
the complete receipt with **only** `attestation.signature` removed. Signer ID and
algorithm remain in the signed payload. The algorithm is pure Ed25519, not
Ed25519ph; sign these bytes directly. A change to any claim or signer invalidates
the signature.

The canonical wire profile sorts object keys with JavaScript string ordering,
preserves array order, and uses `JSON.stringify` string escaping. Numbers are
safe integers with no negative zero. UTF-8 must be well formed. Whitespace,
trailing LF, BOM, duplicate keys, escaped key aliases, alternative number forms,
unknown fields and future format versions are rejected. Both receipt and policy
must use this encoding.

## Result semantics

For PASS, every command must declare `execution: "EXECUTED"`, `exitCode: 0` and
`signal: null`. Every non-null test summary must have positive passed tests and
zero failed, skipped, todo and cancelled tests. At least one test summary with
positive passed tests is mandatory; exit 0 alone never qualifies. A tool-only
command may use `tests: null` when another command supplies an eligible summary.
SKIPPED, MOCKED, UNAVAILABLE or UNVERIFIED commands cannot appear in a PASS record,
even with a trusted signature. A simulation or synthetic fixture must remain
labeled as such and must not be represented as a real-network observation.

FAIL/BLOCKED/UNKNOWN preserve the recorded claim without inferring execution from
logs, success strings or hashes. In particular, a test summary is an attested
claim, not a parser-derived proof. Incomplete source lists, unsupported bounds,
missing tools, solver UNKNOWN, timeouts, physical-device gaps and hosted CI limits
belong in `limitations`; use UNKNOWN/BLOCKED as appropriate.

## Redaction and bounds

`makeLog(index, text, { secrets })` removes caller-supplied literal secrets and
conservative credential patterns before truncation and hashing. Patterns cover
private-key PEM, common provider tokens, authorization headers, credential URLs,
credential assignments including quoted JSON keys, and signed URL parameters.
Admission scans every receipt string and separately checks sensitive build
configuration names and split argv flags. Sensitive settings/arguments may use
the literal `[REDACTED]`; document the resulting reproduction limitation.
`--secret-env NAME,OTHER_NAME` supplies known secret values from existing
environment variables without placing values on the command line. Missing or
empty named variables fail closed.

This is a best-effort detector, not a proof of absence of all secrets. Unrecognized
credentials, arbitrary encodings, fragments and low-entropy values cannot be
identified generically. Supply known literals and review the retained receipt
before publication. Do not include production credentials in an experiment.
The hash covers only retained redacted bytes; raw secret-bearing log hashes are
not published. `redacted` and `truncated` are claims, not independent proof about
the original output. Original logs are not needed for admission and are never
loaded through receipt-controlled paths.

Limits: 256 KiB receipt or policy; 64 commands/logs; 256 sources/fixtures; 8 KiB
UTF-8 per retained log; 1 MiB per input to `makeLog`; 8 MiB per source and 64 MiB
total listed source bytes; 10 seconds per Git subprocess. Errors are fixed codes.
Inputs must be ordinary files. This is a local review tool, not a hardened
multi-tenant service or an atomic snapshot mechanism: review a quiescent checkout
and run it with independently trusted Node/Git binaries.

## Validation and fixture attribution

```sh
node --test scripts/tests/research-evidence.test.mjs
```

The tests cover wrong/dirty/untracked source bytes, traversal/symlinks, missing
identity, untrusted policy, signature tampering/domain binding, forged success,
skipped/mocked/unavailable/unverified checks, empty tests, canonical-wire attacks,
unknown fields, log bounds/hashes and credential leakage with fixed diagnostics.

The unit tests import the **publicly published** seed and public key from
[RFC 8032, section 7.1, TEST 1](https://www.rfc-editor.org/rfc/rfc8032#section-7.1).
They do not generate keys. These data are synthetic test material under the RFC's
IETF Trust/BCP 78 terms and are attributed to Simon Josefsson and Ilari Liusvaara.
The seed is public and offers no real authentication. Synthetic signed receipt
tests exercise the mechanism only; never admit that key into an operational
policy. The synthetic text source fixture is locally authored and explicitly
dedicated to CC0-1.0. No external cryptography dependency was added; the tool uses
Node built-ins and existing Git.
