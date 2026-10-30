# Exchange test repair — 2026-10-30

## Source and ownership
Parent source and documentation: 0054543f81f48e928a46bd58c1dab14f91d0edeb (PR #14, work/p2p-exchange-close-20261030), based on integration 47f9bbee455e7affbc39539489227228eb346a0f.
This atomic commit identifies the repaired test source and initial documentation; resolve work/p2p-exchange-test-repair-20261030 after publication for its exact SHA. A subsequent checkpoint will record that SHA, review and CI.
Owner approved continued development and compatible consolidation. This session owns only the test-wrapper repair on its new branch, plus this uniquely named handoff/evidence directory. The original worker branch and exchange runtime remain untouched.
Runtime blob packages/exchange/src/exchange.ts: 2f936ca502357460aa48841e406739dabdf052bf. No relay changes are included. App wiring, schemas/runtime and terms-review reservations remain untouched; saved-review.ts facade export retained. G16 extraction not imported.

## Reproduction and change
Exact PR #14 CI job 124005071109, run 41038472578, fails all six new close-during-signer-lookup tests before reaching their intended schedule: the Proxy returns a replacement function for a frozen provider's nonconfigurable, nonwritable publicKey property.
Local real-provider reproduction: 8 pass, 6 fail, 0 skipped. Original failure output is preserved in docs/evidence/P2P_EXCHANGE_TEST_REPAIR_20261030/provider-red.tap.
The sole test-source change replaces that Proxy with a new object containing the real provider methods and a delayed publicKey wrapper. All six schedule assertions, release behavior and runtime methods remain unchanged.
No dependency, product runtime, release gate or test threshold changes.

## Exact-source validation
Environment: Node 24.22.1 native TypeScript stripping, @noble curves/hashes/ciphers 2.4.0 from the existing local dependency installation.
Source subset materialized through authorized GitHub file reads and verified against Git blob hashes. The final snapshot uses PR #14 exchange source and unchanged integration dependencies; PR #15 relay changes were removed before the qualification run.
Command:
node --test --test-reporter=tap packages/exchange/test/exchange.test.mjs packages/relay/test/*.test.mjs packages/nostr-crypto/test/*.test.mjs packages/transport/test/*.test.mjs
Result: 106 pass, 0 fail, 0 skipped, 0 cancelled. Raw exact-green.tap preserved.
Negative control: corrected tests with only exchange runtime reverted to integration 47f9bbe, filtered by close-during-signer-lookup names. All 6 fail on the intended behavior assertions (0 pass, 6 fail, 0 skip), proving the repaired harness detects the original lifecycle defect. Raw runtime-negative.tap preserved.
Two intermediate broader runs failed because this partial checkout lacked crypto-inventory.json, then package-lock.json; both exact PR #14 files were fetched before the final run. Original intermediate logs remain in this executor (exchange-provider-green.tap and exchange-provider-final-green.tap). These setup failures are not hidden product passes.
No full build, full Node suite, TS 7 qualification, browser, Foundry or deployment claim is made. Existing upstream skip/failure thresholds are unchanged.

## Remote checkpoint and unresolved gates
At branch creation, main c8547859f603f04d3df92e68925b99162594c39d; integration 47f9bbee455e7affbc39539489227228eb346a0f; testnet 7165626c17d8afb7ad7fce461ae7df9cbfcdba07; PR #14 0054543f81f48e928a46bd58c1dab14f91d0edeb; PR #15 e0961edc8cb64b466a2a3193aa37158bfc8c3487.
PR #14 exact-head Sonar fails security D (required A); upstream integration and testnet fail security/reliability E (required A). PR #15 exact-head Sonar passes, but its core jobs were queued at last check. Detailed Sonar findings remain unavailable: the connector rejected the annotations URL with HTTP 400 INVALID_ARGUMENT, URL is not an allowed public GitHub repository or search endpoint. No alternate route was used.
This repair will be a stacked draft PR against PR #14; no approval, merge or original-worker ref update.
The previous executor and named local preservation branches are absent here; commits beb9866ed39452b603554d364c98fe025372da3a and 9eed65dabb2437b87270dab3f676133a063b5bef remain unmodified wherever they exist.
ReleaseEnabled=0, connectOrigins=[], client-side/noncustodial boundary unchanged. No deployment, live funds, credentials, security settings, paid infrastructure or paid Claude work. This API exposes no configurable prompt-cache control or measured cache usage.

## Restart
1. Verify the published ref and changed-file list, record repair/source and documentation SHAs.
2. Read spec and standards reviews; fix any demonstrated findings. No GitHub approval submission.
3. Inspect exact-head CI; preserve failures/skips. Consolidate only with clear ownership and required exact-head CI, security and substantive review gates met.
4. Obtain permitted Sonar finding details through authorized access before attempting related fixes; do not infer issue details or suppress the gate.
5. Preserve current ownership and continue only accepted dependency-ready, nonoverlapping work. Restore authorized original checkout before incorporating G16 or asserting preserved local branch status.

## Subsequent verified milestone
Repair source and initial documentation commit: 08d83a5dd07054b0dfecdf1581eca17101fa35a8, published as draft PR #17 against PR #14. The remote ref and its five changed paths were read back; the test blob is 043d2fb455198a31b61517df3e57220edec3ae3f, and the runtime still hashes to 2f936ca502357460aa48841e406739dabdf052bf.
Two read-only agent reviews found no substantive problems in the wrapper: methods are enumerable and receiver-independent, real crypto and all six schedules/assertions are preserved. No GitHub approval was submitted.
At source 08d83a5, hosted schemas-and-crypto job 124014794027 passes: full Node suite 783 tests, 782 pass, 0 fail, 1 skip (cast calldata without Foundry), typecheck/build successful; build-policy 18/18 and fuzz harness 26/26. This does not erase the Node job's skip or claim a new 4096-case parser campaign. Incremental Sonar on PR #17 passes; its base is PR #14, so this does not qualify PR #14 production or remove the parent Sonar failures. Other hosted checks remain pending at this checkpoint.
PR #15 source e0961edc8cb64b466a2a3193aa37158bfc8c3487 has passing schemas-and-crypto job 124009189531: 788 tests, 787 pass, 0 fail, 1 Foundry-dependent skip; typecheck/build, 18 build-policy and 26 fuzz self-tests pass. One complete six-job workflow and Sonar passed; the second workflow still had schemas/browser/specs queued. Full-head merge acceptance is not claimed.

## New independent review and runtime reservation
While validating #17, review PR #16 appeared at documentation SHA 9f80c9b27b943b30409710dea76a53d97a761832. Its handoff reserves exchange runtime ownership to the #14 writer and reports replacement-session, stale-clock and replay-capacity defects. This session has NOT edited exchange runtime or implemented duplicate fixes.
Coordination comment posted on #14: https://github.com/djshellshoxxx/p2p-offramp/pull/14#issuecomment-6520587484. It identifies the test-only repair, preserves the other worker ref and restricts subsequent work here to independently named evidence.
Five additional bounded tests now reproduce those open defects using the actual Noble provider, registry, terms review and EVM terms hash, with async gates delegating to real publicKey and sha256. There are no crypto/review module substitutes:
1. Pending terms review after cancel/re-take with a different buyer address returns success and attaches original buyer terms to the replacement session.
2. The same stale review is accepted after same-address re-take, demonstrating a generation issue even when addresses match.
3. Take paused at signer lookup returns success and admits a session at exact ad expiry.
4. Accept paused at signer lookup returns success and sets accepted at the exact terms deadline while the advert is still live.
5. With maxSeenMessages=1, a successful take followed by cancel succeeds rather than refusing at capacity and mutates the session to cancelled.
These are OPEN defects, not fixes. The observed negotiation failures do not demonstrate funded-value movement. The five safe-behavior assertions all fail (0 pass, 5 fail, 0 skip, 0 cancelled, exit 1) at runtime 0054543 plus the test-only repair 08d83a5.

Run the RED evidence explicitly:
node --test --test-reporter=tap docs/evidence/P2P_EXCHANGE_TEST_REPAIR_20261030/open-findings.test.mjs
It is outside the existing npm test globs. No existing CI coverage or threshold was removed. Future runtime owners should promote repaired regressions into normal tests.
Artifacts: open-findings.test.mjs and open-findings-red.tap. Original harness setup errors are retained separately: open-findings-setup-failure.tap used an advert TTL above its allowed bound; open-findings-invalid-reason.tap used an unsupported cancel reason. Final evidence fixes the fixture to 1800-second TTL and the supported withdrawn reason; neither earlier run is used as the product-defect qualification.
The previously described partial-checkout failures are now committed as intermediate-missing-inventory.tap and intermediate-missing-lock.tap. Their 116 pass / 1 failure counts belonged to an earlier mixed local snapshot and are not final exact-source acceptance.
Source under test remains 08d83a5; this documentation/evidence commit's SHA is resolved from the remote branch after publication and recorded in the PR metadata. No runtime recheck is inferred from evidence-only documentation changes.

Next action: runtime owner resolves the three reviewed classes with regressions, preserving these RED artifacts; finish all exact-head CI and substantive review, and resolve Sonar through permitted access. Test repair does not authorize merging the unresolved runtime. Ownership of app wiring/schemas/runtime and the original executor remain additional blockers. Main/integration/testnet and every original worker branch remain preserved.

Both scoped reviewers found no substantive soundness or standards issues in the final real-provider evidence. The five first behavior assertions fail; assertions after those failures were not executed and are not separately claimed as passes or failures. This review is not an independent professional audit.
Artifact SHA-256:
- open-findings.test.mjs: 601ad33a7b9ec69e22dd461d976e758f5ddd873a645f52cf21afc698920215b1
- open-findings-red.tap: bb9d229c921a2c5302927c8c6fb2fa172f6978a95fa3fd0bd5dc82d65eef501d
