# Generation 37 independent source review — explicit browser funding

## Verdict and exact scope

**Accepted after correction of G37-R1. No unresolved blocker remains in this source review.** The corrected composition passes the selected ownership, restoration, promotion and expiry probes. The separate native funding verifier preserves the existing exit-only verifier and requires the retained proposal, complete installed binding and signed transaction proof. This review does not claim a native browser execution, peer acceptance, production readiness or release authorization. **`ReleaseEnabled=0`.**

The final corrected source reviewed here is `28fa8516d2e1f26740a5370077f9b2fdbaa2c086`, tree `5ddaff2733cc27bea00311f42e7bac577e00ab60`. The review worktree contains the unchanged native and application source commits plus the author's narrow correction. Reviewer probes and evidence tooling are retained as documentation artifacts; this reviewer did not edit production code or add a maintained test to the source.

| Component | Original identity | Review composition |
| --- | --- | --- |
| Frozen G36 baseline | `b785a01ffc54a75d497641d0e758d077adff41d0`, tree `f6cad0ba726fc8a077a54cb5610f2032e3cd0242` | Unchanged ancestor |
| Native funding proof and driver | `d8dbf9e82743fd670c7d3af80a024720cbfb0538`, tree `190a0482812b9dd86b81b66a8d34f3b41fe9efa9` | Unchanged original commit |
| Initial application flow | `107ce93d030298f2668285067e156979c883184d`, tree `c992a93385240cdbfcecae79e70c73d1b2295013` | Exact patch mapped to `cbda12a11c24014e2a791d058460e642bad9f995` |
| Initial complete composition | Native author's `b695834c35e458ef36dd711ab82938d2eaf3f248` | Complete tree equals review `cbda12a`: `1549b5ba9077244e43720edbb1072eceeb6abb60` |
| Snapshot correction | `3ccf809e01e729980b3ab5fbe12ba3993fbe9982`, tree `d04ac2f61e50022e8f2c4439b1142d4ddeb15320` | Exact three-path patch mapped to `28fa8516d2e1f26740a5370077f9b2fdbaa2c086` |

All **1,043 non-documentation entries** in the corrected composition equal the verified initial union plus those three corrective paths. The correction changes the controller, its controlled-clock fixture and the maintained funding-controller regression. Every other non-documentation entry remains unchanged. Full whitespace checking against `8e836baa877b676a863c877003e277b638fc5061` passes without exclusions.

The [machine-readable review index](browser-funding-flow-independent-review-generation37.json) records exact commands, execution source identities, complete logs, source manifests, probe versions, scripts and both raw and compressed hashes. Final root qualification and evidence mapping are a separate composition review; initial-source results are not reassigned to the corrected source.

## Resolved finding G37-R1: session revocation during snapshot construction

**Severity: P2. Status: fixed and independently rechecked.** On the original composition, `snapshot()` admitted an open session with `#current()`, then proposal projection called `#ownsFunding()`. That predicate performed another currentness check. If the idle deadline crossed between those reads, the second check revoked and cleared the session while the outer snapshot still held `open=true`. The final profile projection then dereferenced the cleared session and threw a `TypeError`.

The independent deterministic probe connected the seller with an idle deadline of 300,000, then supplied monotonic reads of 299,999 followed by 300,000. It reproduced the real exception on `cbda12a`, whose controller is byte-identical to the initial application source. The complete original 1,115-byte log has SHA-256 `f1324de2c0e4dcedbb348547ae50b5eaa1458e070c93e648f69af1a56fbb765b`. The failing probe, companion probe, receipt and complete source-tree manifest remain preserved. The failure occurred before its initial-state assertion.

The author separated a pure `#fundingReferences()` comparison from action-side `#ownsFunding()`. Snapshot uses the pure comparison after its initial admission. It compares the same epoch, retained owner, native client, actual wallet, current profile/session, original proposal and original bound object. Every authority-bearing path continues to call `#current(owner.epoch)` before that reference comparison. The change does not remove expiry validation from preparation, confirmation, leases or private native ownership.

A snapshot sampled immediately before expiry may return one coherent ready view. The next snapshot that observes expiry must return the completely redacted locked view. The maintained regression and final independent probe verify that behavior, followed by a `LOCKED` funding command with no extra RPC, preparation, signature or send. The independent probe's assertion was clarified to permit either coherent boundary view; the preserved original exception and the author's maintained pre-fix failure still reproduce the actual defect.

