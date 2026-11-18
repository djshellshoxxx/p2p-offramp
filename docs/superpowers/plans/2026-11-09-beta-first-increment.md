# P2P Offramp beta first-increment implementation plan

> For agentic workers: use the available native implementation workflow or `superpowers:executing-plans`; execute test-first and preserve command evidence. No background workers are implied.

**Goal:** advance PO-B12 by rejecting incomplete, duplicated and malformed retained npm-registry evidence.

**Architecture:** harden the existing offline registry-signature checker; use locally generated ECDSA fixtures to drive the actual CLI in temporary directories. Reuse all current signature and tamper checks. No new approval mechanism or dependency.

**Tech stack:** repository Node >=24; built-in node:test, fs, crypto and child_process APIs.

**Spec:** [accelerated beta design](../specs/2026-11-09-accelerated-beta-design.md).

## Global constraints

- Base: #59 at `a136909721046ec8a540ed98ecfdcbf4c4bcf8ad`; isolated branch `gpt/p2p-beta-spec-20261109`.
- Keep #58, D1/D9, Solana, custody, trust roots, retained authoritative evidence and all release/network flags unchanged.
- No main merge, deployment, paid agent dispatch or funded transaction.
- Synthetic signatures exercise validation only; they are not npm attestations or release authority.
- One narrowly owned package.json edit may append the new regression file to the existing `test` command. No dependency, lockfile or workflow changes.

## Review focus

- Two valid signatures for the same provider must not satisfy a two-provider inventory.
- Missing/unparseable/non-string expiry must not bypass the historical observation-date check through NaN or coercion.
- Signed version/integrity must identify the same package as the lockfile.
- Valid records in either order must continue to pass; a legitimately unexpired historical key remains admissible for the recorded observation date.
- Tampered signatures/integrity and expired keys must continue to fail; fixture failures must not masquerade as reproduced defects.

## Task 1: fail-closed provider evidence

Files: modify `scripts/check-npm-registry-signatures.mjs`; create `scripts/tests/npm-registry-signatures.test.mjs`; modify only the existing test command in `package.json`.

Interface: `node scripts/check-npm-registry-signatures.mjs` still reads the retained keys/metadata and package-lock.json relative to the repository working directory; success emits the same scoped JSON report. Failure remains nonzero. The required provider set remains exactly `@noble/hashes@2.4.0` and `@noble/curves@2.4.0`.

- [ ] Add synthetic P-256 keys, SSH-wire key IDs, real signatures and a minimal lockfile in an isolated temporary fixture; invoke the actual checker with the current Node executable, no network or dependency installation.
- [ ] Assert a valid two-provider fixture passes and reports two distinct providers. Assert duplicate-only evidence, missing providers, invalid/missing/non-string expiry and lock version mismatches fail. Retain wrong-integrity, expired-key and corrupted-signature controls.
- [ ] Run `node --test scripts/tests/npm-registry-signatures.test.mjs` against unchanged source. Confirm the targeted assertions fail because the checker wrongly returns success.
- [ ] Require the exact provider inventory with no duplicates; require null or a parseable string expiry before comparing the existing observation date; bind lock version as well as integrity.
- [ ] Run the focused suite and syntax/diff checks. Add its explicit path to the existing `npm test` command without changing other tests.
- [ ] Publish a small draft stacked on #59 with exact reproduction and verification evidence.

## Task 2: repository qualification and continuation

- [ ] On a full Node >=24 checkout, run the focused tests and ordinary npm test, typecheck, boundary/spec checks and the applicable release/native/browser gates. Recheck the retained real evidence without replacing it with generated fixtures.
- [ ] Record candidate SHA, environment, counts, skips and unrun checks; independent review must examine this verifier's complete input contract.
- [ ] Continue PO-B01/D9/D1 through their assigned owners; do not treat this supply-chain repair as closing any wallet, browser or testnet requirement.

## Execution record

At plan creation: the checker was fetched from #59 and its Git blob hash matched `7470dfd23fef696ca01304c323a3d4348f506956`. The execution container has Node 22.16.0, below this repository's Node >=24 requirement, and cannot clone/download GitHub. Built-in-only focused tests can provide bounded regression evidence, not full repository/toolchain qualification. The required Node >=24/CI and integration runs remain outstanding until separately recorded.
