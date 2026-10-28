# P2P G08/G12/G16 composition fixture and oracle packet

Follow-up: the first private diagnostic join was later implemented; see [implementation evidence](P2P_COMPOSITION_IMPLEMENTATION_2026-10-26.md). The preparation claims and unexecuted matrix below describe the original packet snapshot, not blanket current acceptance.

Status: **read-only preparation, 2026-10-26 UTC; all proposed checks UNEXECUTED.** This is a bounded handoff for an existing frozen-plan engineering gap, not a new product specification, provider approval, security audit or permission to enable trading. No runtime, test, dependency or configuration file was changed to prepare it. GhostPay's seller-recovery/EVM-flow files remain reserved for the owner's Claude assignment.

## Exact inspected source and limits

- Repository: `djshellshoxxx/p2p-offramp`, local `/workspace/p2p-offramp-pr5-validation`.
- Branch: `work/p2p-restore-commit-reconciliation-test-2026-10-26`.
- Clean intake HEAD: **`bbba912ba7bd0563fba635f915b4ae71a831c919`**; tree **`e0d223783f0c128b2fda025ffe964c3967c62794`**. Subsequent documentation commits must not be described as new runtime source or new test passes.
- `docs/evidence/P2P_COMPOSITION_SOURCE_20261026.json` pins 28 inspected code, fixture, configuration and specification files by SHA-256, Git mode and relevant line ranges/range hashes. Each working file was compared with this HEAD while producing that manifest. A hash inventory is source identity evidence, not behavior acceptance.
- `docs/evidence/P2P_COMPOSITION_ORACLES_20261026.json` supplies synthetic, public fixture data and ten proposed oracle families. It is documentation data, not a registered/executed test suite or production wire schema.
- No live refs were fetched in this slice. This local source is not asserted present in a fresh remote clone. The older private source backup and its limits are recorded below.
- Preparation inspected local files and existing tests, performed text searches and generated documentation/hashes. **No application test, build, browser, CI, contract tool, external research or denied-route retry ran.** No failing composition test has yet been reproduced. Existing module-level test names are anchors to reuse, not newly executed evidence.

## Requirements already established by the canonical contracts

The relevant contracts here are the existing specifications and TypeScript boundaries. No executable escrow `.sol` or `.rs` implementation was found in this checkout's tracked source search; interface pseudocode does not supply one.

| Canonical requirement | Existing source requirement |
|---|---|
| Pure reduction and source authority | G08 `spec-client-state-authority.md:43–47`: reducer performs no I/O/wallet call; configured native chain observations determine custody; display freshness is not submission preflight; fiat assertions do not establish custody. |
| Wallet/session and restore separation | G08 `:61–69`: invalidation/CAS/unresolved locks; restored snapshots are stale/loading; duplicate/out-of-order/reorg acceptance remains necessary. |
| One unresolved intent per binding/account, across actions | G12 `spec-transaction-lifecycle-journal.md:41–46`: random storage record ID differs from protocol intent ID; durable CAS; exactly one prepared-to-unknown marker can precede a send-capable invocation. |
| Uncertainty remains reserved | G12 `:47–51,65–73`: a returned hash is not finality; wall time/null receipt cannot clear unknown sends; serialized terminal labels and cancellation are not trusted reconciliation; no generic clear-and-resend. |
| Exact terms/domain/account and two clocks | G16 `spec-signed-trade-terms.md:43–57`: native identities, fixed fill/zero basic fee, identical signed digest for both roles, strict funding deadline/window, immutable funded terms; chain time is not display time. |
| Actual custody still needs implementation and review | Escrow `spec-escrow-contract-interface.md:20–43,51–57`: native state, principal conservation, role/deadline/replay controls, ABI/compiler/runtime identity and property/review gates. Composition does not implement these. |

The manifest gives the full canonical spec paths. `docs/handoffs/LEAN_RELEASE_SCOPE.md` keeps the noncustodial, client-side EVM sequence and ReleaseEnabled=0; later features remain preserved. No second master plan is created here. The older feature report's suggestion to create a transition reducer must be read in light of the existing `reduceVerifiedChain`: **reuse that reducer/authority, do not build a second engine.**

## Present, partial and absent at this source