The corrected exact source passed **38/38** selected cases: 27 maintained funding-controller cases and all 11 independent flow probes. The run lasted from 2026-11-20 21:26:16.856901 to 21:26:31.893677 UTC. Its complete 8,998-byte log has SHA-256 `6e46776c493bf46d55954f51d1109617b15b9a747c9b7b04c2b709849176535a`. The author independently retained a maintained pre-fix 0/1 failure, then 100/100 selected cases on the exact corrective tree, followed by four TypeScript projects and boundaries covering 244 production files / 157 core graph modules.

## Authority, restoration and storage review

The new commands are proposal-keyed `funding.wallet.connect` and `funding.prepare`, with explicit `rebuildOf` only on preparation. Exact-field parsing keeps the private 32-hex proposal identifier separate from a trade identifier. `RecoveryAction` and `review.prepare` remain limited to release, refund and payout. Shared confirmation carries a funding discriminant but confirms the original retained `PreparedSolanaFunding`, wallet and native client. It consumes the review before awaiting economic work.

Funding ownership retains the original proposal object, original bound object, actual wallet, native client, profile, session and epoch. Connecting another proposal replaces this ownership; an earlier proposal cannot borrow the new wallet reference. Existing lock, wallet-change, review-cancel and expiry paths revoke retained review authority. Document-client unblocking is explicit for the new commands, and blocked wallet state redacts proposal `walletConnected`. The existing one-shot physical bridge rules remain intact.

G33 projection remains display data. It supplies immutable terms, both deadlines, installed binding information, principal, native source, message and qualified height metadata. Fee, rent and total debit stay unknown. Proposal display has no `canFund` authority flag and makes no acceptance or outcome inference from saved data, preparation or signatures. The native composer and maintained guards decide whether preparation and confirmation are admissible.

Proposal import preserves the G36 one-CAS/no-RPC contract. Activation loads compatible journal display without new proposal RPC. Explicit observation uses reconciliation when the same live review owns the proposal, retaining its original private handle. Without that live owner, recovery cancels a same-profile pre-marker orphan while retaining foreign-origin uncertainty. The independent probes checked both cases. No observation automatically resends or rebuilds funding; replacement remains tied to an explicit definitive drop.

Promotion follows a trusted finalized native escrow observation. It first preserves a known recovery record with the same full binding, including a buyer role and original provenance. Otherwise it creates the ordinary recovery document from the original bound trade, derives the deterministic private record ID and checks that exact ID before a CAS. The revision is captured before occupancy is read. Unknown occupied trade and journal records both refuse promotion; a concurrent revision advance after an empty read causes conflict rather than overwrite. Independent probes exercised both occupied kinds, the revision race and a held promotion CAS followed by profile lock.

Persistence conflicts remain outside the ordinary observation-error catch and reach dispatch revocation. Promotion preserves the saved proposal and its origin while a newly prepared intent records the current profile. The restored-proposal probe checked this distinction, canonical recovery export and idempotent refresh. An existing pending funding intent remains visible after actual escrow recovery and continues to gate exits; actual state does not silently erase the journal's uncertainty.

## Independent native proof review

Funding has a separate fixed `assertSolanaFundingSendMarked` verifier. The existing `assertSolanaSendMarked` exit-only verifier is byte-identical to G36: 2,272 bytes, SHA-256 `5d1c14b9d969498fec7cf3311eb1f2c3a5f825617cc78d9dc258244a52e78c5d`. Both retained-record reader bodies are also unchanged; their combined 2,365-byte source has SHA-256 `cf7a287f772f9f43eb2922fc31bb30d93eefab2742487027746c75347a7af466`.

The funding verifier re-decodes the saved private proposal record instead of trusting a caller's cached decoded value. It requires a unique durable funding marker, current-profile intent provenance, the full installed registry/configuration binding, native seller funding from absence, the exact maintained bound transaction recipe, canonical signed bytes and an independent OpenSSL Ed25519 verification. It records the physical signature as seen only after all checks succeed. There is no arbitrary action allowlist added to the exit oracle.

