# Lane A handoff — 2026-11-18

Resume prompt for the next Lane A session. Lane B runs `LANE-B-PROMPT.md` in parallel; keep its file ownership.
Same authorization and invariants as the consolidation brief (static client, noncustodial, external-wallet authority,
purpose-separated identities, `ReleaseEnabled=0`, original exits; no deploys, releases, real funds, owner keys,
settings changes, force-pushes or branch/tag/run deletion). The owner gave full approval on 2026-11-18 to merge
reviewed Tier C patches, but each merge still needs green exact-head CI and an independent review with no open High or
Medium finding.

## Reconciled continuation checkpoint — November 18, 2026

Pinned source: `main@6c38e641e24abcfdcf645f864bd64c9645836d75`. The [current reconciliation](2026-11-18-documentation-reconciliation.md)
records #137/#141/#143/#149/#151 merged in addition to #135/#140/#150 below. Draft #166
owns downstream EVM signing/payment/recovery and localnet build work; #167 consolidates
native Solana lifecycle/recovery; #168 composes the localnet browser journey. Inspect
those exact heads before extracting the same features again. ERC-20 UI work and new
browser evidence remain unmerged until qualified. [Lane B progress](LANE-B-PROGRESS.md)
provides the matching track/PR dispositions.

Next, qualify and integrate the stack in order, finish remaining wallet/browser/native
acceptance, then continue QR UI and locale/accessibility/release-trust work against the
actual combined source. The original quarry recipes and owner-decision list below are
retained as a dated handoff; they are not a fresh instruction to duplicate active work.
The original ownership and release restrictions above remain preserved.

## Historical state at `97ce6a4`

- `main` at `97ce6a4` holds the consolidated trunk (#134), locale wiring (#135), D3 release trust and the D6 QR codec
  (#140) and D1 peer acceptance (#150). `npm test` 1,698/1,698, forge 92/92, all browser suites green at the last gate.
- Ledger: `LEDGER.md`. Decisions: `docs/adr/ACCEPTED-DECISIONS-2026-11-04.md`. Reviews: `2026-11-18-integration-review.md`.
- Historical quarry plan with per-capability recipes: `2026-11-18-phase3-quarry.md`.

## Historical quarry order (reconcile with the current checkpoint before reuse)

1. **Release-update controller** (Tier C): N40 `2a26041` `packages/security/src/release-update{,-http,-store}.ts`
   plus #28 `f5b12c6`; fix F07 (a failed IndexedDB open stays cached). Keep a local `HttpFetchPort` type.
2. **ERC-1271 fixtures + execution hardening** (Tier C): N40 fixture contract and `scripts/test-eip1271-local.mjs`;
   merge the `evm-execution.ts` hunks without losing D9 (a `markSending` failure stays `BROADCAST_UNKNOWN`).
3. **Personalization and runtime plumbing** (Tier B→C): #42 overlay; decide `deleteTermsReview` vs the retention flow
   with the owner (it breaks the T33 test as extracted).
4. **Private-trade journey + native retention** (Tier C): take the m0-s07 (#43) journey files, apply #35's
   F01/F03/F06 fixes, rewrite the 5 pre-D9 journey recovery tests to the D9 semantics (do not weaken them).
5. **EVM browser journey** (Phase 5): isolated localnet composition in the static app with two browser/wallet
   contexts, real local EVM and the relay fixtures; wire D1 (`docs/integration/D1-peer-acceptance.md`) including a
   wallet prompt for the `PeerAcceptance` statement; the seller UI calls `select` when it opens a request; redeliver
   `BUSY`/`DUPLICATE`. Count prompts and sends; prove no automatic resend or unexpected egress. Also EIP-1898 reads in
   `packages/chain-evm` belong to Lane B (B5).
6. **QR UI** (Phase 8): explicit import review over `packages/qr`, camera denial/cancel paths, no automatic
   navigation or signing; invite verifier only after the owner picks the key profile.
7. **Accessibility and locale qualification**: keyboard/focus, screen reader, RTL, 200%/400% zoom, narrow screens,
   recovery errors, wallet handoff; RTL machine values must not carry FSI/PDI into copied text (review D-L1); an
   `App`-level test of `<html lang/dir>`; negative cases for `scripts/test-peer-offer-browser.mjs` (D-L3).
8. **Portal and distribution** (m0-s08, Tier C-adjacent), then dispose the historical PRs (#26, #28, #35, #37–#48,
   #56/#81, #65 T36–T40, #27) with evidence once each delta has an outcome.

## Owner-decision list recorded at the historical checkpoint

D2 testnet key generation, pin and first signature (runbook: `docs/recovery/OWNER-TESTNET-RELEASE-RUNBOOK.md`); the QR
invite signing-key profile; D1 items listed in the decision index (acceptance withdrawal, latest vs finalized block
for funding rechecks, second-statement wallet prompt, mixed v1/v2, inbox/relay-auth); #65 T36–T40 scope; what to do
with the overlapping #157 and #159.
