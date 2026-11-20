# Hosted progress: generation 4, November 19 Pacific

## Observation and limits

Observed through authenticated GitHub check/run/job reads at 2026-11-20T01:16:13.483Z (November 19 in America/Vancouver). Main remains `5c5a84ef6300330700c8b0ca54d074ac113f08be`; this operation has merged zero PRs into main. Source integration is authorized after exact qualification; deployment and release remain disabled. These are dated receipts, not predictions about queued or running jobs.

## Exact-head check snapshot

| PR | Successful / observed contexts | Unfinished contexts | Failed contexts | Foundation browser job |
| --- | --- | --- | --- | --- |
| #191 | 9/10 | program | none | 135983838200 |
| #192 | 9/9 | none | none | 135983875037 |
| #193 | 9/9 | none | none | 135983935526 |
| #194 | 9/9 | none | none | 135987637963 |
| #195 | 9/9 | none | none | 135987696358 |
| #196 | 9/10 | program | none | 135987784678 |
| #197 | 9/10 | none | program:failure | 135987836712 |
| #198 | 9/9 | none | none | 135990858747 |
| #199 | 10/11 | program | none | 135990905888 |
| #201 | 0/10 | forge, schemas-and-crypto, specs, browser, docs-tooling, local-trade, local-evm, native-nostr-relay, program, inventory | none | 136005796688 |

Every #191–#199 foundation browser job passed. The package-only paths of #192/#193/#194/#195/#198 do not trigger the unchanged Solana workflow; their nine observed contexts all passed. No missing Solana result is invented for those paths. Other native Solana outcomes remain partial/failed as listed. #201 is queued, with no claimed browser execution.

## Additional actual browser receipts

| Job | Actual checkout | Actual tree | Ordered parents: base then source |
| --- | --- | --- | --- |
| 135987784678 | `864477c124a6f064270ffcdb08e5bf9391f22946` | `1fae0bcf2f2263b6164930a4a56ebd5803764185` | `2b23ee614ff2dd05bd3a6e79f1278658c30a3909` + `4bc4c7e2833b6b8540b8586624fb1697817e02e2` |
| 135987836712 | `3847e6f49337317a2c402e2f4eb94730959fcf12` | `97712823a475470b48564f48745b4ab5852db8c9` | `2b23ee614ff2dd05bd3a6e79f1278658c30a3909` + `86952b1ccc8eb9c25a3be05d6a32d3c556df8c84` |
| 135990906144 | `bf7b71cf2aa680dbd54829abe8bcb07e3a043065` | `b64bcc27a3e35cd7cafb26a020f43e49359f7c28` | `2b23ee614ff2dd05bd3a6e79f1278658c30a3909` + `e7e1aa90072f4b0376820f0e9b28e609707de74f` |

The actual merge trees differ from their optional source-head trees because those branches parent the earlier generation2 checkpoint. GitHub Git-commit responses verified each tree and both ordered parents. Source heads and declared package scopes remain in the state file.

- Meetup job135987784678 completed its maintained browser groups and emitted `meetup-native-origin-ledger` at00:45:15UTC. The receipt records three real documents, at most two concurrent, real IndexedDB/Web Locks/crypto,20 reservation races with one last-distance success,100 sticky requests, queued-lock cancellation and corruption/missing-ledger refusal. Clock/manual claims and consent ports are synthetic; no sensor permission, provider activation, default App integration or physical location authentication is claimed. External page requests:0.
- Privacy-controls job135987836712 emitted `local-privacy-controls-native-storage` at00:50:58UTC. Two real documents, IndexedDB and native crypto qualified independent decoy keys, source ciphertext preservation, authentication after reload, encrypted reminder storage and explicit freshness/CAS detection in another tab. No instantaneous broadcast, default App wiring, private-Worker isolation qualification, native submission or trading is claimed. External requests:0.
- Proof-jobs job135990906144 emitted `actual-native-public-resource-and-vault` at00:45:25UTC, Chrome158.0.8127.36. Fourteen actual native public resource Workers physically closed; the gate checked input caps, crash/heartbeat/deadline, cross-tab admission, cancellation/reentry, late replies, and actual vault backup/lock responsiveness. Inputs remain public. A constructor-owned test CDP exit promise is used; standard-browser physical deadline is not qualified. Browser WASM remains unsupported under unchanged CSP. No provider/proof/receipt authority or release approval is granted. Provider runtime network bytes and external requests:0. The separate native Node WASM probe reached268435456bytes and refused additional growth; that is not a browser WASM claim.

## Failed native Solana jobs and reviewed repair

#188 job135965138780 and #189 job135971622812 passed validator acceptance but failed the strict duplicate-signature observer at the intentionally withheld acknowledgment. Their final browser failures occurred00:47:57 and01:00:54UTC, respectively, after the retained real wait. These failures are preserved. #190 job135982126950 had passed validator acceptance and was in browser step16 at the01:12UTC read.

#197 job135987836079 passed validator acceptance and actual release/payout, then hit the duplicate-signature assertion at01:11:38UTC. It subsequently timed out45seconds on the disabled `Restore with a fresh key` button at01:12:23UTC. A separate isolated worker is investigating the restore symptom; neither its cause nor its correction is assumed from the acknowledgment repair.

#202 publishes reviewed acknowledgment correction `d753c0af23ff43743e34679e6b778b9ac0370da2`, exact tree `25d637fa5d6596e44cdae060ccc407f0c23186ee`. Independent source review closed with RED0/2 → GREEN2/2, affected334/334,54policy and four TypeScript projects passed. It preserves production code, strict send observer, native browser harness, financial assertions and both real1800-second waits. Early actual-Chromium diagnostic and full repaired-head native/browser outcomes remain pending. See the exact source-bound author and independent reports.

## Reproduction

Read `GET /repos/djshellshoxxx/p2p-offramp/commits/{head}/check-runs`, actual workflow job steps/logs, and `GET /repos/djshellshoxxx/p2p-offramp/git/commits/{mergeCheckout}`. Bind observed checkout/tree/parents before citing a pass. Current live heads must be resolved again before integration. Local Chromium launch is blocked by the managed Unix-socket policy; no bypass or local-browser success is claimed.
