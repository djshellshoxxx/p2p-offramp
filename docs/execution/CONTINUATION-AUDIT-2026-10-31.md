# Fresh whole-source engineering audit — 2026-10-31

This continuation audits owned source across the repository at merged `b700085`
plus the admitted fixes. It is an engineering review, not professional
cryptographic, physical-device or real-funds approval. Historical audits remain
evidence of their own revisions, not a substitute for this pass.

## Coordinated coverage

| Reviewer | Exclusive subsystem scope | Follow-up |
| --- | --- | --- |
| audit_storage | storage, identity, Nostr crypto, security, diagnostics, all 14 schema sources | native crypto/recovery/release/allowlist boundaries |
| audit_domain_transport | domain, transport, relay, exchange, messaging, extensions | independent T11 native journey review |
| audit_evm | wallet, isolated chain reader, both owned escrow profiles and supporting bindings | independent T10 review |
| audit_runtime_build | app runtime/Workers/controllers, build policy, operator tools and CI | independent T14 review; T15 finding assigned as a separate implementation |
| continue_sonar | hosted evidence triage and new UI/catalog review | independent T13 review |
| root | interfaces, inventory, integration, audit reconciliation and source delivery | different reviewer required for root-owned fixes |

Scopes cover owned implementation and build/operational boundaries. Test support,
vectors and CI are inspected as supporting evidence; this is not line-by-line
cryptanalysis of dependencies or vendored Solidity libraries. The
[207-entry coverage inventory](CONTINUATION-AUDIT-COVERAGE-2026-10-31.json) records
final hashes: 132 implementation entries, 7 build entries, 10 configuration entries
and 58 presentation/tooling/support entries. Support coverage is structural and
selected-test review, not a claim that every test assertion was audited.
No overlap authorizes a
second writer to change another owner's files.

## Findings and retained limits

T10's two chain-read defects and T14's separate CLI defect were reproduced before
fixing, including a real native-chain stale-finality case. Latest chain state may
veto guidance but never establishes finalized funding. Numbered state/header
snapshots must agree before any observation is published.

T15 is a reproduced build-provenance issue: inherited compiler settings can differ
from the recipe the deployment record claims. It is tracked explicitly rather
than dismissed as style. The fix passed a different reviewer's eight tests and
actual hostile-environment pinned-toolchain probe.

T16's wrong/orphan deployment receipt and unproved guard clearing were reproduced
by two reviewers. Final proof binds the requested CREATE, derived address, receipt
and canonical block, rechecks anchors and reads pinned code/allowlist. Root review
also caught reverted-status cleanup occurring before authentication; the final
code delays that error until native proof and empty derived-address code agree.
The independent reviewer passed all five proof tests, then rechecked the updated
legacy hygiene fixture; combined local tests and actual native kit pass.

T17's independent reviewer reproduced a mutable-input bug that inspected escrow A
but constructed a request to B. Synchronous detached/frozen inputs and one selected
context now keep inspection and construction bound to A. A FIFO input also blocked
before file validation; nonblocking open now refuses it promptly. Both original
shapes failed controlled probes and both fixes passed independent probes and five
focused tests. The copied executable's six native checks pass over registered
HTTPS with a temporary trusted fixture certificate, never a TLS bypass.

T13 review found loading/noscript/static safety copy outside the catalog. The
shared dev/build HTML transform now sources all four strings from the same draft
English catalog, replaces exact placeholders once and escapes text. Independent
baseline comparisons cover 291 static strings, 36 dynamic calls, 24 deadlines and
54 byte-identical review renders; 76 hostile-value refusals and final catalog/HTML
checks pass. All 328 entries remain draft source, not published locale approval.

T18's symlink invocation silently exited successfully without running acceptance
checks. Canonical path detection executes direct and symlink entries equally;
independent subprocess tests verify invalid/blocked codes and inert imports.

The audit investigated whether age/absence-based `dropped` classification could
permit duplicate transaction execution. Ordinary reprepare remains blocked;
explicit recovery requires a linked same-nonce successor and an unused native
nonce. No duplicate execution was reproduced. `Dropped` is a local eligibility
label for that explicit recovery, not evidence that the transaction is permanently
unbroadcastable. Reconciliation never resends automatically.

Native RPC agreement is not a light-client proof. Dishonest RPCs, nonsettling
trusted operations retaining bounded physical slots, immutable recipient
liveness, reviewed token/deployment qualification, secret-bearing provider
approval and professional review remain documented boundaries. No source review
or passing synthetic fixture closes those gates.

Final findings, reviewed source identity and actual tests are recorded with the
[continuation result](CONTINUATION-RESULT-2026-10-31.md) and final PR metadata.
No reproduced actionable finding remains unresolved in the covered frozen source.
The main Sonar aggregate failure remains an explicit limitation; zero published
GitHub annotations is not proof of a clean Sonar analysis. Scanner settings and
issue states remain unchanged. Fresh root/isolated npm advisory results are zero;
this is advisory evidence, not a supply-chain or cryptographic proof.
