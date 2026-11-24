## Live overlay — 2026-11-24 UTC

This overlay updates integration status without replacing the initial tracker below. Main: `8cff44909752f5e8b99eecec44ebaa44360c7b5d`. All newly listed PRs remain open except #251.

| Capability | Evidence and remaining gate |
| --- | --- |
| S06 cancellation recovery #251 | Merged; current main readback confirmed; no whole S06 completion claim. |
| S07 D9 approval restart #254 | All four variants passed within one hosted test, 2506 Node pass / 1 skip; native program and independent review pending; controlled fixture only. |
| S07 saved-review backup retention #257 | Draft; source checks source/destination reopen and ciphertext/backup preservation. Author reports 16 local passes; hosted checks pending. Not native destructive retention. |
| S06 local screen counts #258 | Draft ordinary app connection; author reports focused 26 passes; hosted browser and named Tier B review pending. |
| QR recovery accessibility #256 | Draft; author reports 127 focused passes; hosted browser and named Tier B review pending. Physical camera/device remains separate. |
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