| Area | Observed implementation | Specific composition gap / evidence |
|---|---|---|
| G08 authority | **Present:** immutable view, pure internal reducer, latest-issued reads, bounded pending work, wrong-binding/generation rejection, reorg latch and wallet invalidation. | `packages/domain/src/authority.ts:33–67,71–136,139–169`. Reader injection explicitly does not implement/certify native adapters (`:13–15`). |
| Journal references in view | **Partial:** `TradeView.pendingIntentIds` is declared. | Initialized empty at authority `:50`; no journal-composition update path exists. This is an unwired field, not proof the journal itself fails. |
| G12 reservation/marker | **Present, deliberately partial:** encrypted vault lease/CAS, bounded scan, account/binding uniqueness, exact prepared-only marker and durable-outcome honesty. | `intent-journal.ts:80–108,110–183`. Public API has reserve/markSending/unresolved/dispose, no send, hash persistence, observe, trusted reconcile or clear. Canonical G12's later lifecycle APIs remain absent. |
| G12 unresolved lookup | **Present:** every matching serialized state remains reserved; malformed/unrelated future records block the profile. | `:110–132,175–183`. Do not filter imported `confirmed/finalized/failed/expired/replaced` labels to permit new funding. |
| G16 encodings/window | **Present:** bounded strict private/Solana encodings and funding-window check. | `trade-terms.ts:130–159,184–196`. Not native chain/wallet proof. |
| G16 EVM digest/EOA acceptance | **Present, test-only:** domain/terms snapshots, digest and role-selected EOA verification. | `packages/wallet/src/evm-terms.ts:80–122,136–163`; must remain out of app and core bundle. Two scoped public-data G06 reviews do not approve secret-bearing providers, EIP-1271 or live trading. |
| Clock binding | **Absent from current observation schema:** trusted chain timestamp. | `ChainObservation` at `schemas/src/core.ts:7–15` contains local `observedAt` only. Never substitute `observedAt/1000`, wall time or display freshness for a native chain timestamp. Fixture-only chain seconds may exercise G16; production time/anchor verification remains engineering work. |
| Terms→intent→native trade association | **Partial structural IDs; native join absent.** | `IntentV1` at `schemas/src/intent.ts:6–13` has no explicit terms hash/revision field; bounded `preparedRequest` is not ABI verification. Do not invent `tradeId = orderId = termsHash`, a new hash algorithm or a schema extension. Canonical adapter/ABI binding is a later prerequisite. |
| Cross-module coordinator | **Absent:** no caller joins authority, journal and terms. | Searches of production `packages/*/src`, package facades and `apps/web/src` find only the factory definitions and G16 facade export. Proposed `trade-composition.ts` and its tests do not exist. |
| App wiring | **Absent for trades:** offers/trade routes explicitly unavailable. | `apps/web/src/ui/Pages.tsx:70–76`; runtime/app-services/Worker source has no authority/journal wiring. The first slice must not turn a private fixture helper into an app API. |
| Public/bundle boundaries | **Present:** domain facade excludes authority/private journal; no core bare/Node imports; app uses public facades. | `packages/domain/index.ts:1–6`; boundary checker `:23–37,192–219`. Do not import wallet/Noble/SDK code into domain or export private storage to the app. |
| Release/network gates | **Present and retained:** ReleaseEnabled=0, no connect origins. | authority `:5,168`; security/content-policy `:105,130`; build `:28`. A diagnostic result never enables economic preparation. |

## Coherent synthetic fixture, without invented authority

Use the existing independent G16 vector **`native`** from `packages/wallet/test/fixtures/g16-evm-independent.json`. Its domain is chainId `31337`, verifying contract `0x2222222222222222222222222222222222222222`; terms use `networkId: local-evm`, `deploymentId: escrow-v1`, seller `0x3333333333333333333333333333333333333333`, buyer `0x4444444444444444444444444444444444444444`, native zero asset, principal `1000000000000000000`. Copied expected digest is `3b2b7929f40cd038620592aed507acd064ec8938ca6587924e805fc68b6c25e1`; **it was not recomputed in this task**. Existing digest tests are separate evidence.

The JSON descriptor copies this public vector verbatim and supplies an explicit synthetic `fixture-trade-01` association. This exercises matching fields; it is not a deployed trade ID derivation or approved registry entry. Existing authority tests use `eip155:11155111` and journal tests use `evm:1`, while G16 text IDs exclude colons (`evm-terms.ts:96`). Those individual fixtures cannot simply be pasted into one positive-case flow. Use one coherent fixture, and test mismatches separately without weakening any parser.

Fixture journal seeding uses the existing encrypted-vault service and in-memory Store, not a new plaintext writer. Test-only validator approval establishes only the explicit fixture encoding, never ABI, wallet or deployment truth. `reserve()` returns a **16-byte hex storage record ID**; `markSending()` takes a **32-byte base64url intent ID**. Diagnostics project the latter. No private key, acceptance signature, real fiat instruction or new cryptographic implementation belongs in this packet.

