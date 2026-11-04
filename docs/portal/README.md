# Scriptless security and recovery portal

Build the local, unsigned reference package from Node 24 and the installed locked
dependencies. The destination must be a new directory; existing outputs are
preserved rather than replaced.

```sh
node scripts/portal/build.mjs --out /tmp/new-p2p-portal
node scripts/portal/build.test.mjs
node scripts/test-scriptless-portal-browser.mjs
```

The default destination is `apps/portal/dist`. There is no approved maintained
release key or deployment today. The portal explicitly states that trading is
disabled and supplies no signing executable, wallet action, live RPC, private
record, approved address, key fingerprint or Solana IDL. A future configured key
causes this source-reference builder to refuse until authenticated-profile
integration is explicitly implemented; JSON or environment values cannot select
an approved profile.

The package copies the canonical BasicEscrow ABI, Solidity source and existing
canonical EVM recovery instructions byte for byte. `portal-build.json` binds their
sizes and SHA-256 digests, source inputs, commit, worktree dirty flag and status
digest. It identifies an unsigned local artifact, including when built from
modified/untracked sources. Its `assets` list excludes the build report itself
to avoid a circular self-hash. No timestamp or absolute checkout path affects the
artifact. Rebuilding unchanged source/status produces the same bytes. These
identities cannot establish deployment correspondence or authenticate their own
distribution. Independently authenticate the complete recovery package before
following its instructions. The existing canonical recovery builder remains the
only recovery packager; this portal does not construct one or bypass its proof.

`content-policy.json` describes the restrictive scriptless policy. `_headers`
is a hosting recipe for a compatible host, **not proof that a host applies it**.
Verify actual response headers on every deployed HTML entry and response type.
The CSP must precede resources when supplied as meta; meta cannot enforce
`frame-ancestors`. GitHub Pages generally cannot set arbitrary response headers.
Keep `script-src 'none'`, `connect-src 'none'`, no framing, objects, forms or base
replacement, and the external-resource exclusions. The portal requires only its
own stylesheet and explicitly linked downloads. It has no script or service
worker and can be printed using the browser's normal Print command.

The Chromium fixture uses JavaScript-disabled browsing for readable instructions,
responsive layout, byte-exact downloads and print/PDF. Separate JavaScript-enabled
hostile probes verify actual local header enforcement for inline/external script,
connection, base replacement, embedded frames and framing by another page.
The local fixture is not a production hosting attestation, independent release
review, professional accessibility audit, physical-device recovery trial or trust
bootstrap. Nothing is published by these commands.
