# Claude Code handoff — p2p-offramp

Written 2026-10-28 UTC by the session that merged PRs #4–#9 and opened draft PR #11. Read this first, then `docs/handoffs/SESSION_STATUS.md`. Neither document authorizes merging, release, deployment or trading.

> **Update 2026-10-28 (session sweet-shannon).**
> - Draft PR #12 (`claude/sweet-shannon-grykla`) integrates #11 and then #10 on `main`, with the crypto-inventory conflict resolved and every local gate passing.
> - It adds the relay ↔ nostr-crypto wiring, saved terms reviews, ChaCha20 from `@noble/ciphers@2.4.0`, and the Sepolia testnet kit: deploy/record/sign/verify, the two-party trade tool and the testnet web build.
> - The owner chose Ethereum Sepolia as the test network and an owner-held testnet-only P-256 key as the registry trust root (2026-10-28). Nothing is deployed yet; the deploy waits for the owner's environment secrets.
> - Start from that branch. The record, test results and open gates are in the SESSION_STATUS section "Integration branch 2026-10-28".
> - The table below is the state on 2026-10-28 before that work.

## State of the repository

| Ref | SHA | Status |
|---|---|---|
| `main` | `c8547859f603f04d3df92e68925b99162594c39d` | Owner-approved merges: PRs #4, #5, #7, #8, #9. CI green. |
| PR #10 `claude/sweet-noether-arf6ne` | `e652f6de0e010f95f57926b2844f5fe9ade0c0ab` | Draft. **Owned by another session.** Adds EVM BasicEscrow (Foundry), G12 submit/reconcile, relay (G19/G21) and nostr-crypto (G20). Do not edit it unless you are that owner. |
| PR #11 `claude/recovery-consolidation` | `dea8e9e218d8eb9e57414ef7e180884c7a39d67d` | Draft. Recovered private-lineage source merged onto `main`. Awaiting independent review and owner approval. |
| `feat/custodial-ledger-foundation` | `52e6987e` | Incompatible custodial design. **Never merge.** |

Other `claude/*`, `work/*` and `docs/*` branches are historical and already contained in `main`. Keep them; do not delete or force-push.

## Fixed rules

- Client-side, noncustodial, single-EVM lean scope (`docs/handoffs/LEAN_RELEASE_SCOPE.md`, `docs/adr/ADR-CLIENT-SIDE-2026-10-24.md`).
- `ReleaseEnabled=0` and `connectOrigins: []` stay in every build. The app has no wallet signing and moves no funds. The Sepolia kit signs testnet transactions from the session only with an owner-provided testnet key held as an environment secret, never in the repository, chat, argv or logs; nothing is deployed yet.
- Do not choose trust-root, escrow, refund, fee or release policy. Those are owner decisions.
- Release and real-funds claims need tests on the exact head plus independent security acceptance. Neither exists yet.
- Never force-push or skip hooks/signing. Push only to `claude/*` branches. Merge to `main` only with explicit owner approval.
- A GitHub token was pasted in chat on 2026-10-27. It was never used or stored. The owner reported it revoked on 2026-10-28. Never use it.

## Commands (discovered from `package.json` and CI)

```sh
npm ci --ignore-scripts          # use a real install per worktree; a symlinked node_modules breaks the build's NON_CORE_MODULE check
npm run typecheck
npm test                         # node:test; .tsx via scripts/test-support/register-tsx.mjs
npm run check:boundaries
npm run test:build-policy
npm run test:fuzz                # PR #11 only
npm run build && npm run build:demo
npm run test:browser && npm run test:web:browser
npm run test:private:browser     # PR #11 only
npm run test:specs && npm run check:specs
```

Chromium resolves via `P2P_CHROMIUM`, then `/usr/bin/chromium`, then `/opt/pw-browsers/chromium-*`. Build modes and the local terms file format are in `docs/OPERATOR.md`.

## What works on main (verified)

- Encrypted local profiles: create, unlock, lock, inventory (capped at 16), unchecked encrypted export, fresh-key restore, G03 reseal and G09 migration core.
- Offers → local trade-terms review → `#/trade/<random id>` review screen. It shows exact uint256 amounts, full addresses, deadlines, screened instructions, risk text and blockers. It works only in the synthetic `npm run build:demo` build; the default build has no approved registry.
- Test-only (not bundled): G16 EIP-712 digest and EOA verification, and the G10 EVM adapter.

## PR #11: what it contains and what is left

- **Source of the import:** owner zip `P2P-compact-source-checkpoint-20261027.zip`. Snapshot tree `0770e298…`, verified against its manifest. There is no Git history; it forked from `81c2dc8`. The full record (provenance, classification table, physical-drain ownership note) is in the SESSION_STATUS "Recovery consolidation" section.
- **Imported:**
  - G11 byte-bound hardening and the G13 retry fix.
  - Test-only private G16 agreement verifier: protocol/control schemas, host and port adapters, fuzz harness.
  - G18 payment preflight and journal composition.
  - Test-only G15 release-manifest fixtures.
  - A strict runtime reply discriminator, pending metadata, and a restore → select → unlock UI flow.
  - Raw-byte build identities.
  - 920 docs files, verbatim and author-reported.
- **Local results on `634e761`:** `npm test` 626/626, and every gate above exits 0. Hosted CI was 11/11 green, including CodeQL, on `b5799c9` and again on `dea8e9e`. The only change after `dea8e9e` is this handoff file.
- **Not done:** independent review. The reviewer agent failed because the account was out of API credit. The integrator self-check is recorded, and it is not independent.
- **PR #10 interaction:** a trial merge conflicts only in `packages/security/test/crypto-inventory.test.mjs`. The verified resolution, which gives 718 pass / 0 fail / 1 skipped, is described in SESSION_STATUS. A patch was also written outside the repository as `pr10-x-consolidation-crypto-inventory-resolution.patch`. Whichever PR merges second applies it.
- **Owner note:** the recovered inventory records the G16 test providers' review as `accepted` (an AI reviewer in that lineage). That is not independent security acceptance, and it does not make anything release-eligible.

## Next tasks, in order

1. Run one independent review of PR #11. Scope it to the six three-way-merged files (`apps/web/scripts/build.mjs`, `apps/web/src/ui/App.tsx`, `Pages.tsx`, `messages.ts`, `packages/schemas/src/registry.ts`, `scripts/test-web-build-browser.mjs`) plus the import fidelity. Reconfirm CI on the PR #11 head if it has moved.
2. With the owner, agree the merge order of #10 and #11. Apply the crypto-inventory resolution in the second PR, then rerun the full gate list on that exact head.
3. After both merge, the next engineering slice is wiring vault persistence for reviewed terms (Worker record commands), reusing the recovered pending-metadata and runtime discriminator.
4. Owner decisions still gate the trade loop:
   - G11/G15 trust root and bootstrap;
   - acceptance of PR #10's escrow and refund semantics;
   - Keccak/secp256k1 dependency review for in-app signing;
   - the G16 Solana token-program field.

## Local machine state (not in Git; may not survive)

- Worktrees: `/workspace/consol` (PR #11), `/workspace/integ`, `/workspace/wt-domain`, `/workspace/p2p-offramp` (main). All are clean.
- `/tmp/recovery-staging` holds the extracted snapshot and the three-way inputs. The original zip is in `/mnt/session/uploads`.
