# Coordinator notes (session sweet-noether)

Quick restart notes. Updated at every milestone. Newest entry first. Read this, then `git ls-remote origin`.

## 2026-10-30 — terms exchange merged

- Merged `wave5/terms-exchange` (b2af7a5, c5d4999, e17fe4a): new `packages/exchange` (NIP-17 take/offer/accept/reject/cancel
  state machine, real-crypto relay adapter), `packages/nostr-crypto/index.ts` facade + sync verify. npm test 485/485.
- Lean-scope core now covered at package level: terms → encrypted exchange → escrow fund/release/refund → G12 reconcile.
  Remaining: app wiring (other session's UI area), SonarCloud findings (blocked), @noble/ciphers swap (blocked).

## 2026-10-30 — SonarCloud gate red on PR #10

- SonarCloud (new app check) failed: D Security + D Reliability on new code @ e652f6d. sonarcloud.io blocked by proxy;
  check run has summary only. Commented on PR asking owner for issue list / network allow. Suspect: hardcoded anvil dev
  keys in scripts/test-evm-*.mjs (fix: anvil --config-out). Do not push speculative fixes.
- Terms-exchange worker (`wave5/terms-exchange`) hit rate limit; resumed 10-30.
- Still pending owner: @noble/ciphers install permission.

## 2026-10-27 — nostr-crypto merged (cipher swap pending owner)

- Merged `wave4/g20-nostr-crypto` @ db210b7 with VENDORED ChaCha20 (pending review in crypto inventory; release gated).
  npm test 474/474. Swap to `@noble/ciphers@2.4.0` was blocked by the permission system (npm install of a new dep) —
  waiting on owner approval. Once approved: install exact, delete vendored cipher + its inventory entry, keep RFC 8439/
  OpenSSL/NIP-44 vectors against the library.
- Next: wire packages/relay crypto interface to packages/nostr-crypto; encrypted G16 terms exchange over NIP-17.

## 2026-10-27 — nostr-crypto under revision

- `wave4/g20-nostr-crypto` done (e135e7a..db210b7, 104+24 official NIP-44 vectors) but used hand-rolled ChaCha20.
  Worker resumed to swap to audited `@noble/ciphers@2.4.0`. Merge only after that commit lands and gates pass.

## 2026-10-27 — relay pool merged

- Merged `wave4/g19-g21-relay` (`b13e772`,`c5c4fe0`,`4f6135c`): `packages/relay`, ads = kind 30078 d=`p2p-offramp:v1:<orderId>`.
  npm test 443/443. Crypto is an injected interface (test double) — swap to nostr-crypto when that worker merges.
  Gaps: broker doesn't expose endpoint URL; strict mode needs a verified-private evidence issuer.

## 2026-10-27 — wave 4 running (Nostr)

- Opus: `wave4/g20-nostr-crypto` → new `packages/nostr-crypto` (NIP-01/44 v2 w/ official vectors/59/17, no NIP-04).
- Sonnet: `wave4/g19-g21-relay` → new `packages/relay` (pool via G05 broker, G19 adverts, fake-relay tests; crypto injected).
- After both merge: integrate relay with nostr-crypto (replace test double), then encrypted terms exchange.

## 2026-10-27 — G12 reconcile merged

- Merged `wave3/g12-reconcile` (`704504e`, `472ebd9`, `e9ace34`): `packages/domain/src/tx-lifecycle.ts`, `packages/wallet/src/evm-submit.ts`,
  opt-in lifecycle mode in intent-journal (default unchanged). `npm run test:evm:reconcile` 5/5 (SIGKILL→confirmed, replaced,
  dropped+successor) added to CI. npm test 410/410.
- Remaining code work (not owner-gated): app wiring of escrow/G12 (owned by other session's UI area — coordinate),
  two-tab races in lifecycle mode, Solana parity (later-preserved), Nostr offer exchange G19/G21 + NIP-17 chat G20.

## 2026-10-27 — withdraw scenario merged

- Merged `wave3/local-withdraw` (`071d600`, `2258fad`): local proof 8/8 incl. reverting buyer → deferred credit → withdraw.
  npm test 394/394. G12 reconcile worker (`wave3/g12-reconcile`) still running.

## 2026-10-27 — wave 3 running

- Opus worker: local branch `wave3/g12-reconcile` — `packages/domain/src/tx-lifecycle.ts` (+ maybe `packages/wallet/src/evm-submit.ts`),
  `scripts/test-evm-reconcile-local.mjs`, G12 spec. Haiku worker: `wave3/local-withdraw` — reverting-buyer + withdraw
  scenario in `scripts/test-evm-local-trade.mjs`. If interrupted: inspect those branches in `.claude/worktrees/`, merge if green.

## 2026-10-27 — local EVM trade proof merged

- Merged `wave2/evm-local-trade` (`56ff6f5`, `55255ca`): `packages/wallet/src/evm-escrow.ts` (test-only calldata/event
  decoder) + `npm run test:evm:local` (anvil two-party trade: native + ERC-20 fund/release, deadline refund, negatives).
  CI job `local-trade` added. npm test 393/393, forge 82/82, local trade 7/7.
- Still open (code): on-chain acceptance-signature check, failed-payout/withdraw path in local proof, G12 submit/reconcile,
  wallet-signed (non-dev-account) sending. Owner-gated (skip): trust root, Keccak dep review, deployment.

## 2026-10-27 — wave 2 started

- Draft PR #10 (escrow) open + subscribed. Worker (Sonnet) running on local branch `wave2/evm-local-trade`:
  `packages/wallet/src/evm-escrow.ts` calldata/event decoder + `scripts/test-evm-local-trade.mjs` anvil two-party trade.
  If interrupted: check that branch's commits in its worktree, resume or re-spawn with the same prompt.

## 2026-10-27 — EVM escrow merged into integration branch

- `claude/sweet-noether-arf6ne` = origin/main `c854785` + escrow merge `237305f`. Draft PR opened to main.
- `contracts/evm/BasicEscrow.sol`: no admin; tradeId computed on-chain = `evmTermsHash` (packages/wallet/src/evm-terms.ts);
  failed push payout credits recipient + `withdraw`. forge 82/82 (61 unit, 6 fixture vs local-evm-scenario, 10 fuzz, 5 invariant).
- Gates on merged tree: npm test 381/381, typecheck, check:specs, check:boundaries, test:browser, build all exit 0.
- Open: on-chain acceptance-signature check (EOA/EIP-1271) not done; no audit. Next candidates: escrow client calldata
  builder + G12 submit/reconcile (check other session's SESSION_STATUS first), anvil two-party local trade proof.

## 2026-10-27 ~22:10 UTC — resume after 3-day gap

- PR #3 (wave-1 CI + runbooks) merged. `main` now = `6d76590` (PR #4 shell + PR #5 profiles/G03/G09/G11/G16/test-only G10).
- Another session owns `claude/trade-review-integration` (draft PR #8, stacked on #7). Do NOT touch its files:
  `apps/web/src/trade/**`, `apps/web/src/ui/trade/**`, `packages/domain/src/terms-review.ts`, runtime/Worker files.
- That session is BLOCKED on the EVM escrow (Foundry permission). Foundry is installed here (`~/.foundry/bin`), so
  this session takes the **EVM escrow** (`contracts/evm/**`) — no file overlap.
- Wave-1 worker status:
  - E1 CI/runbooks: merged (PR #3).
  - H2 EVM escrow: local branch `wave1/h2-evm-escrow` @ `9c83634` (contract + mocks, no tests yet). **Resume this**,
    rebased on main, binding tradeId to main's G16 encoding (`packages/schemas` / `packages/wallet` evm-terms).
  - M1 G09, M2 G11, M4 G07 shell, H1 G16: **superseded by main**. Do not resume. Uncommitted WIP left in their worktrees only.
  - M3 G14 extensions: local branch `wave1/m3-g14-extensions` @ `f996b44` + uncommitted WIP. Not in lean scope; parked.
  - H3 Solana: uncommitted `programs/` WIP only. Lean scope marks Solana `later-preserved`; parked.
- Rule: only push `claude/sweet-noether-arf6ne`. Merge each worker as soon as it is green, push, update this file.

## Next steps

1. Resume H2 escrow worker → forge tests (unit/fuzz/invariant) green → merge here → push → draft PR.
2. Then: G12 submit path / escrow client bindings only if the other session has not started them (check its SESSION_STATUS.md).
