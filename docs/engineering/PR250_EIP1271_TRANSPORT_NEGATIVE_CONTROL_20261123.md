# PR250 — EIP-1271 native error versus transport-failure negative control (2026-11-23 UTC)

## Immutable source identity
- Repository: https://github.com/djshellshoxxx/p2p-offramp
- Current main (read-only): `01f6f4feca051d68de24a04299cd3bb444bce40c`.
- Frozen parent PR249: https://github.com/djshellshoxxx/p2p-offramp/pull/249, exact head `bd860c66c3f50deda72392523ac8fc8860703f84`, stacked on PR246; still draft/unmerged.
- New DRAFT child PR250: https://github.com/djshellshoxxx/p2p-offramp/pull/250, branch `audit/eip1271-execution-fault-negative-control-20261123`, exact head `d75d2a00d4cfdd83fd681c361eefce69bc91c617`, one-file blob `d0921a48ac0722511eb18e2fc405c20be5c26b1a`.
- GitHub compare PR249→PR250: ahead **1**, behind **0**, only `scripts/test-eip1271-local.mjs`, 46 additions/5 deletions. GitHub compare main→PR250: merge base main; ahead **4**, behind **0**. No product modules or contracts changed.

## Engineering correction
PR249's negative-mode oracle required expected result `UNAVAILABLE` and an observed `eth_call`. A generic transport failure at that boundary could meet those conditions, even if the native fixture never returned an EVM execution error. This is a test-coverage problem, **not a demonstrated production-wallet vulnerability**.

PR250 records the actual `RpcError` classification at each negative `eth_call` boundary and requires a JSON-RPC execution error (`RPC_ERROR_<code>`) instead of `RPC_UNREACHABLE` or an arbitrary thrown error. It additionally checks exact wallet address, EIP-1271 selector/digest, gas bound and canonical block-hash anchor, and independently reads the deployed fixture's `mode()` state. A separate injected `RPC_UNREACHABLE` scenario must cause the newly strengthened helper to reject the false positive. These controls preserve the original five native scenario groups and all earlier assertions.

The control **does not establish exact revert-versus-out-of-gas causal attribution** for every provider. A future trace/revert-data oracle may be necessary if independent review requires that stronger claim. `RpcError` JSON-RPC error codes alone are not proof of the exact EVM revert reason.

## Verification and gates
- GitHub remote file content/immutable blob readback **matched** the authored patch.
- V8 parsing of the complete file in an async wrapper after removing imports and `import.meta` succeeded. **Parse-only, not runtime test execution.**
- GitHub current parent/head refs and ahead/behind compare were checked. PR250 is DRAFT and unmerged.
- **No local Anvil, Forge, Chromium, Node integration suite, financial/native test or executed RED/GREEN** in this run. Exact PR250 hosted tests, CodeQL/security, independent Tier C review, recorded owner authorization and PR249/PR246 parent acceptance must be verified before any integration. Earlier PR249 11/11 hosted checks cannot be transferred to PR250.
- No force push, source branch deletion, real funds, deploy, release, keys, production policy change or optional-default activation. `ReleaseEnabled=0` remains the authorized posture; no release-setting write was performed.

## Full census and handoff
A new fully paginated GitHub branch scan counted **262 refs** (unique). The preceding complete PR inventory had 246 PRs; PR250 is the one new confirmed open PR in this run, giving **247 total / 65 open by delta**, not a full PR re-pagination. Master classification: A137/P64/F34/C5/E0/V21/B1/D0 (262 total). Keep previous snapshots unchanged. Next: inspect PR250 exact-head CI/native failure artifacts; if a concrete failure occurs, correct only the child on a new reviewed SHA. Continue other disjoint branch reconciliation while Tier B/Tier C and owner approvals block merging the financial stack.
