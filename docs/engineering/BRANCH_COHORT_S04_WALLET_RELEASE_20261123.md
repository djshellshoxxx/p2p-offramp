# S04 wallet EIP-1271 and signed-release provenance — 2026-11-23 UTC

**Disposition:** source mapping completed; branch remains **V-partially reconciled**, *not* approved for merge. No source edits, financial acceptance, native execution or deployment occurred in this check.

## Immutable inputs

- Current default branch: `main@01f6f4feca051d68de24a04299cd3bb444bce40c`.
- Original divergent S04 stage: `claude/loving-einstein-xgzvdy-s04-wallet-release@4ebe660f0514cc8e9ed580bf0cc23bc5a80dfad2`. Its comparison to main is **four ahead, 626 behind** with merge base `a88560741e60146a424cc18fcb2cc1043756ae3e` (history relationship, not content equivalence).
- Open original owner [PR #40](https://github.com/djshellshoxxx/p2p-offramp/pull/40): `claude/loving-einstein-xgzvdy-m0-s04-wallet-release@7706859d2385cae0f8e49615392de08dfee83f84`, stacked on `claude/loving-einstein-xgzvdy-m0-s03-core-messaging@404dc3daa8b19904c7da29d71d49d8df0f5e03ba`. Owner PR still open and unmerged; its Qodo review submission is **COMMENTED**, not approval.
- The stage itself adds 18 stage-local files. The owner PR contains 19 relevant paths because it adds `packages/security/test/release-update-http-encoding.test.mjs` to correct the transport header interpretation.

## Complete path-level Git blob proof

GitHub recursive trees were retrieved at all three immutable SHA identities above (stage tree 2,102 entries, PR owner tree 2,106, main tree 3,378; none truncated). SHA equality means exact file bytes, not behavioral qualification.

| S04 stage-local path | Stage blob prefix | Owner PR #40 | Current main |
| --- | --- | --- | --- |
| `.github/workflows/evm-escrow.yml` | `907fb52806` | exact | updated `26c317db15` |
| `contracts/evm/test/mocks/Eip1271RecoveryFixture.sol` | `83ba7e42ee` | exact | absent |
| `package.json` | `4d7013fd41` | exact | updated `9bb6a80bce` |
| `packages/security/README-UPDATES.md` | `e877f8f8fe` | exact | updated `200d1db8a3` |
| `packages/security/src/release-locator.ts` | `79aec59a93` | exact | exact |
| `packages/security/src/release-manifest.ts` | `fa3231902a` | exact | exact |
| `packages/security/src/release-update-http.ts` | `d217a23439` | updated `90a1ff4480` | updated `5d6bb39977` |
| `packages/security/src/release-update-store.ts` | `7e015bbc6c` | exact | updated `3685b61d0a` |
| `packages/security/src/release-update.ts` | `2b0d5f5445` | exact | updated `cb0548c59b` |
| `packages/security/test/release-update.test.mjs` | `a98a7900b4` | exact | updated `639cd286ec` |
| `packages/wallet/contract-acceptance.ts` | `2b1252e6aa` | exact | exact |
| `packages/wallet/src/evm-contract-acceptance.ts` | `343ecdb14b` | exact | updated `c3fa750035` |
| `packages/wallet/src/evm-execution.ts` | `184a6a73fd` | exact | updated `8c0727c48f` |
| `packages/wallet/test/evm-contract-acceptance.test.mjs` | `3c95a09680` | exact | updated `61920638ec` |
| `packages/wallet/test/evm-execution.test.mjs` | `66246d3a82` | exact | updated `d08491dabb` |
| `scripts/test-eip1271-local.mjs` | `3f0ddfce4b` | exact | absent |
| `scripts/test-evm-reconcile-local.mjs` | `a3409c037e` | exact | updated `24af2fac1a` |
| `scripts/test-exchange-evm-local.mjs` | `828daf0444` | exact | updated `5da1726571` |

**Reconciled:** 17/18 stage-local blobs are byte-identical in the owner PR; the remaining `release-update-http.ts` was intentionally corrected there. All 18 original paths remain present in the owner PR. On current main, 3/18 are byte-identical, 13/18 have subsequently changed and 2/18 are absent. This is **not** evidence that the absent tests' behavior has been exercised by today's suite.

The owner-only `packages/security/test/release-update-http-encoding.test.mjs` is **already byte-identical** on main (Git blob `cfcbe045a2ac1ba9b2709f40f66ef9ab60066869`). Do not resurrect S04's older reader: it incorrectly treated encoded HTTP `Content-Length` as the decoded stream length. The owner fix separates identity-encoded lengths from decoded-byte enforcement, and main's `release-update-http.ts` retains that distinction. Replacing it with the older stage would regress signed-asset update availability / fail-closed semantics.

## Concrete native acceptance coverage gap (not a proved production vulnerability)

Two original, owner-preserved files are **absent from current main**:
1. `contracts/evm/test/mocks/Eip1271RecoveryFixture.sol` (blob `83ba7e42eeead97a6a99455b4a82b714dbcc8701`).
2. `scripts/test-eip1271-local.mjs` (blob `3f0ddfce4bb986b3423ecfffa40685614a16d28c`).

The historical native harness brings up local Anvil, deploys an EIP-1271 fixture and escrow, and verifies a bounded read-only contract-wallet acceptance flow including wrong magic, revert, gas exhaustion, oversized/short return, revoked signature, changed terms, chain reorg, lost session and EOA fallback refusal. Its source reports `adapterSendsOrSigns:0` for the verifier; fixture setup legitimately sends only local developer-key transactions. That is an **unexecuted historical harness in this run**. It must not be mistaken for live-wallet proof.

Current main *does* retain `packages/wallet/test/evm-contract-acceptance.test.mjs` with extensive controlled RPC unit coverage, but the repository tree has no corresponding native EIP-1271 fixture or dedicated `test:eip1271:local` package script at this source SHA. Its absence is a **native coverage/recovery opportunity**, not evidence the production verifier is broken. Do not duplicate PR #40's source: first recover its fixture and adapt its harness to the current trust/registry/toolchain interfaces on an isolated candidate, retain negative modes, run a true provisioned local Anvil/Forge job and independently review before considering an integration PR.

## Gates, ownership and next source work

1. **Preserve PR #40 ownership and the S04 historical head.** It targets an old stacked stage, not current main. Resolve historical Tier C owner approval, relevant current-source/target checks and review; a Qodo `COMMENTED` event is not a passing review. Do not merge old wallet/release production code mechanically.
2. In an isolated owned follow-up, port only unique native EIP-1271 test coverage where not already superseded; check `packages/wallet/src/evm-contract-acceptance.ts` and `packages/security/src/release-update-http.ts` against today's behavior. Prove real contract reads, rejection cases, no approval persistence, correct `eth_call` block anchoring and no wallet-send authority from the verifier.
3. Treat the old owner PR's `build:testnet` missing-key failure as historical and **not a release waiver**. Check any fresh exact-head native and browser runs separately.
4. Other open financial stacks #237–244 and optional #224–232 retain their review, real-runtime and owner gates. No change to `ReleaseEnabled=0`, Solana/EVM/Nostr boundaries or noncustodial architecture.

**Execution limitation:** The local shell cannot resolve `github.com` for a clone, so no local `git merge-base`, `patch-id`, `range-diff`, Node/Forge/Anvil/Chromium test or native run was completed. GitHub's compare API and exact recursive tree/blob metadata support only the explicitly labeled verification above. This finding is source reconnaissance and test-gap identification, not an accepted feature completion.
