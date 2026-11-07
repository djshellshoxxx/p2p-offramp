# Unsigned local distribution staging

From the maintained Node 24 checkout with installed locked dependencies, create a
new local directory under an existing real parent:

```sh
node scripts/distribution/stage.mjs --out /tmp/new-p2p-distribution
node --test scripts/distribution/stage.test.mjs
node scripts/distribution/browser.test.mjs
```

The output must not exist. An output inside this checkout is permitted only below
an ignored `artifacts/` path. The command never replaces an existing directory,
follows an output-parent symlink, reads a local vault or publishes anything. Its
fixed public copy list excludes environment, credential, signing-key and private
profile files. Vite's four mode-specific dotenv paths must be absent; only their
existence is checked, never their contents. Build children use a fixed production
locale/timezone environment without ambient Node preloads or credential variables.

Every invocation builds the actual default static client and the separate
scriptless source-reference portal twice in isolated child processes and compares
their bytes. It reuses `buildWeb`/`scanBuild`, `buildPortal`/`verifyPortalDirectory`
and the unpublished wiki/claims consistency checker. The current default client
layout is closed to its index, native Worker, stylesheet and fixed evidence/license
assets. No demo/testnet fixture, source map, native executable or unlisted script
is included. Any future layout needs an explicit reviewed staging-profile change.

The directory contains:

- `client/`: real default client, Worker, core graphs, license attribution and local
  build evidence. Trading and default external connection origins stay disabled.
- `portal/`: the existing scriptless portal with its distinct restrictive policy
  and byte-exact canonical source-reference downloads. `_headers` is a hosting
  recipe, not evidence that an eventual host applies it.
- `wiki/docs/`: the exact seven unpublished Markdown pages, draft records, README
  and fixed public link targets, plus the real source-side consistency report.
  T36's immutable source binding must pass; a stale binding is not waived. Staged
  Markdown is source/download material, not a published wiki or new HTML renderer.
- `public/`: exact canonical BasicEscrow ABI, Solidity source and existing EVM
  recovery instructions, repository third-party notices and package lockfile.
- `review-packet.json` and `distribution-manifest.json`: fixed-schema unsigned
  inventory and missing qualification inputs. Every asset except the manifest
  itself has an exact size and SHA-256; final native reads verify the complete set.

The manifest records the actual HEAD, worktree dirty status/digest, scoped source
and dependency/recipe identities, Node executable digest and observed tool
versions. It contains no timestamp, absolute checkout/output path or environment
dump. Dirty source is explicitly recorded. Two equal local builds are not two
independent builders, and no reproducibility, host, release or professional review
approval is inferred from them. Use a frozen clean checkout and independent
builders for later qualification. Concurrent source/status changes cause refusal.

The maintained trust pin is unset today. Consequently no approved address, key,
signing envelope, recovery executable, archive/CID format, trust-rotation message
or nonempty G15 deployment profile is invented. A newly configured maintained pin
requires explicit integration of the existing authenticated G15/G25 builders;
this source-only staging profile refuses that change. Existing funded exits remain
bound to their original authenticated deployment/ABI even if a later frontend
release expires. The source references here are unapproved; hashes alone do not
establish original deployment correspondence or grant a funding proof.

`verifyDistribution(directory, retainedManifest)` checks local byte/set/schema
consistency against a retained manifest. The directory cannot authenticate itself:
an attacker able to replace both unsigned files and manifest can replace their
checksums. No command signs, uploads, deploys, starts paid infrastructure, changes
Pages settings or grants authority from an imported reviewer/status field. Actual
trust/bootstrap, deployment qualification, distribution witnesses and applicable
human/device review remain explicit in the review packet.
