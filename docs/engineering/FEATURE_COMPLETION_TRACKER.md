## Live overlay — 2026-11-24 UTC, #262 original failure and correction

| Capability | Evidence | Remaining gate |
| --- | --- | --- |
| Pending exit consent on fresh-key restore #262 | Original hosted Node run 2506 pass / 1 fail / 1 skip: BUSY instead of REVIEW_EXPIRED on first direct confirmation. Corrected head 12123046232496ad38decefa861029f76960b68d waits for exact ready state; strict refusal and effect oracles retained. Exact source/proposal verified; test-only. | Corrected hosted Node/native checks and independent review; no production defect or completed feature claimed. |
| Other roadmap items | Main and branch counts unchanged; prior verified evidence retained. | Existing independent/named reviews, D2 trust, D8 recorded approvals, actual devices and optional-package gates. |

---

## Live overlay — 2026-11-24 UTC, pending exit consent and native recovery

Main `8cff44909752f5e8b99eecec44ebaa44360c7b5d`, 274 refs, 259 PRs (76 open, 125 merged, 58 closed unmerged), 152 ancestor-proven tips; 122 not ancestry-proven. Prior full census and historical comparison retained with exact delta.

| Capability | Evidence | Remaining gate |
| --- | --- | --- |
| Deleted review recovery #257/#261 | #261 exact corrected proposal 6924297a: nine persistent Chromium checkpoints previously passed; all 12 retrieved checks now successful, 62 validator checks, 13 sends, 1853 real refund-wait seconds, six native browser checks, zero fixture errors. | Independent review, draft/parent integration and current-main qualification; no physical-device/release claim. |
| Pending exit review on fresh-key restore #262 | One new controlled LocalnetController regression, head 1b391d25, test-only +54/-0; exact source readback; five workflows queued. | Executed current-target test and independent review, native app composition remains separate. |
| Other candidates and accepted roadmap | Previous overlay unchanged except updated census and #261/#262. | #237 named review, D2 public trust, D8 specific approvals, physical acceptance, optional-package gates remain. |

---

## Live overlay — 2026-11-24 UTC, exact-ref census and persistent recovery

Main `8cff44909752f5e8b99eecec44ebaa44360c7b5d`. Exact live census: 273 refs, 258 PRs (75 open, 125 merged, 58 closed unmerged); 152 current tips proven ancestors including main and #251 by transitive unchanged-tip ancestry or direct comparison. Remaining 121 not ancestry-proven in this increment, not necessarily unique. Prior patch-ID snapshot remains historical. No product merge in this increment.

| Capability | Current evidence | Remaining gate |
| --- | --- | --- |
| Deleted saved-review recovery #257 + #261 | #257 15/15 reported checks successful, draft. #261 corrected exact checkout `6924297a86f090f4919a7b6f8bec02ed6f05fdcb`: all nine real Chromium checkpoints passed, native Worker/encrypted IndexedDB, four retained-profile process restarts, clean-browser restoration, zero unexpected requests/errors. | Separate owner stack; #261 11/12 reported checks successful, Solana program running, fresh independent review, parent and current-main integration qualification. Not device/release acceptance. |
| Retained backup during origin outage #260 | Exact proposal previously passed actual Chromium storage fixture, now all 14 reported check contexts successful (including CodeQL). | Draft, independent review, integration. Not full app Worker or D2 signed-origin acceptance. |
| D9 approval restart #254 | 15/15 reported checks successful, prior native receipt retained. | Draft, independent review. |
| S08 lab output exclusion #259 | 14/14 reported checks successful including CodeQL. | Draft, independent review. |
| Screen counts #258 | 14/15 reported checks successful; WebKit cancelled, not a pass. | Named review, exact-current WebKit acceptance, draft disposition. |
| Startup guidance #252 and unsigned staging #253 | 15/15 and 14/14 reported checks respectively; actual proposal parents still old main `01f6f4fe`. | Current target qualification and applicable independent review; do not merge stale proposals. |
| Retention preview #237 | Actual new proposal includes current main, 12/12 historical head check contexts successful; do not transfer to new merge tree. | Required named review remains absent, actual checkout/current-tree evidence needed. |
| D2, D8, devices, optional packages | No new authorization or physical evidence. | Maintain distinct gates and ReleaseEnabled=0. |

---

## Live overlay — 2026-11-24 UTC

This overlay updates integration status without replacing the initial tracker below. Main: `8cff44909752f5e8b99eecec44ebaa44360c7b5d`. All newly listed PRs remain open except #251.

