# Blue-team security audit — 2026-11-15

## Executive assessment

**Disposition: NOT READY for real-funds operation. Keep `ReleaseEnabled=0` and the default connection-origin allowlist empty.**

This is a defensive, source-informed audit of the consolidated integration branch, not a penetration test, external cryptographic certification, production-host review, or real-funds qualification. The reviewed branch was `integration/p2p-consolidated-20261109`, at `e8d9d0343884835fdce895fdd450ba766c15aad8` (the preceding integrated source checkpoint is `961cc6f1e3e999b6d35ad5361bc59f2906f1058c`).

The strongest blue-team control is that the application remains deliberately non-operational for trading: the operator guide says `ReleaseEnabled=0`, `connectOrigins=[]`, no production registry/trust root is approved, and the shipped default build does not bundle wallet execution. This materially limits exposure. It is not evidence that the unfinished controls are safe to enable.

**Priority summary**

| ID | Priority | Finding |
|---|---|---|
| BT-01 | P0 release blocker | Canonical escrow ABI mismatch: the reader is pinned to `escrows(bytes32)`, while the canonical contract uses `getTrade(bytes32)`. It fails closed, but cannot provide canonical funding observations. |
| BT-02 | P1 | D1 peer acceptance remains a design decision, not a complete cryptographic acceptance protocol. Current `terms-accept` carries only a revision. |
| BT-03 | P1 | D9 durable send-marker work (`sendMarkedAt`) remains in a separate unfinished lane; duplicate-send and nonce-provenance safety must not be assumed complete. |
| BT-04 | P1 release blocker | The end-to-end browser journey (G1/D8) and two-wallet acceptance (G5) remain blocked; the shipped UI is not an operational trading journey. |
| BT-05 | P2 | Chain observations trust one injected RPC; no independent corroboration or light-client proof exists. A dishonest RPC can lie consistently. |
| BT-06 | P2 | No repository-level `SECURITY.md` or documented private vulnerability-reporting route was present on the audited branch. |
| BT-07 | P2 | Crypto dependency provenance review for the EVM reader's Keccak dependency remains explicitly pending. |
| BT-08 | P1 release blocker | Combined-head security/release qualification is incomplete: independent security review, Sonar A, real testnet acceptance and device/accessibility evidence remain open. |

Priorities describe release/security significance, not proof of an exploitable remote vulnerability. BT-01 through BT-04 are confirmed project gaps documented in the repository. BT-05 and BT-07 are acknowledged trust/provenance limitations. BT-06 is a governance/control gap.

## Scope and method

Reviewed the consolidated branch's README, root package scripts, operator guide, client-side architecture decision, task ledger, EVM MVP gap register, Pages beta handoff, prior whole-source audit records, the EVM chain reader implementation and its focused tests.

The review used a blue-team lens:
- prevention: deny-by-default authority, identity binding, immutable transaction terms and dependency integrity;
- detection: explicit unknown/error states, provenance and auditable release evidence;
- containment: bounded RPC work, cancellation, offline defaults and least authority;
- recovery: durable intent markers, canonical chain reconciliation and fresh-key restore;
- governance: reporting, independent review, operational ownership and release gates.

No source implementation was changed and no tests were executed in this review. Historical test results cited by existing repository documents are treated as recorded evidence, not as freshly rerun results.

## Findings

### BT-01 — P0 release blocker: canonical escrow ABI mismatch

**Evidence**
- `packages/chain-evm/src/reader.ts` selects the six-word `escrows(bytes32)` getter and decodes that legacy/local layout.
- `packages/chain-evm/README.md` explicitly describes the reader as pinned to the local basic escrow interface.
- `docs/integration/mvp-gap-closure.md` records G3 as open: the canonical contract exposes `getTrade(bytes32)` with a different tuple layout. The reader currently fails closed for this canonical contract.
- `tasks/todo.md` retains G3 as awaiting an authenticated ABI-layout decision.

**Impact**
A funding or settlement observer that cannot decode the canonical contract cannot safely inform the user or downstream lifecycle authority. The current fail-closed behavior prevents a false positive but leaves the canonical journey unavailable. Do not work around this by trusting UI state, latest-block reads, or a caller-supplied ABI guess.

**Blue-team remediation**
1. Obtain the explicit owner decision for the canonical ABI layout and how each deployment record pins it.
2. Implement the layout-aware reader as a separately reviewed change.
3. Add differential tests against the pinned viem oracle and actual local canonical contract, including malformed tuple layouts, wrong runtime code, reorgs, and finalized-state races.
4. Keep unknown/unsupported results non-authoritative and retain `ReleaseEnabled=0` until the full release gate passes.

