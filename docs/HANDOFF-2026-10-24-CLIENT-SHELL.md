# Replacement-agent handoff: client-side shell, 2026-10-24

Recorded 2026-10-24 UTC. This software artwork is experimental and incomplete. This file is coordinator-owned; workers must not edit it concurrently. Continue autonomously through ready tasks, preserve small reviewed/tested source checkpoints, and record failures rather than weakening gates.

## Exact source and provenance

- Tested code commit: `52fd1149a1463f747f7c21f7693f8951e577d961`; tree `f5a809b47e4a9dca37c0db9acb53f1b5d0df13ed`. A following docs-only commit records this handoff/evidence; discover its exact published SHA with `git rev-parse HEAD` and verify the remote ref.
- Local branch: `work/p2p-pr3-development-2026-10-24`; intended remote work checkpoint: `work/p2p-client-shell-2026-10-24`. Repository: `djshellshoxxx/p2p-offramp`.
- Starting PR #3 / `claude/sweet-noether-arf6ne`: `3df560fcc2cae2f6031ec258b53ce37ad03c6510`; verified parent includes `bc996aac828ce63856193c9114edfef480153325`, PR #1 and #2. Last main read: `28bc32f1c8ea98d6216b2e1509b1fb5e3374bcfa`. Re-read live refs before integration; do not overwrite another agent's branch.
- Preserved original checkout `/workspace/p2p-offramp` remains at `bc996aa...`; new work is in `/workspace/p2p-offramp-pr3-dev`, same environment. No lost historical checkpoint or historical test result was recovered.
- `feat/custodial-ledger-foundation` is incompatible provenance, excluded from the noncustodial product.

## Completed behavior

Static React/Vite document + same-origin native module Worker, accessible bounded hash routes, locked boot, existing-known-profile unlock/status/lock and explicit unchecked encrypted export consent. UI sees only stable locked/unlocked snapshots and fixed typed errors, never vault handles/private records/provider objects. Aborts/unmount clear password inputs; stale startup disposes late services; lifecycle revocation remains in AppRuntime. Observer notifications occur after authority mutations and honor unsubscribe immediately.

Production assets use relative paths, offline CSP, separate header/meta delivery profiles, document/Worker core graphs and artifact hashes, unsigned local-build evidence, full MIT notices for bundled React packages, no source maps/service worker/remote active resources. Local AST boundary tests reject private cross-package paths and server/advanced imports. Dependencies are pinned with an npm-generated lock. CI actions are full-SHA pinned and read-only; added static build, policy and emitted-app browser checks. Neither repository hosting settings nor deployment workflows were added.

**Client-side is normative**: see `adr/ADR-CLIENT-SIDE-2026-10-24.md`. User-controlled keys/private data stay local or with an explicitly selected external wallet; no mandatory app-owned server/account DB/server secrets. Future RPC, contracts, wallet and peer/relay infrastructure remain external dependencies, not infrastructure-free guarantees. No real money, live transaction, deployment, release, credential or security-setting change was performed.

## Fresh validation and review

The exact code above passed 273 Node tests (zero skipped), strict domain/runtime/Worker/UI types, five build/import policy tests, build, three native Chromium fixtures and emitted-artifact Chromium fixtures. Browser 154.0.8037.57 on this Linux environment exercised root/nested/IPFS paths, widths 320/768/1024/1440, encrypted unlock/export, reload locked, cancellation, hostile inputs, missing entry/Worker/crypto/storage with preserved ciphertext, actual CSP rejection, header framing denial/meta framing disclosure, zero automatic wallet prompts/unexpected egress, and local repeated-build byte equality. Production `npm audit --omit=dev` reported zero advisories. Eleven Python spec-tool tests and 173-document structural checks passed. Structural checks and advisory databases do not certify product/security completeness.

Full commands, timestamps, log SHA-256s and reviewed source file SHA-256s are in `evidence/client-shell-2026-10-24.json`. Local raw logs remain `/workspace/p2p-pr3-*`; these paths are not durable attachments. Evidence/result summaries and source are preserved by this repository checkpoint. External audit has not run. Physical devices, Safari/Firefox, deployed headers, dependency provenance/independent security review and signed release acceptance remain open. All release/trust attestations remain false.

