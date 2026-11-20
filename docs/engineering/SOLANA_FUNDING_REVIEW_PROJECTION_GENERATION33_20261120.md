# Generation 33 — native funding review display data

## Result and exact source

The internal `projectNativeFundingReview(trade, prepared)` helper produces detached,
immutable native-SOL review data. It validates the relationships that the existing
trade binding and exact message machinery can prove. It grants no confirmation
authority and has no application, facade, browser command or UI consumer.

| Checkpoint | Identity |
| --- | --- |
| Combined G32 parent | `5f9fd0a0f2f6d5bf16bcc21fb38a5e2ae0559031` |
| Parent tree | `d3b738a378218927d86241a1db987a57af87eec8` |
| Initial feature commit | `b8792ac4088f75603be8e0b40ba1506f2fb137f2` |
| Format-corrected source | `31ae6627a6b14a4ef40f7d81c98b04470a30aa1a` |
| Final source after purity-test strengthening | `448cdcc2a9d13109421f21eaa1107936da0ac5c8` |
| Final source tree | `93412d5a9c5badae03ab3a239fc5b44d7042a21d` |

Exactly four source paths change: the new package-internal helper, its new test
file, one addition to the existing source-file boundary inventory, and a README
section. The format correction wraps one test declaration without changing an
assertion. The final source additionally strengthens the purity fixture: its
forbidden-operation shim counts attempts, and an assertion requires zero attempts
after both successful projection and refusal. This prevents normalized errors from
hiding an attempted operation on a refusal path. All production and every other
tracked entry remain exact to the format-corrected source. The resulting **1,032
non-documentation entries** contain two modified parent entries and two additions.
Every other parent entry remains exact. Existing client composition, preparation,
confirmation, cancellation, journal, native acceptance driver, recovery protocol,
controller, configuration and workflows remain unchanged.

## Behavior and provenance

The helper requires a locally branded `BoundSolanaTrade` before observing any
trade or prepared-view fields. Existing descriptor-based `exactData` captures
the complete prepared-view, binding and funding-shape records without evaluating
own accessor fields. The view must name seller funding, the absent-escrow review
precondition, this trade's binding and program, its escrow and its seller fee
payer. Native SOL has an explicit seller source and nine-decimal principal;
SPL views are refused by this bounded helper.

The maintained canonical base64 decoder, legacy-message parser and
`verifyPlanMessage` verify the exact one-instruction native funding message.
The message's blockhash must match the supplied review. No second funding
encoder or instruction policy is introduced. Invalid inputs produce one fixed
`INVALID_INPUT` failure; error creation requires no random operation ID.

The frozen semantic output includes network/genesis, deployment/program identity,
ProgramData address and program/artifact pins, all fixed terms, principal and
asset, both deadlines, escrow, seller source, fee payer, exact message and blockhash,
and supplied last-valid height. Principal is separate from unknown fee, escrow
rent and total-debit estimates. No fee or time estimate is invented.

**The output proves data consistency only.** It explicitly records
`confirmationAuthority: false`, leaves counterparty acceptance and funding outcome
unestablished, and describes the action as funding fixed escrow terms.

- ProgramData/artifact pins are labeled `supplied-bound-trade`. The prepared view
  does not contain the original preparation's pin snapshot. A different locally
  bound trade with the same terms/binding/program and different registry pins can
  therefore produce different displayed pin metadata; the helper cannot prove
  which snapshot created the original client capability or the current chain.
- Last-valid height is labeled `supplied-metadata`. It is canonical-format checked
  but is not encoded in the message. This helper cannot establish its RPC origin,
  relationship to a live blockhash or current expiry.
- Consistent copied fields, including consistently rebound message/blockhash data,
  may display. A cancelled handle can remain display data. Neither case supplies
  the client's private WeakMap authority, freshness, session or profile ownership.
- The original handle remains private to its owning client/Worker. Only the
  unchanged native confirmation path can authenticate and revalidate that handle.
  The output and its serialization cannot be confirmed or cancelled as handles.