### BT-02 — P1: cryptographic peer acceptance protocol is not implemented

**Evidence**
- `docs/integration/mvp-gap-closure.md` identifies G2 as blocked by the D1 protocol definition and independent review.
- The same document identifies `packages/exchange/src/messages.ts` `terms-accept` as carrying only `{revision}`.
- The current handoff states that D1 was accepted as a design decision, while runtime implementation remains separate.

**Impact**
A revision-only acknowledgement is not proof that the peer controlling the agreed wallet accepted the exact immutable terms. If any future code treats it as cryptographic acceptance, a malicious peer, stale message, or mismatched trade context could cause a false authorization transition.

**Blue-team remediation**
1. Finalize the versioned `PeerAcceptance` wire schema and exact field names.
2. Bind signatures to chain ID, deployment, trade/terms digest, participant wallet, role, nonce, expiry and protocol version.
3. Add replay, cross-trade, cross-chain, role-confusion, stale-revision and altered-field negative vectors.
4. Verify vectors independently in two implementations and obtain a reviewer who did not author the protocol.
5. Keep the current revision-only message informational; never promote it to wallet authorization.

### BT-03 — P1: durable send-marker / recovery provenance remains incomplete

**Evidence**
- `docs/integration/mvp-gap-closure.md` lists G4: D9 `sendMarkedAt` and the versioned `IntentV1` parser/skip-rule changes remain in another lane.
- The task ledger and handoff distinguish accepted D9 design decisions from implementation.
- The gap register rates this as high security impact because of duplicate-send and nonce-provenance risk.

**Impact**
After a crash or lost response, the application must distinguish “definitely not sent” from “may have been sent.” If durable intent state does not atomically record the send boundary, a retry can duplicate a value-moving transaction or incorrectly release a nonce reservation. Conversely, treating uncertain work as unsent can lose funds or corrupt reconciliation.

**Blue-team remediation**
1. Complete the versioned durable marker and migration semantics before enabling send paths.
2. Prove write-ahead ordering: durable marker before the external send; never infer “not sent” from timeout, missing receipt, or process restart.
3. Reconcile only against fresh native transaction/nonce/receipt evidence and exact chain/deployment identity.
4. Add crash injection at every persistence/send boundary, duplicate invocation, lost response, replacement transaction, cross-deployment nonce collision and restored-backup cases.
5. Require exactly-once *effect* evidence; do not claim exactly-once network delivery.

### BT-04 — P1 release blocker: no qualified browser trading journey

**Evidence**
- `docs/integration/mvp-gap-closure.md` records G1 as blocked by owner decision and G5 as blocked by G1.
- The Pages beta handoff says the integrated Pages software is a review/recovery experience, not a production trading flow. D8 Tier C approval and D1 runtime work remain separate.
- The operator guide states the default build excludes wallet execution and keeps release disabled.

**Impact**
The end-to-end authority transitions have not been qualified in the shipped browser composition. Component-level and loopback harness results do not establish that wallet identity, signed peer acceptance, terms review, send authorization, recovery and UI state remain bound together in the actual user journey.

**Blue-team remediation**
1. Preserve the current inert default UI until the owner explicitly approves the localnet-only composition boundary.
2. Build a test-only two-wallet journey using synthetic keys and a loopback chain; assert no production egress.
3. Test account/chain switching, wallet rejection, stale tabs, concurrent actions, lock/unlock, reload, lost responses and malicious peer messages.
4. Verify that every UI action rechecks current trusted state and that display-only projections cannot grant authority.
5. Obtain independent review of the full composed path, not only its individual packages.

### BT-05 — P2: single-RPC trust is a documented residual risk

**Evidence**
- `packages/chain-evm/src/reader.ts` accepts one injected `rpc.request` interface.
- `packages/chain-evm/README.md` explicitly says independent RPC corroboration and light-client verification are not implemented and that a dishonest RPC can consistently lie.

**Impact**
A malicious or compromised RPC can fabricate mutually consistent chain ID, genesis, finalized headers, runtime code, receipts and storage responses. The reader's anchor rechecks protect against some inconsistent responses and reorg races, but do not prove the RPC's view is true.

**Blue-team remediation**
1. Keep the trust limitation visible wherever chain observations are displayed or consumed.
2. Before real-funds use, define a user-approved RPC trust model: independently operated corroborating providers, or a verified light-client path where practical.
3. Detect disagreement and return an explicit unknown/unavailable state; never majority-vote untrusted endpoints without a defined threat model.
4. Test malicious consistent lies, stale finalized views, censorship, selective omission and provider equivocation.

