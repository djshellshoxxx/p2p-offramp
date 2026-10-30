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