The helper makes no RPC, wallet, storage, clock or random call and never changes
an intent. It copies only semantic scalars into fresh frozen records. Its
descriptor checks do not promise that arbitrary caller-created Proxy traps are
inert. It does not mint a review ID, wallet grant or deadline.

## Accepted scope and application boundary

[Accepted D5](../adr/ACCEPTED-DECISIONS-2026-11-04.md) treats the seller's funding
transaction as the seller's acceptance and requires finalized evidence before
claiming funded status. The D1 peer-acceptance scope remains separate. This helper
makes neither bilateral acceptance nor funded-state claims.

The [funded recovery browser contract](../consolidation/SOLANA_BROWSER_RECOVERY.md)
still requires an already funded native escrow. Its import/restore provenance,
exit-only commands, wallet bridge and physical prompt ownership are untouched.
Actual unfunded browser admission needs a separately explicit contract. This is
a financial review prerequisite under Tier C, not approval to connect or merge a
new economic browser flow. It introduces no native SPL browser support, trust
root, endpoint, production margins, release activation or deployment.

## Verification and retained failures

The [machine-readable receipt](../execution/solana-funding-review-generation33-20261120/receipt.json)
binds exact command, source, dirty-source patch, times and full output for seven
recorded executions. Every recorded execution snapshot was reconstructed from
its Git source plus exact patch, and all recorded source-file hashes matched.
Raw and compressed hashes accompany deterministic gzip artifacts with `mtime=0`.

| Check | Actual result |
| --- | --- |
| Missing-feature baseline | 48 cases: **1 maintained G32 fixture control passed, 47 explicit missing-projection assertions failed**; no module-load failure |
| First wired projection plus package boundaries | **52/53 passed**; only the package's existing 120-character line limit failed |
| Format-corrected source: focused, adjacent funding and package boundaries | **103/103 passed**, zero other outcomes |
| Final source: all projection cases plus package boundaries | **53/53 passed**, zero other outcomes |
| Package TypeScript project on format-corrected source | Passed using the existing installed compiler; all production remains exact on final source |
| Import boundaries on format-corrected source | Passed: **243 production files / 155 core modules**; final delta is test-only |
| Full main-baseline source whitespace | Passed without exclusions; final source/evidence whitespace is checked separately |

The 103-case selection includes the 48 projection/control cases, 50 maintained
prepared-funding cases and five package boundary cases. The final 53-case selection
reruns all 48 projection/control cases and the five package boundaries after the
test-only strengthening. The earlier TypeScript/import-boundary results retain
their actual source attribution; they were not rerun for a JavaScript test change.
All production and other tracked files were compared exactly. These selections overlap;
they are not independent counts to add to later full-suite results. The actual
projection cases all passed in the first wired run. The initial full log and
source patch retain the line-limit failure rather than relabeling it as a
behavior failure. The boundary inventory gained the one new filename; no import,
operation or line-length assertion was relaxed.

A subsequent formatting pre-check still found one 121-character test declaration.
Its shell continued to commit the feature and print its stat, so the compound
command's exit code was zero despite the Python assertion. That exact tool-result
text is retained as **recovered output, not an original file capture**. The next
commit wraps only that declaration. The successful 103-case selection and initial
whitespace result bind the format-corrected source. The final 53-case selection
binds the later test-only strengthening, as shown above.

Tests use the actual G32 client, prepared views and maintained scripted ports.
They cover exact projection, mismatched fields and rebound terms, descriptor
refusal, recursive immutability, unchanged journal/provider state, blocked ambient
clock/random/network operations, copied display rejection by confirm/cancel,
successful confirmation through the original handle, cancelled-handle display,
and the explicit copied-height/alternate-pin provenance limits.

The author ran no full repository suite, artifact build, browser, validator or
native financial acceptance. Dependencies are existing immutable physical
hardlinks; no package installation or dependency mutation occurred. Independent
review, combined-source qualification, applicable hosted gates and the accepted
Tier C owner-approval requirement remain subsequent coordinator work.

The separate [source-and-evidence whitespace receipt](../execution/solana-funding-review-generation33-20261120/08-source-and-evidence-whitespace.json) binds the staged evidence snapshot before its own registration. The final documentation commit is also checked in full against the same main baseline.
