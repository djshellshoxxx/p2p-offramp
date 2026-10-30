# G15→G11 scoped AI engineering review and reproduced corrections — 2026-10-27

Reviewer /root/g15_verifier_review reused in fresh bounded delta turns; read-only source inspection, no executable tests/builds/network/writes. Not an independent security audit, provider/owner approval or release signoff.

Scope: new identity-bound release proof/guarded G11 composition delta since9ea7b6cd030e7315e96ba76883c305a9c94ee539, new registry fixture/test. No broker-owned host/drain review or writes. Prior signature review was not repeated.

Finding P2, initially static: checkProof read its terminal failure latch only on entry. A trusted current/clock callback could reenter an existing reader, cause nested guard to latch CANCELLED/UNAVAILABLE, restore its own state and return; outer post-lookup/post-load guard could then return data/success after revocation. Integrator reproduced all6mode/projection cases (current/clock × network/deployment/post-load); Node reports7fail including parent, zero passes. These are actual new-code RED cases, not an established issue in older9ea source before the bridge existed.

Correction: recheck proof.failure after callback boundaries; preserve first terminal reason and skip callbacks once latched. Read-only reviewer confirmed the latch checks close the reported acceptance paths and found no residual stale acceptance. It noted inner clock-exception catch still called lifetime observers after nested revocation (failed closed). Integrator reproduced one extra-callback RED and guarded that invocation too; that one-line cleanup refinement was tested locally, not independently executed/re-audited.

Executable evidence on source463c9d998ae8b25b7f4c18c36b083a97a07e1c3c:60focused/509aggregate/15policy plus types/build/boundaries/native+emitted browser/spec gates;66G15assertions per document+Worker, including network/post-load nested revocation. Original missing-export,6caseRED and extra-callbackRED logs retained. Exact results in ../evidence/P2P_G15_REGISTRY_20261027.json.

No other scoped defect found in proof identity, signed digest/release-ID binding, retention structure or disabled flags. No whole-product/audit/provider readiness inferred. Existing public registry data are configuration facts, not authenticated live chain observations or spending authority; retained projections require fresh authorization at use. Caller trust/channel updates must invalidate the supplied context. No cross-tab/reload policy chosen.