Display `nowMs=1000` and synthetic chain time `1699999999` seconds are independent. The vector acceptance deadline is `1700000000`; expiry is `1700086400`. The fixture timestamp can exercise G16 locally but must remain marked test-only. Missing native chain time means unknown diagnostics, never fabricated validity. A funded trade's recovery does not become expired because advertisement acceptance later expires.

## Smallest implementation handoff

Start with **one private diagnostic composition helper plus focused tests**, tentatively `packages/domain/src/trade-composition.ts` and `packages/domain/test/trade-composition.test.mjs`. Names/interface remain implementation choices within existing contracts. Reuse `TradeAuthority.readView/currentGeneration`, `IntentJournal.unresolved` and G16's existing check; no replacement reducer, persistent store, send surface or new public export.

The first thin outcome is a conservative read snapshot combining the existing authority view with opaque unresolved intent IDs for one exact binding/account. Failed/locked/conflicting journal reads must not be turned into “no unresolved intents.” Capture/recheck binding, authority/wallet generation and relevant input snapshots across awaits; use the current authority result rather than publishing an old chain view. A held old read must not overwrite a newer result. This is diagnostic composition, **not an atomic global chain/journal snapshot or spending authorization**.

Term-window diagnostics are fixture-only until an already-verified, anchor-bound native time source exists. Strictly snapshot supplied terms; do not infer that the fixture association proves the prepared request's terms/ABI. Missing association/time remains unknown. Keep EVM digest/EOA tests in wallet tests; do not import their provider into domain.

Read-only here means **no new or changed economic intent**, not “zero low-level storage calls.” Journal `unresolved()` intentionally calls `vault.commit(..., [])` for revision/preflight synchronization at `intent-journal.ts:105–108,182`. Spies must permit those empty-change calls and preserve their guard behavior. The composition helper must not call reserve, markSending, clear, sign, send, fetch or a wallet/provider. Fixture setup can explicitly seed reserves/markers before the helper runs.

Suggested first RED/GREEN batch when implementation is separately resumed: coherent loading/fresh join; wrong binding/account/ID isolation; held invalidation/lock; journal error remaining unknown; and privacy/no-economic-effects. Add the remaining existing-plan clock/reorg/concurrency cases incrementally. First establish an actual RED for the absent composed behavior, retain its command/exit/log, then implement the minimum. A missing module is currently a **static absence**, not an executed failure. Do not make missing imports/tests conditional successes.

Coordinator owns shared exports, schemas, app/bridge/runtime, trust metadata, handoffs and integration. One implementation owner may own the two proposed private files; any fixture adaptation should reuse public existing vector data and existing test Store, remain test-only, and avoid overlapping edits. No worker was started for this preparation slice.

## Proposed regression matrix — all UNEXECUTED

| ID | Deterministic schedule / input | Required invariant; existing anchor |
|---|---|---|
| C01 | Persist prepared intent; compose while loading, then after a fixture native read. | Project actual intent ID in both states; no restored/fiat data promotes chain or economic permission. Authority tests `:10–17`; journal `:25–29`. |
| C02 | Change each binding field/account; vary EVM case/action; distinguish record and intent IDs. | Exact trade/account isolation and one unresolved reservation across actions; no identifier conflation. Journal `:25–46,102–110`. |
| C03 | Hold journal read, invalidate wallet/generation or lock/dispose, then release; hold chain A while B finishes. | Old results cannot publish as current or replace B; retain fixed cancellation/locked/unknown behavior. Authority `:18–31,47–59,72–97`; journal `:74–91`. |
| C04 | Hold A's journal job and issue B; independently change revision before A's final preflight. | Preserve single-active CONFLICT, bounded slots and revision guards; no automatic retry/unbounded queue. Journal `:43–46,62–81,98–101`. |
| C05 | Commit reserve/marker then win lock/cancel; reopen; supply serialized terminal labels and aged clocks. | Durable reference/marker stays discoverable and reserved; no rollback, auto-expiry or send retry permission. Journal `:34–40,56–60,82–97`. |
| C06 | Funded→contradictory anchor/state→consistent read; separately released/refunded with unresolved journal. | Existing reorg latch retained; terminal chain state does not silently reconcile/clear the unrelated intent; fiat unchanged. Authority `:37–45,90–97`. |
| C07 | Missing time; acceptance exact/-1; window 1799/1800/604800/604801; display age29999/30000 and negative clock; funded after acceptance. | Strict G16 seconds; missing chain time unknown; display never spend authority; immutable funded recovery. TradeTerms test `:76–81`; authority `:32–35`. |
| C08 | Caller mutation during await; terms/domain/account/role/revision mismatch; unknown fields/accessors. | Detached exact data; no approved association/live signature implied by structure or fixture approval. Wallet tests `:34–81,96–143`; core parsers remain strict. |
| C09 | Future unrelated record, duplicate IDs, revoked session, typed conflict/quota/unavailable. | Sanitized fixed failure, never empty-success/no-pending or economic retry from an error. Journal `:48–60,92–101,119–137`. |
| C10 | Observe effects/projection/imports during all cases. | No reserve/marker mutations, sign/send/network or private record/signature leakage; allow required empty-change preflight; no new app/provider exports. Boundary checker `:192–219`. |