| Capability | Evidence and remaining gate |
| --- | --- |
| S06 cancellation recovery #251 | Merged; current main readback confirmed; no whole S06 completion claim. |
| S07 D9 approval restart #254 | All four cases passed within one hosted test on the current merge proposal. All 25 lifecycle tests also passed locally on that proposal. Fresh independent source review found no open defect in the matrix. Native program job and the draft disposition remain open. |
| S07 saved-review backup retention #257 | Draft at `75e0b043`. All 16 saved-review Worker tests passed. The test reopens both profiles after restore and checks the exact saved review, source ciphertext and copied backup. Hosted checks remain pending. |
| S06 local screen counts #258 | Draft at `26127d31`. 59 focused tests passed after repairing the Settings listener baseline. Hosted browser acceptance and named Tier B review remain pending. |
| QR recovery accessibility #256 | Draft at `d9428598`. 127 focused tests passed, and the full Node suite passed 2,508 with one Foundry-dependent skip. Hosted browser acceptance and named Tier B review remain pending. Actual camera/device acceptance has its own gate. |
| Unsigned staging #253 and preflight #255 | Old-target #253 staging evidence remains source-bound; #255 is separate diagnostic/workflow proposal, not signing or production release. Exact target and review required. |
| Startup #252 and sharing #243 | Prior hosted checks complete; current main or ordered parent qualification and named reviews still needed. |
| Native retention / financial stacks | Existing #237 preview is not destructive authority; #241–244 require ordered current-native qualification and recorded D8 financial owner approval. |
| D2 signed distribution / actual devices / optional nine packages | Public owner-authorized trust input, actual physical acceptance, and separately gated optional integrations remain outstanding. ReleaseEnabled=0. |

---

# Feature completion tracker — 2026-11-22 live checkpoint

**Evidence meanings:** `present-in-open-PR` is source/PR existence, **not** feature acceptance. `verified` requires executed tests at the exact current source and target. Repository `main` is still `01f6f4feca051d68de24a04299cd3bb444bce40c` at initial capture.

| Capability / PRs | Current evidence | Remaining conditions | Priority |
| --- | --- | --- | --- |
| Offline retention preview #237 | Source exists; exact head `33232f62dc9c`; 12 hosted checks succeeded | Tier B CodeRabbit/Qodo review, fresh main-target merge-tree and independent qualification | High |
| Generic app sharing #238 | UI integration in unmerged stack `1c658181fb2b` | Target-specific review, current CI, real-browser acceptance from #243, edge cases | High |
| Startup compatibility/recovery guidance #239 | Source in unmerged stack `708a3a2bc167` | Integrate after #238; current-head browser/Worker verification and review | High |
| Sharing/startup Chromium acceptance #243 | Draft `56ca31bad8fd`, 12/12 hosted check runs succeeded at exact head | Independent review, real target chain qualification, document remaining browser/device cases | High |
| Solana native funding preparation #240 → #241 | #241 retains #240 ancestry; native SOL/SPL prepared funding hosted acceptance documented on `29491c2842e` | D8 Tier C owner authorization, current-target check, review/merge | Critical |
| Solana saved-proposal seller workflow #242 | Source on `00efff307b10`, 11/12 check runs succeeded. Actual browser payout step failed. | Diagnose disabled eligibility; full native finalized-release/payout/recovery/refund runs, Tier C owner authorization, independent review | Critical |
| Payout progression investigation #244 | Diagnostic + guarded readiness test proposed in draft `2acdaa3714b2`; production code unchanged | Execute exact-head hosted native program, inspect failure or successful state, independent review | Critical |
| Optional sources #224–232 | Nine separate current-main unmerged package integrations; prior recovery PRs #191–199 retain source | One-package-at-a-time unique-code, current-target checks, isolation, review; no default/authority activation | Medium |
| Other historical branches | GitHub metadata only for 256 total refs as of capture | Per-branch git compare, patch-equivalence, semantic feature and test audits; ownership review | Pending |

## Mandatory financial test matrix

- Native SOL and SPL: exact terms/deployment identity, immutable review, wallet rejection, signature verification, one-send marker, finalized observation and no premature acknowledgement.
- Durable recovery after reload, fresh-key restore, lost/disconnected wallet, failed and unknown send, stale RPC or absent signature; no automatic resend.
- Seller release, separate payout, timeout refund and failed frozen-destination payout with safe retry; retain real deadline wait (do not simulate successful expiry by changing clocks).
- Cross-module tests for offline persistence, stale selection, privacy disclosures, reconnection, duplicate events, and malformed inputs.

## Exit contract

Mark a row `complete` only after the intended end-to-end authorized behavior has passed on the final integrated tree; record exact SHA, CI URL, independent review and successful merge readback. All currently open rows remain unmerged and incomplete **as integration work**, even if a portion of source behavior already exists. Keep intentionally deferred features in a separate exception register.
