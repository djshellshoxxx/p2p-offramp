# P2P Offramp beta first increment: execution record

Plan: [first increment](2026-11-09-beta-first-increment.md).
Specification: [accelerated beta](../specs/2026-11-09-accelerated-beta-design.md).
Date: 2026-11-09 owner-local session; final verification after 2026-11-10 01:00 UTC.

## Delivered

- Committed the staged completion specification, PO-B01 through PO-B15, two-role journeys, explicit fiat/escrow limitations, critical path, parallel ownership and later milestones.
- Reproduced acceptance of two valid records for the same provider in place of the required distinct `@noble/hashes` and `@noble/curves` inventory.
- Reproduced malformed key-expiry admission through JavaScript date coercion/NaN comparisons, and acceptance of a lockfile version that disagrees with the signed package version.
- Hardened the existing offline checker: require the exact unique two-provider set, null or a parseable string expiry, and exact lockfile version/integrity correspondence. Historical observation-date semantics and existing cryptographic/tamper checks remain intact.
- Added 18 built-in Node tests and included the new test file in the existing standard test command. No dependency or lockfile change.

This advances PO-B12 only. It does not implement D1/D9, qualify a live wallet or authorize a release.

## Source and ownership

Base: PR #59, `a136909721046ec8a540ed98ecfdcbf4c4bcf8ad`.
Branch: `gpt/p2p-beta-spec-20261109`.
Implementation head before this documentation: `1c65cf230066fb660d04ded78d3e319f8e2f2fe1`.

Tested file identities (Git blob SHA-1, for source correspondence only):

| File | Original | Tested/published |
| --- | --- | --- |
| `scripts/check-npm-registry-signatures.mjs` | `7470dfd23fef696ca01304c323a3d4348f506956` | `1d41862ebdc312a6df81bf7d6508e336aef8eb37` |
| `scripts/tests/npm-registry-signatures.test.mjs` | new | `4ee61c730eb5963532b81f616afaff750ab078ae` |
| `package.json` | `93b866bea079cb687a1d3eecd90ba42e6bacf029` | `1eb82528ca2d6aceb296c745a03a0d45c61d13e5` |

Final package.json diff only appends the test file to `scripts.test`; unrelated build-policy ordering is preserved. #58 and the D1/D9, custody, Solana and reserved schema work remain untouched. Authoritative recorded keys, evidence, compiler/provider pins, release trust and network/funds flags are unchanged.

## Executed verification

Environment: Linux, Node 22.16.0. **The repository requires Node >=24**, so these focused checks do not qualify its required runtime. The container could not clone/download GitHub. Retrieved files were reconstructed in an isolated source-subset workspace and their Git blob identities compared with source/published metadata. No complete repository checkout or dependency installation was available.

The test harness generates synthetic P-256 keys and real ECDSA signatures, computes SSH-wire key IDs, writes isolated temporary JSON fixtures and invokes the actual verifier. It performs no network access. These fixtures are not npm attestations and do not replace the retained real evidence.

| Check | Actual result |
| --- | --- |
| `node --test scripts/tests/npm-registry-signatures.test.mjs` against original checker | 10 passed, 8 failed because invalid evidence incorrectly returned success |
| Same suite after repair, final repeat | 18 passed, 0 failed, 0 skipped |
| `node --check` on checker and new test | Passed |
| `git diff --check` in source-subset workspace | Passed |
| Package JSON parse and test-command inclusion | Passed |
| `npm test` attempt | Could not execute the project suite: `ERR_MODULE_NOT_FOUND` for the absent `scripts/test-support/register-tsx.mjs` in the source subset |

The eight RED cases were duplicate hashes, duplicate curves, five invalid/missing/coerced expiry classes, and lockfile version mismatch. Valid inventory in either order, legitimate historical expiry and existing tamper/refusal cases remain passing.

Retained session log SHA256 values:
- RED: `2eedd0380fdfb3f69475d5a2789a5423bf4b17443c68def78e8dc0fa7de77188`.
- Final GREEN: `7453c977a66da06b129c03521ded76b3b9d72683c4f865d3a56d58b131f6390c`.

These identify locally retained logs, not external execution attestations. The missing-loader result is a source-availability limitation, not a demonstrated project regression.

## Plan status and remaining gates

Task 1 test-first implementation, focused verification and publication of tested files are complete. Draft PR creation is the next publication step. The plan's initial unchecked boxes are superseded by this record only for those executed steps.

Task 2 is open: full Node >=24 checkout, ordinary npm test, typecheck, boundaries/spec checks, verification against retained real registry evidence, applicable native/browser/release gates and independent review. Source self-review was performed; no independent reviewer was available or dispatched.

The parent #56 Sonar blocker and Tier C/owner approvals remain unchanged. Keep the PR draft; do not infer a merge or release permission from this report. No main merge, deployment, funded trade, paid development-agent workflow or trust-root/funds enablement occurred. Next core milestones remain reviewed D9 durable-send provenance, D1 participant acceptance and integration of the two-party EVM journey.
