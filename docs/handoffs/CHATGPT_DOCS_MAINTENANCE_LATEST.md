# ChatGPT documentation and wiki maintenance ledger

Updated: 2026-11-10. **Source main**: `300287dcde818a9d10ae301265d00bc7c0877bbb`. **Wiki-content commit** on isolated `chatgpt/zero-codex/docs-wiki-20261110`: `29f3ed0b893924b731d43d4d57b978531af25601`. This ledger was added in a subsequent docs-only commit; consult the draft PR for the final head.

## Context and ownership

Inspected main README, `docs/OPERATOR.md`, `docs/DEVELOPMENT_STATUS.md`, `package.json` commands, existing `docs/wiki-source/` pages, draft PR #61/63, and Claude-owned #65. Main is the authoritative source for wording; all PR-only capabilities remain labeled draft. **No concurrent third ChatGPT worker/subagent was spawned**: documentation was performed as a separate phase in the same ChatGPT session.

## Drift resolved

1. Rewrote `docs/wiki-source/Home.md` to prominently link two distinct top-level sections, **User Guide** and **Developer Guide**.
2. Added `docs/wiki-source/_Sidebar.md` linking both sections and existing specialized pages.
3. Added `docs/wiki-source/User-Guide.md` with capabilities and non-production status, installation/access, offline synthetic review/vault/backup workflows, troubleshooting, FAQs, privacy/security limitations and safe use.
4. Added `docs/wiki-source/Developer-Guide.md` with architecture, prerequisites, CLI build/test commands checked against main `package.json`, module map, API/contracts, contribution/security rules, CI/debugging, release process, ADR/spec references, and outstanding gates.
5. Corrected stale `docs/wiki-source/Getting-Started.md` text claiming the application was not yet implemented; merged main does include a bounded encrypted vault and read-only synthetic review. Real trading remains disabled.
6. Corrected stale `docs/wiki-source/Architecture-and-Development.md` planning-only description to distinguish present source modules from integrated production functionality.

## Link and command evidence

- Static check over **six changed wiki Markdown files**: all local wiki-page destinations either exist among current `docs/wiki-source/` pages or are created by this PR; **zero missing local page targets**. This is a **filename-level** link check, not a render/browser/wiki-publication test; external links and heading anchors were not automatically fetched.
- Verified user/developer CLI commands (`npm ci --ignore-scripts`, `npm run typecheck`, `npm test`, `npm run check:specs`, `npm run build:demo`, browser and targeted EVM suites) against main `package.json` and `docs/OPERATOR.md`.
- **No local builds, Node tests, browser tests or wiki publication tests were executed** in this documentation phase. Hosted GitHub CI from unrelated PRs must not be represented as a local docs test.

## Requirement-to-test / evidence status (source pointers; not new test results)

| Documented requirement | Code/evidence reference | Existing test/command | Qualification caveat |
| --- | --- | --- | --- |
| Local encrypted profile / fresh-key backup | `packages/storage/`, `apps/web/`; README, operator guide | `npm test`, `npm run test:browser` | Main contains functionality; no new tests run by this PR |
| Read-only synthetic terms review and saved terms | `packages/domain/`, web review controller | `npm run test:web:browser` | Demo only; no approved live registry |
| Trust keys and offline registry verification | Operator guide, build-policy scripts | `npm run test:build-policy`; `npm run build:testnet` | Default release key unpinned; failing closed is expected |
| EVM proof / send reconciliation | `contracts/evm/`, local proof scripts | `npm run test:evm`, `npm run test:evm:reconcile` | D9 restored-record and post-send qualification still open |
| Actual production release acceptance | Roadmap, release/security docs | Independent reviews + acceptance evidence | Blocked; CI alone cannot approve |

## Open gaps / publication blocker / next actions

- **The live GitHub Wiki was not modified or verified.** The connector has no wiki-write action; the six-page source update must be reviewed, then manually published to the wiki by an authorized maintainer. Home and sidebar are ready as version-controlled source; this is **not a claim of live publication**.
- Remaining possible drift: `docs/wiki-source/Privacy-and-Recovery.md` still uses some planning-era language; audit other specialized pages, README status, changelog, TODO/spec references, security policy/CONTRIBUTING presence, release notes, broken remote links and broader documentation coverage in later runs without overlapping active owners.
- Use exact merged source/test evidence to decide what can be upgraded from draft/future to implemented. Do not edit approved protocol decisions, financial policy or security guarantees as a documentation shortcut.
- Next docs run: reconcile Privacy-and-Recovery and Wallet-and-QR-Safety with current merged source and tests; repair any verified broken links. Do not enable or publish GitHub settings/wiki without authorization.

No code was changed; no merge, deployment, release, public vulnerability disclosure or settings change occurred.