Two independent oracle probes covered a corrupted signature consistently substituted in both wire and marker, and a canonical proposal with physically identical terms under different registry IDs. Both refuse without consuming the signature; the valid proof then succeeds. The maintained intent parser already verifies signatures, so the corrupted-signature refusal occurs before the later OpenSSL check. The positive accepted proof executes OpenSSL as a second implementation. This review does not attribute the negative result to OpenSSL.

Source comparison preserved the original exit helpers, reader logic, per-trade checks, refund/payout balance block and waits. The driver adds its one funding send early enough for the existing acceptance deadline and submission margin, with no deadline, timeout or margin changes. Its expected totals are one fund plus seven original exit sends and one fund prompt plus eight original prompts. That is a reviewed driver contract, not a claim that this reviewer executed the journey.

## Complete execution record and corrections

| Captured execution | Actual result | Interpretation |
| --- | --- | --- |
| 01 native oracle selection | 18/19 | One reviewer assertion incorrectly expected an OpenSSL-specific error after the maintained parser had already rejected the signature |
| 02 corrected oracle probes | 2/2 | Correct refusal assertion; original failure and original probe version retained |
| 03 native source preservation | Pass | Strict exit oracle, readers, waits and unchanged authority sources verified |
| 04 application selection | 119/120 | One restored-promotion fixture assigned finality to the blockhash's own slot |
| 05 promotion diagnostic | 0/1 | Preserved diagnostic identifying the maintained `status.slot > blockhashSlot` guard |
| 06 corrected restored-promotion probe | 1/1 | Explicitly checks impossible same-slot refusal, then advances the synthetic cluster and verifies promotion |
| 07 upstream evidence verification | Failed | Reviewer verifier omitted the author's already-preserved 37/41 intermediate fixture failure |
| 08 upstream evidence verification | Failed | Reviewer verifier stripped `.gz` from a compiled artifact whose original name already included it |
| 09 corrected upstream evidence verification | Pass | All original author/native artifacts, execution trees and build-only provenance verified |
| 10 independent expiry probe | 0/1 | Actual production finding G37-R1, retained without alteration |
| 11 corrected ownership and flow probes | 38/38 | Exact corrected source, including all 11 independent flow probes |
| 12 correction source preservation | Pass | Exact three-path correction and all remaining source/compile input equivalence verified |
| 13 correction evidence verification | Pass | All corrective artifacts, four author trees and original independent failure verified |

The original selections establish 19 distinct oracle cases and 120 distinct application cases across their documented runs; neither is described as a single wholly passing invocation. These selections overlap the final 38 cases and upstream author selections and are not added into an inflated total. Reviewer fixture corrections did not change the maintained guards, native source, time margins or acceptance assertions. The two failed evidence-verifier versions are retained separately beside the corrected verifier.

## Upstream evidence and limits

The original application evidence at `cc144c69b7ee190880aff7f51a86d74fde863522` contributes 33 gzip artifacts and nine execution snapshots. The native evidence at `3be8f3e439ab8101bfd0545774dfb4461a924cdd` contributes 42 artifacts and 14 before/after snapshots. The corrective evidence at `12f7d98ba7f133da77d18c62df790c957df93b1c` contributes 23 artifacts and four new author snapshots. **All 98 artifacts** have verified decoded/compressed lengths, SHA-256 hashes and zero gzip timestamps. **All 27 upstream execution snapshots** reconstruct from their recorded HEAD and binary patch. Earlier failures remain present, and corrective documentation preserves the initial application evidence unchanged.

The native build-only evidence has 70 tracked inputs, three output chunks totaling 429,784 decoded bytes and zero compiler warnings. All 70 input hashes match both the initial combined source and the corrected composition, including the actual command parser imported by the driver. All output hashes match the retained artifacts. Generated code was not executed. The narrow snapshot correction changes none of these inputs, so no unrelated native test or build was rerun by this reviewer.

All independent runtime checks used controlled synthetic wallet/RPC/store fixtures with the actual controller, native client and encrypted vault. No full-repository suite, build, browser, native validator, financial transaction, dependency installation, remote operation or release was performed by this reviewer. Root owns the fresh corrected full qualification and its final source mapping; it is reviewed in a separate supplement. Hosted actual-source/actual-target acceptance and matching owner authorization remain separate requirements. **`ReleaseEnabled=0`.**
