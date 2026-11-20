# Generation 37 native browser funding companion

## Result and exact identities

The native browser driver now contains one explicit seller proposal funding journey before its existing recovery journeys. A separate fixed funding verifier requires the saved proposal and complete installed binding. **The original exit-only verifier and both vault readers remain byte-identical.** Local controlled verification and build-only compilation pass. No browser or validator was executed. **ReleaseEnabled=0.**

| Identity | Exact value |
| --- | --- |
| Component baseline | `b785a01ffc54a75d497641d0e758d077adff41d0` |
| Native companion source | `d8dbf9e82743fd670c7d3af80a024720cbfb0538` |
| Native companion tree | `190a0482812b9dd86b81b66a8d34f3b41fe9efa9` |
| Original application source | `107ce93d030298f2668285067e156979c883184d` |
| Original application tree | `c992a93385240cdbfcecae79e70c73d1b2295013` |
| Mapped application / combined source | `b695834c35e458ef36dd711ab82938d2eaf3f248` |
| Combined tree | `1549b5ba9077244e43720edbb1072eceeb6abb60` |

The native component changes four paths: [driver](../../scripts/test-solana-localnet-browser.mjs), [fixture](../../scripts/lib/solana-localnet-browser-fixture.mjs), [send-evidence helper](../../scripts/lib/solana-localnet-send-evidence.mjs) and [new focused tests](../../apps/web/test/solana-localnet-funding-send-evidence.test.mjs). The application commit was cherry-picked unchanged onto the preserved native component, as directed by the coordinator. Its complete binary patch matches the original; the original commit/branch remains preserved. This is mapped source provenance, not a claim that the original application SHA is an ancestor of the companion branch. The combined 1,043 non-documentation entries equal the complete disjoint union of both changes over the baseline.

## Fixed funding physical-send proof

The new `assertSolanaFundingSendMarked` accepts only funding. It requires canonical single-signature wire bytes, exactly one matching durable `sendMarked` journal record, current-profile marker ownership, installed genesis/program/ProgramData pins, seller role and absent expectation. It re-decodes retained proposal bytes with the maintained private-record decoder and requires exactly one full-binding match. Cached display data cannot replace the stored proposal.

It compares retained registry, artifact, ProgramData, asset, RPC and margin provenance with the independently installed configuration. The maintained binder constructs the native trade; the maintained recipe verifier checks all fixed terms and accounts against the exact message. Node/OpenSSL independently verifies the Ed25519 signature after maintained parsing. Only a successful complete proof adds the signature to the one-attempt set. A restored proposal's original profile may differ from the current funding marker's profile.

The existing exit-only `assertSolanaSendMarked` body is unchanged: **2,272 bytes**, SHA-256 `5d1c14b9d969498fec7cf3311eb1f2c3a5f825617cc78d9dc258244a52e78c5d`. The two existing reader bodies are unchanged: **2,365 bytes**, SHA-256 `cf7a287f772f9f43eb2922fc31bb30d93eefab2742487027746c75347a7af466`. The fixture selects the separate fixed funding verifier only from the exact matching funding marker; all exit sends retain the legacy verifier. There is no exported variable action allowlist.

## Hosted journey and explicit accounting

The new 59-line journey executes immediately after the original absent-recovery refusal and G36 proposal admission. It uses the existing absent proposal: acceptance at setup clock plus 600 seconds, installed submit margin 300 seconds, expiry plus 7,200 seconds. The chain fixture source, original amounts, deadlines, margins and waits remain unchanged.

Actual UI controls connect the seller and prepare funding. Review checks include installed pins, both deadlines, unknown fees/rent/total debit and unestablished peer acceptance. Preparation must retain one durable funding intent without creating a recovery document, signing prompt or send. Explicit confirmation must produce one funding send, a finalized intent, the actual funded escrow and one ordinary seller recovery record while retaining the original proposal bytes/provenance.

Independent Node reads decode the finalized escrow and check owner, native asset, principal, seller, buyer, terms hash, nonce and expiry. Actual rent exemption and transaction metadata establish seller debit as principal plus rent plus fee; buyer balance stays unchanged. The public recovery download equals the canonical original document. A repeated finalized refresh must perform no additional write or send. A normal bounded finality poll uses the existing 150,000 ms budget; no extra long chain-time wait is introduced.

