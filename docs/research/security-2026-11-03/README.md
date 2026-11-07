# Additional security research — 2026-11-03

This packet turns remaining P2P Offramp security questions into implementation and qualification work. It was prepared through **four parallel research workstreams**: three specialist agents plus the coordinating release/supply-chain review. Dates use America/Vancouver.

## Source and ownership

| Reference | Reviewed role |
| --- | --- |
| [`main` at `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`](https://github.com/djshellshoxxx/p2p-offramp/commit/e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa) | Published source baseline and intended base for these documentation additions. |
| [PR #26 at `94554ecf9854e4604f9f56afe5bebedeee931994`](https://github.com/djshellshoxxx/p2p-offramp/pull/26) | Main implementation candidate used for detailed source observations. Candidate-only paths are linked through immutable GitHub URLs in the reports. |
| [PR #27](https://github.com/djshellshoxxx/p2p-offramp/pull/27) | Separate execution-prompt work; no ownership transfer. |
| [PR #28](https://github.com/djshellshoxxx/p2p-offramp/pull/28) | Separate active browser/cancellation/recovery repair lane, observed at `9e01b127eae0b12bcc1ce4bbfbf66dce16a395da`; those fixes are not duplicated here. |
| [PR #29](https://github.com/djshellshoxxx/p2p-offramp/pull/29) | Proposed D1 peer-carrier, D7 optional-package and D8 merge-policy decisions, observed at `dafae9ccb7cc567075872df72c67ca259402b9d1` during final publication. These proposals are not accepted policies. |

Read the candidate's [whole-source audit](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/audit-2026-11-02/README.md), [current remainder](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.md), and [pending decisions](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/PENDING-DECISIONS.md) alongside this packet. Local implementation, protocol selection, deployed evidence and release approval remain distinct. Publication of these notes does not imply that PR #26 has merged.

## Reports

| Workstream | Report | Implementation focus |
| --- | --- | --- |
| Escrow and wallet authorization | [Escrow/wallet research](escrow-wallet.md) | Canonical escrow semantics, signed peer acceptance, account profiles, chain observations and recovery invariants. |
| Messaging, privacy and encrypted recovery | [Messaging/storage research](messaging-storage.md) | Nostr identity boundaries, replay and delivery semantics, key-compromise limits, vault/backup lifecycle and browser qualification. |
| Proof systems and optional capabilities | [Proof/optional-feature research](proofs-optional.md) | Evidence-to-claim binding, verifier/provider identity, parser semantics, resource limits and activation conditions. |
| Release trust and supply chain | [Release/supply-chain research](release-supply-chain.md) | Initial trust, rotation, recovery capsules, artifact provenance, seven dependency closures and delivered browser policy. |

Each report distinguishes implemented controls from open decisions, gives a confidence/scope assessment, identifies relevant files, and specifies evidence needed to close the remaining work. Priorities refer to release or adoption ordering; they do not assert newly confirmed exploitable vulnerabilities.

## Recommended implementation order

1. **Finish the core peer-consent and inbox profile.** Select one versioned carrier with wallet-authorized binding of both peer messaging identities, the wallet/account profile, trade revision, domain and exact terms, together with the recipient-inbox discovery and relay-authentication policy. Reuse the existing private agreement verifier and keep chat acknowledgment distinct from spending authority. Complete G14/G16 policy-hash semantics before admitting nonempty optional capabilities. Primary owners: protocol, messaging and wallet.
2. **Qualify the exact escrow/account/asset deployment profile and payout recovery.** Keep canonical and experimental escrow evidence separate. Show an outstanding payout credit separately from a terminal `released`/`refunded` escrow state, reusing existing withdrawal helpers. Bind native observations, signature validity and recovery behavior to the actual selected chain, code, accounts and asset behavior; select a chain-progress policy as well as observation freshness. Primary owners: contracts, wallet and journey UI; see EVM-R2 through EVM-R5.
3. **Select G15 bootstrap and G25 recovery distribution.** Separate a fresh client from an already trusted updater. Define original-deployment recovery artifacts, their independent authentication and retention. Existing asset-signature verification is retained; it does not become deployment approval by relabeling its output. Primary owners: release and recovery; see REL-01 and REL-02.
4. **Close the messaging/identity lifecycle decisions.** Establish the supported protocol profile, peer-key continuity, delivery/unknown-outcome semantics, and what backup/restore means for identity and replay state. Document the actual confidentiality and metadata limits. Primary owners: messaging and storage.
5. **Collect release evidence for the chosen target.** Bind clean builds, independent witnesses, dependency results, exact deployed response headers, routing behavior and supported devices to the same artifact. Current validation receipts remain historical evidence until their scope is confirmed against that release. Primary owners: build, deployment and QA; see REL-03 through REL-05.
6. **Admit optional proof/provider work only against a selected use case.** Require an authenticated evidence source, exact verifier/circuit/claim profile, deterministic semantic parsing and an explicit settlement policy. Apply the same selected-profile discipline to Solana, QR, stealth and reputation. Primary owners: proof/provider and relevant protocol owners. Existing unsupported states should remain explicit while the core journey is qualified.

This order refines the existing backlog. It does not create competing implementation owners or reopen controls already completed in the prior audit. Reconcile source and active PRs again before editing a named seam.

**Late coordination update:** PR #29 appeared while this research was being finalized. Continue its D1 carrier review using the identity-binding and account-policy criteria in the escrow and messaging reports; do not start a competing carrier proposal. Its D7 package disposition and D8 repository-policy proposals remain separate owner decisions. This packet supplies additional evidence and acceptance criteria without choosing those options or changing their status.

## Bounded dependency result

The release report includes a targeted check of four recent first-party Vite advisories against the candidate's locked `8.3.5`; that version is outside those four published affected ranges. It also maps the seven separate npm lock roots and explains which ones are shipped, tooling-only, evaluated or passive. That disposition is deliberately narrower than a full fresh registry audit. See [REL-04](release-supply-chain.md#rel-04--make-dependency-evidence-complete-scoped-and-fresh) for the exact advisories, lockfile and required evidence.

## Verification scope

The coordinating review checked **653 selected local repository blobs** against the Git blob identities in the pinned candidate tree; all matched. This verifies the source snapshot used for inspection. It is not a claim that 653 files received a new semantic security audit.

The packet uses static code inspection, existing audit/remainder reconciliation and primary standards, official documentation, upstream source and first-party advisories. All four reports received cross-review by a different research agent, with additional source checks by the coordinator. That review corrected citation formatting, clarified full proof-job buffer limits and removed an unavailable upstream quick-start reference. Report review is separate from the application's previous test results. No historical test count is presented as a newly executed test, and no production deployment, live settlement, provider activation or release qualification is established by these notes.

Follow-up research should be driven by a selected profile or a specific unresolved result. The highest-value remaining evidence includes the actual production peer carrier, authenticated release/deployment identities, physical wallet/browser behavior, selected provider claims and independent professional review of the exact enabled artifact. Generic additional reading cannot substitute for those inputs.
