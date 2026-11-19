# Picomatch dependency advisory assessment — 2026-11-18

## Current update — advisory withdrawn

Rechecked November 18, 2026 (America/Los_Angeles) at main
`91ee6991d4527bba0e76b048a76e65ed7693c5a1`: both full `npm audit --json` and
`npm audit --omit=dev --json` report **zero findings** against the unchanged
lockfile. The configured registry is `https://registry.npmjs.org/`, and installed
and latest Picomatch remain `4.0.7`. The [GitHub advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
records withdrawal on November 18. The change is upstream advisory status, not a
local patch, audit exclusion or dependency downgrade. The previous reproduction
and scope assessment below remain historical evidence; do not read its five-high
scanner count as current. [Current findings and limits](../consolidation/SECURITY-FINDINGS.md).

## Historical result and decision

**The complete dependency audit remains open: five high-severity package findings trace to one Picomatch advisory. There is no compatible released Picomatch fix to pin as of 2026-11-18.** A bounded local reproduction confirms excessive matching time in the locked package and through Vite's exported `createFilter` API. The affected packages are development tools, and none appears in the inspected default, demo, or localnet browser document/Worker module graphs.

This is an external dependency blocker to a clean full audit and complete release security qualification. The emitted-runtime and input-path findings narrow the demonstrated exposure; they do not erase the dependency finding or prove every development-server configuration safe. `ReleaseEnabled` remains `0`.

This assessment preserves all dependency pins and application source. No forced downgrade, dependency alias, audit exclusion, fork substitution, lockfile metadata alteration, or local package patch was applied. A normal update cannot select an unpublished fixed version. The latest stable Vite also retains the affected dependency.

## Exact source and scope

- Source: `9f3ba5de1c202ef8b94d875c14cfcbc7af7ef7a0`.
- Root `package.json` Git blob: `90325e19e66948bc439503da369772678533abe3`.
- Root `package-lock.json` Git blob: `c95f0acc09a6d6949d75e6799244164f72c55bb3`.
- Root lockfile SHA-256: `8872a625711d1f38268be2b52d1b1645618bd5ee1b473e4770790cc24a9a2cda`.
- Runtime used for the bounded reproduction: Node `v24.22.1`.
- Scope: the root npm dependency tree and the three emitted web profiles. This assessment does not claim an audit of every separately locked subproject or a new chain-economic test run.

The isolated investigation ran `npm ci --ignore-scripts` successfully, retained all 13 exact direct dependency pins, and verified that every direct version agrees between the manifest and lockfile. `npm ls` confirmed one deduplicated Picomatch installation at `node_modules/picomatch`.

The downloaded `picomatch@4.0.7` tarball's computed SHA-512 matched both its locked integrity and current official registry metadata:

```text
sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==
```

This checks package-byte identity; it does not establish that those authenticated bytes are free of the reported behavior.

## Official upstream state

Observed on **2026-11-18**:

| Item | Observed value |
| --- | --- |
| Advisory | [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), CVE-2026-112366 |
| Issue class | Excessive regular-expression backtracking through repeated extglobs; CWE-1333 |
| GitHub publication / review / latest update | 2026-10-19 / 2026-11-17 / 2026-11-17 |
| Affected Picomatch range | `<= 4.0.7` |
| GitHub patched-version field | `None` |
| Official npm latest / highest published Picomatch | `4.0.7` / `4.0.7` |
| Latest stable Vite checked | `8.3.8`, still depending on `picomatch: ^4.0.7` and `tinyglobby: ^0.2.17` |
| Latest Tinyglobby checked | `0.2.17`, still depending on `picomatch: ^4.0.4` and `fdir: ^6.5.0` |

Primary sources are the [GitHub-reviewed advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), [Picomatch releases](https://github.com/micromatch/picomatch/releases), [Picomatch registry metadata](https://registry.npmjs.org/picomatch), [Vite releases](https://github.com/vitejs/vite/releases), and current package metadata queried with `npm view`. The unmerged [upstream proposal #235](https://github.com/micromatch/picomatch/pull/235) discusses this pattern class, but it is not a published fixed dependency and was not adopted.

The root `npm audit` result reports **5 high, 0 critical**, with CVSS 3.1 score **7.5** on its advisory record. The GitHub advisory page displays CVSS 4.0 score **8.7**, also high. These are different scoring versions, not five independently demonstrated application vulnerabilities. Four of the package findings propagate the same underlying Picomatch advisory.

## Locked dependency paths

| Locked package | Version | Relationship to the affected installation |
| --- | --- | --- |
| `@vitejs/plugin-react` | `6.1.2` | Direct development dependency; peer `vite: ^8.0.0` resolves to the locked Vite |
| `vite` | `8.3.5` | Direct development dependency; requires `picomatch: ^4.0.7` and `tinyglobby: ^0.2.17` |
| `tinyglobby` | `0.2.17` | Requires `picomatch: ^4.0.4` and `fdir: ^6.5.0` |
| `fdir` | `6.5.0` | Optional Picomatch peer range `^3 || ^4`, satisfied by the same installation |
| `picomatch` | `4.0.7` | Affected package, marked `dev: true` in the root lock |

The full scan remains nonzero. A separate `npm audit --omit=dev --json` returned zero findings; that result is limited to the production dependency subset and is not reported as a clean full scan. The original complete JSON is retained by the coordinator at `final-combined-gates/npm-audit.json`.

## Bounded reproduction and root cause

Every probe ran in a separate Node child process with a **1,000 ms total lifetime limit** and `SIGKILL` on timeout. Each slow case printed a marker immediately before matching, so the recorded timeout occurred after imports and matcher setup. No network service or other user's process was targeted.

| API and pattern | Candidate input | Observed result |
| --- | --- | --- |
| Picomatch, `+(*a)` | 8 `a` characters followed by `!` | Completed false in 0.09 ms matching time |
| Picomatch, `+(*a)` | 20 `a` characters followed by `!` | Completed false in 29.83 ms matching time |
| Picomatch, `+(*a)` | 30 `a` characters followed by `!` | Reached matching; child exceeded 1,000 ms and was killed |
| Vite `createFilter`, `+(*a)`, `{ resolve: false }` | 30 `a` characters followed by `!` | Reached matching; child exceeded 1,000 ms and was killed |
| Picomatch, `**/*.tsx` | 30 `a` characters followed by `!.tsx` | Completed true in 0.15 ms matching time |
| Picomatch, `+(*a)`, `{ noextglob: true }` | 30 `a` characters followed by `!` | Completed false in 0.09 ms matching time |

Timing numbers describe this local observation, not portable performance limits. Timeout evidence establishes a lower bound, not the exact eventual completion time.

In the locked `lib/parse.js`, `analyzeRepeatedExtglob` applies its empty-branch, wildcard-only-branch, and repeated-character-prefix checks only when there is more than one branch. The single `*a` branch is not rejected by the subsequent nested-extglob check. The resulting expression is:

```text
/^(?:(?=.)(?:[^/]*?a)+)$/
```

The repeated group contains another variable-length match. A failing suffix makes the matcher explore many partitions. Vite's installed `createFilter` invokes Picomatch with the supplied pattern and `{ dot: true }`, so a deliberately supplied bad configuration pattern reproduces the behavior there as well.

A minimal bounded reproduction from the repository after `npm ci --ignore-scripts` is:

```sh
node --input-type=module <<'JS'
import { spawnSync } from 'node:child_process';
for (const api of ['picomatch', 'vite']) {
  const code = api === 'picomatch'
    ? "import pm from 'picomatch'; const match = pm('+(*a)');"
    : "import {createFilter} from 'vite'; const match = createFilter('+(*a)', undefined, {resolve:false});";
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    code + "console.log('matching'); console.log(match('a'.repeat(30)+'!'));"],
    {encoding:'utf8', timeout:1000, killSignal:'SIGKILL', maxBuffer:16384});
  console.log({api, stdout:result.stdout, status:result.status,
    signal:result.signal, error:result.error?.code});
}
JS
```

## Repository exposure and emitted-runtime assessment

The affected package is used by Node build/development tooling. Project source does not import Picomatch, Tinyglobby, or Fdir into the browser; current user commands, relay events, payment instructions, recovery bytes, and wallet responses have no identified path into these build-time glob arguments. The Vite configuration is repository-owned and binds both the development and preview servers to `127.0.0.1`. It does not expose user-selected glob configuration. This is a scoped source assessment, not a proof about every possible Vite plugin or future configuration.

The coordinator had already built the exact source above and recorded successful default/demo builds and a real-fixture localnet build. This investigation independently reopened those artifacts, recomputed every asset's size and SHA-256 against its `local-build-evidence.json`, and inspected both document and Worker module graphs. All recorded asset identities matched. All three profiles retained `ReleaseEnabled: 0`.

| Profile | Assets | Document / Worker modules | Affected packages in either graph |
| --- | --- | --- | --- |
| Default | 10 | 70 / 26 | 0 |
| Demo | 11 | 72 / 26 | 0 |
| Localnet | 11 | 45 / 103 | 0 |

The inspected evidence-document SHA-256 values are:

- Default: `db32d51bc074fc712281340aac3b35428f3e9464364e1ddf36196a6856b41bdc`.
- Demo: `480a7892fa229e92f6c00e2c36659e71ed648a3f7b82d72d73daacbe65140ba3`.
- Localnet: `35300ccf560de5083230577ca29ad716c462a550fc74b5bf4c74eab6bca4282a`.

This identifies the emitted artifacts actually inspected. It does not claim an exploit through the browser application, and it does not remove the confirmed behavior from the installed build toolchain.

## Mitigation and closure conditions

Keep glob expressions under reviewed repository configuration and preserve the current separation between untrusted application data and build-tool arguments. Continue using loopback development/preview configuration and bounded CI build jobs. For a future API that accepts untrusted patterns, a pattern restriction or an explicit `noextglob` policy must be designed and tested at that API boundary; the direct control above is not a blanket Vite fix.

The compatible closure path is a published fixed Picomatch version or a supported upstream build-tool release that removes the affected implementation. At that point, update only the necessary pinned metadata/lock entry, verify package integrity, rerun the complete dependency audit, typechecking, build-policy tests, default/demo builds, and the actual localnet artifact build. A release must not be described as having a clean dependency scan until the complete scan is actually clean.

No additional chain-economic tests were run for this docs-only finding. The coordinator's exact-source typecheck, full unit suite, build-policy, default/demo builds, and native controller gate were already successful before this assessment. They remain functional evidence, separate from the unresolved dependency security finding.

## Session evidence

The investigation retained `picomatch-versions.json`, `picomatch-dist.json`, `picomatch-pack.json`, the verified tarball, `vite-latest-dependencies.json`, `locked-tree.json`, `reproduction.json`, the bounded `reproduce.mjs` driver, `npm-audit.json`, `npm-audit-production.json`, and `integrity-and-artifact-graphs.json` under `/workspace/scratch/07167523f342/globber-advisory-evidence`. The committed reproduction recipe and exact package identities allow regeneration. Dependency and application source diffs remain empty.