The existing encrypted restore and real idle-lock/unlock retain the proposal and already finalized recovery. The earlier unfunded-card restore assertion becomes the corresponding funded-card assertion because this exact proposal has now been funded. Cancellation checks its original one release preparation separately from the retained finalized funding intent.

Exact totals are **one funding send plus seven original exit sends = eight sends**, and **one funding prompt plus the original eight prompts (including one revoked prompt) = nine prompts**. Separate exact assertions retain seven exit sends and eight exit prompts. Unique signatures, one withheld attempt, original per-trade balances, separate release/payout and the real refund deadline remain required. No additional exit is introduced.

The source-preservation checker removes only the additive funding block and reverses the explicit accounting/promotion/cancellation-scope edits. It reconstructs the complete original **19,410-byte** driver exactly, SHA-256 `18453ace44c314314c8eca6cb47b32fde02b1c2c63017ad39f502aa68c7ec7ac`. This verifies source preservation, not native execution.

## Controlled qualification

| Execution | Exact source attribution | Result |
| --- | --- | --- |
| Missing-verifier baseline | Uncommitted tree `b508b53cea771d60e5bcf0ad7aff2d4bc03121fb` above baseline | 2/10 pass; eight explicit missing-function failures |
| First implemented helper selection | Uncommitted tree `a304a0ef11112fea6f8efc89e0dee77d409cc788` | 17/17 pass |
| Complete companion selection | Uncommitted tree `190a0482812b9dd86b81b66a8d34f3b41fe9efa9`, identical to frozen companion | 19/19 pass |
| Preservation, syntax and full main whitespace | Same frozen-equivalent companion tree | Pass |
| Combined oracle selection | Clean committed `b695834c35e458ef36dd711ab82938d2eaf3f248` | 19/19 pass |
| Driver build-only compilation | Same clean combined source | 70 modules / 3 chunks / 429,784 raw bytes; zero warnings |
| Command and static selector/field compatibility | Same clean combined source | Exact command parsing, exit-only refusal, nine selectors and twelve review labels pass |

The complete companion selection contains nine new cases plus ten existing proposal, exit and withheld-send cases. New coverage includes actual maintained prepare/confirm marker bytes against scripted RPC, current/original profile separation, missing or duplicate proposals, malformed payload despite valid cached data, all retained configuration mismatches, changed canonical terms despite a valid signature, marker/binding/state/role/pin errors, canonical wire integrity and one-attempt accounting. Every negative test requires the new helper to exist before evaluating its refusal. Overlapping selections are not summed.

The combined selection ran **2026-11-20 21:10:23.439229–21:10:24.736980 UTC**. Its 5,058-byte full TAP log has SHA-256 `98640b63ed33ce5a943fdaa7bd2555e4ba17263a9b7f7e534c9e398b83a59a51`. The earlier missing-function failures remain intact and are not claimed to reach later behavioral assertions. There were no later source-test failures in this component.

Rolldown **1.2.15** generated the Node driver without evaluating it. Every input hash matches the combined Git source, including the changed application command parser. All three emitted chunks are retained with their exact original gzip bytes and dual hashes. Static selector presence does not establish actual DOM, Worker, IndexedDB or physical wallet behavior.

## Retention and limits

The [machine receipt](../execution/solana-browser-funding-native-generation37-20261120/receipt.json) retains source mappings, original full logs, binary before/after execution snapshots, complete source patches, capture/preservation/interface/compilation/packaging sources and generated chunks. All fourteen captured before/after snapshots reconstruct exactly; they represent four distinct execution trees. Every retained artifact includes raw/compressed byte lengths and SHA-256 hashes with gzip timestamps zero. Read-only path lookup misses are separately labeled recovered summaries, not original execution logs.

Dependencies were reused through immutable hardlinks. No full repository suite, ordinary application build, browser, validator, generated driver output, live financial operation, remote publication, default activation or release was executed by this companion worker. The coordinator owns combined full qualification. Actual current-source/current-target hosted acceptance and the funding candidate's authorization remain required.
