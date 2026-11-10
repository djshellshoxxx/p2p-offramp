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


## Second maintenance pass — 2026-11-10

- Source unchanged: `main@300287dcde818a9d10ae301265d00bc7c0877bbb`; reviewed main README blob `f143cc0da62712f27c533ee08285706da6acf354`, operator guide `bd3901ccb570a9f71ac002a6d9e77da1b9fd3c12`, status `c9c00cc5139cf89163c15e30464fe6761f015610`, and the existing draft User/Developer Guide.
- Replaced planning-era `docs/wiki-source/Privacy-and-Recovery.md` with source-supported coverage of the implemented bounded encrypted local vault, eight-item encrypted saved reviews, explicit export, *separate fresh-key restore*, synthetic-only offline review, and the limits of client-side privacy; **wiki-content commit `4243d174a4b3c854f7a60613e145caa07852429f`**.
- Documented the distinction between profile backup and the separately authenticated **unsigned historical EVM recovery package**, which has no signing/send/trading authority. No real payment, anonymity, fiat finality, or secure-erasure claims were added.
- Static navigation check for the changed privacy page: **5 local Markdown links** (Home, User Guide, Developer Guide, Wallet/QR Safety, Security/Release), **0 missing target files**, verified against the branch tree. This is not anchor/browser rendering, external URL reachability, or live GitHub Wiki publication.
- All **10 hosted PR #68 checks** at its previous head `d0eea7981e2211228ef6d12e98a425ba254fae29` completed successfully (CodeQL, specs, browser, schemas/crypto, local EVM, local trade, forge, inventory, Python/JS CodeQL). **New PR checks after this docs edit remain separately required**. No local Node/browser/contract tests or live wiki publishing were executed in this docs pass.
- Next docs pass: verify `Wallet-and-QR-Safety.md` against actual current UI and design gates, expand requirement-to-test links, and investigate distant links/anchor rendering only with source-backed checks. Live wiki publication still requires an authorized maintainer.

## Third maintenance pass — 2026-11-10 (wallet/QR wording and navigation)

- Authoritative merged source still `main@300287dcde818a9d10ae301265d00bc7c0877bbb`. Inspected README blob `f143cc0da62712f27c533ee08285706da6acf354` and `docs/wiki-source/Wallet-and-QR-Safety.md` original blob `34385b78c39f06f9941875fdfb8862fa5424ad44`. Cross-checked existing draft User/Developer Guide, Privacy and Recovery, and current main package commands. PR #61 and #69 are **draft** and not promoted to main.
- Updated only `docs/wiki-source/Wallet-and-QR-Safety.md` at commit `0172a07978e98e043a93919115b35e2146cb3ab7`: linked top-level **Home**, **User Guide** and **Developer Guide**; separated existing test-only wallet boundary from unapproved live transfers; clarified that QR and copy/deep-link alternatives are safety/design guidance, **not** asserted shipped features. Preserved no-real-funds, independent authorization, uncertain-broadcast and original encrypted-backup requirements.
- Static link-target check against the docs branch's actual wiki directory listing: **7 local Markdown link references, 5 distinct local page targets, zero missing targets**. The remote operator-guide URL points to an observed file on main; external reachability, heading anchors, rendering and GitHub Wiki publication were not tested. No local test or build commands executed by this documentation phase.
- Exact-head documentation checks at `0172a07978e98e043a93919115b35e2146cb3ab7` were **queued/in progress** when reviewed and require subsequent qualification. Existing earlier CI at `b4667b01ab537b50aaacdb7c6410c3f67715f22f` was completed successfully. The new ledger commit will trigger its own CI and must be evaluated separately.
- **Publication blocker:** version-controlled `docs/wiki-source` changed; the live GitHub wiki has **not** been published or verified. A maintainer must approve and publish Home, _Sidebar, User Guide, Developer Guide and the revised topic pages using the repository's wiki workflow.
- Next documentation slice: check specialized Security/Release and Codespaces pages against main and active PR status, then maintain requirement-to-test links and any independently verified broken navigation; do not claim draft work as released.

## Open gaps / publication blocker / next actions

- **The live GitHub Wiki was not modified or verified.** The connector has no wiki-write action; the six-page source update must be reviewed, then manually published to the wiki by an authorized maintainer. Home and sidebar are ready as version-controlled source; this is **not a claim of live publication**.
- Remaining possible drift: `docs/wiki-source/Wallet-and-QR-Safety.md` and other specialized pages may still use planning-era language; audit those pages, README status, changelog, TODO/spec references, security policy/CONTRIBUTING presence, release notes, broken remote links and broader documentation coverage in later runs without overlapping active owners.
- Use exact merged source/test evidence to decide what can be upgraded from draft/future to implemented. Do not edit approved protocol decisions, financial policy or security guarantees as a documentation shortcut.
- Next docs run: reconcile Wallet-and-QR-Safety with current merged source and tests; repair any verified broken links. Do not enable or publish GitHub settings/wiki without authorization.

No code was changed; no merge, deployment, release, public vulnerability disclosure or settings change occurred.

## Fourth maintenance pass — 2026-11-10 (security/release truthfulness)

- Inspected merged `main@300287dcde818a9d10ae301265d00bc7c0877bbb`, operator guide `bd3901ccb570a9f71ac002a6d9e77da1b9fd3c12`, development status, active draft PR #61 and ChatGPT-owned #69/#70/#71, the prior docs/audit handoffs, and all current wiki navigation. Claude's M2A PR #65 and all active owners' branches remain untouched.
- Replaced the one-paragraph `docs/wiki-source/Security-and-Release.md` with user/developer navigation, source-pinned experimental status, precise differences between merged, draft, CI-qualified, blocked and released, Tor/relay/fiat/chain metadata limitations, and D1/D8/D9 plus independent review release gates. Documented PR #61's 10 successful hosted checks and PR #56's **separate unresolved SonarCloud rating C versus required A**, without pretending the individual findings were retrieved or resolved.
- Wiki source commit `d7440c8a12e31d9510505259931e12452d0e973d` changed **only** `docs/wiki-source/Security-and-Release.md`. The link-target check against the actual updated docs branch tree examined **eight local Markdown references**, seven distinct destination pages, **zero missing local targets**. This does not check GitHub-rendered anchors, remote URLs or live wiki publication.
- Every CLI command named in the updated page (`typecheck`, `test`, `check:boundaries`, `check:specs`, `test:build-policy`, `test:browser`, `test:local-evm`) was independently checked as present in merged main `package.json` scripts. No local Node tests, browser/Foundry runs or runtime security evaluation were executed for this docs change.
- The inspected merged main tree contains **no root SECURITY.md**. A coordinated private vulnerability-reporting/security-policy proposal needs owner approval; do not create a policy that implies an established private channel or change repository settings unilaterally.
- **Live GitHub Wiki was not edited or published**: direct connector does not expose a wiki-write action. Home and sidebar continue to link distinct User Guide and Developer Guide in version-controlled source. Owner/maintainer review and publication remain necessary.
- No third concurrent documentation worker was available; this was a distinct sequential phase of the same run. The new docs branch-head exact SHA and hosted CI must be checked independently before calling this maintenance pass CI-qualified.
- Next docs target: `Codespaces-Test-Lab.md` still speaks prospectively about configuring a devcontainer "once executable app code exists," although main already has executable code. Verify actual committed devcontainer and CLI/test evidence before revising, to avoid inventing runtime tooling. Extend requirement-to-test matrix on the next unblocked run.
