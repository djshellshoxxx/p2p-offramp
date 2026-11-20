# Independent qualification of documentation and lab tooling

Date: November 19, 2026. Scope: PR #174, integrated with the current main
baseline in an isolated worktree. This is source and local engineering
qualification; it does not approve a release or assert a completed container run.

## Exact source

- Main baseline: `5c5a84ef6300330700c8b0ca54d074ac113f08be`.
- Reviewed PR #174 head: `030ba10169531dc9a6324d862bb4fad71fbb117b`.
- Tested local merge: `4f1f3089912d660ea2e337674f969804be4b8ab5`.
- The merge preserves both parent histories. Its only automatic content merge
  was the additive `package.json` script entries; no required check was removed.
- Runtime: Node `v24.22.3`, npm `11.19.1`, Linux x86_64.
- Dependencies: a fresh `npm ci --ignore-scripts` completed successfully in the
  isolated worktree, using its exact lockfile and physical dependency directory.

## Results executed on the integrated source

| Command | Result |
| --- | --- |
| `npm run test:tooling` | 22 tests passed; zero failures, cancellations or skips |
| `node --import ./scripts/test-support/register-tsx.mjs --test packages/claims/test/*.test.mjs` | 8 tests passed; zero failures, cancellations or skips |
| `npm run check:docs` | Engineering consistency passed: 7 pages, 172 links, 6 claims, zero stale evidence paths |
| `npm run typecheck` | All four existing TypeScript projects passed |
| `npm run check:boundaries` | Passed: 200 production source files, 113 core graph modules |
| `git diff --check` | Passed |

The two test commands contain 30 distinct passing tests. No additional product
test or actual container/browser result is inferred from this count.

An initial dependency-link attempt was replaced with a physical clean install.
The first tooling test invocation passed 22 tests, but the subsequent docs
command encountered a missing package during that replacement. All results in
the table come from fresh invocations after the clean install completed; that
setup interruption is not classified as a product defect.

## Source review

No blocking issue was confirmed in this scope.

- Claim parsing remains inert. Deserialized reviewer/status fields do not grant
  evidence authority. The maintained trust callback, immutable source scope and
  currentness checks remain separate requirements.
- The repaired array parser captures a bounded own-data length before iteration.
  Tests exercise changing proxy getters, descriptor failures, oversized arrays,
  accessor rejection and stale-evidence refusal.
- The docs checker verifies immutable source bytes, reports later source drift
  as stale, and strictly checks maintained page and local-link bytes. It bounds
  document size, target size, per-page links and aggregate links, and rejects
  symlinks/nonregular files and changing file contents.
- The lab selects commands from a fixed table. It captures only bounded logs,
  owns its subprocess groups, and uses a new exclusive directory for each run.
  Tests exercise cancellation, timeouts, child cleanup, symlink races and
  preservation of evidence from earlier successful and failed runs.
- The workflow change adds `docs-tooling`; the existing security and functional
  jobs remain present. Neither the lab nor its new workflow publishes an app or
  release.

## Integration notes and remaining gates

The documentation manifest still deliberately binds immutable source commit
`e17b4d34097ca97c21e621547a38766c0271fbde`. At the tested integration, all bound
source bytes matched and no evidence was stale. Later changes to the seven wiki
pages or their immediate local link targets require regeneration of the two
records, followed by the same checks. On an unmerged branch, an explicit existing
main baseline can be supplied:

```sh
python scripts/docs/generate.py 5c5a84ef6300330700c8b0ca54d074ac113f08be
npm run check:docs
npm run test:tooling
```

Regeneration does not grant semantic review, cryptographic review, publication
or release approval. Changed source catalog bytes may correctly report stale
claims until reviewed evidence is rebound to an eligible source revision.

The pinned devcontainer requires Node `v24.19.0`, npm `11.17.0`, Foundry `1.5.1`
and solc `0.8.30`. This reviewer did not run that container or either complete
lab recipe. The current host differs from its pinned Node/npm recipe; its
unit and subprocess tests are not substitutes for container qualification.

Combined staging still requires its own local checks, exact-head hosted CI and
the repository's applicable review gates. This independent review does not
replace the Tier B CodeRabbit/Qodo review requirement.
