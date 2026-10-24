# Static release pipeline

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M1 / M2C.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Build React/TypeScript/Vite artifacts with no required runtime server, package them with the signed manifest, and preserve an independently usable recovery bundle. Deployment is a gated release operation, not proof of an audit.

## 3. Architecture and data contracts

Pipeline stages are source-selected → dependencies-verified → built → tested → reviewed → signed → staged → smoke-verified → published. ReleaseEvidence binds source commit, exact lockfile/runtime/container digests, command versions, environment allowlist, test reports, SBOM/licenses, manifest digest and reviewer decisions. Protected CI uses read-only repository permissions by default; publish credentials belong only to a separate protected job. The offline signing authority receives a digest-reviewed artifact, never executes arbitrary PR code.

## 4. Algorithms and lifecycle

Start from a clean checkout and exact lockfile installation; deny lifecycle scripts unless individually reviewed. Record Node/package-manager versions and build flags instead of promising reproducibility from an unpinned environment. Build twice independently with fixed locale/timezone and no embedded timestamps; byte compare final assets. Differences block signing until explained and incorporated into recipe. Run type/build/tests, secret scan, dependency/license checks, G24 browser flows and core-only bundle inspection. Generate manifest under the common ES256-P1363 profile, sign outside the build worker, then verify it independently. Stage static files with correct relative base paths, deep-link fallback and CSP; test page reload and offline recovery docs. Pin exact artifacts through at least two independently administered pin services and verify retrieval by CID before advancing discovery pointers.

## 5. Interfaces and integration

`ReleaseEvidence` includes stage, start/end times, result and immutable report digests. `promote(manifestDigest,evidenceDigest)` requires all mandatory gates pass and two recorded roles: maintainer and security reviewer. A workflow must not interpret a CI green badge as this approval. Publish release archive, manifest/signature, SBOM, checksums, recovery instructions and known limitations together. No user ciphertext or vault backup is included.

## 6. Errors, abuse and residual threats

NONREPRODUCIBLE_BUILD, SECRET_FOUND, GATE_MISSING, SIGNER_UNAVAILABLE and RETRIEVAL_MISMATCH halt promotion; staging remains clearly testnet. Never “fix” a signed artifact in place; rebuild with a new sequence. Supply-chain substitution, compromised CI, signing-key theft and rollback mirrors remain threats. Public artifact persistence means accidental publication cannot be reliably erased.

## 7. Verification and primary references

Exercise a clean runner rebuild, altered dependency lockfile, unlisted injected script, missing CSP, broken relative route, failed pin service, unavailable signer and rollback recommendation. Test downloaded bundle independently from source tooling. Real-funds release additionally requires independent security review and all M2C gates; this design does not claim them passed.

Primary references (exact implementation revisions must be pinned in the evidence record): [Vite static deployment](https://vite.dev/guide/static-deploy); [GitHub Actions security](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions); [IPFS content addressing](https://docs.ipfs.tech/concepts/content-addressing/).
