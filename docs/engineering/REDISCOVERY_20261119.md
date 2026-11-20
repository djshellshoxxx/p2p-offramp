# Generation 3 rediscovery and retained vector recovery

## Scope and comparison

This successor read the persisted handoff, machine state and generation 2
extraction reports before working in its own worktree. The comparison checkpoint
was local integration `4689ee4e15950f3c50084c74ec5509eb909607bb`, containing the
reviewed asset-update, portal/distribution, governance, personalization and QR
browser fixture changes. No coordinator worktree or remote ref was modified.

The original inventory timestamp was `2026-11-19T23:26:57.468389+00:00`. Fresh
collection reads and source comparisons ran on November 19 in America/Vancouver,
ending after `2026-11-20 00:01 UTC`. Counts below describe that collection snapshot.

## Live repository delta

- Main remains `5c5a84ef6300330700c8b0ca54d074ac113f08be`.
- Two branch-list pages returned **194 branches**, versus 192 initially. Every
  original branch retained its exact head; none disappeared.
- Both additions belong to this consolidation: `codex/max-consolidation-20261119`
  at `a728ce290eb2fcbe9b4a9e857cc84ced401da70f`, and
  `codex/qr-camera-fixture-20261119` at
  `9611d6a5cb404fed5d41eeb176dafb31c01de640`.
- Two PR-list pages returned **186 PRs: 43 open, 105 merged and 38 closed without
  merge**. Only #188 and #189 were new relative to the original inventory.
- The issue collection since the original snapshot contained only PR updates
  #186/#188/#189, with no updated non-PR issue. #186's timestamp changed while its
  branch head did not. A timestamp alone does not establish an active writer.
- Releases remained empty. `git ls-remote --tags origin` returned no tags. The
  connector rejected the tags URL; the git query supplied that verification.
- **No external branch movement or confirmed new external writer was observed.**

After this collection snapshot, the coordinator reported publishing another
owned branch, `codex/historical-recovery-20261119`. Include that later addition in
the next live inventory; it is not external work. Retain the immutable original
192-branch inventory and record these changes as an overlay.

## Completed narrow extraction: frozen peer acceptance vectors

