# Independent optional composition review — November 19, 2026

## Scope and result

The coordinator independently reviewed the shared integration changes after another worker merged the nine reviewed optional packages in a local qualification branch. **No open High or Medium finding was identified in this integration delta.** Each package retains its separate source review and PR. This review does not replace current hosted checks, browser execution or any future default-application activation gate.

| Reference | Exact value |
| --- | --- |
| Existing integration base, PR #190 | `2b23ee614ff2dd05bd3a6e79f1278658c30a3909` |
| Reviewed local composition source | `a2f90cbdac973843e1dc71fe078e9433d66cfa75` |
| Reviewed composition tree | `aa285f9a8546b1c78bb0bca51c2bc350874b063b` |
| Scope | 174 changed paths; nine optional package subtrees, source/review reports, six root scripts and additive qualification workflow changes |

The composition branch is local qualification evidence. It is not a competing combined optional PR. The canonical D7 requirement remains one package per PR, represented by #191–#199. The coordinator did not modify the composing worker's checkout.

## Independent comparisons

The review read the exact immutable `package.json` and workflow diff and separately recomputed the following assertions using Git object contents and Python JSON parsing:

- All **52** existing npm commands retain their exact values. The resulting script map is the exact union of the base and nine published package heads. Only six commands are added: `typecheck:proof-inputs`, `test:meetup:browser`, `test:privacy-controls:browser`, `typecheck:proof-jobs`, `test:proof:memory` and `test:proof:browser`.
- All package metadata outside `scripts`, including dependencies, remains equal to the base. `package-lock.json` is unchanged.
- Removing exactly the three new proof-inputs, meetup and privacy-controls qualification steps reproduces the base `vault-foundation.yml` byte for byte. Action pins, read-only permissions, existing steps, timeouts, concurrency and failure behavior are preserved.
- The other **five** existing workflows are byte-identical to the base. The sole added workflow, `optional-proof-jobs.yml`, is byte-identical to reviewed PR #199 and retains its real browser and Worker-drain qualification.
- Every file under `apps/`, `contracts/` and `scripts/` is unchanged. The complete changed-path list contains no path outside the declared package, report and additive qualification scope.
- Each optional package subtree is identical to its independently reviewed published PR head. No package source was altered while resolving the two append-only `package.json` conflicts.
- `git diff --check` passed for the complete integration delta.

| Package / PR | Exact subtree in the combined source |
| --- | --- |
| proof-inputs / #191 | `8ce13a63a8df82b00cea3405d246babfe7f89746` |
| liquidity / #192 | `ef4dace6c26423b61d98c6012e54ab56d714428e` |
| arbitration / #193 | `f6a8051adf0c1adeb5b655240ad478c58fac1ac6` |
| privacy-policy / #194 | `5ab375b6f3b5520bd6059ff858f48699edf53aca` |
| courier / #195 | `276211811104349ad9431dae3f64f3ea83c299b6` |
| meetup / #196 | `a3fd556fb78cfbf8c0546068db657c4c69a7c9c7` |
| privacy-controls / #197 | `21480b1081bf720b21afa8277f2bfe99208790cc` |
| stealth / #198 | `0a24172c193fc3f7c2f7fd8967f107e2e37b5f73` |
| proof-jobs / #199 | `4be7a4564974f96d8396f4901fbeb63789eaed75` |

## Meaning and limits

The shared changes restore necessary qualification commands while preserving all pre-existing gates. Existing generic test/source globs cover the new packages; their special Worker and fixture configurations remain separate commands. No optional package is wired into the default App or private Worker by this composition. The package-specific privacy-policy atomic-group repair and returned-adapter diagnostic repairs are preserved exactly, as are the reviews that reproduced them independently.

The composing worker owns the full-suite, build, native memory, artifact and boundary executions and records them in its qualification report. They are not relabeled here as coordinator test executions. The independent comparisons above establish source preservation and gate union, not runtime sandboxing, hosted-browser success, financial authority or release approval.

Before integrating a package, inspect its live head, tested merge checkout and applicable check results. Because the optional source heads parent `ac9a4b0…` and target the newer PR #190 base, their hosted merge trees differ from their source-head trees. Later merges must preserve the independently checked union; changed source needs fresh qualification.
