# Integration review record — PR #134 (2026-11-18)

Independent AI review of the complete `main@6ef9a26..head` diff of PR #134, split into five areas. No reviewer wrote
the code it reviewed. Each read the exact revision, and several ran probe tests in scratch directories. This is not a
professional audit. Reviewed revisions: areas A, C, D and E at snapshot `2bc0f62` (tree of `9f9520c` minus later
fixes in other areas); area B (exchange/relay) at `e326e1d`/`9f9520c` after its fixes. Files a later fix commit
changed are listed with the commit that changed them.

| Area | Scope | Model | Result |
| --- | --- | --- | --- |
| A | storage, wallet, identity, security, domain, schemas, messaging, nostr-crypto, recovery scripts | Opus | 1 Medium (fixed `310fcc6`, re-reviewed: no new High/Medium), 2 Low (1 fixed), 4 Nit |
| B | exchange, relay, transport, messaging, nostr-crypto, peer browser tests | Opus | EX2/EX3 + 2 Medium in the first fix draft (fixed `e326e1d`); re-review of the fix and the full area: no High/Medium; Lows fixed `1b28054` |
| C | contracts/evm, contracts/solana, chain-evm, chain-solana, escrow-evm, Sepolia scripts, local EVM tests | Opus | no High/Medium; 3 Low, 4 Nit |
| D | apps/web, artifact verifier, import-boundary checker, browser tests | Sonnet | 2 Medium (fixed), 4 Low, 2 Nit |
| E | workflows, package manifests and lockfile, agent/consolidation/research/test scripts, licenses, SECURITY.md | Sonnet | 1 Medium (fixed), 6 Low, 4 Nit |

## Findings and dispositions

| ID | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| B-EX3 | Medium | REDTEAM-P2-EX3: throwaway takes evict an honest idle session | Fixed `e326e1d`; regression fails on pre-fix code |
| B-EX2 | Low–Med | REDTEAM-P2-EX2: ghost replay ids block all openings | Fixed `e326e1d`; regression fails on pre-fix code |
| B-M1 | Medium | First draft: long-lived takes and cancel/re-take cycling hold an advert for its whole lifetime | Fixed `e326e1d` (ttl+skew and advert expiry caps; no self-refresh) |
| B-M2 | Medium | First draft: cancelled tombstones bypass the intake cap and eat the buyer-side reserve | Fixed `e326e1d` (tombstones are intake) |
| B-L1..L3 | Low | Global replay backstop below structural size; asymmetric hold; intake outliving advert | L1 documented (unreachable at defaults; attacker ids ≤ 2 × intake); L2, L3 fixed by the caps |
| B-R1..R4 | Low/Nit | Re-review: hold is two windows per key (take + late cancel); cap depended on local TTL; header off by one; stale comment | Fixed `1b28054` with tests |
| B-R5 | Low | Unselected honest session displaced at +901 while flood takes live to +1020; silent refusal of a quick re-take | Documented residual; the app must call `select` when the seller opens a request and show "no reply" |
| A-M1 | Medium | After backup restore a cancelled approval whose nonce a different finalized tx consumed stayed `reorged` and vetoed release/refund | Fixed `310fcc6` (native finalized-nonce proof settles it `failed`); regressions fail on pre-fix code; re-reviewed |
| A-L2 | Low | A refused send marker (journal busy) wedged the intent in this instance | Fixed `310fcc6` (returned for explicit retry; no automatic resend) |
| A-L3 | Low | Candidate peer replay ledger (64 terms, no eviction) can fill permanently | Open: D1 completion (not wired) |
| A-N4..N7 | Nit | Same-profile storage rollback keeps never-sent authority for approvals; BROADCAST_UNKNOWN code for a non-local record; block lease delays exits after a crash; CANONICAL-EVM journal-version text | N7 fixed `310fcc6`; others recorded |
| D-M1 | Medium | Locale visibility counted placeholder syntax (`{n|one=​|other=​}`, `{x}`, `.`) | Fixed `b3781ca` |
| D-M2 | Medium | Import-boundary graph walk skipped `./x.js` → `x.ts` | Fixed `c3bc5c6`; regression fails on old checker |
| E-M1 | Medium | Agent workflow's known-secret check runs where the agent can tamper with it; publish job lacks the secret | Fixed `e037e8e` (clean `verify` job) |
| E-L3 | Low | Agent checker did not protect package.json, .npmrc, .gitattributes, .gitmodules, .husky, Cargo.lock | Fixed `aba5a6a` |
| E-L5 | Low | Consolidation scripts ran live on a mistyped flag | Fixed `2ee1f77` (dry run unless `--apply`) |
| CQ-1 | High (CodeQL) | `js/incomplete-multi-character-sanitization` in a render-test helper (markup only read, never rendered) | Fixed `4ac65f0` (no regex tag stripping) |
| C-L1 | Low | chain-evm reads pin block number, not block hash (EIP-1898) | Open: Phase 5 chain-read hardening |
| C-L2 | Low | Solana client must send release alone, wait for finalized, then payout (ATA/rent) | Open: Phase 7 client rule |
| C-L3 | Low | Reader returns CONFLICT for a frozen vault although state-only release succeeds | Open: Phase 7 reader policy |
| D-L1 | Low | RTL formatting wraps machine values in FSI/PDI inside the string | Open: copy paths must use raw values |
| D-L3 | Low | Peer-offer browser test has no negative (tampered/bad sig/expired) cases | Open |
| D-L4 | Low | verify-web-artifact takes its scan mode from the reference file | Open |
| E-L2 | Low | Codex CLI installed by version without a lockfile | Open (paid-agent workflow; owner) |
| E-L4, L6, L7, L10 | Low | Write token scope in publish; phase1 lacks open-PR check; phase0 time glob; Solana cache scope | Open, recorded |
| Nits | Nit | C-N1..N4, D-N1..N2, E-N8..N11 | Recorded in the reviewers' reports |

## Verdict

At the final head no reviewer reports an open High or Medium finding. Every Medium found during this review was fixed,
covered by a regression test that fails on the pre-fix code where a reproduction exists, and re-checked by the reviewer
who found it. The open Low findings above are recorded for later tracks; none touches custody or the funded exits.