These ten families are an engineering checklist, not ten passed tests or a new completion percentage. Existing unit coverage should be reused; new assertions must cross module boundaries rather than duplicate isolated tests. No deadline, KDF cost, case count or threshold may be weakened. Stateful source-retained recovery/two-tab browser acceptance and actual native custody remain outside this first helper.

## Commands for future verification, not run here

Run from this repo using already available installed tools. Exact scripts are in the pinned `package.json`. No new install/download, unverified Foundry/Anvil execution or denied endpoint retry is part of this package.

```bash
# After creating the proposed focused test; capture its initial failing output first.
node --test packages/domain/test/trade-composition.test.mjs
node --test packages/domain/test/authority.test.mjs packages/domain/test/intent-journal.test.mjs packages/domain/test/trade-terms.test.mjs packages/wallet/test/evm-terms.test.mjs
npm test
npm run typecheck
npm run check:boundaries
npm run test:build-policy
npm run build
```

For the later appropriate acceptance stage, the documented remaining scripts are `npm run check:specs`, `npm run test:specs`, `npm run test:browser`, and `npm run test:web:browser`. They are also **unexecuted here**; run only when affected/required and available, retain exact failures. Missing browser/tool availability is a recorded limit, never acceptance. There is no invented `lint` or working escrow-contract test script. Prior source-bound test results remain in existing G06/session handoffs and are not transferred to this new documentation HEAD.

## Ready engineering versus actual gates

**Ready next:** implement/test the private G08/G12 diagnostic join with the first RED/GREEN cases above. Controlled fixtures require no new registry signing root, production endpoint, custody choice or retry-release policy. There is enough code to start; the whole project should not be classified owner-blocked.

**Engineering dependencies for subsequent native composition:** implement verified timestamp/anchor and terms→prepared-request→native-trade associations; trusted G12 observe/reconcile/hash lifecycle; actual escrow/wallet/offer/UI wiring; two-party EVM execution/recovery. Schema/adapter gaps are work, not owner decisions by themselves. Preserve uncertainty until they are implemented and exercised.

**True later gates:** G11/G15 trust-root/update/deployment decisions and verified identities; separately required provider/contract/wallet/device/independent review evidence; unavailable detailed private review packet where required; approved custody tooling; explicit authority for any live funds/deployment. Existing Foundry and Library input denials remain binding. Do not infer trust approval, EIP-1271 support, live financial consent or audit acceptance from a fixture or scoped AI G06 review. Keep the client-side/noncustodial architecture, wallet/identity test-only, no app-owned backend, `ReleaseEnabled=0`, origins empty and all preserved extras intact.

## Restart and preservation

This packet is documentation-only and **not a current source archive**. Existing private source backup is `libfile_bc6ed2cb4a7481919459a534ac05e4ba` v0, outer SHA-256 `beda5022b515aa571c06900e78b3e5203b92850a969523b80e90764d95b43b4d`; it contains older P2P source `02f75b452045afd35b71d977c347c331937568ee`, inner `p2p-offramp-source-02f75b452045.tar.gz`, SHA-256 `5f9be0017e87ca677987de6131a521d9a12ad8b550e2b82a8c0dc635f6f8931d`. The six relevant domain/schema files were previously byte-verified against the current lineage, but later metadata/tests/notices/docs must not be assumed present there. Consumer retrieval has not been verified working. Do not retry blocked inputs or describe a local file as durable transfer.

Before later implementation: verify worktree and actual ownership, exact source/file hashes, supported baseline availability and current permission scope. Preserve all unpublished edits. Do not assume the owner-selected GhostPay Claude package owns P2P; keep its reserved files untouched. No external Claude invocation or spending is authorized by this packet.

The canonical preparation queue `libfile_6351165742388191b28bd157407cf0a6` (last reported Library57/logicalV55) was neither downloaded nor replaced. This packet has its own incremental private delivery identity; receipt is recorded separately after successful production. Local documentation commit and its eventual delivery receipt remain distinguishable. No source push, merge, deployment, release or security/credential change occurred.
