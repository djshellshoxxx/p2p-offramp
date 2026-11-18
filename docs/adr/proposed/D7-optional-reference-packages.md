# D7 - Disposition of the optional reference packages in PR #26 (decision packet)

Status: ACCEPTED — Option 2, recorded 2026-11-04 by the owner (djshellshoxxx). Merge `personalization`, `governance` and `claims` with the rest of PR #26; park the nine optional reference packages that have no importer (meetup, courier, arbitration, liquidity, stealth, proof-jobs, proof-inputs, privacy-controls, privacy-policy) until the core journey leaves `LOCALPROOF`. Parking courier needs the governance assurance manifest update noted in this packet. This records scope only and changes no running behavior.

Paths marked "main" exist on `main` (e9b9db3). "PR #26 only" means the path exists only on the PR #26 branch (94554ec). Import evidence below comes from a static search of `apps/`, `packages/` and `scripts/` for relative import specifiers. It was not produced by running the bundler.

## The question

PR #26 adds twelve packages that are not on `main`. Nine are optional reference models (meetup, courier, arbitration, liquidity, stealth, proof-jobs, proof-inputs, privacy-controls, privacy-policy). Three are different in kind: personalization (imported by the web app), governance and claims (imported only by repository tooling). Which of them should merge with the rest of PR #26, and which should wait?

Constraints from the run: the optional-feature freeze (no new packages or reference-model extensions until the core journey leaves `LOCALPROOF`; existing ones are only maintained) and invariant 8 (optional features never become dependencies of basic trading or exits and gain no authority over funded positions). The same rule is stated in `docs/execution/ALL-REMAINING-WORK-PROMPT.md` (PR #26 only, bullet beginning "Keep canonical and isolated EVM profiles") and ADR-009 in `docs/execution/architecture/completion-decisions.md` (PR #26 only).

## Current source behavior

Evidence that core packages or `apps/web` import each package (searched with the full set of relative specifiers; "none" means no hit outside the package itself):

| Package (files added) | Imported by core packages or apps/web? | Other consumers |
|---|---|---|
| meetup (32) | none | Only a test fixture string at `scripts/tests/import-boundaries.test.mjs:119` that checks the boundary tool rejects a wallet import of it. CI runs `npm run test:meetup:browser` (`package.json:62`) |
| courier (19) | none | none |
| arbitration (16) | none | none |
| liquidity (10) | none | none |
| stealth (17) | none | none |
| proof-jobs (16) | none | `typecheck:optional`, `test:proof:browser`, `test:proof:memory` (`package.json:58-60`) |
| proof-inputs (7) | none | `typecheck:optional` (`package.json:58`) |
| privacy-controls (11) | none | `test:privacy-controls:browser` (`package.json:61`) |
| privacy-policy (6) | none. The web policy controller imports `packages/schemas` instead (`apps/web/src/privacy/policy-controller.ts:2-5`) | Negative fixture at `scripts/tests/import-boundaries.test.mjs:123` |
| personalization (6) | YES, `apps/web`: `src/runtime/worker-endpoint.ts:6`, `src/trade/draft-controller.ts:4`, `src/ui/trade/TradeDraftEditor.tsx:3` | Saved-review favorites and trade drafts, local preference records only |
| governance (5) | none (its README states the app imports none of it) | `scripts/governance/check.mjs:7`, `npm run check:governance` |
| claims (4) | none | `scripts/docs/validate.mjs:8` |

Other facts:

- Every unit test under `packages/*/test/*.test.mjs` runs in the `schemas-and-crypto` CI job through `npm test` (`package.json:10`), so merging adds those tests to the required gate.
- The boundary checker already lists meetup, courier, arbitration, liquidity, stealth, proof-jobs, privacy-policy and privacy-controls as "advanced" (`scripts/check-import-boundaries.mjs:37-41`, main). Proof-inputs appears to be covered by the `proof` path-part rule, but I did not run the checker to confirm (unverified).
- Dependency direction is one way: optional packages import `schemas`, `domain`, `storage`, `security`, `extensions`, `transport` or `relay`. In my static search no optional package imported another optional package. That structure supports invariant 8, but it is not a proof of runtime isolation.
- The freeze applies to new packages. All twelve are new on this branch. Whether the freeze reaches back to work done before it started is a question for the owner.
- Size: PR #26 changes 617 files (hosted API, observed at drafting time), which is why CodeRabbit skips it. The nine optional packages account for about 134 of those files. Removing them would not by itself bring the PR under the 300-file review limit.

## Options

**Option 1 - merge all twelve now.** Simplest, no unwinding of docs, review receipts or CI steps. Trade-offs: the freeze is bypassed in letter, about 134 files of unreviewed-by-bots reference code enter `main`, and every later CI run pays for their browser jobs. Security: the code is not imported by the core, so the custody surface is unchanged; the risk is maintenance load and drift. Compatibility: nothing existing changes.

**Option 2 - merge only what core or `apps/web` actually uses, park the rest in an explicit draft PR.** That means personalization (plus governance and claims, which are tooling, not features). The nine optional packages move to a draft PR with no merge target date until the core journey leaves `LOCALPROOF`. Trade-offs: honors the freeze and invariant 8 and shrinks PR #26. Cost: someone must remove or relocate the CI steps that reference parked packages (`package.json:58-62` and the matching steps in `.github/workflows/vault-foundation.yml`), check that documentation and evidence files that name them still validate (`npm run test:completion:tools`, `npm run check:governance`; I did not run these, unverified), and keep the draft PR rebased. Security: strictly less merged code in the trust path. Compatibility: no existing import breaks, because none exists.

**Option 3 - park all twelve.** Not workable as stated: personalization is imported by three web files, so parking it means also reverting those UI features, and governance and claims back repository tooling that PR #26 documents. It also discards tested infrastructure for no custody benefit.

## Recommendation

Option 2, proposed for owner decision. It is the only option that matches both the freeze and invariant 8 with evidence: the nine optional packages have no importer, so parking them cannot break core or the web app, while personalization has real importers and must be judged as part of the web app. If the owner prefers to keep personalization out of scope too, the web files above would have to be reverted with it.

Open questions the owner should answer first: is personalization a core feature or optional (it stores only local preference records, but the optional-feature rule uses the word "capabilities"); and are governance and claims tooling that the freeze allows.

## Test vectors

Not applicable to this decision. Acceptance checks after the chosen option: `npm run check:boundaries`, `npm run typecheck`, `npm test`, and `python scripts/spec_audit.py --check` must still pass, with no import from core packages or `apps/web/src` into a parked package. A new boundary test that fails if any of the nine parked names appears in a core or web import specifier would turn this evidence into a standing check.

## What this unblocks

A reviewable PR #26 scope, a clear record that optional features have no authority over funded positions, and a defined restart point for the parked packages (the first commit after the core journey leaves `LOCALPROOF`).
