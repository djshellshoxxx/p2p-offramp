# Generation 14: qualification of the reviewed combined source

Observed 2026-11-20 UTC. This worker composed the already reviewed followups in
an isolated worktree, froze the resulting source, then ran one complete npm suite
and eight additional serialized qualification commands. All nine commands
passed. No manual runtime source edit or conflict resolution was required.

## Exact source

| Checkpoint | Identity |
| --- | --- |
| Combined source | `e7c262659f94af30d18caf790a48e8b1fed77370` |
| Complete tree | `30c9264b9cc98786f43279b8aa513bd2c5fce9d3` |
| Local branch | `codex/combined-qualification-g14-20261120` |
| Starting reviewed backup UI / CI combination | `bf12a45604497860b8ded9d0e65f06a1c0cc9860` |
| Cross-browser backup followup | `e0e1a8b943a2a05bfe9102a0df3db85198da568d` |
| Frozen dependency source | `1e940862ba6e01309b81d5ce9d3d9f4ae4e32ce7` |
| Signed-update UI with independent tests/review | `485c37cc12dc100e43abd11dbcd8017f0399b741` |

Each followup was merged with a separate merge commit and is an ancestor of the
combined source. Exactly 19 paths change from the starting combination. Every
changed Git blob exactly matches its responsible reviewed component; every
other starting-tree path remains unchanged. These are preservation checks, not
new claims about every historical behavior.

The dependency source is the frozen lockfile commit, not its later report-only
commit. Its lock SHA-256 remains
`b9596088f7a28dccf465f5165eade7a9c02ea73a5734e38005be5e3b1b830039`.
All 56 original npm commands remain identical; the sole added command is the
already reviewed `test:backup:browser`. The active public Solana recovery-export
work was not included.

## Fresh execution

The worktree used physical `node_modules`, Node 24.22.3, npm 11.19.1 and Python
3.12.14. Git submodules were initialized recursively at their recorded pins.
The full suite used `FOUNDRY_BIN=/workspace/scratch/dcf03ef9bee8/tools/foundry-v1.5.1`.
The actual Cast binary reports version 1.5.1 and commit
`b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`.

| Command or measured scope | Result |
| --- | --- |
| One `npm test` invocation | **2,351 passed / 2,351 tests**, zero failures, skips, cancellations or todos |
| `npm run check:boundaries` | Passed: **241 production files / 148 visited core modules** |
| `npm run test:build-policy` | **58/58**, zero failures or skips |
| `npm run build` | Passed, including all four TypeScript projects |
| `npm run build:demo` | Passed, including the existing four-project typecheck step |
| `npm run check:docs` | Passed; engineering consistency true, semantic approval false |
| `npm run check:governance` | Passed; existing governance/evidence checks retained |
| `npm run check:specs` | 173 specifications; zero broken links or unindexed files |
| `git diff --check` | Passed |

The docs validator retains the existing stale `apps/web/src/ui/locale/en.ts`
reference and its six claim associations. Engineering consistency is true;
semantic approval and publication remain false. The JSON receipt preserves
these unresolved evidence fields explicitly.

The full command ran from 06:42:29 to 06:44:47 UTC, taking 138.282 seconds.
Its test reporter recorded 138,048.907937 milliseconds. These distinct timings
include different process boundaries; neither is a new performance claim.
All nine commands finished by 06:45:09 UTC. The working tree was clean after
qualification and before the two evidence documents were added.

Full-suite log SHA-256:
`efbd1a252f8b5303f36e4d2a14a3c68415ada9fff20346577f75573e3c9e0180`.

The 2,351 count is the observed result of this single invocation, not an
arithmetic sum of earlier full suites and focused tests. The 58 policy tests
are separately reported. No standalone extra TypeScript run, full Forge run,
browser execution or native Solana run is claimed.

## Actual emitted artifacts and isolation

The generated directories contain **13 default files and 14 demo files**.
The builder's scan counts exclude its subsequently written
`local-build-evidence.json`; the counts here come from the final directories.

| Profile / graph | Modules | Signed-update panel | Executable updater or type facade | Optional packages |
| --- | ---: | --- | ---: | ---: |
| Default document | 95 | Present | 0 | 0 |
| Default vault Worker | 30 | Absent | 0 | 0 |
| Default QR Worker | 4 | Absent | 0 | 0 |
| Demo document | 97 | Present | 0 | 0 |
| Demo vault Worker | 30 | Absent | 0 | 0 |
| Demo QR Worker | 4 | Absent | 0 | 0 |

Every one of the 13 default files is byte-identical to the independent
signed-update UI review's actual build on test commit
`12729ba1e895d68a0a5417c96b83673eea14b9c6`, tree
`92a10d92ee70d9246e0dfd12e626e8c277448577`. This comparison uses the independently
recorded file hashes; no reference artifact was substituted for a fresh build.
The vault and QR graph hashes also match between the fresh default and demo
builds.

Both build profiles retain `ReleaseEnabled=0`, `signedRelease=false` and
`releaseAcceptance=false`. Their connection-origin arrays are empty and their
CSP contains `connect-src 'none'`. The optional panel's presence in the document
does not configure a trusted controller or enable an update transition.

## Evidence and remaining gates

[combined-qualification-generation14.json](combined-qualification-generation14.json)
contains complete source/parent correspondence, exact 19-path blob checks,
environment and submodule pins, every command's exit/timing/log hash, actual
test counts, all six graph measurements and hashes, and all 27 artifact hashes.
Raw logs and runner receipts are retained in
`/workspace/scratch/dcf03ef9bee8/evidence/combined-g14/`.

Applicable exact-source hosted and native gates remain separate. This local
qualification does not transfer another pull request's checkout results or
replace actual backup journeys on Chromium, Firefox and WebKit. This worker did
not rerun the blocked local browser launch or SBPF attempt.

The dependency lock is byte-identical to the separately audited and
host-compiled proposal, but this full JavaScript/build run does not establish
SBPF, Clippy/all-targets, LiteSVM, IDL, validator or financial-browser acceptance.
The signed-update panel remains a view-only slice: the exact-own-lock backup
adapter, trusted composition, actual origin transition and physical-device
qualification remain incomplete.

Source integration and reports were local only. No remote ref, main branch,
workflow gate, release, deployment, real funds, trust authority or optional
runtime activation was changed by this worker. The coordinator owns remote
publication and any later expected-head merge after its applicable gates.