Internal separate-context standards/spec review found no demonstrated custody/backend/secret-egress blocker. It reproduced one observer-unsubscribe semantic issue, fixed before the 273-test run. This is internal review, not independent audit. Test fixture `BEGIN PRIVATE KEY` is an inert marker without a key body/END marker, intentionally testing artifact rejection; source review has no unresolved credential findings.

## Ordered next work and explicit gaps

1. Recheck GitHub refs; publish this reviewed work checkpoint and verify its remote SHA. Open an integration PR to main containing PR #3 plus this milestone; require exact-head CI/review before merge. No force pushes, main overwrite, releases or deployment. Appropriate source merge is authorized; do not bypass a denied merge/protection check.
2. Reconcile remaining M0/M1 contracts against G07/G08/G09/G11/G15 and current frontend. Known-profile unlock is not a create/recover onboarding flow. Worker capabilities/schema support must be reviewed before adding bounded create/restore UI. Preserve explicit preview/consent, cancellation/session guards, old-data preservation and local-only secrets.
3. Registry/manifest and peer transport/discovery remain prerequisites; no production wallet/sign/submit/trading authority is enabled. `ReleaseEnabled=0`, empty `connectOrigins`, safe disabled offers/trade routes remain visible. Do not implement custody or automatic fiat-proof claims.
4. Build actual EVM escrow/trade flow only after its authority/terms/network gates exist; then Solana parity. Manual fiat cannot guarantee receipt or eliminate withholding. Optional privacy/arbitration/meetup/courier extensions follow core acceptance, not vice versa.
5. Qualify supported browser/device/deployed-host/recovery matrix; run the separately coordinated security/code audit against pinned GitHub source, then resolve findings/regressions before any acceptance claim. Independent audit task Library materialization was blocked; do not retry another transport without parent coordination.

## Worker ownership and safe continuation

This tranche used three P2P workers: frontend UI/routes/tests; static build/artifact browser tests; PR #3 review/import-boundary checker. Root coordinated services/runtime/schema facades/dependencies/CI/docs/Git and separate-context final review. All writes were frozen for integration tests. GhostPay has its own checkout/team. One P2P worker is now doing read-only next-task intake; no overlapping source ownership. Inspect current live worker status before assigning writes.

## Changed files in tested code commit

```text
.github/workflows/specifications.yml
.github/workflows/vault-foundation.yml
DEVELOPMENT_ROADMAP.md
README.md
apps/web/README.md
apps/web/index.html
apps/web/scripts/artifact-policy.mjs
apps/web/scripts/artifact-policy.test.mjs
apps/web/scripts/build.mjs
apps/web/scripts/static-build-plugin.mjs
apps/web/src/app-services.ts
apps/web/src/main.tsx
apps/web/src/runtime/app-runtime.ts
apps/web/src/ui/App.tsx
apps/web/src/ui/Pages.tsx
apps/web/src/ui/VaultForms.tsx
apps/web/src/ui/app.css
apps/web/src/ui/messages.ts
apps/web/src/ui/routes.ts
apps/web/src/ui/styles.d.ts
apps/web/test/app-services.test.mjs
apps/web/test/ui-routes.test.mjs
apps/web/tsconfig.ui.json
apps/web/vite.config.ts
docs/DEVELOPMENT_STATUS.md
docs/adr/ADR-CLIENT-SIDE-2026-10-24.md
package-lock.json
package.json
packages/domain/src/authority.ts
packages/domain/src/errors.ts
packages/domain/src/intent-journal.ts
packages/domain/src/read-retry.ts
packages/identity/src/identity-service.ts
packages/identity/src/noble-provider.ts
packages/schemas/index.ts
packages/storage/src/backup-service.ts
packages/storage/src/idb-vault-store.ts
packages/storage/src/vault-crypto.ts
packages/storage/src/vault-service.ts
scripts/check-import-boundaries.mjs
scripts/test-web-build-browser.mjs
scripts/tests/import-boundaries.test.mjs
```