### BT-06 — P2: no documented private vulnerability-reporting route

**Evidence**
A `SECURITY.md` file was not present at the audited branch root, and the reviewed repository documentation did not identify a private vulnerability-reporting procedure.

**Impact**
Researchers may disclose exploitable issues publicly or have no clear route to report them. This weakens coordinated disclosure and incident response.

**Blue-team remediation**
1. Add a security policy with supported versions, response expectations and a private reporting route.
2. Enable and verify GitHub private vulnerability reporting/security advisories if available for this repository.
3. Do not publish a guessed email address or promise a response SLA until an owner accepts it.
4. Name an accountable security contact and define triage, severity assignment, patch, advisory and credential-rotation procedures.

### BT-07 — P2: EVM cryptographic dependency provenance review is pending

**Evidence**
`packages/chain-evm/README.md` identifies `@noble/hashes` 2.4.0 as the Keccak dependency and explicitly says its inventory review remains pending.

**Impact**
A pinned version improves reproducibility but does not by itself establish package provenance, source integrity, maintainer legitimacy, build reproducibility or absence of malicious release artifacts.

**Blue-team remediation**
1. Complete the dependency provenance review and record exact package integrity, source/tag correspondence and maintainer/release evidence.
2. Retain lockfile integrity checks and review transitive dependencies.
3. Verify the exact dependency set in CI and generated artifacts; investigate unexpected dependency or build-graph changes.
4. Do not treat a clean advisory scan as proof of supply-chain integrity.

### BT-08 — P1 release blocker: integrated security qualification remains incomplete

**Evidence**
- `docs/handoffs/PAGES_BETA_2026-11-12.md` says the combined integration head still needs its own complete hosted run and lists independent security review, Sonar A, real testnet acceptance, and manual screen-reader/device review as outstanding.
- The same handoff says the branch is staging, not main or a production release.
- Existing historical audits explicitly disclaim external cryptographic certification and real-funds readiness.

**Impact**
Successful checks on component PR heads or earlier commits do not prove the exact integrated tree passed all required checks. Without a final frozen-source review and exact-head CI/security evidence, regression and integration risk remains unknown.

**Blue-team remediation**
1. Run the full required hosted CI/security checks on the exact candidate commit; retain the commit SHA and raw results.
2. Resolve or explicitly disposition Sonar/security findings; do not infer safety from zero annotations.
3. Complete independent security/cryptographic review and real testnet two-party acceptance using owner-approved trust material.
4. Complete supported browser/device/accessibility qualification and incident-response ownership.
5. Verify the final release artifact against separately retained build evidence and signed trust metadata.
6. Keep release and connection permissions disabled until all required gates are explicitly accepted.

## Existing defensive controls worth preserving

- Default build is static/offline-oriented; no app-owned custodial backend or server-held user keys.
- `ReleaseEnabled=0` and default `connectOrigins` is empty.
- Default app excludes wallet execution; no automatic wallet prompt or production endpoint is approved.
- The EVM reader checks chain ID, genesis hash, finalized anchor, runtime code hash and rechecks its numbered anchor.
- The reader bounds concurrent physical RPC work, uses deadlines, suppresses late responses after cancellation, and avoids exposing provider exception strings.
- The reader returns unknown/pending/reorged states rather than treating missing receipts as proof of failure or permission to resend.
- Vault/recovery, artifact integrity and test-only transaction workflows have substantial existing regression coverage according to the repository's dated evidence records.

These controls should not be relaxed to make an unfinished journey appear functional.

## Verification still required

This pass did not run local tests, hosted workflows, dependency scanners, fuzzers, browser automation, a live testnet, or external RPC comparisons. It did not inspect every source file or third-party implementation. Before treating the audit as a complete assurance case, refresh the branch and repeat a full source review of the wallet executor, D9 intent journal, D1 message/signature implementation, canonical escrow contract/ABI, release/build pipeline and CI configuration. Findings BT-01 to BT-04 are based on explicit current gap records and should be revalidated after their owners land changes.

## Final recommendation

**Maintain the non-release posture.** The project has meaningful defensive foundations, especially its offline defaults, bounded readers and conservative unknown-state handling. The principal remaining risk is incomplete authority composition: canonical chain-state interpretation, cryptographic peer acceptance and durable send provenance must all be completed and independently verified before the application can safely coordinate real value.