Source: [PR #159](https://github.com/djshellshoxxx/p2p-offramp/pull/159),
`1d3f59a9474a058b4b09c1fc4cdbe00f46335302`.

The maintained `peer-acceptance-v1.json` participates in EOA, envelope, verifier,
replay and Solidity tests. Its standalone deterministic generator and README had
not been retained. Before extraction, both current and historical fixtures were
confirmed as blob `f226861d405b6c9e6338f3f8c44d9745fd9756ce`; the historical
generator then ran against the current fixture and reported byte equality.

Recovery commit: **`8754f5f2cb08d60bf2d340f160fa408e9e6a7e30`**. Its three files are
the unchanged generator (blob `b4cd60f5386dd207d2bab9677298da461a68a135`), README
with recovery provenance, and one test checking the frozen SHA-256 plus the full
regenerated output. The generator uses pinned viem 2.57.10 and public synthetic
scenario inputs, without production digest helpers. No runtime, protocol,
dependency or frozen fixture changed.

Executed on Node 24.22.3 after successful `npm ci --ignore-scripts`:

| Check | Observed result |
| --- | --- |
| Historical generator probe before extraction | Exact fixture match |
| Recovered generator `--check` | Exact fixture match |
| Generator syntax and diff whitespace | Passed |
| Acceptance, envelope, replay, verifier and v2-vector suites | **44/44 passed**, zero failures/skips |
| Frozen fixture SHA-256 | `295b6c0c2ab11414cdebe96596e4dfc0d9c95b32f3966b20b2cb83aec2a531e8` |

```sh
node packages/wallet/test/fixtures/peer-acceptance-v1-generate.mjs --check
node --import ./scripts/test-support/register-tsx.mjs --test \
  packages/wallet/test/evm-peer-acceptance.test.mjs \
  packages/wallet/test/evm-peer-envelope.test.mjs \
  packages/wallet/test/evm-peer-replay.test.mjs \
  packages/wallet/test/evm-peer-verifier.test.mjs \
  packages/wallet/test/evm-peer-v2-vectors.test.mjs
```

No complete-project or new browser run was performed by this worker.

## Accepted optional-source queue

**Original D7 parking was superseded.** The canonical
`docs/adr/ACCEPTED-DECISIONS-2026-11-04.md` D7 row records the owner's November 18
acceptance in `docs/consolidation/2026-11-18-branch-consolidation-gameplan.md` §5:
one package per PR, an import-boundary check for each, and no default-build wiring
without its own gate. Experimental product status does not prohibit isolated
source intake.

The seven original required contexts are `forge`, `local-trade`, `local-evm`,
`schemas-and-crypto`, `browser`, `specs` and `inventory`. Results below were fetched
from each exact commit's `check-runs` endpoint, not inferred from another revision.
Each candidate remains open. Package path counts are the merge-base delta.

| PR | Package scope | Exact head | Required contexts |
| --- | --- | --- | --- |
| [#144](https://github.com/djshellshoxxx/p2p-offramp/pull/144) | `packages/proof-inputs/**` — 8 paths | `0b681ed42330b9129502eb0097783cf5995e8382` | 7/7 passed |
| [#145](https://github.com/djshellshoxxx/p2p-offramp/pull/145) | `packages/liquidity/**` — 12 paths | `f03ebbfb395128f839fbe069226e6d79bc143258` | 7/7 passed |
| [#146](https://github.com/djshellshoxxx/p2p-offramp/pull/146) | `packages/courier/**` — 22 paths | `636a3372cfe1a2306578b5a70ab9eb42858a83ac` | 6/7 passed; local-trade failed |
| [#147](https://github.com/djshellshoxxx/p2p-offramp/pull/147) | `packages/arbitration/**` — 18 paths | `f4840d46c3a58c182f7a0de1b7dda788b67cbace` | 7/7 passed |
| [#148](https://github.com/djshellshoxxx/p2p-offramp/pull/148) | `packages/privacy-policy/**` — 8 paths | `7c1f3441fcaa45f076957633b2005bd5c1e25e9e` | 7/7 passed |
| [#160](https://github.com/djshellshoxxx/p2p-offramp/pull/160) | `packages/privacy-controls/**` — 12 paths | `30a38a607a48c630c0eec2aecc2f3a5e49ab7d22` | 7/7 passed |
| [#161](https://github.com/djshellshoxxx/p2p-offramp/pull/161) | `packages/stealth/**` — 19 paths | `1d78c89bb62895878b108e77c8711f2a2c88fe79` | 7/7 passed |
| [#162](https://github.com/djshellshoxxx/p2p-offramp/pull/162) | `packages/proof-jobs/**` — 18 paths | `8decf7f95fd5deb17f814b80deb34f2903fe8e14` | 7/7 passed |
| [#163](https://github.com/djshellshoxxx/p2p-offramp/pull/163) | `packages/meetup/**` — 34 paths | `6a7e8d709fc3f5344daa86ccb8d6234e22bd931c` | 6/7 passed; local-trade failed |

Across these nine heads: **61 successful and two failed required-context results**,
all complete. This pass did not independently review all optional implementations.
Prior head passes do not certify a later extraction or combined tree.

| Package | Additional paths outside the package |
| --- | --- |
| proof-inputs | `package.json`, `.github/workflows/vault-foundation.yml` for explicit optional type checking |
| privacy-controls | `package.json`, `.github/workflows/vault-foundation.yml` for native browser qualification |
| meetup | `package.json`, `.github/workflows/vault-foundation.yml` for native browser qualification |
| proof-jobs | `package.json`, `.github/workflows/optional-proof-jobs.yml` for its separate type, memory and browser job |
| liquidity, courier, arbitration, privacy-policy, stealth | None in their merge-base delta |

The actual privacy-controls browser job
[135428134895](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44485592440/job/135428134895)
completed `test:privacy-controls:browser`. Meetup job
[135428173850](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44485604120/job/135428173850)
completed `test:meetup:browser`. Proof-jobs job
[135438437981](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44488664472/job/135438437981)
completed explicit optional type checks, native WASM memory tests and Chromium
qualification. These were observed through hosted job steps, not run locally.

Both failures have the same inherited symptom:

- Courier [job 135437932500](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44488516398/job/135437932500).
- Meetup [job 135428174559](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44485604266/job/135428174559).

Both logs stop in `scripts/test-localnet-browser.mjs:203` with
`Timed out: external wallet connection` after fresh-profile restore. This matches
the readiness symptom addressed by staged #181. Extract onto the repaired current
baseline and rerun actual qualification; neither old failed job becomes a pass,
and its wallet assertion must remain.

The coordinator assigned source batches A (proof-inputs, liquidity,
privacy-policy) and B (arbitration, courier, meetup), with C (privacy-controls,
stealth, proof-jobs) next. Each package keeps its own branch and PR. Shared package
scripts and workflows require coordinator reconciliation rather than parallel
overwrites. This worker owns none of those package implementation paths.

## Other retained differences and limits

- #100's blank-recovery-warning regression is present in
  `apps/web/test/locale-catalog.test.mjs`, extended with invisible-only/filler
  characters and additional severities. Its tip test needs no duplicate patch;
  this does not classify every inherited file on that branch as duplicated.
- #159's absent `exchange-v2.test.mjs` and `evm-peer-envelope-port.test.mjs` target
  old `createEvmPeerAcceptancePort`, `protocolVersion` and `peerAcceptance` APIs.
  Current code uses the maintained D1 port split and explicit
  `offerWithAcceptance`. Current tests cover downgrade refusal, role/key binding,
  deadlines, replay and tombstones. The old suites need case-by-case adaptation;
  missing filenames do not justify restoring the alternate runtime or claiming
  every assertion equivalent.
- #81 still has **47 absent paths** at this comparison checkpoint, including
  historical backup-verification, favorite/template and retention UI/Worker
  composition and browser harnesses. The recovered library is not a completed UI
  feature. Future composition must preserve profile/epoch revocation, bounded
  imports, durable receipts and the current runtime protocol. English catalog
  strings alone are not runtime implementations.
- The old native journey uses v1 communication acceptance followed by fixture
  peer signatures; the current native EVM/ERC-20 flow has newer D1 composition.
  Do not recover the alternate journey wholesale.
- Old `test-browser-zoom.mjs` retains Xvfb-based true-browser zoom qualification.
  Current locale layout code reports whether actual zoom worked, otherwise
  labels only a reflow simulation. Retained generic-share and signed-update
  browser harnesses are also possible scoped follow-ups. They require current
  composition review and hosted execution; no browser pass is implied here.
- Historical process/evidence branches remain traceable at immutable source.
  No archive tag, deletion, deployment, release, settings or credential action
  was performed or authorized by this worker.

The repository is not quiescent. Accepted optional-source intake, current-source
browser qualification and bounded UI composition gaps remain concrete work.
Continue from these candidates instead of repeating the original baseline audit.
